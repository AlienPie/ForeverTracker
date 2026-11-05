const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;

/** Elapsed seconds as "just now", "12 min ago", "2 hours ago" or "9 days ago". */
export function ago(seconds: number): string {
  const s = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  if (s < MINUTE) return "just now";
  if (s < HOUR) return `${Math.floor(s / MINUTE)} min ago`;
  if (s < DAY) return `${plural(Math.floor(s / HOUR), "hour")} ago`;
  return `${plural(Math.floor(s / DAY), "day")} ago`;
}

/**
 * Card sync line: "synced 12 min ago" when fresh, "no upload for 9 days"
 * (flagged stale) when stale, "sync time unknown" when the time is unusable.
 */
export function syncLabel(
  card: { takenAt: number; syncedAgo: "fresh" | "stale" | "unknown" },
  now: number,
): { text: string; stale: boolean } {
  if (card.syncedAgo === "unknown") return { text: "sync time unknown", stale: false };
  const elapsed = Math.max(0, now - card.takenAt);
  if (card.syncedAgo === "stale") {
    return { text: `no upload for ${plural(Math.floor(elapsed / DAY), "day")}`, stale: true };
  }
  return { text: `synced ${ago(elapsed)}`, stale: false };
}
