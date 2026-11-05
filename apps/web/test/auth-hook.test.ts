import type { RequestEvent } from "@sveltejs/kit";
import { beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  e: {
    contentMode: "mirror",
    ownerPassword: null as string | null,
    sessionSecret: null as string | null,
    allowedHosts: [] as string[],
  },
}));
vi.mock("../src/lib/server/env", () => ({ env: () => state.e }));

import { handle, init } from "../src/hooks.server";
import { actions } from "../src/routes/login/+page.server";
import * as logoutMod from "../src/routes/logout/+server";
import { signSession } from "../src/lib/server/session";

function cookiesStub(value?: string) {
  return { get: vi.fn(() => value), set: vi.fn(), delete: vi.fn() };
}

// A 32-character fake secret (init() requires at least 32).
const SECRET = "test-fake-session-secret-0123456";

function hookEvent(path: string, cookie?: string, host = "x") {
  const cookies = cookiesStub(cookie);
  const url = new URL(`http://${host}${path}`);
  return { url, cookies, locals: {} as { authed?: boolean }, request: new Request(url) };
}

async function run(path: string, cookie?: string, host?: string) {
  const ev = hookEvent(path, cookie, host);
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
  state.e.sessionSecret = SECRET;
  state.e.allowedHosts = [];
});

describe("init", () => {
  test("throws naming SESSION_SECRET when password set without secret", () => {
    state.e.sessionSecret = null;
    expect(() => init()).toThrow(/SESSION_SECRET/);
  });
  test("throws when SESSION_SECRET is shorter than 32 characters, suggesting openssl", () => {
    state.e.sessionSecret = "x".repeat(31);
    expect(() => init()).toThrow(/SESSION_SECRET/);
    expect(() => init()).toThrow(/openssl rand -base64 32/);
    state.e.sessionSecret = "x".repeat(32);
    expect(() => init()).not.toThrow();
  });
  test("a short secret is fine in open mode (it is unused)", () => {
    state.e.ownerPassword = null;
    state.e.sessionSecret = "short";
    expect(() => init()).not.toThrow();
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
    for (const p of ["/login", "/api/ingest", "/api/health", "/_app/immutable/x.js", "/_app/version.json", "/favicon.ico"]) {
      const { res, resolve } = await run(p);
      expect(res.status).toBe(200);
      expect(resolve).toHaveBeenCalled();
    }
  });

  test("does not treat look-alike paths as public", async () => {
    for (const p of ["/login-x", "/api/ingest/../x", "/api/healthz", "/_app/remote/x", "/_app/env.js", "/_app/version.jsonx", "/_app/immutablex/a.js"]) {
      const { res } = await run(p);
      expect(res.status).toBe(303);
    }
  });

  test("passes an authenticated request and sets locals.authed", async () => {
    const { res, ev } = await run("/", signSession(SECRET));
    expect(res.status).toBe(200);
    expect(ev.locals.authed).toBe(true);
  });

  test("bad cookie is rejected", async () => {
    const { res, ev } = await run("/", signSession("wrong"));
    expect(res.status).toBe(303);
    expect(ev.locals.authed).toBe(false);
  });

  test("password set without a secret fails closed with 500, never open mode", async () => {
    state.e.sessionSecret = null;
    const { res, resolve, ev } = await run("/anything", undefined, "localhost");
    expect(res.status).toBe(500);
    expect(resolve).not.toHaveBeenCalled();
    expect(ev.locals.authed).not.toBe(true);
  });

  test("password mode is not host-restricted", async () => {
    const r1 = await run("/", undefined, "evil.example:3000");
    expect(r1.res.status).toBe(303);
    const r2 = await run("/", signSession(SECRET), "evil.example:3000");
    expect(r2.res.status).toBe(200);
  });
});

describe("open mode", () => {
  beforeEach(() => {
    state.e.ownerPassword = null;
    state.e.sessionSecret = null;
  });

  test("lets everything through on a loopback host name", async () => {
    for (const host of ["localhost", "localhost:3000", "127.0.0.1:3000", "[::1]:3000", "foo.localhost:3000", "LOCALHOST"]) {
      const { res, ev, resolve } = await run("/anything", undefined, host);
      expect(res.status, host).toBe(200);
      expect(resolve).toHaveBeenCalled();
      expect(ev.locals.authed).toBe(true);
    }
  });

  test("rejects any other host name with 403 (DNS rebinding)", async () => {
    for (const host of ["evil.example:3000", "x", "localhost.evil.example", "127.0.0.2", "192.168.1.5:3000", "evillocalhost"]) {
      for (const path of ["/", "/settings", "/c/abc/quests", "/_app/immutable/x.js"]) {
        const { res, resolve } = await run(path, undefined, host);
        expect(res.status, `${host}${path}`).toBe(403);
        expect(resolve).not.toHaveBeenCalled();
      }
    }
  });

  test("ALLOWED_HOSTS extends the loopback list", async () => {
    state.e.allowedHosts = ["tracker.lan", "nas"];
    expect((await run("/", undefined, "tracker.lan:3000")).res.status).toBe(200);
    expect((await run("/", undefined, "NAS")).res.status).toBe(200);
    expect((await run("/", undefined, "localhost")).res.status).toBe(200);
    expect((await run("/", undefined, "evil.example")).res.status).toBe(403);
    expect((await run("/", undefined, "sub.tracker.lan")).res.status).toBe(403);
  });

  test("/api/ingest and /api/health are exempt from the host check", async () => {
    for (const path of ["/api/ingest", "/api/health"]) {
      const { res, resolve } = await run(path, undefined, "evil.example:3000");
      expect(res.status, path).toBe(200);
      expect(resolve).toHaveBeenCalled();
    }
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
