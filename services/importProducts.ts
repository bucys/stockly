import { createCategory } from './categories';
import { createProduct } from './products';
import { normalizeCategoryName } from '@/lib/normalizeCategoryName';
import type { DraftRow, ImportPlan } from '@/lib/importMatchers';

export interface ImportFailure {
  row: DraftRow;
  error: string;
}

export interface ImportProductsResult {
  categoriesCreated: number;
  productsCreated: number;
  skipped: number;
  failed: ImportFailure[];
}

interface CategoryGroup {
  normalized: string;
  displayName: string;
  matchedCategoryId: string | null;
  rows: DraftRow[];
}

function groupByCategory(rows: DraftRow[]): CategoryGroup[] {
  const map = new Map<string, CategoryGroup>();
  for (const row of rows) {
    const norm = normalizeCategoryName(row.categoryName);
    if (norm === '') continue;
    const existing = map.get(norm);
    if (existing) {
      existing.rows.push(row);
      if (!existing.matchedCategoryId && row.matchedCategoryId) {
        existing.matchedCategoryId = row.matchedCategoryId;
      }
      continue;
    }
    map.set(norm, {
      normalized: norm,
      displayName: row.matchedCategoryDisplayName ?? row.categoryName.trim(),
      matchedCategoryId: row.matchedCategoryId,
      rows: [row],
    });
  }
  return Array.from(map.values());
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return 'Unknown error';
}

export async function commitImportPlan(
  plan: ImportPlan,
  locationId: string,
): Promise<ImportProductsResult> {
  let categoriesCreated = 0;
  let productsCreated = 0;
  let skipped = 0;
  const failed: ImportFailure[] = [];

  const usable: DraftRow[] = [];
  for (const row of plan.rows) {
    const hasParserErrors = row.errors.length > 0;
    const missingCategory = normalizeCategoryName(row.categoryName) === '';
    const missingName = row.name.trim() === '';
    const missingUnit = row.unit.trim() === '';
    if (hasParserErrors || missingCategory || missingName || missingUnit) {
      skipped++;
      continue;
    }
    usable.push(row);
  }

  const groups = groupByCategory(usable);

  for (const group of groups) {
    let categoryId = group.matchedCategoryId;

    if (!categoryId) {
      try {
        const created = await createCategory(locationId, group.displayName);
        categoryId = created.id;
        categoriesCreated++;
      } catch (err) {
        for (const row of group.rows) {
          failed.push({ row, error: `Category create failed: ${errorMessage(err)}` });
        }
        continue;
      }
    }

    const results = await Promise.allSettled(
      group.rows.map(async (row) => {
        const lastQty =
          plan.applyQuantities && row.quantity != null && Number.isFinite(row.quantity)
            ? row.quantity
            : undefined;
        await createProduct(categoryId as string, row.name.trim(), row.unit.trim(), lastQty);
      }),
    );

    results.forEach((res, i) => {
      if (res.status === 'fulfilled') {
        productsCreated++;
      } else {
        failed.push({ row: group.rows[i], error: errorMessage(res.reason) });
      }
    });
  }

  return { categoriesCreated, productsCreated, skipped, failed };
}
