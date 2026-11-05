import { error } from "@sveltejs/kit";
import { getCharacter, type CharacterView } from "@ft/core";
import { getDb } from "./db";

/** The character for a route's `guid` param at `now` (unix seconds), or a 404. */
export function characterOr404(guid: string | undefined, now: number = Math.floor(Date.now() / 1000)): CharacterView {
  const view = guid ? getCharacter(getDb(), guid, now) : null;
  if (!view) error(404, "Character not found");
  return view;
}
