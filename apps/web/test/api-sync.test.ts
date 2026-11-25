import { openDb } from "@ft/db";
import { readFileSync } from "node:fs";
import { getApiSnapshot, ingestSavedVariables } from "@ft/core";
import { describe, expect, test } from "vitest";
import { syncCharacterFromApi } from "../src/lib/server/api-sync";

const ROSTER = readFileSync(new URL("../../../packages/core/test/fixtures/Roster.lua", import.meta.url), "utf8");
const G = "Player-4321-00000A01";
const snap = { fetchedAt: 1, lastModified: null, level: 3, completed: [1], inLog: [], professions: [], reputations: [], spec: null, talents: [] };
const creds = { clientId: "a", clientSecret: "b", region: "eu" };
const db = () => {
  const d = openDb(":memory:");
  ingestSavedVariables(d, ROSTER, () => 1_800_000_000);
  return d;
};

describe("syncCharacterFromApi", () => {
  test("stores the profile and says ok", async () => {
    const d = db();
    let asked = "";
    const r = await syncCharacterFromApi(d, { guid: G, name: "Merrowyn", surname: "Stoneback" }, creds, async (slug) => ((asked = slug), snap));
    expect(r).toBe("ok");
    expect(asked).toBe("merrowyn-stoneback");
    expect(getApiSnapshot(d, G)!.completed).toEqual([1]);
  });
  test("nocreds without a client, noslug without a surname, none for no profile, error on failure", async () => {
    const d = db();
    expect(await syncCharacterFromApi(d, { guid: G, name: "M", surname: "S" }, null)).toBe("nocreds");
    expect(await syncCharacterFromApi(d, { guid: G, name: "M", surname: null }, creds, async () => snap)).toBe("noslug");
    expect(await syncCharacterFromApi(d, { guid: G, name: "M", surname: "S" }, creds, async () => null)).toBe("none");
    expect(
      await syncCharacterFromApi(d, { guid: G, name: "M", surname: "S" }, creds, async () => {
        throw new Error("boom");
      }),
    ).toBe("error");
    expect(getApiSnapshot(d, G)).toBeNull();
  });
});
