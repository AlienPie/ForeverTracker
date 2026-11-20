# M2 Exploration and Completion View (v1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An "Explore" tab per character that lists each open-world zone with its level range and how many of its quests the character has done, what is left, and which were skipped.

**Architecture:** A pure function in `@ft/core` joins the quest catalog (grouped by `quest.zone`), the curated zone list (level range, territory) and the character's progress into one row per zone. The web app adds a `/c/[guid]/explore` page that calls it. Quest-based completion only; real map exploration (areas uncovered, flight paths) is out of scope.

**Tech Stack:** TypeScript, SvelteKit 3 / Svelte 5, vitest 5 (`pnpm vitest run --project @ft/core`, `--project web`), `pnpm typecheck`.

**Spec:** `docs/superpowers/specs/2026-11-01-forevertracker-design.md`, section 11, M2 step 3. Earlier M2 plan for the data and idioms: `docs/superpowers/plans/2026-11-20-m2-curated-data-and-tags.md`.

## Global Constraints

- Rule-based advice only, no LLM. Everything is computed from the mirror plus `data/curated/*.json`.
- The owner's mirror and running container are never written to or touched; tests use invented fixtures. Use invented character names ("Brewdan"), never real ones, home paths or the WoW account folder name.
- Content may be absent (`catalog.quests` empty, no curated files): pages say "content not ready" and never 500.
- Completed and in-log quests are never treated as unavailable (same rule as `buildUsable`).
- Skipped means `skippedMembers` from `packages/core/src/advice/chains.ts` over `chainGraph(...).succ`, computed only when something is completed (as `nextUp` does).
- Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Do not push.

## Facts the tasks rely on (checked against the real data)

- `QuestRow.zone` is `{ n, slug, m } | null`. A place has numeric `m` (uiMapId); class and category "zones" ("Warlock", "Cooking", "Seasonal") have `m: null`; about 380 of 3,862 quests have `zone: null`.
- Quest `zone.n` names equal the curated zone names (Dun Morogh, Stranglethorn Vale, Zephras Isle, ...).
- `data/curated/zones.json` has 150 rows: type `zone` rows are open world; the same name repeats for dungeon or raid variants and a few places (Elwynn Forest, Duskwood) appear twice with `type: "zone"`; about 70 rows have null levels; test maps ("Unused", "Tyler's Test Map (Desolace)") exist and have no quests.
- Mirror quests carry `side`: `"a"`, `"h"` or `"both"`. `QuestRow` does not declare it, but loaded rows keep it at runtime.
- `CharacterCard` has `race`, `class`, `level`, `visitedMaps: {mapId, subzone, firstSeen}[]`, `professions`; `QuestCatalog` has `quests`, `zones?`, `tags?`, `professions?`. `buildUsable` in `apps/web/src/lib/server/usable.ts` returns `(q: QuestRow) => boolean`.

## Review Focus

1. A quest zone missing from the curated list, or no curated zones at all: the zone is still listed, with no level range. (Task 2)
2. Quests with `zone: null` or a class/category zone: never counted in any zone; reported as `unplaced`. (Task 2)
3. A Horde-only quest in a zone an Alliance character explores: not counted. If the character already completed it, it still counts as done. (Tasks 1, 2)
4. A character with no completions and no visited maps: every zone unvisited, no quest lists, no crash. Content missing: "not ready" notice. (Tasks 2, 3)
5. A zone where every quest is unavailable (total 0) or fully done: no NaN or division by zero in the percentage. (Tasks 2, 3)

---

### Task 1: Faction of a race, and quest side

**Files:**
- Create: `packages/core/src/advice/faction.ts`
- Modify: `packages/core/src/advice/content.ts` (add optional `side` to `QuestRow`), `packages/core/src/index.ts` (export)
- Test: `packages/core/test/faction.test.ts`

