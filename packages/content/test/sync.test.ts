import { describe, expect, test } from "vitest";
import { openDb } from "@ft/db";
import {
  checkBuild,
  ForeverDbAuthError,
  ForeverDbBudgetError,
  getItem,
  getRecord,
  listRecords,
  syncAll,
  syncResource,
  type ForeverDbClient,
  type ResourceSpec,
} from "../src/index";
import { keyedResource, RESOURCES } from "../src/mirror/resources";
import { getSyncState } from "../src/mirror/store";

type Item = { id: number };
const ids = (from: number, n: number): Item[] => Array.from({ length: n }, (_, i) => ({ id: from + i }));

/** Fake client: `/things` is served in pages of 2 from `rows`; build and failures are scripted. */
function fake(opts: {
  rows?: Item[];
  buildFor?: (call: number, offset: number) => string;
  failAt?: (call: number) => Error | null;
  detail?: Record<string, unknown[]>;
  meta?: { build: string; levelCap: number };
  items?: Record<string, unknown>;
} = {}) {
  const rows = opts.rows ?? ids(1, 6);
  const calls: string[] = [];
  const started: number[] = [];
  let pageCalls = 0;
  const client: ForeverDbClient = {
    async get(path, query) {
      calls.push(path);
      if (path === "/meta") {
        return { data: opts.meta ?? { build: "A", levelCap: 30 }, meta: { build: "A", attribution: "" } } as never;
      }
      if (path.startsWith("/items/")) {
        return { data: opts.items?.[path] ?? { id: 1 }, meta: { build: "A", attribution: "" } } as never;
      }
      const m = /^\/things\/(\w+)$/.exec(path);
      if (m) {
        const pagesOf = opts.detail![m[1]!]!;
        const offset = Number(query?.offset ?? 0);
        const next = offset + 1 < pagesOf.length;
        return {
          data: pagesOf[offset],
          meta: { build: "A", attribution: "", offset, limit: 1, ...(next ? { next: "x" } : { next: null }) },
        } as never;
      }
      throw new Error(`unexpected ${path}`);
    },
    async *pages(_path, o) {
      let offset = o?.startOffset ?? 0;
      started.push(offset);
      for (;;) {
        const err = opts.failAt?.(pageCalls);
        const build = opts.buildFor?.(pageCalls, offset) ?? "A";
        pageCalls++;
        if (err) throw err;
        const items = rows.slice(offset, offset + 2) as never[];
        const nextOffset = offset + 2 < rows.length ? offset + 2 : null;
        yield { items, offset, total: rows.length, nextOffset, build };
        if (nextOffset === null) return;
        offset = nextOffset;
      }
    },
  };
  return { client, calls, started };
}

const things: ResourceSpec = {
  name: "things",
  async *fetch(client, resume) {
    for await (const p of client.pages<Item>("/things", { startOffset: resume.offset })) {
      yield {
        records: p.items.map((i) => ({ id: String(i.id), data: i })),
        nextOffset: p.nextOffset,
        build: p.build,
        total: p.total,
      };
    }
  },
};

describe("syncResource", () => {
  test("syncResource stores every record and marks status complete", async () => {
    const db = openDb(":memory:");
    const { client } = fake();
    await syncResource({ client, db, now: () => 5 }, things);
    expect(listRecords(db, "things")).toEqual(ids(1, 6));
    expect(getRecord(db, "things", "3")).toEqual({ data: { id: 3 }, build: "A", fetchedAt: 5 });
    expect(getSyncState(db, "things")).toMatchObject({ status: "complete", build: "A", total: 6 });
  });

  test("checkpoint advances after each page", async () => {
    const db = openDb(":memory:");
    const { client } = fake({ failAt: (n) => (n === 2 ? new Error("killed") : null) });
    await expect(syncResource({ client, db }, things)).rejects.toThrow("killed");
    expect(getSyncState(db, "things")).toMatchObject({ nextOffset: 4, status: "failed", build: "A" });
    expect(listRecords(db, "things")).toHaveLength(4);
  });

  test("a resumed sync starts at the stored offset and does not refetch earlier pages", async () => {
    const db = openDb(":memory:");
    const first = fake({ failAt: (n) => (n === 2 ? new Error("killed") : null) });
    await expect(syncResource({ client: first.client, db }, things)).rejects.toThrow();
    const second = fake();
    await syncResource({ client: second.client, db }, things);
    expect(second.started).toEqual([4]);
    expect(listRecords(db, "things")).toEqual(ids(1, 6));
    expect(getSyncState(db, "things")?.status).toBe("complete");
  });

  test("restarts the resource from offset 0 if the build changed mid-sync", async () => {
    const db = openDb(":memory:");
    // first pass: page 1 build A, page 2 build B; after the restart everything is B
    let restarted = false;
    const f = fake({
      buildFor: (n, offset) => {
        if (n === 0) return "A";
        if (n === 1) return (restarted = true), "B";
        return restarted ? "B" : "A";
      },
    });
    await syncResource({ client: f.client, db }, things);
    expect(f.started).toEqual([0, 0]);
    const all = listRecords(db, "things");
    expect(all).toEqual(ids(1, 6));
    for (const id of ["1", "2", "3", "4", "5", "6"]) expect(getRecord(db, "things", id)?.build).toBe("B");
    expect(getSyncState(db, "things")).toMatchObject({ build: "B", status: "complete" });
  });

  test("a build change on resume wipes old-build rows", async () => {
    const db = openDb(":memory:");
    const a = fake({ rows: ids(1, 6), failAt: (n) => (n === 2 ? new Error("killed") : null) });
    await expect(syncResource({ client: a.client, db }, things)).rejects.toThrow();
    const b = fake({ rows: ids(10, 2), buildFor: () => "B" });
    await syncResource({ client: b.client, db }, things);
    expect(listRecords(db, "things")).toEqual(ids(10, 2));
  });

  test("sync stops with status failed and keeps its checkpoint on ForeverDbBudgetError", async () => {
    const db = openDb(":memory:");
    const { client } = fake({ failAt: (n) => (n === 1 ? new ForeverDbBudgetError(10, 200) : null) });
    await expect(syncResource({ client, db }, things)).rejects.toBeInstanceOf(ForeverDbBudgetError);
    expect(getSyncState(db, "things")).toMatchObject({ status: "failed", nextOffset: 2 });
  });

  test("sync stops with status failed and keeps its checkpoint on ForeverDbAuthError", async () => {
    const db = openDb(":memory:");
    const { client } = fake({ failAt: (n) => (n === 1 ? new ForeverDbAuthError(401) : null) });
    await expect(syncResource({ client, db }, things)).rejects.toBeInstanceOf(ForeverDbAuthError);
    expect(getSyncState(db, "things")).toMatchObject({ status: "failed", nextOffset: 2 });
  });

  test("reports progress after each page", async () => {
    const db = openDb(":memory:");
    const seen: string[] = [];
    await syncResource(
      { client: fake().client, db, onProgress: (p) => seen.push(`${p.resource} ${p.done}/${p.total}`) },
      things,
    );
    expect(seen).toEqual(["things 2/6", "things 4/6", "things 6/6"]);
  });
});

