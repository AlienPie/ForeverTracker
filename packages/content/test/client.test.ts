import { describe, expect, test } from "vitest";
import {
  createForeverDbClient,
  ForeverDbAuthError,
  ForeverDbBudgetError,
  ForeverDbHttpError,
  ForeverDbResponseError,
} from "../src/index";
import metaFixture from "./fixtures/meta.json";
import questsPage from "./fixtures/quests-page.json";

const KEY = "fdb_secret";

type Reply = { status?: number; body?: unknown; raw?: boolean; headers?: Record<string, string> };

function harness(replies: Reply[] | ((n: number) => Reply), opts: { perMinute?: number; dailyReserve?: number } = {}) {
  let clock = 1_000_000;
  const sleeps: number[] = [];
  const calls: { url: string; headers: Record<string, string>; at: number }[] = [];
  const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
    const n = calls.length;
    calls.push({ url: String(url), headers: { ...(init?.headers as Record<string, string>) }, at: clock });
    const r = typeof replies === "function" ? replies(n) : (replies[Math.min(n, replies.length - 1)] as Reply);
    return new Response(r.raw ? String(r.body) : JSON.stringify(r.body ?? { data: {}, meta: { build: "b", attribution: "a" } }), {
      status: r.status ?? 200,
      headers: r.headers,
    });
  }) as typeof fetch;
  const client = createForeverDbClient({
    apiKey: KEY,
    fetch: fetchFn,
    now: () => clock,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
    ...opts,
  });
  return { client, calls, sleeps, advance: (ms: number) => (clock += ms) };
}