**Interfaces:**
- Produces:
  - `export type Faction = "Alliance" | "Horde"`
  - `export function factionOfRace(raceToken: string | null | undefined): Faction | null` (letters only, lowercased, like `raceAllows`: Human, Dwarf, NightElf, Gnome are Alliance; Orc, Undead (alias Scourge), Tauren, Troll are Horde; anything else null)
  - `export function sideAllows(q: QuestRow, faction: Faction | null): boolean` (false only when `q.side` is `"a"` and faction is Horde, or `"h"` and Alliance; true for `"both"`, absent, unknown values and a null faction)
  - `QuestRow.side?: string | null`

- [ ] **Step 1: Write the failing tests** in `faction.test.ts`: `factionOfRace("NightElf")`, `("night elf")`, `("Scourge")`, `("Undead")`, `("  Tauren ")` give the right faction; `("Goblin")`, `(null)`, `(undefined)` give null. `sideAllows` table: side `"a"` with Horde is false, with Alliance true; `"h"` with Alliance false; `"both"`, `undefined`, `"x"` true for both; any side true when faction is null.
- [ ] **Step 2:** Run `pnpm vitest run --project @ft/core faction`. Expected: FAIL (module not found).
- [ ] **Step 3:** Implement `faction.ts`, add `side?: string | null` to `QuestRow` (no change to `isQuestRow`), export `factionOfRace`, `sideAllows` and `Faction` from `index.ts`.
- [ ] **Step 4:** Run the same test and `pnpm typecheck`. Expected: PASS, clean.
- [ ] **Step 5:** Commit `feat(core): faction of a race and quest side filter`.

---

### Task 2: Zone progress in core

**Files:**
- Create: `packages/core/src/advice/exploration.ts`
- Modify: `packages/core/src/index.ts` (export)
- Test: `packages/core/test/exploration.test.ts`

**Interfaces:**
- Consumes: `QuestRow`, `CuratedZone`, `CuratedTerritory`, `chainGraph(quests, classToken)` and `skippedMembers(members, succ, completed, inLog)` from `chains.ts`, `Faction`/`sideAllows` from Task 1.
- Produces (exact):

```ts
export type PlaceZone = { name: string; minLevel: number | null; maxLevel: number | null; territory: CuratedTerritory | null };
export type ZoneFit = "below" | "in-range" | "above" | "unknown";
export type ZoneQuest = { id: number; name: string; level: number };
export type ZoneProgress = PlaceZone & {
  mapId: number | null;      // first non-null quest zone.m for this zone name
  fit: ZoneFit;
  visited: boolean;
  done: number; inLog: number; left: number; skipped: number;
  total: number;             // done + inLog + left
  remaining: ZoneQuest[];    // left quests, by level then id; empty unless visited
  skippedQuests: ZoneQuest[];// skipped quests, same order; empty unless visited
};
export type ExplorationInput = {
  quests: QuestRow[];
  zones?: CuratedZone[];
  level: number | null;
  classToken?: string | null;
  faction?: Faction | null;
  completed: Set<number>;
  inLog: Set<number>;
  visitedMapIds: ReadonlySet<number>;
  usable?: (q: QuestRow) => boolean;
};
export function placeZones(zones: CuratedZone[] | undefined, quests: QuestRow[]): PlaceZone[];
export function zoneProgress(input: ExplorationInput): { zones: ZoneProgress[]; unplaced: number };
```

Rules (decided; the tests pin them):
- `placeZones`: keep curated rows with `type === "zone"`; merge rows with the same name (trimmed, case-insensitive), keeping the first row that has levels (else the first); keep only names that have at least one quest with a numeric `zone.m` and the same name; then add every quest zone name with a numeric `m` that the curated list lacks, with null levels and null territory. Sorted by `minLevel` (null last) then name. With `zones` undefined, only the fallback names are returned.
- `zoneProgress` counts each quest whose `zone.m` is numeric and whose `zone.n` matches a place zone: completed gives `done`; else in log gives `inLog`; else not `usable`, or not `sideAllows(q, faction)`: ignored; else in the skipped set: `skipped`; else `left`. Completed wins over in-log. Skipped set is empty when `completed.size === 0`, otherwise `skippedMembers(quests, chainGraph(quests, classToken).succ, completed, inLog)`.
- `visited` is true when `visitedMapIds` has the zone's `mapId`, or `done + inLog > 0`.
- `fit`: `"unknown"` when `level` or `minLevel` is null; `"below"` when level < minLevel; `"above"` when `maxLevel` is not null and level > maxLevel; else `"in-range"`.
- `unplaced`: quests whose zone is null or has `m` null (class and category zones count).
- Zones with `total === 0` and no skipped are kept (the page decides how to show them).

