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
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCompanyId } from '@/lib/useCompanyId';
import {
  getLocations,
  createLocation,
  updateLocation,
  deleteLocation,
  Location,
} from '@/services/locations';
import { hasActiveSession } from '@/services/sessions';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ModalSheet } from '@/components/ui/ModalSheet';
import { theme, shadows } from '@/constants/theme';
import { relativeTime } from '@/lib/relativeTime';

export default function LocationsTab() {
  const { companyId, role, loading: companyLoading, error: companyError } = useCompanyId();
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const result = await getLocations(companyId);
      setLocations(result);
    } catch (err) {
      console.error('[LocationsTab] load error:', err);
      Alert.alert('Error', 'Failed to load locations');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useFocusEffect(
    useCallback(() => {
      if (companyId) load();
    }, [companyId, load]),
  );

  function openCreate() {
    setEditingLocation(null);
    setName('');
    setAddress('');
    setShowModal(true);
  }

  function openEdit(loc: Location) {
    setEditingLocation(loc);
    setName(loc.name);
    setAddress(loc.address ?? '');
    setShowModal(true);
  }

  async function handleSave() {
    if (!name.trim() || !companyId) return;
    setSaving(true);
    try {
      const trimmedAddress = address.trim() || undefined;
      if (editingLocation) {
        await updateLocation(editingLocation.id, name.trim(), trimmedAddress);
      } else {
        await createLocation(companyId, name.trim(), trimmedAddress);
      }
      setShowModal(false);
      load();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save location');
    } finally {
      setSaving(false);
    }
  }

  function handleLocationActions(loc: Location) {
    Alert.alert(loc.name, '', [
      { text: 'Edit', onPress: () => openEdit(loc) },
      { text: 'Delete', style: 'destructive', onPress: () => confirmDelete(loc) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function confirmDelete(loc: Location) {
    const active = await hasActiveSession(loc.id);
    const message = active
      ? `"${loc.name}" has an active inventory session.\n\nAll sessions, counts, categories, and products will be permanently deleted.`
      : `All sessions, inventory counts, categories, and products for "${loc.name}" will be permanently deleted.`;
    Alert.alert('Delete location?', message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteLocation(loc.id);
            load();
          } catch {
            Alert.alert('Error', 'Failed to delete location');
          }
        },
      },
    ]);
  }

  if (companyLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  if (!companyId) {
    return (
      <View style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Account setup incomplete</Text>
          <Text style={styles.errorSub}>{companyError ?? 'No company membership found.'}</Text>
          <Text style={styles.errorSub}>Sign out and register again to fix this.</Text>
        </View>
      </View>
    );
  }

  const isAdmin = role === 'admin';

  return (
    <View style={styles.container}>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      ) : locations.length === 0 ? (
        <View style={styles.emptyWrap}>
          <View style={styles.emptyIcon}>
            <Ionicons name="business-outline" size={32} color={theme.colors.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>No locations yet</Text>
          <Text style={styles.emptySub}>
            {isAdmin
              ? 'Add your first location to start tracking inventory'
              : 'No locations have been added to this workspace yet.'}
          </Text>
          {isAdmin && (
            <View style={styles.emptyBtnWrap}>
              <Button title="+ Add location" onPress={openCreate} />
            </View>
          )}
        </View>
      ) : (
        <FlatList
          data={locations}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() =>
                router.push(`/locations/${item.id}/sessions?name=${encodeURIComponent(item.name)}`)
              }
              onLongPress={isAdmin ? () => handleLocationActions(item) : undefined}
              delayLongPress={400}
              activeOpacity={0.85}
            >
              <View style={styles.cardLeft}>
                <Text style={styles.cardName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.cardAddress} numberOfLines={1}>
                  {item.address?.trim() ? item.address : 'Address not set'}
                </Text>
                <View style={styles.metaRow}>
                  <View style={styles.metaItem}>
                    <Ionicons name="cube-outline" size={13} color={theme.colors.textMuted} />
                    <Text style={styles.metaText}>{item.productCount} products</Text>
                  </View>
                  <View style={styles.metaDot} />
                  <View style={styles.metaItem}>
                    <Ionicons name="time-outline" size={13} color={theme.colors.textMuted} />
                    <Text style={styles.metaText}>
                      {item.lastCompletedSessionAt
                        ? `Last count: ${relativeTime(item.lastCompletedSessionAt)}`
                        : 'Last count unavailable'}
                    </Text>
                  </View>
                </View>
              </View>
              {isAdmin ? (
                <TouchableOpacity
                  onPress={() => handleLocationActions(item)}
                  style={styles.moreBtn}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Ionicons name="ellipsis-horizontal" size={18} color={theme.colors.textMuted} />
                </TouchableOpacity>
              ) : (
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={theme.colors.textLight}
                  style={styles.chevron}
                />
              )}
            </TouchableOpacity>
          )}
        />
      )}

      {isAdmin && locations.length > 0 && (
        <TouchableOpacity
          style={styles.fab}
          onPress={openCreate}
          activeOpacity={0.9}
        >
          <Ionicons name="add" size={22} color="#fff" />
          <Text style={styles.fabText}>Add location</Text>
        </TouchableOpacity>
      )}

      <ModalSheet
        visible={showModal}
        onClose={() => setShowModal(false)}
        scrollable
        maxHeight="90%"
      >
        <Text style={styles.sheetTitle}>
          {editingLocation ? 'Edit location' : 'New location'}
        </Text>
        <Input
          placeholder="Location name"
          value={name}
          onChangeText={setName}
          autoFocus
          returnKeyType="next"
        />
        <Input
          placeholder="Address (optional)"
          value={address}
          onChangeText={setAddress}
          returnKeyType="done"
          onSubmitEditing={handleSave}
        />
        <Button
          title="Save"
          onPress={handleSave}
          loading={saving}
          disabled={!name.trim()}
        />
        <Button title="Cancel" onPress={() => setShowModal(false)} variant="ghost" />
      </ModalSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  list: {
    padding: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
    paddingBottom: 110,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 12,
    ...shadows.sm,
  },
  cardLeft: { flex: 1, paddingRight: 12 },
  cardName: { fontSize: 16, fontWeight: '600', color: theme.colors.text },
  cardAddress: {
    fontSize: 13,
    color: theme.colors.textLight,
    marginTop: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: theme.colors.textLight,
    marginHorizontal: 8,
  },
  chevron: { marginLeft: 4 },
  moreBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },

  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingBottom: 60,
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
  emptyBtnWrap: { width: '100%', maxWidth: 280 },

  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: theme.radius.pill,
    ...shadows.md,
  },
  fabText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 6,
  },

  errorTitle: { fontSize: 16, fontWeight: '600', color: theme.colors.danger, marginBottom: 8, textAlign: 'center' },
  errorSub: { fontSize: 13, color: theme.colors.textLight, textAlign: 'center', marginBottom: 4, paddingHorizontal: 32 },
  sheetTitle: { fontSize: 19, fontWeight: '700', color: theme.colors.text, marginBottom: 18 },
});
