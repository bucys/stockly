-- Migration 021: phase 7 of per-location RLS lockdown — inventory_sessions
-- DELETE.
--
-- Until now, no DELETE policy existed on inventory_sessions, so RLS denied
-- delete for everyone except via cascade. This migration introduces explicit
-- delete rules:
--
--   * admins can delete ANY session in their company, regardless of status
--     or whether counts already exist (escape hatch / cleanup).
--   * employees can delete only sessions that are:
--       - in a location they currently have access to,
--       - status = 'active', and
--       - have NO inventory_counts rows yet.
--     In other words: cancel an empty active session you (or a teammate)
--     started by mistake, before any counting happened.
--
-- Notably this does NOT require created_by = auth.uid(). Sessions are a
-- shared workflow within an assigned location: any teammate can clean up
-- an empty active session, just as any teammate can continue counting one.
--
-- Untouched in this migration:
--   * inventory_sessions INSERT/UPDATE — handled in 016
--   * inventory_counts policies        — handled in 015/019
--   * Other tables                     — unchanged
--
-- Prereqs:
--   * is_admin() and can_access_location(loc uuid)        — migration 010
--   * sessions SELECT/INSERT/UPDATE lockdown              — migrations 015, 016

create policy "sessions delete by role and assignment"
  on inventory_sessions for delete
  using (
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
      and status = 'active'
      and not exists (
        select 1 from inventory_counts c
        where c.session_id = inventory_sessions.id
      )
    )
  );

-- ── Rollback (paste into a new migration if needed) ───────────────────────
-- drop policy if exists "sessions delete by role and assignment" on inventory_sessions;
