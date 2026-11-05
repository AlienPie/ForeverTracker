import { characterEvent, contentRecord, openDb, type Db } from "@ft/db";
import { ingestSavedVariables } from "@ft/core";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  db: null as unknown,
  e: { contentMode: "mirror" as "mirror" | "on-demand", ownerPassword: null as string | null, sessionSecret: null as string | null },
}));
vi.mock("../src/lib/server/db", () => ({ getDb: () => state.db }));
vi.mock("../src/lib/server/env", () => ({ env: () => state.e }));

import { load as layoutLoad } from "../src/routes/c/[guid]/+layout.server";
import { load as indexLoad } from "../src/routes/c/[guid]/+page.server";
import { load as questsLoad } from "../src/routes/c/[guid]/quests/+page.server";
import { load as journeyLoad } from "../src/routes/c/[guid]/journey/+page.server";
import { load as talentsLoad } from "../src/routes/c/[guid]/talents/+page.server";
import { load as professionsLoad } from "../src/routes/c/[guid]/professions/+page.server";
import { load as rosterLoad } from "../src/routes/+page.server";
import { resetQuestCatalog } from "../src/lib/server/content";
import { getQuestCatalogSafe } from "../src/lib/server/safe-catalog";
import { eventSentence, formatDay, formatEventTime, type JourneyEvent, type Place } from "../src/lib/journey";

const NOW = 1_800_000_000;
const HOUR = 3600;
// Invented characters only.
const HERO = "Player-7777-0000D001";
const BARE = "Player-7777-0000D002";
const UNKNOWN = "Player-7777-0000DFFF";

const FIXTURE = `ForeverTrackerDB = { schema = 1, characters = {
  ["${HERO}"] = {
    snapshot = { takenAt = ${NOW - HOUR},
      identity = { name = "Corvalis", surname = "the Patient", class = "SHAMAN", race = "Dwarf", level = 12, xp = 300, xpMax = 1000 },
      time = { played = 40000 }, state = { zone = "Dun Morogh", mapId = 1426, money = 123456 },
      progress = { professions = { { skillLine = 186, name = "Mining", rank = 42, max = 75 } },
        talents = { nodes = {}, unspent = 3 },
        questsCompleted = { 9101 }, questLog = { { id = 9201 } } } },
    events = {
      { t = ${NOW - 5 * HOUR}, kind = "level_up", data = { level = 11 } },
      { t = ${NOW - 4 * HOUR}, kind = "quest_turned_in", data = { questId = 9101 } },
      { t = ${NOW - 3 * HOUR}, kind = "quest_turned_in", data = { questId = 424242 } },
      { t = ${NOW - 2 * HOUR}, kind = "profession_changed", data = { count = 2, names = "Mining|Skinning" } },
      { t = ${NOW - 90 * 60}, kind = "dance_party", data = { odd = true } },
      { t = ${NOW - 60 * 60}, kind = "level_up", data = { level = 12 } },
    },
    visited = {
      ["1426:Coldridge Valley"] = { mapId = 1426, subzone = "Coldridge Valley", firstSeen = ${NOW - 6 * HOUR} },
      ["1426:Kharanos"] = { mapId = 1426, subzone = "Kharanos", firstSeen = ${NOW - 5 * HOUR} },
      ["1432:Thelsamar"] = { mapId = 1432, subzone = "Thelsamar", firstSeen = ${NOW - 2 * HOUR} },
      ["9999:"] = { mapId = 9999, subzone = "", firstSeen = ${NOW - HOUR} },
    },
  },
  ["${BARE}"] = {
    snapshot = { takenAt = ${NOW - HOUR},
      identity = { name = "Wenna", class = "PRIEST", race = "Human", level = 5 },
      state = { unavailable = true, reason = "s" },
      progress = { professions = {}, questsCompleted = {}, questLog = {} } },
    visited = {},
  },
} }`;

