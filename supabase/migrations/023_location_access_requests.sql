-- Migration 023: phase 9 — location access requests (V1, minimal).
--
-- Employees with no (or insufficient) assigned locations can submit a request
-- to access a specific location. Admins approve or reject from the Profile
-- tab. Approving creates an employee_location_assignments row.
--
-- V1 intentionally omits:
--   * notifications / realtime
--   * temporary access duration on the request
--   * comments / chat threads
--   * duplicate active requests for the same (user, location)
--
-- Untouched in this migration:
--   * All existing RLS policies on other tables
--
-- Prereqs:
--   * is_admin() and user_company_id()                  — migrations 003/010
--   * companies, locations, employee_location_assignments

-- ── Table ─────────────────────────────────────────────────────────────────
create table if not exists location_access_requests (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  location_id  uuid not null references locations(id) on delete cascade,
  reason       text,
  status       text not null default 'pending'
               check (status in ('pending','approved','rejected','cancelled')),
  decided_by   uuid references auth.users(id),
  decided_at   timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists idx_lar_user      on location_access_requests(user_id);
create index if not exists idx_lar_location  on location_access_requests(location_id);
create index if not exists idx_lar_company   on location_access_requests(company_id);

-- Only one pending request per (user, location).
create unique index if not exists uq_lar_pending_per_user_location
  on location_access_requests(user_id, location_id)
  where status = 'pending';

-- ── RLS ───────────────────────────────────────────────────────────────────
alter table location_access_requests enable row level security;

-- Employee: insert own request (must reference their company + a real location
-- in that company). Admins can also insert but normally won't.
create policy "access_requests insert own"
  on location_access_requests for insert
  with check (
    user_id = auth.uid()
    and company_id = user_company_id()
    and exists (
      select 1 from locations l
      where l.id = location_access_requests.location_id
        and l.company_id = user_company_id()
    )
  );

-- Employee: read own requests.  Admin: read all requests in their company.
create policy "access_requests select own or admin"
  on location_access_requests for select
  using (
    user_id = auth.uid()
    or (is_admin() and company_id = user_company_id())
  );

-- Admin: update requests in their company (approve / reject / cancel).
-- Employees cannot update.
create policy "access_requests update admin"
  on location_access_requests for update
  using (is_admin() and company_id = user_company_id())
  with check (is_admin() and company_id = user_company_id());

-- No DELETE policy: rely on cascade from companies/users/locations only.

-- ── Helper RPC: requestable locations ─────────────────────────────────────
-- Migration 013 restricts locations SELECT to admin OR assigned employee, so
-- an unassigned employee cannot see any location to request access to. This
-- security-definer function returns the minimal {id, name, address} list for
-- every location in the caller's company so the request UI can populate.
create or replace function list_requestable_locations()
returns table (id uuid, name text, address text)
language sql
security definer
set search_path = public
as $$
  select l.id, l.name, l.address
  from locations l
  where l.company_id = user_company_id()
  order by l.name;
$$;

revoke all on function list_requestable_locations() from public;
grant execute on function list_requestable_locations() to authenticated;

-- ── Rollback (paste into a new migration if needed) ───────────────────────
-- drop function if exists list_requestable_locations();
-- drop policy if exists "access_requests insert own"          on location_access_requests;
-- drop policy if exists "access_requests select own or admin" on location_access_requests;
-- drop policy if exists "access_requests update admin"        on location_access_requests;
-- drop index  if exists uq_lar_pending_per_user_location;
-- drop index  if exists idx_lar_company;
-- drop index  if exists idx_lar_location;
-- drop index  if exists idx_lar_user;
-- drop table  if exists location_access_requests;
