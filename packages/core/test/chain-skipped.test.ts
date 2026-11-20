import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { chainDetail, chainProgress, nextUp, type NextUpInput, type QuestLink, type QuestRow } from "../src/index";
import { chainGraph, skippedMembers } from "../src/advice/chains";

/** Real "The Perfect Stout" rows: 413 follows 315 or 415 (alternatives), then 414. */
const STOUT = JSON.parse(readFileSync(new URL("./fixtures/quests-stout.json", import.meta.url), "utf8")) as QuestRow[];

const link = (questId: number): QuestLink => ({ questId, name: `Quest ${questId}`, relation: "Complete first" });
function q(id: number, level: number, previous: number[] = [], next: number[] = []): QuestRow {
  return {
    id,
    name: `Quest ${id}`,
    level,
    zone: { n: "Elwynn Forest", slug: "elwynn-forest", m: 1429 },
    chain: { previous: previous.map(link), next: next.map(link), questLine: null },
    starts: null,
    ends: null,
  };
}
const states = (d: ReturnType<typeof chainDetail>) => Object.fromEntries(d!.members.map((m) => [m.questId, m.state]));
const set = (...n: number[]) => new Set(n);

describe("skipped chain steps", () => {
  test("(a) done 315, 413, 414: 415 is skipped, 3 of 3, chain not listed", () => {
    const d = chainDetail(STOUT, 413, set(315, 413, 414), set());
    expect(states(d)).toEqual({ 315: "done", 415: "skipped", 413: "done", 414: "done" });
    expect(d).toMatchObject({ total: 3, done: 3 });
    expect(chainProgress(STOUT, set(315, 413, 414), set())).toEqual([]);
  });

  test("(b) only 315 done: nothing skipped, 413 and 415 available", () => {
    const d = chainDetail(STOUT, 413, set(315), set());
    expect(states(d)).toEqual({ 315: "done", 415: "available", 413: "available", 414: "locked" });
    expect(d).toMatchObject({ total: 4, done: 1 });
    expect(chainProgress(STOUT, set(315), set())).toMatchObject([{ done: 1, total: 4, currentIndex: 1 }]);
  });

  test("(c) only 413, 414 done: 315 and 415 both skipped, no available steps", () => {
    const d = chainDetail(STOUT, 413, set(413, 414), set());
    expect(states(d)).toEqual({ 315: "skipped", 415: "skipped", 413: "done", 414: "done" });
    expect(d!.total).toBe(2);
    expect(d!.members.some((m) => m.state === "available")).toBe(false);
    expect(chainProgress(STOUT, set(413, 414), set())).toEqual([]);
  });

  test("(d) one of two successors completed: not skipped", () => {
    const quests = [q(1, 1, [], [2, 3]), q(2, 2, [1]), q(3, 2, [1])];
    expect(states(chainDetail(quests, 1, set(2), set()))).toMatchObject({ 1: "available" });
    expect(states(chainDetail(quests, 1, set(2, 3), set()))).toMatchObject({ 1: "skipped" });
  });

  test("(e) an in-log or completed member is never skipped; a leaf is never skipped", () => {
    const g = chainGraph(STOUT);
    expect(skippedMembers(STOUT, g.succ, set(413, 414), set(415)).has(415)).toBe(false);
    expect([...skippedMembers(STOUT, g.succ, set(315, 413, 414), set())]).toEqual([415]);
    expect(skippedMembers(STOUT, g.succ, set(315, 413, 414), set()).has(414)).toBe(false);
    expect(skippedMembers(STOUT, g.succ, set(315, 413, 414), set()).has(315)).toBe(false);
    expect(states(chainDetail(STOUT, 413, set(315, 413, 414), set(415)))[415]).toBe("in-log");
    expect(states(chainDetail(STOUT, 413, set(414), set()))[414]).toBe("done");
    // 414 is a leaf: not done, not skipped.
    expect(states(chainDetail(STOUT, 413, set(315, 413), set()))[414]).toBe("available");
  });

  test("unavailable still wins over skipped", () => {
    const d = chainDetail(STOUT, 413, set(315, 413, 414), set(), null, (m) => m.id !== 415);
    expect(states(d)[415]).toBe("unavailable");
  });

  test("a chain with a skipped step still lists while another step is open", () => {
    // 415 skipped, 414 not done but in log.
    const p = chainProgress(STOUT, set(315, 413), set(414));
    expect(p).toMatchObject([{ chain: 315, done: 2, total: 3, currentIndex: 2 }]);
    const quests = [q(1, 1, [], [2, 3]), q(2, 2, [1], [4]), q(3, 2, [1], [4]), q(4, 3, [2, 3])];
    // 3 skipped (its successor 4 is done), 1 done, 2 done: 4 done too -> complete, not listed.
    expect(chainProgress(quests, set(1, 2, 4), set())).toEqual([]);
    // 3 skipped, 4 open: 2 of 3.
    expect(chainProgress(quests, set(1, 2), set(4))).toMatchObject([{ done: 2, total: 4 }]);
  });
});

