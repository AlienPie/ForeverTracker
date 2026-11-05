import { character, characterEvent, openDb } from "@ft/db";
import { describe, expect, test } from "vitest";
import {
  buildSessions,
  getJourneyData,
  levelPace,
  routeFromVisited,
  type StoredEvent,
  type Session,
} from "../src/index";

const T0 = 1_800_000_000;
const MIN = 60;
const HOUR = 3600;

const ev = (t: number, kind: string, data: unknown = {}): StoredEvent => ({ t, kind, data });
const lvl = (t: number, level: number) => ev(t, "level_up", { level });

describe("buildSessions", () => {
  test("empty input gives no sessions", () => {
    expect(buildSessions([])).toEqual([]);
  });

  test("a gap under 30 minutes (29:59) continues the session", () => {
    const s = buildSessions([ev(T0, "x"), ev(T0 + 30 * MIN - 1, "x")]);
    expect(s).toHaveLength(1);
    expect(s[0]!.start).toBe(T0);
    expect(s[0]!.end).toBe(T0 + 30 * MIN - 1);
    expect(s[0]!.seconds).toBe(30 * MIN - 1);
  });

  test("a gap of exactly 30 minutes (30:00) starts a new session", () => {
    const s = buildSessions([ev(T0, "x"), ev(T0 + 30 * MIN, "x")]);
    expect(s).toHaveLength(2);
    // newest first
    expect(s.map((x) => x.start)).toEqual([T0 + 30 * MIN, T0]);
  });

  test("gapSeconds option is honoured; a bad option falls back to 1800", () => {
    expect(buildSessions([ev(T0, "x"), ev(T0 + 100, "x")], { gapSeconds: 100 })).toHaveLength(2);
    expect(buildSessions([ev(T0, "x"), ev(T0 + 99, "x")], { gapSeconds: 100 })).toHaveLength(1);
    expect(buildSessions([ev(T0, "x"), ev(T0 + 1000, "x")], { gapSeconds: Number.NaN })).toHaveLength(1);
    expect(buildSessions([ev(T0, "x"), ev(T0 + 1000, "x")], { gapSeconds: -5 })).toHaveLength(1);
  });

  test("a single event is a one-minute session", () => {
    const s = buildSessions([lvl(T0, 5)]);
    expect(s).toEqual([
      {
        start: T0,
        end: T0,
        seconds: 60,
        levelFrom: 4,
        levelTo: 5,
        quests: 0,
        places: [],
        professions: [],
        events: [lvl(T0, 5)],
      },
    ]);
  });

  test("events all at the same second form one one-minute session", () => {
    const s = buildSessions([ev(T0, "quest_turned_in", { questId: 1 }), ev(T0, "quest_turned_in", { questId: 2 }), lvl(T0, 3)]);
    expect(s).toHaveLength(1);
    expect(s[0]!.seconds).toBe(60);
    expect(s[0]!.quests).toBe(2);
    expect(s[0]!.events).toHaveLength(3);
  });

  test("input order does not matter; events inside are newest first", () => {
    const s = buildSessions([ev(T0 + 20, "b"), ev(T0, "a"), ev(T0 + 10, "c")]);
    expect(s[0]!.events.map((e) => e.t)).toEqual([T0 + 20, T0 + 10, T0]);
    expect(s[0]!.seconds).toBe(60); // 20 s span, minimum 60
  });

  test("implausible times are ignored", () => {
    const s = buildSessions([
      ev(Number.NaN, "x"),
      ev(Number.POSITIVE_INFINITY, "x"),
      ev(0, "x"),
      ev(-5, "x"),
      ev(1e20, "x"),
      ev(T0, "y"),
    ]);
    expect(s).toHaveLength(1);
    expect(s[0]!.events).toEqual([ev(T0, "y")]);
    expect(buildSessions([ev(0, "x"), ev(Number.NaN, "x")])).toEqual([]);
  });

  test("summary fields: levels, quests, places, professions", () => {
    const s = buildSessions([
      lvl(T0, 12),
      ev(T0 + 60, "quest_turned_in", { questId: 77 }),
      ev(T0 + 120, "zone_first_visit", { mapId: 1426, subzone: "Brightwood" }),
      ev(T0 + 130, "zone_first_visit", { mapId: 1426, subzone: "Brightwood" }),
      ev(T0 + 140, "zone_first_visit", { mapId: 1426, subzone: "" }),
      ev(T0 + 150, "zone_first_visit", { mapId: 1432 }),
      ev(T0 + 180, "profession_changed", { count: 2, names: "Mining|Skinning" }),
      ev(T0 + 200, "profession_changed", { count: 2, names: "Mining|Tailoring" }),
      lvl(T0 + 300, 13),
      lvl(T0 + 400, 14),
      ev(T0 + 500, "quest_turned_in", { questId: 78 }),
      ev(T0 + 600, "mystery_kind", { level: 99, questId: 5 }),
    ]);
    expect(s).toHaveLength(1);
    const x = s[0]!;
    expect(x.levelFrom).toBe(11);
    expect(x.levelTo).toBe(14);
    expect(x.quests).toBe(2);
    expect(x.places).toEqual([
      { mapId: 1426, subzone: "Brightwood" },
      { mapId: 1426, subzone: "" },
      { mapId: 1432, subzone: "" },
    ]);
    expect(x.professions).toEqual(["Mining", "Skinning", "Tailoring"]);
    // unknown kinds stay in events only
    expect(x.events[0]).toEqual(ev(T0 + 600, "mystery_kind", { level: 99, questId: 5 }));
    expect(x.end - x.start).toBe(600);
  });

  test("same-second level-ups give the full range in either input order", () => {
    for (const order of [
      [lvl(T0, 9), lvl(T0, 10)],
      [lvl(T0, 10), lvl(T0, 9)],
    ]) {
      const s = buildSessions(order);
      expect(s[0]).toMatchObject({ levelFrom: 8, levelTo: 10 });
    }
  });

  test("sessions without level-ups have null levels; summaries are per session", () => {
    const s = buildSessions([lvl(T0, 2), ev(T0 + 2 * HOUR, "quest_turned_in", { questId: 1 })]);
    expect(s).toHaveLength(2);
    expect(s[0]).toMatchObject({ levelFrom: null, levelTo: null, quests: 1 });
    expect(s[1]).toMatchObject({ levelFrom: 1, levelTo: 2, quests: 0 });
  });

  test("malformed data never throws and adds nothing", () => {
    const s = buildSessions([
      ev(T0, "level_up", null),
      ev(T0 + 1, "level_up", { level: "7" }),
      ev(T0 + 2, "level_up", { level: 2.5 }),
      ev(T0 + 3, "level_up", { level: -1 }),
      ev(T0 + 4, "zone_first_visit", "oops"),
      ev(T0 + 5, "zone_first_visit", { mapId: -3, subzone: "X" }),
      ev(T0 + 6, "profession_changed", { names: 42 }),
      ev(T0 + 7, "profession_changed", { names: "||" }),
      ev(T0 + 8, "profession_changed", [1, 2]),
      { t: T0 + 9, kind: 5 as unknown as string, data: undefined },
    ]);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ levelFrom: null, levelTo: null, quests: 0, places: [], professions: [] });
    expect(s[0]!.events).toHaveLength(10);
  });
});

