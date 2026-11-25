import { readFileSync } from "node:fs";
import { openDb } from "@ft/db";
import type { ApiSnapshot } from "@ft/content";
import { describe, expect, test } from "vitest";
import { getApiSnapshot, getCharacter, ingestSavedVariables, saveApiSnapshot } from "../src/index";

const ROSTER = readFileSync(new URL("./fixtures/Roster.lua", import.meta.url), "utf8");
const M = "Player-4321-00000A01";
const NOW = 1_800_000_000;

function db() {
  const d = openDb(":memory:");
  ingestSavedVariables(d, ROSTER, () => NOW);
  return d;
}

const snap = (over: Partial<ApiSnapshot> = {}): ApiSnapshot => ({
  fetchedAt: NOW + 100, lastModified: NOW + 50, level: null, completed: [], inLog: [], professions: [], reputations: [], spec: null, talents: [], ...over,
});

describe("Blizzard profile merged into the character view", () => {
  test("no profile: api is null and nothing changes", () => {
    const d = db();
    expect(getCharacter(d, M, NOW)!.api).toBeNull();
    expect(getApiSnapshot(d, M)).toBeNull();
  });

  test("saves and reads back; an unknown character is refused", () => {
    const d = db();
    expect(saveApiSnapshot(d, M, snap({ completed: [1, 2] }))).toBe(true);
    expect(getApiSnapshot(d, M)!.completed).toEqual([1, 2]);
    expect(saveApiSnapshot(d, "Player-0-0", snap())).toBe(false);
    saveApiSnapshot(d, M, snap({ completed: [3] }));
    expect(getApiSnapshot(d, M)!.completed).toEqual([3]);
  });

  test("completed quests are the union of the addon list and the API list", () => {
    const d = db();
    const before = getCharacter(d, M, NOW)!;
    const extra = 98765;
    saveApiSnapshot(d, M, snap({ completed: [extra, before.completedIds[0]!] }));
    const after = getCharacter(d, M, NOW)!;
    expect(after.completedIds).toContain(extra);
    expect(after.completedIds.length).toBe(before.completedIds.length + 1);
    expect(after.api!.newerCompleted).toBe(1);
    expect(after.questsCompleted).toBe(after.completedIds.length);
  });

  test("a newer profile supplies the quest log, professions and level; an older one does not", () => {
    const d = db();
    const base = getCharacter(d, M, NOW)!;
    const prof = { id: 1, name: "Cooking", skill: 50, max: 75, recipeIds: [] };
    saveApiSnapshot(d, M, snap({ inLog: [11, 12], professions: [prof], level: (base.level ?? 1) + 5, lastModified: base.takenAt + 10 }));
    const newer = getCharacter(d, M, NOW)!;
    expect(newer.api!.source).toBe("api");
    expect(newer.questLogIds).toEqual([11, 12]);
    expect(newer.professions).toEqual([{ skillLine: 1, name: "Cooking", rank: 50, max: 75 }]);
    expect(newer.level).toBe((base.level ?? 1) + 5);

    saveApiSnapshot(d, M, snap({ inLog: [11, 12], professions: [prof], lastModified: base.takenAt - 1000, fetchedAt: base.takenAt - 900 }));
    const older = getCharacter(d, M, NOW)!;
    expect(older.api!.source).toBe("addon");
    expect(older.questLogIds).toEqual(base.questLogIds);
    expect(older.professions).toEqual(base.professions);
  });

  test("a hand mark the API now reports is no longer shown as manual", async () => {
    const d = db();
    const { markQuestCompleted } = await import("../src/index");
    markQuestCompleted(d, M, 77777, NOW);
    expect(getCharacter(d, M, NOW)!.manualIds).toEqual([77777]);
    saveApiSnapshot(d, M, snap({ completed: [77777] }));
    expect(getCharacter(d, M, NOW)!.manualIds).toEqual([]);
  });
});
