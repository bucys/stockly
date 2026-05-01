import { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { getSessions, createSession, Session } from '@/services/sessions';
import { getLocationProductCount } from '@/services/products';
import { theme, shadows } from '@/constants/theme';

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
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);

  const load = useCallback(async () => {
    if (!locationId) return;
    setLoading(true);
    try {
      const [s, count] = await Promise.all([
        getSessions(locationId),
        getLocationProductCount(locationId),
      ]);
      setSessions(s);
      setProductCount(count);
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

  const isStartDisabled = starting || activeSessions.length > 0 || productCount === 0;

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: name ?? 'Sessions',
          headerBackTitle: 'Back',
          headerRight: () => (
            <TouchableOpacity
              onPress={() => router.push(`/locations/${locationId}?name=${encodeURIComponent(name ?? '')}`)}
              style={styles.headerBtn}
            >
              <Text style={styles.headerBtnText}>Products</Text>
            </TouchableOpacity>
          ),
        }}
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      ) : (
        <FlatList
          data={pastSessions}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <>
              {activeSessions.length > 0 && (
                <View style={styles.activeCard}>
                  <Text style={styles.activeLabel}>ACTIVE SESSION</Text>
                  <Text style={styles.activeDate}>{formatDate(activeSessions[0].created_at)}</Text>
                  <TouchableOpacity
                    style={styles.continueBtn}
                    onPress={() => openSession(activeSessions[0])}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.continueBtnText}>Continue Counting  →</Text>
                  </TouchableOpacity>
                </View>
              )}

              {productCount === 0 ? (
                <View style={styles.noProductsCard}>
                  <Text style={styles.noProductsTitle}>No products yet</Text>
                  <Text style={styles.noProductsSub}>
                    Add or import products before starting inventory.
                  </Text>
                  <TouchableOpacity
                    style={styles.goToProductsBtn}
                    onPress={() => router.push(`/locations/${locationId}?name=${encodeURIComponent(name ?? '')}`)}
                    activeOpacity={0.75}
                  >
                    <Text style={styles.goToProductsBtnText}>Go to Products →</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.startBtn, isStartDisabled && styles.startBtnDisabled]}
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

              {pastSessions.length > 0 && (
                <Text style={styles.sectionHeader}>PREVIOUS SESSIONS</Text>
              )}
            </>
          }
          ListEmptyComponent={
            activeSessions.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyText}>No previous sessions yet.</Text>
                <Text style={styles.emptySubText}>Completed sessions will appear here.</Text>
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <TouchableOpacity
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
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: theme.spacing.lg, gap: 10, paddingBottom: 32 },
  headerBtn: { paddingHorizontal: 4 },
  headerBtnText: { fontSize: 14, fontWeight: '500', color: theme.colors.text },

  // Active session card
  activeCard: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.xl,
    padding: 22,
    marginBottom: 12,
  },
  activeLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  activeDate: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.85)',
    marginBottom: 18,
    fontWeight: '500',
  },
  continueBtn: {
    backgroundColor: '#fff',
    borderRadius: theme.radius.md,
    paddingVertical: 15,
    alignItems: 'center',
  },
  continueBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.primaryDark,
    letterSpacing: 0.1,
  },

  // No products empty state
  noProductsCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: 24,
    marginBottom: 28,
    alignItems: 'center',
    ...shadows.sm,
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
    marginBottom: 20,
    lineHeight: 20,
  },
  goToProductsBtn: {
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.primary,
  },
  goToProductsBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },

  // Start button
  startBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.lg,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 28,
    ...shadows.sm,
  },
  startBtnDisabled: {
    backgroundColor: '#CCCCCC',
  },
  startBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.2,
  },

  // Section
  sectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.textLight,
    letterSpacing: 1.2,
    marginBottom: 8,
  },

  // Past session rows
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    paddingHorizontal: 18,
    paddingVertical: 18,
    ...shadows.sm,
  },
  sessionRowLeft: { flex: 1 },
  sessionDate: { fontSize: 15, color: theme.colors.textSecondary, fontWeight: '500' },
  completedBadge: {
    backgroundColor: theme.colors.successBg,
    borderRadius: theme.radius.xs,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  completedBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.success,
  },

  // Empty state
  emptyWrap: { alignItems: 'center', paddingTop: 8 },
  emptyText: { color: theme.colors.textLight, fontSize: 15, fontWeight: '500', marginBottom: 4 },
  emptySubText: { color: theme.colors.textPlaceholder, fontSize: 13 },
});
