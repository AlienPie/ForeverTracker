# ForeverTracker M0 — Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Everything in spec milestone M0 that can be built and tested before the game launches: monorepo, SavedVariables parser, ForeverDB client and content mirror, snapshot ingest, token-guarded upload endpoint, addon v0 tested against WoW API stubs, and a container image.

**Architecture:** Pure-TypeScript packages (`savedvars`, `content`, `db`, `core`) behind a thin SvelteKit app. Content comes from a rate-limited ForeverDB client into a SQLite mirror (or an on-demand cache, switched by `CONTENT_MODE`). Character data arrives as raw SavedVariables, is parsed (never executed), stored raw, and only minimally extracted at M0. The Lua addon is written defensively and tested under `busted` on LuaJIT against stubs.

**Tech Stack:** Node 22+ (v26.13.0 installed), pnpm workspaces, TypeScript (strict), Vitest, SvelteKit (adapter-node), Drizzle ORM + better-sqlite3, Lua 5.1 semantics (LuaJIT + `busted`), OCI container image built with Podman (Docker-compatible).

**Spec:** `docs/superpowers/specs/2026-11-01-forevertracker-design.md`

**Branch:** `feat/m0-foundations`, created from `docs/initial-design-spec`.

**Toolchain (verified 2026-11-01):** pnpm 12.16.1, LuaJIT, luarocks 3.13.0, busted 2.3.0, Podman 6.1.4 (rootless, crun). Node v26.13.0 lives under nvm, which non-interactive shells do not load, so **every shell command must start with** `export PATH="$HOME/.nvm/versions/node/v26.13.0/bin:$PATH"`. There is **no compose provider** (`podman compose` fails), so Task 12 verifies with `podman build` and `podman run`; `podman-compose` is optional.

## Global Constraints

- ForeverDB API: base `https://foreverdb.net/api/v1`, header `X-API-Key`; limits are 60 requests/min and 10,000/day per key; 429 carries `Retry-After`.
- The client stays **below** 60/min (default 50) and tracks the daily budget from `X-Daily-Remaining`.
- Only `packages/content` talks to ForeverDB. Nothing in the app calls Wowhead.
- Level cap is read from `/meta` (`levelCap`); never hard-coded.
- `CONTENT_MODE=mirror|on-demand`, default `mirror`; on-demand caches for 60 seconds.
- The SavedVariables parser **never executes Lua**; plain table syntax only.
- Capture defensively, store raw, normalize later: raw snapshot JSON is always kept.
- Secrets (ForeverDB key, Blizzard client ID/secret, session secret) live only in `.env` (gitignored); `.env.example` documents names. Keys and tokens are never logged or included in error messages. Device tokens are stored hashed.
- Attribution text `Data from ForeverDB.net` with a visible link to `https://foreverdb.net` wherever its data is shown.
- Characters are keyed by **GUID**; names are `Name-Surname`; there is no realm object.
- SQLite via Drizzle; one container image (OCI, built and verified with Podman) with a data volume.
- Do not copy code from ForeverDB's GPL-3.0 addon.
- End every commit message with the `Co-Authored-By` line from the session's attribution reminder.
- Do not add a `LICENSE` file yet (spec open item 3).

## Review Focus

Failure modes the spec implies but does not spell out, most likely first. Each has a test in the task named.

1. **Truncated or empty SavedVariables** (WoW can be killed mid-write; `.bak` files exist): parser throws `LuaParseError` with line/column, never hangs or crashes; empty/comment-only file returns `{}` (Task 2).
2. **Same snapshot uploaded twice, or an older one after a newer one:** no duplicate rows; the character's latest pointer never moves backwards (Task 7).
3. **ForeverDB 401/403, 429 mid-pagination, daily budget nearly exhausted:** auth failure aborts at once with a clear error; 429 waits `Retry-After`; sync resumes from its checkpoint and does not spend the last of the daily budget (Tasks 4, 5).
4. **Build changes during a sync:** the resource restarts instead of mixing two builds (Task 5).
5. **Snapshot with `unavailable` sections, missing sections or a newer `schema`:** raw is stored and ingest succeeds; extraction is skipped for unsupported schemas (Task 7).
6. **API key leaking** into thrown errors or logs (Task 4).

