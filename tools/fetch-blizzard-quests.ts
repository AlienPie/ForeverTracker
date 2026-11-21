// Fetch quest requirements from Blizzard's Forever game data into data/curated/blizzard-quests.json.
// Ids: every quest in the local mirror (read-only), those from the last run, and any given on the command line.
//   pnpm blizzard:quests [--region eu] [extra quest ids ...]
// Needs BLIZZARD_CLIENT_ID and BLIZZARD_CLIENT_SECRET. Credentials and the token are never printed.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseBlizzardQuest, type BlizzardQuest } from "../packages/core/src/index";
import { readQuestIdsReadonly, resolveDataDir } from "../packages/db/src/index";

const CONCURRENCY = 10;
const args = process.argv.slice(2);
const ri = args.indexOf("--region");
const region = ri >= 0 ? (args.splice(ri, 2)[1] ?? "eu") : "eu";
const extra = args.map(Number).filter((n) => Number.isInteger(n) && n > 0);

const { BLIZZARD_CLIENT_ID: clientId, BLIZZARD_CLIENT_SECRET: secret } = process.env;
if (!clientId || !secret) {
  console.error("Set BLIZZARD_CLIENT_ID and BLIZZARD_CLIENT_SECRET (run through `node --env-file=.env`).");
  process.exit(1);
}

const root = fileURLToPath(new URL("..", import.meta.url));
const dbPath = join(resolveDataDir(process.env), "forevertracker.sqlite");
const mirrorIds = existsSync(dbPath) ? readQuestIdsReadonly(dbPath) : [];
// Ids found on an earlier run stay (they include ids the mirror lacks).
const outPath = join(root, "data/curated/blizzard-quests.json");
let earlier: number[] = [];
try {
  earlier = ((JSON.parse(readFileSync(outPath, "utf8")) as { quests?: { id: number }[] }).quests ?? []).map((q) => q.id);
} catch {
  // first run
}
const ids = [...new Set([...mirrorIds, ...earlier, ...extra])].sort((a, b) => a - b);
if (ids.length === 0) {
  console.error(`No quest ids: the mirror at ${dbPath} is empty or missing and none were given.`);
  process.exit(1);
}

const tokenRes = await fetch("https://oauth.battle.net/token", {
  method: "POST",
  headers: { authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`, "content-type": "application/x-www-form-urlencoded" },
  body: "grant_type=client_credentials",
});
if (!tokenRes.ok) {
  console.error(`Token request failed: HTTP ${tokenRes.status}`);
  process.exit(1);
}
const token = ((await tokenRes.json()) as { access_token: string }).access_token;

const found: BlizzardQuest[] = [];
const missing: number[] = [];
const failed: number[] = [];
async function one(id: number): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(`https://${region}.api.blizzard.com/data/wow/quest/${id}?namespace=static-forever-${region}&locale=en_GB`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (r.status === 429 || r.status >= 500) {
      await new Promise((ok) => setTimeout(ok, 1000 * (attempt + 1)));
      continue;
    }
    if (r.status === 404) return void missing.push(id);
    if (!r.ok) return void failed.push(id);
    const q = parseBlizzardQuest(await r.json());
    return void (q ? found.push(q) : failed.push(id));
  }
  failed.push(id);
}
let next = 0;
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (next < ids.length) await one(ids[next++]!);
  }),
);
if (failed.length > 0) {
  console.error(`${failed.length} lookups failed (first: ${failed.slice(0, 5).join(", ")}); nothing written. Run again.`);
  process.exit(1);
}
found.sort((a, b) => a.id - b.id);
writeFileSync(
  outPath,
  JSON.stringify({ version: 1, region, fetchedAt: new Date().toISOString().slice(0, 10), quests: found }, null, 1) + "\n",
);
console.log(`${found.length} quests written, ${missing.length} not in Blizzard's data${missing.length ? ` (first: ${missing.slice(0, 8).join(", ")})` : ""}.`);
