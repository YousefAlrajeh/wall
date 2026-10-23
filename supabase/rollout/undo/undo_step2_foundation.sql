-- WS-wall21 UNDO of rollout step 2 (foundation: new tables and functions). NOT APPLIED; only to undo.
-- Reverse-order rule: run it last, after step 2b is undone (its policies use wall_is_admin()) and after
-- pbi-token v5 is back (v6 and the enrol function read these tables).
-- Removes ONLY objects step 2 created; today's tables, rules and the vault table are not touched.
-- Data in them is lost (enrolled screens, admin rows, figures snapshots, health rows).
-- Run in the Supabase SQL editor. Never through "supabase db push".

begin;
drop policy if exists screen_health_admin_read on public.screen_health;
drop function if exists public.wall_device_used(text, text);
drop function if exists public.wall_mark_set(text);
drop function if exists public.wall_feed_hit(text, integer);
drop function if exists public.wall_now();
drop function if exists public.wall_reader_token_get();
drop function if exists public.wall_reader_token_exists();
drop function if exists public.wall_reader_token_set(text);
drop function if exists public.wall_is_admin();
drop table if exists public.wall_admin_marks;
drop table if exists public.wall_feed_rate;
drop table if exists public.screen_health;
drop table if exists public.wall_reader_pending;
drop table if exists public.wall_figures_runs;
drop table if exists public.wall_figures;
drop table if exists public.wall_devices;
drop table if exists public.wall_admins;
commit;

-- The Vault entry 'wall_reader_refresh_token' (if the figures account was ever connected) is removed
-- separately in the dashboard (Vault), if wanted.
