import { characterEvent, contentRecord, openDb, type Db } from "@ft/db";
import { ingestSavedVariables } from "@ft/core";
import { render } from "svelte/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  db: null as unknown,
  e: { contentMode: "mirror" as "mirror" | "on-demand", ownerPassword: null as string | null, sessionSecret: null as string | null },
}));
vi.mock("../src/lib/server/db", () => ({ getDb: () => state.db }));
vi.mock("../src/lib/server/env", () => ({ env: () => state.e }));

import { load, type JourneyPageData } from "../src/routes/c/[guid]/journey/+page.server";
import JourneyPage from "../src/routes/c/[guid]/journey/+page.svelte";
import { resetQuestCatalog } from "../src/lib/server/content";

const NOW = 1_800_000_000; // Fri 15 Jan 2027, 08:00 UTC
const HOUR = 3600;
const DAY = 86_400;
// Invented characters only.
const HERO = "Player-7777-0000E001";
const BARE = "Player-7777-0000E002";
const QUIET = "Player-7777-0000E003";
const ODD = "Player-7777-0000E004";
const UNKNOWN = "Player-7777-0000EFFF";

const T0 = NOW - 3 * DAY; // Tue 12 Jan, 08:00
const T1 = NOW - 12 * HOUR; // Thu 14 Jan, 20:00
const T2 = NOW - 2 * HOUR; // Fri 15 Jan, 06:00

const FIXTURE = `ForeverTrackerDB = { schema = 1, characters = {
  ["${HERO}"] = {
    snapshot = { takenAt = ${NOW - HOUR},
      identity = { name = "Bramblewick", class = "SHAMAN", race = "Dwarf", level = 6 },
      progress = { professions = {}, questsCompleted = { 9101 }, questLog = {} } },
    events = {
      { t = ${T0}, kind = "level_up", data = { level = 2 } },
      { t = ${T0 + 60}, kind = "zone_first_visit", data = { mapId = 1426, subzone = "Coldridge Valley" } },
      { t = ${T0 + 600}, kind = "quest_turned_in", data = { questId = 9101 } },
      { t = ${T0 + 1200}, kind = "level_up", data = { level = 3 } },
      { t = ${T0 + 1500}, kind = "dance_party", data = { odd = true } },
      { t = ${T1}, kind = "quest_turned_in", data = { questId = 9102 } },
      { t = ${T1 + 600}, kind = "level_up", data = { level = 4 } },
      { t = ${T1 + 1200}, kind = "zone_first_visit", data = { mapId = 1432, subzone = "Thelsamar" } },
      { t = ${T1 + 1500}, kind = "profession_changed", data = { count = 1, names = "Mining" } },
      { t = ${T1 + 2000}, kind = "quest_turned_in", data = { questId = 9103 } },
      { t = ${T2}, kind = "dance_party", data = {} },
      { t = ${T2 + 300}, kind = "level_up", data = { level = 6 } },
      { t = ${T2 + 600}, kind = "quest_turned_in", data = { questId = 424242 } },
      { t = ${T2 + 900}, kind = "zone_first_visit", data = { mapId = 9999, subzone = "" } },
      { t = ${NOW - 10 * DAY}, kind = "dance_party", data = {} },
      { t = ${NOW - 10 * DAY - HOUR}, kind = "dance_party", data = {} },
      { t = ${NOW - 10 * DAY - 2 * HOUR}, kind = "dance_party", data = {} },
      { t = ${NOW - 10 * DAY - 3 * HOUR}, kind = "dance_party", data = {} },
    },
    visited = {
      ["1426:Coldridge Valley"] = { mapId = 1426, subzone = "Coldridge Valley", firstSeen = ${T0 + 60} },
      ["1432:Thelsamar"] = { mapId = 1432, subzone = "Thelsamar", firstSeen = ${T1 + 1200} },
      ["9999:"] = { mapId = 9999, subzone = "", firstSeen = ${T2 + 900} },
    },
  },
  ["${BARE}"] = {
    snapshot = { takenAt = ${NOW - HOUR}, identity = { name = "Quillon", class = "PRIEST", race = "Human", level = 1 } },
    visited = {},
  },
  ["${QUIET}"] = {
    snapshot = { takenAt = ${NOW - HOUR}, identity = { name = "Fenwhistle", class = "MAGE", race = "Gnome", level = 3 } },
    events = { { t = ${NOW - HOUR}, kind = "quest_turned_in", data = { questId = 9101 } } },
  },
  ["${ODD}"] = {
    snapshot = { takenAt = ${NOW}, identity = { name = "Tamberlo", class = "MAGE", race = "Gnome", level = 8 } },
    events = {
      { t = 1e20, kind = "level_up", data = { level = 8 } },
      { t = -1e20, kind = "level_up", data = { level = 2 } },
      { t = ${NOW - HOUR}, kind = "level_up", data = { level = 7 } },
    },
    visited = { ["1426:"] = { mapId = 1426, subzone = "", firstSeen = 1e20 } },
  },
} }`;

