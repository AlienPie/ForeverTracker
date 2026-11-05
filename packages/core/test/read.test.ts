import { readFileSync } from "node:fs";
import { character, characterEvent, openDb, snapshot } from "@ft/db";
import { describe, expect, test } from "vitest";
import { formatMoney, formatPlayed, getCharacter, getRoster, ingestSavedVariables, staleness } from "../src/index";

const ROSTER = readFileSync(new URL("./fixtures/Roster.lua", import.meta.url), "utf8");
const M = "Player-4321-00000A01";
const Q = "Player-4321-00000B02";
const NOW = 1_800_000_000;
const DAY = 86_400;

function fresh() {
  return openDb(":memory:");
}

function load(src: string) {
  const db = fresh();
  ingestSavedVariables(db, src, () => NOW);
  return db;
}

function single(guid: string, snap: string, schema: unknown = 1, extra = "") {
  return `ForeverTrackerDB = { schema = ${schema}, characters = { ["${guid}"] = { snapshot = ${snap}${extra} } } }`;
}

describe("format helpers", () => {
  test("formatPlayed", () => {
    expect(formatPlayed(40800)).toBe("11 h 20 m");
    expect(formatPlayed(DAY + 4 * 3600 + 59)).toBe("1 d 4 h");
    expect(formatPlayed(300)).toBe("5 m");
    expect(formatPlayed(0)).toBe("0 m");
    expect(formatPlayed(-5)).toBe("0 m");
    expect(formatPlayed(Number.NaN)).toBe("0 m");
  });

  test("formatMoney takes copper", () => {
    expect(formatMoney(480000)).toBe("48 g");
    expect(formatMoney(183420)).toBe("18 g 34 s 20 c");
    expect(formatMoney(2550)).toBe("25 s 50 c");
    expect(formatMoney(0)).toBe("0 c");
    expect(formatMoney(12_345_670_000)).toBe("1,234,567 g");
    expect(formatMoney(-1)).toBe("0 c");
  });

  test("staleness: fresh under 2 days, stale after, unknown for 0 or future", () => {
    expect(staleness(NOW - 60, NOW)).toBe("fresh");
    expect(staleness(NOW - 2 * DAY + 1, NOW)).toBe("fresh");
    expect(staleness(NOW - 2 * DAY, NOW)).toBe("stale");
    expect(staleness(0, NOW)).toBe("unknown");
    expect(staleness(NOW + DAY, NOW)).toBe("unknown");
    expect(staleness(Number.NaN, NOW)).toBe("unknown");
  });
});

