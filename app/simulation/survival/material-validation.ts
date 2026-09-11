import { validateAgentAffect } from "./affect";
import { feedstockKinds, feedstockMass } from "./geology";
import { MATERIAL_MECHANISM_PRIORS } from "./material-catalog";
import type { MaterialProvenance } from "./material-types";
import { MATERIAL_PROCESS_LIMITS, provenanceMass, validMaterialOperation } from "./material-world";
import type { SurvivalRunState } from "./types";

const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const finite = (value: unknown, minimum = -Infinity, maximum = Infinity): value is number => typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
const integer = (value: unknown, minimum = 0, maximum = Infinity): value is number => finite(value, minimum, maximum) && Number.isInteger(value);
const text = (value: unknown, maximum = 2_000): value is string => typeof value === "string" && value.length <= maximum;
const batchId = (value: unknown): value is string => typeof value === "string" && /^material-batch-[1-9]\d*$/.test(value);
const position = (value: unknown, state: SurvivalRunState) => record(value) && finite(value.x, state.environment.bounds.minX, state.environment.bounds.maxX) && finite(value.z, state.environment.bounds.minZ, state.environment.bounds.maxZ);

function provenance(value: unknown): value is MaterialProvenance {
  if (!record(value) || Object.keys(value).some((key) => !["wood", "stone", "clay", "feedstocks"].includes(key))) return false;
  if ([value.wood, value.stone, value.clay].some((entry) => entry !== undefined && !finite(entry, 0))) return false;
  if (value.feedstocks !== undefined && (!record(value.feedstocks) || Object.entries(value.feedstocks).some(([kind, amount]) => !feedstockKinds.includes(kind as never) || !finite(amount, 0)))) return false;
  return feedstockMass(value.feedstocks as never) <= Number(value.stone ?? 0) + 0.001;
}

function reading(value: unknown, state: SurvivalRunState): boolean {
  if (!record(value) || !text(value.id, 200) || !integer(value.tick, 0, state.tick) || !text(value.agentId, 200) || !text(value.operation, 60) || !text(value.metric, 60) || !finite(value.value) || !text(value.unit, 60) || !finite(value.uncertainty, 0) || !text(value.summary)) return false;
  return Array.isArray(value.inputIds) && Array.isArray(value.outputIds) && [...value.inputIds, ...value.outputIds].every((entry) => text(entry, 200));
}

