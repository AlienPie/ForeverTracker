import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { openDb } from "@ft/db";
import { createDeviceToken } from "../src/lib/server/tokens";

const label = process.argv[2];
if (!label) {
  console.error("usage: pnpm token:create <label>");
  process.exit(1);
}
const dataDir = process.env.DATA_DIR || "./data-local";
mkdirSync(dataDir, { recursive: true });
const db = openDb(join(dataDir, "forevertracker.sqlite"));
const { id, token } = createDeviceToken(db, label);
console.log(`Device token #${id} (${label}) created. It is shown only once:\n${token}`);
