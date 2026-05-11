import { supabase } from '@/lib/supabase';

export interface Location {
  id: string;
  name: string;
  address: string | null;
  productCount: number;
  lastCompletedSessionAt: Date | null;
}

export async function getLocations(companyId: string): Promise<Location[]> {
  const { data, error } = await supabase
    .from('locations')
    .select('id, name, address')
    .eq('company_id', companyId)
    .order('name');
  if (error) throw error;
  const base = (data ?? []) as Array<{ id: string; name: string; address: string | null }>;
  if (base.length === 0) return [];

  const locationIds = base.map((l) => l.id);

  const [productCounts, lastSessions] = await Promise.all([
    fetchProductCounts(locationIds),
    fetchLastCompletedSessions(locationIds),
  ]);

  const result: Location[] = base.map((l) => ({
    id: l.id,
    name: l.name,
    address: l.address,
    productCount: productCounts.get(l.id) ?? 0,
    lastCompletedSessionAt: lastSessions.get(l.id) ?? null,
  }));
  return result;
}

async function fetchProductCounts(locationIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const { data, error } = await supabase
    .from('categories')
    .select('location_id, products(count)')
    .in('location_id', locationIds);
  if (error) return counts;
  type Row = { location_id: string; products: Array<{ count: number }> | null };
  for (const row of (data ?? []) as Row[]) {
    const n = row.products?.[0]?.count ?? 0;
    counts.set(row.location_id, (counts.get(row.location_id) ?? 0) + n);
  }
  return counts;
}

async function fetchLastCompletedSessions(locationIds: string[]): Promise<Map<string, Date>> {
  const last = new Map<string, Date>();
  const { data, error } = await supabase
    .from('inventory_sessions')
    .select('location_id, created_at')
    .in('location_id', locationIds)
    .eq('status', 'completed')
    .order('created_at', { ascending: false });
  if (error) return last;
  type Row = { location_id: string; created_at: string };
  for (const row of (data ?? []) as Row[]) {
    if (!last.has(row.location_id)) {
      last.set(row.location_id, new Date(row.created_at));
    }
  }
  return last;
}

export async function createLocation(
  companyId: string,
  name: string,
  address?: string,
): Promise<{ id: string; name: string; address: string | null }> {
  const { data, error } = await supabase
    .from('locations')
    .insert({ company_id: companyId, name, address: address?.trim() || null })
    .select('id, name, address')
    .single();
  if (error) {
    throw new Error(`Location creation failed: ${error.message} (code: ${error.code})`);
  }
  return data;
}

export async function updateLocation(
  id: string,
  name: string,
  address?: string,
): Promise<void> {
  const { error } = await supabase
    .from('locations')
    .update({ name, address: address?.trim() || null })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteLocation(id: string): Promise<void> {
  const { error } = await supabase
    .from('locations')
    .delete()
    .eq('id', id);
  if (error) throw error;
}
