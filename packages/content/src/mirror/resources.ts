import type { ForeverDbClient } from "../client/types";

export type ResourceChunk = {
  records: { id: string; data: unknown }[];
  nextOffset: number | null;
  build: string;
  /** Total number of offset units for this resource, when known (progress display). */
  total?: number;
};

export type ResourceSpec = {
  name: string;
  fetch(client: ForeverDbClient, resume: { offset: number }): AsyncGenerator<ResourceChunk>;
};

const PAGE_LIMIT = 100;
const MAX_DETAIL_PAGES = 1000;

/**
 * Paged list resources. Only `quests` rows are verified against the live API
 * (id, name, level, zone, chain, starts, ends); zones/vendors/dungeons are UNVERIFIED
 * and assumed to be `{ data: [{ id, ... }] }` lists.
 */
function listResource(name: string, path: string): ResourceSpec {
  return {
    name,
    async *fetch(client, resume) {
      for await (const page of client.pages<{ id: number | string }>(path, {
        limit: PAGE_LIMIT,
        startOffset: resume.offset,
      })) {
        yield {
          records: page.items.map((item) => {
            if (item?.id === undefined || item.id === null) {
              throw new Error(`${name}: list row without an id`);
            }
            return { id: String(item.id), data: item };
          }),
          nextOffset: page.nextOffset,
          build: page.build,
          total: page.total,
        };
      }
    },
  };
}

/**
 * Keyed detail resources: one detail call per key. `offset` is the index into the key list.
 * If a detail response is itself paginated (meta.next set), further pages are followed by
 * offset and stored as `<key>@<offset>`. Only meta.next/total/limit/offset are relied on.
 */
export function keyedResource(
  name: string,
  path: string,
  keys: string[] | ((client: ForeverDbClient) => Promise<string[]>),
): ResourceSpec {
  return {
    name,
    async *fetch(client, resume) {
      const list = typeof keys === "function" ? await keys(client) : keys;
      for (let i = resume.offset; i < list.length; i++) {
        const k = list[i] as string;
        const records: ResourceChunk["records"] = [];
        let build = "";
        let offset = 0;
        for (let n = 0; ; n++) {
          if (n >= MAX_DETAIL_PAGES) throw new Error(`${name}/${k}: detail pagination did not end`);
          const res = await client.get<unknown>(`${path}/${encodeURIComponent(k)}`, {
            limit: PAGE_LIMIT,
            ...(offset > 0 ? { offset } : {}),
          });
          build = res.meta.build;
          records.push({ id: offset === 0 ? k : `${k}@${offset}`, data: res.data });
          if (!res.meta.next) break;
          const next = (res.meta.offset ?? offset) + (res.meta.limit ?? PAGE_LIMIT);
          if (!Number.isInteger(next) || next <= offset) {
            throw new Error(`${name}/${k}: detail pagination did not advance`);
          }
          offset = next;
        }
        yield {
          records,
          nextOffset: i + 1 < list.length ? i + 1 : null,
          build,
          total: list.length,
        };
      }
    },
  };
}

/** `/classes` lists the nine classes; each row's `name` is the detail key (verified for mage). */
async function classKeys(client: ForeverDbClient): Promise<string[]> {
  const res = await client.get<{ name?: unknown }[]>("/classes", { limit: PAGE_LIMIT });
  if (!Array.isArray(res.data)) throw new Error("classes: expected a list response");
  return res.data.map((row) => {
    if (typeof row?.name !== "string" || row.name === "") {
      throw new Error("classes: list row without a name");
    }
    return row.name;
  });
}

const PROFESSIONS = [
  "alchemy", "blacksmithing", "enchanting", "engineering", "leatherworking", "tailoring",
  "herbalism", "mining", "skinning", "cooking", "first-aid", "fishing",
];
const GATHERING = ["herbalism", "mining", "skinning", "fishing"];

export const RESOURCES: ResourceSpec[] = [
  listResource("zones", "/zones"),
  listResource("quests", "/quests"),
  listResource("vendors", "/vendors"),
  listResource("dungeons", "/dungeons"),
  keyedResource("classes", "/classes", classKeys),
  keyedResource("professions", "/professions", PROFESSIONS),
  keyedResource("gathering", "/gathering", GATHERING),
];
