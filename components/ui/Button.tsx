import { Pressable, Text, ActivityIndicator, StyleSheet, ViewStyle } from 'react-native';
import { theme } from '@/constants/theme';

interface ButtonProps {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'outline' | 'ghost';
  size?: 'lg' | 'md' | 'sm';
  style?: ViewStyle;
}

export function Button({
  title,
  onPress,
  loading,
  disabled,
  variant = 'primary',
  size = 'lg',
  style,
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      style={({ pressed }) => [
        styles.base,
        size === 'lg' && styles.lg,
        size === 'md' && styles.md,
        size === 'sm' && styles.sm,
        variant === 'primary' && styles.primary,
        variant === 'outline' && styles.outline,
        variant === 'ghost' && styles.ghost,
        pressed && !isDisabled && styles.pressed,
        isDisabled && variant !== 'ghost' && styles.disabled,
        style,
      ]}
      onPress={onPress}
      disabled={isDisabled}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? '#fff' : theme.colors.primary} />
      ) : (
        <Text
          style={[
            styles.text,
            variant === 'outline' && styles.textOutline,
            variant === 'ghost' && styles.textGhost,
            size === 'sm' && styles.textSm,
          ]}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: theme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  lg: { height: 56, paddingHorizontal: theme.spacing.xl },
  md: { height: 48, paddingHorizontal: theme.spacing.lg },
  sm: { height: 38, paddingHorizontal: theme.spacing.md },
  primary: {
    backgroundColor: theme.colors.primary,
  },
  outline: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
  },
  ghost: {
    height: undefined,
    paddingVertical: 10,
    paddingHorizontal: 0,
    backgroundColor: 'transparent',
    marginBottom: 0,
  },
  pressed: { opacity: 0.82 },
  disabled: { opacity: 0.38 },
  text: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  textSm: { fontSize: 14 },
  textOutline: { color: theme.colors.text },
  textGhost: {
    color: theme.colors.textMuted,
    fontSize: 15,
    fontWeight: '500',
  },
});
