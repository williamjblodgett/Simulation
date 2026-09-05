import { getD1 } from "@/db";

const CREATE_PLANET_WORLDS_SQL = `
  CREATE TABLE IF NOT EXISTS planet_worlds (
    id TEXT PRIMARY KEY NOT NULL,
    era INTEGER NOT NULL DEFAULT 3,
    schema_version INTEGER NOT NULL,
    catalog_version TEXT NOT NULL,
    seed TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    revision INTEGER NOT NULL DEFAULT 0,
    state_revision INTEGER NOT NULL DEFAULT 0,
    current_commit_id TEXT NOT NULL,
    manifest_json TEXT NOT NULL,
    manifest_bytes INTEGER NOT NULL,
    simulated_at_ms INTEGER NOT NULL,
    archive_world_id TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT planet_worlds_era_three CHECK (era = 3),
    CONSTRAINT planet_worlds_status CHECK (status IN ('active', 'paused', 'archived')),
    CONSTRAINT planet_worlds_manifest_bound CHECK (manifest_bytes > 0 AND manifest_bytes <= 1450000)
  )
`;

const CREATE_PLANET_REGIONS_SQL = `
  CREATE TABLE IF NOT EXISTS planet_region_shards (
    world_id TEXT NOT NULL,
    commit_id TEXT NOT NULL,
    region_key TEXT NOT NULL,
    part INTEGER NOT NULL DEFAULT 0,
    revision INTEGER NOT NULL,
    chunk_x INTEGER,
    chunk_y INTEGER,
    payload_json TEXT NOT NULL,
    payload_bytes INTEGER NOT NULL,
    checksum TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (world_id, commit_id, region_key, part),
    CONSTRAINT planet_region_shards_payload_bound CHECK (payload_bytes > 0 AND payload_bytes <= 1450000)
  )
`;

const CREATE_PLANET_ENTITY_SHARDS_SQL = `
  CREATE TABLE IF NOT EXISTS planet_entity_shards (
    world_id TEXT NOT NULL,
    commit_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    shard_id TEXT NOT NULL,
    revision INTEGER NOT NULL,
    entity_count INTEGER NOT NULL,
    payload_json TEXT NOT NULL,
    payload_bytes INTEGER NOT NULL,
    checksum TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (world_id, commit_id, kind, shard_id),
    CONSTRAINT planet_entity_shards_payload_bound CHECK (payload_bytes > 0 AND payload_bytes <= 1450000)
  )
`;

const CREATE_PLANET_ENTITY_INDEX_SQL = `
  CREATE TABLE IF NOT EXISTS planet_entity_index (
    world_id TEXT NOT NULL,
    commit_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    shard_id TEXT NOT NULL,
    region_key TEXT,
    longitude REAL,
    latitude REAL,
    revision INTEGER NOT NULL,
    PRIMARY KEY (world_id, commit_id, kind, entity_id)
  )
`;

const CREATE_PLANET_SETTLEMENT_SHARDS_SQL = `
  CREATE TABLE IF NOT EXISTS planet_settlement_shards (
    world_id TEXT NOT NULL,
    commit_id TEXT NOT NULL,
    shard_id TEXT NOT NULL,
    revision INTEGER NOT NULL,
    settlement_count INTEGER NOT NULL,
    payload_json TEXT NOT NULL,
    payload_bytes INTEGER NOT NULL,
    checksum TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (world_id, commit_id, shard_id),
    CONSTRAINT planet_settlement_shards_payload_bound CHECK (payload_bytes > 0 AND payload_bytes <= 1450000)
  )
`;

const CREATE_PLANET_SETTLEMENT_INDEX_SQL = `
  CREATE TABLE IF NOT EXISTS planet_settlement_index (
    world_id TEXT NOT NULL,
    commit_id TEXT NOT NULL,
    settlement_id TEXT NOT NULL,
    shard_id TEXT NOT NULL,
    region_key TEXT NOT NULL,
    longitude REAL NOT NULL,
    latitude REAL NOT NULL,
    revision INTEGER NOT NULL,
    PRIMARY KEY (world_id, commit_id, settlement_id)
  )
`;

const CREATE_PLANET_EVENTS_SQL = `
  CREATE TABLE IF NOT EXISTS planet_events (
    world_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    revision INTEGER NOT NULL,
    occurred_at REAL NOT NULL,
    day REAL NOT NULL,
    event_type TEXT NOT NULL,
    importance REAL NOT NULL,
    fingerprint TEXT NOT NULL,
    event_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (world_id, event_id)
  )
`;

const CREATE_PLANET_HISTORY_CHAPTERS_SQL = `
  CREATE TABLE IF NOT EXISTS planet_history_chapters (
    world_id TEXT NOT NULL,
    chapter_index INTEGER NOT NULL,
    start_day INTEGER NOT NULL,
    end_day INTEGER NOT NULL,
    through_revision INTEGER NOT NULL,
    complete INTEGER NOT NULL,
    fingerprint TEXT NOT NULL,
    summary_json TEXT NOT NULL,
    summary_bytes INTEGER NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (world_id, chapter_index),
    CONSTRAINT planet_history_chapters_summary_bound CHECK (summary_bytes > 0 AND summary_bytes <= 1450000)
  )
`;

