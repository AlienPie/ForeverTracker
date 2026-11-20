import { describe, expect, test } from "vitest";
import {
  buildTagIndex,
  chainDetail,
  chainProgress,
  nextUp,
  type NextUpInput,
  type ProfessionInfo,
  type QuestRow,
} from "../src/index";
import { classAllowsTagged, raceAllows } from "../src/advice/classes";
import { professionOfQuestTagged, professionVerdict, learnedNames, slotsUsed } from "../src/advice/professions";

const CATALOG: ProfessionInfo[] = [
  { slug: "cooking", name: "Cooking", kind: "secondary" },
  { slug: "mining", name: "Mining", kind: "gathering" },
  { slug: "skinning", name: "Skinning", kind: "gathering" },
  { slug: "leatherworking", name: "Leatherworking", kind: "primary" },
];
const prof = (name: string) => ({ skillLine: 1, name, rank: 1, max: 75 });

function q(id: number, name: string, level = 5, zoneName = "Elwynn Forest", previous: number[] = [], next: number[] = []): QuestRow {
  const l = (n: number) => ({ questId: n, name: `Quest ${n}`, relation: "Complete first" });
  return {
    id,
    name,
    level,
    zone: { n: zoneName, slug: "z", m: 1429 },
    chain: { previous: previous.map(l), next: next.map(l), questLine: null },
    starts: { type: "npc", id: 1, name: "Giver", location: { uiMapId: 1429, zone: "Elwynn Forest", x: 1, y: 1 } },
    ends: null,
  };
}

const base = (quests: QuestRow[], extra: Partial<NextUpInput> = {}): NextUpInput => ({
  level: 5,
  zone: "Elwynn Forest",
  mapId: 1429,
  classToken: "WARRIOR",
  completed: new Set(),
  inLog: new Set(),
  quests,
  levelCap: null,
  professions: [prof("Skinning"), prof("Leatherworking"), prof("Cooking")],
  professionCatalog: CATALOG,
  ...extra,
});
const ids = (s: { questId?: number }[]) => s.map((x) => x.questId).sort((a, b) => (a ?? 0) - (b ?? 0));

describe("tag-aware profession", () => {
  const cook = q(1, "Camping 101");
  const mine = q(2, "Camping 102");
  const tags = buildTagIndex([
    { questId: 1, kind: "profession", value: "Cooking" },
    { questId: 2, kind: "profession", value: "Mining" },
  ]);

  test("professionOfQuestTagged uses the tag; untagged quest is not a profession quest when tags exist", () => {
    expect(professionOfQuestTagged(cook, CATALOG, tags)?.slug).toBe("cooking");
    expect(professionOfQuestTagged(q(3, "Camping 101: Mining"), CATALOG, tags)).toBeNull();
    expect(professionOfQuestTagged(q(3, "Camping 101: Mining"), CATALOG, undefined)?.slug).toBe("mining");
    expect(professionOfQuestTagged(q(3, "Camping 101: Mining"), CATALOG, buildTagIndex([]))?.slug).toBe("mining");
  });

  test("nextUp: Cooking allowed with full slots, Mining not suggested", () => {
    const out = nextUp(base([cook, mine], { tags }));
    expect(ids(out)).toEqual([1]);
    expect(out[0]!.kind).toBe("profession");
  });

  test("nextUp: free slot still shows a tagged gathering quest", () => {
    const out = nextUp(base([mine], { tags, professions: [prof("Skinning")] }));
    expect(ids(out)).toEqual([2]);
  });

  test("nextUp: tags exist and name looks like a profession quest but is untagged: ordinary quest", () => {
    const named = q(7, "Camping 101: Mining");
    const out = nextUp(base([named], { tags }));
    expect(ids(out)).toEqual([7]);
    expect(out[0]!.kind).not.toBe("profession");
  });

  test("tags absent equals interim rule", () => {
    const quests = [q(10, "Camping 101: Cooking"), q(11, "Camping 101: Mining")];
    const a = nextUp(base(quests));
    const b = nextUp(base(quests, { tags: undefined }));
    const c = nextUp(base(quests, { tags: buildTagIndex([]) }));
    expect(ids(a)).toEqual([10]);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });

  test("chainDetail marks unusable members unavailable and excludes them from counts", () => {
    const chain = [q(1, "A", 1, "Elwynn Forest", [], [2]), q(2, "B", 2, "Elwynn Forest", [1], [3]), q(3, "C", 3, "Elwynn Forest", [2])];
    const learned = learnedNames([prof("Skinning"), prof("Leatherworking")]);
    const used = slotsUsed(learned, CATALOG);
    const usable = (m: QuestRow) => {
      const p = professionOfQuestTagged(m, CATALOG, tags);
      const v = p ? professionVerdict(p, learned, used) : null;
      return !(v && !v.allowed);
    };
    const t = buildTagIndex([{ questId: 2, kind: "profession", value: "Mining" }]);
    const usableT = (m: QuestRow) => {
      const p = professionOfQuestTagged(m, CATALOG, t);
      const v = p ? professionVerdict(p, learned, used) : null;
      return !(v && !v.allowed);
    };
    const d = chainDetail(chain, 1, new Set([1]), new Set(), "WARRIOR", usableT);
    expect(d!.members.map((m) => [m.questId, m.state])).toEqual([
      [1, "done"],
      [2, "unavailable"],
      [3, "locked"],
    ]);
    expect(d!.total).toBe(2);
    expect(d!.done).toBe(1);
    expect(d!.otherRoute).toBe(0);
    // Cooking stays available.
    const d2 = chainDetail([cook], 1, new Set(), new Set(), "WARRIOR", usable);
    expect(d2!.members[0]!.state).toBe("available");
    expect(d2!.total).toBe(1);
  });

  test("chainDetail otherRoute unchanged by usable", () => {
    const chain = [q(1, "A", 1, "Elwynn Forest", [], [2]), q(2, "B", 2, "Elwynn Forest", [1], [3]), q(3, "C", 3, "Elwynn Forest", [2])];
    // 3 done without 1,2: otherRoute.
    const plain = chainDetail(chain, 1, new Set([3]), new Set());
    const withU = chainDetail(chain, 1, new Set([3]), new Set(), undefined, (m) => m.id !== 1);
    expect(plain!.otherRoute).toBe(1);
    expect(withU!.otherRoute).toBe(1);
    expect(withU!.total).toBe(2);
  });
});

