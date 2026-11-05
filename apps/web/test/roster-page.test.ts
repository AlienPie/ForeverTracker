import { contentRecord, openDb, type Db } from "@ft/db";
import type { ContentSource } from "@ft/content";
import { ingestSavedVariables } from "@ft/core";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  db: null as unknown,
  e: { contentMode: "mirror" as "mirror" | "on-demand", ownerPassword: null as string | null, sessionSecret: null as string | null },
}));
vi.mock("../src/lib/server/db", () => ({ getDb: () => state.db }));
vi.mock("../src/lib/server/env", () => ({ env: () => state.e }));

import { load } from "../src/routes/+page.server";
import { load as layoutLoad } from "../src/routes/+layout.server";
import { className, classColor, raceName, NEUTRAL_CLASS_COLOR, sealTextIsDark } from "../src/lib/classes";
import { ago, syncLabel } from "../src/lib/sync";
import { catalogSource, createQuestCatalog, resetQuestCatalog } from "../src/lib/server/content";

const NOW = 1_800_000_000;
const DAY = 86_400;
// Invented characters only.
const OLD = "Player-7777-0000C001";
const NEW = "Player-7777-0000C002";
const DEGRADED = "Player-7777-0000C003";

const FIXTURE = `ForeverTrackerDB = { schema = 1, characters = {
  ["${OLD}"] = { snapshot = { takenAt = ${NOW - 9 * DAY},
    identity = { name = "Brannoc", class = "WARRIOR", race = "Orc", level = 22, xp = 840, xpMax = 1000 },
    time = { played = 100800 }, state = { zone = "Barrens", mapId = 1413, money = 1310000 },
    progress = { professions = {}, questsCompleted = { 11 }, questLog = {} } } },
  ["${NEW}"] = { snapshot = { takenAt = ${NOW - 720},
    identity = { name = "Elswyth", class = "PRIEST", race = "Human", level = 10, xp = 180, xpMax = 1000 },
    time = { played = 18120 }, state = { zone = "Dun Morogh", mapId = 1426, money = 110000 },
    progress = { professions = { { skillLine = 197, name = "Tailoring", rank = 30, max = 75 } },
      questsCompleted = { 1 }, questLog = { { id = 9002 } } } } },
  ["${DEGRADED}"] = { snapshot = { takenAt = ${NOW - 3 * DAY},
    identity = { unavailable = true, reason = "r" }, time = { unavailable = true, reason = "p" },
    state = { unavailable = true, reason = "s" }, progress = { unavailable = true, reason = "x" } } },
} }`;

function quest(id: number, name: string, level: number, zone: string, m: number) {
  return {
    id,
    name,
    level,
    zone: { n: zone, slug: zone.toLowerCase().replace(/ /g, "-"), m },
    chain: { previous: [], next: [], questLine: null },
    starts: null,
    ends: null,
  };
}

function putContent(db: Db, resource: string, id: string, data: unknown) {
  db.insert(contentRecord).values({ resource, id, build: "1.0", data: JSON.stringify(data), fetchedAt: NOW }).run();
}

function seeded(withQuests: boolean): Db {
  const db = openDb(":memory:");
  ingestSavedVariables(db, FIXTURE, () => NOW);
  if (withQuests) {
    putContent(db, "meta", "current", { build: "1.0", levelCap: 60 });
    putContent(db, "quests", "9001", quest(9001, "Trouble in the Pass", 9, "Dun Morogh", 1426));
    putContent(db, "quests", "9002", quest(9002, "Already Taken", 10, "Dun Morogh", 1426));
  }
  return db;
}

type PageData = {
  roster: { characters: { guid: string; name: string; class: string | null; level: number | null }[] };
  nextByGuid: Record<string, { title: string; reason: string } | null>;
  contentReady: boolean;
  contentMode: "mirror" | "on-demand";
  now: number;
};
const runLoad = async () => (await load({} as never)) as PageData;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW * 1000);
  state.e.contentMode = "mirror";
  state.e.ownerPassword = null;
  resetQuestCatalog();
});
afterEach(() => vi.useRealTimers());

