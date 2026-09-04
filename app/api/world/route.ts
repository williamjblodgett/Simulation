import { getD1 } from "@/db";
import {
  CIVILIZATION_SCHEMA_VERSION,
  EXACT_CATCH_UP_LIMIT_SECONDS,
  catchUpCivilization,
  createCivilizationWorld,
  normalizeCivilizationWorld,
  validateCivilizationWorld,
  type CivilizationWorldState,
  type MajorEvent,
} from "@/app/simulation/civilization-engine";

const WORLD_ID = "canonical";
const WORLD_SCHEMA_VERSION = CIVILIZATION_SCHEMA_VERSION;
const LEGACY_WORLD_SCHEMA_VERSION = 1;
const DEFAULT_HISTORY_LIMIT = 200;
const MIN_HISTORY_LIMIT = 20;
const MAX_HISTORY_LIMIT = 1_000;
const ARCHIVE_HIGHLIGHTS_PER_ENTITY = 8;
const HISTORY_BOOK_CHAPTER_DAYS = 200;
const HISTORY_BOOK_TOP_MOMENTS = 8;
const HISTORY_BOOK_CATEGORY_HIGHLIGHTS = 5;
const MAX_EVENTS_PER_COMMIT = 1_000;
const MAX_STATE_JSON_BYTES = 4_000_000;
const MIN_ADVANCE_MS = 1_000;
const ENGINE_EXACT_REPLAY_LIMIT_MS = EXACT_CATCH_UP_LIMIT_SECONDS * 1_000;
// One request checkpoints at most one real hour. This stays above the engine's
// 1,000-second exact-replay threshold, so each slice uses 20 bounded strategic
// updates instead of thousands of fixed steps while still making useful progress.
const MAX_CATCH_UP_SLICE_MS = 60 * 60 * 1_000;
const MAX_FUTURE_SKEW_MS = 60_000;
const MAX_CAS_ATTEMPTS = 4;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  "CDN-Cache-Control": "no-store",
};

const CREATE_WORLD_SQL = `
  CREATE TABLE IF NOT EXISTS civilization_world (
    id TEXT PRIMARY KEY NOT NULL,
    schema_version INTEGER NOT NULL,
    revision INTEGER NOT NULL DEFAULT 0,
    state_json TEXT NOT NULL,
    simulated_at_ms INTEGER NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT civilization_world_canonical_id CHECK (id = 'canonical')
  )
`;

const CREATE_EVENTS_SQL = `
  CREATE TABLE IF NOT EXISTS civilization_events (
    id TEXT PRIMARY KEY NOT NULL,
    world_id TEXT NOT NULL,
    revision INTEGER NOT NULL,
    occurred_at_ms INTEGER NOT NULL,
    event_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (world_id) REFERENCES civilization_world(id) ON DELETE CASCADE
  )
`;

const CREATE_EVENTS_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_civilization_events_world_occurred
  ON civilization_events (world_id, occurred_at_ms, id)
`;

const INSERT_EVENT_SQL = `
  INSERT OR IGNORE INTO civilization_events (
    id,
    world_id,
    revision,
    occurred_at_ms,
    event_json
  )
  SELECT
    json_extract(entry.value, '$.id'),
    json_extract(entry.value, '$.worldId'),
    json_extract(entry.value, '$.revision'),
    json_extract(entry.value, '$.occurredAtMs'),
    json_extract(entry.value, '$.eventJson')
  FROM json_each(?) AS entry
  WHERE EXISTS (
    SELECT 1
    FROM civilization_world
    WHERE id = ?
      AND revision = ?
      AND schema_version = ?
      AND simulated_at_ms = ?
  )
`;

const ARCHIVE_MAJOR_EVENT_TYPES_SQL = `(
  'world_started',
  'birth',
  'death',
  'camp_founded',
  'camp_destroyed',
  'camp_captured',
  'defection',
  'join',
  'breakaway',
  'coup',
  'alliance',
  'truce',
  'war',
  'peace',
  'tech_unlocked',
  'leadership_change',
  'power_lead_change',
  'belief_founded',
  'belief_conversion_wave',
  'belief_schism',
  'belief_reformed',
  'belief_rejected',
  'belief_faded',
  'shrine_built',
  'agent_renamed',
  'camp_renamed'
)`;

// Keep this formula synchronized with eventImpact in civilization-archive.tsx.
// Every current event type has an explicit weight; the fallback makes future
// linked MajorEventTypes useful until they receive a bespoke weight.
const ARCHIVE_EVENT_IMPACT_SQL = `(
  CASE json_extract(validJson, '$.type')
    WHEN 'world_started' THEN 10
    WHEN 'birth' THEN 3
    WHEN 'death' THEN 6
    WHEN 'camp_founded' THEN 10
    WHEN 'camp_destroyed' THEN 11
    WHEN 'camp_captured' THEN 11
    WHEN 'defection' THEN 7
    WHEN 'join' THEN 5
    WHEN 'breakaway' THEN 10
    WHEN 'coup' THEN 10
    WHEN 'alliance' THEN 8
    WHEN 'truce' THEN 6
    WHEN 'war' THEN 9
    WHEN 'peace' THEN 8
    WHEN 'tech_unlocked' THEN 8
    WHEN 'leadership_change' THEN 7
    WHEN 'power_lead_change' THEN 9
    WHEN 'belief_founded' THEN 10
    WHEN 'belief_conversion_wave' THEN 7
    WHEN 'belief_schism' THEN 10
    WHEN 'belief_reformed' THEN 8
    WHEN 'belief_rejected' THEN 4
    WHEN 'belief_faded' THEN 9
    WHEN 'shrine_built' THEN 6
    WHEN 'agent_renamed' THEN 5
    WHEN 'camp_renamed' THEN 7
    ELSE 4
  END
  + CASE json_extract(validJson, '$.tone')
      WHEN 'critical' THEN 3
      WHEN 'warning' THEN 2
      WHEN 'positive' THEN 1
      ELSE 0
    END
  + MIN(2.0, json_array_length(validJson, '$.agentIds') * 0.2)
)`;

const ARCHIVE_VALID_MAJOR_EVENT_SQL = `
  json_type(validJson, '$.id') = 'text'
  AND json_type(validJson, '$.time') IN ('integer', 'real')
  AND json_type(validJson, '$.day') IN ('integer', 'real')
  AND json_extract(validJson, '$.type') IN ${ARCHIVE_MAJOR_EVENT_TYPES_SQL}
  AND json_extract(validJson, '$.tone') IN (
    'neutral', 'positive', 'warning', 'critical'
  )
  AND json_type(validJson, '$.title') = 'text'
  AND json_type(validJson, '$.message') = 'text'
  AND json_type(validJson, '$.agentIds') = 'array'
  AND NOT EXISTS (
    SELECT 1
    FROM json_each(validJson, '$.agentIds') AS agent
    WHERE agent.type <> 'text'
  )
  AND json_type(validJson, '$.campIds') = 'array'
  AND NOT EXISTS (
    SELECT 1
    FROM json_each(validJson, '$.campIds') AS camp
    WHERE camp.type <> 'text'
  )
  AND (
    json_type(validJson, '$.beliefIds') IS NULL
    OR json_type(validJson, '$.beliefIds') = 'null'
    OR (
      json_type(validJson, '$.beliefIds') = 'array'
      AND NOT EXISTS (
        SELECT 1
        FROM json_each(validJson, '$.beliefIds') AS belief
        WHERE belief.type <> 'text'
      )
    )
  )
