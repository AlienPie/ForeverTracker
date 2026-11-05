import { describe, expect, test } from "vitest";
import { openDb } from "@ft/db";
import { readQuestIds, renderQuestIdsLua } from "../src/index";
import { putRecord } from "../src/mirror/store";

describe("renderQuestIdsLua", () => {
  test("sorts ascending and de-duplicates", () => {
    const lua = renderQuestIdsLua([30, 10, 20, 10, 30], "1.60.1.70790");
    expect(lua).toContain("FT.setQuestIdList({");
    expect(lua).toMatch(/10, 20, 30/);
    expect(lua).toContain("Count: 3");
  });

  test("filters non-integer, negative, NaN and infinite values", () => {
    const lua = renderQuestIdsLua([5, 1.5, -3, NaN, Infinity, -Infinity, 7], "B");
    expect(lua).toMatch(/5, 7/);
    expect(lua).not.toMatch(/1\.5|-3|NaN|Infinity/);
    expect(lua).toContain("Count: 2");
  });

  test("credits ForeverDB and states the build and generator", () => {
    const lua = renderQuestIdsLua([1], "1.60.1.70790");
    expect(lua).toContain("Data from ForeverDB.net (https://foreverdb.net)");
    expect(lua).toContain("1.60.1.70790");
    expect(lua).toContain("GENERATED");
    expect(lua).toContain("pnpm addon:quest-ids");
  });

  test("a normal build is preserved", () => {
    expect(renderQuestIdsLua([1], "1.60.1.70790")).toContain("-- Game build: 1.60.1.70790\n");
  });

  test.each(["1.0\nos.execute('x')", "1.0\rfoo", "a]]b", "a--b", 'os.execute("x")', "x".repeat(41), ""])(
    "hostile or invalid build %j renders as unknown without injection",
    (build) => {
      const lua = renderQuestIdsLua([1, 2], build);
      expect(lua).toContain("-- Game build: unknown\n");
      const lines = lua.split("\n").filter((l) => l !== "");
      const code = lines.filter((l) => !l.startsWith("--"));
      expect(code).toEqual(["FT.setQuestIdList({", "  1, 2,", "})"]);
      expect(lua).not.toMatch(/os\.execute/);
    },
  );

  test("empty list is a valid call", () => {
    expect(renderQuestIdsLua([], "B")).toContain("FT.setQuestIdList({})");
  });

  test("5000 ids render with a sane line count", () => {
    const ids = Array.from({ length: 5000 }, (_, i) => i + 1);
    const lines = renderQuestIdsLua(ids, "B").split("\n");
    expect(lines.length).toBeGreaterThan(400);
    expect(lines.length).toBeLessThan(500);
  });
});

describe("readQuestIds", () => {
  test("reads numeric ids and build from quest rows only", () => {
    const db = openDb(":memory:");
    putRecord(db, "quests", "11", { id: 11, name: "a" }, "B9", 1);
    putRecord(db, "quests", "5", { id: 5 }, "B9", 1);
    putRecord(db, "items", "99", { id: 99 }, "B9", 1);
    expect(readQuestIds(db)).toEqual({ ids: [5, 11], build: "B9" });
  });

  test("errors clearly when there are no quest rows", () => {
    expect(() => readQuestIds(openDb(":memory:"))).toThrow("pnpm content:sync");
  });
});
