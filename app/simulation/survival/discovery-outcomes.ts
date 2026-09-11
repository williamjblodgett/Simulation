import { DISCOVERY_LIMITS, type DiscoveryEvidence, type DiscoveryProcedure } from "./discovery-types";
import { acceptDiscoveryEvidence, predictDiscovery } from "./discovery-model";
import { discoverySignature, observationFeatures } from "./discovery-policy";
import type { PrivatePolicyInput } from "./planner";
import type { Manipulation, PhysicalReading } from "./physical-types";
import type { SurvivalAgent } from "./types";

/** Record predictions BEFORE the actual physical test. This sees only perception. */
export function beginDiscoveryOperation(input: PrivatePolicyInput, op: Manipulation): void {
  const mind = input.agent.discovery; if (!mind?.active) return;
  for (const e of mind.experiments.filter(e => e.projectId === mind.active!.projectId && (e.status === "planned" || e.status === "interrupted"))) e.status = "running";
  if (op.kind !== "test") return;
  const metric = op.measure === "load" ? "support" : "protection";
  const experiment = mind.experiments.find(e => e.projectId === mind.active!.projectId && e.metric === metric && e.status === "running");
  const part = input.agent.observations.find(o => o.subjectId === op.partId && o.facts.structureKind === "physical_part");
  if (experiment && part) experiment.prediction = predictDiscovery(mind, metric, observationFeatures(input, part, input.agent.position, op.dose));
}
function substitute(op: Manipulation, bindings: Record<string, string>): Manipulation {
  const next = structuredClone(op);
  if ("partId" in next) next.partId = bindings[next.partId] ?? next.partId;
  if (next.kind === "join" || next.kind === "mix") { next.a = bindings[next.a] ?? next.a; next.b = bindings[next.b] ?? next.b; }
  return next;
}

export function receiveDiscoveryTestimony(agent: SurvivalAgent, source: DiscoveryEvidence, receivedAt: number): boolean {
  if (!agent.discovery || source.originalObserverId === agent.id) return false;
  return acceptDiscoveryEvidence(agent.discovery, { ...structuredClone(source), id: `report-${agent.id}-${source.originalId}`, source: "testimony", receivedAt,
    // Original identity/provenance persists through every report; no new trial.
    confounds: [...new Set([...source.confounds, "Reported measurement, not a personal replication."])] });
}

export function finishDiscoveryOperation(agent: SurvivalAgent, op: Manipulation, result: { ok: boolean; partId: string | null; effort: number; summary: string; reading?: PhysicalReading }, tick: number): DiscoveryEvidence | null {
  const mind = agent.discovery, active = mind?.active; if (!mind || !active) return null;
  const project = agent.physicalMind?.projects.find(p => p.id === active.projectId); if (!project) return null;
  active.spentEffort += result.effort; project.spentEffort += result.effort; project.updatedAt = tick;
  for (const e of mind.experiments.filter(e => e.projectId === project.id && (e.status === "running" || e.status === "planned"))) e.spentEffort += result.effort;
  const close = (status: "satisfied" | "abandoned", summary: string) => {
    project.status = status; project.reason = summary; if(status==="abandoned")project.blocker=summary;else delete project.blocker; project.lastReviewAt = tick;
    for (const goal of mind.goals.filter(g => g.id === active.goalId || g.parentId === active.goalId)) {
      if (goal.status !== "satisfied") { goal.status = status; goal.reason = summary; goal.updatedAt = tick; }
    }
    for (const e of mind.experiments.filter(e => e.projectId === project.id && ["running", "planned", "interrupted"].includes(e.status))) {
      e.status = status === "abandoned" ? "failed" : "inconclusive"; e.result = summary; e.endedAt = tick;
    }
    mind.active = null; mind.lastReviewAt = tick;
  };
  if (!result.ok) {
    mind.metrics.failedOperations++;
    mind.failures = [...mind.failures, { signature: discoverySignature(active.alternative.operations), tick, evidence: result.summary }].slice(-24);
    if (active.sourceProcedureId) { const source = mind.procedures.find(p => p.id === active.sourceProcedureId); if (source) source.failures++; }
    close("abandoned", `Actual operation failed: ${result.summary} Completed work remains.`); return null;
  }
  if (op.kind === "shape" && result.partId) {
    const symbol = `$${active.completed.filter(o => o.kind === "shape").length}`;
    active.bindings[symbol] = result.partId; project.partIds.push(result.partId);
    project.operations = project.operations.map(o => substitute(o, active.bindings));
  }
  active.completed.push(structuredClone(op)); project.cursor++;
  const reading = result.reading;
  if (!reading || op.kind !== "test") {
    if (project.cursor === project.operations.length) close("abandoned", "Primitive operations completed without an optional test; performance remains unconfirmed.");
    return null;
  }
  const metric = op.measure === "load" ? "support" : "protection";
  const experiment = mind.experiments.find(e => e.projectId === project.id && e.metric === metric && e.status === "running");
  if (!experiment || reading.measurementKind !== "local") { close("abandoned", "No local measurement with a pre-action prediction is available; no learning claim made."); return null; }
  const confounds: string[] = [];
  if (reading.weather !== experiment.prediction.features.weather || Math.abs(reading.temperature - experiment.prediction.features.temperature) > 2) confounds.push("Conditions changed between prediction and measurement.");
  if (metric === "protection") confounds.push("Absolute local protection includes all nearby arrangements; it does not isolate one part's causal effect.");
  const value = metric === "support" ? Number(reading.after >= reading.before - .001) : reading.after;
  const evidence: DiscoveryEvidence = { id: reading.id, originalId: reading.originalEvidenceId ?? reading.id, originalObserverId: agent.id, tick, receivedAt: tick,
    source: "personal", metric, features: structuredClone(experiment.prediction.features), value, before: reading.before, dose: reading.dose,
    partId: reading.partId, experimentId: experiment.id, interpretation: metric === "support" ? value ? `Survived ${reading.dose.toFixed(2)} load units; a lower bound at these conditions, not exact breaking strength.` : `Observed damage under ${reading.dose.toFixed(2)} load units; do not rely on this support for that load.` : "A supplied local exposure measurement after executed movement/arrangement; no simulator counterfactual was consulted.", confounds };
  acceptDiscoveryEvidence(mind, evidence);
  mind.metrics.measurements++; mind.metrics.squaredError += (value - experiment.prediction.mean) ** 2;
  mind.metrics.testEffort += result.effort;
  const revised = predictDiscovery(mind, metric, experiment.prediction.features);
  experiment.status = confounds.some(c => c.startsWith("Conditions changed")) ? "inconclusive" : "measured";
  experiment.evidenceId = evidence.id; experiment.endedAt = tick;
  experiment.result = `${evidence.interpretation} Prediction ${experiment.prediction.mean.toFixed(2)} → reading ${value.toFixed(2)} → next estimate ${revised.mean.toFixed(2)}.`;
  // Retain local readings for the ordinary survival planner's remembered sites.
  agent.physicalMind!.readings = [...agent.physicalMind!.readings, structuredClone(reading)].slice(-64);
  if (metric === "support") {
    const goal = mind.goals.find(g => g.id === experiment.goalId); if (goal) { goal.status = value ? "satisfied" : "abandoned"; goal.reason = evidence.interpretation; goal.updatedAt = tick; }
    if (!value) { mind.metrics.adaptations++; mind.failures = [...mind.failures, { signature: discoverySignature(active.alternative.operations), tick, evidence: evidence.id }].slice(-24); close("abandoned", "The support test contradicted the plan; do not place the proposed load. Compare other geometries or ordinary survival next."); }
    return evidence;
  }
  if (value >= project.target && experiment.status === "measured") {
    if (mind.mode !== "fixed") learnProcedure(agent, tick, evidence, active.completed, active.bindings);
    close("satisfied", `Measured local protection ${value.toFixed(2)} meets ${project.target.toFixed(2)}. Use remains optional and context-dependent.`);
  } else {
    mind.metrics.adaptations++; mind.failures = [...mind.failures, { signature: discoverySignature(active.alternative.operations), tick, evidence: evidence.id }].slice(-24);
    if (active.sourceProcedureId) { const source = mind.procedures.find(p => p.id === active.sourceProcedureId); if (source) source.failures++; }
    close("abandoned", "The measurement did not justify this target; compare different placements, materials, reuse or ordinary survival. No specific repair is inferred.");
  }
  return evidence;
}

