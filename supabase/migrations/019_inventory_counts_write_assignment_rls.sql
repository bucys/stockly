-- Migration 019: phase 5 of per-location RLS lockdown — inventory_counts
-- INSERT and UPDATE.
--
-- Reads on inventory_counts are already restricted to assigned-location
-- sessions (migration 015). This migration closes the write loop:
--   * employees may insert/update counts only for sessions whose
--     location is in their active assignments
--   * admins keep full company-wide write access
--   * any assigned employee can edit a count originally entered by another
--     assigned employee — counts are shared across the team for a given
--     session/location, mirroring the loosened "sessions update by assigned
--     location" rule
--
-- INSERT preserves the existing self-attribution requirement
-- (`updated_by = auth.uid()`) — the app already writes this via upsertCount,
-- so no service change is needed.
--
-- UPDATE does NOT require updated_by = auth.uid(); whoever edits becomes the
-- new updated_by through the existing app upsert path.
--
-- Untouched in this migration:
--   * inventory_counts SELECT — handled in 015
--   * inventory_counts DELETE — phase 6
--   * inventory_sessions all policies — handled in 016
--   * locations / categories / products — handled in 013/014
--
-- Prereqs:
--   * is_admin() and can_access_location(loc uuid)        — migration 010
--   * sessions/counts SELECT lockdown                     — migration 015
--   * sessions write lockdown                             — migration 016

-- ── INSERT ────────────────────────────────────────────────────────────────
drop policy if exists "members can upsert counts" on inventory_counts;

create policy "counts insert by role and assignment"
  on inventory_counts for insert
  with check (
    updated_by = auth.uid()
    and exists (
      select 1
      from inventory_sessions s
      join locations l on l.id = s.location_id
      where s.id = inventory_counts.session_id
        and (
          (is_admin() and l.company_id = user_company_id())
          or can_access_location(l.id)
        )
    )
  );

-- ── UPDATE ────────────────────────────────────────────────────────────────
drop policy if exists "members can update counts" on inventory_counts;

create policy "counts update by role and assignment"
  on inventory_counts for update
  using (
    exists (
      select 1
      from inventory_sessions s
      join locations l on l.id = s.location_id
      where s.id = inventory_counts.session_id
        and (
          (is_admin() and l.company_id = user_company_id())
          or can_access_location(l.id)
        )
    )
  )
  with check (
    exists (
      select 1
      from inventory_sessions s
      join locations l on l.id = s.location_id
      where s.id = inventory_counts.session_id
        and (
          (is_admin() and l.company_id = user_company_id())
          or can_access_location(l.id)
        )
    )
  );

-- ── Rollback (paste into a new migration if needed) ───────────────────────
-- drop policy if exists "counts insert by role and assignment" on inventory_counts;
-- drop policy if exists "counts update by role and assignment" on inventory_counts;
--
-- create policy "members can upsert counts"
--   on inventory_counts for insert
--   with check (
--     updated_by = auth.uid()
--     and exists (
--       select 1 from inventory_sessions s
--       join locations l on l.id = s.location_id
--       where s.id = session_id and l.company_id = user_company_id()
--     )
--   );
--
-- create policy "members can update counts"
--   on inventory_counts for update
--   using (
--     exists (
--       select 1 from inventory_sessions s
--       join locations l on l.id = s.location_id
--       where s.id = session_id and l.company_id = user_company_id()
--     )
--   );