function putContent(db: Db, resource: string, id: string, data: unknown) {
  db.insert(contentRecord).values({ resource, id, build: "1.0", data: JSON.stringify(data), fetchedAt: NOW }).run();
}
const quest = (id: number, name: string) => ({
  id,
  name,
  level: 2,
  zone: { n: "Dun Morogh", slug: "dun-morogh", m: 1426 },
  chain: { previous: [], next: [], questLine: null },
  starts: null,
  ends: null,
});

function seeded(withContent = true): Db {
  const db = openDb(":memory:");
  ingestSavedVariables(db, FIXTURE, () => NOW);
  if (withContent) {
    putContent(db, "meta", "current", { build: "1.0", levelCap: 60 });
    putContent(db, "zones", "1426", { id: 1426, name: "Dun Morogh", type: 3, parentId: 1415 });
    putContent(db, "zones", "1432", { id: 1432, name: "Loch Modan", type: 3, parentId: 1415 });
    putContent(db, "quests", "9101", quest(9101, "Frosty Errand"));
    putContent(db, "quests", "9102", quest(9102, "Ram Wrangling"));
    putContent(db, "quests", "9103", quest(9103, "Lost Pickaxe"));
  }
  return db;
}

const ev = (guid: string, query = "") =>
  ({ params: { guid }, url: new URL(`http://localhost/c/${guid}/journey${query}`) }) as never;
const run = async (guid: string, query = "") => (await load(ev(guid, query))) as JourneyPageData;
const html = (data: JourneyPageData) => render(JourneyPage, { props: { data } }).body.replace(/<!--.*?-->/g, "");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW * 1000);
  state.e.contentMode = "mirror";
  resetQuestCatalog();
});
afterEach(() => vi.useRealTimers());

