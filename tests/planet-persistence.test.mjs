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
  assert.match(eraMigration, /CREATE TABLE `planet_worlds`/);
  assert.match(eraMigration, /CREATE TABLE `planet_events`/);
  assert.match(counselMigration, /CREATE TABLE `planet_ai_counsel_state`/);
  assert.match(counselMigration, /CREATE TABLE `planet_ai_counsel_log`/);
  assert.doesNotMatch(
    `${eraMigration}\n${counselMigration}`,
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
  assert.equal(statements.length, 11);
  const database = new DatabaseSync(":memory:");
  for (const statement of statements) database.exec(statement);
  const tables = database
    .prepare("SELECT COUNT(*) AS count FROM sqlite_schema WHERE type = 'table' AND name LIKE 'planet_%'")
    .get();
  assert.equal(tables.count, 11);
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
  assert.match(server, /applyExternalAgentCounsel/);
  assert.doesNotMatch(server, /s[k]-pro[j]-/);
  assert.doesNotMatch(client, /OPENAI_API_KEY|Authorization:\s*`Bearer/);
});