function validateMind(value: unknown, state: SurvivalRunState, agentId: string): boolean {
  if (!record(value) || value.version !== 1 || !integer(value.nextId, 1) || !integer(value.lastReviewAt, -12, state.tick)) return false;
  const priors = MATERIAL_MECHANISM_PRIORS.map((prior) => prior.id);
  if (!Array.isArray(value.priorIds) || value.priorIds.length !== priors.length || value.priorIds.some((entry, index) => entry !== priors[index])) return false;
  if (!Array.isArray(value.beliefs) || value.beliefs.length > 32 || value.beliefs.some((entry) => !record(entry) || !text(entry.key, 200) || !finite(entry.mean) || !finite(entry.m2, 0) || !integer(entry.samples, 1) || !finite(entry.uncertainty, 0) || !integer(entry.updatedAt, 0, state.tick) || !Array.isArray(entry.evidenceIds) || entry.evidenceIds.length > 12 || entry.evidenceIds.some((id) => !text(id, 200)))) return false;
  if (!Array.isArray(value.evidence) || value.evidence.length > 96 || value.evidence.some((entry) => !record(entry) || !text(entry.id, 200) || !integer(entry.tick, 0, state.tick) || !text(entry.operation, 60) || (entry.predictionId !== null && !text(entry.predictionId, 200)) || !reading(entry.reading, state) || !text(entry.interpretation) || !Array.isArray(entry.confounds) || entry.confounds.length > 6 || entry.confounds.some((item) => !text(item, 500)))) return false;
  if (!Array.isArray(value.experiments) || value.experiments.length > 24 || value.experiments.some((entry) => !record(entry) || !text(entry.id, 200) || !text(entry.goalId, 200) || !integer(entry.createdAt, 0, state.tick) || !validMaterialOperation(entry.operation) || !text(entry.claim) || !record(entry.prediction) || !finite(entry.prediction.yieldLow, 0) || !finite(entry.prediction.yieldHigh, Number(entry.prediction.yieldLow)) || !finite(entry.prediction.usefulEffect) || !finite(entry.prediction.uncertainty, 0) || (entry.prediction.temperatureLow !== null && !finite(entry.prediction.temperatureLow)) || (entry.prediction.temperatureHigh !== null && !finite(entry.prediction.temperatureHigh)) || !Array.isArray(entry.prediction.evidenceIds) || !text(entry.decisionAffected) || !["planned", "performed", "failed", "inconclusive"].includes(String(entry.status)) || (entry.result !== null && !text(entry.result)) || (entry.readingId !== null && !text(entry.readingId, 200)) || (entry.endedAt !== null && !integer(entry.endedAt, Number(entry.createdAt), state.tick)))) return false;
  if (!Array.isArray(value.procedures) || value.procedures.length > 12 || value.procedures.some((entry) => !record(entry) || !text(entry.id, 200) || !text(entry.operation, 60) || !integer(entry.learnedAt, 0, state.tick) || !record(entry.parameters) || Object.values(entry.parameters).some((parameter) => typeof parameter !== "number" && typeof parameter !== "string") || !integer(entry.successes) || !integer(entry.failures) || !finite(entry.expectedEffect) || !finite(entry.uncertainty, 0) || !Array.isArray(entry.evidenceIds) || entry.evidenceIds.length > 12)) return false;
  if (value.goal !== null) {
    const goal = value.goal;
    if (!record(goal) || !text(goal.id, 200) || !integer(goal.createdAt, 0, state.tick) || !integer(goal.updatedAt, Number(goal.createdAt), state.tick) || goal.objective !== "survive" || goal.condition !== "reduce_recurring_work_cost" || !text(goal.reason) || !Array.isArray(goal.evidenceIds) || goal.evidenceIds.length > 16 || !finite(goal.predictedBenefit, 0) || !finite(goal.urgency, 0, 1) || !record(goal.budget) || !finite(goal.budget.ticks, 0, 96) || !finite(goal.budget.effort, 0, 40) || !finite(goal.budget.material, 0, 24) || !["active", "deferred", "satisfied", "abandoned"].includes(String(goal.status)) || !text(goal.criterion) || !text(goal.abandonWhen)) return false;
    if ((value.experiments as Array<Record<string, unknown>>).some((entry) => entry.goalId !== goal.id)) return false;
  } else if ((value.experiments as unknown[]).length) return false;
  return (value.evidence as Array<Record<string, unknown>>).every((entry) => record(entry.reading) && entry.reading.agentId === agentId);
}

