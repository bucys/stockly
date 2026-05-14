import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { theme } from '@/constants/theme';
import { profileStyles } from './styles';

interface Props {
  employeeName: string;
  locationName: string;
  reason: string | null;
  deciding: boolean;
  isLast: boolean;
  onApprove: () => void;
  onReject: () => void;
}

export function AccessRequestRow({
  employeeName,
  locationName,
  reason,
  deciding,
  isLast,
  onApprove,
  onReject,
}: Props) {
  return (
    <View
      style={[
        styles.requestItem,
        !isLast && profileStyles.rowDivider,
      ]}
    >
      <View style={{ flex: 1, paddingRight: 8 }}>
        <Text style={styles.requestName} numberOfLines={1}>
          {employeeName}
        </Text>
        <Text style={styles.requestMeta} numberOfLines={1}>
          {locationName}
        </Text>
        {reason ? (
          <Text style={styles.requestReason} numberOfLines={2}>
            “{reason}”
          </Text>
        ) : null}
      </View>
      <View style={styles.requestActions}>
        <TouchableOpacity
          style={styles.rejectBtn}
          onPress={onReject}
          disabled={deciding}
          activeOpacity={0.7}
          hitSlop={6}
        >
          <Text style={styles.rejectBtnText}>Reject</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.approveBtn}
          onPress={onApprove}
          disabled={deciding}
          activeOpacity={0.85}
          hitSlop={6}
        >
          {deciding ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.approveBtnText}>Approve</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  requestItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  requestName: { fontSize: 14, fontWeight: '600', color: theme.colors.text },
  requestMeta: { fontSize: 12, color: theme.colors.textMuted, marginTop: 1 },
  requestReason: {
    fontSize: 12,
    color: theme.colors.textLight,
    marginTop: 4,
    fontStyle: 'italic',
  },
  requestActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rejectBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radius.md,
  },
  rejectBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textMuted,
  },
  approveBtn: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: theme.radius.md,
    minWidth: 76,
    alignItems: 'center',
  },
  approveBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
});
