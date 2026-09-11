import assert from "node:assert/strict";
import test from "node:test";
import { affectDecisionAdjustment, freshAgentAffect, noteAffectOutcome, updateAgentAffect } from "../app/simulation/survival/affect.ts";
import { discoveryInput } from "../app/simulation/survival/discovery-boundary.ts";
import { advanceSurvivalRun, createSurvivalRun, restoreSurvivalRun, serializeSurvivalRun, validateSurvivalRun } from "../app/simulation/survival/engine.ts";
import { attachPrivateMaterialView, learnMaterialOutcome, planMaterialKnowledge } from "../app/simulation/survival/material-policy.ts";
import { applyMaterialTool, executeMaterialOperation } from "../app/simulation/survival/material-world.ts";

function fixture(seed = "material-process") {
  const state = createSurvivalRun(seed, { policyVersion: 4, materialFoundation: "geology-v1", knowledgeFoundation: "materials-v1", affectModel: "adaptive-v1", agentCount: 1, climateVolatility: "stable" });
  const agent = state.agents[0];
  agent.needs = { health: 96, hydration: 94, nutrition: 94, energy: 100, warmth: 92, safety: 92 };
  agent.inventory.wood = 12;
  agent.inventory.clay = 4;
  const site = state.environment.resources.find(resource => resource.feedstock === "iron_ore");
  site.quantity -= 1.5;
  agent.position = { ...site.position };
  agent.inventory.stone = 1.5;
  agent.rawFeedstocks.iron_ore = 1.5;
  agent.materialSamples ??= {};
  agent.materialSamples.stone = { sourceId: site.id, sampledAt: 0, contamination: null, activity: null };
  agent.observations.push({ id: `obs-${agent.id}-iron`, observerId: agent.id, kind: "resource", subjectId: site.id, observedAt: 0, position: { ...site.position }, confidence: .94, facts: { resourceKind: "stone", mineralAppearance: "Dense rust-colored rock", availableEstimate: Math.round(site.quantity), bulkDensity: 2.5 } });
  return { state, agent, site };
}

function perform(state, agent, operation) {
  const result = executeMaterialOperation(state.materials, agent, operation, state.environment, state.tick);
  learnMaterialOutcome(agent, operation, result, state.tick);
  return result;
}

test("new material/affect studies are explicit and legacy geology studies remain valid", () => {
  const legacy = createSurvivalRun("legacy-material", { policyVersion: 4, materialFoundation: "geology-v1", agentCount: 1 });
  const current = createSurvivalRun("current-material", { policyVersion: 4, materialFoundation: "geology-v1", knowledgeFoundation: "materials-v1", affectModel: "adaptive-v1", agentCount: 1 });
  assert.equal(legacy.schemaVersion, 6); assert.equal(legacy.materials, undefined); assert.equal(legacy.agents[0].affect, undefined);
  assert.equal(current.schemaVersion, 7); assert.ok(current.materials); assert.ok(current.agents[0].materialMind); assert.ok(current.agents[0].affect);
  assert.equal(validateSurvivalRun(legacy), true); assert.equal(validateSurvivalRun(current), true);
  assert.deepEqual(restoreSurvivalRun(serializeSurvivalRun(current)), current);
});

test("invalid material work is atomic and charges neither matter nor physiological effort", () => {
  const { state, agent } = fixture();
  const before = structuredClone({ materials: state.materials, inventory: agent.inventory, needs: agent.needs, raw: agent.rawFeedstocks });
  const result = executeMaterialOperation(state.materials, agent, { kind: "prepare_charcoal", wood: 99, cover: .7, duration: 6 }, state.environment, 0);
  assert.equal(result.accepted, false);
  assert.deepEqual({ materials: state.materials, inventory: agent.inventory, needs: agent.needs, raw: agent.rawFeedstocks }, before);
});

