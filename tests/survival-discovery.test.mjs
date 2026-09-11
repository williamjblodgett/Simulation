import assert from "node:assert/strict";
import test from "node:test";
import { createSurvivalRun, advanceSurvivalRun, serializeSurvivalRun, restoreSurvivalRun, validateSurvivalRun, addObserverAgent } from "../app/simulation/survival/engine.ts";
import { discoveryInput } from "../app/simulation/survival/discovery-boundary.ts";
import { prepareDiscovery, bindDiscoveryProcedure, featuresFor, priceDiscoveryPlan, discoveryAlternatives, discoverySignature } from "../app/simulation/survival/discovery-policy.ts";
import { privateTraversable } from "../app/simulation/survival/private-navigation.ts";
import { planNeedsRepair } from "../app/simulation/survival/survival-forecast.ts";
import { planFromPrivateKnowledge } from "../app/simulation/survival/planner.ts";
import { predictDiscovery, acceptDiscoveryEvidence, decisionInformationValue } from "../app/simulation/survival/discovery-model.ts";
import { beginDiscoveryOperation, finishDiscoveryOperation, receiveDiscoveryTestimony } from "../app/simulation/survival/discovery-outcomes.ts";
import { freshDiscoveryMind, DISCOVERY_LIMITS } from "../app/simulation/survival/discovery-types.ts";
import { executeManipulation, MATERIALS } from "../app/simulation/survival/physical-world.ts";
import { protectionPressure, supportPressure, transferPressure } from "../scripts/discovery-pressure-fixture.mjs";

const step = (s, n = 1) => advanceSurvivalRun(s, n).state;
const input = s => discoveryInput(s.agents[0], s.tick, s.environment.bounds);

test("injury does not repeatedly cancel a viable recovery journey; legacy interruption remains unchanged", () => {
  // Isolated forecast fixture, not an autonomous discovery demonstration.
  const s = createSurvivalRun("recovery-forecast", { policyVersion: 4, agentCount: 1 }), a = s.agents[0];
  a.position = { x: 0, z: 0 }; a.needs = { health: 40, hydration: 90, nutrition: 90, energy: 90, warmth: 90, safety: 0 };
  a.observations = [{ id: "weather", subjectId: "weather", observerId: a.id, kind: "weather", observedAt: 0, confidence: 1, position: null, facts: { weather: "storm", temperatureC: 14, daylight: .5 } },
    { id: "seen-part", subjectId: "part-1", observerId: a.id, kind: "structure", observedAt: 0, confidence: 1, position: { x: 20, z: 2 }, facts: { structureKind: "physical_part", condition: 100, revision: 1 } }];
  a.physicalMind.uses = [{ id: "use", tick: 0, partId: "part-1", revision: 1, position: { x: 20, z: 0 }, action: "shelter", weather: "storm", temperature: 14, protection: .95, warmthBefore: 90, warmthAfter: 91 }];
  a.currentPlan = { id: "unit-plan", formedAt: 0, goal: "seek_safety", targetId: null, targetPosition: null, status: "active", rationale: "Unit fixture", activeStepIndex: 0, steps: [
    { id: "move", action: "move", targetId: null, destination: { x: 20, z: 0 }, remainingSteps: 3, status: "active", arrivalRadius: .2 },
    { id: "use", action: "shelter", targetId: null, destination: null, remainingSteps: 1, status: "pending" } ] };
  assert.equal(planNeedsRepair(a, 0), false);
  const legacy = structuredClone(a); delete legacy.discovery;
  assert.equal(planNeedsRepair(legacy, 0), true);
  a.needs.hydration = 1; a.inventory.freshwater = 1;
  assert.equal(planNeedsRepair(a, 0), true, "a competing lethal water need must still interrupt travel");
  a.currentPlan.steps = [{ id: "drink", action: "drink", targetId: null, destination: null, remainingSteps: 1, status: "active" }];
  assert.equal(planNeedsRepair(a, 0), false, "complete need restoration is compared with staying exposed");
});

