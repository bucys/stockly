import { supabase } from '@/lib/supabase';

export interface ProductRow {
  id: string;
  name: string;
  unit: string;
  last_known_quantity: number | null;
}

export interface CategoryWithProducts {
  id: string;
  name: string;
  products: ProductRow[];
}

export async function getCategoriesWithProducts(locationId: string): Promise<CategoryWithProducts[]> {
  const { data, error } = await supabase
    .from('categories')
    .select(`
      id,
      name,
      products (
        id,
        name,
        unit,
        last_known_quantity
      )
    `)
    .eq('location_id', locationId)
    .order('name');
  if (error) throw error;
  return (data ?? []) as CategoryWithProducts[];
}

export async function createCategory(locationId: string, name: string) {
  const { data, error } = await supabase
    .from('categories')
    .insert({ location_id: locationId, name })
    .select()
    .single();
  if (error) throw error;
  return data as { id: string; name: string };
}

export async function updateCategory(id: string, name: string) {
  const { error } = await supabase
    .from('categories')
    .update({ name })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteCategory(id: string) {
  const { error } = await supabase
    .from('categories')
    .delete()
    .eq('id', id);
  if (error) throw error;
}
