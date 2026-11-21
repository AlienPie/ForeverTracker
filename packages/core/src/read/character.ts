import { character, characterEvent, hiddenPlace, manualCompletion, snapshot, type Db } from "@ft/db";
import { CONTINENT_MAP_IDS } from "../journey/route";
import { and, asc, count, desc, eq } from "drizzle-orm";
import type { Snapshot } from "../snapshot/types";
import { staleness } from "./format";

export type Profession = { skillLine: number; name: string; rank: number; max: number };
export type VisitedMap = { mapId: number; subzone: string; firstSeen: number };

export type CharacterCard = {
  guid: string;
  name: string;
  surname: string | null;
  class: string | null;
  race: string | null;
  level: number | null;
  /** 0-100, floored so a nearly full bar never reads 100 */
  xpPct: number | null;
  zone: string | null;
  /** copper */
  money: number | null;
  playedSeconds: number | null;
  takenAt: number;
  syncedAgo: "fresh" | "stale" | "unknown";
  professions: Profession[];
  questsCompleted: number;
  unsupported: boolean;
};

export type CharacterView = CharacterCard & {
  snapshot: Snapshot | null;
  questLogIds: number[];
  /** The game's completed quests plus the ones the owner marked by hand. */
  completedIds: number[];
  /** Marked by hand and not (yet) reported by the game, so the ones to label "marked by you". */
  manualIds: number[];
  /** uiMapId of the character's current map from `state.mapId`; null when absent. */
  mapId: number | null;
  /** Places visited, without continent maps and without the places the owner hid. */
  visitedMaps: VisitedMap[];
  /** Map ids the owner hid (see {@link hidePlace}), for the "hidden places" list. */
  hiddenMaps: number[];
  talents: { unspent: number } | null;
  /**
   * The newest events, newest first, capped by `GetCharacterOptions.events`
   * (default {@link DEFAULT_EVENT_LIMIT}); empty when events were not loaded.
   */
  events: { t: number; kind: string; data: unknown }[];
  /** How many events are stored in all; null when events were not loaded (`events: false`). */
  eventsTotal: number | null;
};

/** How many events `getCharacter` returns unless told otherwise. */
export const DEFAULT_EVENT_LIMIT = 200;

export type GetCharacterOptions = {
  /** Newest events to load (a positive count), or false to skip the event query. Default {@link DEFAULT_EVENT_LIMIT}. */
  events?: number | false;
};

/** Shown when no snapshot ever carried a name. */
export const UNKNOWN_NAME = "Unknown character";

