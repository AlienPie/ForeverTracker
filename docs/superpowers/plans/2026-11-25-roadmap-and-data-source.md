# Roadmap and data-source plan (25 November 2026)

> **For agentic workers:** read this first, then `docs/superpowers/specs/2026-11-01-forevertracker-design.md` (the design) and the newest sections of `docs/superpowers/m1-kickoff.md` (state and cleanup notes). Steps use checkboxes. Do not push unless the owner says so.

**Goal:** refocus the next development rounds after M2 step 3 and the Blizzard-data work, settle where quest, talent and profession data comes from, and record the feature ideas so they survive a change of machine.

**Spec:** `docs/superpowers/specs/2026-11-01-forevertracker-design.md`

## Owner decisions (25 November)

- **Security fixes are parked.** The app stays local only, so the login rate limit, session binding and cookie `secure` flag move to the backlog. (The compose file publishes the port on all interfaces on the owner's machine; that is the owner's call.)
- **Data source:** prefer Blizzard's Forever API for everything it can give, Wowhead links and tooltips for display (allowed), and drop ForeverDB if possible. The finding below says it is only partly possible today.
- **Feature order:** where to next, profession advice, talent playground, then the alt comparison chart (the owner mostly plays one main, so alts come later).
- The owner works from a laptop when travelling; setup notes are at the end.

## Where things stand

Done: M0, M1, M1.1, M2 steps 0 to 3 (curated data, tag-aware chains, Explore tab), the first M2 cleanup rounds (route "now" marker, continent maps, hide a place, unknown quest names, same-name merge, favicon), and the Blizzard integration (class, race, profession and faction requirements for 6,099 quests, race-locked zones, 862 Blizzard-only quests in Explore). Wowhead links everywhere. All pushed to `origin/main`.

Not done, in the owner's order: step 4 where to next, step 6a profession advice, step 6b talent playground, step 5 alt chart. Then M3 (sync agent, Battle.net login, planning view) and M4 (see the design, section 11).

## Data-source finding: can ForeverDB be dropped?

Not yet. Measured on 25 November against the mirror (3,862 quests) and Blizzard's quest data (6,099 quests):

| Data | Blizzard Forever API | ForeverDB mirror |
|---|---|---|
| Quest id, title, description, area name | yes, all 6,099 | 3,862 |
| Class, race, faction, profession requirements | yes | no |
| Rewards (experience, items, reputation) | yes | not checked |
| **Quest level** | **no** (only a minimum level on 1 quest) | 3,854 of 3,862 |
| **Chain links (prerequisites)** | 32 of the 2,144 mirror quests that have them | 2,144 (from CMaNGOS Classic data) |
| **Quest giver and turn-in NPC with map coordinates** | **no** | about 3,730 of 3,862 |
| Zone map ids and zone level ranges | no (quest areas only; no map endpoint) | map ids yes; ranges come from the curated Wowhead file |
| Talent trees (651 talents, 27 spec trees) | yes | yes |
| Professions and every recipe | yes | yes |
| Quest list by area | yes (`/data/wow/quest/area/{id}` lists quests; the quest index lists only areas, categories and types) | |

ForeverDB's chain, level and giver data is classic CMaNGOS data, which Blizzard's API does not carry. The Quests tab (chains, Next up) and Explore depend on it. So the practical answer is a hybrid:

- **Blizzard is authoritative** for existence, names, requirements, rewards, talents and professions.
- **ForeverDB is kept only for chains, levels, givers and coordinates.** That data is static Classic data, so one sync per game patch is enough. The sync-rate cleanup items (30 a minute from 12 December, Retry-After) are then a minor concern.
- A later option is to replace ForeverDB's quest data with the open CMaNGOS classic database (check its licence first). That would remove the API dependency altogether. Not planned yet.

## Round 1: finish the data decision (small)

- [ ] Make Wowhead the default tooltip provider (`TOOLTIP_PROVIDER` defaults to `none` today; links already go to Wowhead). Check the tooltips render on the Quests, chain and Explore pages for Forever quests (`https://wow.zamimg.com/js/tooltips.js` with `/forever/` links).
- [ ] Replace the id walk with the area listing: `pnpm blizzard:quests` should read `/data/wow/quest/area/index` and each area's quest list to get every quest id, then fetch the quests. Keep the id range as a fallback. This also finds the ids below 79000 that were never walked.
- [ ] Spike, then record in the kickoff note: Blizzard's character profile for a level 10 or higher character (`profile-forever-eu`, by first name and surname, public with client credentials). Check `quests` (completed list), `professions`, `specializations`, `achievements`, `reputations`. The result decides what the M3 sync agent can read without the addon.
- [ ] Spike: Blizzard's profession recipes and talent trees against what the Professions and Talents tabs and the planned advice need (recipe levels, trainers and gathering spots are probably not in Blizzard's data).
- [ ] Quest levels for Blizzard-only quests: try estimating from the experience reward (the Classic quest experience table) against mirror quests of known level; if the estimate is good, replace the zone-midpoint guess.
- [ ] Decide: keep the ForeverDB mirror for chains, levels and givers (recommended), or replace it with CMaNGOS data.

