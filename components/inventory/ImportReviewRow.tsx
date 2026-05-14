import { memo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import type { DraftRow, ImportWarning } from '@/lib/importMatchers';

interface Props {
  row: DraftRow;
  included: boolean;
  hasErrors: boolean;
  onToggleInclude: () => void;
  onPatch: (patch: Partial<DraftRow>) => void;
}

function primaryWarning(warnings: ImportWarning[], hasParserErrors: boolean):
  | { tone: 'red' | 'amber' | 'grey'; label: string }
  | null {
  if (hasParserErrors) return { tone: 'grey', label: 'Invalid row' };
  const w = warnings[0];
  if (!w) return null;
  if (w.kind === 'exact_duplicate') return { tone: 'red', label: 'Exact duplicate' };
  return { tone: 'amber', label: 'Possible duplicate' };
}

function ImportReviewRowImpl({
  row,
  included,
  hasErrors,
  onToggleInclude,
  onPatch,
}: Props) {
  const badge = primaryWarning(row.warnings, hasErrors);

  return (
    <View style={[styles.card, !included && styles.cardExcluded]}>
      <View style={styles.cardHead}>
        <TouchableOpacity
          style={[styles.checkbox, included && styles.checkboxOn]}
          onPress={() => !hasErrors && onToggleInclude()}
          disabled={hasErrors}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          {included && <Ionicons name="checkmark" size={14} color="#fff" />}
        </TouchableOpacity>
        <Text style={styles.lineLabel}>Line {row.lineNumber}</Text>
        {badge && (
          <View
            style={[
              styles.badge,
              badge.tone === 'red' && styles.badgeRed,
              badge.tone === 'amber' && styles.badgeAmber,
              badge.tone === 'grey' && styles.badgeGrey,
            ]}
          >
            <Text
              style={[
                styles.badgeText,
                badge.tone === 'red' && styles.badgeTextRed,
                badge.tone === 'amber' && styles.badgeTextAmber,
                badge.tone === 'grey' && styles.badgeTextGrey,
              ]}
            >
              {badge.label}
            </Text>
          </View>
        )}
      </View>

      <TextInput
        style={styles.nameInput}
        value={row.name}
        onChangeText={(v) => onPatch({ name: v })}
        placeholder="Product name"
        placeholderTextColor={theme.colors.textPlaceholder}
      />

      <View style={styles.categoryRow}>
        <TextInput
          style={[styles.input, styles.categoryInput]}
          value={row.categoryName}
          onChangeText={(v) => onPatch({ categoryName: v })}
          placeholder="Category"
          placeholderTextColor={theme.colors.textPlaceholder}
        />
        {row.matchedCategoryId == null && row.categoryName.trim() !== '' && (
          <View style={styles.newPill}>
            <Text style={styles.newPillText}>NEW</Text>
          </View>
        )}
      </View>
      {row.matchedCategoryDisplayName &&
      row.matchedCategoryDisplayName !== row.categoryName ? (
        <Text style={styles.hint}>
          Matches existing &ldquo;{row.matchedCategoryDisplayName}&rdquo;
        </Text>
      ) : null}

      <View style={styles.fieldRow}>
        <TextInput
          style={[styles.input, styles.unitInput]}
          value={row.unit}
          onChangeText={(v) => onPatch({ unit: v })}
          placeholder="Unit"
          placeholderTextColor={theme.colors.textPlaceholder}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TextInput
          style={[styles.input, styles.qtyInput]}
          value={row.quantity == null ? '' : String(row.quantity)}
          onChangeText={(v) => {
            const trimmed = v.trim().replace(',', '.');
            if (trimmed === '') {
              onPatch({ quantity: null });
              return;
            }
            const n = Number(trimmed);
            onPatch({
              quantity: Number.isFinite(n) && n >= 0 ? n : row.quantity,
            });
          }}
          placeholder="Qty"
          placeholderTextColor={theme.colors.textPlaceholder}
          keyboardType="decimal-pad"
        />
      </View>

      {hasErrors && (
        <Text style={styles.errorText}>
          {row.errors.join(', ').replace(/_/g, ' ')}
        </Text>
      )}

      {row.warnings.map((w, i) =>
        w.kind === 'possible_duplicate' ? (
          <Text key={i} style={styles.hintWarn}>
            Similar to &ldquo;{w.existingProductName}&rdquo; in {w.existingCategoryName} ({w.existingUnit})
          </Text>
        ) : (
          <Text key={i} style={styles.hintError}>
            Already exists: &ldquo;{w.existingProductName}&rdquo;
          </Text>
        ),
      )}
    </View>
  );
}

export const ImportReviewRow = memo(ImportReviewRowImpl);

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  cardExcluded: { opacity: 0.55 },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  lineLabel: {
    flex: 1,
    fontSize: 11,
    color: theme.colors.textLight,
    fontWeight: '600',
    letterSpacing: 0.6,
  },
  badge: {
    borderRadius: theme.radius.xs,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeRed: { backgroundColor: '#FCEBEB' },
  badgeAmber: { backgroundColor: '#FFF4DB' },
  badgeGrey: { backgroundColor: theme.colors.borderLight },
  badgeText: { fontSize: 11, fontWeight: '700' },
  badgeTextRed: { color: theme.colors.danger },
  badgeTextAmber: { color: '#92590A' },
  badgeTextGrey: { color: theme.colors.textMuted },

  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 10,
    height: 34,
    fontSize: 13,
    color: theme.colors.text,
    backgroundColor: theme.colors.inputBg,
  },
  nameInput: {
    height: 36,
    paddingHorizontal: 8,
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 6,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  categoryInput: { flex: 1 },
  newPill: {
    backgroundColor: theme.colors.surfaceWarm,
    borderRadius: theme.radius.xs,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  newPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.textMuted,
    letterSpacing: 0.5,
  },
  fieldRow: { flexDirection: 'row', gap: 8 },
  unitInput: { flex: 1 },
  qtyInput: { width: 80 },

  hint: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2, marginBottom: 4 },
  hintWarn: { fontSize: 11, color: '#92590A', marginTop: 6 },
  hintError: { fontSize: 11, color: theme.colors.danger, marginTop: 6 },
  errorText: { fontSize: 11, color: theme.colors.danger, marginTop: 6 },
});
