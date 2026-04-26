-- Enable UUID extension
create extension if not exists "pgcrypto";

-- Companies
create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

-- Company members (links auth.users to companies)
create table company_members (
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  role text not null check (role in ('admin', 'employee')),
  created_at timestamptz default now(),
  primary key (user_id, company_id)
);

-- Locations (belong to a company)
create table locations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  created_at timestamptz default now()
);

-- Categories (belong to a location)
create table categories (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id) on delete cascade,
  name text not null,
  created_at timestamptz default now()
);

-- Products (belong to a category)
create table products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references categories(id) on delete cascade,
  name text not null,
  unit text not null default 'pcs',
  last_known_quantity numeric,
  created_at timestamptz default now()
);

-- Inventory sessions (belong to a location)
create table inventory_sessions (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id) on delete cascade,
  created_at timestamptz default now(),
  status text not null default 'active' check (status in ('active', 'completed'))
);

-- Inventory counts (one row per product per session)
create table inventory_counts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references inventory_sessions(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  quantity numeric not null,
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz default now(),
  unique (session_id, product_id)
);

-- ── Row Level Security ────────────────────────────────────────────────────────

alter table companies enable row level security;
alter table company_members enable row level security;
alter table locations enable row level security;
alter table categories enable row level security;
alter table products enable row level security;
alter table inventory_sessions enable row level security;
alter table inventory_counts enable row level security;

-- Helper: check if current user belongs to a company
create or replace function user_company_id()
returns uuid language sql stable as $$
  select company_id from company_members where user_id = auth.uid() limit 1;
$$;

-- Companies: member can read their own company
create policy "members can read own company"
  on companies for select
  using (id = user_company_id());

create policy "members can update own company"
  on companies for update
  using (id = user_company_id());

-- Company members: visible within same company
create policy "members can read company_members"
  on company_members for select
  using (company_id = user_company_id());

create policy "admins can insert company_members"
  on company_members for insert
  with check (
    company_id = user_company_id()
    and exists (
      select 1 from company_members
      where user_id = auth.uid() and role = 'admin'
    )
  );

-- Locations
create policy "members can read locations"
  on locations for select
  using (company_id = user_company_id());

create policy "admins can manage locations"
  on locations for all
  using (
    company_id = user_company_id()
    and exists (
      select 1 from company_members
      where user_id = auth.uid() and role = 'admin'
    )
  );

-- Categories (access via location → company)
create policy "members can read categories"
  on categories for select
  using (
    exists (
      select 1 from locations l
      where l.id = location_id and l.company_id = user_company_id()
    )
  );

create policy "admins can manage categories"
  on categories for all
  using (
    exists (
      select 1 from locations l
      join company_members cm on cm.company_id = l.company_id
      where l.id = location_id
        and cm.user_id = auth.uid()
        and cm.role = 'admin'
    )
  );

-- Products
create policy "members can read products"
  on products for select
  using (
    exists (
      select 1 from categories c
      join locations l on l.id = c.location_id
      where c.id = category_id and l.company_id = user_company_id()
    )
  );

create policy "admins can manage products"
  on products for all
  using (
    exists (
      select 1 from categories c
      join locations l on l.id = c.location_id
      join company_members cm on cm.company_id = l.company_id
      where c.id = category_id
        and cm.user_id = auth.uid()
        and cm.role = 'admin'
    )
  );

-- Inventory sessions
create policy "members can read sessions"
  on inventory_sessions for select
  using (
    exists (
      select 1 from locations l
      where l.id = location_id and l.company_id = user_company_id()
    )
  );

create policy "members can create sessions"
  on inventory_sessions for insert
  with check (
    exists (
      select 1 from locations l
      where l.id = location_id and l.company_id = user_company_id()
    )
  );

create policy "members can update sessions"
  on inventory_sessions for update
  using (
    exists (
      select 1 from locations l
      where l.id = location_id and l.company_id = user_company_id()
    )
  );

-- Inventory counts
create policy "members can read counts"
  on inventory_counts for select
  using (
    exists (
      select 1 from inventory_sessions s
      join locations l on l.id = s.location_id
      where s.id = session_id and l.company_id = user_company_id()
    )
  );

create policy "members can upsert counts"
  on inventory_counts for insert
  with check (
    updated_by = auth.uid()
    and exists (
      select 1 from inventory_sessions s
      join locations l on l.id = s.location_id
      where s.id = session_id and l.company_id = user_company_id()
    )
  );

create policy "members can update counts"
  on inventory_counts for update
  using (
    exists (
      select 1 from inventory_sessions s
      join locations l on l.id = s.location_id
      where s.id = session_id and l.company_id = user_company_id()
    )
  );
