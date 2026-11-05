# M1 Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the M0 ingest pipeline into a usable web dashboard: login, roster, character pages with a rule-based "Next up", upload, settings, and the WoW theme.

**Architecture:** Pure read models and advice rules live in `packages/core` (typed input in, plain data out, no I/O beyond the `Db` and `ContentSource` they are handed). `apps/web` only loads data in `+page.server.ts` files and renders it. The look is the committed mockups in `docs/design/m1/`, ported to Svelte components; fonts are bundled, nothing is fetched from third parties at runtime.

**Tech Stack:** SvelteKit (adapter-node), Svelte 5, Drizzle + better-sqlite3, vitest 5 projects, `@fontsource/im-fell-english` and `@fontsource-variable/instrument-sans`, Playwright for smoke tests.

**Spec:** `docs/superpowers/specs/2026-11-01-forevertracker-design.md` (sections 6, 7, 11). Also read `docs/superpowers/m1-kickoff.md`, `docs/superpowers/m0-decisions-and-deferred.md` (rulings R1-R23 stay binding) and the mockups `docs/design/m1/{roster,character}.html` + `theme.css`.

## Global Constraints

- No LLM; recommendations are pure rules, and every suggestion carries a reason and a source label.
- Never fetch Wowhead or any third party at runtime; ForeverDB only via the mirror/`ContentSource`. Show the credit "Data from ForeverDB.net" with a link in the footer of every page.
- Level cap comes from the mirror's `/meta` (60 today); hide quests above it. Where a rule has no data, say "no recommendation yet".
- Server is HTTP on loopback; cookies `httpOnly`, `sameSite=lax`; secrets only from env, never logged or committed.
- `/api/ingest` stays bearer-token only (no session needed) and unchanged apart from the error slug in Task 1.
- Look and feel: dark cellar, vellum panels, gilt accent, IM Fell English headings, Instrument Sans text, standard class colours, no Blizzard art; no tracked all-caps eyebrows, no dot-joined meta lines.
- Never commit `.env`, tokens, account folder names, character names or home paths; fixtures use invented names.
- Checks that must pass at the end of every task: `pnpm test`, `pnpm typecheck`; addon untouched so `cd addon && ./test.sh` stays green. Node: `export PATH="$HOME/.nvm/versions/node/v26.13.0/bin:$PATH"`.

## Review Focus

- A character whose latest snapshot has `identity` unavailable, a degraded section, or `unsupported = true`: roster and character page render what exists and never throw (test in Task 3).
- A character with zero completed quests, zero professions, or `visited = {}` (parses as an empty object): empty states with guidance, not blank panels (Tasks 3, 8).
- Quests above the level cap, or a mirror with no quest rows (never synced): "Next up" says "no recommendation yet" and the page tells the owner to run the content sync (Tasks 5, 7, 8).
- Stale data: no upload for days shows a warning, and a `takenAt` of 0 or in the future never shows "synced -3 minutes ago" (Task 3).
- Login: wrong password, tampered or expired cookie, and a missing `OWNER_PASSWORD` (open mode, with a visible warning on Settings) (Task 6). Upload page rejects a non-ForeverTracker file with the ingest error text, not a 500 (Task 9).

---

### Task 1: Boot-time env validation and small M0 carry-overs

**Files:**
- Modify: `apps/web/src/lib/server/env.ts`, `apps/web/src/hooks.server.ts` (create), `packages/core/src/index.ts`, `apps/web/src/lib/server/ingest-handler.ts`, `apps/web/test/ingest-route.test.ts`, `.env.example`
- Test: `apps/web/test/env.test.ts` (create)

**Interfaces:**
- Produces: `Env` gains `ownerPassword: string | null` and `sessionSecret: string | null`; `readEnv(source)` throws on bad `CONTENT_MODE`. `@ft/core` re-exports `LuaParseError`. Ingest 413 body becomes `{"error":"too_large"}`.

