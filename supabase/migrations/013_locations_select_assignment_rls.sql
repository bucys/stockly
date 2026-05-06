-- Migration 013: phase 1 of per-location RLS lockdown.
--
-- Tightens SELECT on `locations` so employees see only locations they have an
-- active assignment for; admins keep full company-wide visibility. All other
-- table policies (categories / products / inventory_sessions / inventory_counts)
-- are intentionally LEFT UNCHANGED in this migration to limit blast radius.
--
-- Prerequisites already in place:
--   * employee_location_assignments table (008)
--   * is_admin() and can_access_location(loc uuid) helpers (010)
--   * backfilled assignments so existing employees do not lose access (009)
--   * app UI already filters by assignments — this migration only mirrors that
--     filter at the database level.
--
-- The admin "manage locations" policy (FOR ALL) is unchanged: admins can still
-- insert/update/delete locations in their own company.

drop policy if exists "members can read locations" on locations;

create policy "locations select by role and assignment"
  on locations for select
  using (
    (is_admin() and company_id = user_company_id())
    or can_access_location(id)
  );
