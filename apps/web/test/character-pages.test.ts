import { contentRecord, openDb, type Db } from "@ft/db";
import { ingestSavedVariables } from "@ft/core";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  db: null as unknown,
  e: { contentMode: "mirror" as "mirror" | "on-demand", ownerPassword: null as string | null, sessionSecret: null as string | null },
}));
vi.mock("../src/lib/server/db", () => ({ getDb: () => state.db }));
vi.mock("../src/lib/server/env", () => ({ env: () => state.e }));
// The chain page reads the guid for its back link; outside SvelteKit there is no $app/state.
vi.mock("$app/forms", () => ({ enhance: () => ({ destroy() {} }) }));
vi.mock("$app/state", () => ({ page: { params: { guid: "Player-7777-0000D006" }, data: {} } }));

import { load as layoutLoad } from "../src/routes/c/[guid]/+layout.server";
import { load as indexLoad } from "../src/routes/c/[guid]/+page.server";
import { load as questsLoad } from "../src/routes/c/[guid]/quests/+page.server";
import { load as chainLoad } from "../src/routes/c/[guid]/quests/chain/[questId]/+page.server";
import ChainPage from "../src/routes/c/[guid]/quests/chain/[questId]/+page.svelte";
import { render } from "svelte/server";
import { load as journeyLoad } from "../src/routes/c/[guid]/journey/+page.server";
import { load as talentsLoad } from "../src/routes/c/[guid]/talents/+page.server";
import { load as professionsLoad } from "../src/routes/c/[guid]/professions/+page.server";
import { load as rosterLoad } from "../src/routes/+page.server";
import { resetQuestCatalog } from "../src/lib/server/content";
import { getQuestCatalogSafe } from "../src/lib/server/safe-catalog";
import { eventSentence, formatDay, formatEventTime } from "../src/lib/journey";

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
    // HERO's quest log holds 9201. 9101 has three successors counting the Priest rune (a hub), so
    // HERO is on this chain because of the logged step, not because 9101 is done.
    putContent(db, "quests", "9201", quest(9201, "Fourth Step", 13, ["Dun Morogh", 1426], after(9103, "Third Step")));
    // Class quests: in the real mirror `zone.n` is the class name with `m: null`.
    putContent(db, "quests", "9301", quest(9301, "Call of Earth", 10, ["Shaman", null], after(9101, "First Step")));
    putContent(db, "quests", "9302", quest(9302, "Consecrated Rune", 9, ["Priest", null], after(9101, "First Step")));
  }
  return db;
}