test("charcoal, separation, hearth, reduction, hot working and tool use conserve tracked provenance", () => {
  const { state, agent, site } = fixture();
  const charcoal1 = perform(state, agent, { kind: "prepare_charcoal", wood: 2, cover: .72, duration: 6 });
  const charcoalBatch1 = state.materials.batches.find(batch => charcoal1.outputIds.includes(batch.id) && batch.kind === "charcoal");
  const concentrate = perform(state, agent, { kind: "concentrate_ore", sourceId: site.id, mass: 1.5, separation: .62, duration: 5 });
  const concentrateBatch = state.materials.batches.find(batch => concentrate.outputIds.includes(batch.id) && batch.kind === "concentrate");
  const hearth = perform(state, agent, { kind: "form_hearth", clay: 1.2, charcoalId: charcoalBatch1.id, wallThickness: .24, duration: 8 });
  const hearthBatch = state.materials.batches.find(batch => hearth.outputIds.includes(batch.id) && batch.kind === "hearth");
  const charcoal2 = perform(state, agent, { kind: "prepare_charcoal", wood: 2, cover: .72, duration: 6 });
  const charcoalBatch2 = state.materials.batches.find(batch => charcoal2.outputIds.includes(batch.id) && batch.kind === "charcoal");
  const reduction = perform(state, agent, { kind: "reduce_ore", concentrateId: concentrateBatch.id, charcoalId: charcoalBatch2.id, hearthId: hearthBatch.id, airflow: .7, duration: 9 });
  assert.equal(reduction.accepted, true); assert.equal(reduction.supported, true); assert.ok(reduction.temperatureC > 1_000); assert.ok(reduction.wasteMass > 0);
  const bloom = state.materials.batches.find(batch => reduction.outputIds.includes(batch.id) && batch.kind === "bloom");
  const charcoal3 = perform(state, agent, { kind: "prepare_charcoal", wood: 2, cover: .72, duration: 6 });
  const charcoalBatch3 = state.materials.batches.find(batch => charcoal3.outputIds.includes(batch.id) && batch.kind === "charcoal");
  const working = perform(state, agent, { kind: "work_metal", bloomId: bloom.id, charcoalId: charcoalBatch3.id, hearthId: hearthBatch.id, form: "cutting_edge", work: .7, duration: 8 });
  const tool = state.materials.batches.find(batch => working.outputIds.includes(batch.id) && batch.kind === "tool");
  const testResult = perform(state, agent, { kind: "test_tool", toolId: tool.id, medium: "wood", force: .75, duration: 2 });
  assert.equal(testResult.supported, true); assert.ok(testResult.reading.value > 1.1); assert.equal(agent.materialMind.goal, null, "direct unit operations do not fabricate a planner goal");
  const beforeWear = tool.durability, effect = applyMaterialTool(state.materials, agent, "wood");
  assert.ok(effect.multiplier > 1); assert.ok(tool.durability < beforeWear);
  assert.equal(validateSurvivalRun(state), true);
  assert.equal(state.materials.consumedFeedstocks.iron_ore, 1.5);
  assert.ok(Math.abs(state.materials.batches.reduce((sum, batch) => sum + (batch.provenance.feedstocks?.iron_ore ?? 0), 0) - 1.5) < .001);
});

test("an under-heated reduction consumes its real charge and leaves altered ore plus waste", () => {
  const { state, agent, site } = fixture("material-failure");
  const lowFuel1 = perform(state, agent, { kind: "prepare_charcoal", wood: 2, cover: 0, duration: 6 });
  const first = state.materials.batches.find(batch => lowFuel1.outputIds.includes(batch.id) && batch.kind === "charcoal");
  const concentrate = perform(state, agent, { kind: "concentrate_ore", sourceId: site.id, mass: 1.5, separation: .5, duration: 5 });
  const ore = state.materials.batches.find(batch => concentrate.outputIds.includes(batch.id) && batch.kind === "concentrate");
  const hearthResult = perform(state, agent, { kind: "form_hearth", clay: 1.2, charcoalId: first.id, wallThickness: .1, duration: 8 });
  const hearth = state.materials.batches.find(batch => hearthResult.outputIds.includes(batch.id) && batch.kind === "hearth");
  const lowFuel2 = perform(state, agent, { kind: "prepare_charcoal", wood: 2, cover: 0, duration: 6 });
  const second = state.materials.batches.find(batch => lowFuel2.outputIds.includes(batch.id) && batch.kind === "charcoal");
  const beforeCount = state.materials.batches.length;
  const reduction = perform(state, agent, { kind: "reduce_ore", concentrateId: ore.id, charcoalId: second.id, hearthId: hearth.id, airflow: 0, duration: 1 });
  assert.equal(reduction.accepted, true); assert.equal(reduction.supported, false); assert.match(reduction.summary, /retained mostly altered ore/);
  assert.ok(state.materials.batches.some(batch => reduction.outputIds.includes(batch.id) && batch.kind === "roasted_ore"));
  assert.ok(!state.materials.batches.some(batch => batch.id === ore.id || batch.id === second.id));
  assert.ok(state.materials.batches.length >= beforeCount - 1, "charge becomes explicit product/remnants rather than disappearing");
  assert.equal(validateSurvivalRun(state), true);
});

