import { readFileSync } from "node:fs";
import { character, openDb, snapshot } from "@ft/db";
import * as core from "@ft/core";
import { describe, expect, test, vi } from "vitest";

vi.mock("@ft/core", async (orig) => {
  const actual = await orig<typeof import("@ft/core")>();
  return { ...actual, ingestSavedVariables: vi.fn(actual.ingestSavedVariables) };
});
import { handleIngest, MAX_BODY_BYTES } from "../src/lib/server/ingest-handler";
import { createDeviceToken } from "../src/lib/server/tokens";
import { handleHealth } from "../src/lib/server/health";

const FIXTURE = readFileSync(
  new URL("../../../packages/core/test/fixtures/ForeverTracker.lua", import.meta.url),
  "utf8",
);

function setup() {
  const db = openDb(":memory:");
  const { token } = createDeviceToken(db, "t");
  return { db, token };
}

function req(body: BodyInit | null, token?: string, headers: Record<string, string> = {}) {
  return new Request("http://x/api/ingest", {
    method: "POST",
    body,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    // @ts-expect-error node fetch needs duplex for stream bodies
    duplex: "half",
  });
}

function stream(chunks: Uint8Array[], onPull?: () => void) {
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(c) {
      onPull?.();
      if (i < chunks.length) c.enqueue(chunks[i++]!);
      else c.close();
    },
  });
}

describe("health", () => {
  test("returns ok", async () => {
    const res = handleHealth();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe("POST /api/ingest", () => {
  test("ingest 401 without bearer", async () => {
    const { db } = setup();
    expect((await handleIngest(db, req(FIXTURE))).status).toBe(401);
  });

  test("ingest 401 with a wrong token", async () => {
    const { db } = setup();
    expect((await handleIngest(db, req(FIXTURE, "wrong"))).status).toBe(401);
  });

  test("non-bearer scheme is rejected", async () => {
    const { db, token } = setup();
    const r = new Request("http://x/", { method: "POST", body: FIXTURE, headers: { authorization: `Basic ${token}` } });
    expect((await handleIngest(db, r)).status).toBe(401);
  });

  test("unauthenticated requests do not read the body", async () => {
    const { db } = setup();
    const r = req(stream([new TextEncoder().encode("x")]));
    expect((await handleIngest(db, r)).status).toBe(401);
    expect(r.bodyUsed).toBe(false);
    expect(r.body!.locked).toBe(false);
  });

  test("ingest 413 above 8 MB", async () => {
    const { db, token } = setup();
    const res = await handleIngest(db, req("a".repeat(MAX_BODY_BYTES + 1), token));
    expect(res.status).toBe(413);
  });

  test("413 on Content-Length above the cap without reading the body", async () => {
    const { db, token } = setup();
    const r = req(stream([new Uint8Array(1)]), token, {
      "content-length": String(MAX_BODY_BYTES + 1),
    });
    expect((await handleIngest(db, r)).status).toBe(413);
    expect(r.bodyUsed).toBe(false);
    expect(r.body!.locked).toBe(false);
  });

  test("413 detected on streamed bytes with no Content-Length", async () => {
    const { db, token } = setup();
    const chunk = new Uint8Array(1024 * 1024);
    const chunks = Array.from({ length: 9 }, () => chunk);
    let pulled = 0;
    const res = await handleIngest(db, req(stream(chunks, () => pulled++), token));
    expect(res.status).toBe(413);
    expect(pulled).toBeLessThan(11); // aborted shortly after the cap, not drained
  });

  test("413 detected on streamed bytes with a false Content-Length", async () => {
    const { db, token } = setup();
    const chunk = new Uint8Array(1024 * 1024);
    const chunks = Array.from({ length: 9 }, () => chunk);
    const res = await handleIngest(db, req(stream(chunks), token, { "content-length": "10" }));
    expect(res.status).toBe(413);
  });

  test("ingest 422 with position for truncated Lua", async () => {
    const { db, token } = setup();
    const res = await handleIngest(db, req(FIXTURE.slice(0, 120), token));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("parse");
    expect(typeof body.line).toBe("number");
    expect(typeof body.column).toBe("number");
    expect(JSON.stringify(body)).not.toContain("ForeverTrackerDB");
  });

  test("ingest 422 for a file without ForeverTrackerDB (IngestError)", async () => {
    const { db, token } = setup();
    const res = await handleIngest(db, req("Other = {}\n", token));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("ingest");
    expect(typeof body.message).toBe("string");
  });

  test("ingest 200 and rows created for the fixture", async () => {
    const { db, token } = setup();
    const res = await handleIngest(db, req(FIXTURE, token));
    expect(res.status).toBe(200);
    const summary = await res.json();
    expect(summary.stored).toBeGreaterThan(0);
    expect(summary).toHaveProperty("failed", 0);
    expect(db.select().from(character).all().length).toBeGreaterThan(0);
    expect(db.select().from(snapshot).all().length).toBe(summary.stored);
    expect(JSON.stringify(summary)).not.toContain(token);
  });

  test("unexpected error gives 500 internal with nothing sensitive", async () => {
    const { db, token } = setup();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(core.ingestSavedVariables).mockImplementationOnce(() => {
      throw new Error(`secret ${token} ${FIXTURE.slice(0, 40)}`);
    });
    const res = await handleIngest(db, req(FIXTURE, token));
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ error: "internal" });
    expect(text).not.toContain(token);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
