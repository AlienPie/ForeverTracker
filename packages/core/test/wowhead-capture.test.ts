import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { buildCurated, type Capture } from "../../../tools/build-curated";

const source = readFileSync(new URL("../../../tools/wowhead/capture.js", import.meta.url), "utf8");
const exportsBag: { extract?: (input: unknown, hint?: unknown) => Capture } = {};
vm.runInNewContext(source, { __ftExports: exportsBag });
const extract = exportsBag.extract!;

const fixture = (name: string): Capture =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8")) as Capture;
const link = (id: number, text: string, rowText = text) => ({ href: `/forever/quest=${id}/x`, text, rowText });
const page = (url: string, anchors: ReturnType<typeof link>[] = []) => ({ url, title: "t", anchors, tableRows: [] });
const existing = { patch: "1.60.1", capturedAt: "2026-11-21" };

describe("extract", () => {
  it("collapses duplicates and derives class from the URL", () => {
    const c = extract(page("https://x.test/forever/quests/classes/shaman", [link(111, " A "), link(222, "B"), link(111, "A")]));
    expect(c.rows.map((r) => r.questId)).toEqual([111, 222]);
    expect(c.kind).toBe("class");
    expect(c.value).toBe("Shaman");
    expect(c.rows[0]!.name).toBe("A");
  });

  it("ignores quest links outside any table row and counts them", () => {
    const c = extract(
      page("https://x.test/forever/quests/classes/shaman", [link(1, "In list", "In list 4"), link(2, "Sidebar", ""), link(3, "Comment", "")]),
    );
    expect(c.rows.map((r) => r.questId)).toEqual([1]);
    expect(c.notes.join(" ")).toContain("2 quest links outside the list were ignored");
  });

  it("reads the level from the row text, or notes its absence", () => {
    const c = extract(
      page("https://x.test/forever/quests/classes/shaman", [link(1, "Call of Fire", "Call of Fire 4 Shaman"), link(2, "Plain", "Plain Shaman")]),
    );
    expect(c.rows[0]!.level).toBe(4);
    expect(c.rows[1]).not.toHaveProperty("level");
    expect(c.notes.join(" ")).toMatch(/no level/i);
  });

  it("title-cases hyphenated slugs and handles professions and races", () => {
    expect(extract(page("https://x.test/forever/quests/professions/first-aid", [link(1, "a", "a 5")])).value).toBe("First Aid");
    expect(extract(page("https://x.test/forever/quests/races/dwarf", [link(1, "a", "a 5")])).kind).toBe("race");
  });

  it("marks unknown URLs and honours a hint", () => {
    const c = extract(page("https://x.test/other", [link(1, "a", "a 5")]));
    expect(c.kind).toBe("unknown");
    expect(c.notes.join(" ")).toContain("ftCapture");
    const h = extract(page("https://x.test/other", [link(1, "a", "a 5")]), { kind: "class", value: "Shaman" });
    expect([h.kind, h.value]).toEqual(["class", "Shaman"]);
  });

  it("notes zero quests", () => {
    const c = extract(page("https://x.test/forever/quests/classes/shaman"));
    expect(c.rows).toEqual([]);
    expect(c.notes.length).toBeGreaterThan(0);
  });
});

describe("buildCurated", () => {
  it("turns a class capture into tags and flags ids missing from the mirror", () => {
    const r = buildCurated([fixture("wowhead-capture-class.json")], new Set([111, 222]), existing);
    expect(r.tags.patch).toBe("1.60.1");
    expect(r.tags.tags).toEqual([
      { questId: 111, kind: "class", value: "Shaman" },
      { questId: 222, kind: "class", value: "Shaman" },
      { questId: 333, kind: "class", value: "Shaman" },
    ]);
    expect(r.report.join("\n")).toMatch(/not in the mirror: 1 ids, first five: 333/);
  });

  it("reports a quest tagged with two classes and keeps both", () => {
    const a = fixture("wowhead-capture-class.json");
    const b = { ...a, value: "Mage" };
    const r = buildCurated([a, b], new Set([111, 222, 333]), existing);
    expect(r.tags.tags.filter((t) => t.questId === 111).map((t) => t.value)).toEqual(["Shaman", "Mage"]);
    expect(r.report.join("\n")).toMatch(/111.*Shaman.*Mage/);
  });

  it("rejects an invalid class value", () => {
    const a = { ...fixture("wowhead-capture-class.json"), value: "Bard" };
    const r = buildCurated([a], null, existing);
    expect(r.tags.tags).toEqual([]);
    expect(r.report.join("\n")).toContain("Bard");
  });

  it("reports when the mirror is unavailable", () => {
    const r = buildCurated([fixture("wowhead-capture-class.json")], null, existing);
    expect(r.report.join("\n")).toContain("mirror not available, ids not validated");
    expect(r.tags.tags).toHaveLength(3);
  });

  it("parses zone rows leniently and reports unparseable ones", () => {
    const r = buildCurated([fixture("wowhead-capture-zones.json")], new Set(), existing);
    expect(r.zones[0]).toEqual({ name: "Dun Morogh", minLevel: 1, maxLevel: 10, territory: "Alliance", type: "zone" });
    expect(r.zones[1]).toEqual({ name: "Gloomdeep Hollow", minLevel: 20, maxLevel: 24, territory: null, type: "dungeon" });
    expect(r.zones[2]).toEqual({ name: "Mistfen", minLevel: 12, maxLevel: 12, territory: "Contested", type: "zone" });
    expect(r.zones).toHaveLength(3);
    expect(r.report.join("\n")).toMatch(/zone row.*no name/i);
  });
});
