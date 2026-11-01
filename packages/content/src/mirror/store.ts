import { and, asc, eq } from "drizzle-orm";
import { contentRecord, syncState, type Db } from "@ft/db";

/**
 * NOTE: `content_record.id` is declared INTEGER in @ft/db, but mirrored keys can be strings
 * ("mage", "alchemy@100"). SQLite's integer affinity stores non-numeric text as text and
 * numeric-looking text as an integer, and comparisons apply the same affinity, so string keys
 * round-trip correctly. The cast below is confined to this file.
 */
const key = (id: string): number => id as unknown as number;

export type StoredRecord = { data: unknown; build: string; fetchedAt: number };
export type SyncRow = typeof syncState.$inferSelect;

export function getRecord(db: Db, resource: string, id: string): StoredRecord | null {
  const row = db
    .select()
    .from(contentRecord)
    .where(and(eq(contentRecord.resource, resource), eq(contentRecord.id, key(id))))
    .get();
  return row ? { data: JSON.parse(row.data), build: row.build, fetchedAt: row.fetchedAt } : null;
}

export function putRecord(
  db: Db,
  resource: string,
  id: string,
  data: unknown,
  build: string,
  fetchedAt: number,
): void {
  const row = { resource, id: key(id), build, data: JSON.stringify(data), fetchedAt };
  db.insert(contentRecord)
    .values(row)
    .onConflictDoUpdate({
      target: [contentRecord.resource, contentRecord.id],
      set: { build, data: row.data, fetchedAt },
    })
    .run();
}

export function listRecords(
  db: Db,
  resource: string,
  opts: { limit?: number; offset?: number } = {},
): unknown[] {
  const q = db
    .select({ data: contentRecord.data })
    .from(contentRecord)
    .where(eq(contentRecord.resource, resource))
    .orderBy(asc(contentRecord.id))
    .limit(opts.limit ?? -1)
    .offset(opts.offset ?? 0);
  return q.all().map((r) => JSON.parse(r.data));
}

export function deleteResource(db: Db, resource: string): void {
  db.delete(contentRecord).where(eq(contentRecord.resource, resource)).run();
}

export function getSyncState(db: Db, resource: string): SyncRow | null {
  return db.select().from(syncState).where(eq(syncState.resource, resource)).get() ?? null;
}

export function setSyncState(db: Db, row: SyncRow): void {
  db.insert(syncState)
    .values(row)
    .onConflictDoUpdate({ target: syncState.resource, set: row })
    .run();
}
