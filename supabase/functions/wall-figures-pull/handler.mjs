// wall-figures-pull - the figures job. Run by the schedule only (header x-wall-pull-secret).
// 1. refresh-token flow for 'HMG Wall Reader' (token read from the Vault secret by name, rotated, never returned)
// 2. account check on the access token (expected tenant and account only)
// 3. "data as of" from the model's latest completed refresh; mode "check" stops here when nothing is new
// 4. every allow-listed query, each answer validated strictly; ANY surprise rejects the whole snapshot
// 5. the snapshot goes to the private table wall_figures; a run row (codes, counts, times) to wall_figures_runs
import { checkAllowList, validateQueryResult, buildSnapshot } from "../_shared/snapshot.mjs";
import { safeEqual, sha256Hex } from "../_shared/device.mjs";
import { json, preflight, readJson } from "../_shared/http.mjs";
import { readerConfigOk, guardedFetch, refreshAccess, accountOk, latestRefresh, executeQuery } from "../_shared/ms.mjs";

export async function handle(req, { env, db, fetch: rawFetch, now, queries }) {
  if (req.method === "OPTIONS") return preflight(req, env);
  if (req.method !== "POST") return json(req, env, 405, { error: "method" });
  const secret = req.headers.get("x-wall-pull-secret") || "";
  if (!env.WALL_PULL_SECRET || String(env.WALL_PULL_SECRET).length < 32 || !(await safeEqual(secret, env.WALL_PULL_SECRET))) {
    return json(req, env, 401, { error: "denied" });
  }
  const body = (await readJson(req, 1024)) || {};
  const mode = body.mode === "full" ? "full" : "check";
  const t0 = now();
  const run = { started_at: new Date(t0).toISOString(), mode, result: "STOPPED", reason: null, queries: 0, rows: 0, bytes: 0, at: null };
  const finish = async (status, extra) => {
    run.finished_at = new Date(now()).toISOString();
    run.ms = Math.round(now() - t0);
    const { skipped: _sk, note: _nt, ...row } = run; // the run table has no "skipped" or "note" column: the note is in reason and at
    try { await db.logRun(row); } catch (_) { /* the answer below still says what happened */ }
    return json(req, env, status, { result: run.result, reason: run.reason, at: run.at, queries: run.queries, rows: run.rows, dropped: run.dropped || 0, bytes: run.bytes, ms: run.ms, ...(run.skipped ? { skipped: run.skipped } : {}), ...(extra || {}) });
  };
  const stop = (reason, at) => { run.result = "STOPPED"; run.reason = reason; run.at = at || null; return finish(200); };

  const allow = checkAllowList(queries);
  if (!allow.ok) return stop(allow.reason, allow.at);
  if (!readerConfigOk(env)) return stop("READER_NOT_CONFIGURED");
  const f = guardedFetch(rawFetch);

  let rt;
  try { rt = await db.getReaderRefreshToken(); } catch (_) { return stop("DB_ERROR"); }
  if (!rt) return stop("NOT_CONNECTED");
  let tok;
  try { tok = await refreshAccess(env, f, rt); } catch (_) { return stop("TOKEN_REFRESH_FAILED"); }
  rt = null;
  if (!tok.ok) return stop(tok.code);
  if (tok.refresh) {
    try { await db.setReaderRefreshToken(tok.refresh); } catch (_) { return stop("DB_ERROR"); }
  }
  if (!accountOk(env, tok.access)) return stop("ACCOUNT_MISMATCH");

  let asOf;
  try { asOf = await latestRefresh(env, f, tok.access); } catch (_) { return stop("AS_OF_FAILED"); }
  if (!asOf.ok) return stop(asOf.code);
  let prev = null;
  try { prev = await db.getSnapshot(); } catch (_) { return stop("DB_ERROR"); }
  if (mode === "check" && prev && prev.data_as_of && Date.parse(prev.data_as_of) === Date.parse(asOf.asOf)) {
    run.result = "UNCHANGED";
    return finish(200);
  }

  const parts = [];
  run.dropped = 0;
  for (let qi = 0; qi < queries.length; qi++) {
    const q = queries[qi];
    if (q.proof === "pending") { run.skipped = (run.skipped || 0) + 1; continue; } // allow-list v2: not run until its proof read is recorded
    if ((await sha256Hex(q.dax)) !== q.sha256) return stop("QUERY_CHANGED", { query: qi }); // byte for byte the checked DAX
    let r;
    const t0q = now();
    try { r = await executeQuery(env, f, tok.access, q.dax); } catch (_) { return stop("QUERY_FAILED", { query: qi }); }
    const t1q = now();
    run.queries++;
    if (!r.ok) return stop("HTTP_" + r.status, { query: qi });
    const v = validateQueryResult(q, qi, r.text, { queryTimes: [t0q, t1q] });
    if (!v.ok) return stop(v.reason, v.at);
    run.rows += v.rows === undefined ? 1 : v.rows;
    // a label that differs from its pinned text: the pinned text is kept; the run row says LABEL_PINNED and where (never the text)
    if (v.notes && v.notes.length && !run.note) run.note = v.notes[0];
    run.dropped += v.dropped;
    parts.push({ page: q.page, figures: v.figures });
  }
  const built = buildSnapshot({ prevVersion: prev ? prev.version : 0, dataAsOf: asOf.asOf, fetchedAt: new Date(now()).toISOString(), parts });
  if (!built.ok) return stop(built.reason, built.at);
  try { await db.putSnapshot(built.snapshot); } catch (_) { return stop("DB_ERROR"); }
  run.result = "SUCCESS";
  if (run.note) { run.reason = run.note.code; run.at = { query: run.note.query, col: run.note.col }; }
  run.bytes = built.bytes;
  return finish(200, { version: built.snapshot.version });
}
