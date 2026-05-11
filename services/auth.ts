import { supabase } from '@/lib/supabase';

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signUp(
  email: string,
  password: string,
  companyName: string,
  displayName?: string,
) {
  console.log('[signUp] starting for:', email);

  const trimmedName = displayName?.trim() || undefined;
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: trimmedName ? { data: { display_name: trimmedName } } : undefined,
  });
  if (error) {
    console.error('[signUp] auth error:', error.message, 'status:', (error as { status?: number }).status, error);
    throw error;
  }

  console.log('[signUp] auth ok — user:', data.user?.id ?? 'null', 'session:', data.session ? 'present' : 'null');

  if (!data.user) {
    throw new Error('Sign up succeeded but no user was returned. Email confirmation may be required — confirm your email first, then sign in.');
  }

  // Idempotency check: if this user already has a membership (e.g. from a previous
  // partial registration), skip company creation to avoid duplicate rows.
  const { data: existingMember } = await supabase
    .from('company_members')
    .select('company_id')
    .eq('user_id', data.user.id)
    .limit(1)
    .maybeSingle();

  if (existingMember?.company_id) {
    console.log('[signUp] membership already exists for user:', data.user.id, '— skipping company creation');
    return data;
  }

  const { data: company, error: companyError } = await supabase
    .from('companies')
    .insert({ name: companyName })
    .select()
    .single();
  if (companyError) {
    console.error('[signUp] companies insert failed:', companyError.message, 'code:', companyError.code, 'hint:', companyError.hint, companyError);
    throw new Error(`Company creation failed: ${companyError.message} (code: ${companyError.code})`);
  }

  console.log('[signUp] company created:', company.id);

  const { error: memberError } = await supabase
    .from('company_members')
    .insert({ user_id: data.user.id, company_id: company.id, role: 'admin' });
  if (memberError) {
    console.error('[signUp] company_members insert failed:', memberError.message, 'code:', memberError.code, 'hint:', memberError.hint, memberError);
    throw new Error(`Member setup failed: ${memberError.message} (code: ${memberError.code})`);
  }

  // Best-effort write of display_name into user_profiles. Only works if the
  // session is active right now (e.g. email confirmation disabled). When email
  // confirmation is on, the Profile sync effect later picks up the metadata
  // value on first login.
  if (trimmedName && data.session) {
    try {
      await supabase
        .from('user_profiles')
        .upsert(
          { user_id: data.user.id, display_name: trimmedName, email: data.user.email ?? null },
          { onConflict: 'user_id' },
        );
    } catch (e) {
      console.warn('[signUp] user_profiles upsert skipped:', (e as Error).message);
    }
  }

  console.log('[signUp] done — member created');
  return data;
}

export async function signOut() {
  console.log('[signOut] starting');
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error('[signOut] error:', error.message, error);
    throw error;
  }
  console.log('[signOut] success');
}

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function joinCompany(
  email: string,
  password: string,
  joinCode: string,
  displayName?: string,
) {
  console.log('[joinCompany] starting for:', email);

  const trimmedName = displayName?.trim() || undefined;
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: trimmedName ? { data: { display_name: trimmedName } } : undefined,
  });
  if (error) {
    console.error('[joinCompany] auth.signUp error:', error.message, error);
    throw error;
  }

  if (!data.user) {
    throw new Error(
      'Account created — please confirm your email then sign in to complete joining.',
    );
  }

  console.log('[joinCompany] user created:', data.user.id);

  // Idempotency: if a membership already exists (e.g. previous partial join),
  // skip the RPC and proceed — the app will load their existing company.
  const { data: existing } = await supabase
    .from('company_members')
    .select('company_id')
    .eq('user_id', data.user.id)
    .maybeSingle();

  if (existing?.company_id) {
    console.log('[joinCompany] membership already exists:', existing.company_id);
    return data;
  }

  const { data: result, error: rpcError } = await supabase.rpc('join_company_by_code', {
    p_join_code: joinCode.trim().toUpperCase(),
  });

  if (rpcError) {
    console.error('[joinCompany] rpc error:', rpcError.message, rpcError);
    throw new Error(`Join failed: ${rpcError.message}`);
  }

  const res = result as { error?: string; company_id?: string };
  console.log('[joinCompany] rpc result:', JSON.stringify(res));

  if (res.error === 'not_authenticated') {
    throw new Error('Authentication error. Please confirm your email then sign in.');
  }
  if (res.error === 'invalid_code') {
    throw new Error('Invalid join code. Ask your admin for the correct code.');
  }
  if (res.error === 'already_member') {
    console.log('[joinCompany] already_member — proceeding');
    return data;
  }
  if (res.error) {
    throw new Error(`Join failed: ${res.error}`);
  }

  if (trimmedName && data.session) {
    try {
      await supabase
        .from('user_profiles')
        .upsert(
          { user_id: data.user.id, display_name: trimmedName, email: data.user.email ?? null },
          { onConflict: 'user_id' },
        );
    } catch (e) {
      console.warn('[joinCompany] user_profiles upsert skipped:', (e as Error).message);
    }
  }

  console.log('[joinCompany] joined company:', res.company_id);
  return data;
}
