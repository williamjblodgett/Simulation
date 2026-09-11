import assert from "node:assert/strict";
import test from "node:test";
import "fake-indexeddb/auto";
import { createSurvivalRun, advanceSurvivalRun, serializeSurvivalRun, restoreSurvivalRun, validateSurvivalRun, addObserverAgent } from "../app/simulation/survival/engine.ts";
import { GEOLOGICAL_FEEDSTOCKS, feedstockKinds, feedstockMass, validateGeology, splitFeedstocks } from "../app/simulation/survival/geology.ts";
import { executeManipulation, agePhysicalWorld } from "../app/simulation/survival/physical-world.ts";
import { inFreshwater } from "../app/simulation/survival/physical-navigation.ts";
import { discoveryInput } from "../app/simulation/survival/discovery-boundary.ts";
import { prepareDiscovery } from "../app/simulation/survival/discovery-policy.ts";
import { commitCheckpoint, loadCheckpoint, recoverLastGoodCheckpoint, exportRunArchive } from "../app/survival/survival-persistence.ts";

const fresh = (seed = "materials-dev-1", extra = {}) => createSurvivalRun(seed, { policyVersion: 4, materialFoundation: "geology-v1", agentCount: 1, ...extra });

test("each new material world has the complete finite, dry endowment at all supported scales", () => {
  for (const worldSize of [96, 256, 1024]) for (const resourceAbundance of ["scarce", "balanced", "plentiful"]) for (let seed = 0; seed < 8; seed++) {
    const world = fresh(`endowment-${seed}`, { worldSize, resourceAbundance });
    const sites = world.environment.resources.filter(s => s.feedstock);
    assert.equal(sites.length, 28);
    assert.deepEqual([...new Set(sites.map(s => s.feedstock))].sort(), [...feedstockKinds].sort());
    assert.ok(sites.every(s => s.quantity > 0 && s.quantity === s.capacity && s.regenerationPerDay === 0 && !inFreshwater(world.environment, s.position, 3)));
    assert.ok(validateSurvivalRun(world));
    assert.equal(feedstockMass(world.agents[0].rawFeedstocks), 0, "no starter ore is granted");
    const original = createSurvivalRun(`endowment-${seed}`, { policyVersion: 4, worldSize, resourceAbundance, agentCount: 1 });
    assert.deepEqual(world.environment.resources.filter(s => !s.feedstock), original.environment.resources, "old survival-resource geography is untouched");
  }
});

test("geological identities and reserves are observer-only until a measurement capability exists", () => {
  const world = fresh(), agent = world.agents[0];
  const before = discoveryInput(agent, world.tick, world.environment.bounds);
  const other = structuredClone(world);
  other.environment.resources.find(s => s.feedstock).quantity = .5;
  other.agents[0].rawFeedstocks = { copper_ore: 1, gold_ore: 2 };
  other.observerDiagnostics = { materialTruth: GEOLOGICAL_FEEDSTOCKS };
  assert.deepEqual(discoveryInput(other.agents[0], other.tick, other.environment.bounds), before);
  assert.deepEqual(prepareDiscovery(discoveryInput(other.agents[0], 0, other.environment.bounds)), prepareDiscovery(discoveryInput(agent, 0, world.environment.bounds)));
  assert.equal("rawFeedstocks" in before.agent, false);
  assert.equal(JSON.stringify(before).includes("gold_ore"), false);
});

// Isolated executor fixture: explicitly assigned collection steps test reach and
// accounting, not autonomous invention. The headless natural runs are separate.
function collectAt(world, kind, near = true) {
  const agent = world.agents[0], site = world.environment.resources.find(s => s.feedstock === kind);
  agent.position = near ? { ...site.position } : { x: site.position.x + 12, z: site.position.z };
  agent.currentPlan = { id: "plan-test", decisionId: "decision-test", formedAt: world.tick, goal: "gather_material", targetId: site.id,
    initialNeeds: { ...agent.needs }, initialInventory: { ...agent.inventory }, targetPosition: { ...site.position }, status: "active", rationale: "Accounting unit test", activeStepIndex: 0,
    steps: [{ id: "step-test", action: "gather", targetId: site.id, destination: null, remainingSteps: 1, status: "active" }] };
  return advanceSurvivalRun(world, 1).state;
}

test("confirmed collection transfers finite raw rock once; failed reach creates nothing", () => {
  const original = fresh(), site = original.environment.resources.find(s => s.feedstock === "iron_ore");
  const unreachable = collectAt(structuredClone(original), "iron_ore", false);
  assert.equal(feedstockMass(unreachable.agents[0].rawFeedstocks), 0);
  assert.equal(unreachable.environment.resources.find(s => s.id === site.id).quantity, site.quantity);
  const collected = collectAt(structuredClone(original), "iron_ore");
  assert.equal(collected.agents[0].inventory.stone, 1.5);
  assert.equal(collected.agents[0].rawFeedstocks.iron_ore, 1.5);
  assert.equal(collected.environment.resources.find(s => s.id === site.id).quantity, site.quantity - 1.5);
  assert.ok(validateGeology(collected));
  assert.equal(original.agents[0].inventory.stone, 0);
});

