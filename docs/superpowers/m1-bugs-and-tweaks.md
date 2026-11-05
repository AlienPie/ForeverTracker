# M1 bugs and tweaks

Running list from using the M1 dashboard against real game data. Add items as they turn up; group them into a fix pass later.
Format: what the owner saw, what we found, the proposed fix, status.

## Quests tab

### 1. Next up suggests profession quests the character cannot use (bug)
- **Seen:** a character with Skinning and Leatherworking (both primary slots full), plus First Aid and Cooking, is offered "Camping 101" quests for Mining and Enchanting.
- **Found (real mirror data, 2026-11-05):** ForeverDB quests have no profession field and no profession prerequisite. The profession is only in the quest name ("Camping 101: Enchanting"). Several of these quests have no `previous` link at all, so prerequisite rules cannot gate them. The curated Wowhead profession tagging from the spec (section 8, M2) would fix this properly.
- **Proposed fix (interim, from ForeverDB data only):** treat a quest whose name ends in `: <profession name>` (names taken from the mirrored `professions` resource, so Mining, Enchanting, Cooking and so on) as a profession quest. Primary professions: offer only when the character has that profession, or still has a free primary slot (two slots), with a "profession" tag and reason. Secondary professions (Cooking, First Aid, Fishing): offer when not yet learned. Needs the character's learned professions (already in the snapshot) and the profession kind (`primary`/`secondary`, already in the mirror) passed into `nextUp`. The `professions` input already exists and is unused (v1 note in `next-up.ts`).
- **Later:** replace the name rule with the Wowhead-derived tags once the maintainer tool exists.
- **Status:** open.

### 2. Quest chains list chains the character is not really on, and cannot be opened (tweak)
- **Seen:** "Quest chains" lists chains the owner does not think they are on, and there is no way to inspect one.
- **Found:** `chainProgress` reports any chain where at least one member is completed or in the log. Shared early quests (for example a race starter that is the prerequisite of every class's follow-up) pull a character into chains they have only touched at the first step.
- **Proposed fix:** (a) make each chain a link to a chain page (for example `/c/<guid>/quests/chain/<questId>`) listing every quest in the chain in order, with done / in log / not started, level, giver and zone, and the current step highlighted; (b) tighten which chains appear in the side list: only chains with a quest in the log, or whose latest completed step has a next step the character has not done; show completed-chain count separately; (c) show chain size and "step N of M" more clearly.
- **Status:** open.

### 3. Quest log shows counts only (tweak)
- **Seen:** the quest log panel says how many are in progress and completed, with no names.
- **Proposed fix:** a quest log section on the Quests tab (or a sub-page) with two lists: In progress (name, level, zone) and Completed (name, level, zone; searchable or paged, since it can reach thousands). Names come from the quest mirror by id. Completed ids are already in the snapshot (`completedIds`); ids missing from the mirror show as "Quest <id>".
- **Status:** open.

## Journey tab

### 4. Journey rebuilt as a journal (tweak, approved direction)
- **Seen:** the Journey tab is one long list of events.
- **Agreed design (2026-11-05):** (1) play sessions as the unit: events grouped into sessions (a gap of 30 minutes or more starts a new one), each shown as one summary line (date, length, level change, places, professions) that expands to its events; (2) a pacing strip of time per level from the level-up timestamps, with chapter detail on click; (3) a route strip: places in the order first seen, drawn as a connected path with a marker per level-up. Mockup: `docs/design/m1/journey.html`.
- **Limits:** only first visits are recorded, not time in each zone (needs more from the addon); event times are real-world time, so offline gaps stretch a level (sessions handle this).
- **Status:** mockup, then plan.

### 5. Alt comparison chart (later)
- All characters on one chart, level against date, to compare how fast each one levelled. Approved for a later stage, after item 4.
- **Status:** later.

## Roster

### 6. Roster cards do not show the character's surname (bug)
- **Seen:** WoW Forever characters have a surname; the roster does not display it.
- **Found (2026-11-05):** the read model already carries `surname` (from the snapshot's `identity.surname`) and the character page header already renders it (`c/[guid]/+layout.svelte`, styled `.surname`). `CharacterCard.svelte` on the roster uses only `name`.
- **Proposed fix:** show the surname on the roster card the same way as the character header (name, then the surname in the dim italic style), and keep it readable at 375px. Check the real data has a surname: the addon splits the in-game name at the first `-` (`Collectors/Identity.lua`); confirm with the owner's real character before closing.
- **Status:** open, small.

## Ideas

### 7. Future levelling areas ("where to go next") (idea)
- **Idea:** from the character's current level, suggest the regions to move on to next.
- **Found (2026-11-05):** ForeverDB's `zones` records carry only id, name, type, parent and a link: no level range. A usable range can be derived from the mirrored quests, since every quest has a level and (for most) a zone: the spread of quest levels per zone (for example the 10th to 90th percentile, or the level where most quests sit) gives a zone's levelling band. Class and category "zones" (for example "Shaman") and null zones are excluded, as in the next-up rules.
- **Proposed shape:** a "Where to next" panel on the Quests tab (and a one-line hint on the roster card): the current zone with how much of it is done (completed vs available quests at or below the character's level), then the 2 to 3 zones whose band starts within a few levels above the character's level, closest first, each with its band and quest count. Honest about the data: "based on quest levels in ForeverDB", no claim about travel routes or faction access unless the data supports it (zone `parentId` gives the continent; faction and flight-path links are not known).
- **Needs:** a per-zone level-band helper in `packages/core` (pure, tested on the real fixture rows), cached with the quest catalog.
- **Status:** idea, to plan with the Journey and Quests-tab pass.
