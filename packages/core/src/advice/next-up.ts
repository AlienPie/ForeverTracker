import { prerequisites } from "./chains";
import { classAllows, questClass } from "./classes";
import type { QuestRow } from "./content";
import type { NextUpInput, Suggestion } from "./types";

type Rule = "chain" | "area" | "next-level" | "chain-far";
const RANK: Record<Rule, number> = { chain: 0, area: 1, "next-level": 2, "chain-far": 3 };

/** A chain continuation more than this many levels above the character is demoted (see nextUp). */
const CHAIN_WINDOW = 5;

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const obj = (v: unknown): Record<string, unknown> | null =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const same = (a: string | null, b: string | null) => a !== null && b !== null && a.trim().toLowerCase() === b.trim().toLowerCase();

/** "from <npc> in <zone>" from the starter endpoint, using only fields that are present. */
function startsAt(q: QuestRow): string {
  const s = obj(q.starts);
  const who = str(s?.name);
  const where = str(obj(s?.location)?.zone);
  if (who && where) return ` Starts with ${who} in ${where}.`;
  if (who) return ` Starts with ${who}.`;
  if (where) return ` Starts in ${where}.`;
  return "";
}

/** The quest's place: a `zone` with a numeric uiMapId (`m`). Classes and categories have `m: null`. */
function place(q: QuestRow): { name: string; mapId: number } | null {
  const z = obj(q.zone);
  const name = str(z?.n);
  return name && typeof z?.m === "number" ? { name, mapId: z.m } : null;
}

/**
 * The zone a quest is "in" for the area rules, or null when it is not in the character's area.
 * - Class quest: its starter's location (name or uiMapId) is the character's zone or map.
 * - Otherwise a place quest whose name equals `zone` (case-insensitive) or whose `zone.m` equals
 *   `mapId`, and whose starter, when it has a usable location, is in that same zone. So the
 *   returned name is always where the quest is and where it is picked up.
 */
function areaOf(q: QuestRow, zone: string | null, mapId: number | null): string | null {
  const loc = obj(obj(q.starts)?.location);
  const locName = str(loc?.zone);
  const locMap = typeof loc?.uiMapId === "number" ? loc.uiMapId : null;
  if (questClass(q) !== null) {
    if (same(locName, zone)) return locName;
    return mapId !== null && locMap === mapId ? locName : null;
  }
  const p = place(q);
  if (!p) return null;
  if (!same(p.name, zone) && !(mapId !== null && p.mapId === mapId)) return null;
  const startsElsewhere =
    (locMap !== null || locName !== null) && locMap !== p.mapId && !same(locName, p.name);
  return startsElsewhere ? null : p.name;
}

/**
 * Up to `limit` suggestions for what to do next, from mirrored quest data only. Pure.
 *
 * A quest is never suggested when completed, in the log, above `levelCap` (no cap filter when
 * null), or a class quest (`zone.n` is a class name) for another class or an unknown class.
 * Prerequisites are `chain.previous` links with relation "Complete first", "Chain link",
 * "Offered after" or "Next quest" ("Must be active", "Quest line" and odd values are ignored).
 * Each quest takes the first rule it matches:
 *
 * 1. chain: has prerequisites, every one completed or in the log, and at least one completed.
 *    When the quest is more than CHAIN_WINDOW (5) levels above the character it is kept but
 *    demoted: confidence "low", ranked after area and next-level.
 * 2. area: every prerequisite completed or in the log (or none), in the character's area (see
 *    `areaOf`), and `level - 3 <= quest.level <= level`.
 * 3. next-level: as area but `quest.level === level + 1` (low confidence).
 *
 * Ordered by rule rank, then quest level, then id. Class quests say "<Class> class quest" in the
 * reason. Profession suggestions are not produced in v1: there is no verified trainer or
 * recipe-quest data in the mirror, so `professions` is accepted and unused, and the "profession"
 * kind stays reserved.
 */
export function nextUp(input: NextUpInput, limit = 5): Suggestion[] {
  const { level, completed, inLog, levelCap } = input;
  const zone = str(input.zone);
  const mapId = typeof input.mapId === "number" ? input.mapId : null;

  const picked: { rule: Rule; q: QuestRow; reason: string }[] = [];
  for (const q of input.quests) {
    if (completed.has(q.id) || inLog.has(q.id)) continue;
    if (levelCap !== null && q.level > levelCap) continue;
    if (!classAllows(q, input.classToken)) continue;

    const pre = prerequisites(q);
    let doneCount = 0;
    let met = true;
    for (const p of pre) {
      if (completed.has(p.questId)) doneCount++;
      else if (!inLog.has(p.questId)) {
        met = false;
        break;
      }
    }
    if (!met) continue;

    const cls = questClass(q);
    const label = cls ? `${cls} class quest. ` : "";

    if (pre.length > 0 && doneCount > 0) {
      const after = pre.find((p) => completed.has(p.questId));
      const name = after?.name ?? `quest ${after?.questId}`;
      const above = q.level - level;
      const far = above > CHAIN_WINDOW;
      const note = far ? ` Level ${q.level}, ${above} levels above you.` : "";
      picked.push({
        rule: far ? "chain-far" : "chain",
        q,
        reason: `${label}Continues the chain after "${name}".${note}${startsAt(q)}`,
      });
      continue;
    }
    const where = areaOf(q, zone, mapId);
    if (where === null) continue;
    if (q.level >= level - 3 && q.level <= level) {
      picked.push({ rule: "area", q, reason: `${label}Level ${q.level} quest in ${where}.${startsAt(q)}` });
    } else if (q.level === level + 1) {
      picked.push({ rule: "next-level", q, reason: `${label}Level ${q.level} quest in ${where}, one level up.${startsAt(q)}` });
    }
  }

  picked.sort((a, b) => RANK[a.rule] - RANK[b.rule] || a.q.level - b.q.level || a.q.id - b.q.id);
  return picked.slice(0, Math.max(0, limit)).map(({ rule, q, reason }) => ({
    kind: rule === "chain-far" ? "chain" : rule,
    title: q.name,
    questId: q.id,
    level: q.level,
    reason,
    source: "ForeverDB",
    confidence: rule === "chain" || rule === "area" ? "high" : "low",
  }));
}