test("measured-site travel uses precise arrival and cached prices equal fresh private calculations", () => {
  const s = createSurvivalRun("precise-recovery", { policyVersion: 4, agentCount: 1 }), a = s.agents[0];
  a.position = { x: 0, z: 0 }; a.needs.safety = 8; a.needs.warmth = 40;
  a.observations = [{ id: "weather", subjectId: "weather", observerId: a.id, kind: "weather", observedAt: 0, confidence: 1, position: null, facts: { weather: "clear", temperatureC: 10, daylight: .5 } },
    { id: "seen-part", subjectId: "part-1", observerId: a.id, kind: "structure", observedAt: 0, confidence: 1, position: { x: 2, z: 2 }, facts: { structureKind: "physical_part", condition: 100, revision: 1 } }];
  a.physicalMind.uses = [{ id: "use", tick: 0, partId: "part-1", revision: 1, position: { x: 2, z: 0 }, action: "shelter", weather: "clear", temperature: 10, protection: .8, warmthBefore: 40, warmthAfter: 45 }];
  const privateInput = input(s), choices = planFromPrivateKnowledge(privateInput);
  const move = choices.flatMap(c => c.actions).find(action => action.action === "move" && action.targetId === "part-1");
  assert.ok(move); assert.equal(move.arrivalRadius, .2);
  const actions = [move, { action: "rest", targetId: null, destination: null, duration: 2 }], cache = new Map();
  const fresh = priceDiscoveryPlan(privateInput, actions, .8);
  assert.deepEqual(priceDiscoveryPlan(privateInput, actions, .8, cache), fresh);
  assert.deepEqual(priceDiscoveryPlan(privateInput, actions, .8, cache), fresh); assert.ok(cache.size > 0);
  const far = [{ ...move, destination: { x: 50, z: 0 } }, actions[1]];
  assert.ok(priceDiscoveryPlan(privateInput, far, .8).score < fresh.score, "travel is charged before destination protection");
});

test("a rotated obstruction cannot trap an experiment at an unreachable precise destination", () => {
  // Isolated geometry/planning fixture, not an autonomous-discovery demonstration.
  const s = createSurvivalRun("rotated-test-approach", { policyVersion: 4, agentCount: 1 }), a = s.agents[0];
  a.position = { x: 0, z: 0 }; a.needs.safety = 20;
  const part = { id: "seen-part", observerId: a.id, subjectId: "part-1", kind: "structure", observedAt: 0, confidence: 1, position: { x: 3, z: 0 },
    facts: { structureKind: "physical_part", width: 3, height: 2, depth: .2, elevation: 1, rotation: Math.PI / 2, condition: 100, supported: true, material: "wood", mass: .78, treatment: 0, revision: 1 } };
  a.observations = [part, { id: "weather", observerId: a.id, subjectId: "weather", kind: "weather", observedAt: 0, confidence: 1, position: null, facts: { weather: "clear", temperatureC: 14, daylight: .5 } }];
  const privateInput = input(s), blockedPoint = { x: 3, z: -1 };
  assert.equal(privateTraversable(a.observations, s.environment.bounds, blockedPoint), false);
  assert.equal(priceDiscoveryPlan(privateInput, [{ action: "move", targetId: null, destination: blockedPoint, duration: 1, arrivalRadius: .2 }], .5).feasible, false);
  const candidate = discoveryAlternatives(privateInput).alternatives.find(c => c.id === "measure-part-1");
  assert.ok(candidate); assert.equal(privateTraversable(a.observations, s.environment.bounds, candidate.position), true);
  assert.ok(Math.hypot(candidate.position.x - part.position.x, candidate.position.z - part.position.z) <= 4);
  assert.equal(candidate.prediction.features.distance, Math.hypot(candidate.position.x - part.position.x, candidate.position.z - part.position.z));
  const earned = step(protectionPressure("discovery-dev-basin-1", { climateVolatility: "variable" }), 31), tired = input(earned);
  const signature = discoverySignature(tired.agent.discovery.active.alternative.operations);
  tired.agent.discovery.active.spentTicks = 36;
  prepareDiscovery(tired);
  assert.ok(tired.agent.discovery.failures.some(f => f.signature === signature), "an exhausted unchanged proposal is retained as a failure, not silently restarted");
});