- [ ] **Step 1: Write the failing tests** in `exploration.test.ts`, with small invented `QuestRow` builders (see `packages/core/test/chain-skipped.test.ts` for the idiom). Cases:
  - `placeZones` merges "Elwynn Forest" listed twice (one without levels, one with) into one row with levels; drops a dungeon row, a zone with no quests ("Unused"), and a name that only differs by case/space; adds a quest-only zone with null levels; `placeZones(undefined, quests)` lists only quest zones.
  - Real file guard: load `data/curated/zones.json` through `readCuratedDir` (path `../../../data/curated` relative to the test file) and check `placeZones(zones, [])` has no repeated names (case-insensitive). With empty quests it is `[]`; so call it with one synthetic quest per curated `zone` row name instead.
  - Counting: one zone with quests done, in log, left, skipped (chain 1 -> 2 -> 3 with 1 and 3 done, 2 skipped), unusable (`usable` returns false), and other-faction; assert each count, `total`, `remaining` and `skippedQuests` contents and order.
  - A completed other-faction quest and a completed unusable quest still count as `done`.
  - `unplaced` counts a `zone: null` quest and a `{ n: "Warlock", m: null }` quest, and neither appears in any zone.
  - Visited: by `visitedMapIds`, by a done quest, and not visited with nothing; unvisited zones have empty lists but correct counts.
  - `fit` for level below, inside, above, null level, null min.
  - Zone where all quests are unusable: `total` 0, no throw. Empty `completed`: `chainGraph` is not needed and `skipped` is 0.
- [ ] **Step 2:** Run `pnpm vitest run --project @ft/core exploration`. Expected: FAIL (module not found).
- [ ] **Step 3:** Implement `placeZones` and `zoneProgress` in `exploration.ts`; export the two functions and the types from `index.ts`. Group quests by normalised zone name in one pass; one `skippedMembers` call over the whole catalog.
- [ ] **Step 4:** Run `pnpm vitest run --project @ft/core` and `pnpm typecheck`. Expected: all pass, clean.
- [ ] **Step 5:** Commit `feat(core): per-zone quest completion for the exploration view`.

---

### Task 3: Explore tab and page

