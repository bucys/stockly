-- Migration 017: allow any company member (not just admins) to read profile
-- rows for other members of the same company.
--
-- Why: the Sessions screen shows "Last edited by:" attribution. Employees
-- need to be able to resolve another company member's display_name/email
-- (e.g. another employee assigned to the same location), otherwise the UI
-- always falls back to "Team member" for them.
--
-- Scope: SELECT only. Update/insert remain owner-only — a member still
-- cannot modify another member's profile. Profiles outside the caller's
-- company are not exposed.
--
-- This migration does not touch any existing policy; it just adds a new
-- permissive SELECT policy on user_profiles. Postgres RLS combines SELECT
-- policies with OR, so the existing owner / admin policies still apply.

create policy "company members can read each other profiles"
  on user_profiles for select
  using (
    exists (
      select 1 from company_members caller
      join company_members target
        on target.company_id = caller.company_id
      where caller.user_id  = auth.uid()
        and target.user_id  = user_profiles.user_id
    )
  );

-- ── Rollback ──────────────────────────────────────────────────────────────
-- drop policy if exists "company members can read each other profiles" on user_profiles;
