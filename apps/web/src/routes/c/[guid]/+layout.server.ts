import type { ServerLoad } from "@sveltejs/kit";
import type { CharacterCard } from "@ft/core";
import { characterOr404 } from "../../../lib/server/character";
import { env } from "../../../lib/server/env";

export type CharacterLayoutData = {
  /** Header fields only; the raw snapshot stays on the server. */
  character: CharacterCard;
  /** Server clock (unix seconds) the sync label is computed against. */
  now: number;
  /** Blizzard profile status, or null when none was fetched. */
  api: { fetchedAt: number; lastModified: number | null; source: "api" | "addon"; newerCompleted: number; onlyInAddon: number } | null;
  /** The Blizzard client is configured and the character has a surname, so the sync button can work. */
  canApiSync: boolean;
};

export const load: ServerLoad = ({ params }): CharacterLayoutData => {
  const now = Math.floor(Date.now() / 1000);
  const v = characterOr404(params.guid, now, { events: false });
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
  const a = v.api;
  return {
    character,
    now,
    api: a && { fetchedAt: a.fetchedAt, lastModified: a.lastModified, source: a.source, newerCompleted: a.newerCompleted, onlyInAddon: a.onlyInAddon },
    canApiSync: env().blizzard !== null && v.surname !== null,
  };
};
