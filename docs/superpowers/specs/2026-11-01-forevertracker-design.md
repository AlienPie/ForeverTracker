# ForeverTracker — Design

Date: 2026-11-01
Status: Draft for review

## 1. Purpose

A self-hosted web app that acts as a companion for playing **World of Warcraft: Forever**
(Blizzard official EU servers, Normal/PvE ruleset). It tracks every character on the
owner's account and recommends what to do next, using rules over community data. It does
**not** use an LLM at runtime.

Primary goals, in priority order:

1. **Levelling and exploration guidance.** Show what to do next per character: quests in
   range, chain progress, class/race/profession quest lines, with level, giver and
   location. The point of Forever is discovering the world, so tracking *where I have been
   and which quests I have done* matters more than racing to the level cap.
2. **Professions.** Recipes to learn or skill up, trainers, gathering spots, key items.
3. **Playtime and progress.** Per-character and account-wide.
4. **Talents.** View current builds, compare with guide-recommended builds, and a
   playground for planning builds.
5. **Later:** a daily plan ("what am I doing with this character today").

Non-goals: real-time tracking while playing; anything that reads game memory or automates
the client (against the ToS); multi-user hosting (the app serves one account, though anyone
can self-host their own copy); LLM-generated advice.

## 2. Constraints and verified facts

Verified on 2026-11-01 against the live API, the local client install and public pages.

- Client build `1.60.1.70707`; addon TOC `Interface: 16001`. Level cap reported by the
  ForeverDB API is currently 30 (beta). **The cap must be read from `/meta`, never
  hard-coded.**
- **ForeverDB API** (`https://foreverdb.net/api/v1`, read-only JSON, `X-API-Key` header):
  60 requests/min and 10,000/day per key (429 + `Retry-After` beyond that; usage in
  `X-RateLimit-*` and `X-Daily-*` headers). Responses carry `Cache-Control: private,
  max-age=60`, `Vary: X-API-Key`, and no `ETag`/`Last-Modified`.
  Endpoints: meta, items, spells, quests, vendors, dungeons, zones, classes (with talent
  trees), itemsets, professions (with recipes and trainers), gathering, battlegrounds,
  changes-seen, articles, posts. **There are no character, armory or guild endpoints.**
  Quests have level, required level, side, zone, start/end NPCs with coordinates and a
  chain (previous/next) but **no class or race restriction**. Records carry per-field
  provenance labels ("seen in WoW Forever" vs "Classic data").
- **ForeverDB terms:** credit ForeverDB.net with a visible link to `https://foreverdb.net`
  wherever its data is shown; do not resell or present the data as our own; stay inside
  the rate limits. The docs do not say whether a long-lived local copy is allowed (see
  open items).
- **Character state is only available from an addon.** Addons cannot use the network or
  write files except SavedVariables, which are flushed to disk only on logout, `/reload`
  or exit. So character data is always a snapshot.
- **Forever's addon API** (inferred from ForeverDB's addon source, which is GPL-3.0; we
  learn API names from it and do not copy code): talents use Blizzard's **trait tree**
  (`C_ClassTalents`, `C_Traits`), not classic tabs. Quest completion is checked per
  quest ID (`C_QuestLog.IsQuestFlaggedCompleted`). Professions, money, XP, zone and map
  position (`C_Map`), equipped items, reputation, bags and taxi nodes are all available.
- **Blizzard Battle.net API** also answers for Forever (per third-party probing, not
  verified by us): static game data, and an account profile that needs a user token with
  the `wow.profile` scope. Character-level endpoints reportedly return 404. A free
  developer client is registered with redirect URLs `https://localhost` and a hosted URL.
- **Wowhead** has Forever listings (`/forever/quests/classes/<class>`,
  `/forever/quests/professions/<profession>`, plus dungeons, raids, battlegrounds, world
  events and zones) with class/race-specific tagging and quest IDs in the links. Its
  `robots.txt` blocks named AI crawlers; the pages are JavaScript-rendered. **The app
  never calls Wowhead.** It is used only as a human-driven reference (section 8).
- **Wowhead's tooltip script** (`wow.zamimg.com/js/tooltips.js`) is offered to fansites.
  Whether it handles `/forever/` links is unverified.
- The game is not playable until launch; addon code written before then is untested
  against the live client.

## 3. Architecture

Four layers in one monorepo. Each has one purpose, a narrow interface and is testable
alone.

```
 addon (Lua) ──SavedVariables──▶ upload / sync agent ──▶ ingest
                                                            │
 ForeverDB API ──▶ content layer (mirror) ──┐               ▼
                                            ├──▶ advice engine ──▶ web UI
                     character layer ◀──────┘   (pure functions)
```

