import { getD1 } from "@/db";
import {
  PLANET_CATALOG_VERSION,
  PLANET_SCHEMA_VERSION,
  catchUpPlanet,
  createPlanetWorld,
  generatePlanetChunk,
  getResourceCatalog,
  getPlanetSummary,
  getViewportSnapshot,
  normalizePlanetWorld,
  validatePlanetWorld,
} from "@/app/simulation/planet";
import {
  PLANET_CHUNKS_X,
  PLANET_CHUNK_SIZE,
  coordinateChunkKey,
  coordinateToChunk,
  coordinateToLogical,
  logicalToCoordinate,
  sampleTerrain,
} from "@/app/simulation/planet/geography";
import type {
  GeographicBounds,
  PlanetAgent,
  PlanetCoordinate,
  PlanetHistoryEvent,
  PlanetSummary,
  PlanetViewportSnapshot,
  PlanetWorldState,
  ResourceSite,
  SettlementState,
  TerrainSample,
} from "@/app/simulation/planet/types";
import {
  MAX_PLANET_RESPONSE_BYTES,
  decodePlanetPayload,
  encodePlanetPayload,
  packPlanetItems,
  utf8ByteLength,
} from "./planet-codec";
import { ensurePlanetSchema } from "./planet-schema";
import {
  applyPreparedPlanetCounsel,
  finalizePlanetAiCounsel,
  planetAiCounselStatus,
  preparePlanetAiCounsel,
  type PreparedPlanetCounsel,
} from "./planet-ai";

export const PLANET_WORLD_ID = "canonical-era-3";
export { PLANET_CATALOG_VERSION };
export const PLANET_HISTORY_CHAPTER_DAYS = 200;
export const PLANET_NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  "CDN-Cache-Control": "no-store",
};

const PLANET_SEED = "wildgrid-planet-era-3";
const ARCHIVE_WORLD_ID = "canonical";
// UI polling can happen every few seconds. Publishing no more than twice per
// minute avoids rewriting a 10,000-agent checkpoint for presentation-only
// refreshes while the client interpolates the wall-clock pulse.
const MIN_CATCH_UP_MS = 30_000;
const MAX_CATCH_UP_SECONDS_PER_REQUEST = 600;
// catchUpPlanet applies this per internal batch (up to 64), for an absolute
// ceiling of 32,000 scheduled events in one Worker request.
const MAX_CATCH_UP_EVENTS = 500;
const MAX_CAS_ATTEMPTS = 3;
const ENTITY_QUERY_PAGE = 32;
const HISTORY_TAIL_LIMIT = 1_000;
const STAGING_BATCH_SIZE = 48;
const EVENT_BIND_TARGET_BYTES = 320_000;

type Database = ReturnType<typeof getD1>;
type Statement = ReturnType<Database["prepare"]>;

export type PlanetEntityKind =
  | "agent"
  | "settlement"
  | "polity"
  | "belief"
  | "institution"
  | "proposal"
  | "project";

type ShardedEntityKind =
  | Exclude<PlanetEntityKind, "settlement">
  | "diplomatic_relation"
  | "scheduled_event";

interface PlanetWorldRow {
  id: string;
  schemaVersion: number;
  catalogVersion: string;
  seed: string;
  status: "active" | "paused" | "archived";
  revision: number;
  stateRevision: number;
  currentCommitId: string;
  manifestJson: string;
  manifestBytes: number;
  simulatedAtMs: number;
  archiveWorldId: string | null;
}

interface PayloadRow {
  payloadJson: string;
  checksum: string;
}

interface EntityShardRow extends PayloadRow {
  kind: ShardedEntityKind;
  shardId: string;
}

interface RegionShardRow extends PayloadRow {
  regionKey: string;
  part: number;
}

interface EventRow {
  eventJson: string;
}

interface EntityIndexRow {
  shardId: string;
}

interface PersistedManifest {
  format: "wildgrid-planet-manifest-v1";
  schemaVersion: number;
  seed: number;
  seedLabel: string;
  time: number;
  day: number;
  stateRevision: number;
  stats: PlanetWorldState["stats"];
  nextIds: PlanetWorldState["nextIds"];
  counts: {
    agents: number;
    settlements: number;
    polities: number;
    beliefs: number;
    institutions: number;
    proposals: number;
    diplomaticRelations: number;
    projects: number;
    scheduledEvents: number;
    modifiedRegions: number;
  };
  archive: PlanetArchiveLink;
}

interface EntityShardPayload {
  kind: ShardedEntityKind;
  items: unknown[];
}

type RegionRecord =
  | { collection: "regionIndex"; key: string; value: PlanetWorldState["regionIndex"][string] }
  | { collection: "territoryOwners"; key: string; value: string }
  | { collection: "territoryDisputes"; key: string; value: PlanetWorldState["territoryDisputes"][string] }
  | { collection: "modifiedResourceSites"; key: string; value: ResourceSite };

interface RegionShardPayload {
  regionKey: string;
  records: RegionRecord[];
}

interface CheckpointReference {
  row: PlanetWorldRow;
  world: PlanetWorldState;
}

interface PreparedCheckpoint {
  commitId: string;
  manifest: Awaited<ReturnType<typeof encodePlanetPayload>>;
  statements: Statement[];
  eventBatches: string[];
}

export interface PlanetArchiveLink {
  era: 2;
  label: "Era II";
  worldId: string;
  preserved: true;
  archiveApi: string;
  historyApi: string;
  archivePage: string;
}

export interface AuthoritativePlanetSnapshot extends CheckpointReference {
  serverTime: number;
  processedSeconds: number;
  pendingSeconds: number;
  caughtUp: boolean;
}

export interface CompactPlanetAgent {
  id: string;
  name: string;
  alive: boolean;
  coordinate: PlanetCoordinate;
  homeSettlementId: string | null;
  polityId: string | null;
  beliefId: string | null;
  influence: number;
  health: number;
  currentGoal: null | {
    id: string;
    purpose: string;
    status: string;
    targetId: string | null;
  };
}

