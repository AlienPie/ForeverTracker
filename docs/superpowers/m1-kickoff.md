# M1 kickoff note

Written 2026-11-05, after the first real game session. Read this first; it holds what only the live game could teach us.
Authority order: the spec (`docs/superpowers/specs/2026-11-01-forevertracker-design.md`), then `docs/superpowers/m0-decisions-and-deferred.md`
(binding rulings R1-R23 and the deferred minor findings), then this note.

## State at the end of M0 (all verified against the live game)

- Addon -> `SavedVariables/ForeverTracker.lua` -> upload -> SQLite works end to end. Re-uploads are idempotent.
- Test character used: a low-level Dwarf Shaman. Build 1.60.1.70790; level cap from `/meta` is 60 (it was 30 in beta).
- Content mirror synced from ForeverDB: 60 zones, 3,862 quests, 931 vendors, 47 dungeons, 9 classes, 12 professions, 4 gathering. A full sync is
  about 100 requests and about a minute (not the 700 once estimated). ForeverDB lists 3,862 quests but its `/meta` counts 6,614, so the list is incomplete.
- Not built yet: any dashboard. The web app has only `/api/health`, token-guarded `/api/ingest` and a title page.

## What the real game taught us (addon behaviour)

- `ReloadUI()` from addon code is BLOCKED ("Interface action failed because of an addon"). `/ft sync` saves, then the player types `/reload`.
- Snapshots must not be taken at `PLAYER_LOGOUT` (it also fires on `/reload`): unit APIs are gone by then (level, XP, money, position all degraded).
  The addon snapshots on login, level-up, quest turn-in, debounced profession change, a 2-minute autosave ticker and `/ft sync`.
- `SKILL_LINES_CHANGED` fires dozens of times; `profession_changed` is logged only when the SET of professions changes.
- `C_QuestLog.GetAllCompletedQuestIDs` exists on Forever (`questsSource = c_questlog_bulk`): completed-quest tracking is complete. The bundled
  `Data/QuestIds.lua` list is only a fallback.
- `GetProfessions`/`GetProfessionInfo` exist (locale-independent skill line IDs, e.g. Skinning = 393). Equipped gear is keyed by slot name.
- Class/race are tokens ("SHAMAN", "Dwarf"); `UnitName` splits `Name-Surname`; the real zone text can differ from the map name (zone "Anvilmar" on map 1426).
- Subzone text is often empty, so the visited-places set (map ID + subzone) is coarse. "Where have I been" needs a real design in M1.
- Still unverified in-game: trait-tree talent capture (needs level 10), flight-path (`taxi`) capture, `C_Timer.NewTicker`-based autosave behaviour at scale.
- WoW only flushes SavedVariables on `/reload` or logout; autosave keeps the in-memory snapshot fresh, the file lags until then.

## ForeverDB / Blizzard API facts

- ForeverDB: 60 req/min, 10,000/day; response shapes for all mirrored resources are now verified (classes have 3 talent trees with id/tier/column/ranks/prerequisites;
  professions page their recipes; quests have NO class/race fields). The owner asked ForeverDB whether a local mirror is allowed; the reply may still be pending
  (`CONTENT_MODE=on-demand` is the switch if they refuse).
- Blizzard: client-credentials token works; the static namespace `static-1.60.1_70399-forever-eu` answers (classes, races, quests, talent trees); the dynamic realm
  index returned 404 on launch day; account/character endpoints need a user token (Battle.net login) and are untested. The registered redirect URLs end in `/auth/callback`.

## M1 scope (from the spec) and open design questions

Roster home page, character page (Journey, Quests, Talents, Professions tabs), manual upload page, "next up" suggestions, local login, WoW theme.
Do a short design pass first (mockups before UI code; use the frontend-design skill). Questions to settle with the owner:
1. What should "exploration/where I've been" mean given the empty-subzone problem (zones, quest hubs, rare spawns, map position grid)?
2. "Next up" rules v1: quests in level range with chain continuations near the character, using the mirror; class/race quest tagging still needs the Wowhead-assisted
   maintainer tool (the app never calls Wowhead).
3. Tooltip provider: test whether Wowhead's script handles `/forever/` links; ForeverDB's embed is the fallback.
4. Missing basics worth doing early: device-token list/revoke (today it takes SQL), CONTENT_MODE validation wiring, surname handling in stored character names.

## Practical notes for the next session

