import { readFileSync } from "node:fs";
import type { ContentSource } from "@ft/content";
import { describe, expect, test } from "vitest";
import { loadProfessions, professionOfQuest, type ProfessionInfo, type QuestRow } from "../src/index";

/** Real `professions` records (slug, name, kind), see fixtures/quests.fixture.md. */
const PROFESSIONS = JSON.parse(
  readFileSync(new URL("./fixtures/professions.json", import.meta.url), "utf8"),
) as ProfessionInfo[];
/** Real profession-named quests and look-alikes (Camping 101, Salve via Mining, Study of the Elements: Rock). */
const QUESTS = JSON.parse(
  readFileSync(new URL("./fixtures/quests-profession.json", import.meta.url), "utf8"),
) as QuestRow[];

const name = (id: number) => QUESTS.find((q) => q.id === id)!.name;

describe("professionOfQuest", () => {
  test("real Camping 101 quests map to their profession", () => {
    expect(professionOfQuest(name(96626), PROFESSIONS)?.slug).toBe("cooking");
    expect(professionOfQuest(name(97900), PROFESSIONS)?.slug).toBe("blacksmithing");
    expect(professionOfQuest(name(97901), PROFESSIONS)?.slug).toBe("enchanting");
    expect(professionOfQuest(name(97902), PROFESSIONS)?.slug).toBe("engineering");
    expect(professionOfQuest(name(97907), PROFESSIONS)).toMatchObject({ slug: "mining", kind: "gathering" });
    expect(professionOfQuest(name(97931), PROFESSIONS)).toMatchObject({ slug: "first-aid", kind: "secondary" });
  });

  test("case and spacing do not matter", () => {
    expect(professionOfQuest("  camping 101:   ENCHANTING  ", PROFESSIONS)?.slug).toBe("enchanting");
    expect(professionOfQuest("Camping 101 : first aid", PROFESSIONS)?.slug).toBe("first-aid");
  });

  test("a profession word elsewhere in the name is not a match", () => {
    expect(professionOfQuest(name(5883), PROFESSIONS)).toBeNull(); // Salve via Mining
    expect(professionOfQuest(name(91745), PROFESSIONS)).toBeNull(); // Mining Consultant
    expect(professionOfQuest("Mining Camp: Supplies", PROFESSIONS)).toBeNull();
    expect(professionOfQuest("Camping 101: Mining Camp", PROFESSIONS)).toBeNull();
    expect(professionOfQuest("Camping 101: Deep Mining", PROFESSIONS)).toBeNull();
  });

  test("a colon quest that is not a profession gives null", () => {
    expect(professionOfQuest(name(710), PROFESSIONS)).toBeNull(); // Study of the Elements: Rock
    expect(professionOfQuest("Mining", PROFESSIONS)).toBeNull(); // no "<x>: " prefix
  });

  test("longest profession name wins", () => {
    const catalog: ProfessionInfo[] = [
      { slug: "aid", name: "Aid", kind: "secondary" },
      { slug: "first-aid", name: "First Aid", kind: "secondary" },
    ];
    expect(professionOfQuest("Camping 101: First Aid", catalog)?.slug).toBe("first-aid");
    expect(professionOfQuest("Camping 101: Aid", catalog)?.slug).toBe("aid");
  });

  test("empty catalog or odd input gives null without throwing", () => {
    expect(professionOfQuest("Camping 101: Mining", [])).toBeNull();
    expect(professionOfQuest(5 as unknown as string, PROFESSIONS)).toBeNull();
    expect(professionOfQuest("Camping 101: Mining", [null, { name: 3 }] as unknown as ProfessionInfo[])).toBeNull();
  });
});

describe("loadProfessions", () => {
  function source(rows: unknown[]): ContentSource {
    return {
      async get() {
        return null;
      },
      async list(resource, o) {
        const all = resource === "professions" ? rows : [];
        return all.slice(o?.offset ?? 0, o?.limit === undefined ? undefined : (o.offset ?? 0) + o.limit);
      },
    };
  }

  test("returns the base records, skipping per-page records and malformed rows", async () => {
    // The mirror's per-page records (ids like `alchemy@100`) carry the same data as the base
    // record, slug included; `list` returns data only, so they are dropped by slug.
    const rows = [
      { slug: "alchemy", name: "Alchemy", kind: "primary", icon: "x" },
      { slug: "alchemy", name: "Alchemy", kind: "primary", icon: "x" },
      { slug: "alchemy@100", name: "Alchemy", kind: "primary" },
      { slug: "mining", name: "Mining", kind: "gathering" },
      null,
      { slug: "odd", name: 5, kind: "primary" },
      { slug: "nokind", name: "Nokind" },
    ];
    expect(await loadProfessions(source(rows))).toEqual([
      { slug: "alchemy", name: "Alchemy", kind: "primary" },
      { slug: "mining", name: "Mining", kind: "gathering" },
    ]);
  });

  test("an empty mirror gives []", async () => {
    expect(await loadProfessions(source([]))).toEqual([]);
  });
});
