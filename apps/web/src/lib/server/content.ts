import { createContentSource, type ContentMode, type ContentSource, type ForeverDbClient } from "@ft/content";
import {
  applyOverrides,
  buildTagIndex,
  emptyCurated,
  getLevelCap,
  loadProfessions,
  loadQuests,
  readCuratedDir,
  type Curated,
  type CuratedZone,
  type ProfessionInfo,
  type QuestRow,
  type TagIndex,
} from "@ft/core";
import type { Db } from "@ft/db";
import { getDb } from "./db";
import { env, resolveCuratedDir } from "./env";

export type QuestCatalog = {
  quests: QuestRow[];
  levelCap: number | null;
  /** uiMapId to zone name (see `loadMapNames`); empty when content is not ready. */
  mapNames: Record<number, string>;
  /**
   * Mirrored `professions` catalog for the interim profession-quest rule in `nextUp`. Optional
   * (additive): absent on the empty catalog, and an absent or empty list leaves `nextUp` unchanged.
   */
  professions?: ProfessionInfo[];
  /** Curated quest tags (class, race, profession); absent when there are none. */
  tags?: TagIndex;
  /** Curated zone level ranges; absent when there are none. */
  zones?: CuratedZone[];
  /** Quest titles from Blizzard's data, by id, for quests the mirror lacks; absent when there are none. */
  extraNames?: Record<number, string>;
};

/** Blizzard's faction requirement is authoritative: it replaces the mirror's (often missing) side. */
export function applyBlizzardSides(quests: QuestRow[], sides: Record<number, "Alliance" | "Horde">): QuestRow[] {
  if (Object.keys(sides).length === 0) return quests;
  return quests.map((q) => {
    const s = sides[q.id];
    return s ? { ...q, side: s === "Alliance" ? "a" : "h" } : q;
  });
}

export const CATALOG_TTL_MS = 60_000;
export const EMPTY_CATALOG: QuestCatalog = Object.freeze({ quests: [], levelCap: null, mapNames: {} }) as QuestCatalog;
const EMPTY = EMPTY_CATALOG;
const PAGE = 500;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const placeName = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const mapId = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null);

/**
 * uiMapId to zone name, from two sources verified against the owner's mirror
 * (2026-11-05): `zones` records are `{ id, name, type, parentId }` where `id`
 * is the uiMapId (every id shared with the quests carries the same name as the
 * quests' `zone.m`/`zone.n` pairs); then, for ids the zones list lacks, the
 * quests' own `zone.m` + `zone.n` pairs and endpoint `location.uiMapId` +
 * `location.zone`. A quest `zone.n` without a numeric `m` is a category
 * ("Warrior", "Cooking"), never a place, so it is not used.
 */
export async function loadMapNames(source: ContentSource, quests: QuestRow[]): Promise<Record<number, string>> {
  const names: Record<number, string> = {};
  for (let offset = 0; ; offset += PAGE) {
    const page = await source.list("zones", { limit: PAGE, offset });
    for (const z of page) {
      const id = isObj(z) ? mapId(z.id) : null;
      const name = isObj(z) ? placeName(z.name) : null;
      if (id !== null && name !== null) names[id] = name;
    }
    if (page.length < PAGE) break;
  }
  const add = (id: unknown, name: unknown) => {
    const m = mapId(id);
    const n = placeName(name);
    if (m !== null && n !== null && !(m in names)) names[m] = n;
  };
  for (const q of quests) {
    if (isObj(q.zone)) add(q.zone.m, q.zone.n);
    for (const e of [q.starts, q.ends]) {
      const loc = isObj(e) && isObj(e.location) ? e.location : null;
      if (loc) add(loc.uiMapId, loc.zone);
    }
  }
  return names;
}

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
 * The professions catalog, or [] when it cannot be loaded. The profession-quest rule is optional,
 * so a failure here must not lose the quests: it is logged and `nextUp` keeps its old behaviour.
 */
async function professionsOrNone(source: ContentSource): Promise<ProfessionInfo[]> {
  try {
    return await loadProfessions(source);
  } catch (err) {
    console.error("professions catalog unavailable:", err instanceof Error ? err.message : err);
    return [];
  }
}

let lastProblems = "";

/** Logs the curated problems once per distinct set, not on every 60 s reload. */
function reportProblems(problems: string[]): void {
  const text = problems.join("\n");
  if (text !== "" && text !== lastProblems) console.warn(`curated data problems:\n${text}`);
  lastProblems = text;
}

/** Forget the last logged problems (tests). */
export const resetCuratedProblemLog = (): void => {
  lastProblems = "";
};

/** The curated files, or nothing when there is no directory or it cannot be read. Problems are logged. */
function curatedOrNone(dir: (() => string) | undefined): Curated {
  if (!dir) return emptyCurated();
  try {
    return readCuratedDir(dir());
  } catch (err) {
    console.warn("curated data unavailable:", err instanceof Error ? err.message : err);
    return emptyCurated();
  }
}

/**
 * A memo of the quest catalog with a TTL. Concurrent callers share one load;
 * a failed load is not cached. With no quests the result is the empty shape
 * (level cap null too), so `quests.length > 0` means content is ready.
 */
export function createQuestCatalog(opts: {
  source: () => ContentSource | null;
  /** Directory of the curated files; absent means no curated data. Read inside the memo only. */
  curatedDir?: () => string;
  now?: () => number;
  ttlMs?: number;
}): { get(): Promise<QuestCatalog>; clear(): void } {
  const now = opts.now ?? Date.now;
  const ttl = opts.ttlMs ?? CATALOG_TTL_MS;
  let entry: { value: Promise<QuestCatalog>; expires: number } | null = null;

  async function build(): Promise<QuestCatalog> {
    const source = opts.source();
    if (!source) return EMPTY;
    const loaded = await loadQuests(source);
    if (loaded.length === 0) return EMPTY;
    const curated = curatedOrNone(opts.curatedDir);
    const applied = curated.links.length > 0 ? applyOverrides(loaded, curated.links) : { quests: loaded, problems: [] };
    const quests = applyBlizzardSides(applied.quests, curated.sides);
    reportProblems([...curated.problems, ...applied.problems]);
    const catalog: QuestCatalog = {
      quests,
      levelCap: await getLevelCap(source),
      mapNames: await loadMapNames(source, quests),
      professions: await professionsOrNone(source),
    };
    if (curated.tags.tags.length > 0) catalog.tags = buildTagIndex(curated.tags.tags);
    if (curated.zones.length > 0) catalog.zones = curated.zones;
    if (Object.keys(curated.names).length > 0) catalog.extraNames = curated.names;
    return catalog;
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

const processCatalog = createQuestCatalog({
  source: () => catalogSource(env().contentMode, getDb()),
  curatedDir: () => env().curatedDir ?? resolveCuratedDir(undefined),
});

/** Process-wide quest catalog, reloaded at most every 60 seconds. */
export const getQuestCatalog = (): Promise<QuestCatalog> => processCatalog.get();

/** Forget the process-wide catalog (tests). */
export const resetQuestCatalog = (): void => processCatalog.clear();
