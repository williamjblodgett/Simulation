import assert from "node:assert/strict";
import test from "node:test";
import { createSurvivalRun, advanceSurvivalRun, validateSurvivalRun, serializeSurvivalRun, restoreSurvivalRun, freshwaterShorePosition } from "../app/simulation/survival/index.ts";
import { advanceSurvivalRun as baselineAdvance, createSurvivalRun as baselineCreate } from "../app/simulation/survival/baseline-engine.ts";
import { planFromPrivateKnowledge, evaluateDonation } from "../app/simulation/survival/planner.ts";
import { chooseExperimentDose, evaluateCausalExperiment, preparedMaterialContext, hasReplicatedCausalEffect } from "../app/simulation/survival/experiments.ts";
import { researchMaterialEvidence } from "../app/simulation/survival/research-evidence.ts";
import { driftNeeds } from "../app/simulation/survival/physiology.ts";

function privateFixture() {
  const world = createSurvivalRun("private-ordering", { agentCount: 1 });
  const agent = world.agents[0];
  agent.position = { x: 0, z: 0 };
  agent.needs = { health: 90, hydration: 24, nutrition: 90, energy: 90, warmth: 90, safety: 90 };
  agent.observations = [0, 1].map(index => ({ id: `obs-${index}`, observerId: agent.id, subjectId: `water-${index}`, kind: "resource", observedAt: 1, confidence: 1, position: { x: index * 14, z: 0 }, facts: { resourceKind: "freshwater", availableEstimate: 10, contaminated: false } }));
  return { agent, tick: 1, seed: world.seed, bounds: world.environment.bounds };
}

test("v2 private policy is deterministic, immutable, and independent of unseen world truth", () => {
  const input = privateFixture(), before = structuredClone(input);
  const first = planFromPrivateKnowledge(input);
  const unrelatedWorld = createSurvivalRun("unseen-world");
  unrelatedWorld.environment.resources.forEach(r => { r.quantity = 0; r.contaminated = true; });
  assert.deepEqual(planFromPrivateKnowledge(input), first);
  assert.deepEqual(input, before);
  assert.ok(first.every(p => p.candidate.knownObservationIds.every(id => input.agent.observations.some(o => o.id === id))));
});

test("contextual yield learning changes the chosen source without condemning other sites", () => {
  const input = privateFixture();
  assert.equal(planFromPrivateKnowledge(input)[0].actions[0].targetId, "water-0");
  input.agent.learning = [{ context: "site:water-0:collect", attempts: 20, successes: 1, expectedUtility: -4, expectedYield: 0.1, variance: 1, updatedAt: 1 }];
  assert.equal(planFromPrivateKnowledge(input)[0].actions[0].targetId, "water-1");
});

test("planner composes collecting before drinking and retains executable ration quantities", () => {
  const choices = planFromPrivateKnowledge(privateFixture());
  const actions = choices[0].actions.map(a => a.action);
  assert.equal(actions[0], "collect");
  assert.ok(actions.indexOf("drink") > actions.indexOf("collect"));
  assert.ok(actions.length > 1);
});

test("planned repeated collection cannot exceed remembered site stock", () => {
  const input = privateFixture();
  input.agent.needs.hydration = 10;
  input.agent.observations = [{ id: "one-water", observerId: input.agent.id, subjectId: "one-ration", kind: "resource", observedAt: input.tick, confidence: 1, position: { x: 0, z: 0 }, facts: { resourceKind: "freshwater", availableEstimate: 1, contaminated: false } }];
  const choices = planFromPrivateKnowledge(input);
  assert.ok(choices.some(p => p.actions.some(a => a.targetId === "one-ration")));
  for (const { actions } of choices) assert.ok(actions.filter(a => a.targetId === "one-ration" && ["collect", "gather"].includes(a.action)).length <= 1);
});

test("consumed contaminated samples cannot describe subsequently received clean water", () => {
  let state = createSurvivalRun("sample-transfer-check", { agentCount: 2, agentCap: 2, durationHours: null, climateVolatility: "stable" });
  const [clean, dirty] = state.environment.resources.filter(site => site.kind === "freshwater");
  clean.contaminated = false; dirty.contaminated = true;
  function force(index, action, targetId = null) {
    state.agents[index].currentPlan = { id: `fixture-plan-${index}`, formedAt: state.tick, goal: action === "share" ? "share" : "wait", targetId, targetPosition: null, status: "active", rationale: "Executor regression fixture", activeStepIndex: 0,
      steps: [{ id: `fixture-step-${index}`, action, targetId, destination: null, remainingSteps: 1, status: "pending", ...(action === "share" ? { resource: "freshwater", amount: 1 } : {}) }] };
  }
  function pair(leftAction, leftTarget, rightAction, rightTarget) { force(0, leftAction, leftTarget); force(1, rightAction, rightTarget); state = advanceSurvivalRun(state, 1).state; }
  state.agents[0].position = freshwaterShorePosition(clean); state.agents[1].position = freshwaterShorePosition(dirty);
  pair("collect", clean.id, "collect", dirty.id);
  pair("collect", clean.id, "drink", null);
  pair("wait", null, "drink", null);
  assert.equal(state.agents[1].inventory.freshwater, 0);
  assert.equal(preparedMaterialContext("water_boiling", false, state.agents[1].materialSamples).contamination, null);
  state.agents[1].position = { ...state.agents[0].position };
  state.agents[1].relationships = [{ agentId: state.agents[0].id, trust: 100, encounters: 0, aidGiven: 0, aidReceived: 0, lastInteractionAt: 0 }];
  pair("share", state.agents[1].id, "wait", null);
  assert.equal(state.agents[1].inventory.freshwater, 1); assert.equal(state.agents[0].inventory.freshwater, 3);
  assert.ok(state.events.some(e => e.type === "social_accepted" && e.tick === state.tick && e.facts.resource === "freshwater"));
  const context = preparedMaterialContext("water_boiling", false, state.agents[1].materialSamples);
  assert.ok(context.contamination === null || context.contamination === 0);
  assert.equal(evaluateCausalExperiment("water_boiling", 1, context).verdict, "uninformative");
});

