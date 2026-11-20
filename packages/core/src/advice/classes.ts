import type { TagIndex } from "../curated/apply";
import type { QuestRow } from "./content";

/**
 * Class names that appear as `quest.zone.n` in the real mirror (always with `zone.m: null`). Such a
 * "zone" is the quest's class, not a place. Verified against all 3862 mirrored quests.
 */
const CLASS_NAMES = new Map(
  ["Druid", "Hunter", "Mage", "Paladin", "Priest", "Rogue", "Shaman", "Warlock", "Warrior"].map((n) => [n.toLowerCase(), n]),
);

/** The class a quest belongs to ("Shaman"), or null when it is not a class quest. */
export function questClass(q: QuestRow): string | null {
  const n = (q.zone as { n?: unknown } | null)?.n;
  return typeof n === "string" ? (CLASS_NAMES.get(n.trim().toLowerCase()) ?? null) : null;
}

/**
 * Whether a character of `classToken` (snapshot token such as "SHAMAN", any case) may do `q`.
 * Class quests need a known, matching class; every other quest is allowed.
 */
export function classAllows(q: QuestRow, classToken: string | null | undefined): boolean {
  const cls = questClass(q);
  if (cls === null) return true;
  return typeof classToken === "string" && classToken.trim().toLowerCase() === cls.toLowerCase();
}

/**
 * `classAllows`, plus the curated class tags: a quest tagged for one or more classes is allowed
 * only for a character of one of them. Without `tags` (or without tags for the quest) this is
 * exactly `classAllows`.
 */
export function classAllowsTagged(q: QuestRow, classToken: string | null | undefined, tags?: TagIndex): boolean {
  if (!classAllows(q, classToken)) return false;
  const tagged = tags ? tags.classesOf(q.id) : [];
  if (tagged.length === 0) return true;
  const t = typeof classToken === "string" ? classToken.trim().toLowerCase() : "";
  return t !== "" && tagged.some((c) => c.trim().toLowerCase() === t);
}

/**
 * Whether a character of `raceToken` (snapshot race, e.g. "Dwarf", any case) may do a quest tagged
 * for `races`: true when `races` is empty, otherwise only on a case-insensitive match.
 */
export function raceAllows(races: string[], raceToken: string | null | undefined): boolean {
  if (races.length === 0) return true;
  const t = typeof raceToken === "string" ? raceToken.trim().toLowerCase() : "";
  return t !== "" && races.some((r) => r.trim().toLowerCase() === t);
}