export function validateMaterialState(state: SurvivalRunState): boolean {
  const enabled = state.config.knowledgeFoundation === "materials-v1";
  if (!enabled) {
    if (state.materials !== undefined || state.agents.some((agent) => agent.materialMind !== undefined)) return false;
    return state.agents.every((agent) => (agent.currentPlan?.steps ?? []).every((step) => step.materialOperation === undefined && step.action !== "process_material" && step.action !== "test_material"));
  }
  const world = state.materials;
  if (state.schemaVersion !== 7 || state.policyVersion !== 4 || state.config.materialFoundation !== "geology-v1" || !record(world) || world.version !== 1 || !integer(world.nextId, 1) || !integer(world.operations) || !integer(world.failedOperations, 0, Number(world.operations)) || !integer(world.tests, 0, Number(world.operations)) || !record(world.consumed) || !record(world.consumedFeedstocks)) return false;
  if (![world.consumed.wood, world.consumed.stone, world.consumed.clay].every((entry) => finite(entry, 0)) || Object.entries(world.consumedFeedstocks).some(([kind, amount]) => !feedstockKinds.includes(kind as never) || !finite(amount, 0))) return false;
  if (!Array.isArray(world.batches) || world.batches.length > MATERIAL_PROCESS_LIMITS.batches || !Array.isArray(world.records) || world.records.length > MATERIAL_PROCESS_LIMITS.records) return false;
  const lives = new Set(state.agents.map((agent) => agent.id)), ids = new Set<string>();
  for (const batch of world.batches) {
    if (!record(batch) || !batchId(batch.id) || ids.has(batch.id) || !(batch.ownerId === null || lives.has(String(batch.ownerId))) || !integer(batch.createdAt, 0, state.tick) || !position(batch.position, state) || typeof batch.portable !== "boolean") return false;
    ids.add(batch.id);
    if (!["charcoal", "exhaust", "concentrate", "roasted_ore", "gangue", "hearth", "bloom", "slag", "tool", "ceramic", "scale", "scrap"].includes(String(batch.kind)) || !["carbon", "iron", "copper", "mineral", "ceramic", "mixed"].includes(String(batch.family))) return false;
    if (!finite(batch.mass, 0.000001, MATERIAL_PROCESS_LIMITS.operationMass * 3) || !finite(batch.temperatureC, -100, 2_000) || !finite(batch.condition, 0, 1) || !finite(batch.quality, 0, 1) || !(batch.durability === null || finite(batch.durability, 0, 100)) || !integer(batch.uses) || !provenance(batch.provenance) || Math.abs(provenanceMass(batch.provenance) - Number(batch.mass)) > 0.002) return false;
    if (!record(batch.chemistry) || ![batch.chemistry.carbon, batch.chemistry.metal, batch.chemistry.gangue].every((entry) => finite(entry, 0, 1)) || !(batch.feedstock === null || feedstockKinds.includes(batch.feedstock as never)) || !(batch.form === null || batch.form === "cutting_edge" || batch.form === "hammer_head")) return false;
    if (batch.kind === "tool" && (batch.durability === null || batch.form === null)) return false;
  }
  const total = { wood: 0, stone: 0, clay: 0 };
  const feedstocks: Record<string, number> = {};
  for (const batch of world.batches) {
    for (const kind of ["wood", "stone", "clay"] as const) total[kind] += Number(batch.provenance[kind] ?? 0);
    for (const kind of feedstockKinds) feedstocks[kind] = (feedstocks[kind] ?? 0) + Number(batch.provenance.feedstocks?.[kind] ?? 0);
  }
  if ((["wood", "stone", "clay"] as const).some((kind) => Math.abs(total[kind] - Number(world.consumed[kind])) > 0.002)) return false;
  if (feedstockKinds.some((kind) => Math.abs((feedstocks[kind] ?? 0) - Number(world.consumedFeedstocks[kind] ?? 0)) > 0.002)) return false;
  for (const process of world.records) {
    if (!record(process) || !text(process.id, 200) || !integer(process.tick, 0, state.tick) || !lives.has(String(process.agentId)) || !validMaterialOperation(process.operation) || typeof process.accepted !== "boolean" || typeof process.supported !== "boolean" || !text(process.summary) || !integer(process.duration, 1, MATERIAL_PROCESS_LIMITS.operationDuration) || !finite(process.effort, 0) || !(process.temperatureC === null || finite(process.temperatureC, -100, 2_000)) || !finite(process.solidYield, 0) || !finite(process.wasteMass, 0) || !Array.isArray(process.inputIds) || !Array.isArray(process.outputIds) || !(process.reading === null || reading(process.reading, state))) return false;
  }
  for (const agent of state.agents) {
    if (!validateMind(agent.materialMind, state, agent.id)) return false;
    for (const step of agent.currentPlan?.steps ?? []) if (step.materialOperation !== undefined && (!validMaterialOperation(step.materialOperation) || !["process_material", "test_material"].includes(step.action))) return false;
  }
  return true;
}

export function validateAffectState(state: SurvivalRunState): boolean {
  const enabled = state.config.affectModel === "adaptive-v1";
  if (!enabled) return state.agents.every((agent) => agent.affect === undefined);
  return state.schemaVersion === 7 && state.policyVersion === 4 && state.agents.every((agent) => validateAgentAffect(agent.affect, state.tick, agent.spawnedAt));
}