describe("race and class tags", () => {
  const orc = q(20, "Orc thing");
  const tags = buildTagIndex([{ questId: 20, kind: "race", value: "Orc" }]);

  test("raceAllows", () => {
    expect(raceAllows([], null)).toBe(true);
    expect(raceAllows(["Orc"], "orc")).toBe(true);
    expect(raceAllows(["Orc"], "Dwarf")).toBe(false);
    expect(raceAllows(["Orc"], null)).toBe(false);
    expect(raceAllows(["Orc", "Troll"], "TROLL")).toBe(true);
  });

  test("nextUp filters by race", () => {
    expect(ids(nextUp(base([orc], { tags, raceToken: "Dwarf" })))).toEqual([]);
    expect(ids(nextUp(base([orc], { tags, raceToken: "Orc" })))).toEqual([20]);
    const two = buildTagIndex([
      { questId: 20, kind: "race", value: "Orc" },
      { questId: 20, kind: "race", value: "Troll" },
    ]);
    expect(ids(nextUp(base([orc], { tags: two, raceToken: "Troll" })))).toEqual([20]);
    expect(ids(nextUp(base([orc], { tags: two, raceToken: "Dwarf" })))).toEqual([]);
  });

  test("classAllowsTagged", () => {
    const t = buildTagIndex([{ questId: 21, kind: "class", value: "Shaman" }]);
    const plain = q(21, "Totem");
    expect(classAllowsTagged(plain, "SHAMAN", t)).toBe(true);
    expect(classAllowsTagged(plain, "WARRIOR", t)).toBe(false);
    expect(classAllowsTagged(plain, null, t)).toBe(false);
    expect(classAllowsTagged(plain, "WARRIOR", undefined)).toBe(true);
    // zone.n class rule still applies
    const zoned = q(22, "Zoned", 5, "Shaman");
    expect(classAllowsTagged(zoned, "WARRIOR", t)).toBe(false);
    expect(classAllowsTagged(zoned, "SHAMAN", t)).toBe(true);
  });

  test("nextUp: class tag filters", () => {
    const t = buildTagIndex([{ questId: 21, kind: "class", value: "Shaman" }]);
    expect(ids(nextUp(base([q(21, "Totem")], { tags: t, classToken: "WARRIOR" })))).toEqual([]);
    expect(ids(nextUp(base([q(21, "Totem")], { tags: t, classToken: "SHAMAN" })))).toEqual([21]);
  });
});

describe("chainProgress usable", () => {
  const chain = [q(1, "A", 1, "Elwynn Forest", [], [2]), q(2, "B", 2, "Elwynn Forest", [1], [3]), q(3, "C", 3, "Elwynn Forest", [2])];

  test("unusable members are excluded from done, total and position", () => {
    const plain = chainProgress(chain, new Set([1]), new Set());
    expect(plain[0]).toMatchObject({ done: 1, total: 3, currentIndex: 1 });
    const u = chainProgress(chain, new Set([1]), new Set(), "WARRIOR", (m) => m.id !== 2);
    expect(u).toHaveLength(1);
    expect(u[0]).toMatchObject({ chain: 1, done: 1, total: 2, currentIndex: 1, complete: false });
    expect(chainProgress(chain, new Set([1]), new Set(), "WARRIOR", () => true)).toEqual(plain);
  });

  test("a chain with no usable member is not listed", () => {
    expect(chainProgress(chain, new Set([1]), new Set(), "WARRIOR", () => false)).toEqual([]);
  });
});
