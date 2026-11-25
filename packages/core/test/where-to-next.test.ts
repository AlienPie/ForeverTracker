import { describe, expect, test } from "vitest";
import type { ZoneProgress } from "../src/advice/exploration";
import { whereToNext } from "../src/advice/where-to-next";

const zone = (name: string, over: Partial<ZoneProgress>): ZoneProgress =>
  ({
    name, minLevel: 10, maxLevel: 20, territory: "Contested", mapId: 1, fit: "in-range", visited: false, done: 0, inLog: 0,
    left: 0, skipped: 0, total: 0, ruledOut: 0, openLevels: [], lastDoneAt: null, completedQuests: [], inProgress: [],
    remaining: [], skippedQuests: [], ...over,
  }) as ZoneProgress;

describe("whereToNext", () => {
  const levels = (n: number, l: number) => Array.from({ length: n }, () => l);

  test("ranks zones by open quests near the level, then by closeness", () => {
    const got = whereToNext(
      [
        zone("Few", { openLevels: levels(3, 15) }),
        zone("Many", { openLevels: levels(8, 15) }),
        zone("MannyFar", { minLevel: 25, maxLevel: 30, openLevels: levels(8, 15) }),
      ],
      { level: 15, faction: "Alliance" },
    );
    expect(got.map((z) => z.name)).toEqual(["Many", "MannyFar", "Few"]);
    expect(got[0]!.fitting).toBe(8);
    expect(got[0]!.reason).toContain("8 open quests of levels 12 to 17");
  });

  test("ignores quests outside the window and zones with fewer than three fitting", () => {
    expect(whereToNext([zone("Z", { openLevels: [5, 6, 7, 30, 31, 15, 15] })], { level: 15, faction: null })).toEqual([]);
  });

  test("leaves out the other faction's territory and zones without levels", () => {
    const got = whereToNext(
      [
        zone("Horde land", { territory: "Horde", openLevels: levels(5, 15) }),
        zone("Unknown", { minLevel: null, maxLevel: null, openLevels: levels(5, 15) }),
        zone("Shared", { openLevels: levels(4, 15) }),
      ],
      { level: 15, faction: "Alliance" },
    );
    expect(got.map((z) => z.name)).toEqual(["Shared"]);
  });

  test("says whether the zone was visited and flags the current one", () => {
    const [a] = whereToNext([zone("Here", { visited: true, done: 4, total: 12, openLevels: levels(4, 15) })], {
      level: 15, faction: null, current: "here",
    });
    expect(a!.here).toBe(true);
    expect(a!.reason).toContain("you have done 4 of 12 there");
    const [b] = whereToNext([zone("New", { openLevels: levels(4, 15) })], { level: 15, faction: null });
    expect(b!.reason).toContain("you have not been there yet");
  });

  test("returns at most the asked number", () => {
    const zs = ["A", "B", "C", "D"].map((n) => zone(n, { openLevels: levels(4, 15) }));
    expect(whereToNext(zs, { level: 15, faction: null }, 2)).toHaveLength(2);
  });
});
