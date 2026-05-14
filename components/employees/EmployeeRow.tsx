import { memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme, shadows } from '@/constants/theme';

interface Props {
  title: string;
  subtitle: string | null;
  assignedSummary: string;
  onPress: () => void;
}

function EmployeeRowImpl({ title, subtitle, assignedSummary, onPress }: Props) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.left}>
        <Text style={styles.name}>{title}</Text>
        {subtitle ? <Text style={styles.email}>{subtitle}</Text> : null}
        <Text style={styles.meta}>{assignedSummary}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={theme.colors.textLight} />
    </TouchableOpacity>
  );
}

export const EmployeeRow = memo(EmployeeRowImpl);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 8,
    ...shadows.sm,
  },
  left: { flex: 1 },
  name: { fontSize: 16, fontWeight: '700', color: theme.colors.text },
  email: { fontSize: 12, color: theme.colors.textLight, marginTop: 2 },
  meta: { fontSize: 12, color: theme.colors.textMuted, marginTop: 4 },
});
