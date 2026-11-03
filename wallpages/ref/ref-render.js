/* FTM wall, reference design (WS-wall21 job "ref").
   Draws the user's design on one 13440 x 3240 canvas (7 x 3 screens of 1920 x 1080) from window.REF_DATA,
   then shows one screen's 1920 x 1080 window of it. Static: nothing moves, nothing is timed, nothing redraws.
   Geometry and markup copy the reference file FTM_wall_final.html exactly; the static parts
   (ambient light, accents, map outline, section tags, title, bezel strips) come from ref-static.js. */
(function () {
  "use strict";
  var SW = 1920, SH = 1080, WW = 13440, WH = 3240;
  var CHECK = "\u2713", DOT = "\u00b7";
  var NODATA = "No data for these dates";

  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function has(v) { return v !== null && v !== undefined && !(typeof v === "number" && !isFinite(v)); }
  function fmt(v) { return has(v) ? Number(v).toLocaleString("en-US") : ""; }
  function niceCeil(v, step) { return Math.max(step, Math.ceil(v / step) * step); }
  function list(a) { return Array.isArray(a) ? a.filter(function (x) { return x !== null && x !== undefined; }) : []; }
  function px(n) { return n + "px"; }
  function box(l, t, w, inner, cls) { return '<div class="box ' + (cls || "") + '" style="left:' + px(l) + ';top:' + px(t) + ';width:' + px(w) + ';">' + inner + '</div>'; }
  function nd(cls) { return '<div class="sub' + (cls ? " " + cls : "") + '" style="margin-top:40px">' + NODATA + '</div>'; }
  function bignum(cls, v, style) { return has(v) ? '<div class="num ' + cls + '"' + (style ? ' style="' + style + '"' : "") + '><span>' + fmt(v) + '</span></div>' : nd(); }

  /* ---------- modules ---------- */
  function hourChart(o, d, svg, html) {
    var hrs = list(d && d.hours), vals = (d && d.values) || [];
    var n = Math.min(hrs.length, vals.length);
    if (!n) { html.push(box(o.x, o.bottom - 200, 1600, '<div class="sub">' + NODATA + '</div>')); return; }
    var mx = 0, i; for (i = 0; i < n; i++) mx = Math.max(mx, +vals[i] || 0);
    var scale = niceCeil(mx, o.step), unit = o.H / scale, step = o.w / n, bw = step * 0.56;
    if (o.grid) for (i = 1; i <= 4; i++) { var gy = o.bottom - i * o.H / 4;
      svg.push('<line x1="' + o.x + '" x2="' + (o.x + o.w) + '" y1="' + gy + '" y2="' + gy + '" stroke="rgba(255,255,255,.04)" stroke-width="2"/>'); }
    for (i = 0; i < n; i++) {
      var v = +vals[i] || 0, h = v * unit, top = o.bottom - h, cx = o.x + (i + 0.5) * step;
      svg.push('<rect x="' + (o.x + i * step + step * 0.22) + '" y="' + top + '" width="' + bw + '" height="' + h + '" rx="12" fill="url(#' + o.grad + ')"/>');
      html.push('<div class="cv" style="left:' + px(cx) + ';top:' + px(top - o.cvOff) + '"><span>' + fmt(v) + '</span></div>');
      html.push('<div class="tick cx" style="left:' + px(cx) + ';top:' + px(o.tickTop) + '">' + esc(hrs[i]) + '</div>');
    }
  }

  /* the one Target rule (see ref-data.js): the pill follows the wording of the Target label.
     "higher": "Target X", higher is better   - X or above On Target, else Below Target
     "under":  "Target under X"               - strictly below X On Target, equal Not under Target, above Above Target
     "atMost": "Target X", lower is better    - X or less On Target, above Above Target
     returns null when value or Target is missing */
  function targetStatus(rule, value, target) {
    if (!has(value) || !has(target)) return null;
    var v = +value, t = +target;
    /* D-378: the equal case says only "Not under Target" (no "needs attention" suffix) */
    if (rule === "under") return v < t ? { ok: true, text: "On Target" } : (v === t ? { ok: false, text: "Not under Target", up: true, noSuffix: true } : { ok: false, text: "Above Target", up: true });
    if (rule === "atMost") return v <= t ? { ok: true, text: "On Target" } : { ok: false, text: "Above Target", up: true };
    return v >= t ? { ok: true, text: "On Target" } : { ok: false, text: "Below Target", up: false };
  }
  function targetLabel(rule, target) { return "Target " + (rule === "under" ? "under " : "") + fmt(target); }
  function ringStatus(r) { return r ? targetStatus(r.rule || "higher", r.value, r.target) : null; }
  function ring(cx, cy, label, r, svg, html) {
    var C = 2 * Math.PI * 270, stt = ringStatus(r), ok = stt ? stt.ok : null;
    html.push(box(cx - 400, cy - 410, 800, '<div class="lab c"><span>' + esc(label) + '</span></div>'));
    svg.push('<circle cx="' + cx + '" cy="' + cy + '" r="270" fill="none" stroke="rgba(255,255,255,.06)" stroke-width="30"/>');
    if (ok === null) {
      svg.push('<circle cx="' + cx + '" cy="' + cy + '" r="221" fill="none" stroke="rgba(255,255,255,.05)" stroke-width="2"/>');
      html.push(box(cx - 400, cy - 40, 800, '<div class="tgt c">' + NODATA + '</div>'));
      return false;
    }
    var att = !ok, D = Math.max(0, Math.min(100, r.value)) / 100 * C, rot = ' transform="rotate(-90 ' + cx + ' ' + cy + ')"';
    svg.push('<circle cx="' + cx + '" cy="' + cy + '" r="270" fill="none" stroke="' + (att ? "#FF9F2E" : "#5B9BFF") + '" stroke-width="30" stroke-dasharray="' + D + ' ' + C + '"' + rot + ' filter="url(#glow)" opacity=".55"/>');
    svg.push('<circle cx="' + cx + '" cy="' + cy + '" r="270" fill="none" stroke="url(#' + (att ? "g21" : "g19") + ')" stroke-width="30" stroke-dasharray="' + D + ' ' + C + '"' + rot + '/>');
    svg.push('<circle cx="' + cx + '" cy="' + cy + '" r="221" fill="none" stroke="rgba(255,255,255,.05)" stroke-width="2"/>');
    var a = r.target / 100 * 2 * Math.PI, s = Math.sin(a), c = Math.cos(a);
    svg.push('<line x1="' + (cx + 237 * s) + '" y1="' + (cy - 237 * c) + '" x2="' + (cx + 303 * s) + '" y2="' + (cy - 303 * c) + '" stroke="#fff" stroke-width="7" stroke-linecap="round"/>');
    html.push('<div class="rv ' + (att ? "att" : "") + '" style="left:' + px(cx - 300) + ';top:' + px(cy - 128) + '"><span>' + fmt(r.value) + '<small>%</small></span></div>');
    var tgt = targetLabel(r.rule || "higher", r.target) + "%";
    var pill = att
      ? '<span class="pill att"><b class="tri' + (stt.up ? " up" : "") + '"></b><span>' + stt.text + '</span>' + (stt.noSuffix ? '' : '<span class="na"> ' + DOT + ' needs attention</span>') + '</span>'
      : '<span class="pill ok"><b>' + CHECK + '</b><span>On Target</span></span>';
    html.push(box(cx - 400, cy + 332, 800, '<div class="tgt c"><span>' + tgt + '</span></div><div class="c" style="margin-top:18px">' + pill + '</div>'));
    return att;
  }

  function barList(o, rows, svg, html) {
    rows = list(rows);
    html.push(box(o.hx, o.hy, 1700, '<div class="ct"' + (o.hstyle ? ' style="' + o.hstyle + '"' : "") + '><span>' + esc(o.title) + '</span><span class="ctsub">' + esc(o.sub) + '</span></div>'));
    if (!rows.length) { html.push(box(o.hx, o.y0 - 22, 1700, '<div class="sub">' + NODATA + '</div>')); return; }
    var mx = 0; rows.forEach(function (r) { mx = Math.max(mx, +r.value || 0); });
    var scale = niceCeil(mx, 5);
    rows.slice(0, 5).forEach(function (r, i) {
      var y = o.y0 + i * o.gap;
      svg.push('<rect x="' + o.tx + '" y="' + y + '" width="1150" height="22" rx="11" fill="rgba(255,255,255,.06)"/>');
      svg.push('<rect x="' + o.tx + '" y="' + y + '" width="' + ((+r.value || 0) / scale * 1150) + '" height="22" rx="11" fill="url(#' + o.grad + ')"/>');
      html.push('<div class="box bn" style="left:' + px(o.hx) + ';top:' + px(y - 22) + ';width:370px;"><span>' + esc(r.name) + '</span></div>');
      html.push('<div class="box bv" style="left:' + px(o.vx) + ';top:' + px(y - 28) + ';width:110px;"><span>' + fmt(r.value) + '</span></div>');
    });
  }

  function ctas(segs, svg, html) {
    segs = list(segs);
    html.push(box(120, 1715, 1700, '<div class="ct" style="font-size:56px"><span>CTAS level mix</span><span class="ctsub">today\'s cases</span></div>'));
    var sum = 0; segs.forEach(function (s) { sum += +s.share || 0; });
    if (!segs.length || !sum) { html.push(box(120, 1860, 1700, '<div class="sub">' + NODATA + '</div>')); return; }
    var n = segs.length, total = 1680 - 8 * (n - 1), x = 120, op = [1, 0.78, 0.58, 0.42, 0.28];
    segs.forEach(function (s, i) {
      var w = (+s.share || 0) / sum * total, pc = Math.round((+s.share || 0) / sum * 100), rx = (i === 0 || i === n - 1) ? 22 : 6;
      svg.push('<rect x="' + x + '" y="1870" width="' + w + '" height="60" rx="' + rx + '" fill="#5B9BFF" fill-opacity="' + (op[i] === undefined ? 0.28 : op[i]) + '"/>');
      if (i === 0) html.push('<div class="cs" style="left:120px;top:1798px"><span>' + pc + '%</span><span class="cn"><span>' + esc(s.name) + '</span></span></div>');
      else html.push('<div class="cs st2" data-c="' + (x + w / 2) + '" data-a="' + (i === n - 1 ? "end" : "mid") + '" data-r="1800" style="top:1946px"><div>' + pc + '%</div><div class="cn">' + esc(s.name) + '</div></div>');
      x += w + 8;
    });
  }

  function steps(o, items, tiles, svg, html) {
    items = list(items);
    html.push(box(o.hx, o.hy, 1700, '<div class="ct"><span>' + esc(o.title) + '</span><span class="ctsub">minutes, in order</span></div>'));
    if (!items.length) { html.push(box(o.hx, o.hy + 160, 1700, '<div class="sub">' + NODATA + '</div>')); return; }
    var mx = 0; items.forEach(function (s) { mx = Math.max(mx, +s.value || 0, has(s.target) ? +s.target : 0); });
    var scale = niceCeil(mx, 5);
    var slots = o.slots, n = Math.min(items.length, slots.length - 1);
    for (var i = 0; i < n; i++) {
      var s = items[i], T = slots[i], x = T[0], y = T[1], w = T[2], h = T[3], tw = w - 80, ty = y + h - 62;
      var stt = targetStatus(o.rule, s.value, s.target), att = !!stt && !stt.ok;
      tiles.push('<div class="tile ' + (att ? "att" : "") + '" style="left:' + px(x) + ';top:' + px(y) + ';width:' + px(w) + ';height:' + px(h) + '"></div>');
      var tt = has(s.target) ? '<span class="tt' + (att ? " o" : "") + '"><span>' + targetLabel(o.rule, s.target) + '</span></span>' : "";
      html.push('<div class="tl" style="left:' + px(x + 40) + ';top:' + px(y + 30) + ';width:' + px(tw) + '"><div class="tn"><span class="ti">' + (i + 1) + '</span><span>' + esc(s.name) + '</span></div>' +
        '<div class="tv"><span class="tnum ' + (att ? "att" : "") + '"><span>' + (has(s.value) ? fmt(s.value) : "") + '</span></span><span class="tu">min</span>' + tt + '</div></div>');
      if (att) html.push('<div class="tflag" style="right:' + px(WW - (x + w) + 28) + ';top:' + px(y - 30) + '"><span class="pill att sm tp"><b class="tri' + (stt.up ? " up" : "") + '"></b><span>' + stt.text + '</span></span></div>');
      svg.push('<rect x="' + (x + 40) + '" y="' + ty + '" width="' + tw + '" height="16" rx="8" fill="rgba(255,255,255,.06)"/>');
      if (has(s.value)) {
        var vw = Math.min(s.value, scale) / scale * tw;
        svg.push('<rect x="' + (x + 40) + '" y="' + ty + '" width="' + vw + '" height="16" rx="8" fill="url(#' + (att ? o.gradAtt : o.grad) + ')"/>');
        if (att) svg.push('<rect x="' + (x + 40) + '" y="' + ty + '" width="' + vw + '" height="16" rx="8" fill="#FF9F2E" filter="url(#glowS)" opacity=".7"/>');
      }
      if (has(s.target)) { var lx = x + 40 + Math.min(s.target, scale) / scale * tw;
        svg.push('<line x1="' + lx + '" x2="' + lx + '" y1="' + (ty - 16) + '" y2="' + (ty + 32) + '" stroke="#fff" stroke-width="5" stroke-linecap="round"/>'); }
    }
    var L = slots[slots.length - 1];
    html.push('<div class="tlg" style="left:' + px(L[0] + 40) + ';top:' + px(L[1] + 30) + ';width:' + px(L[2] - 80) + ';height:333px"><div class="lgi"><span class="sw" style="background:linear-gradient(90deg,' + o.sw + ')"></span>time in minutes</div><div class="lgi"><span class="lt"></span>Target</div><div class="lgi s">bars share one scale<br>0 to ' + scale + ' min</div></div>');
  }

  function names(a, two) {
    return '<ul class="names ' + (two ? "two" : "") + '">' + list(a).map(function (n) { return '<li><b></b><span>' + esc(n) + '</span></li>'; }).join("") + '</ul>';
  }
  function countOf(n, a) { return has(n) ? n : (Array.isArray(a) ? a.length : null); }

  /* city positions on the reference map (canvas px). anchor = the city; bubble = where the circle sits
     (moved off a crowded neighbour, with a short leader line); side = label side (b below, r right, u above) */
  var CITY = {
    "Riyadh": { x: 6795.520791095889, y: 1498.091982103117, s: "b" },
    "Jeddah": { x: 6204.135913527397, y: 1776.3925588426605, s: "b" },
    "Makkah": { x: 6391.908465876385, y: 1844.7361787098844, s: "r", ax: 6257.036830479452, ay: 1785.0354338966836 },
    "Madinah": { x: 6237.297682363013, y: 1518.8348822327728, s: "r" },
    "Dammam": { x: 7065.552337328765, y: 1349.4345311739203, s: "u" },
    "AlUla": { x: 6103.86104109589, y: 1333.8773560766788, s: "r" },
    "Abha": { x: 6466.271800513698, y: 2059.0145731092152, s: "r" },
    "Tabuk": { x: 5997.269641267123, y: 1180.8984676204702, s: "r" },
    "Al Khobar": { x: 7065.552337328765, y: 1473.7883602463999, s: "r", ax: 7074.237562499999, ay: 1362.3988437549547 }
  };
  function mapBubbles(rows, svg, html, missing) {
    rows = list(rows).filter(function (r) { return (+r.n || 0) > 0; }).slice().sort(function (a, b) { return b.n - a.n; });
    var mx = 0;
    rows.forEach(function (r) {
      var p = CITY[r.city]; if (!p) { missing.push(r.city); return; }
      var rad = 36 * Math.sqrt(r.n); mx = Math.max(mx, r.n);
      if (p.ax !== undefined) {
        svg.push('<line x1="' + p.ax + '" y1="' + p.ay + '" x2="' + p.x + '" y2="' + p.y + '" stroke="#fff" stroke-opacity=".6" stroke-width="2.5"/>');
        svg.push('<circle cx="' + p.ax + '" cy="' + p.ay + '" r="6" fill="#fff"/>');
      }
      svg.push('<circle cx="' + p.x + '" cy="' + p.y + '" r="' + rad + '" fill="#C9A2FF" opacity=".5" filter="url(#glowS)"/>');
      svg.push('<circle cx="' + p.x + '" cy="' + p.y + '" r="' + rad + '" fill="url(#orb)" stroke="#EBD8FF" stroke-opacity=".85" stroke-width="2.5"/>');
      svg.push('<circle cx="' + p.x + '" cy="' + p.y + '" r="7" fill="#fff"/>');
      html.push('<div class="city" data-x="' + p.x + '" data-y="' + p.y + '" data-r="' + rad + '" data-s="' + p.s + '"><span>' + esc(r.city) + '</span><b>' + fmt(r.n) + '</b></div>');
    });
    if (!rows.length) { html.push(box(5760, 1560, 1920, '<div class="note c">' + NODATA + '</div>')); return; }
    /* key: smallest, middle, largest circle on the wall */
    var keys = [1, Math.max(2, Math.round(mx / 3)), mx].filter(function (v, i, a) { return a.indexOf(v) === i; });
    var kx = keys.length === 3 ? [6320, 6720, 7120] : keys.length === 2 ? [6520, 6920] : [6720];
    html.push(box(5760, 2390, 1920, '<div class="note c">circle area shows events running now in each city</div>'));
    keys.forEach(function (k, i) {
      svg.push('<circle cx="' + kx[i] + '" cy="2720" r="' + (36 * Math.sqrt(k)) + '" fill="url(#orb)" stroke="#EBD8FF" stroke-opacity=".7" stroke-width="2.5"/>');
      svg.push('<circle cx="' + kx[i] + '" cy="2720" r="6" fill="#fff"/>');
      html.push('<div class="tick cx keyl" style="left:' + px(kx[i]) + ';top:2870px">' + k + (k === 1 ? " event" : " events") + '</div>');
    });
  }

  var ECC_SLOTS = [[120, 2460, 823, 318], [977, 2460, 823, 318], [120, 2812, 823, 318], [977, 2812, 823, 318],
                   [2040, 2310, 823, 393], [2897, 2310, 823, 393], [2040, 2737, 823, 393], [2897, 2737, 823, 393]];
  var MT_SLOTS = (function () { var w = 537.3333333333334, g = 571.3333333333334, a = [], i;
    for (i = 0; i < 3; i++) a.push([9720 + i * g, 2460, w, 318]);
    for (i = 0; i < 3; i++) a.push([9720 + i * g, 2812, w, 318]);
    for (i = 0; i < 3; i++) a.push([11640 + i * g, 2310, w, 393]);
    for (i = 0; i < 3; i++) a.push([11640 + i * g, 2737, w, 393]);
    return a; })();

  /* ---------- whole canvas ---------- */
  function build(D) {
    var S = window.REF_STATIC, E = (D && D.ecc) || {}, F = (D && D.fm) || {}, M = (D && D.mt) || {};
    var svg = [], html = [], tiles = [], missing = [];
    /* ECC */
    html.push(box(120, 196, 1200, '<div class="lab"><span>Calls today</span></div>' + bignum("xl", E.callsToday, "font-size:270px")));
    html.push(box(120, 600, 1200, '<div class="ct" style="font-size:54px"><span>Calls per hour today</span></div>'));
    hourChart({ x: 120, w: 1680, bottom: 940, H: 190, step: 20, cvOff: 54, tickTop: 954, grad: "g18", grid: false }, E.callsPerHour, svg, html);
    var att2 = false;
    ring(2380, 530, "Calls answered", E.answered, svg, html);
    ring(3380, 530, "Calls answered in time", E.answeredInTime, svg, html);
    att2 = ring(2380, 1610, "Cases dispatched in time", E.dispatchedInTime, svg, html) || att2;
    att2 = ring(3380, 1610, "Calls abandoned", E.abandoned, svg, html) || att2;
    barList({ title: "Cancellations by branch", sub: "top 5 today", hstyle: "font-size:56px", hx: 120, hy: 1276, tx: 520, vx: 1690, y0: 1387, gap: 64, grad: "g23" }, E.cancellationsTop5, svg, html);
    ctas(E.ctasShare, svg, html);
    steps({ title: "Call steps", rule: E.stepsRule || "atMost", hx: 120, hy: 2356, slots: ECC_SLOTS, grad: "g24", gradAtt: "g25", sw: "#5B9BFF,#A9CBFF" }, E.steps, tiles, svg, html);
    /* Field Medicine */
    html.push(box(3960, 250, 1600, '<div class="lab"><span>Events running now</span></div>' + bignum("xxl", F.eventsRunning)));
    html.push(box(3960, 1380, 1600, '<div class="pair" style="gap:220px"><div><div class="lab"><span>Cities</span></div>' + bignum("xl", F.cities) + '</div><div><div class="lab"><span>Projects</span></div>' + bignum("xl", F.projects) + '</div></div>'));
    html.push(box(3960, 2460, 1600, '<div class="lab"><span>Patients seen at events today</span></div>' + bignum("xl", F.patientsToday)));
    html.push(box(7800, 190, 1700, '<div class="pair top" style="gap:220px"><div><div class="lab"><span>Starting today</span></div>' + bignum("l", countOf(F.startingCount, F.startingToday)) + names(F.startingToday) + '</div>' +
      '<div><div class="lab"><span>Ending today</span></div>' + bignum("l", countOf(F.endingCount, F.endingToday)) + names(F.endingToday) + '</div></div>'));
    var zc = countOf(F.zonesUnderPlanCount, F.zonesUnderPlan);
    html.push(box(7800, 1310, 1700, '<div class="lab"><span>Staffing vs plan</span></div>' + (has(zc)
      ? '<div class="pair top" style="gap:90px;margin-top:6px"><div class="num l"><span>' + fmt(zc) + '</span></div><div style="padding-top:40px"><div class="sub"><span>zones under plan today</span></div>' + names(F.zonesUnderPlan) + '</div></div>'
      : nd())));
    html.push(box(7800, 2350, 1700, '<div class="ct"><span>Other events running now</span></div>' + (Array.isArray(F.otherEvents) ? names(F.otherEvents.slice(0, 8), true) : nd())));
    /* Medical Transport */
    html.push(box(9720, 290, 1700, '<div class="pair"><div><div class="lab"><span>Missions completed</span></div>' + bignum("xl", M.missionsCompleted) + '</div><div><div class="lab"><span>Cases dispatched</span></div>' + bignum("xl dim", M.casesDispatched) + '</div></div>' + ((has(M.missionsCompleted) || has(M.casesDispatched)) ? '<div class="sub" style="margin-top:28px"><span>both so far today</span></div>' : '')));
    html.push(box(11640, 220, 1700, '<div class="pair"><div><div class="lab"><span>Units logged in</span></div>' + bignum("xl", M.unitsLoggedIn) + '</div><div><div class="lab"><span>Busy now</span></div>' + bignum("xl dim", M.busyNow) + '</div></div>'));
    var busySvg = [];
    if (has(M.unitsLoggedIn) && has(M.busyNow) && M.unitsLoggedIn > 0) {
      var bw = Math.min(1, M.busyNow / M.unitsLoggedIn) * 1680;
      busySvg.push('<rect x="11640" y="800" width="1680" height="44" rx="22" fill="rgba(255,255,255,.06)"/>');
      busySvg.push('<rect x="11640" y="800" width="' + bw + '" height="44" rx="22" fill="url(#g26)"/>');
      busySvg.push('<rect x="11640" y="800" width="' + bw + '" height="44" rx="22" fill="#3FE0BE" filter="url(#glowS)" opacity=".5"/>');
      html.push(box(11640, 876, 1700, '<div class="note"><span>busy units out of all units logged in</span></div>'));
    }
    html.push(box(9720, 1276, 1700, '<div class="ct"><span>Missions per hour today</span><span class="ctsub">missions completed</span></div>'));
    var mtSvg = [];
    hourChart({ x: 9720, w: 1680, bottom: 1980, H: 420, step: 20, cvOff: 56, tickTop: 1994, grad: "g27", grid: true }, M.missionsPerHour, mtSvg, html);
    barList({ title: "Busiest branches today", sub: "missions so far today", hx: 11640, hy: 1210, tx: 12040, vx: 13210, y0: 1402, gap: 112, grad: "g28" }, M.busiestTop5, mtSvg, html);
    steps({ title: "Mission steps", rule: M.stepsRule || "atMost", hx: 9720, hy: 2356, slots: MT_SLOTS.slice(0, 11).concat([MT_SLOTS[11]]), grad: "g29", gradAtt: "g30", sw: "#3FE0BE,#A6F7E4" }, M.steps, tiles, mtSvg, html);
    /* map */
    var mapSvg = [];
    mapBubbles(F.eventsByCity, mapSvg, html, missing);

    var cards = S.cards.map(function (c) {
      var attn = (c[0] === 1966 && c[1] === 1126 && att2);
      return '<div class="card ' + (attn ? "attn" : "") + '" style="left:' + px(c[0]) + ';top:' + px(c[1]) + ';width:' + px(c[2]) + ';height:' + px(c[3]) + ';\n    background:radial-gradient(1200px 700px at 0% 0%, ' + c[4] + ', transparent 60%),linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,.022));"></div>';
    }).join("");
    var map = S.map.split("@MAP@").join(S.mapD);
    var out = S.svgAmbient.split("@MAP@").join(S.mapD) + cards + tiles.join("") +
      '<svg class="layer" width="13440" height="3240">' + S.accents + svg.join("") + S.rule + map + mapSvg.join("") + busySvg.join("") + mtSvg.join("") + '</svg>' +
      S.tags + html.join("") + S.title + S.bezels;
    return { html: out, missingCities: missing };
  }

  /* ---------- after fonts: the reference's own label placement (city labels, CTAS labels) ---------- */
  function place(root) {
    var G = 48;
    function clampIn(L, T, w, h) { var c = Math.floor((L + w / 2) / SW), q = Math.floor((T + h / 2) / SH);
      return [Math.min(Math.max(L, c * SW + G), (c + 1) * SW - G - w), Math.min(Math.max(T, q * SH + G), (q + 1) * SH - G - h)]; }
    root.querySelectorAll(".city").forEach(function (el) {
      var x = +el.dataset.x, y = +el.dataset.y, r = +el.dataset.r, s = el.dataset.s, w = el.offsetWidth, h = el.offsetHeight;
      var L = x + r + 20, T = y - h / 2;
      if (s === "u") { L = x - w / 2; T = y - r - h - 8; }
      if (s === "b") { L = x - w / 2 - (el.textContent.indexOf("Jeddah") === 0 ? 40 : 0); T = y + r + 8; }
      var p = clampIn(L, T, w, h); el.style.left = p[0] + "px"; el.style.top = p[1] + "px";
    });
    root.querySelectorAll(".cs[data-c]").forEach(function (el) {
      var c = +el.dataset.c, w = el.offsetWidth;
      el.style.left = (el.dataset.a === "end" ? (+el.dataset.r) - w : c - w / 2) + "px";
    });
  }

  function fill(root, D) {
    var t = root.querySelector('[data-fact="title"]'); if (t) t.textContent = "FTM";
    var u = root.querySelector('[data-fact="updated"]');
    /* while the numbers are placeholders the one stamp says so (REF_DATA.sample); Power BI data sets sample:false */
    if (u) u.textContent = ((D && D.sample !== false) ? "sample data " + DOT + " " : "") + ((D && D.updated) ? "updated " + D.updated : NODATA);
  }

  /* load every face the design uses before measuring labels (fonts.ready alone can resolve before any load starts) */
  function fontsReady() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    var faces = ['200 100px "Inter Display"', '300 100px "Inter Display"', '400 100px "Inter Display"', '500 100px "Inter Display"',
                 '400 50px Inter', '500 50px Inter', '600 50px Inter', '700 50px Inter'];
    return Promise.all(faces.map(function (f) { return document.fonts.load(f).catch(function () {}); })).then(function () { return document.fonts.ready; });
  }

  function qs(name) { var m = new RegExp("[?&]" + name + "=([^&]*)").exec(location.search); return m ? decodeURIComponent(m[1]) : null; }

  /* one screen: id "R1C1".."R3C7". Option from the URL: edge=0 hides the drawn bezel strips */
  function mountScreen(id) {
    var m = /^R([1-3])C([1-7])$/.exec(id); if (!m) throw new Error("screen id");
    var r = +m[1] - 1, c = +m[2] - 1, x0 = c * SW, y0 = r * SH;
    var view = document.getElementById("view"), wall = document.getElementById("wall");
    view.setAttribute("data-screen", id);
    var b = build(window.REF_DATA);
    wall.innerHTML = b.html;
    if (qs("edge") === "0") Array.prototype.slice.call(wall.querySelectorAll('div[style*="z-index:999"],div[style*="z-index:1000"]')).forEach(function (e) { e.remove(); });
    wall.style.position = "absolute"; wall.style.left = (-x0) + "px"; wall.style.top = (-y0) + "px";
    fill(wall, window.REF_DATA);
    function fit() { var s = Math.min(window.innerWidth / SW, window.innerHeight / SH);
      view.style.transform = (Math.abs(s - 1) < 1e-3) ? "" : "scale(" + s + ")"; }
    fit(); window.addEventListener("resize", fit);
    var done = function () {
      place(wall);
      view.style.visibility = "visible";
      document.documentElement.setAttribute("data-ready", "1");
      if (b.missingCities.length) document.documentElement.setAttribute("data-missing-cities", b.missingCities.length);
    };
    fontsReady().then(done, done);
  }

  /* whole canvas (preview only) */
  function mountWall(wall) {
    var b = build(window.REF_DATA);
    wall.innerHTML = b.html; fill(wall, window.REF_DATA);
    return fontsReady().then(function () { place(wall); return b; });
  }

  window.RefWall = { build: build, mountScreen: mountScreen, mountWall: mountWall, targetStatus: targetStatus, SCREEN_W: SW, SCREEN_H: SH };
})();
