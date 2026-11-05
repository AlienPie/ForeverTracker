import { character, characterEvent, type Db } from "@ft/db";
import { and, asc, count, desc, eq } from "drizzle-orm";
import { levelOf, plausibleTime, type JourneyEvent } from "../journey/sessions";

export type JourneyData = {
  /** The newest events (capped), newest first. */
  events: JourneyEvent[];
  /** Every `level_up` event with a usable level, oldest first. */
  levelUps: { t: number; level: number }[];
  /** How many event rows are stored for the character (malformed ones included). */
  total: number;
};

/** How many events `getJourneyData` loads unless told otherwise. */
export const DEFAULT_JOURNEY_EVENTS = 3000;

const BAD = Symbol("bad json");

function parse(text: unknown): unknown {
  if (typeof text !== "string") return BAD;
  try {
    return JSON.parse(text);
  } catch {
    return BAD;
  }
}

/**
 * The Journey page's data, or null for an unknown guid: the newest
 * `opts.events` events (default {@link DEFAULT_JOURNEY_EVENTS}), every level-up
 * (a small set, so pace and route see levels older than the cap) and the stored
 * total. Rows whose data does not parse, or whose time is not a finite number,
 * are skipped; level-ups also need a plausible time and a positive integer level.
 */
export function getJourneyData(db: Db, guid: string, opts: { events?: number } = {}): JourneyData | null {
  const row = db.select({ guid: character.guid }).from(character).where(eq(character.guid, guid)).get();
  if (!row) return null;
  const n = opts.events;
  const limit = typeof n === "number" && Number.isInteger(n) && n > 0 ? n : DEFAULT_JOURNEY_EVENTS;

  const events: JourneyEvent[] = [];
  const rows = db
    .select()
    .from(characterEvent)
    .where(eq(characterEvent.guid, guid))
    .orderBy(desc(characterEvent.t), asc(characterEvent.kind), asc(characterEvent.data))
    .limit(limit)
    .all();
  for (const r of rows) {
    const data = parse(r.data);
    if (data === BAD || typeof r.t !== "number" || !Number.isFinite(r.t)) continue;
    events.push({ t: r.t, kind: r.kind, data });
  }

  const levelUps: { t: number; level: number }[] = [];
  const ups = db
    .select({ t: characterEvent.t, data: characterEvent.data })
    .from(characterEvent)
    .where(and(eq(characterEvent.guid, guid), eq(characterEvent.kind, "level_up")))
    .orderBy(asc(characterEvent.t), asc(characterEvent.data))
    .all();
  for (const u of ups) {
    const level = levelOf(parse(u.data));
    if (level !== null && plausibleTime(u.t)) levelUps.push({ t: u.t, level });
  }

  const total =
    rows.length < limit
      ? rows.length
      : (db.select({ n: count() }).from(characterEvent).where(eq(characterEvent.guid, guid)).get()?.n ?? rows.length);

  return { events, levelUps, total };
}
