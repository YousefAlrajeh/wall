WS-wall21 rollout SQL. Nothing here is applied. Run each file by hand in the Supabase SQL editor at its
step of the rollout plan (work\WS-wall21\handoff\builder_foundation.md, round 6). Never use
"supabase db push": these files are deliberately NOT in supabase/migrations, because applying them all
at once would empty the screen key cell and stop every old player.

  step2_foundation.sql          new tables and functions only           undo/undo_step2_foundation.sql
  step2b_admin_writes.sql       writes only for console admins          undo/undo_step2b_admin_writes.sql
  step9_screen_key_out.sql      key cell out of the public row          undo/undo_step9_screen_key_out.sql
  later_figures_schedule.sql    figures job schedule (all commented)    unschedule the two cron jobs

Undo rule: undo strictly from the last applied step backwards. Once step 9 is applied, its undo
(and putting the key cell back) comes first, before any other undo.
