-- Migration 012: tighten + simplify the admin SELECT policy on user_profiles.
--
-- The policy from migration 011 used two EXISTS subqueries against
-- company_members. Both subqueries are themselves subject to RLS on
-- company_members, which can lead to surprising visibility (e.g. the admin
-- self-lookup not resolving in some sessions). We replace it with a single
-- predicate that uses the security-definer helper is_admin() and an explicit
-- same-company check via user_company_id() (also security definer).
--
-- This migration only changes user_profiles RLS. It does not touch any
-- enforcement on locations / categories / products / sessions / counts.

drop policy if exists "admins can read company member profiles" on user_profiles;

create policy "admins can read company member profiles"
  on user_profiles for select
  using (
    is_admin()
    and exists (
      select 1
      from company_members target
      where target.user_id = user_profiles.user_id
        and target.company_id = user_company_id()
    )
  );

-- Re-run the backfill from auth.users in case the original backfill in
-- migration 011 was no-op in this environment. Safe to re-run thanks to
-- on conflict.
insert into user_profiles (user_id, email)
select id, email
from auth.users
on conflict (user_id) do update
  set email = coalesce(excluded.email, user_profiles.email),
      updated_at = now();
