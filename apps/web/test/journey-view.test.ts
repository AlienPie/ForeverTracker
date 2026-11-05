import { describe, expect, test } from "vitest";
import type { LevelPace, Route, Session, StoredEvent } from "@ft/core";
import {
  clockTime,
  dayLabel,
  eventsNote,
  firstReached,
  formatDuration,
  formatLevelTime,
  listJoin,
  MIN_BAR_PCT,
  paceView,
  professionsBefore,
  routeView,
  sessionHeading,
  sessionsNote,
  sessionSummary,
  stopLevels,
} from "../src/lib/journey-view";

const NOW = 1_800_000_000; // Fri 15 Jan 2027, 08:00 UTC
const DAY = 86_400;
const HOUR = 3600;

function session(over: Partial<Session> = {}): Session {
  return {
    start: NOW - HOUR,
    end: NOW,
    seconds: HOUR,
    levelFrom: null,
    levelTo: null,
    quests: 0,
    places: [],
    professions: [],
    events: [],
    ...over,
  };
}
const prof = (t: number, names: string): StoredEvent => ({ t, kind: "profession_changed", data: { count: 1, names } });
const names: Record<number, string> = { 10: "Dun Morogh", 20: "Loch Modan", 30: "Wetlands" };
const mapName = (id: number) => names[id] ?? `Map ${id}`;

describe("durations", () => {
  test("session lengths", () => {
    expect(formatDuration(60)).toBe("1 m");
    expect(formatDuration(45 * 60)).toBe("45 m");
    expect(formatDuration(65 * 60)).toBe("1 h 05 m");
    expect(formatDuration(2 * HOUR + 20 * 60 + 59)).toBe("2 h 20 m");
    expect(formatDuration(30)).toBe("less than a minute");
    expect(formatDuration(Number.NaN)).toBe("less than a minute");
  });

  test("time at a level, in words", () => {
    expect(formatLevelTime(0)).toBe("less than a minute");
    expect(formatLevelTime(59)).toBe("less than a minute");
    expect(formatLevelTime(60)).toBe("1 minute");
    expect(formatLevelTime(24 * 60)).toBe("24 minutes");
    expect(formatLevelTime(HOUR)).toBe("1 hour");
    expect(formatLevelTime(1.5 * HOUR)).toBe("1.5 hours");
    expect(formatLevelTime(2.14 * HOUR)).toBe("2.1 hours");
  });
});

describe("listJoin", () => {
  test("commas and a final and", () => {
    expect(listJoin([])).toBe("");
    expect(listJoin(["A"])).toBe("A");
    expect(listJoin(["A", "B"])).toBe("A and B");
    expect(listJoin(["A", "B", "C"])).toBe("A, B and C");
  });
});

describe("paceView", () => {
  const p = (level: number, seconds: number, complete = true): LevelPace => ({ level, seconds, complete });

  test("bars scaled to the longest level, slowest complete level and current level marked", () => {
    const v = paceView([p(1, HOUR), p(2, 2 * HOUR), p(3, 0.5 * HOUR, false)]);
    expect(v.bars.map((b) => [b.level, b.height, b.slow, b.now, b.gap])).toEqual([
      [1, 50, false, false, false],
      [2, 100, true, false, false],
      [3, 25, false, true, false],
    ]);
    expect(v.slowest).toBe(2);
    expect(v.current).toBe(3);
    expect(v.caption).toBe("Hours spent at each level. Level 2 took longest.");
    expect(v.label).toBe("Time per level: level 1, 1 hour; level 2, 2 hours; level 3 so far, 30 minutes.");
  });

  test("levels the model omits are gaps derived from the level sequence", () => {
    const v = paceView([p(4, HOUR), p(5, HOUR), p(8, HOUR, false)]);
    expect(v.bars.map((b) => b.level)).toEqual([4, 5, 6, 7, 8]);
    expect(v.bars.filter((b) => b.gap).map((b) => [b.level, b.height, b.seconds])).toEqual([
      [6, 0, null],
      [7, 0, null],
    ]);
    expect(v.label).toContain("level 6, not recorded; level 7, not recorded;");
  });

  test("a complete level of 0 seconds still gets a minimum bar and 'less than a minute'", () => {
    const v = paceView([p(1, 0), p(2, 2 * HOUR), p(3, 10, false)]);
    expect(v.bars[0]!.height).toBe(MIN_BAR_PCT);
    expect(v.bars[0]!.text).toBe("level 1, less than a minute");
    expect(v.bars[2]!.height).toBe(MIN_BAR_PCT);
    expect(v.bars[2]!.text).toBe("level 3 so far, less than a minute");
  });

  test("all zero: every bar at the minimum, no slowest level", () => {
    const v = paceView([p(1, 0), p(2, 0), p(3, 0, false)]);
    expect(v.bars.every((b) => b.height === MIN_BAR_PCT)).toBe(true);
    expect(v.slowest).toBeNull();
    expect(v.caption).toBe("Hours spent at each level.");
  });

  test("a single complete level is not called the slowest", () => {
    const v = paceView([p(7, HOUR), p(8, 2 * HOUR, false)]);
    expect(v.slowest).toBeNull();
  });

  test("empty pace: no bars", () => {
    expect(paceView([]).bars).toEqual([]);
  });

  test("many levels: only some level numbers are shown, the text alternative still lists all", () => {
    const pace = Array.from({ length: 40 }, (_, i) => p(i + 1, HOUR, i < 39));
    const v = paceView(pace);
    expect(v.bars).toHaveLength(40);
    const shown = v.bars.filter((b) => b.showLabel).map((b) => b.level);
    expect(shown).toContain(1);
    expect(shown).toContain(40);
    expect(shown.length).toBeLessThan(20);
    expect(v.label).toContain("level 23, 1 hour");
    // Few levels: every number is shown.
    expect(paceView([p(1, HOUR), p(2, HOUR, false)]).bars.every((b) => b.showLabel)).toBe(true);
  });
});

