-- Migration 003: fix potential RLS recursion in user_company_id().
--
-- The original function is STABLE but not SECURITY DEFINER.
-- The company_members SELECT policy is:
--   user_id = auth.uid() OR company_id = user_company_id()
-- When another policy calls user_company_id(), that function queries
-- company_members, which triggers the company_members policy again,
-- which calls user_company_id() — potential infinite recursion.
--
-- SECURITY DEFINER makes the function execute with the function owner's
-- privileges (postgres/service role), bypassing RLS on company_members
-- entirely. This is the standard Supabase pattern for helper functions
-- used inside RLS policies.

create or replace function user_company_id()
returns uuid language sql stable security definer as $$
  select company_id from company_members where user_id = auth.uid() limit 1;
$$;
