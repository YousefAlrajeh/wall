// clock - the wall's shared time. Answers {t} = server time in ms, nothing else.
// No key needed: it reveals only the time. Replaces the old ?now=1 of the token function
// for screens that run with canvasPages on (the old path is unchanged).
import { json, preflight } from "../_shared/http.mjs";

export function handle(req, { env, now }) {
  if (req.method === "OPTIONS") return preflight(req, env);
  if (req.method !== "GET") return json(req, env, 405, { error: "method" });
  return json(req, env, 200, { t: now() });
}
