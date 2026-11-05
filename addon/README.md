# ForeverTracker addon

Records a snapshot of the current character into the `ForeverTrackerDB`
SavedVariables table. Players upload the resulting `ForeverTracker.lua`; the
server parses it as data. The file shape is documented in
[`docs/addon-contract.md`](../docs/addon-contract.md).

## Install

Copy (or symlink) `addon/ForeverTracker/` to
`<WoW folder>/Interface/AddOns/ForeverTracker`. The saved file appears at
`WTF/Account/<ACCOUNT>/SavedVariables/ForeverTracker.lua`.

## Quest probing and /played

`FT.setQuestIdList(ids)` sets the quest IDs probed for `progress.questsCompleted`
(`C_QuestLog.IsQuestFlaggedCompleted` per ID). Completed quests are tracked via
the bundled `Data/QuestIds.lua`, which calls it with every known quest ID.
The addon prefers the game's bulk APIs
(`C_QuestLog.GetAllCompletedQuestIDs`, then `GetQuestsCompleted`); only when neither
exists does it probe the bundled list, adding quests it saw turned in
(`characters[guid].turnedIn`). `progress.questsSource` records which path was used.
Regenerate it after a `pnpm content:sync` with `pnpm addon:quest-ids`. The quest
data is credited to ForeverDB.net (https://foreverdb.net). `FT.requestPlayed()` calls
`RequestTimePlayed()`; the `TIME_PLAYED_MSG` reply is cached for the next
snapshot's `time` section. Each reply is also saved per character
(`characters[guid].played = { played, playedLevel, at }`), so `time` survives
`/reload` and relogin; `at` is when it was measured. The addon requests
`/played` once on initial login only (not on reloads or zone changes), which
makes the game print one "Total time played" chat line at login.

## Saving the data file

SavedVariables are only written to disk on logout or `/reload`. Type
`/ft sync` (it saves a fresh snapshot and prints a confirmation), then type
`/reload`. The addon never calls `ReloadUI()` itself (blocked for addons).
Snapshots are also taken on login, level-up, quest turn-in, profession change
and every 2 minutes, but not at logout.

## Tests

The specs use [busted](https://lunarmodules.github.io/busted/) on **LuaJIT**
(Lua 5.1 semantics, like the game client), against hand-written stubs of the
WoW globals in `tests/stubs.lua`:

```sh
cd addon && ./test.sh        # same as: busted --lua=luajit
```

A spec fails loudly if the interpreter is not 5.1-compatible. The addon source
must stay Lua 5.1 (no `goto`, `//`, `bit32`, `utf8`).

### Round trip against the server code

The specs write `addon/tests/out/snapshot.lua` (gitignored). Feed it through
the real parser and ingest (not part of CI):

```sh
pnpm exec tsx tools/addon-roundtrip.ts   # expect stored: 1, failed: 0
```
