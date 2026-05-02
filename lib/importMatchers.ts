import type { CategoryWithProducts } from '@/services/categories';
import { normalizeCategoryName } from './normalizeCategoryName';
import { normalizeProductName } from './normalizeProductName';
import type { ParsedImportRow } from './parseImportText';

export type ImportWarning =
  | {
      kind: 'exact_duplicate';
      existingProductId: string;
      existingProductName: string;
    }
  | {
      kind: 'possible_duplicate';
      existingProductId: string;
      existingProductName: string;
      existingCategoryId: string;
      existingCategoryName: string;
      existingUnit: string;
    };

export interface DraftRow extends ParsedImportRow {
  matchedCategoryId: string | null;
  matchedCategoryDisplayName: string | null;
  matchedProductId: string | null;
  possibleDuplicateOf: string | null;
  warnings: ImportWarning[];
}

export interface ImportPlan {
  rows: DraftRow[];
  applyQuantities: boolean;
}

interface ProductLookup {
  id: string;
  name: string;
  unit: string;
  categoryId: string;
  categoryName: string;
}

export function matchImportRows(
  parsed: ParsedImportRow[],
  categories: CategoryWithProducts[],
): DraftRow[] {
  const catByNorm = new Map<string, { id: string; name: string }>();
  for (const cat of categories) {
    catByNorm.set(normalizeCategoryName(cat.name), { id: cat.id, name: cat.name });
  }

  const productsByNorm = new Map<string, ProductLookup[]>();
  for (const cat of categories) {
    for (const p of cat.products) {
      const norm = normalizeProductName(p.name);
      if (norm === '') continue;
      const arr = productsByNorm.get(norm) ?? [];
      arr.push({
        id: p.id,
        name: p.name,
        unit: p.unit,
        categoryId: cat.id,
        categoryName: cat.name,
      });
      productsByNorm.set(norm, arr);
    }
  }

  return parsed.map((row) => {
    const catNorm = normalizeCategoryName(row.categoryName);
    const matchedCat = catNorm === '' ? null : catByNorm.get(catNorm) ?? null;

    const nameNorm = normalizeProductName(row.name);
    const candidates = nameNorm === '' ? [] : productsByNorm.get(nameNorm) ?? [];

    const warnings: ImportWarning[] = [];
    let matchedProductId: string | null = null;
    let possibleDuplicateOf: string | null = null;

    if (candidates.length > 0) {
      const exact = matchedCat
        ? candidates.find((c) => c.categoryId === matchedCat.id && c.unit === row.unit)
        : undefined;

      if (exact) {
        matchedProductId = exact.id;
        warnings.push({
          kind: 'exact_duplicate',
          existingProductId: exact.id,
          existingProductName: exact.name,
        });
      } else {
        const candidate = candidates[0];
        possibleDuplicateOf = candidate.id;
        warnings.push({
          kind: 'possible_duplicate',
          existingProductId: candidate.id,
          existingProductName: candidate.name,
          existingCategoryId: candidate.categoryId,
          existingCategoryName: candidate.categoryName,
          existingUnit: candidate.unit,
        });
      }
    }

    return {
      ...row,
      matchedCategoryId: matchedCat?.id ?? null,
      matchedCategoryDisplayName: matchedCat?.name ?? null,
      matchedProductId,
      possibleDuplicateOf,
      warnings,
    };
  });
}