- [ ] **Step 1: Write failing tests** in `env.test.ts`: `readEnv({CONTENT_MODE:"bogus"})` throws a message containing `CONTENT_MODE`; `readEnv({})` gives `contentMode "mirror"`, `ownerPassword null`; `readEnv({OWNER_PASSWORD:"x",SESSION_SECRET:"y"})` returns both. Update the 413 assertion in `ingest-route.test.ts` to expect `too_large`.
- [ ] **Step 2: Run** `pnpm --filter web test` and confirm those fail.
- [ ] **Step 3: Implement** the env fields and the re-export; change the ingest-handler import of `LuaParseError` to come from `@ft/core`, and drop the direct `@ft/savedvars` dependency from `apps/web/package.json`. In `hooks.server.ts` export `init()` that calls `env()` so a bad value stops the server at boot. Add `OWNER_PASSWORD=` and a `SESSION_SECRET` generation hint to `.env.example`.
- [ ] **Step 4: Run** `pnpm test && pnpm typecheck`; expect PASS.
- [ ] **Step 5: Commit** `feat(web): validate env at boot, tidy M0 carry-overs`.

### Task 2: Device-token list and revoke

**Files:**
- Modify: `apps/web/src/lib/server/tokens.ts`; Create: `apps/web/scripts/revoke-token.ts`; Modify: `apps/web/package.json`, `apps/web/scripts/bundle-token.mjs`, `README.md`
- Test: `apps/web/test/tokens.test.ts`

**Interfaces:**
- Produces: `listDeviceTokens(db: Db): { id: number; label: string; createdAt: number; revokedAt: number | null }[]` (never the hash); `revokeDeviceToken(db: Db, id: number): boolean` (false when unknown or already revoked).

- [ ] **Step 1: Write failing tests:** list shows label and revoked state and no `tokenHash` key; after `revokeDeviceToken`, `verifyDeviceToken` returns null; revoking twice returns false; revoking an unknown id returns false.
- [ ] **Step 2: Run** and confirm failure.
- [ ] **Step 3: Implement** both functions. Add a `token:list` and `token:revoke <id>` script and bundle `revoke-token` the same way `create-token` is bundled so `podman exec forevertracker node /app/revoke-token.mjs <id>` works; document in README.
- [ ] **Step 4: Run** `pnpm --filter web test`; PASS.
- [ ] **Step 5: Commit** `feat(web): list and revoke device tokens`.

### Task 3: Character read models (`packages/core`)

