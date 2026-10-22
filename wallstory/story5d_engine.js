/* WALL COPY (WS-wall21 Phase 3) of src\wall21\design\story\v5\story5d_engine.js sha256 c93a444891dfabe3..., the approved round 5e design (D-243).
   Made by src\wall21\port\make_port_copies.js; do not edit by hand. Changes from the original: the patches listed there only. */
/* story5d_engine.js - v5d engine (v5c plus: a missed Target reads in words and a dashed segment, in the department colour; amber only for stale) (v5 plus: named start/end lists, mission steps panel, no-overlap hand-over) (WS-wall21, designer). DATA-AGNOSTIC: no figures here.
   Canvas units are true pixels of the bezel-compensated wall canvas (7x1920+6B by 3x1080+2B), from wall-layout.js.
   All motion comes from shared wall time (wall-clock.js), never from frame counts.
   v2: premium core (depth-sorted particles, orbit comets, wireframe, nucleus), starfield and nebula, glass panels with
   count-up numbers, light-sweep transitions, a persistent brand screen (logo slot + "FTM") on R1C1, a logo reveal in the
   intro. The logo is loaded from src\wall21\brand\hmg_logo.svg or .png when present; otherwise a neutral box says "logo".
   Text is always placed inside one screen's safe area (never across a bezel). */
