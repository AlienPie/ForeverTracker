import type { ServerLoad } from "@sveltejs/kit";
import type { CharacterCard } from "@ft/core";
import { characterOr404 } from "../../../lib/server/character";

export type CharacterLayoutData = {
  /** Header fields only; the raw snapshot stays on the server. */
  character: CharacterCard;
  /** Server clock (unix seconds) the sync label is computed against. */
  now: number;
};

export const load: ServerLoad = ({ params }): CharacterLayoutData => {
  const now = Math.floor(Date.now() / 1000);
  const v = characterOr404(params.guid, now);
  const character: CharacterCard = {
    guid: v.guid,
    name: v.name,
    surname: v.surname,
    class: v.class,
    race: v.race,
    level: v.level,
    xpPct: v.xpPct,
    zone: v.zone,
    money: v.money,
    playedSeconds: v.playedSeconds,
    takenAt: v.takenAt,
    syncedAgo: v.syncedAgo,
    professions: v.professions,
    questsCompleted: v.questsCompleted,
    unsupported: v.unsupported,
  };
  return { character, now };
};