describe("session summary", () => {
  const ctx = (over: Partial<Parameters<typeof sessionSummary>[1]> = {}) => ({
    mapName,
    firstReached: new Map<number, number>(),
    professionsBefore: null,
    ...over,
  });

  test("the brief's example sentence", () => {
    const s = session({
      levelFrom: 11,
      levelTo: 13,
      quests: 9,
      places: [{ mapId: 20, subzone: "Thelsamar" }],
      events: [prof(NOW - 60, "Mining|Skinning")],
    });
    expect(
      sessionSummary(s, ctx({ firstReached: new Map([[20, NOW - 120]]), professionsBefore: ["Skinning"] })),
    ).toBe("Levels 11 to 13. Moved on to Loch Modan. Learned Mining. 9 quests handed in.");
  });

  test("singular forms and one level", () => {
    const s = session({ levelFrom: 6, levelTo: 7, quests: 1 });
    expect(sessionSummary(s, ctx())).toBe("Reached level 7. 1 quest handed in.");
  });

  test("new subzones of a zone reached earlier are 'explored', unnamed maps fall back to Map <id>", () => {
    const s = session({
      places: [
        { mapId: 10, subzone: "Kharanos" },
        { mapId: 10, subzone: "Gnomeregan" },
        { mapId: 99, subzone: "" },
      ],
    });
    // Map 10 was first reached a day earlier; 99 is new this session.
    const firsts = new Map([
      [10, NOW - DAY],
      [99, NOW - 30],
    ]);
    expect(sessionSummary(s, ctx({ firstReached: firsts }))).toBe("Moved on to Map 99. Explored more of Dun Morogh.");
  });

  test("many new zones are summed up", () => {
    const s = session({ places: [10, 20, 30, 40, 50].map((mapId) => ({ mapId, subzone: "" })) });
    const firsts = new Map([10, 20, 30, 40, 50].map((id) => [id, NOW - 60] as [number, number]));
    expect(sessionSummary(s, ctx({ firstReached: firsts }))).toBe(
      "Moved on to Dun Morogh, Loch Modan, Wetlands and 2 more places.",
    );
  });

  test("professions: learned, dropped, or listed when nothing earlier is known", () => {
    const s = session({ events: [prof(NOW - 10, "Mining"), prof(NOW - 20, "Mining|Herbalism")] });
    expect(sessionSummary(s, ctx({ professionsBefore: ["Herbalism", "Alchemy"] }))).toBe("Learned Mining. Dropped Herbalism and Alchemy.");
    expect(sessionSummary(s, ctx())).toBe("Professions: Mining.");
    expect(sessionSummary(s, ctx({ professionsBefore: ["Mining"] }))).toBe("Played for 1 h 00 m.");
  });

  test("nothing notable: the time played", () => {
    expect(sessionSummary(session({ seconds: 25 * 60 }), ctx())).toBe("Played for 25 m.");
  });
});