`;

function archiveHighlightsSql(entityPath: "campIds" | "beliefIds") {
  return `
    WITH valid_events AS (
      SELECT
        id AS eventId,
        occurred_at_ms AS occurredAtMs,
        event_json AS eventJson,
        CASE
          WHEN json_valid(event_json) THEN event_json
          ELSE '{}'
        END AS validJson
      FROM civilization_events
      WHERE world_id = ?
        AND revision <= ?
    ),
    entity_events AS (
      SELECT DISTINCT
        CAST(entity.value AS TEXT) AS entityId,
        eventId,
        occurredAtMs,
        eventJson,
        ${ARCHIVE_EVENT_IMPACT_SQL} AS impact
      FROM valid_events
      CROSS JOIN json_each(validJson, '$.${entityPath}') AS entity
      WHERE entity.type = 'text'
        AND LENGTH(CAST(entity.value AS TEXT)) > 0
        AND ${ARCHIVE_VALID_MAJOR_EVENT_SQL}
    ),
    ranked AS (
      SELECT
        entityId,
        eventId,
        occurredAtMs,
        eventJson,
        impact,
        ROW_NUMBER() OVER (
          PARTITION BY entityId
          ORDER BY impact DESC, occurredAtMs DESC, eventId DESC
        ) AS rowRank
      FROM entity_events
    )
    SELECT entityId, eventJson
    FROM ranked
    WHERE rowRank <= ?
    ORDER BY entityId ASC, impact DESC, occurredAtMs DESC, eventId DESC
  `;
}

const CAMP_ARCHIVE_HIGHLIGHTS_SQL = archiveHighlightsSql("campIds");
const BELIEF_ARCHIVE_HIGHLIGHTS_SQL = archiveHighlightsSql("beliefIds");

// History-book queries deliberately accept future event types as long as the
// durable event envelope is valid. Unknown types fall into the `other`
// category, so a newer engine cannot silently punch holes in older chapters.
const HISTORY_VALID_MAJOR_EVENT_SQL = `
  json_type(validJson, '$.id') = 'text'
  AND LENGTH(json_extract(validJson, '$.id')) > 0
  AND json_type(validJson, '$.time') IN ('integer', 'real')
  AND json_type(validJson, '$.day') IN ('integer', 'real')
  AND json_type(validJson, '$.type') = 'text'
  AND LENGTH(json_extract(validJson, '$.type')) > 0
  AND json_extract(validJson, '$.tone') IN (
    'neutral', 'positive', 'warning', 'critical'
  )
  AND json_type(validJson, '$.title') = 'text'
  AND json_type(validJson, '$.message') = 'text'
  AND json_type(validJson, '$.agentIds') = 'array'
  AND NOT EXISTS (
    SELECT 1
    FROM json_each(validJson, '$.agentIds') AS agent
    WHERE agent.type <> 'text'
  )
  AND json_type(validJson, '$.campIds') = 'array'
  AND NOT EXISTS (
    SELECT 1
    FROM json_each(validJson, '$.campIds') AS camp
    WHERE camp.type <> 'text'
  )
  AND (
    json_type(validJson, '$.beliefIds') IS NULL
    OR json_type(validJson, '$.beliefIds') = 'null'
    OR (
      json_type(validJson, '$.beliefIds') = 'array'
      AND NOT EXISTS (
        SELECT 1
        FROM json_each(validJson, '$.beliefIds') AS belief
        WHERE belief.type <> 'text'
      )
    )
  )
`;

const HISTORY_EVENT_CATEGORY_SQL = `
  CASE
    WHEN eventType IN ('birth', 'death') THEN 'population'
    WHEN eventType IN (
      'camp_founded', 'camp_destroyed', 'camp_captured', 'defection',
      'join', 'breakaway', 'coup', 'alliance', 'truce', 'war', 'peace',
      'leadership_change', 'power_lead_change'
    ) THEN 'geopolitical'
    WHEN eventType = 'tech_unlocked' THEN 'advancement'
    WHEN eventType IN (
      'belief_founded', 'belief_conversion_wave', 'belief_schism',
      'belief_reformed', 'belief_rejected', 'belief_faded', 'shrine_built'
    ) THEN 'belief'
    WHEN eventType IN ('agent_renamed', 'camp_renamed') THEN 'identity'
    ELSE 'other'
  END
