# M2 Part 1: Curated Data and Tag-Aware Chains Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the app curated class, race and profession quest tags, zone data and chain-link overrides (collected by the owner from Wowhead with a browser snippet), and use the tags so chains and "Next up" stop showing quests the character cannot take.

**Architecture:** Curated JSON files live in `data/curated/` in the repo and are read by the app from disk; the app never calls Wowhead. A maintainer flow turns text captured in the owner's own browser into those files: `tools/wowhead/capture.js` (pasted into the browser console on a page the owner has opened) prints JSON; `tools/build-curated.ts` merges the saved captures into the curated files and validates them against the ForeverDB mirror. Core advice code gets a tag index that replaces the interim profession-name rule and adds race filtering; link overrides are applied to the quest catalog before any chain logic runs.

**Tech Stack:** TypeScript, vitest 5 (`pnpm vitest run --project @ft/core`, `--project web`), SvelteKit 3 web app, plain browser JavaScript for the capture snippet (no dependencies), tsx for the build tool.

**Spec:** `docs/superpowers/specs/2026-11-01-forevertracker-design.md` (sections 8 and 11, M2 steps 0 to 2). Bug list item 12 ("found in real use, deferred to M2") in `docs/superpowers/m1-bugs-and-tweaks.md`.

## Global Constraints

- **The app and the tools never fetch Wowhead.** Wowhead's terms (https://corp.fanbyte.com/legal/terms) forbid downloading content with any tool, robot or crawler other than generally available browsers. The only Wowhead access is the owner reading pages in a normal browser and running `capture.js` on a page already open. No task adds a network call to Wowhead anywhere.
- Credit Wowhead as a source wherever curated data is shown (spec section 8) and ForeverDB.net with a visible link where its data is shown (unchanged).
- Never commit `.env`, tokens, the WoW account folder name, real character names or home paths.
- Commits: identity Stan Jewhurst, trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Do not push.
- Never touch `data-local/forevertracker.sqlite` except read-only (`sqlite3 -readonly`), never the owner's running container or the server on localhost:3000.
- Node: `export PATH="$HOME/.nvm/versions/node/v26.13.0/bin:$PATH"`. Checks: `pnpm test`, `pnpm typecheck`, `(cd addon && ./test.sh)`.
- Rule-based advice only, no LLM. Tags missing for a quest mean "no restriction known": behaviour must stay exactly as today when the curated files are absent or empty.

## Review Focus

1. A curated file that is missing, empty, or has a newer `version` than the app understands: the app starts, tags are ignored, nothing throws (Task 1).
2. A tag for a quest ID that is not in the mirror, or the same quest tagged for two classes: the build tool reports it and the loader keeps the file usable (Tasks 1, 3).
3. A link override pointing at an unknown quest, or creating a cycle: ignored with a reported reason, chain code still terminates (Task 2).
4. A profession quest the character CAN take (profession learned, or free slot) must still show; only unusable steps are hidden or dimmed (Task 4).
5. Capture output from a page whose layout differs from what the plan assumed (no level column, extra links): the snippet must still produce quest IDs and names, and say what it could not read (Task 3).

---

## File Structure

- `packages/core/src/curated/types.ts` (create): `CuratedTags`, `QuestOverrides`, `CuratedZones` types and `emptyCurated()`.
- `packages/core/src/curated/load.ts` (create): `parseCuratedTags`, `parseOverrides`, `parseZones` (pure, validating); `readCuratedDir(dir)` (fs, in web server code path via core export).
- `packages/core/src/curated/apply.ts` (create): `applyOverrides(quests, overrides)`, `buildTagIndex(tags)`.
- `packages/core/src/advice/professions.ts` (modify): tag-aware verdict beside the interim rule.
- `packages/core/src/advice/next-up.ts`, `chain-detail.ts` (modify): consume the tag index.
- `tools/wowhead/capture.js` (create): the browser-console snippet (pure `extract` function plus a thin DOM wrapper).
- `tools/build-curated.ts` (create): merges saved captures into `data/curated/*.json`, validates against the mirror.
- `data/curated/` (create): `quest-tags.json`, `overrides.json`, `zones.json` (start as empty valid files).
- `data/wowhead-captures/` (create, git-tracked, holds the raw pasted captures with their page URL and date).
- `docs/wowhead-data-guide.md` (create): step by step for the owner.
- `apps/web/src/lib/server/content.ts`, `Dockerfile`, `README.md` (modify): load curated files, copy them into the image.

