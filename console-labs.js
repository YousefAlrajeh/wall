/* console-labs.js - "Wall pages (testing)" box. Loaded only when the console is opened as console.html?labs=1
   by a signed-in admin. Without ?labs=1 the console is exactly as before.
   - the feature switch settings.data.canvasPages and the bezel / safe margin (settings.data.wallLayout)
   - one-time sign-in of the figures account (function wall-reader-signin; no token ever comes back here)
   - one-time link per screen PC with its own device secret (function wall-device-enroll)
   - screen health grid (table screen_health, admins only)
   All text is set with textContent. */
(function () {
  "use strict";
  var C = window.WALLCFG, sb = window.sb, L = window.WallLayout;
  var FN = String(C.SUPA_URL).replace(/\/$/, "") + "/functions/v1/";
  var AMBER = "#F0A04A";

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
  r1.appendChild(sw); r1.appendChild(h("label", { "for": "labsOn" }, "Use wall pages, shared clock and figures (off = the wall works exactly as today)"));
  box.appendChild(r1);
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

  /* device links */
  var r4 = h("div", { "class": "row" });
  r4.appendChild(h("label", { style: "width:170px" }, "Screen PC link"));
  var scrSel = h("select", { style: css });
  L.screens().forEach(function (s) { scrSel.appendChild(h("option", { value: s }, s)); });
  r4.appendChild(scrSel);
  var mk = h("button", { style: css }, "Make one-time link for this screen");
  r4.appendChild(mk);
  box.appendChild(r4);
  var linkOut = h("input", { readonly: "readonly", style: "width:100%;" + css });
  var linkNote = h("div", { style: "font-size:14px;color:var(--dim)" }, "");
  box.appendChild(linkOut); box.appendChild(linkNote);

  /* health grid */
  box.appendChild(h("div", { style: "margin-top:10px" }, "Screen health"));
  var grid = h("div", { "class": "wallgrid" });
  box.appendChild(grid);

  document.querySelector(".grid").appendChild(box);

  function paintSettings() {
    var st = window.ST_settings && window.ST_settings(); var d = (st && st.data) || {};
    sw.checked = d.canvasPages === true;
    var wl = d.wallLayout || {};
    bz.value = String(wl.bezelPx != null ? wl.bezelPx : L.DEFAULT_BEZEL_PX);
    sf.value = String(wl.safePx != null ? wl.safePx : L.DEFAULT_SAFE_PX);
  }
  save.onclick = async function () {
    var cur = await sb.from("settings").select("data").eq("id", "main").single();
    if (cur.error) return alert("Could not read the settings");
    var d = Object.assign({}, cur.data.data || {}, { canvasPages: sw.checked,
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
        " " + (j.lastRun.result === "SUCCESS" ? "worked" : j.lastRun.result === "UNCHANGED" ? "found no new refresh" : "stopped (" + (j.lastRun.reason || "unknown") + ")");
      acc.textContent = t; acc.style.color = j.connected ? "" : AMBER;
    } catch (e) { acc.textContent = e.message; acc.style.color = AMBER; }
  }
  conn.onclick = async function () {
    try {
      var s = await call("wall-reader-signin", { action: "start" });
      if (s.state === "not_configured") { codeLine.textContent = "The figures account is not set up on the server yet."; codeLine.style.color = AMBER; return; }
      codeLine.style.color = AMBER;
      codeLine.textContent = "On any device, open " + s.verificationUri + " and enter the code " + s.userCode + ", then sign in with the figures account. This box updates by itself.";
      var until = Date.now() + s.expiresIn * 1000;
      (function poll() {
        setTimeout(async function () {
          var p; try { p = await call("wall-reader-signin", { action: "poll" }); } catch (e) { p = { state: "failed" }; }
          if (p.state === "waiting" && Date.now() < until) return poll();
          var msg = { done: "Connected. The figures job can now run.", wrong_account: "That was not the expected account. Nothing was saved. Try again with the figures account.",
            expired: "The code ran out. Press Connect again.", declined: "The sign-in was cancelled.", none: "No sign-in in progress.", failed: "The sign-in did not work. Press Connect again." }[p.state] || "The sign-in did not work.";
          codeLine.textContent = msg; codeLine.style.color = p.state === "done" ? "" : AMBER; accStatus();
        }, (s.interval || 5) * 1000);
      })();
    } catch (e) { codeLine.textContent = e.message; codeLine.style.color = AMBER; }
  };
  mk.onclick = async function () {
    var scr = scrSel.value;
    if (!confirm("Make a new link for " + scr + "? The old link for this screen stops working for figures.")) return;
    try {
      var j = await call("wall-device-enroll", { screen: scr });
      linkOut.value = C.SITE + "/player.html?s=" + scr + "&k=" + encodeURIComponent(C.SCREEN_KEY) + "&d=" + encodeURIComponent(j.deviceSecret);
      linkNote.textContent = "Open this link once on the " + scr + " PC. It is shown only now and is not kept anywhere else; the PC remembers it.";
    } catch (e) { linkNote.textContent = e.message; linkNote.style.color = AMBER; }
  };

  async function paintHealth() {
    var r = await sb.from("screen_health").select("screen,last_seen,state,error_code,clock_offset_ms,clock_rtt_ms,feed_version");
    var rows = (r && r.data) || [];
    grid.textContent = "";
    L.screens().forEach(function (s) {
      var x = rows.find(function (q) { return q.screen === s; });
      var c = h("div", { "class": "cell", style: "font-size:14px;cursor:default" });
      c.appendChild(h("b", {}, s));
      var age = x ? Math.round((Date.now() - Date.parse(x.last_seen)) / 1000) : null;
      var line = !x ? "no report" : (age > 180 ? "silent " + Math.round(age / 60) + " min" : (x.state || "seen") + ", clock " + (x.clock_offset_ms == null ? "?" : "ok"));
      var d = h("div", { style: "font-size:14px" }, line);
      if (!x || age > 180 || x.state === "stale" || x.error_code) d.style.color = AMBER;
      c.appendChild(d);
      grid.appendChild(c);
    });
  }

  setTimeout(paintSettings, 1500); /* once: never overwrite what the admin is typing */
  accStatus(); setInterval(accStatus, 60000);
  paintHealth(); setInterval(paintHealth, 30000);
})();
