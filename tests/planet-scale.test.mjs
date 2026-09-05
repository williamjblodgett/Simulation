import assert from "node:assert/strict";
import test from "node:test";
import { performance } from "node:perf_hooks";

import {
  MAX_PLANET_AGENTS,
  advancePlanet,
  createPlanetWorld,
  getViewportSnapshot,
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
