# Launch-day checklist

One ordered list. Do it top to bottom on launch day. For each item: what to check, how, and what a failure means. Nothing here needs a code change to attempt; failures are collected and taken back to a developer session (see the last section).

Sources: spec section 12 item 4, the addon API assumptions recorded while building the collectors, and the unverified ForeverDB response shapes.

## A. Prepare (before logging in)

1. **Run the server.** Build and run the image per `README.md`, then `curl -s localhost:3000/api/health` returns `{"ok":true}`. Failure: the container is not running (`podman logs`), or the port or `DATA_DIR` volume is wrong.
2. **Create a device token.** `podman exec forevertracker node /app/create-token.mjs launch`. Keep it somewhere private. Failure: the data volume is not writable by the container user.
3. **Check the ForeverDB API shapes.** With your key in the environment (not in any file you commit): `FOREVERDB_API_KEY=... pnpm tsx tools/live-check.ts`. Expect the build string, level cap and remaining daily quota. Failure: the key is wrong, the API changed, or the `/meta` shape differs. Then run a first `pnpm content:sync`. Only `/meta`, `/quests` list rows and `/classes/mage` have real captured samples. Everything else (zones, vendors, dungeons, other class details, professions, gathering, and the pagination of detail endpoints) is an unverified guess: check that the sync finishes without a shape error and that each resource stored records. Failure: note the resource and the error; the mirror code for that resource needs adjusting to the real shape.

## B. In game: install and first run

