import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "ft_session";
export const SESSION_MAX_AGE_S = 60 * 60 * 24 * 30;

const sign = (secret: string, payload: string) =>
  createHmac("sha256", secret).update(payload).digest("base64url");

/** `<expiryUnixSeconds>.<base64url HMAC-SHA256(secret, expiry)>`; `now` is epoch milliseconds. */
export function signSession(secret: string, now: number = Date.now()): string {
  const expiry = String(Math.floor(now / 1000) + SESSION_MAX_AGE_S);
  return `${expiry}.${sign(secret, expiry)}`;
}

/** Never throws; any malformed, tampered or expired value is simply false. */
export function verifySession(secret: string, cookie: string | undefined, now: number = Date.now()): boolean {
  if (!cookie || cookie.length > 256) return false;
  const parts = cookie.split(".");
  if (parts.length !== 2) return false;
  const [expiry, sig] = parts as [string, string];
  if (!/^\d{1,15}$/.test(expiry) || !sig) return false;
  const given = Buffer.from(sig);
  const expected = Buffer.from(sign(secret, expiry));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false;
  return Number(expiry) > Math.floor(now / 1000);
}

const sha256 = (s: string) => createHash("sha256").update(s).digest();

/** Timing-safe even for different lengths: both sides are hashed to 32 bytes first. */
export function checkPassword(expected: string, given: string): boolean {
  return timingSafeEqual(sha256(expected), sha256(given));
}

/** Only a same-origin path survives: a single leading `/`, never `//` or `/\`. */
export function safeNext(next: string | null | undefined): string {
  if (typeof next !== "string" || !next.startsWith("/")) return "/";
  if (next.startsWith("//") || next.startsWith("/\\") || /[\u0000-\u001f\\]/.test(next)) return "/";
  return next;
}

export const isPublicPath = (path: string): boolean =>
  path === "/login" ||
  path === "/api/health" ||
  path === "/api/ingest" ||
  path === "/favicon.ico" ||
  path.startsWith("/_app/");
