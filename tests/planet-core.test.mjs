import assert from "node:assert/strict";
import test from "node:test";

import {
  PLANET_CHUNKS_X,
  PLANET_DAY_SECONDS,
  RESOURCE_CATALOG,
  advancePlanet,
  catchUpPlanet,
  claimTerritory,
  createPlanetWorld,
  discoverResourcesInChunk,
  extractResource,
  generatePlanetChunk,
  getResourceCatalog,
  getPlanetSummary,
  normalizePlanetWorld,
  runRecipe,
  serializePlanetWorld,
  validatePlanetCatalogs,
  validatePlanetWorld,
} from "../app/simulation/planet/index.ts";
import { createPlanetWorldAdapter } from "../app/planet/engine-adapter.ts";

test("observatory summary reports real recent deliberations and modeled ages", () => {
  const world = createPlanetWorld("observatory-summary", { initialAgentCount: 10, initialSettlementCount: 10 });
  assert.equal(world.day - world.agents[0].birthDay, 20, "founders should begin at modeled age 20");
  catchUpPlanet(world, PLANET_DAY_SECONDS * 2, { maxEvents: 10_000 });
  const summary = getPlanetSummary(world);
  assert.ok(summary.observation.autonomousDecisions > 0, "recent retained decisions must not report a false zero");
  assert.ok(Object.values(summary.observation.activeGoals).reduce((sum, count = 0) => sum + count, 0) > 0, "latest self-directed purposes must remain observable after a goal resolves");
});

test("device-local agent search is alphabetical rather than influence-ranked", () => {
  const world = createPlanetWorld("alphabetical-agent-search", {
    initialAgentCount: 3,
    initialSettlementCount: 1,
  });
  world.agents[0].name = "Zulu Observer";
  world.agents[0].influence = 10_000;
  world.agents[1].name = "Alpha Observer";
  world.agents[1].influence = 1;
  world.agents[2].name = "Alpha Observer";
  world.agents[2].influence = 9_000;

  const expected = [world.agents[1].id, world.agents[2].id, world.agents[0].id];
  const result = createPlanetWorldAdapter(world).searchAgents("", 10);
  assert.deepEqual(result.map(({ id }) => id), expected);
});

test("catalogs are broad, reference-valid, acyclic, and include a working oil chain", () => {
  const validation = validatePlanetCatalogs();
  assert.deepEqual(validation.errors, []);
  assert.equal(validation.valid, true);
  assert.ok(validation.counts.resources >= 85);
  assert.ok(validation.counts.capabilities >= 150);
  assert.ok(getResourceCatalog().some(({ id }) => id === "crude_oil"));

  const world = createPlanetWorld("oil-test", { initialAgentCount: 1, initialSettlementCount: 1 });
  const agent = world.agents[0];
  const settlement = world.settlements[0];
  const withoutSurveying = discoverResourcesInChunk(world, agent.id, 19, 0);
  assert.equal(withoutSurveying.some(({ resourceId }) => resourceId === "crude_oil"), false);

  agent.capabilities.push("geological_surveying", "rotary_drilling", "well_control", "petroleum_refining");
  const discoveries = discoverResourcesInChunk(world, agent.id, 19, 0);
  const oil = discoveries.find(({ resourceId }) => resourceId === "crude_oil");
  assert.ok(oil, "qualified surveying should discover the deterministic oil site");
  assert.equal(extractResource(world, agent.id, oil.id, 5).ok, true);
  assert.equal(extractResource(world, agent.id, oil.id, 5).ok, true);
  settlement.facilities.oil_refinery = 1;
  const refining = runRecipe(world, settlement.id, agent.id, "distill_crude", 1);
  assert.equal(refining.ok, true);
  assert.ok(refining.outputs.gasoline > 0);
  assert.ok(refining.outputs.diesel > 0);
  assert.ok(refining.outputs.asphalt > 0);
});

test("planet chunks are seed deterministic, order-invariant, and wrap longitude", () => {
  const expected = generatePlanetChunk("chunk-order", 7, 11, RESOURCE_CATALOG);
  generatePlanetChunk("chunk-order", 29, 2, RESOURCE_CATALOG);
  generatePlanetChunk("chunk-order", 3, 25, RESOURCE_CATALOG);
  assert.deepEqual(generatePlanetChunk("chunk-order", 7, 11, RESOURCE_CATALOG), expected);
  assert.deepEqual(
    generatePlanetChunk("chunk-order", -1, 8, RESOURCE_CATALOG),
    generatePlanetChunk("chunk-order", PLANET_CHUNKS_X - 1, 8, RESOURCE_CATALOG),
  );
  assert.notDeepEqual(generatePlanetChunk("other-seed", 7, 11, RESOURCE_CATALOG), expected);
});

test("simulation replay and arbitrary catch-up batches are deterministic", () => {
  const direct = createPlanetWorld("replay", { initialAgentCount: 10 });
  const sliced = createPlanetWorld("replay", { initialAgentCount: 10 });
  catchUpPlanet(direct, 120 * 60, { maxEvents: 200_000 });
  for (let index = 0; index < 120; index += 1) advancePlanet(sliced, 60, { maxEvents: 200_000 });
  assert.equal(serializePlanetWorld(direct), serializePlanetWorld(sliced));
  const normalized = normalizePlanetWorld(serializePlanetWorld(direct));
  assert.equal(validatePlanetWorld(normalized), true);
  assert.equal(serializePlanetWorld(normalized), serializePlanetWorld(direct));
});

test("territory cells retain exactly one sovereign owner and record rival claims separately", () => {
  const world = createPlanetWorld("exclusive-territory", { initialAgentCount: 2, initialSettlementCount: 2 });
  const coordinate = world.settlements[0].coordinate;
  const owner = world.polities[0].id;
  const claimant = world.polities[1].id;
  const first = claimTerritory(world, owner, [coordinate]);
  assert.ok(first.retained.length + first.claimed.length === 1);
  const contested = claimTerritory(world, claimant, [coordinate]);
  assert.equal(contested.contested.length, 1);
  const cell = contested.contested[0];
  assert.equal(world.territoryOwners[cell], owner);
  assert.deepEqual(world.territoryDisputes[cell].claimantPolityIds, [claimant]);
});

test("schema 3 checkpoints migrate in place to lifecycle-aware schema 4", () => {
  const original = createPlanetWorld("schema-three-migration", { initialAgentCount: 10, initialSettlementCount: 2 });
  catchUpPlanet(original, PLANET_DAY_SECONDS * 3, { maxEvents: 100_000 });
  const legacy = structuredClone(original);
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
  assert.equal(migrated.time, original.time);
  assert.equal(migrated.day, original.day);
  assert.deepEqual(migrated.agents.map(({ id }) => id), original.agents.map(({ id }) => id));
  assert.deepEqual(migrated.history.map(({ id }) => id), original.history.map(({ id }) => id));
  assert.ok(migrated.settlements.every(({ lifecycleStatus }) => lifecycleStatus === "active"));
  assert.ok(migrated.polities.every(({ lifecycleStatus }) => lifecycleStatus === "active"));
  assert.equal(validatePlanetWorld(migrated), true);
});
