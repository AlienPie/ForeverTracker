# quests.json fixture

Real rows copied (read-only) from an already-synced `content_record` mirror, resource `quests`
(build 1.60.1.70790, 3862 quests). Public game data only. Each row is trimmed to
`id, name, level, zone, chain, starts, ends` (links in `chain` keep `questId, name, relation`;
endpoint `location` keeps `uiMapId, zone, x, y`).

Verified shapes across all 3862 rows (the plan's `zone: string` / `chain: number` were WRONG):

- `id`: number in the record data (the `content_record.id` column is the same value as text).
- `level`: integer; `null` on 8 rows (those are treated as malformed and dropped). Max 60-70 seen
  (`requiredLevel`, not trimmed here, is null or <= 60).
- `zone`: `{ n: string, slug: string, m: number | null } | null` (null on 382 rows; `m` is a uiMapId).
- `chain`: always an object (never null):
  `{ previous: Link[], next: Link[], questLine: { name, part, of, source } | null }` with
  `Link = { questId: number, name: string, relation: string }`. Both arrays empty on 985 quests
  (no chain). `relation` values: "Complete first", "Chain link", "Offered after", "Next quest",
  "Must be active", "Quest line". `questLine` non-null on only 3 rows.
- `starts` / `ends`: `null` on 121 / 117 rows, otherwise
  `{ type: "npc" | "object" | "item" | null, id: number | null, name: string | null,
  location: { uiMapId, zone, x, y } | null }`. `location` is null for many (e.g. item starters).
- The mirror has NO `meta` record: `checkBuild` fetched `/meta` but never stored `levelCap`.
  `syncAll` now stores it as resource `meta`, id `current`, data `{ build, levelCap }`.

## quests-class.json

Seven more real rows from the same mirror, trimmed the same way, for the class-quest and zone
fixes: 179 Dwarven Outfitters (Dun Morogh), 747 The Hunt Begins (Mulgore), 1013 The Book of Ur
(zone Silverpine Forest, m 1421, but starter in Undercity, uiMapId 1458), and class quests whose
`zone.n` is a class name with `m: null`: 3093 Rune-Inscribed Note (Shaman, after 747), 3106 Simple
Rune (Warrior), 3107 Consecrated Rune (Paladin), 3110 Hallowed Rune (Priest), all after 179.
Across the full mirror every real place has a numeric `zone.m`; class names (Druid, Hunter, Mage,
Paladin, Priest, Rogue, Shaman, Warlock, Warrior) and categories (Seasonal, Blacksmithing,
Lunar Festival, ...) have `m: null`. 472 quests have a starter `uiMapId` different from `zone.m`.

## quests-hub.json

Eight more real rows from the same mirror (2026-11-05, read from a copy), trimmed the same way, for
hub detection: 7 Kobold Camp Cleanup (Elwynn Forest, after 783, which is not included) and its
successors 15 Investigate Echo Ridge (Elwynn Forest) and six class letters with `zone.n` a class
name and `m: null`: 3100 Simple Letter (Warrior), 3101 Consecrated Letter (Paladin), 3102
Encrypted Letter (Rogue), 3103 Hallowed Letter (Priest), 3104 Glyphic Letter (Mage), 3105 Tainted
Letter (Warlock). 7 has 7 successors in the full link set but only 2 for a Priest after the class
filter, so it shows why hubs are judged before the class filter.

## quests-camping.json

Nineteen real rows from the same mirror (read with `sqlite3 -readonly` on 2026-11-05), trimmed the
same way, for the chain-validity rule (a completed quest counts toward a chain only when every
earlier quest is completed). "The Great Outdoors" and "Camping 101" exist once per starting region,
as separate rows, all level 6, all links "Offered after":

- Elwynn Forest: 96627 The Adventurer (previous 21 Skirmish at Echo Ridge, not included) ->
  95998 The Great Outdoors -> 96626 Cooking, 97920 Fishing, 97923 Mining, 97924 Skinning.
- Dun Morogh: 96608 The Great Outdoors (no previous) -> 96629 Cooking. (96628 The Adventurer,
  Dun Morogh, is not linked to 96608 in the mirror.)
- Zephras Isle: 96638 The Adventurer (previous 92470 Foul Matriarch, not included) -> 96101 The
  Great Outdoors -> 96646 Cooking, 97963 Alchemy, 97968 Herbalism.
- Durotar: 96652 The Adventurer (no previous) -> 96604 The Great Outdoors -> 96655 Cooking,
  97901 Enchanting, 97907 Mining, 97908 Skinning.

Links are listed on both sides in every case. Other "Camping 101" rows (for example 97900, 97922,
96661) have no links at all.

## quests-alternatives.json

Thirteen real rows from the same mirror (read with `sqlite3 -readonly` on 2026-11-05), trimmed the
same way, where a quest lists several prerequisites that are ALTERNATIVES (OR), for the
chain-validity rule:

- 1524 Call of Fire (Shaman, level 11) needs one of 1522, 1523, 2983, 2984 (all "Call of Fire",
  level 10, per-race starters, "Chain link", no prerequisites); 1525 Call of Fire (level 12) follows
  1524 ("Complete first").
- 1124 Wasteland (Moonglade, level 55) needs Horde 1123 or Alliance 6762 "Rabine Saturna"
  ("Chain link"). 1123 (Thunder Bluff) needs one of 1000 (Thunder Bluff), 1004 (Undercity), 1018
  (Orgrimmar), all "The New Frontier", no prerequisites. 6762 (Darnassus) needs 6761 "The New
  Frontier" (Darnassus), whose own prerequisites 1015, 1019, 1047 are not included.

Links are listed on both sides. In the full mirror 122 quests have 2 or more prerequisites; in
about half of them the prerequisites share a name or differ by faction, race or class.

## professions.json and quests-profession.json (interim profession-quest rule, M1.1)

Inspected read-only (`sqlite3 -readonly`) on 2026-11-05, same mirror. Public game data only.

`professions` resource: 32 records, 12 base records (ids without `@`) plus 20 per-page records
(ids like `alchemy@100`, `blacksmithing@500`) whose data is identical to the base record, slug
included (no slug contains `@`). `ContentSource.list` returns data only, so `loadProfessions`
drops the duplicates by slug. `professions.json` holds the 12 base records trimmed to
`slug, name, kind`. Verified kinds (three, not two):

- `primary`: Alchemy, Blacksmithing, Enchanting, Engineering, Leatherworking, Tailoring
- `gathering`: Herbalism, Mining, Skinning (NOT `primary`; in the game they still take one of
  the two profession slots, so the rule counts `primary` and `gathering` as slot kinds)
- `secondary`: Cooking, First Aid, Fishing

Quests whose name ends with `: <profession name>` (case-insensitive): 23, all `Camping 101: <X>`
(level 6, category "Camping"): Alchemy 97963; Blacksmithing 97900; Cooking 96626, 96629, 96646,
96655, 96661; Enchanting 97901; Engineering 97902; First Aid 97931, 97955; Fishing 97920;
Herbalism 97933, 97957, 97968; Leatherworking 97922, 97969; Mining 97907, 97923, 97935, 97970;
Skinning 97908, 97924. No Tailoring one. Several have no `previous` link (97900, 97902, 97922,
97931) and several have `zone: null` and no starter (97902, 97931). 107 quests have a colon in
the name; none other ends with a profession name. 25 quests contain a profession word elsewhere
("Goblin Engineering", "Dragonscale Leatherworking", "Salve via Mining", "Mining Consultant",
"Stolen Enchanting Supplies", "The Family and the Fishing Pole"): these are not matches.

`quests-profession.json` (14 rows, trimmed like quests.json): 96604 The Great Outdoors (Durotar,
prerequisite of the Durotar Camping 101 quests), 96626 Cooking (Elwynn, after 95998), 96655
Cooking (Durotar), 97900 Blacksmithing (Durotar, no prerequisite), 97901 Enchanting, 97907 Mining,
97908 Skinning (Durotar, after 96604), 97902 Engineering and 97931 First Aid (zone null), 97920
Fishing (Elwynn, after 95998), 97922 Leatherworking (Elwynn, no prerequisite); look-alikes 710
Study of the Elements: Rock (colon, not a profession), 5883 Salve via Mining, 91745 Mining
Consultant.
