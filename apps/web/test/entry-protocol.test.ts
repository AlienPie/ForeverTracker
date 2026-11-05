import { describe, expect, test } from "vitest";
import { markPlainHttp, protocolHeader } from "../entry/protocol.js";

describe("server entry protocol defaults", () => {
  test("PROTOCOL_HEADER defaults to x-forwarded-proto and is written back for adapter-node", () => {
    const env: Record<string, string | undefined> = {};
    expect(protocolHeader(env)).toBe("x-forwarded-proto");
    expect(env.PROTOCOL_HEADER).toBe("x-forwarded-proto");
  });

  test("an explicit PROTOCOL_HEADER is kept (lowercased for header lookup)", () => {
    const env: Record<string, string | undefined> = { PROTOCOL_HEADER: "X-Scheme" };
    expect(protocolHeader(env)).toBe("x-scheme");
    expect(env.PROTOCOL_HEADER).toBe("X-Scheme");
  });

  test("a direct request (no proxy header) is marked as plain http", () => {
    const headers: Record<string, string | string[] | undefined> = { host: "127.0.0.1:3000" };
    markPlainHttp(headers, "x-forwarded-proto");
    expect(headers["x-forwarded-proto"]).toBe("http");
  });

  test("a proxy's https is never overwritten", () => {
    const headers: Record<string, string | string[] | undefined> = { "x-forwarded-proto": "https" };
    markPlainHttp(headers, "x-forwarded-proto");
    expect(headers["x-forwarded-proto"]).toBe("https");
  });

  test("an empty header counts as absent", () => {
    const headers: Record<string, string | string[] | undefined> = { "x-forwarded-proto": "" };
    markPlainHttp(headers, "x-forwarded-proto");
    expect(headers["x-forwarded-proto"]).toBe("http");
  });
});
