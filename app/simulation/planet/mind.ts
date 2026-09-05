import { deterministicUnit, stableId } from "./random";
import type {
  AgentDecisionAlternative,
  AgentGoal,
  ContextLearning,
  GoalKind,
  KnowledgeObservation,
  PlanetAgent,
  PlanetWorldState,
  PlanStep,
} from "./types";

export const MAX_AGENT_OBSERVATIONS = 48;
export const MAX_AGENT_GOALS = 3;
export const MAX_PLAN_STEPS = 6;
export const MAX_CONTEXT_LEARNING = 24;
export const MAX_AGENT_COMMITMENTS = 12;

const UNIVERSAL_DRIVES: Record<string, number> = {
  survival: 1,
  nutrition: 1,
  hydration: 1,
  safety: 1,
  belonging: 1,
  competence: 1,
  prosperity: 1,
};

export function createAgentMind(): PlanetAgent["mind"] {
  return {
    learnedDriveWeights: { ...UNIVERSAL_DRIVES },
    observations: [],
    skills: {},
    goals: [],
    commitments: [],
    contextualLearning: [],
    decisionSequence: 0,
    lastDecision: null,
    advisory: null,
  };
}

export function rememberObservation(agent: PlanetAgent, observation: KnowledgeObservation): void {
  const existingIndex = agent.mind.observations.findIndex(
    (candidate) => candidate.kind === observation.kind && candidate.subjectId === observation.subjectId,
  );
  if (existingIndex >= 0) {
    const existing = agent.mind.observations[existingIndex];
    agent.mind.observations[existingIndex] = observation.confidence >= existing.confidence
      ? observation
      : { ...existing, learnedAt: observation.learnedAt, confidence: Math.max(existing.confidence, observation.confidence) };
  } else {
    agent.mind.observations.push(observation);
  }
  agent.mind.observations.sort((left, right) => {
    const valueDifference = observationValue(right) - observationValue(left);
    return valueDifference || right.learnedAt - left.learnedAt || left.id.localeCompare(right.id);
  });
  if (agent.mind.observations.length > MAX_AGENT_OBSERVATIONS) {
    agent.mind.observations.length = MAX_AGENT_OBSERVATIONS;
  }
}

function observationValue(observation: KnowledgeObservation): number {
  const kindWeight = observation.kind === "threat" ? 2 : observation.kind === "resource" ? 1.5 : 1;
  return observation.confidence * kindWeight;
}

function learningValue(agent: PlanetAgent, purpose: GoalKind, context: string): number {
  const exact = agent.mind.contextualLearning.find(({ key }) => key === `${purpose}:${context}`);
  const general = agent.mind.contextualLearning.find(({ key }) => key === `${purpose}:general`);
  return exact?.expectedValue ?? general?.expectedValue ?? 0;
}

interface CandidateGoal {
  purpose: GoalKind;
  score: number;
  targetId: string | null;
  rationale: string;
  steps: PlanStep[];
  expectedBenefits: Record<string, number>;
  factIds: string[];
}

function step(
  agent: PlanetAgent,
  sequence: number,
  action: string,
  targetId: string | null,
  duration: number,
  requirements: string[] = [],
): PlanStep {
  return {
    id: stableId("step", agent.id, agent.mind.decisionSequence, sequence, action, targetId ?? "none"),
    action,
    targetId,
    duration,
    status: sequence === 0 ? "active" : "pending",
    requirements,
  };
}

function bestKnownResource(agent: PlanetAgent, wanted: string[]): KnowledgeObservation | null {
  return agent.mind.observations
    .filter((observation) => observation.kind === "resource" && wanted.includes(String(observation.facts.resourceId)))
    .sort((left, right) => right.confidence - left.confidence || left.id.localeCompare(right.id))[0] ?? null;
}

