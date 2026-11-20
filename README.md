# ForeverTracker

Self-hosted companion app for WoW: Forever. pnpm TypeScript monorepo plus a Lua addon.

- `apps/web`: SvelteKit server and dashboard (`/api/health`, token-guarded `/api/ingest`, owner login)
- `addon/ForeverTracker`: the in-game addon that writes SavedVariables
- `packages/savedvars`: SavedVariables parser
- `packages/content`: ForeverDB client and mirror
- `packages/db`: Drizzle schema and DB access
- `packages/core`: snapshot types and advice rules

Design spec: `docs/superpowers/specs/2026-11-01-forevertracker-design.md`.
Addon file contract: `docs/addon-contract.md`. **Launch day: follow `docs/launch-day-checklist.md`.**

## Prerequisites

- Podman (rootless is fine) to run the image. Use fully-qualified image names; the Dockerfile pulls `docker.io/library/node:26-slim`.
- For development: Node 26, pnpm 12, and busted on LuaJIT for the addon specs.

## Build and run (Podman)

```sh
cp .env.example .env        # then edit; .env is git-ignored and never baked into the image
podman build -t forevertracker:dev .
podman run -d --name forevertracker -p 127.0.0.1:3000:3000 \
  -v ft-data:/data \
  --env-file .env -e DATA_DIR=/data \
  forevertracker:dev
curl -s localhost:3000/api/health      # {"ok":true}
```

The port is published on loopback only. Bearer tokens and uploads cross the network in clear text over plain HTTP, so to reach the server from another machine put a TLS reverse proxy in front of it (do not publish the plain port on a LAN or the internet).

`-e DATA_DIR=/data` must come after `--env-file` because `.env.example` sets `DATA_DIR=./data-local` for local development. The database lives at `/data/forevertracker.sqlite` on the `ft-data` volume. The container runs as the unprivileged `node` user.

Logs: `podman logs forevertracker`. Stop and start: `podman stop|start forevertracker`. Data survives restarts and image rebuilds as long as the volume is kept.

### Compose alternative

`compose.yaml` does the same with one command:

```sh
podman compose up -d --build     # or podman-compose / docker compose
# a different host port: FT_PORT=3100 podman compose up -d
```

Verified with `podman compose` (podman-compose 1.6.0): the stack comes up, uploads are stored, and data survives a restart. It publishes the port on loopback only, as above. Compose keeps its own volume (`<project>_ft-data`), separate from the `ft-data` volume used by the `podman run` commands, so the two setups do not share a database or tokens. Docker Compose is untested.

## Environment variables

From `.env.example` (no secrets are committed; leave unused ones empty):

| Variable | Purpose |
| --- | --- |
| `FOREVERDB_API_KEY` | ForeverDB API key, used by the content sync (`node /app/content-sync.mjs` in the container, `pnpm content:sync` in development) and `tools/live-check.ts`; not needed to serve the web app |
| `CONTENT_MODE` | `mirror` (default, serve the local copy) or `on-demand` |
| `TOOLTIP_PROVIDER` | `none` (default), `wowhead` or `foreverdb`. Hover tooltips on quest links. With `none` the app makes no third-party requests. `wowhead` makes the visitor's browser load `wow.zamimg.com` (script, icons) and `nether.wowhead.com` (tooltip data); `foreverdb` loads from `foreverdb.net` only, and covers items and spells, not quests. See `docs/design/m1/tooltip-findings.md` |
| `DATA_DIR` | Directory for the SQLite database. `./data-local` for development; `/data` in the container |
| `OWNER_PASSWORD`, `SESSION_SECRET` | Owner login. Set both to require a password for every dashboard page (a signed session cookie lasts 30 days). **If `OWNER_PASSWORD` is unset the app runs in open mode: anyone who can reach it sees all characters** (Settings shows a warning). Open mode answers only to loopback host names (`localhost`, `*.localhost`, `127.0.0.1`, `[::1]`) and to `ALLOWED_HOSTS`; any other `Host` gets 403, which blocks DNS-rebinding pages. With a password set, `SESSION_SECRET` is required and must be at least 32 characters (generate one with `openssl rand -base64 32`); the server refuses to start otherwise. Changing it signs everyone out. `/api/health` and the token-guarded `/api/ingest` never need the password and are not host-restricted |
| `ALLOWED_HOSTS` | Optional, open mode only. Comma-separated extra host names (no port, case-insensitive), for example `tracker.lan,nas`, that open mode answers to besides the loopback names. Reaching an open-mode server by LAN name or IP needs this; prefer setting `OWNER_PASSWORD` instead |
| `OWNER_BATTLETAG`, `BLIZZARD_CLIENT_ID`, `BLIZZARD_CLIENT_SECRET`, `BLIZZARD_REDIRECT_URI` | Reserved for Battle.net login (later milestone); unused |
| `BODY_SIZE_LIMIT` | adapter-node request body limit; must be at least the ingest cap of 8 MB (default `8M`) |
| `PROTOCOL_HEADER`, `HOST_HEADER` | Optional, only behind a reverse proxy; see below. `PROTOCOL_HEADER` defaults to `x-forwarded-proto` |

