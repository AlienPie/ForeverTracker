import { chainGraph, chainProgress, skippedMembers } from "./chains";
import type { QuestRow } from "./content";
import type { CuratedTerritory, CuratedZone } from "../curated/types";
import { sideAllows, type Faction } from "./faction";

export type PlaceZone = { name: string; minLevel: number | null; maxLevel: number | null; territory: CuratedTerritory | null };
export type ZoneFit = "below" | "in-range" | "above" | "unknown";
export type ZoneQuest = { id: number; name: string; level: number };
export type ZoneProgress = PlaceZone & {
  /** First non-null quest zone.m for this zone name. */
  mapId: number | null;
  fit: ZoneFit;
  visited: boolean;
  done: number;
  inLog: number;
  left: number;
  skipped: number;
  /** done + inLog + left. */
  total: number;
  /** Newest turn-in time (unix seconds) among completed quests of this zone that `completedAt` knows; else null. */
  lastDoneAt: number | null;
  /** Completed quests, by level then id; empty unless visited. */
  completedQuests: ZoneQuest[];
  /**
   * In progress, empty unless visited: quests in the log, plus quests not yet done that belong to a
   * chain the character is part way through. `inLog` tells them apart.
   */
  inProgress: (ZoneQuest & { inLog: boolean })[];
  /** Not started and not part of a chain in progress, by level then id; empty unless visited. */
  remaining: ZoneQuest[];
  /** Skipped quests, same order; empty unless visited. */
  skippedQuests: ZoneQuest[];
};
export type ExplorationInput = {
  quests: QuestRow[];
  zones?: CuratedZone[];
  level: number | null;
  classToken?: string | null;
  faction?: Faction | null;
  completed: Set<number>;
  inLog: Set<number>;
  visitedMapIds: ReadonlySet<number>;
  /** When quests were turned in (quest id to unix seconds), from the addon's events; the game's list has no dates. */
  completedAt?: ReadonlyMap<number, number>;
  usable?: (q: QuestRow) => boolean;
};

const norm = (s: string): string => s.trim().toLowerCase();

/** Quests with a numeric zone map id, grouped by normalised zone name (first-seen display name and map id kept). */
function questZones(quests: QuestRow[]): Map<string, { name: string; mapId: number; quests: QuestRow[] }> {
  const out = new Map<string, { name: string; mapId: number; quests: QuestRow[] }>();
  for (const q of quests) {
    if (!q.zone || typeof q.zone.m !== "number") continue;
    const key = norm(q.zone.n);
    let g = out.get(key);
    if (!g) out.set(key, (g = { name: q.zone.n.trim(), mapId: q.zone.m, quests: [] }));
    g.quests.push(q);
  }
  return out;
}

const hasLevels = (z: CuratedZone) => z.minLevel !== null || z.maxLevel !== null;

function place(zones: CuratedZone[] | undefined, groups: Map<string, unknown>): PlaceZone[] {
  const merged = new Map<string, CuratedZone>();
  for (const z of zones ?? []) {
    if (z.type !== "zone") continue;
    const key = norm(z.name);
    const have = merged.get(key);
    if (!have || (!hasLevels(have) && hasLevels(z))) merged.set(key, z);
  }
  const out: PlaceZone[] = [];
  for (const [key, z] of merged) {
    if (groups.has(key)) out.push({ name: z.name.trim(), minLevel: z.minLevel, maxLevel: z.maxLevel, territory: z.territory });
  }
  for (const [key, g] of groups as Map<string, { name: string }>) {
    if (!merged.has(key)) out.push({ name: g.name, minLevel: null, maxLevel: null, territory: null });
  }
  return out.sort(
    (a, b) =>
      (a.minLevel === null ? 1 : 0) - (b.minLevel === null ? 1 : 0) ||
      (a.minLevel ?? 0) - (b.minLevel ?? 0) ||
      a.name.localeCompare(b.name),
  );
}

