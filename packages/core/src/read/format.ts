const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Data younger than this is "fresh". */
export const FRESH_SECONDS = 2 * DAY;
/**
 * The addon stamps `takenAt` with the game client's clock; a client a little
 * ahead of the server must not turn a just-synced character into "unknown".
 * Anything further in the future than this is treated as a bogus timestamp.
 */
export const CLOCK_SKEW_SECONDS = 5 * MINUTE;

function wholeNonNegative(n: number): number {
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** Played time in seconds as "1 d 4 h" (a day or more), "11 h 20 m" or "5 m". */
export function formatPlayed(seconds: number): string {
  const s = wholeNonNegative(seconds);
  const d = Math.floor(s / DAY);
  const h = Math.floor((s % DAY) / HOUR);
  const m = Math.floor((s % HOUR) / MINUTE);
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${m} m`;
  return `${m} m`;
}

/** Money from copper as "18 g 34 s 20 c", omitting zero parts ("48 g"); "0 c" for nothing. */
export function formatMoney(copper: number): string {
  const c = wholeNonNegative(copper);
  const g = Math.floor(c / 10_000);
  const s = Math.floor((c % 10_000) / 100);
  const cu = c % 100;
  const parts: string[] = [];
  if (g > 0) parts.push(`${g.toLocaleString("en-US")} g`);
  if (s > 0) parts.push(`${s} s`);
  if (cu > 0) parts.push(`${cu} c`);
  return parts.length > 0 ? parts.join(" ") : "0 c";
}

/**
 * "fresh" under 2 days old, "stale" after; "unknown" when `takenAt` is 0,
 * non-finite, or in the future (beyond a small clock-skew allowance), so the
 * UI never shows "synced -3 minutes ago".
 */
export function staleness(takenAt: number, now: number): "fresh" | "stale" | "unknown" {
  if (!Number.isFinite(takenAt) || !Number.isFinite(now) || takenAt <= 0) return "unknown";
  if (takenAt > now + CLOCK_SKEW_SECONDS) return "unknown";
  return now - takenAt < FRESH_SECONDS ? "fresh" : "stale";
}