- Node v26 lives under nvm and is not on the PATH of non-interactive shells; pnpm 12; Podman 6 rootless; `podman compose` works (podman-compose 1.6.0 provider; `compose.yaml` verified on 2026-11-05).
- Checks: `pnpm test`, `pnpm typecheck`, `cd addon && ./test.sh` (LuaJIT, Lua 5.1 semantics). Rebuild/run the container per `README.md`.
- Git: `origin` is HTTPS with no credentials here; pushing works over SSH with `git push git@github.com:AlienPie/ForeverTracker.git main`.
- Never commit `.env`, tokens, the WoW account folder name, character names, or home paths; scan tracked files before every push.
- Reinstalling the addon: remove the installed `ForeverTracker` folder, copy `addon/ForeverTracker`, then `/reload` in game.

## State at the end of M1

**What exists.** Owner login (`OWNER_PASSWORD` + `SESSION_SECRET`, open mode when unset), WoW-styled theme, roster, character pages (Journey, Quests, Talents, Professions) with "next up" suggestions and quest chains, a browser Upload page, a Settings page (create/revoke tokens, content status), token list/revoke CLIs, an optional tooltip provider (`TOOLTIP_PROVIDER`, default none = no third-party requests), and bundled local fonts. Code is on branch `m1-dashboard`.

**How to run.** Container: see `README.md` (`podman build`, `podman run` with `.env`). Development: `pnpm --filter web build && pnpm --filter web start` with `DATA_DIR`, `OWNER_PASSWORD`, `SESSION_SECRET` exported. Checks: `pnpm test`, `pnpm typecheck`, `(cd addon && ./test.sh)`, `pnpm --filter web test:e2e`.

**Verified in the last task (2026-11-05).**
- `pnpm test` (24 files, 274 tests), `pnpm typecheck` and `addon/test.sh` (126 successes) pass.
- `pnpm --filter web test:e2e` (Playwright, system Chromium) passes against the built app on a temp DB: login redirect, wrong and right password, empty-roster invitation, upload of an invented file, roster, all four character tabs, settings token create/revoke, sign out; no console errors, no third-party requests, footer credit present. Repeated 12+ times without a failure after ignoring cancelled requests.
- `podman build -t forevertracker:dev .` succeeds. A throwaway container on port 3199 with a throwaway volume: `/api/health` ok, `/` redirects to `/login`, form login gives 303 plus cookie, `/` then 200, token create/list/revoke CLIs work, ingest with the bearer token stores 2 characters (401 after revoke), roster shows them, fonts are served from `/_app/immutable/assets/*.woff2` on the same origin. Container and volume were removed afterwards.

**NOT verified.**
- Real game data on the dashboard beyond temp-DB checks with invented fixtures.
- Docker Compose (only `podman compose` was ever checked, and not re-run for M1).
- Tooltips after client-side navigation (the provider script is added once on mount).
- Browsers other than Chromium; mobile layouts beyond manual resizing.

**Owner actions, once.**
1. Set `OWNER_PASSWORD` and a long random `SESSION_SECRET` in `.env`, then recreate the container.
2. Run `pnpm content:sync` (or the container equivalent) so the level-cap `meta` record exists and the mirror is current.
3. Create a device token in Settings (or via the CLI) if you want scripted uploads.

**M2 list (spec section 11).** Class/race/profession chains (needs the maintainer quest-tagging tool), the talent playground with guide builds, profession advice, and a richer Journey tab with visited places. After that, M3: the sync agent, Battle.net login, a planning view and theme polish.

## State at the end of M1.1

**What exists now** (branch `m1-1-tweaks`, on top of M1). Roster cards and the character header show the surname (shared `CharacterName` component, bug-list item 6, `09e0353`..`e694a59`). "Next up" skips profession quests for professions the character cannot use (item 1, `f9c56ab`..`2ca683c`). Quest chains list only chains the character is on and each opens to a chain page, `/c/<guid>/quests/chain/<questId>` (item 2, `66ef9c5`..`2e583bf`). The quest log lists completed and in-progress quests with paging and search, `/c/<guid>/quests/log?list=completed|progress&page=&q=` (item 3, `3ce592a`). Journey is rebuilt as play sessions (newest first, expandable cards), a "Time per level" pace strip and a "Your route" strip; times show in UTC first and switch to the browser's time zone once the page has loaded (item 4, `a6bd498`..`6495c61`). Items 5 (alt comparison chart) and 7 ("where to next") stay in M2. Task 7 adds the extended smoke test and these docs, plus two small Journey fixes (the empty state when no session survives, the "Showing N of total" note only when the read hit its cap).