4. **Install the addon** as described in `README.md`. Check: it appears in the AddOns list and loads with no Lua error popup. Failure: the `.toc` Interface number (16001) may not match the Forever client, or the `\` path separators in the `.toc` are not accepted. Look for "out of date" or "failed to load" in the list.
5. **Log in and play a minute**, walk into a new subzone, then `/ft sync`. Check: the UI reloads by itself and no error appears. Failure modes: no reload means `ReloadUI()` is protected or not callable from a slash command; a Lua error means a WoW API differs. Note the error text exactly.
6. **Locate SavedVariables.** Find `WTF/Account/<ACCOUNT>/SavedVariables/ForeverTrackerDB.lua` (Wine/Proton and macOS paths are in `README.md`). Check: the file exists and its modification time is just after the `/ft sync`. Failure: a different path (record the real one and update the README), or the file is only written at full logout (then `/ft sync` does not flush; a log out is needed).

## C. Upload and inspect

7. **Upload the file** with the curl command from `README.md`. Expect 200 with `stored: 1` per character, `failed: 0`. Failure: 401 means a bad token; 413 means over 8 MB (the quest probing or event log may be too large; note the file size); 422 means the parser rejected the file (note the line and column in the reply).
8. **Inspect the stored raw JSON.** Open `/data/forevertracker.sqlite` (for example `podman exec` into the container, or copy the file out of the volume, and use `sqlite3`) and read the newest `snapshot` raw JSON. Search for `unavailable`. Every `unavailable = true` section includes a `reason`; each one points to an API that is missing or behaves differently. Failure: record each section and reason (items 9 to 17 say what each means).

## D. API assumptions to confirm from the stored snapshot

For each item, look at the named section of the stored JSON. A missing or `unavailable` section is the failure signal unless noted.

9. **Build string.** `snapshot.build` looks like `1.60.1.70707` (version, then build number) and matches the `build` from `live-check`. Failure: `GetBuildInfo` returns a different layout, so ForeverDB content cannot be matched to the client build.
10. **Identity.** In `identity`, `class` and `race` are upper-case tokens (for example `MAGE`), `faction` is English, `name` has no `-Realm` suffix, `level` and `xp` are numbers. Failure: a token or English assumption is false, or `UnitXP`/`UnitXPMax` are missing.
11. **Position and zone.** In `state`, the zone name, subzone, map id and position are present (position can be nil inside instances). Failure: `C_Map.GetBestMapForUnit` or `GetPlayerMapPosition` is missing.
12. **Equipped items.** `state.equipped` is keyed by slot name (for example `"HeadSlot"`) with item ids taken from `item:ID` links. Failure: empty or wrong ids mean `GetInventoryItemLink` slot numbering (0 to 19, 0 = ammo) differs on this client.
13. **Talents (trait nodes).** In `progress`, the talent capture reads `C_ClassTalents.GetActiveConfigID`, `C_Traits.GetConfigInfo`, `GetTreeNodes` and `GetNodeInfo().currentRank`, plus unspent points from `C_Traits.GetTreeCurrencyInfo`. Check that the ranks and unspent points match what the talent window shows. Failure: the section is `unavailable` or wrong; the legacy fallback uses `GetTalentInfo` (5th return = rank) and `UnitCharacterPoints`. Also check these APIs work out of combat and are not protected.
14. **Professions.** The `progress.professions` list is `{ skillLine, name, rank, max }` and matches your skills window. Failure: `GetProfessions`/`GetProfessionInfo` may be absent or have different return positions (name 1st, rank 3rd, max 4th, skillLine 7th; `GetProfessions` returns up to 5 indices: two professions, archaeology, fishing, cooking). If the English-only fallback was used, `skillLine` is 0 and a non-English client may give an `unavailable` marker. Check the skill line ids too (171, 164, 333, 202, 165, 197, 182, 186, 393, 185, 129, 356).
15. **Quests.** `progress.questLog` lists current quests (`C_QuestLog.GetNumQuestLogEntries` first return, `GetInfo(i)` giving `questID` and `isHeader`). Per-ID completed-quest probing is only as good as the ID list the addon has, so `progress.questsCompleted` is likely empty at first. Also time the logout or `/ft sync`: probing thousands of IDs must not hitch. Failure: a slow logout means the probe must be cut down or made incremental.
16. **Played time.** After a `/ft sync` the top-level `time` section has `played` and `playedLevel` seconds. `TIME_PLAYED_MSG` args are (total, level) and `RequestTimePlayed` also prints `/played` to chat (expected). Failure: `time` stays `unavailable` or stale; the 2-second timeout may be too short or the event never arrives.
17. **Visited places and flight paths.** `exploration.visited` grows as you cross zones and subzones (events `ZONE_CHANGED`, `ZONE_CHANGED_INDOORS`, `ZONE_CHANGED_NEW_AREA` should fire and `GetRealZoneText`/`GetSubZoneText` return names). Open a flight master map: `exploration.taxi` should list node ids. Failure for taxi: the taxi API may not exist or reports a zone map instead of the continent, so nodes may be missing or partial (the addon prefers `GetTaxiMapID`, then `GetBestMapForUnit`). Failure for visited: the events or text APIs differ.
18. **Events fire as expected.** After levelling up or turning in a quest, the `events` array has `level_up` (arg 1 = new level) or `quest_turned_in` (arg 1 = quest id) entries. After learning a profession, a `profession_changed` entry appears. Failure: an event name is not valid on this client (each registration is guarded, so an invalid name is silently skipped; a missing entry is the only symptom).
19. **Timing and flush.** Confirm SavedVariables are updated on logout and on `ReloadUI()` and that a normal logout writes the final state. Failure: stale data after logout means saves must be done more often.

## E. Product questions to settle on the day

20. **Forever loadout strings.** Check whether Forever loadouts can be imported and exported as strings; the talent playground depends on this. Failure: plan the playground around manual entry.
21. **Tooltip provider.** Test Wowhead `/forever/` links and ForeverDB's embed and pick the default.
22. **Content freshness.** If ForeverDB has not agreed to a local copy, keep `CONTENT_MODE=mirror` and watch the daily quota; switch to `on-demand` if refused.

## What to bring back to the developer session

- The raw `ForeverTrackerDB.lua` file with the `<ACCOUNT>` folder name redacted (and character names if you prefer; they are data, not secrets). Do not include tokens or your API key.
- The exact text of any Lua error, the output of `live-check` and the first `content:sync` (without the key).
- The real SavedVariables path on your system, and your notes for items 4 to 22: pass or fail, with the `reason` strings from any `unavailable` section.