/** Sessions for a list of [start, end] spans. */
function spans(...xs: [number, number][]): Session[] {
  return xs.map(([start, end]) => ({
    start,
    end,
    seconds: Math.max(60, end - start),
    levelFrom: null,
    levelTo: null,
    quests: 0,
    places: [],
    professions: [],
    events: [],
  }));
}

describe("levelPace", () => {
  test("empty input gives an empty pace", () => {
    expect(levelPace([], [], T0)).toEqual([]);
    expect(levelPace([{ t: T0, level: 5 }], [], T0)).toEqual([{ level: 5, seconds: 0, complete: false }]);
  });

  test("an overnight pause between sessions is not counted", () => {
    // Evening session 20:00-22:00, morning session 08:00-09:00 next day.
    const evening = T0;
    const morning = T0 + 12 * HOUR;
    const sessions = spans([morning, morning + HOUR], [evening, evening + 2 * HOUR]);
    const ups = [
      { t: evening + HOUR, level: 10 }, // reached 10 one hour into the evening
      { t: morning + 30 * MIN, level: 11 }, // reached 11 half an hour into the morning
    ];
    const pace = levelPace(ups, sessions, morning + 2 * HOUR);
    expect(pace).toEqual([
      { level: 10, seconds: HOUR + 30 * MIN, complete: true },
      { level: 11, seconds: 30 * MIN, complete: false },
    ]);
  });

  test("a level dinged as the last event of a one-event session counts that session's minute", () => {
    // Session A is the ding to 8 alone; session B opens with the ding to 9 (log in, hand in, level).
    const a = T0;
    const b = T0 + 5 * HOUR;
    const sessions = buildSessions([lvl(a, 8), lvl(b, 9), ev(b + 20 * MIN, "x")]);
    expect(sessions).toHaveLength(2);
    const pace = levelPace(
      [
        { t: a, level: 8 },
        { t: b, level: 9 },
      ],
      sessions,
      b + HOUR,
    );
    // Level 8: span A is [a, a + 60] for pace, so the overlap is the full 60 s minimum.
    expect(pace).toEqual([
      { level: 8, seconds: 60, complete: true },
      { level: 9, seconds: 20 * MIN, complete: false },
    ]);
  });

  test("a short session's minimum is clipped at the next level-up", () => {
    // Session A spans 20 s and the level-up to 6 is its last event: pace counts [a+20, a+60] = 40 s.
    const a = T0;
    const sessions = spans([a, a + 20], [a + 2 * HOUR, a + 3 * HOUR]);
    const pace = levelPace(
      [
        { t: a, level: 5 },
        { t: a + 20, level: 6 },
        { t: a + 2 * HOUR, level: 7 },
      ],
      sessions,
      a + 4 * HOUR,
    );
    expect(pace).toEqual([
      { level: 5, seconds: 20, complete: true },
      { level: 6, seconds: 40, complete: true },
      { level: 7, seconds: HOUR, complete: false },
    ]);
  });

  test("the current level runs to the latest event time, not to now", () => {
    const sessions = spans([T0, T0 + HOUR]);
    const pace = levelPace([{ t: T0 + 20 * MIN, level: 4 }], sessions, T0 + 10 * HOUR);
    expect(pace).toEqual([{ level: 4, seconds: 40 * MIN, complete: false }]);
  });

  test("events later than now are not counted", () => {
    const sessions = spans([T0, T0 + HOUR]);
    const pace = levelPace([{ t: T0, level: 4 }], sessions, T0 + 30 * MIN);
    expect(pace).toEqual([{ level: 4, seconds: 30 * MIN, complete: false }]);
  });

  test("a level whose start is known but no later event is the current level with 0 seconds", () => {
    const sessions = spans([T0, T0 + HOUR]);
    const pace = levelPace([{ t: T0 + 10 * MIN, level: 7 }, { t: T0 + HOUR, level: 8 }], sessions, T0 + 2 * HOUR);
    expect(pace).toEqual([
      { level: 7, seconds: 50 * MIN, complete: true },
      { level: 8, seconds: 0, complete: false },
    ]);
  });

  test("only level 14 recorded: one partial entry, earlier levels omitted", () => {
    const sessions = spans([T0, T0 + HOUR]);
    expect(levelPace([{ t: T0 + 15 * MIN, level: 14 }], sessions, T0 + HOUR)).toEqual([
      { level: 14, seconds: 45 * MIN, complete: false },
    ]);
  });

  test("duplicates (earliest wins) and out-of-order input are sorted by level", () => {
    const sessions = spans([T0, T0 + 3 * HOUR]);
    const ups = [
      { t: T0 + 2 * HOUR, level: 6 },
      { t: T0 + HOUR, level: 5 },
      { t: T0 + 90 * MIN, level: 5 }, // later duplicate, ignored
      { t: T0 + 30 * MIN, level: 4 },
      { t: T0 + 2 * HOUR + 10, level: 6 },
    ];
    expect(levelPace(ups, sessions, T0 + 3 * HOUR)).toEqual([
      { level: 4, seconds: 30 * MIN, complete: true },
      { level: 5, seconds: HOUR, complete: true },
      { level: 6, seconds: HOUR, complete: false },
    ]);
  });

  test("a missing level-up: the level before it has no known end and is omitted", () => {
    const sessions = spans([T0, T0 + 3 * HOUR]);
    const ups = [
      { t: T0, level: 10 },
      { t: T0 + HOUR, level: 11 },
      // 12 never recorded
      { t: T0 + 2 * HOUR, level: 13 },
    ];
    expect(levelPace(ups, sessions, T0 + 3 * HOUR)).toEqual([
      { level: 10, seconds: HOUR, complete: true },
      { level: 13, seconds: HOUR, complete: false },
    ]);
  });

  test("nothing negative or NaN on odd input", () => {
    const sessions = [
      ...spans([T0, T0 + HOUR], [T0 + 5 * HOUR, T0 + 4 * HOUR]),
      ...spans([Number.NaN, T0]),
    ];
    const ups = [
      { t: T0 + 50 * MIN, level: 3 },
      { t: T0 + 10 * MIN, level: 4 }, // time earlier than level 3: impossible order
      { t: Number.NaN, level: 5 },
      { t: T0, level: Number.NaN },
      { t: -1, level: 6 },
      { t: T0, level: 0 },
      { t: T0, level: 2.5 },
    ];
    const pace = levelPace(ups, sessions, Number.NaN);
    expect(pace.map((p) => p.level)).toEqual([3, 4]);
    for (const p of pace) {
      expect(Number.isFinite(p.seconds)).toBe(true);
      expect(p.seconds).toBeGreaterThanOrEqual(0);
    }
    expect(pace[0]).toEqual({ level: 3, seconds: 0, complete: true });
  });

  test("works with sessions from buildSessions", () => {
    const events = [lvl(T0, 2), ev(T0 + 10 * MIN, "x"), lvl(T0 + 20 * MIN, 3), ev(T0 + 40 * MIN, "x")];
    const pace = levelPace(
      [
        { t: T0, level: 2 },
        { t: T0 + 20 * MIN, level: 3 },
      ],
      buildSessions(events),
      T0 + 50 * MIN,
    );
    expect(pace).toEqual([
      { level: 2, seconds: 20 * MIN, complete: true },
      { level: 3, seconds: 20 * MIN, complete: false },
    ]);
  });
});

