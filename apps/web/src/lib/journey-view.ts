/**
 * Display data for the Journey tab: session headings and summaries, the pace
 * strip and the route strip. Pure (no server imports, so the page can reuse the
 * time helpers in the browser), and never throws on odd data.
 */
import type { LevelPace, Route, RouteStop, Session, StoredEvent } from "@ft/core";
import { formatDay, plausibleDate } from "./journey";
import { routeLayout, type Point } from "./route-layout";

/** Sessions shown without `?all=1`, and the most shown with it. */
export const DEFAULT_SESSIONS = 5;
export const MAX_SESSIONS = 200;
/** Event lines listed per session card; the rest are counted. */
export const MAX_SESSION_EVENTS = 100;
/** Smallest bar height (percent of the strip) for a level that has a value, even 0 seconds. */
export const MIN_BAR_PCT = 4;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;

// ---------------------------------------------------------------- durations

/** A session length: "45 m", "1 h 05 m"; "less than a minute" below 60 seconds. */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 60) return "less than a minute";
  const minutes = Math.floor(seconds / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h} h ${String(m).padStart(2, "0")} m` : `${m} m`;
}

/** Time at a level in words: "less than a minute", "24 minutes", "1 hour", "2.1 hours". */
export function formatLevelTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 60) return "less than a minute";
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    return m === 1 ? "1 minute" : `${m} minutes`;
  }
  const h = Math.round(seconds / 360) / 10;
  return h === 1 ? "1 hour" : `${h} hours`;
}

/** "A", "A and B", "A, B and C". */
export function listJoin(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

// ---------------------------------------------------------------- pace strip

export type PaceBar = {
  level: number;
  /** null for a gap: a level whose time is not known (its next level-up is missing) */
  seconds: number | null;
  complete: boolean;
  gap: boolean;
  /** percent of the strip height; 0 for a gap, at least {@link MIN_BAR_PCT} otherwise */
  height: number;
  slow: boolean;
  now: boolean;
  /** "level 3, 24 minutes", "level 6 so far, 1.5 hours", "level 4, not recorded" */
  text: string;
  /** whether the level number is printed under the bar (all of them for up to 20 levels) */
  showLabel: boolean;
};
export type PaceView = { bars: PaceBar[]; slowest: number | null; current: number | null; label: string; caption: string };

/** The longest level range drawn; wider ranges (corrupt data) keep only the known levels. */
const MAX_PACE_SLOTS = 200;

/**
 * Bars from the lowest to the highest level in `pace` (ascending, from `levelPace`),
 * with gaps for the levels in between that the model omits. Heights are scaled
 * to the longest level. The slowest complete level is marked when there are at
 * least two complete levels and it took any time; the incomplete level is "now".
 */
export function paceView(pace: LevelPace[]): PaceView {
  const known = (Array.isArray(pace) ? pace : []).filter(
    (p) => Number.isInteger(p.level) && p.level > 0 && Number.isFinite(p.seconds) && p.seconds >= 0,
  );
  if (known.length === 0) return { bars: [], slowest: null, current: null, label: "", caption: "" };
  const byLevel = new Map(known.map((p) => [p.level, p]));
  const lo = Math.min(...known.map((p) => p.level));
  const hi = Math.max(...known.map((p) => p.level));
  const levels =
    hi - lo < MAX_PACE_SLOTS ? Array.from({ length: hi - lo + 1 }, (_, i) => lo + i) : [...byLevel.keys()].sort((a, b) => a - b);

  const longest = Math.max(...known.map((p) => p.seconds));
  const complete = known.filter((p) => p.complete);
  const slowSeconds = Math.max(0, ...complete.map((p) => p.seconds));
  const slowest = complete.length >= 2 && slowSeconds > 0 ? complete.find((p) => p.seconds === slowSeconds)!.level : null;
  const current = known.find((p) => !p.complete)?.level ?? null;
  const few = levels.length <= 20;

  const bars = levels.map((level): PaceBar => {
    const p = byLevel.get(level);
    const showLabel = few || level === lo || level === hi || level % 5 === 0;
    if (!p) {
      return { level, seconds: null, complete: false, gap: true, height: 0, slow: false, now: false, text: `level ${level}, not recorded`, showLabel };
    }
    const scaled = longest > 0 ? Math.round((p.seconds / longest) * 1000) / 10 : 0;
    return {
      level,
      seconds: p.seconds,
      complete: p.complete,
      gap: false,
      height: Math.max(MIN_BAR_PCT, scaled),
      slow: level === slowest,
      now: !p.complete,
      text: `level ${level}${p.complete ? "" : " so far"}, ${formatLevelTime(p.seconds)}`,
      showLabel,
    };
  });

  return {
    bars,
    slowest,
    current,
    label: `Time per level: ${bars.map((b) => b.text).join("; ")}.`,
    caption: slowest === null ? "Hours spent at each level." : `Hours spent at each level. Level ${slowest} took longest.`,
  };
}

// ---------------------------------------------------------------- sessions

/** The professions list of a session's newest `profession_changed` event, or null without one. */
export function professionsAfter(s: { events: StoredEvent[] }): string[] | null {
  for (const e of s.events) {
    if (e.kind !== "profession_changed" || !isObj(e.data) || typeof e.data.names !== "string") continue;
    return [...new Set(e.data.names.split("|").map((n) => n.trim()).filter(Boolean))];
  }
  return null;
}

/**
 * For each session (newest first), the professions known before it: the list
 * from the newest older session that recorded one, or null when none did.
 */
export function professionsBefore(sessions: Session[]): (string[] | null)[] {
  const out: (string[] | null)[] = new Array(sessions.length).fill(null);
  let known: string[] | null = null;
  for (let i = sessions.length - 1; i >= 0; i--) {
    out[i] = known;
    known = professionsAfter(sessions[i]!) ?? known;
  }
  return out;
}

/** The earliest plausible time each map was reached, from visited places and `zone_first_visit` events. */
export function firstReached(
  visited: { mapId: number; firstSeen: number }[],
  sessions: Session[],
): Map<number, number> {
  const out = new Map<number, number>();
  const note = (mapId: unknown, t: number) => {
    if (typeof mapId !== "number" || !Number.isInteger(mapId) || mapId < 0 || !plausibleDate(t)) return;
    const prev = out.get(mapId);
    if (prev === undefined || t < prev) out.set(mapId, t);
  };
  for (const v of visited) note(v.mapId, v.firstSeen);
  for (const s of sessions) {
    for (const e of s.events) if (e.kind === "zone_first_visit" && isObj(e.data)) note(e.data.mapId, e.t);
  }
  return out;
}

export type SummaryContext = {
  mapName: (mapId: number) => string;
  /** see {@link firstReached}: a map first reached during the session counts as "moved on to" */
  firstReached: ReadonlyMap<number, number>;
  /** see {@link professionsBefore} */
  professionsBefore: string[] | null;
};

/** Up to three names, then "and N more places". */
function someNames(names: string[]): string {
  if (names.length <= 3) return listJoin(names);
  return listJoin([...names.slice(0, 3), plural(names.length - 3, "more place", "more places")]);
}

/**
 * One line about a session, from its fields: levels, zones reached for the first
 * time ("Moved on to") or explored further, profession changes and quests handed
 * in, leaving out what did not happen. With nothing to say, the time played.
 */
export function sessionSummary(s: Session, ctx: SummaryContext): string {
  const parts: string[] = [];
  if (s.levelTo !== null) {
    parts.push(s.levelFrom !== null && s.levelTo - s.levelFrom >= 2 ? `Levels ${s.levelFrom} to ${s.levelTo}.` : `Reached level ${s.levelTo}.`);
  }

  const maps = [...new Set(s.places.map((p) => p.mapId))];
  const isNew = (id: number) => {
    const t = ctx.firstReached.get(id);
    return t === undefined || (t >= s.start && t <= s.end);
  };
  const moved = maps.filter(isNew).map(ctx.mapName);
  const explored = maps.filter((id) => !isNew(id)).map(ctx.mapName);
  if (moved.length > 0) parts.push(`Moved on to ${someNames(moved)}.`);
  if (explored.length > 0) parts.push(`Explored more of ${someNames(explored)}.`);

  const after = professionsAfter(s);
  if (after !== null) {
    const before = ctx.professionsBefore;
    if (before === null) {
      if (after.length > 0) parts.push(`Professions: ${listJoin(after)}.`);
    } else {
      const learned = after.filter((n) => !before.includes(n));
      const dropped = before.filter((n) => !after.includes(n));
      if (learned.length > 0) parts.push(`Learned ${listJoin(learned)}.`);
      if (dropped.length > 0) parts.push(`Dropped ${listJoin(dropped)}.`);
    }
  }

  if (s.quests > 0) parts.push(`${plural(s.quests, "quest", "quests")} handed in.`);
  return parts.length > 0 ? parts.join(" ") : `Played for ${formatDuration(s.seconds)}.`;
}

export type SessionEventView = { t: number; iso: string | null; time: string; text: string };
export type SessionView = {
  /** start, unix seconds */
  t: number;
  /** "Today, 09:10 UTC": rendered by the server in UTC; the page rewrites it in the browser's zone */
  heading: string;
  duration: string;
  summary: string;
  /** the newest session starts open */
  open: boolean;
  /** newest first, at most {@link MAX_SESSION_EVENTS} */
  events: SessionEventView[];
  /** events of the session not listed */
  moreEvents: number;
};

// ---------------------------------------------------------------- times

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** The calendar day of `d` in `timeZone` as days since the epoch, and its weekday. */
function calendarDay(d: Date, timeZone: string | undefined): { day: number; weekday: number } | null {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "numeric", day: "numeric" }).formatToParts(d);
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    const utc = Date.UTC(get("year"), get("month") - 1, get("day"));
    if (!Number.isFinite(utc)) return null;
    return { day: Math.round(utc / 86_400_000), weekday: new Date(utc).getUTCDay() };
  } catch {
    return null;
  }
}

/**
 * "Today", "Yesterday", a weekday name within the last week, else "8 Jan 2027",
 * for the day of `t` in `timeZone` (the browser's when undefined) as seen at
 * `now` (unix seconds). Null for an implausible `t`.
 */
export function dayLabel(t: number, now: number, timeZone?: string): string | null {
  const d = plausibleDate(t);
  if (!d) return null;
  const n = plausibleDate(now);
  const day = calendarDay(d, timeZone);
  const today = n ? calendarDay(n, timeZone) : null;
  if (day && today) {
    const diff = today.day - day.day;
    if (diff === 0) return "Today";
    if (diff === 1) return "Yesterday";
    if (diff > 1 && diff < 7) return WEEKDAYS[day.weekday]!;
  }
  try {
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone });
  } catch {
    return formatDay(t);
  }
}

/** "09:10" (24-hour) in `timeZone` (the browser's when undefined), or null for an implausible time. */
export function clockTime(t: number, timeZone?: string): string | null {
  const d = plausibleDate(t);
  if (!d) return null;
  const opts: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", hourCycle: "h23" };
  try {
    return d.toLocaleTimeString("en-GB", { ...opts, timeZone });
  } catch {
    return d.toLocaleTimeString("en-GB", { ...opts, timeZone: "UTC" });
  }
}

/** "Today, 09:10": a session card's heading, or null for an implausible time. */
export function sessionHeading(t: number, now: number, timeZone?: string): string | null {
  const day = dayLabel(t, now, timeZone);
  const time = clockTime(t, timeZone);
  return day && time ? `${day}, ${time}` : null;
}

// ---------------------------------------------------------------- notes

export type SessionsNote = { text: string; href: string; linkText: string };

/** The line under the session cards, with a link to all sessions or back to the newest. */
export function sessionsNote(shown: number, total: number, all: boolean, path: string): SessionsNote | null {
  if (!all) {
    if (total <= shown) return null;
    return { text: `Showing the newest ${shown} of ${total} sessions.`, href: `${path}?all=1`, linkText: "Show all sessions" };
  }
  if (total <= DEFAULT_SESSIONS) return null;
  return {
    text: shown >= total ? `Showing all ${total} sessions.` : `Showing the newest ${shown} of ${total} sessions.`,
    href: path,
    linkText: "Show only the newest",
  };
}

/** Said when the event read hit its cap (`shown >= cap`), else null: skipped malformed rows alone say nothing. */
export function eventsNote(shown: number, total: number, cap: number): string | null {
  if (!(total > shown) || shown < cap) return null;
  const n = (v: number) => v.toLocaleString("en-GB");
  return `Showing ${n(shown)} of ${n(total)} events. The oldest sessions shown may be incomplete.`;
}

// ---------------------------------------------------------------- route strip

export const ROUTE_WIDTH = 400;
/** Vertical distance between stops. */
const ROUTE_STEP = 66;
/** Extra room above the first stop for the earlier-places cluster. */
const LEAD_ROOM = 36;
const NODE_R = 9;
const LABEL_GAP = 16;
const MAX_NAME = 17;
/** Level-up seals that fit on one leg; more become one range marker. */
const MARKERS_PER_LEG = 2;

export type RouteStopView = {
  key: string;
  x: number;
  y: number;
  /** shortened to fit the strip; `title` is the full name */
  name: string;
  title: string;
  when: string;
  side: "left" | "right";
  labelX: number;
  nameY: number;
  whenY: number;
  current: boolean;
};
export type RouteMarkerView = { key: string; x: number; y: number; text: string; title: string; range: boolean; width: number };
export type RouteLead = { x: number; y: number; width: number; text: string; title: string };
export type RouteView = {
  width: number;
  height: number;
  path: string;
  stops: RouteStopView[];
  markers: RouteMarkerView[];
  /** where the path ends past the current stop when level-ups happened there */
  tail: Point | null;
  /** one cluster for dropped places and level-ups before the first stop drawn */
  lead: RouteLead | null;
  /** text alternative for the whole strip */
  label: string;
};

/** "levels 1 to 8", "level 8", "up to level 8", with ", now" for the current stop; "" when no level is known. */
export function stopLevels(stop: Pick<RouteStop, "levelFrom" | "levelTo" | "current">): string {
  const a = stop.levelFrom;
  const b = stop.levelTo ?? stop.levelFrom;
  // No level when first seen (before the first recorded level-up): "up to level 8".
  const base = b === null ? "" : a === null ? `up to level ${b}` : a === b ? `level ${a}` : `levels ${a} to ${b}`;
  if (!stop.current) return base;
  return base ? `${base}, now` : "now";
}

const shorten = (name: string) => (name.length > MAX_NAME ? `${name.slice(0, MAX_NAME - 1).trimEnd()}…` : name);
/** Rough text width at the strip's 12px label size: enough to size a pill around it. */
const textWidth = (text: string) => Math.ceil(text.length * 6.6);
const r1 = (v: number) => Math.round(v * 10) / 10;

/** A point on the S-curve leg between `a` and `b` (vertical tangents at both ends). */
function onLeg(a: Point, b: Point, t: number): Point {
  const d = (b.y - a.y) / 2;
  const p = [a, { x: a.x, y: a.y + d }, { x: b.x, y: b.y - d }, b];
  const u = 1 - t;
  const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  return { x: r1(w.reduce((s, k, i) => s + k * p[i]!.x, 0)), y: r1(w.reduce((s, k, i) => s + k * p[i]!.y, 0)) };
}

/**
 * The route strip: stops placed by {@link routeLayout} down an S-curve, labels
 * on the outer side of each stop (away from the path), level-up seals on the
 * leg after the stop where they happened (a range marker when more than two
 * share a leg), and a path tail past the current stop when it has level-ups.
 * Level-ups before the first stop drawn (`afterStop: -1`) and dropped places
 * are one "lead" cluster above the first stop, never drawn one by one.
 */
export function routeView(route: Route): RouteView {
  const stops = Array.isArray(route?.stops) ? route.stops : [];
  const n = stops.length;
  const empty: RouteView = { width: ROUTE_WIDTH, height: 0, path: "", stops: [], markers: [], tail: null, lead: null, label: "No places recorded yet." };
  if (n === 0) return empty;

  const markers = Array.isArray(route.markers) ? route.markers : [];
  const earlier = Number.isInteger(route.earlier) && route.earlier > 0 ? route.earlier : 0;
  const before = markers.filter((m) => !(Number.isInteger(m.afterStop) && m.afterStop >= 0 && m.afterStop < n));
  const legs = new Map<number, number[]>();
  for (const m of markers) {
    if (!before.includes(m)) legs.set(m.afterStop, [...(legs.get(m.afterStop) ?? []), m.level]);
  }
  const hasTail = legs.has(n - 1);
  const hasLead = earlier > 0 || before.length > 0;

  const k = n + (hasTail ? 1 : 0);
  const box = k === 1 ? 100 : 80 + (k - 1) * ROUTE_STEP;
  const top = hasLead ? LEAD_ROOM : 0;
  const pts = routeLayout(k, ROUTE_WIDTH, box).map((p) => ({ x: r1(p.x), y: r1(p.y + top) }));
  const height = box + top;

  let path = "";
  if (hasLead) path += `M${pts[0]!.x} 6 L${pts[0]!.x} ${pts[0]!.y}`;
  else path += `M${pts[0]!.x} ${pts[0]!.y}`;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const d = r1((b.y - a.y) / 2);
    path += ` C${a.x} ${r1(a.y + d)} ${b.x} ${r1(b.y - d)} ${b.x} ${b.y}`;
  }

  const stopViews = stops.map((s, i): RouteStopView => {
    const p = pts[i]!;
    const side = p.x < ROUTE_WIDTH / 2 ? "left" : "right";
    const when = stopLevels(s);
    return {
      key: `${s.mapId}`,
      x: p.x,
      y: p.y,
      name: shorten(s.name),
      title: s.name,
      when,
      side,
      labelX: side === "left" ? p.x - LABEL_GAP : p.x + LABEL_GAP,
      nameY: when ? p.y - 2 : p.y + 5,
      whenY: p.y + 14,
      current: s.current,
    };
  });

  const markerViews: RouteMarkerView[] = [];
  for (const [leg, levels] of [...legs.entries()].sort((a, b) => a[0] - b[0])) {
    const a = pts[leg]!;
    const b = pts[leg + 1]!;
    if (levels.length <= MARKERS_PER_LEG) {
      levels.forEach((level, j) => {
        const p = onLeg(a, b, (j + 1) / (levels.length + 1));
        markerViews.push({ key: `l${level}`, ...p, text: `${level}`, title: `Reached level ${level}`, range: false, width: 2 * NODE_R });
      });
    } else {
      const lo = Math.min(...levels);
      const hi = Math.max(...levels);
      const text = `${lo}–${hi}`;
      markerViews.push({ key: `r${lo}`, ...onLeg(a, b, 0.5), text, title: `levels ${lo} to ${hi}`, range: true, width: textWidth(text) + 14 });
    }
  }

  const placesText = earlier > 0 ? plural(earlier, "earlier place", "earlier places") : "";
  let lead: RouteLead | null = null;
  let leadSentence = "";
  if (hasLead) {
    const ups = before.length;
    const text =
      earlier > 0 && ups > 0
        ? `${placesText}, ${plural(ups, "level-up", "level-ups")}`
        : earlier > 0
          ? placesText
          : `+${plural(ups, "earlier level-up", "earlier level-ups")}`;
    const said = [placesText, ups > 0 ? plural(ups, "earlier level-up", "earlier level-ups") : ""].filter(Boolean);
    const many = said.length > 1 || earlier + ups > 1;
    leadSentence = ` ${listJoin(said)} ${many ? "are" : "is"} not drawn.`;
    const width = Math.min(ROUTE_WIDTH - 16, textWidth(text) + 20);
    const x = Math.min(Math.max(8, pts[0]!.x - width / 2), ROUTE_WIDTH - 8 - width);
    lead = { x: r1(x), y: r1(pts[0]!.y - 34), width, text, title: leadSentence.trim() };
  }

  const aria = stops
    .map((s, i) => {
      const levels = stopLevels({ ...s, current: false });
      const bits = [s.name, levels, s.current ? "where you are now" : ""].filter(Boolean).join(", ");
      return i === 0 ? bits : `then ${bits}`;
    })
    .join("; ");

  return {
    width: ROUTE_WIDTH,
    height,
    path,
    stops: stopViews,
    markers: markerViews,
    tail: hasTail ? pts[pts.length - 1]! : null,
    lead,
    label: `Route, oldest first: ${aria}.${leadSentence}`,
  };
}