function buildCandidates(world: PlanetWorldState, agent: PlanetAgent): CandidateGoal[] {
  const candidates: CandidateGoal[] = [];
  const context = agent.homeSettlementId ?? "nomad";
  const water = bestKnownResource(agent, ["freshwater_spring", "surface_water", "aquifer", "glacier_ice"]);
  const food = bestKnownResource(agent, [
    "wild_grain", "edible_tubers", "orchard_fruit", "tree_nuts", "berries", "wild_legumes",
    "marine_fish", "freshwater_fish", "game_animals", "grazing_herds",
  ]);
  const hydrationUrgency = Math.max(0, 100 - agent.needs.hydration) / 20;
  const nutritionUrgency = Math.max(0, 100 - agent.needs.nutrition) / 25;
  const dangerUrgency = Math.max(0, 100 - agent.needs.safety) / 30;
  candidates.push({
    purpose: "secure_water",
    score: 2 + hydrationUrgency + learningValue(agent, "secure_water", context),
    targetId: water?.subjectId ?? agent.homeSettlementId,
    rationale: water
      ? `Known water at ${water.subjectId} can restore hydration.`
      : "No reliable water source is known, so search near home.",
    steps: water
      ? [step(agent, 0, "travel", water.subjectId, 30), step(agent, 1, "collect", water.subjectId, 20), step(agent, 2, "drink", water.subjectId, 5)]
      : [step(agent, 0, "survey", null, 45), step(agent, 1, "evaluate_water", null, 10)],
    expectedBenefits: { hydration: 45, survival: 20 },
    factIds: water ? [water.id] : [],
  });
  candidates.push({
    purpose: "secure_food",
    score: 1.8 + nutritionUrgency + learningValue(agent, "secure_food", context),
    targetId: food?.subjectId ?? agent.homeSettlementId,
    rationale: food
      ? `Known food at ${food.subjectId} offers the best local supply.`
      : "Food knowledge is insufficient, so survey the surrounding region.",
    steps: food
      ? [step(agent, 0, "travel", food.subjectId, 35), step(agent, 1, "harvest", food.subjectId, 30), step(agent, 2, "eat", food.subjectId, 5)]
      : [step(agent, 0, "survey", null, 45), step(agent, 1, "evaluate_food", null, 10)],
    expectedBenefits: { nutrition: 40, prosperity: 5 },
    factIds: food ? [food.id] : [],
  });
  candidates.push({
    purpose: "defend",
    score: 0.7 + dangerUrgency + learningValue(agent, "defend", context),
    targetId: agent.homeSettlementId,
    rationale: dangerUrgency > 1 ? "Recent danger makes immediate protection worthwhile." : "Maintain a fallback for threats to home.",
    steps: [step(agent, 0, "assess_threats", agent.homeSettlementId, 20), step(agent, 1, "coordinate_defense", agent.homeSettlementId, 40)],
    expectedBenefits: { safety: 35, belonging: 5 },
    factIds: agent.mind.observations.filter(({ kind }) => kind === "threat").slice(0, 2).map(({ id }) => id),
  });
  const unknownNearby = agent.mind.observations.filter(({ kind }) => kind === "resource").length < 5;
  candidates.push({
    purpose: "explore",
    score: (unknownNearby ? 2.1 : 0.8) + learningValue(agent, "explore", context),
    targetId: null,
    rationale: unknownNearby ? "Local resource knowledge is too sparse for reliable future plans." : "Additional exploration may reveal strategic alternatives.",
    steps: [step(agent, 0, "survey", null, 60), step(agent, 1, "record_findings", null, 10)],
    expectedBenefits: { competence: 12, prosperity: 8 },
    factIds: [],
  });
  const settlement = world.settlements.find(({ id }) => id === agent.homeSettlementId);
  const researchable = agent.capabilities.length < 12 || Object.keys(settlement?.knowledgeEvidence ?? {}).length > 0;
  candidates.push({
    purpose: "research",
    score: (researchable ? 1.35 : 0.5) + learningValue(agent, "research", context) + (agent.mind.skills.research ?? 0) * 0.2,
    targetId: settlement?.id ?? null,
    rationale: "Unresolved observations can be tested and combined into a useful technique.",
    steps: [step(agent, 0, "form_hypothesis", settlement?.id ?? null, 35), step(agent, 1, "experiment", settlement?.id ?? null, 90), step(agent, 2, "evaluate", settlement?.id ?? null, 20)],
    expectedBenefits: { competence: 22, prosperity: 14 },
    factIds: agent.mind.observations.slice(0, 3).map(({ id }) => id),
  });
  candidates.push({
    purpose: "prosper",
    score: 1 + learningValue(agent, "prosper", context) + Object.values(agent.inventory).reduce((sum, value) => sum + value, 0) / 200,
    targetId: settlement?.id ?? null,
    rationale: "Contribute labor and supplies to improve long-term security.",
    steps: [step(agent, 0, "assess_opportunity", settlement?.id ?? null, 20), step(agent, 1, "work", settlement?.id ?? null, 80)],
    expectedBenefits: { prosperity: 20, belonging: 7 },
    factIds: [],
  });
  const advisory = agent.mind.advisory;
  if (advisory) {
    if (advisory.expiresAt <= world.time) {
      advisory.status = "expired";
    } else if (advisory.status === "accepted") {
      const candidate = candidates.find(({ purpose }) => purpose === advisory.goalKind);
      if (candidate) {
        // Counsel is a bounded suggestion, not an imperative. Local survival
        // pressure can still defeat this modest score bonus.
        candidate.score += 0.65;
        if (advisory.targetId) candidate.targetId = advisory.targetId;
        candidate.rationale = `${candidate.rationale} External counsel suggested considering this path; the agent still evaluated it locally.`;
      }
    }
  }
  return candidates;
}

