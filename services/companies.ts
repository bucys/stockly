import { supabase } from '@/lib/supabase';

export async function getCompanyJoinCode(companyId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('companies')
    .select('join_code')
    .eq('id', companyId)
    .single();
  if (error) {
    console.error('[getCompanyJoinCode] error:', error.message);
    return null;
  }
  return (data as any)?.join_code ?? null;
}
