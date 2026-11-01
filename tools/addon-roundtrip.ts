// Manual check, NOT run in CI. Feeds the snapshot written by the addon specs
// through the real parser + ingest into an in-memory DB.
//   cd addon && ./test.sh && cd .. && pnpm exec tsx tools/addon-roundtrip.ts
import { readFileSync } from "node:fs";
import { openDb } from "../packages/db/src/index";
import { ingestSavedVariables } from "../packages/core/src/index";

const path = new URL("../addon/tests/out/snapshot.lua", import.meta.url);
const source = readFileSync(path, "utf8");
const db = openDb(":memory:");
console.log(ingestSavedVariables(db, source));
