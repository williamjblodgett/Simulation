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
  'shrine_built'
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

export async function GET(request: Request) {
  const serverTime = Date.now();
  const historyLimit = parseHistoryLimit(request);
  const archiveView =
    new URL(request.url).searchParams.get("view") === "archive";

  try {
    const database = getD1();
    await ensureSchema(database);
    const snapshot = await authoritativeSnapshot(database, serverTime);
    const history = await loadHistory(
      database,
      snapshot.revision,
      historyLimit,
    );
    const archiveHighlights = archiveView
      ? await cachedArchiveHighlights(database, snapshot.revision)
      : null;
    const catchUpPendingMs = Math.max(
      0,
      serverTime - snapshot.simulatedAtMs,
    );

    return Response.json(
      {
        world: snapshot.world,
        revision: snapshot.revision,
        serverTime,
        simulatedAtMs: snapshot.simulatedAtMs,
        catchUpProcessedSeconds: snapshot.processedMs / 1_000,
        catchUpPendingSeconds: catchUpPendingMs / 1_000,
        caughtUp: catchUpPendingMs === 0,
        persistent: true,
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