`;

const HISTORY_BOOK_COUNTS_SQL = `
  WITH valid_events AS (
    SELECT
      CASE
        WHEN json_valid(event_json) THEN event_json
        ELSE '{}'
      END AS validJson
    FROM civilization_events
    WHERE world_id = ?
      AND revision <= ?
  ),
  normalized AS (
    SELECT
      CAST(
        (CAST(json_extract(validJson, '$.day') AS INTEGER) - 1)
        / ${HISTORY_BOOK_CHAPTER_DAYS}
        AS INTEGER
      ) + 1 AS chapterIndex,
      json_extract(validJson, '$.type') AS eventType,
      json_array_length(validJson, '$.agentIds') AS agentMentions,
      json_array_length(validJson, '$.campIds') AS campMentions,
      COALESCE(json_array_length(validJson, '$.beliefIds'), 0) AS beliefMentions
    FROM valid_events
    WHERE ${HISTORY_VALID_MAJOR_EVENT_SQL}
      AND json_extract(validJson, '$.day') >= 1
      AND json_extract(validJson, '$.day') <= ?
  )
  SELECT
    chapterIndex,
    eventType,
    COUNT(*) AS eventCount,
    SUM(agentMentions) AS agentMentions,
    SUM(campMentions) AS campMentions,
    SUM(beliefMentions) AS beliefMentions
  FROM normalized
  GROUP BY chapterIndex, eventType
  ORDER BY chapterIndex ASC, eventType ASC
`;

const HISTORY_BOOK_HIGHLIGHTS_SQL = `
  WITH valid_events AS (
    SELECT
      id AS eventId,
      occurred_at_ms AS occurredAtMs,
      event_json AS eventJson,
      CASE
        WHEN json_valid(event_json) THEN event_json
        ELSE '{}'
      END AS validJson
    FROM civilization_events
    WHERE world_id = ?
      AND revision <= ?
  ),
  normalized AS (
    SELECT
      CAST(
        (CAST(json_extract(validJson, '$.day') AS INTEGER) - 1)
        / ${HISTORY_BOOK_CHAPTER_DAYS}
        AS INTEGER
      ) + 1 AS chapterIndex,
      eventId,
      occurredAtMs,
      eventJson,
      json_extract(validJson, '$.type') AS eventType,
      ${ARCHIVE_EVENT_IMPACT_SQL} AS impact
    FROM valid_events
    WHERE ${HISTORY_VALID_MAJOR_EVENT_SQL}
      AND json_extract(validJson, '$.day') >= 1
      AND json_extract(validJson, '$.day') <= ?
  ),
  categorized AS (
    SELECT
      *,
      ${HISTORY_EVENT_CATEGORY_SQL} AS category
    FROM normalized
  ),
  ranked AS (
    SELECT
      *,
      ROW_NUMBER() OVER (
        PARTITION BY chapterIndex
        ORDER BY impact DESC, occurredAtMs DESC, eventId DESC
      ) AS overallRank,
      ROW_NUMBER() OVER (
        PARTITION BY chapterIndex, category
        ORDER BY impact DESC, occurredAtMs DESC, eventId DESC
      ) AS categoryRank
    FROM categorized
  )
  SELECT
    chapterIndex,
    category,
    eventJson,
    overallRank,
    categoryRank
  FROM ranked
  WHERE overallRank <= ?
    OR (
      category IN ('advancement', 'belief', 'geopolitical', 'identity')
      AND categoryRank <= ?
    )
  ORDER BY chapterIndex ASC, overallRank ASC, categoryRank ASC, eventId DESC
