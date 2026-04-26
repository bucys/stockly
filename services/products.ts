import { supabase } from '@/lib/supabase';

export async function createProduct(
  categoryId: string,
  name: string,
  unit: string,
  lastKnownQuantity?: number,
) {
  const { data, error } = await supabase
    .from('products')
    .insert({ category_id: categoryId, name, unit, last_known_quantity: lastKnownQuantity ?? null })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateProduct(
  id: string,
  name: string,
  unit: string,
  lastKnownQuantity?: number,
  categoryId?: string,
) {
  const payload: Record<string, unknown> = {
    name,
    unit,
    last_known_quantity: lastKnownQuantity ?? null,
  };
  if (categoryId !== undefined) payload.category_id = categoryId;
  const { error } = await supabase
    .from('products')
    .update(payload)
    .eq('id', id);
  if (error) throw error;
}

export async function deleteProduct(id: string) {
  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

export async function getLocationProductCount(locationId: string): Promise<number> {
  const { data, error } = await supabase
    .from('categories')
    .select('id, products(id)')
    .eq('location_id', locationId);
  if (error) throw error;
  return (data ?? []).reduce((s, c: any) => s + (c.products?.length ?? 0), 0);
}