test("the 168-hour development study can leave a blocked test approach without supplies or assigned answers", () => {
  let s = createSurvivalRun("discovery-dev-long-4", { policyVersion: 4, agentCount: 1, climateVolatility: "harsh", durationHours: 168, continuity: false });
  while (s.status === "running") { s = step(s); if (s.tick % 36 === 0) assert.equal(validateSurvivalRun(s), true); }
  assert.equal(s.status, "completed"); assert.equal(s.stats.livingAgents, 1);
  assert.equal(s.stats.observerInterventions, 0); assert.equal(validateSurvivalRun(s), true);
  assert.ok(s.agents[0].discovery.metrics.measurements > 0);
});
function feature(s) { return featuresFor(input(s), { size: { x: 3, y: 2, z: .25 }, position: { x: s.agents[0].position.x, y: 1, z: s.agents[0].position.z + 1.2 }, rotation: 0, material: "wood", mass: .975 }); }
function evidence(s, n, value, f = feature(s), metric = "protection") {
  return { id: `measured-${n}`, originalId: `measured-${n}`, originalObserverId: s.agents[0].id, tick: n, receivedAt: n, source: "personal", metric, features: f, value, before: 1, dose: f.dose, partId: "part-1", experimentId: null, interpretation: "Isolated model test input; not an end-to-end demonstration.", confounds: [] };
}

test("policy 4 is opt-in in the constructor, versioned, and legacy policies never acquire discovery state", () => {
  for (const policyVersion of [2, 3]) {
    const before = createSurvivalRun("discovery-legacy", { policyVersion, agentCount: 1 });
    const restored = restoreSurvivalRun(serializeSurvivalRun(before));
    assert.deepEqual(restored, before);
    const after = step(before, 3); assert.equal(after.policyVersion, policyVersion); assert.equal(after.agents[0].discovery, undefined);
  }
  const modern = createSurvivalRun("discovery-version", { policyVersion: 4 });
  assert.equal(modern.schemaVersion, 5); assert.equal(modern.succession, undefined); assert.equal(modern.config.continuity, false);
  assert.equal(createSurvivalRun("default").policyVersion, 2);
  assert.equal(validateSurvivalRun({ ...modern, schemaVersion: 4 }), false);
  assert.equal(validateSurvivalRun({ ...modern, policyVersion: 3 }), false);
});

test("runtime allowlist removes diagnostics, extra nested fields and the world random seed", () => {
  const s = step(createSurvivalRun("isolation", { policyVersion: 4, agentCount: 2 }));
  const before = input(s), choices = prepareDiscovery(structuredClone(before));
  s.seed += 3241; s.agents[1].memory.push({ secret: "other-private-memory" });
  s.agents[0].survivalRecord.hidden = "observer-diagnostic"; s.agents[0].hidden = "world-secret";
  s.agents[0].needs.hidden = 876;
  s.agents[0].discovery.hidden = "world-secret";
  s.agents[0].observations[0].facts.hiddenStrength = 123;
  const strength = MATERIALS.wood.strength; MATERIALS.wood.strength = 999;
  try { assert.deepEqual(input(s), before); assert.deepEqual(prepareDiscovery(input(s)), choices); }
  finally { MATERIALS.wood.strength = strength; }
  assert.notEqual(before.seed, s.seed);
  assert.equal(JSON.stringify(input(s)).includes("world-secret"), false);
  assert.equal("survivalRecord" in before.agent, false);
  const detached = input(s); detached.agent.inventory.wood = 77; assert.notEqual(s.agents[0].inventory.wood, 77);
});

