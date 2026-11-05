/** Journey tab helpers: event sentences and places. Pure, and never throw on odd data. */

export type JourneyEvent = { t: number; kind: string; text: string };
export type Place = { mapId: number; name: string; subzones: string[]; firstSeen: number };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const posInt = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null);
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Zone name for a uiMapId, or "Map <id>" when the mirror cannot name it. */
export function mapName(mapId: number, names: Record<number, string>): string {
  return names[mapId] ?? `Map ${mapId}`;
}

/**
 * One human sentence per event (kinds and data from docs/addon-contract.md):
 * `level_up {level}`, `quest_turned_in {questId}`, `zone_first_visit {mapId, subzone}`,
 * `profession_changed {count, names}` with names joined by "|". Unknown kinds show the kind itself.
 */
export function eventSentence(
  ev: { t: number; kind: string; data: unknown },
  questNames: Map<number, string>,
  mapNames: Record<number, string>,
): string {
  const d = isObj(ev.data) ? ev.data : {};
  switch (ev.kind) {
    case "level_up": {
      const level = posInt(d.level);
      return level === null ? "Gained a level" : `Reached level ${level}`;
    }
    case "quest_turned_in": {
      const id = posInt(d.questId);
      if (id === null) return "Completed a quest";
      const name = questNames.get(id);
      return name ? `Completed ${name}` : `Completed quest ${id}`;
    }
    case "zone_first_visit": {
      const id = posInt(d.mapId);
      const sub = text(d.subzone);
      if (id === null) return sub ? `First visit to ${sub}` : "Visited a new place";
      const zone = mapName(id, mapNames);
      return sub && sub !== zone ? `First visit to ${sub}, ${zone}` : `First visit to ${zone}`;
    }
    case "profession_changed": {
      const names = typeof d.names === "string" ? d.names.split("|").map((n) => n.trim()).filter(Boolean) : [];
      return names.length > 0 ? `Professions now: ${names.join(", ")}` : "Professions changed";
    }
    default:
      return ev.kind;
  }
}

/** Events as sentences, newest first. */
export function journeyEvents(
  events: { t: number; kind: string; data: unknown }[],
  questNames: Map<number, string>,
  mapNames: Record<number, string>,
): JourneyEvent[] {
  return [...events]
    .sort((a, b) => b.t - a.t)
    .map((e) => ({ t: e.t, kind: e.kind, text: eventSentence(e, questNames, mapNames) }));
}

/**
 * Visited places grouped by map: the zone name (or "Map <id>"), its named
 * subzones in first-seen order, and the earliest first-seen time. Most recently
 * discovered map first.
 */
export function groupPlaces(
  visited: { mapId: number; subzone: string; firstSeen: number }[],
  mapNames: Record<number, string>,
): Place[] {
  const byMap = new Map<number, Place>();
  for (const v of [...visited].sort((a, b) => a.firstSeen - b.firstSeen)) {
    let p = byMap.get(v.mapId);
    if (!p) byMap.set(v.mapId, (p = { mapId: v.mapId, name: mapName(v.mapId, mapNames), subzones: [], firstSeen: v.firstSeen }));
    const sub = text(v.subzone);
    if (sub && sub !== p.name && !p.subzones.includes(sub)) p.subzones.push(sub);
  }
  return [...byMap.values()].sort((a, b) => b.firstSeen - a.firstSeen || a.mapId - b.mapId);
}
