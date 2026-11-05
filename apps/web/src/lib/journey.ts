/** Journey tab helpers: event sentences and places. Pure, and never throw on odd data. */

/** `iso` (for `<time datetime>`) and `when` (display, UTC) are null for an implausible time. */
export type JourneyEvent = { t: number; kind: string; text: string; iso: string | null; when: string | null };
/** `since` is the first-seen day (UTC), null for an implausible time. */
export type Place = { mapId: number; name: string; subzones: string[]; firstSeen: number; since: string | null };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const posInt = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null);
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/**
 * A unix time (seconds) as a Date, or null when it is not a plausible game time.
 * Ingest keeps any finite number, so a corrupt upload can carry 1e20 or a
 * negative time; `toISOString` throws on those, so they never reach formatting.
 */
function plausibleDate(t: number): Date | null {
  if (!Number.isFinite(t) || t <= 0) return null;
  const d = new Date(t * 1000);
  return Number.isFinite(d.getTime()) && d.getUTCFullYear() < 10000 ? d : null;
}

/** "5 Nov 2026, 07:55" (UTC) and the ISO string, or nulls for an implausible time. */
export function formatEventTime(t: number): { iso: string | null; when: string | null } {
  const d = plausibleDate(t);
  if (!d) return { iso: null, when: null };
  const when = d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
  return { iso: d.toISOString(), when };
}

/** "5 Nov 2026" (UTC), or null for an implausible time. */
export function formatDay(t: number): string | null {
  const d = plausibleDate(t);
  return d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : null;
}

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
    .map((e) => ({ t: e.t, kind: e.kind, text: eventSentence(e, questNames, mapNames), ...formatEventTime(e.t) }));
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
    if (!p) {
      p = { mapId: v.mapId, name: mapName(v.mapId, mapNames), subzones: [], firstSeen: v.firstSeen, since: formatDay(v.firstSeen) };
      byMap.set(v.mapId, p);
    }
    const sub = text(v.subzone);
    if (sub && sub !== p.name && !p.subzones.includes(sub)) p.subzones.push(sub);
  }
  return [...byMap.values()].sort((a, b) => b.firstSeen - a.firstSeen || a.mapId - b.mapId);
}
