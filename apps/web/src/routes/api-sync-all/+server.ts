import { redirect, type RequestHandler } from "@sveltejs/kit";
import { getRoster } from "@ft/core";
import { syncAllFromApi } from "../../lib/server/api-sync";
import { getDb } from "../../lib/server/db";
import { env } from "../../lib/server/env";

/** POST: sync every character from Blizzard, then back to the roster with the counts in `?apisyncall=synced,none,skipped,failed`. */
export const POST: RequestHandler = async () => {
  const db = getDb();
  const cards = getRoster(db).characters.map((c) => ({ guid: c.guid, name: c.name, surname: c.surname, level: c.level }));
  const r = await syncAllFromApi(db, cards, env().blizzard);
  redirect(303, `/?apisyncall=${r.synced},${r.none},${r.skipped},${r.failed}`);
};