**Files:**
- Create: `packages/core/src/read/roster.ts`, `packages/core/src/read/character.ts`, `packages/core/src/read/format.ts`; Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/read.test.ts`, fixtures in `packages/core/test/fixtures/` (invented characters)

**Interfaces:**
- Produces:
  - `type CharacterCard = { guid; name: string; surname: string | null; class: string | null; race: string | null; level: number | null; xpPct: number | null; zone: string | null; money: number | null; playedSeconds: number | null; takenAt: number; syncedAgo: "fresh" | "stale" | "unknown"; professions: { skillLine: number; name: string; rank: number; max: number }[]; questsCompleted: number; unsupported: boolean }`
  - `getRoster(db: Db, now?: number): { characters: CharacterCard[]; totals: { count; playedSeconds; money } }`, ordered by `latestTakenAt` descending.
  - `getCharacter(db: Db, guid: string, now?: number): CharacterView | null` where `CharacterView = CharacterCard & { snapshot: Snapshot | null; questLogIds: number[]; completedIds: number[]; visitedMaps: { mapId: number; subzone: string; firstSeen: number }[]; talents: { unspent: number } | null; events: { t: number; kind: string; data: unknown }[] }`.
  - `formatPlayed(seconds: number): string` ("11 h 20 m", "1 d 4 h"), `formatMoney(copper: number): string` ("48 g"; copper input), `staleness(takenAt: number, now: number): "fresh" | "stale" | "unknown"` (fresh under 2 days, `unknown` when `takenAt` is 0 or in the future).
- Consumes: `character`, `snapshot`, `characterEvent` tables from `@ft/db`; `Snapshot`, `Maybe` types.

- [ ] **Step 1: Write failing tests:** (a) card from a full fixture has `xpPct 62`, formatted values, profession list; (b) fixture with `identity: {unavailable:true}` still yields a card with null fields; (c) `unsupported` snapshot row yields `unsupported: true` and no throw; (d) `visited = {}` (empty object) gives `visitedMaps []`; (e) `takenAt` 0 and a future `takenAt` give `unknown`; (f) the surname field is read from the raw snapshot, name stays the stored name; (g) roster totals add up and order is newest first; (h) `getCharacter` with an unknown guid returns null.
- [ ] **Step 2: Run** `pnpm --filter @ft/core test`; confirm failure.
- [ ] **Step 3: Implement** by parsing the newest `snapshot.raw` JSON per character defensively (every `Maybe` section checked with the `unavailable` flag; Lua arrays may arrive as objects, so coerce).
- [ ] **Step 4: Run** `pnpm test && pnpm typecheck`; PASS.
- [ ] **Step 5: Commit** `feat(core): roster and character read models`.

### Task 4: Content access for advice (quest lookup, level cap)

**Files:**
- Create: `packages/core/src/advice/content.ts`, `packages/core/test/fixtures/quests.json`
- Test: `packages/core/test/advice-content.test.ts`

**Interfaces:**
- Produces: `type QuestRow = { id: number; name: string; level: number; zone: string | null; chain: number | null; starts: unknown; ends: unknown }`; `loadQuests(source: ContentSource): Promise<QuestRow[]>` (pages through `source.list("quests")`, drops malformed rows); `getLevelCap(source: ContentSource): Promise<number | null>` (from the mirrored meta record, null when absent).

- [ ] **Step 1: Inspect real data first.** Query the local `data-local/forevertracker.sqlite` mirror (`content_record` for `quests` and the meta resource) and record 20 real quest rows, trimmed to the fields above, into `fixtures/quests.json`. Write down in the fixture header which field holds the chain id and what shape `starts`/`ends` have; the later tasks use only what is verified here. If the level cap is not stored by the sync, add it to the mirror sync in `packages/content` as a `meta` resource (client `/meta`) with its own test.
- [ ] **Step 2: Write failing tests** against a fake `ContentSource`: malformed rows are dropped; an empty mirror returns `[]`; `getLevelCap` returns 60 from a fixture and null when missing.
- [ ] **Step 3: Run** and confirm failure; **Step 4: Implement**; **Step 5: Run** `pnpm test`; PASS.
- [ ] **Step 6: Commit** `feat(core): content lookups for advice`.

### Task 5: "Next up" and chain rules

**Files:**
- Create: `packages/core/src/advice/next-up.ts`, `packages/core/src/advice/chains.ts`, `packages/core/src/advice/types.ts`
- Test: `packages/core/test/next-up.test.ts`, `packages/core/test/chains.test.ts`

**Interfaces:**
- Produces:
  - `type Suggestion = { kind: "chain" | "area" | "profession" | "next-level"; title: string; questId?: number; level: number; reason: string; source: "ForeverDB"; confidence: "high" | "low" }`
  - `nextUp(input: { level: number; zone: string | null; completed: Set<number>; inLog: Set<number>; quests: QuestRow[]; levelCap: number | null; professions: CharacterCard["professions"] }, limit?: number): Suggestion[]`. Rules in order: chain continuation (a quest whose chain predecessor is done or in log, not done itself), then same-zone quests with `level` within `[level - 3, level]`, then profession training hints only if verified in Task 4, then next-level quests within 1 above the character. Never returns completed or in-log quests, nor quests above `levelCap`. Stable ordering, default `limit` 5.
  - `chainProgress(quests: QuestRow[], completed: Set<number>, inLog: Set<number>): { chain: number; name: string; done: number; total: number; currentIndex: number | null }[]`, only chains the character has started and not finished (finished chains reported separately via a `complete: boolean` field).
- Consumes: `QuestRow`, `CharacterCard` types.

- [ ] **Step 1: Write failing tests** with the real fixture rows plus tiny synthetic chains: continuation outranks area; completed and in-log excluded; above-cap excluded; empty `quests` gives `[]` (UI turns that into "no recommendation yet"); a level 1 character with nothing done gets starter quests in their zone; chain progress counts 2 of 5 with `currentIndex 2`.
- [ ] **Step 2: Run** and confirm failure; **Step 3: Implement** as pure functions (no I/O); **Step 4: Run** `pnpm test`; PASS.
- [ ] **Step 5: Commit** `feat(core): next-up and chain progress rules`.

### Task 6: Local login

**Files:**
- Create: `apps/web/src/lib/server/session.ts`, `apps/web/src/routes/login/+page.svelte`, `apps/web/src/routes/login/+page.server.ts`, `apps/web/src/routes/logout/+server.ts`; Modify: `apps/web/src/hooks.server.ts`, `apps/web/src/app.d.ts`
- Test: `apps/web/test/session.test.ts`, `apps/web/test/auth-hook.test.ts`

**Interfaces:**
- Produces: `signSession(secret: string, now?: number): string` and `verifySession(secret: string, cookie: string | undefined, now?: number): boolean` (HMAC-SHA256, 30-day expiry, timing-safe compare); `checkPassword(expected: string, given: string): boolean` (timing-safe, equal-length hashing first). `event.locals.authed: boolean`. The hook: when `ownerPassword` is set, every path except `/login`, `/api/health` and `/api/ingest` (and static assets) redirects to `/login?next=<path>` unless the cookie verifies; when unset, everything is open and `locals.authed` is true. `next` must be a same-origin path (reject `//evil.com` and absolute URLs).

