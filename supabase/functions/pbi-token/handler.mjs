// pbi-token v6 - security fix (brief step 2: G, H, A, D). Same stored Microsoft link (D-210):
// the refresh token stays in the zero-policy `vault` table rows "ms" / "ms_at", same app, same scope,
// same rotation. Same screen key (D-212), read from the secret SCREEN_KEY.
//
//   now      GET ?now=1                         -> {now}             kept until players use rpc/wall_now
//   login    GET ?login / ?poll                  -> 410 gone          (H: device-code sign-in removed)
//   status   POST {action:"status"} + admin session                 (G: console admin only)
//            -> {authorized, revoked, accountMatches}
//   redeem   POST {action:"redeem", code, verifier, ruri} + admin session, and the signed-in Microsoft
//            account must be PBI_EXPECTED_OID in PBI_TENANT, or nothing is stored          (G)
//   check    POST {action:"check", s, k, d}      -> {key:true, enrolled, required} or 403   (never a token)
//   token    POST {content, s, k, d, fresh}      -> what players need today (Aad token)     (A)
//            GET ?content=&k= (old players)      -> only while WALL_REQUIRE_DEVICE is not "1"
// D: when WALL_ALLOWED_ORIGINS is set, a browser request from any other origin is refused.
// Residual risk (unchanged by design): an enrolled screen PC still receives the stored account's
// Aad token (Report.Read.All); anyone who takes the device secret out of that PC's browser can too.
import { checkScreen, checkAdmin, safeEqual, SCREEN_ID_RE } from "../_shared/device.mjs";
import { json, preflight, readJson, bearer, originAllowed } from "../_shared/http.mjs";
import { claims } from "../_shared/ms.mjs";

const SCOPE = "https://analysis.windows.net/powerbi/api/Report.Read.All offline_access openid profile";
class Reauth extends Error {}

async function msPost(f, url, params, retry = 1) {
  const r = await f(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params).toString() });
  if (r.status >= 500 && retry > 0) return msPost(f, url, params, retry - 1);
  try { return await r.json(); } catch (_) { return {}; }
}

// same refresh flow and vault rows as v5
async function userToken(ctx, force) {
  const { env, db, fetch: f, now, mem } = ctx;
  if (!force) {
    if (mem.at && now() < mem.at.exp - 120000) return mem.at.token;
    const cached = await db.vGet("ms_at");
    if (cached && now() < cached.exp - 120000) { mem.at = cached; return cached.token; }
  }
  const ms = await db.vGet("ms");
  if (!ms || !ms.refresh_token) throw new Reauth("no_refresh_token");
  const j = await msPost(f, "https://login.microsoftonline.com/" + env.PBI_TENANT + "/oauth2/v2.0/token",
    { grant_type: "refresh_token", client_id: env.PBI_CLIENT, refresh_token: ms.refresh_token, scope: SCOPE });
  if (!j.access_token) {
    if (j.error === "invalid_grant" || j.error === "interaction_required") {
      await db.vSet("ms", { revoked_at: now(), reason: j.error });
      throw new Reauth(j.error);
    }
    throw new Error("ms_transient");
  }
  if (j.refresh_token) await db.vSet("ms", { refresh_token: j.refresh_token, rotated_at: now() });
  mem.at = { token: j.access_token, exp: now() + (j.expires_in || 3600) * 1000 };
  await db.vSet("ms_at", mem.at);
  return mem.at.token;
}

// account check: tenant and the one expected account (both secrets, by name)
function accountMatches(env, token) {
  if (!env.PBI_EXPECTED_OID) return null;               // not set up: unknown
  const c = claims(token);
  return !!c && String(c.tid || "").toLowerCase() === String(env.PBI_TENANT || "").toLowerCase() &&
    String(c.oid || "").toLowerCase() === String(env.PBI_EXPECTED_OID).toLowerCase();
}

async function embedUrlFor(ctx, reportId) {
  const hit = ctx.mem.rep.get(reportId);
  if (hit) return hit;
  let url = "https://app.powerbi.com/reportEmbed?reportId=" + reportId;
  try {
    const t = await userToken(ctx, false);
    const r = await ctx.fetch("https://api.powerbi.com/v1.0/myorg/reports/" + encodeURIComponent(reportId), { headers: { Authorization: "Bearer " + t } });
    if (r.ok) { const j = await r.json(); if (j.embedUrl) url = j.embedUrl; }
  } catch (_) { /* constructed URL is valid for user-owns-data */ }
  ctx.mem.rep.set(reportId, url);
  return url;
}
function parsePbi(u) {
  try {
    const url = new URL(u);
    if (!/reportEmbed/i.test(url.pathname)) return null;
    return { reportId: url.searchParams.get("reportId"), pageName: url.searchParams.get("pageName") };
  } catch (_) { return null; }
}

