import { memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';

interface Props {
  locationName: string;
  completedAt: string;
  countedByLabel?: string | null;
  /** When both are provided, the meta line shows "Completed <date> · X / Y counted"
   *  and countedByLabel is rendered on its own second line. */
  counted?: number;
  total?: number;
  isLast?: boolean;
  onPress: () => void;
}

function formatHistoryDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function HistoryRowImpl({
  locationName,
  completedAt,
  countedByLabel,
  counted,
  total,
  isLast,
  onPress,
}: Props) {
  const showCount = typeof counted === 'number' && typeof total === 'number';

  return (
    <TouchableOpacity
      style={[styles.row, !isLast && styles.rowDivider]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.left}>
        <Text style={styles.name} numberOfLines={1}>
          {locationName}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {showCount
            ? `Completed ${formatHistoryDate(completedAt)} · ${counted} / ${total} counted`
            : `${formatHistoryDate(completedAt)}${countedByLabel ? ` · Last counted by: ${countedByLabel}` : ''}`}
        </Text>
        {showCount && countedByLabel ? (
          <Text style={styles.meta} numberOfLines={1}>
            Last counted by {countedByLabel}
          </Text>
        ) : null}
      </View>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>COMPLETE</Text>
      </View>
      <Ionicons name="chevron-forward" size={15} color={theme.colors.textLight} />
    </TouchableOpacity>
  );
}

export const HistoryRow = memo(HistoryRowImpl);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  left: { flex: 1, paddingRight: 8 },
  name: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
  meta: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  badge: {
    backgroundColor: theme.colors.successBg,
    borderRadius: theme.radius.xs,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.success,
    letterSpacing: 0.5,
  },
});
