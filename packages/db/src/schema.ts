import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const contentRecord = sqliteTable(
  "content_record",
  {
    resource: text("resource").notNull(),
    id: text("id").notNull(),
    build: text("build").notNull(),
    /** JSON text */
    data: text("data").notNull(),
    fetchedAt: integer("fetched_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.resource, t.id] })],
);

export const syncState = sqliteTable("sync_state", {
  resource: text("resource").primaryKey(),
  build: text("build").notNull(),
  nextOffset: integer("next_offset").notNull().default(0),
  total: integer("total"),
  status: text("status", { enum: ["idle", "running", "complete", "failed"] }).notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const character = sqliteTable("character", {
  guid: text("guid").primaryKey(),
  name: text("name"),
  class: text("class"),
  race: text("race"),
  level: integer("level"),
  firstSeenAt: integer("first_seen_at").notNull(),
  latestTakenAt: integer("latest_taken_at").notNull(),
});

export const snapshot = sqliteTable(
  "snapshot",
  {
    guid: text("guid").notNull(),
    takenAt: integer("taken_at").notNull(),
    build: text("build").notNull(),
    schema: integer("schema").notNull(),
    raw: text("raw").notNull(),
    unsupported: integer("unsupported", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.guid, t.takenAt] })],
);

export const deviceToken = sqliteTable("device_token", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  createdAt: integer("created_at").notNull(),
  revokedAt: integer("revoked_at"),
});
