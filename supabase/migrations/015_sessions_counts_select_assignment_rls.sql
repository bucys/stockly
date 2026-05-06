-- Migration 015: phase 3 of per-location RLS lockdown — inventory_sessions
-- and inventory_counts SELECT.
--
-- After 013 (locations) and 014 (categories/products), employees can still
-- read sessions and individual count rows for unassigned locations because
-- those policies are still company-scoped. This migration aligns SELECT for
-- both tables with the assignment graph while preserving admin-wide access.
--
-- Untouched (intentional, to limit blast radius):
--   * inventory_sessions: insert/update policies — write tightening is
--     phase 4, alongside created_by ownership rules.
--   * inventory_counts:   insert/update policies — same reason.
--   * categories / products: handled in 014.
--   * locations: handled in 013.
--   * Realtime publications and triggers — unchanged. Realtime events still
--     fire; subscribers simply won't receive rows that fail this SELECT.
--
-- Prereqs:
--   * is_admin() and can_access_location(loc uuid)        — migration 010
--   * employee_location_assignments + backfill            — migration 009
--   * locations / categories / products SELECT lockdown   — migrations 013, 014

-- ── inventory_sessions ────────────────────────────────────────────────────
drop policy if exists "members can read sessions" on inventory_sessions;

create policy "sessions select by role and assignment"
  on inventory_sessions for select
  using (
    (
      is_admin()
      and exists (
        select 1 from locations l
        where l.id = inventory_sessions.location_id
          and l.company_id = user_company_id()
      )
    )
    or can_access_location(inventory_sessions.location_id)
  );

-- ── inventory_counts ──────────────────────────────────────────────────────
drop policy if exists "members can read counts" on inventory_counts;

create policy "counts select by role and assignment"
  on inventory_counts for select
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
  );

-- ── Rollback (paste into a new migration if needed) ───────────────────────
-- drop policy if exists "sessions select by role and assignment" on inventory_sessions;
-- drop policy if exists "counts select by role and assignment"   on inventory_counts;
--
-- create policy "members can read sessions"
--   on inventory_sessions for select
--   using (
--     exists (
--       select 1 from locations l
--       where l.id = location_id and l.company_id = user_company_id()
--     )
--   );
--
-- create policy "members can read counts"
--   on inventory_counts for select
--   using (
--     exists (
--       select 1 from inventory_sessions s
--       join locations l on l.id = s.location_id
--       where s.id = session_id and l.company_id = user_company_id()
--     )
--   );
