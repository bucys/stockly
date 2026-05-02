import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ModalSheet } from '@/components/ui/ModalSheet';
import { Button } from '@/components/ui/Button';
import { theme } from '@/constants/theme';
import type { CategoryWithProducts } from '@/services/categories';
import type { ParsedImportRow } from '@/lib/parseImportText';
import {
  matchImportRows,
  type DraftRow,
  type ImportPlan,
  type ImportWarning,
} from '@/lib/importMatchers';

export type { ImportPlan } from '@/lib/importMatchers';

interface ImportReviewSheetProps {
  visible: boolean;
  onClose: () => void;
  parsedRows: ParsedImportRow[];
  categories: CategoryWithProducts[];
  onConfirm: (plan: ImportPlan) => void;
}

interface DraftState extends DraftRow {
  excluded: boolean;
}

function rematchOne(row: DraftRow, categories: CategoryWithProducts[]): DraftRow {
  return matchImportRows([row], categories)[0];
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

export function ImportReviewSheet({
  visible,
  onClose,
  parsedRows,
  categories,
  onConfirm,
}: ImportReviewSheetProps) {
  const [drafts, setDrafts] = useState<DraftState[]>([]);
  const [applyQuantities, setApplyQuantities] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const matched = matchImportRows(parsedRows, categories);
    setDrafts(
      matched.map((row) => ({
        ...row,
        excluded:
          row.warnings.some((w) => w.kind === 'exact_duplicate') || row.errors.length > 0,
      })),
    );
    setApplyQuantities(false);
  }, [visible, parsedRows, categories]);

  const summary = useMemo(() => {
    const total = drafts.length;
    const included = drafts.filter((d) => !d.excluded && d.errors.length === 0).length;
    const excluded = total - included;
    return { total, included, excluded };
  }, [drafts]);

  function updateRow(index: number, patch: Partial<DraftRow>) {
    setDrafts((prev) => {
      const next = [...prev];
      const merged: DraftRow = { ...next[index], ...patch };
      const rematched = rematchOne(merged, categories);
      next[index] = { ...rematched, excluded: next[index].excluded };
      return next;
    });
  }

  function toggleExcluded(index: number) {
    setDrafts((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], excluded: !next[index].excluded };
      return next;
    });
  }

  function handleConfirm() {
    const rows: DraftRow[] = drafts
      .filter((d) => !d.excluded && d.errors.length === 0)
      .map(({ excluded: _excluded, ...rest }) => rest);
    onConfirm({ rows, applyQuantities });
  }

  return (
    <ModalSheet visible={visible} onClose={onClose} scrollable maxHeight="95%">
      <Text style={styles.title}>Review import</Text>
      <Text style={styles.summary}>
        {summary.total} rows · {summary.included} included · {summary.excluded} skipped
      </Text>

      <View style={styles.toggleRow}>
        <View style={styles.toggleLeft}>
          <Text style={styles.toggleLabel}>Update last known quantities from import</Text>
          <Text style={styles.toggleHint}>
            Off: quantities are imported as draft only. On: overwrite product last_known_quantity.
          </Text>
        </View>
        <Switch
          value={applyQuantities}
          onValueChange={setApplyQuantities}
          trackColor={{ false: theme.colors.borderLight, true: theme.colors.primary }}
        />
      </View>

      <View style={styles.list}>
        {drafts.map((row, index) => {
          const badge = primaryWarning(row.warnings, row.errors.length > 0);
          const isIncluded = !row.excluded && row.errors.length === 0;
          const hasErrors = row.errors.length > 0;

          return (
            <View
              key={`${row.lineNumber}-${index}`}
              style={[styles.card, !isIncluded && styles.cardExcluded]}
            >
              <View style={styles.cardHead}>
                <TouchableOpacity
                  style={[styles.checkbox, isIncluded && styles.checkboxOn]}
                  onPress={() => !hasErrors && toggleExcluded(index)}
                  disabled={hasErrors}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  {isIncluded && <Ionicons name="checkmark" size={14} color="#fff" />}
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

              <Text style={styles.fieldLabel}>Name</Text>
              <TextInput
                style={styles.input}
                value={row.name}
                onChangeText={(v) => updateRow(index, { name: v })}
                placeholder="Product name"
                placeholderTextColor={theme.colors.textPlaceholder}
              />

              <View style={styles.fieldRow}>
                <View style={styles.fieldGrow}>
                  <Text style={styles.fieldLabel}>Category</Text>
                  <TextInput
                    style={styles.input}
                    value={row.categoryName}
                    onChangeText={(v) => updateRow(index, { categoryName: v })}
                    placeholder="Category"
                    placeholderTextColor={theme.colors.textPlaceholder}
                  />
                  {row.matchedCategoryDisplayName &&
                  row.matchedCategoryDisplayName !== row.categoryName ? (
                    <Text style={styles.hint}>
                      Matches existing "{row.matchedCategoryDisplayName}"
                    </Text>
                  ) : row.matchedCategoryId == null && row.categoryName.trim() !== '' ? (
                    <Text style={styles.hint}>Will create new category</Text>
                  ) : null}
                </View>
              </View>

              <View style={styles.fieldRow}>
                <View style={styles.fieldUnit}>
                  <Text style={styles.fieldLabel}>Unit</Text>
                  <TextInput
                    style={styles.input}
                    value={row.unit}
                    onChangeText={(v) => updateRow(index, { unit: v })}
                    placeholder="unit"
                    placeholderTextColor={theme.colors.textPlaceholder}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
                <View style={styles.fieldQty}>
                  <Text style={styles.fieldLabel}>Qty</Text>
                  <TextInput
                    style={styles.input}
                    value={row.quantity == null ? '' : String(row.quantity)}
                    onChangeText={(v) => {
                      const trimmed = v.trim().replace(',', '.');
                      if (trimmed === '') {
                        updateRow(index, { quantity: null });
                        return;
                      }
                      const n = Number(trimmed);
                      updateRow(index, {
                        quantity: Number.isFinite(n) && n >= 0 ? n : row.quantity,
                      });
                    }}
                    placeholder="optional"
                    placeholderTextColor={theme.colors.textPlaceholder}
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>

              {hasErrors && (
                <Text style={styles.errorText}>
                  {row.errors.join(', ').replace(/_/g, ' ')}
                </Text>
              )}

              {row.warnings.map((w, i) =>
                w.kind === 'possible_duplicate' ? (
                  <Text key={i} style={styles.hintWarn}>
                    Similar to "{w.existingProductName}" in {w.existingCategoryName} ({w.existingUnit})
                  </Text>
                ) : (
                  <Text key={i} style={styles.hintError}>
                    Already exists: "{w.existingProductName}"
                  </Text>
                ),
              )}
            </View>
          );
        })}
      </View>

      <Button
        title={`Continue (${summary.included})`}
        onPress={handleConfirm}
        disabled={summary.included === 0}
      />
      <Button title="Cancel" onPress={onClose} variant="ghost" />
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 19, fontWeight: '700', color: theme.colors.text, marginBottom: 6 },
  summary: { fontSize: 13, color: theme.colors.textMuted, marginBottom: 16 },

  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.colors.surfaceWarm,
    borderRadius: theme.radius.md,
    padding: 14,
    marginBottom: 18,
  },
  toggleLeft: { flex: 1 },
  toggleLabel: { fontSize: 14, fontWeight: '600', color: theme.colors.text },
  toggleHint: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2, lineHeight: 16 },

  list: { gap: 12, marginBottom: 14 },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  cardExcluded: { opacity: 0.55 },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
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

  fieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.textMuted,
    marginBottom: 4,
    marginTop: 4,
    letterSpacing: 0.4,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 12,
    height: 40,
    fontSize: 14,
    color: theme.colors.text,
    backgroundColor: theme.colors.inputBg,
  },
  fieldRow: { flexDirection: 'row', gap: 10 },
  fieldGrow: { flex: 1 },
  fieldUnit: { flex: 1 },
  fieldQty: { width: 100 },

  hint: { fontSize: 11, color: theme.colors.textMuted, marginTop: 4 },
  hintWarn: { fontSize: 11, color: '#92590A', marginTop: 6 },
  hintError: { fontSize: 11, color: theme.colors.danger, marginTop: 6 },
  errorText: { fontSize: 11, color: theme.colors.danger, marginTop: 6 },
});
