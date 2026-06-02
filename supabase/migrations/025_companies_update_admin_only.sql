-- Migration 025: restrict company UPDATE to admins.
--
-- Problem
-- -------
-- The original schema policy allowed ANY member to update their company row:
--
--   create policy "members can update own company"
--     on companies for update
--     using (id = user_company_id());
--
-- That has no role check and no WITH CHECK, so an *employee* could rename the
-- company and — because join_code lives on companies — rotate the join code.
-- Every other management policy in the schema gates on admin role; this one
-- was the outlier.
--
-- Fix
-- ---
-- Require is_admin() (migration 010, security definer) in both USING and
-- WITH CHECK. USING gates which existing rows may be updated; WITH CHECK
-- prevents repointing the row to another company id.
--
-- Safety
-- ------
-- The application never UPDATEs the companies table (it only SELECTs join_code
-- and INSERTs on signup), so no working flow depends on employee write access
-- here. This migration only narrows the existing UPDATE policy; it does not
-- touch SELECT/INSERT or any other table.
--
-- Prereqs:
--   * is_admin()        — migration 010
--   * user_company_id() — migration 003

drop policy if exists "members can update own company" on companies;

create policy "admins can update own company"
  on companies for update
  using (id = user_company_id() and is_admin())
  with check (id = user_company_id() and is_admin());

-- ── Rollback (paste into a new migration if needed) ───────────────────────
-- drop policy if exists "admins can update own company" on companies;
-- create policy "members can update own company"
--   on companies for update
--   using (id = user_company_id());
