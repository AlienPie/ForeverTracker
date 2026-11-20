# Collecting the Wowhead data by hand

ForeverTracker can tag quests by class, race and profession, and can show zone level ranges. That data is not in the ForeverDB mirror, so it is taken from Wowhead's Forever pages. This guide covers collecting it once, building the curated files and fixing links by hand.

## 1. Rules first

Wowhead's terms (https://corp.fanbyte.com/legal/terms) forbid automated access. So you do this yourself, in a normal browser, one page at a time, as a person reading the site. Do not loop over pages with a script, and do not run the snippet from anything other than your own open tab. The snippet only reads the page you are already looking at and makes no network requests. The assistant has not opened any Wowhead page, so everything below about the pages is untested.

## 2. Pages to visit

The URLs come from the design spec and may be wrong. If one gives a 404 or an unexpected page, find the right page through Wowhead's own menu (the Forever section, then Quests) and give the snippet a hint, for example `ftCapture("class","Shaman")` (see section 3).

| Page | What it gives | What to expect |
| --- | --- | --- |
| `https://www.wowhead.com/forever/quests/classes/<class>` for druid, hunter, mage, paladin, priest, rogue, shaman, warlock, warrior (nine pages) | Class tags: the quests only that class gets | One quest list per class, possibly paged |
| `https://www.wowhead.com/forever/quests/professions/<profession>` for each profession (about 13 pages, the 12 profession names in the mirror, give or take a secondary skill) | Profession tags | One quest list per profession; some are short |
| Race pages, if Wowhead has them | Race tags | Check the Quests menu on the site and use whatever race lists exist. If there are none, say so and skip race tags; nothing else depends on them. |
| The zones page, under the Forever section of Wowhead's menu | Zone names, level ranges, territory and type | A table of zones, possibly paged |

## 3. For each page

1. Open the page in your browser.
2. If the list is paged or truncated, set the page size to the largest available and go through the pages. Run the snippet on each page and save each output under its own name.
3. Open the browser console (F12, then the Console tab). Firefox may ask you to type `allow pasting` first.
4. Paste the whole contents of `tools/wowhead/capture.js` and press Enter. It prints the capture as JSON and copies it to your clipboard.
5. Create a new file `data/wowhead-captures/<kind>-<value>.json` and paste the JSON into it. Examples: `class-shaman.json`, `profession-cooking.json`, `zones.json`. For extra pages of the same list use `class-shaman-2.json`, `class-shaman-3.json` and so on. The file name does not matter to the builder, only to you.
6. Read the `notes` line in the JSON (or in the console output). It tells you about quest links outside the list that were ignored, that no quests were found, or that the URL was not recognised.

If the snippet could not tell what the page is, its note says so and `kind` is `unknown`. Run this in the same console, with the right kind (`class`, `race`, `profession` or `zones`) and value:

```js
ftCapture("class", "Shaman")
ftCapture("profession", "Cooking")
ftCapture("zones")
```

Save that output instead. Class values must be a real class name (Warrior, Paladin, Hunter, Rogue, Priest, Shaman, Mage, Warlock, Druid); the builder skips others.

## 4. If the snippet says it found no quests

The note reads "No quests found on this page". The page probably builds its list after loading. Wait until the list appears and run the snippet again (paste it again, or call `ftCapture(...)` with the hint). If it is still empty, copy the console output and the page URL into the chat so the extractor can be adjusted. Do not try to work around it by fetching pages from a script.

## 5. Build the data

From the repository root:

```sh
pnpm curated:build
# the same thing without the package script:
pnpm tsx tools/build-curated.ts
```

It reads every `.json` file in `data/wowhead-captures/` and writes `data/curated/quest-tags.json` and `data/curated/zones.json`. A file is only rewritten if there is a capture of that sort (tag captures for the tags file, a zones capture for the zones file). With no captures at all it says so and changes nothing. A file that is not a valid capture stops the build and names the file.

It also opens the content mirror read-only to check quest IDs. It looks for `forevertracker.sqlite` in `DATA_DIR` (default `data-local` in the repository), so point it at the folder that holds the mirror:

```sh
DATA_DIR=/path/to/data pnpm curated:build
```

The first line is a summary, for example `412 tags, 61 zones from 24 capture file(s).` Then one `- ` line per thing worth knowing:

- `skipped capture <url>: ...` a capture was left out (no value, or not a class name, or an unusable kind). Rerun the snippet with `ftCapture`.
- `quest <id> is tagged with several classes: ...` kept for all of them; check if that looks wrong.
- `not in the mirror: N ids, first five: ...` quest IDs in your captures that the mirror does not know. A few may be fine; many suggest a stale mirror (run the content sync) or a wrong page.
- `mirror not available, ids not validated` no mirror found at `DATA_DIR`, so the check was skipped.
- `mirror error: ...` the mirror exists but could not be read.
- `zone row N not parsed (no name cell): ...` a zones table row without a name.
- `note from capture <url>: ...` a note the snippet recorded, such as links outside the list that were ignored.

The `patch` field in `data/curated/quest-tags.json` is kept as it is (null at first); edit it by hand to the game patch you captured against. `capturedAt` is set to today's date.

Then commit the results:

```sh
git add data/curated data/wowhead-captures
git commit -m "data: curated quest tags and zones from Wowhead"
```

## 6. Link overrides

Some quests follow another quest in every region, but the mirror only links them in one. Add an entry to `data/curated/overrides.json` by hand. Each link means quest `to` can follow quest `from`:

```json
{
  "version": 1,
  "links": [
    { "from": 96628, "to": 96608, "note": "The Great Outdoors follows The Adventurer in Dun Morogh" }
  ]
}
```

Here quest 96608 ("The Great Outdoors", Dun Morogh, which leads on to 96629 "Camping 101: Cooking") follows 96628 ("The Adventurer", Dun Morogh). A link joins the two quests' chains into one group, so only link a quest to the quest that really follows it in that region; link across regions only when the two chains really are one chain. Quest IDs are in the page address of a chain page: `/c/<guid>/quests/chain/<questId>`, where the number at the end is the ID. Links with unknown IDs, or that would create a loop, are skipped. This file is yours; `pnpm curated:build` never touches it.

## 7. When to redo it

After a game patch that changes quests. Repeat sections 3 to 5 for the pages that changed (or all of them), replacing the old capture files, and update `patch` in `quest-tags.json`. Check the overrides still make sense.
