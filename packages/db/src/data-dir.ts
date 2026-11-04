import { existsSync, mkdirSync } from "node:fs";
import { openDb, type Db } from "./client";
import { dirname, isAbsolute, join, resolve } from "node:path";

/**
 * Resolve DATA_DIR so the server and the CLI always agree. Absolute paths are used
 * as-is; relative ones resolve against the nearest ancestor of `cwd` containing
 * pnpm-workspace.yaml (the workspace root), falling back to `cwd` itself.
 */
export function resolveDataDir(
  source: { DATA_DIR?: string | undefined } = process.env,
  cwd: string = process.cwd(),
): string {
  const configured = source.DATA_DIR || "./data-local";
  if (isAbsolute(configured)) return configured;
  let dir = resolve(cwd);
  for (;;) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return resolve(dir, configured);
    const parent = dirname(dir);
    if (parent === dir) return resolve(cwd, configured);
    dir = parent;
  }
}

/** Open the app database at `${resolveDataDir(env)}/forevertracker.sqlite`, creating the directory. */
export function openDataDb(
  source: { DATA_DIR?: string | undefined } = process.env,
  cwd: string = process.cwd(),
): Db {
  const dir = resolveDataDir(source, cwd);
  mkdirSync(dir, { recursive: true });
  return openDb(join(dir, "forevertracker.sqlite"));
}
