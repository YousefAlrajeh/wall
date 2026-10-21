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

export function readerConfigOk(env) {
  return GUID_RE.test(env.WALL_READER_TENANT_ID || "") && GUID_RE.test(env.WALL_READER_CLIENT_ID || "") &&
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
  const p = new URLSearchParams({ client_id: env.WALL_READER_CLIENT_ID, ...extra });
  if (env.WALL_READER_CLIENT_SECRET) p.set("client_secret", env.WALL_READER_CLIENT_SECRET);
  return p.toString();
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
  if (r.body.error === "invalid_grant") return { ok: false, code: "NEEDS_SIGNIN" };
  return { ok: false, code: "TOKEN_REFRESH_FAILED" };
}

// One-time device sign-in, started by a console admin.
export async function deviceStart(env, f) {
  const r = await postForm(f, authUrl(env, "devicecode"), form(env, { scope: SCOPE }));
  if (r.status !== 200 || !r.body.device_code || !r.body.user_code) return { ok: false, code: "DEVICE_START_FAILED" };
  return {
    ok: true, deviceCode: r.body.device_code, userCode: String(r.body.user_code).slice(0, 16),
    verificationUri: "https://microsoft.com/devicelogin",
    expiresIn: Math.min(+r.body.expires_in || 900, 900), interval: Math.max(+r.body.interval || 5, 5),
  };
}
export async function devicePoll(env, f, deviceCode) {
  const r = await postForm(f, authUrl(env, "token"), form(env, { grant_type: "urn:ietf:params:oauth:grant-type:device_code", device_code: deviceCode }));
  if (r.status === 200 && r.body.access_token && r.body.refresh_token) {
    return { state: "tokens", access: r.body.access_token, refresh: r.body.refresh_token, idToken: r.body.id_token || null };
  }
  const e = r.body.error;
  if (e === "authorization_pending") return { state: "waiting" };
  if (e === "slow_down") return { state: "waiting", slowDown: true };
  if (e === "expired_token" || e === "code_expired") return { state: "expired" };
  if (e === "authorization_declined" || e === "access_denied") return { state: "declined" };
  return { state: "failed" };
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
  return !!c && String(c.tid || "").toLowerCase() === String(env.WALL_READER_TENANT_ID).toLowerCase() &&
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
