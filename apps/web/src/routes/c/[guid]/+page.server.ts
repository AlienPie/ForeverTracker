import { redirect, type ServerLoad } from "@sveltejs/kit";

/** The character page opens on the Quests tab. */
export const load: ServerLoad = ({ params }) => {
  redirect(303, `/c/${encodeURIComponent(params.guid ?? "")}/quests`);
};
