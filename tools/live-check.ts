// Manual check against the real API. NOT run in CI.
//   FOREVERDB_API_KEY=... pnpm tsx tools/live-check.ts
import { createForeverDbClient } from "../packages/content/src/index";

const apiKey = process.env.FOREVERDB_API_KEY;
if (!apiKey) {
  console.error("Set FOREVERDB_API_KEY in the environment.");
  process.exit(1);
}

let dailyRemaining: string | null = null;
const client = createForeverDbClient({
  apiKey,
  fetch: async (input, init) => {
    const res = await fetch(input, init);
    dailyRemaining = res.headers.get("x-daily-remaining");
    return res;
  },
});

const { data, meta } = await client.get<{ build: string; levelCap: number }>("/meta");
console.log(`build: ${data.build}`);
console.log(`level cap: ${data.levelCap}`);
console.log(`api meta build: ${meta.build}`);
console.log(`daily remaining: ${dailyRemaining ?? "unknown"}`);
