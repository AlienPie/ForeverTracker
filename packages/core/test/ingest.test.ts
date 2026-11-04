import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { openDb, character, characterEvent, snapshot } from "@ft/db";
import { LuaParseError } from "@ft/savedvars";
import { describe, expect, test } from "vitest";
import { IngestError, ingestSavedVariables, SUPPORTED_SCHEMA } from "../src/index";

const FIXTURE = readFileSync(new URL("./fixtures/ForeverTracker.lua", import.meta.url), "utf8");
const A = "Player-1234-0A1B2C3D";
const B = "Player-1234-0F9E8D7C";
const NOW = () => 1_800_000_000;

function fresh() {
  return openDb(":memory:");
}

function single(guid: string, snap: string, schema: unknown = 1) {
  return `ForeverTrackerDB = { schema = ${schema}, characters = { ["${guid}"] = { snapshot = ${snap} } } }`;
}

describe("ingestSavedVariables", () => {
  test("stores one snapshot per character and creates character rows", () => {
    const db = fresh();
    const r = ingestSavedVariables(db, FIXTURE, NOW);
    expect(r).toEqual({ characters: 2, stored: 2, skipped: 0, unsupported: 0, failed: 0 });
    const snaps = db.select().from(snapshot).all();
    expect(snaps).toHaveLength(2);
    const a = snaps.find((s) => s.guid === A)!;
    expect(a.takenAt).toBe(1730000000);
    expect(a.build).toBe("1.60.1.70707");
    expect(a.schema).toBe(1);
    expect(a.unsupported).toBe(false);
    expect(JSON.parse(a.raw).state.equipped.HeadSlot).toBe(4320);
    const chars = db.select().from(character).all();
    expect(chars.map((c) => c.guid).sort()).toEqual([A, B].sort());
    const ca = chars.find((c) => c.guid === A)!;
    expect(ca.firstSeenAt).toBe(NOW());
    expect(ca.latestTakenAt).toBe(1730000000);
  });

  test("uploading the same file twice creates no duplicates", () => {
    const db = fresh();
    ingestSavedVariables(db, FIXTURE, NOW);
    const r = ingestSavedVariables(db, FIXTURE, NOW);
    expect(r).toEqual({ characters: 2, stored: 0, skipped: 2, unsupported: 0, failed: 0 });
    expect(db.select().from(snapshot).all()).toHaveLength(2);
    expect(db.select().from(character).all()).toHaveLength(2);
  });

  test("an older snapshot does not move latestTakenAt backwards", () => {
    const db = fresh();
    ingestSavedVariables(db, FIXTURE, NOW);
    const older = FIXTURE.replace("1730000000", "1720000000");
    const r = ingestSavedVariables(db, older, NOW);
    expect(r.stored).toBe(1);
    expect(r.skipped).toBe(1);
    const rows = db.select().from(snapshot).where(eq(snapshot.guid, A)).all();
    expect(rows.map((s) => s.takenAt).sort()).toEqual([1720000000, 1730000000]);
    const c = db.select().from(character).where(eq(character.guid, A)).get()!;
    expect(c.latestTakenAt).toBe(1730000000);
  });

  test("unavailable sections are stored raw and do not throw", () => {
    const db = fresh();
    const src = single(
      A,
      `{ takenAt = 10, build = "b", identity = { unavailable = true, reason = "nope" }, time = { unavailable = true, reason = "x" }, state = { unavailable = true, reason = "y" } }`,
    );
    const r = ingestSavedVariables(db, src, NOW);
    expect(r).toMatchObject({ characters: 1, stored: 1 });
    const raw = JSON.parse(db.select().from(snapshot).get()!.raw);
    expect(raw.time).toEqual({ unavailable: true, reason: "x" });
    // the fixture's second character has unavailable time and talents
    const db2 = fresh();
    expect(ingestSavedVariables(db2, FIXTURE, NOW).stored).toBe(2);
  });

  test("missing sections (no exploration key) are stored raw and do not throw", () => {
    const db = fresh();
    const r = ingestSavedVariables(db, FIXTURE, NOW);
    expect(r.stored).toBe(2);
    const b = db.select().from(snapshot).where(eq(snapshot.guid, B)).get()!;
    expect(JSON.parse(b.raw)).not.toHaveProperty("exploration");
  });

  test("schema newer than SUPPORTED_SCHEMA stores raw with unsupported=true and skips extraction", () => {
    const db = fresh();
    const src = FIXTURE.replace('["schema"] = 1', `["schema"] = ${SUPPORTED_SCHEMA + 1}`);
    const r = ingestSavedVariables(db, src, NOW);
    expect(r).toEqual({ characters: 2, stored: 2, skipped: 0, unsupported: 2, failed: 0 });
    const snaps = db.select().from(snapshot).all();
    expect(snaps.every((s) => s.unsupported && s.schema === 2)).toBe(true);
    const c = db.select().from(character).where(eq(character.guid, A)).get()!;
    expect(c.name).toBeNull();
    expect(c.level).toBeNull();
    expect(c.latestTakenAt).toBe(1730000000);
  });

  test("character row is updated from identity when available", () => {
    const db = fresh();
    ingestSavedVariables(db, FIXTURE, NOW);
    const a = db.select().from(character).where(eq(character.guid, A)).get()!;
    expect(a).toMatchObject({ name: "Thalindra", class: "MAGE", race: "Human", level: 34 });
    const newer = single(A, `{ takenAt = 1730005000, build = "b", identity = { name = "Thalindra", class = "MAGE", race = "Human", level = 35 } }`);
    ingestSavedVariables(db, newer, NOW);
    expect(db.select().from(character).where(eq(character.guid, A)).get()!.level).toBe(35);
    // an older snapshot must not overwrite newer identity
    const older = single(A, `{ takenAt = 5, build = "b", identity = { name = "Old", class = "MAGE", race = "Human", level = 1 } }`);
    ingestSavedVariables(db, older, NOW);
    const after = db.select().from(character).where(eq(character.guid, A)).get()!;
    expect(after).toMatchObject({ name: "Thalindra", level: 35, latestTakenAt: 1730005000 });
  });

  test("a snapshot for a GUID with no identity still creates the character row with null name", () => {
    const db = fresh();
    const r = ingestSavedVariables(db, single("Player-9-1", `{ takenAt = 42, build = "b" }`), NOW);
    expect(r.stored).toBe(1);
    const c = db.select().from(character).get()!;
    expect(c).toMatchObject({ guid: "Player-9-1", name: null, class: null, race: null, level: null, latestTakenAt: 42 });
  });

  test("an unavailable identity leaves the character fields null", () => {
    const db = fresh();
    ingestSavedVariables(db, single("Player-9-2", `{ takenAt = 42, identity = { unavailable = true, reason = "r" } }`), NOW);
    expect(db.select().from(character).get()!.name).toBeNull();
  });

  test("a missing ForeverTrackerDB table throws IngestError; parse errors propagate", () => {
    const db = fresh();
    expect(() => ingestSavedVariables(db, `Other = {}`, NOW)).toThrow(IngestError);
    expect(() => ingestSavedVariables(db, `ForeverTrackerDB = 5`, NOW)).toThrow(IngestError);
    expect(() => ingestSavedVariables(db, `ForeverTrackerDB = {`, NOW)).toThrow(LuaParseError);
  });

  test("absent or empty characters returns an all-zero summary", () => {
    const db = fresh();
    const zero = { characters: 0, stored: 0, skipped: 0, unsupported: 0, failed: 0 };
    expect(ingestSavedVariables(db, `ForeverTrackerDB = { schema = 1 }`, NOW)).toEqual(zero);
    expect(ingestSavedVariables(db, `ForeverTrackerDB = { schema = 1, characters = {} }`, NOW)).toEqual(zero);
  });

  test("a character with a missing or malformed snapshot is skipped without aborting others", () => {
    const db = fresh();
    const src = `ForeverTrackerDB = { schema = 1, characters = {
      ["bad1"] = { events = {} },
      ["bad2"] = { snapshot = { build = "b" } },
      ["bad3"] = { snapshot = { takenAt = "soon" } },
      ["good"] = { snapshot = { takenAt = 7, build = "b" } } } }`;
    const r = ingestSavedVariables(db, src, NOW);
    expect(r).toEqual({ characters: 1, stored: 1, skipped: 3, unsupported: 0, failed: 0 });
    expect(db.select().from(character).all().map((c) => c.guid)).toEqual(["good"]);
  });

  test("a non-numeric file schema is unsupported", () => {
    const db = fresh();
    const r = ingestSavedVariables(db, single("g", `{ takenAt = 1 }`, `"one"`), NOW);
    expect(r.unsupported).toBe(1);
    const s = db.select().from(snapshot).get()!;
    expect(s).toMatchObject({ schema: 0, unsupported: true, build: "" });
  });

  test("a DB failure for one character is counted as failed and does not lose the others", () => {
    const db = fresh();
    (db as unknown as { $client: { exec(sql: string): void } }).$client.exec(
      `CREATE TRIGGER boom BEFORE INSERT ON snapshot WHEN NEW.guid = '${B}' BEGIN SELECT RAISE(ABORT, 'boom'); END`,
    );
    const r = ingestSavedVariables(db, FIXTURE, NOW);
    expect(r).toEqual({ characters: 1, stored: 1, skipped: 0, unsupported: 0, failed: 1 });
    expect(db.select().from(snapshot).all().map((s) => s.guid)).toEqual([A]);
    expect(db.select().from(character).all().map((c) => c.guid)).toEqual([A]);
  });

  test("a DB failure rolls back that character's events too", () => {
    const db = fresh();
    (db as unknown as { $client: { exec(sql: string): void } }).$client.exec(
      `CREATE TRIGGER boom BEFORE INSERT ON snapshot WHEN NEW.guid = '${A}' BEGIN SELECT RAISE(ABORT, 'boom'); END`,
    );
    const r = ingestSavedVariables(db, FIXTURE, NOW);
    expect(r.failed).toBe(1);
    expect(db.select().from(characterEvent).all()).toEqual([]);
    expect(db.select().from(character).where(eq(character.guid, A)).all()).toEqual([]);
  });
});