---

### Task 1: Workspace scaffold

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `vitest.workspace.ts`, `.env.example`, `README.md`
- Create: `packages/{savedvars,content,db,core}/package.json`, `tsconfig.json`, `src/index.ts`
- Modify: `docs/superpowers/specs/2026-11-01-forevertracker-design.md` (section 9 layout: add `packages/db/  Drizzle schema, migrations and DB access`)

**Interfaces:**
- Produces: workspace packages `@ft/savedvars`, `@ft/content`, `@ft/db`, `@ft/core`, each exporting from `src/index.ts`; root scripts `pnpm test`, `pnpm typecheck`.

- [ ] **Step 1:** Create the workspace files; `tsconfig.base.json` is `strict`, `module: NodeNext`, `target: ES2023`. Root `test` runs Vitest across packages; `typecheck` runs `tsc -b`.
- [ ] **Step 2:** Add one placeholder test per package (`expect(true).toBe(true)`) so the runner is proven.
- [ ] **Step 3:** `.env.example` lists exactly: `FOREVERDB_API_KEY`, `CONTENT_MODE=mirror`, `DATA_DIR=./data-local`, `SESSION_SECRET`, `OWNER_BATTLETAG`, `BLIZZARD_CLIENT_ID`, `BLIZZARD_CLIENT_SECRET`, `BLIZZARD_REDIRECT_URI` (all values empty except `CONTENT_MODE`).
- [ ] **Step 4:** Run `pnpm install && pnpm test && pnpm typecheck`. Expected: all pass.
- [ ] **Step 5:** Commit `chore: scaffold pnpm workspace and packages`.

### Task 2: SavedVariables parser (`@ft/savedvars`)

**Files:**
- Create: `packages/savedvars/src/{parser.ts,errors.ts,index.ts}`
- Test: `packages/savedvars/test/parser.test.ts`, fixture `packages/savedvars/test/fixtures/basic.lua`

**Interfaces:**
- Produces:
  - `type LuaValue = string | number | boolean | null | LuaValue[] | { [key: string]: LuaValue }`
  - `parseSavedVariables(source: string): Record<string, LuaValue>` — maps each top-level `Name = <value>` assignment to its value.
  - `class LuaParseError extends Error { line: number; column: number }`

- [ ] **Step 1: Write failing tests** (names and key assertions):
  - `parses nested tables and top-level assignments` — `A = { b = { c = 1 } }` → `{ A: { b: { c: 1 } } }`.
  - `converts contiguous 1..n integer keys to arrays` — `{ "a", "b" }` and `{ [1]="a", [2]="b" }` → `["a","b"]`.
  - `keeps gapped or non-integer numeric keys as an object with string keys` — `{ [1]=1, [3]=3 }` → `{ "1":1, "3":3 }`.
  - `parses numbers` — `-5`, `3.5`, `1e3`, `0xFF` → `-5`, `3.5`, `1000`, `255`.
  - `parses strings` — double/single quotes with `\n`, `\"`, `\\`, `\065` decimal escapes, and long strings `[[x]]` / `[==[x]==]`.
  - `parses booleans and nil`; `nil` → `null`.
  - `ignores comments` — `-- line` and `--[[ block ]]`.
  - `accepts trailing commas and ; separators`.
  - `empty or comment-only file returns {}`.
  - `rejects code` — `A = os.execute("x")`, `A = function() end`, `local x = 1` each throw `LuaParseError`.
  - `truncated input throws LuaParseError with line and column` — `A = { b = ` → `error.line === 1`, `error.column > 0`.
  - `parses a 5 MB generated table in under 2 seconds`.
  - `parses fixtures/basic.lua` (a hand-written file in real SavedVariables style with `["key"] = value, -- [1]` comments).
- [ ] **Step 2:** Run `pnpm --filter @ft/savedvars test`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `parseSavedVariables` in `parser.ts` as a hand-written tokenizer plus recursive-descent parser over the grammar above only; no `eval`, `Function` or Lua runtime. Reject anything outside the grammar. Cap nesting depth at 200 (throws `LuaParseError`).
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit `feat(savedvars): parse SavedVariables without executing Lua`.

