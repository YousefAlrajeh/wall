// Supabase entry for wall-feed. The logic is in handler.mjs (tested locally by the stand-in harness).
import { handle } from "./handler.mjs";
import { makeDb } from "../_shared/rest.mjs";

const env = Deno.env.toObject();
const db = makeDb(env, fetch);
Deno.serve((req: Request) => handle(req, { env, db, now: () => Date.now() }));