test("snapshot copies every supported private discovery field without sharing mutable references", () => {
  let s = protectionPressure(); s = step(s, 72);
  assert.deepEqual(input(s).agent.discovery, s.agents[0].discovery);
  assert.deepEqual(input(s).agent.navigation, s.agents[0].navigation);
  const forbidden = structuredClone(s); forbidden.agents[0].physicalMind.readings.push({ measurementKind: "counterfactual", before: .75 });
  assert.deepEqual(input(forbidden).agent.physicalMind.readings, input(s).agent.physicalMind.readings);
});

test("contextual updates change subsequent predictions; frozen updates still retain all failures", () => {
  const s = createSurvivalRun("model", { policyVersion: 4, agentCount: 1 }), f = feature(s);
  const learned = freshDiscoveryMind(), frozen = freshDiscoveryMind(); frozen.mode = "frozen";
  const prior = predictDiscovery(learned, "protection", f);
  for (let n = 1; n <= 4; n++) { acceptDiscoveryEvidence(learned, evidence(s, n, .8, f)); acceptDiscoveryEvidence(frozen, evidence(s, n, .8, f)); }
  assert.ok(predictDiscovery(learned, "protection", f).mean > prior.mean + .3);
  assert.deepEqual(predictDiscovery(frozen, "protection", f), prior);
  acceptDiscoveryEvidence(frozen, evidence(s, 5, 0, f)); assert.equal(frozen.evidence.at(-1).value, 0);
  const beforeFailure = predictDiscovery(learned, "protection", f).mean;
  for (let n = 5; n < 12; n++) acceptDiscoveryEvidence(learned, evidence(s, n, 0, f));
  assert.ok(predictDiscovery(learned, "protection", f).mean < beforeFailure - .2);
  assert.ok(predictDiscovery(learned, "protection", { ...f, weather: "storm", width: .4, rotation: Math.PI / 2 }).uncertainty > .1);
  assert.ok(predictDiscovery(learned, "protection", f).uncertainty > 0, "one or several trials never imply certainty");
});

test("a low-mean option can warrant a consequential test, but irrelevant tests receive no reward", () => {
  const s = createSurvivalRun("voi", { policyVersion: 4 }), p = predictDiscovery(freshDiscoveryMind(), "protection", feature(s));
  const uncertain = { ...p, mean: .2, low: 0, high: .9 };
  assert.ok(decisionInformationValue(uncertain, x => x * 20, 6, .5) > 0);
  assert.equal(decisionInformationValue(uncertain, x => x * .1, 6, .5), 0);
  assert.equal(decisionInformationValue(uncertain, x => x * 20, 6, 100), 0);
});

test("new physical tests measure the occupied world, conserve matter, and cannot act after death", () => {
  const s = createSurvivalRun("operation-unit", { policyVersion: 4, agentCount: 1 }), a = s.agents[0];
  // Isolated executor fixture, explicitly separate from autonomous demonstrations.
  a.position = { x: 60, z: 60 }; a.inventory.wood = 2;
  const made = executeManipulation(s.physical, a, { kind: "shape", material: "wood", mass: .65, size: { x: 1, y: 1, z: 1 } }, s.environment, 0, [a.position], true);
  assert.ok(made.ok); assert.equal(a.inventory.wood, 1.35);
  const read = executeManipulation(s.physical, a, { kind: "test", partId: made.partId, measure: "protection", dose: 1 }, s.environment, 0, [a.position], true);
  assert.equal(read.reading.measurementKind, "local"); assert.equal(read.reading.before, read.reading.after); assert.match(read.summary, /no part-removal/);
  const before = structuredClone(s);
  assert.equal(executeManipulation(s.physical, a, { kind: "shape", material: "uranium", mass: -1, size: { x: 1, y: 1, z: 1 } }, s.environment, 0, [a.position], true).ok, false);
  assert.deepEqual(s, before, "invalid typed requests have zero partial mutations");
  a.alive = false; const dead = structuredClone(s);
  assert.equal(executeManipulation(s.physical, a, { kind: "reclaim", partId: made.partId }, s.environment, 0, [a.position], true).ok, false); assert.deepEqual(s, dead);
});

