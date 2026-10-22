/* WALL COPY (WS-wall21 Phase 3) of src\wall21\design\story\v5\story5e_stories.js sha256 69abc542d270b8ed..., the approved round 5e design (D-243).
   Made by src\wall21\port\make_port_copies.js; do not edit by hand. Changes from the original: the patches listed there only. */
/* story5e_stories.js (same as story5d_stories.js, reads STORY_DATA5E) - the v5c wall stories (v5b plus: names under Starting / Ending today; Back in service back in the mission steps; units logged in a day): LIVE, EACH FIGURE ONCE, R1C1 CARRIES DATA (WS-wall21, designer). DATA-AGNOSTIC: no figures here.
   Reads window.STORY_DATA5E (made by gen_live_data_v4.py into an exports folder that stays on this PC) and window.STORY_GEO_PUBLIC.
   With no STORY_DATA5E every figure shows "--".
   - Each figure has ONE home: key figures live in the department panels; stories carry only what no panel shows
     (call and mission steps, the events map, the projects). Every figure text is drawn with a key, and the engine counts
     any key drawn twice in one frame (the duplicate scan).
   - No day labels and no comparisons with another day. The only time on the wall is "Updated HH:MM" on R1C1.
   - Key figures against their CONFIRMED Target only; within Target: department colour; over Target: amber; no value: "No data yet".
   - "lt5" (a count from 1 to 4) shows "Fewer than 5".
   LABELS: every key-figure and step name is the exact label FTM Overview shows. They come from its page data ('FTM Targets' rows
   inside FTM Strat Data, exports\wall_176_...\page_ftm_strat_data_yesterday.txt, character positions 4344-6863) and its script
   (src\ftmfm\current\strat_script.js, positions 7921 and 8994 for "calls", "missions completed", "cases dispatched";
   16333 / 19768 for "Running now"). Labels are fixed texts, not data. */
