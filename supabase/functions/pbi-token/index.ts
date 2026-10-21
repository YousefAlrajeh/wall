// ECC WALL v6 - Power BI token function, security fix (WS-wall21 step 2). Logic in handler.mjs.
// Same stored Microsoft link (vault rows "ms" / "ms_at") and same screen key as v5 (D-210, D-212).
// Secrets by name: PBI_TENANT, PBI_CLIENT, SCREEN_KEY, PBI_EXPECTED_OID (account check),
// WALL_REQUIRE_DEVICE ("1" = screens must be enrolled), WALL_ALLOWED_ORIGINS (optional).
// The v5 baseline is commit 7d2af4b (redeploy it to roll back).
import { handle } from "./handler.mjs";
import { makeDb } from "../_shared/rest.mjs";

const env = Deno.env.toObject();
const db = makeDb(env, fetch);
const mem = { at: null, rep: new Map() };
Deno.serve((req: Request) => handle(req, { env, db, fetch, now: () => Date.now(), mem }));
