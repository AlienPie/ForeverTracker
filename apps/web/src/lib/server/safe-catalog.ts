import { EMPTY_CATALOG, getQuestCatalog, type QuestCatalog } from "./content";

/**
 * The quest catalog for a page load, never throwing: a missing or corrupt
 * mirror (or any other loader failure) gives the empty catalog, so pages show
 * "content not ready" instead of a 500. The failure is logged; a failed load
 * is not memoised, so the next request tries again.
 */
export async function getQuestCatalogSafe(
  get: () => Promise<QuestCatalog> = getQuestCatalog,
): Promise<QuestCatalog> {
  try {
    return await get();
  } catch (err) {
    console.error("quest catalog unavailable:", err instanceof Error ? err.message : err);
    return EMPTY_CATALOG;
  }
}
