import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ModalSheet } from '@/components/ui/ModalSheet';
import { Button } from '@/components/ui/Button';
import { theme } from '@/constants/theme';
import type { CategoryWithProducts } from '@/services/categories';
import type { ParsedImportRow } from '@/lib/parseImportText';
import {
  matchImportRows,
  type DraftRow,
  type ImportPlan,
} from '@/lib/importMatchers';
import { ImportQuantityToggle } from './ImportQuantityToggle';
import { ImportReviewRow } from './ImportReviewRow';

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
        {summary.included} {summary.included === 1 ? 'product' : 'products'} ready to import
      </Text>
      {summary.excluded > 0 && (
        <Text style={styles.summarySub}>{summary.excluded} skipped</Text>
      )}

      <ImportQuantityToggle enabled={applyQuantities} onToggle={setApplyQuantities} />

      <View style={styles.list}>
        {drafts.map((row, index) => {
          const hasErrors = row.errors.length > 0;
          const isIncluded = !row.excluded && !hasErrors;
          return (
            <ImportReviewRow
              key={`${row.lineNumber}-${index}`}
              row={row}
              included={isIncluded}
              hasErrors={hasErrors}
              onToggleInclude={() => toggleExcluded(index)}
              onPatch={(patch) => updateRow(index, patch)}
            />
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
  title: { fontSize: 19, fontWeight: '700', color: theme.colors.text, marginBottom: 4 },
  summary: { fontSize: 14, fontWeight: '600', color: theme.colors.text },
  summarySub: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2, marginBottom: 4 },
  list: { gap: 8, marginBottom: 12 },
});
