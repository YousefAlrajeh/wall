-- WS-wall21 UNDO of rollout step 9 (screen key out of the public row). NOT APPLIED; only to undo.
-- Reverse-order rule: this is the FIRST undo once step 9 is applied, before step 8, 6, 5b, 4 or 3 are undone.
-- Run in the Supabase SQL editor. Never through "supabase db push". Three parts, in this order:
--   1. this file;  2. the UPDATE below, pasted by hand;  3. undo/undo_step9b_not_null.sql.

begin;
alter table public.settings drop constraint if exists settings_no_screen_key;
commit;

-- 2. Put the old cell back by hand, in the same SQL editor. The value is in
-- exports\wall_backup_20261021\settings_rows.csv (column screen_key, row id main) on the user's PC;
-- it never goes into a file in the repo. Paste it in place of <value>:
--   update public.settings set screen_key = '<value>' where id = 'main';
-- 3. Then run undo/undo_step9b_not_null.sql (puts NOT NULL back if step 9 found it there).
-- Check (as anon; prints a count only, expected 1):
--   begin; set local role anon; select count(*) filter (where screen_key is not null and screen_key <> '') as key_cells_present from public.settings where id = 'main'; rollback;
-- and the old player (main) accepts its link again.
