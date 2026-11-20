import { contentRecord, openDb, type Db } from "@ft/db";
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
vi.mock("$app/forms", () => ({ enhance: () => ({ destroy() {} }) }));
vi.mock("$app/state", () => ({ page: { params: { guid: "Player-7777-0000E001" }, data: {} } }));

import { resetQuestCatalog } from "../src/lib/server/content";
import { load as chainLoad } from "../src/routes/c/[guid]/quests/chain/[questId]/+page.server";
import { load as questsLoad } from "../src/routes/c/[guid]/quests/+page.server";
import ChainPage from "../src/routes/c/[guid]/quests/chain/[questId]/+page.svelte";

const NOW = 1_800_000_000;
// Invented characters. FULL has two other profession slots taken; MINER has Mining.
const FULL = "Player-7777-0000E001";
const MINER = "Player-7777-0000E002";
const FIXTURE = `ForeverTrackerDB = { schema = 1, characters = {
  ["${FULL}"] = { snapshot = { takenAt = ${NOW - 3600},
    identity = { name = "Tessaly", class = "PRIEST", race = "Human", level = 12 },
    state = { zone = "Dun Morogh", mapId = 1426 },
    progress = { professions = { { skillLine = 182, name = "Herbalism", rank = 10, max = 75 }, { skillLine = 197, name = "Tailoring", rank = 10, max = 75 } },
      questsCompleted = {}, questLog = {} } }, visited = {} },
  ["${MINER}"] = { snapshot = { takenAt = ${NOW - 3600},
    identity = { name = "Dorvan", class = "PRIEST", race = "Human", level = 12 },
    state = { zone = "Dun Morogh", mapId = 1426 },
    progress = { professions = { { skillLine = 186, name = "Mining", rank = 10, max = 75 } },
      questsCompleted = {}, questLog = {} } }, visited = {} },
} }`;

type Link = { questId: number; name: string; relation: string };
const quest = (id: number, name: string, previous: Link[] = []) => ({
  id, name, level: 10, zone: { n: "Dun Morogh", slug: "dun-morogh", m: 1426 },
  chain: { previous, next: [], questLine: null }, starts: null, ends: null,
});
const after = (id: number, name: string): Link[] => [{ questId: id, name, relation: "Complete first" }];

function seeded(fixture = FIXTURE): Db {
  const db = openDb(":memory:");
  ingestSavedVariables(db, fixture, () => NOW);
  const put = (resource: string, id: string, data: unknown) =>
    db.insert(contentRecord).values({ resource, id, build: "1.0", data: JSON.stringify(data), fetchedAt: NOW }).run();
  put("meta", "current", { build: "1.0", levelCap: 60 });
  put("professions", "1", { slug: "mining", name: "Mining", kind: "gathering" });
  put("professions", "2", { slug: "herbalism", name: "Herbalism", kind: "gathering" });
  put("professions", "3", { slug: "tailoring", name: "Tailoring", kind: "primary" });
  put("quests", "9101", quest(9101, "First Step"));
  put("quests", "9102", quest(9102, "Ore Samples", after(9101, "First Step")));
  put("quests", "9103", quest(9103, "Third Step", after(9102, "Ore Samples")));
  return db;
}

let dir = "";
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ft-curated-"));
  writeFileSync(join(dir, "quest-tags.json"), JSON.stringify({ version: 1, tags: [{ questId: 9102, kind: "profession", value: "Mining" }] }));
  state.e.curatedDir = dir;
  state.db = seeded();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW * 1000);
  resetQuestCatalog();
});
afterEach(() => {
  vi.useRealTimers();
  rmSync(dir, { recursive: true, force: true });
});

type Data = { chain: { done: number; total: number; members: { questId: number; state: string }[] }; reasons: Record<number, string> };
const ev = (guid: string, questId = "9101") => ({ params: { guid, questId } }) as never;

describe("chain page with curated profession tags", () => {
  test("a Mining step is dimmed and not counted for a character without Mining and no free slot", async () => {
    const data = (await chainLoad(ev(FULL))) as Data;
    expect(data.chain.members.map((m) => [m.questId, m.state])).toEqual([
      [9101, "available"],
      [9102, "unavailable"],
      [9103, "locked"],
    ]);
    expect(data.chain).toMatchObject({ done: 0, total: 2 });
    expect(data.reasons).toEqual({ 9102: "profession" });
    const html = render(ChainPage, { props: { data: data as never } }).body.replace(/<!--.*?-->/g, "");
    expect(html).toContain("0 of 2 done");
    expect(html).toContain("st-unavailable");
    expect(html).toContain("not for your professions");
  });

  test("the same chain is whole for a character who has Mining", async () => {
    const data = (await chainLoad(ev(MINER))) as Data;
    expect(data.chain.total).toBe(3);
    expect(data.chain.members.some((m) => m.state === "unavailable")).toBe(false);
    expect(Object.keys(data.reasons)).toEqual([]);
  });

  test("without curated files the chain is unchanged", async () => {
    state.e.curatedDir = join(dir, "missing");
    resetQuestCatalog();
    const data = (await chainLoad(ev(FULL))) as Data;
    expect(data.chain.total).toBe(3);
  });

  test("the Quests tab chain list excludes the unavailable step too", async () => {
    // A quest in the log makes the chain listed.
    state.db = seeded(`ForeverTrackerDB = { schema = 1, characters = {
  ["${FULL}"] = { snapshot = { takenAt = ${NOW - 3600},
    identity = { name = "Tessaly", class = "PRIEST", race = "Human", level = 12 },
    state = { zone = "Dun Morogh", mapId = 1426 },
    progress = { professions = { { skillLine = 182, name = "Herbalism", rank = 10, max = 75 }, { skillLine = 197, name = "Tailoring", rank = 10, max = 75 } },
      questsCompleted = {}, questLog = { { id = 9101 } } } }, visited = {} },
} }`);
    resetQuestCatalog();
    const tab = (await questsLoad({ params: { guid: FULL } } as never)) as { chains: { total: number }[] };
    expect(tab.chains).toHaveLength(1);
    expect(tab.chains[0]!.total).toBe(2);
  });
});
