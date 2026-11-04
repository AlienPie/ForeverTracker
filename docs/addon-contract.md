# Addon contract: ForeverTracker SavedVariables

The WoW addon records one snapshot per character into the `ForeverTrackerDB`
SavedVariables table. Players upload the resulting `ForeverTracker.lua`; the
server parses it as data (the Lua is never executed) and stores each snapshot's
raw JSON.

## Shape

```lua
ForeverTrackerDB = {
  schema = 1,
  characters = {
    ["<GUID>"] = {
      snapshot = { ... },
      events = {
        { t = <unix>, kind = "<string>", data = { ... } },
      },
      visited = {
        ["<mapId>:<subzone>"] = { mapId = <int>, subzone = "<string>", firstSeen = <unix> },
      },
      taxi = { <nodeId>, ... },
      played = { played = <sec>, playedLevel = <sec>, at = <unix> },
    },
  },
}
```

- `schema` is a single integer for the whole file.
- `characters` is keyed by the character GUID (e.g. `Player-1234-0A1B2C3D`).
- `snapshot` is the latest snapshot for that character. It must carry a numeric
  `takenAt` (unix seconds); a character without one is skipped by ingest.
  `(guid, takenAt)` is the idempotency key, so uploading a file twice stores
  nothing new.
- `events` is a list of `{ t, kind, data }` records kept by the addon beside
  the snapshot, capped at the newest 500. The addon replaces only `snapshot`
  on save. `data` holds plain values only.
- `visited` is the addon's persistent set of places the character has been,
  keyed `"<mapId>:<subzone>"` (subzone may be the empty string). `firstSeen` is
  the earliest time seen; re-visits never overwrite it.
