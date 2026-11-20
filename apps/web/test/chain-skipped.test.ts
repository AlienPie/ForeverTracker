import { contentRecord, openDb } from "@ft/db";
import { ingestSavedVariables } from "@ft/core";
import { mkdtempSync, rmSync } from "node:fs";
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
vi.mock("$app/state", () => ({ page: { params: { guid: "Player-7777-0000F001" }, data: {} } }));

import { resetQuestCatalog } from "../src/lib/server/content";
import { load as chainLoad } from "../src/routes/c/[guid]/quests/chain/[questId]/+page.server";
import ChainPage from "../src/routes/c/[guid]/quests/chain/[questId]/+page.svelte";

const NOW = 1_800_000_000;
const GUID = "Player-7777-0000F001";
// Invented character who did 315, 413 and 414 of "The Perfect Stout" but never 415.
const FIXTURE = `ForeverTrackerDB = { schema = 1, characters = {
  ["${GUID}"] = { snapshot = { takenAt = ${NOW - 3600},
    identity = { name = "Brewdan", class = "WARRIOR", race = "Dwarf", level = 12 },
    state = { zone = "Dun Morogh", mapId = 1426 },
    progress = { professions = {}, questsCompleted = { 315, 413, 414 }, questLog = {} } }, visited = {} },
} }`;

type Link = { questId: number; name: string; relation: string };
const quest = (id: number, name: string, level: number, previous: Link[], next: Link[]) => ({
  id, name, level, zone: { n: "Dun Morogh", slug: "dun-morogh", m: 1426 },
  chain: { previous, next, questLine: null }, starts: null, ends: null,
});
const l = (questId: number, name: string, relation = "Complete first"): Link => ({ questId, name, relation });

let dir = "";
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ft-skipped-"));
  state.e.curatedDir = dir;
  const db = openDb(":memory:");
  ingestSavedVariables(db, FIXTURE, () => NOW);
  const put = (id: number, data: unknown) =>
    db.insert(contentRecord).values({ resource: "quests", id: String(id), build: "1.0", data: JSON.stringify(data), fetchedAt: NOW }).run();
  db.insert(contentRecord).values({ resource: "meta", id: "current", build: "1.0", data: JSON.stringify({ build: "1.0", levelCap: 60 }), fetchedAt: NOW }).run();
  put(315, quest(315, "The Perfect Stout", 9, [], [l(413, "Shimmer Stout")]));
  put(413, quest(413, "Shimmer Stout", 10, [l(315, "The Perfect Stout"), l(415, "Rejold's New Brew", "Chain link")], [l(414, "Stout to Kadrell")]));
  put(414, quest(414, "Stout to Kadrell", 10, [l(413, "Shimmer Stout")], []));
  put(415, quest(415, "Rejold's New Brew", 10, [], [l(413, "Shimmer Stout", "Chain link")]));
  state.db = db;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW * 1000);
  resetQuestCatalog();
});
afterEach(() => {
  vi.useRealTimers();
  rmSync(dir, { recursive: true, force: true });
});

describe("chain page with a skipped step", () => {
  test("415 is shown dimmed as skipped and the count excludes it", async () => {
    const data = (await chainLoad({ params: { guid: GUID, questId: "315" } } as never)) as {
      chain: { done: number; total: number; members: { questId: number; state: string }[] };
      current: number | null;
    };
    expect(data.chain.members.map((m) => [m.questId, m.state])).toEqual([
      [315, "done"],
      [415, "skipped"],
      [413, "done"],
      [414, "done"],
    ]);
    expect(data.chain).toMatchObject({ done: 3, total: 3 });
    expect(data.current).toBeNull();
    const html = render(ChainPage, { props: { data: data as never } }).body.replace(/<!--.*?-->/g, "");
    expect(html).toContain("3 of 3 done");
    expect(html).toContain("st-skipped");
    expect(html).toContain("skipped, you completed what follows");
    expect(html).not.toContain("available now");
  });
});
