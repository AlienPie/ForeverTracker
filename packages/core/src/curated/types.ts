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
  /** Races that can enter this zone's quests (a race-locked start zone such as Zephras Isle); absent or empty means any. */
  races?: string[];
};
export type Curated = {
  tags: CuratedTags;
  links: QuestLinkOverride[];
  zones: CuratedZone[];
  /** Quest side by id, from Blizzard's data (the mirror's side is often missing). */
  sides: Record<number, "Alliance" | "Horde">;
  /** Quest titles by id, from Blizzard's data, for ids the mirror does not know. */
  names: Record<number, string>;
  /** Blizzard's quests as read (see `synthesizeQuests`). */
  blizzard: import("./blizzard").BlizzardQuest[];
  problems: string[];
};

export function emptyCurated(): Curated {
  return { tags: { patch: null, capturedAt: null, tags: [] }, links: [], zones: [], sides: {}, names: {}, blizzard: [], problems: [] };
}
