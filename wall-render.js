/* wall-render.js - draws one wall page (content kind "wallpage:<id>") for one screen.
   A page is a JSON description (wallpages/<id>.json):
     background + layers  : drawn on one shared canvas that may cross bezels; each screen shows only
                            its own 1920x1080 window of it (WallLayout.windowFor), so lines continue straight.
                            Positions are fractions of the canvas (fx, fy), sizes are px.
     tiles                : figures and labels, each pinned inside ONE screen's safe area; a tile that is
                            not fully inside the safe area is not drawn (counted as skipped).
   Motion is computed from the shared wall time, never from frame counts.
   Text is set with textContent only. Classic script: window.WallRender / module.exports. */
(function (root) {
  "use strict";
  var FONT = "'Segoe UI', sans-serif";
  var COL = { ink: "#F6DDFF", dim: "#C98BEB", accent: "#E59BFF", amber: "#F0A04A", tileBg: "rgba(124,74,166,0.28)", tileLine: "rgba(229,155,255,0.35)" };
  var NO_DATA = "No data for these dates";

  function fmtValue(v, tile) {
    if (v === null || v === undefined || v === "") return null;
    if (typeof v === "number") {
      var s = (tile.decimals > 0) ? v.toFixed(Math.min(tile.decimals, 3)) : String(Math.round(v));
      var parts = s.split("."); parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      return parts.join(".") + (tile.unit ? " " + tile.unit : "");
    }
    return String(v);
  }
  function el(doc, tag, css, text) {
    var e = doc.createElement(tag);
    if (css) for (var k in css) e.style[k] = css[k];
    if (text !== undefined) e.textContent = text;
    return e;
  }

  /* checks a page description; returns a list of problem codes (empty = fine) */
  function checkPage(page, L) {
    var p = [];
    if (!page || typeof page !== "object") return ["PAGE_NOT_OBJECT"];
    if (!/^[a-z0-9-]{1,32}$/.test(page.id || "")) p.push("PAGE_ID");
    (page.tiles || []).forEach(function (t, i) {
      if (!L.parse(t.screen)) p.push("TILE_SCREEN_" + i);
      else if (!L.tileInSafeArea(t)) p.push("TILE_OUTSIDE_SAFE_" + i);
      if (t.kind !== "text" && !/^[a-zA-Z][a-zA-Z0-9]{0,31}$/.test(t.figure || "")) p.push("TILE_FIGURE_" + i);
      if ((t.labelPx || 28) < 14 || (t.valuePx || 96) < 14) p.push("TILE_FONT_" + i);
    });
    return p;
  }

  function mount(container, page, ctx) {
    var L = ctx.layout, doc = ctx.doc || root.document, screen = ctx.screen;
    var B = L.bezelPx, win = L.windowFor(screen, B), cs = L.canvasSize(B);
    var raf = ctx.raf || function (f) { return root.requestAnimationFrame(f); };
    var caf = ctx.caf || function (h) { return root.cancelAnimationFrame(h); };
    var setIv = ctx.setInterval || function (f, ms) { return root.setInterval(f, ms); };
    var clrIv = ctx.clearInterval || function (h) { return root.clearInterval(h); };
    var alive = true, rafH = null, ivH = null, info = { tilesShown: 0, tilesSkipped: 0, layers: 0, frames: 0 };

    var cw = container.clientWidth || L.SCREEN_W, ch = container.clientHeight || L.SCREEN_H;
    var rootEl = el(doc, "div", { position: "absolute", left: "0", top: "0", width: L.SCREEN_W + "px", height: L.SCREEN_H + "px",
      overflow: "hidden", transformOrigin: "0 0", transform: "scale(" + (cw / L.SCREEN_W) + "," + (ch / L.SCREEN_H) + ")",
      fontFamily: FONT, color: COL.ink, background: "#0d0614" });
    rootEl.className = "wp-root";

    /* background: one gradient across the whole canvas, shifted to this screen's window */
    var bg = page.background || {};
    var stops = (bg.stops && bg.stops.length) ? bg.stops : ["#0d0614", "#2a1240", "#0d0614"];
    rootEl.appendChild(el(doc, "div", { position: "absolute", left: (-win.x) + "px", top: (-win.y) + "px",
      width: cs.w + "px", height: cs.h + "px", background: "linear-gradient(" + (+bg.angle || 100) + "deg," + stops.join(",") + ")" }));

    /* animated layers on a 1920x1080 canvas, drawn in canvas coordinates with the window offset */
    var layers = (page.layers || []).filter(function (l) { return l && (l.type === "rings" || l.type === "line"); });
    info.layers = layers.length;
    var cv = el(doc, "canvas", { position: "absolute", left: "0", top: "0", width: L.SCREEN_W + "px", height: L.SCREEN_H + "px" });
    cv.width = L.SCREEN_W; cv.height = L.SCREEN_H;
    rootEl.appendChild(cv);
    var g = cv.getContext ? cv.getContext("2d") : null;
    function draw() {
      if (!alive || !g) return;
      var t = ctx.now() / 1000;
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, L.SCREEN_W, L.SCREEN_H);
      g.setTransform(1, 0, 0, 1, -win.x, -win.y);
      for (var i = 0; i < layers.length; i++) {
        var l = layers[i];
        g.strokeStyle = l.color || COL.accent; g.globalAlpha = l.alpha == null ? 0.8 : +l.alpha;
        if (l.type === "line") {
          g.lineWidth = l.width || 4; g.beginPath();
          g.moveTo(l.fx1 * cs.w, l.fy1 * cs.h); g.lineTo(l.fx2 * cs.w, l.fy2 * cs.h); g.stroke();
        } else {
          var cx = l.fx * cs.w, cy = l.fy * cs.h, rs = l.r || [400];
          /* reduce to one turn in full precision first: the canvas loses precision on huge angles */
          var turn = (((t % 86400) * (l.degPerSec || 6)) % 360) * Math.PI / 180;
          for (var k = 0; k < rs.length; k++) {
            var a0 = turn * (k % 2 ? -1 : 1) + k * 1.3;
            g.lineWidth = l.width || 6;
            for (var s = 0; s < 3; s++) { g.beginPath(); g.arc(cx, cy, rs[k], a0 + s * 2.094, a0 + s * 2.094 + 1.3); g.stroke(); }
          }
        }
      }
      g.globalAlpha = 1; info.frames++;
      rafH = raf(draw);
    }

    /* tiles for this screen only */
    var tileEls = [];
    (page.tiles || []).forEach(function (t) {
      if (t.screen !== screen) return;
      if (!L.tileInSafeArea(t)) { info.tilesSkipped++; return; }
      var box = el(doc, "div", { position: "absolute", left: t.x + "px", top: t.y + "px", width: t.w + "px", height: t.h + "px",
        boxSizing: "border-box", padding: "24px 28px", background: COL.tileBg, border: "1px solid " + COL.tileLine, borderRadius: "18px",
        display: "flex", flexDirection: "column", justifyContent: "center", gap: "8px" });
      box.className = "wp-tile";
      var lab = el(doc, "div", { fontSize: Math.max(14, t.labelPx || 28) + "px", color: COL.dim }, t.label || "");
      var val = el(doc, "div", { fontSize: Math.max(14, t.valuePx || 96) + "px", fontWeight: "600", lineHeight: "1.1" }, "");
      val.className = "wp-value";
      box.appendChild(lab); if (t.kind !== "text") box.appendChild(val);
      rootEl.appendChild(box); tileEls.push({ t: t, val: val }); info.tilesShown++;
    });

    /* "Data as of" line, on every screen of the page that shows figures (or the ones the page names) */
    var asOfScreens = (page.asOf && page.asOf.screens) || (page.tiles || []).filter(function (t) { return t.kind !== "text"; }).map(function (t) { return t.screen; });
    var asOfEl = null;
    if (asOfScreens.indexOf(screen) >= 0) {
      var sr = L.safeRect();
      asOfEl = el(doc, "div", { position: "absolute", left: sr.x + "px", top: (sr.y + sr.h - 34) + "px", fontSize: "22px", color: COL.dim }, "");
      asOfEl.className = "wp-asof";
      rootEl.appendChild(asOfEl);
    }

    function figuresOf() {
      var s = ctx.feed && ctx.feed.snapshot();
      return (s && s.pages && s.pages[page.figuresPage || page.id]) || null;
    }
    function refreshText() {
      if (!alive) return;
      var figs = figuresOf();
      for (var i = 0; i < tileEls.length; i++) {
        var te = tileEls[i], t = te.t;
        if (t.kind === "text") continue;
        var v = figs ? figs[t.figure] : undefined, txt = null;
        if (t.kind === "list" && Array.isArray(v) && v.length) {
          txt = v.slice(0, t.maxRows || 6).map(function (r) { return String(r[t.labelKey || "label"]) + "  " + (fmtValue(r[t.valueKey || "value"], t) || "-"); }).join("\n");
          te.val.style.whiteSpace = "pre"; te.val.style.fontSize = Math.max(14, t.listPx || 30) + "px";
        } else if (t.kind !== "list") txt = fmtValue(v, t);
        if (txt === null) { te.val.textContent = NO_DATA; te.val.style.fontSize = "32px"; te.val.style.color = COL.dim; }
        else { te.val.textContent = txt; te.val.style.color = COL.ink; if (t.kind !== "list") te.val.style.fontSize = Math.max(14, t.valuePx || 96) + "px"; }
      }
      if (asOfEl) {
        var st = ctx.feed ? ctx.feed.status() : { hasData: false };
        if (st.denied) { asOfEl.textContent = "This screen is not set up for figures yet"; asOfEl.style.color = COL.amber; }
        else if (!st.hasData) { asOfEl.textContent = "No figures received yet"; asOfEl.style.color = COL.amber; }
        else if (st.stale) { asOfEl.textContent = "No new data since " + st.label; asOfEl.style.color = COL.amber; }
        else { asOfEl.textContent = "Data as of " + st.label; asOfEl.style.color = COL.dim; }
      }
    }

    container.appendChild(rootEl);
    refreshText();
    var offFeed = (ctx.feed && ctx.feed.onChange) ? ctx.feed.onChange(refreshText) : null;
    ivH = setIv(refreshText, 1000);
    if (layers.length) rafH = raf(draw);

    return {
      info: function () { return info; },
      refresh: refreshText,
      destroy: function () {
        alive = false;
        try { if (rafH !== null) caf(rafH); } catch (e) { }
        try { if (ivH !== null) clrIv(ivH); } catch (e) { }
        try { if (typeof offFeed === "function") offFeed(); } catch (e) { }
        try { container.removeChild(rootEl); } catch (e) { }
      }
    };
  }
  var R = { mount: mount, checkPage: checkPage, fmtValue: fmtValue, NO_DATA: NO_DATA, COLORS: COL };
  if (typeof module !== "undefined" && module.exports) module.exports = R; else root.WallRender = R;
})(this);
