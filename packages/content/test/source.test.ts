import { describe, expect, test } from "vitest";
import { openDb } from "@ft/db";
import {
  createContentSource,
  ForeverDbHttpError,
  parseContentMode,
  type ForeverDbClient,
} from "../src/index";
import { putRecord } from "../src/mirror/store";

function fakeClient(handler: (path: string, query?: unknown) => unknown) {
  const calls: Array<{ path: string; query?: unknown }> = [];
  const client = {
    async get(path: string, query?: unknown) {
      calls.push({ path, query });
      return { data: handler(path, query), meta: { build: "B", attribution: "a" } };
    },
    async *pages() {
      throw new Error("pages not expected");
    },
  } as unknown as ForeverDbClient;
  return { client, calls };
}

describe("content source", () => {
  test("mirror mode reads from the DB and makes no API calls", async () => {
    const db = openDb(":memory:");
    for (let i = 1; i <= 3; i++) putRecord(db, "quests", String(i), { id: i }, "B", 1);
    const { client, calls } = fakeClient(() => {
      throw new Error("should not be called");
    });
    const src = createContentSource({ mode: "mirror", client, db });
    expect(await src.get("quests", "2")).toEqual({ id: 2 });
    expect(await src.get("quests", "99")).toBeNull();
    expect(await src.list("quests", { limit: 2, offset: 1 })).toEqual([{ id: 2 }, { id: 3 }]);
    expect(calls).toHaveLength(0);
  });

  test("on-demand fetches and serves the same request from cache for 60s, refetches after 60s", async () => {
    const db = openDb(":memory:");
    let t = 1000;
    let n = 0;
    const { client, calls } = fakeClient((path) => ({ path, n: ++n }));
    const src = createContentSource({ mode: "on-demand", client, db, now: () => t });

    expect(await src.get("quests", "5")).toEqual({ path: "/quests/5", n: 1 });
    t += 59_999;
    expect(await src.get("quests", "5")).toEqual({ path: "/quests/5", n: 1 });
    expect(calls).toHaveLength(1);
    t += 1;
    expect(await src.get("quests", "5")).toEqual({ path: "/quests/5", n: 2 });
    expect(calls).toHaveLength(2);

    // distinct requests are cached separately; list passes limit/offset to the API
    await src.list("quests", { limit: 10, offset: 20 });
    await src.list("quests", { limit: 10, offset: 20 });
    await src.list("quests");
    expect(calls.slice(2)).toEqual([
      { path: "/quests", query: { limit: 10, offset: 20 } },
      { path: "/quests", query: {} },
    ]);
  });

  test("on-demand returns null on API 404 and propagates other errors", async () => {
    const db = openDb(":memory:");
    const { client } = fakeClient((path) => {
      if (path.endsWith("/404")) throw new ForeverDbHttpError(404);
      throw new ForeverDbHttpError(500);
    });
    const src = createContentSource({ mode: "on-demand", client, db });
    expect(await src.get("quests", "404")).toBeNull();
    await expect(src.get("quests", "1")).rejects.toThrow(/500/);
  });

  test("parseContentMode defaults to mirror and throws on garbage", () => {
    expect(parseContentMode(undefined)).toBe("mirror");
    expect(parseContentMode("")).toBe("mirror");
    expect(parseContentMode("mirror")).toBe("mirror");
    expect(parseContentMode("on-demand")).toBe("on-demand");
    expect(() => parseContentMode("bogus")).toThrow(/mirror.*on-demand/);
  });
});
