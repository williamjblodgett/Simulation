import { affectDecisionAdjustment } from "./affect";
import { MATERIAL_MECHANISM_PRIORS } from "./material-catalog";
import type { MaterialExperiment, MaterialMind, MaterialOperation, MaterialProcessResult, MaterialProcedure, MaterialWorld, PrivateMaterialBatch, ToolForm } from "./material-types";
import { findPrivateRoute } from "./private-navigation";
import type { LocalPlanChoice, PlannedAction, PrivatePolicyInput } from "./planner";
import type { AgentObservation, SurvivalAgent, SurvivalPosition, SurvivalResourceKind } from "./types";

const round = (value: number) => Math.round(value * 1_000) / 1_000;
const distance = (left: SurvivalPosition, right: SurvivalPosition) => Math.hypot(left.x - right.x, left.z - right.z);
const id = (mind: MaterialMind, agentId: string, kind: string) => `material-${kind}-${agentId}-${mind.nextId++}`;

export function freshMaterialMind(): MaterialMind {
  return { version: 1, priorIds: MATERIAL_MECHANISM_PRIORS.map((prior) => prior.id), beliefs: [], evidence: [], experiments: [], procedures: [], goal: null, lastReviewAt: -12, nextId: 1 };
}

function temperatureBand(temperatureC: number): PrivateMaterialBatch["temperatureBand"] {
  if (temperatureC >= 1_000) return "white_hot";
  if (temperatureC >= 350) return "hot";
  if (temperatureC >= 55) return "warm";
  return "ambient";
}

/** Explicit allowlist: exact chemistry, grade, provenance and world rules stay out. */
export function attachPrivateMaterialView(input: PrivatePolicyInput, source: SurvivalAgent, world: MaterialWorld): PrivatePolicyInput {
  input.agent.materialMind = source.materialMind ? structuredClone(source.materialMind) : undefined;
  input.materialBatches = world.batches
    .filter((batch) => batch.ownerId === source.id && (batch.portable || distance(batch.position, source.position) <= 4))
    .filter((batch) => !["exhaust", "gangue", "slag", "scale"].includes(batch.kind))
    .map((batch) => ({
      id: batch.id,
      kind: batch.kind,
      family: batch.kind === "charcoal" ? "carbon" : batch.kind === "hearth" || batch.kind === "ceramic" ? "ceramic" : batch.kind === "concentrate" || batch.kind === "roasted_ore" ? "mineral" : "mixed",
      massEstimate: Math.round(batch.mass * 10) / 10,
      temperatureBand: temperatureBand(batch.temperatureC),
      conditionEstimate: Math.round(batch.condition * 10) / 10,
      durabilityEstimate: batch.durability === null ? null : Math.round(batch.durability / 5) * 5,
      portable: batch.portable,
      position: { ...batch.position },
      form: batch.form,
    }));
  return input;
}

export function updateMaterialGoalStatus(agent: SurvivalAgent, tick: number): void {
  const mind = agent.materialMind, goal = mind?.goal;
  if (!mind || !goal || goal.status === "satisfied" || goal.status === "abandoned") return;
  const lowest = Math.min(agent.needs.health, agent.needs.hydration, agent.needs.nutrition, agent.needs.energy, agent.needs.warmth, agent.needs.safety);
  goal.updatedAt = tick;
  goal.status = lowest < 55 ? "deferred" : "active";
  for (const experiment of mind.experiments) if (experiment.status === "planned" && tick - experiment.createdAt > 36) {
    experiment.status = "inconclusive";
    experiment.result = "The proposed intervention was not completed before conditions changed.";
    experiment.endedAt = tick;
  }
  mind.lastReviewAt = tick;
}

function belief(mind: MaterialMind, key: string, prior: number, uncertainty: number): { mean: number; uncertainty: number; evidenceIds: string[] } {
  const found = mind.beliefs.find((entry) => entry.key === key);
  return found ? { mean: found.mean, uncertainty: found.uncertainty, evidenceIds: found.evidenceIds } : { mean: prior, uncertainty, evidenceIds: [] };
}

