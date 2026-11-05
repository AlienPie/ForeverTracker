import { prerequisites } from "./chains";
import type { QuestRow } from "./content";
import type { NextUpInput, Suggestion } from "./types";

type Rule = "chain" | "area" | "next-level";
const RANK: Record<Rule, number> = { chain: 0, area: 1, "next-level": 2 };

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const obj = (v: unknown): Record<string, unknown> | null =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

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

function inArea(q: QuestRow, zone: string | null, mapId: number | null): boolean {
  const qz = str(obj(q.zone)?.n);
  if (zone && qz && qz.toLowerCase() === zone.toLowerCase()) return true;
  if (mapId === null) return false;
  const startMap = obj(obj(q.starts)?.location)?.uiMapId;
  return startMap === mapId || obj(q.zone)?.m === mapId;
}

/**
 * Up to `limit` suggestions for what to do next, from mirrored quest data only. Pure.
 *
 * A quest is never suggested when completed, in the log, or above `levelCap` (no cap filter when
 * null). Prerequisites are `chain.previous` links with relation "Complete first", "Chain link",
 * "Offered after" or "Next quest" ("Must be active", "Quest line" and odd values are ignored).
 * Each quest takes the first rule it matches:
 *
 * 1. chain: has prerequisites, every one completed or in the log, and at least one completed.
 * 2. area: every prerequisite completed or in the log (or none), in the character's area, and
 *    `level - 3 <= quest.level <= level`. Area = `quest.zone.n` equals `zone` case-insensitively,
 *    or, when `mapId` is given, the starter's `location.uiMapId` or `zone.m` equals it.
 * 3. next-level: as area but `quest.level === level + 1` (low confidence).
 *
 * Ordered by rule rank, then quest level, then id. Profession suggestions are not produced in v1:
 * there is no verified trainer or recipe-quest data in the mirror, so `professions` is accepted
 * and unused, and the "profession" kind stays reserved.
 */
export function nextUp(input: NextUpInput, limit = 5): Suggestion[] {
  const { level, completed, inLog, levelCap } = input;
  const zone = str(input.zone);
  const mapId = typeof input.mapId === "number" ? input.mapId : null;

  const picked: { rule: Rule; q: QuestRow; reason: string }[] = [];
  for (const q of input.quests) {
    if (completed.has(q.id) || inLog.has(q.id)) continue;
    if (levelCap !== null && q.level > levelCap) continue;

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

    if (pre.length > 0 && doneCount > 0) {
      const after = pre.find((p) => completed.has(p.questId));
      const name = after?.name ?? `quest ${after?.questId}`;
      picked.push({ rule: "chain", q, reason: `Continues the chain after "${name}".${startsAt(q)}` });
      continue;
    }
    if (!inArea(q, zone, mapId)) continue;
    const where = str(obj(q.zone)?.n) ?? zone ?? "your area";
    if (q.level >= level - 3 && q.level <= level) {
      picked.push({ rule: "area", q, reason: `Level ${q.level} quest in ${where}.${startsAt(q)}` });
    } else if (q.level === level + 1) {
      picked.push({ rule: "next-level", q, reason: `Level ${q.level} quest in ${where}, one level up.${startsAt(q)}` });
    }
  }

  picked.sort((a, b) => RANK[a.rule] - RANK[b.rule] || a.q.level - b.q.level || a.q.id - b.q.id);
  return picked.slice(0, Math.max(0, limit)).map(({ rule, q, reason }) => ({
    kind: rule,
    title: q.name,
    questId: q.id,
    level: q.level,
    reason,
    source: "ForeverDB",
    confidence: rule === "next-level" ? "low" : "high",
  }));
}
