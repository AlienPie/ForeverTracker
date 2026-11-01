import { openDb, type Db } from "@ft/db";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { resolveDataDir } from "./data-dir";

let db: Db | undefined;

/** Open the app database lazily (so building and health checks never need it). */
export function getDb(): Db {
  if (!db) {
    const dataDir = resolveDataDir();
    mkdirSync(dataDir, { recursive: true });
    db = openDb(join(dataDir, "forevertracker.sqlite"));
  }
  return db;
}
