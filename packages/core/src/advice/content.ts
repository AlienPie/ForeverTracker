import type { ContentSource } from "@ft/content";

/** Shapes below are verified against the real mirrored quests (see test/fixtures/quests.fixture.md). */
export type QuestLink = { questId: number; name: string; relation: string };
export type QuestEndpoint = {
  type: "npc" | "object" | "item" | null;
  id: number | null;
  name: string | null;
  location: { uiMapId: number; zone: string; x: number; y: number } | null;
};
export type QuestRow = {
  id: number;
  name: string;
  level: number;
  zone: { n: string; slug: string; m: number | null } | null;
  chain: {
    previous: QuestLink[];
    next: QuestLink[];
    questLine: { name: string; part: number; of: number; source: string } | null;
  };
  starts: QuestEndpoint | null;
  ends: QuestEndpoint | null;
};

const PAGE = 500;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isLinks = (v: unknown): boolean =>
  Array.isArray(v) && v.every((l) => isObj(l) && typeof l.questId === "number");

function isQuestRow(v: unknown): v is QuestRow {
  if (!isObj(v)) return false;
  if (typeof v.id !== "number" || typeof v.name !== "string") return false;
  if (typeof v.level !== "number" || !Number.isFinite(v.level)) return false;
  if (v.zone !== null && !(isObj(v.zone) && typeof v.zone.n === "string")) return false;
  if (!isObj(v.chain) || !isLinks(v.chain.previous) || !isLinks(v.chain.next)) return false;
  for (const e of [v.starts, v.ends]) if (e !== null && !isObj(e)) return false;
  return true;
}

/** All well-formed quests from the mirror (malformed rows, e.g. a null level, are dropped). */
export async function loadQuests(source: ContentSource): Promise<QuestRow[]> {
  const out: QuestRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = await source.list("quests", { limit: PAGE, offset });
    for (const row of page) if (isQuestRow(row)) out.push(row);
    if (page.length < PAGE) return out;
  }
}

/** Level cap from the mirrored `/meta` record; null when the mirror has none. */
export async function getLevelCap(source: ContentSource): Promise<number | null> {
  const meta = await source.get("meta", "current");
  return isObj(meta) && typeof meta.levelCap === "number" ? meta.levelCap : null;
}
