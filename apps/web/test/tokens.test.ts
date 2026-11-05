import { createHash } from "node:crypto";
import { deviceToken, openDb } from "@ft/db";
import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { createDeviceToken, listDeviceTokens, revokeDeviceToken, verifyDeviceToken } from "../src/lib/server/tokens";

describe("device tokens", () => {
  test("tokens are stored hashed, never plaintext", () => {
    const db = openDb(":memory:");
    const { id, token } = createDeviceToken(db, "laptop");
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const rows = db.select().from(deviceToken).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(JSON.stringify(rows)).not.toContain(token);
    expect(verifyDeviceToken(db, token)).toEqual({ id });
  });

  test("ids increment and tokens are unique", () => {
    const db = openDb(":memory:");
    const a = createDeviceToken(db, "a");
    const b = createDeviceToken(db, "b");
    expect(typeof a.id).toBe("number");
    expect(b.id).toBeGreaterThan(a.id);
    expect(b.id).toBe(a.id + 1);
    expect(b.token).not.toBe(a.token);
  });

  test("unknown or empty token fails verification", () => {
    const db = openDb(":memory:");
    createDeviceToken(db, "a");
    expect(verifyDeviceToken(db, "nope")).toBeNull();
    expect(verifyDeviceToken(db, "")).toBeNull();
  });

  test("revoked token fails verification", () => {
    const db = openDb(":memory:");
    const { id, token } = createDeviceToken(db, "laptop");
    db.update(deviceToken).set({ revokedAt: 5 }).where(eq(deviceToken.id, id)).run();
    expect(verifyDeviceToken(db, token)).toBeNull();
  });

  test("list shows label and revoked state, never the hash", () => {
    const db = openDb(":memory:");
    const a = createDeviceToken(db, "laptop");
    const b = createDeviceToken(db, "desk");
    revokeDeviceToken(db, b.id);
    const rows = listDeviceTokens(db);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: a.id, label: "laptop", revokedAt: null });
    expect(rows[1]!.revokedAt).toEqual(expect.any(Number));
    for (const r of rows) expect(Object.keys(r).sort()).toEqual(["createdAt", "id", "label", "revokedAt"]);
    expect(JSON.stringify(rows)).not.toContain(a.token);
  });

  test("revoke makes verification fail; second revoke and unknown id give false", () => {
    const db = openDb(":memory:");
    const { id, token } = createDeviceToken(db, "laptop");
    expect(revokeDeviceToken(db, id)).toBe(true);
    expect(verifyDeviceToken(db, token)).toBeNull();
    expect(revokeDeviceToken(db, id)).toBe(false);
    expect(revokeDeviceToken(db, 9999)).toBe(false);
  });
});
