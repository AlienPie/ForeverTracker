import type { ZoneProgress } from "./exploration";
import type { Faction } from "./faction";

export type ZoneSuggestion = {
  name: string;
  mapId: number | null;
  minLevel: number | null;
  maxLevel: number | null;
  /** Open quests close to the character's level (see `WINDOW_BELOW`, `WINDOW_ABOVE`). */
  fitting: number;
  done: number;
  total: number;
  visited: boolean;
  /** The character is in this zone now. */
  here: boolean;
  /** One sentence saying why this zone is suggested. */
  reason: string;
};

/** A quest counts as a good fit from this many levels below the character up to `WINDOW_ABOVE` above. */
export const WINDOW_BELOW = 3;
export const WINDOW_ABOVE = 2;
/** A zone needs at least this many fitting quests to be suggested. */
export const MIN_FITTING = 3;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Levelling areas for a character: zones of the character's own or a shared territory with the most
 * open quests close to their level, ties broken by how near the zone's level range sits to the
 * character. Zones with unknown levels or too few fitting quests are left out. `current` is the
 * zone the character is in (by name, ignoring case), flagged `here`.
 */
export function whereToNext(
  zones: ZoneProgress[],
  input: { level: number; faction: Faction | null; current?: string | null },
  max = 3,
): ZoneSuggestion[] {
  const { level, faction } = input;
  const lo = level - WINDOW_BELOW;
  const hi = level + WINDOW_ABOVE;
  const here = input.current?.trim().toLowerCase() ?? null;
  const out: (ZoneSuggestion & { gap: number })[] = [];
  for (const z of zones) {
    if (z.minLevel === null) continue;
    if (faction !== null && z.territory !== null && (z.territory === "Alliance" || z.territory === "Horde") && z.territory !== faction) continue;
    const fitting = z.openLevels.filter((l) => l >= lo && l <= hi).length;
    if (fitting < MIN_FITTING) continue;
    const top = z.maxLevel ?? z.minLevel;
    const gap = level < z.minLevel ? z.minLevel - level : level > top ? level - top : 0;
    const range = z.maxLevel === null || z.maxLevel === z.minLevel ? `level ${z.minLevel}` : `levels ${z.minLevel} to ${z.maxLevel}`;
    const progress = z.visited ? `you have done ${z.done} of ${z.total} there` : "you have not been there yet";
    out.push({
      name: z.name,
      mapId: z.mapId,
      minLevel: z.minLevel,
      maxLevel: z.maxLevel,
      fitting,
      done: z.done,
      total: z.total,
      visited: z.visited,
      here: here !== null && z.name.trim().toLowerCase() === here,
      reason: `${plural(fitting, "open quest", "open quests")} of levels ${lo} to ${hi} (${range}); ${progress}.`,
      gap,
    });
  }
  out.sort((a, b) => b.fitting - a.fitting || a.gap - b.gap || a.name.localeCompare(b.name));
  return out.slice(0, max).map(({ gap: _gap, ...s }) => s);
}
