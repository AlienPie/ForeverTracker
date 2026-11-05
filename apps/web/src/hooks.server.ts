import { env } from "$lib/server/env";

/** Runs once at server start; a bad environment value stops the server here. */
export function init(): void {
  env();
}
