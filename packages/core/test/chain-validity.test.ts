import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { validCompleted, type QuestLink, type QuestRow } from "../src/index";

const link = (questId: number, relation = "Complete first"): QuestLink => ({ questId, name: `Quest ${questId}`, relation });

/** Tiny synthetic quest; names are invented. */
function q(id: number, previous: QuestLink[] = [], next: QuestLink[] = []): QuestRow {
  return { id, name: `Quest ${id}`, level: 1, zone: null, chain: { previous, next, questLine: null }, starts: null, ends: null };
}

const sorted = (s: Set<number>) => [...s].sort((a, b) => a - b);

/** Real rows whose several prerequisites are ALTERNATIVES (see quests.fixture.md, quests-alternatives.json). */
const ALT = JSON.parse(readFileSync(new URL("./fixtures/quests-alternatives.json", import.meta.url), "utf8")) as QuestRow[];

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

  test("cycles terminate; a cycle member counts only when fed from a valid quest outside the cycle", () => {
    // 0 -> 1 -> 2 -> 3 -> 1
    const cyc = [q(0), q(1, [link(0), link(3)]), q(2, [link(1)]), q(3, [link(2)])];
    expect(sorted(validCompleted(cyc, new Set([0, 1, 2, 3])))).toEqual([0, 1, 2, 3]);
    // 0 is valid and feeds 1 (one of its alternatives), 1 feeds 2; 3 is not completed.
    expect(sorted(validCompleted(cyc, new Set([0, 1, 2])))).toEqual([0, 1, 2]);
    // Nothing outside the cycle is valid: the cycle never validates itself.
    expect(sorted(validCompleted(cyc, new Set([1, 2, 3])))).toEqual([]);
    // A pure cycle with no way in never counts, even fully completed.
    const ring = [q(1, [link(3)]), q(2, [link(1)]), q(3, [link(2)])];
    expect(sorted(validCompleted(ring, new Set([1, 2, 3])))).toEqual([]);
    // Self-links are ignored.
    expect(sorted(validCompleted([q(9, [link(9)])], new Set([9])))).toEqual([9]);
  });

  test("several prerequisites are alternatives: one valid prerequisite is enough", () => {
    // 3 needs 1 or 2; only 1 completed.
    const quests = [q(1), q(2), q(3, [link(1), link(2)])];
    expect(sorted(validCompleted(quests, new Set([1, 3])))).toEqual([1, 3]);
    // Neither alternative completed: not valid.
    expect(sorted(validCompleted(quests, new Set([3])))).toEqual([]);
    // An alternative completed but itself out of route (its own prerequisite missing) does not count.
    const deep = [q(0), q(1, [link(0)]), q(2), q(3, [link(1), link(2)])];
    expect(sorted(validCompleted(deep, new Set([1, 3])))).toEqual([]);
    // An unknown alternative (not in the list) counts as satisfied.
    expect(sorted(validCompleted([q(1), q(3, [link(1), link(99)])], new Set([3])))).toEqual([3]);
    // Uncompleted siblings and successors never invalidate a completed quest.
    const fork = [q(1), q(2, [link(1)]), q(3, [link(1)]), q(4, [link(2)])];
    expect(sorted(validCompleted(fork, new Set([1, 2])))).toEqual([1, 2]);
  });

  test("real Call of Fire (Shaman): 1524 needs one of 1522, 1523, 2983, 2984", () => {
    expect(sorted(validCompleted(ALT, new Set([1522, 1524, 1525])))).toEqual([1522, 1524, 1525]);
    expect(sorted(validCompleted(ALT, new Set([2984, 1524])))).toEqual([1524, 2984]);
    // 1524 alone (no starter done) is still out of route.
    expect(sorted(validCompleted(ALT, new Set([1524, 1525])))).toEqual([]);
  });

  test("real Wasteland: 1124 needs Horde 1123 or Alliance 6762; 1123 needs one of three 'The New Frontier'", () => {
    // Horde route through Undercity's New Frontier (1000 and 1018 not done): all valid.
    expect(sorted(validCompleted(ALT, new Set([1004, 1123, 1124])))).toEqual([1004, 1123, 1124]);
    // Alliance route (6761's own prerequisites are not in the list: satisfied).
    expect(sorted(validCompleted(ALT, new Set([6761, 6762, 1124])))).toEqual([1124, 6761, 6762]);
    // Wasteland without either Rabine Saturna, or Rabine Saturna without any New Frontier: not valid.
    expect(sorted(validCompleted(ALT, new Set([1124])))).toEqual([]);
    expect(sorted(validCompleted(ALT, new Set([1123, 1124])))).toEqual([]);
  });

  test("a 4000-quest single chain is evaluated without recursion", () => {
    const quests: QuestRow[] = [];
    for (let i = 1; i <= 4000; i++) quests.push(q(i, i > 1 ? [link(i - 1)] : []));
    const all = new Set(quests.map((r) => r.id));
    const t = performance.now();
    expect(validCompleted(quests, all).size).toBe(4000);
    expect(performance.now() - t).toBeLessThan(2000);
    all.delete(1);
    expect(validCompleted(quests, all).size).toBe(0);
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
