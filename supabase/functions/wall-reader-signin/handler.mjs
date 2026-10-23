// wall-reader-signin - one-time BROWSER sign-in for 'HMG Wall Reader' (authorization code + PKCE), started from the
// console (G4b: replaces the device-code flow, which the tenant's Conditional Access refused).
// Only a signed-in console admin (Supabase session + row in wall_admins) may call it, from an allowed origin.
// - start:    the server makes a random state and PKCE verifier. It keeps only the state's sha256 and the verifier, bound
//             to this admin, single-use, for 10 minutes. It answers with Microsoft's sign-in address, which carries the
//             state and the code challenge, never the verifier.
// - callback: the browser hands back {code, state} (or Microsoft's {error, state}). The pending sign-in is taken in one
//             statement (single use); state, admin and time must match. The code is exchanged here with the verifier.
//             The account must be the expected one (WALL_READER_TENANT_ID + WALL_READER_EXPECTED_OID): any other account
//             gets "wrong_account" and nothing is stored. The refresh token goes to Vault only.
// - cancel:   drops a pending sign-in of this admin.
// - status:   {connected, lastRun}.
// Answers carry short codes only: never a token, a code, a verifier, a state or Microsoft's own text.
import { checkAdmin, sha256Hex, hexEqual } from "../_shared/device.mjs";
import { json, preflight, readJson, bearer, originAllowed, originState } from "../_shared/http.mjs";
import { readerConfigOk, guardedFetch, accountOk, readerRedirect, authorizeUrl, exchangeCode, tokenErrorCode } from "../_shared/ms.mjs";

export const STATE_TTL_MS = 600000;                      // 10 minutes
const STATE_RE = /^wr\.[A-Za-z0-9_-]{43}$/;              // "wr." + 32 random bytes
const CODE_RE = /^[A-Za-z0-9._~*+\/=-]{20,4000}$/;
const ERR_RE = /^[a-z_]{1,40}$/;

function b64url(bytes) {
  let s = ""; for (const x of bytes) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function s256(text) { return b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))); }

export async function handle(req, { env, db, fetch: rawFetch, now }) {
  if (req.method === "OPTIONS") return preflight(req, env);
  if (!originAllowed(req, env)) return json(req, env, 403, { error: "denied" });
  if (req.method !== "POST") return json(req, env, 405, { error: "method" });
  let adm;
  try { adm = await checkAdmin(db, bearer(req)); } catch (_) { return json(req, env, 503, { error: "retry_later" }); }
  if (!adm.ok) return json(req, env, 403, { error: "denied" });
  const b = (await readJson(req, 8192)) || {};
  const f = guardedFetch(rawFetch);

  if (b.action === "status") {
    let connected = false, last = null;
    try { connected = await db.hasReaderRefreshToken(); last = await db.getLastRun(); } catch (_) { /* shown as unknown */ }
    return json(req, env, 200, { connected, lastRun: last ? { finished_at: last.finished_at, result: last.result, reason: last.reason } : null });
  }
  if (!readerConfigOk(env)) return json(req, env, 200, { state: "not_configured" });
  const os = originState(env);
  const redirect = readerRedirect(env, os.state === "on" ? os.list : []);
  if (!redirect) return json(req, env, 200, { state: "not_configured" });

  if (b.action === "start") {
    const state = "wr." + b64url(crypto.getRandomValues(new Uint8Array(32)));
    const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));     // 64 characters
    const stateHash = await sha256Hex(state);
    await db.putPending({ device_code: "pkce1:" + stateHash + ":" + verifier, expires_at: new Date(now() + STATE_TTL_MS).toISOString(), interval_s: 0, started_by: adm.userId });
    return json(req, env, 200, { authorizeUrl: authorizeUrl(env, redirect, state, await s256(verifier)), expiresIn: STATE_TTL_MS / 1000 });
  }

  if (b.action === "cancel") {
    const p = await db.getPending();
    if (p && p.started_by === adm.userId) await db.deletePending();
    return json(req, env, 200, { state: "cancelled" });
  }

  if (b.action === "callback") {
    const state = String(b.state || "");
    if (!STATE_RE.test(state)) return json(req, env, 200, { state: "bad_state" });
    const stateHash = await sha256Hex(state);
    const p = await db.takePending(stateHash, adm.userId);                    // single use, and only by the admin who started it
    if (!p) return json(req, env, 200, { state: "bad_state" });
    const parts = String(p.device_code || "").split(":");
    if (parts.length !== 3 || parts[0] !== "pkce1" || !hexEqual(parts[1], stateHash)) return json(req, env, 200, { state: "bad_state" });
    if (p.started_by !== adm.userId) return json(req, env, 200, { state: "bad_state" });            // bound to the admin who started it
    if (!(Date.parse(p.expires_at) >= now())) return json(req, env, 200, { state: "expired" });
    if (b.error !== undefined) {                                                                     // Microsoft sent the browser back with an error
      const e = ERR_RE.test(String(b.error)) ? String(b.error) : "failed";
      const sub = String(b.errorCodes || "");
      const code = tokenErrorCode({ error: e, error_description: /^[0-9 ,]{0,200}$/.test(sub) ? sub.split(/[ ,]+/).map((n) => "AADSTS" + n).join(" ") : "" });
      return json(req, env, 200, { state: code });
    }
    const code = String(b.code || "");
    if (!CODE_RE.test(code)) return json(req, env, 200, { state: "failed" });
    let r;
    try { r = await exchangeCode(env, f, code, parts[2], redirect); } catch (_) { return json(req, env, 200, { state: "failed" }); }
    if (!r.ok) return json(req, env, 200, { state: r.code });
    if (!accountOk(env, r.access)) return json(req, env, 200, { state: "wrong_account" });
    await db.setReaderRefreshToken(r.refresh);
    return json(req, env, 200, { state: "done" });
  }
  return json(req, env, 400, { error: "bad_request" });
}
