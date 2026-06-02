-- Migration 026: codify the companies INSERT policy in version control.
--
-- Problem
-- -------
-- companies has RLS enabled (schema.sql) but no INSERT policy is committed in
-- this repo — only SELECT and UPDATE exist. Registration nonetheless inserts a
-- company directly from the client (services/auth.ts signUp), which means the
-- deployed database relies on an INSERT policy configured in the Supabase
-- dashboard that is NOT tracked here. That drift makes the real security
-- posture un-auditable from the codebase.
--
-- Fix
-- ---
-- Add an explicit, minimal INSERT policy: any authenticated user may create a
-- company (this is exactly what signup does when a new user provisions their
-- workspace). Postgres combines INSERT policies with OR, so this documents the
-- intended behavior without narrowing anything that already works.
--
-- Notes
-- -----
-- * The companies_set_join_code trigger (migration 006) still auto-generates
--   join_code on insert — unaffected.
-- * Company creation remains two separate client inserts (companies, then
--   company_members). This migration documents the policy only; it does not
--   change atomicity or the signup flow. The unique(user_id) constraint
--   (migration 002) plus signUp's existing-membership guard keep duplicate
--   memberships from forming.
-- * Idempotent: drop-if-exists then create, so re-running is safe and any
--   identically-named dashboard policy is replaced cleanly.

drop policy if exists "authenticated can insert companies" on companies;

create policy "authenticated can insert companies"
  on companies for insert
  with check (auth.uid() is not null);

-- ── Rollback (paste into a new migration if needed) ───────────────────────
-- drop policy if exists "authenticated can insert companies" on companies;
