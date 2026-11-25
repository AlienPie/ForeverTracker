import { createBlizzardClient, profileSlug, type ApiSnapshot } from "@ft/content";
import { saveApiSnapshot } from "@ft/core";
import type { Db } from "@ft/db";

export type ApiSyncResult = "ok" | "none" | "nocreds" | "noslug" | "error";

/**
 * Fetches a character's Blizzard profile and stores it. "none": Blizzard has no profile (below level 10 or a
 * name that does not match); "noslug": the character has no surname recorded yet; "nocreds": the Blizzard
 * client is not configured. `fetchCharacter` is injectable for tests.
 */
export async function syncCharacterFromApi(
  db: Db,
  who: { guid: string; name: string | null; surname: string | null },
  blizzard: { clientId: string; clientSecret: string; region: string } | null,
  fetchCharacter?: (slug: string) => Promise<ApiSnapshot | null>,
): Promise<ApiSyncResult> {
  if (!blizzard && !fetchCharacter) return "nocreds";
  const slug = profileSlug(who.name, who.surname);
  if (!slug) return "noslug";
  try {
    const fetcher = fetchCharacter ?? createBlizzardClient(blizzard!).fetchCharacter;
    const snap = await fetcher(slug);
    if (!snap) return "none";
    return saveApiSnapshot(db, who.guid, snap) ? "ok" : "error";
  } catch (err) {
    console.warn("Blizzard profile sync failed:", err instanceof Error ? err.message : err);
    return "error";
  }
}
