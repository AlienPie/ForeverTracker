import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { chainProgress, type QuestLink, type QuestRow } from "../src/index";

const FIXTURE = JSON.parse(readFileSync(new URL("./fixtures/quests.json", import.meta.url), "utf8")) as QuestRow[];
const CLASS = JSON.parse(readFileSync(new URL("./fixtures/quests-class.json", import.meta.url), "utf8")) as QuestRow[];

const link = (questId: number, relation = "Complete first"): QuestLink => ({ questId, name: `Quest ${questId}`, relation });

/** Tiny synthetic quest; names are invented. */
function q(id: number, level: number, previous: number[] = [], next: number[] = []): QuestRow {
  return {
    id,
    name: `Quest ${id}`,
    level,
    zone: null,
    chain: { previous: previous.map((p) => link(p)), next: next.map((n) => link(n)), questLine: null },
    starts: null,
    ends: null,
  };
}

/** Linear chain first..first+n-1, linked both ways, given in shuffled order. */
function line(first: number, n: number): QuestRow[] {
  const out: QuestRow[] = [];
  for (let i = 0; i < n; i++) {
    const id = first + i;
    out.push(q(id, 10 + i, i > 0 ? [id - 1] : [], i < n - 1 ? [id + 1] : []));
  }
  return out.reverse();
}