test("load observations are censored at the applied dose, not exact breaking strengths", () => {
  const s = createSurvivalRun("load-unit", { policyVersion: 4 }), mind = freshDiscoveryMind(), f = { ...feature(s), width: .6, height: 2.4, depth: .6, dose: .5 };
  acceptDiscoveryEvidence(mind, evidence(s, 1, 1, f, "support"));
  assert.ok(predictDiscovery(mind, "support", f).samples > 0);
  assert.ok(predictDiscovery(mind, "support", { ...f, dose: 4.5 }).mean < predictDiscovery(mind, "support", f).mean);
});

test("testimony preserves source identity and repeated reporting cannot become replication", () => {
  const s = createSurvivalRun("testimony", { policyVersion: 4, agentCount: 3 }), e = evidence(s, 1, .6), recipient = s.agents[1];
  assert.equal(receiveDiscoveryTestimony(recipient, e, 2), true);
  assert.equal(receiveDiscoveryTestimony(recipient, { ...e, id: "relay-id", source: "testimony" }, 3), false);
  assert.equal(recipient.discovery.models[0].samples, 1);
  assert.equal(recipient.discovery.evidence[0].originalId, e.originalId);
  assert.equal(recipient.discovery.evidence[0].source, "testimony");
  assert.equal(s.agents[2].discovery.evidence.length, 0);
});

test("cold pressure creates goals and records contradictory measurements without inventing a repair", () => {
  let s = protectionPressure(); const events = [];
  assert.deepEqual(s.agents[0].discovery.goals, []); assert.deepEqual(s.agents[0].discovery.models, []);
  assert.equal(s.physical.parts.length, 0); assert.equal(s.agents[0].inventory.wood, 0);
  for (let n = 0; n < 432; n++) {
    const result = advanceSurvivalRun(s, 1); s = result.state; events.push(...result.events); assert.ok(validateSurvivalRun(s), `valid checkpoint at tick ${s.tick}`);
  }
  const comparisons = events.filter(e => e.facts.operation === "discovery_comparison").map(e => JSON.parse(e.facts.candidateSummary));
  assert.ok(comparisons.some(d => d.alternatives.some(a => a.kind === "survival") && d.alternatives.some(a => a.kind === "arrange")));
  const measured = events.filter(e => e.facts.operation === "discovery_measurement"); assert.ok(measured.length > 0);
  for (const event of measured) { const prediction = JSON.parse(event.facts.preActionPrediction), reading = JSON.parse(event.facts.measurement); assert.ok(prediction.createdAt <= reading.tick); assert.equal(prediction.id, reading.experimentId); }
  assert.ok(s.agents[0].discovery.models.some(c => c.samples > 0));
  assert.ok(s.agents[0].discovery.metrics.adaptations > 0);
  assert.ok(s.agents[0].discovery.goals.some(g => g.status === "abandoned"));
  assert.ok(s.agents[0].discovery.experiments.some(e => e.evidenceId && e.result.includes("reading")));
  assert.equal(s.stats.observerInterventions, 0);
  assert.equal(s.status, "completed"); assert.equal(s.stats.livingAgents, 1, "72-hour harsh-exposure recovery regression, no supplies or policy answers injected");
  assert.deepEqual(restoreSurvivalRun(serializeSurvivalRun(s)), s);
});

