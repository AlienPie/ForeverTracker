import { describe, expect, test } from "vitest";
import { factionOfRace, sideAllows } from "../src/advice/faction";
import type { QuestRow } from "../src/advice/content";

const quest = (side?: string | null): QuestRow =>
  ({
    id: 1,
    name: "Q",
    level: 1,
    zone: null,
    chain: { previous: [], next: [], questLine: null },
    starts: null,
    ends: null,
    ...(side === undefined ? {} : { side }),
  }) as QuestRow;

describe("factionOfRace", () => {
  test("maps races to their faction, ignoring case, spaces and punctuation", () => {
    expect(factionOfRace("Human")).toBe("Alliance");
    expect(factionOfRace("Dwarf")).toBe("Alliance");
    expect(factionOfRace("NightElf")).toBe("Alliance");
    expect(factionOfRace("night elf")).toBe("Alliance");
    expect(factionOfRace("Gnome")).toBe("Alliance");
    expect(factionOfRace("Orc")).toBe("Horde");
    expect(factionOfRace("Scourge")).toBe("Horde");
    expect(factionOfRace("Undead")).toBe("Horde");
    expect(factionOfRace("  Tauren ")).toBe("Horde");
    expect(factionOfRace("Troll")).toBe("Horde");
  });

  test("unknown, empty or missing races have no faction", () => {
    expect(factionOfRace("Goblin")).toBeNull();
    expect(factionOfRace("")).toBeNull();
    expect(factionOfRace(null)).toBeNull();
    expect(factionOfRace(undefined)).toBeNull();
  });
});

describe("sideAllows", () => {
  test("an Alliance-only quest is closed to Horde and open to Alliance", () => {
    expect(sideAllows(quest("a"), "Horde")).toBe(false);
    expect(sideAllows(quest("a"), "Alliance")).toBe(true);
  });

  test("a Horde-only quest is closed to Alliance and open to Horde", () => {
    expect(sideAllows(quest("h"), "Alliance")).toBe(false);
    expect(sideAllows(quest("h"), "Horde")).toBe(true);
  });

  test("both, absent and unknown sides are open to either faction", () => {
    for (const side of ["both", undefined, "x"]) {
      expect(sideAllows(quest(side), "Alliance")).toBe(true);
      expect(sideAllows(quest(side), "Horde")).toBe(true);
    }
  });

  test("any side is allowed when the faction is unknown", () => {
    for (const side of ["a", "h", "both", undefined, "x"]) {
      expect(sideAllows(quest(side), null)).toBe(true);
    }
  });
});