### Task 3: Database package (`@ft/db`)

**Files:**
- Create: `packages/db/src/{schema.ts,client.ts,index.ts}`, `packages/db/drizzle/` (generated migrations), `drizzle.config.ts`
- Test: `packages/db/test/db.test.ts`

**Interfaces:**
- Produces:
  - `openDb(path: string): Db` — path `":memory:"` allowed; runs migrations on open.
  - Tables (Drizzle): `contentRecord(resource, id, build, data, fetchedAt)` PK `(resource, id)`, `data` is JSON text; `syncState(resource PK, build, nextOffset, total nullable, status 'idle'|'running'|'complete'|'failed', updatedAt)`; `character(guid PK, name, class, race, level, firstSeenAt, latestTakenAt)`; `snapshot(guid, takenAt, build, schema, raw, unsupported boolean)` PK `(guid, takenAt)`; `deviceToken(id, label, tokenHash unique, createdAt, revokedAt nullable)`.
  - `type Db` (Drizzle better-sqlite3 database).

- [ ] **Step 1: Write failing tests:** `openDb(":memory:") creates all tables`; `contentRecord rejects duplicate (resource,id)`; `snapshot rejects duplicate (guid,takenAt)`; `deviceToken.tokenHash is unique`.
- [ ] **Step 2:** Run `pnpm --filter @ft/db test`. Expected: FAIL.
- [ ] **Step 3:** Define the schema in `schema.ts`, generate the migration with `drizzle-kit generate`, implement `openDb` to apply migrations synchronously.
- [ ] **Step 4:** Run tests. Expected: PASS.
- [ ] **Step 5:** Commit `feat(db): add SQLite schema and migrations`.

### Task 4: ForeverDB client (`@ft/content`)

**Files:**
- Create: `packages/content/src/client/{client.ts,limiter.ts,errors.ts,types.ts}`, `tools/live-check.ts`
- Test: `packages/content/test/client.test.ts`, recorded fixtures `packages/content/test/fixtures/{meta.json,quests-page.json}` (trimmed copies of real responses; contain no key)

**Interfaces:**
- Produces (exported from `@ft/content`):
  - `type ApiMeta = { build: string; total?: number; limit?: number; offset?: number; next?: string | null; client?: string; attribution: string }`
  - `type ApiResponse<T> = { data: T; meta: ApiMeta }`
  - `type Page<T> = { items: T[]; offset: number; total: number; nextOffset: number | null; build: string }`
  - `interface ForeverDbClient { get<T>(path: string, query?: Record<string, string | number | boolean>): Promise<ApiResponse<T>>; pages<T>(path: string, opts?: { query?: Record<string, string | number | boolean>; startOffset?: number; limit?: number }): AsyncGenerator<Page<T>> }`
  - `createForeverDbClient(opts: { apiKey: string; baseUrl?: string; fetch?: typeof fetch; now?: () => number; sleep?: (ms: number) => Promise<void>; perMinute?: number; dailyReserve?: number }): ForeverDbClient` — defaults `perMinute: 50`, `dailyReserve: 200`.
  - Errors: `ForeverDbAuthError` (401/403), `ForeverDbBudgetError` (daily remaining ≤ reserve), `ForeverDbHttpError { status }`.

- [ ] **Step 1: Write failing tests** using a fake `fetch`, fake clock and recording `sleep`:
  - `sends X-API-Key and returns data and meta`.
  - `never sends more than perMinute requests in any 60s window` (send 120 calls; assert on the recorded timestamps).
  - `waits Retry-After seconds on 429 then retries` (assert `sleep(5000)` for `Retry-After: 5`; gives up with `ForeverDbHttpError` after 3 retries).
  - `retries 5xx with 1s, 2s, 4s backoff then throws`.
  - `401 and 403 throw ForeverDbAuthError immediately with no retry`.
  - `throws ForeverDbBudgetError when X-Daily-Remaining <= dailyReserve` on the *next* call.
  - `pages() follows offset/limit using meta.total and ends when nextOffset is null`; `pages() resumes from startOffset`.
  - `errors and their messages never contain the api key` — trigger each error type with key `fdb_secret` and assert `JSON.stringify(err)` and `err.message` exclude it.