function withEvents(guid: string, takenAt: number, events: string, extra = "") {
  return single(guid, `{ takenAt = ${takenAt}, build = "b" }`).replace(
    `{ snapshot = { takenAt = ${takenAt}, build = "b" } }`,
    `{ snapshot = { takenAt = ${takenAt}, build = "b" }, events = ${events}${extra} }`,
  );
}

describe("ingest of events and extras", () => {
  test("events are stored once and a re-upload adds none", () => {
    const db = fresh();
    ingestSavedVariables(db, FIXTURE, NOW);
    ingestSavedVariables(db, FIXTURE, NOW);
    const rows = db.select().from(characterEvent).all();
    expect(rows).toEqual([{ guid: A, t: 1729999000, kind: "level_up", data: '{"level":34}' }]);
  });

  test("uploads with disjoint events accumulate both sets", () => {
    const db = fresh();
    ingestSavedVariables(db, withEvents(A, 10, `{ { t = 1, kind = "a", data = { n = 1 } } }`), NOW);
    ingestSavedVariables(db, withEvents(A, 20, `{ { t = 2, kind = "b" } }`), NOW);
    const rows = db.select().from(characterEvent).all().sort((x, y) => x.t - y.t);
    expect(rows.map((r) => [r.t, r.kind, r.data])).toEqual([
      [1, "a", '{"n":1}'],
      [2, "b", "{}"],
    ]);
  });

  test("event data key order does not create duplicates", () => {
    const db = fresh();
    ingestSavedVariables(db, withEvents(A, 10, `{ { t = 1, kind = "a", data = { x = 1, y = 2 } } }`), NOW);
    ingestSavedVariables(db, withEvents(A, 11, `{ { t = 1, kind = "a", data = { y = 2, x = 1 } } }`), NOW);
    expect(db.select().from(characterEvent).all()).toHaveLength(1);
  });

  test("malformed events are skipped silently; empty events are fine", () => {
    const db = fresh();
    const evs = `{ { t = "x", kind = "a" }, { t = 1, kind = "" }, { t = 2 }, "junk", { t = 3, kind = "ok" } }`;
    const r = ingestSavedVariables(db, withEvents(A, 10, evs), NOW);
    expect(r.failed).toBe(0);
    expect(db.select().from(characterEvent).all().map((e) => e.kind)).toEqual(["ok"]);
    expect(ingestSavedVariables(fresh(), withEvents(A, 10, `{}`), NOW).stored).toBe(1);
  });

  test("extras holds visited and taxi (not snapshot/events) from the fixture", () => {
    const db = fresh();
    ingestSavedVariables(db, FIXTURE, NOW);
    const a = db.select().from(character).where(eq(character.guid, A)).get()!;
    const extras = JSON.parse(a.extras!);
    expect(Object.keys(extras).sort()).toEqual(["taxi", "visited"]);
    expect(extras.taxi).toEqual([3, 7]);
    expect(extras.visited["1434:Booty Bay"].mapId).toBe(1434);
    // character B has no extras keys: stored as an empty object
    expect(JSON.parse(db.select().from(character).where(eq(character.guid, B)).get()!.extras!)).toEqual({});
  });

  test("an older snapshot does not regress extras but its events are still stored", () => {
    const db = fresh();
    ingestSavedVariables(db, withEvents(A, 100, `{}`, `, taxi = { 1, 2, 3 }`), NOW);
    ingestSavedVariables(db, withEvents(A, 50, `{ { t = 9, kind = "old" } }`, `, taxi = { 1 }`), NOW);
    const c = db.select().from(character).where(eq(character.guid, A)).get()!;
    expect(JSON.parse(c.extras!)).toEqual({ taxi: [1, 2, 3] });
    expect(db.select().from(characterEvent).all().map((e) => e.kind)).toEqual(["old"]);
  });
});
