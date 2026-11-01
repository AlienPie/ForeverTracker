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

export const MAX_CACHE_ENTRIES = 500;
const RESOURCE_PATTERN = /^[a-z][a-z0-9-]*$/;

function assertResource(resource: string): void {
  if (!RESOURCE_PATTERN.test(resource)) {
    throw new Error("Invalid resource name: must match /^[a-z][a-z0-9-]*$/");
  }
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
      get: async (resource, id) => {
        assertResource(resource);
        return getRecord(db, resource, id)?.data ?? null;
      },
      list: async (resource, o) => {
        assertResource(resource);
        return listRecords(db, resource, o);
      },
    };
  }

  const now = opts.now ?? Date.now;
  const cache = new Map<string, { value: unknown; expires: number }>();

  async function cached<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    const hit = cache.get(key);
    if (hit) {
      if (now() < hit.expires) return hit.value as T;
      cache.delete(key);
    }
    const value = await fetcher();
    cache.delete(key);
    cache.set(key, { value, expires: now() + ON_DEMAND_TTL_MS });
    while (cache.size > MAX_CACHE_ENTRIES) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      cache.delete(oldest);
    }
    return value;
  }

  return {
    get: async (resource, id) => {
      assertResource(resource);
      return cached(JSON.stringify(["get", resource, id]), async () => {
        try {
          return (await client.get<unknown>(`/${resource}/${encodeURIComponent(id)}`)).data;
        } catch (e) {
          if (e instanceof ForeverDbHttpError && e.status === 404) return null;
          throw e;
        }
      });
    },
    list: async (resource, o) => {
      assertResource(resource);
      const query: Record<string, number> = {};
      if (o?.limit !== undefined) query.limit = o.limit;
      if (o?.offset !== undefined) query.offset = o.offset;
      return cached(JSON.stringify(["list", resource, query]), async () => {
        return (await client.get<unknown[]>(`/${resource}`, query)).data;
      });
    },
  };
}