test("a capability goal comes from personal work evidence and hidden truth cannot alter the private proposal", () => {
  const { state, agent } = fixture("private-material-policy");
  agent.inventory.stone = 0; agent.rawFeedstocks.iron_ore = 0; delete agent.materialSamples.stone;
  agent.memory = Array.from({ length: 5 }, (_, index) => ({ id: `memory-${index + 1}`, recordedAt: 0, action: "gather", targetId: `source-${index}`, result: "helpful", utility: 3, summary: "Personally gathered material." }));
  const makeInput = source => attachPrivateMaterialView(discoveryInput(source.agents[0], source.tick, source.environment.bounds), source.agents[0], source.materials);
  const first = planMaterialKnowledge(makeInput(state));
  assert.equal(first.candidate.goal, "develop_capability"); assert.equal(first.actions[0].action, "gather");
  const hidden = structuredClone(state);
  const site = hidden.environment.resources.find(resource => resource.id === first.actions[0].targetId);
  site.feedstock = "gold_ore";
  hidden.agents.push({ ...structuredClone(hidden.agents[0]), id: "agent-2", label: "A2", slot: 2, materialMind: { ...structuredClone(hidden.agents[0].materialMind), beliefs: [{ key: "secret", mean: 999, m2: 0, samples: 1, uncertainty: 0, evidenceIds: [], updatedAt: 0 }] } });
  assert.deepEqual(planMaterialKnowledge(makeInput(hidden)), first, "unobserved composition and another life's private beliefs stay outside the policy boundary");
  const privateInput = makeInput(state);
  assert.equal(privateInput.agent.rawFeedstocks, undefined); assert.ok(privateInput.agent.materialMind); assert.ok(privateInput.agent.affect);
});

test("the running engine can select a private capability proposal instead of requiring an assigned research task", () => {
  const { state, agent } = fixture("material-engine-selection");
  agent.memory = Array.from({ length: 12 }, (_, index) => ({ id: `memory-${index + 1}`, recordedAt: 0, action: "gather", targetId: `source-${index}`, result: "helpful", utility: 3, summary: "Personally gathered material." }));
  state.stats.memories = 12;
  state.nextIds.memory = 13;
  agent.currentPlan = null;
  agent.currentAction = { kind: "wait", targetId: null, status: "awaiting_decision", startedAt: 0, updatedAt: 0 };
  const advanced = advanceSurvivalRun(state, 5).state;
  const updated = advanced.agents[0];
  assert.equal(updated.currentDeliberation?.selectedGoal, "develop_capability");
  assert.equal(updated.currentPlan?.materialGoalId, updated.materialMind?.goal?.id);
  assert.equal(updated.currentPlan?.steps[0]?.materialOperation?.kind, "concentrate_ore");
  assert.equal(updated.materialMind?.experiments.at(-1)?.status, "performed");
  assert.ok(advanced.materials.records.some(record => record.agentId === updated.id && record.operation.kind === "concentrate_ore"));
  assert.equal(validateSurvivalRun(advanced), true);
});

