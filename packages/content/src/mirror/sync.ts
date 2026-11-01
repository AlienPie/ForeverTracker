import { syncState, type Db } from "@ft/db";
import type { ForeverDbClient } from "../client/types";
import { RESOURCES, type ResourceSpec } from "./resources";
import {
  deleteResource,
  getRecord,
  getSyncState,
  putRecord,
  setSyncState,
} from "./store";

export type SyncProgress = { resource: string; done: number; total: number | null };

export type SyncDeps = {
  client: ForeverDbClient;
  db: Db;
  now?: () => number;
  onProgress?: (p: SyncProgress) => void;
};

const MAX_RESTARTS = 3;

/**
 * Mirror one resource into SQLite. Progress is checkpointed (sync_state.nextOffset) in the same
 * transaction as each page's records, so a crash/error resumes at the first unsaved page.
 * Records from two builds are never mixed: a build change wipes the resource and restarts at 0.
 * Any error marks the resource `failed`, keeps the checkpoint, and propagates.
 */
export async function syncResource(deps: SyncDeps, spec: ResourceSpec): Promise<void> {
  const { client, db } = deps;
  const now = deps.now ?? Date.now;
  const prior = getSyncState(db, spec.name);
  let known: string | null = prior && prior.build !== "" ? prior.build : null;
  let offset = prior && prior.status !== "complete" ? prior.nextOffset : 0;
  let total: number | null = prior?.total ?? null;

  const save = (status: "running" | "complete" | "failed", nextOffset: number) =>
    setSyncState(db, {
      resource: spec.name,
      build: known ?? "",
      nextOffset,
      total,
      status,
      updatedAt: now(),
    });

  try {
    save("running", offset);
    for (let restarts = 0; ; ) {
      let restart = false;
      for await (const chunk of spec.fetch(client, { offset })) {
        const chunkStart = offset;
        const wipe = known !== null && chunk.build !== known;
        if (wipe && chunkStart !== 0) {
          // the earlier pages came from another build: start over so builds never mix
          if (++restarts > MAX_RESTARTS) {
            throw new Error(`${spec.name}: build kept changing during sync`);
          }
          // wipe + checkpoint reset are one atomic step: rows and state can never disagree
          db.transaction((tx) => {
            const t = tx as unknown as Db;
            deleteResource(t, spec.name);
            setSyncState(t, {
              resource: spec.name,
              build: chunk.build,
              nextOffset: 0,
              total: null,
              status: "running",
              updatedAt: now(),
            });
          });
          known = chunk.build;
          offset = 0;
          total = null;
          restart = true;
          break;
        }
        known = chunk.build;
        if (chunk.total !== undefined) total = chunk.total;
        const fetchedAt = now();
        const done = chunk.nextOffset === null;
        db.transaction((tx) => {
          const t = tx as unknown as Db;
          // first page of a new build: drop old-build rows in the same commit as this page
          if (wipe) deleteResource(t, spec.name);
          for (const r of chunk.records) putRecord(t, spec.name, r.id, r.data, chunk.build, fetchedAt);
          const next = chunk.nextOffset ?? 0;
          setSyncState(t, {
            resource: spec.name,
            build: chunk.build,
            nextOffset: next,
            total,
            status: done ? "complete" : "running",
            updatedAt: fetchedAt,
          });
        });
        offset = chunk.nextOffset ?? 0;
        deps.onProgress?.({
          resource: spec.name,
          done: chunk.nextOffset ?? total ?? offset,
          total,
        });
      }
      if (!restart) break;
    }
    // A resource that yielded nothing (empty list) is still complete.
    if (getSyncState(db, spec.name)?.status !== "complete") save("complete", 0);
  } catch (err) {
    const cur = getSyncState(db, spec.name);
    setSyncState(db, {
      resource: spec.name,
      build: cur?.build ?? known ?? "",
      nextOffset: cur?.nextOffset ?? offset,
      total: cur?.total ?? total,
      status: "failed",
      updatedAt: now(),
    });
    throw err;
  }
}

/** Compare /meta's build with the builds stored in sync_state. levelCap always comes from /meta. */
export async function checkBuild(
  deps: Pick<SyncDeps, "client" | "db">,
): Promise<{ build: string; levelCap: number; changed: boolean }> {
  const res = await deps.client.get<{ build: string; levelCap: number }>("/meta");
  const build = res.data.build;
  const stored = deps.db.select().from(syncState).all();
  // Nothing stored yet counts as changed (a sync is needed).
  const changed = stored.length === 0 || stored.some((s) => s.build !== build);
  return { build, levelCap: res.data.levelCap, changed };
}

/**
 * Sync every resource, skipping those already complete for the current build (a complete
 * resource stored under an older build is re-synced). Aborts on the first failing resource:
 * the error propagates and later resources are not attempted (auth/budget errors must stop
 * everything); the failed resource keeps its checkpoint for the next run.
 */
export async function syncAll(deps: SyncDeps): Promise<void> {
  const { build } = await checkBuild(deps);
  for (const spec of RESOURCES) {
    const s = getSyncState(deps.db, spec.name);
    if (s && s.status === "complete" && s.build === build) continue;
    await syncResource(deps, spec);
  }
}

/** Lazy item lookup: stored record if present, else fetch `/items/{id}` once and store it. */
export async function getItem(
  deps: Pick<SyncDeps, "client" | "db" | "now">,
  id: number,
): Promise<unknown> {
  const hit = getRecord(deps.db, "items", String(id));
  if (hit) return hit.data;
  const res = await deps.client.get<unknown>(`/items/${id}`);
  putRecord(deps.db, "items", String(id), res.data, res.meta.build, (deps.now ?? Date.now)());
  return res.data;
}
