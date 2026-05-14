import { StyleSheet } from 'react-native';
import { theme } from '@/constants/theme';

// Shared grouped-row primitives used by Profile-screen subcomponents. Kept
// here so the row/group visuals stay byte-identical across pieces without a
// global style framework.
export const profileStyles = StyleSheet.create({
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textMuted,
    marginTop: 18,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  group: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  helperText: {
    fontSize: 12,
    color: theme.colors.textLight,
    marginTop: 6,
    paddingHorizontal: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 48,
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  rowLabel: {
    fontSize: 15,
    color: theme.colors.text,
    flex: 1,
  },
  rowSub: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '60%',
  },
  rowValue: {
    fontSize: 14,
    color: theme.colors.textMuted,
    flexShrink: 1,
    textAlign: 'right',
  },
  rowValueEmpty: { color: theme.colors.textLight },
  rowSubInline: {
    fontSize: 13,
    color: theme.colors.textMuted,
    flex: 1,
  },
});