## Round 2: where to next (M2 step 4)

Rule-based levelling areas for a character: zones whose level range fits, weighted by quests left (from Explore), faction territory, and what the character has already done. Show why each zone is suggested and link to the Explore tab for the zone.
- [ ] Pure function in `packages/core/src/advice` plus tests; reuse `zoneProgress` fit and counts.
- [ ] A "Where to next" block on the Quests tab (or Explore), with the reason line the design requires.
- [ ] Use quest experience rewards (from Blizzard) to estimate how much of the next level a zone can give.

## Round 3: profession advice (M2 step 6a)

- [ ] Recipes to learn or skill up at the current rank, from Blizzard's profession data.
- [ ] Trainer and gathering-spot data: check what Blizzard or the mirror holds; collect the rest from Wowhead by hand if needed (no scripted fetching of Wowhead).
- [ ] Optional, rule-based: profit hints from the Forever auction house data (`dynamic-forever-eu`, ruleset 2 is Normal), which Blizzard serves.

## Round 4: talent playground (M2 step 6b)

- [ ] Standalone page from Blizzard's talent trees (prerequisites and tiers enforced), saved and shareable by URL.
- [ ] Compare with the character's real build (profile `specializations` or the addon snapshot) and curated guide builds.
- [ ] Check whether Forever loadout strings can be imported and exported.

## Round 5: alt comparison chart (M2 step 5)

- [ ] Level against date, all characters on one chart (data already in Journey events).

## Then

- **M3:** sync agent first (automatic upload), then Battle.net login, planning view, theme polish. The Round 1 profile spike tells us how much the agent can pull from the API versus the addon.
- **M4:** see the design. The backup and restore item is small and can go in earlier.
- **Cleanup that stays:** item 5 done; item 7 (time per level at levels 11 to 19, check after the next level-up); item 9 (Welcome! is not reported by the game; "Mark as completed" covers it); the removed-quests list (last, low impact); the deferred small issues in the kickoff note; the parked security fixes.

## Feature ideas (brainstorm, 25 November; none are committed work)

Ranked by value for a levelling and exploring player, with what each needs.

1. **Quest reward advisor.** For "pick one" rewards, say which item suits the class (item stats from Blizzard's item API). Rule-based. Fits Next up and chain pages.
2. **Level planner and pace ETA.** Quest experience from Blizzard against the experience a level needs, so "these zone quests get you to the next level" and a time estimate from Journey pace. Pairs with Where to next.
3. **Trainer and skill-cap reminders.** "You can learn new spells" and "your profession skill cap is 75 at this rank, train the next rank" at the right levels.
4. **Quest hub route.** Group the quests of a zone by giver location (the mirror has NPC coordinates) into a pickup order, so one trip starts many quests.
5. **Group and dungeon quest flags.** Mark elite or dungeon quests so Next up does not suggest a group quest to a solo player; feeds the M4 dungeon planner.
6. **Reputation tracker.** Standing per faction from the profile (`reputations`), with the quests that raise it.
7. **Achievement tracker.** Forever has 176 achievements with their own ids; show progress and what is close.
8. **Collections.** Mounts (141), pets (109) and toys (12) owned versus available, with where to get each.
9. **Crafting profit.** Auction prices (per ruleset) against recipe materials, for the profession advice round.
10. **Backup, restore and a "since your last upload" recap** (gold trend, quests done). Small; also useful when moving between machines.
11. **Quest log pressure warning.** Remind when the log is nearly full and list the oldest unfinished quests.
12. **Share card.** A picture of a character's progress (M4).
13. **Daily plan** ("what am I doing with this character today"), the design's "later" goal, assembled from the above once they exist.

## Picking this up on another machine

- Clone over SSH: `git clone git@github.com:AlienPie/ForeverTracker.git`.
- Tools: Node 26 (nvm), pnpm 12, Podman (not Docker; on macOS use a Podman machine). Then `pnpm install`, `pnpm typecheck`, `pnpm vitest run --project @ft/core --project web`, `cd addon && ./test.sh`.
- Not in the repo: `.env` (copy `.env.example`; needs `FOREVERDB_API_KEY`, `BLIZZARD_CLIENT_ID`, `BLIZZARD_CLIENT_SECRET`, `OWNER_PASSWORD`, `SESSION_SECRET`), and `data-local/` (the SQLite database with mirror and characters). Copy `data-local/` across or run `pnpm content:sync` to rebuild the mirror; characters come back from an addon upload.
- Curated data (`data/curated/`, including `blizzard-quests.json`) is in the repo. Refresh it with `pnpm blizzard:quests` after a game patch.
- The addon install path differs on macOS; install the addon folder into the game's `_forever_/Interface/AddOns` and check SavedVariables flush (open item 4 in the design).
- Standing rules: push only when the owner says so; Podman; rule-based advice, no LLM; Wowhead is collected by hand, never scripted; never commit secrets, the WoW account folder name, real character names or home paths.