export interface BoundedViewport {
  revision: number;
  stateRevision: number;
  day: number;
  bounds: GeographicBounds;
  zoom: number;
  agents: CompactPlanetAgent[];
  agentClusters: PlanetViewportSnapshot["agentClusters"];
  settlements: Array<{
    id: string;
    name: string;
    coordinate: PlanetCoordinate;
    polityId: string;
    population: number;
    capabilities: string[];
  }>;
  territory: PlanetViewportSnapshot["territory"];
  disputes: PlanetViewportSnapshot["disputes"];
  beliefInfluence: PlanetViewportSnapshot["beliefInfluence"];
  terrain: Array<Pick<
    TerrainSample,
    "coordinate" | "elevation" | "temperature" | "rainfall" | "fertility" | "biome" | "ocean"
  >>;
  resourceSites: Array<{
    id: string;
    resourceId: string;
    coordinate: PlanetCoordinate;
    reserve: number;
    capacity: number;
    discovered: boolean;
    extractionFacilityId: string | null;
  }>;
  resourceCells: Array<{
    coordinate: PlanetCoordinate;
    resources: Record<string, number>;
  }>;
  polities: Array<{
    id: string;
    name: string;
    color: string;
    population: number;
    settlements: number;
  }>;
  beliefs: Array<{
    id: string;
    name: string;
    color: string;
    kind: string;
    adherents: number;
    influence: number;
    coreValues: string[];
    tenets: string[];
    founderAgentId: string;
    founderName: string | null;
    originSettlementId: string | null;
    originName: string | null;
    originDay: number;
    parentBeliefId: string | null;
    active: boolean;
    reforms: Array<{ day: number; summary: string }>;
    schisms: number;
  }>;
  diplomacy: Array<{
    id: string;
    kind: string;
    title: string;
    polityId: string | null;
    counterpartyIds: string[];
    status: string;
  }>;
  conflicts: Array<{
    id: string;
    title: string;
    polityId: string | null;
    counterpartyIds: string[];
    status: string;
  }>;
  chronicle: Array<Pick<
    PlanetHistoryEvent,
    "id" | "at" | "day" | "type" | "title" | "summary" | "importance" | "coordinate"
  >>;
  truncated: {
    agents: boolean;
    clusters: boolean;
    settlements: boolean;
    territory: boolean;
    disputes: boolean;
    terrain: boolean;
    resourceSites: boolean;
    resourceCells: boolean;
    chronicle: boolean;
  };
  sourceCounts: {
    agents: number;
    clusters: number;
    settlements: number;
    territory: number;
    disputes: number;
    terrain: number;
    resourceSites: number;
    resourceCells: number;
    chronicle: number;
  };
}

const ARCHIVE_LINK: PlanetArchiveLink = {
  era: 2,
  label: "Era II",
  worldId: ARCHIVE_WORLD_ID,
  preserved: true,
  archiveApi: "/api/world?view=archive",
  historyApi: "/api/world?view=history",
  archivePage: "/archive",
};

const SELECT_WORLD_SQL = `
  SELECT
    id,
    schema_version AS schemaVersion,
    catalog_version AS catalogVersion,
    seed,
    status,
    revision,
    state_revision AS stateRevision,
    current_commit_id AS currentCommitId,
    manifest_json AS manifestJson,
    manifest_bytes AS manifestBytes,
    simulated_at_ms AS simulatedAtMs,
    archive_world_id AS archiveWorldId
  FROM planet_worlds
  WHERE id = ?
`;

const INSERT_WORLD_SQL = `
  INSERT OR IGNORE INTO planet_worlds (
    id, era, schema_version, catalog_version, seed, status, revision,
    state_revision, current_commit_id, manifest_json, manifest_bytes,
    simulated_at_ms, archive_world_id
  ) VALUES (?, 3, ?, ?, ?, 'active', 0, ?, ?, ?, ?, ?, ?)
`;

const CAS_WORLD_SQL = `
  UPDATE planet_worlds
  SET
    schema_version = ?,
    catalog_version = ?,
    seed = ?,
    revision = ?,
    state_revision = ?,
    current_commit_id = ?,
    manifest_json = ?,
    manifest_bytes = ?,
    simulated_at_ms = ?,
    updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
    AND revision = ?
    AND current_commit_id = ?
    AND status = 'active'
`;

const INSERT_REGION_SHARD_SQL = `
  INSERT OR IGNORE INTO planet_region_shards (
    world_id, commit_id, region_key, part, revision, chunk_x, chunk_y,
    payload_json, payload_bytes, checksum
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

const INSERT_ENTITY_SHARD_SQL = `
  INSERT OR IGNORE INTO planet_entity_shards (
    world_id, commit_id, kind, shard_id, revision, entity_count,
    payload_json, payload_bytes, checksum
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

const INSERT_ENTITY_INDEX_SQL = `
  INSERT OR IGNORE INTO planet_entity_index (
    world_id, commit_id, kind, entity_id, shard_id, region_key,
    longitude, latitude, revision
  )
  SELECT
    json_extract(value, '$.worldId'),
    json_extract(value, '$.commitId'),
    json_extract(value, '$.kind'),
    json_extract(value, '$.entityId'),
    json_extract(value, '$.shardId'),
    json_extract(value, '$.regionKey'),
    json_extract(value, '$.longitude'),
    json_extract(value, '$.latitude'),
    json_extract(value, '$.revision')
  FROM json_each(?)
`;

const INSERT_SETTLEMENT_SHARD_SQL = `
  INSERT OR IGNORE INTO planet_settlement_shards (
    world_id, commit_id, shard_id, revision, settlement_count,
    payload_json, payload_bytes, checksum
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`;

const INSERT_SETTLEMENT_INDEX_SQL = `
  INSERT OR IGNORE INTO planet_settlement_index (
    world_id, commit_id, settlement_id, shard_id, region_key,
    longitude, latitude, revision
  )
  SELECT
    json_extract(value, '$.worldId'),
    json_extract(value, '$.commitId'),
    json_extract(value, '$.settlementId'),
    json_extract(value, '$.shardId'),
    json_extract(value, '$.regionKey'),
    json_extract(value, '$.longitude'),
    json_extract(value, '$.latitude'),
    json_extract(value, '$.revision')
  FROM json_each(?)
`;

const INSERT_EVENTS_SQL = `
  INSERT OR IGNORE INTO planet_events (
    world_id, event_id, revision, occurred_at, day, event_type,
    importance, fingerprint, event_json
  )
  SELECT
    json_extract(value, '$.worldId'),
    json_extract(value, '$.eventId'),
    json_extract(value, '$.revision'),
    json_extract(value, '$.occurredAt'),
    json_extract(value, '$.day'),
    json_extract(value, '$.eventType'),
    json_extract(value, '$.importance'),
    json_extract(value, '$.fingerprint'),
    json_extract(value, '$.eventJson')
  FROM json_each(?)
  WHERE EXISTS (
    SELECT 1 FROM planet_worlds
    WHERE id = ? AND revision = ? AND current_commit_id = ?
  )
`;

function finite(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function safeInteger(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) ? numeric : fallback;
}

function changes(result: unknown): number {
  if (!result || typeof result !== "object") return 0;
  const meta = (result as { meta?: { changes?: unknown } }).meta;
  return Math.max(0, safeInteger(meta?.changes));
}

function rows<T>(result: unknown): T[] {
  if (!result || typeof result !== "object") return [];
  const found = (result as { results?: unknown }).results;
  return Array.isArray(found) ? (found as T[]) : [];
}

async function runInBatches(database: Database, statements: Statement[]): Promise<void> {
  for (let offset = 0; offset < statements.length; offset += STAGING_BATCH_SIZE) {
    await database.batch(statements.slice(offset, offset + STAGING_BATCH_SIZE));
  }
}

function readCoordinate(value: unknown): PlanetCoordinate | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as { coordinate?: Partial<PlanetCoordinate> };
  const longitude = Number(candidate.coordinate?.longitude);
  const latitude = Number(candidate.coordinate?.latitude);
  if (
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude) ||
    longitude < -180 ||
    longitude > 180 ||
    latitude < -90 ||
    latitude > 90
  ) {
    return null;
  }
  return { longitude, latitude };
}

function entityId(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const id = (value as { id?: unknown }).id;
  return typeof id === "string" && id.length > 0 && id.length <= 160 ? id : null;
}

function parseChunkKey(key: string): { x: number; y: number } | null {
  const match = /^(\d+):(\d+)$/.exec(key);
  if (!match) return null;
  const x = Number(match[1]);
  const y = Number(match[2]);
  return Number.isSafeInteger(x) && Number.isSafeInteger(y) ? { x, y } : null;
}

