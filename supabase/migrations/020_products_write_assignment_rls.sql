-- Migration 020: phase 6 of per-location RLS lockdown — products INSERT and
-- UPDATE.
--
-- Reads on products are already restricted to assigned-location categories
-- (migration 014). Migration 005 had relaxed product INSERT/UPDATE to "any
-- member of the company"; this migration replaces those with assignment-
-- aware versions:
--   * employees may insert/update products only when the product's category
--     belongs to a location they are assigned to
--   * UPDATE additionally re-validates the new row, so an employee cannot
--     move a product into a category whose location they are not assigned to
--   * admins keep full company-wide write access (existing
--     "admins can manage products" FOR ALL policy is unchanged)
--
-- DELETE is intentionally NOT TOUCHED. The existing admin-only
-- "admins can manage products" policy continues to govern delete.
--
-- Untouched in this migration:
--   * categories: all policies
--   * inventory_sessions / inventory_counts: all policies (handled in
--     015/016/019)
--   * locations: handled in 013
--   * products SELECT: handled in 014
--   * products DELETE: still admin-only via "admins can manage products"
--
-- Prereqs:
--   * is_admin() and can_access_location(loc uuid)        — migration 010
--   * products SELECT lockdown                            — migration 014
--   * employees INSERT/UPDATE policies from migration 005

-- ── INSERT ────────────────────────────────────────────────────────────────
drop policy if exists "employees can insert products" on products;

create policy "products insert by role and assignment"
  on products for insert
  with check (
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

-- ── UPDATE ────────────────────────────────────────────────────────────────
drop policy if exists "employees can update products" on products;

create policy "products update by role and assignment"
  on products for update
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
  )
  with check (
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
-- drop policy if exists "products insert by role and assignment" on products;
-- drop policy if exists "products update by role and assignment" on products;
--
-- create policy "employees can insert products"
--   on products for insert
--   with check (
--     exists (
--       select 1 from categories c
--       join locations l on l.id = c.location_id
--       where c.id = category_id
--         and l.company_id = user_company_id()
--     )
--   );
--
-- create policy "employees can update products"
--   on products for update
--   using (
--     exists (
--       select 1 from categories c
--       join locations l on l.id = c.location_id
--       where c.id = category_id
--         and l.company_id = user_company_id()
--     )
--   )
--   with check (
--     exists (
--       select 1 from categories c
--       join locations l on l.id = c.location_id
--       where c.id = category_id
--         and l.company_id = user_company_id()
--     )
--   );
