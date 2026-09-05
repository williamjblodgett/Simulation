import assert from "node:assert/strict";
import test from "node:test";

import {
  PLANET_CHUNKS_X,
  RESOURCE_CATALOG,
  advancePlanet,
  catchUpPlanet,
  claimTerritory,
  createPlanetWorld,
  discoverResourcesInChunk,
  extractResource,
  generatePlanetChunk,
  getResourceCatalog,
  normalizePlanetWorld,
  runRecipe,
  serializePlanetWorld,
  validatePlanetCatalogs,
  validatePlanetWorld,
} from "../app/simulation/planet/index.ts";

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
