# Tooltip provider findings

Tested 2026-11-05 in the in-app browser pane, using a scratch HTML page served from localhost (not committed). Nothing was downloaded, installed or signed in.

## Wowhead (`https://wow.zamimg.com/js/tooltips.js`)

- Forever pages are addressed as `https://www.wowhead.com/forever/<kind>=<id>[/slug]`, e.g. `/forever/quest=1582/moonglow-vest`, `/forever/item=6710/...`. The slug is optional.
- Hover tooltips work for `/forever/item=`, `/forever/spell=` and `/forever/quest=` links, and show Forever data (tooltip requests use `dataEnv=16`). A retail-form link (`/item=6710`, no `/forever/`) is also recognised but fetches retail data (`dataEnv=1`), so the `/forever/` form is required.
- Config via `window.whTooltips` before the script. With `colorLinks` and `iconizeLinks` item and spell links got icons and quality colour; quest links get a tooltip but no icon.
- Hosts contacted: `wow.zamimg.com` (script, css, icons) and `nether.wowhead.com` (tooltip and scaling data). Scripts load on page load; tooltip data is fetched on hover (and on load when icons are on).
- Attribution: none required found; Wowhead's own terms were not reviewed in depth.

## ForeverDB (`https://foreverdb.net/embed/tooltips.js`, docs at `/embed`)

- Recognises `https://foreverdb.net/item/<id>` and `/spell/<id>` links (and `data-foreverdb="item:<id>"`). Item and spell tooltips work, including "changed in Forever" notes. Quest links are NOT supported: no tooltip appeared for `/quest/<id>` (that page exists and redirects to a slugged URL).
- Only host: `foreverdb.net` (script, font, `/embed/v1/data`, stylesheet). Per its docs: no cookies, no local storage, no analytics, no referrer on data requests, nothing fetched until hover unless icons/colour/rename options are on.
- Free, no key. ForeverDB credit is already shown in the app footer.

## Recommendation

Default `none`: no provider covers all three kinds with a single privacy-minimal host. Wowhead covers items, spells and quests but brings two third-party hosts; ForeverDB is the more private option but has no quest tooltips. Both are available as opt-in values.

## How the app uses it

- `ItemLink` renders a plain `<a>` and targets the form the provider's script recognises (Wowhead `/forever/` form for `wowhead`, ForeverDB paths otherwise). Without a provider it still links to ForeverDB and no script is loaded.
- Used for quest titles in "Next up" on the Quests tab. Journey sentences are built as plain strings from names, so ItemLink is not used there; no item/gear ids with names are shown anywhere yet.