function territoryChunkKey(cellKey: string): string {
  const cell = parseChunkKey(cellKey);
  if (!cell) return "global";
  return coordinateChunkKey({
    longitude: -179 + cell.x * 2,
    latitude: 89 - cell.y * 2,
  });
}

function manifestFor(world: PlanetWorldState): PersistedManifest {
  return {
    format: "wildgrid-planet-manifest-v1",
    schemaVersion: PLANET_SCHEMA_VERSION,
    seed: world.seed,
    seedLabel: world.seedLabel,
    time: world.time,
    day: world.day,
    stateRevision: world.revision,
    stats: world.stats,
    nextIds: world.nextIds,
    counts: {
      agents: world.agents.length,
      settlements: world.settlements.length,
      polities: world.polities.length,
      beliefs: world.beliefs.length,
      institutions: world.institutions.length,
      proposals: world.proposals.length,
      diplomaticRelations: Object.keys(world.diplomacy).length,
      projects: world.projects.length,
      scheduledEvents: world.scheduler.length,
      modifiedRegions: Object.keys(world.regionIndex).length,
    },
    archive: ARCHIVE_LINK,
  };
}

function isManifest(value: unknown): value is PersistedManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const manifest = value as Partial<PersistedManifest>;
  return manifest.format === "wildgrid-planet-manifest-v1" &&
    manifest.schemaVersion === PLANET_SCHEMA_VERSION &&
    Number.isFinite(manifest.seed) &&
    typeof manifest.seedLabel === "string" &&
    Number.isFinite(manifest.time) &&
    Number.isFinite(manifest.day) &&
    Number.isSafeInteger(manifest.stateRevision) &&
    Boolean(manifest.stats) &&
    Boolean(manifest.nextIds) &&
    Boolean(manifest.counts);
}

function eventInsertRecords(
  events: readonly PlanetHistoryEvent[],
  revision: number,
): Array<Record<string, unknown>> {
  return [...events]
    .sort((left, right) => left.at - right.at || left.id.localeCompare(right.id))
    .map((event) => ({
      worldId: PLANET_WORLD_ID,
      eventId: event.id,
      revision,
      occurredAt: event.at,
      day: event.day,
      eventType: event.type,
      importance: event.importance,
      fingerprint: event.fingerprint,
      eventJson: JSON.stringify(event),
    }));
}

function packEventBinds(
  events: readonly PlanetHistoryEvent[],
  revision: number,
): string[] {
  return packPlanetItems(eventInsertRecords(events, revision), EVENT_BIND_TARGET_BYTES)
    .map((batch) => JSON.stringify(batch));
}

async function prepareCheckpoint(
  database: Database,
  world: PlanetWorldState,
  storageRevision: number,
): Promise<PreparedCheckpoint> {
  const commitId = crypto.randomUUID();
  const manifest = await encodePlanetPayload(manifestFor(world));
  const statements: Statement[] = [];
  const entityIndexRows: Array<Record<string, unknown>> = [];
  const settlementIndexRows: Array<Record<string, unknown>> = [];
  const collections: Array<{ kind: ShardedEntityKind; items: unknown[] }> = [
    { kind: "agent", items: world.agents },
    { kind: "polity", items: world.polities },
    { kind: "belief", items: world.beliefs },
    { kind: "institution", items: world.institutions },
    { kind: "proposal", items: world.proposals },
    {
      kind: "diplomatic_relation",
      items: Object.values(world.diplomacy).map((relation) => ({
        id: relation.key,
        ...relation,
      })),
    },
    { kind: "project", items: world.projects },
    { kind: "scheduled_event", items: world.scheduler },
  ];

  for (const collection of collections) {
    const sorted = [...collection.items].sort((left, right) =>
      (entityId(left) ?? "").localeCompare(entityId(right) ?? "")
    );
    const parts = packPlanetItems(sorted);
    for (let part = 0; part < parts.length; part += 1) {
      const shardId = `${collection.kind}-${String(part).padStart(4, "0")}`;
      const encoded = await encodePlanetPayload({
        kind: collection.kind,
        items: parts[part],
      } satisfies EntityShardPayload);
      statements.push(
        database
          .prepare(INSERT_ENTITY_SHARD_SQL)
          .bind(
            PLANET_WORLD_ID,
            commitId,
            collection.kind,
            shardId,
            storageRevision,
            parts[part].length,
            encoded.stored,
            encoded.storedBytes,
            encoded.checksum,
          ),
      );

      if (
        collection.kind !== "scheduled_event" &&
        collection.kind !== "diplomatic_relation"
      ) {
        for (const item of parts[part]) {
          const id = entityId(item);
          if (!id) throw new Error(`A ${collection.kind} record had no stable id.`);
          const coordinate = readCoordinate(item);
          entityIndexRows.push({
            worldId: PLANET_WORLD_ID,
            commitId,
            kind: collection.kind,
            entityId: id,
            shardId,
            regionKey: coordinate ? coordinateChunkKey(coordinate) : null,
            longitude: coordinate?.longitude ?? null,
            latitude: coordinate?.latitude ?? null,
            revision: storageRevision,
          });
        }
      }
    }
  }

  const settlements = [...world.settlements].sort((left, right) =>
    left.id.localeCompare(right.id)
  );
  const settlementParts = packPlanetItems(settlements);
  for (let part = 0; part < settlementParts.length; part += 1) {
    const shardId = `settlement-${String(part).padStart(4, "0")}`;
    const encoded = await encodePlanetPayload({ items: settlementParts[part] });
    statements.push(
      database
        .prepare(INSERT_SETTLEMENT_SHARD_SQL)
        .bind(
          PLANET_WORLD_ID,
          commitId,
          shardId,
          storageRevision,
          settlementParts[part].length,
          encoded.stored,
          encoded.storedBytes,
          encoded.checksum,
        ),
    );
    for (const settlement of settlementParts[part]) {
      settlementIndexRows.push({
        worldId: PLANET_WORLD_ID,
        commitId,
        settlementId: settlement.id,
        shardId,
        regionKey: coordinateChunkKey(settlement.coordinate),
        longitude: settlement.coordinate.longitude,
        latitude: settlement.coordinate.latitude,
        revision: storageRevision,
      });
    }
  }

  for (const part of packPlanetItems(entityIndexRows, EVENT_BIND_TARGET_BYTES)) {
    statements.push(database.prepare(INSERT_ENTITY_INDEX_SQL).bind(JSON.stringify(part)));
  }
  for (const part of packPlanetItems(settlementIndexRows, EVENT_BIND_TARGET_BYTES)) {
    statements.push(database.prepare(INSERT_SETTLEMENT_INDEX_SQL).bind(JSON.stringify(part)));
  }

  const regionRecords = new Map<string, RegionRecord[]>();
  const appendRegion = (regionKey: string, record: RegionRecord) => {
    const records = regionRecords.get(regionKey) ?? [];
    records.push(record);
    regionRecords.set(regionKey, records);
  };
  for (const [key, value] of Object.entries(world.regionIndex)) {
    appendRegion(key, { collection: "regionIndex", key, value });
  }
  for (const [key, value] of Object.entries(world.territoryOwners)) {
    appendRegion(territoryChunkKey(key), {
      collection: "territoryOwners",
      key,
      value,
    });
  }
  for (const [key, value] of Object.entries(world.territoryDisputes)) {
    appendRegion(territoryChunkKey(key), {
      collection: "territoryDisputes",
      key,
      value,
    });
  }
  for (const [key, value] of Object.entries(world.modifiedResourceSites)) {
    appendRegion(coordinateChunkKey(value.coordinate), {
      collection: "modifiedResourceSites",
      key,
      value,
    });
  }

  for (const [regionKey, records] of [...regionRecords].sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    const chunk = parseChunkKey(regionKey);
    const parts = packPlanetItems(records);
    for (let part = 0; part < parts.length; part += 1) {
      const encoded = await encodePlanetPayload({
        regionKey,
        records: parts[part],
      } satisfies RegionShardPayload);
      statements.push(
        database
          .prepare(INSERT_REGION_SHARD_SQL)
          .bind(
            PLANET_WORLD_ID,
            commitId,
            regionKey,
            part,
            storageRevision,
            chunk?.x ?? null,
            chunk?.y ?? null,
            encoded.stored,
            encoded.storedBytes,
            encoded.checksum,
          ),
      );
    }
  }

  return {
    commitId,
    manifest,
    statements,
    eventBatches: packEventBinds(world.history, storageRevision),
  };
}