type Obj = { [key: string]: unknown };
type CharacterRow = typeof character.$inferSelect;
type SnapshotRow = typeof snapshot.$inferSelect;

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function isObj(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** A normal object section, or null when missing, malformed or `{ unavailable = true }`. */
function section(v: unknown): Obj | null {
  return isObj(v) && v.unavailable !== true ? v : null;
}

/**
 * The Lua parser turns contiguous 1..n tables into arrays and keeps anything
 * else (including an empty `{}`) as an object, so list-like fields may arrive
 * as either. Missing or scalar values give an empty list.
 */
function list(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (isObj(v) && v.unavailable !== true) return Object.values(v);
  return [];
}

function str(v: unknown): string | null {
  return typeof v === "string" && v !== "" ? v : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function nonNegInt(v: unknown): number | null {
  const n = num(v);
  return n !== null && n >= 0 ? Math.trunc(n) : null;
}

function positiveIntId(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null;
}

function parseJson(text: string | null | undefined): unknown {
  if (typeof text !== "string") return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function xpPct(identity: Obj | null): number | null {
  if (!identity) return null;
  const xp = num(identity.xp);
  const max = num(identity.xpMax);
  if (xp === null || max === null || max <= 0 || xp < 0) return null;
  // Multiply first: (57 / 100) * 100 is 56.99999999999999 in floating point.
  return Math.min(100, Math.floor((xp * 100) / max));
}

function professions(progress: Obj | null): Profession[] {
  const out: Profession[] = [];
  for (const p of list(progress?.professions)) {
    if (!isObj(p)) continue;
    const name = str(p.name);
    const rank = nonNegInt(p.rank);
    const max = nonNegInt(p.max);
    if (name === null || rank === null || max === null) continue;
    out.push({ skillLine: nonNegInt(p.skillLine) ?? 0, name, rank, max });
  }
  return out;
}

function completedIds(progress: Obj | null): number[] {
  if (!progress) return [];
  const ids = new Set<number>();
  for (const v of list(progress.questsCompleted)) {
    const id = positiveIntId(v);
    if (id !== null) ids.add(id);
  }
  return [...ids].sort((a, b) => a - b);
}

function questLogIds(progress: Obj | null): number[] {
  if (!progress) return [];
  // A Set keeps first-seen order and stays linear on a huge (up to 8 MB) snapshot.
  const out = new Set<number>();
  for (const q of list(progress.questLog)) {
    const id = positiveIntId(isObj(q) ? q.id : q);
    if (id !== null) out.add(id);
  }
  return [...out];
}

function talents(progress: Obj | null): { unspent: number } | null {
  const t = section(progress?.talents);
  const unspent = nonNegInt(t?.unspent);
  return unspent === null ? null : { unspent };
}

/**
 * Places visited, merged from the persistent `visited` map kept beside the
 * snapshot (character.extras) and the snapshot's `exploration.visited`; deduped
 * by mapId+subzone keeping the earliest firstSeen, ordered by firstSeen.
 */
function visitedMaps(snap: Obj | null, extras: Obj | null): VisitedMap[] {
  const byKey = new Map<string, VisitedMap>();
  const sources = [list(extras?.visited), list(section(snap?.exploration)?.visited)];
  for (const src of sources) {
    for (const v of src) {
      if (!isObj(v)) continue;
      const mapId = nonNegInt(v.mapId);
      const firstSeen = nonNegInt(v.firstSeen);
      if (mapId === null || firstSeen === null) continue;
      const subzone = typeof v.subzone === "string" ? v.subzone : "";
      const key = `${mapId}:${subzone}`;
      const prev = byKey.get(key);
      if (!prev || firstSeen < prev.firstSeen) byKey.set(key, { mapId, subzone, firstSeen });
    }
  }
  return [...byKey.values()].sort(
    (a, b) => a.firstSeen - b.firstSeen || a.mapId - b.mapId || a.subzone.localeCompare(b.subzone),
  );
}

type Parsed = { card: CharacterCard; view: Omit<CharacterView, keyof CharacterCard | "events" | "eventsTotal"> };

/** Pure: build the card and view fields from stored rows. Never throws on odd data. */
function build(row: CharacterRow, snapRow: SnapshotRow | undefined, now: number, marked: number[] = [], hidden: number[] = []): Parsed {
  const unsupported = snapRow?.unsupported === true;
  // Unsupported schemas are stored but never interpreted (addon contract).
  const raw = snapRow && !unsupported ? parseJson(snapRow.raw) : null;
  const snap = isObj(raw) ? raw : null;
  const extras = unsupported ? null : (() => {
    const e = parseJson(row.extras);
    return isObj(e) ? e : null;
  })();

  const identity = section(snap?.identity);
  const time = section(snap?.time);
  const state = section(snap?.state);
  const progress = section(snap?.progress);

  const takenAt = snapRow?.takenAt ?? row.latestTakenAt;
  const game = completedIds(progress);
  const gameSet = new Set(game);
  const manualIds = marked.filter((id) => !gameSet.has(id)).sort((a, b) => a - b);
  const done = manualIds.length === 0 ? game : [...game, ...manualIds].sort((a, b) => a - b);

  const card: CharacterCard = {
    guid: row.guid,
    // The character row holds the newest known identity; ingest keeps the old
    // name when a newer snapshot lacks one, so it is the authority for name.
    name: row.name ?? UNKNOWN_NAME,
    surname: str(identity?.surname),
    class: row.class,
    race: row.race,
    level: row.level,
    xpPct: xpPct(identity),
    zone: str(state?.zone),
    money: nonNegInt(state?.money),
    // `played` was measured at `time.at`, possibly before takenAt (or even in an
    // earlier session when the login /played reply had not arrived yet). We do
    // not add `takenAt - at` or `now - at`: the gap may include offline time, and
    // an undercount by part of a session beats inventing played time.
    playedSeconds: nonNegInt(time?.played),
    takenAt,
    syncedAgo: staleness(takenAt, now),
    professions: professions(progress),
    questsCompleted: done.length,
    unsupported,
  };

  return {
    card,
    view: {
      snapshot: snap as Snapshot | null,
      questLogIds: questLogIds(progress),
      completedIds: done,
      manualIds,
      mapId: nonNegInt(state?.mapId),
      visitedMaps: visitedMaps(snap, extras).filter((v) => !CONTINENT_MAP_IDS.has(v.mapId) && !hidden.includes(v.mapId)),
      hiddenMaps: [...hidden].sort((a, b) => a - b),
      talents: talents(progress),
    },
  };
}

function newestSnapshot(db: Db, guid: string): SnapshotRow | undefined {
  return db.select().from(snapshot).where(eq(snapshot.guid, guid)).orderBy(desc(snapshot.takenAt)).limit(1).get();
}

/** Card for one stored character row (used by the roster). */
export function cardFor(db: Db, row: CharacterRow, now: number): CharacterCard {
  return build(row, newestSnapshot(db, row.guid), now, manualIdsFor(db, row.guid), hiddenMapsFor(db, row.guid)).card;
}

function manualIdsFor(db: Db, guid: string): number[] {
  return db.select({ id: manualCompletion.questId }).from(manualCompletion).where(eq(manualCompletion.guid, guid)).all().map((r) => r.id);
}

/** Map ids the owner hid for a character. */
export function hiddenMapsFor(db: Db, guid: string): number[] {
  return db.select({ id: hiddenPlace.mapId }).from(hiddenPlace).where(eq(hiddenPlace.guid, guid)).all().map((r) => r.id);
}

/** Hides a place (map id) from a stored character's visited list; false for an unknown character or a bad id. */
export function hidePlace(db: Db, guid: string, mapId: number, now: number = nowSeconds()): boolean {
  if (!Number.isSafeInteger(mapId) || mapId < 0) return false;
  if (!db.select().from(character).where(eq(character.guid, guid)).get()) return false;
  db.insert(hiddenPlace).values({ guid, mapId, hiddenAt: now }).onConflictDoNothing().run();
  return true;
}

/** Shows a hidden place again (a no-op when it is not hidden). */
export function unhidePlace(db: Db, guid: string, mapId: number): void {
  db.delete(hiddenPlace).where(and(eq(hiddenPlace.guid, guid), eq(hiddenPlace.mapId, mapId))).run();
}

/** Marks a quest completed by hand for a stored character; false for an unknown character or a bad id. */
export function markQuestCompleted(db: Db, guid: string, questId: number, now: number = nowSeconds()): boolean {
  if (!Number.isSafeInteger(questId) || questId <= 0) return false;
  if (!db.select().from(character).where(eq(character.guid, guid)).get()) return false;
  db.insert(manualCompletion).values({ guid, questId, markedAt: now }).onConflictDoNothing().run();
  return true;
}

/** Removes a manual mark (a no-op when there is none). */
export function unmarkQuestCompleted(db: Db, guid: string, questId: number): void {
  db.delete(manualCompletion).where(and(eq(manualCompletion.guid, guid), eq(manualCompletion.questId, questId))).run();
}

/** The newest `limit` events, newest first, and the stored total (counted only when the cap is hit). */
function newestEvents(db: Db, guid: string, limit: number): Pick<CharacterView, "events" | "eventsTotal"> {
  const events = db
    .select()
    .from(characterEvent)
    .where(eq(characterEvent.guid, guid))
    .orderBy(desc(characterEvent.t), asc(characterEvent.kind), asc(characterEvent.data))
    .limit(limit)
    .all()
    .map((e) => ({ t: e.t, kind: e.kind, data: parseJson(e.data) }));
  const eventsTotal =
    events.length < limit
      ? events.length
      : (db.select({ n: count() }).from(characterEvent).where(eq(characterEvent.guid, guid)).get()?.n ?? events.length);
  return { events, eventsTotal };
}

/**
 * Everything the character page needs, or null for an unknown guid. Events are
 * capped (see {@link GetCharacterOptions}); pass `{ events: false }` when the
 * caller does not show them.
 */
export function getCharacter(
  db: Db,
  guid: string,
  now: number = nowSeconds(),
  opts: GetCharacterOptions = {},
): CharacterView | null {
  const row = db.select().from(character).where(eq(character.guid, guid)).get();
  if (!row) return null;
  const { card, view } = build(row, newestSnapshot(db, guid), now, manualIdsFor(db, guid), hiddenMapsFor(db, guid));
  const limit = opts.events ?? DEFAULT_EVENT_LIMIT;
  const ev =
    limit === false
      ? { events: [], eventsTotal: null }
      : newestEvents(db, guid, Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_EVENT_LIMIT);
  return { ...card, ...view, ...ev };
}
