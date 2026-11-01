import { createHash } from "node:crypto";
import { deviceToken, openDb } from "@ft/db";
import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { createDeviceToken, verifyDeviceToken } from "../src/lib/server/tokens";

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
    db.update(deviceToken).set({ revokedAt: 5 }).where(eq(deviceToken.id, String(id))).run();
    expect(verifyDeviceToken(db, token)).toBeNull();
  });
});