async function stageCheckpoint(
  database: Database,
  checkpoint: PreparedCheckpoint,
): Promise<void> {
  await runInBatches(database, checkpoint.statements);
}

function eventStatements(
  database: Database,
  eventBatches: readonly string[],
  revision: number,
  commitId: string,
): Statement[] {
  return eventBatches.map((batch) =>
    database
      .prepare(INSERT_EVENTS_SQL)
      .bind(batch, PLANET_WORLD_ID, revision, commitId)
  );
}

async function seedPlanet(database: Database, now: number): Promise<void> {
  const world = createPlanetWorld(PLANET_SEED, {
    initialAgentCount: 10,
    initialSettlementCount: 10,
  });
  const checkpoint = await prepareCheckpoint(database, world, 0);
  await stageCheckpoint(database, checkpoint);
  await database.batch([
    database
      .prepare(INSERT_WORLD_SQL)
      .bind(
        PLANET_WORLD_ID,
        PLANET_SCHEMA_VERSION,
        PLANET_CATALOG_VERSION,
        String(world.seed),
        world.revision,
        checkpoint.commitId,
        checkpoint.manifest.stored,
        checkpoint.manifest.storedBytes,
        now,
        ARCHIVE_WORLD_ID,
      ),
    ...eventStatements(database, checkpoint.eventBatches, 0, checkpoint.commitId),
  ]);
}

async function selectWorld(database: Database): Promise<PlanetWorldRow | null> {
  return database
    .prepare(SELECT_WORLD_SQL)
    .bind(PLANET_WORLD_ID)
    .first<PlanetWorldRow>();
}

async function ensureWorld(database: Database, now: number): Promise<PlanetWorldRow> {
  await ensurePlanetSchema(database);
  const existing = await selectWorld(database);
  if (existing) return existing;
  await seedPlanet(database, now);
  const seeded = await selectWorld(database);
  if (!seeded) throw new Error("The Era III planet could not be initialized.");
  return seeded;
}

async function loadAllEntityShards(
  database: Database,
  row: PlanetWorldRow,
): Promise<Record<ShardedEntityKind, unknown[]>> {
  const result: Record<ShardedEntityKind, unknown[]> = {
    agent: [],
    polity: [],
    belief: [],
    institution: [],
    proposal: [],
    project: [],
    diplomatic_relation: [],
    scheduled_event: [],
  };
  let offset = 0;
  while (true) {
    const query = await database
      .prepare(`
        SELECT kind, shard_id AS shardId, payload_json AS payloadJson, checksum
        FROM planet_entity_shards
        WHERE world_id = ? AND commit_id = ?
        ORDER BY kind ASC, shard_id ASC
        LIMIT ? OFFSET ?
      `)
      .bind(PLANET_WORLD_ID, row.currentCommitId, ENTITY_QUERY_PAGE, offset)
      .all<EntityShardRow>();
    const page = rows<EntityShardRow>(query);
    for (const shard of page) {
      const decoded = await decodePlanetPayload(shard.payloadJson, shard.checksum);
      if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
        throw new Error("An entity shard had an invalid envelope.");
      }
      const payload = decoded as Partial<EntityShardPayload>;
      if (payload.kind !== shard.kind || !Array.isArray(payload.items)) {
        throw new Error("An entity shard did not match its index.");
      }
      result[shard.kind].push(...payload.items);
    }
    if (page.length < ENTITY_QUERY_PAGE) break;
    offset += page.length;
  }
  return result;
}

async function loadSettlementShards(
  database: Database,
  row: PlanetWorldRow,
): Promise<SettlementState[]> {
  const query = await database
    .prepare(`
      SELECT payload_json AS payloadJson, checksum
      FROM planet_settlement_shards
      WHERE world_id = ? AND commit_id = ?
      ORDER BY shard_id ASC
    `)
    .bind(PLANET_WORLD_ID, row.currentCommitId)
    .all<PayloadRow>();
  const settlements: SettlementState[] = [];
  for (const shard of rows<PayloadRow>(query)) {
    const decoded = await decodePlanetPayload(shard.payloadJson, shard.checksum);
    if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
      throw new Error("A settlement shard had an invalid envelope.");
    }
    const items = (decoded as { items?: unknown }).items;
    if (!Array.isArray(items)) throw new Error("A settlement shard had no items.");
    settlements.push(...(items as SettlementState[]));
  }
  return settlements;
}

async function loadRegionShards(
  database: Database,
  row: PlanetWorldRow,
): Promise<Pick<
  PlanetWorldState,
  "regionIndex" | "territoryOwners" | "territoryDisputes" | "modifiedResourceSites"
>> {
  const query = await database
    .prepare(`
      SELECT region_key AS regionKey, part, payload_json AS payloadJson, checksum
      FROM planet_region_shards
      WHERE world_id = ? AND commit_id = ?
      ORDER BY region_key ASC, part ASC
    `)
    .bind(PLANET_WORLD_ID, row.currentCommitId)
    .all<RegionShardRow>();
  const output: Pick<
    PlanetWorldState,
    "regionIndex" | "territoryOwners" | "territoryDisputes" | "modifiedResourceSites"
  > = {
    regionIndex: {},
    territoryOwners: {},
    territoryDisputes: {},
    modifiedResourceSites: {},
  };
  for (const shard of rows<RegionShardRow>(query)) {
    const decoded = await decodePlanetPayload(shard.payloadJson, shard.checksum);
    if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
      throw new Error("A region shard had an invalid envelope.");
    }
    const payload = decoded as Partial<RegionShardPayload>;
    if (payload.regionKey !== shard.regionKey || !Array.isArray(payload.records)) {
      throw new Error("A region shard did not match its index.");
    }
    for (const record of payload.records) {
      if (record.collection === "regionIndex") output.regionIndex[record.key] = record.value;
      else if (record.collection === "territoryOwners") output.territoryOwners[record.key] = record.value;
      else if (record.collection === "territoryDisputes") output.territoryDisputes[record.key] = record.value;
      else if (record.collection === "modifiedResourceSites") output.modifiedResourceSites[record.key] = record.value;
    }
  }
  return output;
}

