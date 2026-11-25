/** What the app keeps from Blizzard's public character profile (`profile-forever-<region>`), for characters of level 10 and up. */
export type ApiProfession = { id: number; name: string; skill: number; max: number; recipeIds: number[] };
export type ApiReputation = { id: number; name: string; tier: number; tierName: string; value: number; max: number };
export type ApiTalent = { id: number; name: string; rank: number };
export type ApiSnapshot = {
  /** When this app fetched it (unix seconds). */
  fetchedAt: number;
  /** The profile's `last-modified` header (the last logout), unix seconds, when given. */
  lastModified: number | null;
  level: number | null;
  completed: number[];
  inLog: number[];
  professions: ApiProfession[];
  reputations: ApiReputation[];
  /** Talents of the active specialization, with ranks. */
  spec: string | null;
  talents: ApiTalent[];
};

export type ProfileParts = {
  profile?: unknown;
  quests?: unknown;
  completed?: unknown;
  professions?: unknown;
  specializations?: unknown;
  reputations?: unknown;
};

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const int = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) ? v : null);
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const ids = (v: unknown): number[] => [...new Set(arr(v).flatMap((q) => (isObj(q) && int(q.id) !== null && int(q.id)! > 0 ? [int(q.id)!] : [])))].sort((a, b) => a - b);

/** Reduce the six profile documents to an {@link ApiSnapshot}; missing or odd parts give empty lists. Never throws. */
export function parseProfile(parts: ProfileParts, fetchedAt: number, lastModified: number | null = null): ApiSnapshot {
  const profile = isObj(parts.profile) ? parts.profile : {};
  const quests = isObj(parts.quests) ? parts.quests : {};
  const completed = isObj(parts.completed) ? parts.completed : {};

  const professions: ApiProfession[] = [];
  const profDoc = isObj(parts.professions) ? parts.professions : {};
  for (const group of [arr(profDoc.primaries), arr(profDoc.secondaries)]) {
    for (const p of group) {
      if (!isObj(p) || !isObj(p.profession)) continue;
      const id = int(p.profession.id);
      const name = text(p.profession.name);
      if (id === null || name === null) continue;
      const tier = arr(p.tiers).find(isObj) as Obj | undefined;
      professions.push({
        id,
        name,
        skill: int(tier?.skill_points) ?? 0,
        max: int(tier?.max_skill_points) ?? 0,
        recipeIds: ids(tier?.known_recipes),
      });
    }
  }

  const reputations: ApiReputation[] = [];
  const repDoc = isObj(parts.reputations) ? parts.reputations : {};
  for (const r of arr(repDoc.reputations)) {
    if (!isObj(r) || !isObj(r.faction) || !isObj(r.standing)) continue;
    const id = int(r.faction.id);
    const name = text(r.faction.name);
    if (id === null || name === null) continue;
    reputations.push({
      id,
      name,
      tier: int(r.standing.tier) ?? 0,
      tierName: text(r.standing.name) ?? "",
      value: int(r.standing.value) ?? 0,
      max: int(r.standing.max) ?? 0,
    });
  }

  let spec: string | null = null;
  const talents: ApiTalent[] = [];
  const specDoc = isObj(parts.specializations) ? parts.specializations : {};
  const group = arr(specDoc.specialization_groups).find((g) => isObj(g) && g.is_active === true) ?? arr(specDoc.specialization_groups)[0];
  const active = isObj(group) ? arr(group.specializations).find(isObj) : undefined;
  if (isObj(active)) {
    spec = isObj(active.specialization) ? text(active.specialization.name) : null;
    for (const t of arr(active.talents)) {
      if (!isObj(t) || !isObj(t.talent)) continue;
      const id = int(t.talent.id);
      const name = text(t.talent.name);
      if (id !== null && name !== null) talents.push({ id, name, rank: int(t.talent_rank) ?? 1 });
    }
  }

  return {
    fetchedAt,
    lastModified,
    level: int(profile.level),
    completed: ids(completed.quests),
    inLog: ids(quests.in_progress),
    professions,
    reputations,
    spec,
    talents,
  };
}

/** The profile path of a character: lower-cased first name and surname joined by a dash, no realm. Null when either is missing. */
export function profileSlug(name: string | null, surname: string | null): string | null {
  const n = name?.trim().toLowerCase();
  const s = surname?.trim().toLowerCase();
  return n && s ? `${n}-${s}` : null;
}

export type BlizzardClientOptions = {
  clientId: string;
  clientSecret: string;
  region?: string;
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

export class BlizzardError extends Error {
  constructor(message: string, readonly status: number | null = null) {
    super(message);
    this.name = "BlizzardError";
  }
}

const SPACING_MS = 20; // 50 requests a second; Blizzard allows 100

/** Client for the Forever profile API (client credentials; a token is kept until it nears expiry; requests are spaced and a 429 is retried). */
export function createBlizzardClient(opts: BlizzardClientOptions) {
  const region = opts.region ?? "eu";
  const doFetch = opts.fetch ?? fetch;
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((ok) => setTimeout(ok, ms)));
  let token: { value: string; expires: number } | null = null;
  let nextSlot = 0;

  async function accessToken(): Promise<string> {
    if (token && now() < token.expires - 60_000) return token.value;
    const res = await doFetch("https://oauth.battle.net/token", {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${opts.clientId}:${opts.clientSecret}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    if (!res.ok) throw new BlizzardError(`Blizzard token request failed (HTTP ${res.status})`, res.status);
    const body = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!body.access_token) throw new BlizzardError("Blizzard token response had no access_token");
    token = { value: body.access_token, expires: now() + (body.expires_in ?? 3600) * 1000 };
    return token.value;
  }

  /** GET a profile path; null for a 404 (no such character, or below level 10). */
  async function get(path: string): Promise<{ body: unknown; lastModified: number | null } | null> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const t = now();
      nextSlot = Math.max(nextSlot, t) + SPACING_MS;
      const wait = nextSlot - SPACING_MS - t;
      if (wait > 0) await sleep(wait);
      const res = await doFetch(`https://${region}.api.blizzard.com${path}?namespace=profile-forever-${region}&locale=en_GB`, {
        headers: { authorization: `Bearer ${await accessToken()}` },
      });
      if (res.status === 429) {
        await sleep(Math.min(Number(res.headers.get("retry-after")) || 1, 30) * 1000);
        continue;
      }
      if (res.status === 404) return null;
      if (!res.ok) throw new BlizzardError(`Blizzard profile request failed (HTTP ${res.status})`, res.status);
      const lm = res.headers.get("last-modified");
      const ms = lm ? Date.parse(lm) : NaN;
      return { body: await res.json(), lastModified: Number.isNaN(ms) ? null : Math.floor(ms / 1000) };
    }
    throw new BlizzardError("Blizzard is rate limiting requests; try again in a minute", 429);
  }

  return {
    /** The reduced profile of one character, or null when Blizzard has none (below level 10 or a wrong name). */
    async fetchCharacter(slug: string): Promise<ApiSnapshot | null> {
      const base = `/profile/wow/character/${encodeURIComponent(slug)}`;
      const profile = await get(base);
      if (!profile) return null;
      const [quests, completed, professions, specializations, reputations] = await Promise.all(
        ["/quests", "/quests/completed", "/professions", "/specializations", "/reputations"].map((p) => get(base + p)),
      );
      return parseProfile(
        {
          profile: profile.body,
          quests: quests?.body,
          completed: completed?.body,
          professions: professions?.body,
          specializations: specializations?.body,
          reputations: reputations?.body,
        },
        Math.floor(now() / 1000),
        profile.lastModified,
      );
    },
  };
}