async function tokenAnswer(req, ctx, contentId, fresh, enrolled) {
  const { env, db } = ctx;
  if (typeof contentId !== "string" || !/^[A-Za-z0-9_:.-]{1,64}$/.test(contentId)) return json(req, env, 400, { error: "bad_request" });
  const url = await db.getContentUrl(contentId);
  const pbi = url && parsePbi(url);
  if (!pbi || !pbi.reportId) return json(req, env, 400, { error: "not a Power BI content" });
  let token;
  try { token = await userToken(ctx, !!fresh); } catch (e) {
    if (e instanceof Reauth) return json(req, env, 401, { error: "reauth_required" });
    return json(req, env, 503, { error: "retry_later" });
  }
  if (accountMatches(env, token) === false) return json(req, env, 503, { error: "account_mismatch" });
  const embedUrl = await embedUrlFor(ctx, pbi.reportId);
  const out = { token, tokenType: "Aad", embedUrl, reportId: pbi.reportId, pageName: pbi.pageName };
  if (enrolled !== undefined) out.enrolled = enrolled;
  return json(req, env, 200, out);
}

export async function handle(req, ctx) {
  const { env, db } = ctx;
  ctx.mem = ctx.mem || { at: null, rep: new Map() };
  if (req.method === "OPTIONS") return preflight(req, env);
  if (!originAllowed(req, env)) return json(req, env, 403, { error: "denied" });
  const required = env.WALL_REQUIRE_DEVICE === "1";
  try {
    const q = new URL(req.url).searchParams;
    if (q.get("now")) return json(req, env, 200, { now: ctx.now() });
    if (q.get("login") || q.get("poll")) return json(req, env, 410, { error: "gone" });
    if (q.get("status") || q.get("redeem")) return json(req, env, 403, { error: "admin_only" });

    if (req.method === "GET") {
      // old players: GET ?content=&k=  (rollout only)
      if (!q.get("content")) return json(req, env, 400, { error: "bad_request" });
      if (!(await safeEqual(q.get("k") || "", env.SCREEN_KEY || null))) return json(req, env, 403, { error: "bad key" });
      if (required) return json(req, env, 401, { error: "not_enrolled" });
      return tokenAnswer(req, ctx, q.get("content"), q.get("fresh") === "1");
    }
    if (req.method !== "POST") return json(req, env, 405, { error: "method" });
    const b = await readJson(req, 4096);
    if (!b) return json(req, env, 400, { error: "bad_request" });

    if (b.action === "status" || b.action === "redeem") {
      let adm;
      try { adm = await checkAdmin(db, bearer(req)); } catch (_) { return json(req, env, 503, { error: "retry_later" }); }
      if (!adm.ok) return json(req, env, 403, { error: "admin_only" });
      if (b.action === "status") {
        const ms = await db.vGet("ms");
        let match = null;
        if (ms && ms.refresh_token) { try { match = accountMatches(env, await userToken(ctx, false)); } catch (_) { match = null; } }
        return json(req, env, 200, { authorized: !!(ms && ms.refresh_token), revoked: !!(ms && ms.revoked_at), accountMatches: match });
      }
      // redeem (browser sign-in with PKCE), admin only, expected account only
      if (!env.PBI_EXPECTED_OID) return json(req, env, 400, { error: "account_check_not_set_up" });
      const code = String(b.code || ""), verifier = String(b.verifier || ""), ruri = String(b.ruri || "");
      if (!code || !verifier || !/^https:\/\/[^\s]{1,300}$/.test(ruri) || code.length > 4000 || verifier.length > 200) return json(req, env, 400, { error: "missing code/verifier/ruri" });
      const j = await msPost(ctx.fetch, "https://login.microsoftonline.com/" + env.PBI_TENANT + "/oauth2/v2.0/token",
        { grant_type: "authorization_code", client_id: env.PBI_CLIENT, code, code_verifier: verifier, redirect_uri: ruri, scope: SCOPE });
      if (!j.refresh_token || !j.access_token) return json(req, env, 400, { error: "no refresh token returned" });
      if (accountMatches(env, j.access_token) !== true) return json(req, env, 403, { error: "wrong_account" }); // nothing stored
      await db.vSet("ms", { refresh_token: j.refresh_token, rotated_at: ctx.now() });
      ctx.mem.at = { token: j.access_token, exp: ctx.now() + (j.expires_in || 3600) * 1000 };
      await db.vSet("ms_at", ctx.mem.at);
      return json(req, env, 200, { ok: true });
    }

    // screens: key + device secret
    if (typeof b.s !== "string" || !SCREEN_ID_RE.test(b.s)) return json(req, env, 400, { error: "bad_request" });
    const keyOk = await safeEqual(String(b.k || ""), env.SCREEN_KEY || null);
    let dev = { ok: false };
    try { dev = await checkScreen(db, b.s, b.k, b.d); } catch (_) { return json(req, env, 503, { error: "retry_later" }); }
    if (!keyOk) return json(req, env, 403, { error: "bad key" });
    if (b.action === "check") return json(req, env, 200, { key: true, enrolled: dev.ok, required });
    if (required && !dev.ok) return json(req, env, 401, { error: "not_enrolled" });
    return tokenAnswer(req, ctx, b.content, b.fresh === true || b.fresh === 1, dev.ok);
  } catch (_) {
    return json(req, env, 500, { error: "server_error" });
  }
}
