import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ModalSheet } from '@/components/ui/ModalSheet';
import { theme } from '@/constants/theme';
import type { Location } from '@/services/locations';

interface Props {
  visible: boolean;
  employeeLabel: string;
  locations: Location[];
  selectedIds: Set<string>;
  saving: boolean;
  hasChanges: boolean;
  onToggleLocation: (locationId: string) => void;
  onCancel: () => void;
  onSave: () => void;
}

export function EmployeeAccessSheet({
  visible,
  employeeLabel,
  locations,
  selectedIds,
  saving,
  hasChanges,
  onToggleLocation,
  onCancel,
  onSave,
}: Props) {
  return (
    <ModalSheet visible={visible} onClose={onCancel} scrollable maxHeight="85%">
      <Text style={styles.sheetTitle}>Location access</Text>
      <Text style={styles.sheetSub}>{employeeLabel}</Text>
      {locations.length === 0 ? (
        <Text style={styles.sheetEmpty}>No locations in this company yet.</Text>
      ) : (
        locations.map((loc) => {
          const checked = selectedIds.has(loc.id);
          return (
            <TouchableOpacity
              key={loc.id}
              style={styles.locRow}
              onPress={() => onToggleLocation(loc.id)}
              activeOpacity={0.7}
              disabled={saving}
            >
              <View style={styles.locRowLeft}>
                <Text style={styles.locName}>{loc.name}</Text>
                {loc.address ? (
                  <Text style={styles.locAddress}>{loc.address}</Text>
                ) : null}
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
          style={[styles.footerBtn, styles.footerCancel]}
          onPress={onCancel}
          disabled={saving}
          activeOpacity={0.7}
        >
          <Text style={styles.footerCancelText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.footerBtn,
            styles.footerSave,
            (!hasChanges || saving) && styles.footerSaveDisabled,
          ]}
          onPress={onSave}
          disabled={!hasChanges || saving}
          activeOpacity={0.7}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.footerSaveText}>Save changes</Text>
          )}
        </TouchableOpacity>
      </View>
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  sheetTitle: { fontSize: 19, fontWeight: '700', color: theme.colors.text, marginBottom: 4 },
  sheetSub: { fontSize: 13, color: theme.colors.textMuted, marginBottom: 16 },
  sheetEmpty: { fontSize: 13, color: theme.colors.textMuted, paddingVertical: 12 },
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
  checkboxOn: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
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
  footerCancel: {
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  footerCancelText: { color: theme.colors.text, fontSize: 15, fontWeight: '600' },
  footerSave: { backgroundColor: theme.colors.primary },
  footerSaveDisabled: { opacity: 0.4 },
  footerSaveText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
