# M1.1 Quests and Journey Tweaks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix what real use of M1 showed: profession quests the character cannot use, chains you cannot open, no quest lists, a Journey tab that is one long list, and a missing roster surname.

**Architecture:** Pure rules and models stay in `packages/core` (tested on the real quest fixtures); `apps/web` loads and renders. The Journey is rebuilt as three views over the same events: play sessions, time per level, and a route of places, following the approved mockup. No new external data source: everything comes from the ForeverDB mirror and the addon snapshot/events.

**Tech Stack:** Same as M1 (SvelteKit 3, Svelte 5, Drizzle + SQLite, vitest 5 projects, Playwright smoke test).

**Spec:** `docs/superpowers/specs/2026-11-01-forevertracker-design.md` (sections 6, 7, 8, 11). Also read `docs/superpowers/m1-bugs-and-tweaks.md` (items 1, 2, 3, 4, 6: the findings and agreed fixes) and the mockup `docs/design/m1/journey.html` + `journey.css`.

## Global Constraints

- Same as the M1 plan: no LLM; every suggestion has a reason and a source label; no third-party requests at runtime (never fetch Wowhead); ForeverDB credit in the footer; secrets never logged or committed; invented names in fixtures; checks `pnpm test`, `pnpm typecheck`, `cd addon && ./test.sh` pass (check exit codes). Run package tests with `pnpm vitest run --project @ft/core` (or `--project web`), node via `export PATH="$HOME/.nvm/versions/node/v26.13.0/bin:$PATH"`.
- The owner's mirror at `data-local/` is read-only for tests and inspection (`sqlite3 -readonly`); copy it to a temp dir for any app run.
- Real quest shapes are fixed (see `packages/core/test/fixtures/quests.fixture.md`): `zone {n,slug,m}|null`, `chain {previous[],next[],questLine}`, links `{questId,name,relation}`; deeper fields are not validated, so code must not throw on odd values.
- Class quests (zone name is a class) stay filtered by `classToken`; the profession rule here is interim and named so in code comments, to be replaced by Wowhead tags in M2.
- Times: event times are real-world unix seconds; implausible values never throw (reuse `plausibleDate` in `apps/web/src/lib/journey.ts`). A session is a run of events with gaps under 30 minutes.
- Look and feel: as M1 (`apps/web/src/lib/theme.css`); the Journey follows `docs/design/m1/journey.html`; works at 375px; visible focus; `<details>` for session expansion; SVG route has a text alternative.

## Review Focus

- A character with zero events, one event, or events all at the same second: Journey renders empty states or a single session, never divides by zero or throws (Tasks 5, 6).
- Level-up events missing, duplicated or out of order (for example only level 14 recorded): pace shows only levels with known start and end, current level marked partial, no negative or huge bars (Task 5).
- A character with 3000+ events or 500+ visited places: Journey stays bounded (events capped, places capped with "N earlier places"), page renders fast (Tasks 5, 6).
- A shared hub quest (one starter that is the prerequisite of many class or race branches): a character who only did the hub is not listed as "on" those chains; the chain page still opens for any quest id and returns 404 for unknown ids (Task 3).
- Profession quests: quest names with the profession in different case, extra spaces, or a name that merely contains a profession word; a character with zero professions, full primary slots, or professions not in the mirror (Task 2).
- Quest log lists: ids not in the mirror ("Quest <id>"), thousands of completed quests (paging bounds), search text with regex characters or very long input (Task 4).

---

### Task 1: Surname on roster cards

**Files:**
- Modify: `apps/web/src/lib/components/CharacterCard.svelte`, `apps/web/src/lib/theme.css`
- Test: `apps/web/test/roster-page.test.ts`

**Interfaces:**
- Consumes: `CharacterCard.surname: string | null` (already in `@ft/core` read model).

- [ ] **Step 1: Write the failing test:** a character whose identity has a surname appears in the roster `load` data with that surname; and the rendered card markup includes the name followed by the surname (use the existing pattern in `roster-page.test.ts`; if components are not rendered in tests, test the data and add the surname to the e2e smoke assertions in Task 7). A character without a surname still renders with no stray space or empty element.
- [ ] **Step 2: Run** `pnpm vitest run --project web` and confirm the test fails.
- [ ] **Step 3: Implement** the surname in `CharacterCard.svelte` the same way the character header does (`{c.name}{#if c.surname}<span class="surname"> {c.surname}</span>{/if}`), reuse the `.surname` style from `theme.css` adapted for the card heading size, readable at 375px (wraps under the name when tight).
- [ ] **Step 4: Run** the web tests and typecheck; PASS. Confirm in the app on a temp DB that a surname shows (ingest a fixture with `identity.surname`).
- [ ] **Step 5: Commit** `fix(web): show surname on roster cards`.

