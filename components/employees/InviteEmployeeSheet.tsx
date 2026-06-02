import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ModalSheet } from '@/components/ui/ModalSheet';
import { Input } from '@/components/ui/Input';
import { theme } from '@/constants/theme';
import type { Location } from '@/services/locations';

interface Props {
  visible: boolean;
  locations: Location[];
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (email: string, locationIds: string[]) => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function InviteEmployeeSheet({
  visible,
  locations,
  submitting,
  onCancel,
  onSubmit,
}: Props) {
  const [email, setEmail] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const emailValid = EMAIL_RE.test(email.trim());

  function toggle(locationId: string) {
    if (submitting) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(locationId)) next.delete(locationId);
      else next.add(locationId);
      return next;
    });
  }

  function handleClose() {
    if (submitting) return;
    setEmail('');
    setSelectedIds(new Set());
    onCancel();
  }

  function handleSubmit() {
    if (!emailValid || submitting) return;
    onSubmit(email.trim().toLowerCase(), [...selectedIds]);
  }

  return (
    <ModalSheet visible={visible} onClose={handleClose} scrollable maxHeight="85%">
      <Text style={styles.title}>Invite employee</Text>
      <Text style={styles.sub}>
        They’ll get an email, then sign in with a one-time code to set their name
        and password.
      </Text>

      <Text style={styles.label}>EMAIL</Text>
      <Input
        placeholder="employee@company.com"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        editable={!submitting}
      />

      <Text style={[styles.label, { marginTop: 8 }]}>ASSIGN LOCATIONS</Text>
      {locations.length === 0 ? (
        <Text style={styles.empty}>No locations yet. You can assign access later.</Text>
      ) : (
        locations.map((loc) => {
          const checked = selectedIds.has(loc.id);
          return (
            <TouchableOpacity
              key={loc.id}
              style={styles.locRow}
              onPress={() => toggle(loc.id)}
              activeOpacity={0.7}
              disabled={submitting}
            >
              <View style={styles.locRowLeft}>
                <Text style={styles.locName}>{loc.name}</Text>
                {loc.address ? <Text style={styles.locAddress}>{loc.address}</Text> : null}
              </View>
              <View style={[styles.checkbox, checked && styles.checkboxOn]}>
                {checked && <Ionicons name="checkmark" size={14} color="#fff" />}
              </View>
            </TouchableOpacity>
          );
        })
      )}

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.footerBtn, styles.cancel]}
          onPress={handleClose}
          disabled={submitting}
          activeOpacity={0.7}
        >
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.footerBtn, styles.send, (!emailValid || submitting) && styles.sendDisabled]}
          onPress={handleSubmit}
          disabled={!emailValid || submitting}
          activeOpacity={0.7}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.sendText}>Send invite</Text>
          )}
        </TouchableOpacity>
      </View>
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 19, fontWeight: '700', color: theme.colors.text, marginBottom: 4 },
  sub: { fontSize: 13, color: theme.colors.textMuted, marginBottom: 16, lineHeight: 18 },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.textLight,
    letterSpacing: 1,
    marginBottom: 6,
  },
  empty: { fontSize: 13, color: theme.colors.textMuted, paddingVertical: 10 },
  locRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  locRowLeft: { flex: 1 },
  locName: { fontSize: 15, fontWeight: '500', color: theme.colors.text },
  locAddress: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  footer: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
  },
  footerBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancel: { backgroundColor: theme.colors.background, borderWidth: 1, borderColor: theme.colors.border },
  cancelText: { color: theme.colors.text, fontSize: 15, fontWeight: '600' },
  send: { backgroundColor: theme.colors.primary },
  sendDisabled: { opacity: 0.4 },
  sendText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
