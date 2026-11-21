import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mergeBlizzard, readBlizzardQuest, type BlizzardQuest } from "./blizzard";
import {
  emptyCurated,
  type Curated,
  type CuratedTerritory,
  type CuratedZone,
  type CuratedZoneType,
  type QuestLinkOverride,
  type QuestTag,
  type QuestTagKind,
} from "./types";

const SUPPORTED_VERSION = 1;
const KINDS: readonly string[] = ["class", "race", "profession"];
const TERRITORIES: readonly string[] = ["Alliance", "Horde", "Contested", "Sanctuary"];
const ZONE_TYPES: readonly string[] = ["zone", "dungeon", "raid", "battleground"];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const id = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v > 0;
const level = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null);

/** The file's object when it is a version-1 object, else null with a problem recorded. */
function open(file: string, raw: unknown, problems: string[]): Record<string, unknown> | null {
  if (!isObj(raw)) {
    problems.push(`${file}: not an object, ignored`);
    return null;
  }
  if (raw.version !== SUPPORTED_VERSION) {
    problems.push(`${file}: unsupported version ${JSON.stringify(raw.version)} (expected ${SUPPORTED_VERSION}), ignored`);
    return null;
  }
  return raw;
}

function list(file: string, key: string, obj: Record<string, unknown>, problems: string[]): unknown[] {
  if (Array.isArray(obj[key])) return obj[key];
  problems.push(`${file}: "${key}" is not an array, ignored`);
  return [];
}

function parseTags(raw: unknown, out: Curated): void {
  const file = "quest-tags.json";
  const obj = open(file, raw, out.problems);
  if (!obj) return;
  out.tags.patch = str(obj.patch);
  out.tags.capturedAt = str(obj.capturedAt);
  list(file, "tags", obj, out.problems).forEach((e, i) => {
    const value = isObj(e) ? str(e.value) : null;
    if (!isObj(e) || !id(e.questId) || typeof e.kind !== "string" || !KINDS.includes(e.kind) || !value) {
      out.problems.push(`${file}: tags[${i}] dropped (needs integer questId, kind class/race/profession, non-empty value)`);
      return;
    }
    out.tags.tags.push({ questId: e.questId, kind: e.kind as QuestTagKind, value } satisfies QuestTag);
  });
}

function parseLinks(raw: unknown, out: Curated): void {
  const file = "overrides.json";
  const obj = open(file, raw, out.problems);
  if (!obj) return;
  list(file, "links", obj, out.problems).forEach((e, i) => {
    if (!isObj(e) || !id(e.from) || !id(e.to)) {
      out.problems.push(`${file}: links[${i}] dropped (from and to must be integer quest ids)`);
      return;
    }
    if (e.from === e.to) {
      out.problems.push(`${file}: links[${i}] dropped (quest ${e.from} linked to itself)`);
      return;
    }
    out.links.push({ from: e.from, to: e.to, note: str(e.note) } satisfies QuestLinkOverride);
  });
}

function parseZones(raw: unknown, out: Curated): void {
  const file = "zones.json";
  const obj = open(file, raw, out.problems);
  if (!obj) return;
  list(file, "zones", obj, out.problems).forEach((e, i) => {
    const name = isObj(e) ? str(e.name) : null;
    if (!isObj(e) || !name || typeof e.type !== "string" || !ZONE_TYPES.includes(e.type)) {
      out.problems.push(`${file}: zones[${i}] dropped (needs a name and type zone/dungeon/raid/battleground)`);
      return;
    }
    let territory: CuratedTerritory | null = null;
    if (typeof e.territory === "string" && TERRITORIES.includes(e.territory)) territory = e.territory as CuratedTerritory;
    else if (e.territory !== null && e.territory !== undefined)
      out.problems.push(`${file}: zones[${i}] "${name}" has unknown territory ${JSON.stringify(e.territory)}, set to null`);
    out.zones.push({
      name,
      minLevel: level(e.minLevel),
      maxLevel: level(e.maxLevel),
      territory,
      type: e.type as CuratedZoneType,
    } satisfies CuratedZone);
  });
}

function parseBlizzard(raw: unknown, out: Curated): void {
  const obj = open("blizzard-quests.json", raw, out.problems);
  if (!obj) return;
  const quests: BlizzardQuest[] = [];
  list("blizzard-quests.json", "quests", obj, out.problems).forEach((e) => {
    const q = readBlizzardQuest(e);
    if (q) quests.push(q);
  });
  mergeBlizzard(out, quests);
}

/** Validate the parsed JSON files. Bad entries are dropped and described in `problems`; never throws. */
export function parseCurated(files: { tags?: unknown; overrides?: unknown; zones?: unknown; blizzard?: unknown }): Curated {
  const out = emptyCurated();
  if (files.tags !== undefined) parseTags(files.tags, out);
  if (files.overrides !== undefined) parseLinks(files.overrides, out);
  if (files.zones !== undefined) parseZones(files.zones, out);
  if (files.blizzard !== undefined) parseBlizzard(files.blizzard, out);
  return out;
}

/** Read the curated files from `dir`. A missing directory or file is empty; unreadable JSON is a problem, not an error. */
export function readCuratedDir(dir: string): Curated {
  const problems: string[] = [];
  const read = (name: string): unknown => {
    let text: string;
    try {
      text = readFileSync(join(dir, name), "utf8");
    } catch {
      return undefined;
    }
    try {
      return JSON.parse(text);
    } catch (e) {
      problems.push(`${name}: not valid JSON (${e instanceof Error ? e.message : String(e)}), ignored`);
      return undefined;
    }
  };
  const curated = parseCurated({ tags: read("quest-tags.json"), overrides: read("overrides.json"), zones: read("zones.json"), blizzard: read("blizzard-quests.json") });
  curated.problems.unshift(...problems);
  return curated;
}