function learnProcedure(agent: SurvivalAgent, tick: number, evidence: DiscoveryEvidence, completed: Manipulation[], bindings: Record<string, string>) {
  const mind = agent.discovery!, active = mind.active!;
  // Measuring an existing site alone is evidence, not a newly learned construction procedure.
  if (!completed.some(o => o.kind === "shape" || o.kind === "place") || completed.length > DISCOVERY_LIMITS.operations) return;
  const inverse = Object.fromEntries(Object.entries(bindings).map(([symbol, actual]) => [actual, symbol]));
  const inputs: DiscoveryProcedure["inputs"] = [];
  for (const op of completed) {
    const ids = "partId" in op ? [op.partId] : op.kind === "join" || op.kind === "mix" ? [op.a, op.b] : [];
    for (const actual of ids) if (!inverse[actual]) {
      const observed = agent.observations.find(o => o.subjectId === actual && o.facts.structureKind === "physical_part"); if (!observed) return;
      const symbol = `$input${inputs.length}`; inverse[actual] = symbol;
      inputs.push({ symbol, material: observed.facts.material as DiscoveryProcedure["inputs"][number]["material"], size: { x: Number(observed.facts.width), y: Number(observed.facts.height), z: Number(observed.facts.depth) }, minimumCondition: .5 });
    }
  }
  const program = completed.map(o => { const next = substitute(o, inverse); if (next.kind === "place") { next.position.x -= active.alternative.position.x; next.position.z -= active.alternative.position.z; } return next; });
  const existing = active.sourceProcedureId ? mind.procedures.find(p => p.id === active.sourceProcedureId) : mind.procedures.find(p => JSON.stringify(p.program) === JSON.stringify(program));
  if (existing) { existing.successes++; existing.effect += (evidence.value - existing.effect) / existing.successes; existing.evidenceIds = [...existing.evidenceIds, evidence.id].slice(-12); existing.uncertainty = Math.max(.08, .7 / Math.sqrt(existing.successes + 1)); existing.weather = [...new Set([...existing.weather, evidence.features.weather])].slice(-6); existing.minTemperature = Math.min(existing.minTemperature, evidence.features.temperature); existing.maxTemperature = Math.max(existing.maxTemperature, evidence.features.temperature); return; }
  const resources: DiscoveryProcedure["resources"] = {};
  for (const op of program) if (op.kind === "shape") resources[op.material] = (resources[op.material] ?? 0) + op.mass;
  mind.procedures.push({ id: `discovery-procedure-${agent.id}-${mind.nextId++}`, createdAt: tick, origin: { ...active.alternative.position }, program, inputs, resources,
    ticks: tick - active.startedAt + 1, effort: active.spentEffort, effect: evidence.value, uncertainty: .5, successes: 1, failures: 0,
    evidenceIds: [evidence.id], weather: [evidence.features.weather], minTemperature: evidence.features.temperature, maxTemperature: evidence.features.temperature });
  mind.procedures = mind.procedures.slice(-DISCOVERY_LIMITS.procedures);
}
