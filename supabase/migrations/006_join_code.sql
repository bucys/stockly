-- Migration 006: company join codes for employee onboarding.
--
-- join_code is an 8-char uppercase hex string (e.g. "A3F7B21C").
-- 4 bytes = ~4 billion possibilities, collision probability is negligible
-- at the scale of this application.
--
-- The join_company_by_code RPC runs SECURITY DEFINER so a brand-new auth
-- user (who has no company_members row yet) can insert their own membership.
-- The existing "admins can insert company_members" policy would deny this.

-- 1. Column
alter table companies add column join_code text unique;

-- 2. Backfill existing companies
update companies
set join_code = upper(encode(gen_random_bytes(4), 'hex'))
where join_code is null;

-- 3. Not-null constraint now that existing rows are filled
alter table companies alter column join_code set not null;

-- 4. Trigger: auto-generate join_code on company creation
create or replace function set_company_join_code()
returns trigger language plpgsql as $$
begin
  if new.join_code is null then
    loop
      new.join_code := upper(encode(gen_random_bytes(4), 'hex'));
      exit when not exists (select 1 from companies where join_code = new.join_code);
    end loop;
  end if;
  return new;
end;
$$;

create trigger companies_set_join_code
  before insert on companies
  for each row execute function set_company_join_code();

-- 5. RPC: join_company_by_code
-- Returns JSON: { company_id } on success, { error: string } on failure.
-- Error codes: not_authenticated | invalid_code | already_member
create or replace function join_company_by_code(p_join_code text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_user_id    uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    return json_build_object('error', 'not_authenticated');
  end if;

  -- Guard: user already belongs to a company
  if exists (select 1 from company_members where user_id = v_user_id) then
    -- Return their existing company so the client can proceed
    select company_id into v_company_id
    from company_members where user_id = v_user_id limit 1;
    return json_build_object('error', 'already_member', 'company_id', v_company_id);
  end if;

  -- Find company (case-insensitive)
  select id into v_company_id
  from companies
  where upper(join_code) = upper(p_join_code);

  if v_company_id is null then
    return json_build_object('error', 'invalid_code');
  end if;

  -- Insert membership
  insert into company_members (user_id, company_id, role)
  values (v_user_id, v_company_id, 'employee');

  return json_build_object('company_id', v_company_id);

exception
  when unique_violation then
    -- Race condition: two concurrent joins — safe to treat as success
    select company_id into v_company_id
    from company_members where user_id = v_user_id limit 1;
    return json_build_object('company_id', v_company_id);
end;
$$;
