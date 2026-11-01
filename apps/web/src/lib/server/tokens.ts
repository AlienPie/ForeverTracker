import { deviceToken, type Db } from "@ft/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Create a device token. Only the SHA-256 hex of the token is stored; the
 * plaintext is returned once. `device_token.id` is a TEXT column, so the
 * numeric id is stored as its decimal string.
 */
export function createDeviceToken(db: Db, label: string): { id: number; token: string } {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const id = db.transaction((tx) => {
    const max = tx
      .select({ m: sql<number | null>`max(cast(${deviceToken.id} as integer))` })
      .from(deviceToken)
      .get();
    const next = (max?.m ?? 0) + 1;
    tx.insert(deviceToken)
      .values({ id: String(next), label, tokenHash, createdAt: Math.floor(Date.now() / 1000) })
      .run();
    return next;
  });
  return { id, token };
}

/** Look up a token by its hash; revoked or unknown tokens give null. */
export function verifyDeviceToken(db: Db, token: string): { id: number } | null {
  if (!token) return null;
  const row = db
    .select({ id: deviceToken.id })
    .from(deviceToken)
    .where(and(eq(deviceToken.tokenHash, hashToken(token)), isNull(deviceToken.revokedAt)))
    .get();
  return row ? { id: Number(row.id) } : null;
}
