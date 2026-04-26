import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  SectionList,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Keyboard,
  Pressable,
  Platform,
} from 'react-native';
import { Stack, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useCompanyId } from '@/lib/useCompanyId';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { supabase } from '@/lib/supabase';
import { getCategoriesWithProducts, CategoryWithProducts } from '@/services/categories';
import {
  getSessionCounts,
  upsertCount,
  completeSession,
  CountRow,
  Session,
} from '@/services/sessions';
import { buildCSV, ExportRow } from '@/services/export';

// ─── Types ───────────────────────────────────────────────────────────────────

type FilterTab = 'all' | 'uncounted' | 'counted';

interface ProductWithCount {
  id: string;
  name: string;
  unit: string;
  lastKnownQty: number | null;
  count: CountRow | null;
}

interface Section {
  title: string;
  data: ProductWithCount[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return isToday ? `Today at ${time}` : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${time}`;
}

function buildSections(
  categories: CategoryWithProducts[],
  countsMap: Map<string, CountRow>,
): Section[] {
  return categories.map((cat) => ({
    title: cat.name,
    data: cat.products.map((p) => ({
      id: p.id,
      name: p.name,
      unit: p.unit,
      lastKnownQty: p.last_known_quantity,
      count: countsMap.get(p.id) ?? null,
    })),
  })).filter((s) => s.data.length > 0);
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function CountingScreen() {
  const { locationId, sessionId, locationName } = useLocalSearchParams<{
    locationId: string;
    sessionId: string;
    locationName: string;
  }>();

  const { role } = useCompanyId();

  const [sections, setSections] = useState<Section[]>([]);
  const [countsMap, setCountsMap] = useState<Map<string, CountRow>>(new Map());
  const [sessionStatus, setSessionStatus] = useState<Session['status']>('active');
  const [sessionCreatedAt, setSessionCreatedAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // Search + filter
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterTab>('all');

  // Modal state
  const [selected, setSelected] = useState<ProductWithCount | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<TextInput>(null);

  // Load current user id once
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
    });
  }, []);

  const load = useCallback(async () => {
    if (!locationId || !sessionId) return;
    setLoading(true);
    try {
      const [categories, counts, sessionRows] = await Promise.all([
        getCategoriesWithProducts(locationId),
        getSessionCounts(sessionId),
        supabase
          .from('inventory_sessions')
          .select('status, created_at')
          .eq('id', sessionId)
          .single()
          .then(({ data }) => data),
      ]);

      const map = new Map<string, CountRow>(counts.map((c) => [c.product_id, c]));
      setCountsMap(map);
      setSections(buildSections(categories, map));
      if (sessionRows?.status) setSessionStatus(sessionRows.status as Session['status']);
      if (sessionRows?.created_at) {
        setSessionCreatedAt(sessionRows.created_at);
      }

      const total = categories.reduce((sum, c) => sum + c.products.length, 0);
      console.log('[CountingScreen] loaded — products:', total, 'counted:', counts.length, 'status:', sessionRows?.status);
    } catch (err) {
      console.error('[CountingScreen] load error:', err);
      Alert.alert('Error', 'Failed to load session data');
    } finally {
      setLoading(false);
    }
  }, [locationId, sessionId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // ── Realtime — patch individual count rows live ───────────────────────────

  useEffect(() => {
    if (!sessionId) return;

    console.log('[CountingScreen] realtime — subscribing for session:', sessionId);

    const channel = supabase
      .channel(`session-counts:${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'inventory_counts',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          if (payload.eventType !== 'INSERT' && payload.eventType !== 'UPDATE') return;

          // Cast is safe: INSERT/UPDATE always carry the full row
          const row = payload.new as unknown as CountRow;
          console.log(
            '[CountingScreen] realtime —', payload.eventType,
            'product:', row.product_id,
            'qty:', row.quantity,
            'by:', row.updated_by,
          );

          // Patch countsMap (keyed by product_id)
          setCountsMap((prev) => {
            const next = new Map(prev);
            next.set(row.product_id, row);
            return next;
          });

          // Patch only the affected product row — no full re-render
          setSections((prev) =>
            prev.map((sec) => ({
              ...sec,
              data: sec.data.map((p) =>
                p.id === row.product_id ? { ...p, count: row } : p,
              ),
            })),
          );

          // Keep the open modal in sync (updates "Current: X" metadata)
          // Does NOT touch inputValue so user's in-progress entry is safe
          setSelected((prev) =>
            prev !== null && prev.id === row.product_id
              ? { ...prev, count: row }
              : prev,
          );
        },
      )
      .subscribe((status, err) => {
        if (err) {
          console.error('[CountingScreen] realtime — error:', err.message);
        } else {
          console.log('[CountingScreen] realtime — status:', status);
        }
      });