- [ ] **Step 2:** Run `pnpm --filter @ft/content test`. Expected: FAIL.
- [ ] **Step 3: Implement** `createForeverDbClient`: a sliding-window limiter in `limiter.ts`, header parsing (`X-Daily-Remaining`, `Retry-After`) in `client.ts`; paging uses `meta.next` presence/`offset+limit < total`.
- [ ] **Step 4:** Run tests. Expected: PASS.
- [ ] **Step 5:** `tools/live-check.ts`: reads `FOREVERDB_API_KEY` from env, prints `/meta` build, level cap and the remaining daily budget. **Do not run in CI.** Run once manually: `FOREVERDB_API_KEY=… pnpm tsx tools/live-check.ts`. Expected: prints build `1.60.x` and level cap.
- [ ] **Step 6:** Commit `feat(content): add rate-limited ForeverDB client`.

### Task 5: Content mirror and sync

**Files:**
- Create: `packages/content/src/mirror/{resources.ts,sync.ts,store.ts}`, `packages/content/src/cli/sync.ts`
- Test: `packages/content/test/{sync.test.ts,store.test.ts}`

**Interfaces:**
- Consumes: `ForeverDbClient`, `Page<T>` (Task 4); `Db`, `contentRecord`, `syncState` (Task 3).
- Produces:
  - `type ResourceSpec = { name: string; fetch(client: ForeverDbClient, resume: { offset: number }): AsyncGenerator<{ records: { id: string; data: unknown }[]; nextOffset: number | null; build: string }> }`
  - `RESOURCES: ResourceSpec[]` for `zones`, `quests`, `vendors`, `dungeons`, `classes`, `professions`, `gathering` (list-and-detail resources fetch each detail by key).
  - `syncResource(deps: { client: ForeverDbClient; db: Db; now?: () => number }, spec: ResourceSpec): Promise<void>`
  - `syncAll(deps): Promise<void>`
  - `checkBuild(deps): Promise<{ build: string; levelCap: number; changed: boolean }>` — calls `/meta`, compares with the stored build.
  - `getRecord(db, resource, id): { data: unknown; build: string; fetchedAt: number } | null`, `listRecords(db, resource, opts?: { limit?: number; offset?: number }): unknown[]`.
  - `getItem(deps, id: number): Promise<unknown>` — lazy: returns the stored record, else fetches `/items/{id}` and stores it.
  - Script `pnpm content:sync` runs `syncAll` and prints per-resource progress (`quests 1200/3862`).

- [ ] **Step 1: Write failing tests** using a fake client and in-memory DB:
  - `syncResource stores every record and marks status complete`.
  - `checkpoint advances after each page` (kill after page 2, assert `nextOffset` persisted).
  - `a resumed sync starts at the stored offset and does not refetch earlier pages`.
  - `restarts the resource from offset 0 if the build changed mid-sync` (page 1 build A, page 2 build B → stored records all carry B; no A rows remain).
  - `sync stops with status failed and keeps its checkpoint on ForeverDbBudgetError`; same for `ForeverDbAuthError` (error propagates).
  - `checkBuild reports changed=false when the build matches` and returns `levelCap` from `/meta`.
  - `getItem fetches once and serves later calls from the store`.
- [ ] **Step 2:** Run tests. Expected: FAIL.
- [ ] **Step 3: Implement** `sync.ts` and `store.ts` per the interfaces. Use the real response shapes already verified (quest rows carry `id`, `name`, `level`, `zone`, `chain`, `starts`, `ends`; classes/professions need a detail call per key; professions page their recipes with `limit/offset`) — inspect actual responses with `live-check` first and put any shape you find in a code comment.
- [ ] **Step 4:** Run tests. Expected: PASS.
- [ ] **Step 5:** Commit `feat(content): add resumable content mirror`.

### Task 6: On-demand source and `CONTENT_MODE`

**Files:**
- Create: `packages/content/src/source.ts`
- Test: `packages/content/test/source.test.ts`

