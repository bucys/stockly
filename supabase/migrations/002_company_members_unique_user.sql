-- Migration: enforce one company per user (MVP constraint)
-- Run this in Supabase SQL Editor.
--
-- Why: the original schema uses primary key (user_id, company_id), which allows
-- the same user to appear in multiple companies. Repeated registration retries
-- create a new company each time, resulting in duplicate rows and PGRST116 errors.
--
-- Step 1: remove duplicate rows, keeping the earliest membership per user.
delete from company_members
where ctid not in (
  select min(ctid)
  from company_members
  group by user_id
);

-- Step 2: add unique constraint so a user can only belong to one company (MVP).
alter table company_members
  add constraint company_members_user_id_unique unique (user_id);

-- Step 3: fix the SELECT policy so users can always read their own membership row,
-- even before user_company_id() has anything to return.
drop policy if exists "members can read company_members" on company_members;

create policy "members can read company_members"
  on company_members for select
  using (
    user_id = auth.uid()
    or company_id = user_company_id()
  );
