/** Curated data collected by the owner (see data/curated/*.json). All of it is optional: absent means "nothing known". */
export type QuestTagKind = "class" | "race" | "profession";
export type QuestTag = { questId: number; kind: QuestTagKind; value: string };
export type CuratedTags = { patch: string | null; capturedAt: string | null; tags: QuestTag[] };
/** Quest `to` can follow quest `from`. */
export type QuestLinkOverride = { from: number; to: number; note: string | null };
export type CuratedTerritory = "Alliance" | "Horde" | "Contested" | "Sanctuary";
export type CuratedZoneType = "zone" | "dungeon" | "raid" | "battleground";
export type CuratedZone = {
  name: string;
  minLevel: number | null;
  maxLevel: number | null;
  territory: CuratedTerritory | null;
  type: CuratedZoneType;
};
export type Curated = { tags: CuratedTags; links: QuestLinkOverride[]; zones: CuratedZone[]; problems: string[] };

export function emptyCurated(): Curated {
  return { tags: { patch: null, capturedAt: null, tags: [] }, links: [], zones: [], problems: [] };
}
