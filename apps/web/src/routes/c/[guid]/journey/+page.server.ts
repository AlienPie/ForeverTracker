import type { ServerLoad } from "@sveltejs/kit";
import { journeyEvents, groupPlaces, type JourneyEvent, type Place } from "../../../../lib/journey";
import { characterOr404 } from "../../../../lib/server/character";
import { getQuestCatalogSafe } from "../../../../lib/server/safe-catalog";

export type JourneyPageData = { events: JourneyEvent[]; places: Place[] };

export const load: ServerLoad = async ({ params }): Promise<JourneyPageData> => {
  const view = characterOr404(params.guid);
  const catalog = await getQuestCatalogSafe();
  const questNames = new Map(catalog.quests.map((q) => [q.id, q.name]));
  return {
    events: journeyEvents(view.events, questNames, catalog.mapNames),
    places: groupPlaces(view.visitedMaps, catalog.mapNames),
  };
};
