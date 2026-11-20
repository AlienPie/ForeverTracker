import { CURATED_RELATION } from "../curated/relation";
import type { QuestRow } from "./content";

/** Relations that mean "the other quest comes first" (used by `prerequisites` too). "Curated" is a link added from `overrides.json`. */
export const PREREQUISITE = new Set(["Complete first", "Chain link", "Offered after", "Next quest", CURATED_RELATION]);

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

/** Prerequisites of every quest in a list: see `prerequisiteIndex`. */
export type PrereqIndex = {
  /** Ids of the quests passed in. */
  known: Set<number>;
  /** Prerequisite ids per quest id (deduplicated; may include ids not in `known`). */
  pre: Map<number, number[]>;
};

/**
 * The ONE reading of "prerequisite" shared by validity (`validCompleted`), availability
 * (`isAvailable`: `chainDetail` "available", `nextUp`). Prerequisites are links with relations
 * "Complete first", "Chain link", "Offered after" or "Next quest" (not "Must be active" or "Quest
 * line"), read from both sides on every quest passed in: a quest's own `chain.previous`, and other
 * quests' `chain.next` naming it. Self-links are ignored. Ids not among `quests` are kept (they can
 * only come from `previous`) and count as satisfied by every check. O(quests + links).
 */
export function prerequisiteIndex(quests: QuestRow[]): PrereqIndex {
  const known = new Set<number>();
  for (const q of quests) known.add(q.id);
  const sets = new Map<number, Set<number>>();
  const add = (from: number, to: number) => {
    if (from === to || !known.has(to)) return;
    let s = sets.get(to);
    if (!s) sets.set(to, (s = new Set()));
    s.add(from);
  };
  for (const q of quests) {
    for (const p of prereqIds(q.chain?.previous)) add(p, q.id);
    for (const n of prereqIds(q.chain?.next)) add(q.id, n);
  }
  const pre = new Map<number, number[]>();
  for (const [id, s] of sets) pre.set(id, [...s]);
  return { known, pre };
}

/**
 * Whether a quest's prerequisites are met, treating several prerequisites as ALTERNATIVES (OR, as
 * ForeverDB lists them: real 1524 "Call of Fire" needs one of four per-race starters): it has no
 * prerequisite, or one of them is not in the list (cannot be checked: satisfied), or `done` holds
 * for at least one of them. Callers decide what "done" means (completed; completed or in the log).
 */
export function isAvailable(idx: PrereqIndex, id: number, done: (id: number) => boolean): boolean {
  const pre = idx.pre.get(id);
  if (!pre || pre.length === 0) return true;
  return pre.some((p) => !idx.known.has(p) || done(p));
}

/**
 * The completed quests that count toward a chain. Some quests exist once per starting region (real
 * "Camping 101: Cooking" in Elwynn Forest, Dun Morogh, Zephras Isle and Durotar), and a character
 * only takes one route, so a quest completed without its chain's earlier quests was done another
 * way and must not make this chain look started.
 *
 * Prerequisites as in `prerequisiteIndex` (both sides, every quest passed in: callers pass the full
 * list, before any class filtering), several prerequisites being ALTERNATIVES (OR): real 1124
 * "Wasteland" needs Horde 1123 or Alliance 6762.
 *
 * A completed quest is valid when it has no prerequisite among `quests`, or one of its
 * prerequisites is not in `quests` (an unknown quest cannot be checked and counts as satisfied),
 * or at least one of its prerequisites is itself valid. Uncompleted siblings or successors never
 * invalidate a completed quest. Completed ids not in `quests` are kept.
 *
 * This is the least fixed point, computed forward from the seeds (completed quests valid on their
 * own) along successor links, each quest entering the work list at most once: O(quests + links),
 * iterative (no recursion, so a chain thousands of quests long is fine). Cycles: a cycle never
 * validates itself; a cycle member counts only when it is completed and is reached from a valid
 * quest outside the cycle through completed quests (for 0 -> 1 -> 2 -> 3 -> 1 with 0, 1, 2
 * completed: 0, 1, 2 valid; with only 1, 2, 3 completed and 0 not: none).
 *
 * Availability (`isAvailable`) uses the same index and the same OR rule with plain completion, so
 * a quest done by any route lets its successors be offered; only counts use validity.
 * Pass `idx` when the caller already built it for the same `quests`.
 */
export function validCompleted(quests: QuestRow[], completed: Set<number>, idx = prerequisiteIndex(quests)): Set<number> {
  const { known, pre } = idx;
  const succ = new Map<number, number[]>();
  for (const [id, ps] of pre) {
    for (const p of ps) {
      if (!known.has(p)) continue;
      const s = succ.get(p);
      if (s) s.push(id);
      else succ.set(p, [id]);
    }
  }

  const valid = new Set<number>();
  const work: number[] = [];
  for (const id of known) {
    if (completed.has(id) && isAvailable(idx, id, () => false)) {
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

/**
 * `validCompleted` where SKIPPED quests (see `skippedMembers`) pass through: a skipped quest that has
 * at least one prerequisite already valid counts as a way through, so a quest completed after it is
 * still reached from the chain's start. A skipped quest with no valid predecessor (a skipped root, or
 * one never reached) does NOT pass through, so "a quest completed without the start of its chain is
 * not tracked" still holds. Iterates to a fixed point (skipped quests added one layer at a time). The
 * result holds only ids in `completed`: passed-through quests are never reported as done.
 */
export function validCompletedWithSkips(
  quests: QuestRow[],
  completed: Set<number>,
  skipped: Set<number>,
  idx = prerequisiteIndex(quests),
): Set<number> {
  if (skipped.size === 0) return validCompleted(quests, completed, idx);
  const through = new Set<number>();
  let valid: Set<number>;
  for (;;) {
    valid = validCompleted(quests, through.size === 0 ? completed : new Set([...completed, ...through]), idx);
    let grew = false;
    for (const s of skipped) {
      if (through.has(s)) continue;
      if ((idx.pre.get(s) ?? []).some((p) => valid.has(p))) {
        through.add(s);
        grew = true;
      }
    }
    if (!grew) break;
  }
  const out = new Set<number>();
  for (const id of valid) if (completed.has(id)) out.add(id);
  return out;
}