test("raw feedstock remains conserved through shaping, split, mix, damage and reclaim", () => {
  let world = fresh();
  for (let n = 0; n < 4; n++) world = collectAt(world, n < 2 ? "iron_ore" : "copper_ore");
  const agent = world.agents[0];
  const act = op => executeManipulation(world.physical, agent, op, world.environment, world.tick, [agent.position], true);
  const before = structuredClone(agent.rawFeedstocks);
  const shape = act({ kind: "shape", material: "stone", mass: 2.5, size: { x: 1, y: 1, z: 1 } });
  assert.ok(shape.ok, shape.summary); assert.ok(validateGeology(world));
  let part = world.physical.parts[0];
  assert.equal(feedstockMass(part.rawFeedstocks), 2.5);
  const failBefore = structuredClone({ inventory: agent.inventory, raw: agent.rawFeedstocks, parts: world.physical.parts });
  assert.equal(act({ kind: "shape", material: "stone", mass: 99, size: { x: 1, y: 1, z: 1 } }).ok, false);
  assert.deepEqual({ inventory: agent.inventory, raw: agent.rawFeedstocks, parts: world.physical.parts }, failBefore);
  const split = act({ kind: "split", partId: part.id, fraction: .4 });
  assert.ok(split.ok, split.summary); assert.ok(validateGeology(world));
  const other = world.physical.parts.find(p => p.id !== part.id);
  const mixed = act({ kind: "mix", a: part.id, b: other.id });
  assert.ok(mixed.ok, mixed.summary); assert.ok(validateGeology(world));
  part = world.physical.parts[0]; part.condition = .01;
  assert.ok(act({ kind: "test", partId: part.id, measure: "load", dose: 5 }).ok);
  assert.equal(world.physical.tests, 1);
  assert.ok(validateGeology(world), "a destructive load test does not erase the remnant's raw material");
  agePhysicalWorld(world.physical, world.environment);
  assert.ok(validateGeology(world), "damage changes usefulness, not matter identity");
  const recovered = act({ kind: "reclaim", partId: part.id });
  assert.ok(recovered.ok); assert.ok(validateGeology(world));
  assert.deepEqual(agent.rawFeedstocks, before);
  assert.equal(agent.inventory.stone, 6, "embedded feedstocks never add a second copy of stone");
});

test("malformed provenance, duplicated stock, missing minerals and schema downgrade fail closed", () => {
  const world = fresh();
  const mutations = [
    s => { s.agents[0].rawFeedstocks.iron_ore = 1; },
    s => { s.agents[0].rawFeedstocks.invented = 0; },
    s => { s.agents[0].rawFeedstocks = null; },
    s => { s.geology = false; },
    s => { s.schemaVersion = 5; },
    s => { s.environment.resources.find(r => r.feedstock).regenerationPerDay = 1; },
    s => { s.environment.resources = s.environment.resources.filter(r => r.feedstock !== "iron_ore"); },
    s => { const r = s.environment.resources.find(r => r.feedstock); r.capacity = r.quantity = 1; },
  ];
  for (const mutate of mutations) { const copy = structuredClone(world); mutate(copy); assert.equal(validateSurvivalRun(copy), false); }
  assert.throws(() => createSurvivalRun("bad-profile", { policyVersion: 3, materialFoundation: "geology-v1" }), /requires/);
});

test("collecting after fractional construction preserves the existing stone mass precisely", () => {
  let world = collectAt(collectAt(fresh("materials-fractional"), "iron_ore"), "iron_ore");
  const agent = world.agents[0];
  const result = executeManipulation(world.physical, agent, { kind: "shape", material: "stone", mass: 2.006, size: { x: .8024, y: 1, z: 1 } }, world.environment, world.tick, [agent.position], true);
  assert.ok(result.ok, result.summary);
  world = collectAt(world, "iron_ore");
  assert.equal(world.agents[0].inventory.stone, 2.494);
  assert.equal(feedstockMass(world.agents[0].rawFeedstocks), 2.494);
  assert.ok(validateGeology(world));
});

