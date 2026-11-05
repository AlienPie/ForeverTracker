import { describe, expect, test } from "vitest";
import { validCompleted, type QuestLink, type QuestRow } from "../src/index";

const link = (questId: number, relation = "Complete first"): QuestLink => ({ questId, name: `Quest ${questId}`, relation });

/** Tiny synthetic quest; names are invented. */
function q(id: number, previous: QuestLink[] = [], next: QuestLink[] = []): QuestRow {
  return { id, name: `Quest ${id}`, level: 1, zone: null, chain: { previous, next, questLine: null }, starts: null, ends: null };
}

const sorted = (s: Set<number>) => [...s].sort((a, b) => a - b);

describe("validCompleted", () => {
  // 1 -> 2 -> 3
  const LINE = [q(1, [], [link(2)]), q(2, [link(1)], [link(3)]), q(3, [link(2)])];

  test("a completed quest counts only when every earlier quest is completed", () => {
    expect(sorted(validCompleted(LINE, new Set([1, 2, 3])))).toEqual([1, 2, 3]);
    expect(sorted(validCompleted(LINE, new Set([2, 3])))).toEqual([]);
    expect(sorted(validCompleted(LINE, new Set([1, 3])))).toEqual([1]);
    expect(sorted(validCompleted(LINE, new Set([3])))).toEqual([]);
    expect(sorted(validCompleted(LINE, new Set()))).toEqual([]);
  });

  test("a quest with no prerequisites is valid when completed; uncompleted ids never appear", () => {
    expect(sorted(validCompleted([q(5)], new Set([5])))).toEqual([5]);
    expect(sorted(validCompleted([q(5)], new Set()))).toEqual([]);
  });

  test("prerequisites not in the quests passed in count as satisfied; unknown completed ids are kept", () => {
    expect(sorted(validCompleted([q(2, [link(1)])], new Set([2])))).toEqual([2]);
    expect(sorted(validCompleted([q(2, [link(1)])], new Set([2, 424242])))).toEqual([2, 424242]);
  });

  test("a one-sided next link is an earlier quest too, and every prerequisite relation counts", () => {
    expect(sorted(validCompleted([q(1, [], [link(2, "Next quest")]), q(2)], new Set([2])))).toEqual([]);
    for (const rel of ["Complete first", "Chain link", "Offered after", "Next quest"]) {
      expect(sorted(validCompleted([q(1), q(2, [link(1, rel)])], new Set([2]))), rel).toEqual([]);
    }
  });

  test("'Must be active', 'Quest line' and odd relations are not earlier quests", () => {
    for (const rel of ["Must be active", "Quest line", "Nonsense"]) {
      expect(sorted(validCompleted([q(1), q(2, [link(1, rel)])], new Set([2]))), rel).toEqual([2]);
    }
    const odd = [q(1), { ...q(2), chain: { previous: [null, "x", { questId: 1 }, { questId: 1, relation: 5 }], next: "no" } }] as unknown as QuestRow[];
    expect(sorted(validCompleted(odd, new Set([2])))).toEqual([2]);
    expect(sorted(validCompleted([{ ...q(3), chain: null } as unknown as QuestRow], new Set([3])))).toEqual([3]);
  });

  test("an earlier quest more than one step back must be completed (transitive)", () => {
    // 1 -> 2 -> 3 -> 4, branch 1 -> 5. Only 1 missing.
    const quests = [q(1), q(2, [link(1)]), q(3, [link(2)]), q(4, [link(3)]), q(5, [link(1)])];
    expect(sorted(validCompleted(quests, new Set([2, 3, 4, 5])))).toEqual([]);
    expect(sorted(validCompleted(quests, new Set([1, 2, 4, 5])))).toEqual([1, 2, 5]);
  });

  test("cycles terminate; a cycle member counts only when the whole cycle and its ancestors are completed", () => {
    // 0 -> 1 -> 2 -> 3 -> 1
    const cyc = [q(0), q(1, [link(0), link(3)]), q(2, [link(1)]), q(3, [link(2)])];
    expect(sorted(validCompleted(cyc, new Set([0, 1, 2, 3])))).toEqual([0, 1, 2, 3]);
    expect(sorted(validCompleted(cyc, new Set([0, 1, 2])))).toEqual([0]);
    expect(sorted(validCompleted(cyc, new Set([1, 2, 3])))).toEqual([]);
    // Self-links are ignored.
    expect(sorted(validCompleted([q(9, [link(9)])], new Set([9])))).toEqual([9]);
  });

  test("4000 quests finish quickly", () => {
    const quests: QuestRow[] = [];
    for (let i = 1; i <= 4000; i++) quests.push(q(i, i % 5 === 1 ? [] : [link(i - 1)], [link(i + 1)]));
    const completed = new Set(Array.from({ length: 4000 }, (_, i) => i + 1).filter((i) => i % 7 !== 0));
    const t = performance.now();
    const out = validCompleted(quests, completed);
    expect(performance.now() - t).toBeLessThan(2000);
    expect(out.has(1)).toBe(true);
    expect(out.has(8)).toBe(false); // 7 missing, 8 follows it
  });
});
