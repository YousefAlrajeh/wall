// snapshot.mjs - strict checks for the wall's figures (allow-list v1, D-231, checker_176 R1-R4; allow-list v2 additions below).
// Rules: every returned column must be a known column of its query (columns_v1), or the WHOLE
// snapshot is rejected; known columns outside the allow-list are dropped; each allowed column has its
// own check (number range, date, fixed text pattern, or the split list of next events);
// blank numbers are kept as null, which screens show as "No data for these dates".
// Any surprise rejects the whole snapshot; the last good one stays.
// Reasons carry codes and positions only, never data text.
// Allow-list v2 adds (WS-wall21 Phase 3): per-column role (store:false = checked, then dropped), whole numbers (int),
// cross-column rules (q.rules: 5-or-more cases, 1-4 counts, day windows, D-238 withheld names), one-table answers with
// many rows (q.table, e.g. one row per event), and q.proof ("pending" = the job does not run that query yet).

export const LIMITS = {
  RESPONSE_BYTES: 262144,   // one Execute Queries answer (proof run: about 2 KB each)
  SNAPSHOT_BYTES: 65536,    // the whole snapshot sent to screens
  TEXT_CHARS: 120,          // hard ceiling for any text column (fm_next_events)
  MAX_QUERIES: 10,
  MAX_COLUMNS: 200,
  DAX_CHARS: 65536,         // longest checked query: read 179 MT, 59,794 characters
  MAX_TABLE_ROWS: 500,      // ceiling for q.table.maxRows
};
const RULE_TYPES = new Set(["suppressed", "count", "day", "isToday", "withheld", "rowDates"]);
const PROOF_RE = /^(pending|[A-Za-z0-9_]{1,80})$/;

// Column names that suggest a person, an identifier or free text. Never allowed in the allow-list,
// and named as the reason when such a column turns up unexpectedly.
export const NAME_LIKE_RE =
  /(^|[^a-z])(names?|managers?|dispatchers?|contacts?|phones?|mobiles?|tel|mrn|medical records?|case ?(no|num|number|id)s?|concerns?|issues?|comments?|notes?|descr|descriptions?|e-?mails?|address(es)?|national ?ids?|iqama|passports?|red ?flags?|free ?text|remarks?|user|employee|staff ids?|doctor|nurse)([^a-z]|$)/i;

const PAGE_RE = /^[a-z0-9-]{1,32}$/;
const KEY_RE = /^[a-z][a-z0-9_]{0,63}$/;
const HEX64_RE = /^[0-9a-f]{64}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TYPES = new Set(["num", "date", "text", "list"]);

function fail(reason, at) { return { ok: false, reason, at: at || {} }; }

// the DAX may start with // comment lines; the first statement must be EVALUATE
function startsWithEvaluate(dax) {
  const lines = String(dax).split(/\r?\n/);
  for (const l of lines) {
    const t = l.trim();
    if (!t || t.startsWith("//")) continue;
    return /^EVALUATE(\s|$)/i.test(t);
  }
  return false;
}

