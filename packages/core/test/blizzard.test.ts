import { describe, expect, test } from "vitest";
import { emptyCurated } from "../src/curated/types";
import { parseCurated } from "../src/curated/load";
import { parseBlizzardQuest } from "../src/index";

const shaman = {
  id: 94499,
  title: "Call of Water",
  category: { name: "Shaman", id: 82 },
  requirements: { classes: [{ name: "Shaman", id: 7 }], faction: { type: "ALLIANCE", name: "Alliance" } },
};

describe("parseBlizzardQuest", () => {
  test("reads class, faction and title", () => {
    expect(parseBlizzardQuest(shaman)).toEqual({
      id: 94499, title: "Call of Water", classes: ["Shaman"], races: [], faction: "Alliance", profession: null, area: null, prereqs: [], xp: null,
    });
  });
  test("a profession category becomes the profession; a class category does not", () => {
    expect(parseBlizzardQuest({ id: 5, title: "Boil", category: { name: "Cooking" }, requirements: {} })!.profession).toBe("Cooking");
    expect(parseBlizzardQuest(shaman)!.profession).toBeNull();
  });
  test("reads races and rejects documents without id or title", () => {
    const q = parseBlizzardQuest({ id: 7, title: "T", requirements: { races: [{ name: "Night Elf" }, { name: "High Order Skyborne" }] } })!;
    expect(q.races).toEqual(["Night Elf", "High Order Skyborne"]);
    expect(parseBlizzardQuest({ title: "x" })).toBeNull();
    expect(parseBlizzardQuest({ id: 3 })).toBeNull();
  });
});

describe("blizzard-quests.json in parseCurated", () => {
  const file = (quests: unknown[]) => ({ version: 1, quests });
  const q = { id: 94499, title: "Call of Water", classes: ["Shaman"], races: [], faction: "Alliance", profession: null, area: null, prereqs: [], xp: null };

  test("adds tags, sides and names", () => {
    const c = parseCurated({ blizzard: file([q]) });
    expect(c.tags.tags).toEqual([{ questId: 94499, kind: "class", value: "Shaman" }]);
    expect(c.sides[94499]).toBe("Alliance");
    expect(c.names[94499]).toBe("Call of Water");
  });
  test("Blizzard's tags replace captured ones for quests it knows; captures stand for the rest", () => {
    const c = parseCurated({
      tags: {
        version: 1,
        tags: [
          { questId: 94499, kind: "class", value: "Warrior" },
          { questId: 94499, kind: "profession", value: "Cooking" },
          { questId: 1, kind: "class", value: "Mage" },
        ],
      },
      blizzard: file([q]),
    });
    expect(c.tags.tags).toEqual([
      { questId: 1, kind: "class", value: "Mage" },
      { questId: 94499, kind: "class", value: "Shaman" },
    ]);
  });
  test("bad entries are dropped and an unsupported version is a problem", () => {
    expect(parseCurated({ blizzard: file([{ id: "x" }, q]) }).names).toEqual({ 94499: "Call of Water" });
    expect(parseCurated({ blizzard: { version: 9, quests: [q] } }).problems.length).toBe(1);
    expect(emptyCurated().sides).toEqual({});
  });
});

describe("synthesizeQuests", () => {
  const zones = [
    { name: "Mount Hyjal", minLevel: 55, maxLevel: 60, territory: null, type: "zone" as const },
    { name: "Gnomeregan", minLevel: 24, maxLevel: 33, territory: null, type: "dungeon" as const },
  ];
  const mk = (id: number, area: string | null, extra: object = {}) => ({
    id, title: `Q${id}`, classes: [], races: [], faction: null, profession: null, area, prereqs: [], xp: null, ...extra,
  });
  const mapIds = new Map([["mount hyjal", 1198]]);

  test("adds a quest in a curated zone at the middle of its level range", async () => {
    const { synthesizeQuests } = await import("../src/curated/blizzard");
    const [q] = synthesizeQuests([mk(1, "Mount Hyjal", { faction: "Horde" })], new Set(), zones, mapIds);
    expect(q).toMatchObject({ id: 1, name: "Q1", level: 58, zone: { n: "Mount Hyjal", m: 1198 }, side: "h" });
  });
  test("skips quests the mirror has, without an area, in dungeons, or in zones with no map id", async () => {
    const { synthesizeQuests } = await import("../src/curated/blizzard");
    const got = synthesizeQuests(
      [mk(1, "Mount Hyjal"), mk(2, null), mk(3, "Gnomeregan"), mk(4, "Mount Hyjal")],
      new Set([1]),
      zones,
      mapIds,
    );
    expect(got.map((q) => q.id)).toEqual([4]);
  });
  test("keeps prerequisites that exist", async () => {
    const { synthesizeQuests } = await import("../src/curated/blizzard");
    const got = synthesizeQuests([mk(5, "Mount Hyjal", { prereqs: [9, 777] }), mk(9, null)], new Set(), zones, mapIds);
    expect(got[0]!.chain.previous.map((l) => l.questId)).toEqual([9]);
  });
});
