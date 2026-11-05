import { contentRecord, openDb, syncState } from "@ft/db";
import { beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  db: null as unknown,
  e: { contentMode: "mirror" as const, ownerPassword: null as string | null, sessionSecret: null as string | null },
}));
vi.mock("../src/lib/server/db", () => ({ getDb: () => state.db }));
vi.mock("../src/lib/server/env", () => ({ env: () => state.e }));

import { actions, load, type SettingsData } from "../src/routes/settings/+page.server";
import { verifyDeviceToken, createDeviceToken } from "../src/lib/server/tokens";

type R = { status?: number; data?: Record<string, unknown>; created?: { label: string; token: string }; revoked?: number };
const post = (name: "create" | "revoke", fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return (actions[name] as (e: unknown) => Promise<R>)({ request: new Request("http://localhost/settings", { method: "POST", body: fd }) });
};
const data = () => (load as unknown as () => SettingsData)();

beforeEach(() => {
  state.db = openDb(":memory:");
  state.e.ownerPassword = null;
});

describe("device tokens", () => {
  test("created token is returned once, verifies, and never appears in load data", async () => {
    const res = await post("create", { label: "  Desktop  " });
    expect(res.created?.label).toBe("Desktop");
    const token = res.created!.token;
    expect(verifyDeviceToken(state.db as never, token)).not.toBeNull();
    const d = data();
    expect(JSON.stringify(d)).not.toContain(token);
    expect(d.tokens).toHaveLength(1);
    expect(d.tokens[0]).toMatchObject({ label: "Desktop", revoked: false });
    expect(Object.keys(d.tokens[0]!).sort()).toEqual(["created", "id", "label", "revoked"]);
  });

  test("bad labels are rejected", async () => {
    for (const label of ["", "   ", "x".repeat(61), "bad\nlabel", "tab\there"]) {
      expect(await post("create", { label })).toMatchObject({ status: 400 });
    }
    expect(data().tokens).toHaveLength(0);
  });

  test("revoke marks revoked; a second revoke and bad ids give 400", async () => {
    const { id, token } = createDeviceToken(state.db as never, "laptop");
    expect(await post("revoke", { id: String(id) })).toEqual({ revoked: id });
    expect(verifyDeviceToken(state.db as never, token)).toBeNull();
    expect(data().tokens[0]!.revoked).toBe(true);
    expect(await post("revoke", { id: String(id) })).toMatchObject({ status: 400 });
    for (const bad of ["", "0", "-1", "1.5", "abc", "1e3"]) expect(await post("revoke", { id: bad })).toMatchObject({ status: 400 });
  });
});

describe("content and sign-in", () => {
  test("empty mirror shows an empty state", () => {
    expect(data().content).toEqual({ build: null, levelCap: null, resources: [] });
  });

  test("seeded mirror shows build, level cap and resources", () => {
    const db = state.db as ReturnType<typeof openDb>;
    db.insert(contentRecord).values({ resource: "meta", id: "current", build: "1.2", data: JSON.stringify({ build: "1.2", levelCap: 60 }), fetchedAt: 1 }).run();
    db.insert(syncState).values({ resource: "quests", build: "1.2", nextOffset: 0, total: 5, status: "complete", updatedAt: 1_800_000_000_000 }).run();
    expect(data().content).toEqual({
      build: "1.2",
      levelCap: 60,
      resources: [{ resource: "quests", build: "1.2", status: "complete", total: 5, updated: "15 Jan 2027" }],
    });
  });

  test("login mode flag", () => {
    expect(data().loginEnabled).toBe(false);
    state.e.ownerPassword = "x";
    expect(data().loginEnabled).toBe(true);
  });
});
