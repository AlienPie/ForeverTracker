import type { QuestRow } from "../advice/content";
import type { QuestLinkOverride, QuestTag } from "./types";

/** Relation string of a link added from `overrides.json`. */
export const CURATED_RELATION = "Curated";

/** True when `target` is reachable from `start` by following `chain.next`. */
function reaches(byId: Map<number, QuestRow>, start: number, target: number): boolean {
  const seen = new Set<number>();
  const stack = [start];
  while (stack.length) {
    const id = stack.pop()!;
    if (id === target) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const l of byId.get(id)?.chain.next ?? []) stack.push(l.questId);
  }
  return false;
}

/**
 * Adds the curated links to the quests: for each `{ from, to }`, `to` gains `from` in `chain.previous`
 * and `from` gains `to` in `chain.next`, both with relation "Curated", unless already linked. A link
 * naming a quest not in `quests`, or one that would create a cycle (`to` already reaches `from`), is
 * skipped and described in `problems`. Pure: only quests whose links changed are returned as new rows
 * (the rest are the same objects); the inputs are not mutated.
 */
export function applyOverrides(
  quests: QuestRow[],
  links: QuestLinkOverride[],
): { quests: QuestRow[]; problems: string[] } {
  const problems: string[] = [];
  const byId = new Map(quests.map((q) => [q.id, q]));
  for (const { from, to } of links) {
    const a = byId.get(from);
    const b = byId.get(to);
    if (!a || !b) {
      problems.push(`link ${from} -> ${to} skipped: quest ${a ? to : from} is not in the quest data`);
      continue;
    }
    if (reaches(byId, to, from)) {
      problems.push(`link ${from} -> ${to} skipped: it would create a cycle`);
      continue;
    }
    const hasNext = a.chain.next.some((l) => l.questId === to);
    const hasPrev = b.chain.previous.some((l) => l.questId === from);
    if (!hasNext) {
      byId.set(from, {
        ...a,
        chain: { ...a.chain, next: [...a.chain.next, { questId: to, name: b.name, relation: CURATED_RELATION }] },
      });
    }
    if (!hasPrev) {
      const cur = byId.get(to)!;
      byId.set(to, {
        ...cur,
        chain: {
          ...cur.chain,
          previous: [...cur.chain.previous, { questId: from, name: a.name, relation: CURATED_RELATION }],
        },
      });
    }
  }
  return { quests: quests.map((q) => byId.get(q.id) ?? q), problems };
}

export type TagIndex = {
  /** The quest's profession tag (the first when several), or null. */
  professionOf(questId: number): string | null;
  /** Class tags of the quest, as given. */
  classesOf(questId: number): string[];
  /** Race tags of the quest, as given; several mean any of them is allowed. */
  racesOf(questId: number): string[];
  /** False when there are no tags at all. */
  hasTags: boolean;
};

/** Index of the curated quest tags by quest id. Values are returned as given. */
export function buildTagIndex(tags: QuestTag[]): TagIndex {
  const profession = new Map<number, string>();
  const classes = new Map<number, string[]>();
  const races = new Map<number, string[]>();
  const push = (m: Map<number, string[]>, id: number, v: string) => m.set(id, [...(m.get(id) ?? []), v]);
  for (const t of tags) {
    if (t.kind === "profession") {
      if (!profession.has(t.questId)) profession.set(t.questId, t.value);
    } else if (t.kind === "class") push(classes, t.questId, t.value);
    else push(races, t.questId, t.value);
  }
  return {
    professionOf: (id) => profession.get(id) ?? null,
    classesOf: (id) => classes.get(id) ?? [],
    racesOf: (id) => races.get(id) ?? [],
    hasTags: tags.length > 0,
  };
}