`;

interface WorldRow {
  id: string;
  schemaVersion: number;
  revision: number;
  stateJson: string;
  simulatedAtMs: number;
}

interface EventRow {
  eventJson: string;
}

interface ArchiveHighlightRow extends EventRow {
  entityId: string;
}

interface ArchiveHighlights {
  camps: Record<string, MajorEvent[]>;
  beliefs: Record<string, MajorEvent[]>;
}

interface ArchiveHighlightsCacheEntry {
  revision: number;
  highlights: Promise<ArchiveHighlights>;
}

type HistoryEventCategory =
  | "population"
  | "geopolitical"
  | "advancement"
  | "belief"
  | "identity"
  | "other";

interface HistoryBookCountRow {
  chapterIndex: number;
  eventType: string;
  eventCount: number;
  agentMentions: number;
  campMentions: number;
  beliefMentions: number;
}

interface HistoryBookHighlightRow extends EventRow {
  chapterIndex: number;
  category: string;
  overallRank: number;
  categoryRank: number;
}

interface HistoryBookCategoryCounts {
  population: number;
  geopolitical: number;
  advancement: number;
  belief: number;
  identity: number;
  other: number;
}

interface HistoryBookHumanImpact {
  births: number;
  deaths: number;
  netPopulationChange: number;
  allegianceChanges: number;
  leadershipChanges: number;
  agentRenamings: number;
  agentMentions: number;
  campMentions: number;
  beliefMentions: number;
}

interface HistoryBookChapter {
  index: number;
  startDay: number;
  endDay: number;
  complete: boolean;
  title: string;
  summary: string;
  eventCount: number;
  typeCounts: Record<string, number>;
  categoryCounts: HistoryBookCategoryCounts;
  humanImpact: HistoryBookHumanImpact;
  topMoments: MajorEvent[];
  advancementHighlights: MajorEvent[];
  beliefHighlights: MajorEvent[];
  geopoliticalHighlights: MajorEvent[];
  identityHighlights: MajorEvent[];
}

interface HistoryBook {
  chapterLengthDays: number;
  throughDay: number;
  throughRevision: number;
  totalEvents: number;
  chapters: HistoryBookChapter[];
}

interface HistoryBookIndex {
  agents: Array<{
    id: string;
    name: string;
    color: string;
    alive: boolean;
    generation: number;
    campId: string | null;
    influence: number;
    spiritualInfluence: number;
  }>;
  camps: Array<{
    id: string;
    name: string;
  }>;
}

interface HistoryBookCacheEntry {
  revision: number;
  throughDay: number;
  historyBook: Promise<HistoryBook>;
}

interface WorldSnapshot {
  world: CivilizationWorldState;
  revision: number;
  simulatedAtMs: number;
  processedMs: number;
}

interface ParsedWorld {
  world: CivilizationWorldState;
  needsMigration: boolean;
}

class InvalidWorldStateError extends Error {}

let schemaReady: Promise<void> | undefined;
let archiveHighlightsCache: ArchiveHighlightsCacheEntry | undefined;
let historyBookCache: HistoryBookCacheEntry | undefined;

function ensureSchema(database: ReturnType<typeof getD1>) {
  if (!schemaReady) {
    schemaReady = database
      .batch([
        database.prepare(CREATE_WORLD_SQL),
        database.prepare(CREATE_EVENTS_SQL),
        database.prepare(CREATE_EVENTS_INDEX_SQL),
        database.prepare("PRAGMA optimize"),
      ])
      .then(() => undefined)
      .catch((error: unknown) => {
        schemaReady = undefined;
        throw error;
      });
  }

  return schemaReady;
}

function seedWorld(now: number) {
  return normalizeCivilizationWorld({
    ...createCivilizationWorld(),
    lastSavedAt: now,
  });
}

function serializeWorld(world: CivilizationWorldState) {
  const serialized = JSON.stringify(world);
  if (!serialized || serialized.length > MAX_STATE_JSON_BYTES) {
    throw new Error("Civilization state exceeded its persistence bound.");
  }
  return serialized;
}

function boundedCatchUpSliceMs(pendingMs: number): number {
  const sliceMs = Math.min(pendingMs, MAX_CATCH_UP_SLICE_MS);
  const remainingMs = pendingMs - sliceMs;

  // Avoid manufacturing a final 1–1,000 second tail from a genuinely large
  // absence. That tail would select the engine's thousands-of-steps exact path
  // on the following request. Leave just over the threshold instead; both
  // checkpoints then use bounded strategic updates and neither claims future time.
  if (
    remainingMs >= MIN_ADVANCE_MS &&
    remainingMs <= ENGINE_EXACT_REPLAY_LIMIT_MS
  ) {
    return pendingMs - (ENGINE_EXACT_REPLAY_LIMIT_MS + 1);
  }

  return sliceMs;
}

function parseWorld(
  row: WorldRow,
  serverTime: number,
): ParsedWorld | null {
  if (
    !Number.isSafeInteger(row.schemaVersion) ||
    (row.schemaVersion !== WORLD_SCHEMA_VERSION &&
      row.schemaVersion !== LEGACY_WORLD_SCHEMA_VERSION) ||
    !Number.isSafeInteger(row.revision) ||
    row.revision < 0 ||
    !Number.isSafeInteger(row.simulatedAtMs) ||
    row.simulatedAtMs <= 0 ||
    row.simulatedAtMs > serverTime + MAX_FUTURE_SKEW_MS ||
    typeof row.stateJson !== "string" ||
    row.stateJson.length > MAX_STATE_JSON_BYTES
  ) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(row.stateJson);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const persisted = parsed as Record<string, unknown>;
    if (persisted.version !== row.schemaVersion) {
      return null;
    }

    const needsMigration = row.schemaVersion !== WORLD_SCHEMA_VERSION;
    if (!needsMigration && !validateCivilizationWorld(parsed)) return null;
    const normalized = normalizeCivilizationWorld(parsed);
    if (!validateCivilizationWorld(normalized)) return null;
    if (needsMigration && !migrationPreservedWorld(persisted, normalized)) {
      return null;
    }

    return { world: normalized, needsMigration };
  } catch {
    return null;
  }
}

function recordIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const ids: string[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const id = (item as Record<string, unknown>).id;
    if (typeof id !== "string" || id.length === 0) return null;
    ids.push(id);
  }
  return ids;
}

/**
 * Guard against normalizeCivilizationWorld's corruption fallback being mistaken
 * for a migration. A legitimate schema migration keeps the timeline and every
 * persisted entity identity, even when it adds new fields or frontier resources.
 */
function migrationPreservedWorld(
  persisted: Record<string, unknown>,
  migrated: CivilizationWorldState,
): boolean {
  for (const key of [
    "seed",
    "time",
    "day",
    "tick",
    "nextAgentId",
    "nextCampId",
    "nextEventId",
  ] as const) {
    if (persisted[key] !== migrated[key]) return false;
  }
  if (persisted.lastSavedAt !== migrated.lastSavedAt) return false;

  const migratedCollections = migrated as unknown as Record<string, unknown>;
  for (const key of [
    "agents",
    "resources",
    "camps",
    "relations",
    "majorEvents",
  ] as const) {
    const priorIds = recordIds(persisted[key]);
    const nextIds = recordIds(migratedCollections[key]);
    if (!priorIds || !nextIds) return false;
    const nextIdSet = new Set(nextIds);
    if (!priorIds.every((id) => nextIdSet.has(id))) return false;
  }

  return true;
}

function parseMajorEvent(value: unknown): MajorEvent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const event = value as Record<string, unknown>;
  const beliefIds = event.beliefIds ?? [];
  if (
    typeof event.id !== "string" ||
    typeof event.time !== "number" ||
    !Number.isFinite(event.time) ||
    typeof event.day !== "number" ||
    !Number.isFinite(event.day) ||
    typeof event.type !== "string" ||
    typeof event.tone !== "string" ||
    typeof event.title !== "string" ||
    typeof event.message !== "string" ||
    !Array.isArray(event.agentIds) ||
    !event.agentIds.every((id) => typeof id === "string") ||
    !Array.isArray(event.campIds) ||
    !event.campIds.every((id) => typeof id === "string") ||
    !Array.isArray(beliefIds) ||
    !beliefIds.every((id) => typeof id === "string")
  ) {
    return null;
  }

  // Schema-1 history rows predate beliefIds. Normalize them at the API edge so
  // the v2 client can safely filter the unbroken, append-only chronicle.
  return { ...event, beliefIds } as unknown as MajorEvent;
}

function parseHistoryLimit(request: Request): number {
  const rawLimit = new URL(request.url).searchParams.get("historyLimit");
  if (rawLimit === null || rawLimit.trim() === "") {
    return DEFAULT_HISTORY_LIMIT;
  }

  const requestedLimit = Number(rawLimit);
  if (!Number.isSafeInteger(requestedLimit)) return DEFAULT_HISTORY_LIMIT;

  return Math.min(
    MAX_HISTORY_LIMIT,
    Math.max(MIN_HISTORY_LIMIT, requestedLimit),
  );
}

async function loadWorldRow(
  database: ReturnType<typeof getD1>,
): Promise<WorldRow | null> {
  const row = await database
    .prepare(`
      SELECT
        id,
        schema_version AS schemaVersion,
        revision,
        state_json AS stateJson,
        simulated_at_ms AS simulatedAtMs
      FROM civilization_world
      WHERE id = ?
      LIMIT 1
    `)
    .bind(WORLD_ID)
    .first();

  return (row as WorldRow | null) ?? null;
}

function eventStatements(
  database: ReturnType<typeof getD1>,
  events: readonly MajorEvent[],
  revision: number,
  simulatedAtMs: number,
) {
  const boundedEvents = events.slice(-MAX_EVENTS_PER_COMMIT);
  if (boundedEvents.length === 0) return [];

  const rows = boundedEvents.map((event, index) => ({
    id: `${WORLD_ID}:${event.id}`,
    worldId: WORLD_ID,
    revision,
    occurredAtMs: Math.max(
      1,
      simulatedAtMs - (boundedEvents.length - index - 1),
    ),
    eventJson: JSON.stringify(event),
  }));

  return [
    database
      .prepare(INSERT_EVENT_SQL)
      .bind(
        JSON.stringify(rows),
        WORLD_ID,
        revision,
        WORLD_SCHEMA_VERSION,
        simulatedAtMs,
      ),
  ];
}

async function createWorldIfMissing(
  database: ReturnType<typeof getD1>,
  now: number,
) {
  const world = seedWorld(now);
  const stateJson = serializeWorld(world);
  await database.batch([
    database
      .prepare(`
        INSERT OR IGNORE INTO civilization_world (
          id,
          schema_version,
          revision,
          state_json,
          simulated_at_ms
        )
        VALUES (?, ?, 0, ?, ?)
      `)
      .bind(WORLD_ID, WORLD_SCHEMA_VERSION, stateJson, now),
    ...eventStatements(database, world.majorEvents, 0, now),
  ]);
}

async function persistMigratedWorld(
  database: ReturnType<typeof getD1>,
  row: WorldRow,
  world: CivilizationWorldState,
): Promise<boolean> {
  const stateJson = serializeWorld(world);
  const revision = row.revision + 1;
  const results = await database.batch([
    database
      .prepare(`
        UPDATE civilization_world
        SET
          schema_version = ?,
          revision = revision + 1,
          state_json = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND revision = ?
          AND schema_version = ?
          AND simulated_at_ms = ?
      `)
      .bind(
        WORLD_SCHEMA_VERSION,
        stateJson,
        WORLD_ID,
        row.revision,
        row.schemaVersion,
        row.simulatedAtMs,
      ),
    // Existing rows are ignored. This also backfills any event that was present
    // in the persisted v1 tail but had not yet reached the history table.
    ...eventStatements(
      database,
      world.majorEvents,
      revision,
      row.simulatedAtMs,
    ),
  ]);

  return (results[0]?.meta.changes ?? 0) > 0;
}

async function recoverIncompatibleWorld(
  database: ReturnType<typeof getD1>,
  row: WorldRow,
  now: number,
): Promise<WorldSnapshot | null> {
  const world = seedWorld(now);
  const stateJson = serializeWorld(world);
  const safeRevision =
    Number.isSafeInteger(row.revision) && row.revision >= 0 ? row.revision : 0;
  const revision = safeRevision + 1;
  const results = await database.batch([
    database
      .prepare(`
        UPDATE civilization_world
        SET
          schema_version = ?,
          revision = ?,
          state_json = ?,
          simulated_at_ms = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND revision = ?
      `)
      .bind(
        WORLD_SCHEMA_VERSION,
        revision,
        stateJson,
        now,
        WORLD_ID,
        row.revision,
      ),
    // Historical events remain append-only even if the current JSON is damaged.
    // This prevents a recovery from erasing the world's public chronicle.
    ...eventStatements(database, world.majorEvents, revision, now),
  ]);

  if ((results[0]?.meta.changes ?? 0) === 0) {
    return null;
  }

  return { world, revision, simulatedAtMs: now, processedMs: 0 };
}

async function advanceWorld(
  database: ReturnType<typeof getD1>,
  row: WorldRow,
  world: CivilizationWorldState,
  targetMs: number,
): Promise<WorldSnapshot | null> {
  const pendingMs = targetMs - row.simulatedAtMs;
  if (pendingMs < MIN_ADVANCE_MS) {
    return {
      world,
      revision: row.revision,
      simulatedAtMs: row.simulatedAtMs,
      processedMs: 0,
    };
  }

  const processedMs = boundedCatchUpSliceMs(pendingMs);
  const checkpointMs = row.simulatedAtMs + processedMs;

  const knownEventIds = new Set(world.majorEvents.map((event) => event.id));
  let advanced: CivilizationWorldState;
  let stateJson: string;

  try {
    const caughtUp = catchUpCivilization(world, processedMs / 1_000);
    advanced = normalizeCivilizationWorld({
      ...caughtUp,
      lastSavedAt: checkpointMs,
    });
    if (!validateCivilizationWorld(advanced)) {
      throw new Error("Invalid caught-up state");
    }
    stateJson = serializeWorld(advanced);
  } catch {
    throw new InvalidWorldStateError();
  }
  const revision = row.revision + 1;
  const newEvents = advanced.majorEvents.filter(
    (event) => !knownEventIds.has(event.id),
  );

  const results = await database.batch([
    database
      .prepare(`
        UPDATE civilization_world
        SET
          schema_version = ?,
          revision = revision + 1,
          state_json = ?,
          simulated_at_ms = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND revision = ?
          AND schema_version = ?
      `)
      .bind(
        WORLD_SCHEMA_VERSION,
        stateJson,
        checkpointMs,
        WORLD_ID,
        row.revision,
        WORLD_SCHEMA_VERSION,
      ),
    ...eventStatements(database, newEvents, revision, checkpointMs),
  ]);

  if ((results[0]?.meta.changes ?? 0) === 0) {
    return null;
  }

  return {
    world: advanced,
    revision,
    simulatedAtMs: checkpointMs,
    processedMs,
  };
}

async function authoritativeSnapshot(
  database: ReturnType<typeof getD1>,
  serverTime: number,
): Promise<WorldSnapshot> {
  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
    const row = await loadWorldRow(database);
    if (!row) {
      await createWorldIfMissing(database, serverTime);
      continue;
    }

    const parsed = parseWorld(row, serverTime);
    if (!parsed) {
      const recovered = await recoverIncompatibleWorld(
        database,
        row,
        serverTime,
      );
      if (recovered) return recovered;
      continue;
    }

    if (parsed.needsMigration) {
      await persistMigratedWorld(database, row, parsed.world);
      // Reload after either a successful migration or a lost CAS race. The
      // winning row is then caught up using the ordinary schema-current path.
      continue;
    }

    try {
      const advanced = await advanceWorld(
        database,
        row,
        parsed.world,
        serverTime,
      );
      if (advanced) return advanced;
    } catch (error) {
      if (!(error instanceof InvalidWorldStateError)) throw error;
      const recovered = await recoverIncompatibleWorld(
        database,
        row,
        serverTime,
      );
      if (recovered) return recovered;
    }
  }

  const latestRow = await loadWorldRow(database);
  const latestParsed = latestRow ? parseWorld(latestRow, serverTime) : null;
  if (!latestRow || !latestParsed || latestParsed.needsMigration) {
    throw new Error("Canonical civilization state is unavailable.");
  }

  return {
    world: latestParsed.world,
    revision: latestRow.revision,
    simulatedAtMs: latestRow.simulatedAtMs,
    processedMs: 0,
  };
}

async function loadHistory(
  database: ReturnType<typeof getD1>,
  throughRevision: number,
  historyLimit: number,
): Promise<MajorEvent[]> {
  const result = await database
    .prepare(`
      SELECT event_json AS eventJson
      FROM civilization_events
      WHERE world_id = ?
        AND revision <= ?
      ORDER BY occurred_at_ms DESC, id DESC
      LIMIT ?
    `)
    .bind(WORLD_ID, throughRevision, historyLimit)
    .all();

  const rows = ((result as { results?: EventRow[] }).results ?? []);
  const history: MajorEvent[] = [];

  for (const row of rows) {
    try {
      const event = parseMajorEvent(JSON.parse(row.eventJson) as unknown);
      if (event) history.push(event);
    } catch {
      // Ignore a damaged historical row without taking down the world feed.
    }
  }

  return history;
}

function indexArchiveHighlights(
  rows: readonly ArchiveHighlightRow[],
  entityKind: "camp" | "belief",
): Record<string, MajorEvent[]> {
  const highlights = Object.create(null) as Record<string, MajorEvent[]>;

  for (const row of rows) {
    try {
      const event = parseMajorEvent(JSON.parse(row.eventJson) as unknown);
      if (!event || typeof row.entityId !== "string") continue;

      const entityIds =
        entityKind === "camp" ? event.campIds : event.beliefIds;
      if (!entityIds.includes(row.entityId)) continue;

      const events = highlights[row.entityId] ?? [];
      if (
        events.length < ARCHIVE_HIGHLIGHTS_PER_ENTITY &&
        !events.some((existing) => existing.id === event.id)
      ) {
        events.push(event);
        highlights[row.entityId] = events;
      }
    } catch {
      // A damaged row must not make the rest of an entity's archive unavailable.
    }
  }

  return highlights;
}

async function loadArchiveHighlights(
  database: ReturnType<typeof getD1>,
  throughRevision: number,
): Promise<ArchiveHighlights> {
  const [campResult, beliefResult] = await database.batch([
    database
      .prepare(CAMP_ARCHIVE_HIGHLIGHTS_SQL)
      .bind(WORLD_ID, throughRevision, ARCHIVE_HIGHLIGHTS_PER_ENTITY),
    database
      .prepare(BELIEF_ARCHIVE_HIGHLIGHTS_SQL)
      .bind(WORLD_ID, throughRevision, ARCHIVE_HIGHLIGHTS_PER_ENTITY),
  ]);

  const campRows =
    ((campResult as { results?: ArchiveHighlightRow[] }).results ?? []);
  const beliefRows =
    ((beliefResult as { results?: ArchiveHighlightRow[] }).results ?? []);

  return {
    camps: indexArchiveHighlights(campRows, "camp"),
    beliefs: indexArchiveHighlights(beliefRows, "belief"),
  };
}

function cachedArchiveHighlights(
  database: ReturnType<typeof getD1>,
  revision: number,
): Promise<ArchiveHighlights> {
  if (archiveHighlightsCache?.revision === revision) {
    return archiveHighlightsCache.highlights;
  }

  const highlights = loadArchiveHighlights(database, revision).catch(
    (error: unknown) => {
      if (archiveHighlightsCache?.highlights === highlights) {
        archiveHighlightsCache = undefined;
      }
      throw error;
    },
  );
  archiveHighlightsCache = { revision, highlights };
  return highlights;
}

function historyEventCategory(eventType: string): HistoryEventCategory {
  if (eventType === "birth" || eventType === "death") return "population";
  if (
    [
      "camp_founded",
      "camp_destroyed",
      "camp_captured",
      "defection",
      "join",
      "breakaway",
      "coup",
      "alliance",
      "truce",
      "war",
      "peace",
      "leadership_change",
      "power_lead_change",
    ].includes(eventType)
  ) {
    return "geopolitical";
  }
  if (eventType === "tech_unlocked") return "advancement";
  if (
    [
      "belief_founded",
      "belief_conversion_wave",
      "belief_schism",
      "belief_reformed",
      "belief_rejected",
      "belief_faded",
      "shrine_built",
    ].includes(eventType)
  ) {
    return "belief";
  }
  if (eventType === "agent_renamed" || eventType === "camp_renamed") {
    return "identity";
  }
  return "other";
}

function nonNegativeInteger(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0
    ? Math.floor(numeric)
    : 0;
}

function emptyCategoryCounts(): HistoryBookCategoryCounts {
  return {
    population: 0,
    geopolitical: 0,
    advancement: 0,
    belief: 0,
    identity: 0,
    other: 0,
  };
}

function emptyHumanImpact(): HistoryBookHumanImpact {
  return {
    births: 0,
    deaths: 0,
    netPopulationChange: 0,
    allegianceChanges: 0,
    leadershipChanges: 0,
    agentRenamings: 0,
    agentMentions: 0,
    campMentions: 0,
    beliefMentions: 0,
  };
}

function makeHistoryBookChapter(
  index: number,
  throughDay: number,
): HistoryBookChapter {
  const nominalEndDay = index * HISTORY_BOOK_CHAPTER_DAYS;
  return {
    index,
    startDay: (index - 1) * HISTORY_BOOK_CHAPTER_DAYS + 1,
    endDay: Math.min(nominalEndDay, throughDay),
    // Day 200 is still part of Chapter 1. It becomes a closed historical
    // chapter only when the simulation crosses into Day 201.
    complete: throughDay > nominalEndDay,
    title: "",
    summary: "",
    eventCount: 0,
    typeCounts: {},
    categoryCounts: emptyCategoryCounts(),
    humanImpact: emptyHumanImpact(),
    topMoments: [],
    advancementHighlights: [],
    beliefHighlights: [],
    geopoliticalHighlights: [],
    identityHighlights: [],
  };
}

function historyChapterTitle(chapter: HistoryBookChapter): string {
  const prefix = `Chapter ${chapter.index}`;
  if (chapter.eventCount === 0) return `${prefix} · The Quiet Record`;

  const counts = chapter.categoryCounts;
  const strongest = (
    [
      "geopolitical",
      "advancement",
      "belief",
      "population",
      "identity",
      "other",
    ] as const
  ).reduce((best, category) =>
    counts[category] > counts[best] ? category : best,
  );

  if (strongest === "advancement") return `${prefix} · An Age of Discovery`;
  if (strongest === "belief") return `${prefix} · An Age of Conviction`;
  if (strongest === "population") return `${prefix} · Generations in Motion`;
  if (strongest === "identity") return `${prefix} · Names of a Changing World`;
  if (strongest === "other") return `${prefix} · The First Record`;

  const conflict =
    (chapter.typeCounts.war ?? 0) +
    (chapter.typeCounts.camp_captured ?? 0) +
    (chapter.typeCounts.camp_destroyed ?? 0);
  const newPowers =
    (chapter.typeCounts.camp_founded ?? 0) +
    (chapter.typeCounts.breakaway ?? 0);
  if (conflict > newPowers) return `${prefix} · The Age of Contested Borders`;
  if (newPowers > 0) return `${prefix} · The Age of New Powers`;
  return `${prefix} · The Age of Diplomacy`;
}

function historyChapterSummary(chapter: HistoryBookChapter): string {
  const range = `Day ${chapter.startDay} through Day ${chapter.endDay}`;
  const status = chapter.complete
    ? ""
    : ` This chapter remains open as of Day ${chapter.endDay}.`;
  if (chapter.eventCount === 0) {
    return `${range} left no major event in the surviving record; life continued beyond the chroniclers' notice.${status}`;
  }

  const definingMoment = chapter.topMoments[0]?.title;
  const definingSentence = definingMoment
    ? ` Its defining recorded moment was “${definingMoment}.”`
    : "";
  return `${range} recorded ${chapter.eventCount} major changes: ${chapter.categoryCounts.advancement} advancements, ${chapter.categoryCounts.geopolitical} geopolitical shifts, ${chapter.categoryCounts.belief} changes of belief, ${chapter.humanImpact.births} births, and ${chapter.humanImpact.deaths} deaths.${definingSentence}${status}`;
}