type Link = { questId: number; name: string; relation: string };
function quest(id: number, name: string, level: number, zone: [string, number | null] | null, previous: Link[] = []) {
  return {
    id,
    name,
    level,
    zone: zone ? { n: zone[0], slug: zone[0].toLowerCase().replace(/ /g, "-"), m: zone[1] } : null,
    chain: { previous, next: [], questLine: null },
    starts: null,
    ends: null,
  };
}
const after = (questId: number, name: string): Link[] => [{ questId, name, relation: "Complete first" }];

function putContent(db: Db, resource: string, id: string, data: unknown) {
  db.insert(contentRecord).values({ resource, id, build: "1.0", data: JSON.stringify(data), fetchedAt: NOW }).run();
}

function seeded(withContent: boolean): Db {
  const db = openDb(":memory:");
  ingestSavedVariables(db, FIXTURE, () => NOW);
  if (withContent) {
    putContent(db, "meta", "current", { build: "1.0", levelCap: 60 });
    putContent(db, "zones", "1426", { id: 1426, name: "Dun Morogh", type: 3, parentId: 1415 });
    putContent(db, "quests", "9101", quest(9101, "First Step", 10, ["Dun Morogh", 1426]));
    putContent(db, "quests", "9102", quest(9102, "Second Step", 11, ["Dun Morogh", 1426], after(9101, "First Step")));
    putContent(db, "quests", "9103", quest(9103, "Third Step", 12, ["Dun Morogh", 1426], after(9102, "Second Step")));
    putContent(db, "quests", "9104", quest(9104, "Wolf Trouble", 11, ["Dun Morogh", 1426]));
    putContent(db, "quests", "9105", quest(9105, "Lochside Errand", 14, ["Loch Modan", 1432]));
    // Class quests: in the real mirror `zone.n` is the class name with `m: null`.
    putContent(db, "quests", "9301", quest(9301, "Call of Earth", 10, ["Shaman", null], after(9101, "First Step")));
    putContent(db, "quests", "9302", quest(9302, "Consecrated Rune", 9, ["Priest", null], after(9101, "First Step")));
  }
  return db;
}

const ev = (guid: string) => ({ params: { guid } }) as never;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW * 1000);
  state.e.contentMode = "mirror";
  resetQuestCatalog();
});
afterEach(() => vi.useRealTimers());

describe("character layout", () => {
  test("unknown guid is a 404 on the layout and every tab", async () => {
    state.db = seeded(false);
    for (const load of [layoutLoad, questsLoad, journeyLoad, talentsLoad, professionsLoad]) {
      await expect(Promise.resolve().then(() => load(ev(UNKNOWN)))).rejects.toMatchObject({ status: 404 });
    }
  });

  test("header fields for a known character", async () => {
    state.db = seeded(false);
    const data = (await layoutLoad(ev(HERO))) as { character: Record<string, unknown>; now: number };
    expect(data.character).toMatchObject({
      guid: HERO,
      name: "Corvalis",
      surname: "the Patient",
      class: "SHAMAN",
      race: "Dwarf",
      level: 12,
      xpPct: 30,
      zone: "Dun Morogh",
      money: 123456,
      playedSeconds: 40000,
    });
    // Header data only: the raw snapshot is not sent to the browser.
    expect(data.character).not.toHaveProperty("snapshot");
    expect(data.now).toBe(NOW);
  });

  test("/c/<guid> redirects to the quests tab", async () => {
    state.db = seeded(false);
    await expect(Promise.resolve().then(() => indexLoad(ev(HERO)))).rejects.toMatchObject({
      status: 303,
      location: `/c/${HERO}/quests`,
    });
  });
});

type QuestsData = {
  contentReady: boolean;
  contentMode: string;
  suggestions: { kind: string; title: string; level: number; reason: string }[];
  chains: { name: string; done: number; total: number; pips: string[] }[];
  inProgress: number;
  completed: number;
};

