import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { resolveDataDir } from "../src/lib/server/data-dir";

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