function appendUniqueEvent(events: MajorEvent[], event: MajorEvent, limit: number) {
  if (
    events.length < limit &&
    !events.some((existing) => existing.id === event.id)
  ) {
    events.push(event);
  }
}

async function loadHistoryBook(
  database: ReturnType<typeof getD1>,
  throughRevision: number,
  currentDay: number,
): Promise<HistoryBook> {
  const throughDay = Math.max(1, Math.floor(currentDay));
  const chapterCount = Math.max(
    1,
    Math.ceil(throughDay / HISTORY_BOOK_CHAPTER_DAYS),
  );
  const chapters = Array.from({ length: chapterCount }, (_, offset) =>
    makeHistoryBookChapter(offset + 1, throughDay),
  );

  const [countsResult, highlightsResult] = await database.batch([
    database
      .prepare(HISTORY_BOOK_COUNTS_SQL)
      .bind(WORLD_ID, throughRevision, throughDay),
    database
      .prepare(HISTORY_BOOK_HIGHLIGHTS_SQL)
      .bind(
        WORLD_ID,
        throughRevision,
        throughDay,
        HISTORY_BOOK_TOP_MOMENTS,
        HISTORY_BOOK_CATEGORY_HIGHLIGHTS,
      ),
  ]);

  const countRows =
    ((countsResult as { results?: HistoryBookCountRow[] }).results ?? []);
  for (const row of countRows) {
    const chapterIndex = nonNegativeInteger(row.chapterIndex);
    const chapter = chapters[chapterIndex - 1];
    if (!chapter || typeof row.eventType !== "string") continue;

    const eventCount = nonNegativeInteger(row.eventCount);
    chapter.eventCount += eventCount;
    chapter.typeCounts[row.eventType] =
      (chapter.typeCounts[row.eventType] ?? 0) + eventCount;
    chapter.categoryCounts[historyEventCategory(row.eventType)] += eventCount;
    chapter.humanImpact.agentMentions += nonNegativeInteger(row.agentMentions);
    chapter.humanImpact.campMentions += nonNegativeInteger(row.campMentions);
    chapter.humanImpact.beliefMentions += nonNegativeInteger(row.beliefMentions);
  }

  for (const chapter of chapters) {
    const typeCounts = chapter.typeCounts;
    chapter.humanImpact.births = typeCounts.birth ?? 0;
    chapter.humanImpact.deaths = typeCounts.death ?? 0;
    chapter.humanImpact.netPopulationChange =
      chapter.humanImpact.births - chapter.humanImpact.deaths;
    chapter.humanImpact.allegianceChanges =
      (typeCounts.defection ?? 0) +
      (typeCounts.join ?? 0) +
      (typeCounts.breakaway ?? 0);
    chapter.humanImpact.leadershipChanges =
      (typeCounts.leadership_change ?? 0) + (typeCounts.coup ?? 0);
    chapter.humanImpact.agentRenamings = typeCounts.agent_renamed ?? 0;
  }

  const highlightRows =
    ((highlightsResult as { results?: HistoryBookHighlightRow[] }).results ?? []);
  for (const row of highlightRows) {
    const chapterIndex = nonNegativeInteger(row.chapterIndex);
    const chapter = chapters[chapterIndex - 1];
    if (!chapter) continue;

    let event: MajorEvent | null = null;
    try {
      event = parseMajorEvent(JSON.parse(row.eventJson) as unknown);
    } catch {
      // A malformed historical row cannot invalidate its entire 200-day chapter.
    }
    if (!event) continue;

    const overallRank = nonNegativeInteger(row.overallRank);
    if (overallRank >= 1 && overallRank <= HISTORY_BOOK_TOP_MOMENTS) {
      appendUniqueEvent(chapter.topMoments, event, HISTORY_BOOK_TOP_MOMENTS);
    }

    const categoryRank = nonNegativeInteger(row.categoryRank);
    if (
      categoryRank < 1 ||
      categoryRank > HISTORY_BOOK_CATEGORY_HIGHLIGHTS
    ) {
      continue;
    }
    if (row.category === "advancement") {
      appendUniqueEvent(
        chapter.advancementHighlights,
        event,
        HISTORY_BOOK_CATEGORY_HIGHLIGHTS,
      );
    } else if (row.category === "belief") {
      appendUniqueEvent(
        chapter.beliefHighlights,
        event,
        HISTORY_BOOK_CATEGORY_HIGHLIGHTS,
      );
    } else if (row.category === "geopolitical") {
      appendUniqueEvent(
        chapter.geopoliticalHighlights,
        event,
        HISTORY_BOOK_CATEGORY_HIGHLIGHTS,
      );
    } else if (row.category === "identity") {
      appendUniqueEvent(
        chapter.identityHighlights,
        event,
        HISTORY_BOOK_CATEGORY_HIGHLIGHTS,
      );
    }
  }

  for (const chapter of chapters) {
    chapter.title = historyChapterTitle(chapter);
    chapter.summary = historyChapterSummary(chapter);
  }

  return {
    chapterLengthDays: HISTORY_BOOK_CHAPTER_DAYS,
    throughDay,
    throughRevision,
    totalEvents: chapters.reduce((sum, chapter) => sum + chapter.eventCount, 0),
    chapters,
  };
}

