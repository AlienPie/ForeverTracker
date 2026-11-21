import { describe, expect, test } from "vitest";
import { readCuratedDir, type CuratedZone, type QuestRow } from "../src/index";
import { placeZones, zoneProgress, type ExplorationInput } from "../src/advice/exploration";

const link = (questId: number) => ({ questId, name: `Quest ${questId}`, relation: "Complete first" });
function q(id: number, level: number, zone: string | null, m: number | null = 1, previous: number[] = [], next: number[] = []): QuestRow {
  return {
    id,
    name: `Quest ${id}`,
    level,
    zone: zone === null ? null : { n: zone, slug: zone.toLowerCase().replace(/\s+/g, "-"), m },
    chain: { previous: previous.map(link), next: next.map(link), questLine: null },
    starts: null,
    ends: null,
  };
}
const set = (...n: number[]) => new Set(n);
const cz = (name: string, minLevel: number | null, maxLevel: number | null, type: CuratedZone["type"] = "zone"): CuratedZone => ({
  name,
  minLevel,
  maxLevel,
  territory: null,
  type,
});
const input = (over: Partial<ExplorationInput>): ExplorationInput => ({
  quests: [],
  level: 10,
  completed: set(),
  inLog: set(),
  visitedMapIds: new Set(),
  ...over,
});
const only = (r: ReturnType<typeof zoneProgress>, name = "Elwynn Forest") => r.zones.find((z) => z.name === name)!;

describe("placeZones", () => {
  test("merges duplicates, drops non-zones, unused zones and case/space variants; adds quest-only zones", () => {
    const zones: CuratedZone[] = [
      cz("Elwynn Forest", null, null),
      { ...cz("Elwynn Forest", 1, 10), territory: "Alliance" },
      cz("The Deadmines", 15, 25, "dungeon"),
      cz("Unused", 5, 9),
      cz("  elwynn forest ", 2, 3),
    ];
    const quests = [q(1, 1, "Elwynn Forest", 1429), q(2, 1, "The Deadmines", 1581), q(3, 5, "Mystery Vale", 77), q(4, 1, "ELWYNN  FOREST".replace("  ", " "), 1429)];
    expect(placeZones(zones, quests)).toEqual([
      { name: "Elwynn Forest", minLevel: 1, maxLevel: 10, territory: "Alliance" },
      { name: "Mystery Vale", minLevel: null, maxLevel: null, territory: null },
      { name: "The Deadmines", minLevel: null, maxLevel: null, territory: null },
    ]);
  });

  test("undefined zones lists only quest zones, sorted by name", () => {
    const quests = [q(1, 1, "Zed", 2), q(2, 1, "Alpha", 3), q(3, 1, "Null", null), q(4, 1, null)];
    expect(placeZones(undefined, quests).map((z) => z.name)).toEqual(["Alpha", "Zed"]);
  });

  test("real zones.json has no repeated names", () => {
    const { zones } = readCuratedDir(new URL("../../../data/curated", import.meta.url).pathname);
    const names = zones.filter((z) => z.type === "zone").map((z) => z.name);
    expect(names.length).toBeGreaterThan(0);
    const quests = names.map((n, i) => q(i + 1, 1, n, i + 1));
    const placed = placeZones(zones, quests).map((z) => z.name.trim().toLowerCase());
    expect(new Set(placed).size).toBe(placed.length);
  });
});

describe("zoneProgress counting", () => {
  const zones = [cz("Elwynn Forest", 1, 10)];
  const quests = [
    q(1, 1, "Elwynn Forest", 1429, [], [2]),
    q(2, 2, "Elwynn Forest", 1429, [1], [3]),
    q(3, 3, "Elwynn Forest", 1429, [2]),
    q(4, 4, "Elwynn Forest", 1429), // in log
    q(5, 6, "Elwynn Forest", 1429), // left
    q(6, 5, "Elwynn Forest", 1429), // left, lower level
    q(7, 7, "Elwynn Forest", 1429), // unusable
    { ...q(8, 8, "Elwynn Forest", 1429), side: "h" as const }, // other faction
  ];

  test("done, in log, left, skipped, ignored", () => {
    const r = zoneProgress(input({ quests, zones, completed: set(1, 3), inLog: set(4), faction: "Alliance", usable: (x) => x.id !== 7 }));
    const z = only(r);
    expect(z).toMatchObject({ done: 2, inLog: 1, left: 2, skipped: 1, total: 5, mapId: 1429, fit: "in-range", visited: true });
    expect(z.remaining).toEqual([
      { id: 6, name: "Quest 6", level: 5 },
      { id: 5, name: "Quest 5", level: 6 },
    ]);
    expect(z.skippedQuests).toEqual([{ id: 2, name: "Quest 2", level: 2 }]);
    expect(r.unplaced).toBe(0);
  });

  test("completed other-faction and unusable quests still count as done; completed wins over in-log", () => {
    const z = only(zoneProgress(input({ quests, zones, completed: set(7, 8, 4), inLog: set(4), faction: "Alliance", usable: (x) => x.id !== 7 })));
    expect(z.done).toBe(3);
    expect(z.inLog).toBe(0);
  });

  test("unplaced counts null zone and null map; neither is in a zone", () => {
    const qs = [q(1, 1, "Elwynn Forest", 1429), q(2, 1, null), q(3, 1, "Warlock", null)];
    const r = zoneProgress(input({ quests: qs, zones }));
    expect(r.unplaced).toBe(2);
    expect(r.zones.reduce((n, z) => n + z.total, 0)).toBe(1);
  });

  test("all quests unusable: total 0, kept, no throw; empty completed gives skipped 0", () => {
    const r = zoneProgress(input({ quests: [q(1, 1, "Elwynn Forest", 1429, [], [2]), q(2, 2, "Elwynn Forest", 1429, [1])], zones, usable: () => false }));
    expect(only(r)).toMatchObject({ total: 0, skipped: 0, done: 0, left: 0 });
  });
});