- [ ] **Step 1: Write failing tests:** sign/verify round trip; tampered, expired and wrong-secret cookies fail; `checkPassword` right/wrong/empty; hook redirects an unauthenticated page request, lets `/api/ingest` through, lets everything through in open mode; login with a wrong password returns 400 and no cookie; `next=//evil.com` falls back to `/`.
- [ ] **Step 2: Run** and confirm failure; **Step 3: Implement**; the cookie is `httpOnly`, `sameSite lax`, `path /`, not `secure` (plain HTTP on loopback). If `ownerPassword` is set but `sessionSecret` is not, fail at boot in `init()` with a clear message.
- [ ] **Step 4: Run** `pnpm test && pnpm typecheck`; PASS.
- [ ] **Step 5: Commit** `feat(web): owner login with signed session cookie`.

### Task 7: Theme, layout and roster page

**Files:**
- Create: `apps/web/src/lib/theme.css` (ported from `docs/design/m1/theme.css`), `apps/web/src/routes/+layout.svelte`, `apps/web/src/routes/+layout.server.ts`, `apps/web/src/lib/components/{Seal,XpBar,CharacterCard}.svelte`, `apps/web/src/routes/+page.server.ts`; Modify: `apps/web/src/routes/+page.svelte`, `apps/web/package.json`
- Test: `apps/web/test/roster-page.test.ts`

**Interfaces:**
- Consumes: `getRoster`, `nextUp`, `loadQuests`, `getLevelCap`. Produces: page data `{ roster, nextByGuid: Record<string, Suggestion | null>, contentReady: boolean }`.
- Class colour map `classColor(token: string): string` in `apps/web/src/lib/classes.ts`, with a neutral fallback for unknown tokens.