describe("keyed detail resources", () => {
  test("follows paginated details by offset and stores extra pages as key@offset", async () => {
    const db = openDb(":memory:");
    const f = fake({ detail: { alchemy: [{ p: 0 }, { p: 1 }, { p: 2 }], mining: [{ p: 9 }] } });
    const small = keyedResource("professions", "/things", ["alchemy", "mining"]);
    await syncResource({ client: f.client, db }, small);
    expect(getRecord(db, "professions", "alchemy")?.data).toEqual({ p: 0 });
    expect(getRecord(db, "professions", "alchemy@1")?.data).toEqual({ p: 1 });
    expect(getRecord(db, "professions", "alchemy@2")?.data).toEqual({ p: 2 });
    expect(getRecord(db, "professions", "mining")?.data).toEqual({ p: 9 });
    expect(getSyncState(db, "professions")).toMatchObject({ status: "complete", total: 2 });
  });

  test("classes takes keys from the list rows' name and rejects rows without one", async () => {
    const spec = RESOURCES.find((r) => r.name === "classes")!;
    const bad: ForeverDbClient = {
      async get() {
        return { data: [{ id: 1 }], meta: { build: "A", attribution: "" } } as never;
      },
      async *pages() {},
    };
    await expect(syncResource({ client: bad, db: openDb(":memory:") }, spec)).rejects.toThrow(/without a name/);

    const db = openDb(":memory:");
    const good: ForeverDbClient = {
      async get(path) {
        const data = path === "/classes" ? [{ name: "mage" }, { name: "rogue" }] : { name: path.split("/")[2] };
        return { data, meta: { build: "A", attribution: "" } } as never;
      },
      async *pages() {},
    };
    await syncResource({ client: good, db }, spec);
    expect(getRecord(db, "classes", "rogue")?.data).toEqual({ name: "rogue" });
  });
});

describe("checkBuild / syncAll / getItem", () => {
  test("checkBuild reports changed=false when the build matches, and returns levelCap from /meta", async () => {
    const db = openDb(":memory:");
    await syncResource({ client: fake().client, db }, things);
    const r = await checkBuild({ client: fake({ meta: { build: "A", levelCap: 35 } }).client, db });
    expect(r).toEqual({ build: "A", levelCap: 35, changed: false });
  });

  test("checkBuild reports changed=true when the build differs", async () => {
    const db = openDb(":memory:");
    await syncResource({ client: fake().client, db }, things);
    const r = await checkBuild({ client: fake({ meta: { build: "B", levelCap: 40 } }).client, db });
    expect(r).toEqual({ build: "B", levelCap: 40, changed: true });
  });

  test("syncAll skips resources already complete for the current build", async () => {
    const db = openDb(":memory:");
    const f = fake();
    const stub: ForeverDbClient = {
      get: f.client.get,
      async *pages() {
        throw new Error("should not fetch");
      },
    };
    for (const r of RESOURCES) {
      db.insert((await import("@ft/db")).syncState)
        .values({ resource: r.name, build: "A", nextOffset: 0, total: 1, status: "complete", updatedAt: 1 })
        .run();
    }
    await syncAll({ client: stub, db });
  });

  test("getItem fetches once and serves later calls from the store", async () => {
    const db = openDb(":memory:");
    const f = fake({ items: { "/items/19019": { id: 19019, name: "Thunderfury" } } });
    const a = await getItem({ client: f.client, db }, 19019);
    const b = await getItem({ client: f.client, db }, 19019);
    expect(a).toEqual({ id: 19019, name: "Thunderfury" });
    expect(b).toEqual(a);
    expect(f.calls.filter((c) => c === "/items/19019")).toHaveLength(1);
    expect(getRecord(db, "items", "19019")?.build).toBe("A");
  });
});