describe("chainProgress", () => {
  test("empty input gives []", () => {
    expect(chainProgress([], new Set(), new Set())).toEqual([]);
  });

  test("counts 2 of 5 with currentIndex 2, named after the root quest", () => {
    const out = chainProgress(line(201, 5), new Set([201, 202]), new Set([203]));
    expect(out).toEqual([{ chain: 201, name: "Quest 201", done: 2, total: 5, currentIndex: 2, complete: false }]);
  });

  test("a chain with only an in-log member is started, at index 0", () => {
    const out = chainProgress(line(201, 3), new Set(), new Set([201]));
    expect(out).toEqual([{ chain: 201, name: "Quest 201", done: 0, total: 3, currentIndex: 0, complete: false }]);
  });

  test("unstarted and finished chains are not reported", () => {
    const quests = [...line(201, 3), ...line(301, 2), ...line(401, 4)];
    const out = chainProgress(quests, new Set([301, 302, 401]), new Set());
    expect(out.map((c) => c.chain)).toEqual([401]);
  });

  test("one-sided links still join a chain and order it", () => {
    // 501 lists 502 as next; 502 lists nothing back. 503 lists 502 as previous only.
    const quests = [q(503, 3, [502]), q(502, 2), q(501, 1, [], [502])];
    const out = chainProgress(quests, new Set([501]), new Set());
    expect(out).toEqual([{ chain: 501, name: "Quest 501", done: 1, total: 3, currentIndex: 1, complete: false }]);
  });

  test("branching chain counts every member; currentIndex is the first unfinished in order", () => {
    // 601 -> 602, 601 -> 603, 603 -> 604
    const quests = [q(601, 1, [], [602, 603]), q(602, 2, [601]), q(603, 2, [601], [604]), q(604, 3, [603])];
    const out = chainProgress(quests, new Set([601, 603]), new Set());
    expect(out).toEqual([{ chain: 601, name: "Quest 601", done: 2, total: 4, currentIndex: 1, complete: false }]);
  });

  test("links to quests outside the input are ignored; real rows alone are single quests", () => {
    const ids = FIXTURE.map((r) => r.id);
    expect(chainProgress(FIXTURE, new Set(ids.slice(0, 3)), new Set())).toEqual([]);
  });

  test("odd link values and cycles do not throw", () => {
    const odd = [
      { ...q(701, 1), chain: { previous: [{ questId: 702 }], next: [{ questId: 702, relation: 5, name: null }], questLine: null } },
      { ...q(702, 2), chain: { previous: [{ questId: 701, relation: "Chain link" }], next: [{ questId: 701 }], questLine: null } },
    ] as unknown as QuestRow[];
    const out = chainProgress(odd, new Set([701]), new Set());
    expect(out).toEqual([{ chain: 701, name: "Quest 701", done: 1, total: 2, currentIndex: 1, complete: false }]);
  });

  test("other-class quests do not join a chain (real Dwarven Outfitters runes)", () => {
    const out = chainProgress(CLASS, new Set([179]), new Set(), "PRIEST");
    expect(out).toEqual([{ chain: 179, name: "Dwarven Outfitters", done: 1, total: 2, currentIndex: 1, complete: false }]);
    // No class known: every class quest is left out, so 179 stands alone.
    expect(chainProgress(CLASS, new Set([179]), new Set())).toEqual([]);
  });

  test("a chain whose only progress is a hub is not listed (real Dwarven Outfitters, 179)", () => {
    // Real mirror rows (trimmed): 170 and 233 follow 179 for every class, so with the class rune
    // 179 has 3 direct successors in a Priest's chain: a hub, the shared Coldridge Valley starter.
    const coldridge = (id: number, name: string, level: number): QuestRow => ({
      id,
      name,
      level,
      zone: { n: "Dun Morogh", slug: "dun-morogh", m: 1426 },
      chain: { previous: [{ questId: 179, name: "Dwarven Outfitters", relation: "Complete first" }], next: [], questLine: null },
      starts: null,
      ends: null,
    });
    const quests = [...CLASS, coldridge(170, "A New Threat", 2), coldridge(233, "Coldridge Valley Mail Delivery", 3)];
    // Only the hub done: not listed.
    expect(chainProgress(quests, new Set([179]), new Set(), "PRIEST")).toEqual([]);
    // Hub done and a member in the log: listed.
    expect(chainProgress(quests, new Set([179]), new Set([233]), "PRIEST")).toEqual([
      { chain: 179, name: "Dwarven Outfitters", done: 1, total: 4, currentIndex: 1, complete: false },
    ]);
    // Hub and a non-hub member done: listed with both counted.
    expect(chainProgress(quests, new Set([179, 3110]), new Set(), "PRIEST")).toEqual([
      { chain: 179, name: "Dwarven Outfitters", done: 2, total: 4, currentIndex: 2, complete: false },
    ]);
  });

  test("a hub in the log still lists its chain; a non-hub member done lists it", () => {
    // 601 -> 602, 603, 604 (hub), 602 -> 605.
    const quests = [q(601, 1, [], [602, 603, 604]), q(602, 2, [601], [605]), q(603, 2, [601]), q(604, 2, [601]), q(605, 3, [602])];
    expect(chainProgress(quests, new Set([601]), new Set())).toEqual([]);
    expect(chainProgress(quests, new Set(), new Set([601]))).toMatchObject([{ chain: 601, done: 0, total: 5 }]);
    expect(chainProgress(quests, new Set([601, 602]), new Set())).toMatchObject([{ chain: 601, done: 2, total: 5 }]);
    // Two successors is not a hub: a plain first step done still lists the chain.
    const two = [q(701, 1, [], [702, 703]), q(702, 2, [701]), q(703, 2, [701])];
    expect(chainProgress(two, new Set([701]), new Set())).toMatchObject([{ chain: 701, done: 1, total: 3 }]);
  });

  test("4000 quests finish quickly", () => {
    const quests: QuestRow[] = [];
    for (let s = 0; s < 800; s++) quests.push(...line(10000 + s * 10, 5));
    const completed = new Set(quests.filter((r) => r.id % 10 < 2).map((r) => r.id));
    const t = performance.now();
    const out = chainProgress(quests, completed, new Set());
    expect(performance.now() - t).toBeLessThan(2000);
    expect(out).toHaveLength(800);
    expect(out[0]).toMatchObject({ done: 2, total: 5, currentIndex: 2 });
  });
});