function cachedHistoryBook(
  database: ReturnType<typeof getD1>,
  revision: number,
  currentDay: number,
): Promise<HistoryBook> {
  const throughDay = Math.max(1, Math.floor(currentDay));
  if (
    historyBookCache?.revision === revision &&
    historyBookCache.throughDay === throughDay
  ) {
    return historyBookCache.historyBook;
  }

  const historyBook = loadHistoryBook(database, revision, throughDay).catch(
    (error: unknown) => {
      if (historyBookCache?.historyBook === historyBook) {
        historyBookCache = undefined;
      }
      throw error;
    },
  );
  historyBookCache = { revision, throughDay, historyBook };
  return historyBook;
}

function makeHistoryBookIndex(world: CivilizationWorldState): HistoryBookIndex {
  return {
    agents: world.agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      color: agent.color,
      alive: agent.alive,
      generation: agent.generation,
      campId: agent.campId,
      influence: agent.influence,
      spiritualInfluence: agent.spiritualInfluence,
    })),
    camps: world.camps.map((camp) => ({
      id: camp.id,
      name: camp.name,
    })),
  };
}

export async function GET(request: Request) {
  const serverTime = Date.now();
  const view = new URL(request.url).searchParams.get("view");
  const archiveView = view === "archive";
  const historyView = view === "history";

  try {
    const database = getD1();
    await ensureSchema(database);
    const snapshot = await authoritativeSnapshot(database, serverTime);
    const history = historyView
      ? null
      : await loadHistory(
          database,
          snapshot.revision,
          parseHistoryLimit(request),
        );
    const archiveHighlights = archiveView
      ? await cachedArchiveHighlights(database, snapshot.revision)
      : null;
    const historyBook = historyView
      ? await cachedHistoryBook(
          database,
          snapshot.revision,
          snapshot.world.day,
        )
      : null;
    const catchUpPendingMs = Math.max(
      0,
      serverTime - snapshot.simulatedAtMs,
    );

    const responseMetadata = {
      revision: snapshot.revision,
      serverTime,
      simulatedAtMs: snapshot.simulatedAtMs,
      catchUpProcessedSeconds: snapshot.processedMs / 1_000,
      catchUpPendingSeconds: catchUpPendingMs / 1_000,
      caughtUp: catchUpPendingMs === 0,
      persistent: true,
    };

    if (historyView && historyBook) {
      return Response.json(
        {
          ...responseMetadata,
          historyBook,
          historyIndex: makeHistoryBookIndex(snapshot.world),
        },
        { headers: NO_STORE_HEADERS },
      );
    }

    return Response.json(
      {
        world: snapshot.world,
        ...responseMetadata,
        history,
        ...(archiveHighlights ? { archiveHighlights } : {}),
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch {
    return Response.json(
      { error: "The living world is temporarily unavailable." },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }
}
