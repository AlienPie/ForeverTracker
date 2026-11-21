import type { Curated, QuestTag } from "./types";

/** One quest from Blizzard's Forever game data, reduced to what the app uses (file: data/curated/blizzard-quests.json). */
export type BlizzardQuest = {
  id: number;
  title: string;
  /** Class names, empty when any class may take it. */
  classes: string[];
  /** Race names, empty when any race may take it. */
  races: string[];
  faction: "Alliance" | "Horde" | null;
  /** Profession name when the quest's category is a profession. */
  profession: string | null;
};

const PROFESSIONS = new Set([
  "Alchemy", "Blacksmithing", "Cooking", "Enchanting", "Engineering", "First Aid", "Fishing",
  "Herbalism", "Leatherworking", "Mining", "Skinning", "Tailoring",
]);

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const names = (v: unknown): string[] =>
  Array.isArray(v) ? v.flatMap((e) => (isObj(e) && typeof e.name === "string" && e.name.trim() ? [e.name.trim()] : [])) : [];

/** Reduce the API's quest document (`/data/wow/quest/{id}`); null when it has no integer id or title. */
export function parseBlizzardQuest(raw: unknown): BlizzardQuest | null {
  if (!isObj(raw) || !Number.isInteger(raw.id) || (raw.id as number) <= 0) return null;
  if (typeof raw.title !== "string" || !raw.title.trim()) return null;
  const req = isObj(raw.requirements) ? raw.requirements : {};
  const side = isObj(req.faction) ? req.faction.type : null;
  const category = isObj(raw.category) && typeof raw.category.name === "string" ? raw.category.name : null;
  return {
    id: raw.id as number,
    title: raw.title.trim(),
    classes: names(req.classes),
    races: names(req.races),
    faction: side === "ALLIANCE" ? "Alliance" : side === "HORDE" ? "Horde" : null,
    profession: category !== null && PROFESSIONS.has(category) ? category : null,
  };
}

/** A quest as written to data/curated/blizzard-quests.json; null when malformed. */
export function readBlizzardQuest(e: unknown): BlizzardQuest | null {
  if (!isObj(e) || !Number.isInteger(e.id) || (e.id as number) <= 0 || typeof e.title !== "string" || !e.title) return null;
  const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x !== "") : []);
  return {
    id: e.id as number,
    title: e.title,
    classes: strs(e.classes),
    races: strs(e.races),
    faction: e.faction === "Alliance" || e.faction === "Horde" ? e.faction : null,
    profession: typeof e.profession === "string" && e.profession ? e.profession : null,
  };
}

/** Add Blizzard's class, race and profession requirements as tags, except where `Curated` already has a tag of that kind for the quest (the owner's captures win). */
export function mergeBlizzard(out: Curated, quests: BlizzardQuest[]): void {
  const have = new Set(out.tags.tags.map((t) => `${t.questId}|${t.kind}`));
  const add = (questId: number, kind: QuestTag["kind"], values: string[]) => {
    if (have.has(`${questId}|${kind}`)) return;
    for (const value of values) out.tags.tags.push({ questId, kind, value });
  };
  for (const q of quests) {
    add(q.id, "class", q.classes);
    add(q.id, "race", q.races);
    add(q.id, "profession", q.profession ? [q.profession] : []);
    if (q.faction) out.sides[q.id] = q.faction;
    out.names[q.id] = q.title;
  }
}
