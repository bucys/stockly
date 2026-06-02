import { supabase } from '@/lib/supabase';

export interface CompanyInvitation {
  id: string;
  company_id: string;
  email: string;
  role: 'employee' | 'admin';
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  created_at: string;
  expires_at: string | null;
}

// Map Edge Function / RPC error codes to user-facing copy.
function mapInviteError(code: string): string {
  switch (code) {
    case 'forbidden':
      return 'Only admins can invite employees.';
    case 'invalid_email':
      return 'Please enter a valid email address.';
    case 'invalid_location':
      return 'One of the selected locations is invalid.';
    case 'not_authenticated':
      return 'Your session expired. Please sign in again.';
    case 'invite_email_failed':
      return 'Could not send the invitation email. Try again.';
    default:
      return 'Could not send the invitation. Please try again.';
  }
}

// ── Admin: send / list / revoke invitations ────────────────────────────────

export async function inviteEmployee(params: {
  email: string;
  role?: 'employee' | 'admin';
  locationIds: string[];
}): Promise<{ invitationId: string }> {
  const { data, error } = await supabase.functions.invoke('invite-employee', {
    body: {
      email: params.email.trim().toLowerCase(),
      role: params.role ?? 'employee',
      locationIds: params.locationIds,
    },
  });

  if (error) {
    // Non-2xx responses arrive as FunctionsHttpError; the body is on context.
    let detail = error.message;
    try {
      const body = await (error as { context?: Response }).context?.json?.();
      if (body?.error) detail = mapInviteError(body.error);
    } catch {
      /* fall back to error.message */
    }
    throw new Error(detail);
  }

  if (data?.error) throw new Error(mapInviteError(data.error));
  return { invitationId: data.invitationId };
}

export async function listCompanyInvitations(
  companyId: string,
): Promise<CompanyInvitation[]> {
  const { data, error } = await supabase
    .from('employee_invitations')
    .select('id, company_id, email, role, status, created_at, expires_at')
    .eq('company_id', companyId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as CompanyInvitation[];
}

export async function revokeInvitation(id: string): Promise<void> {
  const { error } = await supabase
    .from('employee_invitations')
    .update({ status: 'revoked' })
    .eq('id', id);
  if (error) throw error;
}

// ── Employee: OTP sign-in + accept ─────────────────────────────────────────

export async function sendInviteOtp(email: string): Promise<void> {
  // The Edge Function already provisioned the user, so don't create a new one.
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: { shouldCreateUser: false },
  });
  if (error) throw error;
}

export async function verifyInviteOtp(email: string, token: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: token.trim(),
    type: 'email',
  });
  if (error) throw error;
}

export type AcceptResult =
  | { ok: true; companyId: string }
  | { ok: false; reason: 'no_invite' | 'already_member' | 'other' };

export async function acceptInvitation(): Promise<AcceptResult> {
  const { data, error } = await supabase.rpc('accept_invitation');
  if (error) throw error;
  const res = (data ?? {}) as { error?: string; company_id?: string };
  if (res.company_id) return { ok: true, companyId: res.company_id };
  if (res.error === 'already_member') return { ok: false, reason: 'already_member' };
  if (res.error === 'no_invite') return { ok: false, reason: 'no_invite' };
  return { ok: false, reason: 'other' };
}

export async function setPasswordAndName(
  password: string,
  displayName: string,
): Promise<void> {
  const trimmed = displayName.trim() || undefined;
  const { data, error } = await supabase.auth.updateUser({
    password,
    data: trimmed ? { display_name: trimmed } : undefined,
  });
  if (error) throw error;

  // Best-effort mirror into user_profiles (owner-writable per migration 011).
  const user = data.user;
  if (user) {
    try {
      await supabase.from('user_profiles').upsert(
        { user_id: user.id, display_name: trimmed ?? null, email: user.email ?? null },
        { onConflict: 'user_id' },
      );
    } catch {
      /* non-fatal */
    }
  }
}
