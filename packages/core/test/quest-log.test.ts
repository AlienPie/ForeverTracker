import { describe, expect, test } from "vitest";
import { listQuestLog, type QuestRow } from "../src/index";

function q(id: number, name: string, level: number, zone: string | null = null): QuestRow {
  return {
    id,
    name,
    level,
    zone: zone ? { n: zone, slug: zone.toLowerCase(), m: null } : null,
    chain: { previous: [], next: [], questLine: null },
    starts: null,
    ends: null,
  };
}

const QUESTS = [q(1, "Beta", 5, "Elwynn"), q(2, "Alpha", 5), q(3, "Zed", 1, "Dun Morogh"), q(4, "Alpha", 5), q(5, "Gamma (Part 1)", 9)];

describe("listQuestLog", () => {
  test("sorts by level, then name, then id; unknown ids last as 'Quest <id>'", () => {
    const r = listQuestLog(QUESTS, [5, 4, 999, 1, 3, 2], {});
    expect(r.rows.map((x) => x.questId)).toEqual([3, 2, 4, 1, 5, 999]);
    expect(r.rows[0]).toEqual({ questId: 3, name: "Zed", level: 1, zone: "Dun Morogh" });
    expect(r.rows.at(-1)).toEqual({ questId: 999, name: "Quest 999", level: null, zone: null });
    expect(r.total).toBe(6);
  });

  test("paging bounds: page 0, negative, beyond last, non-integer", () => {
    const ids = Array.from({ length: 25 }, (_, i) => 1000 + i);
    const o = { pageSize: 10 };
    expect(listQuestLog([], ids, { ...o, page: 2 })).toMatchObject({ page: 2, pages: 3 });
    expect(listQuestLog([], ids, { ...o, page: 2 }).rows).toHaveLength(10);
    expect(listQuestLog([], ids, { ...o, page: 3 }).rows).toHaveLength(5);
    for (const p of [0, -4, Number.NaN, 1.5 - 1.5]) expect(listQuestLog([], ids, { ...o, page: p }).page).toBe(1);
    expect(listQuestLog([], ids, { ...o, page: 99 }).page).toBe(3);
    expect(listQuestLog([], ids, { ...o, page: 2.7 }).page).toBe(2);
    expect(listQuestLog([], ids, { ...o, page: Infinity }).page).toBe(3);
  });

  test("empty list: one page, no rows", () => {
    expect(listQuestLog(QUESTS, [], { page: 5 })).toEqual({ rows: [], total: 0, page: 1, pages: 1 });
  });

  test("search is plain text, never a regex", () => {
    const ids = [1, 2, 3, 4, 5];
    for (const text of [".*", "\\", "[", "+", "?", "(("]) {
      const r = listQuestLog(QUESTS, ids, { query: text });
      expect(r.total, text).toBe(0);
    }
    expect(listQuestLog(QUESTS, ids, { query: "(Part" }).rows.map((x) => x.questId)).toEqual([5]);
    expect(listQuestLog(QUESTS, ids, { query: "(" }).rows.map((x) => x.questId)).toEqual([5]);
  });

  test("search is case-insensitive and trimmed; blank query lists everything", () => {
    const ids = [1, 2, 3, 4, 5];
    expect(listQuestLog(QUESTS, ids, { query: "  ALPHA " }).rows.map((x) => x.questId)).toEqual([2, 4]);
    expect(listQuestLog(QUESTS, ids, { query: "   " }).total).toBe(5);
    expect(listQuestLog(QUESTS, [77], { query: "quest 77" }).total).toBe(1);
  });

  test("5,000 ids page quickly against a large catalog", () => {
    const quests = Array.from({ length: 4000 }, (_, i) => q(i + 1, `Q${i + 1}`, (i % 60) + 1));
    const ids = Array.from({ length: 5000 }, (_, i) => i + 1);
    const t0 = performance.now();
    const r = listQuestLog(quests, ids, { page: 3 });
    expect(performance.now() - t0).toBeLessThan(1000);
    expect(r).toMatchObject({ total: 5000, page: 3, pages: 100 });
    expect(r.rows).toHaveLength(50);
  });

  test("pageSize defaults to 50 and clamps to 10..200", () => {
    const ids = Array.from({ length: 500 }, (_, i) => i + 1);
    expect(listQuestLog([], ids, {}).rows).toHaveLength(50);
    expect(listQuestLog([], ids, { pageSize: 1 }).rows).toHaveLength(10);
    expect(listQuestLog([], ids, { pageSize: 100000 }).rows).toHaveLength(200);
    expect(listQuestLog([], ids, { pageSize: Number.NaN }).rows).toHaveLength(50);
  });

  test("duplicate ids are listed once", () => {
    expect(listQuestLog(QUESTS, [1, 1, 2], {}).total).toBe(2);
  });
});
