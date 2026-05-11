import { useState, useCallback, useEffect, useMemo } from 'react';
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
import { useAssignedLocationIds } from '@/lib/useLocationAccess';
import {
  createAccessRequest,
  listMyAccessRequests,
  listRequestableLocations,
  type AccessRequest,
  type RequestableLocation,
} from '@/services/accessRequests';

export default function LocationsTab() {
  const { companyId, role, loading: companyLoading, error: companyError } = useCompanyId();
  const { ids: assignedIds, loading: assignedLoading } = useAssignedLocationIds();
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [saving, setSaving] = useState(false);

  // Access requests (employee with no assigned locations)
  const [showRequestSheet, setShowRequestSheet] = useState(false);
  const [requestLocationId, setRequestLocationId] = useState<string | null>(null);
  const [requestReason, setRequestReason] = useState('');
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [myRequests, setMyRequests] = useState<AccessRequest[]>([]);
  const [requestableLocations, setRequestableLocations] = useState<RequestableLocation[]>([]);
  const [requestableLoading, setRequestableLoading] = useState(false);

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

  const visibleLocations = useMemo(() => {
    if (assignedIds == null) return locations;
    return locations.filter((l) => assignedIds.has(l.id));
  }, [locations, assignedIds]);

  const pendingRequestLocationIds = useMemo(
    () => new Set(myRequests.filter((r) => r.status === 'pending').map((r) => r.location_id)),
    [myRequests],
  );

  useEffect(() => {
    const isUnassigned =
      role !== 'admin' && !assignedLoading && assignedIds != null && assignedIds.size === 0;
    if (!isUnassigned) return;
    listMyAccessRequests()
      .then(setMyRequests)
      .catch(() => {
        // non-critical
      });
  }, [role, assignedLoading, assignedIds]);

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

  const employeeUnassigned =
    !isAdmin && !assignedLoading && assignedIds != null && assignedIds.size === 0;

  function openRequestSheet() {
    setRequestLocationId(null);
    setRequestReason('');
    setShowRequestSheet(true);
    setRequestableLoading(true);
    listRequestableLocations()
      .then(setRequestableLocations)
      .catch((err) => {
        Alert.alert('Error', err instanceof Error ? err.message : 'Failed to load locations');
      })
      .finally(() => setRequestableLoading(false));
  }

  async function submitAccessRequest() {
    if (!requestLocationId) return;
    setRequestSubmitting(true);
    try {
      await createAccessRequest(requestLocationId, requestReason);
      setShowRequestSheet(false);
      const refreshed = await listMyAccessRequests();
      setMyRequests(refreshed);
      Alert.alert('Request sent', 'An admin will review your request shortly.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to submit request';
      const friendly = /duplicate|unique/i.test(msg)
        ? 'You already have a pending request for this location.'
        : msg;
      Alert.alert('Error', friendly);
    } finally {
      setRequestSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      {loading || assignedLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      ) : employeeUnassigned ? (
        <View style={styles.emptyWrap}>
          <View style={styles.emptyIcon}>
            <Ionicons name="lock-closed-outline" size={32} color={theme.colors.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>No locations assigned</Text>
          <Text style={styles.emptySub}>
            Your account has not been added to any locations. Ask an admin for permission.
          </Text>
          {myRequests.some((r) => r.status === 'pending') && (
            <Text style={styles.pendingHint}>
              {myRequests.filter((r) => r.status === 'pending').length} pending request
              {myRequests.filter((r) => r.status === 'pending').length === 1 ? '' : 's'}
            </Text>
          )}
          <View style={styles.emptyBtnWrap}>
            <Button title="Request access" onPress={openRequestSheet} variant="ghost" />
          </View>
        </View>
      ) : visibleLocations.length === 0 ? (
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
          data={visibleLocations}
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

      {isAdmin && visibleLocations.length > 0 && (
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

      <ModalSheet
        visible={showRequestSheet}
        onClose={() => setShowRequestSheet(false)}
        scrollable
        maxHeight="85%"
      >
        <Text style={styles.sheetTitle}>Request access</Text>
        <Text style={styles.requestSub}>Choose a location to request access to.</Text>
        {requestableLoading ? (
          <ActivityIndicator color={theme.colors.primary} style={{ marginVertical: 16 }} />
        ) : requestableLocations.length === 0 ? (
          <Text style={styles.requestEmpty}>No locations available.</Text>
        ) : (
          requestableLocations.map((loc) => {
            const selected = requestLocationId === loc.id;
            const pending = pendingRequestLocationIds.has(loc.id);
            return (
              <TouchableOpacity
                key={loc.id}
                style={styles.requestLocRow}
                onPress={() => !pending && setRequestLocationId(loc.id)}
                disabled={pending}
                activeOpacity={0.7}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.requestLocName}>{loc.name}</Text>
                  {pending ? (
                    <Text style={styles.requestPending}>Pending</Text>
                  ) : loc.address ? (
                    <Text style={styles.requestLocAddress}>{loc.address}</Text>
                  ) : null}
                </View>
                <View style={[styles.radio, selected && styles.radioOn]}>
                  {selected && <View style={styles.radioDot} />}
                </View>
              </TouchableOpacity>
            );
          })
        )}
        <Input
          placeholder="Reason (optional)"
          value={requestReason}
          onChangeText={setRequestReason}
          multiline
        />
        <Button
          title="Send request"
          onPress={submitAccessRequest}
          loading={requestSubmitting}
          disabled={!requestLocationId}
        />
        <Button
          title="Cancel"
          onPress={() => setShowRequestSheet(false)}
          variant="ghost"
        />
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

  pendingHint: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginBottom: 12,
  },
  requestSub: { fontSize: 13, color: theme.colors.textMuted, marginBottom: 16 },
  requestEmpty: { fontSize: 13, color: theme.colors.textMuted, paddingVertical: 12 },
  requestLocRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  requestLocName: { fontSize: 15, fontWeight: '500', color: theme.colors.text },
  requestLocAddress: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  requestPending: { fontSize: 12, color: theme.colors.textLight, marginTop: 2 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: theme.colors.primary },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.primary,
  },
});
