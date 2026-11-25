import { fail, type Actions, type ServerLoad } from "@sveltejs/kit";
import type { ContentMode } from "@ft/content";
import { factionOfRace, hidePlace, unhidePlace, zoneProgress, type ZoneProgress } from "@ft/core";
import { getDb } from "../../../../lib/server/db";
import { characterOr404 } from "../../../../lib/server/character";
import { buildUsable } from "../../../../lib/server/usable";
import { env } from "../../../../lib/server/env";
import { getQuestCatalogSafe } from "../../../../lib/server/safe-catalog";

const SORTS = ["level", "complete", "recent"] as const;
export type ExploreSort = (typeof SORTS)[number];
export type Tally = { done: number; total: number };

export type ExplorePageData = {
  /** Places the owner hid (zones only flown over, say), so they can be shown again. */
  hidden: { name: string; mapId: number }[];
  sort: ExploreSort;
  /** Every zone, and the visited ones only. */
  all: Tally;
  seen: Tally;
  /** The quest catalog has at least one quest. */
  contentReady: boolean;
  contentMode: ContentMode;
  level: number | null;
  visited: ZoneProgress[];
  unvisited: ZoneProgress[];
  /** Quests with no zone (class and profession quests, say); not counted in any zone. */
  unplaced: number;
  /** The curated zone list has entries, so level ranges and territories can show. */
  hasZoneData: boolean;
};

export const load: ServerLoad = async ({ params, url }): Promise<ExplorePageData> => {
  const view = characterOr404(params.guid, undefined, { events: 2000 });
  const asked = url.searchParams.get("sort");
  const sort: ExploreSort = SORTS.find((s) => s === asked) ?? "level";
  const catalog = await getQuestCatalogSafe();
  const contentReady = catalog.quests.length > 0;
  const hasZoneData = (catalog.zones?.length ?? 0) > 0;
  const base = { hidden: [] as { name: string; mapId: number }[], sort, all: { done: 0, total: 0 }, seen: { done: 0, total: 0 }, contentMode: env().contentMode, level: view.level, hasZoneData };
  if (!contentReady) return { ...base, contentReady, visited: [], unvisited: [], unplaced: 0 };

  const faction = factionOfRace(view.race);
  const completed = new Set(view.completedIds);
  const inLog = new Set(view.questLogIds);
  const usable = buildUsable({
    tags: catalog.tags,
    professionCatalog: catalog.professions,
    professions: view.professions,
    classToken: view.class,
    raceToken: view.race,
    completed,
    inLog,
  });
  const completedAt = new Map<number, number>();
  for (const e of view.events) {
    const id = e.kind === "quest_turned_in" && e.data && typeof e.data === "object" ? (e.data as { questId?: unknown }).questId : null;
    if (typeof id === "number" && (completedAt.get(id) ?? 0) < e.t) completedAt.set(id, e.t);
  }
  const { zones, unplaced } = zoneProgress({
    quests: catalog.quests,
    zones: catalog.zones,
    level: view.level,
    classToken: view.class,
    raceToken: view.race,
    faction,
    completed,
    inLog,
    visitedMapIds: new Set(view.visitedMaps.map((v) => v.mapId)),
    usable,
    completedAt,
  });
  // Unvisited: in-range zones first, zones of the other faction's territory last; the rest keep the level order.
  const unvisited = zones.filter((z) => !z.visited);
  const rank = (z: ZoneProgress) =>
    (faction !== null && (z.territory === "Alliance" || z.territory === "Horde") && z.territory !== faction ? 2 : 0) +
    (z.fit === "in-range" ? 0 : 1);
  unvisited.sort((a, b) => rank(a) - rank(b));
  const visited = zones.filter((z) => z.visited);
  const pct = (z: ZoneProgress) => (z.total > 0 ? z.done / z.total : 0);
  if (sort === "complete") visited.sort((a, b) => pct(b) - pct(a) || (b.lastDoneAt ?? 0) - (a.lastDoneAt ?? 0));
  else if (sort === "recent") visited.sort((a, b) => (b.lastDoneAt ?? 0) - (a.lastDoneAt ?? 0) || pct(b) - pct(a));
  const tally = (list: ZoneProgress[]): Tally => ({ done: list.reduce((n, z) => n + z.done, 0), total: list.reduce((n, z) => n + z.total, 0) });
  const hidden = zones.filter((z) => z.mapId !== null && view.hiddenMaps.includes(z.mapId)).map((z) => ({ name: z.name, mapId: z.mapId! }));
  return { ...base, hidden, contentReady, visited, unvisited, unplaced, all: tally(zones), seen: tally(visited) };
};

async function setHidden(guid: string | undefined, request: Request, hide: boolean) {
  characterOr404(guid, undefined, { events: false });
  const raw = (await request.formData()).get("mapId");
  const id = typeof raw === "string" && /^[0-9]{1,9}$/.test(raw) ? Number(raw) : null;
  if (id === null) return fail(400, { message: "Not a map id" });
  if (hide) hidePlace(getDb(), guid!, id);
  else unhidePlace(getDb(), guid!, id);
  return { ok: true };
}

export const actions: Actions = {
  hide: ({ params, request }) => setHidden(params.guid, request, true),
  unhide: ({ params, request }) => setHidden(params.guid, request, false),
};
