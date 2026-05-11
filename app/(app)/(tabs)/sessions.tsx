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
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCompanyId } from '@/lib/useCompanyId';
import { getLocations, Location } from '@/services/locations';
import {
  getSessions,
  getSessionCounts,
  getLatestSessionCount,
  createSession,
  Session,
} from '@/services/sessions';
import { listCompanyMemberProfiles, type UserProfile } from '@/services/profiles';
import { supabase } from '@/lib/supabase';
import { theme, shadows } from '@/constants/theme';
import { relativeTime } from '@/lib/relativeTime';
import { useAssignedLocationIds } from '@/lib/useLocationAccess';
import { displayUser } from '@/lib/userDisplay';

interface ActiveSessionInfo {
  session: Session;
  location: Location;
  counted: number;
  total: number;
  lastBy: string | null;
}

interface HistoryItem {
  session: Session;
  location: Location;
  lastBy: string | null;
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (sameDay) return `Today, ${time}`;
  const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${date}, ${time}`;
}

function formatHistoryDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function SessionsTab() {
  const { companyId, role, loading: companyLoading } = useCompanyId();
  const { ids: assignedIds, loading: assignedLoading } = useAssignedLocationIds();
  const [locations, setLocations] = useState<Location[]>([]);
  const [activeInfos, setActiveInfos] = useState<ActiveSessionInfo[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [profilesByUserId, setProfilesByUserId] = useState<Map<string, UserProfile>>(
    new Map(),
  );
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, []);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const allLocs = await getLocations(companyId);
      const locs =
        assignedIds == null
          ? allLocs
          : allLocs.filter((l) => assignedIds.has(l.id));
      setLocations(locs);

      const profiles = await listCompanyMemberProfiles(companyId).catch(() => []);
      const profMap = new Map<string, UserProfile>();
      for (const p of profiles) profMap.set(p.user_id, p);
      setProfilesByUserId(profMap);

      const allSessions = await Promise.all(
        locs.map((l) => getSessions(l.id).catch(() => [] as Session[])),
      );

      const actives: Array<{ session: Session; location: Location }> = [];
      // Latest completed session per location only (history clutter reduction).
      const completedByLoc = new Map<string, { session: Session; location: Location }>();
      for (let i = 0; i < locs.length; i++) {
        const loc = locs[i];
        for (const s of allSessions[i]) {
          if (s.status === 'active') {
            actives.push({ session: s, location: loc });
          } else if (s.status === 'completed') {
            const existing = completedByLoc.get(loc.id);
            if (
              !existing ||
              new Date(s.created_at).getTime() >
                new Date(existing.session.created_at).getTime()
            ) {
              completedByLoc.set(loc.id, { session: s, location: loc });
            }
          }
        }
      }

      const activeWithCounts: ActiveSessionInfo[] = await Promise.all(
        actives.map(async ({ session, location }) => {
          const counts = await getSessionCounts(session.id).catch(() => []);
          const latest = counts.reduce<typeof counts[number] | null>((acc, c) => {
            if (!c.updated_at) return acc;
            if (!acc || new Date(c.updated_at) > new Date(acc.updated_at)) return c;
            return acc;
          }, null);
          return {
            session,
            location,
            counted: counts.length,
            total: location.productCount,
            lastBy: latest?.updated_by ?? null,
          };
        }),
      );

      const completedList = Array.from(completedByLoc.values()).sort(
        (a, b) =>
          new Date(b.session.created_at).getTime() - new Date(a.session.created_at).getTime(),
      );
      const completedWithBy: HistoryItem[] = await Promise.all(
        completedList.map(async ({ session, location }) => {
          const latest = await getLatestSessionCount(session.id).catch(() => null);
          return { session, location, lastBy: latest?.updated_by ?? null };
        }),
      );

      setActiveInfos(activeWithCounts);
      setHistory(completedWithBy);
      setLastUpdatedAt(
        completedWithBy[0] ? new Date(completedWithBy[0].session.created_at) : null,
      );
    } catch (err) {
      console.error('[SessionsTab] load error:', err);
      Alert.alert('Error', 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }, [companyId, assignedIds]);

  useFocusEffect(
    useCallback(() => {
      if (companyId && !assignedLoading) load();
    }, [companyId, assignedLoading, load]),
  );

  function openSession(locationId: string, locationName: string, sessionId: string) {
    router.push(
      `/locations/${locationId}/sessions/${sessionId}?locationName=${encodeURIComponent(locationName)}`,
    );
  }

  async function handleStartFor(loc: Location) {
    if (loc.productCount === 0) {
      Alert.alert(
        'No products',
        `Add or import products in ${loc.name} before starting inventory.`,
      );
      return;
    }
    if (activeInfos.some((a) => a.location.id === loc.id)) {
      Alert.alert('Active session exists', 'Continue the active session for this location.');
      return;
    }
    setStartingId(loc.id);
    try {
      const session = await createSession(loc.id);
      openSession(loc.id, loc.name, session.id);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to start session');
    } finally {
      setStartingId(null);
    }
  }

  if (companyLoading || assignedLoading || loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  const employeeUnassigned =
    role === 'employee' && assignedIds != null && assignedIds.size === 0;
  if (employeeUnassigned) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyWrap}>
          <View style={styles.emptyIcon}>
            <Ionicons name="lock-closed-outline" size={32} color={theme.colors.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>No locations assigned</Text>
          <Text style={styles.emptySub}>
            Your account has not been added to any locations. Ask an admin for permission.
          </Text>
          <TouchableOpacity
            style={styles.emptyBtn}
            onPress={() => Alert.alert('Access requests', 'Access requests coming soon.')}
            activeOpacity={0.85}
          >
            <Text style={styles.emptyBtnText}>Request access</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const completedCount = history.length;
  const startables = locations.filter(
    (l) => !activeInfos.some((a) => a.location.id === l.id),
  );

  const isEmpty =
    activeInfos.length === 0 && history.length === 0 && locations.length === 0;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Sessions</Text>
          <Text style={styles.headerSub}>
            {completedCount} completed
            {lastUpdatedAt ? ` · last updated ${relativeTime(lastUpdatedAt)}` : ''}
          </Text>
        </View>

        {isEmpty ? (
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIcon}>
              <Ionicons name="time-outline" size={32} color={theme.colors.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>No sessions yet</Text>
            <Text style={styles.emptySub}>
              Add a location and products, then start your first inventory count.
            </Text>
            <TouchableOpacity
              style={styles.emptyBtn}
              onPress={() => router.push('/(app)/(tabs)')}
              activeOpacity={0.85}
            >
              <Text style={styles.emptyBtnText}>Go to Locations</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {activeInfos.map((info) => (
              <ActiveSessionCard
                key={info.session.id}
                info={info}
                lastByLabel={displayUser(info.lastBy, profilesByUserId, currentUserId)}
                onContinue={() =>
                  openSession(info.location.id, info.location.name, info.session.id)
                }
              />
            ))}

            {startables.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>START NEW SESSION</Text>
                <View style={styles.groupCard}>
                  {startables.map((loc, idx) => (
                    <TouchableOpacity
                      key={loc.id}
                      style={[
                        styles.groupRow,
                        idx < startables.length - 1 && styles.groupRowBorder,
                      ]}
                      onPress={() => handleStartFor(loc)}
                      disabled={startingId === loc.id}
                      activeOpacity={0.7}
                    >
                      <View style={styles.groupRowLeft}>
                        <Text style={styles.groupRowName} numberOfLines={1}>
                          {loc.name}
                        </Text>
                        <Text style={styles.groupRowMeta} numberOfLines={1}>
                          {loc.productCount} products ·{' '}
                          {loc.lastCompletedSessionAt
                            ? `Last count ${relativeTime(loc.lastCompletedSessionAt)}`
                            : 'No previous count'}
                        </Text>
                      </View>
                      {startingId === loc.id ? (
                        <ActivityIndicator color={theme.colors.textMuted} />
                      ) : (
                        <Ionicons
                          name="chevron-forward"
                          size={18}
                          color={theme.colors.textLight}
                        />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {history.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>LATEST COMPLETED</Text>
                <View style={styles.groupCardSecondary}>
                  {history.map((h, idx) => (
                    <TouchableOpacity
                      key={h.session.id}
                      style={[
                        styles.groupRow,
                        idx < history.length - 1 && styles.groupRowBorder,
                      ]}
                      onPress={() =>
                        openSession(h.location.id, h.location.name, h.session.id)
                      }
                      activeOpacity={0.7}
                    >
                      <View style={styles.groupRowLeft}>
                        <Text style={styles.historyRowName} numberOfLines={1}>
                          {h.location.name}
                        </Text>
                        <Text style={styles.historyRowMeta} numberOfLines={1}>
                          {formatHistoryDate(h.session.created_at)} · Last counted by:{' '}
                          {displayUser(h.lastBy, profilesByUserId, currentUserId)}
                        </Text>
                      </View>
                      <View style={styles.completeBadge}>
                        <Text style={styles.completeBadgeText}>COMPLETE</Text>
                      </View>
                      <Ionicons
                        name="chevron-forward"
                        size={16}
                        color={theme.colors.textLight}
                        style={styles.historyChevron}
                      />
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity
                  onPress={() => router.push('/sessions/history')}
                  style={styles.viewAllBtn}
                  activeOpacity={0.7}
                >
                  <Text style={styles.viewAllText}>View all history</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function ActiveSessionCard({
  info,
  lastByLabel,
  onContinue,
}: {
  info: ActiveSessionInfo;
  lastByLabel: string;
  onContinue: () => void;
}) {
  const total = info.total > 0 ? info.total : 0;
  const counted = Math.min(info.counted, total || info.counted);
  const pct = total > 0 ? Math.round((counted / total) * 100) : 0;

  return (
    <View style={styles.activeCard}>
      <View style={styles.activeTopRow}>
        <Text style={styles.activeLabel}>ACTIVE SESSION</Text>
        <Text style={styles.activeTime}>{formatDateTime(info.session.created_at)}</Text>
      </View>
      <Text style={styles.activeName} numberOfLines={1}>
        {info.location.name}
      </Text>
      <View style={styles.activeProgressRow}>
        <Text style={styles.activeProgressText}>
          {counted} of {total || '–'} counted
        </Text>
        <Text style={styles.activePct}>{pct}%</Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${pct}%` }]} />
      </View>
      <Text style={styles.activeByText}>Last edited by: {lastByLabel}</Text>
      <TouchableOpacity style={styles.continueBtn} onPress={onContinue} activeOpacity={0.85}>
        <Text style={styles.continueBtnText}>Continue counting  →</Text>
      </TouchableOpacity>
    </View>
  );
}

