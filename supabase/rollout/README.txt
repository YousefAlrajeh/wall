WS-wall21 rollout SQL. Nothing here is applied. Run each file by hand in the Supabase SQL editor at its
step of the rollout plan (work\WS-wall21\handoff\builder_foundation.md, round 7 plan). Never use
"supabase db push": these files are deliberately NOT in supabase/migrations, because applying them all
at once would empty the screen key cell and stop every old player.

  step2_foundation.sql          new tables and functions only           undo/undo_step2_foundation.sql
  step2b_admin_writes.sql       writes only for console admins          undo/undo_step2b_admin_writes.sql
  step9_screen_key_out.sql      key cell out of the public row          undo/undo_step9_screen_key_out.sql, then the
                                (also records NOT NULL for its undo)    cell back by hand, then undo/undo_step9b_not_null.sql
  later_figures_schedule.sql    figures job schedule (all commented)    unschedule the two cron jobs

Each file ends with its check lines. The "as anon" checks are exact SQL editor lines of the form
  begin; set local role anon; select count(*) ...; rollback;
They print counts only, never a value, and change nothing.

Order (round 7, checker_wallv2_r3 R3-M2): 2, 2b, 3 publish the site (new player and console; the old token
function v5 still serves), 4 the new token function, 5 read the console status, 5b Screen PC checks on, 6, 7, 8, 9, 10.
The new console's Microsoft box works with both token functions (old request form while v5 is live, admin request
from step 4), so Microsoft can be re-authorized at every step. Main's console cannot talk to the new function:
never have main's console live with the new function, i.e. never undo step 3 while step 4 is applied.

Undo rule: undo strictly from the last applied step backwards. Once step 9 is applied, its undo
(and putting the key cell back, and undo 9b) comes first, before any other undo.

Players (round 3, builder_port3.md): with settings.data.canvasPages and settings.data.deviceChecks both off, the
new player sends exactly today's requests and refuses an empty key cell, as today. The new report requests, the
start-up key check and the session record that the console's step 6 and 7 gates count come only with one of them
on. So, at step 5b (after step 5, BEFORE step 6): tick "Screen PC checks" in the console's labs box
(console.html?labs=1), Save, then press "Reload all screens" and wait one minute. Never apply step 9 with
deviceChecks off: with it off an empty key cell stops every screen (today's rule).
Undo of deviceChecks (5b): untick, Save, "Reload all screens" ONLY while steps 8 and 9 are not applied; undo them
first, in reverse order (9 with the key cell back, then 8). Why: after step 8 the new function refuses reports to a
player that does not send its device secret, and with deviceChecks off the player sends today's requests; after
step 9, with both switches off an empty key cell refuses every screen, and a refused screen stops listening, so
"Reload all screens" can no longer reach it; each screen PC would then need a manual refresh. The same holds for
turning canvasPages off after step 9.

Screen PCs whose browser storage is blocked (round 7, R3-M1): the player keeps the #d= secret in the address when
the storage does not give it back, so in-page reloads keep it. Step 7 proves this for every PC: after the restart
check, press "Reload all screens" and require "21 of 21 came back with their own link after Reload all screens".
