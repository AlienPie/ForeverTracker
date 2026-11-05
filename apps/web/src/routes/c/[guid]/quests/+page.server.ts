import type { ServerLoad } from "@sveltejs/kit";
import type { ContentMode } from "@ft/content";
import { chainProgress, nextUp, type Suggestion } from "@ft/core";
import { characterOr404 } from "../../../../lib/server/character";
import { env } from "../../../../lib/server/env";
import { getQuestCatalogSafe } from "../../../../lib/server/safe-catalog";

export type Pip = "done" | "now" | "todo";
export type ChainRow = { chain: number; name: string; done: number; total: number; pips: Pip[] };

export type QuestsPageData = {
  /** The quest catalog has at least one quest. */
  contentReady: boolean;
  contentMode: ContentMode;
  /** Top five "next up" suggestions; empty when content is not ready or the level is unknown. */
  suggestions: Suggestion[];
  /** Chains started and not finished, with one pip per member. */
  chains: ChainRow[];
  inProgress: number;
  completed: number;
  level: number | null;
};

/** Pips for a chain: completed members first, then the current step, then the rest. */
function pips(done: number, total: number): Pip[] {
  return Array.from({ length: total }, (_, i) => (i < done ? "done" : i === done ? "now" : "todo"));
}

export const load: ServerLoad = async ({ params }): Promise<QuestsPageData> => {
  const view = characterOr404(params.guid, undefined, { events: false });
  const catalog = await getQuestCatalogSafe();
  const contentReady = catalog.quests.length > 0;
  const completed = new Set(view.completedIds);
  const inLog = new Set(view.questLogIds);

  const suggestions =
    contentReady && view.level !== null
      ? nextUp(
          {
            level: view.level,
            zone: view.zone,
            mapId: view.mapId,
            classToken: view.class,
            completed,
            inLog,
            quests: catalog.quests,
            levelCap: catalog.levelCap,
            professions: view.professions,
            professionCatalog: catalog.professions,
          },
          5,
        )
      : [];
  const chains = contentReady
    ? chainProgress(catalog.quests, completed, inLog, view.class).map((c) => ({
        chain: c.chain,
        name: c.name,
        done: c.done,
        total: c.total,
        pips: pips(c.done, c.total),
      }))
    : [];

  return {
    contentReady,
    contentMode: env().contentMode,
    suggestions,
    chains,
    inProgress: view.questLogIds.length,
    completed: view.completedIds.length,
    level: view.level,
  };
};
