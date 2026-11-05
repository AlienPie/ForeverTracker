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
