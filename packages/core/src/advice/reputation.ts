import type { ApiReputation } from "@ft/content";

/** A quest that raises a faction's reputation. */
export type RepReward = { questId: number; name: string; level: number; value: number };

export type RepRow = {
  id: number;
  name: string;
  tier: number;
  tierName: string;
  /** Reputation earned within the current standing. */
  value: number;
  /** Size of the current standing. */
  max: number;
  /** Left until the next standing; 0 at Exalted. */
  remaining: number;
  /** 0 to 100, how far through the current standing. */
  pct: number;
  maxed: boolean;
  /** Open quests that raise this faction, biggest reward first (at most `TOP`). */
  open: RepReward[];
  /** How many open quests raise it, and the reputation they add up to. */
  openCount: number;
  openTotal: number;
};

/** How many reward quests a row lists. */
export const TOP = 5;

/**
 * One row per faction the character has a standing with. `isOpen` says whether a quest is still worth
 * listing (not done, not in the log, usable by the character). Rows not yet maxed come first, nearest to
 * the next standing first; Exalted factions last.
 */
export function reputationRows(
  reps: ApiReputation[],
  rewards: ReadonlyMap<number, RepReward[]> | Record<number, RepReward[]>,
  isOpen: (questId: number) => boolean,
): RepRow[] {
  const get = (id: number): RepReward[] => (rewards instanceof Map ? rewards.get(id) : (rewards as Record<number, RepReward[]>)[id]) ?? [];
  const rows = reps.map((r): RepRow => {
    const maxed = r.tierName.toLowerCase() === "exalted";
    const open = get(r.id)
      .filter((q) => q.value > 0 && isOpen(q.questId))
      .sort((a, b) => b.value - a.value || a.level - b.level || a.questId - b.questId);
    return {
      id: r.id,
      name: r.name,
      tier: r.tier,
      tierName: r.tierName,
      value: r.value,
      max: r.max,
      remaining: maxed ? 0 : Math.max(0, r.max - r.value),
      pct: maxed || r.max <= 0 ? 100 : Math.min(100, Math.floor((r.value * 100) / r.max)),
      maxed,
      open: open.slice(0, TOP),
      openCount: open.length,
      openTotal: open.reduce((n, q) => n + q.value, 0),
    };
  });
  return rows.sort((a, b) => Number(a.maxed) - Number(b.maxed) || a.remaining - b.remaining || a.name.localeCompare(b.name));
}