function sourceForBatch(mind: MaterialMind, batchId: string, visited = new Set<string>()): string | null {
  if (visited.has(batchId)) return null;
  visited.add(batchId);
  for (const evidence of [...mind.evidence].reverse()) {
    if (!evidence.reading.outputIds.includes(batchId)) continue;
    const experiment = mind.experiments.find((candidate) => candidate.id === evidence.predictionId);
    if (experiment?.operation.kind === "concentrate_ore") return experiment.operation.sourceId;
    for (const inputId of evidence.reading.inputIds) {
      const source = sourceForBatch(mind, inputId, visited);
      if (source) return source;
    }
  }
  return null;
}

function sourceForOperation(mind: MaterialMind, operation: MaterialOperation): string | null {
  if (operation.kind === "concentrate_ore") return operation.sourceId;
  if (operation.kind === "reduce_ore") return sourceForBatch(mind, operation.concentrateId);
  if (operation.kind === "work_metal") return sourceForBatch(mind, operation.bloomId);
  if (operation.kind === "test_tool") return sourceForBatch(mind, operation.toolId);
  return null;
}

function sourceFailures(mind: MaterialMind, sourceId: string): number {
  return mind.experiments.filter((experiment) => experiment.status === "failed" && sourceForOperation(mind, experiment.operation) === sourceId).length;
}

function operationKey(mind: MaterialMind, operation: MaterialOperation): string {
  if (operation.kind === "reduce_ore") return `reduce:${sourceForOperation(mind, operation) ?? "unknown"}:${Math.round(operation.airflow * 4) / 4}:${Math.round(operation.duration / 3) * 3}`;
  if (operation.kind === "prepare_charcoal") return `charcoal:${Math.round(operation.cover * 4) / 4}`;
  if (operation.kind === "concentrate_ore") return `concentrate:${operation.sourceId}:${Math.round(operation.separation * 4) / 4}`;
  if (operation.kind === "work_metal") return `work:${operation.form}:${Math.round(operation.work * 4) / 4}`;
  if (operation.kind === "test_tool") return `tool:${operation.medium}`;
  return operation.kind;
}

function predictionFor(mind: MaterialMind, operation: MaterialOperation): MaterialExperiment["prediction"] {
  const key = operationKey(mind, operation);
  const defaults: Record<MaterialOperation["kind"], [number, number]> = {
    prepare_charcoal: [0.26, 0.24], concentrate_ore: [0.52, 0.3], form_hearth: [0.58, 0.3], fire_clay: [0.55, 0.32], reduce_ore: [0.22, 0.42], work_metal: [0.5, 0.36], test_tool: [1.08, 0.24],
  };
  const estimate = belief(mind, key, defaults[operation.kind][0], defaults[operation.kind][1]);
  const isTemperature = operation.kind === "form_hearth" || operation.kind === "fire_clay" || operation.kind === "reduce_ore" || operation.kind === "work_metal";
  const expectedTemperature = operation.kind === "reduce_ore" ? 900 : operation.kind === "work_metal" ? 760 : operation.kind === "fire_clay" ? 680 : operation.kind === "form_hearth" ? 650 : null;
  return {
    temperatureLow: expectedTemperature === null ? null : Math.max(20, expectedTemperature - 260 * estimate.uncertainty),
    temperatureHigh: expectedTemperature === null ? null : expectedTemperature + 260 * estimate.uncertainty,
    yieldLow: round(Math.max(0, estimate.mean - estimate.uncertainty * (isTemperature ? 0.35 : 0.5))),
    yieldHigh: round(Math.max(0, estimate.mean + estimate.uncertainty * (isTemperature ? 0.35 : 0.5))),
    usefulEffect: round(estimate.mean), uncertainty: round(estimate.uncertainty), evidenceIds: [...estimate.evidenceIds],
  };
}

function nearestObservation(input: PrivatePolicyInput, kind: SurvivalResourceKind, predicate?: (observation: AgentObservation) => boolean): AgentObservation | null {
  return input.agent.observations.filter((observation) => observation.kind === "resource" && observation.position && observation.facts.resourceKind === kind && Number(observation.facts.availableEstimate) > 0 && (!predicate || predicate(observation)))
    .sort((left, right) => distance(input.agent.position, left.position!) - distance(input.agent.position, right.position!) || left.id.localeCompare(right.id))[0] ?? null;
}

