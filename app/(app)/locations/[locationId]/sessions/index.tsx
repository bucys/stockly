import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getSessions, getSessionCounts, createSession, Session } from '@/services/sessions';
import { getLocationProductCount } from '@/services/products';
import { supabase } from '@/lib/supabase';
import { theme, shadows } from '@/constants/theme';
import { relativeTime } from '@/lib/relativeTime';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function SessionsScreen() {
  const { locationId, name } = useLocalSearchParams<{ locationId: string; name: string }>();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [productCount, setProductCount] = useState<number | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [activeCounted, setActiveCounted] = useState<number>(0);
  const [activeLastUpdated, setActiveLastUpdated] = useState<string | null>(null);
  const [activeLastBy, setActiveLastBy] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
    });
  }, []);

  const load = useCallback(async () => {
    if (!locationId) return;
    setLoading(true);
    try {
      const [s, count, locRow] = await Promise.all([
        getSessions(locationId),
        getLocationProductCount(locationId),
        supabase
          .from('locations')
          .select('address')
          .eq('id', locationId)
          .single()
          .then(({ data }) => data),
      ]);
      setSessions(s);
      setProductCount(count);
      setAddress((locRow as { address: string | null } | null)?.address ?? null);

      const active = s.find((row) => row.status === 'active');
      if (active) {
        const counts = await getSessionCounts(active.id);
        setActiveCounted(counts.length);
        const latestRow = counts.reduce<{ updated_at: string; updated_by: string } | null>((acc, c) => {
          if (!c.updated_at) return acc;
          if (!acc || new Date(c.updated_at) > new Date(acc.updated_at)) {
            return { updated_at: c.updated_at, updated_by: c.updated_by };
          }
          return acc;
        }, null);
        setActiveLastUpdated(latestRow?.updated_at ?? null);
        setActiveLastBy(latestRow?.updated_by ?? null);
      } else {
        setActiveCounted(0);
        setActiveLastUpdated(null);
        setActiveLastBy(null);
      }
    } catch (err) {
      console.error('[SessionsScreen] load error:', err);
      Alert.alert('Error', 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }, [locationId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const activeSessions = sessions.filter((s) => s.status === 'active');
  const pastSessions = sessions.filter((s) => s.status === 'completed');
  const activeSession = activeSessions[0] ?? null;
  const lastCompleted = pastSessions[0] ?? null;

  async function handleStartSession() {
    if (!locationId) return;

    if (productCount === 0) {
      Alert.alert(
        'No products',
        'Add or import products before starting inventory.',
        [
          {
            text: 'Go to Products',
            onPress: () => router.push(`/locations/${locationId}?name=${encodeURIComponent(name ?? '')}`),
          },
          { text: 'Cancel', style: 'cancel' },
        ],
      );
      return;
    }

    if (activeSessions.length > 0) {
      Alert.alert(
        'Active session exists',
        'There is already an active session. Complete it before starting a new one.',
        [
          { text: 'Continue existing', onPress: () => openSession(activeSessions[0]) },
          { text: 'Cancel', style: 'cancel' },
        ],
      );
      return;
    }

    setStarting(true);
    try {
      const session = await createSession(locationId);
      openSession(session);
    } catch (err) {
      console.error('[SessionsScreen] start session error:', err);
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to start session');
    } finally {
      setStarting(false);
    }
  }

  function openSession(session: Session) {
    router.push(
      `/locations/${locationId}/sessions/${session.id}?locationName=${encodeURIComponent(name ?? '')}`,
    );
  }

  function openProducts() {
    router.push(`/locations/${locationId}?name=${encodeURIComponent(name ?? '')}`);
  }

  const total = productCount ?? 0;
  const pct = activeSession && total > 0 ? Math.min(100, Math.round((activeCounted / total) * 100)) : 0;

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: name ?? 'Location',
          headerBackTitle: 'Back',
        }}
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {/* ── Location summary ─────────────────────────────────── */}
          <View style={styles.summaryCard}>
            <Text style={styles.summaryName} numberOfLines={1}>
              {name ?? 'Location'}
            </Text>
            <Text style={styles.summaryAddress} numberOfLines={1}>
              {address?.trim() ? address : 'Address not set'}
            </Text>
            <View style={styles.metaRow}>
              <View style={styles.metaItem}>
                <Ionicons name="cube-outline" size={14} color={theme.colors.textMuted} />
                <Text style={styles.metaText}>
                  {productCount ?? 0} {productCount === 1 ? 'product' : 'products'}
                </Text>
              </View>
              <View style={styles.metaDot} />
              <View style={styles.metaItem}>
                <Ionicons name="time-outline" size={14} color={theme.colors.textMuted} />
                <Text style={styles.metaText}>
                  {lastCompleted
                    ? `Last count: ${relativeTime(new Date(lastCompleted.created_at))}`
                    : 'No completed counts yet'}
                </Text>
              </View>
            </View>
          </View>

          {/* ── Active session ───────────────────────────────────── */}
          {activeSession && (
            <View style={styles.activeCard}>
              <Text style={styles.activeLabel}>ACTIVE SESSION</Text>
              <Text style={styles.activeDate}>{formatDate(activeSession.created_at)}</Text>

              <View style={styles.progressRow}>
                <Text style={styles.progressText}>
                  {activeCounted} of {total} counted
                </Text>
                <Text style={styles.progressPct}>{pct}%</Text>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${pct}%` }]} />
              </View>

              {activeLastUpdated && (
                <Text style={styles.activeMeta}>
                  Last updated: {relativeTime(new Date(activeLastUpdated))}
                </Text>
              )}
              <Text style={styles.activeMeta}>
                Last edited by: {activeLastBy && userId && activeLastBy === userId ? 'You' : 'Team member'}
              </Text>

              <TouchableOpacity
                style={styles.continueBtn}
                onPress={() => openSession(activeSession)}
                activeOpacity={0.8}
              >
                <Text style={styles.continueBtnText}>Continue Counting  →</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Start session / no-products ──────────────────────── */}
          {productCount === 0 ? (
            <View style={styles.noProductsCard}>
              <Text style={styles.noProductsTitle}>No products yet</Text>
              <Text style={styles.noProductsSub}>
                Add products before starting an inventory session.
              </Text>
              <TouchableOpacity
                style={styles.goToProductsBtn}
                onPress={openProducts}
                activeOpacity={0.75}
              >
                <Text style={styles.goToProductsBtnText}>Manage products</Text>
              </TouchableOpacity>
            </View>
          ) : activeSession ? null : (
            <TouchableOpacity
              style={styles.startBtn}
              onPress={handleStartSession}
              disabled={starting}
              activeOpacity={0.75}
            >
              {starting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.startBtnText}>+ Start New Session</Text>
              )}
            </TouchableOpacity>
          )}

          {/* ── Manage products card ─────────────────────────────── */}
          <TouchableOpacity
            style={styles.productsCard}
            onPress={openProducts}
            activeOpacity={0.75}
          >
            <View style={styles.productsIcon}>
              <Ionicons name="cube-outline" size={18} color={theme.colors.primary} />
            </View>
            <View style={styles.productsLeft}>
              <Text style={styles.productsTitle}>Manage products</Text>
              <Text style={styles.productsSub}>
                {productCount ?? 0} {productCount === 1 ? 'product' : 'products'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.textLight} />
          </TouchableOpacity>

          {/* ── Previous sessions ────────────────────────────────── */}
          <Text style={styles.sectionHeader}>PREVIOUS SESSIONS</Text>
          {pastSessions.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>No previous sessions yet</Text>
              <Text style={styles.emptySubText}>Completed sessions will appear here.</Text>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {pastSessions.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.sessionRow}
                  onPress={() => openSession(item)}
                  activeOpacity={0.7}
                >
                  <View style={styles.sessionRowLeft}>
                    <Text style={styles.sessionDate}>{formatDate(item.created_at)}</Text>
                  </View>
                  <View style={styles.completedBadge}>
                    <Text style={styles.completedBadgeText}>Completed ✓</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: theme.spacing.lg, paddingBottom: 32, gap: 14 },

  // Summary card
  summaryCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: 18,
    ...shadows.sm,
  },
  summaryName: { fontSize: 20, fontWeight: '700', color: theme.colors.text },
  summaryAddress: { fontSize: 13, color: theme.colors.textLight, marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { fontSize: 12, color: theme.colors.textMuted },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: theme.colors.textLight,
    marginHorizontal: 8,
  },

  // Active session card
  activeCard: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.xl,
    padding: 22,
  },
  activeLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  activeDate: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.85)',
    marginBottom: 14,
    fontWeight: '500',
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  progressText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  progressPct: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '600' },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#fff',
    borderRadius: 3,
  },
  activeMeta: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 10,
  },
  continueBtn: {
    backgroundColor: '#fff',
    borderRadius: theme.radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  continueBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.primaryDark,
    letterSpacing: 0.1,
  },

  // No products card
  noProductsCard: {
    backgroundColor: theme.colors.surfaceWarm,
    borderRadius: theme.radius.lg,
    padding: 22,
    alignItems: 'center',
  },
  noProductsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 6,
  },
  noProductsSub: {
    fontSize: 14,
    color: theme.colors.textMuted,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
  },
  goToProductsBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.primary,
  },
  goToProductsBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // Start button
  startBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.lg,
    paddingVertical: 18,
    alignItems: 'center',
    ...shadows.sm,
  },
  startBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.2,
  },

  // Manage products card
  productsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    ...shadows.sm,
  },
  productsIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.surfaceWarm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  productsLeft: { flex: 1 },
  productsTitle: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
  productsSub: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },

  // Section
  sectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.textLight,
    letterSpacing: 1.2,
    marginTop: 4,
    marginBottom: 4,
  },

  // Past session rows
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  sessionRowLeft: { flex: 1 },
  sessionDate: { fontSize: 13, color: theme.colors.textLight, fontWeight: '500' },
  completedBadge: {
    backgroundColor: theme.colors.successBg,
    borderRadius: theme.radius.xs,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  completedBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.success,
  },

  // Empty state
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 18,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
  },
  emptyText: { color: theme.colors.textLight, fontSize: 14, fontWeight: '500', marginBottom: 4 },
  emptySubText: { color: theme.colors.textPlaceholder, fontSize: 12 },
});
