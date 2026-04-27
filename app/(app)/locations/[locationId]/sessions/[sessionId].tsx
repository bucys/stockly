import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  SectionList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  ActivityIndicator,
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
import { Button } from '@/components/ui/Button';
import { ModalSheet } from '@/components/ui/ModalSheet';
import { theme, shadows } from '@/constants/theme';

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

          setCountsMap((prev) => {
            const next = new Map(prev);
            next.set(row.product_id, row);
            return next;
          });

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
        activeOpacity={sessionStatus === 'completed' ? 1 : 0.65}
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
  const progressColor = pct === 100 ? theme.colors.success : theme.colors.primary;

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
          <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: progressColor }]} />
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
            placeholderTextColor={theme.colors.textPlaceholder}
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
          <ActivityIndicator color={theme.colors.primary} />
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
          <Button
            title="Export CSV"
            onPress={handleExport}
            loading={exporting}
            style={{ marginBottom: 0 }}
          />
        </View>
      )}

      {/* Quantity input modal */}
      <ModalSheet
        visible={selected !== null}
        onClose={closeModal}
      >
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
            placeholderTextColor="#CCC"
            returnKeyType="done"
            onSubmitEditing={handleSave}
            selectTextOnFocus
          />
          <Text style={styles.unitLabel}>{selected?.unit}</Text>
        </View>

        <Button
          title="Save"
          onPress={handleSave}
          loading={saving}
          disabled={!inputValue.trim()}
          style={{ height: 58, borderRadius: theme.radius.lg }}
        />
        <Button title="Cancel" onPress={closeModal} variant="ghost" />
      </ModalSheet>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  headerBtn: { paddingHorizontal: 4 },
  headerBtnText: { fontSize: 14, fontWeight: '500', color: theme.colors.text },
  completedBadge: {
    backgroundColor: theme.colors.successBg,
    borderRadius: theme.radius.xs,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  completedBadgeText: { fontSize: 12, fontWeight: '700', color: theme.colors.success },

  // Progress
  progressContainer: {
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  progressTrack: {
    height: 8,
    backgroundColor: theme.colors.borderLight,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressText: { fontSize: 13, color: theme.colors.textMuted, fontWeight: '500' },

  // List
  list: { paddingBottom: 32 },
  listWithFooter: { paddingBottom: 108 },
  sectionHeader: {
    paddingHorizontal: 18,
    paddingTop: 22,
    paddingBottom: 8,
    backgroundColor: theme.colors.background,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.textLight,
    letterSpacing: 1.2,
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 18,
    paddingVertical: 20,
    minHeight: 60,
  },
  productName: { flex: 1, fontSize: 16, color: theme.colors.text },
  productNameUncounted: { color: theme.colors.textSecondary },
  countedRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  checkmark: { fontSize: 14, color: theme.colors.success, fontWeight: '700' },
  countedValue: { fontSize: 15, fontWeight: '600', color: theme.colors.success },
  emptyMark: { fontSize: 18, color: '#CCC' },
  separator: { height: 1, backgroundColor: theme.colors.borderLight, marginLeft: 18 },
  countBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  countBadgeText: { fontSize: 12, color: theme.colors.textLight, fontWeight: '600' },

  // Empty
  emptyTitle: { fontSize: 16, fontWeight: '600', color: theme.colors.textMuted, marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: theme.colors.textLight, textAlign: 'center' },

  // Toolbar
  toolbar: {
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
    gap: 10,
  },
  searchInput: {
    height: 42,
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 14,
    fontSize: 15,
    color: theme.colors.text,
  },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: theme.radius.pill,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  filterChipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  filterChipText: { fontSize: 13, color: theme.colors.textMuted, fontWeight: '500' },
  filterChipTextActive: { color: '#fff', fontWeight: '700' },
  nextBtn: {
    marginLeft: 'auto' as any,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.background,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
  },
  nextBtnText: { fontSize: 13, fontWeight: '700', color: theme.colors.text },

  // Counting modal
  sheetProductName: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 14,
  },
  existingRow: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.md,
    padding: 14,
    marginBottom: 18,
  },
  existingValue: { fontSize: 15, fontWeight: '600', color: theme.colors.textSecondary, marginBottom: 2 },
  existingMeta: { fontSize: 12, color: theme.colors.textLight },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 22,
    gap: 12,
  },
  quantityInput: {
    flex: 1,
    height: 76,
    borderWidth: 2,
    borderColor: theme.colors.primary,
    borderRadius: theme.radius.lg,
    fontSize: 40,
    fontWeight: '700',
    textAlign: 'center',
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
  },
  unitLabel: {
    fontSize: 20,
    fontWeight: '600',
    color: theme.colors.textMuted,
    minWidth: 44,
  },

  // Export footer
  exportFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 18,
    paddingBottom: 36,
    backgroundColor: theme.colors.background,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
    ...shadows.sm,
  },
});
