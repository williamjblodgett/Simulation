import { getD1 } from "@/db";
import {
  CIVILIZATION_SCHEMA_VERSION,
  catchUpCivilization,
  createCivilizationWorld,
  normalizeCivilizationWorld,
  validateCivilizationWorld,
  type CivilizationWorldState,
  type MajorEvent,
} from "@/app/simulation/civilization-engine";

const WORLD_ID = "canonical";
const WORLD_SCHEMA_VERSION = CIVILIZATION_SCHEMA_VERSION;
const HISTORY_LIMIT = 200;
const MAX_EVENTS_PER_COMMIT = 1_000;
const MAX_STATE_JSON_BYTES = 4_000_000;
const MIN_ADVANCE_MS = 1_000;
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

function parseWorld(
  row: WorldRow,
  serverTime: number,
): CivilizationWorldState | null {
  if (
    row.schemaVersion !== WORLD_SCHEMA_VERSION ||
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
    if (
      (parsed as { version?: unknown }).version !==
      WORLD_SCHEMA_VERSION
    ) {
      return null;
    }
    if (!validateCivilizationWorld(parsed)) return null;

    const normalized = normalizeCivilizationWorld(parsed);
    return validateCivilizationWorld(normalized) ? normalized : null;
  } catch {
    return null;
  }
}

function parseMajorEvent(value: unknown): MajorEvent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const event = value as Record<string, unknown>;
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
    !event.campIds.every((id) => typeof id === "string")
  ) {
    return null;
  }

  return value as MajorEvent;
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

async function resetIncompatibleWorld(
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
    database
      .prepare(`
        DELETE FROM civilization_events
        WHERE world_id = ?
          AND EXISTS (
            SELECT 1
            FROM civilization_world
            WHERE id = ?
              AND revision = ?
              AND schema_version = ?
              AND simulated_at_ms = ?
          )
      `)
      .bind(
        WORLD_ID,
        WORLD_ID,
        revision,
        WORLD_SCHEMA_VERSION,
        now,
      ),
    ...eventStatements(database, world.majorEvents, revision, now),
  ]);

  if ((results[0]?.meta.changes ?? 0) === 0) {
    return null;
  }

  return { world, revision };
}

async function advanceWorld(
  database: ReturnType<typeof getD1>,
  row: WorldRow,
  world: CivilizationWorldState,
  targetMs: number,
): Promise<WorldSnapshot | null> {
  const elapsedMs = targetMs - row.simulatedAtMs;
  if (elapsedMs < MIN_ADVANCE_MS) {
    return { world, revision: row.revision };
  }

  const knownEventIds = new Set(world.majorEvents.map((event) => event.id));
  let advanced: CivilizationWorldState;
  let stateJson: string;

  try {
    const caughtUp = catchUpCivilization(world, elapsedMs / 1_000);
    advanced = normalizeCivilizationWorld({
      ...caughtUp,
      lastSavedAt: targetMs,
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
        targetMs,
        WORLD_ID,
        row.revision,
        WORLD_SCHEMA_VERSION,
      ),
    ...eventStatements(database, newEvents, revision, targetMs),
  ]);

  if ((results[0]?.meta.changes ?? 0) === 0) {
    return null;
  }

  return { world: advanced, revision };
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

    const world = parseWorld(row, serverTime);
    if (!world) {
      const reset = await resetIncompatibleWorld(database, row, serverTime);
      if (reset) return reset;
      continue;
    }

    try {
      const advanced = await advanceWorld(database, row, world, serverTime);
      if (advanced) return advanced;
    } catch (error) {
      if (!(error instanceof InvalidWorldStateError)) throw error;
      const reset = await resetIncompatibleWorld(database, row, serverTime);
      if (reset) return reset;
    }
  }

  const latestRow = await loadWorldRow(database);
  const latestWorld = latestRow ? parseWorld(latestRow, serverTime) : null;
  if (!latestRow || !latestWorld) {
    throw new Error("Canonical civilization state is unavailable.");
  }

  return { world: latestWorld, revision: latestRow.revision };
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

    return Response.json(
      {
        world: snapshot.world,
        revision: snapshot.revision,
        serverTime,
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
