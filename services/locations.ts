import { supabase } from '@/lib/supabase';

export async function getLocations(companyId: string) {
  console.log('[getLocations] fetching for company_id:', companyId);
  const { data, error } = await supabase
    .from('locations')
    .select('id, name')
    .eq('company_id', companyId)
    .order('name');
  if (error) {
    console.error('[getLocations] error:', error.message, 'code:', error.code, error);
    throw error;
  }
  console.log('[getLocations] result count:', data?.length ?? 0);
  return data as { id: string; name: string }[];
}

export async function createLocation(companyId: string, name: string) {
  console.log('[createLocation] payload:', { company_id: companyId, name });
  const { data, error } = await supabase
    .from('locations')
    .insert({ company_id: companyId, name })
    .select()
    .single();
  if (error) {
    console.error('[createLocation] error:', error.message, 'code:', error.code, 'hint:', error.hint, error);
    throw new Error(`Location creation failed: ${error.message} (code: ${error.code})`);
  }
  console.log('[createLocation] success, id:', data.id);
  return data as { id: string; name: string };
}

export async function updateLocation(id: string, name: string) {
  const { error } = await supabase
    .from('locations')
    .update({ name })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteLocation(id: string) {
  const { error } = await supabase
    .from('locations')
    .delete()
    .eq('id', id);
  if (error) throw error;
}