1. **Content layer** — typed ForeverDB client, local mirror, build tracking.
2. **Character layer** — snapshot ingest and normalized per-character model with history.
3. **Advice engine** — pure functions `(character, content, curated data) → suggestions`.
4. **Web UI** — SvelteKit, server-rendered from SQLite.

Stack: TypeScript throughout; SvelteKit (Node adapter); SQLite via Drizzle; one container
image (Docker or Podman) with a data volume; the addon in Lua; the sync agent later as a single static Go
binary. SQLite fits one user and makes backup a file copy.

## 4. Content layer

- **Client:** token bucket held below 60/min, daily budget tracked from
  `X-Daily-Remaining`, `Retry-After` honoured on 429, pagination and backoff built in.
  Nothing outside this layer calls ForeverDB.
- **Mirror:** SQLite tables for quests, zones, classes (with talent trees), professions
  (recipes, trainers), vendors, gathering and dungeons. Items (about 22k) are fetched
  lazily by ID when something references them. Raw JSON and provenance labels are stored.
- **Sync:** first sync is resumable and checkpointed (about 700 calls, 15–20 minutes at a
  safe rate) and shows progress in the UI. The app polls `/meta`; when the build changes
  it refreshes what changed.
- **Policy switch:** `CONTENT_MODE=mirror|on-demand`. `on-demand` fetches as needed with a
  60-second cache. Default is `mirror`; flip to `on-demand` if ForeverDB says a local
  copy is not allowed.
- **Attribution:** a "Data from ForeverDB.net" link is part of the base layout and
  appears wherever its data is shown. Wowhead is credited as a source for the curated
  tagging data.

## 5. Character layer and addon

### 5.1 Principles

- **Capture defensively, store raw, normalize later.** Every collector runs under `pcall`;
  a missing or changed API marks that field `unavailable` and the rest of the snapshot is
  still written.
- The server stores each snapshot's **raw JSON** and extracts normalized tables from it,
  so extractor fixes can be re-run over history.
- Snapshots carry a `schema` version and the game build.
- The **SavedVariables parser never executes Lua**. It parses plain table syntax only.

### 5.2 Addon snapshot (v1)

One account-wide SavedVariables table keyed by character **GUID** (Forever characters have
no realm object and are named `Name-Surname`):

- **Identity:** name, class, race, faction, level, XP.
- **Time:** total and per-level played time (`/played`), snapshot timestamp, game build.
- **State:** zone, subzone, map ID and position, gold, equipped items.
- **Progression:** talents as trait nodes (node, rank, unspent points); profession skill
  lines and ranks; completed quests, probed per quest ID from a list the server supplies
  or the addon ships; current quest log with objective progress.
- **Exploration:** a visited-places set built by the addon from zone-change events
  (`uiMapID` + subzone, first-seen time), plus known flight paths if the API exposes them.
  Not dependent on any game "discovered" API.
- **Event log:** capped list of timestamped events (level-up, quest turn-in, first visit,
  profession change). Powers "what did I do last session" and the later daily plan.

Snapshot triggers: login, logout, level-up, quest turn-in, profession change, and a
`/ft sync` command that captures and calls `ReloadUI()` to flush the file immediately.

Deferred past v1: bags/bank, reputation, mounts, combat data.

### 5.3 Ingest

Parse the Lua file to JSON; idempotent on (character GUID, snapshot time); store raw JSON;
fan out to tables for characters, quest completions, visited places, profession skills,
talent allocations and events. New characters appear automatically on first snapshot.

### 5.4 Getting data to the server

1. **Manual upload first:** drag the SavedVariables file into the web UI.
2. **Sync agent later:** a small per-machine binary that watches the file and posts it.
   Machines in use: macOS, SteamOS and CachyOS (the latter two under Wine/Proton).

Upload and agent use **per-device bearer tokens** (created and revoked in Settings,
stored hashed) that can only push snapshots.

## 6. Advice engine

Pure functions from (character snapshot, content mirror, curated data) to ranked
suggestions. Each suggestion has a kind, title, reason, steps, source label and
confidence, so the UI can always say why and where it came from.

v1 rules:

- **Next quests:** in level range, correct side, prerequisites done, near the character
  or continuing a started chain.
- **Chain tracker:** position within each quest line.
- **Class, race and profession chains:** show the next one, the level it becomes
  available, who gives it and where (levels and locations from ForeverDB; the class/race
  tag from curated data, section 8).
- **Professions:** recipes to learn or skill up at the current rank, nearest trainers,
  gathering spots by zone.
- **Talents:** unspent-point reminders and recommended builds.
- Filter by the live level cap from `/meta`; hide quests above it.
- Where guide coverage is missing, say "no recommendation yet" rather than substituting a
  Classic or Season of Discovery build.

## 7. Web app

**Access.** A local login for the owner (password from env or first-run setup). If the
Blizzard client variables are set, "Log in with Battle.net" appears, restricted by an
`OWNER_BATTLETAG` allowlist. Neither is required to run the app.

