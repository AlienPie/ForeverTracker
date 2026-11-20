import { isAvailable, prerequisiteIndex, validCompleted } from "./chain-validity";
import { chainGraph, skippedMembers, topoOrder } from "./chains";
import { questClass } from "./classes";
import type { QuestRow } from "./content";

export type ChainMemberState = "done" | "in-log" | "available" | "locked" | "unavailable" | "skipped";

export type ChainMember = {
  questId: number;
  name: string;
  level: number;
  /** Where the quest is: its zone, or for class and category quests its giver's zone. */
  zone: string | null;
  /** Name of the NPC or object that starts it, when known. */
  giver: string | null;
  state: ChainMemberState;
  /**
   * True when the quest is completed ("done") but not through this chain: some earlier quest of it
   * is not completed (see `validCompleted`), typically a quest of the same name in another
   * starting region. Such a member is not counted in `done`.
   */
  otherRoute: boolean;
  /** 1-based position in chain order. */
  step: number;
};

export type ChainDetail = {
  chain: number;
  name: string;
  members: ChainMember[];
  /** Members completed through this chain (state "done" and not `otherRoute`). */
  done: number;
  /** Members completed, but not through this chain (`otherRoute`). */
  otherRoute: number;
  total: number;
};

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const obj = (v: unknown): Record<string, unknown> | null =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

/** A real place (numeric `zone.m`), else the starter's zone, else a non-class `zone.n`, else null. */
function zoneName(q: QuestRow): string | null {
  const z = obj(q.zone);
  const n = str(z?.n);
  if (n && typeof z?.m === "number") return n;
  const loc = str(obj(obj(q.starts)?.location)?.zone);
  if (loc) return loc;
  return n && questClass(q) === null ? n : null;
}

/**
 * The chain holding `questId`, any member, in the same order as `chainProgress` (root first), or
 * null when the quest is unknown or is a class quest for another (or unknown) class. A quest with
 * no links is a chain of one. Class filtering is as in `chainProgress`.
 *
 * State per member: "done" when completed; "in-log" when in the quest log; "available" when its
 * prerequisites are met (`isAvailable`, as in `nextUp`: prerequisites from `prerequisiteIndex`, both
 * link sides, judged on all quests passed in; several are ALTERNATIVES, so one completed is enough;
 * none, or one not in `quests`, also counts); "locked" otherwise. Availability uses plain
 * completion (a prerequisite done by any route lets the game offer the quest); the counts do not:
 * a "done" member with no completed route back to a starting quest (see `validCompleted`) is
 * `otherRoute` and counted in `otherRoute`, not in `done`.
 * A member for which `usable(q)` is false (default: all usable; e.g. a profession quest the character
 * cannot take) gets state "unavailable" and is excluded from `total`, `done` and `otherRoute`; it
 * stays in `members` and in the chain graph.
 * A member that is not completed and not in the log, with at least one successor in the chain all of
 * which are completed (plain completion), is "skipped" (an alternative route that was bypassed, see
 * `isSkipped`) and, like "unavailable", excluded from `total`; "unavailable" wins over it.
 * Pure; builds the chain graph, the prerequisite index and the valid set once.
 */
export function chainDetail(
  quests: QuestRow[],
  questId: number,
  completed: Set<number>,
  inLog: Set<number>,
  classToken?: string | null,
  usable?: (q: QuestRow) => boolean,
): ChainDetail | null {
  const g = chainGraph(quests, classToken);
  if (!g.byId.has(questId)) return null;
  const order = topoOrder(g.groups.get(g.groupOf(questId))!, g.succ);
  const root = order[0]!;
  const idx = prerequisiteIndex(quests);
  const valid = validCompleted(quests, completed, idx);
  const skipped = skippedMembers(order, g.succ, completed, inLog);

  let done = 0;
  let otherRoute = 0;
  let total = 0;
  const members = order.map((q, i): ChainMember => {
    let state: ChainMemberState;
    let other = false;
    if (usable && !usable(q)) state = "unavailable";
    else if (completed.has(q.id)) {
      state = "done";
      if (valid.has(q.id)) done++;
      else {
        other = true;
        otherRoute++;
      }
    } else if (inLog.has(q.id)) state = "in-log";
    else if (skipped.has(q.id)) state = "skipped";
    else state = isAvailable(idx, q.id, (p) => completed.has(p)) ? "available" : "locked";
    if (state !== "unavailable" && state !== "skipped") total++;
    return {
      questId: q.id,
      name: q.name,
      level: q.level,
      zone: zoneName(q),
      giver: str(obj(q.starts)?.name),
      state,
      otherRoute: other,
      step: i + 1,
    };
  });
  return { chain: root.id, name: root.name, members, done, otherRoute, total };
}
