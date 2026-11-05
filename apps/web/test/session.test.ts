import { describe, expect, test } from "vitest";
import { checkPassword, safeNext, signSession, verifySession } from "../src/lib/server/session";

const NOW = 1_800_000_000_000;

describe("session cookie", () => {
  test("round trip", () => {
    expect(verifySession("s3cret", signSession("s3cret", NOW), NOW)).toBe(true);
  });

  test("tampered signature, tampered expiry, wrong secret fail", () => {
    const c = signSession("s3cret", NOW);
    const [exp, sig] = c.split(".");
    expect(verifySession("s3cret", `${exp}.${sig!.slice(0, -2)}AA`, NOW)).toBe(false);
    expect(verifySession("s3cret", `${Number(exp) + 1000}.${sig}`, NOW)).toBe(false);
    expect(verifySession("other", c, NOW)).toBe(false);
  });

  test("expired cookie fails; valid just before 30 days", () => {
    const c = signSession("s3cret", NOW);
    const day = 86_400_000;
    expect(verifySession("s3cret", c, NOW + 30 * day - 1000)).toBe(true);
    expect(verifySession("s3cret", c, NOW + 30 * day + 1000)).toBe(false);
  });

  test("malformed or missing values return false without throwing", () => {
    for (const v of [undefined, "", "abc", ".", "1.", ".x", "a.b.c", "99999999999.%%%", "x".repeat(5000)]) {
      expect(verifySession("s3cret", v, NOW)).toBe(false);
    }
  });
});

describe("checkPassword", () => {
  test("right, wrong, empty, different lengths", () => {
    expect(checkPassword("hunter2", "hunter2")).toBe(true);
    expect(checkPassword("hunter2", "hunter3")).toBe(false);
    expect(checkPassword("hunter2", "")).toBe(false);
    expect(checkPassword("hunter2", "hunter2-and-more")).toBe(false);
    expect(checkPassword("hunter2", "h")).toBe(false);
  });
});

describe("safeNext", () => {
  test("accepts same-origin paths", () => {
    expect(safeNext("/characters?x=1")).toBe("/characters?x=1");
    expect(safeNext("/")).toBe("/");
  });
  test("rejects everything else", () => {
    for (const v of ["//evil.com", "https://evil.com", "/\\evil.com", "evil.com", "", null, undefined, "javascript:alert(1)"]) {
      expect(safeNext(v)).toBe("/");
    }
  });
});
