import { openDataDb, type Db } from "@ft/db";

let db: Db | undefined;

/** Open the app database lazily (so building and health checks never need it). */
export function getDb(): Db {
  if (!db) db = openDataDb();
  return db;
}
