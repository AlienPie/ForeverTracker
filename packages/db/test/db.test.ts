import { describe, expect, test } from "vitest";
import { sql } from "drizzle-orm";
import { openDb, contentRecord, snapshot, deviceToken, character, syncState } from "../src/index";

describe("db", () => {
  test('openDb(":memory:") creates all tables', () => {
    const db = openDb(":memory:");
    const rows = db.all<{ name: string }>(sql`select name from sqlite_master where type = 'table'`);
    const names = rows.map((r) => r.name);
    for (const t of ["content_record", "sync_state", "character", "snapshot", "device_token"]) {
      expect(names).toContain(t);
    }
  });

  test("contentRecord rejects duplicate (resource,id)", () => {
    const db = openDb(":memory:");
    const row = { resource: "item", id: 1, build: "1", data: "{}", fetchedAt: 1 };
    db.insert(contentRecord).values(row).run();
    expect(() => db.insert(contentRecord).values(row).run()).toThrow();
  });

  test("snapshot rejects duplicate (guid,takenAt)", () => {
    const db = openDb(":memory:");
    db.insert(character).values({ guid: "g1", firstSeenAt: 1, latestTakenAt: 1 }).run();
    const row = { guid: "g1", takenAt: 5, build: "1", schema: 1, raw: "{}", unsupported: false };
    db.insert(snapshot).values(row).run();
    expect(() => db.insert(snapshot).values(row).run()).toThrow();
  });

  test("deviceToken.tokenHash is unique", () => {
    const db = openDb(":memory:");
    db.insert(deviceToken).values({ id: "a", label: "x", tokenHash: "h", createdAt: 1 }).run();
    expect(() =>
      db.insert(deviceToken).values({ id: "b", label: "y", tokenHash: "h", createdAt: 2 }).run(),
    ).toThrow();
  });

  test("syncState round trips", () => {
    const db = openDb(":memory:");
    db.insert(syncState).values({ resource: "item", build: "1", nextOffset: 0, status: "idle", updatedAt: 1 }).run();
    expect(db.select().from(syncState).all()[0]?.total).toBeNull();
  });
});
