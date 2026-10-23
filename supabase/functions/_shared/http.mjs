// http.mjs - small response helpers shared by the wall's server functions.
// No Deno-only APIs, so the local harness can run the same code in Node.

// Origin check (extra layer only). WALL_ALLOWED_ORIGINS is a comma list of origins: scheme and host only,
// no path, no trailing slash. For this wall: https://yousefalrajeh.github.io
//   state "on"      : the list is valid; a browser request from any other origin is refused
//   state "off"     : not set
//   state "invalid" : set, but some entry is not a bare origin (a path, a slash, a typo): treated like "off"
//                     here; pbi-token refuses instead once screens must be set up (see its handler)
const ORIGIN_RE = /^https?:\/\/[a-z0-9.-]+(:\d{1,5})?$/i;
export function originState(env) {
  const raw = String(env.WALL_ALLOWED_ORIGINS || "").trim();
  if (!raw) return { state: "off", list: [] };
  const list = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return list.length && list.every((x) => ORIGIN_RE.test(x)) ? { state: "on", list } : { state: "invalid", list: [] };
}
export function originAllowed(req, env, failClosed) {
  const o = req.headers.get("origin");
  if (!o) return true;                                   // not a browser request: the origin layer does not apply
  const st = originState(env);
  if (st.state === "on") return st.list.includes(o);
  return !failClosed;
}

export function corsHeaders(req, env) {
  const o = req.headers.get("origin");
  const st = originState(env);
  const allow = !o ? "*" : (st.state !== "on" || st.list.includes(o)) ? o : "null";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-wall-pull-secret",
    "Vary": "Origin",
  };
}

export function json(req, env, status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req, env), "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export function preflight(req, env) {
  return new Response(null, { status: 204, headers: corsHeaders(req, env) });
}

// Reads a JSON body with a hard size cap. Returns null on anything odd.
export async function readJson(req, maxBytes) {
  try {
    const t = await req.text();
    if (t.length > maxBytes) return null;
    const j = JSON.parse(t || "{}");
    return (j && typeof j === "object" && !Array.isArray(j)) ? j : null;
  } catch (_) {
    return null;
  }
}

export function bearer(req) {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+([A-Za-z0-9._~+\/=-]{20,4096})$/);
  return m ? m[1] : null;
}
