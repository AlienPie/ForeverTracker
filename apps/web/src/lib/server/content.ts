import { createContentSource, type ContentMode, type ContentSource, type ForeverDbClient } from "@ft/content";
import { getLevelCap, loadQuests, type QuestRow } from "@ft/core";
import type { Db } from "@ft/db";
import { getDb } from "./db";
import { env } from "./env";

export type QuestCatalog = { quests: QuestRow[]; levelCap: number | null };

export const CATALOG_TTL_MS = 60_000;
const EMPTY: QuestCatalog = Object.freeze({ quests: [], levelCap: null }) as QuestCatalog;

/** Mirror mode never touches the network, so its source gets a client that refuses to be used. */
const NO_CLIENT: ForeverDbClient = {
  get: () => Promise.reject(new Error("no ForeverDB client in the web app")),
  pages: () => {
    throw new Error("no ForeverDB client in the web app");
  },
};

/**
 * The content source for page loads, or null when there is none.
 *
 * `mirror` reads the local mirror filled by `pnpm content:sync`. `on-demand`
 * gives null: the web app holds no ForeverDB API key, and a page load must
 * never call the network (listing every quest is several API pages), so in
 * that mode the catalog is empty and the UI says content is not ready.
 */
export function catalogSource(mode: ContentMode, db: Db): ContentSource | null {
  if (mode !== "mirror") return null;
  return createContentSource({ mode: "mirror", client: NO_CLIENT, db });
}

/**
 * A memo of the quest catalog with a TTL. Concurrent callers share one load;
 * a failed load is not cached. With no quests the result is the empty shape
 * (level cap null too), so `quests.length > 0` means content is ready.
 */
export function createQuestCatalog(opts: {
  source: () => ContentSource | null;
  now?: () => number;
  ttlMs?: number;
}): { get(): Promise<QuestCatalog>; clear(): void } {
  const now = opts.now ?? Date.now;
  const ttl = opts.ttlMs ?? CATALOG_TTL_MS;
  let entry: { value: Promise<QuestCatalog>; expires: number } | null = null;

  async function build(): Promise<QuestCatalog> {
    const source = opts.source();
    if (!source) return EMPTY;
    const quests = await loadQuests(source);
    if (quests.length === 0) return EMPTY;
    return { quests, levelCap: await getLevelCap(source) };
  }

  return {
    get() {
      if (entry && now() < entry.expires) return entry.value;
      const value = build();
      const mine = { value, expires: now() + ttl };
      entry = mine;
      value.catch(() => {
        if (entry === mine) entry = null;
      });
      return value;
    },
    clear() {
      entry = null;
    },
  };
}

const processCatalog = createQuestCatalog({ source: () => catalogSource(env().contentMode, getDb()) });

/** Process-wide quest catalog, reloaded at most every 60 seconds. */
export const getQuestCatalog = (): Promise<QuestCatalog> => processCatalog.get();

/** Forget the process-wide catalog (tests). */
export const resetQuestCatalog = (): void => processCatalog.clear();