async function loadHistoryTail(
  database: Database,
  revision: number,
): Promise<PlanetHistoryEvent[]> {
  const query = await database
    .prepare(`
      SELECT event_json AS eventJson
      FROM planet_events
      WHERE world_id = ? AND revision <= ?
      ORDER BY occurred_at DESC, event_id DESC
      LIMIT ?
    `)
    .bind(PLANET_WORLD_ID, revision, HISTORY_TAIL_LIMIT)
    .all<EventRow>();
  const history: PlanetHistoryEvent[] = [];
  for (const row of rows<EventRow>(query).reverse()) {
    try {
      const event = JSON.parse(row.eventJson) as PlanetHistoryEvent;
      if (event && typeof event.id === "string") history.push(event);
    } catch {
      // One malformed historical event must not make the living planet vanish.
    }
  }
  return history;
}

async function loadPlanet(
  database: Database,
  row: PlanetWorldRow,
): Promise<PlanetWorldState> {
  if (
    row.schemaVersion !== PLANET_SCHEMA_VERSION ||
    !Number.isSafeInteger(row.revision) ||
    row.revision < 0 ||
    !Number.isSafeInteger(row.simulatedAtMs) ||
    row.simulatedAtMs <= 0 ||
    utf8ByteLength(row.manifestJson) !== row.manifestBytes
  ) {
    throw new Error("The Era III manifest is incompatible.");
  }
  const decodedManifest = await decodePlanetPayload(row.manifestJson);
  if (!isManifest(decodedManifest)) {
    throw new Error("The Era III manifest is invalid.");
  }
  const [entities, settlements, regions, history] = await Promise.all([
    loadAllEntityShards(database, row),
    loadSettlementShards(database, row),
    loadRegionShards(database, row),
    loadHistoryTail(database, row.revision),
  ]);
  const world = normalizePlanetWorld({
    schemaVersion: PLANET_SCHEMA_VERSION,
    seed: decodedManifest.seed,
    seedLabel: decodedManifest.seedLabel,
    time: decodedManifest.time,
    day: decodedManifest.day,
    revision: decodedManifest.stateRevision,
    agents: entities.agent,
    settlements,
    polities: entities.polity,
    beliefs: entities.belief,
    institutions: entities.institution,
    proposals: entities.proposal,
    diplomacy: Object.fromEntries(
      entities.diplomatic_relation
        .filter((value): value is { key: string } =>
          Boolean(value) &&
          typeof value === "object" &&
          !Array.isArray(value) &&
          typeof (value as { key?: unknown }).key === "string"
        )
        .map((relation) => [relation.key, relation]),
    ),
    projects: entities.project,
    territoryOwners: regions.territoryOwners,
    territoryDisputes: regions.territoryDisputes,
    modifiedResourceSites: regions.modifiedResourceSites,
    regionIndex: regions.regionIndex,
    scheduler: entities.scheduled_event,
    history,
    stats: decodedManifest.stats,
    nextIds: decodedManifest.nextIds,
  });
  if (!validatePlanetWorld(world)) {
    throw new Error("The reconstructed Era III planet failed validation.");
  }
  return world;
}

async function loadCheckpoint(database: Database, now: number): Promise<CheckpointReference> {
  const row = await ensureWorld(database, now);
  return { row, world: await loadPlanet(database, row) };
}

async function publishCheckpoint(
  database: Database,
  previous: PlanetWorldRow,
  world: PlanetWorldState,
  simulatedAtMs: number,
): Promise<boolean> {
  const nextRevision = previous.revision + 1;
  const checkpoint = await prepareCheckpoint(database, world, nextRevision);
  await stageCheckpoint(database, checkpoint);
  const finalStatements = [
    database
      .prepare(CAS_WORLD_SQL)
      .bind(
        PLANET_SCHEMA_VERSION,
        PLANET_CATALOG_VERSION,
        String(world.seed),
        nextRevision,
        world.revision,
        checkpoint.commitId,
        checkpoint.manifest.stored,
        checkpoint.manifest.storedBytes,
        simulatedAtMs,
        PLANET_WORLD_ID,
        previous.revision,
        previous.currentCommitId,
      ),
    ...eventStatements(
      database,
      checkpoint.eventBatches,
      nextRevision,
      checkpoint.commitId,
    ),
  ];
  const results = await database.batch(finalStatements);
  const published = changes(results[0]) === 1;
  if (published && nextRevision > 3) {
    // Commit-addressed rows are immutable. Retain the current and two previous
    // checkpoints for diagnosis, and remove only obsolete Era III shards. The
    // permanent event ledger, chapters, catalogs, and all Era II tables remain
    // untouched.
    const oldestRevisionToKeep = nextRevision - 2;
    try {
      await database.batch([
        database.prepare(
          "DELETE FROM planet_region_shards WHERE world_id = ? AND revision < ?",
        ).bind(PLANET_WORLD_ID, oldestRevisionToKeep),
        database.prepare(
          "DELETE FROM planet_entity_shards WHERE world_id = ? AND revision < ?",
        ).bind(PLANET_WORLD_ID, oldestRevisionToKeep),
        database.prepare(
          "DELETE FROM planet_entity_index WHERE world_id = ? AND revision < ?",
        ).bind(PLANET_WORLD_ID, oldestRevisionToKeep),
        database.prepare(
          "DELETE FROM planet_settlement_shards WHERE world_id = ? AND revision < ?",
        ).bind(PLANET_WORLD_ID, oldestRevisionToKeep),
        database.prepare(
          "DELETE FROM planet_settlement_index WHERE world_id = ? AND revision < ?",
        ).bind(PLANET_WORLD_ID, oldestRevisionToKeep),
      ]);
    } catch {
      // Cleanup is opportunistic; a durable newly published commit must not be
      // reported as failed because old, unreachable checkpoint rows remain.
    }
  }
  return published;
}