describe("quests tab", () => {
  test("empty catalog: no suggestions, contentReady false", async () => {
    state.db = seeded(false);
    const data = (await questsLoad(ev(HERO))) as QuestsData;
    expect(data.contentReady).toBe(false);
    expect(data.suggestions).toEqual([]);
    expect(data.chains).toEqual([]);
    expect(data.inProgress).toBe(1);
    expect(data.completed).toBe(1);
  });

  test("synthetic catalog: chain steps first (own class quest included), then same area, and chain pips", async () => {
    state.db = seeded(true);
    const data = (await questsLoad(ev(HERO))) as QuestsData;
    expect(data.contentReady).toBe(true);
    // HERO is a Shaman: the Shaman quest is suggested, the Priest rune never is.
    expect(data.suggestions.map((s) => [s.kind, s.title])).toEqual([
      ["chain", "Call of Earth"],
      ["chain", "Second Step"],
      ["area", "Wolf Trouble"],
    ]);
    expect(data.suggestions[0]!.reason).toMatch(/^Shaman class quest\./);
    expect(data.suggestions[1]!.reason).toContain('after "First Step"');
    // The chain holds the Shaman quest but not the Priest one (4 members, not 5).
    expect(data.chains).toEqual([
      { chain: 9101, name: "First Step", done: 1, total: 4, pips: ["done", "now", "todo", "todo"] },
    ]);
  });

  test("roster Next passes the class too: the Shaman sees the Shaman quest, never the Priest rune", async () => {
    state.db = seeded(true);
    const roster = (await rosterLoad({} as never)) as { nextByGuid: Record<string, { title: string } | null> };
    expect(roster.nextByGuid[HERO]).toMatchObject({ title: "Call of Earth" });
    expect(Object.values(roster.nextByGuid).some((n) => n?.title === "Consecrated Rune")).toBe(false);
  });

  test("unknown level: content ready but nothing suggested", async () => {
    state.db = seeded(true);
    // A character whose snapshots never carried a level.
    ingestSavedVariables(
      state.db as Db,
      `ForeverTrackerDB = { schema = 1, characters = { ["Player-7777-0000D003"] = { snapshot = { takenAt = ${NOW},
        identity = { unavailable = true, reason = "r" } } } } }`,
      () => NOW,
    );
    const data = (await questsLoad(ev("Player-7777-0000D003"))) as QuestsData;
    expect(data.contentReady).toBe(true);
    expect(data.suggestions).toEqual([]);
  });
});

type JourneyData = { events: JourneyEvent[]; places: Place[]; eventsTotal: number };

/** SQL text of every statement prepared on `db` while `fn` runs. */
async function preparedDuring(db: Db, fn: () => Promise<unknown>): Promise<string[]> {
  // drizzle's better-sqlite3 driver prepares every query on the underlying client.
  const client = (db as unknown as { $client: { prepare: (sql: string) => unknown } }).$client;
  const prepare = client.prepare;
  const sqls: string[] = [];
  client.prepare = (text: string) => {
    sqls.push(text);
    return prepare.call(client, text);
  };
  try {
    await fn();
  } finally {
    client.prepare = prepare;
  }
  return sqls;
}

describe("bounded event reads", () => {
  test("roster, layout, quests, talents and professions never query events", async () => {
    state.db = seeded(true);
    for (const [name, run] of [
      ["roster", () => rosterLoad({} as never)],
      ["layout", () => layoutLoad(ev(HERO))],
      ["quests", () => questsLoad(ev(HERO))],
      ["talents", () => talentsLoad(ev(HERO))],
      ["professions", () => professionsLoad(ev(HERO))],
    ] as const) {
      const sqls = await preparedDuring(state.db as Db, async () => run());
      expect(sqls.length, name).toBeGreaterThan(0);
      expect(sqls.filter((q) => q.includes("character_event")), name).toEqual([]);
    }
    const journey = await preparedDuring(state.db as Db, async () => journeyLoad(ev(HERO)));
    expect(journey.some((q) => q.includes("character_event"))).toBe(true);
  });

  test("journey shows the newest 200 events and reports the total", async () => {
    state.db = seeded(false);
    (state.db as Db)
      .insert(characterEvent)
      .values(Array.from({ length: 250 }, (_, i) => ({ guid: BARE, t: NOW - 1000 + i, kind: "level_up", data: JSON.stringify({ level: i }) })))
      .run();
    const data = (await journeyLoad(ev(BARE))) as JourneyData;
    expect(data.events).toHaveLength(200);
    expect(data.eventsTotal).toBe(250);
    expect(data.events[0]!.t).toBe(NOW - 1000 + 249);
    expect(data.events.at(-1)!.t).toBe(NOW - 1000 + 50);
  });

  test("journey total equals the shown count under the cap", async () => {
    state.db = seeded(true);
    const data = (await journeyLoad(ev(HERO))) as JourneyData;
    expect(data.eventsTotal).toBe(data.events.length);
  });
});

