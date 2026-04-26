import { supabase } from '@/lib/supabase';
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
  const { data: { user } } = await supabase.auth.getUser();
  console.log('[getSourceLocations] user_id:', user?.id ?? 'null', 'company_id:', companyId);

  const { data, error } = await supabase
    .from('locations')
    .select('id, name, categories(id, products(id))')
    .eq('company_id', companyId)
    .neq('id', excludeLocationId)
    .order('name');

  if (error) {
    console.error('[getSourceLocations] error:', error.message, error);
    throw error;
  }

  return (data ?? []).map((loc: any) => {
    const cats: any[] = loc.categories ?? [];
    const productCount = cats.reduce((s: number, c: any) => s + (c.products?.length ?? 0), 0);
    console.log('[getSourceLocations] loc id:', loc.id, 'name:', loc.name, 'cats:', cats.length, 'products:', productCount);
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
  const { data: { user } } = await supabase.auth.getUser();
  console.log('[importSetup] user_id:', user?.id ?? 'null', 'company_id:', companyId);

  // ── Defensive ownership checks ────────────────────────────────────────────────
  // Both locations must belong to companyId. This guards against any case where
  // the caller passes a locationId from another company (e.g. stale state, tampered params).
  const { data: srcLoc, error: srcErr } = await supabase
    .from('locations')
    .select('id, company_id')
    .eq('id', sourceLocationId)
    .eq('company_id', companyId)
    .maybeSingle();

  if (srcErr || !srcLoc) {
    console.error(
      '[importSetup] SECURITY BLOCK: source location', sourceLocationId,
      'does not belong to company', companyId,
      '— user:', user?.id ?? 'null',
      '— db error:', srcErr?.message ?? 'no row returned',
    );
    throw new Error('Source location does not belong to your company');
  }

  const { data: tgtLoc, error: tgtErr } = await supabase
    .from('locations')
    .select('id, company_id')
    .eq('id', targetLocationId)
    .eq('company_id', companyId)
    .maybeSingle();

  if (tgtErr || !tgtLoc) {
    console.error(
      '[importSetup] SECURITY BLOCK: target location', targetLocationId,
      'does not belong to company', companyId,
      '— user:', user?.id ?? 'null',
      '— db error:', tgtErr?.message ?? 'no row returned',
    );
    throw new Error('Target location does not belong to your company');
  }

  console.log(
    '[importSetup] ownership verified — source:', sourceLocationId,
    'target:', targetLocationId,
    'mode:', mode,
    'categories:', selectedCategories.length,
    'products:', selectedCategories.reduce((s, c) => s + c.products.length, 0),
  );

  let categoriesCreated = 0;
  let productsCreated = 0;

  // ── Replace: wipe target first ──────────────────────────────────────────────
  if (mode === 'replace') {
    console.log('[importSetup] replace — deleting existing categories (products cascade)');
    const { error } = await supabase
      .from('categories')
      .delete()
      .eq('location_id', targetLocationId);
    if (error) {
      console.error('[importSetup] delete error:', error.message, error);
      throw new Error(`Replace failed: ${error.message}`);
    }
    console.log('[importSetup] existing data cleared');
  }

  // ── Load existing target categories once (used for duplicate check in add mode) ──
  const existingCatNames = new Set<string>();
  if (mode === 'add') {
    const { data: existing } = await supabase
      .from('categories')
      .select('name')
      .eq('location_id', targetLocationId);
    (existing ?? []).forEach((c) => existingCatNames.add(c.name.toLowerCase()));
    console.log('[importSetup] existing category names in target:', existingCatNames.size);
  }

  // ── Process each selected category ──────────────────────────────────────────
  for (const sourceCat of selectedCategories) {
    let targetCatId: string;

    if (mode === 'add' && existingCatNames.has(sourceCat.name.toLowerCase())) {
      // Reuse existing category — fetch its id
      const { data: existing } = await supabase
        .from('categories')
        .select('id')
        .eq('location_id', targetLocationId)
        .ilike('name', sourceCat.name)
        .single();
      if (!existing) {
        console.warn('[importSetup] could not resolve existing category:', sourceCat.name);
        continue;
      }
      console.log('[importSetup] category already exists, merging into:', sourceCat.name);
      targetCatId = existing.id;
    } else {
      const { data: newCat, error: catErr } = await supabase
        .from('categories')
        .insert({ location_id: targetLocationId, name: sourceCat.name })
        .select('id')
        .single();
      if (catErr || !newCat) {
        console.error('[importSetup] category insert error:', catErr?.message, sourceCat.name);
        continue;
      }
      targetCatId = newCat.id;
      categoriesCreated++;
      console.log('[importSetup] created category:', sourceCat.name);
    }

    if (sourceCat.products.length === 0) continue;

    // Duplicate product check within this category
    const existingProductNames = new Set<string>();
    if (mode === 'add') {
      const { data: ep } = await supabase
        .from('products')
        .select('name')
        .eq('category_id', targetCatId);
      (ep ?? []).forEach((p) => existingProductNames.add(p.name.toLowerCase()));
    }

    const newProducts = sourceCat.products
      .filter((p) => !existingProductNames.has(p.name.toLowerCase()))
      .map((p) => ({
        category_id: targetCatId,
        name: p.name,
        unit: p.unit,
        last_known_quantity: null,
      }));

    if (newProducts.length === 0) {
      console.log('[importSetup] all products in category already exist:', sourceCat.name);
      continue;
    }

    const { error: prodErr } = await supabase.from('products').insert(newProducts);
    if (prodErr) {
      console.error('[importSetup] products batch insert error:', prodErr.message, 'category:', sourceCat.name);
      continue;
    }
    productsCreated += newProducts.length;
    console.log('[importSetup] inserted', newProducts.length, 'products into:', sourceCat.name);
  }

  console.log('[importSetup] done — categories created:', categoriesCreated, 'products created:', productsCreated);
  return { categoriesCreated, productsCreated };
}