test("donation depends on responder needs, exact resource and post-transfer reserves", () => {
  const agent = privateFixture().agent;
  agent.inventory.freshwater = 2; agent.inventory.food = 2;
  agent.needs.hydration = 3;
  assert.equal(evaluateDonation(agent, "freshwater", 1).accepted, false);
  assert.equal(evaluateDonation(agent, "food", 1).accepted, true);
  agent.needs.hydration = 90;
  assert.equal(evaluateDonation(agent, "freshwater", 1).accepted, true);
  assert.equal(evaluateDonation(agent, "freshwater", 2).accepted, false);
});

test("stale partner availability failures suppress another identical remote request", () => {
  const input = privateFixture(); input.agent.observations = [{ id: "other", observerId: input.agent.id, subjectId: "agent-other", kind: "agent", position: { x: 2, z: 0 }, observedAt: 1, confidence: 0.25, facts: { alive: true, lastPresenceFailureAt: 2 } }];
  input.tick = 3;
  assert.equal(planFromPrivateKnowledge(input).some(p => p.actions.some(a => a.action === "request")), false);
});

test("research knowledge survives resource depletion without granting unseen material knowledge", () => {
  const input = privateFixture();
  input.agent.observations[0].facts.availableEstimate = 0;
  assert.equal(researchMaterialEvidence(input.agent, "freshwater")?.subjectId, "water-0");
  assert.equal(researchMaterialEvidence(input.agent, "stone"), undefined);
});

test("causal experiments cannot succeed by retrying a wrong procedure or an invalid control", () => {
  const context = preparedMaterialContext("controlled_fire", false);
  const failures = Array.from({ length: 30 }, () => ({ causal: evaluateCausalExperiment("controlled_fire", 0.25, context) }));
  assert.ok(failures.every(a => a.causal.verdict === "not_supported"));
  assert.equal(hasReplicatedCausalEffect(failures), false);
  const control = evaluateCausalExperiment("controlled_fire", 0, context);
  assert.equal(control.treatment, control.control);
  const unknown = evaluateCausalExperiment("water_boiling", 1, preparedMaterialContext("water_boiling", false));
  assert.equal(unknown.verdict, "uninformative");
  assert.equal(chooseExperimentDose("water_boiling", [{ causal: unknown }], unknown.context), null);
});

test("experiment parameter search changes after failure and requires same-context replication", () => {
  const context = preparedMaterialContext("controlled_fire", false);
  const first = chooseExperimentDose("controlled_fire", [], context);
  const failed = { causal: evaluateCausalExperiment("controlled_fire", first, context) };
  const history = [failed];
  let second, supported;
  for (let i = 0; i < 4; i++) {
    second = chooseExperimentDose("controlled_fire", history, context);
    assert.notEqual(second, first);
    supported = { causal: evaluateCausalExperiment("controlled_fire", second, context) };
    if (supported.causal.verdict === "supported") break;
    history.push(supported);
  }
  assert.equal(supported.causal.verdict, "supported");
  assert.equal(hasReplicatedCausalEffect([supported]), false);
  assert.equal(chooseExperimentDose("controlled_fire", [failed, supported], context), second);
  assert.equal(hasReplicatedCausalEffect([supported, structuredClone(supported)]), true);
  assert.notEqual(evaluateCausalExperiment("controlled_fire", second, preparedMaterialContext("controlled_fire", true)).treatment, supported.causal.treatment);
});

test("physiology prediction includes cold rain, starvation and sheltered safety", () => {
  const needs = { health: 100, hydration: 100, nutrition: 0, energy: 100, warmth: 70, safety: 50 };
  driftNeeds(needs, { temperatureC: 13, weather: "rain", daylight: 1, sheltered: false, byFire: false });
  assert.equal(needs.warmth, 69.58); assert.equal(needs.health, 97.2); assert.equal(needs.safety, 50.1);
});

test("old checkpoints retain baseline behavior and new runs preserve v2 replay across save and batches", () => {
  const legacy = baselineCreate("legacy-policy", { agentCount: 1 });
  assert.deepEqual(advanceSurvivalRun(legacy, 20), baselineAdvance(legacy, 20));
  const fresh = createSurvivalRun("v2-roundtrip", { agentCount: 3 });
  const split = restoreSurvivalRun(serializeSurvivalRun(advanceSurvivalRun(fresh, 25).state));
  assert.deepEqual(advanceSurvivalRun(split, 25).state, advanceSurvivalRun(fresh, 50).state);
  fresh.policyVersion = 77; assert.equal(validateSurvivalRun(fresh), false);
});