- [ ] **Step 1: Write failing tests** calling the `load` function with an in-memory DB seeded by `ingestSavedVariables` from a fixture: returns cards newest first; `contentReady` false and `nextByGuid` all null when the mirror is empty; a character with a degraded identity still appears. Test `classColor` for known and unknown tokens.
- [ ] **Step 2: Run** and confirm failure.
- [ ] **Step 3: Implement.** Install `@fontsource/im-fell-english` and `@fontsource-variable/instrument-sans` and import them in the layout. Port the mockup markup to components; the layout holds the header nav (Roster, Talents later, Upload, Settings), the ForeverDB credit footer and the "Unofficial companion app" line. Empty roster shows "No characters yet. Upload a ForeverTracker file to begin" with a link to Upload. `contentReady` false shows a banner explaining to run `pnpm content:sync`.
- [ ] **Step 4: Run** `pnpm test && pnpm typecheck && pnpm --filter web build`; then start the app against `data-local` and compare with `docs/design/m1/roster.html` in the browser pane at desktop and 375px width; fix visible differences.
- [ ] **Step 5: Commit** `feat(web): theme, layout and roster page`.

### Task 8: Character page (Journey, Quests, Talents, Professions)

**Files:**
- Create: `apps/web/src/routes/c/[guid]/+layout.server.ts`, `+layout.svelte`, `+page.server.ts` (redirects to `quests`), and one route folder per tab: `journey`, `quests`, `talents`, `professions`, each with `+page.server.ts` and `+page.svelte`
- Test: `apps/web/test/character-pages.test.ts`