test("death retains mineral remnants; a recorded replacement cannot inherit or duplicate them", () => {
  let world = collectAt(fresh("materials-death"), "copper_ore");
  const first = world.agents[0];
  first.needs = { health: .01, hydration: 0, nutrition: 0, energy: 0, warmth: 0, safety: 0 };
  world = advanceSurvivalRun(world, 1).state;
  assert.equal(world.agents[0].alive, false);
  assert.equal(world.agents[0].rawFeedstocks.copper_ore, 1.5);
  assert.ok(validateGeology(world));
  const addition = addObserverAgent(world);
  assert.ok(addition.ok);
  assert.deepEqual(addition.agent.rawFeedstocks, {});
  assert.equal(addition.state.agents[0].alive, false);
  assert.equal(addition.state.agents[0].rawFeedstocks.copper_ore, 1.5);
  assert.ok(validateGeology(addition.state));
  const denied = executeManipulation(addition.state.physical, addition.state.agents[0], { kind: "shape", material: "stone", mass: 1, size: { x: .4, y: 1, z: 1 } }, addition.state.environment, addition.state.tick, [], true);
  assert.equal(denied.ok, false);
  assert.ok(validateGeology(addition.state));
});

test("old policies keep their original endowment; new lives do not inherit raw stock", () => {
  for (const policyVersion of [2, 3, 4]) {
    const legacy = createSurvivalRun("materials-compat", { policyVersion });
    assert.equal(legacy.geology, undefined);
    assert.ok(legacy.environment.resources.every(s => s.feedstock === undefined));
    assert.deepEqual(restoreSurvivalRun(serializeSurvivalRun(legacy)), legacy);
  }
  const world = fresh(), admitted = addObserverAgent(world);
  assert.ok(admitted.ok); assert.deepEqual(admitted.agent.rawFeedstocks, {}); assert.ok(validateSurvivalRun(admitted.state));
  const tiny = { iron_ore: .00001 };
  for (let i = 0; i < 100; i++) splitFeedstocks(tiny, .01);
  assert.ok(tiny.iron_ore >= 0, "bounded precision must not produce negative stock");
});

test("schema-6 save/restore, CAS and recovery preserve old study semantics without creating ore", async () => {
  const envelope = (world, revision, runInstanceId) => ({ world, revision, runInstanceId, speed: 1, savedAt: 0, missingBefore: 0 });
  const old = envelope(createSurvivalRun("materials-storage-old", { policyVersion: 4, agentCount: 1 }), 1, "materials-old");
  assert.equal(await commitCheckpoint(old, old.world.events, null), true);
  const world = advanceSurvivalRun(fresh("materials-storage"), 12).state;
  assert.ok(validateSurvivalRun(world));
  assert.deepEqual(restoreSurvivalRun(serializeSurvivalRun(world)), world);
  const next = envelope(world, 2, "materials-new");
  assert.equal(await commitCheckpoint(next, world.events, 1), true);
  assert.deepEqual(await loadCheckpoint(), next);
  assert.equal(await commitCheckpoint({ ...next, revision: 3 }, [], 1), false);
  assert.equal(JSON.parse(await exportRunArchive(next)).checkpoint.world.geology.version, 1);
  const backup = await loadCheckpoint("last-good");
  assert.equal(backup.world.schemaVersion, 6); assert.equal(backup.world.geology, undefined);
  assert.deepEqual(backup.world.agents, old.world.agents); assert.ok(validateSurvivalRun(backup.world));
  assert.equal((await recoverLastGoodCheckpoint()).world.schemaVersion, 6);
});

test("material-world simulation is invariant under batching and checkpoint round trips", () => {
  const initial = fresh("materials-replay");
  const direct = advanceSurvivalRun(initial, 36).state;
  let batched = initial;
  for (let i = 0; i < 6; i++) batched = restoreSurvivalRun(serializeSurvivalRun(advanceSurvivalRun(batched, 6).state));
  assert.deepEqual(batched, direct); assert.ok(validateSurvivalRun(direct));
  const paused = { ...direct, status: "paused" };
  assert.deepEqual(advanceSurvivalRun(paused, 20).state, paused);
});

test("saving a preserved older study never downgrades a geological recovery checkpoint", async () => {
  const current = await loadCheckpoint();
  const newer = { ...current, world: fresh("materials-fence-new"), revision: current.revision + 1, runInstanceId: "materials-fence-new" };
  assert.equal(await commitCheckpoint(newer, newer.world.events, current.revision), true);
  const older = { ...newer, world: createSurvivalRun("materials-fence-old", { policyVersion: 4 }), revision: newer.revision + 1, runInstanceId: "materials-fence-old" };
  assert.equal(await commitCheckpoint(older, older.world.events, newer.revision), true);
  const backup = await loadCheckpoint("last-good");
  assert.deepEqual(backup, newer);
  const recovered = await recoverLastGoodCheckpoint();
  assert.equal(recovered.world.schemaVersion, 6);
  assert.deepEqual(recovered.world, newer.world);
});
