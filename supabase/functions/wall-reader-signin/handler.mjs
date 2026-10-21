// wall-reader-signin - one-time device sign-in for 'HMG Wall Reader', started from the console.
// Only a signed-in console admin (Supabase session + row in wall_admins) may call it.
// Account check: the Microsoft account that signs in must be the expected one
// (WALL_READER_TENANT_ID + WALL_READER_EXPECTED_OID); any other account is refused and its tokens dropped.
// The refresh token goes only into the Vault secret; the answer never carries a token or the device code.
// Actions (POST JSON {action}): "start" -> {userCode, verificationUri, expiresIn, interval}
//                               "poll"  -> {state: waiting|done|wrong_account|expired|declined|failed|none}
//                               "status"-> {connected, lastRun:{finished_at,result,reason}}
import { checkAdmin } from "../_shared/device.mjs";
import { json, preflight, readJson, bearer, originAllowed } from "../_shared/http.mjs";
import { readerConfigOk, guardedFetch, deviceStart, devicePoll, accountOk } from "../_shared/ms.mjs";

export async function handle(req, { env, db, fetch: rawFetch, now }) {
  if (req.method === "OPTIONS") return preflight(req, env);
  if (!originAllowed(req, env)) return json(req, env, 403, { error: "denied" });
  if (req.method !== "POST") return json(req, env, 405, { error: "method" });
  let adm;
  try { adm = await checkAdmin(db, bearer(req)); } catch (_) { return json(req, env, 503, { error: "retry_later" }); }
  if (!adm.ok) return json(req, env, 403, { error: "denied" });
  const b = (await readJson(req, 1024)) || {};
  const f = guardedFetch(rawFetch);

  if (b.action === "status") {
    let connected = false, last = null;
    try { connected = await db.hasReaderRefreshToken(); last = await db.getLastRun(); } catch (_) { /* shown as unknown */ }
    return json(req, env, 200, { connected, lastRun: last ? { finished_at: last.finished_at, result: last.result, reason: last.reason } : null });
  }
  if (!readerConfigOk(env)) return json(req, env, 200, { state: "not_configured" });

  if (b.action === "start") {
    const s = await deviceStart(env, f);
    if (!s.ok) return json(req, env, 502, { error: "start_failed" });
    await db.putPending({ device_code: s.deviceCode, expires_at: new Date(now() + s.expiresIn * 1000).toISOString(), interval_s: s.interval, started_by: adm.userId });
    return json(req, env, 200, { userCode: s.userCode, verificationUri: s.verificationUri, expiresIn: s.expiresIn, interval: s.interval });
  }

  if (b.action === "poll") {
    const p = await db.getPending();
    if (!p) return json(req, env, 200, { state: "none" });
    if (Date.parse(p.expires_at) < now()) { await db.deletePending(); return json(req, env, 200, { state: "expired" }); }
    const r = await devicePoll(env, f, p.device_code);
    if (r.state === "waiting") return json(req, env, 200, { state: "waiting" });
    if (r.state !== "tokens") { await db.deletePending(); return json(req, env, 200, { state: r.state }); }
    await db.deletePending();
    if (!accountOk(env, r.access)) return json(req, env, 200, { state: "wrong_account" });
    await db.setReaderRefreshToken(r.refresh);
    return json(req, env, 200, { state: "done" });
  }
  return json(req, env, 400, { error: "bad_request" });
}
