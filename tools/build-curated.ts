// Build data/curated/quest-tags.json and zones.json from the capture files in data/wowhead-captures.
//   pnpm curated:build
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { CuratedTags, CuratedZone, QuestTag, QuestTagKind } from "../packages/core/src/index";
import { readQuestIdsReadonly, resolveDataDir } from "../packages/db/src/index";

export type Capture = {
  tool: "ft-capture";
  version: 1;
  url: string;
  title: string;
  capturedAt: string;
  kind: string;
  value: string;
  rows: { questId: number; name: string }[];
  zoneRows: { cells: string[] }[];
  notes: string[];
};

const CLASSES = ["Warrior", "Paladin", "Hunter", "Rogue", "Priest", "Shaman", "Mage", "Warlock", "Druid"];
const TAG_KINDS = ["class", "race", "profession"];

export function buildCurated(
  captures: Capture[],
  mirrorQuestIds: Set<number> | null,
  existing: { patch: string | null; capturedAt: string | null },
): { tags: CuratedTags; zones: CuratedZone[]; report: string[] } {
  const report: string[] = [];
  const tags: QuestTag[] = [];
  const zones: CuratedZone[] = [];
  const seenTag = new Set<string>();

  for (const cap of captures) {
    if (TAG_KINDS.includes(cap.kind)) {
      const kind = cap.kind as QuestTagKind;
      let value = (cap.value ?? "").trim();
      if (!value) {
        report.push(`skipped capture ${cap.url}: ${kind} capture has no value`);
        continue;
      }
      if (kind === "class") {
        const match = CLASSES.find((c) => c.toLowerCase() === value.toLowerCase());
        if (!match) {
          report.push(`skipped capture ${cap.url}: "${value}" is not a class name`);
          continue;
        }
        value = match;
      }
      for (const row of cap.rows) {
        const key = `${row.questId}|${kind}|${value.toLowerCase()}`;
        if (seenTag.has(key)) continue;
        seenTag.add(key);
        tags.push({ questId: row.questId, kind, value });
      }
    } else if (cap.kind === "zones") {
      cap.zoneRows.forEach((row, i) => {
        const z = parseZoneRow(row.cells ?? []);
        if (z) zones.push(z);
        else report.push(`zone row ${i + 1} not parsed (no name cell): ${JSON.stringify(row.cells)}`);
      });
    } else {
      report.push(`skipped capture ${cap.url}: kind "${cap.kind}" is not usable (rerun the snippet with ftCapture)`);
    }
  }

  const classesByQuest = new Map<number, string[]>();
  for (const t of tags) {
    if (t.kind !== "class") continue;
    const list = classesByQuest.get(t.questId) ?? [];
    list.push(t.value);
    classesByQuest.set(t.questId, list);
  }
  for (const [id, list] of classesByQuest) {
    if (list.length > 1) report.push(`quest ${id} is tagged with several classes: ${list.join(", ")} (kept for all)`);
  }

  if (mirrorQuestIds === null) {
    report.push("mirror not available, ids not validated");
  } else {
    const missing = [...new Set(tags.map((t) => t.questId))].filter((id) => !mirrorQuestIds.has(id));
    if (missing.length > 0) {
      report.push(`not in the mirror: ${missing.length} ids, first five: ${missing.slice(0, 5).join(", ")}`);
    }
  }

  return { tags: { patch: existing.patch, capturedAt: existing.capturedAt, tags }, zones, report };
}

function parseZoneRow(cells: string[]): CuratedZone | null {
  const name = (cells[0] ?? "").trim();
  if (!name) return null;
  let minLevel: number | null = null;
  let maxLevel: number | null = null;
  let territory: CuratedZone["territory"] = null;
  let type: CuratedZone["type"] = "zone";
  let levelDone = false;
  for (const raw of cells.slice(1)) {
    const cell = raw.trim();
    const range = /^(\d+)\s*[-–]\s*(\d+)$/.exec(cell);
    if (!levelDone && range) {
      minLevel = Number(range[1]);
      maxLevel = Number(range[2]);
      levelDone = true;
    } else if (!levelDone && /^\d+$/.test(cell)) {
      minLevel = maxLevel = Number(cell);
      levelDone = true;
    } else if (/^(Alliance|Horde|Contested)$/i.test(cell)) {
      territory = (cell.charAt(0).toUpperCase() + cell.slice(1).toLowerCase()) as CuratedZone["territory"];
    } else if (/dungeon/i.test(cell)) type = "dungeon";
    else if (/raid/i.test(cell)) type = "raid";
    else if (/battleground/i.test(cell)) type = "battleground";
  }
  return { name, minLevel, maxLevel, territory, type };
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function isCapture(x: unknown): x is Capture {
  const c = x as Capture | null;
  return (
    !!c &&
    typeof c === "object" &&
    c.tool === "ft-capture" &&
    typeof c.kind === "string" &&
    typeof c.value === "string" &&
    Array.isArray(c.rows) &&
    c.rows.every((r) => r && Number.isInteger(r.questId)) &&
    (c.zoneRows === undefined || Array.isArray(c.zoneRows))
  );
}

function main(): void {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const capDir = join(root, "data/wowhead-captures");
  const curDir = join(root, "data/curated");
  const files = existsSync(capDir) ? readdirSync(capDir).filter((f) => f.endsWith(".json")).sort() : [];
  if (files.length === 0) {
    console.log("No captures found in data/wowhead-captures; curated files left untouched.");
    return;
  }
  const captures: Capture[] = [];
  for (const f of files) {
    const data = readJson(join(capDir, f));
    if (!isCapture(data)) {
      console.error(`${f} is not a valid capture file (expected JSON from the ft-capture snippet).`);
      process.exit(1);
    }
    data.zoneRows ??= [];
    data.notes ??= [];
    captures.push(data);
  }

  let mirror: Set<number> | null = null;
  const dbPath = join(resolveDataDir(process.env), "forevertracker.sqlite");
  let mirrorError: string | null = null;
  if (existsSync(dbPath)) {
    try {
      mirror = new Set(readQuestIdsReadonly(dbPath));
      if (mirror.size === 0) mirrorError = "no quest records in the mirror";
    } catch (e) {
      mirrorError = e instanceof Error ? e.message : String(e);
    }
    if (mirrorError !== null) mirror = null;
  }

  const prev = readJson(join(curDir, "quest-tags.json")) as { patch?: unknown; capturedAt?: unknown } | null;
  const existing = {
    patch: typeof prev?.patch === "string" ? prev.patch : null,
    capturedAt: new Date().toISOString().slice(0, 10),
  };
  const { tags, zones, report } = buildCurated(captures, mirror, existing);
  if (mirrorError !== null) report.push(`mirror error: ${mirrorError}`);
  for (const c of captures) for (const n of c.notes) report.push(`note from capture ${c.url}: ${n}`);

  const hasTagCaptures = captures.some((c) => TAG_KINDS.includes(c.kind));
  const hasZoneCaptures = captures.some((c) => c.kind === "zones");
  if (hasTagCaptures) {
    writeFileSync(join(curDir, "quest-tags.json"), JSON.stringify({ version: 1, ...tags }, null, 2) + "\n");
  }
  if (hasZoneCaptures) {
    writeFileSync(join(curDir, "zones.json"), JSON.stringify({ version: 1, zones }, null, 2) + "\n");
  }
  console.log(`${tags.tags.length} tags, ${zones.length} zones from ${captures.length} capture file(s).`);
  for (const line of report) console.log(`- ${line}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