    return () => {
      console.log('[CountingScreen] realtime — unsubscribing for session:', sessionId);
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  // ── Progress — always uses raw sections, never filtered ──────────────────

  const total = sections.reduce((sum, s) => sum + s.data.length, 0);
  const counted = sections.reduce((sum, s) => sum + s.data.filter((p) => p.count !== null).length, 0);
  const pct = total > 0 ? Math.round((counted / total) * 100) : 0;

  // ── Filtered sections for display ─────────────────────────────────────────

  const filteredSections = useMemo<Section[]>(() => {
    const q = search.trim().toLowerCase();
    return sections
      .map((sec) => {
        const catMatch = q !== '' && sec.title.toLowerCase().includes(q);
        const data = sec.data.filter((p) => {
          const nameMatch = q === '' || catMatch || p.name.toLowerCase().includes(q);
          if (!nameMatch) return false;
          if (filter === 'counted') return p.count !== null;
          if (filter === 'uncounted') return p.count === null;
          return true;
        });
        return { ...sec, data };
      })
      .filter((sec) => sec.data.length > 0);
  }, [sections, search, filter]);

  // ── Next uncounted ────────────────────────────────────────────────────────

  function handleNextUncounted() {
    for (const sec of sections) {
      const next = sec.data.find((p) => p.count === null);
      if (next) { openProduct(next); return; }
    }
    Alert.alert('All counted', 'Every product has been counted.');
  }

  // ── Modal ─────────────────────────────────────────────────────────────────

  function openProduct(product: ProductWithCount) {
    if (sessionStatus === 'completed') return;
    setSelected(product);
    setInputValue(product.count !== null ? String(product.count.quantity) : '');
    setTimeout(() => inputRef.current?.focus(), 150);
  }

  function closeModal() {
    Keyboard.dismiss();
    setSelected(null);
    setInputValue('');
  }

  async function handleSave() {
    if (!selected || !sessionId || !userId) return;
    const qty = parseFloat(inputValue);
    if (isNaN(qty) || qty < 0) {
      Alert.alert('Invalid quantity', 'Please enter a valid number.');
      return;
    }

    setSaving(true);
    try {
      await upsertCount(sessionId, selected.id, qty, userId);

      // Optimistic update — no reload needed
      const newCount: CountRow = {
        id: selected.count?.id ?? '',
        session_id: sessionId,
        product_id: selected.id,
        quantity: qty,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      };
      const newMap = new Map(countsMap);
      newMap.set(selected.id, newCount);
      setCountsMap(newMap);
      setSections((prev) =>
        prev.map((sec) => ({
          ...sec,
          data: sec.data.map((p) =>
            p.id === selected.id ? { ...p, count: newCount } : p,
          ),
        })),
      );

      closeModal();
    } catch (err) {
      console.error('[CountingScreen] save count error:', err);
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save count');
    } finally {
      setSaving(false);
    }
  }

  async function handleExport() {
    if (sections.length === 0) {
      Alert.alert('Nothing to export', 'No products found in this session.');
      return;
    }

    const rows: ExportRow[] = sections.flatMap((sec) =>
      sec.data.map((p) => ({
        category: sec.title,
        product: p.name,
        unit: p.unit,
        previousQty: p.lastKnownQty,
        currentQty: p.count?.quantity ?? null,
      })),
    );

    const createdAt = sessionCreatedAt || new Date().toISOString();
    const csv = buildCSV(rows, createdAt, locationName ?? '');
    // Filename uses YYYY-MM-DD from the ISO string — no locale, no spaces
    const dateSlug = createdAt.slice(0, 10);
    const locationSlug = (locationName ?? 'location').replace(/[^a-z0-9]/gi, '-').toLowerCase();
    const filename = `inventory-${locationSlug}-${dateSlug}.csv`;
    const file = new File(Paths.cache, filename);

    console.log('[handleExport] writing CSV, rows:', rows.length, 'file:', file.uri);
    setExporting(true);
    try {
      file.write(csv);
      console.log('[handleExport] file written');

      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert('Export unavailable', 'File sharing is not supported on this device.');
        return;
      }
      await Sharing.shareAsync(file.uri, {
        mimeType: 'text/csv',
        dialogTitle: 'Export Inventory CSV',
        UTI: 'public.comma-separated-values-text',
      });
      console.log('[handleExport] share sheet opened');
    } catch (err) {
      console.error('[handleExport] error:', err);
      Alert.alert('Export failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setExporting(false);
    }
  }

  async function handleComplete() {
    if (!sessionId) return;
    Alert.alert(
      'Complete session?',
      `${counted} of ${total} products counted (${pct}%). Mark session as complete?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Complete',
          onPress: async () => {
            try {
              await completeSession(sessionId);
              setSessionStatus('completed');
            } catch (err) {
              Alert.alert('Error', 'Failed to complete session');
            }
          },
        },
      ],
    );
  }

  // ── Render helpers ────────────────────────────────────────────────────────

  function renderProduct({ item }: { item: ProductWithCount }) {
    const isCounted = item.count !== null;
    return (
      <TouchableOpacity
        style={styles.productRow}
        onPress={() => openProduct(item)}
        activeOpacity={sessionStatus === 'completed' ? 1 : 0.6}
      >
        <Text style={[styles.productName, !isCounted && sessionStatus === 'active' && styles.productNameUncounted]}>
          {item.name}
        </Text>
        {isCounted ? (
          <View style={styles.countedRight}>
            <Text style={styles.checkmark}>✓</Text>
            <Text style={styles.countedValue}>{item.count!.quantity} {item.unit}</Text>
          </View>
        ) : sessionStatus === 'active' ? (
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>Count</Text>
          </View>
        ) : (
          <Text style={styles.emptyMark}>—</Text>
        )}
      </TouchableOpacity>
    );
  }

  function renderSectionHeader({ section }: { section: Section }) {
    return (
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{section.title.toUpperCase()}</Text>
      </View>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────

  const isCompleted = sessionStatus === 'completed';

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: locationName ?? 'Inventory',
          headerRight: isCompleted
            ? () => (
                <View style={styles.completedBadge}>
                  <Text style={styles.completedBadgeText}>Completed ✓</Text>
                </View>
              )
            : () => (
                <TouchableOpacity onPress={handleComplete} style={styles.headerBtn}>
                  <Text style={styles.headerBtnText}>Complete</Text>
                </TouchableOpacity>
              ),
        }}
      />

      {/* Progress bar */}
      <View style={styles.progressContainer}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${pct}%` }]} />
        </View>
        <Text style={styles.progressText}>
          {counted} / {total} counted · {pct}%
        </Text>
      </View>

