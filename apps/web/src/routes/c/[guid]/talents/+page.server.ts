import type { ServerLoad } from "@sveltejs/kit";
import { characterOr404 } from "../../../../lib/server/character";

export type TalentsPageData = { level: number | null; talents: { unspent: number } | null };

export const load: ServerLoad = ({ params }): TalentsPageData => {
  const view = characterOr404(params.guid);
  return { level: view.level, talents: view.talents };
};