window.Story5eBuild = function (DATA) {
  "use strict";
  var S = window.Story5d; if (!S) return;
  S.reset();
  var LIVE = !!DATA;
  var D = DATA || { meta: {}, ecc: { stepMin: [] }, mt: { stepMin: [] }, events: { byCity: {}, projects: [], names: [] }, targets: { ecc: { step_min: [] }, mt: { step_min: [] } }, cities: {}, alias: {} };
  var PUB = window.STORY_GEO_PUBLIC || null;
  if (PUB) S.setOutline(PUB.outline);
  var T = S.T, C = S.C, COL = S.COL, LIGHT = S.LIGHT, INK = S.INK, INK2 = S.INK2, AMBER = S.AMBER, BRAND = S.BRAND;
  var clamp = S.clamp, ease = S.ease, easeOut = S.easeOut, lerp = S.lerp, hexA = S.hexA, glow = S.glow, dot = S.dot, at = S.at, win = S.win;
  var SW = S.SW, SH = S.SH, M = D.meta || {};

  /* fixed labels, exactly as FTM Overview shows them */
  var L = {
    ecc_answer: "Calls answered", ecc_service: "Calls answered in time", ecc_abandon: "Calls abandoned", ecc_dispatch: "Cases dispatched in time",
    ecc_steps: ["Call Processing", "Dispatch Activation", "Dispatch Processing", "Bed Availability", "Medical Endorsement", "Insurance Approval", "Dispatch Time"],
    fo_steps: ["Chute", "En route", "Response", "On scene", "Patient on scene", "Transfer preparation", "Transport", "Transfer of care", "Turnaround", "Back to station", "Back in service"],
    calls: "Calls", missions_completed: "Missions completed", cases_dispatched: "Cases dispatched", running_now: "Running now"
  };

  if (D.labels) ["ecc_answer", "ecc_service", "ecc_abandon", "ecc_dispatch", "ecc_steps", "fo_steps"].forEach(function (k) { if (D.labels[k]) L[k] = D.labels[k]; });
  function has(v) { return v !== null && v !== undefined && !(typeof v === "number" && isNaN(v)); }
  function n0(v) { return has(v) ? String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ",") : "--"; }
  function pc(v) { return has(v) ? (Math.round(v * 10) / 10).toFixed(1) + "%" : "--"; }
  function mn(v) { return has(v) ? (v % 1 ? (Math.round(v * 10) / 10).toFixed(1) : n0(v)) : "--"; }   /* minutes: a half minute stays visible */
  function fv(v) { return v === "lt5" ? "Fewer than 5" : n0(v); }
  function isSmall(v) { return v === "lt5"; }
  function nice(s) { s = String(s); return /^[A-Z0-9 -]+$/.test(s) && /[A-Z]{5}/.test(s) ? s.toLowerCase().replace(/(^|\s)[a-z]/g, function (m) { return m.toUpperCase(); }) : s; }
  var TE = (D.targets && D.targets.ecc) || {}, TM = (D.targets && D.targets.mt) || {};
  function tgtPct(v, lower) { return has(v) ? "Target " + v + "% " + (lower ? "or lower" : "or more") : ""; }
  function tgtMin(v) { return has(v) ? "Target " + v + " min or less" : ""; }
  var EC = D.ecc || {}, MT = D.mt || {}, EV = D.events || { byCity: {}, projects: [], names: [] };

  if (LIVE) {
    S.cfg.updated = M.updated || "--:--"; S.cfg.capFoot = "";
    S.cfg.headTitle = "Wall stories v5e with real figures (this PC only)";
    S.cfg.headSub = "Real figures from the model (reads 177, 179 and 180). Local preview: do not share. Click any screen to see it at true size.";
  }

  /* builders: key = the figure's one home */
  function big(head, key, val, sub, o) { var p = { k: "big", head: head, key: key, v: LIVE ? (has(val) && val !== "--" ? val : null) : "--", sub: (sub || []).filter(Boolean) }; for (var k in (o || {})) p[k] = o[k]; return p; }
  function cnt(head, key, v, sub) { if (isSmall(v)) { var p = big(head, key, "Fewer than 5", sub); p.text = true; p.px = 150; return p; } return big(head, key, has(v) ? n0(v) : null, sub); }
  function list(head, sub, rows, reveal) { return { k: "list", head: head, sub: sub, rows: rows, reveal: reveal }; }
  function note(head, lines) { return { k: "note", head: head, lines: lines.filter(Boolean) }; }
  function kpi(head, key, v, o) {
    var val = LIVE && has(v) && !isSmall(v) ? v : null;
    return { k: "kpi", head: head, key: key, v: val, small: LIVE && isSmall(v), txt: val === null ? "" : (o.pct ? pc(val) : mn(val)), unit: o.unit, tgt: o.tgt, lower: !!o.lower, max: o.max,
      chart: o.chart || "bullet", tgtTxt: o.pct ? tgtPct(o.tgt, o.lower) : tgtMin(o.tgt) };
  }

  /* ---------- department panels: the one home of every key figure ---------- */
  var H = S.HOME;
  H.R1C1 = kpi(L.ecc_answer, "ecc_answer", EC.answerPct, { pct: true, tgt: TE.answer_pct, max: 100, chart: "ring" });
  H.R1C2 = kpi(L.ecc_service, "ecc_service", EC.servicePct, { pct: true, tgt: TE.service_pct, max: 100 });
  H.R2C1 = kpi(L.ecc_abandon, "ecc_abandon", EC.abandonPct, { pct: true, tgt: TE.abandon_pct, lower: true, max: 20 });
  H.R2C2 = kpi(L.ecc_dispatch, "ecc_dispatch", EC.dispatchInTimePct, { pct: true, tgt: TE.dispatch_in_time_pct, max: 100 });
  H.R3C1 = cnt(L.calls, "ecc_calls", EC.calls, []);
  H.R3C2 = { k: "steps", head: "Call steps", rows: L.ecc_steps.map(function (n, i) { return { name: n, key: "ecc_step_0" + (i + 1), v: LIVE && has((EC.stepMin || [])[i]) && !isSmall(EC.stepMin[i]) ? EC.stepMin[i] : null, small: LIVE && isSmall((EC.stepMin || [])[i]), tgt: (TE.step_min || [])[i] }; }) };
  H.R1C3 = cnt(L.missions_completed, "mt_done", MT.missionsCompleted, ["So far today"]);
  H.R1C4 = cnt(L.cases_dispatched, "mt_disp", MT.missionsDispatched, ["So far today"]);
  var FO_KEYS = L.fo_steps.map(function (x, i) { return "fo_step_" + (i < 9 ? "0" : "") + (i + 1); });
  /* units logged in a day (read 180, the FO Operations Overview card's own label mt_units_label): a count of units, not patients,
     so its real number shows; no Target; no day label (D-239); blank means "No data yet", never 0 */
  var UD = MT.unitsOnDuty, UL = MT.unitsLabel || "Units logged in a day";
  H.R1C5 = UD === null || UD === undefined || !LIVE ? { k: "kpi", head: UL, key: "mt_units", v: null, chart: "none" } : big(UL, "mt_units", n0(UD), []);
  H.R1C6 = cnt(L.running_now, "ev_running", EV.running, ["Events"]);
  H.R1C7 = cnt("Cities", "ev_cities", LIVE ? EV.cities : null, ["With events running now"]);
  H.R2C6 = cnt("Projects", "ev_projects", EV.projectCount, ["With events running now"]);
  function named(list) { return (list || []).map(function (n) { return n ? [nice(n), "evname:" + n] : ["1 event", null]; }); }
  var START = EV.startList || [], ENDL = EV.endList || [], SHOWN = {};
  START.forEach(function (n) { if (n) SHOWN[n] = 1; });
  var endOwn = ENDL.filter(function (n) { return !n || !SHOWN[n]; }), endAlso = ENDL.length - endOwn.length;
  endOwn.forEach(function (n) { if (n) SHOWN[n] = 1; });
  H.R2C7 = { k: "countlist", head: "Starting today", key: "ev_starting", v: LIVE ? EV.starting : null, names: named(START) };
  H.R3C6 = { k: "countlist", head: "Ending today", key: "ev_ending", v: LIVE ? EV.ending : null, names: named(endOwn),
    extra: endAlso ? [endAlso === 1 ? "and 1 event that also starts today" : "and " + endAlso + " events that also start today"] : [] };
  H.R3C7 = list(L.running_now, "Other events", (EV.names || []).filter(function (n) { return !SHOWN[n]; }).slice(0, 6).map(function (n) { return [nice(n), "", "", "evname:" + n]; }));

  function stroke(g, col, w, a) { g.strokeStyle = hexA(col, a); g.lineWidth = w; g.lineCap = "round"; g.lineJoin = "round"; }
  function beat() { return C.stale ? 0 : Math.pow(Math.max(0, Math.sin(C.T * 2 * Math.PI)), 12); }
  var CAP_SIDE = { screen: "R2C3", x: 90, y: 90, w: 1440, h: 900 };
  function noData(g, id, k) { var nd = at(id, 960, 560); T(g, S.NODATA_TXT, nd[0], nd[1], 84, { c: INK, a: "center", al: k }); }
  function ringAnchors(cx, cy, r, n) { var o = []; for (var i = 0; i < n; i++) { var a = i / n * 6.2832; o.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return o; }
  /* light from the core to the department's own panels: the story animates the panels themselves, it never redraws their figures */
  function spotlight(g, d, k) {
    var core = S.coreAt(), ids = { ecc: ["R1C1", "R1C2", "R2C1", "R2C2", "R3C1", "R3C2"], mt: ["R1C3", "R1C4", "R1C5"], fm: ["R1C6", "R1C7", "R2C6", "R2C7", "R3C6", "R3C7"] }[d];
    ids.forEach(function (id, i) {
      var w = win(id), p = [w.x + (d === "ecc" ? SW - 120 : 960), w.y + (d === "mt" ? SH - 100 : 540)], pts = S.arcPts([core.x, core.y], p, i % 2 ? 0.16 : -0.16, 20);
      S.comet(g, function (q) { return S.along(pts, q); }, (C.T * 0.2 + i / ids.length) % 1, 0.3, COL[d], 0.55 * k, 22);
    });
  }
  /* one step row: its label, its minutes (or "No data yet") and a bullet bar against its confirmed Target */
  function stepRow(g, x0, y0, w, h, i, name, key, v, tgt, d, k) {
    var small = isSmall(v); if (small) v = null;
    var has0 = has(v) && !C.nodata && LIVE, over = has0 && has(tgt) && v > tgt, col = COL[d], mx = has(tgt) ? tgt * 2 : 10, mid = y0 + h / 2;
    S.glass(g, x0, y0, w, h, COL[d], 0.15, k);
    T(g, (i + 1) + ". " + name, x0 + 60, y0 + h * 0.36, 56, { w: 600, al: k, maxW: 780, where: "step" });
    if (has0) T(g, mn(v) + " min", x0 + 60, y0 + h * 0.78, 84, { w: 700, c: "#FFFFFF", al: k, where: "step", key: key });
    else T(g, C.nodata ? S.NODATA_TXT : "No data yet", x0 + 60, y0 + h * 0.76, 50, { c: INK2, al: k, maxW: 760, where: "step" });
    var bx = x0 + 880, bw = w - 940, by = mid - 24, f = has0 ? clamp(v / mx, 0, 1) : 0, tx = bx + bw * (has(tgt) ? clamp(tgt / mx, 0, 1) : 0.5);
    g.globalAlpha = k; S.rrect(g, bx, by, bw, 40, 10); g.fillStyle = "rgba(255,255,255,0.10)"; g.fill();
    g.fillStyle = hexA(COL[d], 0.14); g.fillRect(bx, by, tx - bx, 40);
    if (f > 0) { S.rrect(g, bx, by + 6, Math.max(12, bw * f), 28, 8); g.fillStyle = col; g.fill(); }
    g.fillStyle = "#FFFFFF"; g.fillRect(tx - 4, by - 18, 8, 76); g.globalAlpha = 1;
    if (over) { var vx = bx + bw * f; g.setLineDash([12, 10]); g.lineWidth = 4; g.strokeStyle = hexA(col, k); g.strokeRect(tx, by + 4, vx - tx, 32); g.setLineDash([]); }
    if (has(tgt)) T(g, (over ? "Above Target " : "Target ") + tgt + " min", tx, by + 100, 44, { a: "center", w: over ? 700 : 400, c: over ? col : INK, al: k, where: "step" });
  }
  function steps(g, u, k, slots, names, keys, vals, tgts, d, rowsPer) {
    var h = rowsPer === 4 ? 220 : 290, gap = rowsPer === 4 ? 240 : 320;
    slots.forEach(function (s, i) {
      var w = win(s[0]), kk = k * easeOut((u - 1.4 - i * 0.15) / 0.8);
      if (kk > 0.01) stepRow(g, w.x + 80, w.y + 50 + s[1] * gap, 1760, h, i, names[i], keys[i], vals[i], tgts[i], d, kk);
    });
  }

  /* ======================= 1. Emergency Command Center: the journey of a call (labels only; the figures stay in their panels) ======================= */
  var ST = [["R3C3", 520], ["R3C3", 1400], ["R3C4", 400], ["R3C4", 960], ["R3C4", 1520], ["R3C5", 520], ["R3C5", 1400]];
  function stations() { return ST.map(function (s) { return at(s[0], s[1], 430); }); }
  var ECC_UNDER = has(EC.answerPct) && has(TE.answer_pct) && EC.answerPct < TE.answer_pct;
  S.add({
    id: "ecc", dept: "ecc", label: "Emergency Command Center", dur: 20, peek: 11, cap: CAP_SIDE, keepCore: true,
    title: "Emergency Command Center", point: "The journey of a call: seven steps, each against its Target",
    more: [LIVE && ECC_UNDER ? L.ecc_answer + " is under its Target" : "", "Step times are on the Call steps panel"].filter(Boolean),
    panels: function () { return {}; },
    anchors: function () { return stations(); },
    draw: function (g, u, k) {
      if (k <= 0.01) return;
      spotlight(g, "ecc", k);
      var st = stations(), core = S.coreAt(), nodes = [[core.x, core.y + 420]].concat(st).concat([at("R1C5", 960, 1000)]), legs = [], b = beat();
      for (var i = 0; i < nodes.length - 1; i++) legs.push(S.arcPts(nodes[i], nodes[i + 1], i % 2 ? 0.14 : -0.14, 22));
      var tt = (u - 2) / 13, seg = clamp(tt, 0, 1) * legs.length, li = Math.min(legs.length - 1, Math.floor(seg)), lf = seg - li;
      legs.forEach(function (l, i) { stroke(g, COL.ecc, 6, 0.22 * k); S.polyline(g, l, 1); if (i < li || (i === li && tt > 0)) { stroke(g, LIGHT.ecc, 6, 0.8 * k); S.polyline(g, l, i < li ? 1 : lf); } });
      st.forEach(function (p, i) {
        var visited = tt > 0 && i < li, here = i === li - 1 && lf < 0.4;
        g.globalCompositeOperation = "lighter"; if (visited) glow(g, COL.ecc, p[0], p[1], 130 + (here ? 40 * b : 0), 0.5 * k); g.globalCompositeOperation = "source-over";
        dot(g, p[0], p[1], 64, "#0d1726", 0.95 * k);
        stroke(g, visited ? LIGHT.ecc : COL.ecc, 6, (visited ? 1 : 0.6) * k); g.beginPath(); g.arc(p[0], p[1], 64, 0, 6.2832); g.stroke();
        T(g, String(i + 1), p[0], p[1] + 22, 60, { w: 600, a: "center", c: "#FFFFFF", al: k, where: "stn" });
        T(g, L.ecc_steps[i], p[0], p[1] + 160, 50, { w: 600, a: "center", al: k, maxW: 520, min: 38, where: "stn" });
        T(g, "Target " + ((TE.step_min || [])[i] !== undefined ? TE.step_min[i] : "--") + " min", p[0], p[1] + 230, 42, { a: "center", c: INK2, al: k, where: "stn" });
      });
      if (tt > 0 && tt < 1) { var hp = S.along(legs[li], ease(lf)); g.globalCompositeOperation = "lighter"; glow(g, COL.ecc, hp[0], hp[1], 110 + 30 * b, k); glow(g, "#FFFFFF", hp[0], hp[1], 44, k); g.globalCompositeOperation = "source-over"; }
    }
  });

  /* ======================= 2. Medical Transport: the mission steps (Back in service has its own panel) ======================= */
  var MT_SLOTS = [["R2C5", 0], ["R2C5", 1], ["R2C5", 2], ["R3C5", 0], ["R3C5", 1], ["R3C5", 2], ["R3C4", 0], ["R3C4", 1], ["R3C4", 2], ["R3C3", 0], ["R3C3", 1]];
  S.add({
    id: "mt", dept: "mt", label: "Medical Transport", dur: 20, peek: 10, cap: CAP_SIDE, keepCore: true,
    title: "Medical Transport", point: "Mission steps, each against its Target",
    more: [L.missions_completed + " and " + L.cases_dispatched.toLowerCase() + " count up through the day"],
    panels: function () { return {}; },
    anchors: function () { return ringAnchors(S.coreAt().x, S.coreAt().y, 300, 60); },
    draw: function (g, u, k) {
      if (k <= 0.01) return;
      spotlight(g, "mt", k);
      steps(g, u, k, MT_SLOTS, L.fo_steps, FO_KEYS, MT.stepMin || [], TM.step_min || [], "mt", 3);
      var w = win("R3C3"); T(g, "Mission steps", w.x + 140, w.y + 760, 60, { w: 600, c: LIGHT.mt, al: k, where: "steps" });
      T(g, "Typical minutes per step; the white mark is its Target", w.x + 140, w.y + 840, 48, { c: INK2, al: k, maxW: 1640, where: "steps" });
    }
  });

  function bigRect() { var a = win("R1C4"), b = win("R3C5"); return { x: a.x, y: a.y, w: b.x + SW - a.x, h: b.y + SH - a.y }; }
  function bigBox() { var r = bigRect(); return { x: r.x + 60, y: r.y + 60, w: r.w - 120, h: r.h - 120 }; }
  function clipR(g, r) { g.beginPath(); g.rect(r.x, r.y, r.w, r.h); g.clip(); }
  function cityName(c) { return (D.alias && D.alias[c]) || c; }
  function cityP(v, c) { var p = D.cities && D.cities[cityName(c)]; return p ? S.P(v, p.lon, p.lat) : null; }
  function flyView(u, t0) {   /* fly in from far out and turned, settle flat on the country */
    var cv = S.countryView(bigBox()), core = S.coreAt(), far = S.view(cv.clon + 6, cv.clat - 4, cv.k * 0.12, core.x, core.y, -0.7);
    return S.mixView(far, cv, easeOut((u - t0) / 2.8));
  }
  function fitView(pts, box, pad, kmax) {
    var x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, L0 = Math.cos(24 * Math.PI / 180);
    pts.forEach(function (p) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
    var k = Math.min(box.w * pad / Math.max(0.02, (x1 - x0) * L0), box.h * pad / Math.max(0.02, y1 - y0), kmax);
    return S.view((x0 + x1) / 2, (y0 + y1) / 2, k, box.x + box.w / 2, box.y + box.h / 2);
  }
  function grid(g, v, a) {   /* faint latitude / longitude lines give the map depth */
    stroke(g, BRAND, 2, 0.08 * a);
    for (var lon = 34; lon <= 56; lon += 2) { var p0 = S.P(v, lon, 15), p1 = S.P(v, lon, 33); g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.stroke(); }
    for (var lat = 15; lat <= 33; lat += 2) { var q0 = S.P(v, 34, lat), q1 = S.P(v, 56, lat); g.beginPath(); g.moveTo(q0[0], q0[1]); g.lineTo(q1[0], q1[1]); g.stroke(); }
  }
  var MAPHIDE = ["R1C4", "R1C5"];
  function inMap(items) { var r = bigRect(); return items.filter(function (it) { return it.x > r.x + 40 && it.x < r.x + r.w - 40 && it.y > r.y + 40 && it.y < r.y + r.h - 40; }); }

  /* ======================= 3. Events across the Kingdom (FM map): the one home of the counts by city ======================= */
  var CITIES = Object.keys(EV.byCity || {}).sort(function (a, b) { var x = EV.byCity[a], y = EV.byCity[b]; x = isSmall(x) ? 2.5 : x; y = isSmall(y) ? 2.5 : y; return y - x || (a < b ? -1 : 1); });
  function evn(c) { var v = EV.byCity[c]; return isSmall(v) ? 2.5 : (v || 0); }
  var EMAX = CITIES.length ? evn(CITIES[0]) : 1;
  S.add({
    id: "fm_map", dept: "fm", label: "Events across the Kingdom", dur: 24, peek: 15, cap: CAP_SIDE, hide: MAPHIDE,
    title: "Events across the Kingdom", point: CITIES.length ? "Busiest city: " + CITIES[0] : "Events running now",
    more: ["Each column is a city with events running now; it rises with the number of events"],
    panels: function () { return {}; },
    anchors: function () { return S.outlineAnchors(S.countryView(bigBox())); },
    draw: function (g, u, k) {
      if (k <= 0.01) return;
      var fv0 = flyView(u, 1.2), b = beat(), rc = CITIES[0] && D.cities[cityName(CITIES[0])], zoom = rc ? S.view(rc.lon, rc.lat, S.countryView(bigBox()).k * 2.2, bigBox().x + bigBox().w / 2, bigBox().y + bigBox().h * 0.5) : fv0;
      var e = rc ? ease((u - 10.5) / 1.8) - ease((u - 15) / 1.6) : 0, v = S.mixView(fv0, zoom, e);
      g.save(); clipR(g, bigRect());
      grid(g, v, k);
      S.drawOutline(g, v, (u - 1.6) / 2.6, k);
      Object.keys(D.cities || {}).forEach(function (c) { var p = cityP(v, c); if (p) dot(g, p[0], p[1], 9, COL.fm, 0.45 * k * ease((u - 3) / 1)); });
      if (!C.nodata) {
        var core = S.coreAt();
        CITIES.forEach(function (c, n) {
          var p = cityP(v, c); if (!p) return;
          var r = ease((u - 4.2 - n * 0.5) / 1.4), small = isSmall(EV.byCity[c]), hgt = (small ? 140 : 180 + 520 * Math.sqrt(evn(c) / EMAX)) * (1 + 0.6 * e);
          if (r <= 0) return;
          var gr = g.createLinearGradient(0, p[1] - hgt * r, 0, p[1]); gr.addColorStop(0, hexA(COL.fm, 0)); gr.addColorStop(1, hexA(COL.fm, 0.8 * k));
          g.fillStyle = gr; g.fillRect(p[0] - 10, p[1] - hgt * r, 20, hgt * r);
          g.globalCompositeOperation = "lighter";
          glow(g, COL.fm, p[0], p[1], 90 + (n === 0 ? 40 * b + 40 : 0), k * r); glow(g, "#FFFFFF", p[0], p[1] - hgt * r, 40, k * r);
          var orb = small ? 3 : Math.min(24, evn(c));
          for (var j = 0; j < orb; j++) { var an = C.T * 0.7 + j * 6.2832 / orb + n, q2 = [p[0] + Math.cos(an) * (90 + 40 * e), p[1] + Math.sin(an) * (34 + 16 * e) - 20]; glow(g, small ? LIGHT.fm : "#FFFFFF", q2[0], q2[1], small ? 18 : 24, k * r * (small ? 0.6 : 1)); }
          g.globalCompositeOperation = "source-over";
          if (u > 3.5 && u < 9) { var pts = S.arcPts([core.x, core.y], p, 0.3, 20), tt = clamp((u - 3.5 - n * 0.4) / 1.6, 0, 1); if (tt > 0 && tt < 1) S.comet(g, function (q) { return S.along(pts, q); }, tt, 0.35, COL.fm, k, 30); }
        });
      }
      g.restore();
      var items = [];
      if (!C.nodata) CITIES.forEach(function (c, n) { var p = cityP(v, c); if (p) items.push({ x: p[0], y: p[1], s: c + (isSmall(EV.byCity[c]) ? ": fewer than 5" : ": " + fv(EV.byCity[c])), px: n === 0 ? 60 : 48, bg: true, force: n === 0, c: n === 0 ? "#FFFFFF" : INK, off: 90, edge: COL.fm, key: "evcity:" + c }); });
      S.placeLabels(g, inMap(items), k * ease((u - 5) / 1), bigRect());
      if (C.nodata) noData(g, "R2C4", k);
    }
  });

  /* ======================= 4. Projects with us now (FM): the one home of the project names, around the core ======================= */
  var PRJ = (EV.projects || []).map(nice), RAW = EV.projects || [];
  var SLOTS = [["R3C4", 420, 300], ["R3C4", 1500, 300], ["R2C5", 520, 330], ["R2C5", 1400, 330], ["R2C5", 960, 760],
    ["R3C3", 520, 330], ["R3C3", 1400, 330], ["R3C3", 960, 760], ["R3C4", 960, 700], ["R2C5", 960, 120],
    ["R3C5", 520, 330], ["R3C5", 1400, 330], ["R3C5", 960, 760]];
  function slotP(i) { var s = SLOTS[i % SLOTS.length]; return at(s[0], s[1], s[2]); }
  S.add({
    id: "fm_projects", dept: "fm", label: "Projects with us now", dur: 20, peek: 12, cap: CAP_SIDE, keepCore: true,
    title: "Projects with us now", point: "Every project with an event running now", more: [],
    panels: function () { return {}; },
    anchors: function () { return ringAnchors(S.coreAt().x, S.coreAt().y, 300, 60); },
    draw: function (g, u, k) {
      if (k <= 0.01) return;
      if (C.nodata || !LIVE) { noData(g, "R2C5", k); return; }
      var core = S.coreAt(), b = beat(), n = Math.min(PRJ.length, SLOTS.length);
      for (var i = 0; i < n; i++) {
        var p = slotP(i), d = easeOut((u - 2 - i * 0.3) / 1), hot = Math.floor((C.T * 0.8) % n) === i;
        if (d <= 0) continue;
        var pts = S.arcPts([core.x, core.y], p, i % 2 ? 0.2 : -0.2, 18);
        stroke(g, COL.fm, 3, 0.25 * k * d); S.polyline(g, pts, d);
        S.comet(g, function (q) { return S.along(pts, q); }, (C.T * 0.3 + i / n) % 1, 0.3, LIGHT.fm, 0.8 * k * d, 22);
        g.globalCompositeOperation = "lighter"; glow(g, COL.fm, p[0], p[1], 120 + (hot ? 40 * b + 40 : 0), k * d); g.globalCompositeOperation = "source-over";
        dot(g, p[0], p[1], 34, hot ? "#FFFFFF" : LIGHT.fm, k * d);
        T(g, PRJ[i], p[0], p[1] + 120, 54, { w: 600, a: "center", c: hot ? "#FFFFFF" : INK, al: k * d, maxW: 860, min: 40, where: "project", key: "proj:" + RAW[i] });
      }
      if (PRJ.length > SLOTS.length) T(g, "and " + (PRJ.length - SLOTS.length) + " more", at("R3C5", 960, 1000)[0], at("R3C5", 0, 1000)[1], 48, { a: "center", c: INK2, al: k, where: "project" });
    }
  });
};
