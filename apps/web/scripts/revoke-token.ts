import { getDb } from "../src/lib/server/db";
import { revokeDeviceToken } from "../src/lib/server/tokens";

const id = Number(process.argv[2]);
if (!Number.isInteger(id) || id < 1) {
  console.error("usage: pnpm token:revoke <id>");
  process.exit(1);
}
if (revokeDeviceToken(getDb(), id)) {
  console.log(`Device token #${id} revoked.`);
} else {
  console.error(`No active device token #${id} (unknown or already revoked).`);
  process.exit(1);
}
