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

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: name ?? 'Sessions',
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
          <ActivityIndicator />
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
                  >
                    <Text style={styles.continueBtnText}>Continue Counting  →</Text>
                  </TouchableOpacity>
                </View>
              )}

              <TouchableOpacity
                style={[
                  styles.startBtn,
                  (starting || activeSessions.length > 0 || productCount === 0) && styles.startBtnDisabled,
                ]}
                onPress={handleStartSession}
                disabled={starting || productCount === 0}
              >
                {starting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.startBtnText}>+ Start New Session</Text>
                )}
              </TouchableOpacity>

              {pastSessions.length > 0 && (
                <Text style={styles.sectionHeader}>PREVIOUS SESSIONS</Text>
              )}
            </>
          }
          ListEmptyComponent={
            activeSessions.length === 0 ? (
              <Text style={styles.emptyText}>No previous sessions.</Text>
            ) : null
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.sessionRow} onPress={() => openSession(item)}>
              <View style={styles.sessionRowLeft}>
                <Text style={styles.sessionDate}>{formatDate(item.created_at)}</Text>
              </View>
              <View style={styles.completedBadge}>
                <Text style={styles.completedBadgeText}>Completed</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16, gap: 10 },
  headerBtn: { paddingHorizontal: 4 },
  headerBtnText: { fontSize: 15, fontWeight: '600', color: '#111' },
  activeCard: {
    backgroundColor: '#111',
    borderRadius: 14,
    padding: 20,
    marginBottom: 12,
  },
  activeLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#aaa',
    letterSpacing: 1,
    marginBottom: 6,
  },
  activeDate: { fontSize: 15, color: '#fff', marginBottom: 16 },
  continueBtn: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  continueBtnText: { fontSize: 16, fontWeight: '700', color: '#111' },
  startBtn: {
    backgroundColor: '#111',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 24,
  },
  startBtnDisabled: { backgroundColor: '#ccc' },
  startBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: '#999',
    letterSpacing: 1,
    marginBottom: 8,
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  sessionRowLeft: { flex: 1 },
  sessionDate: { fontSize: 15, color: '#333' },
  completedBadge: {
    backgroundColor: '#e8f5e9',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  completedBadgeText: { fontSize: 12, fontWeight: '600', color: '#2e7d32' },
  emptyText: { color: '#aaa', fontSize: 14, textAlign: 'center', marginTop: 8 },
});
