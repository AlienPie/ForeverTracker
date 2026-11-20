import {
  classAllowsTagged,
  learnedNames,
  professionOfQuestTagged,
  professionVerdict,
  raceAllows,
  slotsUsed,
  type CharacterCard,
  type ProfessionInfo,
  type QuestRow,
  type TagIndex,
} from "@ft/core";

export type UsableInput = {
  tags?: TagIndex;
  professionCatalog?: ProfessionInfo[];
  /** The character's learned professions (`CharacterView.professions`). */
  professions?: CharacterCard["professions"] | null;
  classToken?: string | null;
  raceToken?: string | null;
  completed: Set<number>;
  inLog: Set<number>;
};

export type UnavailableReason = "class" | "race" | "profession";

/**
 * Why the character cannot take a quest, by the curated tags, or null when it can. A quest done or
 * in the log is never unavailable. A profession quest stays available when the profession is learned
 * or a slot is free. With no tags nothing is unavailable.
 */
export function unavailableReason(input: UsableInput): (q: QuestRow) => UnavailableReason | null {
  const { tags } = input;
  if (!tags || !tags.hasTags) return () => null;
  const catalog = input.professionCatalog ?? [];
  const learned = learnedNames(input.professions);
  const used = slotsUsed(learned, catalog);
  return (q) => {
    if (input.completed.has(q.id) || input.inLog.has(q.id)) return null;
    if (!classAllowsTagged(q, input.classToken, tags)) return "class";
    if (!raceAllows(tags.racesOf(q.id), input.raceToken)) return "race";
    const prof = professionOfQuestTagged(q, catalog, tags);
    if (!prof) return null;
    const verdict = professionVerdict(prof, learned, used);
    return verdict !== null && !verdict.allowed ? "profession" : null;
  };
}

/** `usable(q)` for `chainDetail`, `chainProgress`: true unless `unavailableReason` gives a reason. */
export function buildUsable(input: UsableInput): (q: QuestRow) => boolean {
  const why = unavailableReason(input);
  return (q) => why(q) === null;
}