/**
 * Choose from local observations only. A tiny deterministic exploration term
 * prevents identical histories from locking an agent into one forever-plan;
 * it is identity/decision based, so processing order cannot change the result.
 */
export function deliberateAgent(world: PlanetWorldState, agent: PlanetAgent): AgentGoal {
  const candidates = buildCandidates(world, agent).map((candidate) => ({
    ...candidate,
    score: candidate.score + deterministicUnit(world.seed, agent.id, agent.mind.decisionSequence, candidate.purpose) * 0.18,
  }));
  candidates.sort((left, right) => right.score - left.score || left.purpose.localeCompare(right.purpose));
  const chosen = candidates[0];
  const goalId = stableId("goal", world.seed, agent.id, agent.mind.decisionSequence, chosen.purpose);
  const goal: AgentGoal = {
    id: goalId,
    purpose: chosen.purpose,
    targetId: chosen.targetId,
    steps: chosen.steps.slice(0, MAX_PLAN_STEPS),
    priority: chosen.score,
    confidence: Math.max(0.05, Math.min(0.98, 0.45 + chosen.factIds.length * 0.11)),
    status: "active",
    expectedBenefits: chosen.expectedBenefits,
    formedAt: world.time,
    lastReconsideredAt: world.time,
    rationale: chosen.rationale,
  };
  const retained = agent.mind.goals
    .filter(({ status }) => status === "active" || status === "blocked")
    .filter(({ id }) => id !== goal.id)
    .slice(0, MAX_AGENT_GOALS - 1);
  agent.mind.goals = [goal, ...retained];
  const alternatives: AgentDecisionAlternative[] = candidates.slice(1, 4).map((candidate) => ({
    purpose: candidate.purpose,
    score: candidate.score,
    summary: candidate.rationale,
  }));
  agent.mind.lastDecision = {
    id: stableId("decision", world.seed, agent.id, agent.mind.decisionSequence),
    decidedAt: world.time,
    chosenGoalId: goal.id,
    knownFactIds: chosen.factIds,
    alternatives,
    uncertainty: 1 - goal.confidence,
    explanation: `${agent.name} chose to ${chosen.purpose.replaceAll("_", " ")} because ${chosen.rationale}`,
  };
  agent.mind.decisionSequence += 1;
  return goal;
}

export function learnFromGoalOutcome(
  agent: PlanetAgent,
  goal: AgentGoal,
  outcomeValue: number,
  at: number,
): void {
  const key = `${goal.purpose}:${agent.homeSettlementId ?? "nomad"}`;
  const record = agent.mind.contextualLearning.find((candidate) => candidate.key === key);
  if (record) {
    record.attempts += 1;
    const learningRate = Math.max(0.08, 1 / Math.sqrt(record.attempts));
    record.expectedValue += (outcomeValue - record.expectedValue) * learningRate;
    record.lastUpdatedAt = at;
  } else {
    agent.mind.contextualLearning.push({ key, attempts: 1, expectedValue: outcomeValue, lastUpdatedAt: at });
  }
  agent.mind.contextualLearning.sort((left: ContextLearning, right: ContextLearning) =>
    right.lastUpdatedAt - left.lastUpdatedAt || left.key.localeCompare(right.key),
  );
  if (agent.mind.contextualLearning.length > MAX_CONTEXT_LEARNING) {
    agent.mind.contextualLearning.length = MAX_CONTEXT_LEARNING;
  }
  const drive = goal.purpose === "secure_food"
    ? "nutrition"
    : goal.purpose === "secure_water"
      ? "hydration"
      : goal.purpose === "defend"
        ? "safety"
        : goal.purpose === "research"
          ? "competence"
          : "prosperity";
  agent.mind.learnedDriveWeights[drive] = Math.max(
    0.5,
    Math.min(1.75, (agent.mind.learnedDriveWeights[drive] ?? 1) + outcomeValue * 0.015),
  );
}

export function validateAgentMind(agent: PlanetAgent): boolean {
  const advisoryValid = agent.mind.advisory === null || (
    agent.mind.advisory.source === "openai"
    && Number.isFinite(agent.mind.advisory.receivedAt)
    && Number.isFinite(agent.mind.advisory.expiresAt)
    && agent.mind.advisory.expiresAt > agent.mind.advisory.receivedAt
    && agent.mind.advisory.reasoning.length <= 240
  );
  return advisoryValid
    && agent.mind.observations.length <= MAX_AGENT_OBSERVATIONS
    && agent.mind.goals.length <= MAX_AGENT_GOALS
    && agent.mind.goals.every(({ steps }) => steps.length <= MAX_PLAN_STEPS)
    && agent.mind.contextualLearning.length <= MAX_CONTEXT_LEARNING
    && agent.mind.commitments.length <= MAX_AGENT_COMMITMENTS;
}
