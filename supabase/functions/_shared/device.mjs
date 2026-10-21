// device.mjs - the per-device secret check, shared by wall-feed now and by the
// fixed token function later (brief step 2-A).
// A screen is let in only when BOTH match: the unchanged screen key (D-212) and its own device secret.
// Only the sha256 of a device secret is ever stored (table wall_devices). Comparisons are constant-time.

// Screen ids allowed on the server. Must match wall-layout.js (3 rows x 7 columns).
export const SCREEN_ID_RE = /^R[1-3]C[1-7]$/;
export const DEVICE_SECRET_RE = /^[A-Za-z0-9_-]{43}$/; // 32 random bytes, base64url

export async function sha256Hex(text) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(text)));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Constant-time comparison of two strings of any length: both are hashed first,
// so the loop always runs over 64 characters whatever the inputs are.
export async function safeEqual(a, b) {
  const ha = await sha256Hex(a == null ? "" : a);
  const hb = await sha256Hex(b == null ? "" : b);
  let diff = 0;
  for (let i = 0; i < 64; i++) diff |= ha.charCodeAt(i) ^ hb.charCodeAt(i);
  return diff === 0 && a != null && b != null;
}

// Constant-time comparison of two 64-char hex digests.
export function hexEqual(ha, hb) {
  if (typeof ha !== "string" || typeof hb !== "string" || ha.length !== 64 || hb.length !== 64) return false;
  let diff = 0;
  for (let i = 0; i < 64; i++) diff |= ha.charCodeAt(i) ^ hb.charCodeAt(i);
  return diff === 0;
}

export function newDeviceSecret() {
  const b = crypto.getRandomValues(new Uint8Array(32));
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Returns {ok:true} or {ok:false, code}. The code is for logs only; callers answer "denied" either way.
export async function checkScreen(db, screen, screenKey, deviceSecret) {
  if (typeof screen !== "string" || !SCREEN_ID_RE.test(screen)) return { ok: false, code: "BAD_SCREEN" };
  const stored = await db.getScreenKey();
  const keyOk = await safeEqual(String(screenKey || ""), stored == null ? null : String(stored));
  const dev = await db.getDevice(screen);
  const given = DEVICE_SECRET_RE.test(String(deviceSecret || "")) ? await sha256Hex(deviceSecret) : "x";
  const devOk = !!dev && !dev.revoked_at && hexEqual(given, dev.secret_hash);
  if (!keyOk) return { ok: false, code: "BAD_KEY" };
  if (!devOk) return { ok: false, code: "BAD_DEVICE" };
  return { ok: true };
}

// Signed-in console admin: a valid Supabase session AND a row in wall_admins.
export async function checkAdmin(db, jwt) {
  if (!jwt) return { ok: false, code: "NO_SESSION" };
  const user = await db.getUser(jwt);
  if (!user || !user.id) return { ok: false, code: "NO_SESSION" };
  if (!(await db.isAdmin(user.id))) return { ok: false, code: "NOT_ADMIN" };
  return { ok: true, userId: user.id };
}
