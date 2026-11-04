import { openDataDb } from "@ft/db";
import { createForeverDbClient } from "../client/client";
import { syncAll } from "../mirror/sync";

const apiKey = process.env.FOREVERDB_API_KEY;
if (!apiKey) throw new Error("FOREVERDB_API_KEY is not set");

// DATA_DIR is optional: same resolution as the server and token CLI (default ./data-local at the workspace root).
const db = openDataDb();
const client = createForeverDbClient({ apiKey });

await syncAll({
  client,
  db,
  onProgress: (p) => console.log(`${p.resource} ${p.done}/${p.total ?? "?"}`),
});
console.log("content sync complete");
