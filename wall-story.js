/* wall-story.js - the approved wall design (round 5e, D-243) as a wall page: content kind "wallpage:story" with
   "engine": "story5" in wallpages/story.json. Loaded only when the switch settings.data.canvasPages is on AND a screen
   shows that page; with the switch off nothing here is ever loaded.
   Each screen draws only its own 1920x1080 window of the one shared wall scene (WallLayout.windowFor, bezel aware), at
   the wall time of the shared clock, so all 21 screens move together. The engine and the stories are the approved files
   (wallstory/, see src\wall21\port\make_port_copies.js); this file only turns the checked snapshot into their data
   and runs the frame loop. No figure, label or name is written here.
   Snapshot pages used: ecc1d, mt1d (read 179), mtunits (read 180), fmevents (events running today, D-238 / D-241).
   Classic script: window.WallStory in a browser, module.exports in Node. */
(function (root) {
  "use strict";
  var TZ_MIN = 180;            /* Riyadh, UTC+3 all year */
  var APPLY_LAG_MS = 360000;   /* a new snapshot is shown at fetched_at + 6 min on every screen at once (screens poll every
                                  5 minutes, Free plan quota: one poll interval plus 1 minute for slow answers) */

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function hhmm(ms) { var d = new Date(ms + TZ_MIN * 60000); return pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes()); }
  function has(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }
  function lower(a, b) { var x = String(a).toLowerCase(), y = String(b).toLowerCase(); return x < y ? -1 : (x > y ? 1 : 0); }

  /* snapshot -> the stories' data object; the same rules as the designer's generator gen_live_data_v5e.py:
     a share or time withheld for fewer than 5 cases is "lt5"; a count flagged 1-4 is "lt5"; blank stays null (never 0);
     event and project counts are real (D-241); a withheld event (D-238) keeps no name and counts as "1 event". */
  function fromSnapshot(snap, o) {
    o = o || {};
    if (!snap || !snap.pages || typeof snap.pages !== "object") return null;
    var P = snap.pages, E = P.ecc1d, M = P.mt1d, U = P.mtunits, V = P.fmevents, geo = o.geo || root.STORY_GEO_PUBLIC || { cities: [], alias: {} };
    function val(p, key) { if (!p) return null; if (p[key + "_n_lt5"] === 1) return "lt5"; var v = p[key]; return v === null || v === undefined ? null : v; }
    function cnt(p, key) { if (!p) return null; if (p[key + "_lt5"] === 1) return "lt5"; var v = p[key]; if (v === null || v === undefined) return null; return v >= 1 && v <= 4 ? "lt5" : v; }
    var i, steps7 = [], steps11 = [];
    var ecc = { calls: cnt(E, "ecc_calls_d1"), answerPct: val(E, "ecc_answer_pct_d1"), servicePct: val(E, "ecc_service_pct_d1"), abandonPct: val(E, "ecc_abandon_pct_d1"),
      dispatchInTimePct: val(E, "ecc_dispatch_in_time_pct_d1"), stepMin: [] };
    for (i = 1; i <= 7; i++) ecc.stepMin.push(val(E, "ecc_step0" + i + "_min_d1"));
    var mt = { missionsCompleted: cnt(M, "mt_missions_completed_t"), missionsDispatched: cnt(M, "mt_missions_dispatched_t"), stepMin: [] };
    for (i = 1; i <= 11; i++) mt.stepMin.push(val(M, "mt_step" + pad(i) + "_min_t"));
    mt.unitsOnDuty = U && has(U, "mt_units_on_duty_t") ? U.mt_units_on_duty_t : null;
    mt.unitsLabel = U && U.mt_units_label ? U.mt_units_label : null;
    var labels = null, targets = { ecc: { step_min: [] }, mt: { step_min: [] } };
    if (E && M) {
      for (i = 1; i <= 7; i++) steps7.push(E["ecc_step0" + i + "_label"]);
      for (i = 1; i <= 11; i++) steps11.push(M["mt_step" + pad(i) + "_label"]);
      labels = { ecc_answer: E.ecc_answer_pct_label, ecc_service: E.ecc_service_pct_label, ecc_abandon: E.ecc_abandon_pct_label,
        ecc_dispatch: E.ecc_dispatch_in_time_pct_label, ecc_steps: steps7, fo_steps: steps11 };
    }
    if (E) {
      targets.ecc = { answer_pct: E.tgt_ecc_answer_pct, service_pct: E.tgt_ecc_service_pct, abandon_pct: E.tgt_ecc_abandon_pct, dispatch_in_time_pct: E.tgt_ecc_dispatch_in_time_pct, step_min: [] };
      for (i = 1; i <= 7; i++) targets.ecc.step_min.push(E["tgt_ecc_step0" + i + "_min"]);
    }
    if (M) { for (i = 1; i <= 11; i++) targets.mt.step_min.push(M["tgt_mt_step" + pad(i) + "_min"]); }
    var events;
    if (V && Array.isArray(V.rows)) {
      var evs = [];
      V.rows.forEach(function (r) {
        var today = r.d_today, hold = r.withheld === 1;
        evs.push({ c: r.city || "No city", n: hold || !r.zone ? null : r.zone, p: hold || !r.project ? null : r.project, st: r.start_day === today, en: r.end_day === today });
      });
      var byCity = {}, pset = {}, nset = {};
      evs.forEach(function (e) { byCity[e.c] = (byCity[e.c] || 0) + 1; if (e.p) pset[e.p] = 1; if (e.n) nset[e.n] = 1; });
      var projects = Object.keys(pset).sort(lower);
      /* the counts are FTM Overview's own (allow-list v2.1: projects_today, cities_today on every row, [FTM Ach Volumes] ev_proj and
         ev_city for today): withheld and blank names still count, and city spellings are not merged in the count; the D-234 merge
         shows on the map labels only (byCity). Without those columns (v2 rows) the counts fall back to the rows themselves. */
      var r0 = V.rows[0] || {}, hasC = has(r0, "projects_today") && has(r0, "cities_today");
      events = { running: evs.length, cities: hasC ? r0.cities_today : (V.rows.length ? Object.keys(byCity).length : 0), byCity: byCity,
        starting: evs.filter(function (e) { return e.st; }).length, ending: evs.filter(function (e) { return e.en; }).length,
        projects: projects, projectCount: hasC ? r0.projects_today : projects.length, names: Object.keys(nset).sort(lower),
        startList: evs.filter(function (e) { return e.st; }).map(function (e) { return e.n; }), endList: evs.filter(function (e) { return e.en; }).map(function (e) { return e.n; }) };
    }
    var cities = {};
    (geo.cities || []).forEach(function (c) { cities[c.id] = { lat: c.lat, lon: c.lon }; });
    var data = { meta: { updated: o.updated || "--:--" }, ecc: ecc, mt: mt, labels: labels, targets: targets, cities: cities, alias: geo.alias || {} };
    if (events) data.events = events;
    return data;
  }

  function el(doc, tag, css, text) { var e = doc.createElement(tag); for (var k in css) e.style[k] = css[k]; if (text !== undefined) e.textContent = text; return e; }

  /* mounts the story page for one screen. ctx: {screen, layout, now, feed, doc?, raf?, caf?, setInterval?, clearInterval?, mode?}
     mode "blank" (tests and previews only): no data, figures show "--", exactly like the blank design preview. */
  function mount(container, page, ctx) {
    var S = root.Story5d, L = ctx.layout, doc = ctx.doc || root.document, screen = ctx.screen;
    if (!S || !root.Story5eBuild) throw new Error("story engine not loaded");
    var raf = ctx.raf || function (f) { return root.requestAnimationFrame(f); };
    var caf = ctx.caf || function (h) { return root.cancelAnimationFrame(h); };
    var setIv = ctx.setInterval || function (f, ms) { return root.setInterval(f, ms); };
    var clrIv = ctx.clearInterval || function (h) { return root.clearInterval(h); };
    var alive = true, rafH = null, ivH = null;
    var info = { frames: 0, msSum: 0, msMax: 0, last: 0, applied: 0, version: 0, builds: 0, state: "starting" };
    var CFG0 = JSON.parse(JSON.stringify({ updated: S.cfg.updated, capFoot: S.cfg.capFoot, headTitle: S.cfg.headTitle, headSub: S.cfg.headSub }));
    S.cfg.markUrls = { ecc: "wallstory/HMG_mark_ECC.svg", mt: "wallstory/HMG_mark_Field_Operations.svg", fm: "wallstory/HMG_mark_Field_Medicine.svg" };
    if (ctx.markBase) for (var mk in S.cfg.markUrls) S.cfg.markUrls[mk] = ctx.markBase + S.cfg.markUrls[mk];
    S.loadMarks();

    var cw = container.clientWidth || L.SCREEN_W, ch = container.clientHeight || L.SCREEN_H;
    var rootEl = el(doc, "div", { position: "absolute", left: "0", top: "0", width: L.SCREEN_W + "px", height: L.SCREEN_H + "px", overflow: "hidden",
      transformOrigin: "0 0", transform: "scale(" + (cw / L.SCREEN_W) + "," + (ch / L.SCREEN_H) + ")", background: "#04020a" });
    rootEl.className = "ws-root";
    var cv = el(doc, "canvas", { position: "absolute", left: "0", top: "0", width: L.SCREEN_W + "px", height: L.SCREEN_H + "px" });
    cv.width = L.SCREEN_W; cv.height = L.SCREEN_H; cv.className = "ws-canvas";
    rootEl.appendChild(cv);
    var g = cv.getContext ? cv.getContext("2d") : null;

    var shown = { version: -1, pending: null }, view = { stale: false, nodata: ctx.mode !== "blank" };
    function build(snap, refreshAt) {
      for (var k in CFG0) S.cfg[k] = CFG0[k];
      var st = ctx.feed ? ctx.feed.status() : {};
      var data = ctx.mode === "blank" ? null : fromSnapshot(snap, { updated: st.time || "--:--" });
      if (!data && ctx.mode !== "blank") S.cfg.capFoot = "";       /* the wall never shows the preview's "Blank preview" line */
      root.Story5eBuild(data);
      S.REFRESH.t = refreshAt;
      info.builds++; info.version = snap ? snap.version | 0 : 0; info.appliedAt = ctx.now();
    }
    /* a new snapshot: shown at the same wall time on every screen (fetched_at + 6 min); while nothing is shown yet, at once */
    function check() {
      if (!alive) return;
      var snap = ctx.feed && ctx.mode !== "blank" ? ctx.feed.snapshot() : null, st = ctx.feed ? ctx.feed.status() : { hasData: false };
      var v = snap ? snap.version | 0 : 0, nowMs = ctx.now();
      if (v !== shown.version) {
        var at = snap && snap.fetched_at ? Date.parse(snap.fetched_at) + APPLY_LAG_MS : NaN;
        var first = shown.version <= 0;   /* nothing shown yet (start, or no data before): show it at once, without the count-up */
        if (first || !isFinite(at) || nowMs >= at) { build(snap, first || !isFinite(at) ? -1e9 : at / 1000); shown.version = v; info.applied++; shown.pendingAt = null; }
        else shown.pendingAt = at;   /* frame() applies it on the first frame at or after this wall time (checker_figs2 L2) */
      }
      view.stale = !!(st && st.stale);
      view.nodata = ctx.mode === "blank" ? false : !(snap && st.hasData);
      /* no snapshot, or the feed refused this screen: the design's own no-data state ("No data for these dates" in the normal
         text colour on every panel); no extra notice, and amber only for stale data (D-243, checker_port F1). The console's
         screen list says which screens are not set up. */
      info.state = view.nodata ? (st.denied ? "denied" : "nodata") : (view.stale ? "stale" : "showing");
    }

    /* performance round (builder_figs_perf.md): the live loop draws at most 30 pictures a second (20 while frames come late),
       on a grid of the SHARED wall clock, so every screen draws the same instants; each picture is drawn for the end of its
       grid step (about when it is on screen), and after a slow frame the next one waits for a timer turn so the clock, the
       figures feed and health can run. Tests and previews (ctx.manual) draw exactly the time they ask for, as before. */
    var STEP_HI = 1000 / 30, STEP_LO = 50, step = STEP_HI, lastSlot = null, lastDraw = 0, late = 0, onTime = 0, toH = null, ema = 0;
    function pnow() { return (root.performance && root.performance.now) ? root.performance.now() : Date.now(); }
    function next(slow) {
      if (!alive || ctx.manual) return;
      if (slow) toH = root.setTimeout(function () { toH = null; if (alive) rafH = raf(frame); }, 0); else rafH = raf(frame);
    }
    function frame() {
      if (!alive || !g) return;
      var t0 = pnow(), wallMs = ctx.now(), T;
      if (ctx.manual) T = wallMs / 1000;
      else {
        var slot = Math.floor(wallMs / step);
        if (slot === lastSlot) { rafH = raf(frame); return; }    /* this grid step is drawn already */
        if (lastDraw) {   /* late frames: 3 in a row drop to 20 a second; 15 s on time goes back to 30 */
          if (t0 - lastDraw > step * 1.2) { onTime = 0; if (++late >= 3 && step === STEP_HI) { step = STEP_LO; late = 0; slot = Math.floor(wallMs / step); } }
          else { late = 0; if (step === STEP_LO && ++onTime >= 300) { step = STEP_HI; onTime = 0; slot = Math.floor(wallMs / step); } }
        }
        if (lastDraw) ema = ema ? ema * 0.8 + (t0 - lastDraw) * 0.2 : t0 - lastDraw;
        /* a very slow screen (under 5 pictures a second) refreshes the cached background once a second instead of every 0.25 s,
           so it is not rebuilt for every picture (whole seconds are on both grids, so neighbours still match) */
        if (S.PERF) S.PERF.bgq = ema > 200 ? 1 : (ema < 120 ? 0.25 : S.PERF.bgq);
        lastSlot = slot; lastDraw = t0; T = (slot + 1) * step / 1000;
      }
      if (shown.pendingAt != null && wallMs >= shown.pendingAt) check();   /* the switch lands on a frame, not on the 1 s tick */
      var B = L.bezelPx, w = L.windowFor(screen, B), cyc = S.cycleLen(), t = ((T % cyc) + cyc) % cyc;
      g.setTransform(1, 0, 0, 1, -w.x, -w.y);
      g.save(); g.beginPath(); g.rect(w.x, w.y, L.SCREEN_W, L.SCREEN_H); g.clip();
      try { S.drawScene(g, t, { B: B, stale: view.stale, nodata: view.nodata, T: T, clip: w }); } catch (e) { info.err = "DRAW"; }
      g.restore(); g.setTransform(1, 0, 0, 1, 0, 0);
      var dt = pnow() - t0;
      info.frames++; info.msSum += dt; info.last = dt; info.lastT = T; info.fps = Math.round(1000 / step); if (dt > info.msMax) info.msMax = dt;
      next(dt > 40);
    }

    container.appendChild(rootEl);
    check();
    var offFeed = (ctx.feed && ctx.feed.onChange) ? ctx.feed.onChange(check) : null;
    ivH = setIv(check, 1000);
    if (ctx.manual) frame(); else rafH = raf(frame);
    var view0 = {
      info: function () { return { frames: info.frames, msMean: info.frames ? info.msSum / info.frames : 0, msMax: info.msMax, msLast: info.last, applied: info.applied,
        version: info.version, builds: info.builds, appliedAt: info.appliedAt, state: info.state, err: info.err || null, tilesSkipped: 0, lastT: info.lastT, fps: info.fps }; },
      refresh: check,
      frame: frame,
      destroy: function () {
        alive = false;
        try { if (rafH !== null) caf(rafH); } catch (e) { }
        try { if (toH !== null) root.clearTimeout(toH); } catch (e) { }
        try { if (ivH !== null) clrIv(ivH); } catch (e) { }
        try { if (typeof offFeed === "function") offFeed(); } catch (e) { }
        try { container.removeChild(rootEl); } catch (e) { }
        var i0 = LIVE.indexOf(view0); if (i0 >= 0) LIVE.splice(i0, 1);
      }
    };
    LIVE.push(view0);
    return view0;
  }
  var LIVE = [];   /* mounted views (at most two: the player's front and back buffers); read by tests */
  var W = { mount: mount, fromSnapshot: fromSnapshot, APPLY_LAG_MS: APPLY_LAG_MS, views: function () { return LIVE.slice(); },
    SCRIPTS: ["wallstory/hmg_mark_mono_shape.js", "wallstory/story_geo_public.js", "wallstory/story5d_engine.js", "wallstory/story5e_stories.js"] };
  if (typeof module !== "undefined" && module.exports) module.exports = W; else root.WallStory = W;
})(this);