export async function authoritativePlanet(
  serverTime = Date.now(),
): Promise<AuthoritativePlanetSnapshot> {
  const database = getD1();
  await ensurePlanetSchema(database);
  let preparedCounsel: PreparedPlanetCounsel | null | undefined;

  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
    const snapshot = await loadCheckpoint(database, serverTime);
    if (snapshot.row.status !== "active") {
      return {
        ...snapshot,
        serverTime,
        processedSeconds: 0,
        pendingSeconds: 0,
        caughtUp: true,
      };
    }
    const pendingMs = Math.max(0, serverTime - snapshot.row.simulatedAtMs);
    if (pendingMs < MIN_CATCH_UP_MS) {
      return {
        ...snapshot,
        serverTime,
        processedSeconds: 0,
        pendingSeconds: pendingMs / 1_000,
        caughtUp: pendingMs === 0,
      };
    }

    const requestedSeconds = Math.min(
      pendingMs / 1_000,
      MAX_CATCH_UP_SECONDS_PER_REQUEST,
    );
    const beforeTime = snapshot.world.time;
    const result = catchUpPlanet(snapshot.world, requestedSeconds, {
      maxEvents: MAX_CATCH_UP_EVENTS,
    });
    const processedSeconds = Math.max(
      0,
      Math.min(requestedSeconds, finite(result.reachedTime) - beforeTime),
    );
    if (processedSeconds < 0.001) {
      return {
        ...snapshot,
        serverTime,
        processedSeconds: 0,
        pendingSeconds: pendingMs / 1_000,
        caughtUp: false,
      };
    }
    const simulatedAtMs = Math.min(
      serverTime,
      snapshot.row.simulatedAtMs + Math.round(processedSeconds * 1_000),
    );
    if (preparedCounsel === undefined) {
      preparedCounsel = await preparePlanetAiCounsel(
        database,
        snapshot.world,
        serverTime,
      );
    }
    const counselResult = preparedCounsel
      ? applyPreparedPlanetCounsel(snapshot.world, preparedCounsel)
      : null;
    if (
      await publishCheckpoint(
        database,
        snapshot.row,
        snapshot.world,
        simulatedAtMs,
      )
    ) {
      const publishedRow = await selectWorld(database);
      if (!publishedRow) throw new Error("The published planet manifest disappeared.");
      if (preparedCounsel) {
        try {
          await finalizePlanetAiCounsel(
            database,
            preparedCounsel,
            publishedRow.revision,
            counselResult && counselResult.acceptedAgentIds.length > 0
              ? "applied"
              : "rejected",
          );
        } catch {
          // Counsel is already part of the immutable checkpoint. A telemetry
          // failure must not make the living world appear unavailable.
        }
      }
      const pendingSeconds = Math.max(0, serverTime - simulatedAtMs) / 1_000;
      return {
        row: publishedRow,
        world: snapshot.world,
        serverTime,
        processedSeconds,
        pendingSeconds,
        caughtUp: pendingSeconds === 0,
      };
    }
  }
  const latest = await loadCheckpoint(database, serverTime);
  return {
    ...latest,
    serverTime,
    processedSeconds: 0,
    pendingSeconds: Math.max(0, serverTime - latest.row.simulatedAtMs) / 1_000,
    caughtUp: latest.row.simulatedAtMs >= serverTime,
  };
}

export async function currentPlanet(): Promise<CheckpointReference> {
  const database = getD1();
  await ensurePlanetSchema(database);
  return loadCheckpoint(database, Date.now());
}

export function publicPlanetManifest(snapshot: CheckpointReference) {
  return {
    id: snapshot.row.id,
    era: 3,
    schemaVersion: snapshot.row.schemaVersion,
    catalogVersion: snapshot.row.catalogVersion,
    seedLabel: snapshot.world.seedLabel,
    status: snapshot.row.status,
    revision: snapshot.row.revision,
    stateRevision: snapshot.world.revision,
    day: snapshot.world.day,
    simulatedAtMs: snapshot.row.simulatedAtMs,
    archive: ARCHIVE_LINK,
  } as const;
}

export function planetSummary(world: PlanetWorldState): PlanetSummary {
  return getPlanetSummary(world);
}

export function publicPlanetAiStatus(
  world: PlanetWorldState,
  serverTime = Date.now(),
) {
  return planetAiCounselStatus(getD1(), world, serverTime);
}

function compactAgent(agent: PlanetAgent): CompactPlanetAgent {
  const currentGoal = agent.mind.goals.find((goal) => goal.status === "active") ?? null;
  return {
    id: agent.id,
    name: agent.name,
    alive: agent.alive,
    coordinate: agent.coordinate,
    homeSettlementId: agent.homeSettlementId,
    polityId: agent.polityId,
    beliefId: agent.beliefId,
    influence: agent.influence,
    health: agent.needs.health,
    currentGoal: currentGoal
      ? {
          id: currentGoal.id,
          purpose: currentGoal.purpose,
          status: currentGoal.status,
          targetId: currentGoal.targetId,
        }
      : null,
  };
}

function take<T>(values: readonly T[], limit: number): T[] {
  return values.slice(0, Math.max(0, limit));
}

function longitudeInside(longitude: number, bounds: GeographicBounds): boolean {
  if (bounds.east - bounds.west >= 360) return true;
  return bounds.west <= bounds.east
    ? longitude >= bounds.west && longitude <= bounds.east
    : longitude >= bounds.west || longitude <= bounds.east;
}

function coordinateInside(coordinate: PlanetCoordinate, bounds: GeographicBounds): boolean {
  return coordinate.latitude >= bounds.south &&
    coordinate.latitude <= bounds.north &&
    longitudeInside(coordinate.longitude, bounds);
}

function sampleViewportTerrain(
  world: PlanetWorldState,
  bounds: GeographicBounds,
  zoom: number,
): BoundedViewport["terrain"] {
  const columns = zoom < 3 ? 48 : zoom < 7 ? 36 : 28;
  const rows = Math.max(12, Math.round(columns / 2));
  const longitudeSpan = bounds.east - bounds.west >= 360
    ? 360
    : bounds.west <= bounds.east
      ? bounds.east - bounds.west
      : 360 - bounds.west + bounds.east;
  const latitudeSpan = bounds.north - bounds.south;
  const terrain: BoundedViewport["terrain"] = [];
  for (let row = 0; row < rows; row += 1) {
    const latitude = bounds.north - ((row + 0.5) / rows) * latitudeSpan;
    for (let column = 0; column < columns; column += 1) {
      let longitude = bounds.west + ((column + 0.5) / columns) * longitudeSpan;
      if (longitude > 180) longitude -= 360;
      const logical = coordinateToLogical({ longitude, latitude });
      const sample = sampleTerrain(world.seed, logical.x, logical.y);
      terrain.push({
        coordinate: sample.coordinate,
        elevation: sample.elevation,
        temperature: sample.temperature,
        rainfall: sample.rainfall,
        fertility: sample.fertility,
        biome: sample.biome,
        ocean: sample.ocean,
      });
    }
  }
  return terrain;
}

function sampledChunks(bounds: GeographicBounds, maximum: number): Array<{ x: number; y: number }> {
  const all: Array<{ x: number; y: number }> = [];
  for (const range of boundsToChunkRanges(bounds)) {
    for (let y = range.minY; y <= range.maxY; y += 1) {
      for (let x = range.minX; x <= range.maxX; x += 1) all.push({ x, y });
    }
  }
  if (all.length <= maximum) return all;
  const selected: Array<{ x: number; y: number }> = [];
  const step = all.length / maximum;
  for (let index = 0; index < maximum; index += 1) {
    selected.push(all[Math.min(all.length - 1, Math.floor((index + 0.5) * step))]);
  }
  return selected;
}

