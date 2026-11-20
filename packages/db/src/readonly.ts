import Database from "better-sqlite3";

/**
 * Quest IDs from the content mirror, read with a strictly read-only handle: no pragmas, no
 * migrations, the file must already exist, and the handle is always closed. Throws on any failure.
 */
export function readQuestIdsReadonly(dbPath: string): number[] {
  const sqlite = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const rows = sqlite.prepare("select data from content_record where resource = 'quests'").all() as { data: string }[];
    const ids: number[] = [];
    for (const r of rows) {
      const id = (JSON.parse(r.data) as { id?: unknown } | null)?.id;
      if (typeof id === "number") ids.push(id);
    }
    return ids.sort((a, b) => a - b);
  } finally {
    sqlite.close();
  }
}
