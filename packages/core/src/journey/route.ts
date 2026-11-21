/** The route of places reached, for the Journey map. Pure, and never throws on odd data. */
import { cleanLevelUps, type LevelUp } from "./pace";
import { plausibleTime } from "./sessions";

export type RouteStop = {
  mapId: number;
  name: string;
  firstSeen: number;
  levelFrom: number | null;
  levelTo: number | null;
  current: boolean;
};
/** A level-up drawn after `stops[afterStop]`; -1 when it happened before the first returned stop. */
export type RouteMarker = { level: number; t: number; afterStop: number };
export type Route = { stops: RouteStop[]; earlier: number; markers: RouteMarker[] };

export const DEFAULT_ROUTE_STOPS = 8;

/**
 * Continent maps (Azeroth, Kalimdor, Eastern Kingdoms). The game reports these while flying or on a ship,
 * so they are never counted as a place the character explored.
 */
export const CONTINENT_MAP_IDS: ReadonlySet<number> = new Set([947, 1414, 1415]);

function safeName(nameOf: (mapId: number) => string | null, mapId: number): string {
  try {
    const n = nameOf(mapId);
    if (typeof n === "string" && n.trim()) return n;
  } catch {
    // fall through to the placeholder
  }
  return `Map ${mapId}`;
}

/** Index of the last element of ascending `xs` that is <= t, or -1. */
function lastAtOrBefore(xs: number[], t: number): number {
  let lo = 0;
  let hi = xs.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (xs[mid]! <= t) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

/**
 * Distinct maps in the order first reached (subzones of one map merge into one
 * stop at its earliest `firstSeen`; ties by mapId). Only the newest `max`
 * (default 8) stops are kept, `earlier` counts the ones dropped, and the latest
 * stop is `current`.
 *
 * Levels: `levelFrom` is the level at the stop's first time seen. `levelTo` is
 * the level at its last time seen, which is the later of its newest subzone's
 * `firstSeen` and the moment before the next stop was first reached (the
 * character was still there until then); for the current stop it is the latest
 * known level. A level at a time is the highest level-up at or before it, null
 * when none is known.
 *
 * Markers: each level-up (deduped by level, earliest wins) placed after the
 * stop that was current when it happened, as an index into the returned
 * stops; -1 when that stop was dropped or the level-up came before any stop.
 * Ascending by time. Unnamed maps are `Map <id>`. Continent maps are left out.
 *
 * `opts.currentMapId`: the map the character is on now. When it is one of the kept stops, that stop is
 * `current` (and runs to the latest known level) instead of the last stop first reached; when it is a
 * stop that was dropped as earlier, no stop is current; otherwise the last stop is.
 */
export function routeFromVisited(
  visited: { mapId: number; subzone: string; firstSeen: number }[],
  levelUps: LevelUp[],
  nameOf: (mapId: number) => string | null,
  opts: { max?: number; currentMapId?: number | null } = {},
): Route {
  const m = opts.max;
  const max = typeof m === "number" && Number.isInteger(m) && m > 0 ? m : DEFAULT_ROUTE_STOPS;

  const maps = new Map<number, { first: number; last: number }>();
  for (const v of Array.isArray(visited) ? visited : []) {
    if (typeof v !== "object" || v === null) continue;
    const { mapId, firstSeen } = v;
    if (!Number.isInteger(mapId) || mapId < 0 || CONTINENT_MAP_IDS.has(mapId) || !plausibleTime(firstSeen)) continue;
    const prev = maps.get(mapId);
    if (!prev) maps.set(mapId, { first: firstSeen, last: firstSeen });
    else {
      prev.first = Math.min(prev.first, firstSeen);
      prev.last = Math.max(prev.last, firstSeen);
    }
  }
  if (maps.size === 0) return { stops: [], earlier: 0, markers: [] };

  const all = [...maps.entries()]
    .map(([mapId, s]) => ({ mapId, ...s }))
    .sort((a, b) => a.first - b.first || a.mapId - b.mapId);

  // Level-ups by time; the level at a time is the highest reached by then.
  const ups = cleanLevelUps(levelUps).sort((a, b) => a.t - b.t || a.level - b.level);
  const upTimes = ups.map((u) => u.t);
  const runningMax: number[] = [];
  for (const u of ups) runningMax.push(Math.max(runningMax[runningMax.length - 1] ?? 0, u.level));
  const levelAt = (t: number): number | null => {
    const i = lastAtOrBefore(upTimes, t);
    return i < 0 ? null : runningMax[i]!;
  };
  const latestLevel = runningMax.length > 0 ? runningMax[runningMax.length - 1]! : null;

  const earlier = Math.max(0, all.length - max);
  const here = opts.currentMapId;
  const hereIndex = typeof here === "number" ? all.findIndex((s) => s.mapId === here) : -1;
  const currentIndex = hereIndex < 0 ? all.length - 1 : hereIndex < earlier ? -1 : hereIndex;
  const stops: RouteStop[] = [];
  for (let i = earlier; i < all.length; i++) {
    const s = all[i]!;
    const next = all[i + 1];
    const current = i === currentIndex;
    // Revisits: a later subzone of this map first seen after the next stop was
    // reached makes `s.last` exceed `next.first`; the range then runs to that revisit.
    const lastSeen = next ? Math.max(s.last, next.first - 1) : s.last;
    stops.push({
      mapId: s.mapId,
      name: safeName(nameOf, s.mapId),
      firstSeen: s.first,
      levelFrom: levelAt(s.first),
      levelTo: current ? latestLevel : levelAt(lastSeen),
      current,
    });
  }

  const firsts = all.map((s) => s.first);
  const markers: RouteMarker[] = ups.map((u) => {
    const i = lastAtOrBefore(firsts, u.t);
    return { level: u.level, t: u.t, afterStop: i < earlier ? -1 : i - earlier };
  });

  return { stops, earlier, markers };
}