function viewportResources(
  world: PlanetWorldState,
  bounds: GeographicBounds,
  zoom: number,
): Pick<BoundedViewport, "resourceSites" | "resourceCells"> {
  const definitions = getResourceCatalog();
  const familyById = new Map(definitions.map((definition) => [definition.id, definition.family]));
  const chunks = sampledChunks(bounds, zoom >= 6 ? 32 : 56);
  const resourceSites: BoundedViewport["resourceSites"] = [];
  const resourceCells: BoundedViewport["resourceCells"] = [];
  for (const chunkCoordinate of chunks) {
    const chunk = generatePlanetChunk(
      world.seed,
      chunkCoordinate.x,
      chunkCoordinate.y,
      definitions,
    );
    const sites = chunk.resourceSites
      .map((site) => world.modifiedResourceSites[site.id] ?? site)
      .filter((site) => coordinateInside(site.coordinate, bounds));
    if (zoom >= 6) {
      for (const site of sites) {
        resourceSites.push({
          id: site.id,
          resourceId: site.resourceId,
          coordinate: site.coordinate,
          reserve: site.reserve,
          capacity: site.capacity,
          discovered: site.discoveredBy.length > 0,
          extractionFacilityId: site.extractionFacilityId,
        });
        if (resourceSites.length >= 420) break;
      }
    } else {
      const resources: Record<string, number> = {};
      for (const site of sites) {
        const family = familyById.get(site.resourceId) ?? "unknown";
        resources[family] = (resources[family] ?? 0) + 1;
      }
      if (Object.keys(resources).length > 0) {
        resourceCells.push({
          coordinate: logicalToCoordinate(
            chunkCoordinate.x * PLANET_CHUNK_SIZE + PLANET_CHUNK_SIZE / 2,
            chunkCoordinate.y * PLANET_CHUNK_SIZE + PLANET_CHUNK_SIZE / 2,
          ),
          resources,
        });
      }
    }
  }
  return {
    resourceSites: resourceSites.slice(0, 420),
    resourceCells: resourceCells.slice(0, 80),
  };
}

function stablePolityColor(id: string): string {
  let hash = 2166136261;
  for (const character of id) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `hsl(${Math.abs(hash) % 360} 62% 58%)`;
}

/** Convert the engine viewport into a stable map contract with a hard payload budget. */
export function boundedViewport(
  world: PlanetWorldState,
  storageRevision: number,
  bounds: GeographicBounds,
  zoom: number,
): BoundedViewport {
  const source = getViewportSnapshot(world, bounds, zoom);
  const agentLimit = zoom >= 8 ? 600 : zoom >= 5 ? 250 : 0;
  const clusterLimit = zoom < 8 ? 320 : 96;
  const settlementLimit = zoom >= 5 ? 256 : 160;
  const territoryLimit = zoom >= 4 ? 2_000 : 900;
  const disputeLimit = 300;
  const terrain = sampleViewportTerrain(world, bounds, zoom);
  const resources = viewportResources(world, bounds, zoom);
  const chronicle = [...world.history]
    .sort((left, right) => right.at - left.at || right.importance - left.importance || left.id.localeCompare(right.id))
    .slice(0, 40)
    .map(({ id, at, day, type, title, summary, importance, coordinate }) => ({
      id,
      at,
      day,
      type,
      title,
      summary,
      importance,
      coordinate,
    }));
  const sourceCounts = {
    agents: source.agents.length,
    clusters: source.agentClusters.length,
    settlements: source.settlements.length,
    territory: source.territory.length,
    disputes: source.disputes.length,
    terrain: terrain.length,
    resourceSites: resources.resourceSites.length,
    resourceCells: resources.resourceCells.length,
    chronicle: world.history.length,
  };
  const output: BoundedViewport = {
    revision: storageRevision,
    stateRevision: source.revision,
    day: source.day,
    bounds: source.bounds,
    zoom: source.zoom,
    agents: take(source.agents, agentLimit).map(compactAgent),
    agentClusters: take(source.agentClusters, clusterLimit),
    settlements: take(source.settlements, settlementLimit).map((settlement) => ({
      id: settlement.id,
      name: settlement.name,
      coordinate: settlement.coordinate,
      polityId: settlement.polityId,
      population: settlement.residentIds.length,
      capabilities: settlement.capabilities.slice(0, 16),
    })),
    territory: take(source.territory, territoryLimit),
    disputes: take(source.disputes, disputeLimit),
    beliefInfluence: take(source.beliefInfluence, 200),
    terrain,
    resourceSites: resources.resourceSites,
    resourceCells: resources.resourceCells,
    polities: world.polities.slice(0, 256).map((polity) => ({
      id: polity.id,
      name: polity.name,
      color: stablePolityColor(polity.id),
      population: polity.citizenIds.length,
      settlements: polity.settlementIds.length,
    })),
    beliefs: world.beliefs.slice(0, 256).map((belief) => ({
      id: belief.id,
      name: belief.name,
      color: belief.color,
      kind: belief.kind,
      adherents: belief.adherentIds.length,
      influence: belief.influence,
      coreValues: belief.coreValues.slice(0, 8),
      tenets: belief.tenets.slice(0, 8),
      founderAgentId: belief.founderAgentId,
      founderName: world.agents.find((agent) => agent.id === belief.founderAgentId)?.name ?? null,
      originSettlementId: belief.originSettlementId,
      originName: belief.originSettlementId
        ? world.settlements.find((settlement) => settlement.id === belief.originSettlementId)?.name ?? null
        : null,
      originDay: belief.originDay,
      parentBeliefId: belief.parentBeliefId,
      active: belief.active,
      reforms: belief.reformHistory.slice(-5).map(({ day, summary }) => ({ day, summary })),
      schisms: belief.schismIds.length,
    })),
    diplomacy: [
      ...Object.values(world.diplomacy)
        .filter((relation) => relation.status === "alliance" || relation.status === "truce")
        .slice(-120)
        .map((relation) => ({
        id: relation.key,
        kind: relation.status === "truce" ? "peace" : "alliance",
        title: relation.status === "alliance" ? "Alliance" : relation.status === "truce" ? "Truce" : "Neutral relations",
        polityId: relation.polityIds[0] ?? null,
        counterpartyIds: relation.polityIds.slice(1),
        status: relation.status,
        })),
      ...world.proposals
        .filter((proposal) => proposal.kind === "trade" && proposal.status !== "rejected" && proposal.status !== "expired")
        .slice(-80)
        .map(({ id, kind, title, polityId, counterpartyIds, status }) => ({
          id,
          kind,
          title,
          polityId,
          counterpartyIds,
          status,
        })),
    ],
    conflicts: Object.values(world.diplomacy)
      .filter((relation) => relation.status === "war")
      .slice(-80)
      .map((relation) => ({
        id: relation.key,
        title: "Active war",
        polityId: relation.polityIds[0] ?? null,
        counterpartyIds: relation.polityIds.slice(1),
        status: relation.status,
      })),
    chronicle,
    truncated: {
      agents: sourceCounts.agents > agentLimit,
      clusters: sourceCounts.clusters > clusterLimit,
      settlements: sourceCounts.settlements > settlementLimit,
      territory: sourceCounts.territory > territoryLimit,
      disputes: sourceCounts.disputes > disputeLimit,
      terrain: false,
      resourceSites: resources.resourceSites.length >= 420,
      resourceCells: resources.resourceCells.length >= 80,
      chronicle: sourceCounts.chronicle > chronicle.length,
    },
    sourceCounts,
  };

  // The count limits are the normal guard. This secondary byte guard protects
  // the API if a future engine adds unusually long labels or capability ids.
  while (utf8ByteLength(JSON.stringify(output)) > MAX_PLANET_RESPONSE_BYTES) {
    if (output.agents.length > 20) {
      output.agents.length = Math.max(20, Math.floor(output.agents.length * 0.75));
      output.truncated.agents = true;
    } else if (output.territory.length > 100) {
      output.territory.length = Math.max(100, Math.floor(output.territory.length * 0.75));
      output.truncated.territory = true;
    } else if (output.agentClusters.length > 20) {
      output.agentClusters.length = Math.max(20, Math.floor(output.agentClusters.length * 0.75));
      output.truncated.clusters = true;
    } else if (output.settlements.length > 20) {
      output.settlements.length = Math.max(20, Math.floor(output.settlements.length * 0.75));
      output.truncated.settlements = true;
    } else if (output.disputes.length > 20) {
      output.disputes.length = Math.max(20, Math.floor(output.disputes.length * 0.75));
      output.truncated.disputes = true;
    } else if (output.resourceSites.length > 20) {
      output.resourceSites.length = Math.max(20, Math.floor(output.resourceSites.length * 0.75));
      output.truncated.resourceSites = true;
    } else if (output.terrain.length > 96) {
      output.terrain = output.terrain.filter((_, index) => index % 2 === 0);
      output.truncated.terrain = true;
    } else if (output.chronicle.length > 10) {
      output.chronicle.length = Math.max(10, Math.floor(output.chronicle.length * 0.75));
      output.truncated.chronicle = true;
    } else {
      throw new Error("The bounded planet viewport could not fit its response budget.");
    }
  }
  return output;
}

