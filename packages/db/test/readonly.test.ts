import { existsSync, mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { expect, test } from "vitest";
import { readQuestIdsReadonly } from "../src/index";

test("readQuestIdsReadonly returns quest ids and leaves the file untouched", () => {
  const path = join(mkdtempSync(join(tmpdir(), "ft-ro-")), "forevertracker.sqlite");
  const w = new Database(path);
  w.exec("create table content_record (resource text, id text, build text, data text, fetched_at integer)");
  const ins = w.prepare("insert into content_record values (?, ?, 'b1', ?, 0)");
  ins.run("quests", "5", JSON.stringify({ id: 5 }));
  ins.run("quests", "2", JSON.stringify({ id: 2 }));
  ins.run("zones", "9", JSON.stringify({ id: 9 }));
  w.close();
  const before = readFileSync(path);
  const mtime = statSync(path).mtimeMs;

  expect(readQuestIdsReadonly(path)).toEqual([2, 5]);

  expect(readFileSync(path).equals(before)).toBe(true);
  expect(statSync(path).mtimeMs).toBe(mtime);
  expect(existsSync(path + "-wal")).toBe(false);
  expect(existsSync(path + "-shm")).toBe(false);
});

test("readQuestIdsReadonly does not create a missing file", () => {
  const path = join(mkdtempSync(join(tmpdir(), "ft-ro-")), "missing.sqlite");
  expect(() => readQuestIdsReadonly(path)).toThrow();
  expect(existsSync(path)).toBe(false);
});