function acquisition(input: PrivatePolicyInput, kind: SurvivalResourceKind, minimum: number, preferred?: AgentObservation): { action: PlannedAction; evidence: string[]; summary: string } | null {
  const observation = preferred ?? nearestObservation(input, kind);
  if (!observation?.position) return null;
  if (distance(input.agent.position, observation.position) > 4.2) {
    const route = findPrivateRoute(input.agent.observations, input.bounds, input.agent.position, observation.position, input.agent.navigation?.blocked, 160);
    const destination = route?.at(-1);
    if (!destination || distance(destination, observation.position) > 4.5) return null;
    return { action: { action: "move", targetId: observation.subjectId, destination, duration: Math.max(1, Math.ceil(distance(input.agent.position, destination) / 7.5)) }, evidence: [observation.id], summary: `Approach an observed ${kind} source needed for a possible work-saving experiment.` };
  }
  return { action: { action: "gather", targetId: observation.subjectId, destination: { ...observation.position }, duration: 1 }, evidence: [observation.id], summary: `Gather observed ${kind}; ${minimum.toFixed(1)} carried units are needed before the next physical test can be proposed.` };
}

function parameters(operation: MaterialOperation): Record<string, number | string> {
  return Object.fromEntries(Object.entries(operation).filter(([key, value]) => key !== "kind" && !key.endsWith("Id") && key !== "sourceId" && (typeof value === "number" || typeof value === "string")));
}

function adaptedOperation(mind: MaterialMind, operation: MaterialOperation): MaterialOperation {
  const procedure = mind.procedures.find((entry) => entry.operation === operation.kind && entry.successes > entry.failures);
  if (!procedure) return operation;
  const copy = { ...operation } as MaterialOperation & Record<string, unknown>;
  for (const [key, value] of Object.entries(procedure.parameters)) if (key in copy && typeof copy[key] === typeof value) copy[key] = value;
  return copy;
}

function experimentClaim(operation: MaterialOperation): { claim: string; decision: string } {
  switch (operation.kind) {
    case "prepare_charcoal": return { claim: "Covered heating may retain a useful carbon-rich solid instead of consuming all wood.", decision: "Whether this fuel preparation is worth repeating for higher-temperature work." };
    case "concentrate_ore": return { claim: "This visibly mineralized rock may separate into a denser fraction worth a heat test.", decision: "Whether to spend fuel and time heating this source material." };
    case "form_hearth": return { claim: "A fired clay enclosure may retain more useful heat than an open burn.", decision: "Whether later high-temperature tests are feasible here." };
    case "fire_clay": return { claim: "This clay may become a coherent heat-altered solid in the existing enclosure.", decision: "Whether fired clay is useful for later containment or storage experiments." };
    case "reduce_ore": return { claim: "Heating this concentrate with carbon-rich fuel may produce a separable metal-rich solid.", decision: "Whether this material and operating range merit further reduction attempts." };
    case "work_metal": return { claim: "Reheating and deformation may turn this bloom into a durable working surface.", decision: "Whether the resulting object should replace baseline gathering methods." };
    case "test_tool": return { claim: "This formed surface may reduce the cost of repeated material gathering.", decision: "Whether to use, revise, or abandon this procedure." };
  }
}

/**
 * Generate one bounded next step from a survival-grounded capability goal.
 * The dependency order follows authored operation prerequisites, but parameters
 * and whether to proceed are selected from private evidence and current cost.
 */
