// Supabase Edge Function: invite-employee
//
// Privileged invite step. This runs on Supabase's servers (NOT in the app), so
// it can safely hold SUPABASE_SERVICE_ROLE_KEY — which must never ship in the
// Expo bundle. It:
//   1. Authenticates the caller from their JWT.
//   2. Verifies the caller is an ADMIN of the company they're inviting into.
//   3. Creates/locates the invitee auth user and emails them an invite.
//   4. Records the pending invitation + pre-selected locations.
//
// The employee later signs in with an email OTP code and calls the
// accept_invitation() RPC (migration 027) to finalize membership + assignments.
//
// Deploy:
//   supabase functions deploy invite-employee
// Required secrets (SERVICE_ROLE is auto-injected on Supabase; set locally for
// `supabase functions serve`):
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

type InvitePayload = {
  email?: string;
  role?: 'employee' | 'admin';
  locationIds?: string[];
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return json({ error: 'server_misconfigured' }, 500);

  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'not_authenticated' }, 401);

  // Service-role client: used for privileged reads/writes after we authorize.
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Identify caller from their JWT.
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) return json({ error: 'not_authenticated' }, 401);
  const caller = userData.user;

  // 2. Authorize: caller must be an admin, and we invite into THEIR company.
  const { data: membership, error: memErr } = await admin
    .from('company_members')
    .select('company_id, role')
    .eq('user_id', caller.id)
    .maybeSingle();
  if (memErr) return json({ error: 'membership_lookup_failed' }, 500);
  if (!membership || membership.role !== 'admin') return json({ error: 'forbidden' }, 403);
  const companyId = membership.company_id;

  // 3. Validate input.
  let payload: InvitePayload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  const email = payload.email?.trim().toLowerCase();
  const role = payload.role === 'admin' ? 'admin' : 'employee';
  const locationIds = Array.isArray(payload.locationIds) ? [...new Set(payload.locationIds)] : [];

  if (!email || !EMAIL_RE.test(email)) return json({ error: 'invalid_email' }, 400);

  // Ensure every requested location belongs to the caller's company.
  if (locationIds.length > 0) {
    const { data: locs, error: locErr } = await admin
      .from('locations')
      .select('id')
      .eq('company_id', companyId)
      .in('id', locationIds);
    if (locErr) return json({ error: 'location_lookup_failed' }, 500);
    if (!locs || locs.length !== locationIds.length) {
      return json({ error: 'invalid_location' }, 400);
    }
  }

  // 4. Create or locate the invitee auth user + send the invite email.
  //    inviteUserByEmail both provisions the user and emails them. If they
  //    already exist, fall through — they can still accept via OTP.
  const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { invited_company_id: companyId },
  });
  if (inviteErr && !/already.*registered|already been registered|email.*exists/i.test(inviteErr.message)) {
    return json({ error: 'invite_email_failed', detail: inviteErr.message }, 502);
  }

  // 5. Record the pending invitation. The unique index is PARTIAL
  //    (status='pending', lower(email)), which ON CONFLICT can't target, so we
  //    explicitly refresh an existing pending invite or insert a new one.
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data: existing } = await admin
    .from('employee_invitations')
    .select('id')
    .eq('company_id', companyId)
    .eq('status', 'pending')
    .ilike('email', email)
    .maybeSingle();

  let invitationId: string;
  if (existing?.id) {
    const { error: updErr } = await admin
      .from('employee_invitations')
      .update({ role, invited_by: caller.id, expires_at: expiresAt })
      .eq('id', existing.id);
    if (updErr) return json({ error: 'invite_record_failed', detail: updErr.message }, 500);
    invitationId = existing.id;
  } else {
    const { data: inv, error: invInsertErr } = await admin
      .from('employee_invitations')
      .insert({
        company_id: companyId,
        email,
        role,
        status: 'pending',
        invited_by: caller.id,
        expires_at: expiresAt,
      })
      .select('id')
      .single();
    if (invInsertErr || !inv) {
      return json({ error: 'invite_record_failed', detail: invInsertErr?.message }, 500);
    }
    invitationId = inv.id;
  }

  // Reset + set the pre-selected locations.
  await admin.from('invitation_locations').delete().eq('invitation_id', invitationId);
  if (locationIds.length > 0) {
    const rows = locationIds.map((location_id) => ({ invitation_id: invitationId, location_id }));
    const { error: locInsErr } = await admin.from('invitation_locations').insert(rows);
    if (locInsErr) return json({ error: 'invite_locations_failed', detail: locInsErr.message }, 500);
  }

  return json({ ok: true, invitationId, email });
});