describe("routeFromVisited", () => {
  const names: Record<number, string> = { 1426: "Brightvale", 1432: "Lakeholm", 1437: "Fenmarsh" };
  const nameOf = (id: number) => names[id] ?? null;

  test("empty input", () => {
    expect(routeFromVisited([], [], nameOf)).toEqual({ stops: [], earlier: 0, markers: [] });
    expect(routeFromVisited([], [{ t: T0, level: 3 }], nameOf)).toEqual({ stops: [], earlier: 0, markers: [] });
  });

  test("subzones merge into one stop, ordered by first seen; unnamed maps get Map <id>", () => {
    const r = routeFromVisited(
      [
        { mapId: 1432, subzone: "Pier", firstSeen: T0 + 300 },
        { mapId: 1426, subzone: "Hollow", firstSeen: T0 + 100 },
        { mapId: 1426, subzone: "", firstSeen: T0 },
        { mapId: 9999, subzone: "", firstSeen: T0 + 500 },
        { mapId: 1426, subzone: "Late", firstSeen: T0 + 600 },
      ],
      [],
      nameOf,
    );
    expect(r.stops).toEqual([
      { mapId: 1426, name: "Brightvale", firstSeen: T0, levelFrom: null, levelTo: null, current: false },
      { mapId: 1432, name: "Lakeholm", firstSeen: T0 + 300, levelFrom: null, levelTo: null, current: false },
      { mapId: 9999, name: "Map 9999", firstSeen: T0 + 500, levelFrom: null, levelTo: null, current: true },
    ]);
    expect(r.earlier).toBe(0);
    expect(r.markers).toEqual([]);
  });

  test("max keeps the newest stops and reports how many were dropped", () => {
    const visited = Array.from({ length: 12 }, (_, i) => ({ mapId: 100 + i, subzone: "", firstSeen: T0 + i * HOUR }));
    const r = routeFromVisited(visited, [], nameOf);
    expect(r.stops).toHaveLength(8);
    expect(r.earlier).toBe(4);
    expect(r.stops[0]!.mapId).toBe(104);
    expect(r.stops.at(-1)).toMatchObject({ mapId: 111, current: true });
    expect(r.stops.filter((s) => s.current)).toHaveLength(1);

    const r3 = routeFromVisited(visited, [], nameOf, { max: 3 });
    expect(r3.stops.map((s) => s.mapId)).toEqual([109, 110, 111]);
    expect(r3.earlier).toBe(9);

    // a bad max falls back to 8
    expect(routeFromVisited(visited, [], nameOf, { max: 0 }).stops).toHaveLength(8);
    expect(routeFromVisited(visited, [], nameOf, { max: Number.NaN }).stops).toHaveLength(8);
  });

  test("level ranges from level-ups at the first and last time seen; markers after the current stop", () => {
    const visited = [
      { mapId: 1426, subzone: "", firstSeen: T0 }, // at level 1 (before any level-up: unknown)
      { mapId: 1426, subzone: "Hollow", firstSeen: T0 + 3 * HOUR }, // level 3 by then
      { mapId: 1432, subzone: "", firstSeen: T0 + 4 * HOUR }, // level 4 by then
      { mapId: 1437, subzone: "", firstSeen: T0 + 6 * HOUR }, // level 5
    ];
    const ups = [
      { t: T0 + HOUR, level: 2 },
      { t: T0 + 2 * HOUR, level: 3 },
      { t: T0 + 4 * HOUR - 10, level: 4 },
      { t: T0 + 5 * HOUR, level: 5 },
      { t: T0 + 7 * HOUR, level: 6 },
    ];
    const r = routeFromVisited(visited, ups, nameOf);
    expect(r.stops.map((s) => [s.mapId, s.levelFrom, s.levelTo, s.current])).toEqual([
      // levelFrom unknown (no level-up yet); still there just before Lakeholm was reached, at level 4
      [1426, null, 4, false],
      [1432, 4, 5, false],
      [1437, 5, 6, true], // the current stop runs to the latest known level
    ]);
    expect(r.markers).toEqual([
      { level: 2, t: T0 + HOUR, afterStop: 0 },
      { level: 3, t: T0 + 2 * HOUR, afterStop: 0 },
      { level: 4, t: T0 + 4 * HOUR - 10, afterStop: 0 },
      { level: 5, t: T0 + 5 * HOUR, afterStop: 1 },
      { level: 6, t: T0 + 7 * HOUR, afterStop: 2 },
    ]);
  });

  test("markers before the first returned stop get afterStop -1", () => {
    const visited = [
      { mapId: 1, subzone: "", firstSeen: T0 },
      { mapId: 2, subzone: "", firstSeen: T0 + 2 * HOUR },
      { mapId: 3, subzone: "", firstSeen: T0 + 4 * HOUR },
    ];
    const ups = [
      { t: T0 - HOUR, level: 2 }, // before any stop
      { t: T0 + HOUR, level: 3 }, // during the dropped stop 1
      { t: T0 + 3 * HOUR, level: 4 },
      { t: T0 + 3 * HOUR + 5, level: 4 }, // duplicate: earliest wins
    ];
    const r = routeFromVisited(visited, ups, nameOf, { max: 2 });
    expect(r.earlier).toBe(1);
    expect(r.markers).toEqual([
      { level: 2, t: T0 - HOUR, afterStop: -1 },
      { level: 3, t: T0 + HOUR, afterStop: -1 },
      { level: 4, t: T0 + 3 * HOUR, afterStop: 0 },
    ]);
  });

  test("odd input never throws: bad rows skipped, throwing or empty nameOf falls back", () => {
    const r = routeFromVisited(
      [
        { mapId: Number.NaN, subzone: "", firstSeen: T0 },
        { mapId: 5, subzone: "", firstSeen: Number.NaN },
        { mapId: 5, subzone: "", firstSeen: -1 },
        { mapId: 6, subzone: null as unknown as string, firstSeen: T0 },
        { mapId: 7, subzone: "", firstSeen: T0 + 1 },
      ],
      [{ t: Number.NaN, level: 3 }],
      (id) => {
        if (id === 6) throw new Error("boom");
        return "";
      },
    );
    expect(r.stops.map((s) => [s.mapId, s.name])).toEqual([
      [6, "Map 6"],
      [7, "Map 7"],
    ]);
    expect(r.markers).toEqual([]);
  });
});

