import { contentRecord, openDb, type Db } from "@ft/db";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { catalogSource, createQuestCatalog, resetCuratedProblemLog } from "../src/lib/server/content";
import { resolveCuratedDir } from "../src/lib/server/env";

const NOW = 1_800_000_000;
const quest = (id: number, name: string) => ({
  id, name, level: 5, zone: { n: "Dun Morogh", slug: "dun-morogh", m: 1426 },
  chain: { previous: [], next: [], questLine: null }, starts: null, ends: null,
});
function seeded(): Db {
  const db = openDb(":memory:");
  const put = (resource: string, id: string, data: unknown) =>
    db.insert(contentRecord).values({ resource, id, build: "1.0", data: JSON.stringify(data), fetchedAt: NOW }).run();
  put("meta", "current", { build: "1.0", levelCap: 60 });
  put("quests", "9001", quest(9001, "Delve Deep"));
  put("quests", "9002", quest(9002, "Mining Training"));
  return db;
}
const dirs: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "ft-curated-"));
  dirs.push(d);
  return d;
};

describe("catalog with curated data", () => {
  test("tags and overrides are applied", async () => {
    const dir = tmp();
    writeFileSync(join(dir, "quest-tags.json"), JSON.stringify({ version: 1, tags: [{ questId: 9002, kind: "profession", value: "Mining" }] }));
    writeFileSync(join(dir, "overrides.json"), JSON.stringify({ version: 1, links: [{ from: 9001, to: 9002, note: "x" }] }));
    const memo = createQuestCatalog({ source: () => catalogSource("mirror", seeded()), curatedDir: () => dir });
    const cat = await memo.get();
    expect(cat.tags?.professionOf(9002)).toBe("Mining");
    expect(cat.quests.find((q) => q.id === 9002)!.chain.previous.map((l) => l.questId)).toEqual([9001]);
    expect(cat.zones).toBeUndefined();
  });

  test("missing directory: the catalog is as before, no warning", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const plain = await createQuestCatalog({ source: () => catalogSource("mirror", seeded()) }).get();
    const cat = await createQuestCatalog({
      source: () => catalogSource("mirror", seeded()),
      curatedDir: () => join(tmp(), "nope"),
    }).get();
    expect(cat).toEqual(plain);
    expect(cat.tags).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });

  test("curated problems are logged with console.warn", async () => {
    const dir = tmp();
    writeFileSync(join(dir, "overrides.json"), "{not json");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await createQuestCatalog({ source: () => catalogSource("mirror", seeded()), curatedDir: () => dir }).get();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe("skipped override links", () => {
  test("an unknown quest and a cycle are warned about once", async () => {
    resetCuratedProblemLog();
    const dir = tmp();
    writeFileSync(
      join(dir, "overrides.json"),
      JSON.stringify({
        version: 1,
        links: [
          { from: 9001, to: 9002 },
          { from: 9002, to: 9001 },
          { from: 9001, to: 4242 },
        ],
      }),
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const build = () => createQuestCatalog({ source: () => catalogSource("mirror", seeded()), curatedDir: () => dir }).get();
    await build();
    expect(warn).toHaveBeenCalledTimes(1);
    const msg = String(warn.mock.calls[0]![0]);
    expect(msg).toContain("4242");
    expect(msg).toContain("cycle");
    await build();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe("resolveCuratedDir", () => {
  test("explicit value wins; else the nearest data/curated up the tree; else cwd", () => {
    const root = tmp();
    mkdirSync(join(root, "data", "curated"), { recursive: true });
    mkdirSync(join(root, "apps", "web"), { recursive: true });
    expect(resolveCuratedDir("/x/y", root)).toBe("/x/y");
    expect(resolveCuratedDir(undefined, join(root, "apps", "web"))).toBe(join(root, "data", "curated"));
    const bare = tmp();
    expect(resolveCuratedDir(undefined, bare)).toBe(join(bare, "data", "curated"));
  });
});
