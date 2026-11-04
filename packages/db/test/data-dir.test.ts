import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { existsSync } from "node:fs";
import { sql } from "drizzle-orm";
import { openDataDb, resolveDataDir } from "../src/index";

describe("resolveDataDir", () => {
  test("absolute DATA_DIR is used as-is", () => {
    expect(resolveDataDir({ DATA_DIR: "/srv/ft" }, "/anywhere")).toBe("/srv/ft");
  });

  test("relative DATA_DIR resolves against the workspace root from a nested cwd", () => {
    const root = mkdtempSync(join(tmpdir(), "ft-ws-"));
    writeFileSync(join(root, "pnpm-workspace.yaml"), "packages: []\n");
    const nested = join(root, "apps", "web");
    mkdirSync(nested, { recursive: true });
    expect(resolveDataDir({ DATA_DIR: "./data-local" }, nested)).toBe(join(root, "data-local"));
    expect(resolveDataDir({}, nested)).toBe(join(root, "data-local"));
  });

  test("no workspace file -> relative to cwd", () => {
    const dir = mkdtempSync(join(tmpdir(), "ft-nows-"));
    expect(resolveDataDir({ DATA_DIR: "data" }, dir)).toBe(resolve(dir, "data"));
  });
});

describe("openDataDb", () => {
  test("creates the directory, opens forevertracker.sqlite and migrates it", () => {
    const base = mkdtempSync(join(tmpdir(), "ft-open-"));
    const dir = join(base, "nested", "data");
    const db = openDataDb({ DATA_DIR: dir });
    expect(existsSync(join(dir, "forevertracker.sqlite"))).toBe(true);
    const names = db.all<{ name: string }>(sql`select name from sqlite_master where type = 'table'`).map((r) => r.name);
    expect(names).toContain("snapshot");
  });
});
