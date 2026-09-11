import type { SurvivalRunState } from "./types";
import { DISCOVERY_LIMITS } from "./discovery-types";
import { validManipulation } from "./physical-validation";

const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown, low = -Infinity, high = Infinity): v is number => typeof v === "number" && Number.isFinite(v) && v >= low && v <= high;
const integer = (v: unknown, low = 0, high = Infinity) => num(v, low, high) && Number.isInteger(v);
const text = (v: unknown, max = 1600): v is string => typeof v === "string" && v.length <= max;
const strings = (v: unknown, max = 24): v is string[] => Array.isArray(v) && v.length <= max && v.every(x => text(x, 200));
const list = (v: unknown, max: number): v is unknown[] => Array.isArray(v) && v.length <= max;
const position = (v: unknown) => obj(v) && num(v.x) && num(v.z);
const size = (v: unknown) => obj(v) && [v.x, v.y, v.z].every(n => num(n, .06, 4));
const metric = (v: unknown) => v === "protection" || v === "support";
function features(v: unknown) {
  return obj(v) && ["wood", "stone", "fiber", "clay"].includes(String(v.material)) && [v.width, v.height, v.depth].every(n => num(n, .06, 4))
    && num(v.mass, 0, 24) && num(v.condition, 0, 1) && typeof v.supported === "boolean" && [v.rotation, v.elevation, v.distance, v.lateral, v.longitudinal, v.temperature, v.treatment].every(n => num(n)) && text(v.weather, 40) && num(v.dose, 0, 5);
}
function prediction(v: unknown) {
  return obj(v) && metric(v.metric) && features(v.features) && [v.mean, v.low, v.high, v.uncertainty, v.measurementLimit, v.residualError].every(n => num(n, 0, 1))
    && Number(v.low) <= Number(v.mean) && Number(v.high) >= Number(v.mean) && integer(v.samples) && strings(v.evidenceIds, 12);
}
function program(v: unknown) { return list(v, DISCOVERY_LIMITS.operations) && v.every(o => validManipulation(o, true)); }
function alternative(v: unknown) {
  return obj(v) && text(v.id, 160) && ["survival", "stay", "reuse", "arrange", "test", "procedure"].includes(String(v.kind)) && text(v.label) && num(v.score)
    && num(v.cost, 0) && num(v.ticks, 0) && num(v.informationValue, 0) && num(v.predictedProtection, 0, 1) && num(v.uncertainty, 0, 1)
    && strings(v.evidenceIds, 64) && (v.rejection === null || text(v.rejection)) && program(v.operations) && position(v.position)
    && (v.prediction === undefined || prediction(v.prediction)) && (v.supportPrediction === undefined || prediction(v.supportPrediction)) && (v.procedureId === undefined || text(v.procedureId, 200));
}
export function validateDiscoveryState(state: SurvivalRunState): boolean {
  if (state.policyVersion !== 4) return state.agents.every(a => a.discovery === undefined);
  if (state.schemaVersion !== 5 || state.survivalRevision !== 1) return false;
  for (const agent of state.agents) {
    if (agent.physicalMind?.readings.some(r => r.measurementKind !== "local")) return false;
    if (agent.currentPlan?.discoveryProjectId !== undefined && !agent.physicalMind?.projects.some(p => p.id === agent.currentPlan!.discoveryProjectId)) return false;
    const mind: unknown = agent.discovery;
    if (!obj(mind) || mind.version !== 1 || !["directed", "frozen", "random", "none", "fixed"].includes(String(mind.mode)) || !integer(mind.nextId, 1)
      || !integer(mind.lastReviewAt, -12, state.tick) || !integer(mind.evidenceFloor, 0, state.tick + 1)) return false;
    if (!list(mind.goals, DISCOVERY_LIMITS.goals) || !list(mind.models, DISCOVERY_LIMITS.models) || !list(mind.evidence, DISCOVERY_LIMITS.evidence)
      || !list(mind.experiments, DISCOVERY_LIMITS.experiments) || !list(mind.procedures, DISCOVERY_LIMITS.procedures) || !list(mind.decisions, DISCOVERY_LIMITS.decisions) || !list(mind.failures, 24)) return false;
    const goalIds = new Set<string>();
    for (const g of mind.goals) {
      if (!obj(g) || !text(g.id, 200) || goalIds.has(g.id) || (g.parentId !== null && (!text(g.parentId, 200) || !goalIds.has(g.parentId)))
        || g.objective !== "survive" || !metric(g.metric) || !strings(g.evidenceIds, 12) || !integer(g.createdAt, 0, state.tick) || !integer(g.updatedAt, Number(g.createdAt), state.tick)
        || !obj(g.originatingConditions) || !text(g.originatingConditions.weather, 40) || !num(g.originatingConditions.temperatureC) || !num(g.originatingConditions.daylight, 0, 1) || ![g.originatingConditions.warmth, g.originatingConditions.safety, g.originatingConditions.forecastWarmth, g.originatingConditions.forecastSafety].every(n => num(n, 0, 100))
        || !num(g.target, 0, 5) || !num(g.predictedBenefit, 0) || !num(g.urgency, 0, 1) || !obj(g.budget) || !num(g.budget.ticks, 0, 72) || !num(g.budget.effort, 0, 10) || !num(g.budget.material, 0, 8)
        || !["active", "deferred", "satisfied", "abandoned"].includes(String(g.status)) || !text(g.reason) || !text(g.criterion) || !text(g.abandonWhen)) return false;
      goalIds.add(g.id);
      let parent: unknown = g.parentId, depth = 1;
      while (parent) { if (++depth > DISCOVERY_LIMITS.depth) return false; const ancestor = mind.goals.find(x => obj(x) && x.id === parent); parent = obj(ancestor) ? ancestor.parentId : null; }
    }
    for (const c of mind.models) if (!obj(c) || !metric(c.metric) || !features(c.features) || !num(c.mean, 0, 1) || !num(c.m2, 0) || !integer(c.samples, 1) || !strings(c.evidenceIds, 12) || !integer(c.lastTick, 0, state.tick)) return false;
    const evidenceIds = new Set<string>();
    for (const e of mind.evidence) {
      if (!obj(e) || !text(e.id, 200) || !text(e.originalId, 200) || evidenceIds.has(e.originalId) || !text(e.originalObserverId, 200) || !integer(e.tick, 0, state.tick) || !integer(e.receivedAt, Number(e.tick), state.tick)
        || !["personal", "testimony"].includes(String(e.source)) || !metric(e.metric) || !features(e.features) || !num(e.value, 0, 1) || !num(e.before, 0, 1) || !num(e.dose, 0, 5)
        || !text(e.partId, 200) || (e.experimentId !== null && !text(e.experimentId, 200)) || !text(e.interpretation) || !strings(e.confounds, 6) || (e.source === "personal" && e.originalObserverId !== agent.id)) return false;
      evidenceIds.add(e.originalId);
    }
    for (const e of mind.experiments) if (!obj(e) || !text(e.id, 200) || !text(e.goalId, 200) || !text(e.projectId, 200) || !integer(e.createdAt, 0, state.tick) || !metric(e.metric) || !text(e.claim) || !prediction(e.prediction)
      || !obj(e.competingOutcomes) || !text(e.competingOutcomes.low) || !text(e.competingOutcomes.high) || !text(e.decisionAffected) || !text(e.intervention) || !text(e.stoppingRule)
      || !integer(e.maxTicks, 1, 72) || !num(e.maxEffort, 0, 10) || !num(e.spentEffort, 0) || !["planned", "running", "interrupted", "measured", "failed", "inconclusive"].includes(String(e.status))
      || (e.evidenceId !== null && !text(e.evidenceId, 200)) || (e.result !== null && !text(e.result)) || (e.endedAt !== null && !integer(e.endedAt, Number(e.createdAt), state.tick))) return false;
    for (const p of mind.procedures) {
      if (!obj(p) || !text(p.id, 200) || !integer(p.createdAt, 0, state.tick) || !position(p.origin) || !program(p.program) || !list(p.inputs, 8) || !obj(p.resources)
        || Object.entries(p.resources).some(([k, v]) => !["wood", "stone", "fiber", "clay"].includes(k) || !num(v, 0, 24)) || !integer(p.ticks, 1) || !num(p.effort, 0)
        || !num(p.effect, 0, 1) || !num(p.uncertainty, 0, 1) || !integer(p.successes, 1) || !integer(p.failures) || !strings(p.evidenceIds, 12) || !strings(p.weather, 6) || !num(p.minTemperature) || !num(p.maxTemperature)) return false;
      for (const s of p.inputs) if (!obj(s) || !text(s.symbol, 30) || !/^\$input\d$/.test(s.symbol) || !["wood", "stone", "fiber", "clay"].includes(String(s.material)) || !size(s.size) || !num(s.minimumCondition, 0, 1)) return false;
      // Procedures must not retain old world IDs as runnable operands.
      for (const o of p.program as import("./physical-types").Manipulation[]) if (("partId" in o && !o.partId.startsWith("$")) || ((o.kind === "join" || o.kind === "mix") && (!o.a.startsWith("$") || !o.b.startsWith("$")))) return false;
    }
    for (const d of mind.decisions) if (!obj(d) || !text(d.id, 200) || !integer(d.tick, 0, state.tick) || (d.goalId !== null && !text(d.goalId, 200)) || !text(d.selectedId, 200)
      || !list(d.alternatives, 8) || !d.alternatives.length || !d.alternatives.every(alternative) || !(d.alternatives as { id: string }[]).some(a => a.id === d.selectedId)
      || !integer(d.omitted, 0, 32) || !integer(d.expansions, 0, DISCOVERY_LIMITS.expansions) || !text(d.reason)) return false;
    if (mind.active !== null) {
      const a = mind.active;
      if (!obj(a) || !text(a.projectId, 200) || !text(a.goalId, 200) || !goalIds.has(a.goalId) || !alternative(a.alternative) || !program(a.completed) || !obj(a.bindings)
        || Object.entries(a.bindings).some(([key, value]) => !/^\$\d$/.test(key) || !text(value, 200) || !/^part-\d+$/.test(value)) || !integer(a.startedAt, 0, state.tick) || !num(a.spentEffort, 0) || !integer(a.spentTicks, 0, 36)
        || !agent.physicalMind?.projects.some(p => p.id === a.projectId)) return false;
    }
    if (mind.failures.some(f => !obj(f) || !text(f.signature, 8000) || !integer(f.tick, 0, state.tick) || !text(f.evidence))) return false;
    if (!obj(mind.metrics) || !["expansions", "predictions", "squaredError", "measurements", "testEffort", "adaptations", "transfers", "failedOperations", "duplicateReports"].every(key => num((mind.metrics as Record<string, unknown>)[key], 0))) return false;
  }
  return true;
}