### Task 2: Profession-quest rule (interim)

**Files:**
- Create: `packages/core/src/advice/professions.ts`
- Modify: `packages/core/src/advice/content.ts` (add `loadProfessions`), `packages/core/src/advice/types.ts`, `packages/core/src/advice/next-up.ts`, `packages/core/src/index.ts`, `apps/web/src/lib/server/content.ts` (catalog gains `professions`), `apps/web/src/routes/+page.server.ts`, `apps/web/src/routes/c/[guid]/quests/+page.server.ts`
- Test: `packages/core/test/professions.test.ts`, `packages/core/test/next-up.test.ts`, `apps/web/test/character-pages.test.ts`, fixtures from real rows (`Camping 101: <Profession>` quests: 96626, 97900, 97901, 97902 and a non-profession quest with a colon in its name)

**Interfaces:**
- Produces:
  - `type ProfessionInfo = { slug: string; name: string; kind: string }`; `loadProfessions(source: ContentSource): Promise<ProfessionInfo[]>` (list records of the `professions` resource without an `@` in the id; malformed rows dropped).
  - `professionOfQuest(questName: string, professions: ProfessionInfo[]): ProfessionInfo | null`: the quest is a profession quest when its name ends with `: <profession name>` (case-insensitive, trimmed, exact end match, longest name wins, a bare profession word elsewhere in the name does not count).
  - `NextUpInput` gains optional `professionCatalog?: ProfessionInfo[]`; the existing `professions: CharacterCard["professions"]` (the character's learned professions) is now used.
- Rule (document in code, name it interim): a profession quest is shown only when allowed; allowed means the profession is known to the character (case-insensitive name match), or its kind is a secondary one (always learnable), or it is a primary profession and the character has fewer than 2 known primary professions (a free slot; low confidence, reason says "You have a free profession slot"). Otherwise the quest is dropped entirely. Allowed profession quests get kind `"profession"` whichever rule found them, and the reason names the profession. Without `professionCatalog`, behaviour is unchanged. Step 1 must confirm in the real mirror which `kind` values exist (expected `primary` and `secondary`; check whether gathering professions such as Mining, Herbalism and Skinning are `primary` there) and the rule uses what is verified.

- [ ] **Step 1: Inspect** the real `professions` resource read-only (kinds, names) and list `Camping 101` and any other `<word>: <Profession>` quest names, record the verified kinds and edge cases in the fixture notes.
- [ ] **Step 2: Write failing tests:** `professionOfQuest` (exact end match; case and spacing; "Mining" inside "Mining Camp" is not a match; longest match such as a two-word profession; no match returns null); `nextUp`: a character with Skinning and Leatherworking (full primary slots) and Cooking and First Aid does NOT get Camping 101 for Mining or Enchanting, DOES get it for Skinning, Leatherworking, Cooking and First Aid if not done; a character with one primary profession gets other primary ones as low confidence "free slot"; a character with none gets them all as low confidence; unknown profession names or an empty catalog leave behaviour unchanged; completed profession quests never reappear.
- [ ] **Step 3: Run** `pnpm vitest run --project @ft/core` and confirm failure.
- [ ] **Step 4: Implement** `professionOfQuest`, `loadProfessions`, the input field and the rule in `nextUp` (single pass; build the name lookup once per call). Extend the web catalog (`getQuestCatalog`) with `professions` and pass `professionCatalog` and the character's `professions` in both loaders; add a web test that the Quests loader drops a Mining quest for the full-slot fixture character.
- [ ] **Step 5: Run** `pnpm test && pnpm typecheck`; PASS.
- [ ] **Step 6: Commit** `fix(core): profession quests only for professions the character can use (interim rule)`.

### Task 3: Chains you can open, and a tighter chain list

**Files:**
- Create: `packages/core/src/advice/chain-detail.ts`, `apps/web/src/routes/c/[guid]/quests/chain/[questId]/+page.server.ts`, `+page.svelte`
- Modify: `packages/core/src/advice/chains.ts`, `packages/core/src/index.ts`, `apps/web/src/routes/c/[guid]/quests/+page.svelte`, `apps/web/src/lib/theme.css`
- Test: `packages/core/test/chain-detail.test.ts`, `packages/core/test/chains.test.ts`, `apps/web/test/character-pages.test.ts`

**Interfaces:**
- Produces:
  - `chainDetail(quests: QuestRow[], questId: number, completed: Set<number>, inLog: Set<number>, classToken?: string | null): { chain: number; name: string; members: { questId: number; name: string; level: number; zone: string | null; giver: string | null; state: "done" | "in-log" | "available" | "locked"; step: number }[]; done: number; total: number } | null` (null when the quest id is unknown; members in chain order, same derivation as `chainProgress`; `available` = every prerequisite done and itself not done or in log; `locked` otherwise).
  - `chainProgress` filter tightened: a chain is listed only when the character has a member in the log, or has completed a member that is not a hub; a hub is a quest with 3 or more direct successors in its component (typical shared race or faction starter). A chain whose only progress is a hub is not listed.
- Page: `/c/<guid>/quests/chain/<questId>` shows the chain title, "N of M done", and an ordered list of members with state (done / in log / available now / locked), level, zone and giver; the current step is marked; unknown guid or quest id gives 404. In the Quests tab, each chain in "Quest chains" and each chain-kind suggestion in "Next up" links to its chain page.

- [ ] **Step 1: Write failing tests** with real fixture rows plus synthetic chains: the shared-starter case (hub 179 with several class runes: a character who only did 179 has no listed chain); a started chain lists with correct counts; `chainDetail` order and states (done, in-log, available, locked) on a branching chain; unknown id returns null; class filtering applies; a cycle does not hang; the web route returns 404 for unknown ids and the member list for a known one.
- [ ] **Step 2: Run** and confirm failure; **Step 3: Implement** (single pass over the quests, maps built once); **Step 4:** add the page and the links (visible focus, text states not colour only); **Step 5: Run** `pnpm test && pnpm typecheck`; check the page in the browser pane on a temp DB copy.
- [ ] **Step 6: Commit** `feat: open a quest chain and list only chains the character is on`.

### Task 4: Quest log lists

**Files:**
- Create: `packages/core/src/advice/quest-log.ts`, `apps/web/src/routes/c/[guid]/quests/log/+page.server.ts`, `+page.svelte`
- Modify: `packages/core/src/index.ts`, `apps/web/src/routes/c/[guid]/quests/+page.svelte` (the quest-log panel links to the lists)
- Test: `packages/core/test/quest-log.test.ts`, `apps/web/test/character-pages.test.ts`

**Interfaces:**
- Produces: `listQuestLog(quests: QuestRow[], ids: number[], opts: { query?: string; page?: number; pageSize?: number }): { rows: { questId: number; name: string; level: number | null; zone: string | null }[]; total: number; page: number; pages: number }`: ids missing from the mirror become `{ name: "Quest <id>", level: null, zone: null }`; sorted by level ascending (nulls last), then name, then id; `query` is a case-insensitive substring match on name (plain text, never a regex); `pageSize` default 50, clamped 10 to 200; `page` clamped to the valid range.
- Page: `/c/<guid>/quests/log?list=completed|progress&page=N&q=text`: two tabs (In progress, Completed) with counts, a search box, paging links; bounded input (`q` limited to 100 characters, page numeric).

- [ ] **Step 1: Write failing tests:** sorting; paging bounds (page 0, negative, beyond last); search is plain text (`.*`, `(`, `\` do not throw or match everything); unknown ids shown as "Quest <id>"; 5000 ids paged; the web loader returns total and a bounded page; unknown guid is 404.
- [ ] **Step 2: Run** and confirm failure; **Step 3: Implement**; **Step 4: Run** `pnpm test && pnpm typecheck`; check in the browser pane.
- [ ] **Step 5: Commit** `feat(web): quest log lists with paging and search`.

### Task 5: Journey models (sessions, pace, route)

**Files:**
- Create: `packages/core/src/journey/sessions.ts`, `pace.ts`, `route.ts`, `packages/core/src/read/journey.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/journey.test.ts` (fixtures: invented events)

**Interfaces:**
- Produces:
  - `type StoredEvent = { t: number; kind: string; data: unknown }` (named `StoredEvent` in code because `apps/web/src/lib/journey.ts` already has a different `JourneyEvent`).
  - `buildSessions(events: StoredEvent[], opts?: { gapSeconds?: number }): Session[]` where `Session = { start: number; end: number; seconds: number; levelFrom: number | null; levelTo: number | null; quests: number; places: { mapId: number; subzone: string }[]; professions: string[]; events: StoredEvent[] }`, newest session first, events inside newest first; `gapSeconds` default 1800; a session's `seconds` is `end - start` with a minimum of 60; events with implausible `t` (non-finite, <= 0) are ignored; unknown kinds stay in `events` but add nothing to the summary fields; `levelFrom`/`levelTo` come from `level_up` events in the session (`levelFrom = min(level) - 1`, `levelTo = max(level)` over the session's level-ups).
  - `levelPace(levelUps: { t: number; level: number }[], sessions: Session[], now: number): { level: number; seconds: number; complete: boolean }[]`: for each level with a known start (the time of the level-up that reached it) the active time is the overlap of `[start of level, start of next level)` with the sessions' spans (gaps between sessions are not counted); the current level is `complete: false` and runs to the latest event time; levels without a known start (for example the first recorded level) are omitted; duplicate or out-of-order level-ups are deduplicated by level (earliest time wins) and sorted; no negative or NaN values.
  - `routeFromVisited(visited: { mapId: number; subzone: string; firstSeen: number }[], levelUps: { t: number; level: number }[], nameOf: (mapId: number) => string | null, opts?: { max?: number }): { stops: { mapId: number; name: string; firstSeen: number; levelFrom: number | null; levelTo: number | null; current: boolean }[]; earlier: number; markers: { level: number; t: number; afterStop: number }[] }`: distinct maps ordered by earliest `firstSeen` (subzones of one map merge into one stop), `max` default 8 (the newest 8 kept, `earlier` = the number dropped), `current` true for the latest stop, `levelFrom`/`levelTo` = levels at the first and last time seen in that map (from the level-ups; null when unknown), `markers` = level-ups placed after the stop that was current at that time. Unnamed maps get `name: "Map <id>"`.
  - `getJourneyData(db: Db, guid: string, opts?: { events?: number }): { events: StoredEvent[]; levelUps: { t: number; level: number }[]; total: number } | null` in `read/journey.ts`: newest `events` events (default 3000) by SQL `ORDER BY t DESC LIMIT`, plus ALL `level_up` events (a small set), total event count; null for an unknown guid.

- [ ] **Step 1: Write failing tests:** sessions split at a 30 minute gap (and not at 29:59); a single event is a one-minute session; same-second events; implausible times ignored; summary fields (levels, quests count, places, professions names from `profession_changed.data.names` split on `|`); `levelPace`: gaps between sessions not counted (a level spanning an overnight pause shows only active time), current level partial, missing/duplicate/out-of-order level-ups, nothing negative or NaN; `routeFromVisited`: subzones merge, order by first seen, `max` and `earlier`, level ranges, unnamed maps, empty input gives `{ stops: [], earlier: 0, markers: [] }`; `getJourneyData`: caps events, returns all level-ups beyond the cap, unknown guid null.
- [ ] **Step 2: Run** `pnpm vitest run --project @ft/core` and confirm failure.
- [ ] **Step 3: Implement** the four functions (pure except `getJourneyData`); keep each file focused.
- [ ] **Step 4: Run** `pnpm test && pnpm typecheck`; PASS.
- [ ] **Step 5: Commit** `feat(core): journey sessions, pace and route models`.

### Task 6: Journey page rebuild

**Files:**
- Create: `apps/web/src/lib/components/{PaceStrip,RouteStrip,SessionCard}.svelte`, `apps/web/src/lib/route-layout.ts`
- Modify: `apps/web/src/routes/c/[guid]/journey/+page.server.ts`, `+page.svelte`, `apps/web/src/lib/journey.ts`, `apps/web/src/lib/theme.css` (port `docs/design/m1/journey.css`)
- Test: `apps/web/test/journey-page.test.ts`, `apps/web/test/route-layout.test.ts`

**Interfaces:**
- Consumes: `getJourneyData`, `buildSessions`, `levelPace`, `routeFromVisited`, the catalog's map-name lookup (as the current Journey page uses), `eventSentence`/`formatEventTime`/`plausibleDate` from `apps/web/src/lib/journey.ts`.
- Produces: `routeLayout(n: number, width: number, height: number): { x: number; y: number }[]` (deterministic gentle S-curve stops for 0 to `max` stops, inside the box with margins, no NaN for n of 0 or 1) in `route-layout.ts`; the page data `{ sessions, pace, route, shownSessions, totalSessions, quests names map }`.
- Page, per the mockup: **Time per level** panel (bars scaled to the longest level, the slowest level marked, the current level hatched, `role="img"` with a text alternative listing hours, the note that gaps between sessions are not counted); **Your route** panel (SVG from `routeLayout`: stops with zone name and "levels A to B", level-up markers on the path, current stop filled, "N earlier places" when `earlier > 0`, text alternative); **Play sessions** list of `<details>` cards: heading (day label and start time), duration, one summary sentence built from the session fields (for example "Levels 11 to 13. Moved on to Loch Modan. Learned Mining. 9 quests handed in."), open events list with times and sentences (`eventSentence`); the newest session open, the newest 5 shown, `?all=1` shows all (cap 200 sessions) with "Showing the newest N of M sessions" and a link. Times: the server renders UTC with "UTC" in the label; a tiny client enhancement (after mount) reformats `<time datetime>` values in the browser's time zone and day labels ("Today", "Yesterday") without a hydration mismatch. Empty states: no events at all: "No play recorded yet. The addon records your levels, quests and places as you play." (no panels); events but no level-ups: pace panel says "No level-ups recorded yet"; no visited places: route panel says "No places recorded yet".

**Notes from the Task 5 review (binding for this task):** `routeFromVisited` markers with `afterStop: -1` (level-ups before the first shown stop, or during a dropped stop) must be clustered at the start of the strip or hidden, never drawn one by one; pace levels omitted by the model (next level-up missing) show as gaps in the strip, derived from the level sequence; a complete level can still have 0 seconds, so draw a minimum bar height and the label "less than a minute"; the events line says "Showing N of total" using `events.length` (the total also counts malformed rows) and the oldest session inside the cap may be understated (a footnote when the cap is hit).

- [ ] **Step 1: Write failing tests:** `routeLayout` for n of 0, 1, 2, 8 (points inside the box, ordered left to right/top to bottom, deterministic, finite); page `load` with an invented fixture: sessions newest first, summary sentences, pace values, route stops with names from the catalog and "Map <id>" fallback, `?all=1` shows more sessions, empty character returns the empty states, 3000+ events stay bounded, implausible times do not throw (reuse the M1 helpers); unknown guid 404.
- [ ] **Step 2: Run** `pnpm vitest run --project web` and confirm failure.
- [ ] **Step 3: Implement** the loader and components; move the CSS from the mockup into `theme.css` using the existing tokens; keep `journey.ts` helpers, deleting only what the new page makes unused (with tests updated, not weakened).
- [ ] **Step 4: Run** `pnpm test && pnpm typecheck && pnpm --filter web build`; verify in the browser pane against `docs/design/m1/journey.html` at desktop and 375px on a temp DB copy with an invented multi-session fixture (copy the owner's mirror, never write to `data-local`); fix visible differences.
- [ ] **Step 5: Commit** `feat(web): journey as play sessions, pace strip and route`.

### Task 7: Smoke test, docs, container check

**Files:**
- Modify: `apps/web/e2e/smoke.spec.ts`, `README.md`, `docs/superpowers/m1-kickoff.md` (add "State at the end of M1.1"), `docs/superpowers/m1-bugs-and-tweaks.md` (statuses)
- Test: the e2e spec

- [ ] **Step 1: Extend the smoke spec:** the roster card shows the surname; the Quests tab has the chain link and the quest log link and both pages load; the Journey tab shows the three sections for the fixture (extend the fixture with events across two sessions and a visited place) and a `<details>` card expands; no console errors and all requests same-origin still hold.
- [ ] **Step 2: Run** `pnpm --filter web test:e2e`; PASS (system Chromium).
- [ ] **Step 3: Container check** as in M1 (throwaway container, volume and spare port; never the owner's running stack): build, start, log in, upload the fixture, open the Journey and a chain page; tear down.
- [ ] **Step 4: Docs:** README pages overview (Journey sessions, chains, quest log); the kickoff note's M1.1 state (what is verified and not); the bug list statuses; note that the profession rule is interim (M2: Wowhead tags) and that "Where to next" and the alt chart are M2.
- [ ] **Step 5: Run** `pnpm test && pnpm typecheck && (cd addon && ./test.sh)`; PASS. Scan tracked files for secrets and home paths. Commit `docs: M1.1 state, smoke tests`.

---

## Self-Review

- **Coverage:** bug list items 1 (Task 2), 2 (Task 3), 3 (Task 4), 4 (Tasks 5 and 6), 6 (Task 1); items 5 and 7 are M2 by decision. The agreed Journey design (sessions, pace strip, route strip, show-earlier link, UTC then browser time zone) is in Tasks 5 and 6.
- **Types:** `Session`, `JourneyEvent`, `ProfessionInfo`, `chainDetail`/`listQuestLog` shapes are defined once and consumed by name; `getCharacter` is untouched (the Journey uses `getJourneyData`).
- **Unknowns resolved inside tasks, not guessed:** profession `kind` values (Task 2 step 1), map-name resolution for the route (reuses the M1 catalog lookup), real chain hub sizes (Task 3 fixtures).
- **Known limit stated:** only first visits are recorded, so the route shows order and level ranges, not time per zone.