describe("zoneProgress visited and fit", () => {
  const zones = [cz("Elwynn Forest", 5, 10)];
  const quests = [q(1, 1, "Elwynn Forest", 1429), q(2, 2, "Elwynn Forest", 1429)];

  test("visited by map id", () => {
    const z = only(zoneProgress(input({ quests, zones, visitedMapIds: new Set([1429]) })));
    expect(z.visited).toBe(true);
    expect(z.remaining.map((x) => x.id)).toEqual([1, 2]);
  });
  test("visited by a done quest", () => {
    expect(only(zoneProgress(input({ quests, zones, completed: set(1) }))).visited).toBe(true);
  });
  test("not visited: empty lists, correct counts", () => {
    const z = only(zoneProgress(input({ quests, zones })));
    expect(z).toMatchObject({ visited: false, left: 2, total: 2, remaining: [], skippedQuests: [] });
  });

  test.each([
    [3, "below"],
    [7, "in-range"],
    [12, "above"],
    [null, "unknown"],
  ] as const)("fit at level %s is %s", (level, fit) => {
    expect(only(zoneProgress(input({ quests, zones, level }))).fit).toBe(fit);
  });
  test("fit unknown with null minLevel", () => {
    expect(only(zoneProgress(input({ quests, zones: [cz("Elwynn Forest", null, null)] }))).fit).toBe("unknown");
  });

  test("splits a visited zone into completed, in progress (log or chain) and not started", () => {
    const quests = [
      q(1, 1, "Zed", 9),
      q(2, 2, "Zed", 9, [1], [3]),
      q(3, 3, "Zed", 9, [2]),
      q(4, 4, "Zed", 9),
      q(5, 5, "Zed", 9),
    ];
    const { zones } = zoneProgress(input({ quests, completed: set(1), inLog: set(4) }));
    const z = zones[0]!;
    expect(z.completedQuests.map((x) => x.id)).toEqual([1]);
    expect(z.inProgress.map((x) => [x.id, x.inLog])).toEqual([
      [2, false],
      [3, false],
      [4, true],
    ]);
    expect(z.remaining.map((x) => x.id)).toEqual([5]);
    expect(z.left).toBe(3);
  });

  test("a completed per-zone copy of a quest is ruled out of a zone with no recorded visit", () => {
    const quests = [q(1, 1, "Home", 10), q(2, 1, "Home", 10), q(3, 1, "Far", 20), q(4, 1, "Far", 20)];
    quests[0]!.name = "Camping 101"; // same name in both zones
    quests[2]!.name = "Camping 101";
    const z = (visited: number[], completed: number[]) =>
      Object.fromEntries(zoneProgress(input({ quests, completed: set(...completed), visitedMapIds: new Set(visited) })).zones.map((x) => [x.name, x]));
    const a = z([10], [1, 3, 4]); // Far unvisited: copy 3 ruled out, quest 4 (unique name) still counts
    expect(a.Far).toMatchObject({ done: 1, ruledOut: 1, visited: true });
    expect(a.Home).toMatchObject({ done: 1, ruledOut: 0 });
    const b = z([10], [3]); // only the copy done there, no visit: not visited at all
    expect(b.Far).toMatchObject({ done: 0, ruledOut: 1, visited: false });
    const c = z([], [3]); // no visits recorded at all: nothing is ruled out
    expect(c.Far).toMatchObject({ done: 1, ruledOut: 0, visited: true });
  });
});

describe("same-name copies in one zone", () => {
  test("counts quests sharing a name and level once, preferring the finished copy", () => {
    const mk = (id: number, name: string, level: number) =>
      ({ id, name, level, zone: { n: "Dun Morogh", m: 1426 }, side: "both" }) as never;
    const quests = [mk(1, "The Sparklematic 5200!", 30), mk(2, "The Sparklematic 5200!", 30), mk(3, "Other", 30)];
    const { zones } = zoneProgress({
      quests,
      level: 30,
      completed: new Set([2]),
      inLog: new Set(),
      visitedMapIds: new Set([1426]),
    });
    const z = zones.find((x) => x.name === "Dun Morogh")!;
    expect(z.total).toBe(2);
    expect(z.done).toBe(1);
    expect(z.completedQuests.map((q) => q.id)).toEqual([2]);
    expect(z.remaining.map((q) => q.id)).toEqual([3]);
  });
});
