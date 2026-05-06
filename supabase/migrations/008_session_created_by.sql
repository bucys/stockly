-- Migration 008: track who started an inventory session.
--
-- Required for upcoming per-employee location access work:
-- "employees can cancel only their own active session with zero counts".
-- Existing rows keep created_by = null (treated as legacy / admin-managed).
-- Column is nullable so historical rows and any non-authenticated inserts
-- (e.g. server-side) do not break.

alter table inventory_sessions
  add column if not exists created_by uuid references auth.users(id);

create index if not exists inventory_sessions_created_by_idx
  on inventory_sessions (created_by);