export function planMaterialKnowledge(input: PrivatePolicyInput): LocalPlanChoice | null {
  const mind = input.agent.materialMind, batches = input.materialBatches;
  if (!mind || !batches) return null;
  const gatherEvidence = input.agent.memory.filter((memory) => memory.action === "gather").slice(-16);
  const protectionEvidence = input.agent.memory.filter((memory) => ["shelter", "warm", "build"].includes(memory.action)).slice(-16);
  const recurringPressure = Math.min(input.agent.needs.warmth, input.agent.needs.safety) < 78;
  const originatingEvidence = gatherEvidence.length >= 4 ? gatherEvidence : recurringPressure && protectionEvidence.length >= 8 ? protectionEvidence : [];
  const lowest = Math.min(input.agent.needs.health, input.agent.needs.hydration, input.agent.needs.nutrition, input.agent.needs.energy, input.agent.needs.warmth, input.agent.needs.safety);
  if (!mind.goal && (!originatingEvidence.length || lowest < 68 || input.agent.needs.energy < 74)) return null;
  if (mind.goal?.status === "satisfied" || mind.goal?.status === "abandoned" || lowest < 55) return null;
  if (!mind.goal) mind.goal = {
    id: id(mind, input.agent.id, "goal"), createdAt: input.tick, updatedAt: input.tick, objective: "survive", condition: "reduce_recurring_work_cost",
    reason: gatherEvidence.length >= 4
      ? `${gatherEvidence.length} personally recorded gathering outcomes make a reusable working surface potentially valuable.`
      : `${protectionEvidence.length} personally recorded protection actions under recurring exposure make lower-cost future material work potentially valuable.`,
    evidenceIds: originatingEvidence.map((memory) => memory.id),
    predictedBenefit: round(Math.min(20, gatherEvidence.length >= 4 ? 4 + gatherEvidence.length * 1.5 : 6 + protectionEvidence.length * 0.7)),
    urgency: round(Math.min(0.55, (gatherEvidence.length + protectionEvidence.length * 0.45) / 24)),
    budget: { ticks: 48, effort: 22, material: 12 }, status: "active", criterion: "A physically tested tool improves work above 1.10× baseline while retaining durability.",
    abandonWhen: "Immediate survival deteriorates, three relevant trials contradict the useful effect, or the complete material and effort cost exceeds expected future savings.",
  };
  mind.goal.updatedAt = input.tick;
  mind.goal.status = "active";

  const find = (kind: PrivateMaterialBatch["kind"]) => batches.filter((batch) => {
    if (batch.kind !== kind) return false;
    const source = sourceForBatch(mind, batch.id);
    return !source || sourceFailures(mind, source) < 2;
  }).sort((left, right) => left.id.localeCompare(right.id))[0];
  const tool = find("tool");
  const bloom = find("bloom");
  const concentrate = find("roasted_ore") ?? find("concentrate");
  const hearth = find("hearth");
  const charcoal = find("charcoal");
  const oreSource = input.agent.observations.filter((observation) => observation.kind === "resource" && observation.position && observation.facts.resourceKind === "stone" && Number(observation.facts.availableEstimate) > 0 && observation.facts.mineralAppearance && sourceFailures(mind, observation.subjectId) < 2)
    .sort((left, right) => {
      const clue = (observation: AgentObservation) => {
        const appearance = String(observation.facts.mineralAppearance ?? "");
        return (/rust-colored|green-streaked/i.test(appearance) ? 4 : 0) + (/metallic|bright mineral/i.test(appearance) ? 2 : 0) + (/heavy|mineral/i.test(appearance) ? 1 : 0);
      };
      return clue(right) - clue(left) || sourceFailures(mind, left.subjectId) - sourceFailures(mind, right.subjectId) || distance(input.agent.position, left.position!) - distance(input.agent.position, right.position!) || left.id.localeCompare(right.id);
    })[0] ?? null;
  let action: PlannedAction | null = null, operation: MaterialOperation | null = null, summary = "", evidence: string[] = [];

  if (tool) {
    const medium: "wood" | "stone" = tool.form === "hammer_head" ? "stone" : "wood";
    operation = { kind: "test_tool", toolId: tool.id, medium, force: 0.75, duration: 2 };
  } else if (bloom) {
    if (!charcoal) {
      if (input.agent.inventory.wood < 2) { const obtain = acquisition(input, "wood", 2); if (!obtain) return null; ({ action, evidence, summary } = obtain); }
      else operation = { kind: "prepare_charcoal", wood: 2, cover: 0.68, duration: 6 };
    } else {
      const cutting = input.agent.memory.filter((memory) => memory.action === "gather" && !/stone|clay/i.test(memory.summary)).length;
      const form: ToolForm = gatherEvidence.length > 0 && cutting >= gatherEvidence.length / 2 ? "cutting_edge" : "hammer_head";
      operation = { kind: "work_metal", bloomId: bloom.id, charcoalId: charcoal.id, hearthId: hearth?.id ?? "", form, work: 0.65, duration: 8 };
      if (!hearth) return null;
    }
  } else if (concentrate) {
    if (!hearth) {
      if (!charcoal) {
        if (input.agent.inventory.wood < 2) { const obtain = acquisition(input, "wood", 2); if (!obtain) return null; ({ action, evidence, summary } = obtain); }
        else operation = { kind: "prepare_charcoal", wood: 2, cover: 0.68, duration: 6 };
      } else if (input.agent.inventory.clay < 1.2) {
        const obtain = acquisition(input, "clay", 1.2); if (!obtain) return null; ({ action, evidence, summary } = obtain);
      } else operation = { kind: "form_hearth", clay: 1.2, charcoalId: charcoal.id, wallThickness: 0.24, duration: 8 };
    } else if (!charcoal) {
      if (input.agent.inventory.wood < 2) { const obtain = acquisition(input, "wood", 2); if (!obtain) return null; ({ action, evidence, summary } = obtain); }
      else operation = { kind: "prepare_charcoal", wood: 2, cover: 0.68, duration: 6 };
    } else {
      const failures = mind.experiments.filter((experiment) => experiment.operation.kind === "reduce_ore" && experiment.status === "failed").length;
      operation = { kind: "reduce_ore", concentrateId: concentrate.id, charcoalId: charcoal.id, hearthId: hearth.id, airflow: Math.min(0.9, 0.48 + failures * 0.14), duration: Math.min(14, 8 + failures * 2) };
    }
  } else if (input.agent.inventory.stone >= 1.5 && input.agent.materialSamples?.stone?.sourceId && oreSource?.subjectId === input.agent.materialSamples.stone.sourceId) {
    operation = { kind: "concentrate_ore", sourceId: oreSource.subjectId, mass: 1.5, separation: 0.62, duration: 5 };
    evidence = [oreSource.id];
  } else {
    if (!oreSource) return null;
    const obtain = acquisition(input, "stone", 1.5, oreSource); if (!obtain) return null; ({ action, evidence, summary } = obtain);
  }

  if (operation) {
    operation = adaptedOperation(mind, operation);
    const prediction = predictionFor(mind, operation), explanation = experimentClaim(operation);
    const experiment: MaterialExperiment = { id: id(mind, input.agent.id, "experiment"), goalId: mind.goal.id, createdAt: input.tick, operation: structuredClone(operation), claim: explanation.claim,
      prediction, decisionAffected: explanation.decision, status: "planned", result: null, readingId: null, endedAt: null };
    mind.experiments = [...mind.experiments, experiment].slice(-24);
    evidence = [...new Set([...evidence, ...prediction.evidenceIds.filter((candidate) => input.agent.observations.some((observation) => observation.id === candidate))])];
    summary = `${explanation.claim} Predicted useful effect ${prediction.usefulEffect.toFixed(2)} with uncertainty ${prediction.uncertainty.toFixed(2)}; exact world thresholds are unavailable to the agent.`;
    action = { action: operation.kind === "test_tool" ? "test_material" : "process_material", targetId: null, destination: null, duration: operation.duration, materialOperation: operation };
  }
  if (!action) return null;
  const informationValue = operation ? 4 + (mind.experiments.at(-1)?.prediction.uncertainty ?? 0) * 5 : 1;
  const stageCost = action.duration * 0.24 + (operation ? 2.2 : 0.8);
  const risk = round((operation ? mind.experiments.at(-1)!.prediction.uncertainty * 5 : 1) + (input.agent.affect?.fear ?? 0) * 3);
  const benefit = mind.goal.predictedBenefit;
  const score = round(benefit - stageCost - risk + affectDecisionAdjustment(input.agent.affect, "develop_capability", risk, informationValue, lowest));
  return {
    materialGoalId: mind.goal.id,
    candidate: { goal: "develop_capability", targetId: action.targetId, score, expectedBenefit: round(benefit - stageCost), risk, knownObservationIds: evidence, summary, predictedSteps: action.duration, planActions: [action.action] },
    actions: [action], uncertainty: round(Math.min(0.95, risk / 10)),
  };
}