test("contradictory source evidence changes the next private proposal instead of repeating one rock forever", () => {
  const { state, agent, site } = fixture("material-source-adaptation");
  agent.memory = Array.from({ length: 8 }, (_, index) => ({ id: `memory-${index + 1}`, recordedAt: 0, action: "gather", targetId: `source-${index}`, result: "helpful", utility: 3, summary: "Personally gathered stone." }));
  const firstInput = attachPrivateMaterialView(discoveryInput(agent, 0, state.environment.bounds), agent, state.materials);
  planMaterialKnowledge(firstInput);
  const failed = firstInput.agent.materialMind.experiments.at(-1);
  failed.status = "failed"; failed.result = "The source did not support the expected separation."; failed.endedAt = 0;
  firstInput.agent.materialMind.experiments.push({ ...structuredClone(failed), id: "material-experiment-agent-1-repeated" });
  agent.materialMind = firstInput.agent.materialMind;
  agent.inventory.stone = 0; agent.rawFeedstocks.iron_ore = 0; delete agent.materialSamples.stone;
  const alternative = state.environment.resources.find(resource => resource.feedstock === "copper_ore");
  agent.observations.push({ id: `obs-${agent.id}-copper`, observerId: agent.id, kind: "resource", subjectId: alternative.id, observedAt: 0, position: { ...alternative.position }, confidence: .9, facts: { resourceKind: "stone", mineralAppearance: "Green-streaked rock", availableEstimate: Math.round(alternative.quantity), bulkDensity: 2.4 } });
  const next = planMaterialKnowledge(attachPrivateMaterialView(discoveryInput(agent, 0, state.environment.bounds), agent, state.materials));
  assert.notEqual(next.actions[0].targetId, site.id);
  assert.equal(next.actions[0].targetId, alternative.id);
});

test("adaptive affect responds to lived conditions and remains a bounded disclosed influence", () => {
  const { state, agent } = fixture("affect-model");
  agent.affect = freshAgentAffect(0);
  const calmInquiry = affectDecisionAdjustment(agent.affect, "develop_capability", 2, 6, 85);
  agent.needs.hydration = 18;
  updateAgentAffect(agent, 1, "storm", 0);
  assert.ok(agent.affect.fear > .3); assert.equal(agent.affect.updatedAt, 1);
  const dangerInquiry = affectDecisionAdjustment(agent.affect, "develop_capability", 2, 6, 18);
  const dangerWater = affectDecisionAdjustment(agent.affect, "secure_water", 0, 0, 18);
  assert.ok(dangerInquiry < calmInquiry); assert.ok(dangerWater > 0);
  const frustration = agent.affect.frustration;
  noteAffectOutcome(agent, { tick: 1, action: "process_material", targetId: null, success: false, utility: -8, summary: "The trial failed." });
  assert.ok(agent.affect.frustration > frustration);
  const drivers = agent.affect.drivers.length;
  noteAffectOutcome(agent, { tick: 2, action: "process_material", targetId: null, success: false, utility: -8, summary: "The trial failed again." });
  assert.equal(agent.affect.drivers.length, drivers, "identical factual drivers are rate-limited instead of filling the record every step");
  state.tick = 2;
  state.elapsedMinutes = 20;
  state.day = 1;
  state.timeOfDay = 20;
  assert.equal(validateSurvivalRun(state), true);
});

test("an unobserved additional life cannot change another agent's adaptive state", () => {
  const { state } = fixture("affect-private-population");
  const withHiddenLife = structuredClone(state);
  const hidden = structuredClone(withHiddenLife.agents[0]);
  hidden.id = "agent-2"; hidden.label = "A2"; hidden.slot = 2;
  hidden.position = { x: withHiddenLife.environment.bounds.maxX - 2, z: withHiddenLife.environment.bounds.maxZ - 2 };
  hidden.observations = []; hidden.relationships = [];
  withHiddenLife.agents.push(hidden);
  const alone = advanceSurvivalRun(state, 1).state.agents[0].affect;
  const unknowinglyTogether = advanceSurvivalRun(withHiddenLife, 1).state.agents[0].affect;
  assert.deepEqual(unknowinglyTogether, alone);
});
