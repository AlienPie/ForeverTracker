# M1 bugs and tweaks

Running list from using the M1 dashboard against real game data. Add items as they turn up; group them into a fix pass later.
Format: what the owner saw, what we found, the proposed fix, status.

## Staging (decided 2026-11-05)

| # | Item | Stage |
|---|---|---|
| 1 | Profession quests the character cannot use in Next up | M1.1 (interim name rule), M2 (Wowhead tags replace it) |
| 2 | Quest chains: tighter list, open a chain | M1.1 |
| 3 | Quest log lists (in progress, completed) | M1.1 |
| 4 | Journey as sessions, pace strip, route strip | M1.1 |
| 5 | Alt comparison chart | M2 |
| 6 | Surname on roster cards | M1.1 |
| 7 | "Where to next" levelling areas | M2 (needs the zones data from the maintainer tool) |

M1.1 plan: `docs/superpowers/plans/2026-11-05-m1-1-quests-journey.md`. Reason for the split: M1.1 items use data we already have and fix things that are visibly wrong; M2 items depend on the maintainer snippet tool, which M2 builds once.

## Quests tab

### 1. Next up suggests profession quests the character cannot use (bug)
- **Seen:** a character with Skinning and Leatherworking (both primary slots full), plus First Aid and Cooking, is offered "Camping 101" quests for Mining and Enchanting.
- **Found (real mirror data, 2026-11-05):** ForeverDB quests have no profession field and no profession prerequisite. The profession is only in the quest name ("Camping 101: Enchanting"). Several of these quests have no `previous` link at all, so prerequisite rules cannot gate them. The curated Wowhead profession tagging from the spec (section 8, M2) would fix this properly.
- **Proposed fix (interim, from ForeverDB data only):** treat a quest whose name ends in `: <profession name>` (names taken from the mirrored `professions` resource, so Mining, Enchanting, Cooking and so on) as a profession quest. Primary professions: offer only when the character has that profession, or still has a free primary slot (two slots), with a "profession" tag and reason. Secondary professions (Cooking, First Aid, Fishing): offer when not yet learned. Needs the character's learned professions (already in the snapshot) and the profession kind (`primary`/`secondary`, already in the mirror) passed into `nextUp`. The `professions` input already exists and is unused (v1 note in `next-up.ts`).
- **Later:** replace the name rule with the Wowhead-derived tags once the maintainer tool exists.
- **Status:** done in M1.1 as an interim, name-based rule (commit ranges in the kickoff note, "State at the end of M1.1"); the Wowhead-tag version is M2.