describe("roster page load", () => {
  test("cards newest first, degraded identity still appears", async () => {
    state.db = seeded(false);
    const data = await runLoad();
    expect(data.roster.characters.map((c) => c.guid)).toEqual([NEW, DEGRADED, OLD]);
    const degraded = data.roster.characters[1]!;
    expect(degraded.name).toBe("Unknown character");
    expect(degraded.class).toBeNull();
    expect(degraded.level).toBeNull();
    expect(data.now).toBe(NOW);
  });

  test("empty mirror: contentReady false and every Next is null", async () => {
    state.db = seeded(false);
    const data = await runLoad();
    expect(data.contentReady).toBe(false);
    expect(data.nextByGuid).toEqual({ [NEW]: null, [DEGRADED]: null, [OLD]: null });
  });

  test("with quests: first nextUp suggestion per character, skipping quests in the log", async () => {
    state.db = seeded(true);
    const data = await runLoad();
    expect(data.contentReady).toBe(true);
    expect(data.nextByGuid[NEW]).toMatchObject({ title: "Trouble in the Pass", reason: "Level 9 quest in Dun Morogh." });
    expect(data.nextByGuid[OLD]).toBeNull();
    expect(data.nextByGuid[DEGRADED]).toBeNull();
  });

  test("on-demand mode: content is not loaded at page load, even with a filled mirror", async () => {
    state.db = seeded(true);
    state.e.contentMode = "on-demand";
    const data = await runLoad();
    expect(data.contentReady).toBe(false);
    expect(data.contentMode).toBe("on-demand");
    expect(Object.values(data.nextByGuid).every((n) => n === null)).toBe(true);
  });

  test("mirror mode is reported for the banner text", async () => {
    state.db = seeded(false);
    expect((await runLoad()).contentMode).toBe("mirror");
  });

  test("empty roster", async () => {
    state.db = openDb(":memory:");
    const data = await runLoad();
    expect(data.roster.characters).toEqual([]);
    expect(data.nextByGuid).toEqual({});
  });
});

describe("layout load", () => {
  test("loginEnabled follows OWNER_PASSWORD", async () => {
    expect(await layoutLoad({} as never)).toEqual({ loginEnabled: false });
    state.e.ownerPassword = "pw";
    expect(await layoutLoad({} as never)).toEqual({ loginEnabled: true });
  });
});

describe("classColor", () => {
  test("known tokens, case-insensitive", () => {
    expect(classColor("SHAMAN")).toBe("#0070dd");
    expect(classColor("shaman")).toBe("#0070dd");
    expect(classColor("Priest")).toBe("#ffffff");
    expect(classColor("DEATHKNIGHT")).toBe("#c41e3a");
  });
  test("unknown, empty and null fall back to the neutral colour", () => {
    expect(classColor("BARD")).toBe(NEUTRAL_CLASS_COLOR);
    expect(classColor("")).toBe(NEUTRAL_CLASS_COLOR);
    expect(classColor(null)).toBe(NEUTRAL_CLASS_COLOR);
  });
  test("seal text is dark on light class colours only", () => {
    expect(sealTextIsDark("PRIEST")).toBe(true);
    expect(sealTextIsDark("rogue")).toBe(true);
    expect(sealTextIsDark("SHAMAN")).toBe(false);
    expect(sealTextIsDark("DEATHKNIGHT")).toBe(false);
    expect(sealTextIsDark(null)).toBe(false);
  });
});

describe("className", () => {
  test("display names for tokens", () => {
    expect(className("SHAMAN")).toBe("Shaman");
    expect(className("deathknight")).toBe("Death Knight");
    expect(className("DEMONHUNTER")).toBe("Demon Hunter");
    expect(className("BARD")).toBe("Bard");
    expect(className(null)).toBeNull();
    expect(className("")).toBeNull();
  });
});

describe("raceName", () => {
  test("race tokens read as words", () => {
    expect(raceName("NightElf")).toBe("Night Elf");
    expect(raceName("BloodElf")).toBe("Blood Elf");
    expect(raceName("Scourge")).toBe("Undead");
    expect(raceName("Dwarf")).toBe("Dwarf");
    expect(raceName(null)).toBeNull();
  });
});

