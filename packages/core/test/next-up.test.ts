import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { nextUp, type NextUpInput, type QuestLink, type QuestRow } from "../src/index";

const FIXTURE = JSON.parse(readFileSync(new URL("./fixtures/quests.json", import.meta.url), "utf8")) as QuestRow[];

const link = (questId: number, relation = "Complete first"): QuestLink => ({ questId, name: `Quest ${questId}`, relation });

/** Tiny synthetic quest; names and places are invented. */
function q(id: number, level: number, zone: string | null, previous: QuestLink[] = [], next: QuestLink[] = []): QuestRow {
  return {
    id,
    name: `Quest ${id}`,
    level,
    zone: zone === null ? null : { n: zone, slug: zone.toLowerCase(), m: null },
    chain: { previous, next, questLine: null },
    starts: {
      type: "npc",
      id: id + 100000,
      name: `Giver ${id}`,
      location: zone === null ? null : { uiMapId: 9001, zone, x: 10, y: 20 },
    },
    ends: null,
  };
}

function input(over: Partial<NextUpInput>): NextUpInput {
  return {
    level: 10,
    zone: "Mossvale",
    completed: new Set(),
    inLog: new Set(),
    quests: [],
    levelCap: 60,
    professions: [],
    ...over,
  };
}

describe("nextUp", () => {
  test("empty quests gives []", () => {
    expect(nextUp(input({ quests: [] }))).toEqual([]);
  });

  test("chain continuation outranks a same-area quest", () => {
    const quests = [q(10, 9, "Mossvale"), q(1, 5, "Elsewhere"), q(2, 6, "Elsewhere", [link(1)])];
    const out = nextUp(input({ quests, completed: new Set([1]) }));
    expect(out.map((s) => [s.kind, s.questId])).toEqual([
      ["chain", 2],
      ["area", 10],
    ]);
    const chain = out[0]!;
    expect(chain).toMatchObject({ title: "Quest 2", level: 6, source: "ForeverDB", confidence: "high" });
    expect(chain.reason).toContain("Quest 1");
    expect(chain.reason).toContain("Giver 2");
  });

  test("continuation needs every prerequisite done or in log, and at least one done", () => {
    const quests = [
      q(1, 5, null),
      q(2, 5, null),
      q(3, 6, null, [link(1), link(2, "Chain link")]),
      q(4, 6, null, [link(2, "Offered after")]),
    ];
    // 2 only in the log: 4 is not yet a continuation; 3 has 1 done + 2 in log: continuation.
    const out = nextUp(input({ quests, completed: new Set([1]), inLog: new Set([2]) }));
    expect(out.map((s) => s.questId)).toEqual([3]);
    // 1 missing entirely: 3 is not a continuation.
    expect(nextUp(input({ quests, completed: new Set([2]) })).map((s) => s.questId)).toEqual([4]);
  });

  test("'Must be active' and 'Quest line' links are not prerequisites", () => {
    const quests = [q(1, 5, null), q(2, 9, "Mossvale", [link(1, "Must be active")]), q(3, 5, null, [link(1, "Quest line")])];
    const out = nextUp(input({ quests, completed: new Set([1]) }));
    expect(out.map((s) => [s.kind, s.questId])).toEqual([["area", 2]]);
  });

  test("completed and in-log quests are never returned", () => {
    const quests = [q(1, 9, "Mossvale"), q(2, 9, "Mossvale"), q(3, 9, "Mossvale")];
    const out = nextUp(input({ quests, completed: new Set([1]), inLog: new Set([2]) }));
    expect(out.map((s) => s.questId)).toEqual([3]);
  });

  test("quests above the level cap are excluded; a null cap applies no filter", () => {
    const quests = [q(1, 59, null), q(2, 61, null, [link(1)]), q(3, 60, null, [link(1)])];
    const capped = nextUp(input({ level: 60, quests, completed: new Set([1]), levelCap: 60 }));
    expect(capped.map((s) => s.questId)).toEqual([3]);
    const uncapped = nextUp(input({ level: 60, quests, completed: new Set([1]), levelCap: null }));
    expect(uncapped.map((s) => s.questId)).toEqual([3, 2]);
  });

  test("a level 1 character with nothing done gets starter quests in their zone", () => {
    const quests = [
      q(101, 1, "Brightmoor"),
      q(102, 1, "Brightmoor", [link(101)]),
      q(103, 2, "Brightmoor"),
      q(104, 1, "Saltmarsh"),
      q(105, 4, "Brightmoor"),
      ...FIXTURE,
    ];
    const out = nextUp(input({ level: 1, zone: "brightmoor", quests }));
    expect(out.map((s) => [s.kind, s.questId])).toEqual([
      ["area", 101],
      ["next-level", 103],
    ]);
    expect(out[0]!.reason).toContain("Brightmoor");
    expect(out[0]!.reason).toContain("Giver 101");
  });

  test("area window is [level - 3, level]; next-level is level + 1, same area", () => {
    const quests = [q(1, 6, "Mossvale"), q(2, 7, "Mossvale"), q(3, 10, "Mossvale"), q(4, 11, "Mossvale"), q(5, 12, "Mossvale")];
    const out = nextUp(input({ level: 10, quests }));
    expect(out.map((s) => [s.kind, s.questId])).toEqual([
      ["area", 2],
      ["area", 3],
      ["next-level", 4],
    ]);
    expect(out[2]!.confidence).toBe("low");
  });

  test("optional mapId matches the starter's uiMapId", () => {
    const quests = [q(1, 10, "Somewhere Else")];
    expect(nextUp(input({ zone: "Mossvale", quests }))).toEqual([]);
    expect(nextUp(input({ zone: "Mossvale", mapId: 9001, quests })).map((s) => s.questId)).toEqual([1]);
  });

  test("real fixture: Elwynn Forest level 9 quest suggested for a level 9 in Elwynn", () => {
    const out = nextUp(input({ level: 9, zone: "Elwynn Forest", quests: FIXTURE }));
    expect(out.map((s) => [s.kind, s.questId])).toEqual([["area", 5545]]);
    expect(out[0]!.reason).toContain("Elwynn Forest");
  });

  test("real fixture: completing a predecessor surfaces the real continuation", () => {
    const out = nextUp(input({ level: 1, zone: null, quests: FIXTURE, completed: new Set([460]) }));
    expect(out.map((s) => [s.kind, s.questId, s.title])).toEqual([["chain", 461, "The Hidden Niche"]]);
  });

  test("limit defaults to 5 and ordering is deterministic (rank, level, id)", () => {
    const quests = [9, 8, 7, 6, 5, 4, 3, 2, 1].map((id) => q(id, 8 + (id % 3), "Mossvale"));
    const a = nextUp(input({ quests }));
    expect(a).toHaveLength(5);
    expect(a.map((s) => s.questId)).toEqual([3, 6, 9, 1, 4]);
    expect(nextUp(input({ quests: [...quests].reverse() }))).toEqual(a);
    expect(nextUp(input({ quests }), 2)).toHaveLength(2);
  });

  test("professions are accepted but produce no suggestions in v1", () => {
    const out = nextUp(input({ professions: [{ skillLine: 164, name: "Blacksmithing", rank: 40, max: 75 }], quests: FIXTURE }));
    expect(out.every((s) => s.kind !== "profession")).toBe(true);
  });

  test("odd endpoint and link values do not throw", () => {
    const odd = [
      { ...q(1, 10, "Mossvale"), starts: { type: null, id: null, name: null, location: null } },
      { ...q(2, 10, "Mossvale"), starts: null, ends: null },
      { ...q(3, 10, "Mossvale"), starts: { location: { zone: 5 } } },
      { ...q(4, 10, "Mossvale", [{ questId: 1, name: null, relation: 7 } as unknown as QuestLink]) },
      { ...q(5, 10, "Mossvale", [{ questId: 1 } as unknown as QuestLink]) },
      { ...q(6, 10, "Mossvale"), starts: "weird" },
    ] as unknown as QuestRow[];
    const out = nextUp(input({ quests: odd, completed: new Set([1]) }), 10);
    expect(out.map((s) => s.questId)).toEqual([2, 3, 4, 5, 6]);
    for (const s of out) expect(typeof s.reason).toBe("string");
  });

  test("4000 quests finish quickly", () => {
    const quests: QuestRow[] = [];
    for (let i = 1; i <= 4000; i++) quests.push(q(i, (i % 60) + 1, `Zone ${i % 40}`, i % 5 === 1 ? [] : [link(i - 1)], [link(i + 1)]));
    const completed = new Set(Array.from({ length: 2000 }, (_, i) => 2 * (i + 1)));
    const t = performance.now();
    const out = nextUp(input({ level: 30, zone: "Zone 7", quests, completed }));
    expect(performance.now() - t).toBeLessThan(2000);
    expect(out.length).toBeGreaterThan(0);
  });
});
