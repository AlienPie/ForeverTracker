import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { chainDetail, type QuestLink, type QuestRow } from "../src/index";

const CLASS = JSON.parse(readFileSync(new URL("./fixtures/quests-class.json", import.meta.url), "utf8")) as QuestRow[];
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
    zone: { n: "Elwynn Forest", slug: "elwynn-forest", m: 1429 },
    chain: { previous: previous.map((p) => link(p)), next: next.map((n) => link(n)), questLine: null },
    starts: { type: "npc", id: 1, name: `Giver ${id}`, location: { uiMapId: 1429, zone: "Elwynn Forest", x: 1, y: 1 } },
    ends: null,
  };
}

/**
 * Branching chain:
 *   601 -> 602
 *   601 -> 603 -> 604
 *   605 needs both 602 and 604
 */
const BRANCH = [
  q(605, 5, [602, 604]),
  q(604, 3, [603], [605]),
  q(603, 2, [601], [604]),
  q(602, 2, [601], [605]),
  q(601, 1, [], [602, 603]),
];

describe("chainDetail", () => {
  test("unknown quest id gives null", () => {
    expect(chainDetail(BRANCH, 999, new Set(), new Set())).toBeNull();
    expect(chainDetail([], 601, new Set(), new Set())).toBeNull();
  });

  test("members in chain order with done / in-log / available / locked", () => {
    // 601 done, 602 in log, 603 available (601 done), 604 locked (603 not done), 605 locked.
    const d = chainDetail(BRANCH, 604, new Set([601]), new Set([602]));
    expect(d).not.toBeNull();
    expect(d!.chain).toBe(601);
    expect(d!.name).toBe("Quest 601");
    expect(d!.done).toBe(1);
    expect(d!.total).toBe(5);
    expect(d!.members.map((m) => [m.questId, m.step, m.state])).toEqual([
      [601, 1, "done"],
      [602, 2, "in-log"],
      [603, 3, "available"],
      [604, 4, "locked"],
      [605, 5, "locked"],
    ]);
    expect(d!.members[0]).toMatchObject({ name: "Quest 601", level: 1, zone: "Elwynn Forest", giver: "Giver 601" });
  });

  test("available needs every prerequisite done, not just in the log", () => {
    // 605 needs 602 and 604. 602 done, 604 in log: 605 is still locked.
    const d = chainDetail(BRANCH, 601, new Set([601, 602, 603]), new Set([604]))!;
    expect(d.members.map((m) => m.state)).toEqual(["done", "done", "done", "in-log", "locked"]);
    // Both done: 605 is available.
    const e = chainDetail(BRANCH, 601, new Set([601, 602, 603, 604]), new Set())!;
    expect(e.members.at(-1)!.state).toBe("available");
    expect(e.done).toBe(4);
  });

  test("any member id gives the same chain, and the order matches chainProgress (root first)", () => {
    const a = chainDetail(BRANCH, 601, new Set(), new Set())!;
    const b = chainDetail(BRANCH, 605, new Set(), new Set())!;
    expect(b).toEqual(a);
    expect(a.members.map((m) => m.state)).toEqual(["available", "locked", "locked", "locked", "locked"]);
  });

  test("a quest with no chain is a chain of one", () => {
    const d = chainDetail([q(700, 4)], 700, new Set(), new Set())!;
    expect(d).toMatchObject({ chain: 700, done: 0, total: 1 });
    expect(d.members).toHaveLength(1);
    expect(d.members[0]!.state).toBe("available");
  });

  test("class filtering applies (real Dwarven Outfitters runes)", () => {
    const priest = chainDetail(CLASS, 179, new Set([179]), new Set(), "PRIEST")!;
    expect(priest.members.map((m) => [m.questId, m.name, m.state])).toEqual([
      [179, "Dwarven Outfitters", "done"],
      [3110, "Hallowed Rune", "available"],
    ]);
    // Class quests use their giver's place, not the class name, as the zone.
    expect(priest.members[1]).toMatchObject({ zone: "Dun Morogh", giver: "Sten Stoutarm", level: 1 });
    // Another class's rune is not a chain the priest can open.
    expect(chainDetail(CLASS, 3106, new Set(), new Set(), "PRIEST")).toBeNull();
    // Unknown class: no class quest at all.
    expect(chainDetail(CLASS, 3110, new Set(), new Set())).toBeNull();
    expect(chainDetail(CLASS, 179, new Set(), new Set())!.total).toBe(1);
  });

  test("a cycle does not hang and lists every member once", () => {
    const cyc = [q(801, 1, [803], [802]), q(802, 2, [801], [803]), q(803, 3, [802], [801])];
    const d = chainDetail(cyc, 802, new Set(), new Set())!;
    expect(d.members.map((m) => m.questId).sort()).toEqual([801, 802, 803]);
    expect(d.members.every((m) => m.state === "locked")).toBe(true);
  });

  test("odd link values and missing fields do not throw", () => {
    const odd = [
      { ...q(901, 1), starts: null, zone: null, chain: { previous: [{ questId: 902 }, null, "x"], next: [{ questId: 902, relation: 5 }], questLine: null } },
      { ...q(902, 2), starts: { name: 7 }, chain: { previous: [{ questId: 901, relation: "Chain link" }], next: "nope", questLine: null } },
    ] as unknown as QuestRow[];
    const d = chainDetail(odd, 901, new Set([901]), new Set())!;
    expect(d.members.map((m) => [m.questId, m.state, m.zone, m.giver])).toEqual([
      [901, "done", null, null],
      [902, "available", "Elwynn Forest", null],
    ]);
  });

  test("a member completed without its earlier quests is marked otherRoute and not counted as done", () => {
    // 601 not done; 602 and 603 done anyway (both need 601): another route. 604 needs only 603.
    const d = chainDetail(BRANCH, 601, new Set([602, 603]), new Set())!;
    expect(d.members.map((m) => [m.questId, m.state, m.otherRoute])).toEqual([
      [601, "available", false],
      [602, "done", true],
      [603, "done", true],
      [604, "available", false],
      [605, "locked", false],
    ]);
    expect(d).toMatchObject({ done: 0, otherRoute: 2, total: 5 });
    // Through the first quest: every completed member counts.
    const e = chainDetail(BRANCH, 601, new Set([601, 602]), new Set())!;
    expect(e.members.map((m) => m.otherRoute)).toEqual([false, false, false, false, false]);
    expect(e).toMatchObject({ done: 2, otherRoute: 0 });
  });

  test("real Camping 101 rows: the Elwynn Cooking quest done from another region is otherRoute", () => {
    const d = chainDetail(CAMP, 96626, new Set([96626]), new Set())!;
    expect(d).toMatchObject({ chain: 96627, name: "The Adventurer", done: 0, otherRoute: 1, total: 6 });
    expect(d.members.map((m) => [m.questId, m.zone, m.state, m.otherRoute])).toEqual([
      // 96627 needs 21 "Skirmish at Echo Ridge" (not in the fixture, not completed): locked.
      [96627, "Elwynn Forest", "locked", false],
      [95998, "Elwynn Forest", "locked", false],
      [96626, "Elwynn Forest", "done", true],
      [97920, "Elwynn Forest", "locked", false],
      [97923, "Elwynn Forest", "locked", false],
      [97924, "Elwynn Forest", "locked", false],
    ]);
    const full = chainDetail(CAMP, 96626, new Set([96627, 95998, 96626]), new Set())!;
    expect(full).toMatchObject({ done: 3, otherRoute: 0, total: 6 });
    const dun = chainDetail(CAMP, 96629, new Set([96608, 96629, 96626]), new Set())!;
    expect(dun).toMatchObject({ chain: 96608, done: 2, otherRoute: 0, total: 2 });
  });

  test("alternative prerequisites: Call of Fire done via 1522 is not otherRoute (real rows)", () => {
    const d = chainDetail(ALT, 1524, new Set([1522, 1524]), new Set(), "SHAMAN")!;
    expect(d).toMatchObject({ chain: 1522, done: 2, otherRoute: 0, total: 6 });
    const byId = new Map(d.members.map((m) => [m.questId, m]));
    expect(byId.get(1524)).toMatchObject({ state: "done", otherRoute: false });
    expect(byId.get(1522)).toMatchObject({ state: "done", otherRoute: false });
    // The next step needs only 1524: available.
    expect(byId.get(1525)).toMatchObject({ state: "available", otherRoute: false });
    // Alliance Wasteland route.
    const w = chainDetail(ALT, 1124, new Set([6761, 6762, 1124]), new Set())!;
    expect(w).toMatchObject({ done: 3, otherRoute: 0 });
  });

  test("4000 quests finish quickly", () => {
    const quests: QuestRow[] = [];
    for (let s = 0; s < 800; s++) for (let i = 0; i < 5; i++) {
      const id = 10000 + s * 10 + i;
      quests.push(q(id, 10 + i, i > 0 ? [id - 1] : [], i < 4 ? [id + 1] : []));
    }
    const t = performance.now();
    const d = chainDetail(quests, 15002, new Set([15000]), new Set());
    expect(performance.now() - t).toBeLessThan(2000);
    expect(d!.members.map((m) => m.state)).toEqual(["done", "available", "locked", "locked", "locked"]);
  });
});
