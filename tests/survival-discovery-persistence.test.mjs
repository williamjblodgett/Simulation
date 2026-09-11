import assert from "node:assert/strict";
import test from "node:test";
import "fake-indexeddb/auto";
import { createSurvivalRun, advanceSurvivalRun, validateSurvivalRun } from "../app/simulation/survival/engine.ts";
import { commitCheckpoint, loadCheckpoint, exportRunArchive, recoverLastGoodCheckpoint } from "../app/survival/survival-persistence.ts";
import { SurvivalWorkerBridge } from "../app/survival/survival-worker-bridge.ts";
import { protectionPressure } from "../scripts/discovery-pressure-fixture.mjs";

const envelope = (world, revision, runInstanceId) => ({ world, revision, runInstanceId, speed: 1, savedAt: 0, missingBefore: 0 });

test("new checkpoints preserve private evidence, CAS, archives and old-policy recovery fences", async () => {
  const old = envelope(createSurvivalRun("discovery-storage-old", { policyVersion: 3, agentCount: 1 }), 1, "legacy");
  assert.equal(await commitCheckpoint(old, old.world.events, null), true);
  let world = protectionPressure("discovery-dev-basin-1", { climateVolatility: "variable" });
  const result = advanceSurvivalRun(world, 36); world = result.state;
  const next = envelope(world, 2, "discovery");
  assert.equal(await commitCheckpoint(next, result.events, 1), true);
  assert.deepEqual(await loadCheckpoint(), next);
  assert.equal(await commitCheckpoint({ ...next, revision: 3 }, [], 1), false);
  const exported = JSON.parse(await exportRunArchive(next));
  assert.ok(exported.events.some(e => e.facts.operation === "discovery_measurement"));
  const backup = await loadCheckpoint("last-good");
  assert.equal(backup.world.schemaVersion, 5); assert.equal(backup.world.policyVersion, 3);
  assert.equal(backup.world.agents[0].discovery, undefined); assert.ok(validateSurvivalRun(backup.world));
  assert.deepEqual(backup.world.agents, old.world.agents, "format fence does not change legacy decisions or sensing");
  assert.equal(advanceSurvivalRun(backup.world, 1).state.policyVersion, 3);
  const recovered = await recoverLastGoodCheckpoint();
  assert.equal(recovered.world.policyVersion, 3); assert.equal(recovered.world.schemaVersion, 5);
});

test("the worker bridge carries policy-4 evidence unchanged and never advances a paused run", async () => {
  const original = globalThis.Worker, workers = [];
  class FakeWorker { constructor() { workers.push(this); } postMessage(message) { this.message = message; } terminate() {} }
  globalThis.Worker = FakeWorker;
  const bridge = new SurvivalWorkerBridge();
  try {
    const world = createSurvivalRun("discovery-worker", { policyVersion: 4, agentCount: 1 });
    const pending = bridge.advance(world, 4), worker = workers[0];
    assert.deepEqual(worker.message.world, world); assert.equal(worker.message.steps, 1);
    const result = advanceSurvivalRun(world, 1);
    worker.onmessage({ data: { id: worker.message.id, ok: true, result } });
    assert.deepEqual(await pending, result);
    const paused = { ...result.state, status: "paused" };
    assert.deepEqual(advanceSurvivalRun(paused, 10).state, paused);
  } finally { bridge.dispose(); globalThis.Worker = original; }
});
