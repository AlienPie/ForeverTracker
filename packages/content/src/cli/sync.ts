import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { openDb } from "@ft/db";
import { createForeverDbClient } from "../client/client";
import { syncAll } from "../mirror/sync";

const apiKey = process.env.FOREVERDB_API_KEY;
const dataDir = process.env.DATA_DIR;
if (!apiKey) throw new Error("FOREVERDB_API_KEY is not set");
if (!dataDir) throw new Error("DATA_DIR is not set");

mkdirSync(dataDir, { recursive: true });
const db = openDb(join(dataDir, "forevertracker.sqlite"));
const client = createForeverDbClient({ apiKey });

await syncAll({
  client,
  db,
  onProgress: (p) => console.log(`${p.resource} ${p.done}/${p.total ?? "?"}`),
});
console.log("content sync complete");
