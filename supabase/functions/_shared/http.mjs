// http.mjs - small response helpers shared by the wall's server functions.
// No Deno-only APIs, so the local harness can run the same code in Node.

// Origin check (extra layer only): when WALL_ALLOWED_ORIGINS is set (comma list),
// a request that carries an Origin header outside the list is refused.
export function originAllowed(req, env) {
  const list = String(env.WALL_ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const o = req.headers.get("origin");
  if (!list.length || !o) return true;
  return list.includes(o);
}

export function corsHeaders(req, env) {
  const o = req.headers.get("origin");
  const list = String(env.WALL_ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const allow = !o ? "*" : (!list.length || list.includes(o)) ? o : "null";
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
