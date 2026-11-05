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
 * The completed quests that count toward a chain: a completed quest is valid only when EVERY
 * earlier quest of it is completed too. Some quests exist once per starting region (real
 * "Camping 101: Cooking" in Elwynn Forest, Dun Morogh, Zephras Isle and Durotar), and a character
 * only takes one route, so a quest completed without its chain's earlier quests was done another
 * way and must not make this chain look started.
 *
 * "Earlier" is the transitive closure over prerequisite links (relations "Complete first",
 * "Chain link", "Offered after", "Next quest"; not "Must be active" or "Quest line"), read from
 * both sides (a quest's `chain.previous`, and other quests' `chain.next`) on EVERY quest passed in
 * (callers pass the full list, before any class filtering). Self-links and links to ids not in
 * `quests` are ignored: an earlier quest we do not know cannot be checked and counts as satisfied.
 * A quest with no earlier quests is valid when completed; completed ids not in `quests` are kept.
 *
 * Cycles: a quest is invalid when any quest that is not completed can reach it over one or more
 * links. So a cycle member counts only when every quest of the cycle, and every quest before the
 * cycle, is completed (conservative). One multi-source walk from every uncompleted quest along
 * successor links: O(quests + links), no recursion, terminates on cycles.
 */
export function validCompleted(quests: QuestRow[], completed: Set<number>): Set<number> {
  const known = new Set<number>();
  for (const q of quests) known.add(q.id);

  const succ = new Map<number, number[]>();
  const edge = (from: number, to: number) => {
    if (from === to || !known.has(from) || !known.has(to)) return;
    const s = succ.get(from);
    if (s) s.push(to);
    else succ.set(from, [to]);
  };
  for (const q of quests) {
    for (const p of prereqIds(q.chain?.previous)) edge(p, q.id);
    for (const n of prereqIds(q.chain?.next)) edge(q.id, n);
  }

  // Quests reachable from an uncompleted quest over at least one link.
  const tainted = new Set<number>();
  const expanded = new Set<number>();
  const stack: number[] = [];
  for (const id of known) if (!completed.has(id)) stack.push(id);
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (expanded.has(id)) continue;
    expanded.add(id);
    for (const s of succ.get(id) ?? []) {
      tainted.add(s);
      if (!expanded.has(s)) stack.push(s);
    }
  }

  const out = new Set<number>();
  for (const id of completed) if (!tainted.has(id)) out.add(id);
  return out;
}
