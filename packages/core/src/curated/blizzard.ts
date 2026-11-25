import type { QuestRow } from "../advice/content";
import type { Curated, CuratedZone, QuestTag } from "./types";

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
  /** Blizzard's area name (often a sub-zone such as "Coldridge Valley"), when the quest has one. */
  area: string | null;
  /** Quests to finish first (every quest the requirement tree names; and/or structure is not kept). */
  prereqs: number[];
  /** Experience reward, when given. */
  xp: number | null;
  /** Reputation rewards: faction id and the reputation gained. */
  reps: { faction: number; value: number }[];
};

const PROFESSIONS = new Set([
  "Alchemy", "Blacksmithing", "Cooking", "Enchanting", "Engineering", "First Aid", "Fishing",
  "Herbalism", "Leatherworking", "Mining", "Skinning", "Tailoring",
]);

const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const names = (v: unknown): string[] =>
  Array.isArray(v) ? v.flatMap((e) => (isObj(e) && typeof e.name === "string" && e.name.trim() ? [e.name.trim()] : [])) : [];

/** Every quest id named anywhere in a requirement tree (`{conditions:[{target:{id}}...]}`). */
function treeIds(node: unknown, out: Set<number>): void {
  if (Array.isArray(node)) return node.forEach((n) => treeIds(n, out));
  if (!isObj(node)) return;
  if (isObj(node.target) && Number.isInteger(node.target.id)) out.add(node.target.id as number);
  treeIds(node.conditions, out);
}

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
    area: isObj(raw.area) && typeof raw.area.name === "string" && raw.area.name.trim() ? raw.area.name.trim() : null,
    prereqs: (() => {
      const ids = new Set<number>();
      treeIds(req.quests, ids);
      ids.delete(raw.id as number);
      return [...ids].sort((a, b) => a - b);
    })(),
    xp: isObj(raw.rewards) && Number.isInteger(raw.rewards.experience) ? (raw.rewards.experience as number) : null,
    reps: isObj(raw.rewards)
      ? arr(raw.rewards.reputations).flatMap((r) =>
          isObj(r) && isObj(r.reward) && Number.isInteger(r.reward.id) && Number.isInteger(r.value) && (r.value as number) !== 0
            ? [{ faction: r.reward.id as number, value: r.value as number }]
            : [],
        )
      : [],
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
    area: typeof e.area === "string" && e.area ? e.area : null,
    prereqs: Array.isArray(e.prereqs) ? e.prereqs.filter((n): n is number => Number.isInteger(n) && n > 0) : [],
    xp: Number.isInteger(e.xp) ? (e.xp as number) : null,
    reps: Array.isArray(e.reps)
      ? e.reps.flatMap((r) =>
          isObj(r) && Number.isInteger(r.faction) && Number.isInteger(r.value) ? [{ faction: r.faction as number, value: r.value as number }] : [],
        )
      : [],
  };
}

/**
 * Add Blizzard's class, race and profession requirements as tags. Blizzard's data is live, the
 * owner's captures go stale, so for a quest Blizzard knows its data replaces every captured tag of
 * the quest; captures only stand for quests Blizzard lacks.
 */
export function mergeBlizzard(out: Curated, quests: BlizzardQuest[]): void {
  out.blizzard.push(...quests);
  const known = new Set(quests.map((q) => q.id));
  out.tags.tags = out.tags.tags.filter((t) => !known.has(t.questId));
  const add = (questId: number, kind: QuestTag["kind"], values: string[]) => {
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

/** Blizzard's quest list holds developer placeholders: `<UNUSED>`, `<NYI> ...`, `[DNT]`, `[PH]`, "DEPRECATED", test quests. */
export function isPlaceholderTitle(title: string): boolean {
  const t = title.trim();
  return /^<[^>]*>/.test(t) || /\[(DNT|PH|TEST)\]/i.test(t) || /\b(DEPRECATED|UNUSED|NYI)\b/.test(t) || /^test\b/i.test(t) || t === "";
}

/**
 * Quest rows for quests only Blizzard knows, so Explore and Next up can count them. Blizzard gives
 * no level, so a quest takes the middle of its zone's curated level range. A quest is added only
 * when its area is a curated zone with levels (zone names match ignoring case) and `mapIds` knows
 * the zone's map id; chains, starts and ends are unknown. The quest's `side` comes from `faction`.
 */
export function synthesizeQuests(
  blizzard: BlizzardQuest[],
  knownIds: ReadonlySet<number>,
  zones: CuratedZone[],
  mapIds: ReadonlyMap<string, number>,
): QuestRow[] {
  const key = (n: string) => n.trim().toLowerCase();
  const byName = new Map<string, CuratedZone>();
  for (const z of zones) if (z.type === "zone" && z.minLevel !== null) byName.set(key(z.name), z);
  const titles = new Map(blizzard.map((q) => [q.id, q.title]));
  const out: QuestRow[] = [];
  for (const q of blizzard) {
    if (knownIds.has(q.id) || q.area === null || isPlaceholderTitle(q.title)) continue;
    const zone = byName.get(key(q.area));
    const m = mapIds.get(key(q.area));
    if (!zone || m === undefined) continue;
    const level = zone.maxLevel === null ? zone.minLevel! : Math.round((zone.minLevel! + zone.maxLevel) / 2);
    out.push({
      id: q.id,
      name: q.title,
      level,
      zone: { n: zone.name.trim(), slug: key(zone.name).replace(/[^a-z0-9]+/g, "-"), m },
      chain: {
        previous: q.prereqs
          .filter((id) => knownIds.has(id) || titles.has(id))
          .map((id) => ({ questId: id, name: titles.get(id) ?? "", relation: "Complete first" })),
        next: [],
        questLine: null,
      },
      starts: null,
      ends: null,
      side: q.faction === "Alliance" ? "a" : q.faction === "Horde" ? "h" : "both",
    });
  }
  return out;
}
