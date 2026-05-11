import { supabase } from '@/lib/supabase';
import { normalizeCategoryName } from '@/lib/normalizeCategoryName';
import { getCategoriesWithProducts, CategoryWithProducts } from './categories';

export type ImportMode = 'add' | 'replace';

export interface ImportResult {
  categoriesCreated: number;
  productsCreated: number;
}

export interface SourceLocation {
  id: string;
  name: string;
  categoryCount: number;
  productCount: number;
}

export async function getSourceLocations(
  companyId: string,
  excludeLocationId: string,
): Promise<SourceLocation[]> {
  const { data, error } = await supabase
    .from('locations')
    .select('id, name, categories(id, products(id))')
    .eq('company_id', companyId)
    .neq('id', excludeLocationId)
    .order('name');

  if (error) throw error;

  return (data ?? []).map((loc: any) => {
    const cats: any[] = loc.categories ?? [];
    const productCount = cats.reduce((s: number, c: any) => s + (c.products?.length ?? 0), 0);
    return { id: loc.id as string, name: loc.name as string, categoryCount: cats.length, productCount };
  });
}

// Re-export so screens only need one import path for the full flow
export { getCategoriesWithProducts as getSourceData };

export async function importSetup({
  companyId,
  sourceLocationId,
  targetLocationId,
  selectedCategories,
  mode,
}: {
  companyId: string;
  sourceLocationId: string;
  targetLocationId: string;
  selectedCategories: CategoryWithProducts[];
  mode: ImportMode;
}): Promise<ImportResult> {
  // Defensive ownership checks: both locations must belong to companyId.
  // Guards against stale state / tampered params.
  const { data: srcLoc } = await supabase
    .from('locations')
    .select('id')
    .eq('id', sourceLocationId)
    .eq('company_id', companyId)
    .maybeSingle();
  if (!srcLoc) throw new Error('Source location does not belong to your company');

  const { data: tgtLoc } = await supabase
    .from('locations')
    .select('id')
    .eq('id', targetLocationId)
    .eq('company_id', companyId)
    .maybeSingle();
  if (!tgtLoc) throw new Error('Target location does not belong to your company');

  let categoriesCreated = 0;
  let productsCreated = 0;

  // Replace: wipe target first.
  if (mode === 'replace') {
    const { error } = await supabase
      .from('categories')
      .delete()
      .eq('location_id', targetLocationId);
    if (error) throw new Error(`Replace failed: ${error.message}`);
  }

  // Load existing target categories once (used for duplicate check in add mode).
  const existingCatByNorm = new Map<string, string>();
  if (mode === 'add') {
    const { data: existing } = await supabase
      .from('categories')
      .select('id, name')
      .eq('location_id', targetLocationId);
    (existing ?? []).forEach((c) => existingCatByNorm.set(normalizeCategoryName(c.name), c.id));
  }

  for (const sourceCat of selectedCategories) {
    let targetCatId: string;
    const sourceNorm = normalizeCategoryName(sourceCat.name);
    const existingId = mode === 'add' ? existingCatByNorm.get(sourceNorm) : undefined;

    if (existingId) {
      targetCatId = existingId;
    } else {
      const { data: newCat, error: catErr } = await supabase
        .from('categories')
        .insert({ location_id: targetLocationId, name: sourceCat.name })
        .select('id')
        .single();
      if (catErr || !newCat) {
        console.warn('[importSetup] category insert failed:', catErr?.message, sourceCat.name);
        continue;
      }
      targetCatId = newCat.id;
      categoriesCreated++;
    }

    if (sourceCat.products.length === 0) continue;

    const existingProductNames = new Set<string>();
    if (mode === 'add') {
      const { data: ep } = await supabase
        .from('products')
        .select('name')
        .eq('category_id', targetCatId);
      (ep ?? []).forEach((p) => existingProductNames.add(normalizeCategoryName(p.name)));
    }

    const newProducts = sourceCat.products
      .filter((p) => !existingProductNames.has(normalizeCategoryName(p.name)))
      .map((p) => ({
        category_id: targetCatId,
        name: p.name,
        unit: p.unit,
        last_known_quantity: null,
      }));

    if (newProducts.length === 0) continue;

    const { error: prodErr } = await supabase.from('products').insert(newProducts);
    if (prodErr) {
      console.warn('[importSetup] products insert failed:', prodErr.message, sourceCat.name);
      continue;
    }
    productsCreated += newProducts.length;
  }

  return { categoriesCreated, productsCreated };
}