/**
 * The zones to list: curated rows of type "zone" (same name, trimmed and case-insensitive, merged,
 * keeping the first row with levels) that have at least one quest with a numeric `zone.m`, plus
 * every quest zone name the curated list lacks (null levels and territory). Sorted by minLevel
 * (null last), then name.
 */
export function placeZones(zones: CuratedZone[] | undefined, quests: QuestRow[]): PlaceZone[] {
  return place(zones, questZones(quests));
}

const byLevelThenId = (a: QuestRow, b: QuestRow) => a.level - b.level || a.id - b.id;
const zq = (q: QuestRow): ZoneQuest => ({ id: q.id, name: q.name, level: q.level });

function fitOf(level: number | null, z: PlaceZone): ZoneFit {
  if (level === null || z.minLevel === null) return "unknown";
  if (level < z.minLevel) return "below";
  if (z.maxLevel !== null && level > z.maxLevel) return "above";
  return "in-range";
}

/**
 * Per-zone quest completion. A quest counts in its zone when `zone.m` is numeric and the zone name
 * matches a place zone: completed is `done`; else in log is `inLog`; else unusable or other-side
 * quests are ignored; else skipped (see `skippedMembers`) or `left`. `unplaced` counts quests with
 * no zone or no map id.
 */
export function zoneProgress(input: ExplorationInput): { zones: ZoneProgress[]; unplaced: number } {
  const { quests, completed, inLog } = input;
  const faction = input.faction ?? null;
  const groups = questZones(quests);
  const skippedIds =
    completed.size === 0 ? new Set<number>() : skippedMembers(quests, chainGraph(quests, input.classToken).succ, completed, inLog);

  const graph = chainGraph(quests, input.classToken);
  const activeGroups = new Set(
    chainProgress(quests, completed, inLog, input.classToken, input.usable).map((c) => graph.groupOf(c.chain)),
  );
  const chainActive = (q: QuestRow) => graph.byId.has(q.id) && activeGroups.has(graph.groupOf(q.id));

  let unplaced = 0;
  for (const q of quests) if (!q.zone || typeof q.zone.m !== "number") unplaced++;

  const zones = place(input.zones, groups).map((p): ZoneProgress => {
    const g = groups.get(norm(p.name))!;
    let done = 0;
    let lastDoneAt: number | null = null;
    const finished: QuestRow[] = [];
    const logged: QuestRow[] = [];
    const chained: QuestRow[] = [];
    let log = 0;
    const left: QuestRow[] = [];
    const skipped: QuestRow[] = [];
    for (const q of g.quests) {
      if (completed.has(q.id)) {
        done++;
        finished.push(q);
        const t = input.completedAt?.get(q.id);
        if (t !== undefined && (lastDoneAt === null || t > lastDoneAt)) lastDoneAt = t;
      } else if (inLog.has(q.id)) {
        log++;
        logged.push(q);
      } else if ((input.usable && !input.usable(q)) || !sideAllows(q, faction)) continue;
      else if (skippedIds.has(q.id)) skipped.push(q);
      else {
        left.push(q);
        if (chainActive(q)) chained.push(q);
      }
    }
    const visited = input.visitedMapIds.has(g.mapId) || done + log > 0;
    return {
      ...p,
      mapId: g.mapId,
      fit: fitOf(input.level, p),
      visited,
      done,
      inLog: log,
      left: left.length,
      skipped: skipped.length,
      total: done + log + left.length,
      lastDoneAt,
      completedQuests: visited ? finished.sort(byLevelThenId).map(zq) : [],
      inProgress: visited
        ? [...logged.map((q) => ({ q, inLog: true })), ...chained.map((q) => ({ q, inLog: false }))]
            .sort((a, b) => byLevelThenId(a.q, b.q))
            .map(({ q, inLog }) => ({ ...zq(q), inLog }))
        : [],
      remaining: visited ? left.filter((q) => !chained.includes(q)).sort(byLevelThenId).map(zq) : [],
      skippedQuests: visited ? skipped.sort(byLevelThenId).map(zq) : [],
    };
  });
  return { zones, unplaced };
}