- `taxi` is an ascending list of unique flight-path node IDs seen on the taxi
  map. It records the node IDs the API returns for the taxi map while it is
  open (`GetTaxiMapID`, falling back to the player's map), accumulates across
  opens, may be partial, and is not filtered by discovery state (to be
  verified on launch day). It is absent until a taxi map has been opened (or if the client lacks
  the API).
- `played` is the last `/played` reply (see `time` below).

## Snapshot sections

`takenAt`, `build`, `identity`, `time`, `state`, `progress`, `exploration`.
See `packages/core/src/snapshot/types.ts` for the exact field types.

`state.equipped` is keyed by slot NAME strings (for example `"HeadSlot"`,
`"MainHandSlot"`), never by integer slot numbers: the parser turns contiguous
`1..n` integer keys into arrays, which would make the shape ambiguous.

`exploration` is `{ visited, taxi? }`: `visited` is an ARRAY of
`{ mapId, subzone, firstSeen }` built from the persistent `visited` map, sorted
by `firstSeen` then key; `taxi` is an array of node IDs, omitted when none are
recorded. The whole section is `unavailable` when `C_Map` is missing.

### Event kinds

| kind | `data` | when |
| --- | --- | --- |
| `level_up` | `{ level }` | `PLAYER_LEVEL_UP` |
| `quest_turned_in` | `{ questId }` | `QUEST_TURNED_IN` |
| `zone_first_visit` | `{ mapId, subzone }` | a zone-changed event adds a new place |
| `profession_changed` | `{}` | `SKILL_LINES_CHANGED` |

The addon also saves a snapshot on entering/leaving the world, logout, level
up, quest turn-in and skill changes.

### `/ft sync`

`/ft sync` (also `/forevertracker sync`) requests `/played`, waits for the
`TIME_PLAYED_MSG` reply (or 2 seconds), saves a snapshot, then calls
`ReloadUI()` so the SavedVariables file is written to disk. Any other
argument prints a one-line usage.

## The `unavailable` convention

Capture is defensive. Any section or sub-section that cannot be read at
snapshot time is written as

```lua
time = { unavailable = true, reason = "RequestTimePlayed pending" }
```

A section may also be absent entirely. Consumers must treat both as "no data"
and must never fail because of them. Ingest stores the snapshot as-is.

## `time` and `progress`

`time` is a top-level section `{ played, playedLevel, at }` (seconds; `at` is
the unix time the values were measured, so `played` may be stale by the time
elapsed since `at`). Each `TIME_PLAYED_MSG` reply is persisted per character
(`characters[guid].played = { played, playedLevel, at }`), and the section is
emitted from the in-memory value, else the persisted one, so it survives
reloads and relogins. The addon requests `/played` on initial login only
(`PLAYER_ENTERING_WORLD` with `isInitialLogin = true`) and in `/ft sync`. It is
`unavailable` ("RequestTimePlayed pending") only if no reply has ever been
stored for the character.

`progress` holds independent subsections, each of which may be `unavailable`:

- `talents = { nodes, unspent }`: `nodes` maps a node key (string) to its
  current rank, only ranks above 0. From the trait tree the key is the trait
  node ID (for example `"9001"`); from the legacy tab API it is
  `"<tab>.<index>"`. `unspent` is the unspent talent points.
- `professions`: a list of `{ skillLine, name, rank, max }` for primary and
  secondary professions only (not weapon skills, languages or armor). The
  primary source is `GetProfessions`/`GetProfessionInfo`, which is
  locale-independent and gives the real `skillLine` id. If those APIs are
  absent the addon falls back to scanning the skill window by ENGLISH
  profession name (case-insensitive) and writes `skillLine = 0`; the fallback is
  English-only. When the fallback recognises nothing but non-header skill lines
  exist (non-English client or collapsed headers) the subsection is
  `unavailable` rather than an empty list. The addon never expands or collapses
  skill headers.
- `questsCompleted`: a list of quest IDs, from the probe list, that the client
  reports as completed. The probe list is set with `FT.setQuestIdList(ids)` and
  is empty until the server supplies one, so the list is empty by default.
- `questLog`: a list of `{ id }` for the quests currently in the log (headers
  skipped).

## Schema versioning

`schema` is incremented on any breaking change to the shape. The server
supports schemas up to `SUPPORTED_SCHEMA` (currently 1). A file with a newer
(or non-numeric/missing) `schema` is still stored raw with `unsupported = true`
so nothing is lost, but no extraction is attempted; it can be re-processed once
the server understands that schema.

## Server storage

For each character in an uploaded file, ingest stores, in one transaction:

- `snapshot.raw`: the JSON of `characters[guid].snapshot` only, one row per
  `(guid, takenAt)`.
- `character_event`: every well-formed entry of `events` (`t` a finite number,
  `kind` a non-empty string; `data` stored as canonical JSON text, `{}` when
  absent), keyed `(guid, t, kind, data)` with `INSERT OR IGNORE`. Events are
  facts: they are stored whatever the snapshot's age, a re-upload adds
  nothing, and uploads accumulate events beyond the addon's 500-event cap.
  Malformed entries are skipped silently.
- `character.extras`: JSON of every key of the character entry other than
  `snapshot` and `events` (`visited`, `taxi`, `played`, and any future key),
  updated only when the uploaded snapshot is the newest for the character
  (the same gate as the identity update).

## Ingest behaviour

- Parsed, never executed. A file with no `ForeverTrackerDB` table is rejected.
- Each character is processed in its own transaction and try/catch; a character that errors is rolled back and counted in the summary's `failed` field while the rest are still ingested. The summary is `{ characters, stored, skipped, unsupported, failed }`.
- `character.latestTakenAt` is the max `takenAt` seen; an older snapshot
  uploaded later is stored but does not move it backwards or overwrite identity.
- M0 extraction fills the `character` row (name, class, race, level) from
  `identity` when it is a normal object and not an `unavailable` marker.

## Example

```lua
ForeverTrackerDB = {
  schema = 1,
  characters = {
    ["Player-1234-0A1B2C3D"] = {
      snapshot = {
        takenAt = 1730000000,
        build = "1.60.1.70707",
        identity = { name = "Thalindra", class = "MAGE", race = "Human",
                     faction = "Alliance", level = 34, xp = 12500, xpMax = 41000 },
        time = { unavailable = true, reason = "RequestTimePlayed pending" },
        state = { zone = "Stranglethorn Vale", subzone = "Booty Bay", mapId = 1434,
                  x = 0.2731, y = 0.7712, money = 183420,
                  equipped = { HeadSlot = 4320, ChestSlot = 14136 } },
      },
      events = {
        { t = 1729999000, kind = "level_up", data = { level = 34 } },
      },
    },
  },
}
```
