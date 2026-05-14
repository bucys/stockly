import { View, Text, TouchableOpacity, StyleSheet, Switch } from 'react-native';
import { theme } from '@/constants/theme';

interface Props {
  enabled: boolean;
  onToggle: (next: boolean) => void;
}

export function ImportQuantityToggle({ enabled, onToggle }: Props) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => onToggle(!enabled)}
      activeOpacity={0.7}
    >
      <View style={styles.left}>
        <Text style={styles.label}>Update stock quantities</Text>
        <Text style={styles.hint}>
          {enabled
            ? 'Imported quantities will overwrite current stock.'
            : 'Products will be imported without changing stock.'}
        </Text>
      </View>
      <Switch
        value={enabled}
        onValueChange={onToggle}
        trackColor={{ false: theme.colors.borderLight, true: theme.colors.primary }}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 14,
    marginBottom: 16,
  },
  left: { flex: 1 },
  label: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
  hint: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2, lineHeight: 16 },
});