describe("syncLabel", () => {
  test("ago", () => {
    expect(ago(30)).toBe("just now");
    expect(ago(12 * 60)).toBe("12 min ago");
    expect(ago(2 * 3600)).toBe("2 hours ago");
    expect(ago(9 * DAY)).toBe("9 days ago");
    expect(ago(-5)).toBe("just now");
  });

  const at = (ago: number, syncedAgo: "fresh" | "stale" | "unknown") => syncLabel({ takenAt: NOW - ago, syncedAgo }, NOW);
  test("fresh is plain relative time", () => {
    expect(at(20, "fresh")).toEqual({ text: "synced just now", stale: false });
    expect(at(12 * 60, "fresh")).toEqual({ text: "synced 12 min ago", stale: false });
    expect(at(3600, "fresh")).toEqual({ text: "synced 1 hour ago", stale: false });
    expect(at(5 * 3600 + 59, "fresh")).toEqual({ text: "synced 5 hours ago", stale: false });
    expect(at(DAY + 10, "fresh")).toEqual({ text: "synced 1 day ago", stale: false });
  });
  test("stale counts whole days without an upload", () => {
    expect(at(9 * DAY + 500, "stale")).toEqual({ text: "no upload for 9 days", stale: true });
  });
  test("unknown is calm", () => {
    expect(syncLabel({ takenAt: 0, syncedAgo: "unknown" }, NOW)).toEqual({ text: "sync time unknown", stale: false });
  });
});

describe("quest catalog memo", () => {
  function counting(db: Db) {
    const inner = catalogSource("mirror", db)!;
    const calls = { list: 0 };
    const source: ContentSource = {
      get: inner.get,
      list: (r, o) => {
        calls.list++;
        return inner.list(r, o);
      },
    };
    return { source, calls };
  }

  test("caches for 60 s on the injected clock, then reloads", async () => {
    const db = seeded(true);
    const { source, calls } = counting(db);
    let t = 0;
    const memo = createQuestCatalog({ source: () => source, now: () => t });
    const first = await memo.get();
    expect(first.quests.map((q) => q.id)).toEqual([9001, 9002]);
    expect(first.levelCap).toBe(60);
    t = 59_999;
    expect(await memo.get()).toBe(first);
    expect(calls.list).toBe(1);
    putContent(db, "quests", "9003", quest(9003, "Later", 11, "Dun Morogh", 1426));
    t = 60_000;
    const second = await memo.get();
    expect(calls.list).toBe(2);
    expect(second.quests).toHaveLength(3);
  });

  test("concurrent callers share one load", async () => {
    const { source, calls } = counting(seeded(true));
    const memo = createQuestCatalog({ source: () => source, now: () => 0 });
    await Promise.all([memo.get(), memo.get(), memo.get()]);
    expect(calls.list).toBe(1);
  });

  test("a failed load is not cached", async () => {
    let fail = true;
    const good = catalogSource("mirror", seeded(true))!;
    const source: ContentSource = {
      get: good.get,
      list: async (r, o) => {
        if (fail) throw new Error("boom");
        return good.list(r, o);
      },
    };
    const memo = createQuestCatalog({ source: () => source, now: () => 0 });
    await expect(memo.get()).rejects.toThrow("boom");
    fail = false;
    expect((await memo.get()).quests).toHaveLength(2);
  });

  test("empty mirror gives the empty shape even when meta has a level cap", async () => {
    const db = openDb(":memory:");
    putContent(db, "meta", "current", { build: "1.0", levelCap: 60 });
    const memo = createQuestCatalog({ source: () => catalogSource("mirror", db), now: () => 0 });
    expect(await memo.get()).toEqual({ quests: [], levelCap: null });
  });

  test("on-demand mode never builds a source (no network at page load)", async () => {
    expect(catalogSource("on-demand", seeded(true))).toBeNull();
    const memo = createQuestCatalog({ source: () => null, now: () => 0 });
    expect(await memo.get()).toEqual({ quests: [], levelCap: null });
  });

  test("the mirror source is built without a network client", async () => {
    const source = catalogSource("mirror", seeded(true))!;
    expect(await source.get("meta", "current")).toMatchObject({ levelCap: 60 });
  });
});
