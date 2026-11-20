import type { ServerLoad } from "@sveltejs/kit";
import type { ContentMode } from "@ft/content";
import { factionOfRace, zoneProgress, type ZoneProgress } from "@ft/core";
import { characterOr404 } from "../../../../lib/server/character";
import { buildUsable } from "../../../../lib/server/usable";
import { env } from "../../../../lib/server/env";
import { getQuestCatalogSafe } from "../../../../lib/server/safe-catalog";

export type ExplorePageData = {
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

export const load: ServerLoad = async ({ params }): Promise<ExplorePageData> => {
  const view = characterOr404(params.guid, undefined, { events: false });
  const catalog = await getQuestCatalogSafe();
  const contentReady = catalog.quests.length > 0;
  const hasZoneData = (catalog.zones?.length ?? 0) > 0;
  const base = { contentMode: env().contentMode, level: view.level, hasZoneData };
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
  const { zones, unplaced } = zoneProgress({
    quests: catalog.quests,
    zones: catalog.zones,
    level: view.level,
    classToken: view.class,
    faction,
    completed,
    inLog,
    visitedMapIds: new Set(view.visitedMaps.map((v) => v.mapId)),
    usable,
  });
  // Unvisited: in-range zones first, zones of the other faction's territory last; the rest keep the level order.
  const unvisited = zones.filter((z) => !z.visited);
  const rank = (z: ZoneProgress) =>
    (faction !== null && (z.territory === "Alliance" || z.territory === "Horde") && z.territory !== faction ? 2 : 0) +
    (z.fit === "in-range" ? 0 : 1);
  unvisited.sort((a, b) => rank(a) - rank(b));
  return { ...base, contentReady, visited: zones.filter((z) => z.visited), unvisited, unplaced };
};
