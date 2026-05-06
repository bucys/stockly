-- Migration 010: helper functions for upcoming per-location RLS.
--
-- Phase 1: helpers are CREATED but NOT YET wired into existing table policies.
-- They are safe to call from services / future policies. They use
-- security definer + a fixed search_path so they can be referenced from RLS
-- policies without recursion through company_members.

create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from company_members
    where user_id = auth.uid()
      and role = 'admin'
  );
$$;

create or replace function can_access_location(loc uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when is_admin() then exists (
      select 1
      from locations l
      where l.id = loc
        and l.company_id = user_company_id()
    )
    else exists (
      select 1
      from employee_location_assignments a
      where a.user_id = auth.uid()
        and a.location_id = loc
        and (a.expires_at is null or a.expires_at > now())
    )
  end;
$$;

-- Optional: lock execute permissions to authenticated users only.
revoke all on function is_admin() from public;
revoke all on function can_access_location(uuid) from public;
grant execute on function is_admin() to authenticated;
grant execute on function can_access_location(uuid) to authenticated;