(function () {
  "use strict";
  var L = window.WallLayout;
  var SW = 1920, SH = 1080, SAFE = 48;
  var COL = { ecc: "#5CC8FF", mt: "#A08FFF", fm: "#E59BFF" };
  var LIGHT = { ecc: "#BFE9FF", mt: "#DCD4FF", fm: "#F6DDFF" };
  var NAME = { ecc: "Emergency Command Center", mt: "Medical Transport", fm: "Field Medicine" };
  var AMBER = "#F0A04A", INK = "#F4F0F8", INK2 = "#CFC6DC", BRAND = "#C98BEB";
  var FONT = "\"Segoe UI\", \"Segoe UI Variable\", sans-serif";
  var NODATA_TXT = "No data for these dates";
  var stats = { minPx: Infinity, texts: 0, nudged: 0, unsafe: 0, unsafeWhere: [], drawn: null, dupKeys: 0, dupWhere: [], keyed: 0 };
  var FRAMEKEYS = new Set();   /* data keys drawn in this frame: each figure must appear once on the whole wall */
  var REFRESH = { t: -1e9 };   /* wall time of the last data refresh: numbers count up and panels pulse only then */
  /* texts a launcher may set; the defaults are the blank build */
  var CFG = { asOf: "--:--", staleSince: "--:--", dateLine: "--", capFoot: "Blank preview: figures show \"--\"",
    headTitle: "Wall stories v5: the hologram is the mark", headSub: "Blank preview: every figure shows \"--\". Click any screen to see it at true size.",
    logoUrls: [], brand: "FTM", updated: "--:--", active: null,
    markUrls: { ecc: "../../../brand/HMG_mark_ECC.svg", mt: "../../../brand/HMG_mark_Field_Operations.svg", fm: "../../../brand/HMG_mark_Field_Medicine.svg" } };

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function ease(p) { p = clamp(p, 0, 1); return p * p * (3 - 2 * p); }
  function easeOut(p) { p = clamp(p, 0, 1); return 1 - Math.pow(1 - p, 3); }
  function lerp(a, b, k) { return a + (b - a) * k; }
  function hexA(h, a) { var n = parseInt(h.slice(1), 16); return "rgba(" + (n >> 16 & 255) + "," + (n >> 8 & 255) + "," + (n & 255) + "," + clamp(a, 0, 1) + ")"; }
  function mix(h1, h2, k) {
    var a = parseInt(h1.slice(1), 16), b = parseInt(h2.slice(1), 16), o = "#";
    [16, 8, 0].forEach(function (s) { var v = Math.round((a >> s & 255) * (1 - k) + (b >> s & 255) * k); o += (v < 16 ? "0" : "") + v.toString(16); });
    return o;
  }
  function seeded(s) { return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

  var C = { B: 0, W: 0, H: 0, stale: false, nodata: false, longNames: false, T: 0 };
  function win(id) { return L.windowFor(id, C.B); }
  function at(id, x, y) { var w = win(id); return [w.x + x, w.y + y]; }
  function screenOf(x, y) {
    var B = C.B, c = Math.floor(x / (SW + B)), r = Math.floor(y / (SH + B));
    c = clamp(c, 0, 6); r = clamp(r, 0, 2);
    var rx = x - c * (SW + B), ry = y - r * (SH + B);
    if (rx >= SW && c < 6 && rx - SW > B / 2) c++;
    if (ry >= SH && r < 2 && ry - SH > B / 2) r++;
    return { c: c, r: r, x0: c * (SW + B), y0: r * (SH + B) };
  }
  function nm(s) { return C.longNames && typeof s === "string" && s.length > 2 && !/^[\d,.% ]+$/.test(s) && s.length < 40 && /^[A-Z]/.test(s) && /\b(Hospital|Center|Medical|Riyadh|Jeddah|Makkah)\b/.test(s) ? s + " General Hospital and Medical Centre" : s; }

  /* ---------- text: always inside ONE screen's safe area ---------- */
  function setFont(g, px, w) { g.font = (w || 400) + " " + px + "px " + FONT; }
  function T(g, s, x, y, px, o) {
    o = o || {}; var w = o.w || 400;
    if (s === null || s === undefined || s === "") return null;
    s = String(s);
    setFont(g, px, w);
    var maxW = Math.min(o.maxW || 1e9, SW - 2 * SAFE), min = o.min || Math.max(36, Math.round(px * 0.6));
    var wd = g.measureText(s).width;
    while (wd > maxW && px > min) { px -= 2; setFont(g, px, w); wd = g.measureText(s).width; }
    if (wd > maxW) { while (s.length > 4 && g.measureText(s + "...").width > maxW) s = s.slice(0, -1); s = s + "..."; wd = g.measureText(s).width; }
    var a = o.a || "left", left = a === "center" ? x - wd / 2 : (a === "right" ? x - wd : x);
    var top = y - px * 0.95, h = px * 1.25;
    var sc = screenOf(left + wd / 2, top + h / 2);
    var sx0 = sc.x0 + SAFE, sx1 = sc.x0 + SW - SAFE, sy0 = sc.y0 + SAFE, sy1 = sc.y0 + SH - SAFE;
    var nl = clamp(left, sx0, sx1 - wd), nt = clamp(top, sy0, sy1 - h);
    if (Math.abs(nl - left) > 3 || Math.abs(nt - top) > 3) stats.nudged++;
    if (nl < sx0 - 0.5 || nl + wd > sx1 + 0.5 || nt < sy0 - 0.5 || nt + h > sy1 + 0.5) { stats.unsafe++; if (stats.unsafeWhere.length < 8) stats.unsafeWhere.push((o.where || "") + " len " + s.length); }
    if (px < stats.minPx) stats.minPx = px;
    stats.texts++; if (stats.drawn) stats.drawn.add(s);
    if (o.key) { stats.keyed++; if (FRAMEKEYS.has(o.key)) { stats.dupKeys++; if (stats.dupWhere.length < 8) stats.dupWhere.push(o.key); } else FRAMEKEYS.add(o.key); }
    var ga = g.globalAlpha; g.globalAlpha = ga * (o.al === undefined ? 1 : o.al);
    if (g.globalAlpha > 0.003) {
      if (o.glow) { g.globalCompositeOperation = "lighter"; g.globalAlpha *= 0.35; g.drawImage(sprite(o.glow), nl - wd * 0.08, nt - h * 0.25, wd * 1.16, h * 1.5); g.globalAlpha = ga * (o.al === undefined ? 1 : o.al); g.globalCompositeOperation = "source-over"; }
      g.fillStyle = o.c || INK; g.textAlign = "left"; g.textBaseline = "alphabetic";
      g.fillText(s, nl, nt + px * 0.95);
    }
    g.globalAlpha = ga;
    return { x: nl, y: nt, w: wd, h: h, px: px };
  }
  function wrap(g, s, maxW, px, w) {
    setFont(g, px, w); var words = String(s).split(" "), lines = [], cur = "";
    words.forEach(function (wd) { var t = cur ? cur + " " + wd : wd; if (g.measureText(t).width > maxW && cur) { lines.push(cur); cur = wd; } else cur = t; });
    if (cur) lines.push(cur); return lines;
  }
  function rrect(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  /* count-up: a figure string such as "1,234", "89.7%" or "5" rolls up over 1.4 s, starting at 5 so a value of 5 or more never shows 1-4 on the way */
  function countUp(s, age) {
    if (typeof s !== "string" || age === undefined) return s;
    var m = /^([\d,]+)(\.\d+)?(%?)$/.exec(s); if (!m) return s;
    var k = easeOut(age / 1.4); if (k >= 1) return s;
    var dec = m[2] ? m[2].length - 1 : 0, full = parseFloat((m[1] + (m[2] || "")).replace(/,/g, "")), lo = full >= 5 ? 5 : 0, v = lo + (full - lo) * k;   /* never passes through 1-4 */
    var t = v.toFixed(dec), parts = t.split("."); parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, m[1].indexOf(",") >= 0 || parts[0].length > 3 ? "," : "");
    return parts.join(".") + m[3];
  }

  /* ---------- glow sprites ---------- */
  var spr = {};
  function sprite(col) {
    if (spr[col]) return spr[col];
    var c = document.createElement("canvas"); c.width = c.height = 128;
    var x = c.getContext("2d"), gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, "rgba(255,255,255,0.95)"); gr.addColorStop(0.12, hexA(col, 0.85));
    gr.addColorStop(0.45, hexA(col, 0.22)); gr.addColorStop(1, hexA(col, 0));
    x.fillStyle = gr; x.fillRect(0, 0, 128, 128); spr[col] = c; return c;
  }
  function glow(g, col, x, y, r, a) { if (a <= 0.003 || r <= 0) return; var ga = g.globalAlpha; g.globalAlpha = Math.min(1, a); g.drawImage(sprite(col), x - r, y - r, 2 * r, 2 * r); g.globalAlpha = ga; }
  function dot(g, x, y, r, col, a) { if (r <= 0) return; g.globalAlpha = clamp(a, 0, 1); g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fillStyle = col; g.fill(); g.globalAlpha = 1; }
  /* a comet: bright head with a fading tail along a path function f(t) -> [x,y] */
  function comet(g, path, t, len, col, a, size) {
    if (a <= 0.01) return; g.globalCompositeOperation = "lighter";
    for (var i = 6; i >= 0; i--) { var tt = t - i * len / 6; if (tt < 0) continue; var p = path(tt), k = 1 - i / 7; glow(g, col, p[0], p[1], (size || 22) * (0.4 + 0.6 * k), a * k * 0.8); }
    var h = path(t); glow(g, "#FFFFFF", h[0], h[1], (size || 22) * 0.7, a);
    g.globalCompositeOperation = "source-over";
  }

  /* ---------- logo slot (never drawn or imitated: an image file, or a neutral box saying "logo") ---------- */
  var LOGO = { img: null, state: "none", tried: false };
  function loadLogo() {
    if (LOGO.tried) return; LOGO.tried = true;
    var q = new URLSearchParams(location.search), urls = q.get("logo") ? [q.get("logo")] : CFG.logoUrls.slice(), i = 0;
    LOGO.state = "loading";
    (function next() {
      if (i >= urls.length) { LOGO.state = "none"; return; }
      var im = new Image(); im.onload = function () { if (im.naturalWidth > 0) { LOGO.img = /\.svg/i.test(urls[i]) ? bake(im, 640) : im; LOGO.state = "file"; LOGO.src = urls[i]; } else { i++; next(); } };
      im.onerror = function () { i++; next(); }; im.src = urls[i];
    })();
  }
  /* the official logo is drawn as is: never recoloured, cropped, distorted or scaled above its natural size (sc <= 1);
     it sits on a dark backdrop with a soft brand-colour glow around it. With no file, a neutral box says "logo". */
  /* the Al Habib mark, one colour (hmg_mark_mono.svg, traced from the logo at the user's request): a vector, so it may be drawn
     larger and stays sharp; white with the wall's soft glow. With no file, a neutral box says "logo". */
  function logoSlot(g, x, y, w, h, a, sc) {
    if (a <= 0.01) return;
    var ga = g.globalAlpha; g.globalAlpha = a; sc = sc === undefined ? 1 : sc;
    if (LOGO.img) {
      var ar = LOGO.img.naturalWidth / LOGO.img.naturalHeight || 1, bw = Math.min(w, h * ar) * sc, bh = bw / ar, cx = x + w / 2, cy = y + h / 2;
      g.globalCompositeOperation = "lighter"; glow(g, BRAND, cx, cy, Math.max(bw, bh) * 0.95, 0.4 * a); g.globalCompositeOperation = "source-over";
      try { g.drawImage(LOGO.img, cx - bw / 2, cy - bh / 2, bw, bh); } catch (e) { }
    } else {
      var pw = w * sc, ph = h * sc, px = x + (w - pw) / 2, py = y + (h - ph) / 2;
      rrect(g, px, py, pw, ph, 24); g.fillStyle = "rgba(255,255,255,0.04)"; g.fill();
      g.setLineDash([18, 14]); g.lineWidth = 4; g.strokeStyle = "rgba(207,198,220,0.6)"; g.stroke(); g.setLineDash([]);
      T(g, "logo", px + pw / 2, py + ph / 2 + 22, Math.max(40, Math.min(72, ph * 0.3)), { a: "center", c: INK2, where: "logo" });
    }
    g.globalAlpha = ga;
  }

  /* ---------- department marks (our own Power BI artwork, vector): loaded as SVG, drawn sharp at any size; may be animated ---------- */
  var MARKS = { ecc: null, mt: null, fm: null }, marksTried = false;
  /* a vector drawn once into a 640 px bitmap: sharp up to that size, and cheap to draw every frame */
  function bake(im, px) { try { var r = im.naturalWidth / im.naturalHeight || 1, c = document.createElement("canvas"); c.width = r >= 1 ? px : Math.round(px * r); c.height = r >= 1 ? Math.round(px / r) : px; c.getContext("2d").drawImage(im, 0, 0, c.width, c.height); c.naturalWidth = c.width; c.naturalHeight = c.height; return c; } catch (e) { return im; } }
  function loadMarks() {
    if (marksTried) return; marksTried = true;
    Object.keys(CFG.markUrls).forEach(function (d) { var im = new Image(); im.onload = function () { MARKS[d] = bake(im, 640); }; im.src = CFG.markUrls[d]; });
  }
  /* o.reveal 0..1: a clockwise sweep draws the mark on; o.rot: turn in radians; o.glow: glow strength */
  function drawMark(g, d, cx, cy, size, a, o) {
    o = o || {}; if (a <= 0.01) return;
    var rv = o.reveal === undefined ? 1 : clamp(o.reveal, 0, 1), ga = g.globalAlpha;
    if (o.glow) { g.globalCompositeOperation = "lighter"; glow(g, COL[d], cx, cy, size * 1.25, o.glow * a); g.globalCompositeOperation = "source-over"; }
    g.save(); g.translate(cx, cy); if (o.rot) g.rotate(o.rot);
    if (rv < 1) { g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, size, -Math.PI / 2, -Math.PI / 2 + rv * 6.2832); g.closePath(); g.clip(); }
    g.globalAlpha = ga * a;
    if (MARKS[d]) { try { g.drawImage(MARKS[d], -size / 2, -size / 2, size, size); } catch (e) { } }
    else { rrect(g, -size / 2, -size / 2, size, size, size * 0.06); g.fillStyle = "#0E1830"; g.fill(); g.fillStyle = COL[d]; g.fillRect(-size * 0.4, -size * 0.36, size * 0.32, size * 0.27); }
    g.restore(); g.globalAlpha = ga;
    if (rv > 0 && rv < 1) { var an = -Math.PI / 2 + rv * 6.2832 + (o.rot || 0); g.globalCompositeOperation = "lighter"; glow(g, "#FFFFFF", cx + Math.cos(an) * size * 0.55, cy + Math.sin(an) * size * 0.55, size * 0.18, a); g.globalCompositeOperation = "source-over"; }
  }

  /* ---------- background: deep gradient, drifting nebula, twinkling stars ---------- */
  var STARS = (function () { var r = seeded(3), a = []; for (var i = 0; i < 520; i++) a.push([r(), r(), 0.6 + r() * 2.2, r() * 6.28, 0.3 + r() * 0.7]); return a; })();
  function background(g) {
    var c = coreAt(), gr = g.createRadialGradient(c.x, c.y, 0, c.x, c.y, C.W * 0.55);
    gr.addColorStop(0, "#1c1030"); gr.addColorStop(0.35, "#0e0819"); gr.addColorStop(1, "#04020a");
    g.fillStyle = gr; g.fillRect(0, 0, C.W, C.H);
    g.globalCompositeOperation = "lighter";
    var t = C.stale ? 0 : C.T;
    glow(g, "#3a1d5c", C.W * (0.3 + 0.03 * Math.sin(t * 0.05)), C.H * 0.35, 2600, 0.22);
    glow(g, "#1a2f55", C.W * (0.72 + 0.03 * Math.cos(t * 0.04)), C.H * 0.62, 2400, 0.20);
    glow(g, "#4a1f4f", C.W * 0.5, C.H * (0.9 + 0.05 * Math.sin(t * 0.03)), 2000, 0.16);
    for (var i = 0; i < STARS.length; i++) {
      var s = STARS[i], x = ((s[0] * C.W + t * 6 * s[4]) % C.W), y = s[1] * C.H, a = 0.25 + 0.35 * Math.sin(t * 1.3 * s[4] + s[3]) * s[4];
      g.fillStyle = "rgba(230,220,255," + clamp(a, 0.05, 0.7) + ")"; g.fillRect(x, y, s[2] * 2, s[2] * 2);
    }
    g.globalCompositeOperation = "source-over";
  }

  /* ---------- the stage and the core ---------- */
  var DEPT_SCREENS = { ecc: ["R1C1", "R1C2", "R2C1", "R2C2", "R3C1", "R3C2"], mt: ["R1C3", "R1C4", "R1C5"], fm: ["R1C6", "R1C7", "R2C6", "R2C7", "R3C6", "R3C7"] };
  var STAGE = ["R2C3", "R2C4", "R2C5", "R3C3", "R3C4", "R3C5"];
  function deptOf(id) { for (var d in DEPT_SCREENS) if (DEPT_SCREENS[d].indexOf(id) >= 0) return d; return null; }
  function stageRect() { var a = win("R2C3"), b = win("R3C5"); return { x: a.x, y: a.y, w: b.x + SW - a.x, h: b.y + SH - a.y }; }
  /* the core now lives inside ONE screen (R2C4), so even "FTM" formed from its points never crosses a bezel */
  var CORE_SC = 1;
  function coreAt() { var w = win("R2C4"); return { x: w.x + SW / 2, y: w.y + 520, R: 560 * CORE_SC }; }
  function rot(p, ax, ay) {
    var x = p[0], y = p[1], z = p[2], c, s, t;
    c = Math.cos(ax); s = Math.sin(ax); t = y * c - z * s; z = y * s + z * c; y = t;
    c = Math.cos(ay); s = Math.sin(ay); t = x * c + z * s; z = -x * s + z * c; x = t;
    return [x, y, z];
  }

  /* ---------- THE HOLOGRAM IS THE MARK ----------
     The point cloud is the traced Al Habib mark (hmg_mark_mono_shape.js): points on its outline in a front and a back layer
     (an extrusion), and points filling it in a middle layer. The mark's four quarters are the department marks' quarters
     (Emergency Command Center top-left, Medical Transport top-right, Field Medicine bottom-left, as in the Power BI marks):
     when a department is active its quarter takes the department colour and steps forward; in the intro all three split
     out and reassemble. "FTM" is formed from the same points at moments. No image is drawn over the core. */
  var NP = 0, PART = [], OUTLINE = [], FTM_PTS = [];
  function inPoly(x, y, poly) { var c = false; for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) { var a = poly[i], b = poly[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
  function quarter(x, y) { return x < 0 && y < 0 ? "ecc" : (x >= 0 && y < 0 ? "mt" : (x < 0 && y >= 0 ? "fm" : null)); }
  (function () {
    var r = seeded(7), ds = ["ecc", "mt", "fm"], shape = window.HMG_MARK_SHAPE, pts = [];
    if (shape && shape.loops && shape.loops.length) {
      var loop = shape.loops[0]; OUTLINE = loop;
      var per = 0, segs = []; for (var i = 0; i < loop.length; i++) { var a = loop[i], b = loop[(i + 1) % loop.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]); segs.push([a, b, l]); per += l; }
      [-0.16, 0.16].forEach(function (z) {   /* the outline, front and back layers */
        var n = 300;
        for (var k = 0; k < n; k++) { var d = k / n * per, s = 0; while (d > segs[s][2] && s < segs.length - 1) { d -= segs[s][2]; s++; } var f = d / (segs[s][2] || 1);
          pts.push({ m: [lerp(segs[s][0][0], segs[s][1][0], f), lerp(segs[s][0][1], segs[s][1][1], f), z], edge: 1 }); }
      });
      for (var gy = -1; gy <= 1; gy += 0.066) for (var gx = -1; gx <= 1; gx += 0.066) {   /* the fill, middle layer */
        var x = gx + (r() - 0.5) * 0.03, y = gy + (r() - 0.5) * 0.03;
        if (inPoly(x, y, loop)) pts.push({ m: [x, y, (r() - 0.5) * 0.22], edge: 0 });
      }
    } else {   /* no shape file: a plain sphere, so the blank engine still runs */
      for (var j = 0; j < 900; j++) { var yy = 1 - 2 * (j + 0.5) / 900, rr = Math.sqrt(1 - yy * yy), th = j * 2.39996; pts.push({ m: [Math.cos(th) * rr * 0.8, yy * 0.8, Math.sin(th) * rr * 0.8], edge: 0 }); }
    }
    pts.forEach(function (p, i) {
      var q = quarter(p.m[0], p.m[1]), d = q || ds[i % 3];
      p.q = q; p.d = d; p.scr = DEPT_SCREENS[d][Math.floor(r() * DEPT_SCREENS[d].length)]; p.hx = 140 + r() * 1640; p.hy = 140 + r() * 800;
      p.delay = r(); p.h = r(); p.j = r() - 0.5; p.tw = r() * 6.28; p.ti = Math.floor(r() * 1e6);
      PART.push(p);
    });
    NP = PART.length;
  })();
  /* "FTM" target points, sampled from text drawn into a small canvas (our own text, never an image file) */
  function ftmPoints() {
    if (FTM_PTS.length) return FTM_PTS;
    try {
      var c = document.createElement("canvas"), W = 360, H = 140; c.width = W; c.height = H;
      var x = c.getContext("2d"); x.fillStyle = "#fff"; x.font = "700 128px " + FONT; x.textBaseline = "middle"; x.textAlign = "center"; x.fillText(CFG.brand, W / 2, H / 2 + 6);
      var d = x.getImageData(0, 0, W, H).data;
      for (var y = 0; y < H; y += 3) for (var xx = 0; xx < W; xx += 3) if (d[(y * W + xx) * 4 + 3] > 128) FTM_PTS.push([(xx - W / 2) / (W / 2) * 1.05, (y - H / 2) / (W / 2) * 1.05]);
    } catch (e) { }
    if (!FTM_PTS.length) FTM_PTS.push([0, 0]);
    return FTM_PTS;
  }
  /* the shared state of the hologram for this frame: active department and its strength, split, FTM */
  var HOLO = { act: null, actK: 0, split: 0, ftm: 0 };
  function markPos(p) {
    var c = coreAt(), S = c.R * 0.74, t = C.stale ? 0 : C.T, x = p.m[0], y = p.m[1], z = p.m[2];
    var push = p.q ? (p.q === HOLO.act ? HOLO.actK : 0) + HOLO.split : 0;
    if (push > 0) { x += (x < 0 ? -1 : 1) * 0.09 * push; y += (y < 0 ? -1 : 1) * 0.09 * push; z -= 0.45 * push * (p.q === HOLO.act ? 1 : 0.4); }
    if (HOLO.ftm > 0) { var fp = ftmPoints(), tp = fp[(p.ti || 0) % fp.length], e = ease(HOLO.ftm); x = lerp(x, tp[0], e); y = lerp(y, tp[1], e); z = lerp(z, ((p.ti || 0) % 5 - 2) * 0.03, e); }
    var yaw = (C.stale ? 0.15 : 0.42 * Math.sin(t * 0.22)) * (1 - HOLO.ftm), q = rot([x * S, y * S, z * S], 0.10 * (1 - HOLO.ftm), yaw), k = 3200 / (3200 + q[2]);
    return [c.x + q[0] * k, c.y + q[1] * k, q[2], k];
  }
  function spherePos(p) { return markPos(p); }
  function drawCoreGlow(g, a) {   /* the projector light under the mark, a soft halo, light running along the mark's outline */
    var c = coreAt(), av = (C.stale ? 0.35 : 1) * a, t = C.stale ? 0 : C.T, S = c.R * 0.74;
    if (av <= 0.01) return;
    g.globalCompositeOperation = "lighter";
    glow(g, BRAND, c.x, c.y, c.R * 1.0, 0.30 * av);
    var by = c.y + S + 70, gr = g.createLinearGradient(0, by, 0, c.y - S * 0.2);
    gr.addColorStop(0, hexA(BRAND, 0.20 * av)); gr.addColorStop(1, hexA(BRAND, 0));
    g.fillStyle = gr; g.beginPath(); g.moveTo(c.x - 160, by); g.lineTo(c.x + 160, by); g.lineTo(c.x + S * 1.05, c.y - S * 0.2); g.lineTo(c.x - S * 1.05, c.y - S * 0.2); g.closePath(); g.fill();
    g.globalCompositeOperation = "source-over";
    g.save(); g.translate(c.x, by); g.scale(1, 0.18);
    g.beginPath(); g.arc(0, 0, 230, 0, 6.2832); g.lineWidth = 10; g.strokeStyle = hexA("#F6DDFF", 0.5 * av); g.stroke();
    g.beginPath(); g.arc(0, 0, 300 + 30 * Math.sin(t * 1.4), 0, 6.2832); g.lineWidth = 4; g.strokeStyle = hexA(BRAND, 0.35 * av); g.stroke(); g.restore();
    if (OUTLINE.length && HOLO.ftm < 0.5) {   /* light flowing along the front outline */
      var n = OUTLINE.length, proj = function (f) { var i = Math.floor(f * n) % n, j = (i + 1) % n, k2 = f * n - Math.floor(f * n), pp = { m: [lerp(OUTLINE[i][0], OUTLINE[j][0], k2), lerp(OUTLINE[i][1], OUTLINE[j][1], k2), -0.16], q: null }; var r = markPos(pp); return [r[0], r[1]]; };
      for (var m = 0; m < 2; m++) comet(g, function (tt) { return proj(((t * 0.06 + m / 3) + tt * 0.05) % 1); }, 1, 1, m === 0 ? "#FFFFFF" : BRAND, av * (1 - HOLO.ftm * 2), 30);
    }
  }
  var MIXC = {};
  function mixC(a, b, k) { k = Math.round(k * 8) / 8; var key = a + b + k; return MIXC[key] || (MIXC[key] = mix(a, b, k)); }   /* colour mixes, cached */
  function drawHolo() { }   /* v5: no separate emblems; the mark itself is the hologram */
  function drawParticles(g, mode, k, anchors, alpha) {
    var av = (C.stale ? 0.45 : 1) * (alpha === undefined ? 1 : alpha), t = C.T, c = coreAt(), S = c.R * 0.74;
    if (av <= 0.01) return;
    var band = ((t * 0.3) % 1.6) - 0.3;   /* a scan line moving down the mark */
    g.globalCompositeOperation = "lighter";
    for (var i = 0; i < NP; i++) {
      var p = PART[i], s = markPos(p), x = s[0], y = s[1], depth = s[3], from, to, u;
      var lit = p.q && ((p.q === HOLO.act && HOLO.actK > 0) || HOLO.split > 0) ? (p.q === HOLO.act ? HOLO.actK : 0) + HOLO.split : 0;
      var col = lit > 0.01 ? mixC(p.edge ? "#F6DDFF" : "#C98BEB", COL[p.q], clamp(lit, 0, 1)) : (p.edge ? "#F6DDFF" : "#B57BD6");
      var a = (p.edge ? 0.95 : 0.55) * (0.8 + 0.2 * Math.sin(t * 2 + p.tw)) * (s[2] < 0 ? 1 : 0.6), sz = (p.edge ? 7 : 6) * depth;
      var ny = (y - c.y) / S / 2 + 0.5; if (Math.abs(ny - band) < 0.03 && !C.stale) { a = 1; col = "#FFFFFF"; }
      if (mode !== "sphere") {
        u = clamp((k * 1.35 - p.delay * 0.35), 0, 1); var e = ease(u);
        if (mode === "home") { var w = win(p.scr); from = [w.x + p.hx, w.y + p.hy]; to = s; a = 0.35 + 0.65 * e; col = mixC(COL[p.d], col, e); }
        else { var an = anchors[i % anchors.length]; if (mode === "out") { from = s; to = an; } else { from = an; to = s; } col = COL[p.d]; }
        var mx = (from[0] + to[0]) / 2 + p.j * 900, my = (from[1] + to[1]) / 2 - 500 * (0.4 + p.h);
        x = (1 - e) * (1 - e) * from[0] + 2 * e * (1 - e) * mx + e * e * to[0];
        y = (1 - e) * (1 - e) * from[1] + 2 * e * (1 - e) * my + e * e * to[1];
        if (mode !== "home") a = 0.9; sz = 9;
      }
      a *= av; if (a <= 0.01) continue;
      sz = clamp(sz, 3, 14);
      g.globalAlpha = a; g.fillStyle = col; g.fillRect(x - sz / 2, y - sz / 2, sz, sz);
      if (i % 19 === 0) { g.globalAlpha = 1; glow(g, col, x, y, 30 + sz * 2, a * 0.6); }
    }
    g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
  }

  /* ---------- panels: glass cards, big confident numbers that count up ---------- */
  var HOME = {};
  function glass(g, x, y, w, h, col, hl, a) {
    var gr = g.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, "rgba(28,18,44,0.86)"); gr.addColorStop(1, "rgba(9,6,16,0.90)");
    rrect(g, x, y, w, h, 30); g.fillStyle = gr; g.fill();
    g.lineWidth = 3 + 4 * hl; g.strokeStyle = hexA(col, 0.28 + 0.6 * hl); g.stroke();
    var hg = g.createLinearGradient(x, 0, x + w, 0); hg.addColorStop(0, hexA(col, 0)); hg.addColorStop(0.5, hexA(col, 0.5 + 0.4 * hl)); hg.addColorStop(1, hexA(col, 0));
    g.fillStyle = hg; g.fillRect(x + 40, y + 2, w - 80, 4);
    if (hl > 0.01) { g.globalCompositeOperation = "lighter"; glow(g, col, x + w * (0.15 + 0.7 * ((C.T * 0.12) % 1)), y + 4, 120, 0.35 * hl * a); g.globalCompositeOperation = "source-over"; }
  }
  function panel(g, id, p, st) {
    var w = win(id), d = deptOf(id) || st.dept || "fm", x0 = w.x, y0 = w.y, a = st.a;
    st.age = C.T - REFRESH.t;
    if (a <= 0.01 || !p) return;
    var ga = g.globalAlpha; g.globalAlpha = a;
    var lift = (1 - ease(st.enter === undefined ? 1 : st.enter)) * 60;
    y0 += lift;
    if (st.rest) { g.fillStyle = hexA(COL[d], 0.55); g.fillRect(x0 + 90, y0 + 112, 8, 180); }
    else glass(g, x0 + 80, y0 + 72, 1760, 936 - lift, COL[d], st.hl, a);
    drawMark(g, d, x0 + 152, y0 + 136, 64, st.rest ? 0.7 : 1, { glow: st.rest ? 0 : 0.25 * st.hl });
    T(g, NAME[d], x0 + 204, y0 + 152, 44, { w: 600, c: COL[d], maxW: 960, where: id });
    if (C.stale) { g.globalAlpha = Math.max(a, 0.9); T(g, "No new data", x0 + 1800, y0 + 150, 44, { w: 600, c: AMBER, a: "right", maxW: 800, where: id }); g.globalAlpha = a; }
    var pulse = C.stale ? 0 : 1 - ease(st.age / 2.6);
    if (pulse > 0.01) { g.globalCompositeOperation = "lighter"; rrect(g, x0 + 80, y0 + 72, 1760, 936, 30); g.lineWidth = 10; g.strokeStyle = hexA(COL[d], 0.55 * pulse); g.stroke(); glow(g, COL[d], x0 + 960, y0 + 540, 900 * (1 - pulse) + 200, 0.18 * pulse); g.globalCompositeOperation = "source-over"; }
    if (p.k === "big") {
      var heads = wrap(g, p.head, 1680, 72, 600), hy = y0 + 270;
      heads.slice(0, 2).forEach(function (h, i) { T(g, h, x0 + 120, hy + i * 84, 72, { w: 600, maxW: 1680, where: id }); });
      var vy = y0 + (heads.length > 1 ? 650 : 610), val = C.nodata ? null : p.v;
      if (val === null || val === undefined) T(g, NODATA_TXT, x0 + 120, vy - 40, 84, { c: INK2, where: id });
      else if (p.text) T(g, nm(val), x0 + 120, vy - 30, p.px || 130, { w: 600, c: p.vc || "#FFFFFF", maxW: 1680, min: 64, glow: p.vc || COL[d], where: id, key: p.key });
      else {
        var r = T(g, countUp(val, st.age), x0 + 110, vy, 300, { w: 600, c: p.vc || "#FFFFFF", maxW: 1500, min: 120, glow: p.vc || COL[d], where: id, key: p.key });
        if (p.unit && r) T(g, p.unit, r.x + r.w + 30, vy, 100, { c: LIGHT[d], where: id });
      }
      var ly = y0 + 790, sub = (p.sub || []).slice();
      if (p.tgt && !C.nodata) sub.unshift(p.tgt);
      sub.forEach(function (s, i) { if (!s) return; wrap(g, s, 1680, 52, 400).slice(0, 2).forEach(function (l) { T(g, l, x0 + 120, ly, 52, { c: i === 0 && p.subc ? p.subc : INK2, maxW: 1680, where: id }); ly += 66; }); });
    } else if (p.k === "list") {
      T(g, p.head, x0 + 120, y0 + 250, 68, { w: 600, maxW: 1680, where: id });
      if (p.sub) T(g, p.sub, x0 + 120, y0 + 322, 46, { c: INK2, maxW: 1680, where: id });
      if (C.nodata) T(g, NODATA_TXT, x0 + 120, y0 + 520, 72, { c: INK2, where: id });
      else (p.rows || []).forEach(function (r, i) {
        var y = y0 + 430 + i * (r[2] ? 140 : 108), rk = p.reveal !== undefined ? clamp(p.reveal - i * 0.6, 0, 1) : 1;
        if (rk <= 0 || y > y0 + 990) return;
        var dx = (1 - easeOut(rk)) * 500;
        g.save(); g.beginPath(); g.rect(x0 + SAFE, y0 + SAFE, SW - 2 * SAFE, SH - 2 * SAFE); g.clip();
        T(g, nm(r[0]), x0 + 120 + dx, y, 58, { maxW: 1380, min: 40, al: ease(rk), where: id, key: r[3] });
        if (r[1]) T(g, r[1], x0 + 1800 + dx, y, 58, { w: 600, c: LIGHT[d], a: "right", al: ease(rk), maxW: 600, where: id });
        if (r[2]) T(g, r[2], x0 + 120 + dx, y + 58, 44, { c: INK2, maxW: 1380, min: 36, al: ease(rk), where: id });
        g.restore();
      });
    } else if (p.k === "kpi") { kpiTile(g, x0, y0, p, d, st);
    } else if (p.k === "steps") { stepsPanel(g, x0, y0, p, d);
    } else if (p.k === "countlist") { countList(g, x0, y0, p, d, st);
    } else if (p.k === "note") {
      T(g, p.head, x0 + 120, y0 + 270, 64, { w: 600, maxW: 1680, where: id });
      var ny = y0 + 380;
      (p.lines || []).forEach(function (s) { wrap(g, s, 1680, 52, 400).forEach(function (l) { T(g, l, x0 + 120, ny, 52, { c: INK2, maxW: 1680, where: id }); ny += 66; }); ny += 20; });
    }
    g.globalAlpha = ga;
  }

  /* ---------- KPI tile: the number first and big, with one simple chart against the confirmed Target ----------
     p: { head, v (number or null), txt (the formatted value), unit, tgt (number), tgtTxt, lower (true when lower is better),
          max (scale end), chart: "ring" | "bullet", date (one line saying which day), cmp (comparison line) }
     Within Target: department colour. Over Target: amber. No value: the track and the Target only, "No data for this day yet". */
  function kpiState(p) { if (!p || p.v === null || p.v === undefined || C.nodata) return "none"; if (p.tgt === null || p.tgt === undefined) return "plain"; return (p.lower ? p.v <= p.tgt : p.v >= p.tgt) ? "ok" : "over"; }
  function kpiTile(g, x0, y0, p, d, st) {
    var k = kpiState(p), col = COL[d], age = st.age === undefined ? 9 : st.age, grow = easeOut((age - 0.3) / 1.4), ring = p.chart === "ring";
    T(g, p.head, x0 + 120, y0 + 262, 70, { w: 600, maxW: k === "over" ? 1180 : 1680, where: "kpi" });
    /* honesty without colour: a missed Target is said in words, at full weight, in the department colour */
    if (k === "over") T(g, p.lower ? "Above Target" : "Below Target", x0 + 1800, y0 + 262, 64, { w: 700, a: "right", c: COL[d], where: "kpi" });
    if (k === "none") T(g, C.nodata ? NODATA_TXT : "No data yet", x0 + 120, y0 + 470, 76, { w: 600, c: INK2, maxW: ring ? 1050 : 1680, where: "kpi" });
    else { var r = T(g, countUp(p.txt, age), x0 + 110, y0 + 560, 250, { w: 700, c: "#FFFFFF", maxW: ring ? 1000 : 1500, min: 120, glow: col, where: "kpi", key: p.key });
      if (p.unit && r) T(g, p.unit, r.x + r.w + 26, y0 + 560, 96, { c: LIGHT[d], where: "kpi" }); }
    if (ring) {
      var cx = x0 + 1460, cy = y0 + 560, R = 250, f = k === "none" ? 0 : clamp(p.v / (p.max || 100), 0, 1) * grow;
      g.lineCap = "butt"; g.lineWidth = 48; g.strokeStyle = "rgba(255,255,255,0.10)"; g.beginPath(); g.arc(cx, cy, R, 0, 6.2832); g.stroke();
      if (f > 0) { g.strokeStyle = col; g.beginPath(); g.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + f * 6.2832); g.stroke(); }
      if (k === "over" && grow >= 1) {   /* the missed part, between the value and the Target: a dashed segment */
        var a1 = -Math.PI / 2 + f * 6.2832, a2 = -Math.PI / 2 + clamp(p.tgt / (p.max || 100), 0, 1) * 6.2832;
        g.setLineDash([16, 12]); g.lineWidth = 6; g.strokeStyle = hexA(col, 0.95);
        [R - 24, R + 24].forEach(function (rr) { g.beginPath(); g.arc(cx, cy, rr, Math.min(a1, a2), Math.max(a1, a2)); g.stroke(); });
        g.setLineDash([]); g.lineWidth = 48;
      }
      if (p.tgt !== null && p.tgt !== undefined) { var ta = -Math.PI / 2 + clamp(p.tgt / (p.max || 100), 0, 1) * 6.2832; g.lineWidth = 10; g.strokeStyle = "#FFFFFF"; g.beginPath(); g.moveTo(cx + Math.cos(ta) * (R - 44), cy + Math.sin(ta) * (R - 44)); g.lineTo(cx + Math.cos(ta) * (R + 46), cy + Math.sin(ta) * (R + 46)); g.stroke(); }
    } else if (p.chart === "bullet") {
      var bx = x0 + 120, bw = 1680, by = y0 + 680, bh = 54, mx = p.max || 100, fv = k === "none" ? 0 : clamp(p.v / mx, 0, 1) * grow, tx = bx + bw * clamp(p.tgt / mx, 0, 1);
      rrect(g, bx, by, bw, bh, 12); g.fillStyle = "rgba(255,255,255,0.10)"; g.fill();
      g.fillStyle = hexA(COL[d], 0.14); if (p.lower) g.fillRect(bx, by, tx - bx, bh); else g.fillRect(tx, by, bx + bw - tx, bh);
      if (fv > 0) { rrect(g, bx, by + 8, Math.max(16, bw * fv), bh - 16, 10); g.fillStyle = col; g.fill(); }
      if (k === "over" && grow >= 1) { var vx = bx + bw * fv, m0 = Math.min(vx, tx), m1 = Math.max(vx, tx); g.setLineDash([16, 12]); g.lineWidth = 5; g.strokeStyle = hexA(col, 0.95); g.strokeRect(m0, by + 8, m1 - m0, bh - 16); g.setLineDash([]); }
      g.fillStyle = "#FFFFFF"; g.fillRect(tx - 5, by - 26, 10, bh + 52);
    }
    var ly = y0 + (ring ? 860 : 830), lines = [];
    if (p.tgtTxt) lines.push([p.tgtTxt, INK]);
    if (p.note) lines.push([p.note, INK2]);
    lines.slice(0, 3).forEach(function (l, i) { T(g, l[0], x0 + 120, ly + i * 60, i === 0 ? 54 : 48, { w: i === 0 ? 600 : 400, c: l[1], maxW: ring ? 1050 : 1680, where: "kpi" }); });
  }

  /* ---------- the brand screen (R1C1): logo slot + "FTM", always on ---------- */
  /* the header plate: the Al Habib logo (as is, at natural size or smaller) and "FTM" as one lockup on one line with one
     shared glow; the three department marks sit under it */
  /* compact steps panel: one row per step - its label, its minutes or "No data yet", its Target, a small bullet bar */
  function stepsPanel(g, x0, y0, p, d) {
    T(g, p.head, x0 + 120, y0 + 262, 70, { w: 600, maxW: 1680, where: "steps" });
    var n = p.rows.length, top = y0 + 330, rh = Math.min(100, (y0 + 990 - top) / n), fs = Math.max(36, Math.min(44, Math.round(rh * 0.66)));
    p.rows.forEach(function (r, i) {
      var y = top + i * rh, has0 = r.v !== null && r.v !== undefined && !C.nodata, over = has0 && r.tgt !== undefined && r.tgt !== null && r.v > r.tgt, mx = (r.tgt || 5) * 2;
      var by0 = y + Math.round(rh * 0.55);
      T(g, r.name, x0 + 120, by0, fs, { w: 600, maxW: 640, min: 36, where: "steps" });
      if (has0) T(g, (Math.round(r.v * 10) / 10) + " min", x0 + 760, by0, fs + 2, { w: 700, c: "#FFFFFF", where: "steps", key: r.key });
      else T(g, C.nodata ? "No data" : "No data yet", x0 + 760, by0, 36, { c: INK2, maxW: 320, min: 36, where: "steps" });
      if (r.tgt !== null && r.tgt !== undefined) T(g, (over ? "Above Target " : "Target ") + r.tgt + " min", x0 + 1040, by0, 36, { w: over ? 700 : 400, c: over ? COL[d] : INK2, maxW: 400, where: "steps" });
      var bx = x0 + 1470, bw = 310, by = by0 - 22, f = has0 ? clamp(r.v / mx, 0, 1) : 0, tx = bx + bw * 0.5;
      rrect(g, bx, by, bw, 22, 8); g.fillStyle = "rgba(255,255,255,0.10)"; g.fill();
      g.fillStyle = hexA(COL[d], 0.14); g.fillRect(bx, by, tx - bx, 22);
      if (f > 0) { rrect(g, bx, by + 4, Math.max(10, bw * f), 14, 6); g.fillStyle = COL[d]; g.fill(); }
      if (over) { var vx = bx + bw * f; g.setLineDash([10, 8]); g.lineWidth = 3; g.strokeStyle = COL[d]; g.strokeRect(tx, by + 2, vx - tx, 18); g.setLineDash([]); }
      g.fillStyle = "#FFFFFF"; g.fillRect(tx - 3, by - 10, 6, 42);
    });
  }

  /* count with its names underneath: the count first, then each name (wrapped inside the panel); when the names do not fit,
     they turn over a page every 4 s. A name without a value (withheld or blank) is written by the story as "1 event". */
  function countList(g, x0, y0, p, d, st) {
    T(g, p.head, x0 + 120, y0 + 262, 72, { w: 600, maxW: 1680, where: "countlist" });
    if (C.nodata || p.v === null || p.v === undefined) { T(g, NODATA_TXT, x0 + 120, y0 + 470, 76, { c: INK2, where: "countlist" }); return; }
    T(g, countUp(String(p.v), st.age), x0 + 110, y0 + 520, 220, { w: 700, c: "#FFFFFF", glow: COL[d], where: "countlist", key: p.key });
    var lines = [];
    (p.names || []).forEach(function (n) { wrap(g, n[0], 1640, 52, 600).forEach(function (l, i) { lines.push([l, i === 0 ? n[1] : null]); }); });
    (p.extra || []).forEach(function (e) { lines.push([e, null, true]); });
    var per = Math.floor((y0 + 1000 - (y0 + 640)) / 64), pages = Math.max(1, Math.ceil(lines.length / per)), pg = C.stale ? 0 : Math.floor(C.T / 4) % pages;
    lines.slice(pg * per, pg * per + per).forEach(function (l, i) { T(g, l[0], x0 + 120, y0 + 650 + i * 64, l[2] ? 44 : 52, { w: l[2] ? 400 : 600, c: l[2] ? INK2 : LIGHT[d], maxW: 1680, where: "countlist", key: l[1] || undefined }); });
    if (pages > 1) T(g, (pg + 1) + " of " + pages, x0 + 1800, y0 + 262, 40, { a: "right", c: INK2, where: "countlist" });
  }

  /* ---------- the story caption ---------- */
  function caption(g, cap, st, story) {
    var w = win(cap.screen), x = w.x + cap.x - (1 - easeOut(st.enter)) * 120, y = w.y + cap.y, cw = cap.w, ch = cap.h, a = st.a;
    if (a <= 0.01) return;
    var ga = g.globalAlpha; g.globalAlpha = a;
    x = clamp(x, w.x + 20, w.x + SW - cw - 20);
    glass(g, x, y, cw, ch, C.stale ? AMBER : COL[story.dept], 0.6, a);
    g.fillStyle = hexA(C.stale ? AMBER : COL[story.dept], 0.9); g.fillRect(x + 50, y + 60, 10, 140);
    var tx = x + 90, maxW = cw - 140, ty = y + 100;
    drawMark(g, story.dept, x + cw - 150, y + 150, 150, 1, { reveal: easeOut(st.enter * 1.1), rot: (1 - easeOut(st.enter)) * -0.8, glow: 0.35 });
    T(g, story.kicker || NAME[story.dept], tx, ty, 50, { w: 600, c: COL[story.dept], maxW: maxW - 220, where: "cap" }); ty += 124;
    wrap(g, story.title, maxW - 200, 104, 600).forEach(function (l) { T(g, l, tx, ty, 104, { w: 600, maxW: maxW - 200, where: "cap" }); ty += 118; });
    ty += 14;
    var pt = C.nodata ? NODATA_TXT : story.point;
    wrap(g, pt, maxW, 76, 600).forEach(function (l) { T(g, l, tx, ty, 76, { w: 600, c: LIGHT[story.dept], maxW: maxW, where: "cap" }); ty += 92; });
    (story.more || []).forEach(function (m) { if (C.nodata || !m) return; ty += 6; wrap(g, m, maxW, 54, 400).forEach(function (l) { T(g, l, tx, ty, 54, { c: INK2, maxW: maxW, where: "cap" }); ty += 68; }); });
    var by = y + ch - 44;
    if (C.stale) T(g, "No new data. Figures shown are from the last update", tx, by - 60, 46, { w: 600, c: AMBER, maxW: maxW, where: "cap" });
    T(g, C.stale ? "" : (story.foot || CFG.capFoot), tx, by, 42, { c: INK2, maxW: maxW, where: "cap" });
    g.globalAlpha = ga;
  }

  /* ---------- map ---------- */
  var LAT0 = Math.cos(24 * Math.PI / 180);
  function view(clon, clat, k, cx, cy, rot0) { return { clon: clon, clat: clat, k: k, cx: cx, cy: cy, r: rot0 || 0 }; }
  function countryView(box) { var k = Math.min(box.h / 16.1, box.w / (21.4 * LAT0)); return view(45.1, 24.25, k, box.x + box.w / 2, box.y + box.h / 2); }
  function mixView(a, b, e) { return view(lerp(a.clon, b.clon, e), lerp(a.clat, b.clat, e), Math.exp(lerp(Math.log(a.k), Math.log(b.k), e)), lerp(a.cx, b.cx, e), lerp(a.cy, b.cy, e), lerp(a.r, b.r, e)); }
  function P(v, lon, lat) {
    var x = (lon - v.clon) * v.k * LAT0, y = -(lat - v.clat) * v.k;
    if (v.r) { var c = Math.cos(v.r), s = Math.sin(v.r), t = x * c - y * s; y = x * s + y * c; x = t; }
    return [v.cx + x, v.cy + y];
  }
  var OUTLINE = [];
  function drawOutline(g, v, prog, a) {
    var o = OUTLINE; if (!o.length) return;
    var n = Math.max(2, Math.round(o.length * clamp(prog, 0, 1))), q;
    g.beginPath();
    for (var i = 0; i < n; i++) { q = P(v, o[i][0], o[i][1]); if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); }
    if (prog >= 1) { g.closePath(); g.fillStyle = "rgba(201,139,235," + (0.09 * a) + ")"; g.fill(); }
    g.lineJoin = "round";
    g.lineWidth = 30; g.strokeStyle = "rgba(201,139,235," + (0.08 * a) + ")"; g.stroke();
    g.lineWidth = 6; g.strokeStyle = "rgba(230,190,255," + (0.85 * a) + ")"; g.stroke();
    if (prog < 1 && prog > 0) { g.globalCompositeOperation = "lighter"; glow(g, "#FFFFFF", q[0], q[1], 70, a); glow(g, BRAND, q[0], q[1], 160, a * 0.7); g.globalCompositeOperation = "source-over"; }
  }
  function outlineAnchors(v) { var o = OUTLINE, out = []; for (var i = 0; i < o.length - 1; i++) for (var k = 0; k < 3; k++) out.push(P(v, lerp(o[i][0], o[i + 1][0], k / 3), lerp(o[i][1], o[i + 1][1], k / 3))); return out.length ? out : [[C.W / 2, C.H / 2]]; }
  function arcPts(p0, p1, bend, n) {
    var mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2, dx = p1[0] - p0[0], dy = p1[1] - p0[1];
    var cx = mx - dy * bend, cy = my + dx * bend, out = [];
    for (var i = 0; i <= n; i++) { var t = i / n; out.push([(1 - t) * (1 - t) * p0[0] + 2 * t * (1 - t) * cx + t * t * p1[0], (1 - t) * (1 - t) * p0[1] + 2 * t * (1 - t) * cy + t * t * p1[1]]); }
    return out;
  }
  function along(pts, f) { var n = (pts.length - 1) * clamp(f, 0, 1), i = Math.min(pts.length - 2, Math.floor(n)), k = n - i; return [lerp(pts[i][0], pts[i + 1][0], k), lerp(pts[i][1], pts[i + 1][1], k)]; }
  function polyline(g, pts, prog) {
    var n = (pts.length - 1) * clamp(prog, 0, 1), i0 = Math.floor(n);
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i <= i0; i++) g.lineTo(pts[i][0], pts[i][1]);
    if (i0 < pts.length - 1) { var f = n - i0; g.lineTo(lerp(pts[i0][0], pts[i0 + 1][0], f), lerp(pts[i0][1], pts[i0 + 1][1], f)); }
    g.stroke();
  }
  function placeLabels(g, items, a, bounds) {
    var boxes = [];
    items.forEach(function (it) {
      setFont(g, it.px, it.w || 600); var s = nm(it.s), wd = Math.min(g.measureText(s).width, it.maxW || 1200), h = it.px * 1.25, off = it.off || 34;
      var tries = [[it.x + off, it.y - h / 2], [it.x - off - wd, it.y - h / 2], [it.x - wd / 2, it.y - off - h], [it.x - wd / 2, it.y + off]];
      for (var i = 0; i < tries.length; i++) {
        var l = tries[i][0], t = tries[i][1];
        if (bounds) { l = clamp(l, bounds.x + 10, bounds.x + bounds.w - 10 - wd); t = clamp(t, bounds.y + 10, bounds.y + bounds.h - 10 - h); }
        var sc = screenOf(l + wd / 2, t + h / 2);
        l = clamp(l, sc.x0 + SAFE, sc.x0 + SW - SAFE - wd); t = clamp(t, sc.y0 + SAFE, sc.y0 + SH - SAFE - h);
        var out = bounds && (l < bounds.x || l + wd > bounds.x + bounds.w || t < bounds.y || t + h > bounds.y + bounds.h);
        var hit = boxes.some(function (b) { return l < b[0] + b[2] + 16 && l + wd + 16 > b[0] && t < b[1] + b[3] + 8 && t + h + 8 > b[1]; });
        if ((hit || out) && !(it.force && i === tries.length - 1)) continue;
        boxes.push([l, t, wd, h]);
        if (it.bg) { rrect(g, l - 18, t - 8, wd + 36, h + 16, 14); g.fillStyle = "rgba(8,5,14," + (0.78 * a) + ")"; g.fill(); g.lineWidth = 2; g.strokeStyle = hexA(it.edge || BRAND, 0.5 * a); g.stroke(); }
        T(g, s, l, t + it.px * 0.95, it.px, { w: it.w || 600, c: it.c || INK, al: a, maxW: it.maxW || 1200, where: "map", key: it.key });
        return;
      }
    });
  }

  /* ---------- streams to the owning department and the light-sweep transition ---------- */
  function streams(g, d, k) {
    if (k <= 0.02 || C.stale) return;
    var st = stageRect(), r = seeded(31);
    g.globalCompositeOperation = "lighter";
    for (var i = 0; i < 70; i++) {
      var scr = DEPT_SCREENS[d][Math.floor(r() * DEPT_SCREENS[d].length)], w = win(scr), from, to;
      if (d === "ecc") { from = [st.x + 40, st.y + r() * st.h]; to = [w.x + SW - 60, w.y + 200 + r() * 680]; }
      else if (d === "fm") { from = [st.x + st.w - 40, st.y + r() * st.h]; to = [w.x + 60, w.y + 200 + r() * 680]; }
      else { from = [st.x + r() * st.w, st.y + 30]; to = [w.x + 200 + r() * 1520, w.y + SH - 60]; }
      var f = (C.T * 0.4 + r()) % 1, x = lerp(from[0], to[0], f), y = lerp(from[1], to[1], f) + Math.sin(f * Math.PI) * 120 * (r() - 0.5);
      glow(g, COL[d], x, y, 30, 0.7 * k * Math.sin(f * Math.PI));
    }
    g.globalCompositeOperation = "source-over";
  }
  function sweep(g, f, col) {   /* a soft vertical band of light crossing the whole wall (f 0..1) */
    if (f <= 0 || f >= 1 || C.stale) return;
    var x = lerp(-1500, C.W + 1500, f), gr = g.createLinearGradient(x - 1200, 0, x + 1200, 0);
    gr.addColorStop(0, hexA(col, 0)); gr.addColorStop(0.5, hexA(col, 0.16 * Math.sin(f * Math.PI))); gr.addColorStop(1, hexA(col, 0));
    g.globalCompositeOperation = "lighter"; g.fillStyle = gr; g.fillRect(x - 1200, 0, 2400, C.H); g.globalCompositeOperation = "source-over";
  }

  /* ---------- the cycle ---------- */
  var STORIES = [], INTRO = 10;
  function cycleLen() { return INTRO + STORIES.reduce(function (s, x) { return s + x.dur; }, 0); }
  function segAt(t) {
    if (t < INTRO) return { intro: true, u: t, i: -1 };
    var a = INTRO;
    for (var i = 0; i < STORIES.length; i++) { if (t < a + STORIES[i].dur) return { s: STORIES[i], u: t - a, i: i, a: a }; a += STORIES[i].dur; }
    var l = STORIES[STORIES.length - 1]; return { s: l, u: l.dur - 0.001, i: STORIES.length - 1, a: a - l.dur };
  }
  function startOf(i) { var a = INTRO; for (var k = 0; k < i; k++) a += STORIES[k].dur; return a; }
  var anchorCache = {};
  function anchorsOf(s) { var key = s.id + "|" + C.B; if (!anchorCache[key]) anchorCache[key] = s.anchors(); return anchorCache[key]; }

  function intro(g, u) {
    /* 0-4 s: points rise from every department screen and assemble the mark; 4-6.2 s: the mark splits into the three department
       quarters, each in its colour, then reassembles; 6.2-8.6 s: the same points form "FTM"; 8.6-10 s: they dissolve back into
       the mark. The core is inside R2C4, so "FTM" never crosses a bezel. */
    var k = clamp(u / 4, 0, 1), all = Object.keys(HOME);
    all.forEach(function (id) { panel(g, id, HOME[id], { a: 0.75 - 0.35 * Math.sin(Math.PI * k), hl: 0, rest: true }); });
    HOLO.act = null; HOLO.actK = 0;
    HOLO.split = ease((u - 4) / 0.8) * (1 - ease((u - 5.5) / 0.7));
    HOLO.ftm = ease((u - 6.2) / 0.9) * (1 - ease((u - 8.4) / 1.1));
    if (k >= 1) drawCoreGlow(g, ease((u - 3.6) / 1));
    drawParticles(g, k < 1 ? "home" : "sphere", k);
    var sk = HOLO.split;
    if (sk > 0.05) [["ecc", "R2C3", 1800, "right"], ["mt", "R2C5", 120, "left"], ["fm", "R3C4", 960, "center"]].forEach(function (m) {
      var w = win(m[1]); T(g, NAME[m[0]], w.x + m[2], w.y + (m[1] === "R3C4" ? 160 : 300), 64, { w: 600, a: m[3], c: COL[m[0]], al: sk, maxW: 1700, where: "intro" });
    });
    var w3 = win("R3C4"); T(g, "Key figures for Emergency Command Center, Medical Transport and Field Medicine", w3.x + 960, w3.y + 900, 50, { a: "center", c: INK2, al: ease((u - 6.4) / 0.8) * (1 - ease((u - 9) / 0.8)), maxW: 1700, where: "intro" });
    HOLO.split = 0; HOLO.ftm = 0;
    liveStrip(g);
    return { label: "The core forms" };
  }

  /* the small "Live" strip along the bottom edge of the core screen: a heartbeat dot, the word Live, "Updated HH:MM" */
  function liveStrip(g) {
    var w = win("R2C4"), y = w.y + 1000, t = C.T, hb = C.stale ? 0 : Math.pow(Math.max(0, Math.sin(t * Math.PI * 1.2)), 8), col = C.stale ? AMBER : "#F6DDFF";
    var x = w.x + 150;   /* bottom-left corner, clear of the projector ring */
    g.globalCompositeOperation = "lighter"; glow(g, C.stale ? AMBER : BRAND, x, y - 14, 40 + 24 * hb, 0.5 + 0.5 * hb); g.globalCompositeOperation = "source-over";
    dot(g, x, y - 14, 10 + 3 * hb, col, 1);
    var step = C.stale ? 0 : Math.floor(t) % 12;
    for (var i = 0; i < 12; i++) { var an = i / 12 * 6.2832 - Math.PI / 2; g.globalAlpha = i === step ? 0.9 : 0.22; g.fillStyle = col; g.fillRect(x + Math.cos(an) * 24 - 2, y - 14 + Math.sin(an) * 24 - 2, 4, 4); }
    g.globalAlpha = 1;
    T(g, C.stale ? "No new data since " + CFG.updated : "Live", x + 44, y, 40, { w: 600, c: col, maxW: 700, where: "live" });
    if (!C.stale) T(g, "Updated " + CFG.updated, x + 160, y, 40, { c: INK2, where: "live" });
  }

  function drawScene(g, t, o) {
    C.B = o.B; var cs = L.canvasSize(o.B); C.W = cs.w; C.H = cs.h; C.stale = !!o.stale; C.nodata = !!o.nodata; C.longNames = !!o.longNames;
    C.T = o.T === undefined ? t : o.T; FRAMEKEYS = new Set();
    g.globalCompositeOperation = "source-over"; g.globalAlpha = 1;
    background(g);
    var sg = segAt(t), all = Object.keys(HOME);
    if (sg.intro) return intro(g, sg.u);
    var s = sg.s, u = sg.u, D = s.dur;
    CFG.active = s.dept;
    var shapeA = ease((u - 1.3) / 0.9) * ease((D - 1.1 - u) / 0.9);
    var morphOut = u < 2.2, morphBack = u > D - 2;
    var swap = Math.min(Math.abs(u - 1.2), Math.abs(u - (D - 1.2)));
    var dip = swap < 0.4 ? ease(swap / 0.4) : 1, inBody = u > 1.2 && u < D - 1.2;
    var sp = s.panels ? s.panels(u) : {};
    all.forEach(function (id) {
      var d = deptOf(id), own = d === s.dept, hidden = (s.hide || []).indexOf(id) >= 0;
      var a = own ? 1 : (s.alsoLit && s.alsoLit.indexOf(d) >= 0 ? 0.8 : 0.5), hl = own ? ease(Math.min(u - 0.5, D - u - 0.5) / 1) : 0;
      if (hidden) a *= Math.max(0, 1 - 2 * shapeA);
      var p = inBody && sp[id] ? sp[id] : HOME[id];
      if (sp[id] && !hidden) a *= dip;
      panel(g, id, p, { a: own ? a : a * 0.8, hl: hl, rest: !own, enter: own ? (u - 0.6) / 0.8 : 1 });
    });
    STAGE.forEach(function (id) { if (sp[id]) panel(g, id, sp[id], { a: shapeA, hl: 0, dept: s.dept, enter: (u - 1.3) / 0.8 }); });
    g.save(); s.draw(g, u, shapeA); g.restore();
    g.globalCompositeOperation = "source-over"; g.globalAlpha = 1;
    streams(g, s.dept, shapeA * 0.8);
    if (s.keepCore) {
      /* the mark stays: "FTM" forms from its points at the start, then the story's department quarter steps forward in its colour */
      HOLO.ftm = ease((u - 0.2) / 0.7) * (1 - ease((u - 1.7) / 0.8));
      HOLO.act = s.dept; HOLO.actK = ease((u - 2.4) / 1) * (1 - ease((u - (D - 1.4)) / 1));
      drawCoreGlow(g, 1); drawParticles(g, "sphere", 0);
    } else if (morphOut) {
      HOLO.act = s.dept; HOLO.actK = 1 - ease(u / 0.5);
      if (u < 0.5) { drawCoreGlow(g, 1 - u / 0.5); drawParticles(g, "sphere", 0); }
      else drawParticles(g, "out", ease((u - 0.5) / 1.6), anchorsOf(s), 1 - ease((u - 1.7) / 0.5));
    } else if (morphBack) {
      HOLO.act = null; HOLO.actK = 0;
      var kb = ease((u - (D - 2)) / 1.7);
      drawParticles(g, "back", kb, anchorsOf(s), ease((u - (D - 2)) / 0.4));
      if (kb > 0.9) drawCoreGlow(g, (kb - 0.9) * 10);
    }
    HOLO.act = null; HOLO.actK = 0; HOLO.ftm = 0;
    sweep(g, u / 1.4, COL[s.dept]);
    caption(g, s.cap, { a: ease((u - 0.9) / 0.8) * ease((D - 0.6 - u) / 0.6), enter: (u - 0.9) / 0.9 }, s);
    liveStrip(g);
    return { label: s.label + " (" + NAME[s.dept] + ")" };
  }

  /* ---------- the preview page ---------- */
  function run() {
    loadLogo(); loadMarks();
    var q = new URLSearchParams(location.search);
    var B = clamp(+(q.get("b") || 0) || 0, 0, 40), stale = q.get("state") === "stale", nodata = q.get("state") === "nodata", longNames = q.has("long");
    var CYCLE = cycleLen(), pinned = q.has("t") ? +q.get("t") : null, screen = q.get("screen") || null, fit = q.get("fit") === "1";
    var paused = pinned !== null, offset = 0, pausedAt = pinned === null ? 0 : pinned, dragging = false;
    var perf = { n: 0, sum: 0, max: 0, last: 0 };
    var clock = window.WallClock.create({ fetch: function () { return Promise.resolve({ ok: true, json: function () { return Promise.resolve(Date.now()); } }); }, samples: 3 });
    clock.start();
    if (!q.has("t") && !q.has("scan") && !q.has("bench")) REFRESH.t = Date.now() / 1000;
    function wallSec() { return clock.now() / 1000; }
    function cycleT() { if (paused) return pausedAt; var v = (wallSec() + offset) % CYCLE; return v < 0 ? v + CYCLE : v; }
    function jump(v) { if (paused) pausedAt = v; else offset = v - (wallSec() % CYCLE); }
    var root = document.getElementById("app");
    var jumps = '<button type="button" class="jump" data-t="4.0">The core forms</button>' + STORIES.map(function (s, i) {
      return '<button type="button" class="jump j-' + s.dept + '" data-t="' + (startOf(i) + s.peek).toFixed(1) + '">' + (i + 1) + '. ' + s.label + '</button>';
    }).join("");
    root.innerHTML =
      '<header><h1>' + CFG.headTitle + '</h1><p class="sub">' + CFG.headSub + '</p></header>' +
      '<div class="bar"><button id="play" type="button">Pause</button>' +
      '<label class="grow">Cycle time <input id="scrub" type="range" min="0" max="' + CYCLE + '" step="0.1" value="0"> <span id="tval">0.0 s</span> of ' + CYCLE + ' s</label>' +
      '<label>Bezel <input id="bezel" type="range" min="0" max="40" step="1" value="' + B + '"> <span id="bval">' + B + ' px</span></label></div>' +
      '<div class="bar"><button id="stale" type="button" aria-pressed="' + stale + '">Stale data</button>' +
      '<button id="nodata" type="button" aria-pressed="' + nodata + '">No data</button>' +
      '<button id="long" type="button" aria-pressed="' + longNames + '">Long names test</button>' +
      '<label>Screen <select id="scr">' + L.screens().map(function (s) { return '<option>' + s + '</option>'; }).join("") + '</select></label>' +
      '<button id="open" type="button">View this screen at 1920 x 1080</button></div>' +
      '<div class="bar jumps">' + jumps + '</div>' +
      '<p class="now">Now: <span id="pname"></span></p>' +
      '<div id="wallbox"><canvas id="wall"></canvas></div>' +
      '<div id="one" hidden><div class="bar"><button id="back" type="button">Back to the whole wall</button><button id="fit" type="button">Fit to window</button><span id="onelab"></span></div><div id="onebox"><canvas id="onec" width="1920" height="1080"></canvas></div></div>' +
      '<p class="foot" id="foot"></p><pre id="bench" hidden></pre>';
    var $ = function (id) { return document.getElementById(id); };
    var cv = $("wall"), g = cv.getContext("2d"), one = $("onec"), g1 = one.getContext("2d");
    function opts(b) { return { B: b, stale: stale, nodata: nodata, longNames: longNames, T: paused ? pausedAt : wallSec() }; }
    function drawBezels(gg, b, s) {
      var cs = L.canvasSize(b); gg.fillStyle = "#000";
      for (var c = 1; c < 7; c++) { var x = c * SW + (c - 1) * b; if (b > 0) gg.fillRect(x, 0, b, cs.h); }
      for (var r = 1; r < 3; r++) { var y = r * SH + (r - 1) * b; if (b > 0) gg.fillRect(0, y, cs.w, b); }
      gg.strokeStyle = "rgba(255,255,255,0.35)"; gg.lineWidth = 1 / s; gg.beginPath();
      for (c = 1; c < 7; c++) { x = c * SW + (c - 1) * b; gg.moveTo(x, 0); gg.lineTo(x, cs.h); if (b) { gg.moveTo(x + b, 0); gg.lineTo(x + b, cs.h); } }
      for (r = 1; r < 3; r++) { y = r * SH + (r - 1) * b; gg.moveTo(0, y); gg.lineTo(cs.w, y); if (b) { gg.moveTo(0, y + b); gg.lineTo(cs.w, y + b); } }
      gg.stroke();
    }
    function sizeWall() {
      var cs = L.canvasSize(B), dpr = window.devicePixelRatio || 1;
      var cssW = Math.max(320, Math.min(window.innerWidth - 32, (window.innerHeight - 250) * cs.w / cs.h)), cssH = cssW * cs.h / cs.w;
      cv.style.width = cssW + "px"; cv.style.height = cssH + "px"; cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr);
    }
    var lastLabel = "";
    function renderWall(t) { var cs = L.canvasSize(B), s = cv.width / cs.w; g.setTransform(s, 0, 0, s, 0, 0); lastLabel = drawScene(g, t, opts(B)).label; g.setTransform(s, 0, 0, s, 0, 0); drawBezels(g, B, s); }
    function renderOne(gg, id, t, b, o) { var w = L.windowFor(id, b); gg.setTransform(1, 0, 0, 1, -w.x, -w.y); gg.save(); gg.beginPath(); gg.rect(w.x, w.y, SW, SH); gg.clip(); lastLabel = drawScene(gg, t, o || opts(b)).label; gg.restore(); }
    function frame() {
      var t = cycleT(), t0 = performance.now();
      if (screen) renderOne(g1, screen, t, B); else renderWall(t);
      var dt = performance.now() - t0; perf.n++; perf.sum += dt; perf.max = Math.max(perf.max, dt); perf.last = dt;
      if (!dragging) $("scrub").value = t.toFixed(1);
      $("tval").textContent = t.toFixed(1) + " s";
      $("pname").textContent = lastLabel + (stale ? ", stale data" : "") + (nodata ? ", no data" : "") + (longNames ? ", long names" : "");
      if (perf.n % 30 === 0) $("foot").textContent = "Draw time (this view, script side): last " + perf.last.toFixed(1) + " ms, average " + (perf.sum / perf.n).toFixed(1) + " ms. Smallest text drawn: " + stats.minPx + " px at true size. Text pushed off a bezel: " + stats.unsafe + ". Logo: " + (LOGO.state === "file" ? "loaded from file" : "no file, placeholder shown") + ".";
    }
    function loop() { frame(); requestAnimationFrame(loop); }
    function setScreen(id) {
      screen = id; $("one").hidden = !id; $("wallbox").hidden = !!id;
      if (id) { $("scr").value = id; $("onelab").textContent = id + " at true size, 1920 x 1080"; one.style.width = fit ? "100%" : "1920px"; one.style.height = fit ? "auto" : "1080px"; $("fit").textContent = fit ? "True size" : "Fit to window"; }
    }
    function toggle(idn, get, set) { $(idn).addEventListener("click", function () { set(!get()); $(idn).setAttribute("aria-pressed", String(get())); }); }
    $("play").addEventListener("click", function () {
      if (paused) { offset = pausedAt - (wallSec() % CYCLE); paused = false; $("play").textContent = "Pause"; }
      else { pausedAt = cycleT(); paused = true; $("play").textContent = "Play"; }
    });
    $("scrub").addEventListener("pointerdown", function () { dragging = true; });
    window.addEventListener("pointerup", function () { dragging = false; });
    $("scrub").addEventListener("input", function () { jump(+$("scrub").value); });
    $("bezel").addEventListener("input", function () { B = +$("bezel").value; $("bval").textContent = B + " px"; sizeWall(); });
    toggle("stale", function () { return stale; }, function (v) { stale = v; if (v) { nodata = false; $("nodata").setAttribute("aria-pressed", "false"); } });
    toggle("nodata", function () { return nodata; }, function (v) { nodata = v; if (v) { stale = false; $("stale").setAttribute("aria-pressed", "false"); } });
    toggle("long", function () { return longNames; }, function (v) { longNames = v; });
    Array.prototype.forEach.call(document.querySelectorAll(".jump"), function (b) { b.addEventListener("click", function () { jump(+b.getAttribute("data-t")); }); });
    $("open").addEventListener("click", function () { setScreen($("scr").value); });
    $("back").addEventListener("click", function () { setScreen(null); });
    $("fit").addEventListener("click", function () { fit = !fit; setScreen(screen); });
    cv.addEventListener("click", function (ev) {
      var r = cv.getBoundingClientRect(), cs = L.canvasSize(B);
      var id = L.screenAt((ev.clientX - r.left) / r.width * cs.w, (ev.clientY - r.top) / r.height * cs.h, B); if (id) setScreen(id);
    });
    window.addEventListener("resize", sizeWall);
    sizeWall(); setScreen(screen); if (paused) $("play").textContent = "Play";
    window.__story = { stats: stats, perf: perf, cycle: CYCLE, logo: function () { return LOGO.state; }, stories: STORIES.map(function (s, i) { return { id: s.id, label: s.label, dept: s.dept, start: startOf(i), dur: s.dur, peek: s.peek }; }),
      refresh: function () { REFRESH.t = clock.now() / 1000; }, state: function () { return { B: B, stale: stale, nodata: nodata, longNames: longNames, screen: screen, paused: paused, t: cycleT(), fit: fit, label: lastLabel }; } };
    if (q.has("bench")) return setTimeout(function () { bench(renderOne); }, 300);
    if (q.has("scan")) return setTimeout(scan, 300);
    requestAnimationFrame(loop);
  }

  function scan() {
    var q = new URLSearchParams(location.search), b = +(q.get("b") || 0), st = q.get("state") || "live", step = +(q.get("step") || 1);
    var c = document.createElement("canvas"), cs0 = L.canvasSize(40); c.width = 700; c.height = Math.round(700 * cs0.h / cs0.w);
    var g = c.getContext("2d"), CYC = cycleLen(), res = { frames: 0, b: b, state: st };
    stats.drawn = new Set();
    for (var t = 0; t < CYC; t += step) {
      var cs = L.canvasSize(b), s = c.width / cs.w; g.setTransform(s, 0, 0, s, 0, 0);
      try { drawScene(g, t, { B: b, stale: st === "stale", nodata: st === "nodata", longNames: st === "long", T: t }); } catch (ex) { res.exceptions = (res.exceptions || 0) + 1; res.exceptionAt = res.exceptionAt || (t + ": " + ex.message); } res.frames++;
    }
    res.dupKeys = stats.dupKeys; res.dupWhere = stats.dupWhere; res.keyed = stats.keyed;
    res.texts = stats.texts; res.unsafe = stats.unsafe; res.unsafeWhere = stats.unsafeWhere; res.nudged = stats.nudged; res.minPx = stats.minPx;
    res.distinctStrings = Array.from(stats.drawn);
    var pre = document.getElementById("bench"); pre.hidden = false; pre.textContent = JSON.stringify(res); document.title = "scan-done";
  }
  function bench(renderOne) {
    var out = { cycle: cycleLen(), logo: LOGO.state };
    try { var gl = document.createElement("canvas").getContext("webgl"), ext = gl && gl.getExtension("WEBGL_debug_renderer_info"); out.renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "hidden"; } catch (e) { out.renderer = "unknown"; }
    function sync(g) { try { g.getImageData(0, 0, 1, 1); } catch (e) { out.syncNote = "canvas holds a file image; GPU sync skipped"; } }
    function time(label, mk, n) {
      var c = mk(), g = c.getContext("2d"), ts = [];
      c.__draw(g, 1); c.__draw(g, 2); sync(g);
      var all0 = performance.now();
      for (var i = 0; i < n; i++) { var t = (i + 0.5) * cycleLen() / n, t0 = performance.now(); c.__draw(g, t); ts.push(performance.now() - t0); }
      sync(g);
      var total = performance.now() - all0; ts.sort(function (a, b) { return a - b; });
      out[label] = { frames: n, msPerFrameWithGpu: +(total / n).toFixed(1), scriptMedian: +ts[Math.floor(n / 2)].toFixed(1), scriptP95: +ts[Math.floor(n * 0.95)].toFixed(1), scriptMax: +ts[n - 1].toFixed(1) };
    }
    var cs = L.canvasSize(0);
    time("fullWallTrueSize_13440x3240", function () { var c = document.createElement("canvas"); c.width = cs.w; c.height = cs.h; c.__draw = function (g, t) { g.setTransform(1, 0, 0, 1, 0, 0); drawScene(g, t, { B: 0, T: t }); }; return c; }, 96);
    ["R1C1", "R2C4", "R2C5", "R3C6"].forEach(function (id) { time("oneScreen" + id + "_1920x1080", function () { var c = document.createElement("canvas"); c.width = SW; c.height = SH; c.__draw = function (g, t) { renderOne(g, id, t, 0, { B: 0, T: t }); }; return c; }, 96); });
    time("preview_1800wide", function () { var c = document.createElement("canvas"); c.width = 1800; c.height = Math.round(1800 * cs.h / cs.w); c.__draw = function (g, t) { var s = 1800 / cs.w; g.setTransform(s, 0, 0, s, 0, 0); drawScene(g, t, { B: 0, T: t }); }; return c; }, 96);
    out.minTextPx = stats.minPx; out.unsafe = stats.unsafe;
    var pre = document.getElementById("bench"); pre.hidden = false; pre.textContent = JSON.stringify(out); document.title = "bench-done";
  }

  window.Story5d = {
    drawScene: drawScene, cycleLen: cycleLen, loadMarks: loadMarks, MARKS: MARKS, REFRESH: REFRESH,
    reset: function () { STORIES.length = 0; Object.keys(HOME).forEach(function (k) { delete HOME[k]; }); anchorCache = {}; },
    run: run, refresh: function () { REFRESH.t = C.T; }, add: function (s) { STORIES.push(s); }, cfg: CFG, HOME: HOME, drawMark: drawMark, kpiState: kpiState, setOutline: function (o) { OUTLINE = o || []; },
    C: C, COL: COL, LIGHT: LIGHT, NAME: NAME, AMBER: AMBER, INK: INK, INK2: INK2, BRAND: BRAND, NODATA_TXT: NODATA_TXT,
    clamp: clamp, ease: ease, easeOut: easeOut, lerp: lerp, hexA: hexA, mix: mix, seeded: seeded, glow: glow, dot: dot, comet: comet, T: T, wrap: wrap, rrect: rrect, setFont: setFont, glass: glass,
    win: win, at: at, screenOf: screenOf, stageRect: stageRect, coreAt: coreAt, countUp: countUp,
    countryView: countryView, mixView: mixView, view: view, P: P, drawOutline: drawOutline, outlineAnchors: outlineAnchors,
    arcPts: arcPts, polyline: polyline, along: along, placeLabels: placeLabels, SW: SW, SH: SH, SAFE: SAFE, stats: stats
  };
})();
