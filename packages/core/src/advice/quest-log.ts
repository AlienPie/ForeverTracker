import type { QuestRow } from "./content";

export type QuestLogRow = { questId: number; name: string; level: number | null; zone: string | null };
export type QuestLogPage = { rows: QuestLogRow[]; total: number; page: number; pages: number };

const DEFAULT_PAGE_SIZE = 50;
const clampInt = (v: number | undefined, min: number, max: number, fallback: number): number =>
  typeof v === "number" && !Number.isNaN(v) ? Math.min(max, Math.max(min, Math.trunc(v))) : fallback;

/**
 * One page of a quest id list (completed or in the log) for display. Ids missing from `quests`
 * are listed as "Quest <id>" with no level or zone. Sorted by level ascending (unknown last),
 * then name, then id. `query` is a case-insensitive plain-text substring match on the name.
 * `pageSize` defaults to 50 and is clamped to 10..200; `page` is clamped to the valid range.
 */
export function listQuestLog(
  quests: QuestRow[],
  ids: number[],
  opts: { query?: string; page?: number; pageSize?: number },
): QuestLogPage {
  const byId = new Map<number, QuestRow>();
  for (const x of quests) byId.set(x.id, x);

  const needle = (opts.query ?? "").trim().toLowerCase();
  const rows: QuestLogRow[] = [];
  for (const id of new Set(ids)) {
    const x = byId.get(id);
    const row: QuestLogRow = x
      ? { questId: id, name: x.name, level: x.level, zone: x.zone?.n ?? null }
      : { questId: id, name: `Quest ${id}`, level: null, zone: null };
    if (needle && !row.name.toLowerCase().includes(needle)) continue;
    rows.push(row);
  }
  rows.sort((a, b) => {
    if (a.level !== b.level) {
      if (a.level === null) return 1;
      if (b.level === null) return -1;
      return a.level - b.level;
    }
    return a.name < b.name ? -1 : a.name > b.name ? 1 : a.questId - b.questId;
  });

  const size = clampInt(opts.pageSize, 10, 200, DEFAULT_PAGE_SIZE);
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const page = clampInt(opts.page, 1, pages, 1);
  return { rows: rows.slice((page - 1) * size, page * size), total: rows.length, page, pages };
}
