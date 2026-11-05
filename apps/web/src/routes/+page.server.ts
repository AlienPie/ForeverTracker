import type { ServerLoad } from "@sveltejs/kit";
import type { ContentMode } from "@ft/content";
import { getCharacter, getRoster, nextUp, type Roster, type Suggestion } from "@ft/core";
import { getQuestCatalogSafe } from "../lib/server/safe-catalog";
import { getDb } from "../lib/server/db";
import { env } from "../lib/server/env";

export type RosterPageData = {
  roster: Roster;
  /** First "next up" suggestion per character guid; null when none or content is not ready. */
  nextByGuid: Record<string, Suggestion | null>;
  /** The quest catalog has at least one quest. */
  contentReady: boolean;
  /** CONTENT_MODE; in "on-demand" the roster never loads content (no network at page load). */
  contentMode: ContentMode;
  /** Server clock (unix seconds) the sync labels are computed against. */
  now: number;
};

export const load: ServerLoad = async (): Promise<RosterPageData> => {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const roster = getRoster(db, now);
  const catalog = await getQuestCatalogSafe();
  const contentReady = catalog.quests.length > 0;

  const nextByGuid: Record<string, Suggestion | null> = {};
  for (const card of roster.characters) {
    nextByGuid[card.guid] = null;
    if (!contentReady || card.level === null) continue;
    const view = getCharacter(db, card.guid, now);
    if (!view) continue;
    const [first] = nextUp(
      {
        level: card.level,
        zone: view.zone,
        mapId: view.mapId,
        classToken: view.class,
        completed: new Set(view.completedIds),
        inLog: new Set(view.questLogIds),
        quests: catalog.quests,
        levelCap: catalog.levelCap,
        professions: view.professions,
      },
      1,
    );
    nextByGuid[card.guid] = first ?? null;
  }
  return { roster, nextByGuid, contentReady, contentMode: env().contentMode, now };
};
