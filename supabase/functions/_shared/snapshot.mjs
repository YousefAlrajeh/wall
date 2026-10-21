// snapshot.mjs - strict checks for the wall's figures.
// Rule: expected columns only, numbers and short labels only, no name or free-text columns,
// size caps everywhere. Any surprise rejects the WHOLE snapshot; the last good one stays.
// Reasons carry codes and positions only, never data text.

export const LIMITS = {
  RESPONSE_BYTES: 262144,   // one Execute Queries answer
  SNAPSHOT_BYTES: 65536,    // the whole snapshot sent to screens
  LABEL_CHARS: 40,
  MAX_ROWS: 50,
  MAX_QUERIES: 40,
};

// Column names that suggest a person, an identifier or free text. Never allowed,
// whatever the allow-list says.
export const NAME_LIKE_RE =
  /(^|[^a-z])(names?|managers?|dispatchers?|contacts?|phones?|mobiles?|tel|mrn|medical records?|case ?(no|num|number|id)s?|concerns?|issues?|comments?|notes?|descr|descriptions?|e-?mails?|address(es)?|national ?ids?|iqama|passports?|red ?flags?|free ?text|remarks?|user|employee|staff ids?|doctor|nurse)([^a-z]|$)/i;

const PAGE_RE = /^[a-z0-9-]{1,32}$/;
const KEY_RE = /^[a-zA-Z][a-zA-Z0-9]{0,31}$/;
const COL_RE = /^[A-Za-z0-9_ ]{0,60}\[[A-Za-z0-9_ %()\/-]{1,60}\]$/;
const LABEL_RE = /^[\p{L}\p{N} &()\/.,'+%:-]+$/u;
const TYPES = new Set(["int", "num", "label"]);

function fail(reason, at) { return { ok: false, reason, at: at || {} }; }

// Checks the server's own allow-list before anything runs.
// Placeholders ("<<" ... ">>") mean the analyst has not filled it in yet.
export function checkAllowList(queries) {
  if (!Array.isArray(queries) || !queries.length || queries.length > LIMITS.MAX_QUERIES) return fail("ALLOWLIST_EMPTY");
  const ids = new Set();
  for (let qi = 0; qi < queries.length; qi++) {
    const q = queries[qi];
    const raw = JSON.stringify(q);
    if (raw.includes("<<")) return fail("NOT_CONFIGURED", { query: qi });
    if (!q || typeof q.id !== "string" || ids.has(q.id)) return fail("ALLOWLIST_BAD", { query: qi });
    ids.add(q.id);
    if (!PAGE_RE.test(q.page || "")) return fail("ALLOWLIST_BAD", { query: qi });
    if (typeof q.dax !== "string" || !/^\s*EVALUATE\s/i.test(q.dax) || q.dax.length > 20000) return fail("ALLOWLIST_BAD", { query: qi });
    if (q.shape !== "row" && q.shape !== "table") return fail("ALLOWLIST_BAD", { query: qi });
    if (q.shape === "table" && !(q.maxRows >= 1 && q.maxRows <= LIMITS.MAX_ROWS)) return fail("ALLOWLIST_BAD", { query: qi });
    if (q.shape === "table" && !KEY_RE.test(q.figure || "")) return fail("ALLOWLIST_BAD", { query: qi });
    const cols = Object.keys(q.columns || {});
    if (!cols.length || cols.length > 20) return fail("ALLOWLIST_BAD", { query: qi });
    const keys = new Set();
    for (let ci = 0; ci < cols.length; ci++) {
      const c = cols[ci], spec = q.columns[c];
      if (NAME_LIKE_RE.test(c) || NAME_LIKE_RE.test((spec && spec.key) || "")) return fail("ALLOWLIST_NAME_LIKE", { query: qi, col: ci });
      if (!COL_RE.test(c) || !spec || !KEY_RE.test(spec.key || "") || keys.has(spec.key) || !TYPES.has(spec.type)) return fail("ALLOWLIST_BAD", { query: qi, col: ci });
      keys.add(spec.key);
      if (spec.type !== "label" && !(isFinite(spec.min) && isFinite(spec.max) && spec.min <= spec.max)) return fail("ALLOWLIST_BAD", { query: qi, col: ci });
      if (spec.values && (!Array.isArray(spec.values) || spec.values.some((v) => typeof v !== "string" || v.length > LIMITS.LABEL_CHARS))) return fail("ALLOWLIST_BAD", { query: qi, col: ci });
    }
  }
  return { ok: true };
}

function checkValue(spec, v) {
  if (v === null || v === undefined) return spec.nullable ? null : "NULL_VALUE";
  if (spec.type === "int" || spec.type === "num") {
    if (typeof v !== "number" || !isFinite(v)) return "NOT_A_NUMBER";
    if (spec.type === "int" && !Number.isInteger(v)) return "NOT_AN_INTEGER";
    if (v < spec.min || v > spec.max) return "OUT_OF_RANGE";
    return null;
  }
  // label
  if (typeof v !== "string") return "BAD_LABEL";
  if (!v.length || v.length > LIMITS.LABEL_CHARS) return "BAD_LABEL";
  if (!LABEL_RE.test(v) || /\d{5,}/.test(v) || v.includes("@")) return "BAD_LABEL";
  if (spec.values && !spec.values.includes(v)) return "LABEL_NOT_ALLOWED";
  return null;
}

// Validates one Execute Queries answer (raw text) against its allow-list entry.
// Returns {ok:true, figures:{key:value}} or {ok:false, reason, at:{query,row,col}}.
export function validateQueryResult(q, qi, rawText) {
  if (typeof rawText !== "string") return fail("RESP_NOT_TEXT", { query: qi });
  if (rawText.length > LIMITS.RESPONSE_BYTES) return fail("RESP_TOO_BIG", { query: qi, len: rawText.length });
  let j;
  try { j = JSON.parse(rawText); } catch (_) { return fail("RESP_NOT_JSON", { query: qi }); }
  if (!j || !Array.isArray(j.results) || j.results.length !== 1) return fail("RESP_SHAPE", { query: qi });
  const res = j.results[0];
  if (!res || res.error) return fail("RESP_ERROR", { query: qi });
  if (!Array.isArray(res.tables) || res.tables.length !== 1) return fail("TABLE_COUNT", { query: qi });
  const rows = res.tables[0] && res.tables[0].rows;
  if (!Array.isArray(rows)) return fail("RESP_SHAPE", { query: qi });
  const max = q.shape === "row" ? 1 : q.maxRows;
  const min = q.shape === "row" ? 1 : 0;
  if (rows.length < min || rows.length > max) return fail("ROW_COUNT", { query: qi, rows: rows.length });
  const expected = Object.keys(q.columns);
  const out = [];
  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
    if (!row || typeof row !== "object" || Array.isArray(row)) return fail("RESP_SHAPE", { query: qi, row: ri });
    const got = Object.keys(row);
    for (let ci = 0; ci < got.length; ci++) {
      if (NAME_LIKE_RE.test(got[ci])) return fail("NAME_LIKE_COLUMN", { query: qi, row: ri, col: ci });
    }
    for (let ci = 0; ci < got.length; ci++) {
      if (!expected.includes(got[ci])) return fail("EXTRA_COLUMN", { query: qi, row: ri, col: ci });
    }
    for (let ci = 0; ci < expected.length; ci++) {
      if (!Object.prototype.hasOwnProperty.call(row, expected[ci])) return fail("MISSING_COLUMN", { query: qi, row: ri, col: ci });
    }
    const rec = {};
    for (let ci = 0; ci < expected.length; ci++) {
      const spec = q.columns[expected[ci]];
      const why = checkValue(spec, row[expected[ci]]);
      if (why) return fail(why, { query: qi, row: ri, col: ci });
      rec[spec.key] = row[expected[ci]] === undefined ? null : row[expected[ci]];
    }
    out.push(rec);
  }
  if (q.shape === "row") return { ok: true, figures: out[0] };
  return { ok: true, figures: { [q.figure]: out } };
}

