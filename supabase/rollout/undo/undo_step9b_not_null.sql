-- WS-wall21 UNDO of rollout step 9, last part (checker_wallv2_r3 R3-L5). NOT APPLIED; only to undo.
-- Run in the Supabase SQL editor AFTER undo_step9_screen_key_out.sql and after the key cell is back.
-- Never through "supabase db push".
-- Puts NOT NULL back on settings.screen_key exactly when step 9 recorded that the column had it, then
-- removes step 9's private note table. If the cell is still empty, SET NOT NULL fails, the whole
-- transaction is rolled back and nothing changes: put the cell back first, then run this file again.

begin;
do $$
declare v text;
begin
  select n.value into v from public.wall_rollout_notes n where n.id = 'step9_screen_key_is_nullable';
  if v is null then
    raise exception 'step 9 left no note: check settings.screen_key by hand before going on';
  end if;
  if v = 'NO' then
    alter table public.settings alter column screen_key set not null;
  end if;
end $$;
drop table public.wall_rollout_notes;
commit;

-- Check (prints YES or NO only; expected: what step 9 recorded, NO on a column that was NOT NULL):
--   select is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'settings' and column_name = 'screen_key';
