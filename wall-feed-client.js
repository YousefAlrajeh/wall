/* wall-feed-client.js - fetches the checked figures snapshot for this screen (canvasPages on only).
   Once at start (and so at every page load or reload), then every 5 minutes (Supabase Free plan function quota,
   builder_figs_free.md): POST {s,k,d,have,h} to the wall-feed function. Keeps the last good snapshot
   (memory + this PC's browser storage), so an outage shows the last figures, not blanks.
   Also holds the "Data as of" / "No new data since" rule.
   Classic script: window.WallFeed in a browser, module.exports in Node. */
(function (root) {
  "use strict";
  var REFRESH_HOURS = [7, 9, 11, 13, 15, 17, 19, 23]; /* model refreshes, Riyadh time */
  var TZ_MIN = 180;                                    /* Riyadh is UTC+3 all year */
  var FEED_POLL_MS = 300000;                           /* one feed call every 5 minutes (was 60 s) */
  var GRACE_MIN = 60 + FEED_POLL_MS / 60000;           /* 60 min refresh + figures job allowance, plus one poll interval,
                                                          so the 5-minute polling alone can never make a screen stale */
  var MAX_BYTES = 65536;
  var SECRET_KEY_RE = /token|secret|password|authori[sz]ation|bearer|refresh|verifier|device_?code|api_?key|apikey|cookie|session/i;

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function hhmm(ms) { var d = new Date(ms + TZ_MIN * 60000); return pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes()); }
  function sameRiyadhDay(a, b) { return Math.floor((a + TZ_MIN * 60000) / 86400000) === Math.floor((b + TZ_MIN * 60000) / 86400000); }
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  /* "14:05" in Riyadh time; "23:04 on 20 Oct" when it is not today in Riyadh */
  function fmtAsOf(ms, nowMs) {
    var d = new Date(ms + TZ_MIN * 60000), n = new Date(nowMs + TZ_MIN * 60000);
    var hm = pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes());
    var same = d.getUTCFullYear() === n.getUTCFullYear() && d.getUTCMonth() === n.getUTCMonth() && d.getUTCDate() === n.getUTCDate();
    return same ? hm : hm + " on " + d.getUTCDate() + " " + MONTHS[d.getUTCMonth()];
  }
  /* first scheduled refresh strictly after the data's time */
  function nextRefreshAfter(asOfMs) {
    var L = asOfMs + TZ_MIN * 60000, day = Math.floor(L / 86400000) * 86400000;
    for (var dd = 0; dd < 3; dd++) for (var i = 0; i < REFRESH_HOURS.length; i++) {
      var s = day + dd * 86400000 + REFRESH_HOURS[i] * 3600000;
      if (s > L) return s - TZ_MIN * 60000;
    }
    return asOfMs + 86400000;
  }
  function isStale(asOfMs, nowMs, graceMin) {
    if (!isFinite(asOfMs)) return false;
    return nowMs > nextRefreshAfter(asOfMs) + (graceMin == null ? GRACE_MIN : graceMin) * 60000;
  }
  function hasSecretLike(o) {
    if (!o || typeof o !== "object") return false;
    for (var k in o) { if (!Object.prototype.hasOwnProperty.call(o, k)) continue;
      if (SECRET_KEY_RE.test(k)) return true; if (hasSecretLike(o[k])) return true; }
    return false;
  }
  /* light shape check on the screen side; the server has already done the strict one */
  function acceptable(j, text) {
    return !!j && typeof j === "object" && Number.isInteger(j.version) && j.version >= 0 &&
      (j.data_as_of === null || typeof j.data_as_of === "string") &&
      j.pages && typeof j.pages === "object" && !Array.isArray(j.pages) &&
      text.length <= MAX_BYTES && !hasSecretLike(j);
  }

  function create(o) {
    var doFetch = o.fetch || function (u, x) { return root.fetch(u, x); };
    var now = o.now || function () { return Date.now(); };
    var store = o.storage || null, SKEY = "wallFeed.v1." + o.screen;
    var setIv = o.setInterval || function (f, ms) { return root.setInterval(f, ms); };
    var snap = null, denied = false, lastOkAt = null, lastErr = null, listeners = [], timer = null;
    try { var s0 = store && store.getItem(SKEY); if (s0) { var j0 = JSON.parse(s0); if (acceptable(j0, s0)) snap = j0; } } catch (e) { }

    function emit() { for (var i = 0; i < listeners.length; i++) { try { listeners[i](); } catch (e) { } } }
    function poll() {
      var body = { s: o.screen, k: o.key, d: o.device || "", have: snap ? snap.version : 0, h: o.health ? o.health() : null };
      var hdr = { "Content-Type": "application/json" };
      if (o.anonKey) { hdr.apikey = o.anonKey; hdr.Authorization = "Bearer " + o.anonKey; }
      return Promise.resolve(doFetch(o.url, { method: "POST", headers: hdr, body: JSON.stringify(body), cache: "no-store" }))
        .then(function (r) {
          if (r.status === 401) { denied = true; lastErr = "DENIED"; emit(); return; }
          if (!r.ok) { lastErr = "HTTP_" + r.status; return; }
          return r.text().then(function (t) {
            var j = JSON.parse(t);
            denied = false; lastOkAt = now();
            if (j && j.unchanged === true && snap && j.version === snap.version) { lastErr = null; return; }
            if (!acceptable(j, t)) { lastErr = "REJECTED"; return; }
            lastErr = null; snap = j;
            try { store && store.setItem(SKEY, t); } catch (e) { }
            emit();
          });
        })
        .catch(function () { lastErr = "UNREACHABLE"; });
    }
    function start() { if (!timer) timer = setIv(poll, o.intervalMs || FEED_POLL_MS); return poll(); }
    function status() {
      var asOf = snap && snap.data_as_of ? Date.parse(snap.data_as_of) : NaN, t = now();
      return { version: snap ? snap.version : 0, hasData: isFinite(asOf), dataAsOfMs: asOf, sameDay: isFinite(asOf) && sameRiyadhDay(asOf, t),
        time: isFinite(asOf) ? hhmm(asOf) : null,
        stale: isStale(asOf, t), denied: denied, lastOkAt: lastOkAt, lastErr: lastErr,
        label: isFinite(asOf) ? fmtAsOf(asOf, t) : null };
    }
    return { start: start, poll: poll, snapshot: function () { return snap; }, status: status,
      onChange: function (f) { listeners.push(f); return function () { var i = listeners.indexOf(f); if (i >= 0) listeners.splice(i, 1); }; } };
  }
  var F = { create: create, isStale: isStale, nextRefreshAfter: nextRefreshAfter, fmtAsOf: fmtAsOf,
    REFRESH_HOURS: REFRESH_HOURS, TZ_MIN: TZ_MIN, GRACE_MIN: GRACE_MIN, FEED_POLL_MS: FEED_POLL_MS };
  if (typeof module !== "undefined" && module.exports) module.exports = F; else root.WallFeed = F;
})(this);
