// ms.mjs - Microsoft sign-in and Power BI calls for the app 'HMG Wall Reader'
// (delegated Dataset.Read.All, D-224/D-227/D-228/D-229).
// Values come from server secrets, referred to by NAME only:
//   WALL_READER_TENANT_ID, WALL_READER_CLIENT_ID, WALL_READER_CLIENT_SECRET (optional),
//   WALL_READER_EXPECTED_OID (the one account allowed), WALL_READER_GROUP_ID, WALL_READER_DATASET_ID.
// The refresh token itself lives in the Vault secret 'wall_reader_refresh_token' (see the migration).
// Nothing here returns or logs a token.

export const SCOPE = "https://analysis.windows.net/powerbi/api/Dataset.Read.All offline_access openid profile";
const HOSTS = new Set(["login.microsoftonline.com", "api.powerbi.com"]);
const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DOMAIN_RE = /^(?=.{4,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;
export function tenantOk(t) { return GUID_RE.test(t || "") || DOMAIN_RE.test(t || ""); }
// The tenant may be set as its GUID or as a domain name (both work in the sign-in address).
// A GUID is compared with the token's tid; a domain name cannot be turned into the GUID offline,
// so then only the account id (oid, a GUID) decides.
export function tenantMatches(expected, tid) {
  if (GUID_RE.test(expected || "")) return String(tid || "").toLowerCase() === String(expected).toLowerCase();
  return DOMAIN_RE.test(expected || "") && GUID_RE.test(tid || "");
}

export function readerConfigOk(env) {
  return tenantOk(env.WALL_READER_TENANT_ID) && GUID_RE.test(env.WALL_READER_CLIENT_ID || "") &&
    GUID_RE.test(env.WALL_READER_EXPECTED_OID || "") && GUID_RE.test(env.WALL_READER_GROUP_ID || "") &&
    GUID_RE.test(env.WALL_READER_DATASET_ID || "");
}

// Outgoing calls may go to Microsoft only.
export function guardedFetch(fetchFn) {
  return (url, opts) => {
    const h = new URL(url).hostname;
    if (!HOSTS.has(h)) throw new Error("HOST_NOT_ALLOWED");
    return fetchFn(url, { ...opts, redirect: "error" });
  };
}

function form(env, extra) {
  // public-client flows (device code, refresh): no client secret is ever sent (leave WALL_READER_CLIENT_SECRET unset)
  return new URLSearchParams({ client_id: env.WALL_READER_CLIENT_ID, ...extra }).toString();
}
function authUrl(env, path) {
  return "https://login.microsoftonline.com/" + env.WALL_READER_TENANT_ID + "/oauth2/v2.0/" + path;
}
async function postForm(f, url, body) {
  const r = await f(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  let j = null;
  try { j = await r.json(); } catch (_) { /* ignore */ }
  return { status: r.status, body: j || {} };
}

// Refresh-token flow. Returns {ok, access, refresh} or {ok:false, code}.
export async function refreshAccess(env, f, refreshToken) {
  const r = await postForm(f, authUrl(env, "token"), form(env, { grant_type: "refresh_token", refresh_token: refreshToken, scope: SCOPE }));
  if (r.status === 200 && r.body.access_token) return { ok: true, access: r.body.access_token, refresh: r.body.refresh_token || null };
  if (r.body.error === "invalid_grant" || r.body.error === "interaction_required") return { ok: false, code: "NEEDS_SIGNIN" };
  return { ok: false, code: "TOKEN_REFRESH_FAILED" };
}

// One-time BROWSER sign-in (authorization code + PKCE), started by a console admin (G4b; the device-code flow it
// replaces was refused by the tenant's Conditional Access). The browser goes to Microsoft and comes back to the one fixed
// console address; the code is exchanged here, on the server, with the verifier that never left the server.
// Public client (D-228): no client secret is sent; the redirect address is registered on HMG Wall Reader under the
// platform "Mobile and desktop applications".
export const READER_REDIRECT_DEFAULT = "https://yousefalrajeh.github.io/wall/console.html";
const REDIRECT_RE = /^https:\/\/[a-z0-9.-]+(:\d{1,5})?\/[A-Za-z0-9._~\/-]{0,200}$/;
// The one address Microsoft may send the browser back to. Never taken from the request (no open redirect): the default
// above, or the function secret WALL_READER_REDIRECT_URI, and only if its origin is one of WALL_ALLOWED_ORIGINS.
export function readerRedirect(env, allowedOrigins) {
  const r = String(env.WALL_READER_REDIRECT_URI || READER_REDIRECT_DEFAULT);
  if (!REDIRECT_RE.test(r)) return null;
  const origin = r.replace(/^(https:\/\/[^/]+).*$/, "$1");
  return (allowedOrigins || []).includes(origin) ? r : null;
}
export function authorizeUrl(env, redirect, state, challenge) {
  return authUrl(env, "authorize") + "?" + new URLSearchParams({
    client_id: env.WALL_READER_CLIENT_ID, response_type: "code", response_mode: "query", redirect_uri: redirect,
    scope: SCOPE, state, code_challenge: challenge, code_challenge_method: "S256", prompt: "select_account",
  }).toString();
}
// Exchanges the code. Returns {ok, access, refresh} or {ok:false, code} with a short code only (never Microsoft's text).
export async function exchangeCode(env, f, code, verifier, redirect) {
  const r = await postForm(f, authUrl(env, "token"), form(env, { grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: redirect, scope: SCOPE }));
  if (r.status === 200 && r.body.access_token && r.body.refresh_token) return { ok: true, access: r.body.access_token, refresh: r.body.refresh_token };
  return { ok: false, code: tokenErrorCode(r.body) };
}
// Microsoft error -> short code. AADSTS numbers are read from the error text only to pick the code; the text is dropped.
export function tokenErrorCode(b) {
  const d = String((b && (b.error_description || "")) || "") + " " + String((b && b.error_codes && b.error_codes.join(" ")) || "");
  const e = String((b && b.error) || "");
  if (/AADSTS65001|AADSTS90094|AADSTS90008/.test(d) || e === "consent_required") return "needs_admin";
  if (/AADSTS53\d{3}/.test(d)) return "blocked_by_policy";
  if (/AADSTS7000218/.test(d)) return "needs_secret";
  if (/AADSTS50011|AADSTS500113/.test(d)) return "redirect_not_registered";
  if (/AADSTS70008|AADSTS54005/.test(d) || e === "invalid_grant") return "expired";
  if (e === "access_denied") return "declined";
  return "failed";
}

// Decodes the claims part of a token received straight from Microsoft over TLS.
export function claims(token) {
  try {
    const p = String(token).split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(p + "===".slice((p.length + 3) % 4)));
  } catch (_) {
    return null;
  }
}
// Account check: the token must belong to the expected tenant and the one expected account.
export function accountOk(env, token) {
  const c = claims(token);
  return !!c && tenantMatches(env.WALL_READER_TENANT_ID, c.tid) &&
    String(c.oid || "").toLowerCase() === String(env.WALL_READER_EXPECTED_OID).toLowerCase();
}

function dsUrl(env, tail) {
  return "https://api.powerbi.com/v1.0/myorg/groups/" + env.WALL_READER_GROUP_ID + "/datasets/" + env.WALL_READER_DATASET_ID + tail;
}

// "Data as of": end time of the model's latest completed refresh.
export async function latestRefresh(env, f, access) {
  const r = await f(dsUrl(env, "/refreshes?$top=10"), { headers: { Authorization: "Bearer " + access } });
  if (r.status !== 200) return { ok: false, code: "HTTP_" + r.status };
  const t = await r.text();
  if (t.length > 65536) return { ok: false, code: "RESP_TOO_BIG" };
  let j;
  try { j = JSON.parse(t); } catch (_) { return { ok: false, code: "RESP_NOT_JSON" }; }
  const done = (j.value || []).filter((x) => x && x.status === "Completed" && typeof x.endTime === "string")
    .map((x) => Date.parse(x.endTime)).filter((n) => isFinite(n)).sort((a, b) => b - a);
  if (!done.length) return { ok: false, code: "AS_OF_UNKNOWN" };
  return { ok: true, asOf: new Date(done[0]).toISOString() };
}

// Runs one allow-listed DAX query. Returns {ok, status, text} - the raw text goes to the validator.
export async function executeQuery(env, f, access, dax) {
  const r = await f(dsUrl(env, "/executeQueries"), {
    method: "POST",
    headers: { Authorization: "Bearer " + access, "Content-Type": "application/json" },
    body: JSON.stringify({ queries: [{ query: dax }], serializerSettings: { includeNulls: true } }),
  });
  const text = await r.text();
  return { ok: r.status === 200, status: r.status, text };
}
