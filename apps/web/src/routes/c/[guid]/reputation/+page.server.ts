import type { ServerLoad } from "@sveltejs/kit";
import type { ContentMode } from "@ft/content";
import { factionOfRace, reputationRows, sideAllows, type RepRow } from "@ft/core";
import { characterOr404 } from "../../../../lib/server/character";
import { env } from "../../../../lib/server/env";
import { getQuestCatalogSafe } from "../../../../lib/server/safe-catalog";
import { buildUsable } from "../../../../lib/server/usable";

export type ReputationPageData = {
  /** Standings from Blizzard's profile; null when the character was never synced from Blizzard. */
  rows: RepRow[] | null;
  /** The Blizzard client is configured, so the sync button in the header can work. */
  canApiSync: boolean;
  contentMode: ContentMode;
  fetchedAt: number | null;
};

export const load: ServerLoad = async ({ params }): Promise<ReputationPageData> => {
  const view = characterOr404(params.guid, undefined, { events: false });
  if (!view.api) return { rows: null, canApiSync: env().blizzard !== null, contentMode: env().contentMode, fetchedAt: null };
  const catalog = await getQuestCatalogSafe();
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
  const faction = factionOfRace(view.race);
  const byId = new Map(catalog.quests.map((q) => [q.id, q]));
  const isOpen = (id: number): boolean => {
    const q = byId.get(id);
    // Quests more than three levels above the character are not open yet.
    return !!q && (view.level === null || q.level <= view.level + 3) && !completed.has(id) && !inLog.has(id) && usable(q) && sideAllows(q, faction);
  };
  return {
    rows: reputationRows(view.api.reputations, catalog.reputationRewards ?? {}, isOpen),
    canApiSync: env().blizzard !== null,
    contentMode: env().contentMode,
    fetchedAt: view.api.fetchedAt,
  };
};
