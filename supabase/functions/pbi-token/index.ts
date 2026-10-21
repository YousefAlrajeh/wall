// ECC WALL v5.0 — Power BI token function: MASTER-USER / USER-OWNS-DATA architecture
// - No GenerateToken. No embed-token quota. No capacity dependency.
// - Auth: dedicated Entra account, device-code bootstrap once, rotating refresh token
//   stored server-side in the zero-policy `vault` table (service-role only).
// Secrets required: PBI_TENANT, PBI_CLIENT, SCREEN_KEY (PBI_SECRET no longer used).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const TENANT = Deno.env.get("PBI_TENANT")!;
const CLIENT = Deno.env.get("PBI_CLIENT")!;
const SCREEN_KEY = Deno.env.get("SCREEN_KEY")!;
const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const SUPA_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SCOPE = "https://analysis.windows.net/powerbi/api/Report.Read.All offline_access openid profile";
const TOKEN_URL = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`;
const DEVICE_URL = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/devicecode`;

/* ---------- vault: server-only storage (RLS with zero policies) ---------- */
async function vGet(id: string): Promise<any | null> {
  const r = await fetch(`${SUPA_URL}/rest/v1/vault?id=eq.${id}&select=data`, {
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } });
  const j = await r.json();
  return j[0]?.data ?? null;
}
async function vSet(id: string, data: any) {
  await fetch(`${SUPA_URL}/rest/v1/vault`, {
    method: "POST",
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`,
      "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ id, data, updated_at: new Date().toISOString() }) });
}

/* ---------- user access token via rotating refresh token ---------- */
let memAT: { token: string; exp: number } | null = null;
class Reauth extends Error {}
async function msPost(url: string, params: Record<string, string>, retry = 1): Promise<any> {
  const r = await fetch(url, { method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params) });
  if (r.status >= 500 && retry > 0) { await new Promise(s => setTimeout(s, 1200)); return msPost(url, params, retry - 1); }
  return r.json();
}
async function userToken(force = false): Promise<string> {
  if (!force) {
    if (memAT && Date.now() < memAT.exp - 120000) return memAT.token;
    const cached = await vGet("ms_at");
    if (cached && Date.now() < cached.exp - 120000) { memAT = cached; return cached.token; }
  }
  const ms = await vGet("ms");
  if (!ms?.refresh_token) throw new Reauth("no refresh token stored");
  const j = await msPost(TOKEN_URL, {
    grant_type: "refresh_token", client_id: CLIENT,
    refresh_token: ms.refresh_token, scope: SCOPE });
  if (!j.access_token) {
    if (j.error === "invalid_grant" || j.error === "interaction_required") {
      await vSet("ms", { revoked_at: Date.now(), reason: j.error });
      throw new Reauth(j.error_description?.slice(0, 160) || j.error);
    }
    throw new Error("MS transient: " + JSON.stringify(j).slice(0, 160));
  }
  if (j.refresh_token) await vSet("ms", { refresh_token: j.refresh_token, rotated_at: Date.now() });
  memAT = { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  await vSet("ms_at", memAT);
  return memAT.token;
}

/* ---------- report metadata (embedUrl) cache ---------- */
const repMeta = new Map<string, { embedUrl: string }>();
async function embedUrlFor(reportId: string): Promise<string> {
  const hit = repMeta.get(reportId);
  if (hit) return hit.embedUrl;
  let url = `https://app.powerbi.com/reportEmbed?reportId=${reportId}`;
  try {
    const t = await userToken();
    const r = await fetch(`https://api.powerbi.com/v1.0/myorg/reports/${reportId}`,
      { headers: { Authorization: `Bearer ${t}` } });
    if (r.ok) { const j = await r.json(); if (j.embedUrl) url = j.embedUrl; }
  } catch (_) { /* constructed URL fallback is valid for user-owns-data */ }
  repMeta.set(reportId, { embedUrl: url });
  return url;
}

function parsePbi(u: string) {
  try { const url = new URL(u);
    if (!/reportEmbed/i.test(url.pathname)) return null;
    return { reportId: url.searchParams.get("reportId"), pageName: url.searchParams.get("pageName") };
  } catch { return null; }
}
const J = (o: any, status = 200, cors: any = {}) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const cors = { "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const q = new URL(req.url).searchParams;
    if (q.get("now")) return J({ now: Date.now() }, 200, cors);
    if (q.get("k") !== SCREEN_KEY) return J({ error: "bad key" }, 403, cors);

    if (q.get("status")) {
      const ms = await vGet("ms");
      return J({ authorized: !!ms?.refresh_token, revoked: !!ms?.revoked_at }, 200, cors);
    }
    if (q.get("login")) {
      const j = await msPost(DEVICE_URL, { client_id: CLIENT, scope: SCOPE });
      if (!j.device_code) return J({ error: "devicecode: " + JSON.stringify(j).slice(0, 160) }, 500, cors);
      await vSet("device", { device_code: j.device_code, exp: Date.now() + (j.expires_in || 900) * 1000 });
      return J({ user_code: j.user_code, verification_uri: j.verification_uri || "https://microsoft.com/devicelogin",
                 interval: j.interval || 5 }, 200, cors);
    }
    /* ----- admin: redeem an authorization code (browser sign-in, PKCE) ----- */
    if (q.get("redeem")) {
      const code = q.get("code") || "", verifier = q.get("verifier") || "", ruri = q.get("ruri") || "";
      if (!code || !verifier || !ruri) return J({ error: "missing code/verifier/ruri" }, 400, cors);
      const j = await msPost(TOKEN_URL, {
        grant_type: "authorization_code", client_id: CLIENT,
        code, code_verifier: verifier, redirect_uri: ruri, scope: SCOPE });
      if (!j.refresh_token) return J({ error: j.error_description?.slice(0, 220) || j.error || "no refresh token returned" }, 400, cors);
      await vSet("ms", { refresh_token: j.refresh_token, rotated_at: Date.now() });
      memAT = { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
      await vSet("ms_at", memAT);
      return J({ ok: true }, 200, cors);
    }
    if (q.get("poll")) {
      const d = await vGet("device");
      if (!d?.device_code || Date.now() > d.exp) return J({ error: "login expired — start again" }, 410, cors);
      const j = await msPost(TOKEN_URL, {
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        client_id: CLIENT, device_code: d.device_code });
      if (j.error === "authorization_pending") return J({ pending: true }, 200, cors);
      if (j.error) return J({ error: j.error_description?.slice(0, 200) || j.error }, 400, cors);
      await vSet("ms", { refresh_token: j.refresh_token, rotated_at: Date.now() });
      memAT = { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
      await vSet("ms_at", memAT);
      return J({ ok: true }, 200, cors);
    }

    const contentId = q.get("content") || "";
    const cr = await fetch(`${SUPA_URL}/rest/v1/content?id=eq.${encodeURIComponent(contentId)}&select=url`, {
      headers: { apikey: SUPA_ANON, Authorization: `Bearer ${SUPA_ANON}` } });
    const rows = await cr.json();
    const pbi = rows[0] && parsePbi(rows[0].url);
    if (!pbi?.reportId) return J({ error: "not a Power BI content" }, 400, cors);

    let token: string;
    try { token = await userToken(q.get("fresh") === "1"); }
    catch (e) {
      if (e instanceof Reauth) return J({ error: "reauth_required", detail: String(e.message).slice(0, 160) }, 401, cors);
      return J({ error: "retry_later", detail: String(e).slice(0, 160) }, 503, cors);
    }
    const embedUrl = await embedUrlFor(pbi.reportId);
    return J({ token, tokenType: "Aad", embedUrl, reportId: pbi.reportId, pageName: pbi.pageName }, 200, cors);
  } catch (e) {
    return J({ error: String(e).slice(0, 300) }, 500, {});
  }
});