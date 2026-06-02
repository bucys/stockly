import { View, Text, StyleSheet } from 'react-native';
import { theme } from '@/constants/theme';
import { evaluatePassword, type PasswordScore } from '@/lib/passwordStrength';

// Amber for the mid "Weak/Good" range — the theme only ships red/green, so the
// in-between tone is defined locally here.
const AMBER = '#D97706';

const SEGMENTS = 4;

function colorForScore(score: PasswordScore): string {
  if (score >= 4) return theme.colors.success;
  if (score === 3) return AMBER;
  if (score === 2) return AMBER;
  return theme.colors.danger;
}

type Props = {
  /** Current password value. */
  password: string;
};

/**
 * Live password strength meter + inline requirement hints. Renders nothing
 * when the field is empty so it doesn't clutter the initial form.
 */
export function PasswordStrengthMeter({ password }: Props) {
  if (!password) return null;

  const { score, label, unmet } = evaluatePassword(password);
  const color = colorForScore(score);
  const filled = Math.max(0, Math.min(SEGMENTS, score));

  return (
    <View style={styles.wrap}>
      <View style={styles.bars}>
        {Array.from({ length: SEGMENTS }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.segment,
              { backgroundColor: i < filled ? color : theme.colors.borderLight },
            ]}
          />
        ))}
      </View>
      <View style={styles.labelRow}>
        <Text style={[styles.label, { color }]}>{label}</Text>
        {unmet.length > 0 && (
          <Text style={styles.hint} numberOfLines={1}>
            {unmet.join(' · ')}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: -theme.spacing.sm,
    marginBottom: theme.spacing.md,
    gap: 6,
  },
  bars: {
    flexDirection: 'row',
    gap: 4,
  },
  segment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
  },
  hint: {
    flex: 1,
    fontSize: 11,
    color: theme.colors.textMuted,
    textAlign: 'right',
  },
});