**Files:**
- Create: `apps/web/src/routes/c/[guid]/explore/+page.server.ts`, `apps/web/src/routes/c/[guid]/explore/+page.svelte`
- Modify: `apps/web/src/routes/c/[guid]/+layout.svelte` (tab list), `apps/web/src/lib/theme.css` (styles, only what the page needs, reuse existing tokens and the quests page's visual idiom)
- Test: `apps/web/test/explore-page.test.ts`; update `apps/web/test/route-layout.test.ts` or any test that lists the tabs if it breaks

**Interfaces:**
- Consumes: `zoneProgress`, `factionOfRace`, `ZoneProgress` (Task 2); `getQuestCatalogSafe`, `characterOr404(params.guid, undefined, { events: false })`, `buildUsable` exactly as `apps/web/src/routes/c/[guid]/quests/+page.server.ts` uses them.
- Produces: `export type ExplorePageData = { contentReady: boolean; contentMode: ContentMode; level: number | null; visited: ZoneProgress[]; unvisited: ZoneProgress[]; unplaced: number; hasZoneData: boolean }`. `hasZoneData` is whether `catalog.zones` is non-empty (levels shown or not).

Page behaviour (decided):
- Tab `{ slug: "explore", label: "Explore" }` goes right after Quests.
- Not ready (`contentReady` false): the same notice the Quests page shows, nothing else.
- Header line: counts of visited zones and quests done across visited zones.
- "Visited" section: one `<details>` per visited zone, summary shows name, level range, territory, fit label ("in range", "below your level", "above your level"), `done / total` and a percentage. A zone with `total === 0` shows no percentage. Opened content lists `remaining` quests (name, level, link to `/c/<guid>/quests/chain/<id>`), and under it "Skipped" quests with the text "skipped, you completed what follows". In-log count shown as "N in your log".
- "Not visited yet" section: a compact table or list of zones with level range, territory, fit and quest count, in-range zones first, no quest lists.
- Footer note: `unplaced` quests "have no zone and are not counted" when above 0. When `hasZoneData` is false, a one-line hint pointing to `docs/wowhead-data-guide.md` section 2 (zones page), and level ranges are left out.
- Keyboard-accessible (native `<details>`), works at phone width, no new colours beyond existing tokens.

- [ ] **Step 1: Write the failing tests** in `explore-page.test.ts` following `apps/web/test/chain-skipped.test.ts` (in-memory db, `contentRecord` fixtures, `ingestSavedVariables`, `render` from `svelte/server`). Invented fixture: a Dwarf character level 12 in Dun Morogh who completed 2 of 4 Dun Morogh quests, plus an unvisited zone, an other-faction quest, a skipped quest, one class-zone quest. Assert on the loader result and the rendered HTML: both sections present with the right zone names, `2 / 3`-style counts matching the fixture, the remaining quest link href, the skipped text, "Not visited yet" zone without a quest list, the unplaced footnote, and the hint when no zone data. Also: empty catalog gives `contentReady: false` and the not-ready notice; a character with no progress gives zero visited zones and renders without error; a zone with `total` 0 renders no "NaN".
- [ ] **Step 2:** Run `pnpm vitest run --project web explore`. Expected: FAIL.
- [ ] **Step 3:** Implement the loader (compute `visitedMapIds` from `view.visitedMaps`, `faction` from `factionOfRace(view.race)`, split rows by `visited`, pass `usable`, `classToken`, `completed`, `inLog`, `zones: catalog.zones`), the page, the tab and styles.
- [ ] **Step 4:** Run `pnpm vitest run --project @ft/core --project web`, `pnpm typecheck` and `pnpm --filter web test:e2e`. Expected: all pass; fix any tab-list assertion that now includes Explore.
- [ ] **Step 5:** Commit `feat(web): Explore tab with per-zone quest completion`.

---

### Task 4: Docs and status

**Files:**
- Modify: `docs/superpowers/specs/2026-11-01-forevertracker-design.md` (M2 step 3 status line), `docs/superpowers/m1-kickoff.md` (state and known limits), `docs/wowhead-data-guide.md` (section 5: say the builder reads the zones table by its header row, and that dungeon and raid rows are kept but the Explore tab shows only open-world zones)

- [ ] **Step 1:** Mark step 3 built in the spec, with the v1 scope and what it leaves out: no real map exploration, no dungeons or raids, no "where to next" (step 4), uses plain completion so a completion from another region can mark a quest skipped, `nextUp` does not yet filter by `side` (listed as a follow-up, not done here).
- [ ] **Step 2:** Add the owner check to the kickoff note: rebuild with `podman compose up -d --build --force-recreate`, open a character's Explore tab, compare a zone count with the Quests tab.
- [ ] **Step 3:** Run `pnpm vitest run --project @ft/core --project web` and `pnpm typecheck`. Expected: pass.
- [ ] **Step 4:** Commit `docs: M2 step 3 exploration view status`.

## Self-Review

- Spec coverage: "quest-based completion per zone" (Tasks 2, 3), "what is left" (`remaining`), "skipped quests in visited zones" (`skippedQuests`, only for visited zones), real map exploration explicitly deferred (Task 4 notes it).
- Names used across tasks: `factionOfRace`, `sideAllows`, `placeZones`, `zoneProgress`, `ZoneProgress`, `ExplorationInput`, `ExplorePageData`: consistent.
- Known limits recorded, not fixed here: plain completion drives skipped; `nextUp` ignores `side`; quests with no zone (about 380) are invisible to this view; dungeons and raids are not listed.