      {/* Search + filter toolbar */}
      {!loading && sections.length > 0 && (
        <View style={styles.toolbar}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search products or categories…"
            value={search}
            onChangeText={setSearch}
            clearButtonMode="while-editing"
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
          />
          <View style={styles.filterRow}>
            {(['all', 'uncounted', 'counted'] as FilterTab[]).map((tab) => (
              <TouchableOpacity
                key={tab}
                style={[styles.filterChip, filter === tab && styles.filterChipActive]}
                onPress={() => setFilter(tab)}
              >
                <Text style={[styles.filterChipText, filter === tab && styles.filterChipTextActive]}>
                  {tab === 'all' ? 'All' : tab === 'uncounted' ? 'Uncounted' : 'Counted'}
                </Text>
              </TouchableOpacity>
            ))}
            {!isCompleted && (
              <TouchableOpacity style={styles.nextBtn} onPress={handleNextUncounted}>
                <Text style={styles.nextBtnText}>Next →</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : sections.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>No products found</Text>
          <Text style={styles.emptySubtitle}>
            Add products to this location first via the Products screen.
          </Text>
        </View>
      ) : filteredSections.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>No results</Text>
          <Text style={styles.emptySubtitle}>Try a different search or filter.</Text>
        </View>
      ) : (
        <SectionList
          sections={filteredSections}
          keyExtractor={(item) => item.id}
          renderItem={renderProduct}
          renderSectionHeader={renderSectionHeader}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={[styles.list, isCompleted && styles.listWithFooter]}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          keyboardShouldPersistTaps="handled"
        />
      )}

      {isCompleted && !loading && role === 'admin' && (
        <View style={styles.exportFooter}>
          <TouchableOpacity
            style={[styles.exportBtn, exporting && styles.exportBtnDisabled]}
            onPress={handleExport}
            disabled={exporting}
          >
            {exporting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.exportBtnText}>Export CSV</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Quantity input modal */}
      <Modal
        visible={selected !== null}
        animationType="slide"
        transparent
        onRequestClose={closeModal}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable style={styles.overlay} onPress={closeModal}>
            <Pressable style={styles.sheet} onPress={() => {}}>
              <Text style={styles.sheetProductName}>{selected?.name}</Text>

              {selected?.count !== null && selected?.count !== undefined && (
                <View style={styles.existingRow}>
                  <Text style={styles.existingValue}>
                    Current: {selected.count.quantity} {selected?.unit}
                  </Text>
                  <Text style={styles.existingMeta}>
                    {selected.count.updated_by === userId ? 'You' : 'Team member'}
                    {' · '}
                    {formatTime(selected.count.updated_at)}
                  </Text>
                </View>
              )}

              <View style={styles.inputRow}>
                <TextInput
                  ref={inputRef}
                  style={styles.quantityInput}
                  value={inputValue}
                  onChangeText={setInputValue}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor="#ccc"
                  returnKeyType="done"
                  onSubmitEditing={handleSave}
                  selectTextOnFocus
                />
                <Text style={styles.unitLabel}>{selected?.unit}</Text>
              </View>

              <TouchableOpacity
                style={[
                  styles.saveBtn,
                  (!inputValue.trim() || saving) && styles.saveBtnDisabled,
                ]}
                onPress={handleSave}
                disabled={!inputValue.trim() || saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.saveBtnText}>Save</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity style={styles.cancelBtn} onPress={closeModal}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  headerBtn: { paddingHorizontal: 4 },
  headerBtnText: { fontSize: 15, fontWeight: '600', color: '#111' },
  completedBadge: {
    backgroundColor: '#e8f5e9',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  completedBadgeText: { fontSize: 12, fontWeight: '600', color: '#2e7d32' },

  // Progress
  progressContainer: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#ececec',
  },
  progressTrack: {
    height: 6,
    backgroundColor: '#e0e0e0',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#111',
    borderRadius: 3,
  },
  progressText: { fontSize: 13, color: '#555' },

  // List
  list: { paddingBottom: 32 },
  listWithFooter: { paddingBottom: 100 },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
    backgroundColor: '#f5f5f5',
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#999',
    letterSpacing: 1,
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 18,
    minHeight: 56,
  },
  productName: { flex: 1, fontSize: 16, color: '#111' },
  countedRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  checkmark: { fontSize: 14, color: '#2e7d32', fontWeight: '700' },
  countedValue: { fontSize: 15, fontWeight: '600', color: '#2e7d32' },
  emptyMark: { fontSize: 18, color: '#ccc' },
  separator: { height: 1, backgroundColor: '#f0f0f0', marginLeft: 16 },

  // Empty
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#666', marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: '#aaa', textAlign: 'center' },

  // Modal
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  sheetProductName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111',
    marginBottom: 12,
  },
  existingRow: {
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  existingValue: { fontSize: 15, fontWeight: '600', color: '#333', marginBottom: 2 },
  existingMeta: { fontSize: 12, color: '#888' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 12,
  },
  quantityInput: {
    flex: 1,
    height: 72,
    borderWidth: 2,
    borderColor: '#111',
    borderRadius: 12,
    fontSize: 36,
    fontWeight: '700',
    textAlign: 'center',
    color: '#111',
    backgroundColor: '#fafafa',
  },
  unitLabel: {
    fontSize: 20,
    fontWeight: '600',
    color: '#555',
    minWidth: 40,
  },
  saveBtn: {
    height: 56,
    backgroundColor: '#111',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  saveBtnDisabled: { opacity: 0.35 },
  saveBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  cancelBtn: { alignItems: 'center', paddingVertical: 10 },
  cancelText: { color: '#888', fontSize: 15 },

  // Uncounted product name (active session)
  productNameUncounted: { color: '#444' },

  // Count badge (replaces — on uncounted rows in active sessions)
  countBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#fafafa',
  },
  countBadgeText: { fontSize: 13, color: '#999' },

  // Toolbar: search + filter row
  toolbar: {
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#ececec',
    gap: 8,
  },
  searchInput: {
    height: 40,
    backgroundColor: '#f0f0f0',
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#111',
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  filterChipActive: {
    backgroundColor: '#111',
    borderColor: '#111',
  },
  filterChipText: { fontSize: 13, color: '#555' },
  filterChipTextActive: { color: '#fff', fontWeight: '600' },
  nextBtn: {
    marginLeft: 'auto' as any,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
  },
  nextBtnText: { fontSize: 13, fontWeight: '600', color: '#111' },

  // Export footer
  exportFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    paddingBottom: 32,
    backgroundColor: '#f5f5f5',
    borderTopWidth: 1,
    borderTopColor: '#ececec',
  },
  exportBtn: {
    height: 52,
    backgroundColor: '#111',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exportBtnDisabled: { opacity: 0.4 },
  exportBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
