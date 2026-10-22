// Supabase entry for wall-figures-pull. The logic is in handler.mjs; the allow-list in queries_v2.mjs (v2 = v1 + reads 179, 180 + events).
import { handle } from "./handler.mjs";
import { QUERIES } from "./queries_v2.mjs";
import { makeDb } from "../_shared/rest.mjs";

const env = Deno.env.toObject();
const db = makeDb(env, fetch);
Deno.serve((req: Request) => handle(req, { env, db, fetch, now: () => Date.now(), queries: QUERIES }));