describe("journey tab", () => {
  test("visited = {} gives an empty places list and no events", async () => {
    state.db = seeded(true);
    const data = (await journeyLoad(ev(BARE))) as JourneyData;
    expect(data.places).toEqual([]);
    expect(data.events).toEqual([]);
  });

  test("events newest first with sentences, quest names from the catalog, safe fallbacks", async () => {
    state.db = seeded(true);
    const data = (await journeyLoad(ev(HERO))) as JourneyData;
    expect(data.events.map((e) => e.text)).toEqual([
      "Reached level 12",
      "dance_party",
      "Professions now: Mining, Skinning",
      "Completed quest 424242",
      "Completed First Step",
      "Reached level 11",
    ]);
    const ts = data.events.map((e) => e.t);
    expect(ts).toEqual([...ts].sort((a, b) => b - a));
  });

  test("places grouped by map, names from zones then quests, else Map <id>", async () => {
    state.db = seeded(true);
    const data = (await journeyLoad(ev(HERO))) as JourneyData;
    expect(data.places).toEqual([
      { mapId: 9999, name: "Map 9999", subzones: [], firstSeen: NOW - HOUR, since: "15 Jan 2027" },
      { mapId: 1432, name: "Loch Modan", subzones: ["Thelsamar"], firstSeen: NOW - 2 * HOUR, since: "15 Jan 2027" },
      { mapId: 1426, name: "Dun Morogh", subzones: ["Coldridge Valley", "Kharanos"], firstSeen: NOW - 6 * HOUR, since: "15 Jan 2027" },
    ]);
  });

  test("without content every map is Map <id> and quests fall back to their id", async () => {
    state.db = seeded(false);
    const data = (await journeyLoad(ev(HERO))) as JourneyData;
    expect(data.places.map((p) => p.name)).toEqual(["Map 9999", "Map 1432", "Map 1426"]);
    expect(data.events.map((e) => e.text)).toContain("Completed quest 9101");
  });
});

describe("out-of-range times", () => {
  test("formatters give nulls instead of throwing", () => {
    for (const t of [1e20, -1e20, 0, -5, Number.NaN, Number.POSITIVE_INFINITY, 1e15]) {
      expect(formatEventTime(t)).toEqual({ iso: null, when: null });
      expect(formatDay(t)).toBeNull();
    }
    expect(formatEventTime(NOW)).toEqual({ iso: "2027-01-15T08:00:00.000Z", when: "15 Jan 2027, 08:00" });
    expect(formatDay(NOW)).toBe("15 Jan 2027");
  });

  test("journey load survives events and places with t = 1e20", async () => {
    state.db = seeded(true);
    ingestSavedVariables(
      state.db as Db,
      `ForeverTrackerDB = { schema = 1, characters = { ["Player-7777-0000D004"] = {
        snapshot = { takenAt = ${NOW}, identity = { name = "Tamsin", class = "MAGE", race = "Gnome", level = 8 } },
        events = {
          { t = 1e20, kind = "level_up", data = { level = 8 } },
          { t = -1e20, kind = "level_up", data = { level = 2 } },
          { t = ${NOW - HOUR}, kind = "level_up", data = { level = 7 } },
        },
        visited = { ["1426:"] = { mapId = 1426, subzone = "", firstSeen = 1e20 } },
      } } }`,
      () => NOW,
    );
    const data = (await journeyLoad(ev("Player-7777-0000D004"))) as JourneyData;
    expect(data.events.map((e) => [e.text, e.iso, e.when])).toEqual([
      ["Reached level 8", null, null],
      ["Reached level 7", "2027-01-15T07:00:00.000Z", "15 Jan 2027, 07:00"],
      ["Reached level 2", null, null],
    ]);
    expect(data.places).toEqual([{ mapId: 1426, name: "Dun Morogh", subzones: [], firstSeen: 1e20, since: null }]);
  });
});