function isEntityKind(kind: string): kind is PlanetEntityKind {
  return ["agent", "settlement", "polity", "belief", "institution", "proposal", "project"]
    .includes(kind);
}

export async function loadPlanetEntity(
  kind: string,
  id: string,
): Promise<{ revision: number; entity: unknown } | null> {
  if (!isEntityKind(kind) || !/^[A-Za-z0-9][A-Za-z0-9:_-]{0,159}$/.test(id)) {
    return null;
  }
  const database = getD1();
  await ensurePlanetSchema(database);
  const row = await ensureWorld(database, Date.now());
  if (kind === "settlement") {
    const index = await database
      .prepare(`
        SELECT shard_id AS shardId
        FROM planet_settlement_index
        WHERE world_id = ? AND commit_id = ? AND settlement_id = ?
      `)
      .bind(PLANET_WORLD_ID, row.currentCommitId, id)
      .first<EntityIndexRow>();
    if (!index) return null;
    const shard = await database
      .prepare(`
        SELECT payload_json AS payloadJson, checksum
        FROM planet_settlement_shards
        WHERE world_id = ? AND commit_id = ? AND shard_id = ?
      `)
      .bind(PLANET_WORLD_ID, row.currentCommitId, index.shardId)
      .first<PayloadRow>();
    if (!shard) return null;
    const decoded = await decodePlanetPayload(shard.payloadJson, shard.checksum);
    const items = decoded && typeof decoded === "object" && !Array.isArray(decoded)
      ? (decoded as { items?: unknown }).items
      : null;
    const entity = Array.isArray(items)
      ? items.find((item) => entityId(item) === id)
      : undefined;
    return entity === undefined ? null : { revision: row.revision, entity };
  }

  const index = await database
    .prepare(`
      SELECT shard_id AS shardId
      FROM planet_entity_index
      WHERE world_id = ? AND commit_id = ? AND kind = ? AND entity_id = ?
    `)
    .bind(PLANET_WORLD_ID, row.currentCommitId, kind, id)
    .first<EntityIndexRow>();
  if (!index) return null;
  const shard = await database
    .prepare(`
      SELECT payload_json AS payloadJson, checksum
      FROM planet_entity_shards
      WHERE world_id = ? AND commit_id = ? AND kind = ? AND shard_id = ?
    `)
    .bind(PLANET_WORLD_ID, row.currentCommitId, kind, index.shardId)
    .first<PayloadRow>();
  if (!shard) return null;
  const decoded = await decodePlanetPayload(shard.payloadJson, shard.checksum);
  const items = decoded && typeof decoded === "object" && !Array.isArray(decoded)
    ? (decoded as { items?: unknown }).items
    : null;
  const entity = Array.isArray(items)
    ? items.find((item) => entityId(item) === id)
    : undefined;
  return entity === undefined ? null : { revision: row.revision, entity };
}

export function boundsToChunkRanges(bounds: GeographicBounds): Array<{
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}> {
  if (bounds.east - bounds.west >= 360) {
    const north = coordinateToChunk({ longitude: 0, latitude: bounds.north });
    const south = coordinateToChunk({ longitude: 0, latitude: bounds.south });
    return [{
      minX: 0,
      maxX: PLANET_CHUNKS_X - 1,
      minY: Math.min(north.y, south.y),
      maxY: Math.max(north.y, south.y),
    }];
  }
  const northWest = coordinateToChunk({
    longitude: bounds.west,
    latitude: bounds.north,
  });
  const southEast = coordinateToChunk({
    longitude: bounds.east,
    latitude: bounds.south,
  });
  const yRange = {
    minY: Math.min(northWest.y, southEast.y),
    maxY: Math.max(northWest.y, southEast.y),
  };
  if (bounds.west <= bounds.east) {
    return [{
      minX: Math.min(northWest.x, southEast.x),
      maxX: Math.max(northWest.x, southEast.x),
      ...yRange,
    }];
  }
  return [
    { minX: northWest.x, maxX: PLANET_CHUNKS_X - 1, ...yRange },
    { minX: 0, maxX: southEast.x, ...yRange },
  ];
}

export async function searchPlanetAgents(
  query: string,
  cursor: number,
  limit: number,
): Promise<{
  revision: number;
  query: string;
  cursor: number;
  nextCursor: number | null;
  total: number;
  agents: CompactPlanetAgent[];
}> {
  const normalizedQuery = query.trim().toLocaleLowerCase().slice(0, 120);
  const safeCursor = Math.max(0, Math.min(10_000, Math.floor(cursor)));
  const safeLimit = Math.max(1, Math.min(40, Math.floor(limit)));
  const snapshot = await currentPlanet();
  const polityName = new Map(
    snapshot.world.polities.map((polity) => [polity.id, polity.name.toLocaleLowerCase()]),
  );
  const settlementName = new Map(
    snapshot.world.settlements.map((settlement) => [
      settlement.id,
      settlement.name.toLocaleLowerCase(),
    ]),
  );
  const beliefName = new Map(
    snapshot.world.beliefs.map((belief) => [belief.id, belief.name.toLocaleLowerCase()]),
  );
  const matched = snapshot.world.agents
    .filter((agent) => {
      if (!normalizedQuery) return agent.alive;
      const activeGoal = agent.mind.goals.find((goal) => goal.status === "active");
      const searchable = [
        agent.id,
        agent.name,
        agent.polityId ? polityName.get(agent.polityId) : "",
        agent.homeSettlementId ? settlementName.get(agent.homeSettlementId) : "",
        agent.beliefId ? beliefName.get(agent.beliefId) : "",
        activeGoal?.purpose,
        activeGoal?.rationale,
        agent.mind.lastDecision?.explanation,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase();
      return searchable.includes(normalizedQuery);
    })
    .sort((left, right) =>
      Number(right.alive) - Number(left.alive) ||
      right.influence - left.influence ||
      left.id.localeCompare(right.id)
    );
  const agents = matched
    .slice(safeCursor, safeCursor + safeLimit)
    .map(compactAgent);
  const nextCursor = safeCursor + agents.length < matched.length
    ? safeCursor + agents.length
    : null;
  return {
    revision: snapshot.row.revision,
    query: query.trim().slice(0, 120),
    cursor: safeCursor,
    nextCursor,
    total: matched.length,
    agents,
  };
}
