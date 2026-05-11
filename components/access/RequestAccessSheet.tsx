import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { ModalSheet } from '@/components/ui/ModalSheet';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { theme } from '@/constants/theme';
import {
  createAccessRequest,
  listMyAccessRequests,
  listRequestableLocations,
  type RequestableLocation,
} from '@/services/accessRequests';

interface Props {
  visible: boolean;
  onClose: () => void;
  assignedLocationIds?: Set<string>;
  onSubmitted?: () => void;
}

export function RequestAccessSheet({
  visible,
  onClose,
  assignedLocationIds,
  onSubmitted,
}: Props) {
  const [locations, setLocations] = useState<RequestableLocation[]>([]);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setSelectedId(null);
    setReason('');
    setLoading(true);
    Promise.all([listRequestableLocations(), listMyAccessRequests()])
      .then(([locs, requests]) => {
        setLocations(locs);
        setPendingIds(
          new Set(requests.filter((r) => r.status === 'pending').map((r) => r.location_id)),
        );
      })
      .catch((err) => {
        Alert.alert('Error', err instanceof Error ? err.message : 'Failed to load locations');
      })
      .finally(() => setLoading(false));
  }, [visible]);

  async function submit() {
    if (!selectedId) return;
    setSubmitting(true);
    try {
      await createAccessRequest(selectedId, reason);
      onSubmitted?.();
      onClose();
      Alert.alert('Request sent', 'An admin will review your request shortly.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to submit request';
      const friendly = /duplicate|unique/i.test(msg)
        ? 'You already have a pending request for this location.'
        : msg;
      Alert.alert('Error', friendly);
    } finally {
      setSubmitting(false);
    }
  }

  const requestable = locations.filter(
    (l) => !assignedLocationIds || !assignedLocationIds.has(l.id),
  );

  return (
    <ModalSheet visible={visible} onClose={onClose} scrollable maxHeight="85%">
      <Text style={styles.title}>Request access</Text>
      <Text style={styles.sub}>Choose a location to request access to.</Text>

      {loading ? (
        <ActivityIndicator color={theme.colors.primary} style={{ marginVertical: 16 }} />
      ) : requestable.length === 0 ? (
        <Text style={styles.empty}>No additional locations to request.</Text>
      ) : (
        requestable.map((loc) => {
          const selected = selectedId === loc.id;
          const pending = pendingIds.has(loc.id);
          return (
            <TouchableOpacity
              key={loc.id}
              style={styles.row}
              onPress={() => !pending && setSelectedId(loc.id)}
              disabled={pending}
              activeOpacity={0.7}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{loc.name}</Text>
                {pending ? (
                  <Text style={styles.pending}>Pending</Text>
                ) : loc.address ? (
                  <Text style={styles.address}>{loc.address}</Text>
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
        value={reason}
        onChangeText={setReason}
        multiline
      />
      <Button
        title="Send request"
        onPress={submit}
        loading={submitting}
        disabled={!selectedId}
      />
      <Button title="Cancel" onPress={onClose} variant="ghost" />
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 19, fontWeight: '700', color: theme.colors.text, marginBottom: 4 },
  sub: { fontSize: 13, color: theme.colors.textMuted, marginBottom: 16 },
  empty: { fontSize: 13, color: theme.colors.textMuted, paddingVertical: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  name: { fontSize: 15, fontWeight: '500', color: theme.colors.text },
  address: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  pending: { fontSize: 12, color: theme.colors.textLight, marginTop: 2 },
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
