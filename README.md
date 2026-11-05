# ForeverTracker

Self-hosted companion app for WoW: Forever. pnpm TypeScript monorepo plus a Lua addon.

- `apps/web`: SvelteKit server (`/api/health`, token-guarded `/api/ingest`)
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
| `FOREVERDB_API_KEY` | ForeverDB API key, used by `pnpm content:sync` and `tools/live-check.ts` (not needed to serve the web app) |
| `CONTENT_MODE` | `mirror` (default, serve the local copy) or `on-demand` |
| `DATA_DIR` | Directory for the SQLite database. `./data-local` for development; `/data` in the container |
| `SESSION_SECRET`, `OWNER_BATTLETAG`, `BLIZZARD_CLIENT_ID`, `BLIZZARD_CLIENT_SECRET`, `BLIZZARD_REDIRECT_URI` | Reserved for login (later milestone); unused in M0 |
| `BODY_SIZE_LIMIT` | adapter-node request body limit; must be at least the ingest cap of 8 MB (default `8M`) |

## Create a device token

Uploads are authorised by a device token. It is shown once; only its hash is stored.

```sh
podman exec forevertracker node /app/create-token.mjs my-laptop
```

In development: `pnpm token:create my-laptop`.

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
```

Environment variables: only the container's `--env-file` and variables exported in your shell are read. Nothing in development loads `.env` automatically, so export what you need (for example `export FOREVERDB_API_KEY=...`) before running `pnpm content:sync` or `pnpm --filter web start`. When `DATA_DIR` is unset or relative, the web app, `pnpm token:create` and `pnpm content:sync` all use `<workspace root>/data-local/forevertracker.sqlite`.

## Credits

Quest IDs bundled in the addon come from ForeverDB.net (https://foreverdb.net).
