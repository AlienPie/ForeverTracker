import { isAvailable, prerequisiteIndex, validCompletedWithSkips } from "./chain-validity";
import { chainGraph, prerequisites, skippedMembers } from "./chains";
import { classAllowsTagged, questClass, raceAllows } from "./classes";
import type { QuestRow } from "./content";
import { learnedNames, professionOfQuestTagged, professionVerdict, slotsUsed } from "./professions";
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
 * Prerequisites are as in `prerequisiteIndex` (relations "Complete first", "Chain link",
 * "Offered after" or "Next quest", read from both sides; "Must be active", "Quest line" and odd
 * values are ignored), and several prerequisites are ALTERNATIVES (OR; real 1524 "Call of Fire"
 * needs one of four per-race starters). A prerequisite not in `quests` counts as satisfied.
 * Each quest takes the first rule it matches:
 *
 * 1. chain: at least one prerequisite is VALID completed (see `validCompleted`: reached through a
 *    completed route, alternatives as OR), so a quest done out of route (same name, another
 *    starting region) never makes its successors chain steps; they can still match the area rules.
 *    When the quest is more than CHAIN_WINDOW (5) levels above the character it is kept but
 *    demoted: confidence "low", ranked after area and next-level.
 * 2. area: prerequisites met (`isAvailable`: none, or one completed or in the log, or one not in
 *    `quests`), in the character's area (see
 *    `areaOf`), and `level - 3 <= quest.level <= level`.
 * 3. next-level: as area but `quest.level === level + 1` (low confidence).
 *
 * A quest bypassed by the chain "skipped" rule (see `skippedMembers`: not completed, not in the log, with
 * successors that are all completed or skipped) is never suggested.
 *
 * Ordered by rule rank, then quest level, then id (free-slot profession picks last, see below).
 * Class quests say "<Class> class quest" in the reason.
 *
 * Profession quests (INTERIM rule for M1.1, to be replaced in M2 by the curated Wowhead profession
 * tags): only with a non-empty `professionCatalog`. ForeverDB quests have no profession field, so
 * a quest whose name ends with `: <profession name>` ("Camping 101: Mining") is a profession quest
 * (see `professionMatcher`). It is allowed when the character knows that profession, or its kind
 * is `secondary` (always learnable), or its kind takes a slot (`primary` or `gathering`) and the
 * character's learned professions fill fewer than 2 slots: a free slot, low confidence, and the
 * reason says "You have a free profession slot"; free-slot picks sort after every other
 * suggestion, whatever their rule. Otherwise it is dropped from every rule. An allowed profession quest still needs one of the rules above; it then gets kind "profession"
 * and a reason naming the profession. A catalog profession of any other kind is not gated.
 *
 * With curated `tags` (see `buildTagIndex`, only when `tags.hasTags`): the profession comes from the
 * quest's profession tag instead of its name (an untagged quest is then not a profession quest),
 * a class tag allows the quest only for that class (`classAllowsTagged`), and a race tag only for
 * that race (`raceAllows`, against `raceToken`). Without tags nothing changes.
 */
export function nextUp(input: NextUpInput, limit = 5): Suggestion[] {
  const { level, completed, inLog, levelCap } = input;
  const zone = str(input.zone);
  const mapId = typeof input.mapId === "number" ? input.mapId : null;

  // Interim profession rule: lookups built once per call.
  const catalog = Array.isArray(input.professionCatalog) ? input.professionCatalog : [];
  const tags = input.tags;
  const gated = catalog.length > 0;
  const learned = gated ? learnedNames(input.professions) : new Set<string>();
  const used = gated ? slotsUsed(learned, catalog) : 0;
  const idx = prerequisiteIndex(input.quests);
  // "Skipped" quests (see `skippedMembers`): only worth computing when something is completed.
  const skipped =
    completed.size > 0
      ? skippedMembers(input.quests, chainGraph(input.quests, input.classToken).succ, completed, inLog)
      : new Set<number>();
  const valid = validCompletedWithSkips(input.quests, completed, skipped, idx);
  const nameOf = new Map<number, string>();
  for (const q of input.quests) nameOf.set(q.id, q.name);

  const picked: { rule: Rule; q: QuestRow; reason: string; profession: boolean; freeSlot: boolean }[] = [];
  for (const q of input.quests) {
    if (completed.has(q.id) || inLog.has(q.id)) continue;
    if (levelCap !== null && q.level > levelCap) continue;
    if (!classAllowsTagged(q, input.classToken, tags)) continue;
    if (tags && !raceAllows(tags.racesOf(q.id), input.raceToken)) continue;

    if (skipped.has(q.id)) continue;

    const prof = gated ? professionOfQuestTagged(q, catalog, tags) : null;
    const verdict = prof ? professionVerdict(prof, learned, used) : null;
    if (verdict && !verdict.allowed) continue;
    const profession = verdict !== null;
    const freeSlot = verdict?.allowed === true && verdict.freeSlot;

    if (!isAvailable(idx, q.id, (p) => completed.has(p) || inLog.has(p))) continue;
    const pre = idx.pre.get(q.id) ?? [];

    const cls = questClass(q);
    const label =
      (cls ? `${cls} class quest. ` : "") +
      (profession ? `${prof!.name} profession quest. ` : "") +
      (freeSlot ? "You have a free profession slot. " : "");

    if (pre.some((p) => valid.has(p))) {
      // Name the valid prerequisite: its own link first (in link order), then any other one.
      const link = prerequisites(q).find((p) => valid.has(p.questId));
      const afterId = link?.questId ?? Math.min(...pre.filter((p) => valid.has(p)));
      const name = link?.name ?? nameOf.get(afterId) ?? `quest ${afterId}`;
      const above = q.level - level;
      const far = above > CHAIN_WINDOW;
      const note = far ? ` Level ${q.level}, ${above} levels above you.` : "";
      picked.push({
        rule: far ? "chain-far" : "chain",
        q,
        reason: `${label}Continues the chain after "${name}".${note}${startsAt(q)}`,
        profession,
        freeSlot,
      });
      continue;
    }
    const where = areaOf(q, zone, mapId);
    if (where === null) continue;
    if (q.level >= level - 3 && q.level <= level) {
      picked.push({ rule: "area", q, reason: `${label}Level ${q.level} quest in ${where}.${startsAt(q)}`, profession, freeSlot });
    } else if (q.level === level + 1) {
      picked.push({
        rule: "next-level",
        q,
        reason: `${label}Level ${q.level} quest in ${where}, one level up.${startsAt(q)}`,
        profession,
        freeSlot,
      });
    }
  }

  // Free-slot profession picks (low confidence) go after every other suggestion, whatever their rule.
  picked.sort(
    (a, b) =>
      Number(a.freeSlot) - Number(b.freeSlot) || RANK[a.rule] - RANK[b.rule] || a.q.level - b.q.level || a.q.id - b.q.id,
  );
  return picked.slice(0, Math.max(0, limit)).map(({ rule, q, reason, profession, freeSlot }) => ({
    kind: profession ? "profession" : rule === "chain-far" ? "chain" : rule,
    title: q.name,
    questId: q.id,
    level: q.level,
    reason,
    source: "ForeverDB",
    confidence: !freeSlot && (rule === "chain" || rule === "area") ? "high" : "low",
  }));
}