**Pages.**

- **Roster (home):** a card per character (class/race, level and XP bar, zone, gold,
  playtime, time since last sync, profession chips, one-line "next up") and an account-wide
  playtime/progress summary.
- **Character page**, tabs: *Journey* (event timeline, visited places), *Quests* (log,
  chain progress, class/race/profession chains, next up), *Talents* (current vs
  recommended), *Professions* (skills, recipes, gathering), *Gear* (later).
- **Talent playground:** standalone page using ForeverDB tree data; prerequisite and tier
  rules enforced; builds saved and shareable by URL; compare with a character's real build
  and with curated guide builds.
- **Settings:** devices and tokens, upload, content-sync status, credits.
- **Planning view:** after v1.

**Look and feel.** Dark, stone-and-gold accents, parchment panels, standard class and
item-quality colours, an open fantasy serif for headings and a clean sans for text. No
Blizzard artwork or logos. Server-rendered from SQLite with heavy work precomputed at
ingest. Static mockups of the roster and a character page precede UI code.

**Tooltips and icons.** Behind a `TooltipProvider` setting: Wowhead's tooltip script
(items, spells, quests; includes icons) or ForeverDB's embed (same data as the mirror).
Default is whichever handles Forever links correctly after testing.

## 8. Curated data

Lives in `data/` as versioned files, not code. Each file records the game build it was
written for and its sources; the app flags files older than the current build. Updating
for a patch means editing data.

- **Class, race and profession quest tags:** generated from Wowhead's Forever listings by a
  **maintainer tool** — a browser-console snippet run by a person on pages they have
  opened — which extracts (quest ID, name, level, required level) into JSON. About 22
  pages (9 classes, ~13 professions) once per patch. A validation script checks every ID
  against the ForeverDB mirror and reports misses. The app never fetches Wowhead.
- **Talent builds:** recorded from guides (Icy Veins, Wowhead and similar) as lists of
  node ranks with the guide link, author/date and game build. Facts only; no guide text.
  Absent builds are represented as "no recommendation".

## 9. Repository layout

```
apps/web/                 SvelteKit app
packages/core/            snapshot types, advice rules (pure TS)
packages/content/         ForeverDB client and mirror
packages/savedvars/       SavedVariables parser (no Lua execution)
packages/db/              Drizzle schema, migrations and DB access
addon/ForeverTracker/     Lua addon
tools/                    maintainer scripts (Wowhead snippet, ID validator)
data/                     curated quest tags and guide builds
agent/                    sync agent (later)
docs/superpowers/specs/   design documents
Dockerfile, compose.yaml, .env.example, .gitignore
```

Secrets (ForeverDB key, Blizzard client ID/secret, session secret) live only in `.env`,
which is gitignored; `.env.example` documents the variable names. Anyone self-hosting
supplies their own keys. Keys and tokens are never logged.

## 10. Testing

- Vitest for core rules and the parser, with fixtures.
- ForeverDB client tested against recorded responses; CI never needs a key or the live API.
- Lua collectors tested under `busted` against stubs of the WoW API.
- A few Playwright smoke tests over the main pages.
- A manual live-check script that uses the owner's key only on request.

## 11. Milestones

- **M0 (before launch):** repo skeleton, Docker, DB schema, ForeverDB client and mirror
  sync, SavedVariables parser, fixtures, addon v0 written against stubs.
- **M1 (launch week):** real snapshots; collectors fixed against the real file; roster,
  character overview, manual upload, basic Quests tab with "next up".
- **M2:** class/race/profession chains, talent playground with guide builds, profession
  advice, Journey tab with visited places.
- **M3:** sync agent, Battle.net login, planning view, theme polish.

## 12. Open items

1. **ForeverDB's answer** on keeping a local copy refreshed on build change. Until then the
   default is `CONTENT_MODE=mirror`; switch to `on-demand` if refused. Also ask whether
   they can expose class/race restrictions on quests.
2. **Tooltip provider:** test Wowhead `/forever/` links and ForeverDB's embed; pick the
   default.
3. **Licence for this repo:** proposed MIT (no GPL code is copied).
4. **Verify in-game at launch** (addon API assumptions):
   - trait-node talent capture works as inferred;
   - per-ID quest completion checks are fast enough at logout;
   - `/played` and `ReloadUI()` behave as expected from a slash command;
   - zone/subzone events give a usable visited-places set;
   - flight-path data availability;
   - whether Forever loadout strings can be imported/exported (for the playground);
   - file location and SavedVariables flush behaviour under Wine/Proton and on macOS.
5. **Guide coverage** for Forever builds may lag launch; the data format allows gaps.
6. **Blizzard account endpoint** (character list via Battle.net login) is unverified;
   v1 does not depend on it.