describe("eventSentence", () => {
  const names = new Map([[1, "A Quest"]]);
  const zones = { 1426: "Dun Morogh" };
  const s = (kind: string, data: unknown) => eventSentence({ t: 0, kind, data }, names, zones);
  test("known kinds", () => {
    expect(s("level_up", { level: 7 })).toBe("Reached level 7");
    expect(s("quest_turned_in", { questId: 1 })).toBe("Completed A Quest");
    expect(s("zone_first_visit", { mapId: 1426, subzone: "Kharanos" })).toBe("First visit to Kharanos, Dun Morogh");
    expect(s("zone_first_visit", { mapId: 77, subzone: "" })).toBe("First visit to Map 77");
    expect(s("profession_changed", { count: 1, names: "Mining" })).toBe("Professions now: Mining");
  });
  test("never throws on odd data", () => {
    expect(s("level_up", null)).toBe("Gained a level");
    expect(s("level_up", { level: "x" })).toBe("Gained a level");
    expect(s("quest_turned_in", [1, 2])).toBe("Completed a quest");
    expect(s("zone_first_visit", "nope")).toBe("Visited a new place");
    expect(s("profession_changed", { names: 5 })).toBe("Professions changed");
    expect(s("profession_changed", { names: "" })).toBe("Professions changed");
    expect(s("whatever", undefined)).toBe("whatever");
  });
});

describe("talents tab", () => {
  test("unspent points and level", async () => {
    state.db = seeded(false);
    expect(await talentsLoad(ev(HERO))).toEqual({ level: 12, talents: { unspent: 3 } });
  });
  test("not recorded", async () => {
    state.db = seeded(false);
    expect(await talentsLoad(ev(BARE))).toEqual({ level: 5, talents: null });
  });
});

describe("professions tab", () => {
  test("none gives an empty list", async () => {
    state.db = seeded(false);
    expect(await professionsLoad(ev(BARE))).toEqual({ professions: [] });
  });
  test("skill bars from the snapshot", async () => {
    state.db = seeded(false);
    expect(await professionsLoad(ev(HERO))).toEqual({
      professions: [{ skillLine: 186, name: "Mining", rank: 42, max: 75 }],
    });
  });
});

describe("safe catalog", () => {
  test("a throwing loader degrades to the empty catalog", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    const cat = await getQuestCatalogSafe(() => Promise.reject(new Error("corrupt mirror")));
    expect(cat).toEqual({ quests: [], levelCap: null, mapNames: {} });
    expect(quiet).toHaveBeenCalled();
    quiet.mockRestore();
  });

  test("a working loader passes through", async () => {
    const value = { quests: [], levelCap: 60, mapNames: { 1: "X" } };
    expect(await getQuestCatalogSafe(() => Promise.resolve(value))).toBe(value);
  });

  test("roster and quests tab survive a broken mirror table", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = seeded(true);
    db.run(sql`DROP TABLE content_record`);
    state.db = db;
    const roster = (await rosterLoad({} as never)) as { contentReady: boolean; roster: { characters: unknown[] } };
    expect(roster.contentReady).toBe(false);
    expect(roster.roster.characters).toHaveLength(2);
    const quests = (await questsLoad(ev(HERO))) as QuestsData;
    expect(quests.contentReady).toBe(false);
    quiet.mockRestore();
  });
});