function updateBelief(mind: MaterialMind, key: string, value: number, evidenceId: string, tick: number): void {
  let entry = mind.beliefs.find((candidate) => candidate.key === key);
  if (!entry) {
    entry = { key, mean: value, m2: 0, samples: 1, uncertainty: 0.42, evidenceIds: [evidenceId], updatedAt: tick };
    mind.beliefs.push(entry);
  } else {
    entry.samples++;
    const delta = value - entry.mean;
    entry.mean = round(entry.mean + delta / entry.samples);
    entry.m2 = round(entry.m2 + delta * (value - entry.mean));
    entry.uncertainty = round(Math.max(0.08, Math.sqrt(entry.m2 / Math.max(1, entry.samples - 1)) + 0.28 / Math.sqrt(entry.samples)));
    entry.evidenceIds = [...new Set([...entry.evidenceIds, evidenceId])].slice(-12);
    entry.updatedAt = tick;
  }
  mind.beliefs = mind.beliefs.sort((left, right) => right.updatedAt - left.updatedAt).slice(0, 32);
}

/** Update only from a physically executed authoritative result. */
export function learnMaterialOutcome(agent: SurvivalAgent, operation: MaterialOperation, result: MaterialProcessResult, tick: number): void {
  const mind = agent.materialMind;
  if (!mind || !result.accepted) return;
  const experiment = [...mind.experiments].reverse().find((candidate) => candidate.status === "planned" && candidate.operation.kind === operation.kind);
  if (experiment) {
    experiment.status = result.supported ? "performed" : "failed";
    experiment.result = result.summary;
    experiment.readingId = result.reading?.id ?? null;
    experiment.endedAt = tick;
  }
  if (result.reading) {
    const predictionId = experiment?.id ?? null;
    const evidenceId = id(mind, agent.id, "evidence");
    mind.evidence = [...mind.evidence, { id: evidenceId, tick, operation: operation.kind, predictionId, reading: structuredClone(result.reading), interpretation: result.summary,
      confounds: operation.kind === "reduce_ore" ? ["Fuel quality, charge composition, airflow, enclosure condition and duration all varied in this intervention."] : operation.kind === "test_tool" ? ["This test applies only to the tested medium, force and remaining condition."] : ["The observation applies to this material batch and operating range."] }].slice(-96);
    const learningValue = operation.kind === "test_tool" ? result.reading.value : operation.kind === "form_hearth" || operation.kind === "fire_clay" ? result.temperatureC ?? 0 : result.solidYield;
    updateBelief(mind, operationKey(mind, operation), learningValue, evidenceId, tick);
    const existing = mind.procedures.find((procedure) => procedure.operation === operation.kind && JSON.stringify(procedure.parameters) === JSON.stringify(parameters(operation)));
    if (existing) {
      existing.successes += Number(result.supported); existing.failures += Number(!result.supported);
      existing.expectedEffect = round((existing.expectedEffect * (existing.successes + existing.failures - 1) + learningValue) / (existing.successes + existing.failures));
      existing.uncertainty = round(Math.max(0.08, existing.uncertainty * 0.82)); existing.evidenceIds = [...new Set([...existing.evidenceIds, evidenceId])].slice(-12);
    } else {
      const procedure: MaterialProcedure = { id: id(mind, agent.id, "procedure"), operation: operation.kind, learnedAt: tick, parameters: parameters(operation), successes: Number(result.supported), failures: Number(!result.supported), expectedEffect: round(learningValue), uncertainty: 0.42, evidenceIds: [evidenceId] };
      mind.procedures = [...mind.procedures, procedure].slice(-12);
    }
  }
  if (mind.goal) {
    mind.goal.updatedAt = tick;
    if (operation.kind === "test_tool" && result.supported && (result.reading?.value ?? 0) > 1.1) mind.goal.status = "satisfied";
    const relevantFailures = mind.experiments.filter((candidate) => ["reduce_ore", "work_metal", "test_tool"].includes(candidate.operation.kind) && candidate.status === "failed").length;
    if (relevantFailures >= 3) mind.goal.status = "abandoned";
  }
  mind.lastReviewAt = tick;
}
