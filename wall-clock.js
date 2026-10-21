/* wall-clock.js - one shared clock for all 21 screens (used only when settings.data.canvasPages is on).
   Start: 8 samples of the `clock` function; offset = server time - midpoint of send and receive.
   Every 60 s: 3 more samples. Samples are kept for 30 minutes; only those whose round trip is close to
   the smallest seen are trusted (a slow leg makes the midpoint wrong). A straight line through the
   trusted samples gives the offset and this PC's clock drift.
   The shown offset is slewed (moved at most 5 ms per second plus the drift), never jumped, so motion
   does not stutter. Only a confirmed big change (over 1 s, two trusted samples in a row) is stepped.
   Wall time = (this PC's time at start + performance.now()) + offset, so later changes to the PC clock
   have no effect. Classic script: window.WallClock in a browser, module.exports in Node. */
(function (root) {
  "use strict";
  function create(opt) {
    opt = opt || {};
    var doFetch = opt.fetch || function (u, o) { return root.fetch(u, o); };
    var perfNow = opt.perfNow || function () { return root.performance.now(); };
    var dateNow = opt.dateNow || function () { return Date.now(); };
    var setIv = opt.setInterval || function (f, ms) { return root.setInterval(f, ms); };
    var N_START = opt.samples || 8, N_RESYNC = opt.resyncSamples || 3;
    var RESYNC_MS = opt.resyncMs || 60000;
    var SLEW = opt.slewMsPerSec || 5;            /* at most 5 ms of correction per second */
    var STEP_MS = opt.stepThresholdMs || 1000;   /* confirmed errors bigger than this are stepped */
    var WINDOW_MS = opt.windowMs || 1800000;     /* samples kept for 30 minutes */
    var W_POW = opt.weightPow || 2, W_ADD = opt.weightAdd || 20; /* how strongly a low round trip counts */
    var MAX_DRIFT = 500e-6;                      /* a PC clock is never trusted to be off by more than 500 ppm */
    var base = dateNow() - perfNow();
    var hist = [], pend = [], model = null, disp = 0, lastP = 0, synced = false;
    var last = { rtt: null, samples: 0, failures: 0, trusted: 0 };
    var timer = null;

    function predict(p) { return model ? model.a + model.b * (p - model.pm) : 0; }
    function fit() {
      var p = perfNow(), w = [], i;
      for (i = 0; i < hist.length; i++) if (p - hist[i].p <= WINDOW_MS) w.push(hist[i]);
      hist = w;
      if (!w.length) return;
      /* weighted straight line: a sample counts less the further its round trip is above the smallest;
         spikes (over 250 ms above the smallest) do not count at all */
      var minR = Infinity;
      for (i = 0; i < w.length; i++) if (w[i].rtt < minR) minR = w[i].rtt;
      var sw = 0, pm = 0, om = 0, lo = Infinity, hi = -Infinity, n = 0, g = [];
      for (i = 0; i < w.length; i++) {
        if (w[i].rtt > minR + 250) continue;
        var wt = 1 / Math.pow(w[i].rtt - minR + W_ADD, W_POW);
        g.push({ p: w[i].p, off: w[i].off, wt: wt }); sw += wt; pm += wt * w[i].p; om += wt * w[i].off;
        lo = Math.min(lo, w[i].p); hi = Math.max(hi, w[i].p); n++;
      }
      last.trusted = n;
      pm /= sw; om /= sw;
      var b = model ? model.b : 0;
      if (n >= 4 && hi - lo >= 180000) {
        var sxy = 0, sxx = 0;
        for (i = 0; i < g.length; i++) { sxy += g[i].wt * (g[i].p - pm) * (g[i].off - om); sxx += g[i].wt * (g[i].p - pm) * (g[i].p - pm); }
        if (sxx > 0) b = sxy / sxx;
        if (b > MAX_DRIFT) b = MAX_DRIFT; if (b < -MAX_DRIFT) b = -MAX_DRIFT;
      }
      model = { a: om, b: b, pm: pm };
    }
    function currentOffset() {
      var p = perfNow();
      if (!model) return disp;
      var target = predict(p), dt = Math.max(0, p - lastP);
      var room = dt / 1000 * SLEW + Math.abs(model.b) * dt, d = target - disp;
      disp += d > room ? room : (d < -room ? -room : d);
      lastP = p;
      return disp;
    }
    function now() { return base + perfNow() + currentOffset(); }

    function one() {
      var t0 = perfNow();
      return Promise.resolve(doFetch(opt.url, { method: "GET", headers: opt.headers || {}, cache: "no-store" }))
        .then(function (r) { if (!r || !r.ok) throw new Error("clock http"); return r.json(); })
        .then(function (j) {
          var t1 = perfNow();
          if (!j || typeof j.t !== "number" || !isFinite(j.t)) throw new Error("clock body");
          return { p: (t0 + t1) / 2, rtt: t1 - t0, off: j.t - (base + (t0 + t1) / 2) };
        });
    }
    function sample(n) {
      var i = 0, got = [];
      function next() {
        if (i++ >= n) return Promise.resolve(got);
        return one().then(function (s) { got.push(s); }, function () { last.failures++; }).then(next);
      }
      return next().then(function (g) { last.samples = g.length; return g; });
    }
    function apply(got) {
      if (!got.length) return false;
      var best = got[0], i;
      for (i = 1; i < got.length; i++) if (got[i].rtt < best.rtt) best = got[i];
      last.rtt = Math.round(best.rtt);
      currentOffset();
      var keep = got;
      if (synced && model) {
        /* A sample can be wrong by at most half its round trip. One that is off by more than 1 s beyond
           that is a real jump of the server's time: held back until a second one confirms it, then stepped. */
        var jump = [], calm = [];
        for (i = 0; i < got.length; i++) {
          var dev = Math.abs(got[i].off - predict(got[i].p));
          (dev > STEP_MS && dev - got[i].rtt / 2 > STEP_MS / 2 ? jump : calm).push(got[i]);
        }
        if (jump.length) {
          pend = pend.concat(jump);
          if (pend.length >= 2) {
            hist = pend; pend = [];
            fit(); lastP = perfNow(); disp = predict(lastP);
            return true;
          }
        } else if (calm.length) pend = [];
        keep = calm;
      }
      for (i = 0; i < keep.length; i++) hist.push(keep[i]);
      fit();
      if (!synced) { lastP = perfNow(); disp = predict(lastP); synced = true; }
      return true;
    }
    function start() {
      return sample(N_START).then(function (g) {
        apply(g);
        if (!timer) timer = setIv(function () { sample(N_RESYNC).then(apply); }, RESYNC_MS);
        return synced;
      });
    }
    function stats() {
      return { synced: synced, offsetMs: Math.round(currentOffset()), rttMs: last.rtt, samples: last.samples,
        failures: last.failures, trusted: last.trusted, driftPpm: model ? Math.round(model.b * 1e6) : 0 };
    }
    return { start: start, now: now, stats: stats, isSynced: function () { return synced; },
      resync: function () { return sample(N_RESYNC).then(apply); } };
  }
  var W = { create: create };
  if (typeof module !== "undefined" && module.exports) module.exports = W; else root.WallClock = W;
})(this);
