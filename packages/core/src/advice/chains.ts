import { classAllows } from "./classes";
import type { QuestRow } from "./content";
import type { ChainProgress } from "./types";

/**
 * Link relations that express quest order. "Must be active" (concurrency) is not order, and any
 * unknown or non-string relation is ignored. "Quest line" groups quests into a chain but is not a
 * pickup prerequisite, so it is in SEQUENCE but not in PREREQUISITE.
 */
const SEQUENCE = new Set(["Complete first", "Chain link", "Offered after", "Next quest", "Quest line"]);
const PREREQUISITE = new Set(["Complete first", "Chain link", "Offered after", "Next quest"]);

type AnyLink = { questId?: unknown; name?: unknown; relation?: unknown };

const links = (v: unknown): AnyLink[] => (Array.isArray(v) ? (v as AnyLink[]) : []);

function linkIds(v: unknown, relations: Set<string>): number[] {
  const out: number[] = [];
  for (const l of links(v)) {
    if (l && typeof l.questId === "number" && typeof l.relation === "string" && relations.has(l.relation)) {
      out.push(l.questId);
    }
  }
  return out;
}

/** Prerequisite links of a quest (from `chain.previous`), with their names when present. */
export function prerequisites(q: QuestRow): { questId: number; name: string | null }[] {
  const out: { questId: number; name: string | null }[] = [];
  for (const l of links(q.chain?.previous)) {
    if (l && typeof l.questId === "number" && typeof l.relation === "string" && PREREQUISITE.has(l.relation)) {
      out.push({ questId: l.questId, name: typeof l.name === "string" && l.name ? l.name : null });
    }
  }
  return out;
}

const byLevelThenId = (a: QuestRow, b: QuestRow) => a.level - b.level || a.id - b.id;

/**
 * Progress through quest chains derived from the quests passed in.
 *
 * Chains are connected components over SEQUENCE links (`previous` and `next`, either side may list
 * the link) between quests that are both in `quests`; single unlinked quests are not chains.
 * Members are ordered topologically (predecessor before successor, ties by level then id; any cycle
 * remainder appended by level then id). The first member in that order is the root, which names
 * and identifies the chain. `done` counts completed members; `currentIndex` is the position of the
 * first member not completed.
 *
 * Class quests (`zone.n` is a class name) for any class other than `classToken` (snapshot token,
 * e.g. "PRIEST") are left out before linking, so a shared starter quest such as "Dwarven
 * Outfitters" does not pull every class's rune into one chain. When `classToken` is null or
 * omitted the class is unknown and every class quest is left out.
 *
 * Only chains the character has started (at least one member completed or in the log) and not
 * finished are reported, so `complete` is always false in v1 output. Ordered by root level, then id.
 */
export function chainProgress(
  quests: QuestRow[],
  completed: Set<number>,
  inLog: Set<number>,
  classToken?: string | null,
): ChainProgress[] {
  const byId = new Map<number, QuestRow>();
  for (const q of quests) if (classAllows(q, classToken)) byId.set(q.id, q);

  // Union-find over member ids, plus predecessor -> successors edges for ordering.
  const parent = new Map<number, number>();
  const find = (x: number): number => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    while (x !== r) {
      const next = parent.get(x)!;
      parent.set(x, r);
      x = next;
    }
    return r;
  };
  for (const id of byId.keys()) parent.set(id, id);

  const succ = new Map<number, Set<number>>();
  const edge = (from: number, to: number) => {
    if (from === to || !byId.has(from) || !byId.has(to)) return;
    let s = succ.get(from);
    if (!s) succ.set(from, (s = new Set()));
    s.add(to);
    const a = find(from);
    const b = find(to);
    if (a !== b) parent.set(a, b);
  };
  for (const q of byId.values()) {
    for (const p of linkIds(q.chain?.previous, SEQUENCE)) edge(p, q.id);
    for (const n of linkIds(q.chain?.next, SEQUENCE)) edge(q.id, n);
  }

  const groups = new Map<number, QuestRow[]>();
  for (const q of byId.values()) {
    const r = find(q.id);
    const g = groups.get(r);
    if (g) g.push(q);
    else groups.set(r, [q]);
  }

  const out: ChainProgress[] = [];
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    let done = 0;
    let started = false;
    for (const m of members) {
      if (completed.has(m.id)) done++;
      if (completed.has(m.id) || inLog.has(m.id)) started = true;
    }
    if (!started || done === members.length) continue;

    const order = topoOrder(members, succ);
    const root = order[0]!;
    const idx = order.findIndex((m) => !completed.has(m.id));
    out.push({
      chain: root.id,
      name: root.name,
      done,
      total: members.length,
      currentIndex: idx === -1 ? null : idx,
      complete: done === members.length,
    });
  }
  return out.sort((a, b) => byId.get(a.chain)!.level - byId.get(b.chain)!.level || a.chain - b.chain);
}

/** Kahn's algorithm within one component; ready set kept sorted by level then id (components are small). */
function topoOrder(members: QuestRow[], succ: Map<number, Set<number>>): QuestRow[] {
  const indeg = new Map<number, number>();
  for (const m of members) indeg.set(m.id, 0);
  for (const m of members) for (const s of succ.get(m.id) ?? []) indeg.set(s, (indeg.get(s) ?? 0) + 1);

  const ready = members.filter((m) => indeg.get(m.id) === 0).sort(byLevelThenId);
  const order: QuestRow[] = [];
  const placed = new Set<number>();
  const byId = new Map(members.map((m) => [m.id, m]));
  while (ready.length > 0) {
    const m = ready.shift()!;
    order.push(m);
    placed.add(m.id);
    let added = false;
    for (const s of succ.get(m.id) ?? []) {
      const d = indeg.get(s)! - 1;
      indeg.set(s, d);
      if (d === 0) {
        ready.push(byId.get(s)!);
        added = true;
      }
    }
    if (added) ready.sort(byLevelThenId);
  }
  if (order.length < members.length) {
    order.push(...members.filter((m) => !placed.has(m.id)).sort(byLevelThenId));
  }
  return order;
}
