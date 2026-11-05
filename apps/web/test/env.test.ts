import { describe, expect, test } from "vitest";
import { readEnv } from "../src/lib/server/env";

describe("readEnv", () => {
  test("throws on a bad CONTENT_MODE", () => {
    expect(() => readEnv({ CONTENT_MODE: "bogus" })).toThrow(/CONTENT_MODE/);
  });

  test("defaults: mirror mode, no secrets", () => {
    const e = readEnv({});
    expect(e.contentMode).toBe("mirror");
    expect(e.ownerPassword).toBeNull();
    expect(e.sessionSecret).toBeNull();
  });

  test("reads owner password and session secret", () => {
    const e = readEnv({ OWNER_PASSWORD: "x", SESSION_SECRET: "y" });
    expect(e.ownerPassword).toBe("x");
    expect(e.sessionSecret).toBe("y");
  });
});
