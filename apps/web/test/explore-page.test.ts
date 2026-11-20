import { contentRecord, openDb } from "@ft/db";
import { ingestSavedVariables } from "@ft/core";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { render } from "svelte/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  db: null as unknown,
  e: { contentMode: "mirror", ownerPassword: null, sessionSecret: null, curatedDir: "" },
}));
vi.mock("../src/lib/server/db", () => ({ getDb: () => state.db }));
vi.mock("../src/lib/server/env", async (orig) => ({ ...(await orig<object>()), env: () => state.e }));
vi.mock("$app/state", () => ({ page: { params: { guid: "Player-7777-0000F002" }, data: {} } }));

import { resetQuestCatalog } from "../src/lib/server/content";
import { load, type ExplorePageData } from "../src/routes/c/[guid]/explore/+page.server";
import ExplorePage from "../src/routes/c/[guid]/explore/+page.svelte";

const NOW = 1_800_000_000;
const GUID = "Player-7777-0000F002";
// Invented Dwarf, level 12, who has done 100, 101 and 103 in Dun Morogh and nothing elsewhere.
const sv = (progress: string) => `ForeverTrackerDB = { schema = 1, characters = {
  ["${GUID}"] = { snapshot = { takenAt = ${NOW - 3600},
    identity = { name = "Brewdan", class = "WARRIOR", race = "Dwarf", level = 12 },
    state = { zone = "Dun Morogh", mapId = 1426 },
    progress = { professions = {}, ${progress} } }, visited = {} },
} }`;
const FIXTURE = sv("questsCompleted = { 100, 101, 103 }, questLog = {}");
const EMPTY = sv("questsCompleted = {}, questLog = {}");

type Link = { questId: number; name: string; relation: string };
const l = (questId: number, name: string, relation = "Complete first"): Link => ({ questId, name, relation });
const DM = { n: "Dun Morogh", slug: "dun-morogh", m: 1426 };
const quest = (id: number, name: string, level: number, zone: unknown, previous: Link[] = [], next: Link[] = [], side?: string) => ({
  id, name, level, zone, side, chain: { previous, next, questLine: null }, starts: null, ends: null,
});

let dir = "";
const ZONES = [
  { name: "Dun Morogh", minLevel: 1, maxLevel: 10, territory: "Alliance", type: "zone" },
  { name: "Westfall", minLevel: 10, maxLevel: 14, territory: "Alliance", type: "zone" },
];
function setup(opts: { sv?: string; quests?: boolean; zones?: boolean; zoneList?: unknown[] } = {}) {
  const { quests = true, zones = true } = opts;
  if (zones)
    writeFileSync(
      join(dir, "zones.json"),
      JSON.stringify({
        version: 1,
        zones: opts.zoneList ?? ZONES,
      }),
    );
  state.e.curatedDir = dir;
  const db = openDb(":memory:");
  ingestSavedVariables(db, opts.sv ?? FIXTURE, () => NOW);
  if (quests) {
    const put = (q: { id: number }) =>
      db.insert(contentRecord).values({ resource: "quests", id: String(q.id), build: "1.0", data: JSON.stringify(q), fetchedAt: NOW }).run();
    db.insert(contentRecord).values({ resource: "meta", id: "current", build: "1.0", data: JSON.stringify({ build: "1.0", levelCap: 60 }), fetchedAt: NOW }).run();
    put(quest(100, "Cold Start", 1, DM, [], [l(101, "Warm Up")]));
    put(quest(101, "Warm Up", 3, DM, [l(100, "Cold Start"), l(102, "Side Door", "Chain link")], [l(103, "Hot Finish")]));
    put(quest(102, "Side Door", 3, DM, [], [l(101, "Warm Up", "Chain link")])); // skipped: 101 done without it
    put(quest(103, "Hot Finish", 5, DM, [l(101, "Warm Up")]));
    put(quest(104, "Stray Goat", 8, DM));
    put(quest(105, "Horde Errand", 8, DM, [], [], "h")); // other faction, ignored
    put(quest(200, "Farm Hands", 10, { n: "Westfall", slug: "westfall", m: 1436 }));
    put(quest(300, "Class Trial", 10, { n: "Warrior", slug: "warrior", m: null })); // unplaced
  }
  state.db = db;
  resetQuestCatalog();
}

const run = async (sort?: string) =>
  (await load({ params: { guid: GUID }, url: new URL(`http://localhost/x${sort ? `?sort=${sort}` : ""}`) } as never)) as ExplorePageData;