const ACCENT = '#2563EB';
const ACCENT_BG = '#EEF4FF';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
    paddingBottom: 32,
  },

  header: { marginBottom: 18 },
  headerTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: theme.colors.text,
  },
  headerSub: {
    fontSize: 13,
    color: theme.colors.textMuted,
    marginTop: 4,
  },

  // Active card
  activeCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderTopWidth: 3,
    borderTopColor: ACCENT,
    padding: 18,
    marginBottom: 22,
    ...shadows.sm,
  },
  activeTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  activeLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: ACCENT,
    letterSpacing: 1.1,
  },
  activeTime: {
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  activeName: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 12,
  },
  activeProgressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  activeProgressText: {
    fontSize: 13,
    color: theme.colors.textMuted,
  },
  activePct: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.text,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: ACCENT_BG,
    overflow: 'hidden',
    marginBottom: 16,
  },
  progressFill: {
    height: '100%',
    backgroundColor: ACCENT,
    borderRadius: 4,
  },
  continueBtn: {
    backgroundColor: ACCENT,
    borderRadius: theme.radius.md,
    paddingVertical: 13,
    alignItems: 'center',
  },
  continueBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },

  // Sections
  section: { marginBottom: 22 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.textMuted,
    letterSpacing: 1.2,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  groupCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    ...shadows.sm,
    overflow: 'hidden',
  },
  groupCardSecondary: {
    backgroundColor: theme.colors.surfaceWarm,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  historyRowName: { fontSize: 14, fontWeight: '500', color: theme.colors.text },
  historyRowMeta: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
  viewAllBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 4,
    paddingVertical: 8,
    marginTop: 4,
  },
  viewAllText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.primary,
  },
  activeByText: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: 2,
    marginBottom: 8,
  },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  groupRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  groupRowLeft: { flex: 1, paddingRight: 12 },
  groupRowName: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.text,
  },
  groupRowMeta: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  completeBadge: {
    backgroundColor: theme.colors.successBg,
    borderRadius: theme.radius.xs,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 6,
  },
  completeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.success,
    letterSpacing: 0.8,
  },
  historyChevron: { marginLeft: 0 },

  // Empty
  emptyWrap: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 24,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.colors.surfaceWarm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 14,
    color: theme.colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  emptyBtn: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: theme.radius.pill,
  },
  emptyBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
