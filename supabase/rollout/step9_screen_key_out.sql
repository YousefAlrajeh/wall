-- WS-wall21 rollout step 9: the screen key leaves the public settings row. NOT APPLIED.
-- Run in the Supabase SQL editor ONLY after step 8 (every screen runs the new player, is set up and
-- passed the restart check, WALL_REQUIRE_DEVICE=1). Never through "supabase db push".
-- Old players (main) compare the key with this cell and show "Access key missing or wrong" once it is
-- empty: that is why every later undo must start by undoing this step (reverse-order rule).
-- The key value is unchanged (D-212): the functions read it from the secret SCREEN_KEY and the screen
-- links keep it. The backup (exports\wall_backup_20261021\settings_rows.csv) keeps the old cell.
-- Undo: undo/undo_step9_screen_key_out.sql, then put the cell back by hand (see that file).

begin;
alter table public.settings alter column screen_key drop not null;
update public.settings set screen_key = null where screen_key is not null;
alter table public.settings add constraint settings_no_screen_key check (screen_key is null);
commit;

-- (no column revoke: with table-level SELECT for anon it would have no effect; the empty cell plus the
--  check constraint is the protection)
-- Check after: as anon, settings shows screen_key empty; every screen still shows its reports.
