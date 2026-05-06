import { supabase } from '@/lib/supabase';

export interface UserProfile {
  user_id: string;
  display_name: string | null;
  email: string | null;
  created_at: string;
  updated_at: string;
}

export async function getProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('user_id, display_name, email, created_at, updated_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as UserProfile | null;
}

export async function upsertMyProfile(params: {
  displayName?: string | null;
  email?: string | null;
}): Promise<UserProfile> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error('Not authenticated');
  const payload: Record<string, unknown> = { user_id: userId };
  if (params.displayName !== undefined) payload.display_name = params.displayName;
  if (params.email !== undefined) payload.email = params.email;
  const { data, error } = await supabase
    .from('user_profiles')
    .upsert(payload, { onConflict: 'user_id' })
    .select()
    .single();
  if (error) throw error;
  return data as UserProfile;
}

export async function listCompanyMemberProfiles(
  companyId: string,
): Promise<UserProfile[]> {
  const { data: members, error: membersError } = await supabase
    .from('company_members')
    .select('user_id')
    .eq('company_id', companyId);
  if (membersError) throw membersError;
  const userIds = (members ?? []).map((m) => m.user_id);
  if (userIds.length === 0) return [];

  const { data, error } = await supabase
    .from('user_profiles')
    .select('user_id, display_name, email, created_at, updated_at')
    .in('user_id', userIds);
  if (error) throw error;
  return (data ?? []) as UserProfile[];
}