describe("performance", () => {
  test("3000 events and 500 places stay fast", () => {
    const events: StoredEvent[] = [];
    const ups: { t: number; level: number }[] = [];
    for (let i = 0; i < 3000; i++) {
      const t = T0 + i * 5 * MIN + (i % 40 === 0 ? 10 * HOUR * (i / 40) : 0);
      if (i % 50 === 0) {
        const level = i / 50 + 1;
        events.push(lvl(t, level));
        ups.push({ t, level });
      } else if (i % 3 === 0) events.push(ev(t, "zone_first_visit", { mapId: i % 500, subzone: `Sub ${i}` }));
      else events.push(ev(t, "quest_turned_in", { questId: i }));
    }
    const visited = Array.from({ length: 500 }, (_, i) => ({ mapId: i, subzone: `Z${i % 7}`, firstSeen: T0 + i * 97 }));
    const started = performance.now();
    const sessions = buildSessions(events);
    const pace = levelPace(ups, sessions, T0 + 365 * 86_400);
    const route = routeFromVisited(visited, ups, (id) => `Place ${id}`);
    const ms = performance.now() - started;
    expect(sessions.length).toBeGreaterThan(1);
    expect(pace.length).toBe(60);
    expect(route.stops).toHaveLength(8);
    expect(route.earlier).toBe(492);
    expect(ms).toBeLessThan(1000);
  });
});

