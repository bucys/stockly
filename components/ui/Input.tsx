import { TextInput, TextInputProps, StyleSheet } from 'react-native';
import { theme } from '@/constants/theme';

export function Input({ style, ...props }: TextInputProps) {
  return (
    <TextInput
      style={[styles.input, style]}
      placeholderTextColor={theme.colors.textPlaceholder}
      {...props}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    height: 56,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.lg,
    fontSize: 16,
    backgroundColor: theme.colors.inputBg,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
});