describe("nextUp and skipped steps", () => {
  const input = (over: Partial<NextUpInput>): NextUpInput => ({
    level: 10,
    zone: "Dun Morogh",
    completed: new Set(),
    inLog: new Set(),
    quests: STOUT,
    levelCap: 60,
    professions: [],
    ...over,
  });

  test("(f) 415 is not suggested once 315, 413, 414 are done", () => {
    expect(nextUp(input({ completed: set(315, 413, 414) })).map((s) => s.questId)).toEqual([]);
  });

  test("(f) nothing completed: behaves as before (315 and 415 are area suggestions)", () => {
    const ids = nextUp(input({})).map((s) => s.questId);
    expect(ids).toContain(415);
    expect(ids).toContain(315);
  });

  test("415 still suggested while only 315 is done", () => {
    expect(nextUp(input({ completed: set(315) })).map((s) => s.questId)).toContain(415);
  });
});

describe("skipped steps are transitive and pass through for validity", () => {
  // Linear 1 -> 2 -> 3 -> 4.
  const LINE = [q(1, 5, [], [2]), q(2, 6, [1], [3]), q(3, 7, [2], [4]), q(4, 8, [3])];
  const info = (completed: Set<number>, inLog = set()) => {
    const d = chainDetail(LINE, 1, completed, inLog)!;
    return { states: states(d), done: d.done, total: d.total, other: d.otherRoute, d };
  };

  test("{1,3}: 2 skipped, 2 of 3 done, current at 4, nextUp continues the chain with 4", () => {
    const r = info(set(1, 3));
    expect(r.states).toEqual({ 1: "done", 2: "skipped", 3: "done", 4: "available" });
    expect(r).toMatchObject({ done: 2, total: 3, other: 0 });
    expect(chainProgress(LINE, set(1, 3), set())).toMatchObject([{ done: 2, total: 3, currentIndex: 2, complete: false }]);
    const out = nextUp({ level: 8, zone: "Elwynn Forest", completed: set(1, 3), inLog: set(), quests: LINE, levelCap: 60, professions: [] });
    expect(out.map((s) => [s.questId, s.kind])).toEqual([[4, "chain"]]);
    expect(out[0]!.reason).toContain("Continues the chain after");
  });

  test("{1,4}: 2 and 3 both skipped, 2 of 2, complete, not listed, nothing suggested", () => {
    const r = info(set(1, 4));
    expect(r.states).toEqual({ 1: "done", 2: "skipped", 3: "skipped", 4: "done" });
    expect(r).toMatchObject({ done: 2, total: 2, other: 0 });
    expect(chainProgress(LINE, set(1, 4), set())).toEqual([]);
    const out = nextUp({ level: 8, zone: "Elwynn Forest", completed: set(1, 4), inLog: set(), quests: LINE, levelCap: 60, professions: [] });
    expect(out).toEqual([]);
  });

  test("{3} only: 1 and 2 skipped but no way through, 3 stays not-through-this-chain", () => {
    const r = info(set(3));
    expect(r.states).toEqual({ 1: "skipped", 2: "skipped", 3: "done", 4: "available" });
    expect(r).toMatchObject({ done: 0, total: 2, other: 1 });
    expect(r.d.members.find((m) => m.questId === 3)!.otherRoute).toBe(true);
  });

  test("Perfect Stout results are unchanged", () => {
    expect(chainDetail(STOUT, 413, set(315, 413, 414), set())).toMatchObject({ done: 3, total: 3 });
    expect(states(chainDetail(STOUT, 413, set(315), set()))).toMatchObject({ 415: "available", 413: "available" });
  });
});

describe("step numbers count only counted members", () => {
  test("Stout, 315 and 413 done, 414 in log: 414 is step 3 of 3; skipped 415 has no step", () => {
    const d = chainDetail(STOUT, 413, set(315, 413), set(414))!;
    expect(d.members.map((m) => [m.questId, m.state, m.step])).toEqual([
      [315, "done", 1],
      [415, "skipped", null],
      [413, "done", 2],
      [414, "in-log", 3],
    ]);
    const e = chainDetail(STOUT, 413, set(315, 413, 414), set())!;
    expect(e.members.map((m) => [m.questId, m.step])).toEqual([[315, 1], [415, null], [413, 2], [414, 3]]);
    expect(e.total).toBe(3);
  });

  test("skipped before the current step does not shift it past the total", () => {
    // 1 -> 2 -> 3 -> 4 with {1,3} done and 4 in the log: 4 is step 3 of 3.
    const line = [q(1, 5, [], [2]), q(2, 6, [1], [3]), q(3, 7, [2], [4]), q(4, 8, [3])];
    const d = chainDetail(line, 1, set(1, 3), set(4))!;
    expect(d.members.map((m) => [m.questId, m.step])).toEqual([[1, 1], [2, null], [3, 2], [4, 3]]);
    expect(d.total).toBe(3);
  });

  test("an unavailable member also gets no step number", () => {
    const d = chainDetail(STOUT, 413, set(), set(), null, (m) => m.id !== 415)!;
    expect(d.members.map((m) => [m.questId, m.step])).toEqual([[315, 1], [415, null], [413, 2], [414, 3]]);
  });
});
