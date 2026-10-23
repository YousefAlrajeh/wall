// Supabase entry for wall-reader-signin. The logic is in handler.mjs.
import { handle } from "./handler.mjs";
import { makeDb } from "../_shared/rest.mjs";

const env = Deno.env.toObject();
const db = makeDb(env, fetch);
Deno.serve((req: Request) => handle(req, { env, db, fetch, now: () => Date.now() }));