// Checks the server's own allow-list before anything runs.
export function checkAllowList(queries) {
  if (!Array.isArray(queries) || !queries.length || queries.length > LIMITS.MAX_QUERIES) return fail("ALLOWLIST_EMPTY");
  const ids = new Set(), pages = new Set();
  for (let qi = 0; qi < queries.length; qi++) {
    const q = queries[qi];
    if (JSON.stringify(q).includes("<<")) return fail("NOT_CONFIGURED", { query: qi });
    if (!q || typeof q.id !== "string" || ids.has(q.id) || !PAGE_RE.test(q.page || "") || pages.has(q.page)) return fail("ALLOWLIST_BAD", { query: qi });
    ids.add(q.id); pages.add(q.page);
    if (typeof q.dax !== "string" || !startsWithEvaluate(q.dax) || q.dax.length > LIMITS.DAX_CHARS) return fail("ALLOWLIST_BAD", { query: qi });
    if (q.proof !== undefined && !PROOF_RE.test(String(q.proof))) return fail("ALLOWLIST_BAD", { query: qi });
    if (q.table !== undefined && !(q.table && Number.isInteger(q.table.maxRows) && q.table.maxRows >= 1 && q.table.maxRows <= LIMITS.MAX_TABLE_ROWS)) return fail("ALLOWLIST_BAD", { query: qi });
    if (!HEX64_RE.test(q.sha256 || "")) return fail("ALLOWLIST_BAD", { query: qi });
    if (!Array.isArray(q.known) || !q.known.length || q.known.length > LIMITS.MAX_COLUMNS || new Set(q.known).size !== q.known.length) return fail("ALLOWLIST_BAD", { query: qi });
    for (let ci = 0; ci < q.known.length; ci++) if (!KEY_RE.test(q.known[ci])) return fail("ALLOWLIST_BAD", { query: qi, col: ci });
    const keys = Object.keys(q.allow || {});
    if (!keys.length) return fail("ALLOWLIST_BAD", { query: qi });
    for (let ci = 0; ci < keys.length; ci++) {
      const k = keys[ci], s = q.allow[k];
      if (!q.known.includes(k)) return fail("ALLOWLIST_BAD", { query: qi, col: ci });
      if (NAME_LIKE_RE.test(k)) return fail("ALLOWLIST_NAME_LIKE", { query: qi, col: ci });
      if (!s || !TYPES.has(s.type)) return fail("ALLOWLIST_BAD", { query: qi, col: ci });
      if (s.type === "num" && !(isFinite(s.min) && isFinite(s.max) && s.min <= s.max)) return fail("ALLOWLIST_BAD", { query: qi, col: ci });
      if (s.store !== undefined && typeof s.store !== "boolean") return fail("ALLOWLIST_BAD", { query: qi, col: ci });
      if (s.type === "text" || s.type === "list") {
        if (!(s.max >= 1 && s.max <= LIMITS.TEXT_CHARS)) return fail("ALLOWLIST_BAD", { query: qi, col: ci });
        try { new RegExp(s.type === "text" ? s.pattern : s.part, "u"); } catch (_) { return fail("ALLOWLIST_BAD", { query: qi, col: ci }); }
        if (s.type === "list" && !(typeof s.sep === "string" && s.sep.length && s.maxParts >= 1 && s.maxParts <= 10)) return fail("ALLOWLIST_BAD", { query: qi, col: ci });
      }
    }
    if (!keys.some((k) => q.allow[k].store !== false)) return fail("ALLOWLIST_BAD", { query: qi });
    const rules = q.rules || [];
    if (!Array.isArray(rules)) return fail("ALLOWLIST_BAD", { query: qi });
    for (let ri = 0; ri < rules.length; ri++) {
      const r = rules[ri];
      if (!r || !RULE_TYPES.has(r.type)) return fail("ALLOWLIST_BAD", { query: qi, rule: ri });
      const refs = [r.value, r.n, r.flag, r.day, r.start, r.end].concat(r.keys || []).filter((x) => x !== undefined);
      if (!refs.length || refs.some((k) => !Object.prototype.hasOwnProperty.call(q.allow, k))) return fail("ALLOWLIST_BAD", { query: qi, rule: ri });
      if (r.type === "day" && !(Number.isInteger(r.min) && Number.isInteger(r.max) && r.min <= r.max)) return fail("ALLOWLIST_BAD", { query: qi, rule: ri });
      if ((r.type === "withheld" || r.type === "rowDates") && !q.table) return fail("ALLOWLIST_BAD", { query: qi, rule: ri });
    }
  }
  return { ok: true };
}

function validDate(v) {
  if (typeof v !== "string" || !DATE_RE.test(v)) return false;
  const d = new Date(v + "T00:00:00Z");
  return !isNaN(d) && d.toISOString().slice(0, 10) === v;
}
// shared text guard: no long digit runs, no phone number written with spaces, dots or dashes,
// no @, no line breaks
const SPACED_PHONE_RE = /\d(?:[\s.\-]?\d){6,}/;
function textGuard(v) { return !/\d{7,}/.test(v) && !SPACED_PHONE_RE.test(v) && !v.includes("@") && !/[\r\n\t]/.test(v); }