// The Journey tab reads `url` (for ?all=1); the other loads ignore it.
const ev = (guid: string) => ({ params: { guid }, url: new URL(`http://localhost/c/${guid}`) }) as never;

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
  suggestions: { kind: string; title: string; questId: number | null; level: number; reason: string }[];
  chains: { chain: number; name: string; done: number; total: number; pips: string[] }[];
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
    // The chain holds the Shaman quest but not the Priest one (5 members, not 6).
    expect(data.chains).toEqual([
      { chain: 9101, name: "First Step", done: 1, total: 5, pips: ["done", "now", "todo", "todo", "todo"] },
    ]);
  });

  test("roster Next passes the class too: the Shaman sees the Shaman quest, never the Priest rune", async () => {
    state.db = seeded(true);
    const roster = (await rosterLoad({} as never)) as { nextByGuid: Record<string, { title: string } | null> };
    expect(roster.nextByGuid[HERO]).toMatchObject({ title: "Call of Earth" });
    expect(Object.values(roster.nextByGuid).some((n) => n?.title === "Consecrated Rune")).toBe(false);
  });

  test("profession quests: a full-slot character is not offered Mining, but is offered Skinning (interim rule)", async () => {
    state.db = seeded(true);
    const db = state.db as Db;
    const CRAFTER = "Player-7777-0000D004";
    ingestSavedVariables(
      db,
      `ForeverTrackerDB = { schema = 1, characters = { ["${CRAFTER}"] = { snapshot = { takenAt = ${NOW},
        identity = { name = "Brisa", class = "HUNTER", race = "Dwarf", level = 10 },
        state = { zone = "Dun Morogh", mapId = 1426 },
        progress = { professions = {
          { skillLine = 393, name = "Skinning", rank = 30, max = 75 },
          { skillLine = 165, name = "Leatherworking", rank = 25, max = 75 },
          { skillLine = 185, name = "Cooking", rank = 10, max = 75 },
          { skillLine = 129, name = "First Aid", rank = 5, max = 75 } },
          questsCompleted = {}, questLog = {} } } } } }`,
      () => NOW,
    );
    // Shapes as in the real `professions` resource (base record plus a per-page `@` record).
    putContent(db, "professions", "mining", { slug: "mining", name: "Mining", kind: "gathering" });
    putContent(db, "professions", "mining@100", { slug: "mining", name: "Mining", kind: "gathering" });
    putContent(db, "professions", "skinning", { slug: "skinning", name: "Skinning", kind: "gathering" });
    putContent(db, "professions", "leatherworking", { slug: "leatherworking", name: "Leatherworking", kind: "primary" });
    putContent(db, "quests", "9401", quest(9401, "Camping 101: Mining", 9, ["Dun Morogh", 1426]));
    putContent(db, "quests", "9402", quest(9402, "Camping 101: Skinning", 10, ["Dun Morogh", 1426]));

    const data = (await questsLoad(ev(CRAFTER))) as QuestsData;
    const titles = data.suggestions.map((s) => s.title);
    expect(titles).not.toContain("Camping 101: Mining");
    expect(data.suggestions.find((s) => s.title === "Camping 101: Skinning")).toMatchObject({ kind: "profession" });
    expect(titles).toContain("Wolf Trouble");

    const roster = (await rosterLoad({} as never)) as { nextByGuid: Record<string, { title: string } | null> };
    expect(roster.nextByGuid[CRAFTER]?.title).not.toBe("Camping 101: Mining");
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

type ChainData = {
  contentReady: boolean;
  contentMode: string;
  chain: {
    chain: number;
    name: string;
    done: number;
    otherRoute: number;
    total: number;
    members: { questId: number; name: string; level: number; zone: string | null; giver: string | null; state: string; otherRoute: boolean; step: number }[];
  } | null;
  current: number | null;
};
const chainEv = (guid: string, questId: string) => ({ params: { guid, questId } }) as never;

describe("chain page", () => {
  test("unknown guid is a 404", async () => {
    state.db = seeded(true);
    await expect(Promise.resolve().then(() => chainLoad(chainEv(UNKNOWN, "9101")))).rejects.toMatchObject({ status: 404 });
  });

  test("unknown, invalid or other-class quest ids are a 404", async () => {
    state.db = seeded(true);
    // 9302 is a Priest rune: not a chain the Shaman can open.
    for (const id of ["424242", "abc", "0", "-3", "1.5", "9101x", "", "99999999999999999999", "9302", "%", "%39101", "91%2001"]) {
      await expect(Promise.resolve().then(() => chainLoad(chainEv(HERO, id))), id).rejects.toMatchObject({ status: 404 });
    }
  });

  test("leading zeros are accepted as the same id", async () => {
    state.db = seeded(true);
    const data = (await chainLoad(chainEv(HERO, "0009102"))) as ChainData;
    expect(data.chain!.chain).toBe(9101);
    // 00012 is quest 12.
    putContent(state.db as Db, "quests", "12", quest(12, "Lone Errand", 5, ["Dun Morogh", 1426]));
    resetQuestCatalog();
    const twelve = (await chainLoad(chainEv(HERO, "00012"))) as ChainData;
    expect(twelve.chain).toMatchObject({ chain: 12, name: "Lone Errand", total: 1 });
  });

  test("a known member gives the whole chain in order, with states and the current step", async () => {
    state.db = seeded(true);
    const data = (await chainLoad(chainEv(HERO, "9103"))) as ChainData;
    expect(data.contentReady).toBe(true);
    expect(data.chain).toMatchObject({ chain: 9101, name: "First Step", done: 1, total: 5 });
    expect(data.chain!.members.map((m) => [m.step, m.questId, m.state])).toEqual([
      [1, 9101, "done"],
      [2, 9301, "available"],
      [3, 9102, "available"],
      [4, 9103, "locked"],
      [5, 9201, "in-log"],
    ]);
    expect(data.chain!.members[2]).toMatchObject({ name: "Second Step", level: 11, zone: "Dun Morogh", giver: null });
    // The quest in the log is the current step.
    expect(data.current).toBe(9201);
    // Nothing in the log: the first available quest is current (Priest: their rune, not the Shaman's).
    const bare = (await chainLoad(chainEv(BARE, "9101"))) as ChainData;
    expect(bare.chain!.members.map((m) => [m.questId, m.state])).toEqual([
      [9101, "available"],
      [9302, "locked"],
      [9102, "locked"],
      [9103, "locked"],
      [9201, "locked"],
    ]);
    expect(bare.current).toBe(9101);
  });

  test("the current step is the quest in the log when there is one", async () => {
    state.db = seeded(true);
    const db = state.db as Db;
    const WALKER = "Player-7777-0000D005";
    ingestSavedVariables(
      db,
      `ForeverTrackerDB = { schema = 1, characters = { ["${WALKER}"] = { snapshot = { takenAt = ${NOW},
        identity = { name = "Odrin", class = "WARRIOR", race = "Dwarf", level = 11 },
        progress = { professions = {}, questsCompleted = { 9101 }, questLog = { { id = 9102 } } } } } } }`,
      () => NOW,
    );
    const data = (await chainLoad(chainEv(WALKER, "9101"))) as ChainData;
    expect(data.chain!.members.map((m) => [m.questId, m.state])).toEqual([
      [9101, "done"],
      [9102, "in-log"],
      [9103, "locked"],
      [9201, "locked"],
    ]);
    expect(data.current).toBe(9102);
  });

  test("a quest completed without the chain's earlier quests is 'not through this chain' and not counted", async () => {
    state.db = seeded(true);
    const db = state.db as Db;
    // Invented character who did Second Step (9102) by another route, never First Step (9101).
    const STRAY = "Player-7777-0000D006";
    ingestSavedVariables(
      db,
      `ForeverTrackerDB = { schema = 1, characters = { ["${STRAY}"] = { snapshot = { takenAt = ${NOW},
        identity = { name = "Halvi", class = "WARRIOR", race = "Dwarf", level = 11 },
        progress = { professions = {}, questsCompleted = { 9102 }, questLog = {} } } } } }`,
      () => NOW,
    );
    const data = (await chainLoad(chainEv(STRAY, "9102"))) as ChainData;
    expect(data.chain).toMatchObject({ chain: 9101, done: 0, otherRoute: 1, total: 3 });
    expect(data.chain!.members.map((m) => [m.questId, m.state, m.otherRoute])).toEqual([
      [9101, "skipped", false],
      [9102, "done", true],
      [9103, "available", false],
      [9201, "locked", false],
    ]);
    // The Quests tab does not list the chain: nothing counts and nothing is in the log.
    const tab = (await questsLoad(ev(STRAY))) as QuestsData;
    expect(tab.chains).toEqual([]);
    expect(tab.suggestions.filter((s) => s.kind === "chain")).toEqual([]);

    const html = render(ChainPage, { props: { data } }).body.replace(/<!--.*?-->/g, "");
    expect(html).toContain("0 of 3 done");
    expect(html).toContain("completed, but not through this chain");
    expect(html).toContain("same name in other starting regions");
    // A character on the route sees neither the state text nor the note.
    const hero = render(ChainPage, { props: { data: await chainLoad(chainEv(HERO, "9101")) } }).body;
    expect(hero).not.toContain("not through this chain");
    expect(hero).not.toContain("other starting regions");
  });

  test("empty catalog: no 404, content not ready, no chain", async () => {
    state.db = seeded(false);
    const data = (await chainLoad(chainEv(HERO, "9101"))) as ChainData;
    expect(data).toMatchObject({ contentReady: false, contentMode: "mirror", chain: null, current: null });
  });

  test("the quests tab links: each chain carries its root quest id, chain suggestions their quest id", async () => {
    state.db = seeded(true);
    const data = (await questsLoad(ev(HERO))) as QuestsData;
    expect(data.chains.map((c) => c.chain)).toEqual([9101]);
    const chainKind = data.suggestions.filter((s) => s.kind === "chain");
    expect(chainKind.map((s) => s.questId)).toEqual([9301, 9102]);
    // Every link target opens a chain page.
    for (const id of [9101, 9301, 9102]) {
      const page = (await chainLoad(chainEv(HERO, String(id)))) as ChainData;
      expect(page.chain!.chain).toBe(9101);
    }
  });
});

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

import { load as logLoad } from "../src/routes/c/[guid]/quests/log/+page.server";

type LogData = {
  contentReady: boolean;
  contentMode: string;
  list: "progress" | "completed";
  q: string;
  counts: { progress: number; completed: number };
  rows: { questId: number; name: string; level: number | null; zone: string | null }[];
  total: number;
  page: number;
  pages: number;
};
const logEv = (guid: string, query = "") =>
  ({ params: { guid }, url: new URL(`http://localhost/c/${guid}/quests/log${query}`) }) as never;

describe("quest log page", () => {
  test("unknown guid is a 404", async () => {
    state.db = seeded(true);
    await expect(Promise.resolve().then(() => logLoad(logEv(UNKNOWN)))).rejects.toMatchObject({ status: 404 });
  });

  test("both lists with counts; default list is in progress", async () => {
    state.db = seeded(true);
    const p = (await logLoad(logEv(HERO))) as LogData;
    expect(p).toMatchObject({ contentReady: true, list: "progress", counts: { progress: 1, completed: 1 }, total: 1 });
    expect(p.rows).toEqual([{ questId: 9201, name: "Fourth Step", level: 13, zone: "Dun Morogh" }]);
    const c = (await logLoad(logEv(HERO, "?list=completed"))) as LogData;
    expect(c.list).toBe("completed");
    expect(c.rows).toEqual([{ questId: 9101, name: "First Step", level: 10, zone: "Dun Morogh" }]);
  });

  test("search filters; bad list/page/q are normalised", async () => {
    state.db = seeded(true);
    expect(((await logLoad(logEv(HERO, "?list=completed&q=FIRST"))) as LogData).total).toBe(1);
    expect(((await logLoad(logEv(HERO, "?list=completed&q=zzz"))) as LogData).total).toBe(0);
    const bad = (await logLoad(logEv(HERO, "?list=__proto__&page=-3&q=.*"))) as LogData;
    expect(bad).toMatchObject({ list: "progress", page: 1, total: 0, q: ".*" });
    for (const pg of ["abc", "0", "1.5", "99999999999999999999", "1e3"]) {
      expect(((await logLoad(logEv(HERO, `?page=${pg}`))) as LogData).page, pg).toBe(1);
    }
    expect(((await logLoad(logEv(HERO, "?page=50"))) as LogData).page).toBe(1);
  });

  test("a long q is trimmed and cut to 100 characters", async () => {
    state.db = seeded(true);
    const p = (await logLoad(logEv(HERO, `?q=${encodeURIComponent("  " + "a".repeat(500))}`))) as LogData;
    expect(p.q).toBe("a".repeat(100));
  });

  test("empty catalog: still lists ids as 'Quest <id>' with content not ready", async () => {
    state.db = seeded(false);
    const p = (await logLoad(logEv(HERO, "?list=completed"))) as LogData;
    expect(p).toMatchObject({ contentReady: false, contentMode: "mirror", total: 1 });
    expect(p.rows).toEqual([{ questId: 9101, name: "Quest 9101", level: null, zone: null }]);
  });
});
