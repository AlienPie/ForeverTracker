import type { CharacterCard } from "../read/character";
import type { TagIndex } from "../curated/apply";
import type { ProfessionInfo, QuestRow } from "./content";

/**
 * INTERIM rule (M1.1), to be replaced in M2 by the curated Wowhead profession tags: ForeverDB
 * quests carry no profession field, so the profession is read from the quest name.
 *
 * Kinds that take one of the character's two profession slots. ForeverDB splits the classic
 * primary professions into `primary` and `gathering`; both count against the slots.
 */
export const SLOT_KINDS: ReadonlySet<string> = new Set(["primary", "gathering"]);
/** Kinds that are always learnable (no slot). */
export const FREE_KINDS: ReadonlySet<string> = new Set(["secondary"]);
/** Number of profession slots a character has. */
export const PROFESSION_SLOTS = 2;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Lower-case, collapse whitespace and drop it around colons: " Camping 101 :  First Aid" -> "camping 101:first aid". */
const norm = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, " ").replace(/ ?: ?/g, ":");

/**
 * A matcher built once from the catalog: quest name -> its profession or null. A quest is a
 * profession quest when its name ends with `: <profession name>` (case-insensitive, trimmed,
 * exact end match). When several suffixes match, the longest profession name wins. A profession
 * word anywhere else in the name ("Salve via Mining", "Mining Consultant") is not a match.
 */
export function professionMatcher(professions: ProfessionInfo[]): (questName: string) => ProfessionInfo | null {
  const byName = new Map<string, ProfessionInfo>();
  for (const p of Array.isArray(professions) ? professions : []) {
    const name = isObj(p) ? text(p.name) : null;
    if (name && !byName.has(norm(name))) byName.set(norm(name), p);
  }
  return (questName) => {
    if (byName.size === 0 || typeof questName !== "string") return null;
    const n = norm(questName);
    // Earliest colon first: the longest suffix, so the longest profession name, wins.
    for (let i = n.indexOf(":"); i !== -1; i = n.indexOf(":", i + 1)) {
      const hit = byName.get(n.slice(i + 1));
      if (hit) return hit;
    }
    return null;
  };
}

/** The profession a quest is for, by name (see `professionMatcher`), or null. INTERIM rule. */
export function professionOfQuest(questName: string, professions: ProfessionInfo[]): ProfessionInfo | null {
  return professionMatcher(professions)(questName);
}

/** Lower-cased, trimmed names of the character's learned professions (odd entries skipped). */
export function learnedNames(professions: CharacterCard["professions"] | null | undefined): Set<string> {
  const out = new Set<string>();
  for (const p of Array.isArray(professions) ? professions : []) {
    const name = isObj(p) ? text(p.name) : null;
    if (name) out.add(norm(name));
  }
  return out;
}

/** Why a profession quest may be shown, or null when it must be dropped. INTERIM rule. */
export type ProfessionVerdict = { allowed: false } | { allowed: true; freeSlot: boolean } | null;

/**
 * Decides a profession quest for a character. Returns null when the kind is unknown (the rule
 * cannot decide, so the quest is treated as an ordinary quest). Otherwise allowed when the
 * character knows the profession, or its kind is always learnable (secondary), or it takes a
 * slot and the character uses fewer than PROFESSION_SLOTS slots (a free slot).
 */
export function professionVerdict(p: ProfessionInfo, learned: Set<string>, slotsUsed: number): ProfessionVerdict {
  const kind = norm(typeof p.kind === "string" ? p.kind : "");
  const isSlot = SLOT_KINDS.has(kind);
  if (!isSlot && !FREE_KINDS.has(kind)) return null;
  if (learned.has(norm(p.name)) || !isSlot) return { allowed: true, freeSlot: false };
  return slotsUsed < PROFESSION_SLOTS ? { allowed: true, freeSlot: true } : { allowed: false };
}

/** How many profession slots the character's learned professions take, per the catalog. */
export function slotsUsed(learned: Set<string>, catalog: ProfessionInfo[]): number {
  let n = 0;
  const counted = new Set<string>();
  for (const p of Array.isArray(catalog) ? catalog : []) {
    const name = isObj(p) ? text(p.name) : null;
    const kind = isObj(p) ? text(p.kind) : null;
    if (!name || !kind) continue;
    const key = norm(name);
    if (SLOT_KINDS.has(norm(kind)) && learned.has(key) && !counted.has(key)) {
      counted.add(key);
      n++;
    }
  }
  return n;
}

/**
 * The profession a quest is for. When `tags` has tags (`tags.hasTags`), the curated profession tag
 * decides (matched by name, case-insensitive, to the catalog) and a quest without a profession tag
 * is NOT a profession quest, whatever its name. With no tags (absent or empty) the interim name
 * rule (`professionOfQuest`) applies. A tag naming a profession missing from the catalog gives null.
 */
export function professionOfQuestTagged(
  q: QuestRow,
  professions: ProfessionInfo[],
  tags?: TagIndex,
): ProfessionInfo | null {
  if (!tags || !tags.hasTags) return professionOfQuest(q.name, professions);
  const tag = tags.professionOf(q.id);
  if (tag === null) return null;
  const key = norm(tag);
  for (const p of Array.isArray(professions) ? professions : []) {
    const name = isObj(p) ? text(p.name) : null;
    if (name && norm(name) === key) return p;
  }
  return null;
}