const CREATE_PLANET_CATALOGS_SQL = `
  CREATE TABLE IF NOT EXISTS planet_catalogs (
    kind TEXT NOT NULL,
    catalog_version TEXT NOT NULL,
    schema_version INTEGER NOT NULL,
    item_count INTEGER NOT NULL,
    payload_json TEXT NOT NULL,
    payload_bytes INTEGER NOT NULL,
    checksum TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (kind, catalog_version),
    CONSTRAINT planet_catalogs_payload_bound CHECK (payload_bytes > 0 AND payload_bytes <= 1450000)
  )
`;

const CREATE_PLANET_AI_COUNSEL_STATE_SQL = `
  CREATE TABLE IF NOT EXISTS planet_ai_counsel_state (
    world_id TEXT PRIMARY KEY NOT NULL,
    lease_until_ms INTEGER NOT NULL DEFAULT 0,
    last_started_day REAL NOT NULL DEFAULT -1000000,
    last_completed_day REAL NOT NULL DEFAULT -1000000,
    daily_bucket INTEGER NOT NULL DEFAULT 0,
    daily_calls INTEGER NOT NULL DEFAULT 0,
    consecutive_failures INTEGER NOT NULL DEFAULT 0,
    last_request_id TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT planet_ai_counsel_daily_calls_bound CHECK (daily_calls >= 0 AND daily_calls <= 24),
    CONSTRAINT planet_ai_counsel_failures_bound CHECK (consecutive_failures >= 0 AND consecutive_failures <= 1000)
  )
`;

const CREATE_PLANET_AI_COUNSEL_LOG_SQL = `
  CREATE TABLE IF NOT EXISTS planet_ai_counsel_log (
    world_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    world_revision INTEGER NOT NULL,
    day REAL NOT NULL,
    model TEXT NOT NULL,
    status TEXT NOT NULL,
    agent_ids_json TEXT NOT NULL,
    decisions_json TEXT NOT NULL,
    payload_bytes INTEGER NOT NULL,
    request_id TEXT,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (world_id, run_id),
    CONSTRAINT planet_ai_counsel_log_status CHECK (status IN ('applied', 'rejected', 'failed')),
    CONSTRAINT planet_ai_counsel_log_payload_bound CHECK (payload_bytes >= 2 AND payload_bytes <= 24000)
  )
`;

const INDEX_SQL = [
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_planet_worlds_era ON planet_worlds (era)",
  "CREATE INDEX IF NOT EXISTS idx_planet_region_shards_viewport ON planet_region_shards (world_id, commit_id, chunk_y, chunk_x)",
  "CREATE INDEX IF NOT EXISTS idx_planet_entity_index_viewport ON planet_entity_index (world_id, commit_id, kind, latitude, longitude)",
  "CREATE INDEX IF NOT EXISTS idx_planet_settlement_index_viewport ON planet_settlement_index (world_id, commit_id, latitude, longitude)",
  "CREATE INDEX IF NOT EXISTS idx_planet_events_chapter ON planet_events (world_id, day, importance, event_id)",
  "CREATE INDEX IF NOT EXISTS idx_planet_events_revision ON planet_events (world_id, revision, event_id)",
  "CREATE INDEX IF NOT EXISTS idx_planet_history_chapters_revision ON planet_history_chapters (world_id, through_revision, chapter_index)",
  "CREATE INDEX IF NOT EXISTS idx_planet_ai_counsel_log_day ON planet_ai_counsel_log (world_id, day, run_id)",
] as const;

let schemaReady: Promise<void> | undefined;

/** Create only the additive Era III tables. Era II is intentionally untouched. */
export function ensurePlanetSchema(database: ReturnType<typeof getD1>): Promise<void> {
  if (!schemaReady) {
    const statements = [
      CREATE_PLANET_WORLDS_SQL,
      CREATE_PLANET_REGIONS_SQL,
      CREATE_PLANET_ENTITY_SHARDS_SQL,
      CREATE_PLANET_ENTITY_INDEX_SQL,
      CREATE_PLANET_SETTLEMENT_SHARDS_SQL,
      CREATE_PLANET_SETTLEMENT_INDEX_SQL,
      CREATE_PLANET_EVENTS_SQL,
      CREATE_PLANET_HISTORY_CHAPTERS_SQL,
      CREATE_PLANET_CATALOGS_SQL,
      CREATE_PLANET_AI_COUNSEL_STATE_SQL,
      CREATE_PLANET_AI_COUNSEL_LOG_SQL,
      ...INDEX_SQL,
      "PRAGMA optimize",
    ];
    schemaReady = database
      .batch(statements.map((statement) => database.prepare(statement)))
      .then(() => undefined)
      .catch((error: unknown) => {
        schemaReady = undefined;
        throw error;
      });
  }
  return schemaReady!;
}
