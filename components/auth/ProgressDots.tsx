import { View, StyleSheet } from 'react-native';
import { theme } from '@/constants/theme';

interface Props {
  current: number;
  total: number;
}

export function ProgressDots({ current, total }: Props) {
  return (
    <View style={styles.row}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[styles.dot, i === current && styles.dotActive]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6 },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.borderLight,
  },
  dotActive: {
    width: 20,
    backgroundColor: theme.colors.primary,
  },
});