const html = (data: ExplorePageData) => render(ExplorePage, { props: { data } }).body.replace(/<!--.*?-->/g, "");

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ft-explore-"));
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW * 1000);
});
afterEach(() => {
  vi.useRealTimers();
  rmSync(dir, { recursive: true, force: true });
});

describe("explore page", () => {
  test("loader splits visited and unvisited zones and counts progress", async () => {
    setup();
    const data = await run();
    expect(data).toMatchObject({ contentReady: true, level: 12, unplaced: 1, hasZoneData: true });
    expect(data.visited.map((z) => z.name)).toEqual(["Dun Morogh"]);
    expect(data.visited[0]).toMatchObject({ done: 3, total: 4, left: 1, skipped: 1, fit: "above" });
    expect(data.visited[0].remaining.map((q) => q.id)).toEqual([104]);
    expect(data.visited[0].skippedQuests.map((q) => q.id)).toEqual([102]);
    expect(data.unvisited.map((z) => z.name)).toEqual(["Westfall"]);
    expect(data.unvisited[0]).toMatchObject({ fit: "in-range", total: 1 });
  });

  test("renders both sections, counts, links, skipped text and the unplaced note", async () => {
    setup();
    const out = html(await run());
    expect(out).toContain("Visited");
    expect(out).toContain("Not visited yet");
    expect(out).toContain("Visited zones (1)");
    expect(out).toContain("<details");
    expect(out).toContain("Dun Morogh");
    expect(out).toContain("3 / 4");
    expect(out).toContain("75%");
    expect(out).toContain("above your level");
    expect(out).toContain("Stray Goat");
    expect(out).toContain('href="/c/Player-7777-0000F002/quests/chain/104"');
    expect(out).toContain("Side Door");
    expect(out).toContain("skipped, you completed what follows");
    expect(out).not.toContain("Horde Errand");
    expect(out).toContain("Westfall");
    expect(out).toContain("in range");
    expect(out).toContain("10 to 14");
    expect(out).not.toContain("Farm Hands"); // unvisited zones list no quests
    expect(out).toContain("1 quest with no map zone (class, profession, event and other quests) is not counted");
    expect(out).not.toContain("wowhead-data-guide");
  });

  test("without zone data: a hint, no level ranges", async () => {
    setup({ zones: false });
    const data = await run();
    expect(data.hasZoneData).toBe(false);
    const out = html(data);
    expect(out).toContain("docs/wowhead-data-guide.md");
    expect(out).toContain("Dun Morogh");
    expect(out).not.toContain("in range");
  });

  test("empty catalog is not ready and shows the notice only", async () => {
    setup({ quests: false });
    const data = await run();
    expect(data.contentReady).toBe(false);
    const out = html(data);
    expect(out).toContain("content mirror");
    expect(out).not.toContain("Not visited yet");
  });

  test("a character with no progress has no visited zones and renders", async () => {
    setup({ sv: EMPTY });
    const data = await run();
    expect(data.visited).toEqual([]);
    const out = html(data);
    expect(out).toContain("Visited zones (0)");
    expect(out).toContain("Not visited yet");
    expect(out).not.toContain("NaN");
  });

  test("a visited zone with no counted quests shows no percentage", async () => {
    // Visited by map id, but its only quest is for the other faction, so total is 0.
    const visited = `visited = { { mapId = 1500, subzone = "Gate", firstSeen = ${NOW - 100} } }`;
    setup({ sv: EMPTY.replace("visited = {}", visited) });
    (state.db as ReturnType<typeof openDb>)
      .insert(contentRecord)
      .values({ resource: "quests", id: "400", build: "1.0", data: JSON.stringify(quest(400, "Orc Errand", 5, { n: "Stonard Pass", slug: "s", m: 1500 }, [], [], "h")), fetchedAt: NOW })
      .run();
    resetQuestCatalog();
    const data = await run();
    expect(data.visited.map((z) => [z.name, z.total])).toEqual([["Stonard Pass", 0]]);
    const out = html(data);
    expect(out).toContain("Stonard Pass");
    expect(out).toContain("0 / 0");
    expect(out).not.toContain("NaN");
    expect(out.slice(out.indexOf("<details"))).not.toMatch(/\d%/);
  });

  const add = (...qs: ReturnType<typeof quest>[]) => {
    for (const q of qs)
      (state.db as ReturnType<typeof openDb>)
        .insert(contentRecord)
        .values({ resource: "quests", id: String(q.id), build: "1.0", data: JSON.stringify(q), fetchedAt: NOW })
        .run();
    resetQuestCatalog();
  };

  test("unvisited order: in-range first, other-faction territory last, level order otherwise", async () => {
    const zoneList = [
      ...ZONES,
      { name: "Orgrimmar", minLevel: 1, maxLevel: 60, territory: "Horde", type: "zone" },
      { name: "Redridge", minLevel: 15, maxLevel: 25, territory: "Alliance", type: "zone" },
      { name: "Teldrassil", minLevel: 1, maxLevel: 10, territory: "Alliance", type: "zone" },
    ];
    setup({ zoneList });
    add(
      quest(201, "Boss Task", 5, { n: "Orgrimmar", slug: "o", m: 1454 }),
      quest(202, "Lake Task", 16, { n: "Redridge", slug: "r", m: 1433 }),
      quest(203, "Tree Task", 2, { n: "Teldrassil", slug: "t", m: 1438 }),
    );
    const data = await run();
    // Westfall is in range; Teldrassil and Redridge are not; Orgrimmar is hostile and in range but last.
    expect(data.unvisited.map((z) => z.name)).toEqual(["Westfall", "Teldrassil", "Redridge", "Orgrimmar"]);
    const out = html(data);
    expect(out.indexOf("Westfall")).toBeLessThan(out.indexOf("Teldrassil"));
    expect(out.indexOf("Redridge")).toBeLessThan(out.indexOf("Orgrimmar"));
    expect(out).not.toMatch(/,\s*<\/span>/); // no trailing separator
  });

  test("a fully done zone shows 100% and nothing left", async () => {
    setup({ sv: sv("questsCompleted = { 100, 101, 102, 103, 104 }, questLog = {}") });
    const data = await run();
    expect(data.visited[0]).toMatchObject({ name: "Dun Morogh", done: 5, total: 5, left: 0 });
    const out = html(data);
    expect(out).toContain("5 / 5");
    expect(out).toContain("100%");
    expect(out).toContain("Nothing left that is open to you here.");
  });

  test("quests split into in progress, not done and completed", async () => {
    setup({ sv: sv("questsCompleted = { 100 }, questLog = { 101, 104 }") });
    const out = html(await run());
    expect(out).toContain("In progress");
    expect(out).toContain("in your log");
    expect(out).toContain("Completed");
    expect(out).toContain("Not done");
  });

  const twoZones = (events: string) => `ForeverTrackerDB = { schema = 1, characters = {
    ["${GUID}"] = { snapshot = { takenAt = ${NOW - 3600},
      identity = { name = "Brewdan", class = "WARRIOR", race = "Dwarf", level = 12 },
      state = { zone = "Dun Morogh", mapId = 1426 },
      progress = { professions = {}, questsCompleted = { 100, 101, 103, 200 }, questLog = {} } }, visited = {}, events = { ${events} } },
  } }`;

  test("sorts visited zones by level, by most complete, or by recent activity", async () => {
    setup({ sv: twoZones(`{ t = ${NOW - 500}, kind = "quest_turned_in", data = { questId = 100 } }, { t = ${NOW - 900}, kind = "quest_turned_in", data = { questId = 200 } }`) });
    expect((await run()).visited.map((z) => z.name)).toEqual(["Dun Morogh", "Westfall"]);
    expect((await run("complete")).visited.map((z) => z.name)).toEqual(["Westfall", "Dun Morogh"]); // 100% before 75%
    expect((await run("recent")).visited.map((z) => z.name)).toEqual(["Dun Morogh", "Westfall"]); // 100 turned in last
    expect((await run("nonsense")).sort).toBe("level");
  });

  test("equal completion is ordered by the most recent turn-in", async () => {
    setup({ sv: twoZones(`{ t = ${NOW - 900}, kind = "quest_turned_in", data = { questId = 200 } }`), zoneList: ZONES });
    const data = await run("complete");
    expect(data.visited.map((z) => z.name)).toEqual(["Westfall", "Dun Morogh"]);
  });

  test("global and visited tallies count only quests this faction can do", async () => {
    setup({ sv: twoZones("") });
    const data = await run();
    // Dun Morogh: 100, 101, 103, 104 (102 is skipped and the Horde quest 105 is ignored). Westfall: 200.
    expect(data.all).toEqual({ done: 4, total: 5 });
    expect(data.seen).toEqual({ done: 4, total: 5 });
    const out = html(data);
    expect(out).toContain("All zones");
    expect(out).toContain("Visited zones (2)");
    expect(out).toContain("Most complete");
  });
});
