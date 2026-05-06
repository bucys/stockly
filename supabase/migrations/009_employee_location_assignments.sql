-- Migration 009: employee → location access assignments.
--
-- Phase 1 ONLY:
--  - create the table + minimal RLS for managing it
--  - backfill existing employees with assignments to every location in their
--    company so current behavior does not change
--
-- This migration does NOT yet apply assignments to locations / categories /
-- products / sessions / counts policies. That happens in a later phase once
-- the assignments and admin UI are verified working.

create table if not exists employee_location_assignments (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  location_id uuid not null references locations(id) on delete cascade,
  access_type text not null default 'permanent'
    check (access_type in ('permanent', 'temporary')),
  expires_at  timestamptz,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  unique (user_id, location_id)
);

create index if not exists ela_user_idx
  on employee_location_assignments (user_id);
create index if not exists ela_location_idx
  on employee_location_assignments (location_id);
create index if not exists ela_company_idx
  on employee_location_assignments (company_id);

alter table employee_location_assignments enable row level security;

-- Admin: full management within own company.
create policy "admins can read assignments"
  on employee_location_assignments for select
  using (
    company_id = user_company_id()
    and exists (
      select 1 from company_members
      where user_id = auth.uid()
        and company_id = employee_location_assignments.company_id
        and role = 'admin'
    )
  );

create policy "admins can insert assignments"
  on employee_location_assignments for insert
  with check (
    company_id = user_company_id()
    and exists (
      select 1 from company_members
      where user_id = auth.uid()
        and company_id = employee_location_assignments.company_id
        and role = 'admin'
    )
  );

create policy "admins can delete assignments"
  on employee_location_assignments for delete
  using (
    company_id = user_company_id()
    and exists (
      select 1 from company_members
      where user_id = auth.uid()
        and company_id = employee_location_assignments.company_id
        and role = 'admin'
    )
  );

-- Employee: can read only own assignments.
create policy "employees can read own assignments"
  on employee_location_assignments for select
  using (user_id = auth.uid());

-- ── Backfill ───────────────────────────────────────────────────────────────
-- Assign every existing employee to every location in their company so the
-- upcoming per-location enforcement starts as a no-op (current behavior).
-- New employees added after this migration will start with NO assignments
-- and the admin UI must grant them access explicitly.

insert into employee_location_assignments (company_id, user_id, location_id, created_by)
select cm.company_id, cm.user_id, l.id, cm.user_id
from company_members cm
join locations l on l.company_id = cm.company_id
where cm.role = 'employee'
on conflict (user_id, location_id) do nothing;
