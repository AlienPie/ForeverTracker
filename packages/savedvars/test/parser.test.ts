import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LuaParseError, parseSavedVariables } from "../src/index";

describe("parseSavedVariables", () => {
  it("parses nested tables and top-level assignments", () => {
    expect(parseSavedVariables("A = { b = { c = 1 } }")).toEqual({ A: { b: { c: 1 } } });
  });

  it("converts contiguous 1..n integer keys to arrays", () => {
    expect(parseSavedVariables('A = { "a", "b" }')).toEqual({ A: ["a", "b"] });
    expect(parseSavedVariables('A = { [1]="a", [2]="b" }')).toEqual({ A: ["a", "b"] });
  });

  it("keeps gapped or non-integer numeric keys as an object with string keys", () => {
    expect(parseSavedVariables("A = { [1]=1, [3]=3 }")).toEqual({ A: { "1": 1, "3": 3 } });
    expect(parseSavedVariables("A = { [1.5]=1 }")).toEqual({ A: { "1.5": 1 } });
  });

  it("parses numbers", () => {
    expect(parseSavedVariables("A = -5\nB = 3.5\nC = 1e3\nD = 0xFF")).toEqual({
      A: -5,
      B: 3.5,
      C: 1000,
      D: 255,
    });
  });

  it("parses strings", () => {
    const src = String.raw`A = "x\ny\"z\\w\065"
B = 'it\'s'
C = [[x]]
D = [==[x]]y]==]`;
    expect(parseSavedVariables(src)).toEqual({
      A: 'x\ny"z\\wA',
      B: "it's",
      C: "x",
      D: "x]]y",
    });
  });

  it("parses booleans and nil", () => {
    expect(parseSavedVariables("A = true\nB = false\nC = nil")).toEqual({
      A: true,
      B: false,
      C: null,
    });
  });

  it("ignores comments", () => {
    expect(parseSavedVariables("-- line\nA = 1 --[[ block ]] B = 2 -- end")).toEqual({ A: 1, B: 2 });
  });

  it("accepts trailing commas and ; separators", () => {
    expect(parseSavedVariables("A = { 1, 2, };\nB = { x = 1; y = 2; }")).toEqual({
      A: [1, 2],
      B: { x: 1, y: 2 },
    });
  });

  it("empty or comment-only file returns {}", () => {
    expect(parseSavedVariables("")).toEqual({});
    expect(parseSavedVariables("-- nothing\n--[[ here ]]\n")).toEqual({});
  });

  it("treats an empty table as an empty object and keeps __proto__ as plain data", () => {
    expect(parseSavedVariables("A = {}")).toEqual({ A: {} });
    const out = parseSavedVariables('A = { ["__proto__"] = { x = 1 } }') as any;
    expect(Object.keys(out.A)).toEqual(["__proto__"]);
    expect(({} as any).x).toBeUndefined();
  });

  it("rejects code", () => {
    for (const src of ['A = os.execute("x")', "A = function() end", "local x = 1"]) {
      expect(() => parseSavedVariables(src), src).toThrow(LuaParseError);
    }
  });

  it("rejects nesting deeper than 200", () => {
    expect(() => parseSavedVariables("A = " + "{".repeat(201) + "}".repeat(201))).toThrow(LuaParseError);
    expect(() => parseSavedVariables("A = " + "{".repeat(100) + "}".repeat(100))).not.toThrow();
  });

  it("truncated input throws LuaParseError with line and column", () => {
    try {
      parseSavedVariables("A = { b = ");
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(LuaParseError);
      const err = e as LuaParseError;
      expect(err.line).toBe(1);
      expect(err.column).toBeGreaterThan(0);
    }
  });

  it("parses a 5 MB generated table in under 2 seconds", () => {
    const parts: string[] = ["Big = {\n"];
    let size = 0;
    for (let i = 1; size < 5 * 1024 * 1024; i++) {
      const row = `\t["k${i}"] = { ["name"] = "item ${i}", ["n"] = ${i}, ["t"] = { 1, 2, 3 } },\n`;
      parts.push(row);
      size += row.length;
    }
    parts.push("}\n");
    const src = parts.join("");
    expect(src.length).toBeGreaterThanOrEqual(5 * 1024 * 1024);
    const start = performance.now();
    const out = parseSavedVariables(src);
    const ms = performance.now() - start;
    console.log(`5 MB parse took ${ms.toFixed(0)} ms`);
    expect(Object.keys(out.Big as object).length).toBeGreaterThan(10000);
    expect(ms).toBeLessThan(2000);
  });

  it("parses fixtures/basic.lua", () => {
    const src = readFileSync(new URL("./fixtures/basic.lua", import.meta.url), "utf8");
    const out = parseSavedVariables(src) as any;
    expect(out.ForeverTrackerSettings).toBe("x");
    const snap = out.ForeverTrackerDB.characters["Player-1234-ABCDEF01"].snapshot;
    expect(out.ForeverTrackerDB.version).toBe(1);
    expect(snap.equipped).toEqual({ HeadSlot: 12345, BackSlot: 0 });
    expect(snap.bags).toEqual([12, 34, 56]);
    expect(snap.sparse).toEqual({ "1": "a", "5": "b" });
    expect(snap.motd).toBe('Line one\nLine "two"');
    expect(snap.ratio).toBe(0.75);
    expect(snap.flag).toBe(true);
    expect(snap.nothing).toBeNull();
  });
});
