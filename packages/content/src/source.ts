import type { Db } from "@ft/db";
import { ForeverDbHttpError } from "./client/errors";
import type { ForeverDbClient } from "./client/types";
import { getRecord, listRecords } from "./mirror/store";

export type ContentMode = "mirror" | "on-demand";

export interface ContentSource {
  get(resource: string, id: string): Promise<unknown | null>;
  list(resource: string, opts?: { limit?: number; offset?: number }): Promise<unknown[]>;
}

export const ON_DEMAND_TTL_MS = 60_000;

export function parseContentMode(value: string | undefined): ContentMode {
  if (value === undefined || value === "") return "mirror";
  if (value === "mirror" || value === "on-demand") return value;
  throw new Error('Invalid CONTENT_MODE: allowed values are "mirror" or "on-demand"');
}

export function createContentSource(opts: {
  mode: ContentMode;
  client: ForeverDbClient;
  db: Db;
  now?: () => number;
}): ContentSource {
  const { mode, client, db } = opts;
  if (mode === "mirror") {
    return {
      get: async (resource, id) => getRecord(db, resource, id)?.data ?? null,
      list: async (resource, o) => listRecords(db, resource, o),
    };
  }

  const now = opts.now ?? Date.now;
  const cache = new Map<string, { value: unknown; expires: number }>();

  async function cached<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    const hit = cache.get(key);
    if (hit && now() < hit.expires) return hit.value as T;
    const value = await fetcher();
    cache.set(key, { value, expires: now() + ON_DEMAND_TTL_MS });
    return value;
  }

  return {
    get: (resource, id) =>
      cached(JSON.stringify(["get", resource, id]), async () => {
        try {
          return (await client.get<unknown>(`/${resource}/${encodeURIComponent(id)}`)).data;
        } catch (e) {
          if (e instanceof ForeverDbHttpError && e.status === 404) return null;
          throw e;
        }
      }),
    list: (resource, o) => {
      const query: Record<string, number> = {};
      if (o?.limit !== undefined) query.limit = o.limit;
      if (o?.offset !== undefined) query.offset = o.offset;
      return cached(JSON.stringify(["list", resource, query]), async () => {
        return (await client.get<unknown[]>(`/${resource}`, query)).data;
      });
    },
  };
}
