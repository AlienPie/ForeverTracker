import type { ServerLoad } from "@sveltejs/kit";
import type { CharacterCard } from "@ft/core";
import { characterOr404 } from "../../../../lib/server/character";

export type ProfessionsPageData = { professions: CharacterCard["professions"] };

export const load: ServerLoad = ({ params }): ProfessionsPageData => {
  const view = characterOr404(params.guid);
  return { professions: view.professions };
};