describe("professionsBefore and firstReached", () => {
  test("the newest list from older sessions, null when none is known", () => {
    const newest = session({ start: NOW - HOUR, events: [prof(NOW - HOUR, "Mining|Skinning")] });
    const middle = session({ start: NOW - 2 * DAY, events: [] });
    const oldest = session({ start: NOW - 3 * DAY, events: [prof(NOW - 3 * DAY + 5, "Skinning"), prof(NOW - 3 * DAY, "Herbalism")] });
    expect(professionsBefore([newest, middle, oldest])).toEqual([["Skinning"], ["Skinning"], null]);
    expect(professionsBefore([])).toEqual([]);
  });

  test("earliest time each map was reached, from visited places and session places", () => {
    const visited = [
      { mapId: 10, subzone: "A", firstSeen: NOW - 5 * DAY },
      { mapId: 10, subzone: "B", firstSeen: NOW - 6 * DAY },
      { mapId: 20, subzone: "", firstSeen: 1e20 },
    ];
    const s = session({
      start: NOW - 2 * DAY,
      events: [{ t: NOW - 2 * DAY, kind: "zone_first_visit", data: { mapId: 20, subzone: "" } }],
      places: [{ mapId: 20, subzone: "" }],
    });
    const m = firstReached(visited, [s]);
    expect(m.get(10)).toBe(NOW - 6 * DAY);
    expect(m.get(20)).toBe(NOW - 2 * DAY);
  });
});

describe("day labels and times", () => {
  test("relative day names in the given time zone", () => {
    expect(dayLabel(NOW - HOUR, NOW, "UTC")).toBe("Today");
    expect(dayLabel(NOW - DAY, NOW, "UTC")).toBe("Yesterday");
    expect(dayLabel(NOW - 2 * DAY, NOW, "UTC")).toBe("Wednesday");
    expect(dayLabel(NOW - 6 * DAY, NOW, "UTC")).toBe("Saturday");
    expect(dayLabel(NOW - 7 * DAY, NOW, "UTC")).toBe("8 Jan 2027");
    expect(dayLabel(NOW + 2 * DAY, NOW, "UTC")).toBe("17 Jan 2027");
    // 07:00 UTC on the 15th is 23:00 on the 14th in Los Angeles, and 10:00 UTC is 02:00 on the 15th there.
    expect(dayLabel(NOW - HOUR, NOW + 2 * HOUR, "UTC")).toBe("Today");
    expect(dayLabel(NOW - HOUR, NOW + 2 * HOUR, "America/Los_Angeles")).toBe("Yesterday");
  });

  test("clock times and headings", () => {
    expect(clockTime(NOW + 70 * 60, "UTC")).toBe("09:10");
    expect(sessionHeading(NOW + 70 * 60, NOW + 2 * HOUR, "UTC")).toBe("Today, 09:10");
  });

  test("implausible times give null instead of throwing", () => {
    for (const t of [1e20, -1e20, 0, -5, Number.NaN, Number.POSITIVE_INFINITY, 1e15]) {
      expect(dayLabel(t, NOW, "UTC")).toBeNull();
      expect(clockTime(t, "UTC")).toBeNull();
      expect(sessionHeading(t, NOW, "UTC")).toBeNull();
    }
    expect(dayLabel(NOW, Number.NaN, "UTC")).toBe("15 Jan 2027");
  });
});

describe("notes", () => {
  test("sessions note: newest N of M with a link, or all with a link back", () => {
    expect(sessionsNote(5, 5, false, "/c/g/journey")).toBeNull();
    expect(sessionsNote(5, 12, false, "/c/g/journey")).toEqual({
      text: "Showing the newest 5 of 12 sessions.",
      href: "/c/g/journey?all=1",
      linkText: "Show all sessions",
    });
    expect(sessionsNote(12, 12, true, "/c/g/journey")).toEqual({
      text: "Showing all 12 sessions.",
      href: "/c/g/journey",
      linkText: "Show only the newest",
    });
    expect(sessionsNote(200, 340, true, "/c/g/journey")).toEqual({
      text: "Showing the newest 200 of 340 sessions.",
      href: "/c/g/journey",
      linkText: "Show only the newest",
    });
  });

  test("events note only when the cap is hit", () => {
    expect(eventsNote(40, 40)).toBeNull();
    expect(eventsNote(3000, 3456)).toBe("Showing 3,000 of 3,456 events. The oldest sessions shown may be incomplete.");
  });
});

