-- Migration 004: enable realtime for inventory_counts.
--
-- Supabase realtime only broadcasts changes for tables that are part of
-- the supabase_realtime publication. Without this, postgres_changes
-- subscriptions on inventory_counts will connect but never receive events.
--
-- Run this once in Supabase SQL Editor (or via CLI: supabase db push).

alter publication supabase_realtime add table inventory_counts;