## Data formats (decided here; all tasks use these)

`data/curated/quest-tags.json`:
```json
{ "version": 1, "patch": "1.60.1", "capturedAt": "2026-11-21",
  "tags": [ { "questId": 96626, "kind": "profession", "value": "Cooking" },
            { "questId": 1234,  "kind": "class",      "value": "Shaman" },
            { "questId": 5678,  "kind": "race",       "value": "Dwarf" } ] }
```
`kind` is `class`, `race` or `profession`; `value` is the display name (case-insensitive match). A quest may carry several tags of different kinds, and several `race` tags mean any of them is allowed (alternatives).

`data/curated/overrides.json`: `{ "version": 1, "links": [ { "from": 96628, "to": 96608, "note": "The Great Outdoors follows The Adventurer in Dun Morogh" } ] }`. Each link means quest `to` can follow quest `from` (adds `from` to `to`'s previous and `to` to `from`'s next, relation `"Curated"`).

`data/curated/zones.json`: `{ "version": 1, "zones": [ { "name": "Dun Morogh", "minLevel": 1, "maxLevel": 10, "territory": "Alliance", "type": "zone" } ] }`; `territory` is `Alliance`, `Horde` or `Contested`, `type` is `zone`, `dungeon`, `raid` or `battleground`; levels may be null.

Capture file (`data/wowhead-captures/<name>.json`), written by the snippet, saved by the owner: `{ "tool": "ft-capture", "version": 1, "url": "...", "title": "...", "capturedAt": "ISO", "kind": "class|race|profession|zones|unknown", "value": "Shaman", "rows": [ { "questId": 123, "name": "...", "level": 12 } ], "zoneRows": [ { "cells": ["Dun Morogh", "1-10", "Alliance"] } ], "notes": ["..."] }`. `level` is present only when a number sits in the quest's table row. `kind`/`value` are derived from the page URL (`/forever/quests/classes/<x>`, `/forever/quests/professions/<x>`, `/forever/quests/races/<x>` if Wowhead has such pages) or given by the owner when the URL is not recognised.

---

### Task 1: Curated data types and loaders

**Files:**
- Create: `packages/core/src/curated/types.ts`, `packages/core/src/curated/load.ts`
- Create: `data/curated/quest-tags.json`, `data/curated/overrides.json`, `data/curated/zones.json` (empty valid files, version 1, empty arrays, `"patch": null`, `"capturedAt": null`)
- Modify: `packages/core/src/index.ts` (export the new API)
- Test: `packages/core/test/curated-load.test.ts`

**Interfaces:**
- Produces:
  - `type QuestTag = { questId: number; kind: "class" | "race" | "profession"; value: string }`
  - `type CuratedTags = { patch: string | null; capturedAt: string | null; tags: QuestTag[] }`
  - `type QuestLinkOverride = { from: number; to: number; note: string | null }`
  - `type CuratedZone = { name: string; minLevel: number | null; maxLevel: number | null; territory: "Alliance" | "Horde" | "Contested" | null; type: "zone" | "dungeon" | "raid" | "battleground" }`
  - `type Curated = { tags: CuratedTags; links: QuestLinkOverride[]; zones: CuratedZone[]; problems: string[] }`
  - `emptyCurated(): Curated`
  - `parseCurated(files: { tags?: unknown; overrides?: unknown; zones?: unknown }): Curated` (pure; bad entries are dropped and described in `problems`; a file with `version` other than 1, or not an object, contributes nothing and adds a problem)
  - `readCuratedDir(dir: string): Curated` (fs; a missing directory or file gives `emptyCurated()`; unreadable JSON adds a problem, never throws)

