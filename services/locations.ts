import { supabase } from '@/lib/supabase';

export interface Location {
  id: string;
  name: string;
  address: string | null;
}

export async function getLocations(companyId: string): Promise<Location[]> {
  console.log('[getLocations] fetching for company_id:', companyId);
  const { data, error } = await supabase
    .from('locations')
    .select('id, name, address')
    .eq('company_id', companyId)
    .order('name');
  if (error) {
    console.error('[getLocations] error:', error.message, 'code:', error.code, error);
    throw error;
  }
  console.log('[getLocations] result count:', data?.length ?? 0);
  return data as Location[];
}

export async function createLocation(
  companyId: string,
  name: string,
  address?: string,
): Promise<Location> {
  console.log('[createLocation] payload:', { company_id: companyId, name, address });
  const { data, error } = await supabase
    .from('locations')
    .insert({ company_id: companyId, name, address: address?.trim() || null })
    .select('id, name, address')
    .single();
  if (error) {
    console.error('[createLocation] error:', error.message, 'code:', error.code, 'hint:', error.hint, error);
    throw new Error(`Location creation failed: ${error.message} (code: ${error.code})`);
  }
  console.log('[createLocation] success, id:', data.id);
  return data as Location;
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