**Interfaces:**
- Consumes: `ForeverDbClient`, `getRecord`/`listRecords`.
- Produces:
  - `interface ContentSource { get(resource: string, id: string): Promise<unknown | null>; list(resource: string, query?: Record<string, string | number>): Promise<unknown[]> }`
  - `createContentSource(opts: { mode: "mirror" | "on-demand"; client: ForeverDbClient; db: Db; now?: () => number }): ContentSource`
  - `parseContentMode(value: string | undefined): "mirror" | "on-demand"` — `undefined`/empty → `"mirror"`; anything else invalid throws.

- [ ] **Step 1: Write failing tests:** `mirror mode reads from the DB and makes no API calls`; `on-demand fetches and serves the same request from cache for 60s, refetches after 60s` (fake clock); `parseContentMode defaults to mirror and throws on garbage`.
- [ ] **Step 2:** Run tests. Expected: FAIL.
- [ ] **Step 3:** Implement. On-demand cache is an in-memory `Map` keyed by `resource + query`, TTL 60,000 ms.
- [ ] **Step 4:** Run tests. Expected: PASS.
- [ ] **Step 5:** Commit `feat(content): add ContentSource with mirror and on-demand modes`.

### Task 7: Snapshot contract and ingest (`@ft/core`)

**Files:**
- Create: `packages/core/src/snapshot/{types.ts,ingest.ts}`, `docs/addon-contract.md`
- Test: `packages/core/test/ingest.test.ts`, fixture `packages/core/test/fixtures/ForeverTracker.lua`

**Interfaces:**
- Consumes: `parseSavedVariables` (Task 2); `Db`, `character`, `snapshot` (Task 3).
- Produces:
  - `type Unavailable = { unavailable: true; reason: string }`; `type Maybe<T> = T | Unavailable`
  - `type Snapshot = { takenAt: number; build: string; identity: Maybe<{ name: string; surname?: string; class: string; race: string; faction: string; level: number; xp: number; xpMax: number }>; time: Maybe<{ played: number; playedLevel: number }>; state: Maybe<{ zone: string; subzone: string; mapId: number; x: number; y: number; money: number; equipped: Record<string, number> }>; progress: Maybe<{ talents: Maybe<{ nodes: Record<string, number>; unspent: number }>; professions: Maybe<{ skillLine: number; name: string; rank: number; max: number }[]>; questsCompleted: Maybe<number[]>; questLog: Maybe<{ id: number }[]> }>; exploration: Maybe<{ visited: { mapId: number; subzone: string; firstSeen: number }[]; taxi?: number[] }> }`
  - `const SUPPORTED_SCHEMA = 1`
  - `ingestSavedVariables(db: Db, source: string, now?: () => number): { characters: number; stored: number; skipped: number; unsupported: number }`
- `docs/addon-contract.md` documents the SavedVariables shape: `ForeverTrackerDB = { schema = 1, characters = { ["<GUID>"] = { snapshot = {…}, events = { { t = <unix>, kind = "<string>", data = {…} } } } } }`, with an example.

- [ ] **Step 1: Write failing tests** using the fixture (two characters):
  - `stores one snapshot per character and creates character rows`.
  - `uploading the same file twice creates no duplicates` (`stored` 0 on the second call, `skipped` 2).
  - `an older snapshot does not move latestTakenAt backwards` (the older one is still stored).
  - `unavailable sections are stored raw and do not throw`.
  - `missing sections (no exploration key) are stored raw and do not throw`.
  - `schema newer than SUPPORTED_SCHEMA stores raw with unsupported=true and skips extraction`.
  - `character row is updated from identity when available`.
  - `a snapshot for a GUID with no identity still creates the character row with null name`.
- [ ] **Step 2:** Run `pnpm --filter @ft/core test`. Expected: FAIL.
- [ ] **Step 3:** Implement `ingestSavedVariables`. Idempotency key is `(guid, takenAt)`; `character.latestTakenAt = max(existing, new)`. Wrap each character in its own transaction so one bad character cannot lose the others.
- [ ] **Step 4:** Run tests. Expected: PASS.
- [ ] **Step 5:** Write `docs/addon-contract.md` (shape, `unavailable` convention, schema versioning rule: increment `schema` on any breaking change).
- [ ] **Step 6:** Commit `feat(core): ingest addon snapshots idempotently`.

