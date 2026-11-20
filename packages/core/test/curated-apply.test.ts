import { describe, expect, test } from "vitest";
import { applyOverrides, buildTagIndex, chainDetail, type QuestRow } from "../src/index";
import camping from "./fixtures/quests-camping.json";

const quest = (id: number, name: string, previous: number[] = [], next: number[] = []): QuestRow => ({
  id,
  name,
  level: 6,
  zone: null,
  chain: {
    previous: previous.map((questId) => ({ questId, name: `q${questId}`, relation: "Offered after" })),
    next: next.map((questId) => ({ questId, name: `q${questId}`, relation: "Offered after" })),
    questLine: null,
  },
  starts: null,
  ends: null,
});

const dunMoroghAdventurer: QuestRow = {
  ...quest(96628, "The Adventurer"),
  zone: { n: "Dun Morogh", slug: "dun-morogh", m: 1426 },
};
const link = { from: 96628, to: 96626, note: "Camping 101 follows The Adventurer" };

describe("applyOverrides", () => {
  test("adds a Curated link on both sides without mutating the input", () => {
    const quests = [...(camping as QuestRow[]), dunMoroghAdventurer];
    const before = JSON.stringify(quests);
    const r = applyOverrides(quests, [link]);
    expect(JSON.stringify(quests)).toBe(before);
    expect(r.problems).toEqual([]);
    const cooking = r.quests.find((q) => q.id === 96626)!;
    expect(cooking.chain.previous.map((l) => l.questId).sort()).toEqual([95998, 96628]);
    expect(cooking.chain.previous.find((l) => l.questId === 96628)).toEqual({
      questId: 96628,
      name: "The Adventurer",
      relation: "Curated",
    });
    const adv = r.quests.find((q) => q.id === 96628)!;
    expect(adv.chain.next).toEqual([{ questId: 96626, name: "Camping 101: Cooking", relation: "Curated" }]);
    // untouched quests keep their identity
    expect(r.quests.find((q) => q.id === 95998)).toBe(quests.find((q) => q.id === 95998));
  });

  test("a link with an unknown id is skipped with a problem", () => {
    const quests = [quest(1, "A")];
    const r = applyOverrides(quests, [{ from: 1, to: 2, note: null }]);
    expect(r.quests).toEqual(quests);
    expect(r.problems).toHaveLength(1);
    expect(r.problems[0]).toMatch(/2/);
  });

  test("a link that would create a cycle is skipped with a problem", () => {
    const quests = [quest(1, "A", [], [2]), quest(2, "B", [1], [])];
    const r = applyOverrides(quests, [{ from: 2, to: 1, note: null }]);
    expect(r.quests).toEqual(quests);
    expect(r.problems).toHaveLength(1);
    expect(r.problems[0]).toMatch(/cycle/);
  });

  test("a duplicate link is not added twice", () => {
    const quests = [quest(1, "A", [], [2]), quest(2, "B", [1], [])];
    const once = applyOverrides(quests, [{ from: 1, to: 2, note: null }]);
    expect(once.quests).toEqual(quests);
    const twice = applyOverrides([quest(1, "A"), quest(2, "B")], [
      { from: 1, to: 2, note: null },
      { from: 1, to: 2, note: null },
    ]);
    expect(twice.quests.find((q) => q.id === 2)!.chain.previous).toHaveLength(1);
    expect(twice.quests.find((q) => q.id === 1)!.chain.next).toHaveLength(1);
  });

  test("the override puts Camping 101 in the Adventurer's chain; without it, it is not", () => {
    const quests = [...(camping as QuestRow[]), dunMoroghAdventurer];
    const without = chainDetail(quests, 96628, new Set(), new Set());
    expect(without!.members.map((m) => m.questId)).toEqual([96628]);
    const { quests: applied } = applyOverrides(quests, [link]);
    const withIt = chainDetail(applied, 96628, new Set(), new Set())!;
    const names = withIt.members.map((m) => m.name);
    expect(names).toContain("Camping 101: Cooking");
    expect(withIt.members.map((m) => m.questId)).toContain(96626);
    expect(withIt.members.find((m) => m.questId === 96626)!.state).toBe("locked");
    const done = chainDetail(applied, 96628, new Set([96628]), new Set())!;
    expect(done.members.find((m) => m.questId === 96626)!.state).toBe("available");
  });
});

describe("buildTagIndex", () => {
  test("returns tags as given; first profession wins; untagged is empty", () => {
    const idx = buildTagIndex([
      { questId: 1, kind: "race", value: "Dwarf" },
      { questId: 1, kind: "race", value: "Gnome" },
      { questId: 1, kind: "class", value: "Mage" },
      { questId: 2, kind: "profession", value: "Cooking" },
      { questId: 2, kind: "profession", value: "Fishing" },
    ]);
    expect(idx.hasTags).toBe(true);
    expect(idx.racesOf(1)).toEqual(["Dwarf", "Gnome"]);
    expect(idx.classesOf(1)).toEqual(["Mage"]);
    expect(idx.professionOf(2)).toBe("Cooking");
    expect(idx.professionOf(1)).toBeNull();
    expect(idx.racesOf(99)).toEqual([]);
    expect(idx.classesOf(99)).toEqual([]);
  });

  test("hasTags is false for an empty list", () => {
    expect(buildTagIndex([]).hasTags).toBe(false);
  });
});
