import { PREREQUISITE, validCompleted } from "./chain-validity";
import { classAllows } from "./classes";
import type { QuestRow } from "./content";
import type { ChainProgress } from "./types";

/**
 * Link relations that express quest order. "Must be active" (concurrency) is not order, and any
 * unknown or non-string relation is ignored. "Quest line" groups quests into a chain but is not a
 * pickup prerequisite, so it is in SEQUENCE but not in PREREQUISITE.
 */
const SEQUENCE = new Set([...PREREQUISITE, "Quest line"]);

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

/** A quest with this many direct successors or more in its chain is a hub (see chainProgress). */
const HUB_SUCCESSORS = 3;

/** Chains derived once from a quest list: see `chainGraph`. */
export type ChainGraph = {
  /** Quests the class may do, by id. */
  byId: Map<number, QuestRow>;
  /** Direct successors (predecessor -> successors), within `byId` only. */
  succ: Map<number, Set<number>>;
  /** Components, keyed by an arbitrary representative id. */
  groups: Map<number, QuestRow[]>;
  /** Representative id of the component holding `id` (only for ids in `byId`). */
  groupOf: (id: number) => number;
  /** Hub quest ids, judged on all quests passed in (see `chainGraph`). */
  hubs: Set<number>;
};

/**
 * Chains are connected components over SEQUENCE links (`previous` and `next`, either side may list
 * the link) between quests that are both in `quests`. Class quests for any class other than
 * `classToken` (or every class quest when it is null) are left out before linking. Shared by
 * `chainProgress` and `chainDetail`.
 *
 * Hubs are judged BEFORE the class filter, on every quest passed in: a quest is a hub when it has
 * HUB_SUCCESSORS (3) or more distinct direct successors, counting its own SEQUENCE `next` links and
 * other quests' SEQUENCE `previous` links to it (self-links and ids not in `quests` ignored). So a
 * shared starter whose followers are mostly class quests (real 7 "Kobold Camp Cleanup") is a hub
 * for every class, and hub status never depends on `classToken`.
 */
export function chainGraph(quests: QuestRow[], classToken?: string | null): ChainGraph {
  const byId = new Map<number, QuestRow>();
  const all = new Set<number>();
  for (const q of quests) {
    all.add(q.id);
    if (classAllows(q, classToken)) byId.set(q.id, q);
  }

  // Unfiltered successor sets, only for hub detection.
  const rawSucc = new Map<number, Set<number>>();
  const rawEdge = (from: number, to: number) => {
    if (from === to || !all.has(from) || !all.has(to)) return;
    let s = rawSucc.get(from);
    if (!s) rawSucc.set(from, (s = new Set()));
    s.add(to);
  };
  for (const q of quests) {
    for (const p of linkIds(q.chain?.previous, SEQUENCE)) rawEdge(p, q.id);
    for (const n of linkIds(q.chain?.next, SEQUENCE)) rawEdge(q.id, n);
  }
  const hubs = new Set<number>();
  for (const [id, s] of rawSucc) if (s.size >= HUB_SUCCESSORS) hubs.add(id);

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
  return { byId, succ, groups, groupOf: find, hubs };
}

/** Whether `id` is a hub (3 or more direct successors among all quests passed in; see `chainGraph`). */
export const isHub = (g: ChainGraph, id: number): boolean => g.hubs.has(id);

/**
 * Progress through quest chains derived from the quests passed in (see `chainGraph`; single
 * unlinked quests are not chains). Members are ordered topologically (predecessor before
 * successor, ties by level then id; any cycle remainder appended by level then id). The first
 * member in that order is the root, which names and identifies the chain. `done` counts VALID
 * completed members (see `validCompleted`: completed, with an unbroken completed route back to a
 * starting quest, alternative prerequisites counting as OR, judged on all quests passed in), so a
 * quest of the same name done in another starting region does not count; `currentIndex` is the position of the first member that is not valid completed.
 *
 * Class quests (`zone.n` is a class name) for any class other than `classToken` (snapshot token,
 * e.g. "PRIEST") are left out before linking, so a shared starter quest such as "Dwarven
 * Outfitters" does not pull every class's rune into one chain. When `classToken` is null or
 * omitted the class is unknown and every class quest is left out.
 *
 * `usable` (default: all usable): a member for which it returns false is left out of `done`, `total`,
 * `currentIndex` and `complete` (and of the "on it" test), but still takes part in the graph, hub
 * detection and ordering. A chain with no usable member is not listed.
 *
 * Only chains the character is on and has not finished are reported: a member is in the log, or
 * a valid completed member is not a hub. A hub is a quest with 3 or more direct successors among all
 * quests passed in, class quests included (a shared race or faction starter such as "Dwarven
 * Outfitters"); a chain whose only progress is a completed hub is not listed. `complete` is always false in v1 output. Ordered by root level,
 * then id.
 */
export function chainProgress(
  quests: QuestRow[],
  completed: Set<number>,
  inLog: Set<number>,
  classToken?: string | null,
  usable?: (q: QuestRow) => boolean,
): ChainProgress[] {
  const g = chainGraph(quests, classToken);
  const valid = validCompleted(quests, completed);
  const out: ChainProgress[] = [];
  for (const members of g.groups.values()) {
    if (members.length < 2) continue;
    const counted = usable ? members.filter((m) => usable(m)) : members;
    if (counted.length === 0) continue;
    let done = 0;
    let on = false;
    for (const m of counted) {
      if (valid.has(m.id)) {
        done++;
        if (!isHub(g, m.id)) on = true;
      } else if (inLog.has(m.id)) on = true;
    }
    if (!on || done === counted.length) continue;

    const order = topoOrder(members, g.succ);
    const root = order[0]!;
    const usableOrder = usable ? order.filter((m) => usable(m)) : order;
    const idx = usableOrder.findIndex((m) => !valid.has(m.id));
    out.push({
      chain: root.id,
      name: root.name,
      done,
      total: counted.length,
      currentIndex: idx === -1 ? null : idx,
      complete: done === counted.length,
    });
  }
  return out.sort((a, b) => g.byId.get(a.chain)!.level - g.byId.get(b.chain)!.level || a.chain - b.chain);
}

/** Chain order: Kahn's algorithm within one component; ready set kept sorted by level then id (components are small). */
export function topoOrder(members: QuestRow[], succ: Map<number, Set<number>>): QuestRow[] {
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