### Task 8: Web skeleton, token auth and ingest endpoint

**Files:**
- Create: `apps/web/` (SvelteKit with adapter-node), `apps/web/src/lib/server/{env.ts,tokens.ts,db.ts}`, `apps/web/src/routes/api/health/+server.ts`, `apps/web/src/routes/api/ingest/+server.ts`, `apps/web/src/routes/+page.svelte` (credit footer only), `apps/web/scripts/create-token.ts`
- Test: `apps/web/test/{tokens.test.ts,ingest-route.test.ts}`

**Interfaces:**
- Consumes: `openDb`, `deviceToken` (Task 3); `ingestSavedVariables` (Task 7).
- Produces:
  - `createDeviceToken(db: Db, label: string): { id: number; token: string }` — token is 32 random bytes, base64url; only its SHA-256 is stored.
  - `verifyDeviceToken(db: Db, token: string): { id: number } | null` — revoked tokens return `null`.
  - `GET /api/health` → `200 {"ok":true}`.
  - `POST /api/ingest` — `Authorization: Bearer <token>`, body = raw SavedVariables text (`text/plain`), max 8 MB; `200` with the ingest summary; `401` bad/missing token; `413` oversize; `422` with `{line, column}` on `LuaParseError`.
  - `pnpm token:create <label>` prints the token once.

- [ ] **Step 1: Write failing tests:** `tokens are stored hashed, never plaintext`; `revoked token fails verification`; `ingest 401 without bearer`; `ingest 401 with a wrong token`; `ingest 413 above 8 MB`; `ingest 422 with position for truncated Lua`; `ingest 200 and rows created for the fixture`.
- [ ] **Step 2:** Run `pnpm --filter web test`. Expected: FAIL.
- [ ] **Step 3:** Implement. `env.ts` reads and validates env once; it must not print secret values. The page footer carries `<a href="https://foreverdb.net">Data from ForeverDB.net</a>`.
- [ ] **Step 4:** Run tests. Expected: PASS. Also run `pnpm --filter web build`. Expected: success.
- [ ] **Step 5:** Commit `feat(web): add health, token auth and ingest endpoint`.

### Task 9: Addon framework and identity/time/state collectors

**Files:**
- Create: `addon/ForeverTracker/{ForeverTracker.toc,Core.lua,Collectors/Identity.lua,Collectors/State.lua}`, `addon/tests/{stubs.lua,core_spec.lua,identity_spec.lua,state_spec.lua}`, `addon/.busted`
- Document: `addon/README.md` (install path, how to run tests: `cd addon && busted`, using LuaJIT)

**Interfaces:**
- Produces (global table `FT`):
  - `FT.safe(fn, ...) -> value | { unavailable = true, reason = <string> }` — wraps `pcall`.
  - `FT.collectors` — ordered list of `{ key = "identity", run = function() ... end }`.
  - `FT.takeSnapshot() -> table` matching the `Snapshot` shape in Task 7 (`takenAt = time()`, `build = select(4, GetBuildInfo())` or its string form, one key per collector).
  - `FT.save()` — writes `ForeverTrackerDB.characters[UnitGUID("player")].snapshot`, preserving existing `events`; sets `ForeverTrackerDB.schema = 1`.
  - TOC: `## Interface: 16001`, `## SavedVariables: ForeverTrackerDB`, files listed in load order.
- Identity collector fields: `name`, `class` (from `UnitClass`), `race`, `faction`, `level`, `xp` (`UnitXP`), `xpMax` (`UnitXPMax`). State collector: `zone` (`GetRealZoneText`), `subzone` (`GetSubZoneText`), `mapId` (`C_Map.GetBestMapForUnit`), `x`,`y` (`C_Map.GetPlayerMapPosition`), `money` (`GetMoney`), `equipped` (slot→item ID via `GetInventoryItemLink`). `surname` is split from the character name on `-` when present.

