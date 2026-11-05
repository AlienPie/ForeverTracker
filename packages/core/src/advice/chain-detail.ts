import { chainGraph, prerequisites, topoOrder } from "./chains";
import { questClass } from "./classes";
import type { QuestRow } from "./content";

export type ChainMemberState = "done" | "in-log" | "available" | "locked";

export type ChainMember = {
  questId: number;
  name: string;
  level: number;
  /** Where the quest is: its zone, or for class and category quests its giver's zone. */
  zone: string | null;
  /** Name of the NPC or object that starts it, when known. */
  giver: string | null;
  state: ChainMemberState;
  /** 1-based position in chain order. */
  step: number;
};

export type ChainDetail = { chain: number; name: string; members: ChainMember[]; done: number; total: number };

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
 * State per member: "done" when completed; "in-log" when in the quest log; "available" when every
 * prerequisite (as in `nextUp`: `chain.previous` links of the prerequisite relations) is completed;
 * "locked" otherwise. Pure; builds the chain graph once.
 */
export function chainDetail(
  quests: QuestRow[],
  questId: number,
  completed: Set<number>,
  inLog: Set<number>,
  classToken?: string | null,
): ChainDetail | null {
  const g = chainGraph(quests, classToken);
  if (!g.byId.has(questId)) return null;
  const order = topoOrder(g.groups.get(g.groupOf(questId))!, g.succ);
  const root = order[0]!;

  let done = 0;
  const members = order.map((q, i): ChainMember => {
    let state: ChainMemberState;
    if (completed.has(q.id)) {
      state = "done";
      done++;
    } else if (inLog.has(q.id)) state = "in-log";
    else state = prerequisites(q).every((p) => completed.has(p.questId)) ? "available" : "locked";
    return {
      questId: q.id,
      name: q.name,
      level: q.level,
      zone: zoneName(q),
      giver: str(obj(q.starts)?.name),
      state,
      step: i + 1,
    };
  });
  return { chain: root.id, name: root.name, members, done, total: members.length };
}
