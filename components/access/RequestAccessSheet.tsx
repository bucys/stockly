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

  const showForm = !loading && requestable.length > 0;

  return (
    <ModalSheet visible={visible} onClose={onClose} scrollable maxHeight="85%">
      <Text style={styles.title}>Request access</Text>
      <Text style={styles.sub}>Pick a location to request access to.</Text>

      {loading ? (
        <ActivityIndicator color={theme.colors.primary} style={{ marginVertical: 20 }} />
      ) : requestable.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>
            You&apos;re already assigned to all locations.
          </Text>
        </View>
      ) : (
        <View style={styles.group}>
          {requestable.map((loc, idx) => {
            const selected = selectedId === loc.id;
            const pending = pendingIds.has(loc.id);
            return (
              <TouchableOpacity
                key={loc.id}
                style={[
                  styles.row,
                  idx < requestable.length - 1 && styles.rowDivider,
                  selected && styles.rowSelected,
                  pending && styles.rowDisabled,
                ]}
                onPress={() => !pending && setSelectedId(loc.id)}
                disabled={pending}
                activeOpacity={0.7}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>{loc.name}</Text>
                  {pending ? (
                    <Text style={styles.pending}>Pending</Text>
                  ) : loc.address ? (
                    <Text style={styles.address} numberOfLines={1}>{loc.address}</Text>
                  ) : null}
                </View>
                <View style={[styles.radio, selected && styles.radioOn]}>
                  {selected && <View style={styles.radioDot} />}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {showForm && (
        <>
          <Input
            placeholder="Reason (optional)"
            value={reason}
            onChangeText={setReason}
            multiline
            style={styles.reasonInput}
          />
          <View style={styles.footer}>
            <Button
              title="Send request"
              onPress={submit}
              loading={submitting}
              disabled={!selectedId}
              style={{ marginBottom: 0 }}
            />
            <TouchableOpacity
              onPress={onClose}
              activeOpacity={0.7}
              style={styles.cancelBtn}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {!showForm && !loading && (
        <TouchableOpacity
          onPress={onClose}
          activeOpacity={0.7}
          style={styles.cancelBtn}
        >
          <Text style={styles.cancelText}>Close</Text>
        </TouchableOpacity>
      )}
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 18, fontWeight: '700', color: theme.colors.text, marginBottom: 2 },
  sub: { fontSize: 12, color: theme.colors.textMuted, marginBottom: 14 },

  emptyWrap: {
    paddingVertical: 18,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: theme.colors.textMuted,
    textAlign: 'center',
  },

  group: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 48,
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  rowSelected: {
    backgroundColor: theme.colors.surfaceWarm,
  },
  rowDisabled: { opacity: 0.55 },

  name: { fontSize: 14, fontWeight: '600', color: theme.colors.text },
  address: { fontSize: 11, color: theme.colors.textMuted, marginTop: 1 },
  pending: { fontSize: 11, color: theme.colors.textLight, marginTop: 1 },

  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  radioOn: { borderColor: theme.colors.primary },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.primary,
  },

  reasonInput: {
    marginTop: 12,
    minHeight: 44,
  },

  footer: {
    marginTop: 4,
  },
  cancelBtn: {
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  cancelText: {
    fontSize: 14,
    color: theme.colors.textMuted,
    fontWeight: '500',
  },
});
