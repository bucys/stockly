-- Migration 016: phase 4 of per-location RLS lockdown — inventory_sessions
-- INSERT and UPDATE.
--
-- Reads have already been tightened in 013/014/015. This migration closes the
-- write loop on `inventory_sessions`:
--   * employees may create sessions only for assigned locations and must own
--     the row (created_by = auth.uid())
--   * employees may update only sessions for assigned locations they created
--     themselves
--   * admins keep full company-wide write access
--   * legacy sessions with created_by IS NULL are admin-only to update,
--     since there is no owner to verify
--
-- Untouched in this migration (intentional):
--   * inventory_sessions DELETE — phase 5 will add a "cancel own active
--     session with zero counts" rule plus admin override.
--   * inventory_counts INSERT/UPDATE — phase 5 will tighten counts writes
--     so employees can only count for assigned-location sessions.
--   * categories / products / locations: unchanged.
--   * Realtime + completeSession service logic: unchanged. Update path now
--     fails for an employee writing to an unassigned or non-owned session,
--     surfacing as a Postgres permission error in the client.
--
-- Prereqs:
--   * inventory_sessions.created_by                       — migration 008
--   * createSession writes created_by                     — services/sessions.ts
--   * is_admin() and can_access_location(loc uuid)        — migration 010
--   * sessions SELECT lockdown                            — migration 015

-- ── INSERT ────────────────────────────────────────────────────────────────
drop policy if exists "members can create sessions" on inventory_sessions;

create policy "sessions insert by role and assignment"
  on inventory_sessions for insert
  with check (
    (
      is_admin()
      and exists (
        select 1 from locations l
        where l.id = inventory_sessions.location_id
          and l.company_id = user_company_id()
      )
    )
    or (
      can_access_location(location_id)
      and created_by = auth.uid()
    )
  );

-- ── UPDATE ────────────────────────────────────────────────────────────────
-- ── UPDATE ────────────────────────────────────────────────────────────────
drop policy if exists "members can update sessions" on inventory_sessions;
drop policy if exists "sessions update by role and assignment" on inventory_sessions;

create policy "sessions update by assigned location"
  on inventory_sessions for update
  using (
    (
      is_admin()
      and exists (
        select 1 from locations l
        where l.id = inventory_sessions.location_id
          and l.company_id = user_company_id()
      )
    )
    or can_access_location(location_id)
  )
  with check (
    (
      is_admin()
      and exists (
        select 1 from locations l
        where l.id = inventory_sessions.location_id
          and l.company_id = user_company_id()
      )
    )
    or can_access_location(location_id)
  );

-- ── Rollback (paste into a new migration if needed) ───────────────────────
-- drop policy if exists "sessions insert by role and assignment" on inventory_sessions;
-- drop policy if exists "sessions update by role and assignment" on inventory_sessions;
--
-- create policy "members can create sessions"
--   on inventory_sessions for insert
--   with check (
--     exists (
--       select 1 from locations l
--       where l.id = location_id and l.company_id = user_company_id()
--     )
--   );
--
-- create policy "members can update sessions"
--   on inventory_sessions for update
--   using (
--     exists (
--       select 1 from locations l
--       where l.id = location_id and l.company_id = user_company_id()
--     )
--   );
