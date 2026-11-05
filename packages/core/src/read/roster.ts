import { character, type Db } from "@ft/db";
import { asc, desc } from "drizzle-orm";
import { cardFor, nowSeconds, type CharacterCard } from "./character";

export type Roster = {
  characters: CharacterCard[];
  /** played and money sum only the characters that report them */
  totals: { count: number; playedSeconds: number; money: number };
};

/** All characters, newest `latestTakenAt` first. */
export function getRoster(db: Db, now: number = nowSeconds()): Roster {
  const rows = db.select().from(character).orderBy(desc(character.latestTakenAt), asc(character.guid)).all();
  const characters = rows.map((row) => cardFor(db, row, now));
  const totals = { count: characters.length, playedSeconds: 0, money: 0 };
  for (const c of characters) {
    totals.playedSeconds += c.playedSeconds ?? 0;
    totals.money += c.money ?? 0;
  }
  return { characters, totals };
}
