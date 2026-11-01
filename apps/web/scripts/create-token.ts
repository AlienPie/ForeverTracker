import { getDb } from "../src/lib/server/db";
import { createDeviceToken } from "../src/lib/server/tokens";

const label = process.argv[2];
if (!label) {
  console.error("usage: pnpm token:create <label>");
  process.exit(1);
}
const { id, token } = createDeviceToken(getDb(), label);
console.log(`Device token #${id} (${label}) created. It is shown only once:\n${token}`);