// one value -> [errorCode|null, storedValue]
function checkValue(s, v) {
  if (s.type === "num") {
    if (v === null || v === undefined) return s.nullable ? [null, null] : ["NULL_VALUE"];
    if (typeof v !== "number" || !isFinite(v)) return ["NOT_A_NUMBER"];
    if (v < s.min || v > s.max) return ["OUT_OF_RANGE"];
    if (s.int && !Number.isInteger(v)) return ["NOT_WHOLE"];
    return [null, v];
  }
  if (s.type === "date") {
    if (v === null || v === undefined || v === "") return s.nullable ? [null, null] : ["NULL_VALUE"];
    return validDate(v) ? [null, v] : ["BAD_DATE"];
  }
  if (v === null || v === undefined || v === "") return (s.emptyIsBlank || s.nullable) ? [null, null] : ["NULL_VALUE"];
  if (typeof v !== "string") return ["BAD_TEXT"];
  if (v.length > s.max || !textGuard(v)) return ["BAD_TEXT"];
  if (s.digitRun && new RegExp("[0-9]{" + (s.digitRun | 0) + ",}").test(v)) return ["BAD_TEXT"];
  if (s.type === "text") return new RegExp(s.pattern, "u").test(v) ? [null, v] : ["BAD_TEXT"];
  // list: split on the separator into at most maxParts items, each checked on its own
  const parts = v.split(s.sep);
  if (parts.length > s.maxParts) return ["TOO_MANY_PARTS"];
  const re = new RegExp(s.part, "u");
  for (const p of parts) if (!p.length || !re.test(p) || /\d{5,}/.test(p)) return ["BAD_LIST_ITEM"];
  return [null, v];
}

function isoDay(ms) { return new Date(ms).toISOString().slice(0, 10); }
function addDays(day, n) { return isoDay(Date.parse(day + "T00:00:00Z") + n * 86400000); }

// Validates one Execute Queries answer (raw text) against its allow-list entry.
// ctx.queryTimes = [msBefore, msAfter]: d_today must be the UTC date at query time (TODAY() in the service is UTC).
// Returns {ok:true, figures:{key:value}, dropped:n} or {ok:false, reason, at:{query,row,col}}.
export function validateQueryResult(q, qi, rawText, ctx) {
  if (typeof rawText !== "string") return fail("RESP_NOT_TEXT", { query: qi });
  if (rawText.length > LIMITS.RESPONSE_BYTES) return fail("RESP_TOO_BIG", { query: qi, len: rawText.length });
  let j;
  try { j = JSON.parse(rawText); } catch (_) { return fail("RESP_NOT_JSON", { query: qi }); }
  if (!j || !Array.isArray(j.results) || j.results.length !== 1) return fail("RESP_SHAPE", { query: qi });
  const res = j.results[0];
  if (!res || res.error) return fail("RESP_ERROR", { query: qi });
  if (!Array.isArray(res.tables) || res.tables.length !== 1) return fail("TABLE_COUNT", { query: qi });
  if (res.tables[0] && res.tables[0].error) return fail("RESP_ERROR", { query: qi });
  const rows = res.tables[0] && res.tables[0].rows;
  if (!Array.isArray(rows)) return fail("RESP_SHAPE", { query: qi });
  if (q.table ? rows.length > q.table.maxRows : rows.length !== 1) return fail("ROW_COUNT", { query: qi, rows: rows.length });
  const out = [];
  let dropped = 0;
  for (let ri = 0; ri < rows.length; ri++) {
    const v = checkRow(q, qi, q.table ? ri : undefined, rows[ri], ctx);
    if (!v.ok) return v;
    out.push(v.figures); dropped += v.dropped;
  }
  if (q.table) return { ok: true, figures: { rows: out }, dropped, rows: out.length };
  return { ok: true, figures: out[0], dropped };
}

