-- WS-wall21 UNDO of rollout step 9 (screen key out of the public row). NOT APPLIED; only to undo.
-- Reverse-order rule: this is the FIRST undo once step 9 is applied, before step 8, 5 or 3 are undone.
-- Run in the Supabase SQL editor. Never through "supabase db push".

begin;
alter table public.settings drop constraint if exists settings_no_screen_key;
commit;

-- Then put the old cell back by hand, in the same SQL editor. The value is in
-- exports\wall_backup_20261021\settings_rows.csv (column screen_key, row id main) on the user's PC;
-- it never goes into a file in the repo. Paste it in place of <value>:
--   update public.settings set screen_key = '<value>' where id = 'main';
-- Check: as anon, settings shows a non-empty screen_key; the old player (main) accepts its link again.
