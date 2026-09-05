import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

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

/**
 * Era III is deliberately additive. The Era II tables above remain the source
 * of truth for the archived civilization and are never migrated into, updated
 * by, or deleted through these tables.
 *
 * A planet checkpoint is written under a fresh immutable commit id. Only after
 * every shard is durable does a compare-and-swap on this row publish the new
 * commit. Readers therefore cannot observe a half-written checkpoint.
 */
export const planetWorlds = sqliteTable(
  "planet_worlds",
  {
    id: text("id").primaryKey(),
    era: integer("era").notNull().default(3),
    schemaVersion: integer("schema_version").notNull(),
    catalogVersion: text("catalog_version").notNull(),
    seed: text("seed").notNull(),
    status: text("status").notNull().default("active"),
    revision: integer("revision").notNull().default(0),
    stateRevision: integer("state_revision").notNull().default(0),
    currentCommitId: text("current_commit_id").notNull(),
    manifestJson: text("manifest_json").notNull(),
    manifestBytes: integer("manifest_bytes").notNull(),
    simulatedAtMs: integer("simulated_at_ms").notNull(),
    archiveWorldId: text("archive_world_id"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    check("planet_worlds_era_three", sql`${table.era} = 3`),
    check(
      "planet_worlds_status",
      sql`${table.status} IN ('active', 'paused', 'archived')`,
    ),
    check(
      "planet_worlds_manifest_bound",
      sql`${table.manifestBytes} > 0 AND ${table.manifestBytes} <= 1450000`,
    ),
    uniqueIndex("idx_planet_worlds_era").on(table.era),
  ],
);

export const planetRegionShards = sqliteTable(
  "planet_region_shards",
  {
    worldId: text("world_id").notNull(),
    commitId: text("commit_id").notNull(),
    regionKey: text("region_key").notNull(),
    part: integer("part").notNull().default(0),
    revision: integer("revision").notNull(),
    chunkX: integer("chunk_x"),
    chunkY: integer("chunk_y"),
    payloadJson: text("payload_json").notNull(),
    payloadBytes: integer("payload_bytes").notNull(),
    checksum: text("checksum").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({
      columns: [table.worldId, table.commitId, table.regionKey, table.part],
    }),
    check(
      "planet_region_shards_payload_bound",
      sql`${table.payloadBytes} > 0 AND ${table.payloadBytes} <= 1450000`,
    ),
    index("idx_planet_region_shards_viewport").on(
      table.worldId,
      table.commitId,
      table.chunkY,
      table.chunkX,
    ),
  ],
);

export const planetEntityShards = sqliteTable(
  "planet_entity_shards",
  {
    worldId: text("world_id").notNull(),
    commitId: text("commit_id").notNull(),
    kind: text("kind").notNull(),
    shardId: text("shard_id").notNull(),
    revision: integer("revision").notNull(),
    entityCount: integer("entity_count").notNull(),
    payloadJson: text("payload_json").notNull(),
    payloadBytes: integer("payload_bytes").notNull(),
    checksum: text("checksum").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({
      columns: [table.worldId, table.commitId, table.kind, table.shardId],
    }),
    check(
      "planet_entity_shards_payload_bound",
      sql`${table.payloadBytes} > 0 AND ${table.payloadBytes} <= 1450000`,
    ),
  ],
);

export const planetEntityIndex = sqliteTable(
  "planet_entity_index",
  {
    worldId: text("world_id").notNull(),
    commitId: text("commit_id").notNull(),
    kind: text("kind").notNull(),
    entityId: text("entity_id").notNull(),
    shardId: text("shard_id").notNull(),
    regionKey: text("region_key"),
    longitude: real("longitude"),
    latitude: real("latitude"),
    revision: integer("revision").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.worldId, table.commitId, table.kind, table.entityId],
    }),
    index("idx_planet_entity_index_viewport").on(
      table.worldId,
      table.commitId,
      table.kind,
      table.latitude,
      table.longitude,
    ),
  ],
);

export const planetSettlementShards = sqliteTable(
  "planet_settlement_shards",
  {
    worldId: text("world_id").notNull(),
    commitId: text("commit_id").notNull(),
    shardId: text("shard_id").notNull(),
    revision: integer("revision").notNull(),
    settlementCount: integer("settlement_count").notNull(),
    payloadJson: text("payload_json").notNull(),
    payloadBytes: integer("payload_bytes").notNull(),
    checksum: text("checksum").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({
      columns: [table.worldId, table.commitId, table.shardId],
    }),
    check(
      "planet_settlement_shards_payload_bound",
      sql`${table.payloadBytes} > 0 AND ${table.payloadBytes} <= 1450000`,
    ),
  ],
);

