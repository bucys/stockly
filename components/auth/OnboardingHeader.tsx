import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { ProgressDots } from './ProgressDots';

interface Props {
  step: number;
  total: number;
  onBack: () => void;
  title: string;
  subtitle: string;
}

export function OnboardingHeader({ step, total, onBack, title, subtitle }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.topRow}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={onBack}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={22} color={theme.colors.textMuted} />
        </TouchableOpacity>
        <ProgressDots current={step} total={total} />
        <View style={styles.backBtn} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 28 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 28,
  },
  backBtn: {
    width: 32,
    height: 32,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: theme.colors.text,
    letterSpacing: -0.4,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: theme.colors.textMuted,
    lineHeight: 22,
  },
});
