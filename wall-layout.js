/* wall-layout.js - the single source for the wall's shape.
   Rows, columns, screen size, bezel and safe margin live here and nowhere else.
   Used by player.html, console.html, wall.html, wall-render.js and the local harness.
   Classic script: sets window.WallLayout in a browser, module.exports in Node. */
(function (root) {
  "use strict";
  var ROWS = 3, COLS = 7;          /* 21 screens, R1C1..R3C7 */
  var SCREEN_W = 1920, SCREEN_H = 1080;
  var DEFAULT_BEZEL_PX = 0;        /* combined bezel between two neighbours, in px; unknown until the user gives mm */
  var DEFAULT_SAFE_PX = 48;        /* nothing important closer than this to a screen edge */

  var state = { bezelPx: DEFAULT_BEZEL_PX, safePx: DEFAULT_SAFE_PX };

  function int0(v, dflt) { var n = Math.round(+v); return (isFinite(n) && n >= 0 && n <= 400) ? n : dflt; }

  /* settings.data.wallLayout = {bezelPx, safePx}; anything missing or odd keeps the default */
  function configure(o) {
    o = o || {};
    state.bezelPx = int0(o.bezelPx, DEFAULT_BEZEL_PX);
    state.safePx = int0(o.safePx, DEFAULT_SAFE_PX);
    return { bezelPx: state.bezelPx, safePx: state.safePx };
  }
  function bezel(b) { return b === undefined ? state.bezelPx : int0(b, DEFAULT_BEZEL_PX); }

  var ID_RE = new RegExp("^R([1-" + ROWS + "])C([1-" + COLS + "])$");
  var NAME_RE = new RegExp("r([1-" + ROWS + "])c([1-" + COLS + "])", "i");

  function screens() {
    var out = [];
    for (var r = 1; r <= ROWS; r++) for (var c = 1; c <= COLS; c++) out.push("R" + r + "C" + c);
    return out;
  }
  /* "R2C4" -> {row:2,col:4}; anything else -> null (same match as the old hard-coded regex) */
  function parse(id) {
    var m = String(id == null ? "" : id).match(ID_RE);
    return m ? { row: +m[1], col: +m[2] } : null;
  }
  /* console slice matcher: "r2c4" anywhere, else the first 1-2 digit number 1..21 */
  function screenFromName(fn) {
    var m = fn.match(NAME_RE); if (m) return "R" + m[1] + "C" + m[2];
    m = fn.match(/(\d{1,2})/);
    if (m) { var n = +m[1]; if (n >= 1 && n <= ROWS * COLS) { return "R" + Math.ceil(n / COLS) + "C" + (((n - 1) % COLS) + 1); } }
    return null;
  }

  /* Wall Sequencer wave delay in ms for one screen.
     variant "player" keeps the player's (+x||400) arithmetic, "console" keeps the console's (x??400);
     both are kept exactly as they were (the 0 ms step mismatch is a known open item, not changed here). */
  function waveDelay(screen, ws, variant) {
    var p = parse(screen); if (!p) return 0;
    var row = p.row, col = p.col;
    var groupIdx = 0, pos = 0, count = COLS;
    if (ws.mode === "rows") { count = ROWS; groupIdx = row - 1; pos = col - 1; }
    else if (ws.mode === "all") { count = 1; groupIdx = 0; pos = (row - 1) * COLS + (col - 1); }
    else { count = COLS; groupIdx = col - 1; pos = row - 1; }
    var order;
    if (Array.isArray(ws.order) && ws.order.length) order = ws.order.map(function (n) { return +n - 1; });
    else { order = []; for (var i = 0; i < count; i++) order.push(i); }
    if (ws.reverseOrder) order = order.slice().reverse();
    var oi = order.indexOf(groupIdx); if (oi < 0) oi = order.length;
    if (ws.reverseInGroup) pos = ((ws.mode === "rows") ? COLS : (ws.mode === "all" ? ROWS * COLS : ROWS)) - 1 - pos;
    if (variant === "console") {
      var st = (ws.stepMs !== null && ws.stepMs !== undefined) ? ws.stepMs : 400;
      var sg = (ws.staggerMs !== null && ws.staggerMs !== undefined) ? ws.staggerMs : 0;
      return oi * st + pos * sg;
    }
    return oi * (+ws.stepMs || 400) + pos * (+ws.staggerMs || 0);
  }

  /* ---------- one shared canvas with bezel compensation ---------- */
  function canvasSize(b) { b = bezel(b); return { w: COLS * SCREEN_W + (COLS - 1) * b, h: ROWS * SCREEN_H + (ROWS - 1) * b }; }
  /* the 1920x1080 window of the canvas this screen shows; the strip behind each bezel is skipped */
  function windowFor(id, b) {
    var p = parse(id); if (!p) return null; b = bezel(b);
    return { x: (p.col - 1) * (SCREEN_W + b), y: (p.row - 1) * (SCREEN_H + b), w: SCREEN_W, h: SCREEN_H };
  }
  /* the part of the window where figures and labels may sit (screen coordinates, 0..1920 / 0..1080) */
  function safeRect(s) {
    s = (s === undefined) ? state.safePx : int0(s, DEFAULT_SAFE_PX);
    return { x: s, y: s, w: SCREEN_W - 2 * s, h: SCREEN_H - 2 * s };
  }
  /* which screen shows canvas point (x,y)? null when it falls behind a bezel or off the canvas */
  function screenAt(x, y, b) {
    b = bezel(b); var cs = canvasSize(b);
    if (x < 0 || y < 0 || x >= cs.w || y >= cs.h) return null;
    var c = Math.floor(x / (SCREEN_W + b)), r = Math.floor(y / (SCREEN_H + b));
    if (x - c * (SCREEN_W + b) >= SCREEN_W) return null;
    if (y - r * (SCREEN_H + b) >= SCREEN_H) return null;
    return "R" + (r + 1) + "C" + (c + 1);
  }
  /* a tile {x,y,w,h} in screen coordinates fits inside the safe area */
  function tileInSafeArea(t, s) {
    var a = safeRect(s);
    return !!t && isFinite(t.x) && isFinite(t.y) && t.w > 0 && t.h > 0 &&
      t.x >= a.x && t.y >= a.y && t.x + t.w <= a.x + a.w && t.y + t.h <= a.y + a.h;
  }

  var L = {
    ROWS: ROWS, COLS: COLS, COUNT: ROWS * COLS, SCREEN_W: SCREEN_W, SCREEN_H: SCREEN_H,
    DEFAULT_BEZEL_PX: DEFAULT_BEZEL_PX, DEFAULT_SAFE_PX: DEFAULT_SAFE_PX,
    configure: configure, screens: screens, parse: parse, screenFromName: screenFromName,
    waveDelay: waveDelay, canvasSize: canvasSize, windowFor: windowFor, safeRect: safeRect,
    screenAt: screenAt, tileInSafeArea: tileInSafeArea,
    get bezelPx() { return state.bezelPx; }, get safePx() { return state.safePx; }
  };
  if (typeof module !== "undefined" && module.exports) module.exports = L; else root.WallLayout = L;
})(this);
