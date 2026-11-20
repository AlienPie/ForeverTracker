import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { emptyCurated, parseCurated, readCuratedDir } from "../src/index";

const tagsFile = (tags: unknown[], extra: object = {}) => ({ version: 1, patch: "1.60.1", capturedAt: "2026-11-21", tags, ...extra });

describe("parseCurated", () => {
  test("no files gives the empty value", () => {
    expect(parseCurated({})).toEqual(emptyCurated());
    expect(emptyCurated().problems).toEqual([]);
  });

  test("a valid tags file yields the tags", () => {
    const tags = [
      { questId: 96626, kind: "profession", value: "Cooking" },
      { questId: 1234, kind: "class", value: "Shaman" },
      { questId: 5678, kind: "race", value: "Dwarf" },
    ];
    const c = parseCurated({ tags: tagsFile(tags) });
    expect(c.tags).toEqual({ patch: "1.60.1", capturedAt: "2026-11-21", tags });
    expect(c.problems).toEqual([]);
  });

  test("a newer version contributes nothing and adds a version problem", () => {
    const c = parseCurated({ tags: tagsFile([{ questId: 1, kind: "class", value: "Mage" }], { version: 2 }) });
    expect(c.tags.tags).toEqual([]);
    expect(c.problems).toHaveLength(1);
    expect(c.problems[0]).toMatch(/version/);
  });

  test("a file that is not an object adds a problem", () => {
    const c = parseCurated({ overrides: [1, 2], zones: "x" });
    expect(c.links).toEqual([]);
    expect(c.zones).toEqual([]);
    expect(c.problems).toHaveLength(2);
  });

  test("bad tag entries are dropped with a problem each, valid siblings survive", () => {
    const good = { questId: 1, kind: "class", value: "Mage" };
    const c = parseCurated({
      tags: tagsFile([
        { questId: "7", kind: "class", value: "Mage" },
        { questId: 2, kind: "faction", value: "Mage" },
        { questId: 3, kind: "race", value: "  " },
        good,
        "junk",
      ]),
    });
    expect(c.tags.tags).toEqual([good]);
    expect(c.problems).toHaveLength(4);
  });

  test("overrides drop self links and non-integer ids", () => {
    const c = parseCurated({
      overrides: {
        version: 1,
        links: [
          { from: 1, to: 1 },
          { from: 1.5, to: 2 },
          { from: "1", to: 2 },
          { from: 96628, to: 96626, note: "Camping 101 follows The Adventurer" },
          { from: 3, to: 4 },
        ],
      },
    });
    expect(c.links).toEqual([
      { from: 96628, to: 96626, note: "Camping 101 follows The Adventurer" },
      { from: 3, to: 4, note: null },
    ]);
    expect(c.problems).toHaveLength(3);
  });

  test("a zone with an unknown territory is kept with null territory and a problem", () => {
    const c = parseCurated({
      zones: {
        version: 1,
        zones: [
          { name: "Dun Morogh", minLevel: 1, maxLevel: 10, territory: "Alliance", type: "zone" },
          { name: "Nowhere", minLevel: null, maxLevel: null, territory: "Neutral", type: "zone" },
          { name: "Bad type", minLevel: 1, maxLevel: 2, territory: null, type: "city" },
        ],
      },
    });
    expect(c.zones).toEqual([
      { name: "Dun Morogh", minLevel: 1, maxLevel: 10, territory: "Alliance", type: "zone" },
      { name: "Nowhere", minLevel: null, maxLevel: null, territory: null, type: "zone" },
    ]);
    expect(c.problems).toHaveLength(2);
    expect(c.problems[0]).toMatch(/territory/);
  });
});

describe("readCuratedDir", () => {
  test("invalid JSON adds a problem and keeps the rest empty", () => {
    const dir = mkdtempSync(join(tmpdir(), "ft-curated-"));
    writeFileSync(join(dir, "quest-tags.json"), "{ not json");
    writeFileSync(join(dir, "zones.json"), JSON.stringify({ version: 1, zones: [] }));
    const c = readCuratedDir(dir);
    expect(c.tags.tags).toEqual([]);
    expect(c.problems).toHaveLength(1);
    expect(c.problems[0]).toMatch(/quest-tags\.json/);
  });

  test("a missing directory or missing files give the empty value", () => {
    expect(readCuratedDir(join(tmpdir(), "ft-does-not-exist-xyz"))).toEqual(emptyCurated());
    const dir = mkdtempSync(join(tmpdir(), "ft-curated-"));
    mkdirSync(join(dir, "sub"));
    expect(readCuratedDir(dir)).toEqual(emptyCurated());
  });

  test("reads valid files", () => {
    const dir = mkdtempSync(join(tmpdir(), "ft-curated-"));
    writeFileSync(join(dir, "overrides.json"), JSON.stringify({ version: 1, links: [{ from: 1, to: 2, note: null }] }));
    expect(readCuratedDir(dir).links).toEqual([{ from: 1, to: 2, note: null }]);
  });
});