**Verified in the last task (2026-11-05).**
- `pnpm test` (31 files, 431 tests), `pnpm typecheck` and `(cd addon && ./test.sh)` (126 successes) pass.
- `pnpm --filter web test:e2e` passes 3 runs in a row against the built app on a temp `DATA_DIR`. The fixture now has a surname, two play sessions, level-ups and visited places, and a tiny invented quest mirror (3 chained quests) written into the temp DB with `openDb` from `@ft/db` before the first roster load. It covers: roster card and header with surname, the three Journey sections, a session card opening, the Quests tab chain link opening the chain page, the quest log page with its two tabs, `/quests/chain/12345` returning 404 for an unknown quest; no console errors, no failed requests, no third-party requests.
- `podman build -t forevertracker:dev .`, then a throwaway container `ft-m11-check` on 127.0.0.1:3199 with a throwaway volume: `/api/health` 200, `/` redirects to login, form login gives 303 plus cookie, token via `create-token.mjs`, the same fixture ingested (1 character stored), then roster, Journey (all three sections present, surname in the page), Quests and quest-log pages all 200. `content-sync.mjs` without a key prints `FOREVERDB_API_KEY is not set` and exits 1. Container and volume were removed; the owner's compose stack was not touched. With an empty mirror, the chain URL for an unknown quest answers 200 with "No chain to show yet" (not 404); the 404 applies once the mirror holds quests (covered by the e2e).

**NOT verified.**
- Real game data on the new pages beyond temp-DB checks with invented fixtures, and the owner's own use.
- Docker Compose (only `podman compose` was ever checked).
- Tooltips after client-side navigation (the provider script is added once on mount).
- Browsers other than Chromium; mobile layouts beyond manual resizing.

**Interim and limits.**
- The profession-quest rule is INTERIM: it matches quests by profession name; it is replaced by Wowhead tags in M2.
- Only first visits to a place are recorded, so the route shows order and level ranges, not time per zone.
- A level can show less than a minute when a session ends exactly at a level-up.
- Sessions are built only from the sparse recorded events (level, quest, zone, profession), so 30 minutes or more of play without any of them (for example grinding) counts as a break and is not counted in "Time per level".
- When a character has more than 3000 events, Journey reads the newest 3000: the oldest sessions shown may be incomplete and "Time per level" leaves out levels that started before that window (the page says so).

**Owner actions.**
1. Rebuild and recreate the container: `podman compose up -d --build --force-recreate`.
   Note: `podman build -t forevertracker:dev .` retags the image the compose stack uses, so a running container keeps its old image until it is recreated.
2. Run the content sync once if not done: `podman compose exec forevertracker node /app/content-sync.mjs` (needs `FOREVERDB_API_KEY` in `.env`).

**Next: M2** (spec section 11). Class/race/profession chains (maintainer quest-tagging tool, Wowhead tags), the talent playground with guide builds, profession advice, "where to next" and the alt comparison chart. After that, M3: the sync agent, Battle.net login, a planning view and theme polish.

## State at the end of M2 part 1

**What exists.** Branch `m2-curated-data`, commits `63d1549`..`287b953`. Curated data types and loaders (`63d1549`); link overrides applied and a quest-tag index (`0b11d6d`); the browser capture snippet `tools/wowhead/capture.js` and the builder `pnpm curated:build` (`bd17073`, with the read-only mirror fix in `3c2d72b`); the owner guide `docs/wowhead-data-guide.md` (`5ab3ec9`); profession, class and race filtering from the curated tags in core (`b152df5`); the web app loads the curated files and hides chain steps the character cannot take (`287b953`). The files `data/curated/quest-tags.json`, `overrides.json` and `zones.json` hold the owner's first collection: 150 zones and 114 class and profession tags; more pages can be added. Formats: section "Data formats" of `docs/superpowers/plans/2026-11-20-m2-curated-data-and-tags.md` and spec section 8.

**Verified.** Reported by the Task 6 implementer; not re-run for this note.
- `pnpm test` (514 tests, 40 files) and `pnpm typecheck` pass.
- Addon tests pass: 128 successes, 0 failures.
- `pnpm --filter web test:e2e` passes.
- Throwaway container image check passes; the container and volume were removed afterwards.

**NOT verified.**
- `tools/wowhead/capture.js` has never run against a live Wowhead page.
- The page URLs and the profession list in `docs/wowhead-data-guide.md` come from the spec and are unverified.
- The real effect on chains is unseen until data exists.
- A read-only open of a WAL-mode mirror may still create `-shm` and `-wal` side files (the test covers only non-WAL databases).
- Docker Compose was not re-checked for M2.