### 2. Quest chains list chains the character is not really on, and cannot be opened (tweak)
- **Seen:** "Quest chains" lists chains the owner does not think they are on, and there is no way to inspect one.
- **Found:** `chainProgress` reports any chain where at least one member is completed or in the log. Shared early quests (for example a race starter that is the prerequisite of every class's follow-up) pull a character into chains they have only touched at the first step.
- **Proposed fix:** (a) make each chain a link to a chain page (for example `/c/<guid>/quests/chain/<questId>`) listing every quest in the chain in order, with done / in log / not started, level, giver and zone, and the current step highlighted; (b) tighten which chains appear in the side list: only chains with a quest in the log, or whose latest completed step has a next step the character has not done; show completed-chain count separately; (c) show chain size and "step N of M" more clearly.
- **Status:** done in M1.1 (commit ranges in the kickoff note, "State at the end of M1.1").

### 3. Quest log shows counts only (tweak)
- **Seen:** the quest log panel says how many are in progress and completed, with no names.
- **Proposed fix:** a quest log section on the Quests tab (or a sub-page) with two lists: In progress (name, level, zone) and Completed (name, level, zone; searchable or paged, since it can reach thousands). Names come from the quest mirror by id. Completed ids are already in the snapshot (`completedIds`); ids missing from the mirror show as "Quest <id>".
- **Status:** done in M1.1 (commit ranges in the kickoff note, "State at the end of M1.1").

## Journey tab

### 4. Journey rebuilt as a journal (tweak, approved direction)
- **Seen:** the Journey tab is one long list of events.
- **Agreed design (2026-11-05):** (1) play sessions as the unit: events grouped into sessions (a gap of 30 minutes or more starts a new one), each shown as one summary line (date, length, level change, places, professions) that expands to its events; (2) a pacing strip of time per level from the level-up timestamps, with chapter detail on click; (3) a route strip: places in the order first seen, drawn as a connected path with a marker per level-up. Mockup: `docs/design/m1/journey.html`.
- **Limits:** only first visits are recorded, not time in each zone (needs more from the addon); event times are real-world time, so offline gaps stretch a level (sessions handle this).
- **Status:** done in M1.1 (commit ranges in the kickoff note, "State at the end of M1.1").

### 5. Alt comparison chart (M2)
- All characters on one chart, level against date, to compare how fast each one levelled. Approved for a later stage, after item 4.
- **Status:** M2.

## Roster

### 6. Roster cards do not show the character's surname (bug)
- **Seen:** WoW Forever characters have a surname; the roster does not display it.
- **Found (2026-11-05):** the read model already carries `surname` (from the snapshot's `identity.surname`) and the character page header already renders it (`c/[guid]/+layout.svelte`, styled `.surname`). `CharacterCard.svelte` on the roster uses only `name`.
- **Proposed fix:** show the surname on the roster card the same way as the character header (name, then the surname in the dim italic style), and keep it readable at 375px. Check the real data has a surname: the addon splits the in-game name at the first `-` (`Collectors/Identity.lua`); confirm with the owner's real character before closing.
- **Status:** done in M1.1 (commit ranges in the kickoff note, "State at the end of M1.1").

## Ideas

### 7. Future levelling areas ("where to go next") (idea)
- **Idea:** from the character's current level, suggest the regions to move on to next.
- **Found (2026-11-05):** ForeverDB's `zones` records carry only id, name, type, parent and a link: no level range. A usable range can be derived from the mirrored quests, since every quest has a level and (for most) a zone: the spread of quest levels per zone (for example the 10th to 90th percentile, or the level where most quests sit) gives a zone's levelling band. Class and category "zones" (for example "Shaman") and null zones are excluded, as in the next-up rules.
- **Proposed shape:** a "Where to next" panel on the Quests tab (and a one-line hint on the roster card): the current zone with how much of it is done (completed vs available quests at or below the character's level), then the 2 to 3 zones whose band starts within a few levels above the character's level, closest first, each with its band and quest count. Honest about the data: "based on quest levels in ForeverDB", no claim about travel routes or faction access unless the data supports it (zone `parentId` gives the continent; faction and flight-path links are not known).
- **Better source (owner's suggestion, checked 2026-11-05):** Wowhead's Forever zones page (`https://www.wowhead.com/forever/zones`, one table of 144 rows) lists, per zone, a level range, territory (Alliance, Horde or Contested), instance type (dungeon, raid, battleground) and whether the zone is new or changed. That fits the spec's maintainer-tool model (spec section 8): a browser-console snippet, run by a person on the page they have opened, extracts `zones.json` (name, min level, max level, territory, instance type, changed flag) into `data/`; the app never fetches Wowhead. A validation script matches names against the ForeverDB `zones` mirror and reports misses. This also answers the faction question: filter zones by the character's faction (Alliance or Horde plus Contested) and hide dungeons, raids and battlegrounds from "where to next".
- **Caveats:** some ranges are very wide or odd (for example a starter zone listed 1 to 56 after a level change, one zone 36 to 61), and some zones have no range. Use the quest-derived band as a cross-check or fallback, and show "no recommendation yet" when neither exists. Curated files record the game build and source, as the spec requires.
- **Needs:** the maintainer snippet and `data/zones.json` (with build and source), a per-zone helper in `packages/core` merging the curated range with the quest-derived band (pure, tested on real fixture rows), cached with the quest catalog.
- **Status:** M2 idea (needs `data/zones.json` from the maintainer tool).

## New feature ideas (from the owner, 2026-11-05; not yet planned)

Priorities as stated: exploration and completion matter most to the owner (not power levelling or end game); backup/restore is wanted so moving computers or rebuilding the app does not mean re-syncing ForeverDB or re-creating tokens; the pace/ETA idea is nice to have only.

### 8. "Since your last upload" recap, with gold and played-time trends (idea)
- **Idea:** compare each upload's snapshot with the previous one: levels gained, quests handed in, gold earned or spent, hours played, new places; and charts of gold and total played time across uploads.
- **Data:** every upload is already stored as a snapshot (`snapshot` table keyed by character and `takenAt`, `state.money` in copper, `time.played` in seconds), so no addon change. Resolution is per upload, not per minute.
- **Overlap with the Journey:** the Journey already shows time per level and session lengths from events. The recap and the gold chart add what the Journey does not have (gold, total played, per-upload deltas); a separate played-time chart would mostly repeat the Journey and is optional.
- **Status:** wanted, unscheduled.

### 9. Exploration and completion view (idea, high priority for the owner)
- **Idea:** the owner is interested in exploring more than levelling speed. A completion-first view: per zone, how much of its quests you have done ("Dun Morogh: 78%"), what is left, quests you skipped in zones you have visited (framed as things left to discover, not lost XP), places visited, flight paths unlocked, and later a world overview of zones by completion.
- **Data now:** completed quest ids (complete) against the mirror's quest-to-zone links give solid per-zone completion; zone level range and territory (Alliance, Horde, Contested) come from the Wowhead zones data planned for M2 (item 7), so item 7 and this share the zones file. Quests with no zone, class quests and category "zones" need the same handling as in Next up.
- **Known gap:** true map exploration (areas uncovered) is NOT captured: the addon records first visits by map and subzone, and subzone text is often empty on this client; flight paths are captured but unverified. To measure real exploration, the addon would need an exploration-discovery API check in game (to verify first), then a collector and schema change. Treat quest-based completion as v1 and exploration capture as a follow-up experiment.
- **Status:** wanted, to plan.

### 10. Level pace and ETA to the level cap (idea, low priority)
- Average time per level from the Journey data and "at this pace you reach the cap in about N hours played"; compare alts. Nice to have only.
- **Status:** later.

### 11. Backup and restore (idea, wanted)
- **Idea:** export everything the app holds so a move to another computer or a rebuild needs no re-sync of ForeverDB and no new tokens. Everything lives in one SQLite file: characters, snapshots and events, device tokens (stored as hashes, so existing tokens keep working after a restore), settings, and the content mirror.
- **Proposed shape:** a consistent online copy of the database (better-sqlite3 backup API, safe while the app runs): a "Download backup" button on Settings, a CLI for scheduled use (`node /app/backup.mjs <file>` in the container), and a restore path (CLI first: `node /app/restore.mjs <file>` with the app stopped, then optionally an upload form with a clear warning that it replaces the current data). Option to leave the content mirror out for a smaller file (it can be re-synced), default included to save re-syncing.
- **Not in the backup (by design):** `.env` secrets (ForeverDB API key, owner password, session secret, Blizzard client) stay in `.env`; the README should say to copy them separately. After a restore the owner's session cookies are invalid if `SESSION_SECRET` changed (just log in again).
- **Checks needed:** restore must refuse a file from a newer schema than the app, and a file that is not a ForeverTracker database; run migrations after restore for older files; keep the file permissions private; the download is behind the login.
- **Status:** wanted, small; a good first item for the next pass.

### 12. Chains count quests whose first quest was never taken (bug, owner's finding after testing M1.1)
- **Seen (2026-11-05):** some quests are shared across starting regions (for example "Camping 101: Cooking"). ForeverDB records them per region (separate quest rows, each with its own "The Great Outdoors" parent and a zone such as Elwynn Forest), but the character took the Dun Morogh route. A completed quest id then makes the other region's chain look partly done.
- **Found (real mirror rows):** 96626 "Camping 101: Cooking" (Elwynn Forest) has previous 95998 "The Great Outdoors" (Elwynn Forest) which has previous 96627; 96629 (Dun Morogh) has previous 96608 which has none; 96646 (Zephras Isle) and 96655 (Durotar) follow the same pattern. The chain code counts any completed member without checking that the chain's earlier quests were done.
- **Owner's rule:** quests can only happen starting from the first one, so a completed quest whose earlier quests in the chain are not completed is not tracked as part of that chain.
- **Proposed fix:** progress counts a completed quest toward a chain only when every earlier quest (all transitive prerequisites that are sequence links: complete first, chain link, offered after, next quest) is also completed; a chain is listed only when it has valid progress or a quest in the log; the chain page shows such quests honestly as "completed from another route" and keeps them out of the "N of M done" count; Next up's chain continuation already requires done prerequisites. Treat the shared-id case by the same rule (no special casing).
- **Status:** bugfix for M1 (see the `m1-bugfix-chain-roots` work).

## Later milestone ideas (owner, after M1 to M3 are complete)

Order stated by the owner: after the other milestones are done.

### 13. Automatic upload (sync agent): "please yes" (already planned as M3)
- A small agent on the game machine that watches `SavedVariables/ForeverTracker.lua` and uploads when it changes, using a device token. Already in the spec as the M3 sync agent. Owner priority is high: build it first in M3, ahead of Battle.net login and the planning view. Needs: cross-platform (Linux, macOS, Wine/Proton paths), token in a config file, retry and backoff, quiet by default, run as a service or on login.

### 14. Dungeon planner and tracker (idea)
- From the mirror's dungeons (47): level ranges, which are in range, what quests each offers, and a per-character tracker (done, quests outstanding). Possibly a cross-alt view of who is ready for which dungeon.

### 15. Gear tab with best-in-slot at level caps (idea)
- The addon already records equipped gear (item ids by slot). Show it with item names, plus recommended best-in-slot gear at the level caps of 30, 40, 50 and so on, and where to find each piece (source dungeon, quest, vendor or profession). Needs item data (ForeverDB items on demand) and curated BiS lists from guides recorded as facts with sources and game build, in the same maintainer-tool style as the talent builds (spec section 8). Depends on guide coverage for Forever.

### 16. Quest finder (idea; build with the class, race and profession quest tags in M2)
- Search the mirrored quests ("where do I get this?"): name, level, zone, giver, chain, and the class, race or profession tag once the Wowhead-derived tags exist.

### 17. Share card (idea)
- A read-only page or image of a character's journey (level, professions, route, milestones) that can be sent to friends. Self-hosted privacy: opt-in per character, an unguessable link, revocable; must not expose the owner login or other characters.

Staging: items 13 to 17 are after the M3 milestone (M4 backlog), except that the sync agent (13) leads M3.
