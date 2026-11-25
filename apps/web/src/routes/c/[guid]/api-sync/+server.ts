import { redirect, type RequestHandler } from "@sveltejs/kit";
import { characterOr404 } from "../../../../lib/server/character";
import { getDb } from "../../../../lib/server/db";
import { env } from "../../../../lib/server/env";
import { syncCharacterFromApi } from "../../../../lib/server/api-sync";

/** POST: fetch the character's Blizzard profile, then go back to the page the button was on with the outcome in `?apisync=`. */
export const POST: RequestHandler = async ({ params, request }) => {
  const view = characterOr404(params.guid, undefined, { events: false });
  const result = await syncCharacterFromApi(getDb(), { guid: view.guid, name: view.name, surname: view.surname }, env().blizzard);
  const back = new URL(request.headers.get("referer") ?? `/c/${encodeURIComponent(view.guid)}/journey`, request.url);
  const path = back.origin === new URL(request.url).origin ? back.pathname : `/c/${encodeURIComponent(view.guid)}/journey`;
  redirect(303, `${path}?apisync=${result}`);
};