**Owner actions.**
1. If you use the local server on :3000, restart it: the e2e run rebuilt `apps/web/build`.
2. Follow `docs/wowhead-data-guide.md` on one class page and one profession page first (for example Shaman and Cooking). Report what the snippet prints before collecting the rest.
3. Recreate the container to pick up the new code: `podman compose up -d --build --force-recreate`. Note that `podman build -t forevertracker:dev .` retags the image the compose stack uses.
4. Later: the M2 cleanup list (below).

**Known small issues** (deferred in the reviews; none blocks this part).
- `capture.js` takes the largest table, so rows can include header rows (a zone named after a header); zone rows without a level are not reported.
- `capture.js` removes every substring matching the page name (`rest.split(name)`), not only the title.
- The builder gives the same message for invalid JSON and an invalid capture shape, assumes `data/curated` exists, and has no tests for `main()` or the invalid-capture message.
- `readQuestIdsReadonly` duplicates the `readQuestIds` SQL filter (drift risk).
- The guide calls quest 96626 "Camping 101"; its real name is "Camping 101: Cooking". Two wording nits.
- `chainProgress` checks "fewer than 2 members" against the full group, so a chain with one usable member can list as a chain of one; a completed but unusable member shows "unavailable"; no test for the one-usable case.
- Stale INTERIM comments in `professions.ts` and `next-up.ts`; no test for a tag naming a profession missing from the catalogue; duplicate helpers in one test.
- The Quests-tab chain test asserts `every(total<=2)`, which passes with no chains; no web-level test of Next up tag filtering; the "logged once" behaviour is untested.
- The curated directory walk upwards can reach `/data/curated` (the `DATA_DIR` volume) inside the image.
- Steps shown for unavailable chain members are dimmed at 0.6 opacity, which may be low contrast.

## State at the end of M2 step 3

**What exists.** Branch `exploration-view`, commits `f3609f0`..`84a16ea`. Race faction and the quest side filter (`factionOfRace`, `sideAllows` in `packages/core/src/advice/faction.ts`); per-zone quest completion (`placeZones`, `zoneProgress` in `packages/core/src/advice/exploration.ts`); the Explore tab on each character, `/c/<guid>/explore/`, with a zone list, what is left and skipped quests in visited zones. Completion is quest-based only: no map exploration, no dungeons or raids, no "where to next" (step 4).

**Known limits.**
- Completion is plain quest completion, so a completion from another region can mark a quest skipped.
- `nextUp` does not yet filter by quest `side` (follow-up, not done).
- About 1,180 quests (class, profession, event and other quests with no map zone) are not counted in the Explore tab.

**Owner check.** Rebuild with `podman compose up -d --build --force-recreate`, open a character's Explore tab, and compare a zone count with the same zone on the Quests tab.

**Next: M2 step 4** ("where to next" levelling areas), then the alt comparison chart (step 5), profession advice and the talent playground (step 6). M2 cleanup at the end: sync rate and Retry-After, login rate limit, and session binding with the cookie `secure` flag.

## M2 cleanup: found in the browser run-through (21 November)

To tackle next. Items 1 to 3 are one small round (recommended first); the rest can follow in any order.

1. **Done (route "now" marker).** It sits on the last place first reached (Hillsbrad Foothills) rather than the character's current zone (Darkshore, `state.mapId`). Mark the current zone instead.
2. **Done (hide a place, on the Explore tab, with "Hidden places" to show them again).** Flown-over places recorded before the taxi fix (Searing Gorge, Burning Steppes, Stranglethorn) still show on the Journey route and as visited zones on Explore. Add a "hide this place" control, stored in the app database like manual completion.
3. **Done (continent maps filtered in the reads and at the addon).** "Kalimdor" appears as a route place and events read "First visit to The Great Sea, Eastern Kingdoms". Filter continent map ids (for example 1414, 1415) and sea subzones out of the route.
4. **Done (shows "Completed an unknown quest"; a content sync will still name more of them).** Raw quest ids on the Journey tab.** "Completed quest 94499" appears for quests the mirror does not know (Forever-specific ids). Run a content sync, and show "unknown quest" instead of a bare id.
5. **Done (Blizzard quest data supplies class, race, profession and faction; see below).** Race and class quests are untagged, so Explore totals include quests the character cannot do (Zephras Isle 81 for a Dwarf, Teldrassil 59, "Hallowed Memorandum" for a Shaman). Needs the remaining class, race and profession captures (docs/wowhead-data-guide.md).
6. **Done (copies with one name and level in a zone count once, preferring the finished one).** Same-name duplicates. Dun Morogh lists "The Sparklematic 5200!" four times at level 30 (separate quest ids with one name). Decide whether to merge them in Explore.
7. **Levels 11 to 19 on the test character have no time per level** (level-up events never recorded). The addon fix (commit 0b714a1) covers new levelling only. Show "not recorded" for the gap on the Journey chart, and check after the next level-up that the Journey tab shows it (if not, bring back the saved data).
8. **Done (static/favicon.svg, linked in app.html).** Favicon: `/favicon.ico` returns 404 on every page.
9. **No override possible yet.** The owner says the shared Welcome! is quest 5805, but neither 5805 nor 5841 is in the test character's completed list, so the game does not report it done; use "Mark as completed" for now. Recheck after the next content sync. Welcome! (Dun Morogh) shows as not done because the game completed a Forever-specific id the mirror lacks. After a content sync, check whether it clears; otherwise add a curated override mapping the real id to 5841.

