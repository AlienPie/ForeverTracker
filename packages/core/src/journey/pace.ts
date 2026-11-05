/** Active play time per level. Pure, and never throws on odd data. */
import { plausibleTime, type Session } from "./sessions";

export type LevelUp = { t: number; level: number };
export type LevelPace = { level: number; seconds: number; complete: boolean };

/** A session counts for at least this long (matches `Session.seconds`). */
const MIN_SPAN = 60;

/**
 * Level-ups that can be trusted: plausible time, positive integer level,
 * one per level (the earliest time wins), sorted ascending by level.
 */
export function cleanLevelUps(levelUps: LevelUp[]): LevelUp[] {
  const byLevel = new Map<number, number>();
  for (const u of Array.isArray(levelUps) ? levelUps : []) {
    if (typeof u !== "object" || u === null) continue;
    const { t, level } = u;
    if (!plausibleTime(t) || !Number.isInteger(level) || level <= 0) continue;
    const prev = byLevel.get(level);
    if (prev === undefined || t < prev) byLevel.set(level, t);
  }
  return [...byLevel.entries()].map(([level, t]) => ({ t, level })).sort((a, b) => a.level - b.level);
}

/**
 * Seconds of active play at each level: the overlap of
 * `[start of the level, start of the next level)` with the sessions'
 * `[start, max(end, start + 60)]` spans, so time between sessions (an overnight
 * pause) is not counted. A level's start is the time of the level-up that reached it.
 * A level dinged at the end of a session of a minute or more and left at the very
 * start of the next one still shows 0: no play was recorded at that level.
 *
 * - Levels without a known start (below the first recorded level-up) are omitted.
 * - A completed level whose next level-up is missing (level 11 when 12 was never
 *   recorded but 13 was) has no known end and is omitted too.
 * - The highest recorded level is the current one (`complete: false`) and runs
 *   to the latest event time (the newest session end), capped at `now` when
 *   `now` is plausible; `now` never extends it.
 * - Sessions with implausible or reversed spans are ignored; seconds are never
 *   negative or NaN. Ascending by level.
 */
export function levelPace(levelUps: LevelUp[], sessions: Session[], now: number): LevelPace[] {
  const ups = cleanLevelUps(levelUps);
  const spans = (Array.isArray(sessions) ? sessions : [])
    .filter((s) => typeof s === "object" && s !== null && plausibleTime(s.start) && plausibleTime(s.end) && s.end >= s.start)
    // At least a minute per session, as in `Session.seconds`, so a level-up that
    // ends a one-event or very short session is not drawn as 0. Sessions are at
    // least the gap apart, so the padded spans do not overlap each other.
    .map((s) => [s.start, Math.max(s.end, s.start + MIN_SPAN)] as const);

  let latest = spans.reduce((m, [, end]) => Math.max(m, end), 0);
  if (plausibleTime(now)) latest = Math.min(latest, now);

  const active = (from: number, to: number): number => {
    if (!(to > from)) return 0;
    let total = 0;
    for (const [s, e] of spans) {
      const overlap = Math.min(e, to) - Math.max(s, from);
      if (overlap > 0) total += overlap;
    }
    return total;
  };

  const out: LevelPace[] = [];
  for (let i = 0; i < ups.length; i++) {
    const cur = ups[i]!;
    const next = ups[i + 1];
    if (!next) {
      out.push({ level: cur.level, seconds: active(cur.t, latest), complete: false });
    } else if (next.level === cur.level + 1) {
      out.push({ level: cur.level, seconds: active(cur.t, next.t), complete: true });
    }
  }
  return out;
}