describe("getJourneyData", () => {
  const G = "Player-77-0000J01";

  function seeded() {
    const db = openDb(":memory:");
    db.insert(character).values({ guid: G, name: "Tamsel", firstSeenAt: T0, latestTakenAt: T0 }).run();
    return db;
  }

  test("unknown guid gives null", () => {
    expect(getJourneyData(seeded(), "Player-77-nobody")).toBeNull();
  });

  test("a character with no events", () => {
    expect(getJourneyData(seeded(), G)).toEqual({ events: [], levelUps: [], total: 0 });
  });

  test("caps events newest first, returns all level-ups beyond the cap, and the total", () => {
    const db = seeded();
    const rows = [];
    for (let i = 0; i < 40; i++) {
      rows.push({ guid: G, t: T0 + i * 100, kind: "quest_turned_in", data: JSON.stringify({ questId: i + 1 }) });
      if (i % 10 === 0) rows.push({ guid: G, t: T0 + i * 100 + 1, kind: "level_up", data: JSON.stringify({ level: i / 10 + 2 }) });
    }
    db.insert(characterEvent).values(rows).run();
    db.insert(character).values({ guid: "Player-77-other", name: "Other", firstSeenAt: T0, latestTakenAt: T0 }).run();
    db.insert(characterEvent).values({ guid: "Player-77-other", t: T0, kind: "level_up", data: '{"level":9}' }).run();

    const j = getJourneyData(db, G, { events: 5 })!;
    expect(j.total).toBe(44);
    expect(j.events.map((e) => e.t)).toEqual([T0 + 3900, T0 + 3800, T0 + 3700, T0 + 3600, T0 + 3500]);
    expect(j.events[0]).toEqual({ t: T0 + 3900, kind: "quest_turned_in", data: { questId: 40 } });
    expect(j.levelUps).toEqual([
      { t: T0 + 1, level: 2 },
      { t: T0 + 1001, level: 3 },
      { t: T0 + 2001, level: 4 },
      { t: T0 + 3001, level: 5 },
    ]);

    const all = getJourneyData(db, G)!;
    expect(all.events).toHaveLength(44);
    // a bad limit falls back to the default
    expect(getJourneyData(db, G, { events: -1 })!.events).toHaveLength(44);
  });

  test("default cap is 3000", () => {
    const db = seeded();
    db.insert(characterEvent)
      .values(Array.from({ length: 3100 }, (_, i) => ({ guid: G, t: T0 + i, kind: "quest_turned_in", data: `{"questId":${i + 1}}` })))
      .run();
    const j = getJourneyData(db, G)!;
    expect(j.events).toHaveLength(3000);
    expect(j.events.at(-1)!.t).toBe(T0 + 100);
    expect(j.total).toBe(3100);
  });

  test("malformed rows are skipped rather than thrown on", () => {
    const db = seeded();
    db.insert(characterEvent)
      .values([
        { guid: G, t: T0, kind: "level_up", data: "{not json" },
        { guid: G, t: T0 + 1, kind: "level_up", data: '{"level":"seven"}' },
        { guid: G, t: T0 + 2, kind: "level_up", data: "null" },
        { guid: G, t: T0 + 3, kind: "level_up", data: '{"level":4.5}' },
        { guid: G, t: T0 + 4, kind: "quest_turned_in", data: "][" },
        { guid: G, t: T0 + 5, kind: "level_up", data: '{"level":6}' },
        { guid: G, t: -50, kind: "level_up", data: '{"level":2}' },
      ])
      .run();
    const j = getJourneyData(db, G)!;
    expect(j.levelUps).toEqual([{ t: T0 + 5, level: 6 }]);
    // rows whose data does not parse are dropped from events; parsed odd data stays for the models to ignore
    expect(j.events.map((e) => e.t)).toEqual([T0 + 5, T0 + 3, T0 + 2, T0 + 1, -50]);
    expect(j.total).toBe(7);
  });
});
