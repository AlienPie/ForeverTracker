export type Unavailable = { unavailable: true; reason: string };
export type Maybe<T> = T | Unavailable;

/**
 * Documentation types. The Lua parser turns contiguous 1..n integer keys into
 * arrays, so Record<string, number> shapes are indicative only; ingest stores
 * raw JSON and reads only `identity`.
 */
export type Snapshot = {
  takenAt: number;
  build: string;
  identity: Maybe<{
    name: string;
    surname?: string;
    class: string;
    race: string;
    faction: string;
    level: number;
    xp: number;
    xpMax: number;
  }>;
  /** `at` = unix time the values were measured (played may be stale by now - at) */
  time: Maybe<{ played: number; playedLevel: number; at?: number }>;
  state: Maybe<{
    zone: string;
    subzone: string;
    mapId: number;
    x: number;
    y: number;
    money: number;
    /** keyed by slot NAME (e.g. "HeadSlot"), value is item id */
    equipped: Record<string, number>;
  }>;
  progress: Maybe<{
    talents: Maybe<{ nodes: Record<string, number>; unspent: number }>;
    professions: Maybe<{ skillLine: number; name: string; rank: number; max: number }[]>;
    questsCompleted: Maybe<number[]>;
    questLog: Maybe<{ id: number }[]>;
  }>;
  exploration: Maybe<{
    visited: { mapId: number; subzone: string; firstSeen: number }[];
    taxi?: number[];
  }>;
};

export const SUPPORTED_SCHEMA = 1;