// one answer row: exact known columns, each allowed column checked, the cross-column rules, then only "store" columns kept
function checkRow(q, qi, ri, row, ctx) {
  const at = (x) => (ri === undefined ? Object.assign({ query: qi }, x) : Object.assign({ query: qi, row: ri }, x));
  if (!row || typeof row !== "object" || Array.isArray(row)) return fail("RESP_SHAPE", at({ row: ri === undefined ? 0 : ri }));
  const got = Object.keys(row);
  if (got.length > LIMITS.MAX_COLUMNS) return fail("COLUMN_COUNT", at({ cols: got.length }));
  const byKey = {};
  for (let ci = 0; ci < got.length; ci++) {
    const m = got[ci].match(/^\[([^\[\]]{1,80})\]$/);       // Execute Queries form: [key]
    const k = m ? m[1] : null;
    if (k === null || !q.known.includes(k)) {
      return fail(NAME_LIKE_RE.test(got[ci]) ? "NAME_LIKE_COLUMN" : "UNKNOWN_COLUMN", at({ col: ci }));
    }
    byKey[k] = row[got[ci]];
  }
  const figures = {};
  const keys = Object.keys(q.allow);
  for (let ci = 0; ci < keys.length; ci++) {
    const k = keys[ci];
    if (!Object.prototype.hasOwnProperty.call(byKey, k)) return fail("MISSING_COLUMN", at({ col: ci }));
    const [why, val] = checkValue(q.allow[k], byKey[k]);
    if (why) return fail(why, at({ col: ci, len: typeof byKey[k] === "string" ? byKey[k].length : undefined }));
    figures[k] = val;
  }
  // dates: d_today = the UTC date when the query ran; the windows follow from it
  if (Object.prototype.hasOwnProperty.call(figures, "d_today")) {
    const t = ctx && ctx.queryTimes;
    if (!t || ![isoDay(t[0]), isoDay(t[1])].includes(figures.d_today)) return fail("DATE_NOT_TODAY", at({}));
    const d = figures.d_today;
    if (("d_w30_from" in figures && figures.d_w30_from !== addDays(d, -29)) ||
        ("d_b30_from" in figures && figures.d_b30_from !== addDays(d, -59)) ||
        ("d_b30_to" in figures && figures.d_b30_to !== addDays(d, -30))) return fail("DATE_WINDOW", at({}));
  }
  const rules = q.rules || [];
  for (let k = 0; k < rules.length; k++) {
    const why = ruleBroken(rules[k], figures);
    if (why) return fail(why, at({ rule: k }));
  }
  const kept = {};
  for (const k of keys) if (q.allow[k].store !== false) kept[k] = figures[k];
  return { ok: true, figures: kept, dropped: got.length - Object.keys(kept).length };
}

// the allow-list v2 cross-column rules; returns a reason code or null
function blank(v) { return v === null || v === undefined || v === ""; }
function ruleBroken(r, f) {
  const today = f.d_today;
  if (r.type === "suppressed") {        // a share or typical time: shown only with 5 or more cases behind it
    const v = f[r.value], n = f[r.n], fl = f[r.flag];
    if (!blank(n) && n > 0 && n < 5) return "SMALL_N_VISIBLE";
    if (fl === 1 && (!blank(v) || !blank(n))) return "SUPPRESSION";
    if (!blank(v) && (blank(n) || n < 5 || fl === 1)) return "SUPPRESSION";
    return null;
  }
  if (r.type === "count") {             // a count of cases: 1-4 never shown; flag 1 means blank
    const v = f[r.value], fl = f[r.flag];
    if (!blank(v) && v >= 1 && v <= 4) return "SMALL_COUNT";
    if (fl === 1 && !blank(v)) return "SUPPRESSION";
    return null;
  }
  if (r.type === "day") {               // the day of these values lies in its window; no day means no values
    const d = f[r.day];
    if (blank(d)) return (r.keys || []).some((k) => !blank(f[k])) ? "DAY_RULE" : null;
    if (blank(today) || d < addDays(today, r.min) || d > addDays(today, r.max)) return "DAY_RULE";
    return null;
  }
  if (r.type === "isToday") {
    const d = f[r.day], fl = f[r.flag];
    if (blank(d)) return blank(fl) || fl === 0 ? null : "DAY_RULE";
    return fl === (d === today ? 1 : 0) ? null : "DAY_RULE";
  }
  if (r.type === "withheld") {          // D-238: a withheld event keeps no name at all
    if (f[r.flag] === 1 && (r.keys || []).some((k) => !blank(f[k]))) return "NAME_NOT_WITHHELD";
    return null;
  }
  if (r.type === "rowDates") {          // an event running today: started on or before today, not ended before today
    const s = f[r.start], e = f[r.end];
    if (blank(today) || blank(s) || s > today || (!blank(e) && e < today)) return "DAY_RULE";
    return null;
  }
  return "RULE_UNKNOWN";
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
    if (pages[p.page]) return fail("DUPLICATE_PAGE");
    pages[p.page] = p.figures;
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
