import { buildTagIndex, type ProfessionInfo, type QuestRow } from "@ft/core";
import { describe, expect, test } from "vitest";
import { buildUsable } from "../src/lib/server/usable";

const q = (id: number, name = `Quest ${id}`) =>
  ({ id, name, level: 5, zone: null, chain: { previous: [], next: [], questLine: null }, starts: null, ends: null }) as unknown as QuestRow;
const catalog: ProfessionInfo[] = [
  { name: "Mining", kind: "gathering" },
  { name: "Herbalism", kind: "gathering" },
  { name: "Tailoring", kind: "primary" },
  { name: "Cooking", kind: "secondary" },
] as ProfessionInfo[];
const tags = buildTagIndex([
  { questId: 1, kind: "profession", value: "Mining" },
  { questId: 2, kind: "profession", value: "Cooking" },
  { questId: 3, kind: "class", value: "Shaman" },
  { questId: 4, kind: "race", value: "Dwarf" },
  { questId: 4, kind: "race", value: "Gnome" },
]);
const learn = (...names: string[]) => names.map((name) => ({ name, rank: 1, max: 75 })) as never;
const base = { tags, professionCatalog: catalog, completed: new Set<number>(), inLog: new Set<number>() };

describe("buildUsable", () => {
  test("no tags: everything is usable", () => {
    for (const t of [undefined, buildTagIndex([])]) {
      const u = buildUsable({ ...base, tags: t, classToken: "PRIEST" });
      expect([1, 3, 4].every((id) => u(q(id)))).toBe(true);
    }
  });

  test("profession quest: dropped with both slots taken by others, kept when learned or a slot is free", () => {
    const full = buildUsable({ ...base, professions: learn("Herbalism", "Tailoring") });
    expect(full(q(1))).toBe(false);
    expect(buildUsable({ ...base, professions: learn("Mining") })(q(1))).toBe(true);
    expect(buildUsable({ ...base, professions: learn("Herbalism") })(q(1))).toBe(true);
    expect(full(q(2))).toBe(true); // secondary: always learnable
    expect(full(q(99))).toBe(true); // untagged
  });

  test("only class or race tags: the name rule still drops a profession-named quest", () => {
    const classRace = buildTagIndex([{ questId: 3, kind: "class", value: "Shaman" }]);
    const full = { ...base, tags: classRace, professions: learn("Herbalism", "Tailoring") };
    expect(buildUsable(full)(q(10, "Camping 101: Mining"))).toBe(false);
    expect(buildUsable({ ...full, tags })(q(10, "Camping 101: Mining"))).toBe(false);
  });

  test("tags for one profession only: an untagged Mining-named quest is still dropped when slots are full", () => {
    const leather = buildTagIndex([{ questId: 5, kind: "profession", value: "Leatherworking" }]);
    const full = { ...base, tags: leather, professions: learn("Herbalism", "Tailoring") };
    expect(buildUsable(full)(q(10, "Camping 101: Mining"))).toBe(false);
  });

  test("class and race tags", () => {
    expect(buildUsable({ ...base, classToken: "PRIEST" })(q(3))).toBe(false);
    expect(buildUsable({ ...base, classToken: "SHAMAN" })(q(3))).toBe(true);
    expect(buildUsable({ ...base, raceToken: "Human" })(q(4))).toBe(false);
    expect(buildUsable({ ...base, raceToken: "Gnome" })(q(4))).toBe(true);
  });

  test("a completed or logged quest is never unavailable", () => {
    const u = buildUsable({
      ...base,
      classToken: "PRIEST",
      raceToken: "Human",
      professions: learn("Herbalism", "Tailoring"),
      completed: new Set([1]),
      inLog: new Set([3, 4]),
    });
    expect([1, 3, 4].every((id) => u(q(id)))).toBe(true);
  });
});
