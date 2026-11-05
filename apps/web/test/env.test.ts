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

  test("ALLOWED_HOSTS: empty by default, comma-separated, trimmed, lower-cased", () => {
    expect(readEnv({}).allowedHosts).toEqual([]);
    expect(readEnv({ ALLOWED_HOSTS: "" }).allowedHosts).toEqual([]);
    expect(readEnv({ ALLOWED_HOSTS: " Tracker.LAN , ,nas," }).allowedHosts).toEqual(["tracker.lan", "nas"]);
  });

  test("tooltip provider defaults to none, empty string too", () => {
    expect(readEnv({}).tooltipProvider).toBe("none");
    expect(readEnv({ TOOLTIP_PROVIDER: "" }).tooltipProvider).toBe("none");
  });

  test("accepts valid tooltip providers", () => {
    for (const p of ["none", "wowhead", "foreverdb"] as const) {
      expect(readEnv({ TOOLTIP_PROVIDER: p }).tooltipProvider).toBe(p);
    }
  });

  test("throws on a bad TOOLTIP_PROVIDER", () => {
    expect(() => readEnv({ TOOLTIP_PROVIDER: "bogus" })).toThrow(/TOOLTIP_PROVIDER/);
  });
});
