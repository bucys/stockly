-- Migration 027: employee invitations (email + OTP onboarding).
--
-- Flow this supports:
--   1. An admin invites an employee by email and pre-selects locations. The
--      privileged create-user + email step runs in a Supabase Edge Function
--      (service_role), which inserts the invitation rows here.
--   2. The employee signs in with an email OTP code, then calls
--      accept_invitation(), which atomically creates their company membership
--      and the pre-selected location assignments and marks the invite accepted.
--
-- This is ADDITIVE: the existing join-code flow (migration 006) and password
-- registration/login are untouched and keep working alongside invitations.
--
-- Prereqs:
--   * is_admin(), user_company_id()                — migrations 003/010
--   * company_members unique(user_id)              — migration 002
--   * employee_location_assignments                — migration 009

-- ── Tables ────────────────────────────────────────────────────────────────
create table if not exists employee_invitations (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references companies(id) on delete cascade,
  email            text not null,
  role             text not null default 'employee' check (role in ('employee', 'admin')),
  status           text not null default 'pending'
                   check (status in ('pending', 'accepted', 'revoked', 'expired')),
  invited_by       uuid references auth.users(id),
  accepted_user_id uuid references auth.users(id),
  accepted_at      timestamptz,
  expires_at       timestamptz not null default (now() + interval '14 days'),
  created_at       timestamptz not null default now()
);

-- At most one pending invite per (company, email). Email compared case-insensitively.
create unique index if not exists uq_invitations_pending_company_email
  on employee_invitations (company_id, lower(email))
  where status = 'pending';

create index if not exists idx_invitations_email   on employee_invitations (lower(email));
create index if not exists idx_invitations_company on employee_invitations (company_id);

-- Locations to assign on accept (FK integrity vs. a uuid[] column).
create table if not exists invitation_locations (
  invitation_id uuid not null references employee_invitations(id) on delete cascade,
  location_id   uuid not null references locations(id) on delete cascade,
  primary key (invitation_id, location_id)
);

-- ── RLS ───────────────────────────────────────────────────────────────────
alter table employee_invitations enable row level security;
alter table invitation_locations enable row level security;

-- Admins fully manage invitations within their own company. (The Edge Function
-- uses service_role and bypasses RLS; this policy is for the admin UI reading /
-- revoking invites from the client.)
create policy "admins manage company invitations"
  on employee_invitations for all
  using (is_admin() and company_id = user_company_id())
  with check (is_admin() and company_id = user_company_id());

create policy "admins manage invitation_locations"
  on invitation_locations for all
  using (
    exists (
      select 1 from employee_invitations i
      where i.id = invitation_locations.invitation_id
        and is_admin() and i.company_id = user_company_id()
    )
  )
  with check (
    exists (
      select 1 from employee_invitations i
      where i.id = invitation_locations.invitation_id
        and is_admin() and i.company_id = user_company_id()
    )
  );

-- ── accept_invitation() ───────────────────────────────────────────────────
-- Called by a freshly OTP-authenticated invitee. Security definer so it can
-- write company_members / assignments (which the invitee cannot do directly).
-- Matches the pending invite by the caller's verified JWT email.
--
-- Returns JSON: { company_id } on success, { error } otherwise.
-- Errors: not_authenticated | no_email | already_member | no_invite
create or replace function accept_invitation()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_email   text := lower(auth.jwt() ->> 'email');
  v_inv     employee_invitations%rowtype;
begin
  if v_user_id is null then
    return json_build_object('error', 'not_authenticated');
  end if;
  if v_email is null or v_email = '' then
    return json_build_object('error', 'no_email');
  end if;

  -- One company per user (migration 002). If already a member, do nothing.
  if exists (select 1 from company_members where user_id = v_user_id) then
    return json_build_object('error', 'already_member');
  end if;

  select * into v_inv
  from employee_invitations
  where status = 'pending'
    and lower(email) = v_email
    and (expires_at is null or expires_at > now())
  order by created_at desc
  limit 1;

  if v_inv.id is null then
    return json_build_object('error', 'no_invite');
  end if;

  insert into company_members (user_id, company_id, role)
  values (v_user_id, v_inv.company_id, v_inv.role)
  on conflict (user_id) do nothing;

  insert into employee_location_assignments (company_id, user_id, location_id, created_by)
  select v_inv.company_id, v_user_id, il.location_id, v_inv.invited_by
  from invitation_locations il
  where il.invitation_id = v_inv.id
  on conflict (user_id, location_id) do nothing;

  update employee_invitations
    set status = 'accepted', accepted_user_id = v_user_id, accepted_at = now()
  where id = v_inv.id;

  return json_build_object('company_id', v_inv.company_id);
end;
$$;

revoke all on function accept_invitation() from public;
grant execute on function accept_invitation() to authenticated;

-- ── Rollback (paste into a new migration if needed) ───────────────────────
-- drop function if exists accept_invitation();
-- drop policy if exists "admins manage invitation_locations" on invitation_locations;
-- drop policy if exists "admins manage company invitations"  on employee_invitations;
-- drop table if exists invitation_locations;
-- drop table if exists employee_invitations;
