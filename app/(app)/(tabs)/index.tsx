import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Tabs, router, useFocusEffect } from 'expo-router';
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

export default function LocationsTab() {
  const { companyId, role, loading: companyLoading, error: companyError } = useCompanyId();
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [name, setName] = useState('');
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
    setShowModal(true);
  }

  function openEdit(loc: Location) {
    setEditingLocation(loc);
    setName(loc.name);
    setShowModal(true);
  }

  async function handleSave() {
    if (!name.trim() || !companyId) return;
    setSaving(true);
    try {
      if (editingLocation) {
        await updateLocation(editingLocation.id, name.trim());
      } else {
        await createLocation(companyId, name.trim());
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
      { text: 'Rename', onPress: () => openEdit(loc) },
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

  return (
    <View style={styles.container}>
      {/* Dynamic header right (admin only) */}
      {role === 'admin' && (
        <Tabs.Screen
          options={{
            headerRight: () => (
              <TouchableOpacity onPress={openCreate} style={styles.headerBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.headerBtnText}>+ New</Text>
              </TouchableOpacity>
            ),
          }}
        />
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      ) : locations.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>No locations yet</Text>
          <Text style={styles.emptySub}>
            {role === 'admin'
              ? 'Tap "+ New" in the top right to add your first location.'
              : 'No locations have been added to this workspace yet.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={locations}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.row}
              onPress={() =>
                router.push(`/locations/${item.id}/sessions?name=${encodeURIComponent(item.name)}`)
              }
              onLongPress={role === 'admin' ? () => handleLocationActions(item) : undefined}
              delayLongPress={400}
              activeOpacity={0.7}
            >
              <View style={styles.rowLeft}>
                <Text style={styles.rowName}>{item.name}</Text>
                {item.address ? (
                  <Text style={styles.rowAddress}>{item.address}</Text>
                ) : null}
              </View>
              {role === 'admin' && (
                <TouchableOpacity
                  onPress={() => handleLocationActions(item)}
                  style={styles.moreBtn}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Text style={styles.moreBtnText}>···</Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          )}
        />
      )}

      <ModalSheet visible={showModal} onClose={() => setShowModal(false)}>
        <Text style={styles.sheetTitle}>
          {editingLocation ? 'Rename location' : 'New location'}
        </Text>
        <Input
          placeholder="Location name"
          value={name}
          onChangeText={setName}
          autoFocus
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
  list: { padding: theme.spacing.lg, gap: 10, paddingBottom: 32 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    paddingHorizontal: 20,
    paddingVertical: 18,
    ...shadows.sm,
  },
  rowLeft: { flex: 1 },
  rowName: { fontSize: 16, fontWeight: '600', color: theme.colors.text },
  rowAddress: {
    fontSize: 13,
    color: theme.colors.textLight,
    marginTop: 2,
  },
  moreBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#EFEFEC',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  moreBtnText: { fontSize: 14, color: theme.colors.textMuted, letterSpacing: 1.5 },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: theme.colors.textSecondary, marginBottom: 8 },
  emptySub: { fontSize: 14, color: theme.colors.textLight, textAlign: 'center', lineHeight: 20 },
  errorTitle: { fontSize: 16, fontWeight: '600', color: theme.colors.danger, marginBottom: 8, textAlign: 'center' },
  errorSub: { fontSize: 13, color: theme.colors.textLight, textAlign: 'center', marginBottom: 4, paddingHorizontal: 32 },
  headerBtn: { paddingHorizontal: 4 },
  headerBtnText: { fontSize: 15, fontWeight: '600', color: theme.colors.primary },
  sheetTitle: { fontSize: 19, fontWeight: '700', color: theme.colors.text, marginBottom: 16 },
});
