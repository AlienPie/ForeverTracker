import { openDb } from "@ft/db";
import { beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null as unknown, ingest: 0 }));
vi.mock("../src/lib/server/db", () => ({ getDb: () => state.db }));
vi.mock("@ft/core", async (orig) => {
  const mod = await orig<typeof import("@ft/core")>();
  return { ...mod, ingestSavedVariables: (...a: Parameters<typeof mod.ingestSavedVariables>) => (state.ingest++, mod.ingestSavedVariables(...a)) };
});

import { actions } from "../src/routes/upload/+page.server";
import { load as rosterLoad } from "../src/routes/+page.server";

const NOW = 1_800_000_000;
const FIXTURE = `ForeverTrackerDB = { schema = 1, characters = {
  ["Player-7777-0000E001"] = { snapshot = { takenAt = ${NOW - 60},
    identity = { name = "Ysolde", class = "MAGE", race = "Gnome", level = 8, xp = 10, xpMax = 100 },
    time = { played = 1000 }, state = { zone = "Dun Morogh", mapId = 1426, money = 10 },
    progress = { professions = {}, questsCompleted = {}, questLog = {} } } },
} }`;

const run = (file: File | null) => {
  const fd = new FormData();
  if (file) fd.set("file", file);
  return (actions.default as (e: unknown) => Promise<{ status?: number; data?: Record<string, unknown> } & Record<string, unknown>>)({
    request: new Request("http://localhost/upload", { method: "POST", body: fd }),
  });
};
const lua = (text: string) => new File([text], "ForeverTracker.lua");

beforeEach(() => {
  state.db = openDb(":memory:");
  state.ingest = 0;
});

describe("upload action", () => {
  test("valid file returns a summary and the roster lists the character; re-upload stores nothing", async () => {
    const first = await run(lua(FIXTURE));
    expect(first).toEqual({ summary: { characters: 1, stored: 1, skipped: 0, unsupported: 0, failed: 0 } });
    const roster = (await (rosterLoad as never as () => Promise<{ roster: { characters: { name: string }[] } }>)()).roster;
    expect(roster.characters.map((c) => c.name)).toEqual(["Ysolde"]);
    const again = (await run(lua(FIXTURE))) as { summary: { stored: number; characters: number } };
    expect(again.summary).toMatchObject({ characters: 1, stored: 0 });
  });

  test("garbage and non-ForeverTracker files give 400 with the message", async () => {
    const bad = await run(lua("OtherAddonDB = { a = 1 }"));
    expect(bad).toMatchObject({ status: 400, data: { error: "File does not contain a ForeverTrackerDB table" } });
    const garbage = (await run(lua("{{{ not lua ==="))) as { status: number; data: { error: string } };
    expect(garbage.status).toBe(400);
    expect(garbage.data.error.length).toBeGreaterThan(0);
  });

  test("missing or empty file gives 400", async () => {
    expect(await run(null)).toMatchObject({ status: 400 });
    expect(await run(lua(""))).toMatchObject({ status: 400 });
    expect(state.ingest).toBe(0);
  });

  test("over-cap file gives 413 and never ingests or reads text", async () => {
    const big = new Blob([new Uint8Array(8 * 1024 * 1024 + 1)]);
    const file = new File([big], "ForeverTracker.lua");
    const text = vi.spyOn(file, "text");
    const buf = vi.spyOn(file, "arrayBuffer");
    const res = await run(file);
    expect(res).toMatchObject({ status: 413, data: { error: "File too large (limit 8 MB)" } });
    expect(state.ingest).toBe(0);
    expect(text).not.toHaveBeenCalled();
    expect(buf).not.toHaveBeenCalled();
  });
});
