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
