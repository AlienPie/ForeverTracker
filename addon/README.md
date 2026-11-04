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
(`C_QuestLog.IsQuestFlaggedCompleted` per ID). It defaults to an empty list
until a server-supplied list exists. `FT.requestPlayed()` calls
`RequestTimePlayed()`; the `TIME_PLAYED_MSG` reply is cached for the next
snapshot's `time` section.

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
