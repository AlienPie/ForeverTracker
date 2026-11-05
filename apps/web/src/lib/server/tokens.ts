import { deviceToken, type Db } from "@ft/db";
import { and, eq, isNull } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Create a device token. Only the SHA-256 hex is stored; the plaintext is returned once. */
export function createDeviceToken(db: Db, label: string): { id: number; token: string } {
  const token = randomBytes(32).toString("base64url");
  const row = db
    .insert(deviceToken)
    .values({ label, tokenHash: hashToken(token), createdAt: Math.floor(Date.now() / 1000) })
    .returning({ id: deviceToken.id })
    .get();
  return { id: row.id, token };
}

/** Look up a token by its hash; revoked or unknown tokens give null. */
export function verifyDeviceToken(db: Db, token: string): { id: number } | null {
  if (!token) return null;
  const row = db
    .select({ id: deviceToken.id })
    .from(deviceToken)
    .where(and(eq(deviceToken.tokenHash, hashToken(token)), isNull(deviceToken.revokedAt)))
    .get();
  return row ? { id: row.id } : null;
}

/** All device tokens for the operator. Never includes the hash. */
export function listDeviceTokens(
  db: Db,
): { id: number; label: string; createdAt: number; revokedAt: number | null }[] {
  return db
    .select({
      id: deviceToken.id,
      label: deviceToken.label,
      createdAt: deviceToken.createdAt,
      revokedAt: deviceToken.revokedAt,
    })
    .from(deviceToken)
    .orderBy(deviceToken.id)
    .all();
}

/** Revoke a token. False when the id is unknown or the token is already revoked. */
export function revokeDeviceToken(db: Db, id: number): boolean {
  const res = db
    .update(deviceToken)
    .set({ revokedAt: Math.floor(Date.now() / 1000) })
    .where(and(eq(deviceToken.id, id), isNull(deviceToken.revokedAt)))
    .run();
  return res.changes > 0;
}
