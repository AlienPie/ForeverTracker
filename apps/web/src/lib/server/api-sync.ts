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

export type ApiSyncAll = { synced: number; none: number; skipped: number; failed: number };

/**
 * Syncs every character one after another. Characters under level 10 have no Blizzard profile, and ones
 * without a surname cannot be asked; both count as skipped without a request. `none` counts characters
 * Blizzard does not know, `failed` the ones that errored.
 */
export async function syncAllFromApi(
  db: Db,
  characters: { guid: string; name: string | null; surname: string | null; level: number | null }[],
  blizzard: { clientId: string; clientSecret: string; region: string } | null,
  fetchCharacter?: (slug: string) => Promise<ApiSnapshot | null>,
): Promise<ApiSyncAll> {
  const out: ApiSyncAll = { synced: 0, none: 0, skipped: 0, failed: 0 };
  // One client for the whole run so the access token is fetched once.
  const fetcher = fetchCharacter ?? (blizzard ? createBlizzardClient(blizzard).fetchCharacter : undefined);
  for (const c of characters) {
    if ((c.level !== null && c.level < 10) || !profileSlug(c.name, c.surname) || !fetcher) {
      out.skipped++;
      continue;
    }
    const r = await syncCharacterFromApi(db, c, blizzard, fetcher);
    if (r === "ok") out.synced++;
    else if (r === "none") out.none++;
    else out.failed++;
  }
  return out;
}
