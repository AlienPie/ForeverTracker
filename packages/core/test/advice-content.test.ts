import { readFileSync } from "node:fs";
import type { ContentSource } from "@ft/content";
import { describe, expect, test } from "vitest";
import { getLevelCap, loadQuests, type QuestRow } from "../src/index";

const FIXTURE = JSON.parse(readFileSync(new URL("./fixtures/quests.json", import.meta.url), "utf8")) as QuestRow[];

/** Fake source over in-memory resources; list honours limit/offset like the mirror. */
function source(resources: Record<string, unknown[]>, meta?: unknown): ContentSource {
  return {
    async get(resource, id) {
      return resource === "meta" && id === "current" ? (meta ?? null) : null;
    },
    async list(resource, o) {
      const rows = resources[resource] ?? [];
      return rows.slice(o?.offset ?? 0, o?.limit === undefined ? undefined : (o.offset ?? 0) + o.limit);
    },
  };
}

describe("loadQuests", () => {
  test("returns every well-formed fixture quest, paging through the source", async () => {
    expect(FIXTURE.length).toBeGreaterThanOrEqual(20);
    const quests = await loadQuests(source({ quests: FIXTURE }));
    expect(quests).toEqual(FIXTURE);
  });

  test("keeps real chain shapes", async () => {
    const quests = await loadQuests(source({ quests: FIXTURE }));
    expect(quests.some((q) => q.chain.previous.length > 0 || q.chain.next.length > 0)).toBe(true);
    expect(quests.some((q) => q.chain.previous.length === 0 && q.chain.next.length === 0)).toBe(true);
    expect(quests.some((q) => q.zone === null)).toBe(true);
  });

  test("drops malformed rows", async () => {
    const good = FIXTURE[0] as QuestRow;
    const rows = [
      good,
      null,
      "x",
      { id: "7", name: "string id", level: 10, zone: null, chain: { previous: [], next: [], questLine: null } },
      { ...good, id: 9001, name: 5 },
      { ...good, id: 9002, level: null },
      { ...good, id: 9003, chain: null },
      { ...good, id: 9004, zone: "Tanaris" },
    ];
    expect(await loadQuests(source({ quests: rows }))).toEqual([good]);
  });

  test("an empty mirror returns []", async () => {
    expect(await loadQuests(source({}))).toEqual([]);
  });

  test("pages through more rows than one page", async () => {
    const good = FIXTURE[0] as QuestRow;
    const many = Array.from({ length: 1234 }, (_, i) => ({ ...good, id: i + 1 }));
    expect(await loadQuests(source({ quests: many }))).toHaveLength(1234);
  });
});

describe("getLevelCap", () => {
  test("returns the level cap from the meta record", async () => {
    expect(await getLevelCap(source({}, { build: "1.60.1.70790", levelCap: 60 }))).toBe(60);
  });

  test("null when the meta record is missing or malformed", async () => {
    expect(await getLevelCap(source({}))).toBeNull();
    expect(await getLevelCap(source({}, { build: "x" }))).toBeNull();
    expect(await getLevelCap(source({}, { levelCap: "60" }))).toBeNull();
  });
});