// Any key or value that looks like a credential. Used on everything a screen receives.
const SECRET_KEY_RE = /token|secret|password|passwd|authori[sz]ation|bearer|refresh|verifier|device_?code|api_?key|apikey|cookie|session/i;
const SECRET_VAL_RE = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}|^[A-Za-z0-9._~+\/=-]{100,}$/;
export function findSecretLike(obj, path) {
  path = path || "$";
  if (obj === null || obj === undefined) return null;
  if (typeof obj === "string") return SECRET_VAL_RE.test(obj) ? path : null;
  if (typeof obj !== "object") return null;
  for (const k of Object.keys(obj)) {
    if (SECRET_KEY_RE.test(k)) return path + "." + k;
    const p = findSecretLike(obj[k], path + "." + k);
    if (p) return p;
  }
  return null;
}

// Builds and checks the final snapshot from validated parts.
export function buildSnapshot({ prevVersion, dataAsOf, fetchedAt, parts }) {
  const pages = {};
  for (const p of parts) {
    pages[p.page] = pages[p.page] || {};
    for (const [k, v] of Object.entries(p.figures)) {
      if (Object.prototype.hasOwnProperty.call(pages[p.page], k)) return fail("DUPLICATE_FIGURE");
      pages[p.page][k] = v;
    }
  }
  const snap = { version: (prevVersion || 0) + 1, data_as_of: dataAsOf, fetched_at: fetchedAt, pages };
  const text = JSON.stringify(snap);
  if (text.length > LIMITS.SNAPSHOT_BYTES) return fail("SNAPSHOT_TOO_BIG", { len: text.length });
  if (findSecretLike(snap)) return fail("SECRET_LIKE_CONTENT");
  return { ok: true, snapshot: snap, bytes: text.length };
}

// What a screen may receive: these four fields and nothing else.
export function screenView(snap) {
  if (!snap) return { version: 0, data_as_of: null, fetched_at: null, pages: {} };
  return { version: snap.version | 0, data_as_of: snap.data_as_of || null, fetched_at: snap.fetched_at || null, pages: snap.pages || {} };
}
