import type { CharacterCard } from "../read/character";
import type { ProfessionInfo, QuestRow } from "./content";

/** One "next up" recommendation; `reason` says what and where using only mirrored data. */
export type Suggestion = {
  kind: "chain" | "area" | "profession" | "next-level";
  title: string;
  questId?: number;
  level: number;
  reason: string;
  source: "ForeverDB";
  confidence: "high" | "low";
};

export type NextUpInput = {
  level: number;
  /** Character's zone name from the snapshot (e.g. "Anvilmar"); matched case-insensitively to `quest.zone.n`. */
  zone: string | null;
  /**
   * Optional uiMapId of the character's current map. When set, a place quest also counts as
   * same-area when its `zone.m` equals it (never by the starter's map alone).
   */
  mapId?: number | null;
  /**
   * Character class token from the snapshot (`CharacterCard.class`, e.g. "SHAMAN"; any case).
   * Class quests (`zone.n` is a class name) are only suggested when it matches; when null or
   * omitted, no class quest is suggested.
   */
  classToken?: string | null;
  completed: Set<number>;
  inLog: Set<number>;
  quests: QuestRow[];
  levelCap: number | null;
  /**
   * The character's learned professions from the snapshot (names in the game's locale, matched
   * case-insensitively, trimmed). Only used with `professionCatalog`.
   */
  professions: CharacterCard["professions"];
  /**
   * The mirrored `professions` catalog (`loadProfessions`). When given and non-empty, the
   * INTERIM profession-quest rule applies (see `nextUp`); when omitted, behaviour is unchanged.
   */
  professionCatalog?: ProfessionInfo[];
};

export type ChainProgress = {
  /** Id of the chain's root (first) quest. */
  chain: number;
  /** Name of the root quest. */
  name: string;
  /** Members completed. */
  done: number;
  /** Members in the chain (among the quests passed in). */
  total: number;
  /** 0-based position, in chain order, of the first member not completed; null when none. */
  currentIndex: number | null;
  complete: boolean;
};
