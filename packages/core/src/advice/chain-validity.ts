import type { QuestRow } from "./content";

/** Relations that mean "the other quest comes first" (used by `prerequisites` too). */
export const PREREQUISITE = new Set(["Complete first", "Chain link", "Offered after", "Next quest"]);

type AnyLink = { questId?: unknown; relation?: unknown };

function prereqIds(v: unknown): number[] {
  const out: number[] = [];
  if (!Array.isArray(v)) return out;
  for (const l of v as AnyLink[]) {
    if (l && typeof l.questId === "number" && typeof l.relation === "string" && PREREQUISITE.has(l.relation)) {
      out.push(l.questId);
    }
  }
  return out;
}

/**
 * The completed quests that count toward a chain. Some quests exist once per starting region (real
 * "Camping 101: Cooking" in Elwynn Forest, Dun Morogh, Zephras Isle and Durotar), and a character
 * only takes one route, so a quest completed without its chain's earlier quests was done another
 * way and must not make this chain look started.
 *
 * Prerequisites are links with relations "Complete first", "Chain link", "Offered after" or "Next
 * quest" (not "Must be active" or "Quest line"), read from both sides (a quest's `chain.previous`,
 * and other quests' `chain.next`) on EVERY quest passed in (callers pass the full list, before any
 * class filtering). Several prerequisites of one quest are ALTERNATIVES (OR), as ForeverDB lists
 * them: real 1524 "Call of Fire" needs one of 1522, 1523, 2983, 2984 (Shaman starters per race),
 * 1124 "Wasteland" needs Horde 1123 or Alliance 6762.
 *
 * A completed quest is valid when it has no prerequisite among `quests`, or one of its
 * prerequisites is not in `quests` (an unknown quest cannot be checked and counts as satisfied),
 * or at least one of its prerequisites is itself valid. Uncompleted siblings or successors never
 * invalidate a completed quest. Self-links are ignored. Completed ids not in `quests` are kept.
 *
 * This is the least fixed point, computed forward from the seeds (completed quests valid on their
 * own) along successor links, each quest entering the work list at most once: O(quests + links),
 * iterative (no recursion, so a chain thousands of quests long is fine). Cycles: a cycle never
 * validates itself; a cycle member counts only when it is completed and is reached from a valid
 * quest outside the cycle through completed quests (for 0 -> 1 -> 2 -> 3 -> 1 with 0, 1, 2
 * completed: 0, 1, 2 valid; with only 1, 2, 3 completed and 0 not: none).
 *
 * `chainDetail` availability and `nextUp` "met" still use plain completion over `previous` links
 * only (every prerequisite done), while this reads both sides; on the real mirror links are listed
 * symmetrically, so the two agree.
 */
export function validCompleted(quests: QuestRow[], completed: Set<number>): Set<number> {
  const known = new Set<number>();
  for (const q of quests) known.add(q.id);

  const succ = new Map<number, number[]>();
  /** Quests with at least one known prerequisite. */
  const gated = new Set<number>();
  /** Quests with a prerequisite that is not in `quests` (satisfied). */
  const unknownPre = new Set<number>();
  const edge = (from: number, to: number) => {
    if (from === to || !known.has(to)) return;
    if (!known.has(from)) {
      unknownPre.add(to);
      return;
    }
    gated.add(to);
    const s = succ.get(from);
    if (s) s.push(to);
    else succ.set(from, [to]);
  };
  for (const q of quests) {
    for (const p of prereqIds(q.chain?.previous)) edge(p, q.id);
    for (const n of prereqIds(q.chain?.next)) edge(q.id, n);
  }

  const valid = new Set<number>();
  const work: number[] = [];
  for (const id of known) {
    if (completed.has(id) && (!gated.has(id) || unknownPre.has(id)) && !valid.has(id)) {
      valid.add(id);
      work.push(id);
    }
  }
  while (work.length > 0) {
    const id = work.pop()!;
    for (const s of succ.get(id) ?? []) {
      if (completed.has(s) && !valid.has(s)) {
        valid.add(s);
        work.push(s);
      }
    }
  }

  for (const id of completed) if (!known.has(id)) valid.add(id);
  return valid;
}