### Plain HTTP and reverse proxies

SvelteKit rejects a form POST (sign in, sign out, uploads) with 403 "Cross-site POST form submissions are forbidden" unless the browser's `Origin` header equals the origin the server thinks it has. adapter-node builds that origin from a protocol header and the `Host` header, and assumes `https` when the protocol header is missing. The server entry (`apps/web/entry/index.js`, built to `build/index.js`) therefore sets `PROTOCOL_HEADER=x-forwarded-proto` by default and marks any request that arrives without that header as `http`. This is correct because the server itself only listens on plain HTTP. As a result:

- Direct access works with no settings: `http://localhost:3000` and `http://127.0.0.1:3000`, and any port.
- Behind a TLS reverse proxy, have the proxy set `X-Forwarded-Proto: https` and pass the original `Host` header through. Caddy and nginx with `proxy_set_header Host $host; proxy_set_header X-Forwarded-Proto $scheme;` do this. If your proxy sends the public host in another header, set `HOST_HEADER=x-forwarded-host`.
- If your proxy uses a different header for the scheme, set `PROTOCOL_HEADER` to that header name.

The origin check stays on: a POST whose `Origin` is another site is still refused.

## The dashboard

Sign in at `/` with the owner password. **Roster** lists your characters with level, play time, money and a "next up" hint. Cards show the character's full name (surname included). Each character opens to four tabs: **Journey** (play sessions with a summary and the events of each, a "Time per level" strip and "Your route" through the places visited), **Quests** (next-up suggestions, quest chains you are on, each opening to its own chain page, and the quest log lists of in-progress and completed quests with paging and search), **Talents** and **Professions**. **Upload** takes a `ForeverTracker.lua` file in the browser (no token needed), and **Settings** creates and revokes device tokens and shows the state of the content mirror. Sync the ForeverDB content once (see "Sync ForeverDB content") so quest and zone names and the level cap are available.

To add class, race and profession quest tags and zone level ranges, collect them by hand from Wowhead as described in [docs/wowhead-data-guide.md](docs/wowhead-data-guide.md).

## Sync ForeverDB content

Quest and zone names, quest chains and the level cap come from a local mirror of ForeverDB.net. Fill it once after the first start, and again after a game patch. It needs `FOREVERDB_API_KEY` (about 100 requests, about a minute, resumable if interrupted).

```sh
# container (the key comes from the --env-file .env you started it with)
podman exec forevertracker node /app/content-sync.mjs
# compose
podman compose exec forevertracker node /app/content-sync.mjs
# development
pnpm content:sync
```

The page data refreshes within a minute of the sync finishing. In the container the sync writes to `/data` on the same volume the server reads.

## Create a device token

Uploads are authorised by a device token. It is shown once; only its hash is stored.

```sh
podman exec forevertracker node /app/create-token.mjs my-laptop
```

In development: `pnpm token:create my-laptop`.

List tokens (id, label, created, active or revoked; never the token itself) and revoke one by id:

```sh
podman exec forevertracker node /app/list-tokens.mjs
podman exec forevertracker node /app/revoke-token.mjs <id>
```

In development: `pnpm token:list` and `pnpm token:revoke <id>`. A revoked token is rejected at once with 401.

## Upload SavedVariables