describe("getRoster / getCharacter", () => {
  test("(a) card from a full fixture has xpPct 62, formatted values and professions", () => {
    const db = load(ROSTER);
    const c = getCharacter(db, M, NOW)!;
    expect(c.name).toBe("Merrowyn");
    expect(c.class).toBe("SHAMAN");
    expect(c.race).toBe("Dwarf");
    expect(c.level).toBe(23);
    expect(c.xpPct).toBe(62);
    expect(c.zone).toBe("Wetlands");
    expect(c.money).toBe(480000);
    expect(formatMoney(c.money!)).toBe("48 g");
    expect(c.playedSeconds).toBe(40800);
    expect(formatPlayed(c.playedSeconds!)).toBe("11 h 20 m");
    expect(c.takenAt).toBe(1799990000);
    expect(c.syncedAgo).toBe("fresh");
    expect(c.professions).toEqual([
      { skillLine: 186, name: "Mining", rank: 120, max: 150 },
      { skillLine: 393, name: "Skinning", rank: 95, max: 150 },
    ]);
    expect(c.questsCompleted).toBe(5);
    expect(c.completedIds).toEqual([1, 2, 3, 4, 5]);
    expect(c.questLogIds).toEqual([575, 288]);
    expect(c.mapId).toBe(1437);
    expect(c.talents).toEqual({ unspent: 2 });
    expect(c.unsupported).toBe(false);
    expect(c.snapshot?.takenAt).toBe(1799990000);
    expect(c.visitedMaps).toEqual([
      { mapId: 1426, subzone: "Kharanos", firstSeen: 1799000000 },
      { mapId: 1437, subzone: "Menethil Harbor", firstSeen: 1799980000 },
    ]);
    expect(c.events.map((e) => e.t)).toEqual([1799500000, 1799000000]);
    expect(c.events[0]).toEqual({ t: 1799500000, kind: "level_up", data: { level: 23 } });
    expect(c.eventsTotal).toBe(2);
  });

  test("xpPct is an exact floored percentage, capped at 100", () => {
    const pct = (xp: number, xpMax: number) => {
      const g = `Player-9-xp-${xp}-${xpMax}`;
      const db = load(single(g, `{ takenAt = ${NOW - 100}, identity = { name = "Vexa", xp = ${xp}, xpMax = ${xpMax} } }`));
      return getCharacter(db, g, NOW)!.xpPct;
    };
    expect(pct(57, 100)).toBe(57);
    expect(pct(29, 100)).toBe(29);
    expect(pct(150, 100)).toBe(100);
    expect(pct(999, 1000)).toBe(99);
  });

  test("empty Lua tables ({} objects) give empty lists and zero counts", () => {
    const db = load(ROSTER);
    const c = getCharacter(db, Q, NOW)!;
    expect(c.professions).toEqual([]);
    expect(c.questsCompleted).toBe(0);
    expect(c.completedIds).toEqual([]);
    expect(c.questLogIds).toEqual([]);
    expect(c.talents).toBeNull();
    expect(c.surname).toBeNull();
    expect(c.events).toEqual([]);
    expect(c.syncedAgo).toBe("stale"); // fixture is ~11.5 days before NOW
  });

  test("(b) identity unavailable still yields a card with null fields", () => {
    const db = load(
      single(
        "Player-9-1",
        `{ takenAt = ${NOW - 100}, identity = { unavailable = true, reason = "r" }, time = { unavailable = true, reason = "p" },
           state = { unavailable = true, reason = "s" }, progress = { unavailable = true, reason = "x" },
           exploration = { unavailable = true, reason = "m" } }`,
      ),
    );
    const c = getCharacter(db, "Player-9-1", NOW)!;
    expect(c).not.toBeNull();
    expect(typeof c.name).toBe("string");
    expect(c.mapId).toBeNull();
    expect(c.surname).toBeNull();
    expect(c.class).toBeNull();
    expect(c.race).toBeNull();
    expect(c.level).toBeNull();
    expect(c.xpPct).toBeNull();
    expect(c.zone).toBeNull();
    expect(c.money).toBeNull();
    expect(c.playedSeconds).toBeNull();
    expect(c.professions).toEqual([]);
    expect(c.questsCompleted).toBe(0);
    expect(c.talents).toBeNull();
    expect(c.visitedMaps).toEqual([]);
    expect(getRoster(db, NOW).characters).toHaveLength(1);
  });

  test("garbage inside sections never throws", () => {
    const db = load(
      single(
        "Player-9-3",
        `{ takenAt = ${NOW - 100}, identity = { name = 5, level = "x", xp = 10, xpMax = 0 }, time = { played = "lots" },
           state = { zone = {}, money = -5 }, progress = { professions = { 1, "two", { name = "Herbalism" } },
           questsCompleted = { "a", 7, -1, 7.5 }, questLog = { 3, { id = 4 }, { id = "x" } }, talents = { unspent = "z" } },
           exploration = { visited = "nope" } }`,
      ),
    );
    const c = getCharacter(db, "Player-9-3", NOW)!;
    expect(c.xpPct).toBeNull();
    expect(c.zone).toBeNull();
    expect(c.money).toBeNull();
    expect(c.playedSeconds).toBeNull();
    expect(c.professions).toEqual([]);
    expect(c.completedIds).toEqual([7]);
    expect(c.questLogIds).toEqual([3, 4]);
    expect(c.talents).toBeNull();
    expect(c.visitedMaps).toEqual([]);
  });

  test("(c) an unsupported snapshot row yields unsupported: true and no throw", () => {
    const db = load(single("Player-9-2", `{ takenAt = ${NOW - 100}, identity = { name = "Vexa", level = 9 } }`, 2));
    const c = getCharacter(db, "Player-9-2", NOW)!;
    expect(c.unsupported).toBe(true);
    expect(c.snapshot).toBeNull();
    expect(c.level).toBeNull();
    expect(c.professions).toEqual([]);
    const r = getRoster(db, NOW);
    expect(r.characters[0]!.unsupported).toBe(true);
  });

  test("(d) visited = {} (empty object) gives visitedMaps []", () => {
    const db = load(
      single("Player-9-4", `{ takenAt = ${NOW - 100}, exploration = { visited = {} } }`, 1, `, visited = {}, events = {}`),
    );
    expect(getCharacter(db, "Player-9-4", NOW)!.visitedMaps).toEqual([]);
  });

  test("(e) takenAt 0 and a future takenAt give unknown", () => {
    const db = fresh();
    ingestSavedVariables(db, single("Player-9-5", `{ takenAt = 0 }`), () => NOW);
    ingestSavedVariables(db, single("Player-9-6", `{ takenAt = ${NOW + DAY} }`), () => NOW);
    expect(getCharacter(db, "Player-9-5", NOW)!.syncedAgo).toBe("unknown");
    expect(getCharacter(db, "Player-9-6", NOW)!.syncedAgo).toBe("unknown");
    const old = load(single("Player-9-7", `{ takenAt = ${NOW - 5 * DAY} }`));
    expect(getCharacter(old, "Player-9-7", NOW)!.syncedAgo).toBe("stale");
  });

  test("(f) surname is read from the raw snapshot; name stays the stored name", () => {
    const db = load(ROSTER);
    const c = getCharacter(db, M, NOW)!;
    expect(c.surname).toBe("of the Vale");
    expect(c.name).toBe("Merrowyn");
    // Newest identity carries a surname but no name: the stored name is kept.
    const db2 = load(single("Player-9-8", `{ takenAt = ${NOW - 100}, identity = { name = "Torvald", level = 3 } }`));
    ingestSavedVariables(
      db2,
      single("Player-9-8", `{ takenAt = ${NOW - 50}, identity = { surname = "Ashborne", level = 4 } }`),
      () => NOW,
    );
    const t = getCharacter(db2, "Player-9-8", NOW)!;
    expect(t.name).toBe("Torvald");
    expect(t.surname).toBe("Ashborne");
    expect(t.level).toBe(4);
  });

  test("(g) roster totals add up and order is newest first", () => {
    const db = load(ROSTER);
    ingestSavedVariables(db, single("Player-9-9", `{ takenAt = ${NOW - 10}, time = { unavailable = true, reason = "p" } }`), () => NOW);
    const r = getRoster(db, NOW);
    expect(r.characters.map((c) => c.guid)).toEqual(["Player-9-9", M, Q]);
    expect(r.totals).toEqual({ count: 3, playedSeconds: 40800 + 7200, money: 480000 + 2550 });
  });

  test("an empty database gives an empty roster", () => {
    expect(getRoster(fresh(), NOW)).toEqual({ characters: [], totals: { count: 0, playedSeconds: 0, money: 0 } });
  });

  test("a huge questLog dedupes in linear time, keeping first-seen order", () => {
    const db = fresh();
    const g = "Player-9-big";
    // 200k entries: 100k distinct ids (half as { id }), each twice, plus odd values.
    const log: unknown[] = [];
    for (let i = 1; i <= 100_000; i++) log.push(i % 2 ? i : { id: i });
    for (let i = 100_000; i >= 1; i--) log.push(i);
    log.push("x", -1, 0, 1.5, { id: "y" }, null);
    db.insert(character).values({ guid: g, name: "Vexa", firstSeenAt: NOW, latestTakenAt: NOW - 100 }).run();
    db.insert(snapshot)
      .values({ guid: g, takenAt: NOW - 100, build: "1", schema: 1, raw: JSON.stringify({ takenAt: NOW - 100, progress: { questLog: log } }) })
      .run();
    const started = performance.now();
    const c = getCharacter(db, g, NOW, { events: false })!;
    const ms = performance.now() - started;
    expect(c.questLogIds).toHaveLength(100_000);
    expect(c.questLogIds.slice(0, 3)).toEqual([1, 2, 3]);
    expect(c.questLogIds.at(-1)).toBe(100_000);
    // Generous bound: the old includes()-in-a-loop took many seconds here.
    expect(ms).toBeLessThan(1500);
  });

  test("events: capped to the newest 200 by default, with the total", () => {
    const db = fresh();
    const g = "Player-9-ev";
    db.insert(character).values({ guid: g, name: "Vexa", firstSeenAt: NOW, latestTakenAt: NOW - 100 }).run();
    db.insert(characterEvent)
      .values(Array.from({ length: 500 }, (_, i) => ({ guid: g, t: NOW - 10_000 + i, kind: "level_up", data: JSON.stringify({ level: i }) })))
      .run();
    const c = getCharacter(db, g, NOW)!;
    expect(c.events).toHaveLength(200);
    expect(c.eventsTotal).toBe(500);
    expect(c.events[0]).toEqual({ t: NOW - 10_000 + 499, kind: "level_up", data: { level: 499 } });
    expect(c.events.at(-1)!.t).toBe(NOW - 10_000 + 300);
    const ts = c.events.map((e) => e.t);
    expect(ts).toEqual([...ts].sort((a, b) => b - a));

    const few = getCharacter(db, g, NOW, { events: 3 })!;
    expect(few.events.map((e) => e.t)).toEqual([NOW - 10_000 + 499, NOW - 10_000 + 498, NOW - 10_000 + 497]);
    expect(few.eventsTotal).toBe(500);

    const all = getCharacter(db, g, NOW, { events: 1000 })!;
    expect(all.events).toHaveLength(500);
    expect(all.eventsTotal).toBe(500);
  });

  test("events: false loads no events and runs no event query", () => {
    const db = load(ROSTER);
    const sqls: string[] = [];
    // drizzle's better-sqlite3 driver prepares every query on the underlying client.
    const client = (db as unknown as { $client: { prepare: (sql: string) => unknown } }).$client;
    const prepare = client.prepare.bind(client);
    client.prepare = (sql: string) => {
      sqls.push(sql);
      return prepare(sql);
    };
    const c = getCharacter(db, M, NOW, { events: false })!;
    expect(c.events).toEqual([]);
    expect(c.eventsTotal).toBeNull();
    expect(c.questLogIds).toEqual([575, 288]);
    expect(sqls.length).toBeGreaterThan(0);
    expect(sqls.filter((s) => s.includes("character_event"))).toEqual([]);
    // The default does query events.
    sqls.length = 0;
    expect(getCharacter(db, M, NOW)!.events).toHaveLength(2);
    expect(sqls.some((s) => s.includes("character_event"))).toBe(true);
  });

  test("(h) getCharacter with an unknown guid returns null", () => {
    expect(getCharacter(load(ROSTER), "Player-0-nope", NOW)).toBeNull();
  });
});
