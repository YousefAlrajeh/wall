// wall-feed - hands a screen the latest checked figures snapshot. Nothing else, never a token.
// Request: POST JSON {s: screen id, k: screen key, d: device secret, have?: version, h?: health}
// Both the unchanged screen key (D-212) and the screen's own device secret must match.
import { checkScreen } from "../_shared/device.mjs";
import { screenView, findSecretLike } from "../_shared/snapshot.mjs";
import { json, preflight, readJson, originAllowed } from "../_shared/http.mjs";

const STATES = new Set(["showing", "loading", "waiting", "error", "clear", "stale", "nodata"]);
const CODE_RE = /^[A-Z_]{1,32}$/;
const SHOWING_RE = /^[A-Za-z0-9_:.-]{1,64}$/;

function intIn(v, lo, hi) { return Number.isInteger(v) && v >= lo && v <= hi ? v : null; }

// Health rows carry fixed codes and numbers only, never free text.
export function cleanHealth(screen, h, nowIso) {
  if (!h || typeof h !== "object") return null;
  return {
    screen,
    last_seen: nowIso,
    state: STATES.has(h.state) ? h.state : null,
    error_code: typeof h.err === "string" && CODE_RE.test(h.err) ? h.err : null,
    showing: typeof h.showing === "string" && SHOWING_RE.test(h.showing) ? h.showing : null,
    clock_offset_ms: intIn(h.off, -86400000, 86400000),
    clock_rtt_ms: intIn(h.rtt, 0, 60000),
    feed_version: intIn(h.ver, 0, 2147483647),
    updated_at: nowIso,
  };
}

export async function handle(req, { env, db, now }) {
  if (req.method === "OPTIONS") return preflight(req, env);
  if (!originAllowed(req, env)) return json(req, env, 403, { error: "denied" });
  if (req.method !== "POST") return json(req, env, 405, { error: "method" });
  const b = await readJson(req, 4096);
  if (!b) return json(req, env, 400, { error: "bad_request" });
  let chk;
  try { chk = await checkScreen(db, b.s, b.k, b.d); } catch (_) { return json(req, env, 503, { error: "retry_later" }); }
  if (!chk.ok) return json(req, env, 401, { error: "denied" });
  const nowIso = new Date(now()).toISOString();
  try {
    const hr = cleanHealth(b.s, b.h, nowIso);
    if (hr) await db.upsertHealth(hr);
  } catch (_) { /* health is best effort */ }
  let snap;
  try { snap = await db.getSnapshot(); } catch (_) { return json(req, env, 503, { error: "retry_later" }); }
  const view = screenView(snap);
  if (Number.isInteger(b.have) && b.have === view.version && view.version > 0) {
    return json(req, env, 200, { version: view.version, unchanged: true });
  }
  if (findSecretLike(view)) return json(req, env, 500, { error: "refused" }); // last line of defence
  return json(req, env, 200, view);
}
