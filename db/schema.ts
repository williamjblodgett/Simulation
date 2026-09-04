import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const civilizationWorld = sqliteTable(
  "civilization_world",
  {
    id: text("id").primaryKey(),
    schemaVersion: integer("schema_version").notNull(),
    revision: integer("revision").notNull().default(0),
    stateJson: text("state_json").notNull(),
    simulatedAtMs: integer("simulated_at_ms").notNull(),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    check("civilization_world_canonical_id", sql`${table.id} = 'canonical'`),
  ],
);

export const civilizationEvents = sqliteTable(
  "civilization_events",
  {
    id: text("id").primaryKey(),
    worldId: text("world_id")
      .notNull()
      .references(() => civilizationWorld.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    occurredAtMs: integer("occurred_at_ms").notNull(),
    eventJson: text("event_json").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_civilization_events_world_occurred").on(
      table.worldId,
      table.occurredAtMs,
      table.id,
    ),
  ],
);
