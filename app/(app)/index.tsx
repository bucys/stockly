import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { Stack, router, useFocusEffect } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useCompanyId } from '@/lib/useCompanyId';
import {
  getLocations,
  createLocation,
  updateLocation,
  deleteLocation,
} from '@/services/locations';
import { signOut } from '@/services/auth';
import { hasActiveSession } from '@/services/sessions';
import { getCompanyJoinCode } from '@/services/companies';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ModalSheet } from '@/components/ui/ModalSheet';
import { theme, shadows } from '@/constants/theme';

interface Location {
  id: string;
  name: string;
}

export default function LocationsScreen() {
  const { companyId, role, loading: companyLoading, error: companyError } = useCompanyId();
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (role === 'admin' && companyId) {
      getCompanyJoinCode(companyId).then(setJoinCode);
    }
  }, [role, companyId]);

  async function handleSignOut() {
    console.log('[LocationsScreen] sign out pressed');
    try {
      await signOut();
    } catch (err) {
      console.error('[LocationsScreen] sign out error:', err);
      Alert.alert('Error', 'Failed to sign out');
    }
  }

  const load = useCallback(async () => {
    if (!companyId) return;
    console.log('[LocationsScreen] fetching locations, company_id:', companyId);
    setLoading(true);
    try {
      const result = await getLocations(companyId);
      console.log('[LocationsScreen] locations loaded:', result.length);
      setLocations(result);
    } catch (err) {
      console.error('[LocationsScreen] locations fetch error:', err);
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
    console.log('[LocationsScreen] open create, company_id:', companyId);
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
    if (!name.trim()) return;
    if (!companyId) {
      console.warn('[LocationsScreen] handleSave called with no company_id — aborting');
      Alert.alert('Error', 'No company found. Cannot create location.');
      return;
    }
    console.log('[LocationsScreen] saving location:', { name: name.trim(), company_id: companyId, editing: editingLocation?.id ?? null });
    setSaving(true);
    try {
      if (editingLocation) {
        await updateLocation(editingLocation.id, name.trim());
      } else {
        await createLocation(companyId, name.trim());
      }
      console.log('[LocationsScreen] location saved');
      setShowModal(false);
      load();
    } catch (err) {
      console.error('[LocationsScreen] save error:', err);
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save location');
    } finally {
      setSaving(false);
    }
  }

  function handleLocationActions(loc: Location) {
    Alert.alert(loc.name, '', [
      { text: 'Rename', onPress: () => openEdit(loc) },
      { text: 'Delete', style: 'destructive', onPress: () => confirmDeleteLocation(loc) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function confirmDeleteLocation(loc: Location) {
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
        <Stack.Screen options={{ title: 'Locations' }} />
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Account setup incomplete</Text>
          <Text style={styles.errorSub}>
            {companyError ?? 'No company membership found.'}
          </Text>
          <Text style={styles.errorSub}>Sign out and register again to fix this.</Text>
        </View>
        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Locations',
          headerRight: role === 'admin'
            ? () => (
                <TouchableOpacity onPress={openCreate} style={styles.headerBtn}>
                  <Text style={styles.headerBtnText}>+ New</Text>
                </TouchableOpacity>
              )
            : undefined,
        }}
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      ) : locations.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>No locations yet</Text>
          <Text style={styles.emptySub}>
            {role === 'admin' ? 'Tap "+ New" to add your first location.' : 'No locations have been added.'}
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
              <Text style={styles.rowText}>{item.name}</Text>
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

      {role === 'admin' && joinCode && (
        <View style={styles.joinCodeCard}>
          <Text style={styles.joinCodeLabel}>Employee join code</Text>
          <Text style={styles.joinCodeValue}>{joinCode}</Text>
          <View style={styles.joinCodeActions}>
            <TouchableOpacity
              style={[styles.joinCodeBtn, copied && styles.joinCodeBtnCopied]}
              onPress={async () => {
                await Clipboard.setStringAsync(joinCode);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              activeOpacity={0.75}
            >
              <Text style={styles.joinCodeBtnText}>{copied ? 'Copied ✓' : 'Copy code'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.joinCodeBtn, styles.joinCodeBtnOutline]}
              onPress={() => {
                const subject = encodeURIComponent('Join our inventory team');
                const body = encodeURIComponent(
                  `Hi,\n\nDownload the Inventory Tracker app and use this code to join our company:\n\n${joinCode}\n\nSee you inside!`,
                );
                Linking.openURL(`mailto:?subject=${subject}&body=${body}`);
              }}
              activeOpacity={0.75}
            >
              <Text style={[styles.joinCodeBtnText, styles.joinCodeBtnTextOutline]}>Send email</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut} activeOpacity={0.7}>
        <Text style={styles.signOutText}>Sign out</Text>
      </TouchableOpacity>

      <ModalSheet
        visible={showModal}
        onClose={() => setShowModal(false)}
      >
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
        <Button
          title="Cancel"
          onPress={() => setShowModal(false)}
          variant="ghost"
        />
      </ModalSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  list: { padding: theme.spacing.lg, gap: 10, paddingBottom: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    paddingHorizontal: 20,
    paddingVertical: 20,
    ...shadows.sm,
  },
  rowText: { flex: 1, fontSize: 17, fontWeight: '600', color: theme.colors.text },
  moreBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#EFEFEC',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  moreBtnText: { fontSize: 14, color: '#666666', letterSpacing: 1.5 },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: theme.colors.textSecondary, marginBottom: 6 },
  emptySub: { fontSize: 14, color: theme.colors.textLight, textAlign: 'center' },
  errorTitle: { fontSize: 16, fontWeight: '600', color: theme.colors.danger, marginBottom: 8, textAlign: 'center' },
  errorSub: { fontSize: 13, color: theme.colors.textLight, textAlign: 'center', marginBottom: 4, paddingHorizontal: 32 },
  headerBtn: { paddingHorizontal: 4 },
  headerBtnText: { fontSize: 14, fontWeight: '500', color: theme.colors.text },
  sheetTitle: { fontSize: 19, fontWeight: '700', color: theme.colors.text, marginBottom: 16 },
  signOutBtn: {
    paddingVertical: 18,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
    backgroundColor: theme.colors.surface,
  },
  signOutText: { fontSize: 15, color: theme.colors.textLight, fontWeight: '500' },
  joinCodeCard: {
    marginHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    padding: 20,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    ...shadows.sm,
  },
  joinCodeLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.textLight,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  joinCodeValue: {
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: 8,
    color: theme.colors.text,
    textAlign: 'center',
    marginBottom: 16,
  },
  joinCodeActions: { flexDirection: 'row', gap: 8 },
  joinCodeBtn: {
    flex: 1,
    height: 42,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinCodeBtnCopied: {
    backgroundColor: theme.colors.success,
  },
  joinCodeBtnOutline: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
  },
  joinCodeBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  joinCodeBtnTextOutline: { color: theme.colors.textSecondary },
});
