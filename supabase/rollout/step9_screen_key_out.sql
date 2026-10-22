-- WS-wall21 rollout step 9: the screen key leaves the public settings row. NOT APPLIED.
-- Run in the Supabase SQL editor ONLY after step 8 (every screen runs the new player, is set up and
-- passed the restart and reload checks, WALL_REQUIRE_DEVICE=1). Never through "supabase db push".
-- Old players (main) compare the key with this cell and show "Access key missing or wrong" once it is
-- empty: that is why every later undo must start by undoing this step (reverse-order rule).
-- The key value is unchanged (D-212): the functions read it from the secret SCREEN_KEY and the screen
-- links keep it. The backup (exports\wall_backup_20261021\settings_rows.csv) keeps the old cell.
-- Undo: undo/undo_step9_screen_key_out.sql, put the cell back by hand, then undo/undo_step9b_not_null.sql.

begin;
-- record whether the column is NOT NULL today, so that the undo restores exactly that (checker_wallv2_r3 R3-L5).
-- A private note table (no rules: anon and signed-in users cannot read it); a second run keeps the first note.
create table if not exists public.wall_rollout_notes (
  id text primary key check (id ~ '^[a-z0-9_]{1,60}$'),
  value text not null,
  at timestamptz not null default now()
);
alter table public.wall_rollout_notes enable row level security;
revoke all on public.wall_rollout_notes from anon, authenticated, public;
insert into public.wall_rollout_notes (id, value)
  select 'step9_screen_key_is_nullable', c.is_nullable from information_schema.columns c
   where c.table_schema = 'public' and c.table_name = 'settings' and c.column_name = 'screen_key'
  on conflict (id) do nothing;
alter table public.settings alter column screen_key drop not null;
update public.settings set screen_key = null where screen_key is not null;
alter table public.settings add constraint settings_no_screen_key check (screen_key is null);
commit;

-- (no column revoke: with table-level SELECT for anon it would have no effect; the empty cell plus the
--  check constraint is the protection)
-- Check after (SQL editor, as anon; prints a count only, never the key; expected 0):
--   begin; set local role anon; select count(*) filter (where screen_key is not null) as key_cells_anon_can_read from public.settings; rollback;
-- and every screen still shows its reports.
