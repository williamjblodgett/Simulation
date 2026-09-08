import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  MAX_PLANET_STORED_BYTES,
  decodePlanetPayload,
  encodePlanetPayload,
  packPlanetItems,
} from "../app/api/planet/planet-codec.ts";
import { parseViewportQuery } from "../app/api/planet/planet-contract.ts";
import { createPlanetWorld, normalizePlanetWorld } from "../app/simulation/planet/index.ts";

test("planet codec round-trips and verifies a compressed 10,000-agent shard", async () => {
  const payload = Array.from({ length: 10_000 }, (_, index) => ({
    id: `agent-${String(index).padStart(5, "0")}`,
    goal: "survive, learn, cooperate, and prosper",
    observations: ["water", "food", "shelter", `region-${index % 128}`],
  }));
  const encoded = await encodePlanetPayload(payload);
  assert.ok(encoded.storedBytes < MAX_PLANET_STORED_BYTES);
  assert.match(encoded.stored, /wildgrid-planet-gzip-v1/);
  assert.deepEqual(
    await decodePlanetPayload(encoded.stored, encoded.checksum),
    payload,
  );
  await assert.rejects(
    decodePlanetPayload(encoded.stored, "0".repeat(64)),
    /checksum/,
  );
});

test("planet packer keeps every record and deterministically bounds raw shards", () => {
  const records = Array.from({ length: 1_000 }, (_, index) => ({
    id: `record-${index}`,
    text: "x".repeat(900),
  }));
  const shards = packPlanetItems(records, 32_000);
  assert.ok(shards.length > 1);
  assert.deepEqual(shards.flat(), records);
  for (const shard of shards) {
    assert.ok(Buffer.byteLength(JSON.stringify(shard)) <= 33_000);
  }
});

test("viewport contract accepts antimeridian bounds and rejects unsafe ranges", () => {
  const parsed = parseViewportQuery(
    new Request(
      "https://example.test/api/planet/regions?west=170&east=-170&south=-20&north=20&zoom=9&sinceRevision=4",
    ),
  );
  assert.deepEqual(parsed.bounds, {
    west: 170,
    east: -170,
    south: -20,
    north: 20,
  });
  assert.equal(parsed.zoom, 9);
  assert.equal(parsed.sinceRevision, 4);
  assert.throws(
    () => parseViewportQuery(
      new Request("https://example.test/api/planet/regions?south=45&north=20"),
    ),
    /south must be lower/,
  );
});

