/* console-labs.js - "Wall pages (testing)" box. Loaded only when the console is opened as console.html?labs=1
   by a signed-in admin. Without ?labs=1 the console is exactly as before.
   - the feature switch settings.data.canvasPages and the bezel / safe margin (settings.data.wallLayout)
   - settings.data.deviceChecks: the players' new report requests and start-up key check (security rollout: on before step 6)
   - one-time sign-in of the figures account (function wall-reader-signin; no token ever comes back here)
   - screen health grid (table screen_health, admins only)
   All text is set with textContent. */
(function () {
  "use strict";
  var C = window.WALLCFG, sb = window.sb, L = window.WallLayout;
  var FN = String(C.SUPA_URL).replace(/\/$/, "") + "/functions/v1/";
  var AMBER = "#F0A04A";
  var REASON = { NEEDS_SIGNIN: "the figures account must sign in again", NOT_CONNECTED: "the figures account is not connected",
    NOT_CONFIGURED: "the figures list is not filled in", READER_NOT_CONFIGURED: "the figures account is not set up on the server",
    ACCOUNT_MISMATCH: "the signed-in account is not the expected one", TOKEN_REFRESH_FAILED: "Microsoft did not answer; it will try again",
    DATE_NOT_TODAY: "the figures were not for today", QUERY_CHANGED: "a figures query changed and needs a new check" };

  function h(tag, attrs, text) {
    var e = document.createElement(tag);
    for (var k in (attrs || {})) { if (k === "style") e.style.cssText = attrs[k]; else e.setAttribute(k, attrs[k]); }
    if (text !== undefined) e.textContent = text;
    return e;
  }
  async function call(fn, body) {
    var s = (await sb.auth.getSession()).data.session;
    if (!s) throw new Error("Sign in first");
    var r = await fetch(FN + fn, { method: "POST", headers: { "Content-Type": "application/json", apikey: C.SUPA_KEY, Authorization: "Bearer " + s.access_token }, body: JSON.stringify(body) });
    var j = {}; try { j = await r.json(); } catch (e) { }
    if (!r.ok) throw new Error(j.error === "denied" ? "This account is not a wall admin" : "The server did not answer (" + r.status + ")");
    return j;
  }

  var box = h("div", { "class": "box", style: "grid-column:1/-1;font-size:14px" });
  box.appendChild(h("h2", { style: "letter-spacing:0" }, "Wall pages (testing)"));
  var css = "font-size:14px";

  /* switch + layout */
  var r1 = h("div", { "class": "row" });
  var sw = h("input", { type: "checkbox", id: "labsOn", style: "width:auto" });
  r1.appendChild(sw); r1.appendChild(h("label", { "for": "labsOn" }, "Use wall pages, shared clock and figures (off = the wall works exactly as today; after rollout step 9, put the key cell back first: with both off an empty key cell stops every screen and only a manual refresh of each PC brings it back)"));
  box.appendChild(r1);
  var r1b = h("div", { "class": "row" });
  var dc = h("input", { type: "checkbox", id: "labsDev", style: "width:auto" });
  r1b.appendChild(dc); r1b.appendChild(h("label", { "for": "labsDev" }, "Screen PC checks: new report requests and the start-up key check (rollout: turn on, Save, then Reload all screens, before step 6; off = today's requests; after rollout step 9, put the key cell back first: with both off an empty key cell stops every screen and only a manual refresh of each PC brings it back)"));
  box.appendChild(r1b);
  var r2 = h("div", { "class": "row" });
  r2.appendChild(h("label", { style: "width:170px" }, "Bezel between screens (px)"));
  var bz = h("input", { type: "number", min: "0", max: "400", value: String(L.DEFAULT_BEZEL_PX), style: "width:80px;" + css });
  r2.appendChild(bz);
  r2.appendChild(h("label", { style: "width:150px;text-align:right" }, "Safe margin (px)"));
  var sf = h("input", { type: "number", min: "0", max: "400", value: String(L.DEFAULT_SAFE_PX), style: "width:80px;" + css });
  r2.appendChild(sf);
  var save = h("button", { "class": "acc", style: css }, "Save");
  r2.appendChild(save);
  box.appendChild(r2);

  /* figures account */
  var r3 = h("div", { "class": "row" });
  r3.appendChild(h("label", { style: "width:170px" }, "Figures account"));
  var acc = h("span", { style: css }, "checking");
  r3.appendChild(acc);
  var conn = h("button", { style: css }, "Connect the figures account (one time)");
  r3.appendChild(conn);
  box.appendChild(r3);
  var codeLine = h("div", { style: "font-size:16px;margin:4px 0 8px" });
  box.appendChild(codeLine);

  /* health grid */
  box.appendChild(h("div", { style: "margin-top:10px" }, "Screen health"));
  var grid = h("div", { "class": "wallgrid" });
  box.appendChild(grid);

  document.querySelector(".grid").appendChild(box);

  function paintSettings() {
    var st = window.ST_settings && window.ST_settings(); var d = (st && st.data) || {};
    sw.checked = d.canvasPages === true;
    dc.checked = d.deviceChecks === true;
    var wl = d.wallLayout || {};
    bz.value = String(wl.bezelPx != null ? wl.bezelPx : L.DEFAULT_BEZEL_PX);
    sf.value = String(wl.safePx != null ? wl.safePx : L.DEFAULT_SAFE_PX);
  }
  save.onclick = async function () {
    var cur = await sb.from("settings").select("data,screen_key").eq("id", "main").single();
    if (cur.error) return alert("Could not read the settings");
    /* both switches off while the key cell is empty (after rollout step 9): every screen would stop and could not be reloaded from here */
    if (!sw.checked && !dc.checked && !cur.data.screen_key &&
        !confirm("The screen key cell is empty (rollout step 9 is applied). With both switches off every screen stops, and Reload all screens cannot reach them: each screen PC would need a manual refresh. Put the key cell back first (step 9 undo). Save anyway?")) return;
    var d = Object.assign({}, cur.data.data || {}, { canvasPages: sw.checked, deviceChecks: dc.checked,
      wallLayout: { bezelPx: Math.max(0, Math.min(400, Math.round(+bz.value || 0))), safePx: Math.max(0, Math.min(400, Math.round(+sf.value || 0))) } });
    var up = await sb.from("settings").update({ data: d, updated_at: new Date().toISOString() }).eq("id", "main");
    if (up.error) return alert("Could not save the settings");
    if (window.load) window.load();
    alert(sw.checked ? "Wall pages are on. Screens pick this up by themselves." : "Wall pages are off. Screens reload and work as before.");
  };

  async function accStatus() {
    try {
      var j = await call("wall-reader-signin", { action: "status" });
      var t = j.connected ? "connected" : "not connected";
      if (j.lastRun) t += "; last figures run " + new Date(j.lastRun.finished_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) +
        " " + (j.lastRun.result === "SUCCESS" ? "worked" : j.lastRun.result === "UNCHANGED" ? "found no new refresh" : "stopped: " + (REASON[j.lastRun.reason] || "a check failed (" + (j.lastRun.reason || "unknown") + ")"));
      acc.textContent = t; acc.style.color = j.connected ? "" : AMBER;
    } catch (e) { acc.textContent = e.message; acc.style.color = AMBER; }
  }
  /* G4b: browser sign-in (authorization code + PKCE). The server makes the state and keeps the verifier; this page only goes
     to the Microsoft address the server returns, and later hands back what Microsoft put in the address bar. */
  var SIGNIN_MSG = { done: "Connected. The figures job can now run.",
    wrong_account: "That was not the expected account. Nothing was saved. Press Connect again and sign in with the figures account.",
    expired: "The sign-in took longer than 10 minutes or was already used. Press Connect again.",
    bad_state: "This sign-in answer does not belong to a sign-in started here (or it was already used). Nothing was saved. Press Connect again.",
    declined: "The sign-in was cancelled. Nothing was saved.",
    needs_admin: "STOP: Microsoft asks for admin approval. Do not grant it. Nothing was saved. Tell the lead.",
    blocked_by_policy: "STOP: the organisation's sign-in rules refused this sign-in. Nothing was saved. Tell the lead.",
    needs_secret: "The app's return address is registered under the wrong platform. It must be under Mobile and desktop applications. Nothing was saved.",
    redirect_not_registered: "The return address is not registered on HMG Wall Reader yet (plan step G4a). Nothing was saved.",
    not_configured: "The figures account is not set up on the server yet.",
    failed: "The sign-in did not work. Nothing was saved. Press Connect again." };
  function showSignin(st) { codeLine.textContent = SIGNIN_MSG[st] || SIGNIN_MSG.failed; codeLine.style.color = st === "done" ? "" : AMBER; accStatus(); }
  conn.onclick = async function () {
    try {
      var s = await call("wall-reader-signin", { action: "start" });
      if (s.state) return showSignin(s.state);
      var u = String(s.authorizeUrl || "");
      if (u.indexOf("https://login.microsoftonline.com/") !== 0) return showSignin("failed");   /* only ever to Microsoft */
      codeLine.style.color = ""; codeLine.textContent = "Going to Microsoft. Sign in there with the figures account (within 10 minutes).";
      location.href = u;
    } catch (e) { codeLine.textContent = e.message; codeLine.style.color = AMBER; }
  };
  /* back from Microsoft: console.html loads this box for a "wr." state. The address bar is cleaned at once, so the code and
     state are never kept in it; only the code, the state and Microsoft's error name and number go to the server. */
  (function signinReturn() {
    var q = window.WALL_SIGNIN_RETURN || null;
    if (!q) return;
    window.WALL_SIGNIN_RETURN = null;
    codeLine.style.color = ""; codeLine.textContent = "Checking the sign-in...";
    var body = { action: "callback", state: q.state };
    if (q.error) { body.error = q.error; body.errorCodes = q.errorCodes; } else body.code = q.code;
    call("wall-reader-signin", body).then(function (r) { showSignin(r.state); }, function (e) { codeLine.textContent = e.message; codeLine.style.color = AMBER; });
  })();
  async function paintHealth() {
    var r = await sb.from("screen_health").select("screen,last_seen,state,error_code,clock_offset_ms,clock_rtt_ms,feed_version");
    var rows = (r && r.data) || [];
    grid.textContent = "";
    L.screens().forEach(function (s) {
      var x = rows.find(function (q) { return q.screen === s; });
      var c = h("div", { "class": "cell", style: "font-size:14px;cursor:default" });
      c.appendChild(h("b", {}, s));
      var age = x ? Math.round((Date.now() - Date.parse(x.last_seen)) / 1000) : null;
      /* screens report with each feed call (every 5 minutes, plus a retry 30 s after a failure): silent only after 11 minutes,
         that is 2 lost calls in a row (checker_figs2 L4) */
      var line = !x ? "no report" : (age > 660 ? "silent " + Math.round(age / 60) + " min" : (x.state || "seen") + ", clock " + (x.clock_offset_ms == null ? "?" : "ok"));
      var d = h("div", { style: "font-size:14px" }, line);
      if (!x || age > 660 || x.state === "stale" || x.error_code) d.style.color = AMBER;
      c.appendChild(d);
      grid.appendChild(c);
    });
  }

  setTimeout(paintSettings, 1500); /* once: never overwrite what the admin is typing */
  /* while this tab is hidden the two status polls pause (Free plan egress, checker_figs2 M2); they run again when it is shown */
  /* screens report every 5 minutes and the figures job runs every 15 minutes: health every 2 minutes, figures status every 5 */
  accStatus(); setInterval(function () { if (!document.hidden) accStatus(); }, 300000);
  paintHealth(); setInterval(function () { if (!document.hidden) paintHealth(); }, 120000);
})();
