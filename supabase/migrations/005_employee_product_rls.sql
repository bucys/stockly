-- Migration 005: allow employees to insert and update products.
--
-- The existing "admins can manage products" policy (for all) blocks employees
-- from adding or editing products. Employees need INSERT + UPDATE to:
--   - add products to existing categories
--   - edit product name / unit / category
--   - complete inventory sessions (completeSession updates last_known_quantity)
--
-- Employees still cannot DELETE products — that remains admin-only via the
-- existing "admins can manage products" policy.
--
-- The with check on UPDATE validates that the new category_id also belongs to
-- the same company, preventing cross-company product reassignment.

create policy "employees can insert products"
  on products for insert
  with check (
    exists (
      select 1 from categories c
      join locations l on l.id = c.location_id
      where c.id = category_id
        and l.company_id = user_company_id()
    )
  );

create policy "employees can update products"
  on products for update
  using (
    exists (
      select 1 from categories c
      join locations l on l.id = c.location_id
      where c.id = category_id
        and l.company_id = user_company_id()
    )
  )
  with check (
    exists (
      select 1 from categories c
      join locations l on l.id = c.location_id
      where c.id = category_id
        and l.company_id = user_company_id()
    )
  );