test("Era III migration is additive and leaves both Era II tables untouched", async () => {
  const eraMigration = await readFile(
    new URL("../drizzle/0002_parallel_red_ghost.sql", import.meta.url),
    "utf8",
  );
  const counselMigration = await readFile(
    new URL("../drizzle/0003_flawless_pandemic.sql", import.meta.url),
    "utf8",
  );
  const reconstructionMigration = await readFile(
    new URL("../drizzle/0004_thankful_guardian.sql", import.meta.url),
    "utf8",
  );
  assert.match(eraMigration, /CREATE TABLE `planet_worlds`/);
  assert.match(eraMigration, /CREATE TABLE `planet_events`/);
  assert.match(counselMigration, /CREATE TABLE `planet_ai_counsel_state`/);
  assert.match(counselMigration, /CREATE TABLE `planet_ai_counsel_log`/);
  assert.match(reconstructionMigration, /CREATE TABLE `planet_reconstruction_state`/);
  assert.doesNotMatch(
    `${eraMigration}\n${counselMigration}\n${reconstructionMigration}`,
    /(?:DELETE|DROP|ALTER)\s+(?:TABLE\s+)?`?civilization_/i,
  );
});

test("runtime CREATE TABLE statements are valid SQLite", async () => {
  const source = await readFile(
    new URL("../app/api/planet/planet-schema.ts", import.meta.url),
    "utf8",
  );
  const statements = [...source.matchAll(/const CREATE_[A-Z_]+_SQL = `([\s\S]*?)`;/g)]
    .map((match) => match[1]);
  assert.equal(statements.length, 12);
  const database = new DatabaseSync(":memory:");
  for (const statement of statements) database.exec(statement);
  const tables = database
    .prepare("SELECT COUNT(*) AS count FROM sqlite_schema WHERE type = 'table' AND name LIKE 'planet_%'")
    .get();
  assert.equal(tables.count, 12);
});

test("schema-3 planet checkpoints migrate to schema 4 without replacing the world", () => {
  const current = createPlanetWorld("persistence-migration", {
    initialAgentCount: 10,
    initialSettlementCount: 10,
  });
  const legacy = structuredClone(current);
  legacy.schemaVersion = 3;
  for (const settlement of legacy.settlements) {
    delete settlement.lifecycleStatus;
    delete settlement.statusChangedAt;
    delete settlement.lastOccupiedAt;
    delete settlement.endedDay;
    delete settlement.successorId;
  }
  for (const polity of legacy.polities) {
    delete polity.lifecycleStatus;
    delete polity.statusChangedAt;
    delete polity.endedDay;
    delete polity.successorId;
  }
  for (const belief of legacy.beliefs) {
    delete belief.status;
    delete belief.statusChangedAt;
    delete belief.endedDay;
  }
  const migrated = normalizePlanetWorld(legacy);
  assert.equal(migrated.schemaVersion, 4);
  assert.equal(migrated.seed, current.seed);
  assert.equal(migrated.time, current.time);
  assert.deepEqual(migrated.agents.map(({ id }) => id), current.agents.map(({ id }) => id));
  assert.ok(migrated.settlements.every(({ lifecycleStatus }) => lifecycleStatus === "active"));
  assert.ok(migrated.polities.every(({ lifecycleStatus }) => lifecycleStatus === "active"));
});

test("Pages persistence uses a separate append-only ledger and a simulation worker", async () => {
  const persistence = await readFile(
    new URL("../github-pages/src/planet-persistence.ts", import.meta.url),
    "utf8",
  );
  const runtime = await readFile(
    new URL("../github-pages/src/planet-runtime.ts", import.meta.url),
    "utf8",
  );
  const worker = await readFile(
    new URL("../github-pages/src/planet-simulation.worker.ts", import.meta.url),
    "utf8",
  );
  assert.match(persistence, /DATABASE_VERSION\s*=\s*2/);
  assert.match(persistence, /EVENT_STORE_NAME\s*=\s*"planet-events"/);
  assert.match(persistence, /appendPlanetHistory/);
  assert.match(runtime, /new Worker\(/);
  assert.match(runtime, /result[^\n]+generatedEvents|generatedEvents[^\n]+result/);
  assert.match(worker, /advancePlanet\(/);
  assert.doesNotMatch(worker, /localStorage|OPENAI_API_KEY/);
});

test("OpenAI counsel is server-only, quota fenced, and never embeds a credential", async () => {
  const server = await readFile(
    new URL("../app/api/planet/planet-ai.ts", import.meta.url),
    "utf8",
  );
  const client = await readFile(
    new URL("../app/planet/http-adapter.ts", import.meta.url),
    "utf8",
  );
  assert.match(server, /env[^\n]+OPENAI_API_KEY/);
  assert.match(server, /store:\s*false/);
  assert.match(server, /DAILY_CALL_LIMIT\s*=\s*12/);
  assert.match(server, /REQUEST_TIMEOUT_MS\s*=\s*12_000/);
  assert.match(server, /CIRCUIT_BREAKER_FAILURES\s*=\s*3/);
  assert.match(server, /applyExternalAgentCounsel/);
  assert.doesNotMatch(server, /s[k]-pro[j]-/);
  assert.doesNotMatch(client, /OPENAI_API_KEY|Authorization:\s*`Bearer/);
});
