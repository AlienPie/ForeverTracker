import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { chainProgress, type QuestLink, type QuestRow } from "../src/index";

const FIXTURE = JSON.parse(readFileSync(new URL("./fixtures/quests.json", import.meta.url), "utf8")) as QuestRow[];
const CLASS = JSON.parse(readFileSync(new URL("./fixtures/quests-class.json", import.meta.url), "utf8")) as QuestRow[];
const HUB = JSON.parse(readFileSync(new URL("./fixtures/quests-hub.json", import.meta.url), "utf8")) as QuestRow[];
/** Real "The Great Outdoors" / "Camping 101" rows of the four starting regions (see quests.fixture.md). */
const CAMP = JSON.parse(readFileSync(new URL("./fixtures/quests-camping.json", import.meta.url), "utf8")) as QuestRow[];
/** Real rows whose several prerequisites are alternatives (Call of Fire, Wasteland; see quests.fixture.md). */
const ALT = JSON.parse(readFileSync(new URL("./fixtures/quests-alternatives.json", import.meta.url), "utf8")) as QuestRow[];

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
    // 179 is a hub (its three runes count, whatever the class), so the Priest's own rune is put in
    // the log to list the chain; the other classes' runes are still not members (2, not 4).
    const out = chainProgress(CLASS, new Set([179]), new Set([3110]), "PRIEST");
    expect(out).toEqual([{ chain: 179, name: "Dwarven Outfitters", done: 1, total: 2, currentIndex: 1, complete: false }]);
    // No class known: every class quest is left out, so 179 stands alone.
    expect(chainProgress(CLASS, new Set([179]), new Set([3110]))).toEqual([]);
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

  test("hubs are judged on all links, whatever the class (real 7 Kobold Camp Cleanup)", () => {
    // 7 is followed by 15 and six class letters (3100-3105). A Priest sees only 15 and 3103, a
    // Shaman only 15, no class only 15: 7 is still a hub for each, so only-7-done lists nothing.
    for (const cls of ["PRIEST", "SHAMAN", null]) {
      expect(chainProgress(HUB, new Set([7]), new Set(), cls), String(cls)).toEqual([]);
    }
    // A non-hub step done (15) or one in the log lists the chain, counted with the class filter.
    expect(chainProgress(HUB, new Set([7, 15]), new Set(), "PRIEST")).toEqual([
      { chain: 7, name: "Kobold Camp Cleanup", done: 2, total: 3, currentIndex: 1, complete: false },
    ]);
    expect(chainProgress(HUB, new Set([7]), new Set([3103]), "PRIEST")).toEqual([
      { chain: 7, name: "Kobold Camp Cleanup", done: 1, total: 3, currentIndex: 1, complete: false },
    ]);
  });

  test("with no class known, 179 is still a hub (its class runes count)", () => {
    expect(chainProgress(CLASS, new Set([179]), new Set())).toEqual([]);
    expect(chainProgress(CLASS, new Set([179]), new Set(), "PRIEST")).toEqual([]);
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

  test("a completed quest whose earlier quests are not completed does not count", () => {
    // Middle quest only: not on the chain.
    expect(chainProgress(line(201, 3), new Set([202]), new Set())).toEqual([]);
    // Last quest only: not on the chain either.
    expect(chainProgress(line(201, 3), new Set([203]), new Set())).toEqual([]);
    // Root and last: only the root counts; the middle quest is skipped (what follows it is done).
    expect(chainProgress(line(201, 3), new Set([201, 203]), new Set())).toEqual([
      { chain: 201, name: "Quest 201", done: 1, total: 2, currentIndex: 1, complete: false },
    ]);
    // In the log still lists the chain, counting only valid progress.
    expect(chainProgress(line(201, 3), new Set([203]), new Set([201]))).toEqual([
      { chain: 201, name: "Quest 201", done: 0, total: 2, currentIndex: 0, complete: false },
    ]);
    // Every member completed through an invalid route is not a finished chain: it is not listed.
    expect(chainProgress(line(201, 3), new Set([202, 203]), new Set())).toEqual([]);
  });

  test("alternative prerequisites: a Shaman who did Call of Fire via 1522 counts 1524 (real rows)", () => {
    // Chain order: the four level-10 starters (1522, 1523, 2983, 2984), then 1524, 1525.
    expect(chainProgress(ALT, new Set([1522, 1524]), new Set(), "SHAMAN")).toEqual([
      { chain: 1522, name: "Call of Fire", done: 2, total: 3, currentIndex: 2, complete: false },
    ]);
    // Horde Wasteland route: 1004, 1123, 1124 all count.
    expect(chainProgress(ALT, new Set([1004, 1123, 1124]), new Set())).toMatchObject([{ chain: 1000, done: 3 }]);
  });

  describe("real Camping 101 rows in the four starting regions", () => {
    test("the Elwynn Cooking quest alone does not list the Elwynn chain (the bug)", () => {
      expect(chainProgress(CAMP, new Set([96626]), new Set())).toEqual([]);
    });

    test("the Elwynn route done through its first quest lists the chain with 3 done", () => {
      expect(chainProgress(CAMP, new Set([96627, 95998, 96626]), new Set())).toEqual([
        { chain: 96627, name: "The Adventurer", done: 3, total: 6, currentIndex: 3, complete: false },
      ]);
    });

    test("the Dun Morogh route lists only its own chain, never another region's", () => {
      expect(chainProgress(CAMP, new Set([96608]), new Set())).toEqual([
        { chain: 96608, name: "The Great Outdoors", done: 1, total: 2, currentIndex: 1, complete: false },
      ]);
      // Whole Dun Morogh route done: a finished chain, so nothing is listed, and the other regions'
      // Cooking quests completed under the same name do not list their chains either.
      expect(chainProgress(CAMP, new Set([96608, 96629]), new Set())).toEqual([]);
      expect(chainProgress(CAMP, new Set([96608, 96629, 96626, 96646, 96655]), new Set())).toEqual([]);
      expect(chainProgress(CAMP, new Set([96608, 96626, 96646, 96655]), new Set()).map((c) => c.chain)).toEqual([96608]);
    });
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
