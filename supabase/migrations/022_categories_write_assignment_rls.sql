-- Migration 022: phase 8 of per-location RLS lockdown — categories INSERT.
--
-- Categories SELECT is already restricted to assigned-location rows
-- (migration 014). Products INSERT/UPDATE is assignment-scoped
-- (migration 020). The remaining write gap is category creation: until now
-- only the admin FOR ALL policy ("admins can manage categories", from the
-- base schema) governed inserts, so employees could not create categories
-- at all — which blocks the CSV/XLSX import flow when a new category name
-- appears in the file.
--
-- This migration introduces an assignment-scoped INSERT policy:
--   * admins may insert categories for any location in their company
--   * employees may insert categories only when
--     can_access_location(location_id) is true
--
-- UPDATE and DELETE are intentionally NOT TOUCHED. Renaming and deleting
-- categories remain admin-only via the existing "admins can manage
-- categories" FOR ALL policy. Loosening those is a separate decision.
--
-- Untouched in this migration:
--   * categories SELECT          — handled in 014
--   * categories UPDATE/DELETE   — admin-only via existing FOR ALL policy
--   * products / sessions / counts / locations — handled in 013–021
--
-- Prereqs:
--   * is_admin() and can_access_location(loc uuid)        — migration 010
--   * categories SELECT lockdown                          — migration 014

-- ── INSERT ────────────────────────────────────────────────────────────────
-- Drop any prior broad employee insert policy if it exists (defensive — the
-- base schema may or may not have shipped one).
drop policy if exists "employees can insert categories" on categories;
drop policy if exists "members can insert categories" on categories;

create policy "categories insert by role and assignment"
  on categories for insert
  with check (
    exists (
      select 1 from locations l
      where l.id = categories.location_id
        and (
          (is_admin() and l.company_id = user_company_id())
          or can_access_location(l.id)
        )
    )
  );

-- ── Rollback (paste into a new migration if needed) ───────────────────────
-- drop policy if exists "categories insert by role and assignment" on categories;
--
-- -- If you previously had a broad employee insert policy, recreate it here.
-- -- Example (company-wide, pre-assignment):
-- -- create policy "employees can insert categories"
-- --   on categories for insert
-- --   with check (
-- --     exists (
-- --       select 1 from locations l
-- --       where l.id = location_id
-- --         and l.company_id = user_company_id()
-- --     )
-- --   );
