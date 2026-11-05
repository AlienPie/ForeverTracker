import { fail, type Actions } from "@sveltejs/kit";
import { contentRecord, syncState } from "@ft/db";
import { and, eq } from "drizzle-orm";
import { formatDay } from "../../lib/journey";
import { getDb } from "../../lib/server/db";
import { env } from "../../lib/server/env";
import { createDeviceToken, listDeviceTokens, revokeDeviceToken } from "../../lib/server/tokens";

export type TokenRow = { id: number; label: string; created: string | null; revoked: boolean };
export type ResourceRow = { resource: string; build: string; status: string; total: number | null; updated: string | null };
export type SettingsData = {
  tokens: TokenRow[];
  content: { build: string | null; levelCap: number | null; resources: ResourceRow[] };
  loginEnabled: boolean;
};

const MAX_LABEL = 60;

function readMeta(): { build: string | null; levelCap: number | null } {
  const row = getDb()
    .select({ data: contentRecord.data })
    .from(contentRecord)
    .where(and(eq(contentRecord.resource, "meta"), eq(contentRecord.id, "current")))
    .get();
  try {
    const m: unknown = row ? JSON.parse(row.data) : null;
    if (typeof m !== "object" || m === null) return { build: null, levelCap: null };
    const { build, levelCap } = m as { build?: unknown; levelCap?: unknown };
    return {
      build: typeof build === "string" && build ? build : null,
      levelCap: typeof levelCap === "number" && Number.isFinite(levelCap) ? levelCap : null,
    };
  } catch {
    return { build: null, levelCap: null };
  }
}

export const load = (): SettingsData => {
  const db = getDb();
  const resources: ResourceRow[] = db
    .select()
    .from(syncState)
    .orderBy(syncState.resource)
    .all()
    .map((r) => ({ resource: r.resource, build: r.build, status: r.status, total: r.total, updated: formatDay(r.updatedAt / 1000) /* sync stores milliseconds */ }));
  const meta = readMeta();
  return {
    tokens: listDeviceTokens(db).map((t) => ({
      id: t.id,
      label: t.label,
      created: formatDay(t.createdAt),
      revoked: t.revokedAt !== null,
    })),
    content: {
      // The meta record is the source of truth; fall back to the build the sync recorded.
      build: meta.build ?? resources[0]?.build ?? null,
      levelCap: meta.levelCap,
      resources,
    },
    loginEnabled: env().ownerPassword !== null,
  };
};

export const actions: Actions = {
  create: async ({ request }) => {
    const raw = (await request.formData()).get("label");
    const label = typeof raw === "string" ? raw.trim() : "";
    // eslint-disable-next-line no-control-regex
    if (!label || label.length > MAX_LABEL || /[\u0000-\u001f\u007f]/.test(label)) {
      return fail(400, { error: `Give the token a label of 1 to ${MAX_LABEL} characters, without control characters.`, action: "create" });
    }
    const { token } = createDeviceToken(getDb(), label);
    // The plaintext exists only in this action result.
    return { created: { label, token } };
  },
  revoke: async ({ request }) => {
    const raw = (await request.formData()).get("id");
    const id = typeof raw === "string" && /^[1-9]\d{0,14}$/.test(raw) ? Number(raw) : null;
    if (id === null) return fail(400, { error: "That token id is not valid.", action: "revoke" });
    if (!revokeDeviceToken(getDb(), id)) return fail(400, { error: "That token was not found or is already revoked.", action: "revoke" });
    return { revoked: id };
  },
};