```sh
# Put the file path in a variable and quote it: the usual Wine/Proton path contains spaces and parentheses.
F="$HOME/Games/.../WTF/Account/<ACCOUNT>/SavedVariables/ForeverTracker.lua"
read -rs TOKEN        # paste the token and press Enter (not echoed, not stored in shell history)
curl -X POST http://localhost:3000/api/ingest \
  -H 'Content-Type: application/octet-stream' \
  -H "Authorization: Bearer $TOKEN" \
  --data-binary @"$F"
```

The `@` before the path is essential: without it curl uploads the path text itself, and the server answers `{"error":"parse","line":1,"column":1}`. `~` is not expanded after the `@`, so use `$HOME`.

The server speaks plain HTTP only. If curl reports `(35) TLS connect error ... wrong version number`, or a browser reports `SSL_ERROR_RX_RECORD_TOO_LONG`, an `https://` URL was used against it: write `http://localhost:3000` explicitly (some browsers silently upgrade a bare `localhost:3000` to `https://`).

`Content-Type: application/octet-stream` is required (SvelteKit's CSRF check rejects other form-like types). The reply is a summary such as `{"characters":2,"stored":2,"skipped":0,"unsupported":0,"failed":0}`. Uploading the same file again stores nothing new (`stored: 0`). Status codes: 401 bad or missing token, 413 over 8 MB, 422 unparseable file.

## Install the addon

1. Copy the folder `addon/ForeverTracker` to `<WoW install>/Interface/AddOns/ForeverTracker` (the folder name must match the `.toc` file).
2. Start the game and enable the addon on the character select AddOns screen.
3. Log in. Type `/ft sync` to refresh the snapshot (it requests played time, saves, then reloads the UI). `/ft` alone prints usage.
4. SavedVariables are written on logout or UI reload to
   `<WoW install>/WTF/Account/<ACCOUNT>/SavedVariables/ForeverTracker.lua`. The file is named after the addon folder (the `.toc` name), not after the `ForeverTrackerDB` variable.

Example locations (replace the placeholders):

- Wine/Proton prefix: `<prefix>/drive_c/Program Files (x86)/World of Warcraft/<flavour>/WTF/Account/<ACCOUNT>/SavedVariables/ForeverTracker.lua`
- macOS: `/Applications/World of Warcraft/<flavour>/WTF/Account/<ACCOUNT>/SavedVariables/ForeverTracker.lua`

Where the Forever client actually keeps these files is itself a launch-day check.

## Development

```sh
pnpm install
pnpm test            # TypeScript packages and apps/web
pnpm typecheck
cd addon && ./test.sh   # addon specs under LuaJIT
pnpm addon:quest-ids # regenerate addon/ForeverTracker/Data/QuestIds.lua from the content mirror
pnpm --filter web build && pnpm --filter web start
pnpm --filter web test:e2e   # browser smoke test, see below
```

### Browser smoke test

`pnpm --filter web test:e2e` builds the app (it deletes and rebuilds `apps/web/build`, replacing the build output a running local `pnpm --filter web start` serves; restart that server afterwards), starts it on port 4173 (set `E2E_PORT` to use another port) with a throwaway data directory and fake credentials, and drives it with Playwright (login, upload of an invented file, roster, every character tab, settings, a token upload to `/api/ingest` with the command Settings shows, sign out; it also asserts no console errors and no third-party requests). It is not part of `pnpm test`. Playwright's own browser is not downloaded (`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` at install); the test uses a system Chromium at `/usr/bin/chromium`, or set `PLAYWRIGHT_CHROMIUM_PATH`.

Environment variables: only the container's `--env-file` and variables exported in your shell are read. Nothing in development loads `.env` automatically, so export what you need (for example `export FOREVERDB_API_KEY=...`) before running `pnpm content:sync` or `pnpm --filter web start`. When `DATA_DIR` is unset or relative, the web app, `pnpm token:create` and `pnpm content:sync` all use `<workspace root>/data-local/forevertracker.sqlite`.

## Credits

Quest IDs bundled in the addon come from ForeverDB.net (https://foreverdb.net).

Quest tags and zone data curated from Wowhead (https://www.wowhead.com) by the maintainer.
