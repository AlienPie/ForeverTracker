import type { ServerLoad } from "@sveltejs/kit";
import type { ContentMode } from "@ft/content";
import { listQuestLog, type QuestLogRow } from "@ft/core";
import { characterOr404 } from "../../../../../lib/server/character";
import { env } from "../../../../../lib/server/env";
import { getQuestCatalogSafe } from "../../../../../lib/server/safe-catalog";

export type LogList = "progress" | "completed";
export type QuestLogPageData = {
  /** The quest catalog has at least one quest (otherwise names show as "Quest <id>"). */
  contentReady: boolean;
  contentMode: ContentMode;
  list: LogList;
  /** The search text as applied (trimmed, at most 100 characters). */
  q: string;
  counts: { progress: number; completed: number };
  rows: QuestLogRow[];
  total: number;
  page: number;
  pages: number;
};

const MAX_QUERY = 100;

/** A positive safe integer written in plain digits, else 1 (the core clamps it to the last page). */
function pageParam(raw: string | null): number {
  if (!raw || !/^[0-9]{1,9}$/.test(raw)) return 1;
  const n = Number(raw);
  return n > 0 ? n : 1;
}

export const load: ServerLoad = async ({ params, url }): Promise<QuestLogPageData> => {
  const view = characterOr404(params.guid, undefined, { events: false });
  const catalog = await getQuestCatalogSafe();
  const list: LogList = url.searchParams.get("list") === "completed" ? "completed" : "progress";
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, MAX_QUERY).trim();
  const ids = list === "completed" ? view.completedIds : view.questLogIds;
  const result = listQuestLog(catalog.quests, ids, { query: q, page: pageParam(url.searchParams.get("page")) });
  return {
    contentReady: catalog.quests.length > 0,
    contentMode: env().contentMode,
    list,
    q,
    counts: { progress: view.questLogIds.length, completed: view.completedIds.length },
    ...result,
  };
};