export const planetSettlementIndex = sqliteTable(
  "planet_settlement_index",
  {
    worldId: text("world_id").notNull(),
    commitId: text("commit_id").notNull(),
    settlementId: text("settlement_id").notNull(),
    shardId: text("shard_id").notNull(),
    regionKey: text("region_key").notNull(),
    longitude: real("longitude").notNull(),
    latitude: real("latitude").notNull(),
    revision: integer("revision").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.worldId, table.commitId, table.settlementId],
    }),
    index("idx_planet_settlement_index_viewport").on(
      table.worldId,
      table.commitId,
      table.latitude,
      table.longitude,
    ),
  ],
);

export const planetEvents = sqliteTable(
  "planet_events",
  {
    worldId: text("world_id").notNull(),
    eventId: text("event_id").notNull(),
    revision: integer("revision").notNull(),
    occurredAt: real("occurred_at").notNull(),
    day: real("day").notNull(),
    eventType: text("event_type").notNull(),
    importance: real("importance").notNull(),
    fingerprint: text("fingerprint").notNull(),
    eventJson: text("event_json").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.worldId, table.eventId] }),
    index("idx_planet_events_chapter").on(
      table.worldId,
      table.day,
      table.importance,
      table.eventId,
    ),
    index("idx_planet_events_revision").on(
      table.worldId,
      table.revision,
      table.eventId,
    ),
  ],
);

export const planetHistoryChapters = sqliteTable(
  "planet_history_chapters",
  {
    worldId: text("world_id").notNull(),
    chapterIndex: integer("chapter_index").notNull(),
    startDay: integer("start_day").notNull(),
    endDay: integer("end_day").notNull(),
    throughRevision: integer("through_revision").notNull(),
    complete: integer("complete", { mode: "boolean" }).notNull(),
    fingerprint: text("fingerprint").notNull(),
    summaryJson: text("summary_json").notNull(),
    summaryBytes: integer("summary_bytes").notNull(),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.worldId, table.chapterIndex] }),
    check(
      "planet_history_chapters_summary_bound",
      sql`${table.summaryBytes} > 0 AND ${table.summaryBytes} <= 1450000`,
    ),
    index("idx_planet_history_chapters_revision").on(
      table.worldId,
      table.throughRevision,
      table.chapterIndex,
    ),
  ],
);

export const planetCatalogs = sqliteTable(
  "planet_catalogs",
  {
    kind: text("kind").notNull(),
    catalogVersion: text("catalog_version").notNull(),
    schemaVersion: integer("schema_version").notNull(),
    itemCount: integer("item_count").notNull(),
    payloadJson: text("payload_json").notNull(),
    payloadBytes: integer("payload_bytes").notNull(),
    checksum: text("checksum").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.kind, table.catalogVersion] }),
    check(
      "planet_catalogs_payload_bound",
      sql`${table.payloadBytes} > 0 AND ${table.payloadBytes} <= 1450000`,
    ),
  ],
);

/**
 * A durable lease and quota fence for optional model-assisted agent counsel.
 * The credential itself never enters D1; Sites injects it as a secret runtime
 * environment variable. This row prevents concurrent viewers from multiplying
 * paid requests while the canonical world is being advanced.
 */
export const planetAiCounselState = sqliteTable(
  "planet_ai_counsel_state",
  {
    worldId: text("world_id").primaryKey(),
    leaseUntilMs: integer("lease_until_ms").notNull().default(0),
    lastStartedDay: real("last_started_day").notNull().default(-1000000),
    lastCompletedDay: real("last_completed_day").notNull().default(-1000000),
    dailyBucket: integer("daily_bucket").notNull().default(0),
    dailyCalls: integer("daily_calls").notNull().default(0),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    lastRequestId: text("last_request_id"),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    check(
      "planet_ai_counsel_daily_calls_bound",
      sql`${table.dailyCalls} >= 0 AND ${table.dailyCalls} <= 24`,
    ),
    check(
      "planet_ai_counsel_failures_bound",
      sql`${table.consecutiveFailures} >= 0 AND ${table.consecutiveFailures} <= 1000`,
    ),
  ],
);

/** Redacted, bounded decision audit. No API key, prompt, or raw response lives here. */
export const planetAiCounselLog = sqliteTable(
  "planet_ai_counsel_log",
  {
    worldId: text("world_id").notNull(),
    runId: text("run_id").notNull(),
    worldRevision: integer("world_revision").notNull(),
    day: real("day").notNull(),
    model: text("model").notNull(),
    status: text("status").notNull(),
    agentIdsJson: text("agent_ids_json").notNull(),
    decisionsJson: text("decisions_json").notNull(),
    payloadBytes: integer("payload_bytes").notNull(),
    requestId: text("request_id"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.worldId, table.runId] }),
    check(
      "planet_ai_counsel_log_status",
      sql`${table.status} IN ('applied', 'rejected', 'failed')`,
    ),
    check(
      "planet_ai_counsel_log_payload_bound",
      sql`${table.payloadBytes} >= 2 AND ${table.payloadBytes} <= 24000`,
    ),
    index("idx_planet_ai_counsel_log_day").on(
      table.worldId,
      table.day,
      table.runId,
    ),
  ],
);
