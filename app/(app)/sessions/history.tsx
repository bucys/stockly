import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Stack, useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCompanyId } from '@/lib/useCompanyId';
import { useAssignedLocationIds } from '@/lib/useLocationAccess';
import { getLocations, type Location } from '@/services/locations';
import {
  getSessions,
  getSessionCounts,
  type Session,
} from '@/services/sessions';
import { listCompanyMemberProfiles, type UserProfile } from '@/services/profiles';
import { displayUser } from '@/lib/userDisplay';
import { supabase } from '@/lib/supabase';
import { theme, shadows } from '@/constants/theme';
import { groupSessionsByMonth } from '@/lib/groupSessionsByMonth';
import { HistoryRow } from '@/components/sessions/HistoryRow';

// Future filter hooks (intentionally unused for V1).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _FutureFilters = {
  locationId?: string;
  month?: string; // YYYY-MM
  mode?: 'monthly' | 'all';
};

const MAX_SESSIONS = 200;

interface HistoryEntry {
  session: Session;
  location: Location;
  counted: number;
  total: number;
  lastBy: string | null;
}

export default function HistoryScreen() {
  const params = useLocalSearchParams<{ locationId?: string }>();
  const filterLocationId = params.locationId;

  const { companyId, role, loading: companyLoading } = useCompanyId();
  const { ids: assignedIds, loading: assignedLoading } = useAssignedLocationIds();

  // Access state must be fully resolved before any sessions render. For
  // employees this means waiting until useAssignedLocationIds finishes —
  // otherwise assignedIds == null (its loading value) is indistinguishable
  // from the admin "no filter" sentinel and we'd briefly render unfiltered
  // history. Admins skip the wait entirely.
  const accessReady = role === 'admin' || (role === 'employee' && !assignedLoading);

  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [profilesByUserId, setProfilesByUserId] = useState<Map<string, UserProfile>>(
    new Map(),
  );
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, []);

  const load = useCallback(async () => {
    if (!companyId || !accessReady) return;
    setEntries([]);
    setLoading(true);
    try {
      const allLocs = await getLocations(companyId);
      const accessible =
        role === 'admin'
          ? allLocs
          : allLocs.filter((l) => assignedIds?.has(l.id) ?? false);
      const scoped = filterLocationId
        ? accessible.filter((l) => l.id === filterLocationId)
        : accessible;

      const profiles = await listCompanyMemberProfiles(companyId).catch(() => []);
      const profMap = new Map<string, UserProfile>();
      for (const p of profiles) profMap.set(p.user_id, p);
      setProfilesByUserId(profMap);

      const sessionsByLoc = await Promise.all(
        scoped.map((l) => getSessions(l.id).catch(() => [] as Session[])),
      );

      const flat: Array<{ session: Session; location: Location }> = [];
      for (let i = 0; i < scoped.length; i++) {
        for (const s of sessionsByLoc[i]) {
          if (s.status === 'completed') {
            flat.push({ session: s, location: scoped[i] });
          }
        }
      }
      flat.sort(
        (a, b) =>
          new Date(b.session.created_at).getTime() -
          new Date(a.session.created_at).getTime(),
      );

      const limited = flat.slice(0, MAX_SESSIONS);
      const enriched: HistoryEntry[] = await Promise.all(
        limited.map(async ({ session, location }) => {
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
      setEntries(enriched);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to load history');
    } finally {
      setLoading(false);
    }
  }, [companyId, role, assignedIds, accessReady, filterLocationId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const groups = useMemo(
    () => groupSessionsByMonth(entries, (e) => e.session.created_at),
    [entries],
  );

  const headerTitle = filterLocationId ? 'Location history' : 'All history';
  const isLoading = companyLoading || !accessReady || loading;

  // Employee deep-linking to a location they don't own → render empty state,
  // not unfiltered fallback.
  const employeeLocksOut =
    role === 'employee' &&
    !!filterLocationId &&
    assignedIds != null &&
    !assignedIds.has(filterLocationId);

  function openSession(locationId: string, locationName: string, sessionId: string) {
    router.push(
      `/locations/${locationId}/sessions/${sessionId}?locationName=${encodeURIComponent(locationName)}`,
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: headerTitle, headerBackTitle: 'Back' }} />
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      ) : employeeLocksOut ? (
        <View style={styles.center}>
          <View style={styles.emptyIcon}>
            <Ionicons name="lock-closed-outline" size={32} color={theme.colors.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>No access</Text>
          <Text style={styles.emptySub}>
            You don&apos;t have access to this location&apos;s history.
          </Text>
        </View>
      ) : entries.length === 0 ? (
        <View style={styles.center}>
          <View style={styles.emptyIcon}>
            <Ionicons name="time-outline" size={32} color={theme.colors.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>No history yet</Text>
          <Text style={styles.emptySub}>Completed sessions will appear here.</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {groups.map((g) => (
            <View key={g.key} style={styles.section}>
              <Text style={styles.monthLabel}>{g.label}</Text>
              <View style={styles.group}>
                {g.items.map((entry, idx) => (
                  <HistoryRow
                    key={entry.session.id}
                    locationName={entry.location.name}
                    completedAt={entry.session.created_at}
                    counted={entry.counted}
                    total={entry.total}
                    countedByLabel={
                      entry.lastBy
                        ? displayUser(entry.lastBy, profilesByUserId, currentUserId)
                        : null
                    }
                    isLast={idx === g.items.length - 1}
                    onPress={() =>
                      openSession(entry.location.id, entry.location.name, entry.session.id)
                    }
                  />
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: theme.colors.background,
  },
  content: { padding: theme.spacing.lg, paddingBottom: 40 },

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
  },

  section: { marginBottom: 18 },
  monthLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textMuted,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  group: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    ...shadows.sm,
  },
});
