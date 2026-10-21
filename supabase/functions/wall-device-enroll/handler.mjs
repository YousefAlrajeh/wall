// wall-device-enroll - gives one screen PC its own device secret. Signed-in console admin only.
// The secret is returned ONCE to the admin's console, which turns it into that screen's one-time link;
// the player keeps it in the PC's own browser storage and removes it from the address bar.
// Only its sha256 is stored (wall_devices). Enrolling again replaces the old secret; "revoke" disables it.
// Shared with the token function fix (brief step 2-A), which checks the same table.
import { checkAdmin, newDeviceSecret, sha256Hex, SCREEN_ID_RE } from "../_shared/device.mjs";
import { json, preflight, readJson, bearer, originAllowed } from "../_shared/http.mjs";

export async function handle(req, { env, db }) {
  if (req.method === "OPTIONS") return preflight(req, env);
  if (!originAllowed(req, env)) return json(req, env, 403, { error: "denied" });
  if (req.method !== "POST") return json(req, env, 405, { error: "method" });
  let adm;
  try { adm = await checkAdmin(db, bearer(req)); } catch (_) { return json(req, env, 503, { error: "retry_later" }); }
  if (!adm.ok) return json(req, env, 403, { error: "denied" });
  const b = await readJson(req, 512);
  if (b && b.action === "list") { // which screens are enrolled (never the hashes)
    const rows = await db.listDevices();
    return json(req, env, 200, { devices: rows.map((r) => ({ screen: r.screen, enrolled_at: r.enrolled_at, revoked: !!r.revoked_at })) });
  }
  if (!b || typeof b.screen !== "string" || !SCREEN_ID_RE.test(b.screen)) return json(req, env, 400, { error: "bad_request" });
  if (b.action === "revoke") {
    await db.revokeDevice(b.screen);
    return json(req, env, 200, { screen: b.screen, revoked: true });
  }
  const secret = newDeviceSecret();
  await db.putDevice(b.screen, await sha256Hex(secret));
  return json(req, env, 200, { screen: b.screen, deviceSecret: secret });
}
