// Manual check, NOT run in CI. Feeds the snapshot written by the addon specs
// through the real parser + ingest into an in-memory DB, and exits non-zero
// unless exactly one snapshot was stored with no failures.
//   cd addon && ./test.sh && cd .. && pnpm exec tsx tools/addon-roundtrip.ts
import { existsSync, readFileSync } from "node:fs";
import { openDb } from "../packages/db/src/index";
import { ingestSavedVariables } from "../packages/core/src/index";

const path = new URL("../addon/tests/out/snapshot.lua", import.meta.url);
if (!existsSync(path)) {
  console.error("addon/tests/out/snapshot.lua is missing; run `cd addon && ./test.sh` first");
  process.exit(1);
}
const db = openDb(":memory:");
const summary = ingestSavedVariables(db, readFileSync(path, "utf8"));
console.log(summary);
if (summary.stored !== 1 || summary.failed !== 0) {
  console.error(`round trip failed: expected stored 1 and failed 0, got stored ${summary.stored}, failed ${summary.failed}`);
  process.exit(1);
}
console.log("round trip ok");
