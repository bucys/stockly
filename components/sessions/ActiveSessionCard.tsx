import { memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme, shadows } from '@/constants/theme';

const ACCENT = '#2563EB';
const ACCENT_BG = '#EEF4FF';

interface Props {
  locationName: string;
  startedAt: string;
  counted: number;
  total: number;
  lastByLabel: string;
  onContinue: () => void;
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (sameDay) return `Today, ${time}`;
  const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${date}, ${time}`;
}

function ActiveSessionCardImpl({
  locationName,
  startedAt,
  counted,
  total,
  lastByLabel,
  onContinue,
}: Props) {
  const safeTotal = total > 0 ? total : 0;
  const safeCounted = Math.min(counted, safeTotal || counted);
  const pct = safeTotal > 0 ? Math.round((safeCounted / safeTotal) * 100) : 0;

  return (
    <View style={styles.activeCard}>
      <View style={styles.activeTopRow}>
        <Text style={styles.activeLabel}>ACTIVE SESSION</Text>
        <Text style={styles.activeTime}>{formatDateTime(startedAt)}</Text>
      </View>
      <Text style={styles.activeName} numberOfLines={1}>
        {locationName}
      </Text>
      <View style={styles.activeProgressRow}>
        <Text style={styles.activeProgressText}>
          {safeCounted} of {safeTotal || '–'} counted
        </Text>
        <Text style={styles.activePct}>{pct}%</Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${pct}%` }]} />
      </View>
      <Text style={styles.activeByText}>Last edited by: {lastByLabel}</Text>
      <TouchableOpacity style={styles.continueBtn} onPress={onContinue} activeOpacity={0.85}>
        <Text style={styles.continueBtnText}>Continue counting  →</Text>
      </TouchableOpacity>
    </View>
  );
}

export const ActiveSessionCard = memo(ActiveSessionCardImpl);

const styles = StyleSheet.create({
  activeCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderTopWidth: 3,
    borderTopColor: ACCENT,
    padding: 18,
    marginBottom: 22,
    ...shadows.sm,
  },
  activeTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  activeLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: ACCENT,
    letterSpacing: 1.1,
  },
  activeTime: { fontSize: 12, color: theme.colors.textMuted },
  activeName: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 12,
  },
  activeProgressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  activeProgressText: { fontSize: 13, color: theme.colors.textMuted },
  activePct: { fontSize: 14, fontWeight: '700', color: theme.colors.text },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: ACCENT_BG,
    overflow: 'hidden',
    marginBottom: 16,
  },
  progressFill: { height: '100%', backgroundColor: ACCENT, borderRadius: 4 },
  continueBtn: {
    backgroundColor: ACCENT,
    borderRadius: theme.radius.md,
    paddingVertical: 13,
    alignItems: 'center',
  },
  continueBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  activeByText: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: 2,
    marginBottom: 8,
  },
});
