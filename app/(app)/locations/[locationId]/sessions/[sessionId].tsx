import { useState, useCallback, useEffect, useMemo } from 'react';
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
import { Stack, useLocalSearchParams, useFocusEffect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCompanyId } from '@/lib/useCompanyId';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { supabase } from '@/lib/supabase';
import { getCategoriesWithProducts, CategoryWithProducts } from '@/services/categories';
import {
  getSessionCounts,
  upsertCount,
  completeSession,
  cancelSession,
  CountRow,
  Session,
} from '@/services/sessions';
import { buildCSV, ExportRow } from '@/services/export';
import { listCompanyMemberProfiles, type UserProfile } from '@/services/profiles';
import { Button } from '@/components/ui/Button';
import { ModalSheet } from '@/components/ui/ModalSheet';
import { theme, shadows } from '@/constants/theme';
import { useLocationAccessGuard } from '@/lib/useLocationAccess';

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
  id: string;
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

function isValidQty(v: string): boolean {
  if (!v.trim()) return false;
  const n = Number(v);
  if (!isFinite(n) || n < 0) return false;
  if (v.endsWith('.')) return false;
  return true;
}

function buildSections(
  categories: CategoryWithProducts[],
  countsMap: Map<string, CountRow>,
): Section[] {
  return categories.map((cat) => ({
    id: cat.id,
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
  useLocationAccessGuard(locationId);

  const { companyId, role } = useCompanyId();
  const insets = useSafeAreaInsets();

  const [sections, setSections] = useState<Section[]>([]);
  const [countsMap, setCountsMap] = useState<Map<string, CountRow>>(new Map());
  const [sessionStatus, setSessionStatus] = useState<Session['status']>('active');
  const [sessionCreatedAt, setSessionCreatedAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [profilesByUserId, setProfilesByUserId] = useState<Map<string, UserProfile>>(
    new Map(),
  );

  // Search + filter
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterTab>('all');
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  // Modal state
  const [selected, setSelected] = useState<ProductWithCount | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [saving, setSaving] = useState(false);

  // Load current user id once
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
    });
  }, []);

  // Profiles for export attribution (best-effort)
  useEffect(() => {
    if (!companyId) return;
    listCompanyMemberProfiles(companyId)
      .then((list) => {
        const map = new Map<string, UserProfile>();
        for (const p of list) map.set(p.user_id, p);
        setProfilesByUserId(map);
      })
      .catch(() => {
        // non-critical
      });
  }, [companyId]);

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
      const built = buildSections(categories, map);
      setSections(built);
      // Default: collapse every category so the user can drill in deliberately.
      // Preserve any categories the user has explicitly expanded across reloads.
      setCollapsedIds((prev) => {
        if (prev.size > 0) return prev;
        return new Set(built.map((s) => s.id));
      });
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

  // Hide products inside collapsed categories without removing the section
  // header — except when a search is active, in which case the user expects
  // matches to be visible without manually expanding each category.
  const displaySections = useMemo<Section[]>(() => {
    const searchActive = search.trim() !== '';
    if (searchActive) return filteredSections;
    return filteredSections.map((sec) =>
      collapsedIds.has(sec.id) ? { ...sec, data: [] as ProductWithCount[] } : sec,
    );
  }, [filteredSections, collapsedIds, search]);

  function toggleCategory(id: string) {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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
  }

  function handleNumpadKey(key: string) {
    setInputValue((prev) => {
      if (key === 'back') return prev.slice(0, -1);
      if (key === '.') {
        if (prev.includes('.')) return prev;
        return prev === '' ? '0.' : `${prev}.`;
      }
      // digit
      if (prev.length >= 8) return prev;
      if (prev === '0') return key;
      return `${prev}${key}`;
    });
  }

  function closeModal() {
    setSelected(null);
    setInputValue('');
  }

  function findNextProduct(
    currentId: string,
    updatedSections: Section[],
  ): ProductWithCount | null {
    const flat = updatedSections.flatMap((s) => s.data);
    const idx = flat.findIndex((p) => p.id === currentId);
    if (idx === -1) return null;
    // Prefer next uncounted after the current position.
    for (let i = idx + 1; i < flat.length; i++) {
      if (flat[i].count === null) return flat[i];
    }
    // Wrap: scan from the beginning up to (but excluding) the current index.
    for (let i = 0; i < idx; i++) {
      if (flat[i].count === null) return flat[i];
    }
    // No uncounted product remains → end of session.
    return null;
  }

  async function handleSave(advance: boolean = false) {
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
      const updatedSections = sections.map((sec) => ({
        ...sec,
        data: sec.data.map((p) =>
          p.id === selected.id ? { ...p, count: newCount } : p,
        ),
      }));
      setSections(updatedSections);

      if (advance) {
        const next = findNextProduct(selected.id, updatedSections);
        if (next) {
          setSelected(next);
          setInputValue(next.count !== null ? String(next.count.quantity) : '');
        } else {
          closeModal();
          Alert.alert('Reached end of session', 'No more products to count.');
        }
      } else {
        closeModal();
      }
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

    const resolveCountedBy = (uid: string | null | undefined): string | null => {
      if (!uid) return null;
      const p = profilesByUserId.get(uid);
      const name = p?.display_name?.trim();
      const email = p?.email?.trim();
      return name || email || 'Team member';
    };

    const rows: ExportRow[] = sections.flatMap((sec) =>
      sec.data.map((p) => ({
        category: sec.title,
        product: p.name,
        unit: p.unit,
        previousQty: p.lastKnownQty,
        currentQty: p.count?.quantity ?? null,
        countedBy: p.count ? resolveCountedBy(p.count.updated_by) : null,
        countedAt: p.count?.updated_at ?? null,
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

  async function handleCancel() {
    if (!sessionId) return;
    const hasCounts = counted > 0;
    const message = hasCounts
      ? `${counted} count${counted === 1 ? '' : 's'} have already been entered. Only an admin can delete a session with counts.`
      : 'This will delete the session. Continue?';
    Alert.alert(
      hasCounts && role !== 'admin' ? 'Cannot cancel' : 'Cancel session?',
      message,
      hasCounts && role !== 'admin'
        ? [{ text: 'OK', style: 'cancel' }]
        : [
            { text: 'Keep session', style: 'cancel' },
            {
              text: 'Cancel session',
              style: 'destructive',
              onPress: async () => {
                try {
                  await cancelSession(sessionId);
                  if (router.canGoBack()) router.back();
                  else router.replace('/(app)/(tabs)');
                } catch (err) {
                  Alert.alert(
                    'Error',
                    err instanceof Error ? err.message : 'Failed to cancel session',
                  );
                }
              },
            },
          ],
    );
  }

  async function handleComplete() {
    if (!sessionId) return;

    const performComplete = async () => {
      try {
        await completeSession(sessionId);
        setSessionStatus('completed');
      } catch {
        Alert.alert('Error', 'Failed to complete session');
      }
    };

    if (counted === 0) {
      Alert.alert(
        'No products counted',
        'You have not counted any products. This session will not be completed.',
        [
          { text: 'Go back', style: 'cancel' },
          {
            text: 'Cancel session',
            style: 'destructive',
            onPress: async () => {
              try {
                await cancelSession(sessionId);
                if (router.canGoBack()) router.back();
                else router.replace('/(app)/(tabs)');
              } catch (err) {
                Alert.alert(
                  'Error',
                  err instanceof Error ? err.message : 'Failed to cancel session',
                );
              }
            },
          },
        ],
      );
      return;
    }

    const uncounted = total - counted;
    if (uncounted > 0) {
      Alert.alert(
        'Some products were not counted',
        `${uncounted} product${uncounted === 1 ? '' : 's'} ${
          uncounted === 1 ? 'was' : 'were'
        } not counted. Uncounted products will remain unchanged.`,
        [
          { text: 'Go back', style: 'cancel' },
          { text: 'Complete anyway', style: 'destructive', onPress: performComplete },
        ],
      );
      return;
    }

    Alert.alert(
      'Complete session?',
      `${counted} of ${total} products counted (${pct}%). Mark session as complete?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Complete', onPress: performComplete },
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
        {isCounted ? (
          <View style={styles.statusIconCounted}>
            <Ionicons name="checkmark" size={14} color="#fff" />
          </View>
        ) : (
          <View style={styles.statusIconUncounted} />
        )}
        <Text style={styles.productName} numberOfLines={1}>
          {item.name}
        </Text>
        {isCounted ? (
          <Text style={styles.countedValue}>
            {item.count!.quantity} {item.unit}
          </Text>
        ) : sessionStatus === 'active' ? (
          <Text style={styles.tapToCount}>Tap to count</Text>
        ) : (
          <Text style={styles.emptyMark}>—</Text>
        )}
      </TouchableOpacity>
    );
  }

  function renderSectionHeader({ section }: { section: Section }) {
    const collapsed = collapsedIds.has(section.id);
    const sectionTotal = sections.find((s) => s.id === section.id)?.data.length ?? 0;
    const sectionCounted =
      sections.find((s) => s.id === section.id)?.data.filter((p) => p.count !== null).length ?? 0;
    return (
      <TouchableOpacity
        style={styles.sectionHeader}
        onPress={() => toggleCategory(section.id)}
        activeOpacity={0.6}
      >
        <Text style={styles.sectionTitle}>{section.title.toUpperCase()}</Text>
        <Text style={styles.sectionMeta}>
          {sectionCounted}/{sectionTotal} counted
        </Text>
        <Ionicons
          name={collapsed ? 'chevron-forward' : 'chevron-down'}
          size={14}
          color={theme.colors.textLight}
          style={styles.sectionChevron}
        />
      </TouchableOpacity>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────

  const isCompleted = sessionStatus === 'completed';
  const progressColor = pct === 100 ? theme.colors.success : '#2563EB';
  const progressTrackColor = pct === 100 ? '#E6F4EA' : '#EEF4FF';
  const sessionDateLabel = sessionCreatedAt ? formatTime(sessionCreatedAt) : null;

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: locationName ?? 'Inventory',
          headerBackTitle: 'Back',
        }}
      />

      {/* Header progress */}
      <View style={styles.progressContainer}>
        {sessionDateLabel ? (
          <Text style={styles.progressSubtitle}>{sessionDateLabel}</Text>
        ) : null}
        <View style={styles.progressMetaRow}>
          <Text style={styles.progressMetaText}>
            {counted} of {total} counted
          </Text>
          <Text style={[styles.progressPct, { color: progressColor }]}>{pct}%</Text>
        </View>
        <View style={[styles.progressTrack, { backgroundColor: progressTrackColor }]}>
          <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: progressColor }]} />
        </View>
      </View>

      {/* Search + filter toolbar */}
      {!loading && sections.length > 0 && (
        <View style={styles.toolbar}>
          <View style={styles.searchWrap}>
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
            {search.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearch('')}
                style={styles.searchClear}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close-circle" size={16} color={theme.colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>
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
          sections={displaySections}
          keyExtractor={(item) => item.id}
          renderItem={renderProduct}
          renderSectionHeader={renderSectionHeader}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={[
            styles.list,
            {
              paddingBottom:
                (isCompleted ? 96 : 150) + Math.max(insets.bottom, 12),
            },
          ]}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        />
      )}

      {!isCompleted && !loading && sections.length > 0 && (
        <View style={[styles.bottomFooter, { paddingBottom: Math.max(insets.bottom, 12) + 12 }]}>
          <Text style={styles.progressHint}>
            {counted} / {total} counted
          </Text>
          <TouchableOpacity
            style={styles.finishBtn}
            onPress={handleComplete}
            activeOpacity={0.85}
          >
            <Text style={styles.finishBtnText}>Finish session</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={handleCancel}
            activeOpacity={0.7}
          >
            <Text style={styles.cancelBtnText}>Cancel session</Text>
          </TouchableOpacity>
        </View>
      )}

      {isCompleted && !loading && role === 'admin' && (
        <View style={[styles.exportFooter, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}>
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
        avoidKeyboard={false}
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

        <View style={styles.numpadDisplay}>
          <Text
            style={[
              styles.numpadValue,
              inputValue === '' && styles.numpadValuePlaceholder,
            ]}
            numberOfLines={1}
          >
            {inputValue === '' ? '0' : inputValue}
          </Text>
          <Text style={styles.numpadUnit}>{selected?.unit}</Text>
        </View>

        <Numpad onKey={handleNumpadKey} disabled={saving} />

        <View style={styles.saveRow}>
          <TouchableOpacity
            style={[
              styles.saveSecondaryBtn,
              (!isValidQty(inputValue) || saving) && styles.numpadSaveBtnDisabled,
            ]}
            onPress={() => handleSave(false)}
            disabled={!isValidQty(inputValue) || saving}
            activeOpacity={0.85}
          >
            <Text style={styles.saveSecondaryText}>Save</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.numpadSaveBtn,
              styles.savePrimaryBtn,
              (!isValidQty(inputValue) || saving) && styles.numpadSaveBtnDisabled,
            ]}
            onPress={() => handleSave(true)}
            disabled={!isValidQty(inputValue) || saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.numpadSaveBtnText}>
                {isValidQty(inputValue)
                  ? `Save & Next — ${inputValue} ${selected?.unit ?? ''}`.trim()
                  : 'Save & Next'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
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
    paddingTop: 12,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  progressSubtitle: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginBottom: 8,
  },
  progressMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressMetaText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  progressPct: {
    fontSize: 14,
    fontWeight: '700',
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressText: { fontSize: 13, color: theme.colors.textMuted, fontWeight: '500' },

  // List
  list: { paddingBottom: 32 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 22,
    paddingBottom: 8,
    backgroundColor: theme.colors.background,
  },
  sectionTitle: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.textSecondary,
    letterSpacing: 1.2,
  },
  sectionMeta: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.textMuted,
    marginRight: 8,
  },
  sectionChevron: { marginLeft: 0 },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 18,
    paddingVertical: 14,
    minHeight: 52,
    gap: 12,
  },
  statusIconCounted: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: theme.colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusIconUncounted: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    backgroundColor: 'transparent',
  },
  productName: { flex: 1, fontSize: 15, color: theme.colors.text, fontWeight: '500' },
  productNameUncounted: { color: theme.colors.textSecondary },
  countedRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  checkmark: { fontSize: 14, color: theme.colors.success, fontWeight: '700' },
  countedValue: { fontSize: 14, fontWeight: '600', color: theme.colors.success },
  tapToCount: { fontSize: 13, color: theme.colors.textLight, fontWeight: '500' },
  emptyMark: { fontSize: 18, color: '#CCC' },
  separator: { height: 1, backgroundColor: theme.colors.borderLight, marginLeft: 50 },
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
  searchWrap: { position: 'relative', justifyContent: 'center' },
  searchInput: {
    height: 42,
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.sm,
    paddingLeft: 14,
    paddingRight: 36,
    fontSize: 15,
    color: theme.colors.text,
  },
  searchClear: {
    position: 'absolute',
    right: 10,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
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

  // Bottom finish button
  bottomFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    paddingBottom: 28,
    backgroundColor: theme.colors.background,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
  },
  progressHint: {
    fontSize: 12,
    color: theme.colors.textMuted,
    textAlign: 'center',
    marginBottom: 8,
  },
  finishBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.lg,
    paddingVertical: 16,
    alignItems: 'center',
    ...shadows.sm,
  },
  finishBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  cancelBtn: {
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 6,
  },
  cancelBtnText: {
    color: theme.colors.danger,
    fontSize: 13,
    fontWeight: '600',
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

  // Numpad
  numpadDisplay: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 18,
    marginBottom: 12,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.background,
  },
  numpadValue: {
    fontSize: 44,
    fontWeight: '700',
    color: theme.colors.text,
    minWidth: 60,
    textAlign: 'center',
  },
  numpadValuePlaceholder: {
    color: theme.colors.textPlaceholder,
  },
  numpadUnit: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.textMuted,
  },
  numpadGrid: {
    gap: 8,
    marginBottom: 14,
  },
  numpadRow: {
    flexDirection: 'row',
    gap: 8,
  },
  numpadKey: {
    flex: 1,
    height: 56,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numpadKeyPressed: {
    backgroundColor: theme.colors.borderLight,
  },
  numpadKeyText: {
    fontSize: 24,
    fontWeight: '600',
    color: theme.colors.text,
  },
  numpadKeyTextSecondary: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.textMuted,
    letterSpacing: 0.5,
  },
  numpadSaveBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.lg,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  saveRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  saveSecondaryBtn: {
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveSecondaryText: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.text,
  },
  savePrimaryBtn: { flex: 1, marginTop: 0 },
  numpadSaveBtnDisabled: {
    backgroundColor: '#C4BAB2',
  },
  numpadSaveBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});

// ─── Numpad ───────────────────────────────────────────────────────────────────

interface NumpadProps {
  onKey: (key: string) => void;
  disabled?: boolean;
}

const NUMPAD_ROWS: Array<Array<{ key: string; label: string; secondary?: boolean }>> = [
  [
    { key: '1', label: '1' },
    { key: '2', label: '2' },
    { key: '3', label: '3' },
  ],
  [
    { key: '4', label: '4' },
    { key: '5', label: '5' },
    { key: '6', label: '6' },
  ],
  [
    { key: '7', label: '7' },
    { key: '8', label: '8' },
    { key: '9', label: '9' },
  ],
  [
    { key: '.', label: '.' },
    { key: '0', label: '0' },
    { key: 'back', label: '⌫', secondary: true },
  ],
];

function Numpad({ onKey, disabled }: NumpadProps) {
  return (
    <View style={styles.numpadGrid}>
      {NUMPAD_ROWS.map((row, ri) => (
        <View key={ri} style={styles.numpadRow}>
          {row.map((cell) => (
            <TouchableOpacity
              key={cell.key}
              style={styles.numpadKey}
              onPress={() => onKey(cell.key)}
              disabled={disabled}
              activeOpacity={0.6}
            >
              <Text
                style={cell.secondary ? styles.numpadKeyTextSecondary : styles.numpadKeyText}
              >
                {cell.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ))}
    </View>
  );
}
