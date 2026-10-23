// Supabase entry for clock. The logic is in handler.mjs.
import { handle } from "./handler.mjs";

const env = Deno.env.toObject();
Deno.serve((req: Request) => handle(req, { env, now: () => Date.now() }));
