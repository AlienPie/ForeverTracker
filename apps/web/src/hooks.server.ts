import type { Handle } from "@sveltejs/kit/hooks";
import { env } from "./lib/server/env";
import { SESSION_COOKIE, isAllowedOpenHost, isHostExemptPath, isPublicPath, verifySession } from "./lib/server/session";

/** HMAC keys shorter than this are guessable enough to forge session cookies offline. */
const MIN_SESSION_SECRET_LENGTH = 32;

/** Runs once at server start; a bad environment value stops the server here. */
export function init(): void {
  const e = env();
  if (e.ownerPassword === null) return;
  if (e.sessionSecret === null) {
    throw new Error(
      "OWNER_PASSWORD is set but SESSION_SECRET is not; set SESSION_SECRET to a random string (generate one with `openssl rand -base64 32`)",
    );
  }
  if (e.sessionSecret.length < MIN_SESSION_SECRET_LENGTH) {
    throw new Error(
      `SESSION_SECRET is shorter than ${MIN_SESSION_SECRET_LENGTH} characters; generate one with \`openssl rand -base64 32\``,
    );
  }
}

export const handle: Handle = async ({ event, resolve }) => {
  const { ownerPassword, sessionSecret, allowedHosts } = env();
  const { pathname, search, hostname } = event.url;
  if (ownerPassword === null) {
    // Open mode. adapter-node takes the origin from the Host header, so a
    // DNS-rebinding page would otherwise count as same-origin.
    if (!isHostExemptPath(pathname) && !isAllowedOpenHost(hostname, allowedHosts)) {
      return new Response("Forbidden: in open mode this server answers only to localhost (see ALLOWED_HOSTS)", {
        status: 403,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
    event.locals.authed = true;
    return resolve(event);
  }
  // Fail closed: a password without a secret is a misconfiguration init() refuses at boot.
  if (sessionSecret === null) {
    return new Response("Server misconfigured: SESSION_SECRET is not set", { status: 500 });
  }
  event.locals.authed = verifySession(sessionSecret, event.cookies.get(SESSION_COOKIE));
  if (event.locals.authed || isPublicPath(pathname)) return resolve(event);
  return new Response(null, {
    status: 303,
    headers: { location: `/login?next=${encodeURIComponent(pathname + search)}` },
  });
};