test("raw-material end-to-end discovery learns support, changes a later choice and executes a transferred procedure", () => {
  let s = protectionPressure("discovery-dev-basin-1", { climateVolatility: "variable" });
  assert.equal(s.physical.parts.length, 0); assert.equal(s.agents[0].inventory.wood, 0);
  assert.deepEqual(s.agents[0].discovery.procedures, []);
  const events = [];
  for (let n = 0; n < 36; n++) {
    const result = advanceSurvivalRun(s, 1); s = result.state; events.push(...result.events);
    assert.ok(validateSurvivalRun(s));
    if (s.tick === 31) assert.deepEqual(step(restoreSurvivalRun(serializeSurvivalRun(s)), 2), step(s, 2));
  }
  const mind = s.agents[0].discovery, procedure = structuredClone(mind.procedures[0]);
  assert.ok(procedure, "a successful measured sequence is learned without fixture-supplied answers");
  assert.ok(mind.goals.some(g => g.metric === "support" && g.parentId && g.status === "satisfied"));
  assert.ok(mind.goals[0].originatingConditions.forecastSafety < mind.goals[0].originatingConditions.safety);
  assert.ok(events.some(e => e.facts.operation === "discovery_measurement" && JSON.parse(e.facts.measurement).metric === "support"));
  const inventory = structuredClone(s.agents[0].inventory), earned = structuredClone(mind);
  s = transferPressure(s); // Explicit environmental intervention, no goal/program/knowledge supplied.
  assert.deepEqual(s.agents[0].inventory, inventory); assert.deepEqual(s.agents[0].discovery, earned);
  let choiceChange = null;
  for (let n = 0; n < 50; n++) {
    s.environment.weather = "cold_snap"; // Declared environmental fixture, not future weather in the policy input.
    const result = advanceSurvivalRun(s, 1); s = result.state; events.push(...result.events);
    assert.ok(validateSurvivalRun(s));
    const learned = input(s), frozen = structuredClone(learned); frozen.agent.discovery.mode = "frozen";
    const a = prepareDiscovery(learned)[0], b = prepareDiscovery(frozen)[0];
    if (JSON.stringify(a?.actions) !== JSON.stringify(b?.actions)) choiceChange = { learned: a, frozen: b };
  }
  assert.ok(choiceChange, "same priors, evidence, procedures and budget; only contextual parameter use differs");
  assert.ok(s.agents[0].discovery.metrics.transfers > 0);
  const reused = s.agents[0].discovery.procedures.find(p => p.id === procedure.id);
  assert.ok(reused.successes > 1); assert.ok(reused.uncertainty < procedure.uncertainty);
  assert.deepEqual(reused.program, procedure.program, "relative program survives rebinding; new primitives still execute");
  assert.ok(s.physical.parts.length > 2 && s.physical.workEnergy > 10);
  const readings = events.filter(e => e.facts.operation === "discovery_measurement").map(e => JSON.parse(e.facts.measurement));
  assert.ok(new Set(readings.map(e => e.partId)).size >= 4, "actual new parts, not an old ID or free macro result");
  assert.deepEqual(restoreSurvivalRun(serializeSurvivalRun(s)), s);
});

test("urgent survival interrupts an earned partial project without erasing work, costs or evidence", () => {
  const s = step(protectionPressure("discovery-dev-basin-1", { climateVolatility: "variable" }), 31);
  const before = structuredClone(s.physical), privateState = input(s), active = structuredClone(privateState.agent.discovery.active);
  assert.ok(active && active.completed.length);
  privateState.agent.needs.hydration = 12;
  const choices = prepareDiscovery(privateState);
  assert.ok(choices.every(c => !c.actions.some(a => a.manipulation)));
  assert.deepEqual(privateState.agent.discovery.active.completed, active.completed);
  assert.equal(privateState.agent.discovery.active.spentEffort, active.spentEffort);
  assert.equal(privateState.agent.discovery.active.spentTicks, active.spentTicks);
  assert.ok(privateState.agent.discovery.experiments.some(e => e.status === "interrupted"));
  assert.deepEqual(s.physical, before);
});

