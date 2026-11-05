/** Play sessions built from the character's events. Pure, and never throws on odd data. */

/** One stored event (docs/addon-contract.md, "Event kinds"); `data` is the parsed JSON. */
export type StoredEvent = { t: number; kind: string; data: unknown };

export type Session = {
  /** unix seconds of the first and last event */
  start: number;
  end: number;
  /** `end - start`, at least 60 (a lone event still counts as a minute of play) */
  seconds: number;
  /** level before the session's lowest `level_up` (its level - 1); null without level-ups */
  levelFrom: number | null;
  /** highest level reached by the session's `level_up` events; null without level-ups */
  levelTo: number | null;
  /** number of `quest_turned_in` events */
  quests: number;
  /** `zone_first_visit` places, deduped by mapId+subzone, in the order reached */
  places: { mapId: number; subzone: string }[];
  /** profession names from `profession_changed.data.names` ("|" separated), deduped, first seen first */
  professions: string[];
  /** every event of the session, newest first (unknown kinds included) */
  events: StoredEvent[];
};

export const DEFAULT_SESSION_GAP = 1800;
const MIN_SESSION_SECONDS = 60;
/** Year 10000 in unix seconds: beyond it a time cannot be shown as a date. */
const MAX_PLAUSIBLE_T = 253_402_300_800;

type Obj = { [key: string]: unknown };
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * A unix time (seconds) that could be a real game time: finite, positive and
 * before year 10000 (the same rule as the web's `plausibleDate`).
 */
export function plausibleTime(t: unknown): t is number {
  return typeof t === "number" && Number.isFinite(t) && t > 0 && t < MAX_PLAUSIBLE_T;
}

/** A level from `level_up` data: a positive integer, else null. */
export function levelOf(data: unknown): number | null {
  const v = isObj(data) ? data.level : null;
  return typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null;
}

function summarise(ascending: StoredEvent[]): Session {
  const start = ascending[0]!.t;
  const end = ascending[ascending.length - 1]!.t;
  let levelFrom: number | null = null;
  let levelTo: number | null = null;
  let quests = 0;
  const places = new Map<string, { mapId: number; subzone: string }>();
  const professions = new Set<string>();

  for (const e of ascending) {
    const d = isObj(e.data) ? e.data : null;
    switch (e.kind) {
      case "level_up": {
        const level = levelOf(d);
        if (level === null) break;
        // min/max rather than first/last: same-second level-ups have no reliable order.
        levelFrom = levelFrom === null ? level - 1 : Math.min(levelFrom, level - 1);
        levelTo = levelTo === null ? level : Math.max(levelTo, level);
        break;
      }
      case "quest_turned_in":
        quests++;
        break;
      case "zone_first_visit": {
        const mapId = d?.mapId;
        if (typeof mapId !== "number" || !Number.isInteger(mapId) || mapId < 0) break;
        const subzone = typeof d?.subzone === "string" ? d.subzone : "";
        const key = `${mapId}:${subzone}`;
        if (!places.has(key)) places.set(key, { mapId, subzone });
        break;
      }
      case "profession_changed": {
        if (typeof d?.names !== "string") break;
        for (const n of d.names.split("|")) {
          const name = n.trim();
          if (name) professions.add(name);
        }
        break;
      }
      default:
        break;
    }
  }

  return {
    start,
    end,
    seconds: Math.max(MIN_SESSION_SECONDS, end - start),
    levelFrom,
    levelTo,
    quests,
    places: [...places.values()],
    professions: [...professions],
    events: [...ascending].reverse(),
  };
}

/**
 * Groups events into play sessions. Events are sorted by time first (input
 * order does not matter); a gap of `gapSeconds` (default 1800) or more starts a
 * new session, so with the default a 29:59 gap continues and 30:00 splits.
 * Events with an implausible time are ignored. Newest session first.
 */
export function buildSessions(events: StoredEvent[], opts: { gapSeconds?: number } = {}): Session[] {
  const g = opts.gapSeconds;
  const gap = typeof g === "number" && Number.isFinite(g) && g > 0 ? g : DEFAULT_SESSION_GAP;
  // Stable sort keeps same-second events in input order.
  const sorted = (Array.isArray(events) ? events : [])
    .filter((e) => isObj(e) && plausibleTime(e.t))
    .sort((a, b) => a.t - b.t);

  const out: Session[] = [];
  let group: StoredEvent[] = [];
  for (const e of sorted) {
    if (group.length > 0 && e.t - group[group.length - 1]!.t >= gap) {
      out.push(summarise(group));
      group = [];
    }
    group.push(e);
  }
  if (group.length > 0) out.push(summarise(group));
  return out.reverse();
}