- [ ] **Step 1: Write failing tests** in `curated-load.test.ts`: (a) `parseCurated({})` equals `emptyCurated()`; (b) a valid tags file yields the tags; (c) `version: 2` yields no tags and one problem mentioning "version"; (d) an entry with a string `questId`, an unknown `kind`, or an empty `value` is dropped with a problem each while valid siblings survive; (e) overrides dropping `from === to` and non-integer ids; (f) a zone with `territory: "Neutral"` keeps the zone with `territory: null` and a problem; (g) `readCuratedDir` on a temp directory containing a file of invalid JSON returns empty tags plus a problem, and on a missing directory returns `emptyCurated()`.
- [ ] **Step 2: Run** `pnpm vitest run --project @ft/core curated-load` and see it fail (module not found).
- [ ] **Step 3: Implement** the types, `emptyCurated`, `parseCurated`, `readCuratedDir` (reads `quest-tags.json`, `overrides.json`, `zones.json` in `dir`). Pure validation, no schema library.
- [ ] **Step 4: Create the three empty data files** and run the test file: all pass.
- [ ] **Step 5: Commit** `feat(core): curated data types and loaders`.

### Task 2: Apply overrides and build the tag index

**Files:**
- Create: `packages/core/src/curated/apply.ts`
- Test: `packages/core/test/curated-apply.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `QuestRow` (`packages/core/src/advice/content.ts`), `QuestLinkOverride`, `QuestTag` from Task 1.
- Produces:
  - `applyOverrides(quests: QuestRow[], links: QuestLinkOverride[]): { quests: QuestRow[]; problems: string[] }`. Returns new row objects only for quests whose links changed (inputs are not mutated). For each link, `to` gains `{ questId: from, name, relation: "Curated" }` in `chain.previous` and `from` gains the matching entry in `chain.next`, unless already linked. Skips (with a problem string) a link whose `from` or `to` is not in `quests`, and a link that would create a cycle (`to` already reaches `from` through `chain.next`).
  - `type TagIndex = { professionOf(questId: number): string | null; classesOf(questId: number): string[]; racesOf(questId: number): string[]; hasTags: boolean }` and `buildTagIndex(tags: QuestTag[]): TagIndex` (values returned as given; first profession tag wins; `hasTags` false when the list is empty).

- [ ] **Step 1: Write failing tests**: the Camping case (quest 96628 "The Adventurer" (Dun Morogh) with no `next`, quest 96608 "The Great Outdoors" (Dun Morogh) with no `previous`; one link from 96628 to 96608; after applying, 96608's previous contains 96628 and 96628's next contains 96608; input arrays unchanged); unknown id skipped with a problem; cycle skipped (A to B exists, link B to A); duplicate link not added twice; `buildTagIndex` with two race tags on one quest returns both, `professionOf` of an untagged quest is null, `hasTags` false for `[]`.
- [ ] **Step 2: Run** the file and see it fail.
- [ ] **Step 3: Implement** both functions.
- [ ] **Step 4: Run** the file: pass.
- [ ] **Step 5: Add an integration assertion** using `chainDetail` (from `advice/chain-detail.ts`) on the fixture `packages/core/test/fixtures/quests-camping.json` plus the link: with the override, the Dun Morogh Adventurer's chain contains Camping 101 quests; without it, it does not. Run, pass.
- [ ] **Step 6: Commit** `feat(core): apply curated link overrides and index quest tags`.

### Task 3: The capture snippet and the build tool

**Files:**
- Create: `tools/wowhead/capture.js`, `tools/build-curated.ts`
- Create: `data/wowhead-captures/.gitkeep`
- Test: `packages/core/test/wowhead-capture.test.ts` (loads `tools/wowhead/capture.js` and `tools/build-curated.ts` through their exported pure functions)
- Create test fixtures: `packages/core/test/fixtures/wowhead-capture-class.json`, `wowhead-capture-zones.json` (invented, in the capture-file format above, with a comment-free minimal shape)

**Interfaces:**
- `capture.js` is a plain script usable both as a pasted console snippet and as a CommonJS module for tests. Exports `extract(input: { url: string; title: string; anchors: { href: string; text: string; rowText: string }[]; tableRows: string[][] }, hint?: { kind: string; value: string }): Capture`, where `Capture` is the capture-file shape above. When pasted into a console it calls `extract` on the live page (collecting every `<a>` whose `href` contains `/quest=`, with its text and the text of its nearest table row `<tr>`, and every `<tr>` of the largest table as string cells) and prints `JSON.stringify(capture)` into the console and copies it with `copy()` when available.
  - Quest ID comes from the `href` pattern `/quest=(\d+)`; duplicates collapse to one row; `name` is the link text, trimmed; `level` is the first standalone integer 1 to 70 in `rowText` after removing the name, else omitted.
  - `kind`/`value` come from the URL (`/forever/quests/classes/<slug>` gives class, `/professions/<slug>` gives profession, `/races/<slug>` gives race, a path containing `zones` gives zones), slug title-cased with hyphens turned to spaces; the `hint` overrides it; otherwise `kind: "unknown"` and a note telling the owner to rerun as `ftCapture("class","Shaman")`.
  - The console version also defines `window.ftCapture(kind, value)` for that case.
  - Notes are added for: zero quests found, rows without a level, the URL not recognised.
- `build-curated.ts` exports `buildCurated(captures: Capture[], mirrorQuestIds: Set<number>, existing: { patch, capturedAt }): { tags: CuratedTags; zones: CuratedZone[]; report: string[] }`, and a `main()` that reads `data/wowhead-captures/*.json`, reads quest IDs from the mirror (`DATA_DIR`, read-only open), writes `data/curated/quest-tags.json` and `zones.json` and prints the report. Rules: class/race/profession captures become tags (kind and value validated: class value must be one of the nine class names); a quest tagged with two different classes is reported and kept for both; IDs not in the mirror are reported ("not in the mirror: N ids, first five: ...") and still written; zone rows are parsed from `zoneRows[].cells` leniently (first cell the name; the first cell matching `^\d+\s*[-–]\s*\d+$` or a single integer is the level range; a cell equal to Alliance, Horde or Contested is the territory; a cell containing Dungeon, Raid or Battleground sets the type); rows that do not parse are reported, not guessed.

- [ ] **Step 1: Write failing tests** for `extract`: (a) anchors for quests 111, 222 (duplicate 111 twice) on a `/forever/quests/classes/shaman` URL give two rows, kind `class`, value `Shaman`; (b) `rowText` "Call of Fire 4 Shaman" gives level 4; no number gives no `level` and a note; (c) an unrecognised URL gives kind `unknown` and a note naming `ftCapture`; with a hint the kind and value are taken from it; (d) zero anchors gives `rows: []` and a note. For `buildCurated`: the class fixture becomes tags with the right kind and value; an ID absent from the mirror set appears in the report but stays in the tags; two classes on one quest are reported; the zones fixture yields `{ name: "Dun Morogh", minLevel: 1, maxLevel: 10, territory: "Alliance", type: "zone" }` and a row with no name cell is reported and skipped.
- [ ] **Step 2: Run** `pnpm vitest run --project @ft/core wowhead-capture` and see it fail.
- [ ] **Step 3: Implement** `capture.js` (no dependencies, ES5-compatible syntax acceptable in a console, `module.exports` guarded by `typeof module`) and `build-curated.ts`. `main()` refuses to run when a capture file is not valid JSON of the capture shape, naming the file.
- [ ] **Step 4: Run** the tests: pass. Run `pnpm tsx tools/build-curated.ts` with an empty captures directory and `DATA_DIR` pointing at a temp directory containing no database: it must print a report saying no captures were found and leave the curated files untouched.
- [ ] **Step 5: Commit** `feat(tools): browser capture snippet and curated data builder`.

### Task 4: Owner guide for getting the Wowhead data

**Files:**
- Create: `docs/wowhead-data-guide.md`
- Modify: `README.md` (one line under the dashboard section linking the guide; credit line for Wowhead under Credits)

**Interfaces:** documentation only; it must match the exact names from Task 3 (`tools/wowhead/capture.js`, `ftCapture`, `data/wowhead-captures/`, `pnpm tsx tools/build-curated.ts`).

- [ ] **Step 1: Write the guide** with these sections, in order, in plain language for the owner:
  1. *Rules first*: one short paragraph: do this by hand in a normal browser, one page at a time, as a person reading the site; do not loop over pages with a script; Wowhead's terms are linked.
  2. *Pages to visit* (a table: page, what it gives, what to expect): the nine class pages `https://www.wowhead.com/forever/quests/classes/<class>` (druid, hunter, mage, paladin, priest, rogue, shaman, warlock, warrior), the profession pages `https://www.wowhead.com/forever/quests/professions/<profession>` (about 13: the 12 profession names in the mirror), the race pages if Wowhead has them (the guide says to check the site's Quests menu and use whatever race lists exist; if none do, say so and skip race tags), and the zones page under the Forever section of Wowhead's menu. State plainly that these URLs come from the spec and have not been opened by the assistant: if one 404s, find the page through the site's own menu and use `ftCapture` with the right kind and value.
  3. *For each page*: open it; if the list is paged or truncated, set the page size to the largest and page through, running the snippet on each page and saving each output under its own name; open the browser console (F12, Console tab; Firefox may ask you to type `allow pasting` first); paste the whole contents of `tools/wowhead/capture.js` and press Enter; the JSON is printed and copied; paste it into a new file `data/wowhead-captures/<kind>-<value>.json` (for example `class-shaman.json`, `profession-cooking.json`, `zones.json`, and `-2`, `-3` for extra pages); read the notes line the snippet prints.
  4. *If the snippet says it found no quests*: the page probably builds its list after loading; wait for the list to appear and run it again; if still empty, copy the console output and the page URL into the chat so the extractor can be adjusted.
  5. *Build the data*: `pnpm tsx tools/build-curated.ts` (with `DATA_DIR` pointing at the folder holding the mirror, read-only), what the report lines mean, how to commit `data/curated/` and `data/wowhead-captures/`.
  6. *Link overrides*: how to add an entry to `data/curated/overrides.json` by hand for quests shared between regions, with the Camping 101 example and where to find quest IDs (the chain page URL `/c/<guid>/quests/chain/<questId>`).
  7. *When to redo it*: after a game patch that changes quests.
- [ ] **Step 2: Check** every command and filename in the guide against Task 3's actual output (grep each name in `tools/` and `.gitkeep` path); fix mismatches.
- [ ] **Step 3: Commit** `docs: guide for collecting the Wowhead data by hand`.

### Task 5: Tag-aware professions and race in core advice

**Files:**
- Modify: `packages/core/src/advice/professions.ts`, `packages/core/src/advice/classes.ts` (add `raceAllows`), `packages/core/src/advice/next-up.ts`, `packages/core/src/advice/chain-detail.ts`, `packages/core/src/advice/types.ts`
- Test: `packages/core/test/tag-advice.test.ts`; existing tests must stay green unchanged

**Interfaces:**
- Consumes: `TagIndex` (Task 2), `professionVerdict`, `learnedNames`, `slotsUsed`, `classAllows`, `chainDetail`.
- Produces:
  - `NextUpInput` gains optional `tags?: TagIndex` and `raceToken?: string | null` (snapshot race, e.g. "Dwarf").
  - `raceAllows(races: string[], raceToken: string | null | undefined): boolean`: true when `races` is empty; otherwise true only when the token matches one of them case-insensitively.
  - `classAllowsTagged(q: QuestRow, classToken, tags?: TagIndex): boolean`: the existing class rule, plus a quest tagged for classes in `tags` is allowed only for a matching class.
  - `professionOfQuestTagged(q: QuestRow, professions: ProfessionInfo[], tags?: TagIndex): ProfessionInfo | null`: the tag's profession (matched by name to the catalog) when `tags.hasTags` and the quest has one; otherwise the interim name rule. When tags exist but the quest has no profession tag, the quest is NOT treated as a profession quest (the interim name rule is used only when `tags` is absent or empty).
  - `chainDetail(quests, questId, completed, inLog, classToken?, usable?: (q: QuestRow) => boolean)`: a member for which `usable(q)` is false gets `state: "unavailable"` (new `ChainMemberState` value) and is excluded from `total`, `done` and `otherRoute`. Default: all usable.

- [ ] **Step 1: Write failing tests** in `tag-advice.test.ts`: (a) Camping 101 Cooking tagged `profession: Cooking`: a character with Skinning and Leatherworking (both slots full) and Cooking learned gets it allowed; a Mining-tagged quest is not suggested by `nextUp` and is `unavailable` in `chainDetail` with `usable` built from the same verdict, while a Cooking one stays `available`; (b) with `tags` absent, behaviour equals the interim rule (run one existing interim-rule scenario both ways); (c) a quest tagged `race: Orc` is not suggested to a "Dwarf" and is to an "Orc"; with two race tags either race is allowed; (d) a class-tagged quest with a category `zone.n` still follows `classAllowsTagged`; (e) `total` and `done` exclude unavailable members; the chain's `otherRoute` count is unchanged.
- [ ] **Step 2: Run** `pnpm vitest run --project @ft/core tag-advice` and see it fail.
- [ ] **Step 3: Implement** the functions above and thread `tags` and `raceToken` through `nextUp` (class, race and profession filters) without changing results when they are absent.
- [ ] **Step 4: Run** `pnpm vitest run --project @ft/core`: all pass, including the 460 existing tests.
- [ ] **Step 5: Commit** `feat(core): use curated tags for profession, class and race filtering`.

### Task 6: Wire curated data into the web app and the image

**Files:**
- Modify: `apps/web/src/lib/server/content.ts` (catalog gains `tags` and `zones`; overrides applied; curated dir from `CURATED_DIR`, default `<process.cwd()>/data/curated`), `apps/web/src/lib/server/env.ts` if the env is read there, the roster, quests and chain page loaders under `apps/web/src/routes/c/[guid]/` to pass `tags`, `raceToken` and a `usable` function, `apps/web/src/routes/c/[guid]/quests/chain/[questId]/+page.svelte` (show "not for your professions" steps dimmed with a short note, and the counts without them), `Dockerfile` (copy `data/curated` into the final image at `./data/curated`), `.env.example` (`CURATED_DIR`, commented), `README.md` (env table row, dashboard text, Credits line "Quest tags and zone data curated from Wowhead (https://www.wowhead.com) by the maintainer")
- Test: `apps/web/test/` (extend the existing catalog and chain page tests)

**Interfaces:**
- Consumes: `readCuratedDir`, `applyOverrides`, `buildTagIndex` (Tasks 1 and 2), the Task 5 signatures.
- Produces: `QuestCatalog` gains optional `tags?: TagIndex` and `zones?: CuratedZone[]`; the catalog memo (60 s TTL) includes them; `problems` from loading are logged once with `console.warn`, not shown in the UI.

- [ ] **Step 1: Write failing tests**: with a temp `CURATED_DIR` holding one tag file and one override, the catalog's quests contain the curated link and `tags.professionOf` returns the tagged profession; with the directory missing, the catalog equals today's (no tags, no change in quests); the chain page for a Dun Morogh character whose chain has a Mining-tagged step renders that step dimmed and excludes it from "N of M".
- [ ] **Step 2: Run** `pnpm vitest run --project web` and see the new tests fail.
- [ ] **Step 3: Implement** the loader wiring and the page changes. The curated read happens inside the existing catalog memo, not per request.
- [ ] **Step 4: Run** `pnpm test`, `pnpm typecheck`, `(cd addon && ./test.sh)`, then `pnpm --filter web test:e2e` (extend the smoke fixture only if the chain page markup changed; it builds into `apps/web/build`, which the owner's local server may serve, so tell the owner to restart it).
- [ ] **Step 5: Build the image and check it** in a throwaway container on a spare port with a throwaway volume (`podman build -t forevertracker:dev .`, never recreate the owner's compose stack): the container's `/app/data/curated/quest-tags.json` exists and `/api/health` answers. Remove the container and volume.
- [ ] **Step 6: Commit** `feat(web): load curated data and hide steps the character cannot take`.

### Task 7: Docs and status

**Files:**
- Modify: `docs/superpowers/m1-bugs-and-tweaks.md` (item 12: mark the M2 part built), `docs/superpowers/specs/2026-11-01-forevertracker-design.md` (section 8 curated-data entries: the captured formats), `docs/superpowers/m1-kickoff.md` (add "State at the end of M2 part 1": what exists, how to collect the data, what is not verified: the capture snippet has not run against live Wowhead pages until the owner does; the page URLs are unverified; real data effect on chains not yet seen)

- [ ] **Step 1: Write the three updates.**
- [ ] **Step 2: Run** `pnpm test` and `pnpm typecheck`: pass.
- [ ] **Step 3: Commit** `docs: M2 part 1 status and curated data formats`.

---

## Owner checkpoint after Task 7 (not a task for the implementer)

The owner opens one class page and one profession page, runs the snippet, and reports what it printed. Any mismatch between the plan's assumptions (link pattern, paging, table layout, race pages existing) is fixed in `capture.js` before the full set of ~22 pages is collected. Collecting the data and running `build-curated.ts` is the owner's step; the plan cannot verify it.
