-- Migration 011: lightweight public profile mirror for auth.users.
--
-- auth.users is not readable from row-level policies in client contexts, so
-- we mirror only what the app needs (display_name, email) into a public
-- table that can be exposed via RLS to:
--   * the user themselves
--   * admins, for members of their own company
--
-- This does NOT change any existing RLS enforcement on locations / sessions /
-- products / counts / assignments.

create table if not exists user_profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table user_profiles enable row level security;

-- Owner: can read / insert / update own profile.
create policy "users can read own profile"
  on user_profiles for select
  using (user_id = auth.uid());

create policy "users can insert own profile"
  on user_profiles for insert
  with check (user_id = auth.uid());

create policy "users can update own profile"
  on user_profiles for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Admin: can read profiles for members of own company.
create policy "admins can read company member profiles"
  on user_profiles for select
  using (
    exists (
      select 1
      from company_members cm
      where cm.user_id = user_profiles.user_id
        and cm.company_id = user_company_id()
    )
    and exists (
      select 1
      from company_members me
      where me.user_id = auth.uid()
        and me.role = 'admin'
    )
  );

-- ── Backfill from auth.users ───────────────────────────────────────────────
-- Migrations run with elevated privileges, so we can read auth.users here.
-- Subsequent app-side upserts will keep this in sync (best effort).

insert into user_profiles (user_id, email)
select id, email
from auth.users
on conflict (user_id) do update
  set email = excluded.email,
      updated_at = now();

-- Auto-update updated_at on row changes.
create or replace function user_profiles_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_profiles_updated_at on user_profiles;
create trigger user_profiles_updated_at
  before update on user_profiles
  for each row execute function user_profiles_set_updated_at();
