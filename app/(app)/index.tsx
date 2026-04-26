import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Keyboard,
  Pressable,
  Platform,
} from 'react-native';
import { Stack, router, useFocusEffect } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Linking } from 'react-native';
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
        <ActivityIndicator />
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
          <ActivityIndicator />
        </View>
      ) : locations.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.empty}>No locations yet.</Text>
          <Text style={styles.emptySub}>Tap "+ New" to create your first location.</Text>
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
              style={styles.joinCodeBtn}
              onPress={async () => {
                await Clipboard.setStringAsync(joinCode);
                Alert.alert('Copied', `Join code "${joinCode}" copied to clipboard.`);
              }}
            >
              <Text style={styles.joinCodeBtnText}>Copy code</Text>
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
            >
              <Text style={[styles.joinCodeBtnText, styles.joinCodeBtnTextOutline]}>Send email</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
        <Text style={styles.signOutText}>Sign out</Text>
      </TouchableOpacity>

      <Modal
        visible={showModal}
        animationType="slide"
        transparent
        onRequestClose={() => { Keyboard.dismiss(); setShowModal(false); }}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable
            style={styles.overlay}
            onPress={() => { Keyboard.dismiss(); setShowModal(false); }}
          >
            <Pressable style={styles.sheet} onPress={() => {}}>
              <Text style={styles.sheetTitle}>
                {editingLocation ? 'Rename location' : 'New location'}
              </Text>
              <TextInput
                style={styles.input}
                placeholder="Location name"
                value={name}
                onChangeText={setName}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleSave}
              />
              <TouchableOpacity
                style={[styles.button, (!name.trim() || saving) && styles.buttonDisabled]}
                onPress={handleSave}
                disabled={!name.trim() || saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Save</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => { Keyboard.dismiss(); setShowModal(false); }}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16, gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  rowText: { flex: 1, fontSize: 17, fontWeight: '500', color: '#111' },
  moreBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  moreBtnText: { fontSize: 18, color: '#bbb', letterSpacing: 2 },
  empty: { fontSize: 16, color: '#666', marginBottom: 6 },
  emptySub: { fontSize: 14, color: '#aaa' },
  errorTitle: { fontSize: 16, fontWeight: '600', color: '#c00', marginBottom: 8, textAlign: 'center' },
  errorSub: { fontSize: 13, color: '#888', textAlign: 'center', marginBottom: 4, paddingHorizontal: 32 },
  headerBtn: { paddingHorizontal: 4 },
  headerBtnText: { fontSize: 15, fontWeight: '600', color: '#111' },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 24,
    paddingBottom: 40,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: '#111', marginBottom: 16 },
  input: {
    height: 52,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    paddingHorizontal: 16,
    fontSize: 16,
    backgroundColor: '#fafafa',
    marginBottom: 12,
  },
  button: {
    height: 52,
    backgroundColor: '#111',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  cancelBtn: { alignItems: 'center', paddingVertical: 10 },
  cancelText: { color: '#888', fontSize: 15 },
  signOutBtn: {
    paddingVertical: 16,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#ececec',
    backgroundColor: '#fff',
  },
  signOutText: { fontSize: 15, color: '#888' },
  joinCodeCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  joinCodeLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#999',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  joinCodeValue: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 8,
    color: '#111',
    textAlign: 'center',
    marginBottom: 14,
  },
  joinCodeActions: {
    flexDirection: 'row',
    gap: 8,
  },
  joinCodeBtn: {
    flex: 1,
    height: 40,
    backgroundColor: '#111',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinCodeBtnOutline: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  joinCodeBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  joinCodeBtnTextOutline: {
    color: '#555',
  },
});