**Interfaces:**
- Consumes: `getCharacter`, `nextUp`, `chainProgress`, `loadQuests`, `getLevelCap`. Unknown guid returns 404.
- Tab contents: **Quests** = Next up panel + Quest chains + quest log counts as in `docs/design/m1/character.html`; **Journey** = event timeline (level ups, quest turn-ins, profession changes, newest first) and zones visited, each map shown as its zone name when the mirror can resolve the map id, else "Map <id>" (verify the resolvable field in Task 4's inspection; do not invent one); **Talents** = unspent points and "Recommended builds arrive in a later release" (no guide data yet); **Professions** = skill bars from the snapshot, recipes arrive later.

- [ ] **Step 1: Write failing tests** for each tab's `load`: unknown guid is 404; Quests tab with empty mirror returns an empty suggestion list and `contentReady false`; Journey with `visited = {}` returns an empty list; events are newest first; Professions with none returns an empty list.
- [ ] **Step 2: Run** and confirm failure; **Step 3: Implement** with the shared header (seal, name, facts, XP bar) in the layout and the tab nav marking `aria-current="page"`.
- [ ] **Step 4: Run** `pnpm test && pnpm typecheck && pnpm --filter web build`; check each tab in the browser pane against the mockup, desktop and 375px.
- [ ] **Step 5: Commit** `feat(web): character pages`.

### Task 9: Upload page and Settings

**Files:**
- Create: `apps/web/src/routes/upload/{+page.svelte,+page.server.ts}`, `apps/web/src/routes/settings/{+page.svelte,+page.server.ts}`
- Test: `apps/web/test/upload-page.test.ts`, `apps/web/test/settings-page.test.ts`

**Interfaces:**
- Consumes: `ingestSavedVariables`, `IngestError`, `LuaParseError`, `listDeviceTokens`, `revokeDeviceToken`, `createDeviceToken`, content sync state (`syncState` table).
- Produces: upload action `default` (multipart file field `file`, same 8 MB cap as ingest) returning `{ summary }` or `{ error }` (fail 400 with the parse or ingest message). Settings shows device tokens with a Revoke action and a "Create token" action that shows the new token once; content sync status per resource and build; login mode (`open` shows a warning to set `OWNER_PASSWORD`); credits.

- [ ] **Step 1: Write failing tests:** a valid fixture upload returns a summary and the roster gains the character; a non-ForeverTracker file returns the error text with status 400; an over-cap file is refused; revoke action marks the token revoked; the created token is returned once and verifies.
- [ ] **Step 2: Run** and confirm failure; **Step 3: Implement.** Show the new token in the action result only, never in a URL or stored in the page data afterwards.
- [ ] **Step 4: Run** `pnpm test && pnpm typecheck`; try an upload and a revoke in the browser pane.
- [ ] **Step 5: Commit** `feat(web): upload page and settings`.

### Task 10: Tooltip provider spike and setting

**Files:**
- Create: `apps/web/src/lib/components/ItemLink.svelte`, `docs/design/m1/tooltip-findings.md`; Modify: `.env.example`, `apps/web/src/lib/server/env.ts`
- Test: `apps/web/test/env.test.ts` (extend)

**Interfaces:**
- Produces: `TOOLTIP_PROVIDER` env, `"none" | "wowhead" | "foreverdb"`, default `"none"`; `ItemLink` renders a plain link and loads a provider script only when configured.

- [ ] **Step 1: Spike (throwaway page, not committed):** in the browser pane, open a Wowhead Forever page and a ForeverDB page with their tooltip scripts and check whether hover tooltips work for `/forever/` item, spell and quest links. Write results and the recommended default into `tooltip-findings.md`.
- [ ] **Step 2: Write failing env tests:** default `none`, valid values accepted, invalid value throws naming `TOOLTIP_PROVIDER`.
- [ ] **Step 3: Implement** the env field and `ItemLink` (script injected client-side only when a provider is set; link text works without it). Use `ItemLink` for equipped gear ids only if the Journey or Quests data already holds names; otherwise leave unused and note it in the findings.
- [ ] **Step 4: Run** `pnpm test && pnpm typecheck`; PASS.
- [ ] **Step 5: Commit** `feat(web): optional tooltip provider setting and findings`.

### Task 11: Smoke tests, docs and container check

**Files:**
- Create: `apps/web/playwright.config.ts`, `apps/web/e2e/smoke.spec.ts`; Modify: `README.md`, `docs/superpowers/m1-kickoff.md` (add a "state at end of M1" section), `Dockerfile` only if the new env vars or fonts need it
- Test: the Playwright spec itself

- [ ] **Step 1: Write the smoke spec** against a built app on a temp `DATA_DIR`: unauthenticated visit redirects to login when `OWNER_PASSWORD` is set; log in; empty roster shows the invitation; upload the fixture through the Upload page; roster shows the character; open the character and each tab without console errors; footer credit link present.
- [ ] **Step 2: Run** `pnpm --filter web exec playwright test`; fix failures. CI never needs a ForeverDB key.
- [ ] **Step 3: Rebuild the image and verify in the container:** `podman build -t forevertracker:dev .`, run it per README on a spare port with a throwaway volume, check login, upload and a character page, then tear it down. Do not touch the owner's `ft-data` volume.
- [ ] **Step 4: Update README** (login env vars, tokens revoke, tooltip provider, upload page) and the M1 state note.
- [ ] **Step 5: Run** `pnpm test && pnpm typecheck && (cd addon && ./test.sh)`; PASS. Scan tracked files for secrets and home paths before committing.
- [ ] **Step 6: Commit** `docs: M1 runbook and smoke tests`.

---

## Self-Review

- **Spec coverage:** roster (7), character page with Journey/Quests/Talents/Professions (8), manual upload and settings (9), "next up" (4, 5), local login (6), theme (7), tooltips (10), missing basics from the kickoff note (1, 2, 9). Talent playground, class/race chains, Battle.net login and the sync agent are M2/M3 per the spec.
- **Kickoff open questions:** exploration v1 = zones visited (Task 8); next-up rules (Task 5); tooltip provider (Task 10); basics (Tasks 1, 2).
- **Type consistency:** `CharacterCard`, `CharacterView`, `QuestRow`, `Suggestion` are defined once (Tasks 3, 4, 5) and consumed by name later.
- **Known unknowns, resolved by inspection inside the tasks, not guessed:** quest `chain`/`starts`/`ends` shapes, whether the sync stores `/meta`, and whether zone records resolve map ids (Task 4 step 1).
