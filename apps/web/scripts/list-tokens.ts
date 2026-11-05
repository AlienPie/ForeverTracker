import { getDb } from "../src/lib/server/db";
import { listDeviceTokens } from "../src/lib/server/tokens";

const rows = listDeviceTokens(getDb());
if (rows.length === 0) console.log("No device tokens.");
for (const r of rows) {
  const created = new Date(r.createdAt * 1000).toISOString();
  const state = r.revokedAt === null ? "active" : `revoked ${new Date(r.revokedAt * 1000).toISOString()}`;
  console.log(`#${r.id}\t${r.label}\tcreated ${created}\t${state}`);
}
