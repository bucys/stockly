-- Migration 024: fix infinite recursion in inventory_sessions DELETE policy.
--
-- Root cause
-- ----------
-- Migration 021 added a DELETE policy on inventory_sessions whose USING
-- expression contains:
--
--     not exists (
--       select 1 from inventory_counts c
--       where c.session_id = inventory_sessions.id
--     )
--
-- That subquery re-enters RLS on inventory_counts. Migration 015 set the
-- inventory_counts SELECT policy to join back into inventory_sessions to
-- enforce per-location assignment:
--
--     exists (select 1 from inventory_sessions s join locations l ...)
--
-- So evaluating the DELETE policy on inventory_sessions triggers
-- inventory_counts SELECT RLS, which re-enters inventory_sessions, which
-- re-evaluates the DELETE policy — infinite recursion (Postgres 42P17).
--
-- Fix
-- ---
-- Move the "has counts?" probe behind a SECURITY DEFINER helper that runs
-- with elevated privileges and bypasses RLS on inventory_counts. The helper
-- only reads counts.session_id and returns a boolean — it does not leak any
-- count data. Then rewrite the DELETE policy to call the helper instead of
-- embedding a subquery.
--
-- Prereqs:
--   * is_admin(), user_company_id(), can_access_location() — migrations 003/010
--   * inventory_sessions DELETE policy from migration 021

-- ── Helper ────────────────────────────────────────────────────────────────
create or replace function session_has_counts(session uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from inventory_counts c
    where c.session_id = session
  );
$$;

revoke all on function session_has_counts(uuid) from public;
grant execute on function session_has_counts(uuid) to authenticated;

-- ── Replace DELETE policy ────────────────────────────────────────────────
drop policy if exists "sessions delete by role and assignment" on inventory_sessions;

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
      and not session_has_counts(inventory_sessions.id)
    )
  );

-- ── Rollback (paste into a new migration if needed) ──────────────────────
-- drop policy if exists "sessions delete by role and assignment" on inventory_sessions;
-- drop function if exists session_has_counts(uuid);
--
-- -- Then re-create the 021 policy if you really want the recursive version back:
-- create policy "sessions delete by role and assignment"
--   on inventory_sessions for delete
--   using (
--     (is_admin() and exists (
--       select 1 from locations l
--       where l.id = inventory_sessions.location_id
--         and l.company_id = user_company_id()))
--     or (
--       can_access_location(location_id)
--       and status = 'active'
--       and not exists (
--         select 1 from inventory_counts c
--         where c.session_id = inventory_sessions.id))
--   );