test("observed standing support can lead to distinct support and protection goals", () => {
  const s = step(supportPressure(), 72), mind = s.agents[0].discovery;
  assert.ok(mind.goals.some(g => g.metric === "support" && g.status === "satisfied" && /load/.test(g.reason)));
  assert.ok(mind.goals.some(g => g.metric === "protection"));
  assert.ok(mind.evidence.some(e => e.metric === "protection"));
});

test("a contradictory protection result cannot erase a satisfied support prerequisite (isolated outcome unit)", () => {
  const s = step(protectionPressure("discovery-dev-basin-1", { climateVolatility: "variable" }), 31);
  const privateInput = input(s), a = privateInput.agent, mind = a.discovery;
  const active = mind.active, project = a.physicalMind.projects.find(p => p.id === active.projectId);
  const supportOp = project.operations.find(o => o.kind === "test" && o.measure === "load");
  assert.ok(supportOp);
  beginDiscoveryOperation(privateInput, supportOp);
  const support = mind.experiments.find(e => e.metric === "support" && e.projectId === project.id);
  const reading = { id: "unit-load", tick: 32, observerId: a.id, source: "test", revision: 1, partId: supportOp.partId, material: "wood", position: { ...a.position }, size: { x: .7, y: 2.4, z: .7 }, rotation: 0, mass: .76, condition: 1, metric: "load", before: 1, after: 1, dose: supportOp.dose, temperature: support.prediction.features.temperature, weather: support.prediction.features.weather, confidence: .85, summary: "Isolated supplied outcome unit, not an executed autonomous experiment.", measurementKind: "local" };
  finishDiscoveryOperation(a, supportOp, { ok: true, partId: supportOp.partId, effort: .6, summary: reading.summary, reading }, 32);
  const supportGoal = mind.goals.find(g => g.id === support.goalId);
  assert.equal(supportGoal.status, "satisfied");
  const protection = mind.experiments.find(e => e.metric === "protection" && e.projectId === project.id);
  assert.equal(protection.status, "running");
  finishDiscoveryOperation(a, { kind: "test", partId: supportOp.partId, measure: "protection", dose: 1 }, { ok: true, partId: supportOp.partId, effort: .6, summary: reading.summary,
    reading: { ...reading, id: "unit-protection", tick: 33, metric: "protection", before: 0, after: 0, temperature: protection.prediction.features.temperature, weather: protection.prediction.features.weather } }, 33);
  assert.equal(supportGoal.status, "satisfied");
  assert.equal(mind.goals.find(g => g.id === active.goalId).status, "abandoned");
  assert.equal(mind.evidence.at(-1).value, 0); assert.equal(mind.active, null);
});

test("physical reach and unsupported placements cannot create functional free construction", () => {
  const s = createSurvivalRun("support-accounting-unit", { policyVersion: 4, agentCount: 1 }), a = s.agents[0];
  a.position = { x: 60, z: 60 }; a.inventory.wood = 1; // Isolated executor fixture only.
  const made = executeManipulation(s.physical, a, { kind: "shape", material: "wood", mass: .65, size: { x: 1, y: 1, z: 1 } }, s.environment, 0, [a.position], true);
  const before = structuredClone(s.physical.parts);
  const unreachable = executeManipulation(s.physical, a, { kind: "place", partId: made.partId, position: { x: 100, y: 3, z: 100 }, rotation: 0 }, s.environment, 0, [a.position], true);
  assert.equal(unreachable.ok, false); assert.deepEqual(s.physical.parts, before);
  executeManipulation(s.physical, a, { kind: "place", partId: made.partId, position: { x: 62, y: 3, z: 60 }, rotation: 0 }, s.environment, 0, [a.position], true);
  const part = s.physical.parts[0]; assert.equal(part.supported, false); assert.ok(part.condition <= .05);
  assert.equal(a.inventory.wood + part.composition.wood, 1, "damaged remnants retain material; no duplication");
});