- [ ] **Step 1: Write failing specs** with stubs of the WoW globals: `safe returns the value on success`; `safe returns an unavailable marker with the reason when fn errors`; `takeSnapshot still returns other sections when one collector errors` (stub `UnitXP` to throw → `identity` is `unavailable`, `state` present); `takeSnapshot works when C_Map is nil` (state.mapId missing → whole state section degrades without throwing); `save keeps existing events`; `save writes schema = 1`; `identity splits Name-Surname`.
- [ ] **Step 2:** Run `cd addon && busted`. Expected: FAIL.
- [ ] **Step 3:** Implement `Core.lua` and the two collectors; every access to a WoW global goes through `FT.safe` or a nil check. Use Lua 5.1 syntax only (no `goto`, no integer division, no `//`).
- [ ] **Step 4:** Run `busted`. Expected: PASS.
- [ ] **Step 5:** Cross-check: run `FT.takeSnapshot` under the stubs, serialize with a minimal Lua table writer in the spec helper, and feed it through `parseSavedVariables` + `ingestSavedVariables` (script `tools/addon-roundtrip.ts` run manually). Expected: ingest summary `stored: 1`.
- [ ] **Step 6:** Commit `feat(addon): add snapshot framework and identity/state collectors`.

### Task 10: Addon progression collectors

**Files:**
- Create: `addon/ForeverTracker/Collectors/{Time.lua,Talents.lua,Professions.lua,Quests.lua}`
- Test: `addon/tests/{time_spec.lua,talents_spec.lua,professions_spec.lua,quests_spec.lua}`

**Interfaces:**
- Consumes: `FT.safe`, `FT.collectors` (Task 9).
- Produces collectors `time`, `talents` (inside `progress`), `professions`, `questsCompleted`/`questLog` matching Task 7's types.
  - `FT.requestPlayed()` calls `RequestTimePlayed()`; the `TIME_PLAYED_MSG` handler stores `played`/`playedLevel` for the next snapshot.
  - `FT.setQuestIdList(ids: number[])` — the list of quest IDs to probe; default empty until the server-supplied list exists (document this in `addon/README.md`).
- Talents: prefer trait tree — `C_ClassTalents.GetActiveConfigID()` → `C_Traits.GetConfigInfo` → nodes via `C_Traits.GetTreeNodes` / `C_Traits.GetNodeInfo(configID, nodeID).currentRank`; fall back to `GetNumTalentTabs`/`GetTalentInfo`; if neither exists return `unavailable`. `unspent` from `C_Traits.GetTreeCurrencyInfo`.
- Professions: `GetNumSkillLines`/`GetSkillLineInfo`, keeping only primary and secondary professions.
- Quests: `C_QuestLog.IsQuestFlaggedCompleted(id)` for each probe ID; quest log via `C_QuestLog.GetNumQuestLogEntries`/`C_QuestLog.GetInfo`, skipping headers.

