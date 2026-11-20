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
function setup(opts: { sv?: string; quests?: boolean; zones?: boolean } = {}) {
  const { quests = true, zones = true } = opts;
  if (zones)
    writeFileSync(
      join(dir, "zones.json"),
      JSON.stringify({
        version: 1,
        zones: [
          { name: "Dun Morogh", minLevel: 1, maxLevel: 10, territory: "Alliance", type: "zone" },
          { name: "Westfall", minLevel: 10, maxLevel: 14, territory: "Alliance", type: "zone" },
        ],
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

const run = async () => (await load({ params: { guid: GUID } } as never)) as ExplorePageData;
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
    expect(out).toContain("1 zone visited");
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
    expect(out).toContain("1 quest has no zone and is not counted");
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
    expect(out).toContain("0 zones visited");
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
    expect(out).not.toContain("%");
  });
});
