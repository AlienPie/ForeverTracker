import { apiSnapshot, character, type Db } from "@ft/db";
import type { ApiSnapshot } from "@ft/content";
import { eq } from "drizzle-orm";

function parse(text: string): ApiSnapshot | null {
  try {
    const v = JSON.parse(text) as ApiSnapshot;
    return v && typeof v === "object" && Array.isArray(v.completed) && Array.isArray(v.inLog) ? v : null;
  } catch {
    return null;
  }
}

/** The stored Blizzard profile of a character, or null when none was fetched or it cannot be read. */
export function getApiSnapshot(db: Db, guid: string): ApiSnapshot | null {
  const row = db.select().from(apiSnapshot).where(eq(apiSnapshot.guid, guid)).get();
  return row ? parse(row.data) : null;
}

/** Stores (replaces) a character's Blizzard profile; false for an unknown character. */
export function saveApiSnapshot(db: Db, guid: string, snap: ApiSnapshot): boolean {
  if (!db.select().from(character).where(eq(character.guid, guid)).get()) return false;
  const row = { guid, fetchedAt: snap.fetchedAt, lastModified: snap.lastModified, data: JSON.stringify(snap) };
  db.insert(apiSnapshot).values(row).onConflictDoUpdate({ target: apiSnapshot.guid, set: row }).run();
  return true;
}