describe("routeView", () => {
  const stop = (mapId: number, levelFrom: number | null, levelTo: number | null, current = false) => ({
    mapId,
    name: mapName(mapId),
    firstSeen: NOW,
    levelFrom,
    levelTo,
    current,
  });

  test("stop level labels", () => {
    expect(stopLevels(stop(10, 1, 8))).toBe("levels 1 to 8");
    expect(stopLevels(stop(10, 8, 8))).toBe("level 8");
    expect(stopLevels(stop(10, null, 8))).toBe("up to level 8");
    expect(stopLevels(stop(10, 12, 14, true))).toBe("levels 12 to 14, now");
    expect(stopLevels(stop(10, null, null))).toBe("");
    expect(stopLevels(stop(10, null, null, true))).toBe("now");
  });

  const three: Route = {
    stops: [stop(10, 1, 8), stop(20, 8, 12), stop(30, 12, 14, true)],
    earlier: 0,
    markers: [
      { level: 5, t: 1, afterStop: 0 },
      { level: 8, t: 2, afterStop: 0 },
      { level: 12, t: 3, afterStop: 1 },
    ],
  };

  test("stops with labels on alternating outer sides, the current stop marked", () => {
    const v = routeView(three);
    expect(v.stops.map((s) => [s.name, s.when, s.side, s.current])).toEqual([
      ["Dun Morogh", "levels 1 to 8", "left", false],
      ["Loch Modan", "levels 8 to 12", "right", false],
      ["Wetlands", "levels 12 to 14, now", "left", true],
    ]);
    for (const s of v.stops) {
      // Labels sit outside the node, on the side away from the path.
      if (s.side === "left") expect(s.labelX).toBeLessThan(s.x - 9);
      else expect(s.labelX).toBeGreaterThan(s.x + 9);
      expect(s.labelX).toBeGreaterThanOrEqual(0);
      expect(s.labelX).toBeLessThanOrEqual(v.width);
    }
    expect(v.label).toBe(
      "Route, oldest first: Dun Morogh, levels 1 to 8; then Loch Modan, levels 8 to 12; then Wetlands, levels 12 to 14, where you are now.",
    );
    expect(v.lead).toBeNull();
    expect(v.path.startsWith("M")).toBe(true);
    expect(v.path).not.toContain("NaN");
  });

  test("level-up markers sit between their stop and the next, inside the box", () => {
    const v = routeView(three);
    expect(v.markers.map((m) => m.text)).toEqual(["5", "8", "12"]);
    const [a, b] = [v.stops[0]!, v.stops[1]!];
    for (const m of v.markers.slice(0, 2)) {
      expect(m.y).toBeGreaterThan(a.y);
      expect(m.y).toBeLessThan(b.y);
    }
    for (const m of v.markers) {
      expect(m.x).toBeGreaterThan(0);
      expect(m.x).toBeLessThan(v.width);
      expect(m.y).toBeLessThan(v.height);
    }
  });

  test("too many level-ups on one leg become one range marker", () => {
    const v = routeView({
      ...three,
      markers: [2, 3, 4, 5, 6, 7, 8].map((level, i) => ({ level, t: i, afterStop: 0 })),
    });
    expect(v.markers.map((m) => [m.text, m.title, m.range])).toEqual([["2–8", "levels 2 to 8", true]]);
  });

  test("level-ups after the current stop continue the path past it", () => {
    const v = routeView({ ...three, markers: [{ level: 14, t: 9, afterStop: 2 }] });
    expect(v.tail).not.toBeNull();
    expect(v.markers[0]!.y).toBeGreaterThan(v.stops[2]!.y);
    expect(v.markers[0]!.y).toBeLessThan(v.height);
  });

  test("earlier level-ups and dropped places are one cluster at the start, never drawn one by one", () => {
    const v = routeView({
      ...three,
      earlier: 3,
      markers: [
        { level: 2, t: 1, afterStop: -1 },
        { level: 3, t: 2, afterStop: -1 },
        { level: 4, t: 3, afterStop: -1 },
        { level: 5, t: 4, afterStop: 0 },
      ],
    });
    expect(v.markers.map((m) => m.text)).toEqual(["5"]);
    expect(v.lead).toMatchObject({ text: "3 earlier places, 3 level-ups" });
    expect(v.lead!.y).toBeLessThan(v.stops[0]!.y);
    expect(v.label).toContain("3 earlier places and 3 earlier level-ups are not drawn.");
  });

  test("lead text for level-ups only", () => {
    const v = routeView({ ...three, markers: [{ level: 2, t: 1, afterStop: -1 }] });
    expect(v.lead!.text).toBe("+1 earlier level-up");
  });

  test("long zone names are shortened on the strip, full in the title and text alternative", () => {
    const long = "The Exceedingly Long Named Vale";
    const v = routeView({ stops: [{ ...stop(10, 1, 2, true), name: long }], earlier: 0, markers: [] });
    expect(v.stops[0]!.name.length).toBeLessThanOrEqual(17);
    expect(v.stops[0]!.name.endsWith("…")).toBe(true);
    expect(v.stops[0]!.title).toBe(long);
    expect(v.label).toContain(long);
  });

  test("one stop and no stops stay finite", () => {
    const one = routeView({ stops: [stop(10, null, null, true)], earlier: 0, markers: [] });
    expect(one.stops).toHaveLength(1);
    expect(Number.isFinite(one.stops[0]!.x) && Number.isFinite(one.height)).toBe(true);
    expect(one.path).not.toContain("NaN");
    const none = routeView({ stops: [], earlier: 0, markers: [] });
    expect(none.stops).toEqual([]);
    expect(none.markers).toEqual([]);
  });
});
