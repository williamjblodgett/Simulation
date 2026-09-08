import assert from "node:assert/strict";
import test from "node:test";
import { performance } from "node:perf_hooks";

import {
  MAX_PLANET_AGENTS,
  MAX_PLANET_DECEASED_AGENT_RECORDS,
  advancePlanet,
  createPlanetWorld,
  createOffspring,
  getViewportSnapshot,
  killPlanetAgent,
  normalizePlanetWorld,
  serializePlanetWorld,
  validatePlanetWorld,
} from "../app/simulation/planet/index.ts";

test("10,000 named agents serialize, normalize, schedule, and query through semantic LOD", { timeout: 30_000 }, () => {
  const started = performance.now();
  const world = createPlanetWorld("ten-thousand", {
    initialAgentCount: MAX_PLANET_AGENTS,
    initialSettlementCount: 64,
  });
  assert.equal(world.agents.length, 10_000);
  assert.equal(new Set(world.agents.map(({ name }) => name)).size, 10_000);
  assert.equal(world.scheduler.filter(({ kind }) => kind === "agent_wake").length, 10_000);
  assert.equal(validatePlanetWorld(world), true);
  const serialized = serializePlanetWorld(world);
  assert.ok(serialized.length < 20_000_000, `snapshot unexpectedly large: ${serialized.length}`);
  const restored = normalizePlanetWorld(serialized);
  assert.equal(restored.agents.length, 10_000);

  const global = { west: -180, east: 180, south: -90, north: 90 };
  const overview = getViewportSnapshot(restored, global, 1);
  assert.equal(overview.agents.length, 0);
  assert.equal(overview.agentClusters.reduce((sum, cluster) => sum + cluster.count, 0), 10_000);
  const local = getViewportSnapshot(restored, global, 10);
  assert.equal(local.agents.length, 1_000, "viewport detail must remain bounded");

  const result = advancePlanet(restored, 60, { maxEvents: 30_000 });
  assert.equal(result.complete, true);
  assert.equal(result.processedEvents >= 10_000, true);
  assert.ok(performance.now() - started < 25_000, "10k creation/roundtrip/first scheduled pass exceeded smoke budget");
});

test("death and birth churn keeps living people and deterministically compacts the lineage archive", { timeout: 30_000 }, () => {
  const world = createPlanetWorld("bounded-deceased-lineage", {
    initialAgentCount: MAX_PLANET_DECEASED_AGENT_RECORDS + 5,
    initialSettlementCount: 1,
  });
  const founderId = world.settlements[0].founderIds[0];
  for (let index = 0; index <= MAX_PLANET_DECEASED_AGENT_RECORDS; index += 1) {
    assert.equal(killPlanetAgent(world, world.agents[index].id, "accident"), true);
  }
  const parents = world.agents.filter(({ alive }) => alive).slice(0, 2);
  const child = createOffspring(world, parents[0].id, parents[1].id);
  assert.ok(child, "a vacant supported camp should permit a replacement birth");
  const livingBefore = world.agents.filter(({ alive }) => alive)
    .map(({ id, name }) => `${id}:${name}`)
    .sort();
  const overfullLegacy = structuredClone(world);

  const migratedA = normalizePlanetWorld(overfullLegacy);
  const migratedB = normalizePlanetWorld(structuredClone(world));
  assert.equal(migratedA.agents.filter(({ alive }) => !alive).length, MAX_PLANET_DECEASED_AGENT_RECORDS);
  assert.deepEqual(migratedA.agents.map(({ id }) => id), migratedB.agents.map(({ id }) => id));
  assert.deepEqual(
    migratedA.agents.filter(({ alive }) => alive).map(({ id, name }) => `${id}:${name}`).sort(),
    livingBefore,
    "compaction must never drop or rename a living person",
  );
  assert.ok(migratedA.agents.some(({ id }) => id === founderId), "a settlement founder should survive the archive trim");
  assert.deepEqual(
    migratedA.agents.find(({ id }) => id === child.id).parentIds,
    parents.map(({ id }) => id).sort(),
    "both nearest-lineage records should remain resolvable",
  );
  const retainedIds = new Set(migratedA.agents.map(({ id }) => id));
  const archivedRelativeId = world.agents.find(({ alive, id }) => !alive && !retainedIds.has(id)).id;
  const lineageWitness = migratedA.agents.find(({ alive }) => alive);
  lineageWitness.parentIds.push(archivedRelativeId);
  const referenceRoundTrip = normalizePlanetWorld(serializePlanetWorld(migratedA));
  assert.ok(
    referenceRoundTrip.agents.find(({ id }) => id === lineageWitness.id).parentIds.includes(archivedRelativeId),
    "a stable lineage reference must survive after its deceased full-person record is archived",
  );
  assert.equal(referenceRoundTrip.agents.some(({ id }) => id === archivedRelativeId), false);
  assert.equal(validatePlanetWorld(migratedA), true);

  const restored = normalizePlanetWorld(serializePlanetWorld(world));
  assert.equal(validatePlanetWorld(restored), true);
  assert.equal(restored.stats.livingAgents, livingBefore.length);
  assert.equal(restored.agents.length, livingBefore.length + MAX_PLANET_DECEASED_AGENT_RECORDS);
});
