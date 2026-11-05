import type { Handle } from "@sveltejs/kit/hooks";
import { env } from "./lib/server/env";
import { SESSION_COOKIE, isPublicPath, verifySession } from "./lib/server/session";

/** Runs once at server start; a bad environment value stops the server here. */
export function init(): void {
  const e = env();
  if (e.ownerPassword !== null && e.sessionSecret === null) {
    throw new Error("OWNER_PASSWORD is set but SESSION_SECRET is not; set SESSION_SECRET to a long random string");
  }
}

export const handle: Handle = async ({ event, resolve }) => {
  const { ownerPassword, sessionSecret } = env();
  if (ownerPassword === null || sessionSecret === null) {
    event.locals.authed = true; // open mode
    return resolve(event);
  }
  event.locals.authed = verifySession(sessionSecret, event.cookies.get(SESSION_COOKIE));
  const { pathname, search } = event.url;
  if (event.locals.authed || isPublicPath(pathname)) return resolve(event);
  return new Response(null, {
    status: 303,
    headers: { location: `/login?next=${encodeURIComponent(pathname + search)}` },
  });
};