## Blizzard's Forever game data (found 21 November)

- Blizzard has an undocumented Forever API (notes: https://mhuijskens.com/WoWForever/Api/). Namespace `static-forever-eu` serves `/data/wow/quest/{id}` with title, area or category, and `requirements` (classes, races, faction, prerequisite quests, reputations). The quest index lists only categories, areas and types, so quests are fetched by id. It has no level field.
- `pnpm blizzard:quests` (tools/fetch-blizzard-quests.ts, uses BLIZZARD_CLIENT_ID and BLIZZARD_CLIENT_SECRET from `.env`) fetches every mirror quest id, ids from the last run and any ids on the command line (use it for completed ids the mirror lacks), and writes data/curated/blizzard-quests.json (3920 quests: 721 class, 212 race, 518 faction, 104 profession). The file is loaded with the curated data: your Wowhead capture tags win for a quest and kind; Blizzard's faction replaces the mirror's side; titles name unknown quests on the Journey tab.
- 11 mirror quest ids are not in Blizzard's data (1374, 1375, 1380, 1381, 2358, 2521, 3504, 3506 and three more). Wowhead shows only 1374 as removed from the game; 1375 and 1380 are still in it, so absence from Blizzard's data does not mean removed. Welcome! (5841) is in Blizzard's data though Wowhead says it is gone, so there is no reliable "removed" signal.
- Decisions (21 November): Blizzard's data replaces captured tags for any quest it knows (captures stand only for quests it lacks); all quest, item and spell links go to Wowhead (`https://www.wowhead.com/forever/quest=<id>`); the "no longer in the game" list is the last low-impact item, and "Mark as completed" covers it meanwhile.
- Quests only Blizzard knows (2,248 of the 6,099 found by walking ids 79000 to 99999; Blizzard has no quest index and no level field) are named on the Journey tab. 862 of them are also added to Explore and Next up (`synthesizeQuests`): those whose Blizzard area is a curated zone with levels and a known map id. Their level is the middle of the zone's range, which is a guess. They have no chain links (only 7 of the 2,248 list prerequisites) and no start or end points. Call of Water (94499) and the other quests with no area (635, 356 of them class quests) are still not in chains or Explore; they need a level and a zone from Wowhead or another source. Mount Hyjal (230 quests) is not added because it has no curated levels and no known map id.
- Open for M3: whether to drop ForeverDB entirely (Blizzard now covers quests; talents, professions and zones need checking), and whether the profile `quests` document (characters of level 10 and up, updated at logout) can replace the addon's completed-quest list.

## To capture or verify once the milestones are done

Wowhead is read by hand, so keep this short and do it in one sitting at the end.

- Zone level ranges and territory (data/curated/zones.json): recheck after patches; Blizzard has no zone data in the API we found.
- Quest levels for quests only Blizzard knows (the 94xxx, 96xxx and similar ids), if we add them to chains and Explore.
- Quests removed from the game (Welcome! 5841, 1374 and any others): the "no longer available" line on each Wowhead page, which has no filter.
- Remaining capture-based tags are only needed for quests Blizzard lacks; check how many that is after the next `pnpm blizzard:quests`.
- Re-run `pnpm blizzard:quests` (and a content sync) after every game patch.
- Profession advice and talent data: compare ForeverDB's against Blizzard's static data before deciding whether to drop ForeverDB (M3).