- [ ] **Step 1: Write failing specs:** `talents uses the trait tree when C_Traits exists`; `talents falls back to tabs when only GetTalentInfo exists`; `talents is unavailable when neither API exists`; `professions excludes non-profession skill lines`; `questsCompleted lists only IDs flagged completed`; `questsCompleted with 6000 IDs completes in under 1 second under stubs`; `questLog skips header rows`; `time uses the cached TIME_PLAYED_MSG values and reports unavailable if none yet`.
- [ ] **Step 2:** Run `busted`. Expected: FAIL.
- [ ] **Step 3:** Implement the collectors, each behind `FT.safe`.
- [ ] **Step 4:** Run `busted`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(addon): add talent, profession, quest and time collectors`.

### Task 11: Addon exploration, events and `/ft sync`

**Files:**
- Create: `addon/ForeverTracker/{Collectors/Exploration.lua,Events.lua,Slash.lua}`
- Test: `addon/tests/{exploration_spec.lua,events_spec.lua,slash_spec.lua}`

**Interfaces:**
- Consumes: `FT.safe`, `FT.save`, `FT.takeSnapshot` (Task 9).
- Produces:
  - `FT.recordVisit()` — adds `{ mapId, subzone, firstSeen }` to a persistent per-character set (key `mapId .. ":" .. subzone`); idempotent.
  - `FT.logEvent(kind: string, data: table)` — appends `{ t, kind, data }` to the character's `events`, capped at the newest 500.
  - Event wiring: `PLAYER_ENTERING_WORLD`, `PLAYER_LEAVING_WORLD`, `PLAYER_LOGOUT` (save), `PLAYER_LEVEL_UP` (`level_up`), `QUEST_TURNED_IN` (`quest_turned_in`), `ZONE_CHANGED`, `ZONE_CHANGED_INDOORS`, `ZONE_CHANGED_NEW_AREA` (visit), `SKILL_LINES_CHANGED` (`profession_changed`), `TAXIMAP_OPENED` (record known taxi nodes via `GetTaxiNodesForMap`, unavailable if missing).
  - Slash command `/ft sync` → `FT.requestPlayed()`, `FT.save()`, then `ReloadUI()`.

- [ ] **Step 1: Write failing specs:** `recordVisit stores a place once and keeps the earliest firstSeen`; `events are capped at 500 and keep the newest`; `PLAYER_LEVEL_UP logs a level_up event with the new level`; `/ft sync saves before calling ReloadUI` (assert call order); `exploration is unavailable when C_Map is missing`; `taxi is omitted, not an error, when GetTaxiNodesForMap is missing`.
- [ ] **Step 2:** Run `busted`. Expected: FAIL.
- [ ] **Step 3:** Implement and register events in `Events.lua`.
- [ ] **Step 4:** Run `busted`. Expected: PASS. Then re-run the Task 9 Step 5 round trip. Expected: ingest still succeeds with events and exploration present.
- [ ] **Step 5:** Commit `feat(addon): track visited places, events and /ft sync`.

### Task 12: Container image and runbook

**Files:**
- Create: `Dockerfile` (Podman reads it as-is), `compose.yaml` (for Docker or `podman-compose` users; not verified here), `.dockerignore`
- Modify: `README.md` (run with `podman run`, env vars, token creation, upload with `curl`, how to install the addon, the launch-day verification checklist from spec section 12 item 4)

**Interfaces:**
- Produces: image `forevertracker:dev` running the SvelteKit server on port 3000 with `DATA_DIR=/data` (volume), configured by `--env-file .env`; serves `/api/health`.

- [ ] **Step 1:** Write a multi-stage `Dockerfile` (pnpm install → build web → slim runtime with the Node adapter output and the built migrations), non-root user. Write `compose.yaml` with `env_file: .env` and a named volume on `/data`.
- [ ] **Step 2:** Run `podman build -t forevertracker:dev .`. Expected: success.
- [ ] **Step 3:** Run `podman run -d --name ft-test -p 3000:3000 -v ft-data:/data --env-file .env.example forevertracker:dev`, then `curl -s localhost:3000/api/health`. Expected: `{"ok":true}`. Then `podman rm -f ft-test && podman volume rm ft-data`.
- [ ] **Step 4:** Confirm no secret is baked into the image: `podman history --no-trunc forevertracker:dev | grep -i fdb_` returns nothing.
- [ ] **Step 5:** Commit `chore: add container image and runbook`.

---

## Self-review (against the spec)

- **Coverage:** M0 items in spec §11 — skeleton (1), container image (12), DB schema (3), ForeverDB client and mirror (4–6), SavedVariables parser (2), fixtures (2, 7), addon v0 against stubs (9–11) — all have tasks. Ingest (§5.3) is covered in 7 and 8 (raw store plus character row; fan-out tables are deferred to M1 because the real file is unknown). `/meta` level cap is in 5. Attribution is in 8. Sync agent, login, UI, advice and curated data belong to later plans.
- **Spec amendment:** `packages/db` is added in Task 1; the spec layout is updated there.
- **Types:** `Snapshot` (7) matches what the collectors in 9–11 emit; `ForeverDbClient`, `Page` (4) match the uses in 5 and 6; `Db` (3) is used consistently.
- **Review Focus:** every item has a named test (items 1→T2, 2→T7, 3→T4/T5, 4→T5, 5→T7, 6→T4).
- **Known gaps to resolve in the next plan, after launch:** real collector fixes against the live file; fan-out extraction tables; manual upload page and local login.
