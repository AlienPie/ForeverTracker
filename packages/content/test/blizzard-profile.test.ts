import { describe, expect, test } from "vitest";
import { BlizzardError, createBlizzardClient, parseProfile, profileSlug } from "../src/index";

const parts = {
  profile: { level: 20 },
  quests: { in_progress: [{ id: 471, name: "A" }, { id: 971, name: "B" }] },
  completed: { quests: [{ id: 233, name: "x" }, { id: 94503, name: "y" }, { id: 233, name: "dup" }] },
  professions: {
    primaries: [{ profession: { id: 165, name: "Leatherworking" }, tiers: [{ skill_points: 103, max_skill_points: 150, known_recipes: [{ id: 2162 }, { id: 1356 }] }] }],
    secondaries: [{ profession: { id: 185, name: "Cooking" }, tiers: [{ skill_points: 113, max_skill_points: 150 }] }],
  },
  reputations: { reputations: [{ faction: { id: 47, name: "Ironforge" }, standing: { tier: 5, name: "Honored", value: 1607, max: 12000 } }] },
  specializations: {
    specialization_groups: [
      { is_active: false, specializations: [] },
      { is_active: true, specializations: [{ specialization: { name: "Enhancement" }, talents: [{ talent: { id: 134214, name: "Thundering Strikes" }, talent_rank: 5 }] }] },
    ],
  },
};

describe("parseProfile", () => {
  test("reduces the profile documents", () => {
    const s = parseProfile(parts, 1000, 900);
    expect(s).toMatchObject({ fetchedAt: 1000, lastModified: 900, level: 20, completed: [233, 94503], inLog: [471, 971], spec: "Enhancement" });
    expect(s.professions).toEqual([
      { id: 165, name: "Leatherworking", skill: 103, max: 150, recipeIds: [1356, 2162] },
      { id: 185, name: "Cooking", skill: 113, max: 150, recipeIds: [] },
    ]);
    expect(s.reputations).toEqual([{ id: 47, name: "Ironforge", tier: 5, tierName: "Honored", value: 1607, max: 12000 }]);
    expect(s.talents).toEqual([{ id: 134214, name: "Thundering Strikes", rank: 5 }]);
  });
  test("odd or missing parts give empty lists and never throw", () => {
    const s = parseProfile({ profile: null, quests: "x", completed: { quests: [{ id: "a" }, null] } }, 5);
    expect(s).toMatchObject({ level: null, completed: [], inLog: [], professions: [], reputations: [], spec: null, talents: [], lastModified: null });
  });
});

describe("profileSlug", () => {
  test("lower-cased name and surname, null when either is missing", () => {
    expect(profileSlug("Tripilix", "Sparkblade")).toBe("tripilix-sparkblade");
    expect(profileSlug("Tripilix", null)).toBeNull();
    expect(profileSlug(null, "x")).toBeNull();
  });
});

describe("createBlizzardClient", () => {
  const mk = (handler: (url: string, n: number) => Response) => {
    const calls: string[] = [];
    const fetcher = (async (input: string | URL | Request) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("oauth.battle.net")) return new Response(JSON.stringify({ access_token: "T", expires_in: 3600 }));
      return handler(url, calls.length);
    }) as typeof fetch;
    return { calls, client: createBlizzardClient({ clientId: "id", clientSecret: "s", fetch: fetcher, sleep: async () => {}, now: () => 1_000_000 }) };
  };
  const json = (b: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(b), { headers });

  test("fetches the six documents and returns the reduced snapshot", async () => {
    const { client, calls } = mk((url) => {
      if (url.includes("/quests/completed")) return json(parts.completed);
      if (url.includes("/quests")) return json(parts.quests);
      if (url.includes("/professions")) return json(parts.professions);
      if (url.includes("/specializations")) return json(parts.specializations);
      if (url.includes("/reputations")) return json(parts.reputations);
      return json(parts.profile, { "last-modified": "Thu, 01 Jan 1970 00:15:00 GMT" });
    });
    const s = await client.fetchCharacter("a-b");
    expect(s).toMatchObject({ level: 20, completed: [233, 94503], lastModified: 900 });
    expect(calls.filter((u) => u.includes("api.blizzard.com")).every((u) => u.includes("namespace=profile-forever-eu"))).toBe(true);
    expect(calls.filter((u) => u.includes("oauth")).length).toBe(1);
  });
  test("a 404 profile is null", async () => {
    const { client } = mk(() => new Response("{}", { status: 404 }));
    expect(await client.fetchCharacter("a-b")).toBeNull();
  });
  test("a 429 is retried, a server error throws", async () => {
    const first = mk((_url, n) => (n === 2 ? new Response("", { status: 429, headers: { "retry-after": "1" } }) : json({ level: 3 })));
    expect((await first.client.fetchCharacter("a-b"))?.level).toBe(3);
    const bad = mk(() => new Response("", { status: 500 }));
    await expect(bad.client.fetchCharacter("a-b")).rejects.toBeInstanceOf(BlizzardError);
  });
});
