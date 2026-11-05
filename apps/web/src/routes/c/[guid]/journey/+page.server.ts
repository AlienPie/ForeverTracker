import { error, type ServerLoad } from "@sveltejs/kit";
import { buildSessions, getJourneyData, levelPace, routeFromVisited } from "@ft/core";
import { eventSentence, formatEventTime, mapName } from "../../../../lib/journey";
import {
  clockTime,
  DEFAULT_SESSIONS,
  eventsNote,
  firstReached,
  formatDuration,
  MAX_SESSION_EVENTS,
  MAX_SESSIONS,
  paceView,
  professionsBefore,
  routeView,
  sessionHeading,
  sessionsNote,
  sessionSummary,
  type PaceView,
  type RouteView,
  type SessionsNote,
  type SessionView,
} from "../../../../lib/journey-view";
import { characterOr404 } from "../../../../lib/server/character";
import { getDb } from "../../../../lib/server/db";
import { getQuestCatalogSafe } from "../../../../lib/server/safe-catalog";

export type JourneyPageData = {
  /** no sessions at all (no events, or none with a plausible time): the page shows one message and no panels */
  empty: boolean;
  sessions: SessionView[];
  totalSessions: number;
  shownSessions: number;
  sessionsNote: SessionsNote | null;
  pace: PaceView;
  route: RouteView;
  /** events the sessions were built from (`events.length`, capped by the core read) */
  eventsShown: number;
  /** event rows stored for the character (malformed ones included) */
  eventsTotal: number;
  eventsNote: string | null;
  /** server time (unix seconds) the UTC labels were made at */
  now: number;
};

/** Sessions only hold plausible times, so the fallback is a guard. */
const withUtc = (label: string | null) => (label ? `${label} UTC` : "Time unknown");

export const load: ServerLoad = async ({ params, url }): Promise<JourneyPageData> => {
  const now = Math.floor(Date.now() / 1000);
  const view = characterOr404(params.guid, now, { events: false });
  const journey = getJourneyData(getDb(), view.guid);
  if (!journey) error(404, "Character not found");

  const catalog = await getQuestCatalogSafe();
  const questNames = new Map(catalog.quests.map((q) => [q.id, q.name]));
  const nameOf = (id: number) => mapName(id, catalog.mapNames);

  const sessions = buildSessions(journey.events);
  const all = url.searchParams.get("all") === "1";
  const shown = sessions.slice(0, all ? MAX_SESSIONS : DEFAULT_SESSIONS);
  const before = professionsBefore(sessions);
  const reached = firstReached(view.visitedMaps, sessions);

  const sessionViews = shown.map((s, i): SessionView => {
    const listed = s.events.slice(0, MAX_SESSION_EVENTS);
    return {
      t: s.start,
      heading: withUtc(sessionHeading(s.start, now, "UTC")),
      duration: formatDuration(s.seconds),
      summary: sessionSummary(s, { mapName: nameOf, firstReached: reached, professionsBefore: before[i] ?? null }),
      open: i === 0,
      events: listed.map((e) => ({
        t: e.t,
        iso: formatEventTime(e.t).iso,
        time: clockTime(e.t, "UTC") ?? "",
        text: eventSentence(e, questNames, catalog.mapNames),
      })),
      moreEvents: s.events.length - listed.length,
    };
  });

  // Sessions cover only the capped window, so pace uses only the level-ups inside it: a level
  // that started before the window has no known start there and is left out (not drawn as ~0).
  const oldest = journey.oldestT;
  const paceUps = journey.capped && oldest !== null ? journey.levelUps.filter((u) => u.t >= oldest) : journey.levelUps;
  const route = routeFromVisited(view.visitedMaps, journey.levelUps, (id) => catalog.mapNames[id] ?? null);

  return {
    empty: sessions.length === 0,
    sessions: sessionViews,
    totalSessions: sessions.length,
    shownSessions: sessionViews.length,
    sessionsNote: sessionsNote(sessionViews.length, sessions.length, all, url.pathname),
    pace: paceView(paceUps.length > 0 ? levelPace(paceUps, sessions, now) : []),
    route: routeView(route),
    eventsShown: journey.events.length,
    eventsTotal: journey.total,
    eventsNote: eventsNote(journey.events.length, journey.total, journey.capped),
    now,
  };
};
