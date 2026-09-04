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
const HISTORY_LIMIT = 200;
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
    .bind(WORLD_ID, throughRevision, HISTORY_LIMIT)
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

export async function GET() {
  const serverTime = Date.now();

  try {
    const database = getD1();
    await ensureSchema(database);
    const snapshot = await authoritativeSnapshot(database, serverTime);
    const history = await loadHistory(database, snapshot.revision);
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
