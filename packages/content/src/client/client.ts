import {
  ForeverDbAuthError,
  ForeverDbBudgetError,
  ForeverDbHttpError,
  ForeverDbResponseError,
} from "./errors";
import { createLimiter } from "./limiter";
import type { ApiResponse, ForeverDbClient, ForeverDbClientOptions, Page, Query } from "./types";

const DEFAULT_BASE_URL = "https://foreverdb.net/api/v1";
const MAX_RETRIES = 3;
const DEFAULT_PAGE_LIMIT = 100;

export function createForeverDbClient(opts: ForeverDbClientOptions): ForeverDbClient {
  const baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const doFetch = opts.fetch ?? fetch;
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const dailyReserve = opts.dailyReserve ?? 200;
  const limiter = createLimiter({ limit: opts.perMinute ?? 50, now, sleep });
  let dailyRemaining: number | null = null;

  async function get<T>(path: string, query?: Query): Promise<ApiResponse<T>> {
    const url = new URL(baseUrl + (path.startsWith("/") ? path : `/${path}`));
    for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, String(v));

    for (let attempt = 0; ; attempt++) {
      if (dailyRemaining !== null && dailyRemaining <= dailyReserve) {
        throw new ForeverDbBudgetError(dailyRemaining, dailyReserve);
      }
      await limiter.acquire();

      let res: Response | null = null;
      try {
        res = await doFetch(url.toString(), {
          headers: { "X-API-Key": opts.apiKey, Accept: "application/json" },
        });
      } catch {
        // network failure: treated like a 5xx (status 0); the cause is dropped so nothing leaks
      }

      if (res) {
        const remaining = Number(res.headers.get("x-daily-remaining"));
        if (res.headers.get("x-daily-remaining") !== null && Number.isFinite(remaining)) {
          dailyRemaining = remaining;
        }
        if (res.status === 401 || res.status === 403) throw new ForeverDbAuthError(res.status);
        if (res.ok) {
          let body: unknown;
          try {
            body = await res.json();
          } catch {
            throw new ForeverDbResponseError(res.status);
          }
          const env = body as Partial<ApiResponse<T>> | null;
          if (
            typeof env !== "object" ||
            env === null ||
            !("data" in env) ||
            typeof env.meta !== "object" ||
            env.meta === null
          ) {
            throw new ForeverDbResponseError(res.status);
          }
          return env as ApiResponse<T>;
        }
        if (res.status !== 429 && res.status < 500) throw new ForeverDbHttpError(res.status);
      }

      const status = res?.status ?? 0;
      if (attempt >= MAX_RETRIES) throw new ForeverDbHttpError(status);
      if (status === 429) {
        const secs = Number(res!.headers.get("retry-after"));
        await sleep((Number.isFinite(secs) && secs > 0 ? secs : 1) * 1000);
      } else {
        await sleep(1000 * 2 ** attempt);
      }
    }
  }

  async function* pages<T>(
    path: string,
    o: { query?: Query; startOffset?: number; limit?: number } = {},
  ): AsyncGenerator<Page<T>> {
    const limit = o.limit ?? DEFAULT_PAGE_LIMIT;
    let offset = o.startOffset ?? 0;
    for (;;) {
      const res = await get<T[]>(path, { ...o.query, limit, offset });
      if (!Array.isArray(res.data)) throw new ForeverDbResponseError(200);
      const total = res.meta.total ?? offset + res.data.length;
      const step = res.meta.limit ?? limit;
      if (!Number.isInteger(step) || step <= 0) throw new ForeverDbResponseError(200);
      const nextOffset = res.data.length > 0 && offset + step < total ? offset + step : null;
      if (nextOffset !== null && nextOffset <= offset) throw new ForeverDbResponseError(200);
      yield { items: res.data, offset, total, nextOffset, build: res.meta.build };
      if (nextOffset === null) return;
      offset = nextOffset;
    }
  }

  return { get, pages };
}
