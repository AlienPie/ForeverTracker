import { error, type ServerLoad } from "@sveltejs/kit";
import type { ContentMode } from "@ft/content";
import { chainDetail, type ChainDetail } from "@ft/core";
import { characterOr404 } from "../../../../../../lib/server/character";
import { env } from "../../../../../../lib/server/env";
import { getQuestCatalogSafe } from "../../../../../../lib/server/safe-catalog";

export type ChainPageData = {
  /** The quest catalog has at least one quest. */
  contentReady: boolean;
  contentMode: ContentMode;
  /** The chain holding the requested quest; null only when content is not ready. */
  chain: ChainDetail | null;
  /** Quest id of the current step (see `currentStep`), or null when every member is done. */
  current: number | null;
};

/** A positive safe integer written in plain digits, or null. */
function questIdParam(raw: string | undefined): number | null {
  if (!raw || !/^[0-9]{1,15}$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/**
 * The step to mark as current: the first quest in the log (what the character is doing), else the
 * first one available now, else the first one not done; null when every member is done.
 */
function currentStep(chain: ChainDetail): number | null {
  const m =
    chain.members.find((x) => x.state === "in-log") ??
    chain.members.find((x) => x.state === "available") ??
    chain.members.find((x) => x.state !== "done");
  return m?.questId ?? null;
}

export const load: ServerLoad = async ({ params }): Promise<ChainPageData> => {
  const view = characterOr404(params.guid, undefined, { events: false });
  const questId = questIdParam(params.questId);
  if (questId === null) error(404, "Quest not found");

  const catalog = await getQuestCatalogSafe();
  const contentMode = env().contentMode;
  // No catalog yet: show the content-sync guidance instead of a 404 for every chain.
  if (catalog.quests.length === 0) return { contentReady: false, contentMode, chain: null, current: null };

  const chain = chainDetail(catalog.quests, questId, new Set(view.completedIds), new Set(view.questLogIds), view.class);
  if (!chain) error(404, "Quest not found");
  return {
    contentReady: true,
    contentMode,
    chain,
    current: currentStep(chain),
  };
};
