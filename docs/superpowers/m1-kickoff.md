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
