import type { ServerLoad } from "@sveltejs/kit";
import { env } from "../lib/server/env";

export const load: ServerLoad = () => ({ loginEnabled: env().ownerPassword !== null });
