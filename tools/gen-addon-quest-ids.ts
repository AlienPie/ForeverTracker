import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { openDataDb } from "../packages/db/src/index";
import { readQuestIds, renderQuestIdsLua } from "../packages/content/src/index";

const out = fileURLToPath(new URL("../addon/ForeverTracker/Data/QuestIds.lua", import.meta.url));
const { ids, build } = readQuestIds(openDataDb(process.env));
const lua = renderQuestIdsLua(ids, build ?? "unknown");
writeFileSync(out, lua);
console.log(`Wrote ${new Set(ids).size} quest IDs (build ${build ?? "unknown"}) to ${out}`);
