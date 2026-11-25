import type { QuestRow } from "./content";

export type Faction = "Alliance" | "Horde";

/** Letters only, lower case; "scourge" is the addon's token for Undead (same rule as `raceAllows`). */
const raceKey = (s: string): string => {
  const k = s.replace(/[^\p{L}]/gu, "").toLowerCase();
  if (k === "scourge") return "undead";
  return k === "highorderskyborne" || k === "windshaperskyborne" ? "skyborne" : k;
};

const FACTION_BY_RACE = new Map<string, Faction>([
  ...["human", "dwarf", "nightelf", "gnome"].map((r): [string, Faction] => [r, "Alliance"]),
  ...["orc", "undead", "tauren", "troll"].map((r): [string, Faction] => [r, "Horde"]),
]);

/**
 * The faction of a race token ("NightElf", "night elf", "Scourge" all work), or null for a
 * missing or unknown race.
 */
export function factionOfRace(raceToken: string | null | undefined): Faction | null {
  if (typeof raceToken !== "string") return null;
  return FACTION_BY_RACE.get(raceKey(raceToken)) ?? null;
}

/**
 * Whether a character of `faction` may do `q` by its quest side: `"a"` is Alliance-only and `"h"`
 * Horde-only. `"both"`, a missing side, an unknown value or an unknown faction always allow.
 */
export function sideAllows(q: QuestRow, faction: Faction | null): boolean {
  if (faction === null) return true;
  if (q.side === "a") return faction === "Alliance";
  if (q.side === "h") return faction === "Horde";
  return true;
}