describe("ForeverDB client", () => {
  test("sends X-API-Key and returns data and meta", async () => {
    const { client, calls } = harness([{ body: metaFixture }]);
    const res = await client.get<{ build: string; levelCap: number }>("/meta");
    expect(calls[0]!.headers["X-API-Key"]).toBe(KEY);
    expect(calls[0]!.url).toBe("https://foreverdb.net/api/v1/meta");
    expect(res.data.levelCap).toBe(30);
    expect(res.meta.build).toBe(metaFixture.meta.build);
  });

  test("never sends more than perMinute requests in any 60s window", async () => {
    const { client, calls } = harness([{}], { perMinute: 50 });
    for (let i = 0; i < 120; i++) await client.get("/meta");
    expect(calls).toHaveLength(120);
    for (let i = 0; i + 50 < calls.length; i++) {
      expect(calls[i + 50]!.at - calls[i]!.at).toBeGreaterThanOrEqual(60_000);
    }
  });

  test("waits Retry-After seconds on 429 then retries", async () => {
    const { client, sleeps, calls } = harness([
      { status: 429, headers: { "Retry-After": "5" } },
      {},
    ]);
    await client.get("/meta");
    expect(sleeps).toContain(5000);
    expect(calls).toHaveLength(2);
  });

  test("gives up with ForeverDbHttpError after 3 retries on 429", async () => {
    const { client, calls } = harness([{ status: 429, headers: { "Retry-After": "5" } }]);
    const err = await client.get("/meta").catch((e) => e);
    expect(err).toBeInstanceOf(ForeverDbHttpError);
    expect(err.status).toBe(429);
    expect(calls).toHaveLength(4);
  });

  test("retries 5xx with 1s, 2s, 4s backoff then throws", async () => {
    const { client, sleeps, calls } = harness([{ status: 503 }]);
    const err = await client.get("/meta").catch((e) => e);
    expect(err).toBeInstanceOf(ForeverDbHttpError);
    expect(err.status).toBe(503);
    expect(sleeps).toEqual([1000, 2000, 4000]);
    expect(calls).toHaveLength(4);
  });

  test("401 and 403 throw ForeverDbAuthError immediately with no retry", async () => {
    for (const status of [401, 403]) {
      const { client, calls } = harness([{ status }]);
      await expect(client.get("/meta")).rejects.toBeInstanceOf(ForeverDbAuthError);
      expect(calls).toHaveLength(1);
    }
  });

  test("throws ForeverDbBudgetError when X-Daily-Remaining <= dailyReserve on the next call", async () => {
    const { client, calls } = harness([{ headers: { "X-Daily-Remaining": "200" } }]);
    await client.get("/meta"); // the response that reports the low budget still succeeds
    await expect(client.get("/meta")).rejects.toBeInstanceOf(ForeverDbBudgetError);
    expect(calls).toHaveLength(1);
  });

  test("pages() follows offset/limit using meta.total and ends when nextOffset is null", async () => {
    const { client, calls } = harness((n) => ({
      body: {
        data: n < 2 ? [1, 2] : [3],
        meta: { build: "b", attribution: "a", total: 5, limit: 2, offset: n * 2 },
      },
    }));
    const pages = [];
    for await (const p of client.pages<number>("/quests", { limit: 2 })) pages.push(p);
    expect(pages.map((p) => p.items)).toEqual([[1, 2], [1, 2], [3]]);
    expect(pages.map((p) => p.nextOffset)).toEqual([2, 4, null]);
    expect(pages.map((p) => p.offset)).toEqual([0, 2, 4]);
    expect(pages[0]!.total).toBe(5);
    expect(pages[0]!.build).toBe("b");
    expect(calls.map((c) => new URL(c.url).searchParams.get("offset"))).toEqual(["0", "2", "4"]);
  });

  test("pages() resumes from startOffset", async () => {
    const { client, calls } = harness([
      { body: { data: [9], meta: { build: "b", attribution: "a", total: 5, limit: 2, offset: 4 } } },
    ]);
    const pages = [];
    for await (const p of client.pages<number>("/quests", { limit: 2, startOffset: 4 })) pages.push(p);
    expect(pages).toHaveLength(1);
    expect(new URL(calls[0]!.url).searchParams.get("offset")).toBe("4");
  });

  test("pages() works against a recorded quests page", async () => {
    const { client } = harness([{ body: questsPage }]);
    const first = await client.pages<{ id: number }>("/quests", { limit: 1 }).next();
    expect(first.value!.items[0]!.id).toBe(2);
    expect(first.value!.nextOffset).toBe(1);
    expect(first.value!.total).toBe(3862);
  });

  test("errors and their messages never contain the api key", async () => {
    const scenarios: Reply[] = [{ status: 401 }, { status: 500 }, { status: 429, headers: { "Retry-After": "1" } }];
    const errs: unknown[] = [];
    for (const s of scenarios) errs.push(await harness([s]).client.get("/meta").catch((e) => e));
    const b = harness([{ headers: { "X-Daily-Remaining": "1" } }]);
    await b.client.get("/meta");
    errs.push(await b.client.get("/meta").catch((e) => e));
    expect(errs[0]).toBeInstanceOf(ForeverDbAuthError);
    expect(errs[3]).toBeInstanceOf(ForeverDbBudgetError);
    for (const e of errs) {
      expect(JSON.stringify(e)).not.toContain(KEY);
      expect((e as Error).message).not.toContain(KEY);
      expect((e as Error).stack ?? "").not.toContain(KEY);
    }
  });

  test("invalid-JSON 200 body throws ForeverDbResponseError", async () => {
    const { client } = harness([{ body: "<html>portal</html>", raw: true }]);
    const err = await client.get("/meta").catch((e) => e);
    expect(err).toBeInstanceOf(ForeverDbResponseError);
    expect(err.message).not.toContain("portal");
  });

  test("200 JSON without meta throws ForeverDbResponseError", async () => {
    const { client } = harness([{ body: { data: [] } }]);
    await expect(client.get("/meta")).rejects.toBeInstanceOf(ForeverDbResponseError);
  });

  test("pages() over non-array data throws ForeverDbResponseError", async () => {
    const { client } = harness([{ body: { data: { x: 1 }, meta: { build: "b", attribution: "a" } } }]);
    await expect(client.pages("/quests").next()).rejects.toBeInstanceOf(ForeverDbResponseError);
  });

  test(
    "pages() throws instead of looping when meta.limit is 0",
    async () => {
      const { client, calls } = harness([
        { body: { data: [1], meta: { build: "b", attribution: "a", total: 10, limit: 0, offset: 0 } } },
      ]);
      const pages: unknown[] = [];
      const run = async () => {
        for await (const p of client.pages<number>("/quests", { limit: 2 })) {
          pages.push(p);
          if (pages.length > 5) break;
        }
      };
      await expect(run()).rejects.toBeInstanceOf(ForeverDbResponseError);
      expect(pages.length).toBeLessThanOrEqual(1);
      expect(calls.length).toBeLessThanOrEqual(1);
    },
    2000,
  );
});
