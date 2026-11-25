import { describe, expect, test } from "vitest";
import { reputationRows, type RepReward } from "../src/index";

const rep = (id: number, name: string, tierName: string, value: number, max: number) => ({ id, name, tier: 4, tierName, value, max });
const reward = (questId: number, value: number, level = 10): RepReward => ({ questId, name: `Q${questId}`, level, value });

describe("reputationRows", () => {
  test("computes remaining and percent, and lists open reward quests biggest first", () => {
    const rows = reputationRows(
      [rep(47, "Ironforge", "Honored", 1607, 12000)],
      new Map([[47, [reward(1, 75), reward(2, 250), reward(3, 25)]]]),
      (id) => id !== 3,
    );
    expect(rows[0]).toMatchObject({ remaining: 10393, pct: 13, maxed: false, openCount: 2, openTotal: 325 });
    expect(rows[0]!.open.map((q) => q.questId)).toEqual([2, 1]);
  });

  test("Exalted is maxed with nothing remaining and sorts last; others by what is left", () => {
    const rows = reputationRows(
      [rep(1, "A", "Exalted", 0, 999), rep(2, "B", "Friendly", 100, 6000), rep(3, "C", "Honored", 11000, 12000)],
      {},
      () => true,
    );
    expect(rows.map((r) => r.name)).toEqual(["C", "B", "A"]);
    expect(rows[2]).toMatchObject({ maxed: true, remaining: 0, pct: 100 });
  });

  test("caps the list at five and ignores zero or negative rewards", () => {
    const many = Array.from({ length: 8 }, (_, i) => reward(i + 1, 10 + i));
    const [row] = reputationRows([rep(9, "Z", "Neutral", 0, 3000)], { 9: [...many, reward(99, 0), reward(98, -5)] }, () => true);
    expect(row!.open).toHaveLength(5);
    expect(row!.openCount).toBe(8);
  });
});
