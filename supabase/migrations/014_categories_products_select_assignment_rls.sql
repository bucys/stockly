-- Migration 014: phase 2 of per-location RLS lockdown — categories + products
-- SELECT.
--
-- After 013 made locations SELECT honor assignments, an employee can still
-- read categories/products for unassigned locations because those policies
-- are still company-scoped. This migration ties their visibility to the
-- assignment graph for employees while preserving admin-wide access.
--
-- Untouched in this migration (intentional, to limit blast radius):
--   * categories: insert/update/delete policies
--   * products:   insert/update/delete policies (incl. migration 005)
--   * inventory_sessions: all policies
--   * inventory_counts:   all policies
--   * locations: already handled in 013
--
-- Prereqs:
--   * is_admin() and can_access_location(loc uuid)        — migration 010
--   * employee_location_assignments + backfill            — migration 009
--   * locations select by role and assignment             — migration 013

-- ── categories ────────────────────────────────────────────────────────────
drop policy if exists "members can read categories" on categories;

create policy "categories select by role and assignment"
  on categories for select
  using (
    (
      is_admin()
      and exists (
        select 1 from locations l
        where l.id = categories.location_id
          and l.company_id = user_company_id()
      )
    )
    or can_access_location(categories.location_id)
  );

-- ── products ──────────────────────────────────────────────────────────────
drop policy if exists "members can read products" on products;

create policy "products select by role and assignment"
  on products for select
  using (
    exists (
      select 1
      from categories c
      join locations l on l.id = c.location_id
      where c.id = products.category_id
        and (
          (is_admin() and l.company_id = user_company_id())
          or can_access_location(l.id)
        )
    )
  );

-- ── Rollback (paste into a new migration if needed) ───────────────────────
-- drop policy if exists "categories select by role and assignment" on categories;
-- drop policy if exists "products select by role and assignment"   on products;
--
-- create policy "members can read categories"
--   on categories for select
--   using (
--     exists (
--       select 1 from locations l
--       where l.id = location_id and l.company_id = user_company_id()
--     )
--   );
--
-- create policy "members can read products"
--   on products for select
--   using (
--     exists (
--       select 1 from categories c
--       join locations l on l.id = c.location_id
--       where c.id = category_id and l.company_id = user_company_id()
--     )
--   );
