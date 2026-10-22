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

Players (round 3, builder_port3.md): with settings.data.canvasPages and settings.data.deviceChecks both off, the
new player sends exactly today's requests and refuses an empty key cell, as today. The new report requests, the
start-up key check and the session record that the console's step 6 and 7 gates count come only with one of them
on. So, BEFORE step 6: tick "Screen PC checks" in the console's labs box (console.html?labs=1), Save, then press
"Reload all screens" and wait one minute. Never apply step 9 with deviceChecks off: with it off an empty key cell
stops every screen (today's rule). Undo: untick, Save, "Reload all screens".