test("learned procedures rebind new relationships and relative geometry rather than old object IDs", () => {
  // Isolated transfer test; the separate pressure demonstration learns its own program.
  const s = createSurvivalRun("transfer-unit", { policyVersion: 4 }), a = s.agents[0];
  const procedure = { id: "unit", origin: { x: 20, z: 20 }, inputs: [], program: [{ kind: "shape", material: "wood", mass: .65, size: { x: 1, y: 1, z: 1 } }, { kind: "place", partId: "$0", position: { x: 1.5, y: .5, z: .8 }, rotation: .2 }, { kind: "test", partId: "$0", measure: "protection", dose: 1 }] };
  const transferred = bindDiscoveryProcedure(input(s), procedure, { x: 50, z: 50 });
  assert.deepEqual(transferred[1].position, { x: 51.5, y: .5, z: 50.8 }); assert.equal(transferred[1].partId, "$0");
  assert.equal(a.inventory.wood, 0, "binding grants neither material nor a physical ability");
});

test("adequate conditions abstain; immediate needs preserve but interrupt optional progress", () => {
  const s = step(createSurvivalRun("abstention", { policyVersion: 4, agentCount: 1 }), 1), a = s.agents[0];
  a.discovery = freshDiscoveryMind(); for (const key of Object.keys(a.needs)) a.needs[key] = 100;
  a.observations.find(o => o.kind === "weather").facts = { weather: "clear", temperatureC: 25, daylight: 1 };
  const safe = input(s); prepareDiscovery(safe); assert.equal(safe.agent.discovery.goals.length, 0);
  a.needs.hydration = 12; const urgent = input(s); const actions = prepareDiscovery(urgent);
  assert.ok(actions.every(c => !c.actions.some(x => x.manipulation)));
  assert.equal(urgent.agent.discovery.experiments.length, 0);
});

test("memory and dependency limits fail closed; successors and manual additions start without knowledge", () => {
  const s = createSurvivalRun("limits", { policyVersion: 4, agentCount: 1 }), mind = s.agents[0].discovery;
  for (let n = 1; n <= 110; n++) acceptDiscoveryEvidence(mind, evidence(s, n, n % 2));
  assert.ok(mind.evidence.length <= DISCOVERY_LIMITS.evidence); assert.ok(mind.models.length <= DISCOVERY_LIMITS.models);
  assert.equal(acceptDiscoveryEvidence(mind, evidence(s, 1, 1)), false);
  const clean = createSurvivalRun("admission", { policyVersion: 4, agentCount: 1 });
  const added = addObserverAgent(clean); assert.equal(added.ok, true); assert.equal(added.agent.discovery.models.length, 0);
  for (const mutation of [x => x.agents[0].discovery.version = 99, x => x.agents[0].discovery.models.push({ mean: Infinity }), x => x.agents[0].discovery.active = { goalId: "invented" }]) { const bad = structuredClone(clean); mutation(bad); assert.equal(validateSurvivalRun(bad), false); }
});

test("goal dependencies reject cycles, excess depth and missing parents", () => {
  const s = step(protectionPressure(), 1), root = s.agents[0].discovery.goals[0];
  assert.ok(root);
  for (const mutate of [
    goals => { goals[0].parentId = goals[0].id; },
    goals => { goals[0].parentId = "missing-parent"; },
    goals => {
      for (let n = 1; n <= DISCOVERY_LIMITS.depth + 1; n++) goals.push({ ...structuredClone(root), id: `depth-${n}`, parentId: n === 1 ? root.id : `depth-${n - 1}`, metric: "support" });
    },
  ]) {
    const bad = structuredClone(s); mutate(bad.agents[0].discovery.goals);
    assert.equal(validateSurvivalRun(bad), false);
  }
  const dying = createSurvivalRun("permanent-death-unit", { policyVersion: 4, agentCount: 1 });
  dying.agents[0].needs.health = 0; // Isolated physiology boundary, not a discovery demonstration.
  const ended = step(dying);
  assert.equal(ended.stats.livingAgents, 0);
  assert.deepEqual(step(ended, 12), ended, "an extinct survival-only study cannot resurrect its agent");
});