describe("journey page load", () => {
  test("unknown guid is a 404", async () => {
    state.db = seeded();
    await expect(Promise.resolve().then(() => load(ev(UNKNOWN)))).rejects.toMatchObject({ status: 404 });
  });

  test("sessions newest first, the newest 5 of 7, the newest open", async () => {
    state.db = seeded();
    const data = await run(HERO);
    expect(data.empty).toBe(false);
    expect(data.totalSessions).toBe(7);
    expect(data.shownSessions).toBe(5);
    expect(data.sessions).toHaveLength(5);
    const ts = data.sessions.map((s) => s.t);
    expect(ts).toEqual([...ts].sort((a, b) => b - a));
    expect(data.sessions.map((s) => s.open)).toEqual([true, false, false, false, false]);
    expect(data.sessions.slice(0, 2).map((s) => s.heading)).toEqual(["Today, 06:00 UTC", "Yesterday, 20:00 UTC"]);
    expect(data.sessions[0]!.duration).toBe("15 m");
    expect(data.sessionsNote).toEqual({
      text: "Showing the newest 5 of 7 sessions.",
      href: `/c/${HERO}/journey?all=1`,
      linkText: "Show all sessions",
    });
  });

  test("summary sentences from the session fields, names from the catalog", async () => {
    state.db = seeded();
    const data = await run(HERO);
    expect(data.sessions.slice(0, 4).map((s) => s.summary)).toEqual([
      "Reached level 6. Moved on to Map 9999. 1 quest handed in.",
      "Reached level 4. Moved on to Loch Modan. Professions: Mining. 2 quests handed in.",
      "Levels 1 to 3. Moved on to Dun Morogh. 1 quest handed in.",
      "Played for 1 m.",
    ]);
  });

  test("event lines: sentences newest first with UTC times", async () => {
    state.db = seeded();
    const data = await run(HERO);
    expect(data.sessions[0]!.events.map((e) => [e.time, e.text])).toEqual([
      ["06:15", "First visit to Map 9999"],
      ["06:10", "Completed quest 424242"],
      ["06:05", "Reached level 6"],
      ["06:00", "dance_party"],
    ]);
    expect(data.sessions[0]!.events[0]!.iso).toBe("2027-01-15T06:15:00.000Z");
    expect(data.sessions[2]!.events.map((e) => e.text)).toContain("Completed Frosty Errand");
  });

  test("pace: seconds per level with gaps for the levels the model omits", async () => {
    state.db = seeded();
    const data = await run(HERO);
    expect(data.pace.bars.map((b) => [b.level, b.seconds, b.gap, b.now])).toEqual([
      [2, 1200, false, false],
      [3, 900, false, false],
      [4, null, true, false],
      [5, null, true, false],
      [6, 600, false, true],
    ]);
    expect(data.pace.slowest).toBe(2);
  });

  test("route: stops in order with catalog names, Map <id> fallback, markers and the earlier cluster", async () => {
    state.db = seeded();
    const data = await run(HERO);
    expect(data.route.stops.map((s) => [s.name, s.when, s.current])).toEqual([
      ["Dun Morogh", "levels 2 to 4", false],
      ["Loch Modan", "levels 4 to 6", false],
      ["Map 9999", "level 6, now", true],
    ]);
    expect(data.route.markers.map((m) => m.text)).toEqual(["3", "4", "6"]);
    expect(data.route.lead?.text).toBe("+1 earlier level-up");
  });

  test("without content every map is Map <id> and quests fall back to their id", async () => {
    state.db = seeded(false);
    const data = await run(HERO);
    expect(data.route.stops.map((s) => s.name)).toEqual(["Map 1426", "Map 1432", "Map 9999"]);
    expect(data.sessions[2]!.events.map((e) => e.text)).toContain("Completed quest 9101");
  });

  test("?all=1 shows every session with a link back", async () => {
    state.db = seeded();
    const data = await run(HERO, "?all=1");
    expect(data.sessions).toHaveLength(7);
    expect(data.shownSessions).toBe(7);
    expect(data.sessionsNote).toEqual({ text: "Showing all 7 sessions.", href: `/c/${HERO}/journey`, linkText: "Show only the newest" });
    // Anything else is the default view.
    expect((await run(HERO, "?all=yes")).sessions).toHaveLength(5);
  });

  test("no events at all: the empty state, no panels", async () => {
    state.db = seeded();
    const data = await run(BARE);
    expect(data.empty).toBe(true);
    expect(data.sessions).toEqual([]);
    expect(data.pace.bars).toEqual([]);
    expect(data.route.stops).toEqual([]);
    const page = html(data);
    expect(page).toContain("No play recorded yet. The addon records your levels, quests and places as you play.");
    expect(page).not.toContain("Time per level");
    expect(page).not.toContain("Your route");
  });

  test("events but no level-ups or places: panel empty states", async () => {
    state.db = seeded();
    const data = await run(QUIET);
    expect(data.empty).toBe(false);
    expect(data.sessions).toHaveLength(1);
    const page = html(data);
    expect(page).toContain("No level-ups recorded yet");
    expect(page).toContain("No places recorded yet");
    expect(page).toContain("1 quest handed in.");
  });

  test("the page has text alternatives, details cards and UTC labels", async () => {
    state.db = seeded();
    const page = html(await run(HERO));
    expect(page).toMatch(/<div class="pace" role="img" aria-label="Time per level: level 2, 20 minutes; level 3, 15 minutes; level 4, not recorded; level 5, not recorded; level 6 so far, 10 minutes\."/);
    expect(page).toMatch(/<svg class="route"[^>]*role="img"[^>]*aria-label="Route, oldest first: Dun Morogh, levels 2 to 4; then Loch Modan/);
    expect(page.match(/<details class="session"/g)).toHaveLength(5);
    expect(page.match(/<details class="session" open/g)).toHaveLength(1);
    expect(page).toContain('<time datetime="2027-01-15T06:15:00.000Z">06:15</time>');
    expect(page).toContain("Times are in UTC.");
    expect(page).toContain(`href="/c/${HERO}/journey?all=1"`);
  });

  test("3000+ events stay bounded and say how many are shown", async () => {
    state.db = seeded();
    (state.db as Db)
      .insert(characterEvent)
      .values(Array.from({ length: 3100 }, (_, i) => ({ guid: BARE, t: NOW - 4000 + i, kind: "quest_turned_in", data: JSON.stringify({ questId: 9101 }) })))
      .run();
    const data = await run(BARE);
    expect(data.eventsShown).toBe(3000);
    expect(data.eventsTotal).toBe(3100);
    expect(data.eventsNote).toBe("Showing 3,000 of 3,100 events. The oldest sessions shown may be incomplete.");
    expect(data.sessions).toHaveLength(1);
    expect(data.sessions[0]!.events.length).toBeLessThanOrEqual(100);
    expect(data.sessions[0]!.moreEvents).toBe(3000 - data.sessions[0]!.events.length);
    expect(data.sessions[0]!.summary).toBe("3,000 quests handed in.");
    expect(html(data)).toContain("Showing 3,000 of 3,100 events.");
  });

  test("implausible times do not throw", async () => {
    state.db = seeded();
    const data = await run(ODD);
    expect(data.sessions).toHaveLength(1);
    expect(data.sessions[0]!.events.map((e) => e.text)).toEqual(["Reached level 7"]);
    expect(data.route.stops).toEqual([]);
    expect(data.pace.bars.map((b) => b.level)).toEqual([7]);
    expect(() => html(data)).not.toThrow();
  });
});
