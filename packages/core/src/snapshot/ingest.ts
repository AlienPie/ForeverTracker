import { character, characterEvent, snapshot, type Db } from "@ft/db";
import { parseSavedVariables, type LuaValue } from "@ft/savedvars";
import { eq } from "drizzle-orm";
import { SUPPORTED_SCHEMA } from "./types";

export type IngestSummary = {
  characters: number;
  stored: number;
  skipped: number;
  unsupported: number;
  /** characters whose processing threw; rolled back, others still processed */
  failed: number;
};

/** The uploaded file is not a ForeverTracker SavedVariables file. */
export class IngestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IngestError";
  }
}

function isObject(v: LuaValue | undefined): v is { [key: string]: LuaValue } {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

type Identity = { name: string | null; class: string | null; race: string | null; level: number | null };

/** Null-safe M0 extraction; returns null unless identity is a normal object. */
function extractIdentity(snap: { [key: string]: LuaValue }): Identity | null {
  const id = snap.identity;
  if (!isObject(id) || id.unavailable === true) return null;
  const str = (v: LuaValue | undefined) => (typeof v === "string" ? v : null);
  const num = (v: LuaValue | undefined) => (typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : null);
  return { name: str(id.name), class: str(id.class), race: str(id.race), level: num(id.level) };
}

/** JSON.stringify with object keys sorted, so equal data always yields equal text. */
function canonicalJson(v: LuaValue | undefined): string {
  const norm = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(norm);
    if (typeof x === "object" && x !== null) {
      return Object.fromEntries(
        Object.keys(x)
          .sort()
          .map((k) => [k, norm((x as Record<string, unknown>)[k])]),
      );
    }
    return x;
  };
  return JSON.stringify(norm(v ?? {}));
}

type EventRow = { t: number; kind: string; data: string };

/** Well-formed events from the addon's event log (array, or map if the parser kept keys). */
function extractEvents(entry: { [key: string]: LuaValue }): EventRow[] {
  const evs = entry.events;
  const list = Array.isArray(evs) ? evs : isObject(evs) ? Object.values(evs) : [];
  const out: EventRow[] = [];
  for (const ev of list) {
    if (!isObject(ev)) continue;
    if (typeof ev.t !== "number" || !Number.isFinite(ev.t)) continue;
    if (typeof ev.kind !== "string" || ev.kind === "") continue;
    out.push({ t: Math.trunc(ev.t), kind: ev.kind, data: canonicalJson(ev.data) });
  }
  return out;
}

export function ingestSavedVariables(db: Db, source: string, now: () => number = () => Math.floor(Date.now() / 1000)): IngestSummary {
  const root = parseSavedVariables(source).ForeverTrackerDB;
  if (!isObject(root)) throw new IngestError("File does not contain a ForeverTrackerDB table");

  const fileSchema = typeof root.schema === "number" && Number.isFinite(root.schema) ? root.schema : null;
  const unsupported = fileSchema === null || fileSchema > SUPPORTED_SCHEMA;
  const schemaColumn = fileSchema === null ? 0 : Math.trunc(fileSchema);

  const summary: IngestSummary = { characters: 0, stored: 0, skipped: 0, unsupported: 0, failed: 0 };
  const chars = isObject(root.characters) ? root.characters : {};

  for (const [guid, entry] of Object.entries(chars)) {
    const snap = isObject(entry) ? entry.snapshot : undefined;
    if (!isObject(snap) || typeof snap.takenAt !== "number" || !Number.isFinite(snap.takenAt)) {
      summary.skipped++;
      continue;
    }
    const takenAt = Math.trunc(snap.takenAt);
    const build = typeof snap.build === "string" ? snap.build : "";
    const raw = JSON.stringify(snap);
    const events = extractEvents(entry as { [key: string]: LuaValue });
    const extras = JSON.stringify(
      Object.fromEntries(Object.entries(entry as object).filter(([k]) => k !== "snapshot" && k !== "events")),
    );
    let inserted: boolean;
    try {
      inserted = db.transaction((tx) => {
      const existing = tx.select().from(character).where(eq(character.guid, guid)).get();
      const newest = !existing || takenAt > existing.latestTakenAt;
      const identity = unsupported || !newest ? null : extractIdentity(snap);

      // Events are facts: stored regardless of snapshot ordering, idempotent across uploads.
      for (const ev of events) {
        tx.insert(characterEvent).values({ guid, ...ev }).onConflictDoNothing().run();
      }

      if (!existing) {
        tx.insert(character)
          .values({
            guid,
            name: identity?.name ?? null,
            class: identity?.class ?? null,
            race: identity?.race ?? null,
            level: identity?.level ?? null,
            firstSeenAt: now(),
            latestTakenAt: takenAt,
            extras,
          })
          .run();
      } else if (newest) {
        tx.update(character)
          .set({
            latestTakenAt: takenAt,
            extras,
            name: identity?.name ?? existing.name,
            class: identity?.class ?? existing.class,
            race: identity?.race ?? existing.race,
            level: identity?.level ?? existing.level,
          })
          .where(eq(character.guid, guid))
          .run();
      }

      const res = tx
        .insert(snapshot)
        .values({ guid, takenAt, build, schema: schemaColumn, raw, unsupported })
        .onConflictDoNothing()
        .run();
      return res.changes > 0;
    });
    } catch {
      summary.failed++;
      continue;
    }
    summary.characters++;

    if (inserted) {
      summary.stored++;
      if (unsupported) summary.unsupported++;
    } else {
      summary.skipped++;
    }
  }
  return summary;
}
