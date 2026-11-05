import type { RequestEvent } from "@sveltejs/kit";
import { beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  e: { contentMode: "mirror", ownerPassword: null as string | null, sessionSecret: null as string | null },
}));
vi.mock("../src/lib/server/env", () => ({ env: () => state.e }));

import { handle, init } from "../src/hooks.server";
import { actions } from "../src/routes/login/+page.server";
import * as logoutMod from "../src/routes/logout/+server";
import { signSession } from "../src/lib/server/session";

function cookiesStub(value?: string) {
  return { get: vi.fn(() => value), set: vi.fn(), delete: vi.fn() };
}

function hookEvent(path: string, cookie?: string) {
  const cookies = cookiesStub(cookie);
  const url = new URL(`http://x${path}`);
  return { url, cookies, locals: {} as { authed?: boolean }, request: new Request(url) };
}

async function run(path: string, cookie?: string) {
  const ev = hookEvent(path, cookie);
  const resolve = vi.fn(async () => new Response("ok"));
  const res = await handle({ event: ev as unknown as RequestEvent, resolve } as never);
  return { res, resolve, ev };
}

async function expectRedirect(p: unknown) {
  try {
    await p;
  } catch (e) {
    return e as { status: number; location: string };
  }
  throw new Error("expected redirect");
}

function loginEvent(fields: Record<string, string>, query = "") {
  const body = new URLSearchParams(fields);
  const cookies = cookiesStub();
  const url = new URL(`http://x/login${query}`);
  const request = new Request(url, { method: "POST", body });
  return { ev: { request, cookies, url } as unknown as Parameters<NonNullable<typeof actions.default>>[0], cookies };
}

beforeEach(() => {
  state.e.ownerPassword = "pw";
  state.e.sessionSecret = "sec";
});

describe("init", () => {
  test("throws naming SESSION_SECRET when password set without secret", () => {
    state.e.sessionSecret = null;
    expect(() => init()).toThrow(/SESSION_SECRET/);
  });
  test("ok when both or neither set", () => {
    expect(() => init()).not.toThrow();
    state.e.ownerPassword = null;
    state.e.sessionSecret = null;
    expect(() => init()).not.toThrow();
  });
});

describe("auth hook", () => {
  test("redirects unauthenticated page request to /login?next=", async () => {
    const { res, resolve } = await run("/characters?a=1");
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/login?next=%2Fcharacters%3Fa%3D1");
    expect(resolve).not.toHaveBeenCalled();
  });

  test("lets public paths and assets through", async () => {
    for (const p of ["/login", "/api/ingest", "/api/health", "/_app/immutable/x.js", "/favicon.ico"]) {
      const { res, resolve } = await run(p);
      expect(res.status).toBe(200);
      expect(resolve).toHaveBeenCalled();
    }
  });

  test("does not treat look-alike paths as public", async () => {
    for (const p of ["/login-x", "/api/ingest/../x", "/api/healthz"]) {
      const { res } = await run(p);
      expect(res.status).toBe(303);
    }
  });

  test("passes an authenticated request and sets locals.authed", async () => {
    const { res, ev } = await run("/", signSession("sec"));
    expect(res.status).toBe(200);
    expect(ev.locals.authed).toBe(true);
  });

  test("bad cookie is rejected", async () => {
    const { res, ev } = await run("/", signSession("wrong"));
    expect(res.status).toBe(303);
    expect(ev.locals.authed).toBe(false);
  });

  test("open mode lets everything through", async () => {
    state.e.ownerPassword = null;
    state.e.sessionSecret = null;
    const { res, ev } = await run("/anything");
    expect(res.status).toBe(200);
    expect(ev.locals.authed).toBe(true);
  });
});

describe("login action", () => {
  test("wrong password returns 400 and sets no cookie", async () => {
    const { ev, cookies } = loginEvent({ password: "nope" });
    const r = (await actions.default(ev)) as { status: number; data: { error: string } };
    expect(r.status).toBe(400);
    expect(r.data.error).toBe("Wrong password");
    expect(cookies.set).not.toHaveBeenCalled();
  });

  test("correct password sets cookie and redirects to next", async () => {
    const { ev, cookies } = loginEvent({ password: "pw", next: "/characters" });
    const r = await expectRedirect(actions.default(ev));
    expect(r.status).toBe(303);
    expect(r.location).toBe("/characters");
    expect(cookies.set).toHaveBeenCalledTimes(1);
    const [name, value, opts] = cookies.set.mock.calls[0] as unknown as [string, string, Record<string, unknown>];
    expect(name).toBe("ft_session");
    expect(value).toMatch(/^\d+\.[\w-]+$/);
    expect(opts).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", secure: false, maxAge: 60 * 60 * 24 * 30 });
  });

  test.each(["//evil.com", "https://evil.com", "/\\evil.com"])("next=%s falls back to /", async (next) => {
    const { ev } = loginEvent({ password: "pw", next });
    expect((await expectRedirect(actions.default(ev))).location).toBe("/");
  });
});

describe("logout", () => {
  test("POST clears cookie and redirects to /login", async () => {
    const cookies = cookiesStub();
    const r = await expectRedirect(Promise.resolve().then(() => logoutMod.POST({ cookies } as never)));
    expect(r.status).toBe(303);
    expect(r.location).toBe("/login");
    expect(cookies.delete).toHaveBeenCalledWith("ft_session", { path: "/", secure: false });
  });
  test("no GET handler", () => {
    expect("GET" in logoutMod).toBe(false);
  });
});
