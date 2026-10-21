// rest.mjs - the database adapter the wall's functions use in Supabase.
// It talks to PostgREST and Auth with the service role (env SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// both provided by Supabase to every function). No external packages.
// The local harness replaces this whole object with an in-memory fake that has the same methods.

export function makeDb(env, fetchFn) {
  const base = String(env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const H = { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" };

  async function get(path) {
    const r = await fetchFn(base + "/rest/v1/" + path, { headers: H });
    if (r.status !== 200) throw new Error("DB_" + r.status);
    return r.json();
  }
  async function upsert(table, row, onConflict) {
    const r = await fetchFn(base + "/rest/v1/" + table + "?on_conflict=" + onConflict, {
      method: "POST", headers: { ...H, Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(row),
    });
    if (r.status >= 300) throw new Error("DB_" + r.status);
  }
  async function insert(table, row) {
    const r = await fetchFn(base + "/rest/v1/" + table, { method: "POST", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify(row) });
    if (r.status >= 300) throw new Error("DB_" + r.status);
  }
  async function del(path) {
    const r = await fetchFn(base + "/rest/v1/" + path, { method: "DELETE", headers: H });
    if (r.status >= 300) throw new Error("DB_" + r.status);
  }
  async function rpc(fn, args) {
    const r = await fetchFn(base + "/rest/v1/rpc/" + fn, { method: "POST", headers: H, body: JSON.stringify(args || {}) });
    if (r.status >= 300) throw new Error("DB_" + r.status);
    const t = await r.text();
    return t ? JSON.parse(t) : null;
  }

  return {
    async getScreenKey() {
      const rows = await get("settings?id=eq.main&select=screen_key");
      return rows.length ? rows[0].screen_key : null;
    },
    async getDevice(screen) {
      const rows = await get("wall_devices?screen=eq." + encodeURIComponent(screen) + "&select=secret_hash,revoked_at");
      return rows.length ? rows[0] : null;
    },
    async putDevice(screen, secretHash) {
      await upsert("wall_devices", { screen, secret_hash: secretHash, enrolled_at: new Date().toISOString(), revoked_at: null }, "screen");
    },
    async revokeDevice(screen) {
      await upsert("wall_devices", { screen, secret_hash: "0".repeat(64), revoked_at: new Date().toISOString() }, "screen");
    },
    async getSnapshot() {
      const rows = await get("wall_figures?id=eq.current&select=version,data_as_of,fetched_at,pages");
      return rows.length ? rows[0] : null;
    },
    async putSnapshot(s) {
      await upsert("wall_figures", { id: "current", ...s, updated_at: new Date().toISOString() }, "id");
    },
    async logRun(run) { await insert("wall_figures_runs", run); },
    async getLastRun() {
      const rows = await get("wall_figures_runs?select=finished_at,result,reason&order=finished_at.desc&limit=1");
      return rows.length ? rows[0] : null;
    },
    async getReaderRefreshToken() { return await rpc("wall_reader_token_get"); },
    async setReaderRefreshToken(t) { await rpc("wall_reader_token_set", { new_token: t }); },
    async hasReaderRefreshToken() { return !!(await rpc("wall_reader_token_exists")); },
    async getPending() {
      const rows = await get("wall_reader_pending?id=eq.main&select=device_code,expires_at,interval_s,started_by");
      return rows.length ? rows[0] : null;
    },
    async putPending(p) { await upsert("wall_reader_pending", { id: "main", ...p }, "id"); },
    async deletePending() { await del("wall_reader_pending?id=eq.main"); },
    async getUser(jwt) {
      const r = await fetchFn(base + "/auth/v1/user", { headers: { apikey: key, Authorization: "Bearer " + jwt } });
      if (r.status !== 200) return null;
      const u = await r.json();
      return u && u.id ? { id: u.id } : null;
    },
    async isAdmin(userId) {
      const rows = await get("wall_admins?user_id=eq." + encodeURIComponent(userId) + "&select=user_id");
      return rows.length === 1;
    },
    async upsertHealth(row) { await upsert("screen_health", row, "screen"); },
  };
}
