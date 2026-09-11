import { RESEARCH_CATALOG } from "./catalog";
import { agePhysicalWorld, executeManipulation, freshPhysicalMind, freshPhysicalWorld, MATERIALS, protectionAt } from "./physical-world";
import { completePhysicalOperation, learnPhysicalReading, planPhysicalKnowledge, preparePhysicalProjects } from "./physical-policy";
import { validatePhysicalState } from "./physical-validation";
import { freshDiscoveryMind } from "./discovery-types";
import { discoveryInput } from "./discovery-boundary";
import { prepareDiscovery } from "./discovery-policy";
import { beginDiscoveryOperation, finishDiscoveryOperation, receiveDiscoveryTestimony } from "./discovery-outcomes";
import { validateDiscoveryState } from "./discovery-validation";
import { addGeologicalDeposits, GEOLOGICAL_FEEDSTOCKS, validateGeology } from "./geology";
import { physicalNextPosition } from "./physical-navigation";
import { findPrivateRoute, freshNavigation, privateSegmentClear } from "./private-navigation";
import { MOVEMENT_ARRIVAL_RADIUS } from "./navigation-geometry";
import { planNeedsRepair } from "./survival-forecast";
import { freshSurvivalRecord, sampleSurvival, validateSurvivalExperience } from "./survival-record";
import { canCollectFreshwater, depthAt, estimateWaterTravel, freshwaterFeatures, freshwaterFootprint, immersionCost, locomotionAt, shorePoints, SWIMMING_DEPTH } from "./water";
import { driftNeeds } from "./physiology";
import { researchMaterialEvidence } from "./research-evidence";
import { advanceSurvivalRun as advanceBaseline } from "./baseline-engine";
import { evaluateDonation, planFromPrivateKnowledge, survivalPotential } from "./planner";
import { evaluateSuccession, SUCCESSION_MATURITY_STEPS, SUCCESSION_PROVISIONS, SUCCESSION_REVIEW_STEPS } from "./succession";
import { chooseExperimentDose, evaluateCausalExperiment, hasReplicatedCausalEffect, preparedMaterialContext } from "./experiments";
import { survivalBetween, survivalHash, survivalSeedToUint32, survivalUnit } from "./random";
import type {
  AddObserverAgentResult,
  AgentDecisionCandidate,
  AgentDeliberation,
  AgentLearning,
  AgentLimit,
  AgentMemory,
  AgentObservation,
  AgentRelationship,
  AgentResearchProject,
  ClimateVolatility,
  FactValue,
  ResearchAttempt,
  ResearchDefinition,
  ResourceAbundance,
  SurvivalActionKind,
  SurvivalActionOutcome,
  SurvivalAdvanceResult,
  SurvivalAgent,
  SurvivalCurrentAction,
  SurvivalEnvironment,
  SurvivalEvent,
  SurvivalEventCategory,
  SurvivalEventType,
  AgentGoalKind,
  SurvivalInventory,
  SurvivalNeeds,
  SurvivalObjective,
  SurvivalPlan,
  SurvivalPlanStep,
  SurvivalPosition,
  SurvivalResourceKind,
  SurvivalResourceSite,
  SurvivalRunOptions,
  SurvivalRunState,
  SurvivalSeed,
  SurvivalStructure,
  WeatherKind,
} from "./types";

export const SURVIVAL_SCHEMA_VERSION = 4 as const;
export const SURVIVAL_STEP_MINUTES = 10 as const;
export const SURVIVAL_EVENT_RING_LIMIT = 512 as const;
export const SURVIVAL_OBJECTIVE: SurvivalObjective = Object.freeze({
  kind: "survive",
  statement: "Survive as long as possible.",
});

const STEPS_PER_DAY = (24 * 60) / SURVIVAL_STEP_MINUTES;
const PERCEPTION_RADIUS = 36;
const MAX_OBSERVATIONS = 48;
const MAX_MEMORIES = 64;
const MAX_LEARNING_CONTEXTS = 96;
const FRESHWATER_SHORE_CLEARANCE = 2.4;

type MutableIdKind = keyof SurvivalRunState["nextIds"];

interface EventInput {
  type: SurvivalEventType;
  category: SurvivalEventCategory;
  agentIds?: string[];
  summary: string;
  outcome: string;
  position?: SurvivalPosition | null;
  facts?: Record<string, FactValue>;
  intervention?: boolean;
}

interface CandidateDraft {
  goal: AgentDecisionCandidate["goal"];
  targetId: string | null;
  baseScore: number;
  expectedBenefit: number;
  risk: number;
  knownObservationIds: string[];
  summary: string;
}

const RESOURCE_KINDS: readonly SurvivalResourceKind[] = [
  "freshwater",
  "food",
  "wood",
  "stone",
  "fiber",
  "herbs",
  "clay",
];

const ACTION_KINDS: readonly SurvivalActionKind[] = [
  "move", "collect", "drink", "eat", "rest", "warm", "shelter", "explore", "gather", "build",
  "prepare_experiment", "test_hypothesis", "review_evidence", "share", "request", "cooperate", "wait",
];
const ACTION_STATUSES: readonly SurvivalCurrentAction["status"][] = [
  "moving", "acting", "resting", "awaiting_decision", "blocked", "complete",
];
const GOAL_KINDS: readonly AgentGoalKind[] = [
  "secure_water", "secure_food", "recover", "stay_warm", "seek_safety", "explore", "gather_material",
  "build_shelter", "research", "share", "request_help", "cooperate", "wait",
];
const EVENT_TYPES: readonly SurvivalEventType[] = [
  "run_started", "agent_added", "agent_died", "decision_recorded", "action_outcome", "resource_observed",
  "structure_built", "social_proposal", "social_accepted", "social_refused", "experiment", "discovery",
  "sole_survivor_decision", "succession_enabled", "succession_decision", "run_completed", "run_extinct",
];
const EVENT_CATEGORIES: readonly SurvivalEventCategory[] = ["run", "agent", "survival", "social", "research", "environment"];

function clamp(value: number, minimum = 0, maximum = 100): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function rounded(value: number, digits = 4): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function researchProjectConfidence(
  successfulTrials: number,
  requiredSuccessfulTrials: number,
  attemptCount: number,
): number {
  return rounded(clamp(
    (successfulTrials / requiredSuccessfulTrials) * 78
      + Math.min(18, attemptCount * 3)
      - (attemptCount - successfulTrials) * 2,
  ));
}

function cloneState(state: SurvivalRunState): SurvivalRunState {
  const clone = structuredClone(state) as SurvivalRunState;
  upgradeLegacyStateInPlace(clone);
  return clone;
}

/** Upgrades the unreleased pre-window schema-1 checkpoint used during local HMR. */
function upgradeLegacyStateInPlace(state: SurvivalRunState): void {
  const loose = state as SurvivalRunState & {
    eventWindow?: SurvivalRunState["eventWindow"];
    stats: SurvivalRunState["stats"] & { planSteps?: number; memories?: number };
  };
  if (isRecord(loose.stats)) {
    if (loose.stats.planSteps === undefined) {
      loose.stats.planSteps = Number.isInteger(loose.nextIds?.step) ? Math.max(0, loose.nextIds.step - 1) : 0;
    }
    if (loose.stats.memories === undefined) {
      loose.stats.memories = Number.isInteger(loose.nextIds?.memory) ? Math.max(0, loose.nextIds.memory - 1) : 0;
    }
  }
  if (loose.eventWindow === undefined && Array.isArray(loose.events)) {
    const totalEvents = Number.isInteger(loose.nextIds?.event)
      ? Math.max(loose.events.length, loose.nextIds.event - 1)
      : loose.events.length;
    const overflow = Math.max(0, loose.events.length - SURVIVAL_EVENT_RING_LIMIT);
    if (overflow > 0) loose.events.splice(0, overflow);
    loose.eventWindow = {
      capacity: SURVIVAL_EVENT_RING_LIMIT,
      totalEvents,
      droppedEvents: Math.max(0, totalEvents - loose.events.length),
      firstRetainedTick: loose.events[0]?.tick ?? null,
    };
  }
  migrateResearchEvidenceInPlace(state);
}

function emptyInventory(): SurvivalInventory {
  return { freshwater: 0, food: 0, wood: 0, stone: 0, fiber: 0, herbs: 0, clay: 0 };
}

function distance(left: SurvivalPosition, right: SurvivalPosition): number {
  return Math.hypot(left.x - right.x, left.z - right.z);
}

/** The footprint used by both the simulation's water access point and the renderer. */
export function freshwaterVisualFootprint(
  site: Pick<SurvivalResourceSite, "capacity" | "position">,
): { radiusX: number; radiusZ: number; rotation: number } {
  const { radiusX, radiusZ, rotation } = freshwaterFootprint(site);
  return { radiusX, radiusZ, rotation };
}

/** A deterministic dry-land access point just beyond the pond's minor-axis edge. */
export function freshwaterShorePosition(
  site: Pick<SurvivalResourceSite, "capacity" | "position">,
): SurvivalPosition {
  const { radiusZ, rotation } = freshwaterVisualFootprint(site);
  const distanceFromCenter = radiusZ + FRESHWATER_SHORE_CLEARANCE;
  return {
    x: rounded(site.position.x + Math.sin(rotation) * distanceFromCenter, 3),
    z: rounded(site.position.z + Math.cos(rotation) * distanceFromCenter, 3),
  };
}

function nextId(state: SurvivalRunState, kind: MutableIdKind): string {
  const value = state.nextIds[kind];
  state.nextIds[kind] += 1;
  return `${kind}-${value}`;
}

function makeEvent(state: SurvivalRunState, input: EventInput): SurvivalEvent {
  const event: SurvivalEvent = {
    id: nextId(state, "event"),
    tick: state.tick,
    day: state.day,
    type: input.type,
    category: input.category,
    agentIds: input.agentIds ?? [],
    summary: input.summary,
    outcome: input.outcome,
    position: input.position ?? null,
    facts: input.facts ?? {},
    intervention: input.intervention ?? false,
  };
  state.events.push(event);
  state.eventWindow.totalEvents += 1;
  return event;
}

function trimEventWindow(state: SurvivalRunState): void {
  const overflow = Math.max(0, state.events.length - state.eventWindow.capacity);
  if (overflow > 0) {
    state.events.splice(0, overflow);
    state.eventWindow.droppedEvents += overflow;
  }
  state.eventWindow.firstRetainedTick = state.events[0]?.tick ?? null;
}

function assertAgentLimit(value: number, label: string): asserts value is AgentLimit {
  if (!Number.isInteger(value) || value < 1 || value > 5) {
    throw new RangeError(`${label} must be an integer from 1 through 5.`);
  }
}

function normalizeOptions(options: SurvivalRunOptions): SurvivalRunState["config"] {
  const requestedCount = options.agentCount ?? options.agentCap ?? 3;
  assertAgentLimit(requestedCount, "agentCount");
  const requestedCap = options.agentCap ?? 5;
  assertAgentLimit(requestedCap, "agentCap");
  if (requestedCount > requestedCap) throw new RangeError("agentCount cannot exceed agentCap.");

  const durationHours = options.durationHours === undefined ? 72 : options.durationHours;
  if (durationHours !== null && (!Number.isFinite(durationHours) || durationHours <= 0)) {
    throw new RangeError("durationHours must be a positive number or null.");
  }
  const worldSize = options.worldSize ?? 256;
  if (!Number.isFinite(worldSize) || worldSize < 96 || worldSize > 1024) {
    throw new RangeError("worldSize must be between 96 and 1024.");
  }
  const resourceAbundance = options.resourceAbundance ?? "balanced";
  const climateVolatility = options.climateVolatility ?? "variable";
  if (!(resourceAbundance === "scarce" || resourceAbundance === "balanced" || resourceAbundance === "plentiful")) {
    throw new RangeError("Unknown resource abundance.");
  }
  if (!(climateVolatility === "stable" || climateVolatility === "variable" || climateVolatility === "harsh")) {
    throw new RangeError("Unknown climate volatility.");
  }
  return {
    ...(options.policyVersion === 3 || options.policyVersion === 4 ? { continuity: options.continuity ?? false } : {}),
    ...(options.policyVersion === 4 && options.materialFoundation === "geology-v1" ? { materialFoundation: "geology-v1" as const } : {}),
    initialAgentCount: requestedCount,
    agentCap: requestedCap,
    durationHours,
    resourceAbundance,
    climateVolatility,
    worldSize,
    stepMinutes: SURVIVAL_STEP_MINUTES,
    objective: { ...SURVIVAL_OBJECTIVE },
  };
}

function abundanceMultiplier(abundance: ResourceAbundance): number {
  if (abundance === "scarce") return 0.62;
  if (abundance === "plentiful") return 1.55;
  return 1;
}

function siteAnchor(kind: SurvivalResourceKind, index: number): SurvivalPosition | null {
  if (index !== 0) return null;
  const anchors: Record<SurvivalResourceKind, SurvivalPosition> = {
    freshwater: { x: 0, z: 0 },
    food: { x: 13, z: 9 },
    wood: { x: -13, z: 14 },
    stone: { x: 16, z: -11 },
    fiber: { x: -15, z: -8 },
    herbs: { x: 24, z: 4 },
    clay: { x: 7, z: -23 },
  };
  return anchors[kind];
}

function createEnvironment(
  seed: number,
  worldSize: number,
  abundance: ResourceAbundance,
): SurvivalEnvironment {
  const half = worldSize / 2;
  const multiplier = abundanceMultiplier(abundance);
  const counts: Record<SurvivalResourceKind, number> = {
    freshwater: Math.max(2, Math.round(3 * multiplier)),
    food: Math.max(4, Math.round(7 * multiplier)),
    wood: Math.max(3, Math.round(6 * multiplier)),
    stone: Math.max(2, Math.round(4 * multiplier)),
    fiber: Math.max(3, Math.round(5 * multiplier)),
    herbs: Math.max(2, Math.round(3 * multiplier)),
    clay: Math.max(2, Math.round(3 * multiplier)),
  };
  const baseCapacity: Record<SurvivalResourceKind, number> = {
    freshwater: 42,
    food: 20,
    wood: 28,
    stone: 24,
    fiber: 22,
    herbs: 12,
    clay: 20,
  };
  const regeneration: Record<SurvivalResourceKind, number> = {
    freshwater: 24,
    food: 2.5,
    wood: 0.12,
    stone: 0,
    fiber: 1.3,
    herbs: 0.7,
    clay: 0,
  };
  const resources: SurvivalResourceSite[] = [];
  for (const kind of RESOURCE_KINDS) {
    for (let index = 0; index < counts[kind]; index += 1) {
      const anchor = siteAnchor(kind, index);
      const capacity = rounded(
        baseCapacity[kind] * multiplier * survivalBetween(seed, 0.82, 1.18, "capacity", kind, index),
        2,
      );
      resources.push({
        id: `site-${kind}-${index + 1}`,
        kind,
        position: anchor ?? {
          x: rounded(survivalBetween(seed, -half * 0.78, half * 0.78, "site-x", kind, index), 2),
          z: rounded(survivalBetween(seed, -half * 0.78, half * 0.78, "site-z", kind, index), 2),
        },
        quantity: capacity,
        capacity,
        regenerationPerDay: regeneration[kind] * multiplier,
        contaminated: kind === "freshwater" && index > 0 && survivalUnit(seed, "contamination", index) < 0.22,
      });
    }
  }
  return {
    size: worldSize,
    bounds: { minX: -half, maxX: half, minZ: -half, maxZ: half },
    daylight: 0,
    temperatureC: 13,
    weather: "clear",
    weatherChangedAt: 0,
    resources,
    structures: [],
  };
}

function initialPosition(state: SurvivalRunState, slot: AgentLimit, serial: number): SurvivalPosition {
  const angle = survivalBetween(state.seed, 0, Math.PI * 2, "agent-angle", serial, state.tick, slot);
  const radius = survivalBetween(state.seed, 5, 15, "agent-radius", serial, state.tick, slot);
  return { x: rounded(Math.cos(angle) * radius, 2), z: rounded(Math.sin(angle) * radius, 2) };
}

function initialNeeds(): SurvivalNeeds {
  return { health: 92, hydration: 78, nutrition: 76, energy: 82, warmth: 76, safety: 72 };
}

function makeAgent(
  state: SurvivalRunState,
  source: SurvivalAgent["spawnSource"],
  preferredSlot?: AgentLimit,
): SurvivalAgent {
  const occupied = new Set(state.agents.filter(({ alive }) => alive).map(({ slot }) => slot));
  const available = [1, 2, 3, 4, 5].filter((slot) => slot <= state.config.agentCap && !occupied.has(slot as AgentLimit));
  const slotNumber = preferredSlot && available.includes(preferredSlot) ? preferredSlot : available[0];
  if (slotNumber === undefined) throw new Error("No available agent slot.");
  const slot = slotNumber as AgentLimit;
  const slotGeneration = state.agents.filter((agent) => agent.slot === slot).length + 1;
  const serial = state.nextIds.agent;
  const id = nextId(state, "agent");
  return {
    ...(state.policyVersion === 3 || state.policyVersion === 4 ? { physicalMind: freshPhysicalMind() } : {}),
    ...(state.policyVersion === 4 ? { discovery: freshDiscoveryMind() } : {}),
    ...(state.geology ? { rawFeedstocks: {} } : {}),
    ...(state.survivalRevision ? { navigation: freshNavigation(), survivalRecord: freshSurvivalRecord(state.tick) } : {}),
    id,
    label: `A${slot}`,
    slot,
    slotGeneration,
    name: slotGeneration === 1 ? `Agent A${slot}` : `Agent A${slot} · Entry ${slotGeneration}`,
    spawnSource: source,
    spawnedAt: state.tick,
    alive: true,
    diedAt: null,
    causeOfDeath: null,
    position: initialPosition(state, slot, serial),
    needs: initialNeeds(),
    inventory: emptyInventory(),
    observations: [],
    memory: [],
    learning: [],
    relationships: [],
    technologies: [],
    research: [],
    currentDeliberation: null,
    currentPlan: null,
    currentAction: {
      kind: "wait",
      status: "awaiting_decision",
      targetId: null,
      startedAt: state.tick,
      updatedAt: state.tick,
    },
    lastOutcome: null,
  };
}

function introduceAgent(
  state: SurvivalRunState,
  source: SurvivalAgent["spawnSource"],
  eventSummary: string | null,
  intervention: boolean,
): { agent: SurvivalAgent; event: SurvivalEvent | null } {
  const agent = makeAgent(state, source);
  state.agents.push(agent);
  state.stats.totalAgentsIntroduced += 1;
  state.stats.livingAgents = livingAgents(state).length;
  state.stats.peakLivingAgents = Math.max(state.stats.peakLivingAgents, state.stats.livingAgents);
  const event = eventSummary === null ? null : makeEvent(state, {
    type: "agent_added",
    category: "agent",
    agentIds: [agent.id],
    summary: eventSummary,
    outcome: `${agent.label} entered the environment.`,
    position: agent.position,
    facts: { source, slot: agent.slot },
    intervention,
  });
  return { agent, event };
}

export function createSurvivalRun(seedInput: SurvivalSeed, options: SurvivalRunOptions = {}): SurvivalRunState {
  if (options.materialFoundation !== undefined && (options.materialFoundation !== "geology-v1" || options.policyVersion !== 4)) throw new TypeError("The raw-material foundation requires an explicit policy-4 study.");
  const config = normalizeOptions(options);
  const seed = survivalSeedToUint32(seedInput);
  const state: SurvivalRunState = {
    ...(options.policyVersion === 3 || options.policyVersion === 4 ? { physical: freshPhysicalWorld() } : {}),
    ...((options.policyVersion !== 3 && options.policyVersion !== 4) || config.continuity ? { succession: { version: 1 as const, enabledAt: 0, plans: [] } } : {}),
    policyVersion: options.policyVersion ?? 2,
    schemaVersion: config.materialFoundation ? 6 : options.policyVersion === 4 ? 5 : SURVIVAL_SCHEMA_VERSION,
    ...(config.materialFoundation ? { geology: { version: 1 as const } } : {}),
    survivalRevision: 1,
    id: `survival-${survivalHash(seed, "run").toString(36)}`,
    seed,
    seedLabel: String(seedInput),
    config,
    status: "running",
    tick: 0,
    elapsedMinutes: 0,
    day: 1,
    timeOfDay: 0,
    environment: createEnvironment(seed, config.worldSize, config.resourceAbundance),
    agents: [],
    events: [],
    eventWindow: {
      capacity: SURVIVAL_EVENT_RING_LIMIT,
      totalEvents: 0,
      droppedEvents: 0,
      firstRetainedTick: null,
    },
    stats: {
      livingAgents: 0,
      peakLivingAgents: 0,
      totalAgentsIntroduced: 0,
      deaths: 0,
      decisions: 0,
      experiments: 0,
      discoveries: 0,
      observerInterventions: 0,
      planSteps: 0,
      memories: 0,
    },
    nextIds: {
      agent: 1,
      event: 1,
      decision: 1,
      plan: 1,
      step: 1,
      memory: 1,
      project: 1,
      attempt: 1,
      structure: 1,
    },
    soleSurvivor: {
      epoch: 0,
      previousLivingCount: config.initialAgentCount,
      agentId: null,
      decidedAt: null,
      decision: null,
      rationale: null,
      companionAgentId: null,
    },
  };
  if (state.geology) addGeologicalDeposits(state.environment, seed, config.resourceAbundance);
  for (let index = 0; index < config.initialAgentCount; index += 1) {
    introduceAgent(state, "initial", null, false);
  }
  state.soleSurvivor.previousLivingCount = state.stats.livingAgents;
  makeEvent(state, {
    type: "run_started",
    category: "run",
    agentIds: state.agents.map(({ id }) => id),
    summary: "The survival experiment began.",
    outcome: `${config.initialAgentCount} independent agent${config.initialAgentCount === 1 ? "" : "s"} entered the environment.`,
    facts: {
      objective: config.objective.statement,
      agentCap: config.agentCap,
      initialAgentCount: config.initialAgentCount,
      durationHours: config.durationHours,
      successionVersion: state.succession ? 1 : null,
      continuityObjective: state.succession ? "Optional next-generation continuity, subordinate to immediate survival." : "Disabled: individual survival only.",
    },
  });
  trimEventWindow(state);
  return state;
}

function chooseWeather(seed: number, tick: number, volatility: ClimateVolatility): WeatherKind {
  const roll = survivalUnit(seed, "weather", tick);
  if (volatility === "stable") {
    if (roll < 0.58) return "clear";
    if (roll < 0.83) return "overcast";
    if (roll < 0.96) return "rain";
    return roll < 0.98 ? "cold_snap" : "heat_wave";
  }
  if (volatility === "harsh") {
    if (roll < 0.2) return "clear";
    if (roll < 0.36) return "overcast";
    if (roll < 0.57) return "rain";
    if (roll < 0.74) return "storm";
    if (roll < 0.87) return "cold_snap";
    return "heat_wave";
  }
  if (roll < 0.4) return "clear";
  if (roll < 0.62) return "overcast";
  if (roll < 0.79) return "rain";
  if (roll < 0.88) return "storm";
  if (roll < 0.94) return "cold_snap";
  return "heat_wave";
}

function updateEnvironment(state: SurvivalRunState): void {
  const timeFraction = state.timeOfDay / (24 * 60);
  state.environment.daylight = rounded(Math.max(0, Math.sin(timeFraction * Math.PI * 2 - Math.PI / 2)), 3);
  if (state.tick === 1 || state.tick % 18 === 0) {
    const weather = chooseWeather(state.seed, state.tick, state.config.climateVolatility);
    if (weather !== state.environment.weather) state.environment.weatherChangedAt = state.tick;
    state.environment.weather = weather;
  }
  const weatherOffset: Record<WeatherKind, number> = {
    clear: 2,
    overcast: -1,
    rain: -3,
    storm: -5,
    cold_snap: -11,
    heat_wave: 10,
  };
  state.environment.temperatureC = rounded(10 + state.environment.daylight * 15 + weatherOffset[state.environment.weather], 2);
  for (const site of state.environment.resources) {
    if (site.regenerationPerDay <= 0) continue;
    site.quantity = rounded(Math.min(site.capacity, site.quantity + site.regenerationPerDay / STEPS_PER_DAY));
  }
  for (const structure of state.environment.structures) {
    structure.condition = rounded(clamp(structure.condition - 0.004));
  }
}

function researchEvidenceObservationId(agentId: string, projectId: string, index: number): string {
  return `obs-${agentId}-research-${projectId}-${index + 1}`;
}

function trimAgentObservations(agent: SurvivalAgent): void {
  const pinned = new Set(
    agent.research.flatMap((project) => project.attempts.flatMap((attempt) => attempt.observationIds)),
  );
  let removalsRemaining = Math.max(0, agent.observations.length - MAX_OBSERVATIONS);
  if (removalsRemaining > 0) {
    agent.observations = agent.observations.filter((observation) => {
      if (removalsRemaining > 0 && !pinned.has(observation.id)) {
        removalsRemaining -= 1;
        return false;
      }
      return true;
    });
    // Valid runs have at most thirteen pinned research observations. This
    // fallback keeps malformed input bounded so validation can reject it.
    if (removalsRemaining > 0) agent.observations.splice(0, removalsRemaining);
  }
  if (agent.currentDeliberation) {
    const retained = new Set(agent.observations.map(({ id }) => id));
    agent.currentDeliberation.knownObservationIds = agent.currentDeliberation.knownObservationIds.filter((id) => retained.has(id));
    for (const candidate of agent.currentDeliberation.candidates) {
      candidate.knownObservationIds = candidate.knownObservationIds.filter((id) => retained.has(id));
    }
  }
}

function migrateResearchEvidenceInPlace(state: SurvivalRunState): void {
  if (!Array.isArray(state.agents) || !Array.isArray(state.environment?.resources)) return;
  for (const agent of state.agents) {
    if (!isRecord(agent) || !Array.isArray(agent.research) || !Array.isArray(agent.observations)) continue;
    for (const project of agent.research) {
      if (!isRecord(project) || !Array.isArray(project.attempts) || project.attempts.length === 0) continue;
      const definition = RESEARCH_CATALOG.find(({ id }) => id === project.technologyId);
      const firstAttempt = project.attempts[0];
      if (
        !definition
        || !isRecord(firstAttempt)
        || !isNonNegativeInteger(firstAttempt.attemptedAt)
        || !Array.isArray(firstAttempt.observationIds)
        || firstAttempt.observationIds.length !== definition.requiredObservations.length
      ) continue;

      const evidence: AgentObservation[] = [];
      for (let index = 0; index < definition.requiredObservations.length; index += 1) {
        const kind = definition.requiredObservations[index];
        const canonicalId = researchEvidenceObservationId(agent.id, project.id, index);
        const existing = agent.observations.find((observation) => (
          observation.id === canonicalId
          && observation.observerId === agent.id
          && observation.kind === "resource"
          && observation.facts.resourceKind === kind
          && observation.facts.researchEvidence === true
        ));
        if (existing) {
          evidence.push(existing);
          continue;
        }

        const sourceId = firstAttempt.observationIds[index];
        if (typeof sourceId !== "string") break;
        const source = agent.observations.find((observation) => (
          observation.id === sourceId
          && observation.observerId === agent.id
          && observation.kind === "resource"
          && observation.facts.resourceKind === kind
        ));
        const legacyPrefix = `obs-${agent.id}-`;
        const legacySubjectId = source?.subjectId
          ?? (sourceId.startsWith(legacyPrefix) ? sourceId.slice(legacyPrefix.length) : null);
        const site = typeof legacySubjectId === "string"
          ? state.environment.resources.find((candidate) => candidate.id === legacySubjectId && candidate.kind === kind)
          : undefined;
        if (!site) break;
        evidence.push({
          id: canonicalId,
          observerId: agent.id,
          kind: "resource",
          subjectId: site.id,
          observedAt: Math.min(firstAttempt.attemptedAt, source?.observedAt ?? firstAttempt.attemptedAt),
          position: site.kind === "freshwater" ? freshwaterShorePosition(site) : { ...site.position },
          confidence: source?.confidence ?? 0.94,
          facts: {
            resourceKind: kind,
            availableEstimate: source?.facts.availableEstimate ?? Math.max(0, Math.round(site.quantity)),
            contaminated: source?.facts.contaminated ?? site.contaminated,
            researchEvidence: true,
          },
        });
      }
      if (evidence.length !== definition.requiredObservations.length) continue;
      const evidenceIds = evidence.map(({ id }) => id);
      for (const observation of evidence) {
        const priorIndex = agent.observations.findIndex(({ id }) => id === observation.id);
        if (priorIndex < 0) agent.observations.push(observation);
        else agent.observations[priorIndex] = observation;
      }
      for (const attempt of project.attempts) {
        if (isRecord(attempt) && Array.isArray(attempt.observationIds)) {
          attempt.observationIds = [...evidenceIds];
        }
      }
    }
    trimAgentObservations(agent);
  }
}

function upsertObservation(agent: SurvivalAgent, observation: AgentObservation): boolean {
  const priorIndex = agent.observations.findIndex(({ id }) => id === observation.id);
  const isNew = priorIndex < 0;
  if (!isNew) agent.observations.splice(priorIndex, 1);
  agent.observations.push(observation);
  trimAgentObservations(agent);
  return isNew;
}

function materializeResearchEvidence(
  agent: SurvivalAgent,
  project: AgentResearchProject,
  definition: ResearchDefinition,
  sourceObservationIds: readonly string[],
): string[] {
  const evidence: AgentObservation[] = [];
  for (let index = 0; index < definition.requiredObservations.length; index += 1) {
    const kind = definition.requiredObservations[index];
    const id = researchEvidenceObservationId(agent.id, project.id, index);
    const existing = agent.observations.find((observation) => (
      observation.id === id
      && observation.observerId === agent.id
      && observation.kind === "resource"
      && observation.facts.resourceKind === kind
      && observation.facts.researchEvidence === true
    ));
    if (existing) {
      evidence.push(existing);
      continue;
    }
    const source = agent.observations.find((observation) => (
      observation.id === sourceObservationIds[index]
      && observation.observerId === agent.id
      && observation.kind === "resource"
      && observation.facts.resourceKind === kind
    ));
    if (!source) return [];
    evidence.push({
      ...source,
      id,
      position: source.position ? { ...source.position } : null,
      facts: { ...source.facts, researchEvidence: true },
    });
  }
  for (const observation of evidence) {
    const priorIndex = agent.observations.findIndex(({ id }) => id === observation.id);
    if (priorIndex < 0) agent.observations.push(observation);
    else agent.observations[priorIndex] = observation;
  }
  return evidence.map(({ id }) => id);
}

function perceive(state: SurvivalRunState, agent: SurvivalAgent): void {
  for (const site of state.environment.resources) {
    if (distance(agent.position, site.position) > PERCEPTION_RADIUS) continue;
    const id = `obs-${agent.id}-${site.id}`;
    const isNew = upsertObservation(agent, {
      id,
      observerId: agent.id,
      kind: "resource",
      subjectId: site.id,
      observedAt: state.tick,
      position: site.kind === "freshwater" ? shorePoints(freshwaterFootprint(site)).filter(p=>p.x>=state.environment.bounds.minX&&p.x<=state.environment.bounds.maxX&&p.z>=state.environment.bounds.minZ&&p.z<=state.environment.bounds.maxZ).sort((a,b)=>distance(agent.position,a)-distance(agent.position,b))[0] ?? freshwaterShorePosition(site) : { ...site.position },
      confidence: 0.94,
      facts: {
        resourceKind: site.kind,
        ...(site.feedstock ? { mineralAppearance: GEOLOGICAL_FEEDSTOCKS[site.feedstock].appearance } : {}),
        availableEstimate: Math.max(0, Math.round(site.quantity)),
        contaminated: site.contaminated,
        ...(site.kind === "freshwater" ? {
          waterCenterX: site.position.x, waterCenterZ: site.position.z,
          waterRadiusX: freshwaterVisualFootprint(site).radiusX, waterRadiusZ: freshwaterVisualFootprint(site).radiusZ,
          waterRotation: freshwaterVisualFootprint(site).rotation,
        } : {}),
        ...((state.policyVersion === 3 || state.policyVersion === 4) && site.kind in MATERIALS ? { bulkDensity: MATERIALS[site.kind as keyof typeof MATERIALS].density, measurement: "Visible batch mass per bulk volume; strength and performance remain untested." } : {}),
      },
    });
    if (isNew) {
      makeEvent(state, {
        type: "resource_observed",
        category: "environment",
        agentIds: [agent.id],
        summary: site.feedstock ? `${agent.label} observed ${GEOLOGICAL_FEEDSTOCKS[site.feedstock].appearance.toLowerCase()}.` : `${agent.label} observed ${site.kind}.`,
        outcome: "The location entered this agent's private observations.",
        position: site.position,
        facts: { siteId: site.id, resourceKind: site.kind },
      });
    }
  }
  for (const other of state.agents) {
    if (other.id === agent.id || distance(agent.position, other.position) > PERCEPTION_RADIUS) continue;
    upsertObservation(agent, {
      id: `obs-${agent.id}-${other.id}`,
      observerId: agent.id,
      kind: "agent",
      subjectId: other.id,
      observedAt: state.tick,
      position: { ...other.position },
      confidence: 0.88,
      facts: {
        alive: other.alive,
        label: other.label,
        healthEstimate: Math.round(other.needs.health / 10) * 10,
        hydrationEstimate: Math.round(other.needs.hydration / 10) * 10,
        nutritionEstimate: Math.round(other.needs.nutrition / 10) * 10,
      },
    });
  }
  for (const structure of state.environment.structures) {
    if (distance(agent.position, structure.position) > PERCEPTION_RADIUS) continue;
    upsertObservation(agent, {
      id: `obs-${agent.id}-${structure.id}`,
      observerId: agent.id,
      kind: "structure",
      subjectId: structure.id,
      observedAt: state.tick,
      position: { ...structure.position },
      confidence: 0.98,
      facts: { structureKind: structure.kind, condition: Math.round(structure.condition) },
    });
  }
  upsertObservation(agent, {
    id: `obs-${agent.id}-weather`,
    observerId: agent.id,
    kind: "weather",
    subjectId: "weather",
    observedAt: state.tick,
    position: null,
    confidence: 0.99,
    facts: {
      weather: state.environment.weather,
      temperatureC: state.environment.temperatureC,
      daylight: state.environment.daylight,
    },
  });
  if (state.physical) for (const part of state.physical.parts) {
    if (distance(agent.position, part.position) > 20) continue;
    upsertObservation(agent, { id: `obs-${agent.id}-${part.id}`, observerId: agent.id, kind: "structure", subjectId: part.id, observedAt: state.tick,
      position: { x: part.position.x, z: part.position.z }, confidence: 0.9,
      facts: { structureKind: "physical_part", width: part.size.x, height: part.size.y, depth: part.size.z, elevation: part.position.y, rotation: part.rotation, condition: Math.round(part.condition*100), makerId: part.makerId, revision: part.revision,
        material: Object.entries(part.composition).sort((a,b)=>b[1]-a[1])[0][0], mass: Object.values(part.composition).reduce((a,b)=>a+b,0), hollow: part.hollow, storedWater: part.water,
        supported: part.supported,
        bindingIds: JSON.stringify(state.physical.joints.filter(j=>(j.a===part.id||j.b===part.id)&&j.condition>0).map(j=>j.id)) } });
  }
}

function learningValue(agent: SurvivalAgent, context: string): number {
  return agent.learning.find((item) => item.context === context)?.expectedUtility ?? 0;
}

function remember(
  state: SurvivalRunState,
  agent: SurvivalAgent,
  outcome: SurvivalActionOutcome,
): void {
  const result: AgentMemory["result"] = !outcome.success
    ? "failed"
    : outcome.utility > 1
      ? "helpful"
      : outcome.utility < -1
        ? "harmful"
        : "neutral";
  const memory: AgentMemory = {
    id: nextId(state, "memory"),
    recordedAt: state.tick,
    action: outcome.action,
    targetId: outcome.targetId,
    result,
    utility: outcome.utility,
    summary: outcome.summary,
  };
  state.stats.memories += 1;
  agent.memory.push(memory);
  if (agent.memory.length > MAX_MEMORIES) agent.memory.splice(0, agent.memory.length - MAX_MEMORIES);

  updateLearning(agent, `action:${outcome.action}`, outcome, state.tick);
  if (outcome.targetId) updateLearning(agent, `site:${outcome.targetId}:${outcome.action}`, outcome, state.tick);
}

function updateLearning(agent: SurvivalAgent, context: string, outcome: SurvivalActionOutcome, tick: number): void {
  const existing = agent.learning.find((item) => item.context === context);
  if (existing) {
    existing.attempts += 1;
    existing.successes = (existing.successes ?? existing.attempts - 1) + Number(outcome.success);
    existing.variance = rounded((existing.variance ?? 0) * 0.72 + (outcome.utility - existing.expectedUtility) ** 2 * 0.28);
    existing.expectedUtility = rounded(existing.expectedUtility * 0.72 + outcome.utility * 0.28);
    if (outcome.observedYield !== undefined) existing.expectedYield = rounded((existing.expectedYield ?? outcome.observedYield) * 0.6 + outcome.observedYield * 0.4);
    existing.updatedAt = tick;
  } else {
    const learning: AgentLearning = {
      context,
      attempts: 1,
      expectedUtility: rounded(outcome.utility),
      updatedAt: tick,
      successes: Number(outcome.success),
      variance: 0,
    };
    if (outcome.observedYield !== undefined) learning.expectedYield = outcome.observedYield;
    agent.learning.push(learning);
    if (agent.learning.length > MAX_LEARNING_CONTEXTS) {
      agent.learning.sort((left, right) => left.updatedAt - right.updatedAt);
      agent.learning.splice(0, agent.learning.length - MAX_LEARNING_CONTEXTS);
    }
  }
}

function recordOutcome(
  state: SurvivalRunState,
  agent: SurvivalAgent,
  action: SurvivalActionKind,
  targetId: string | null,
  success: boolean,
  utility: number,
  summary: string,
  emit = true,
  observedYield?: number,
  linkOwnDecision = true,
): SurvivalActionOutcome {
  const outcome: SurvivalActionOutcome = {
    tick: state.tick,
    action,
    targetId,
    success,
    utility: rounded(utility),
    summary,
  };
  if (linkOwnDecision && agent.currentDeliberation) outcome.decisionId = agent.currentDeliberation.id;
  if (observedYield !== undefined) outcome.observedYield = observedYield;
  agent.lastOutcome = outcome;
  remember(state, agent, outcome);
  if (agent.survivalRecord && linkOwnDecision) {
    const record = agent.survivalRecord;
    if (success && action === "drink") record.lastDrinkAt = state.tick;
    if (success && action === "eat") record.lastMealAt = state.tick;
    if (!success && action === "move") record.blockedMoves++;
    if (!success || action === "drink" || action === "eat") record.incidents = [...record.incidents,{tick:state.tick,action,success,summary}].slice(-24);
  }
  if (emit) {
    makeEvent(state, {
      type: "action_outcome",
      category: "survival",
      agentIds: [agent.id],
      summary,
      outcome: success ? "The attempted action completed." : "The attempted action did not complete.",
      position: agent.position,
      facts: { action, targetId, success, utility: rounded(utility), decisionId: outcome.decisionId ?? null, planId: agent.currentPlan?.id ?? null },
    });
  }
  return outcome;
}

function observationFor(agent: SurvivalAgent, subjectId: string | null): AgentObservation | null {
  if (subjectId === null) return null;
  return agent.observations.find((observation) => observation.subjectId === subjectId) ?? null;
}

function resourceObservations(
  agent: SurvivalAgent,
  kind?: SurvivalResourceKind,
): AgentObservation[] {
  return agent.observations
    .filter((observation) => (
      observation.kind === "resource"
      && observation.facts.researchEvidence !== true
      && (kind === undefined || observation.facts.resourceKind === kind)
      && Number(observation.facts.availableEstimate ?? 0) > 0
    ))
    .sort((left, right) => {
      const leftDistance = left.position ? distance(agent.position, left.position) : Number.POSITIVE_INFINITY;
      const rightDistance = right.position ? distance(agent.position, right.position) : Number.POSITIVE_INFINITY;
      return leftDistance - rightDistance || left.id.localeCompare(right.id);
    });
}

function observedAgent(agent: SurvivalAgent): AgentObservation[] {
  return agent.observations
    .filter((observation) => observation.kind === "agent" && observation.facts.alive === true)
    .sort((left, right) => left.subjectId.localeCompare(right.subjectId));
}

function canAfford(inventory: SurvivalInventory, inputs: Partial<SurvivalInventory>): boolean {
  return RESOURCE_KINDS.every((kind) => inventory[kind] >= (inputs[kind] ?? 0));
}

function observationIdsForResearch(agent: SurvivalAgent, definition: ResearchDefinition): string[] {
  const existingProject = agent.research.find(({ technologyId }) => technologyId === definition.id);
  if (existingProject?.attempts.length) {
    const retainedEvidenceIds = definition.requiredObservations.map((kind, index) => {
      const id = researchEvidenceObservationId(agent.id, existingProject.id, index);
      const observation = agent.observations.find((candidate) => candidate.id === id);
      return observation?.kind === "resource"
        && observation.facts.resourceKind === kind
        && observation.facts.researchEvidence === true
        ? id
        : null;
    });
    if (retainedEvidenceIds.every((id): id is string => id !== null)) return retainedEvidenceIds;
  }
  const ids: string[] = [];
  for (const kind of definition.requiredObservations) {
    const observation = researchMaterialEvidence(agent, kind);
    if (!observation) return [];
    ids.push(observation.id);
  }
  return ids;
}

function availableResearch(agent: SurvivalAgent): Array<{ definition: ResearchDefinition; observationIds: string[] }> {
  return RESEARCH_CATALOG
    .filter((definition) => !agent.technologies.includes(definition.id))
    .filter((definition) => definition.prerequisiteTechnologies.every((id) => agent.technologies.includes(id)))
    .filter((definition) => canAfford(agent.inventory, definition.inputs))
    .map((definition) => ({ definition, observationIds: observationIdsForResearch(agent, definition) }))
    .filter(({ observationIds, definition }) => observationIds.length === definition.requiredObservations.length);
}

function missingResearchMaterials(agent: SurvivalAgent): Set<SurvivalResourceKind> {
  const missing = new Set<SurvivalResourceKind>();
  for (const definition of RESEARCH_CATALOG) {
    if (agent.technologies.includes(definition.id)) continue;
    if (!definition.prerequisiteTechnologies.every((id) => agent.technologies.includes(id))) continue;
    const observedKinds = new Set(resourceObservations(agent).map((observation) => observation.facts.resourceKind));
    if (!definition.requiredObservations.every((kind) => observedKinds.has(kind))) continue;
    for (const kind of RESOURCE_KINDS) {
      if (agent.inventory[kind] < (definition.inputs[kind] ?? 0)) missing.add(kind);
    }
  }
  return missing;
}

function nearestKnownStructure(agent: SurvivalAgent, kind: SurvivalStructure["kind"]): AgentObservation | null {
  return agent.observations
    .filter((observation) => observation.kind === "structure" && observation.facts.structureKind === kind)
    .sort((left, right) => {
      const leftDistance = left.position ? distance(agent.position, left.position) : Number.POSITIVE_INFINITY;
      const rightDistance = right.position ? distance(agent.position, right.position) : Number.POSITIVE_INFINITY;
      return leftDistance - rightDistance || left.id.localeCompare(right.id);
    })[0] ?? null;
}

function draftCandidates(state: SurvivalRunState, agent: SurvivalAgent): CandidateDraft[] {
  const drafts: CandidateDraft[] = [];
  const hydrationUrgency = 100 - agent.needs.hydration;
  const nutritionUrgency = 100 - agent.needs.nutrition;
  const energyUrgency = 100 - agent.needs.energy;
  const warmthUrgency = 100 - agent.needs.warmth;
  const safetyUrgency = 100 - agent.needs.safety;
  const knownWater = resourceObservations(agent, "freshwater")[0];
  const knownFood = resourceObservations(agent, "food")[0];

  if (agent.inventory.freshwater >= 1 || knownWater) {
    drafts.push({
      goal: "secure_water",
      targetId: agent.inventory.freshwater >= 1 ? null : knownWater?.subjectId ?? null,
      baseScore: 28 + hydrationUrgency * 1.12,
      expectedBenefit: Math.min(42, hydrationUrgency),
      risk: knownWater?.facts.contaminated === true ? 16 : 2,
      knownObservationIds: knownWater ? [knownWater.id] : [],
      summary: agent.inventory.freshwater >= 1
        ? "Stored water can address falling hydration."
        : "Observed fresh water can address falling hydration.",
    });
  }
  if (agent.inventory.food >= 1 || knownFood) {
    drafts.push({
      goal: "secure_food",
      targetId: agent.inventory.food >= 1 ? null : knownFood?.subjectId ?? null,
      baseScore: 20 + nutritionUrgency * 0.94,
      expectedBenefit: Math.min(34, nutritionUrgency),
      risk: 2,
      knownObservationIds: knownFood ? [knownFood.id] : [],
      summary: agent.inventory.food >= 1
        ? "Stored food can address falling nutrition."
        : "Observed food can address falling nutrition.",
    });
  }
  if (agent.needs.energy < 82) {
    drafts.push({
      goal: "recover",
      targetId: null,
      baseScore: 12 + energyUrgency * 0.78,
      expectedBenefit: Math.min(35, energyUrgency),
      risk: agent.needs.safety < 35 ? 14 : 4,
      knownObservationIds: [],
      summary: "Rest could restore energy, balanced against current exposure.",
    });
  }
  if (agent.needs.warmth < 72) {
    const shelter = nearestKnownStructure(agent, "shelter");
    drafts.push({
      goal: "stay_warm",
      targetId: shelter?.subjectId ?? null,
      baseScore: 10 + warmthUrgency * 0.86,
      expectedBenefit: Math.min(38, warmthUrgency),
      risk: state.environment.temperatureC < 3 ? 15 : 5,
      knownObservationIds: shelter ? [shelter.id] : [`obs-${agent.id}-weather`],
      summary: shelter
        ? "An observed shelter may reduce cold exposure."
        : "Current temperature makes conserving warmth useful.",
    });
  }
  if (agent.needs.safety < 68) {
    const shelter = nearestKnownStructure(agent, "shelter");
    drafts.push({
      goal: "seek_safety",
      targetId: shelter?.subjectId ?? null,
      baseScore: 10 + safetyUrgency * 0.76,
      expectedBenefit: Math.min(32, safetyUrgency),
      risk: state.environment.weather === "storm" ? 16 : 5,
      knownObservationIds: shelter ? [shelter.id] : [`obs-${agent.id}-weather`],
      summary: shelter ? "An observed shelter offers protection." : "Exposure and conditions reduce current safety.",
    });
  }

  const missing = missingResearchMaterials(agent);
  const priorities: Partial<Record<SurvivalResourceKind, number>> = {
    wood: agent.inventory.wood < 5 ? 13 : 0,
    stone: agent.inventory.stone < 3 ? 10 : 0,
    fiber: agent.inventory.fiber < 3 ? 12 : 0,
    herbs: agent.inventory.herbs < 2 ? 7 : 0,
    clay: agent.inventory.clay < 2 ? 6 : 0,
  };
  for (const kind of ["wood", "stone", "fiber", "herbs", "clay"] as const) {
    const observation = resourceObservations(agent, kind)[0];
    if (!observation) continue;
    const researchBonus = missing.has(kind) ? 13 : 0;
    drafts.push({
      goal: "gather_material",
      targetId: observation.subjectId,
      baseScore: 13 + (priorities[kind] ?? 0) + researchBonus,
      expectedBenefit: 10 + researchBonus,
      risk: 3,
      knownObservationIds: [observation.id],
      summary: `Observed ${kind} could support shelter, tools, or material tests.`,
    });
  }

  const hasNearbyShelter = state.environment.structures.some(
    (structure) => structure.kind === "shelter" && distance(agent.position, structure.position) < 10,
  );
  const shelterFiberCost = agent.technologies.includes("twisted_cordage") ? 1 : 2;
  if (!hasNearbyShelter && agent.inventory.wood >= 4 && agent.inventory.fiber >= shelterFiberCost) {
    drafts.push({
      goal: "build_shelter",
      targetId: null,
      baseScore: 31 + safetyUrgency * 0.24 + warmthUrgency * 0.24,
      expectedBenefit: 34,
      risk: 6,
      knownObservationIds: [],
      summary: "Carried wood and fiber are sufficient to attempt a shelter.",
    });
  }

  if (Math.min(...Object.values(agent.needs)) > 38) {
    for (const { definition, observationIds } of availableResearch(agent)) {
      const priorProject = agent.research.find(
        (project) => project.technologyId === definition.id && project.status === "testing",
      );
      drafts.push({
        goal: "research",
        targetId: definition.id,
        baseScore: 32 + (priorProject?.successfulTrials ?? 0) * 12,
        expectedBenefit: 28 + (priorProject?.successfulTrials ?? 0) * 8,
        risk: 8 + definition.difficulty * 8,
        knownObservationIds: observationIds,
        summary: priorProject
          ? `Another material test could check whether ${priorProject.hypothesis.toLowerCase()}`
          : definition.hypothesisTemplate,
      });
    }
  }

  const others = observedAgent(agent);
  for (const observation of others) {
    const otherHydration = Number(observation.facts.hydrationEstimate ?? 100);
    const otherNutrition = Number(observation.facts.nutritionEstimate ?? 100);
    if ((agent.inventory.freshwater >= 2 && otherHydration < 55) || (agent.inventory.food >= 2 && otherNutrition < 55)) {
      drafts.push({
        goal: "share",
        targetId: observation.subjectId,
        baseScore: 22 + (100 - Math.min(otherHydration, otherNutrition)) * 0.2,
        expectedBenefit: 18,
        risk: 7,
        knownObservationIds: [observation.id],
        summary: "An observed nearby agent appears to need a resource this agent can spare.",
      });
    }
    if ((agent.needs.hydration < 42 && agent.inventory.freshwater < 1) || (agent.needs.nutrition < 38 && agent.inventory.food < 1)) {
      drafts.push({
        goal: "request_help",
        targetId: observation.subjectId,
        baseScore: 25 + Math.max(hydrationUrgency, nutritionUrgency) * 0.62,
        expectedBenefit: 25,
        risk: 12,
        knownObservationIds: [observation.id],
        summary: "Requesting help is an available response to an unmet survival need.",
      });
    }
    const priorInteraction = agent.relationships.find(({ agentId }) => agentId === observation.subjectId)?.lastInteractionAt ?? -100;
    if (agent.needs.energy > 62 && agent.needs.safety > 52 && state.tick - priorInteraction > 12) {
      drafts.push({
        goal: "cooperate",
        targetId: observation.subjectId,
        baseScore: 41 + Math.max(0, learningValue(agent, "action:cooperate")) * 0.4,
        expectedBenefit: 16,
        risk: 9,
        knownObservationIds: [observation.id],
        summary: "A nearby agent makes a voluntary exchange of observations possible.",
      });
    }
  }

  const resourceKnowledge = agent.observations.filter(({ kind }) => kind === "resource").length;
  drafts.push({
    goal: "explore",
    targetId: null,
    baseScore: 18 + Math.max(0, 12 - resourceKnowledge) * 1.25,
    expectedBenefit: 17,
    risk: state.environment.weather === "storm" ? 20 : 8,
    knownObservationIds: [`obs-${agent.id}-weather`],
    summary: "Unobserved terrain may contain resources or safer locations.",
  });
  drafts.push({
    goal: "wait",
    targetId: null,
    baseScore: 4,
    expectedBenefit: 2,
    risk: 2,
    knownObservationIds: [],
    summary: "Waiting briefly preserves effort but does not address a specific need.",
  });
  return drafts;
}

function scoreCandidate(state: SurvivalRunState, agent: SurvivalAgent, draft: CandidateDraft): AgentDecisionCandidate {
  const learned = learningValue(agent, `goal:${draft.goal}`) + learningValue(agent, `action:${actionForGoal(draft.goal)}`) * 0.35;
  const explorationNoise = survivalBetween(
    state.seed,
    -5.5,
    5.5,
    "candidate",
    state.tick,
    agent.id,
    draft.goal,
    draft.targetId ?? "none",
  );
  return {
    goal: draft.goal,
    targetId: draft.targetId,
    score: rounded(draft.baseScore + learned * 0.4 + explorationNoise - draft.risk * 0.22),
    expectedBenefit: rounded(draft.expectedBenefit),
    risk: rounded(draft.risk),
    knownObservationIds: [...new Set(draft.knownObservationIds)].filter((id) => agent.observations.some((item) => item.id === id)),
    summary: draft.summary,
  };
}

function actionForGoal(goal: AgentGoalKind): SurvivalActionKind {
  const actions: Record<AgentGoalKind, SurvivalActionKind> = {
    secure_water: "drink",
    secure_food: "eat",
    recover: "rest",
    stay_warm: "warm",
    seek_safety: "shelter",
    explore: "explore",
    gather_material: "gather",
    build_shelter: "build",
    research: "test_hypothesis",
    share: "share",
    request_help: "request",
    cooperate: "cooperate",
    wait: "wait",
  };
  return actions[goal];
}

function destinationForTarget(agent: SurvivalAgent, targetId: string | null): SurvivalPosition | null {
  const observation = observationFor(agent, targetId);
  return observation?.position ? { ...observation.position } : null;
}

function newStep(
  state: SurvivalRunState,
  action: SurvivalActionKind,
  targetId: string | null,
  destination: SurvivalPosition | null,
  remainingSteps = 1,
): SurvivalPlanStep {
  const id = nextId(state, "step");
  state.stats.planSteps += 1;
  return {
    id,
    action,
    targetId,
    destination,
    remainingSteps,
    status: "pending",
  };
}

function planForDecision(
  state: SurvivalRunState,
  agent: SurvivalAgent,
  selected: AgentDecisionCandidate,
  recordedIntent: string,
): SurvivalPlan {
  const targetPosition = destinationForTarget(agent, selected.targetId);
  const steps: SurvivalPlanStep[] = [];
  const addMoveIfNeeded = () => {
    if (selected.targetId && targetPosition && distance(agent.position, targetPosition) > 3) {
      steps.push(newStep(state, "move", selected.targetId, targetPosition));
    }
  };
  if (selected.goal === "secure_water") {
    if (agent.inventory.freshwater < 1) {
      addMoveIfNeeded();
      steps.push(newStep(state, "collect", selected.targetId, targetPosition));
    }
    steps.push(newStep(state, "drink", null, null));
  } else if (selected.goal === "secure_food") {
    if (agent.inventory.food < 1) {
      addMoveIfNeeded();
      steps.push(newStep(state, "collect", selected.targetId, targetPosition));
    }
    steps.push(newStep(state, "eat", null, null));
  } else if (selected.goal === "recover") {
    steps.push(newStep(state, "rest", null, null, 2));
  } else if (selected.goal === "stay_warm") {
    addMoveIfNeeded();
    steps.push(newStep(state, selected.targetId ? "shelter" : "warm", selected.targetId, targetPosition));
  } else if (selected.goal === "seek_safety") {
    addMoveIfNeeded();
    steps.push(newStep(state, "shelter", selected.targetId, targetPosition));
  } else if (selected.goal === "explore") {
    const angle = survivalBetween(state.seed, 0, Math.PI * 2, "explore-angle", agent.id, state.tick);
    const length = survivalBetween(state.seed, 18, 38, "explore-distance", agent.id, state.tick);
    const destination = {
      x: clamp(agent.position.x + Math.cos(angle) * length, state.environment.bounds.minX, state.environment.bounds.maxX),
      z: clamp(agent.position.z + Math.sin(angle) * length, state.environment.bounds.minZ, state.environment.bounds.maxZ),
    };
    steps.push(newStep(state, "move", null, destination));
    steps.push(newStep(state, "explore", null, destination));
  } else if (selected.goal === "gather_material") {
    addMoveIfNeeded();
    steps.push(newStep(state, "gather", selected.targetId, targetPosition));
  } else if (selected.goal === "build_shelter") {
    steps.push(newStep(state, "build", null, { ...agent.position }, 2));
  } else if (selected.goal === "research") {
    steps.push(newStep(state, "prepare_experiment", selected.targetId, null));
    steps.push(newStep(state, "test_hypothesis", selected.targetId, null));
    steps.push(newStep(state, "review_evidence", selected.targetId, null));
  } else if (selected.goal === "share" || selected.goal === "request_help" || selected.goal === "cooperate") {
    addMoveIfNeeded();
    steps.push(newStep(state, actionForGoal(selected.goal), selected.targetId, targetPosition));
  } else {
    steps.push(newStep(state, "wait", null, null));
  }
  return {
    id: nextId(state, "plan"),
    formedAt: state.tick,
    goal: selected.goal,
    targetId: selected.targetId,
    targetPosition,
    status: "active",
    rationale: recordedIntent,
    activeStepIndex: 0,
    steps,
  };
}

function deliberate(state: SurvivalRunState, agent: SurvivalAgent): void {
  if (state.policyVersion === 2 || state.policyVersion === 3 || state.policyVersion === 4) {
    // Observer-only telemetry is deliberately absent from all policy inputs.
    const policyAgent = { ...agent }; delete policyAgent.survivalRecord;
    const input = state.policyVersion === 4 ? discoveryInput(agent, state.tick, state.environment.bounds) : { agent: policyAgent, tick: state.tick, seed: state.seed, bounds: state.environment.bounds };
    const previousDiscoveryDecision = agent.discovery?.decisions.at(-1)?.id;
    const priorNotes=new Set(agent.physicalMind?.projects.flatMap(p=>(p.history??[]).map(h=>`${p.id}:${h.tick}:${h.summary}`))??[]);
    if (state.policyVersion === 3) preparePhysicalProjects(input);
    const choices = state.policyVersion === 4 ? prepareDiscovery(input) : state.policyVersion === 3 ? planPhysicalKnowledge(input) : planFromPrivateKnowledge(input);
    if (state.policyVersion === 4) {
      // Only explicit private planner outputs are committed. No mutable reference
      // to the world, inventories, other minds or observer records entered policy.
      agent.discovery = input.agent.discovery; agent.physicalMind = input.agent.physicalMind;
      const observations=new Set(agent.observations.map(o=>o.id));for(const choice of choices)choice.candidate.knownObservationIds=choice.candidate.knownObservationIds.filter(id=>observations.has(id));
      const record = agent.discovery?.decisions.at(-1);
      if (record && record.id !== previousDiscoveryDecision) makeEvent(state, { type: "decision_recorded", category: "research", agentIds: [agent.id], summary: `${agent.label} compared protection alternatives.`, outcome: record.reason, position: agent.position,
        facts: { operation: "discovery_comparison", discoveryDecisionId: record.id, goalId: record.goalId, projectId: agent.discovery?.active?.projectId ?? null,
          selectedAlternative: record.selectedId, candidateSummary: JSON.stringify(record), truncatedCandidates: record.omitted, scoreMeaning: "Estimated survival value; uncertainty is not a probability." } });
    }
    for(const project of agent.physicalMind?.projects??[])for(const note of project.history??[]){
      if(priorNotes.has(`${project.id}:${note.tick}:${note.summary}`))continue;
      makeEvent(state,{type:"action_outcome",category:"environment",agentIds:[agent.id],summary:`${agent.label}'s project was ${note.kind}.`,outcome:note.summary,position:project.position,facts:{operation:"project_update",projectId:project.id,projectStatus:project.status}});
    }
    const chosen = choices[0];
    if (chosen) {
      const decisionId = nextId(state, "decision");
      const evidence = agent.observations.filter(o => chosen.candidate.knownObservationIds.includes(o.id)).map(o => structuredClone(o));
      agent.currentDeliberation = {
        ...(state.physical?{physicalEvidenceSnapshot:structuredClone(agent.physicalMind?.readings.slice(-8)??[])}:{}),
        id: decisionId, decidedAt: state.tick, selectedGoal: chosen.candidate.goal,
        policyVersion: state.policyVersion, candidates: choices.map(c => c.candidate), knownObservationIds: chosen.candidate.knownObservationIds,
        uncertainty: chosen.uncertainty, recordedIntent: chosen.candidate.summary, evidenceSnapshot: evidence,
      };
      agent.currentPlan = {
        ...(state.policyVersion === 4 && chosen.projectId ? { discoveryProjectId: chosen.projectId } : {}),
        id: nextId(state, "plan"), decisionId, initialNeeds: { ...agent.needs }, initialInventory: { ...agent.inventory }, formedAt: state.tick,
        goal: chosen.candidate.goal, targetId: chosen.candidate.targetId,
        targetPosition: destinationForTarget(agent, chosen.candidate.targetId), status: "active", rationale: chosen.candidate.summary,
        activeStepIndex: 0, steps: chosen.actions.map(action => {
          const step = newStep(state, action.action, action.targetId, action.destination, action.action === "move" ? 1 : action.duration);
          if (action.resource) { step.resource = action.resource; step.amount = action.amount ?? 1; }
          if (action.experimentDose !== undefined) step.experimentDose = action.experimentDose;
          if (action.manipulation) step.manipulation = structuredClone(action.manipulation);
          if (state.policyVersion===4 && action.arrivalRadius!==undefined) step.arrivalRadius=action.arrivalRadius;
          return step;
        }),
      };
      const first = agent.currentPlan.steps[0];
      agent.currentAction = { kind: first.action, targetId: first.targetId, status: "awaiting_decision", startedAt: state.tick, updatedAt: state.tick };
      state.stats.decisions++;
      makeEvent(state, { type: "decision_recorded", category: "agent", agentIds: [agent.id],
        summary: `${agent.label} chose ${chosen.actions.map(a => a.manipulation?.kind??a.action).join(" → ")}.`, outcome: chosen.candidate.summary, position: agent.position,
        facts: { decisionId, planId: agent.currentPlan.id, goal: chosen.candidate.goal, score: chosen.candidate.score, projectId:chosen.projectId??null,
          scoreMeaning: "survival potential, not a probability", predictedSteps: chosen.candidate.predictedSteps ?? 1,
          evidence: JSON.stringify(evidence), alternatives: JSON.stringify(choices.slice(1, 4).map(c => c.candidate)) },
      });
      return;
    }
  }
  const candidates = draftCandidates(state, agent)
    .map((draft) => scoreCandidate(state, agent, draft))
    .sort((left, right) => right.score - left.score || left.goal.localeCompare(right.goal) || (left.targetId ?? "").localeCompare(right.targetId ?? ""))
    .slice(0, 8);
  const selected = candidates[0];
  const margin = selected.score - (candidates[1]?.score ?? selected.score);
  const recordedIntent = `${selected.summary} It scored ${selected.score.toFixed(1)} after expected benefit, risk, learned outcomes, and bounded exploration were compared.`;
  const deliberation: AgentDeliberation = {
    id: nextId(state, "decision"),
    decidedAt: state.tick,
    selectedGoal: selected.goal,
    candidates,
    knownObservationIds: [...selected.knownObservationIds],
    uncertainty: rounded(clamp(70 - margin * 4) / 100, 3),
    recordedIntent,
  };
  agent.currentDeliberation = deliberation;
  agent.currentPlan = planForDecision(state, agent, selected, recordedIntent);
  agent.currentAction = {
    kind: agent.currentPlan.steps[0]?.action ?? "wait",
    status: "awaiting_decision",
    targetId: agent.currentPlan.steps[0]?.targetId ?? null,
    startedAt: state.tick,
    updatedAt: state.tick,
  };
  state.stats.decisions += 1;
  makeEvent(state, {
    type: "decision_recorded",
    category: "agent",
    agentIds: [agent.id],
    summary: `${agent.label} recorded an intent to ${selected.goal.replaceAll("_", " ")}.`,
    outcome: recordedIntent,
    position: agent.position,
    facts: {
      goal: selected.goal,
      score: selected.score,
      uncertainty: deliberation.uncertainty,
      citedObservationCount: selected.knownObservationIds.length,
    },
  });
}

function shouldAbandonForUrgency(agent: SurvivalAgent, tick: number, bounds: SurvivalEnvironment["bounds"]): boolean {
  return planNeedsRepair(agent,tick,bounds);
}

function setCurrentAction(
  state: SurvivalRunState,
  agent: SurvivalAgent,
  step: SurvivalPlanStep,
): void {
  const status: SurvivalCurrentAction["status"] = step.action === "move"
    ? "moving"
    : step.action === "rest"
      ? "resting"
      : "acting";
  const continuing = agent.currentAction.kind === step.action
    && agent.currentAction.targetId === step.targetId
    && agent.currentAction.status === status;
  agent.currentAction = {
    kind: step.action,
    status,
    targetId: step.targetId,
    startedAt: continuing ? agent.currentAction.startedAt : state.tick,
    updatedAt: state.tick,
  };
}

function finishStep(
  state: SurvivalRunState,
  agent: SurvivalAgent,
  step: SurvivalPlanStep,
  success: boolean,
): void {
  const plan = agent.currentPlan;
  if (!plan) return;
  step.status = success ? "complete" : "failed";
  if (!success) {
    plan.status = "failed";
    if (plan.initialNeeds && plan.initialInventory) updateLearning(agent, `goal:${plan.goal}`, { tick: state.tick, action: step.action, targetId: plan.targetId, success: false, utility: survivalPotential(agent.needs, agent.inventory) - survivalPotential(plan.initialNeeds, plan.initialInventory), summary: "Measured consequence of a failed plan." }, state.tick);
    agent.currentAction = {
      kind: step.action,
      status: "blocked",
      targetId: step.targetId,
      startedAt: agent.currentAction.startedAt,
      updatedAt: state.tick,
    };
    return;
  }
  plan.activeStepIndex += 1;
  if (plan.activeStepIndex >= plan.steps.length) {
    plan.status = "complete";
    if (plan.initialNeeds) updateLearning(agent, `goal:${plan.goal}`, {
      tick: state.tick, action: step.action, targetId: plan.targetId, success: true,
      utility: survivalPotential(agent.needs, agent.inventory) - survivalPotential(plan.initialNeeds, plan.initialInventory ?? agent.inventory),
      summary: "Observed survival condition change across the completed plan.",
    }, state.tick);
    agent.currentAction = {
      kind: step.action,
      status: "complete",
      targetId: step.targetId,
      startedAt: agent.currentAction.startedAt,
      updatedAt: state.tick,
    };
    return;
  }
  const next = plan.steps[plan.activeStepIndex];
  agent.currentAction = {
    kind: next.action,
    status: "awaiting_decision",
    targetId: next.targetId,
    startedAt: state.tick,
    updatedAt: state.tick,
  };
}

function moveToward(state: SurvivalRunState, agent: SurvivalAgent, step: SurvivalPlanStep): void {
  const destination = step.destination;
  if (!destination) {
    recordOutcome(state, agent, "move", step.targetId, false, -4, "Movement stopped because its observed destination was unavailable.");
    finishStep(state, agent, step, false);
    return;
  }
  step.destination = { ...destination };
  const remaining = distance(agent.position, destination);
  const arrivalRadius=state.policyVersion===4 ? step.arrivalRadius??MOVEMENT_ARRIVAL_RADIUS : MOVEMENT_ARRIVAL_RADIUS;
  const water = freshwaterFeatures(state.environment);
  const arrived = () => distance(agent.position, destination) <= arrivalRadius
    && (depthAt(water, destination) > 0 || depthAt(water, agent.position) === 0);
  if (remaining <= arrivalRadius && arrived()) {
    finishStep(state, agent, step, true);
    return;
  }
  const nav = agent.navigation ??= freshNavigation();
  nav.blocked = nav.blocked.filter(b=>state.tick-b.tick<36);
  const changed = !nav.destination || distance(nav.destination,destination)>0.1;
  const repeated = nav.recent.filter(r=>distance(r.position,agent.position)<0.2).length >= 3;
  if (changed) { nav.destination={...destination}; nav.waypoints=[]; nav.recent=[]; nav.failures=0; }
  if (repeated) { nav.waypoints=[]; nav.recent=[]; }
  if (!nav.waypoints.length || !privateSegmentClear(agent.observations,state.environment.bounds,agent.position,nav.waypoints[0],nav.blocked)) {
    nav.waypoints=findPrivateRoute(agent.observations,state.environment.bounds,agent.position,destination,nav.blocked)??[];
  }
  const waypoint=nav.waypoints[0];
  const position=waypoint ? physicalNextPosition(state.environment,state.physical,agent.position,waypoint,{strict:true,onBlocked:contact=>{
    const b=state.environment.bounds;
    nav.blocked=[...nav.blocked,{tick:state.tick,from:{...agent.position},to:{x:Math.max(b.minX,Math.min(b.maxX,contact.x)),z:Math.max(b.minZ,Math.min(b.maxZ,contact.z))}}].slice(-24);
  }}) : null;
  agent.needs.energy = rounded(clamp(agent.needs.energy - 0.34));
  if(!position){nav.waypoints=[];nav.failures++;nav.retryAt=state.tick+Math.min(36,nav.failures*3);recordOutcome(state,agent,"move",step.targetId,false,-0.34,"Movement was blocked; recorded local route evidence and reconsidered the approach.");finishStep(state,agent,step,false);return;}
  agent.position={x:rounded(position.x,3)||0,z:rounded(position.z,3)||0};
  nav.recent=[...nav.recent,{tick:state.tick,position:{...agent.position}}].slice(-12);
  if(waypoint&&distance(agent.position,waypoint)<0.05)nav.waypoints.shift();
  if (arrived()) {nav.waypoints=[];nav.failures=0;finishStep(state, agent, step, true);}
}

function consumeMaterial(agent: SurvivalAgent, kind: SurvivalResourceKind, amount: number): void {
  agent.inventory[kind] = rounded(agent.inventory[kind] - amount, kind === "stone" && agent.rawFeedstocks ? 6 : 2);
  if (agent.inventory[kind] <= 0 && agent.materialSamples) delete agent.materialSamples[kind];
}

function receiveMaterial(agent: SurvivalAgent, kind: SurvivalResourceKind, amount: number, sample?: NonNullable<SurvivalAgent["materialSamples"]>[SurvivalResourceKind]): void {
  const existing = agent.materialSamples?.[kind];
  const unmixed = agent.inventory[kind] === 0 || (sample && existing && existing.sourceId === sample.sourceId && existing.contamination === sample.contamination && existing.activity === sample.activity);
  // Physical shaping retains fractional rock; subsequent collection must not
  // truncate that mass or diverge from embedded feedstock provenance.
  agent.inventory[kind] = rounded(agent.inventory[kind] + amount, kind === "stone" && agent.rawFeedstocks ? 6 : 2);
  agent.materialSamples ??= {};
  // Aggregate stores cannot establish which mixed batch was used in a test.
  if (sample && unmixed) agent.materialSamples[kind] = { ...sample };
  else delete agent.materialSamples[kind];
}

function gatherFromSite(
  state: SurvivalRunState,
  agent: SurvivalAgent,
  step: SurvivalPlanStep,
): void {
  const site = state.environment.resources.find(({ id }) => id === step.targetId);
  const accessPosition = site?.kind === "freshwater" ? freshwaterShorePosition(site) : site?.position;
  const inReach = site && (site.kind === "freshwater" ? canCollectFreshwater(freshwaterFootprint(site),agent.position) : accessPosition && distance(agent.position,accessPosition)<=4.5);
  if (!site || !inReach || site.quantity < 0.25) {
    recordOutcome(state, agent, step.action, step.targetId, false, -5, "The observed resource could not be gathered at this location.");
    finishStep(state, agent, step, false);
    return;
  }
  const vesselBonus = site.kind === "freshwater" && agent.technologies.includes("fired_vessel") ? 0.75 : 0;
  const edgeBonus = site.kind !== "freshwater"
    && site.kind !== "stone"
    && site.kind !== "clay"
    && agent.technologies.includes("knapped_edge")
    ? 1.18
    : 1;
  const amount = rounded(Math.min(site.quantity, (site.kind === "freshwater" ? 2 + vesselBonus : 1.5) * edgeBonus), 2);
  site.quantity = rounded(Math.max(0, site.quantity - amount), 3);
  const boiled = site.contaminated && site.kind === "freshwater" && agent.technologies.includes("water_boiling") && agent.inventory.wood >= 0.25;
  receiveMaterial(agent, site.kind, amount, { sourceId: site.id, sampledAt: state.tick, contamination: site.kind === "freshwater" ? site.contaminated && !boiled ? 0.8 : 0 : null, activity: site.kind === "herbs" ? 0.8 : null });
  if (site.feedstock && agent.rawFeedstocks) agent.rawFeedstocks[site.feedstock] = rounded((agent.rawFeedstocks[site.feedstock] ?? 0) + amount, 6);
  if (site.contaminated && site.kind === "freshwater") {
    if (agent.technologies.includes("water_boiling") && agent.inventory.wood >= 0.25) {
      consumeMaterial(agent, "wood", 0.25);
    } else {
      agent.needs.health = rounded(clamp(agent.needs.health - 1.5));
    }
  }
  recordOutcome(
    state,
    agent,
    step.action,
    site.id,
    true,
    site.kind === "freshwater" || site.kind === "food" ? 8 : 4,
    `${agent.label} gathered ${amount} ${site.kind}.`,
    true,
    amount,
  );
  finishStep(state, agent, step, true);
}

function consumeWater(state: SurvivalRunState, agent: SurvivalAgent, step: SurvivalPlanStep): void {
  if (agent.inventory.freshwater < 1) {
    recordOutcome(state, agent, "drink", null, false, -7, "No carried water was available to drink.");
    finishStep(state, agent, step, false);
    return;
  }
  consumeMaterial(agent, "freshwater", 1);
  const gain = Math.min(34, 100 - agent.needs.hydration);
  agent.needs.hydration = rounded(clamp(agent.needs.hydration + 34));
  recordOutcome(state, agent, "drink", null, true, gain, `${agent.label} drank carried water; hydration increased.`);
  finishStep(state, agent, step, true);
}

function consumeFood(state: SurvivalRunState, agent: SurvivalAgent, step: SurvivalPlanStep): void {
  if (agent.inventory.food < 1) {
    recordOutcome(state, agent, "eat", null, false, -6, "No carried food was available to eat.");
    finishStep(state, agent, step, false);
    return;
  }
  consumeMaterial(agent, "food", 1);
  const restoredNutrition = agent.technologies.includes("food_smoking") ? 32 : 27;
  const gain = Math.min(restoredNutrition, 100 - agent.needs.nutrition);
  agent.needs.nutrition = rounded(clamp(agent.needs.nutrition + restoredNutrition));
  recordOutcome(state, agent, "eat", null, true, gain, `${agent.label} ate carried food; nutrition increased.`);
  finishStep(state, agent, step, true);
}

function shelterAgent(state: SurvivalRunState, agent: SurvivalAgent, step: SurvivalPlanStep): void {
  if (state.physical) {
    const protection = protectionAt(state.physical, agent.position, state.environment.weather);
    agent.needs.warmth = rounded(clamp(agent.needs.warmth + 2 + protection*3));
    agent.needs.safety = rounded(clamp(agent.needs.safety + protection*2));
    recordOutcome(state,agent,"shelter",step.targetId,true,protection,`Conserved warmth in place; nearby parts blocked ${Math.round(protection*100)}% of modeled exposure.`);
    finishStep(state,agent,step,true);return;
  }
  const shelter = step.targetId
    ? state.environment.structures.find(({ id, kind }) => id === step.targetId && kind === "shelter")
    : state.environment.structures
      .filter(({ kind }) => kind === "shelter")
      .sort((left, right) => distance(agent.position, left.position) - distance(agent.position, right.position))[0];
  const protectedHere = shelter && distance(agent.position, shelter.position) <= 6;
  const warmthGain = protectedHere ? 18 : 5;
  const safetyGain = protectedHere ? 16 : 4;
  agent.needs.warmth = rounded(clamp(agent.needs.warmth + warmthGain));
  agent.needs.safety = rounded(clamp(agent.needs.safety + safetyGain));
  recordOutcome(
    state,
    agent,
    "shelter",
    shelter?.id ?? null,
    Boolean(protectedHere),
    protectedHere ? 12 : 2,
    protectedHere ? `${agent.label} used an observed shelter.` : `${agent.label} reduced exposure without a built shelter.`,
  );
  finishStep(state, agent, step, true);
}

function warmAgent(state: SurvivalRunState, agent: SurvivalAgent, step: SurvivalPlanStep): void {
  const canMakeFire = agent.technologies.includes("controlled_fire") && agent.inventory.wood >= 1;
  if (canMakeFire) {
    consumeMaterial(agent, "wood", 1);
    const nearbyFire = state.environment.structures.find(
      ({ kind, position }) => kind === "fire" && distance(position, agent.position) < 5,
    );
    if (!nearbyFire) {
      state.environment.structures.push({
        id: nextId(state, "structure"),
        kind: "fire",
        position: { ...agent.position },
        builtAt: state.tick,
        builderIds: [agent.id],
        condition: 100,
        stored: emptyInventory(),
      });
    }
  }
  const gain = canMakeFire ? 29 : state.environment.daylight > 0.35 ? 9 : 3;
  agent.needs.warmth = rounded(clamp(agent.needs.warmth + gain));
  recordOutcome(state, agent, "warm", null, true, gain, canMakeFire
    ? `${agent.label} used learned firemaking to restore warmth.`
    : `${agent.label} conserved warmth using the available conditions.`);
  finishStep(state, agent, step, true);
}

function buildShelter(state: SurvivalRunState, agent: SurvivalAgent, step: SurvivalPlanStep): void {
  agent.needs.energy = rounded(clamp(agent.needs.energy - 1.2));
  step.remainingSteps -= 1;
  if (step.remainingSteps > 0) return;
  const fiberCost = agent.technologies.includes("twisted_cordage") ? 1 : 2;
  if (agent.inventory.wood < 4 || agent.inventory.fiber < fiberCost) {
    recordOutcome(state, agent, "build", null, false, -8, "The shelter attempt stopped because required materials were unavailable.");
    finishStep(state, agent, step, false);
    return;
  }
  consumeMaterial(agent, "wood", 4);
  consumeMaterial(agent, "fiber", fiberCost);
  const structure: SurvivalStructure = {
    id: nextId(state, "structure"),
    kind: "shelter",
    position: { ...agent.position },
    builtAt: state.tick,
    builderIds: [agent.id],
    condition: 100,
    stored: emptyInventory(),
  };
  state.environment.structures.push(structure);
  agent.needs.safety = rounded(clamp(agent.needs.safety + 18));
  agent.needs.warmth = rounded(clamp(agent.needs.warmth + 12));
  makeEvent(state, {
    type: "structure_built",
    category: "survival",
    agentIds: [agent.id],
    summary: `${agent.label} completed a shelter.`,
    outcome: "The structure now exists in the shared environment.",
    position: structure.position,
    facts: { structureId: structure.id, structureKind: structure.kind },
  });
  recordOutcome(state, agent, "build", structure.id, true, 24, `${agent.label} turned carried materials into a shelter.`, false);
  finishStep(state, agent, step, true);
}

function researchDefinition(id: string | null): ResearchDefinition | null {
  return RESEARCH_CATALOG.find((definition) => definition.id === id) ?? null;
}

function consumeInputs(agent: SurvivalAgent, inputs: Partial<SurvivalInventory>): void {
  for (const kind of RESOURCE_KINDS) {
    consumeMaterial(agent, kind, inputs[kind] ?? 0);
  }
}

function getOrCreateProject(
  state: SurvivalRunState,
  agent: SurvivalAgent,
  definition: ResearchDefinition,
): AgentResearchProject {
  const existing = agent.research.find(
    (project) => project.technologyId === definition.id && project.status === "testing",
  );
  if (existing) return existing;
  const project: AgentResearchProject = {
    id: nextId(state, "project"),
    technologyId: definition.id,
    hypothesis: definition.hypothesisTemplate,
    startedAt: state.tick,
    status: "testing",
    attempts: [],
    successfulTrials: 0,
    requiredSuccessfulTrials: definition.requiredSuccessfulTrials,
    confidence: 0,
    discoveredAt: null,
  };
  agent.research.push(project);
  return project;
}

function conductExperiment(state: SurvivalRunState, agent: SurvivalAgent, step: SurvivalPlanStep): void {
  const definition = researchDefinition(step.targetId);
  if (!definition || agent.technologies.includes(definition.id) || !canAfford(agent.inventory, definition.inputs)) {
    recordOutcome(state, agent, "test_hypothesis", step.targetId, false, -7, "The material test could not proceed with the available evidence and materials.");
    finishStep(state, agent, step, false);
    return;
  }
  const sourceObservationIds = observationIdsForResearch(agent, definition);
  if (sourceObservationIds.length !== definition.requiredObservations.length) {
    recordOutcome(state, agent, "test_hypothesis", step.targetId, false, -5, "The test stopped because required materials were not in this agent's observations.");
    finishStep(state, agent, step, false);
    return;
  }
  const project = getOrCreateProject(state, agent, definition);
  const observationIds = materializeResearchEvidence(agent, project, definition, sourceObservationIds);
  if (observationIds.length !== definition.requiredObservations.length) {
    recordOutcome(state, agent, "test_hypothesis", step.targetId, false, -5, "The test stopped because its evidence record could not be preserved.");
    finishStep(state, agent, step, false);
    return;
  }
  const attemptNumber = project.attempts.length + 1;
  const sample = preparedMaterialContext(definition.id, state.environment.weather === "rain" || state.environment.weather === "storm", agent.materialSamples);
  const dose = step.experimentDose ?? chooseExperimentDose(definition.id, project.attempts, sample);
  if (dose === null) {
    recordOutcome(state, agent, "test_hypothesis", definition.id, false, 0, "Deferred this test: no informative untried procedure remains under these conditions.");
    finishStep(state, agent, step, true);
    return;
  }
  consumeInputs(agent, definition.inputs);
  const causal = evaluateCausalExperiment(definition.id, dose, sample);
  const supported = causal.verdict === "supported";
  const attempt: ResearchAttempt = {
    id: nextId(state, "attempt"),
    attemptedAt: state.tick,
    agentId: agent.id,
    hypothesis: project.hypothesis,
    materialsConsumed: { ...definition.inputs },
    procedure: [...definition.procedure],
    observationIds,
    result: supported ? "supported" : "not_supported",
    evidence: `Trial ${attemptNumber}, procedure intensity ${dose}: ${causal.explanation}`,
    causal,
    utility: supported ? 10 : -5,
  };
  project.attempts.push(attempt);
  trimAgentObservations(agent);
  if (supported) project.successfulTrials += 1;
  project.confidence = researchProjectConfidence(
    project.successfulTrials,
    project.requiredSuccessfulTrials,
    project.attempts.length,
  );
  state.stats.experiments += 1;
  makeEvent(state, {
    type: "experiment",
    category: "research",
    agentIds: [agent.id],
    summary: `${agent.label} tested a material hypothesis.`,
    outcome: attempt.evidence,
    position: agent.position,
    facts: {
      projectId: project.id,
      attemptId: attempt.id,
      technologyId: definition.id,
      result: attempt.result,
      successfulTrials: project.successfulTrials,
      requiredSuccessfulTrials: project.requiredSuccessfulTrials,
    },
  });
  if (project.successfulTrials >= project.requiredSuccessfulTrials && hasReplicatedCausalEffect(project.attempts, project.requiredSuccessfulTrials)) {
    project.status = "confirmed";
    project.discoveredAt = state.tick;
    agent.technologies.push(definition.id);
    state.stats.discoveries += 1;
    makeEvent(state, {
      type: "discovery",
      category: "research",
      agentIds: [agent.id],
      summary: `${agent.label} established ${definition.discoveryName}.`,
      outcome: `${project.successfulTrials} successful trials met the repeatability requirement.`,
      position: agent.position,
      facts: {
        projectId: project.id,
        technologyId: definition.id,
        attempts: project.attempts.length,
        successfulTrials: project.successfulTrials,
        requiredSuccessfulTrials: project.requiredSuccessfulTrials,
      },
    });
  }
  recordOutcome(
    state,
    agent,
    "test_hypothesis",
    definition.id,
    supported,
    supported ? 10 : -5,
    attempt.evidence,
    false,
  );
  finishStep(state, agent, step, true);
}

function relationshipFor(agent: SurvivalAgent, otherId: string): AgentRelationship {
  let relationship = agent.relationships.find(({ agentId }) => agentId === otherId);
  if (!relationship) {
    relationship = { agentId: otherId, trust: 50, encounters: 0, aidGiven: 0, aidReceived: 0, lastInteractionAt: 0 };
    agent.relationships.push(relationship);
  }
  return relationship;
}

function consentScore(
  state: SurvivalRunState,
  proposer: SurvivalAgent,
  responder: SurvivalAgent,
  action: "share" | "request" | "cooperate",
  resource?: "freshwater" | "food",
  amount = 1,
): number {
  if (state.policyVersion === 4) responder = discoveryInput(responder, state.tick, state.environment.bounds).agent;
  if (action === "request" && resource) return evaluateDonation(responder, resource, amount).accepted ? Math.max(0.5, evaluateDonation(responder, resource, amount).score) : Math.min(0.49, evaluateDonation(responder, resource, amount).score);
  const relationship = relationshipFor(responder, proposer.id);
  const stableNeeds = (responder.needs.health + responder.needs.hydration + responder.needs.nutrition + responder.needs.safety) / 400;
  const surplus = Math.min(1, (responder.inventory.freshwater + responder.inventory.food) / 4);
  const actionBase = action === "share" ? 0.63 : action === "request" ? 0.28 + surplus * 0.35 : 0.36 + stableNeeds * 0.23;
  const noise = survivalBetween(state.policyVersion === 4 ? 0x4d31504f : state.seed, -0.18, 0.18, "consent", state.tick, proposer.id, responder.id, action);
  return rounded(clamp(actionBase + (relationship.trust - 50) / 180 + noise, 0, 1), 3);
}

function updateRelationship(
  state: SurvivalRunState,
  left: SurvivalAgent,
  right: SurvivalAgent,
  accepted: boolean,
  aidDirection: "left_gave" | "right_gave" | "none",
): void {
  const leftView = relationshipFor(left, right.id);
  const rightView = relationshipFor(right, left.id);
  for (const relation of [leftView, rightView]) {
    relation.encounters += 1;
    relation.trust = rounded(clamp(relation.trust + (accepted ? 2.5 : -1.5)));
    relation.lastInteractionAt = state.tick;
  }
  if (aidDirection === "left_gave") {
    leftView.aidGiven += 1;
    rightView.aidReceived += 1;
  } else if (aidDirection === "right_gave") {
    rightView.aidGiven += 1;
    leftView.aidReceived += 1;
  }
}

function performSocialAction(state: SurvivalRunState, agent: SurvivalAgent, step: SurvivalPlanStep): void {
  const other = state.agents.find(({ id, alive }) => id === step.targetId && alive);
  const action = step.action as "share" | "request" | "cooperate";
  if (!other || distance(agent.position, other.position) > 8) {
    const stale = observationFor(agent, step.targetId);
    if (stale) { stale.confidence = rounded(stale.confidence * 0.25); stale.facts.lastPresenceFailureAt = state.tick; }
    recordOutcome(state, agent, action, step.targetId, false, -5, "The proposed interaction could not occur because the other agent was unavailable.");
    finishStep(state, agent, step, false);
    return;
  }
  const observedOther = observationFor(agent, other.id);
  const desiredResource = step.resource ?? (action === "share"
    ? Number(observedOther?.facts.hydrationEstimate ?? 100) <= Number(observedOther?.facts.nutritionEstimate ?? 100) ? "freshwater" : "food"
    : agent.needs.hydration <= agent.needs.nutrition ? "freshwater" : "food");
  const amount = step.amount ?? 1;
  makeEvent(state, {
    type: "social_proposal",
    category: "social",
    agentIds: [agent.id, other.id],
    summary: `${agent.label} proposed to ${action === "request" ? `request help from ${other.label}` : `${action} with ${other.label}`}.`,
    outcome: `${other.label} evaluated the proposal independently.`,
    position: agent.position,
    facts: { action, proposerId: agent.id, responderId: other.id, resource: action === "cooperate" ? null : desiredResource, amount, decisionId: agent.currentDeliberation?.id ?? null },
  });
  const score = consentScore(state, agent, other, action, desiredResource, amount);
  let accepted = score >= 0.5;
  let aidDirection: "left_gave" | "right_gave" | "none" = "none";
  let outcomeSummary = `${other.label} refused the proposal.`;
  if (accepted && action === "share") {
    const resource = evaluateDonation(state.policyVersion === 4 ? discoveryInput(agent, state.tick, state.environment.bounds).agent : agent, desiredResource, amount).accepted ? desiredResource : null;
    if (!resource) accepted = false;
    else {
      consumeMaterial(agent, resource, amount);
      receiveMaterial(other, resource, amount);
      aidDirection = "left_gave";
      outcomeSummary = `${other.label} consented to receive one ${resource}.`;
    }
  } else if (accepted && action === "request") {
    const resource = evaluateDonation(state.policyVersion === 4 ? discoveryInput(other, state.tick, state.environment.bounds).agent : other, desiredResource, amount).accepted ? desiredResource : null;
    if (!resource) accepted = false;
    else {
      consumeMaterial(other, resource, amount);
      receiveMaterial(agent, resource, amount);
      aidDirection = "right_gave";
      outcomeSummary = `${other.label} consented and supplied one ${resource}.`;
    }
  } else if (accepted && action === "cooperate") {
    const transferable = other.observations.find(
      (observation) => observation.kind === "resource" && !agent.observations.some(({ subjectId }) => subjectId === observation.subjectId),
    );
    if (transferable) {
      upsertObservation(agent, {
        ...structuredClone(transferable),
        id: `obs-${agent.id}-${transferable.subjectId}`,
        observerId: agent.id,
        receivedAt: state.tick,
        originalObserverId: transferable.originalObserverId ?? other.id,
        transmissionChain: [...(transferable.transmissionChain ?? []), other.id].slice(-5),
        confidence: rounded(transferable.confidence * 0.72),
        facts: { ...transferable.facts, sharedBy: other.id },
      });
      outcomeSummary = `${other.label} consented and shared a resource observation.`;
    } else {
      outcomeSummary = `${other.label} consented, but had no new resource information to share.`;
    }
  }
  if (!accepted) outcomeSummary = `${other.label} independently refused the proposal.`;
  if(accepted&&action==="cooperate"&&state.policyVersion===4){
    const shared=other.discovery?.evidence.filter(e=>e.source==="personal").at(-1);
    if(shared&&receiveDiscoveryTestimony(agent,shared,state.tick))outcomeSummary+=` ${other.label} reported one local measurement with its original evidence identity; it is not a new personal trial.`;
  } else if(accepted&&action==="cooperate"&&state.physical){
    const demonstration=other.physicalMind?.readings.filter(r=>r.source==="test"&&!agent.physicalMind?.readings.some(own=>own.partId===r.partId&&own.tick===r.tick)).at(-1);
    if(demonstration){learnPhysicalReading(agent,{...structuredClone(demonstration),id:`physical-demo-${agent.id}-${state.tick}-${other.id}`,observerId:agent.id,originalObserverId:other.id,receivedAt:state.tick,source:"demonstration",confidence:0.55,summary:`${other.label} reported: ${demonstration.summary} This is testimony, not a personally repeated test.`});outcomeSummary+=` ${other.label} also shared one measured result; the recipient retains its own model.`;}
  }
  updateRelationship(state, agent, other, accepted, aidDirection);
  makeEvent(state, {
    type: accepted ? "social_accepted" : "social_refused",
    category: "social",
    agentIds: [agent.id, other.id],
    summary: outcomeSummary,
    outcome: accepted ? "The action occurred with consent." : "No resource or knowledge changed hands.",
    position: agent.position,
    facts: { action, consentScore: score, accepted, resource: action === "cooperate" ? null : desiredResource, amount, decisionId: agent.currentDeliberation?.id ?? null },
  });
  const utility = !accepted ? -1 : aidDirection === "right_gave" ? 8 : aidDirection === "left_gave" ? -1 : outcomeSummary.includes("no new") ? -0.5 : 2;
  recordOutcome(state, agent, action, other.id, accepted, utility, outcomeSummary, false);
  if (action === "request") {
    updateLearning(agent,`aid:${other.id}:${desiredResource}`,{tick:state.tick,action,targetId:other.id,success:aidDirection==="right_gave",utility,summary:outcomeSummary},state.tick);
    if (!accepted && agent.survivalRecord) agent.survivalRecord.refusedRequests++;
  }
  const responseAction = action === "request" ? "share" : action === "share" ? "request" : "cooperate";
  recordOutcome(state, other, responseAction, agent.id, accepted, aidDirection === "left_gave" ? 8 : aidDirection === "right_gave" ? -1 : utility, `Response to ${agent.label}: ${outcomeSummary}`, false, undefined, false);
  finishStep(state, agent, step, action === "request" ? aidDirection === "right_gave" : accepted);
}

function executePlanStep(state: SurvivalRunState, agent: SurvivalAgent): void {
  const plan = agent.currentPlan;
  if (!plan || plan.status !== "active") return;
  const step = plan.steps[plan.activeStepIndex];
  if (!step) {
    plan.status = "complete";
    return;
  }
  if (step.status === "pending") step.status = "active";
  setCurrentAction(state, agent, step);
  if (step.action !== "move" && depthAt(freshwaterFeatures(state.environment),agent.position)>0) {
    recordOutcome(state,agent,step.action,step.targetId,false,0,"This action needs dry ground; the agent must reach a bank first.");
    finishStep(state,agent,step,false);return;
  }
  if (state.physical && step.manipulation) {
    const project=agent.physicalMind?.projects.find(p=>p.status==="active");
    if(state.policyVersion===4){const input=discoveryInput(agent,state.tick,state.environment.bounds);beginDiscoveryOperation(input,step.manipulation);agent.discovery=input.agent.discovery;}
    const prediction = state.policyVersion===4&&step.manipulation.kind==="test" ? agent.discovery?.experiments.find(e=>e.projectId===project?.id&&e.status==="running"&&e.metric===(step.manipulation!.kind==="test"&&step.manipulation!.measure==="load"?"support":"protection")) : null;
    const preActionPrediction=prediction?structuredClone(prediction):null;
    const result = executeManipulation(state.physical,agent,step.manipulation,state.environment,state.tick,state.agents.filter(a=>a.alive).map(a=>a.position),state.policyVersion===4);
    const discoveryEvidence=state.policyVersion===4?finishDiscoveryOperation(agent,step.manipulation,result,state.tick):null;
    if(state.policyVersion!==4){completePhysicalOperation(agent,step.manipulation,result.ok,result.partId,state.tick,result.effort,result.summary);if(result.reading)learnPhysicalReading(agent,result.reading);}
    if(discoveryEvidence)makeEvent(state,{type:"experiment",category:"research",agentIds:[agent.id],summary:`${agent.label} measured ${discoveryEvidence.metric}.`,outcome:agent.discovery?.experiments.find(e=>e.id===discoveryEvidence.experimentId)?.result??discoveryEvidence.interpretation,position:agent.position,
      facts:{operation:"discovery_measurement",projectId:project?.id??null,goalId:preActionPrediction?.goalId??null,evidenceId:discoveryEvidence.id,originalEvidenceId:discoveryEvidence.originalId,experimentId:discoveryEvidence.experimentId,preActionPrediction:JSON.stringify(preActionPrediction),measurement:JSON.stringify(discoveryEvidence),success:result.ok}});
    recordOutcome(state,agent,step.action,result.partId,result.ok,-result.effort,result.summary);
    makeEvent(state,{type:result.reading?"experiment":"action_outcome",category:result.reading?"research":"environment",agentIds:[agent.id],summary:`${agent.label} attempted ${step.manipulation.kind}.`,outcome:result.summary,position:agent.position,facts:{operation:step.manipulation.kind,partId:result.partId??("partId"in step.manipulation?step.manipulation.partId:null),decisionId:agent.currentDeliberation?.id??null,projectId:project?.id??null,projectStatus:project?.status??null,success:result.ok,effort:result.effort,control:result.reading?.before??null,measured:result.reading?.after??null}});
    finishStep(state,agent,step,result.ok);
  } else if (step.action === "move") {
    moveToward(state, agent, step);
  } else if (step.action === "collect" || step.action === "gather") {
    gatherFromSite(state, agent, step);
  } else if (step.action === "drink") {
    consumeWater(state, agent, step);
  } else if (step.action === "eat") {
    consumeFood(state, agent, step);
  } else if (step.action === "rest") {
    agent.needs.energy = rounded(clamp(agent.needs.energy + 13));
    agent.needs.health = rounded(clamp(agent.needs.health + 0.35));
    if (agent.technologies.includes("herbal_poultice") && agent.inventory.herbs >= 0.25 && agent.needs.health < 100) {
      consumeMaterial(agent, "herbs", 0.25);
      agent.needs.health = rounded(clamp(agent.needs.health + 1));
    }
    step.remainingSteps -= 1;
    if (step.remainingSteps <= 0) {
      recordOutcome(state, agent, "rest", null, true, 11, `${agent.label} completed a period of rest.`);
      finishStep(state, agent, step, true);
    }
  } else if (step.action === "warm") {
    warmAgent(state, agent, step);
  } else if (step.action === "shelter") {
    shelterAgent(state, agent, step);
  } else if (step.action === "explore") {
    recordOutcome(state, agent, "explore", null, true, 5, `${agent.label} completed an exploratory movement.`, false);
    finishStep(state, agent, step, true);
  } else if (step.action === "build") {
    if(state.physical){recordOutcome(state,agent,"build",null,false,0,"No physical manipulation was specified.");finishStep(state,agent,step,false);}
    else buildShelter(state, agent, step);
  } else if (step.action === "prepare_experiment") {
    agent.needs.energy = rounded(clamp(agent.needs.energy - 0.4));
    finishStep(state, agent, step, true);
  } else if (step.action === "test_hypothesis") {
    if(state.physical){recordOutcome(state,agent,"test_hypothesis",null,false,0,"A physical test needs an object and a measurement.");finishStep(state,agent,step,false);}
    else conductExperiment(state, agent, step);
  } else if (step.action === "review_evidence") {
    finishStep(state, agent, step, true);
  } else if (step.action === "share" || step.action === "request" || step.action === "cooperate") {
    performSocialAction(state, agent, step);
  } else {
    agent.needs.energy = rounded(clamp(agent.needs.energy + 0.25));
    recordOutcome(state, agent, "wait", null, true, 0, `${agent.label} waited briefly.`, false);
    finishStep(state, agent, step, true);
  }
}

function applyNeedDrift(state: SurvivalRunState, agent: SurvivalAgent): void {
  const sheltered = state.environment.structures.some(
    ({ kind, position, condition }) => kind === "shelter" && condition > 5 && distance(agent.position, position) <= 6,
  );
  const byFire = state.environment.structures.some(
    ({ kind, position, condition }) => kind === "fire" && condition > 5 && distance(agent.position, position) <= 7,
  );
  driftNeeds(agent.needs, { ...state.environment, sheltered, byFire, ...(state.physical ? { protection: protectionAt(state.physical,agent.position,state.environment.weather) } : {}) });
}

function causeOfDeath(agent: SurvivalAgent): string {
  const causes: Array<[number, string]> = [
    [agent.needs.hydration, "dehydration"],
    [agent.needs.nutrition, "starvation"],
    [agent.needs.warmth, "exposure"],
    [agent.needs.safety, "environmental injury"],
  ];
  causes.sort((left, right) => left[0] - right[0] || left[1].localeCompare(right[1]));
  return causes[0][0] < 18 ? causes[0][1] : "cumulative health failure";
}

function markDead(state: SurvivalRunState, agent: SurvivalAgent): void {
  if (!agent.alive) return;
  agent.alive = false;
  agent.diedAt = state.tick;
  agent.causeOfDeath = agent.needs.energy <= 0 && depthAt(freshwaterFeatures(state.environment),agent.position) >= SWIMMING_DEPTH ? "exhaustion in deep water" : causeOfDeath(agent);
  sampleSurvival(agent,state.tick);
  if (agent.currentPlan?.status === "active") agent.currentPlan.status = "abandoned";
  agent.currentAction = {
    kind: agent.currentAction.kind,
    status: "blocked",
    targetId: agent.currentAction.targetId,
    startedAt: agent.currentAction.startedAt,
    updatedAt: state.tick,
  };
  state.stats.deaths += 1;
  makeEvent(state, {
    type: "agent_died",
    category: "agent",
    agentIds: [agent.id],
    summary: `${agent.label} died from ${agent.causeOfDeath}.`,
    outcome: "This life has ended permanently. Only an earlier funded succession plan, a living agent's later choice, or an observer introduction can create a new life.",
    position: agent.position,
    facts: { cause: agent.causeOfDeath, lastDrinkAt:agent.survivalRecord?.lastDrinkAt??null,lastMealAt:agent.survivalRecord?.lastMealAt??null,blockedMoves:agent.survivalRecord?.blockedMoves??null,refusedRequests:agent.survivalRecord?.refusedRequests??null,recordSince:agent.survivalRecord?.since??null },
  });
}

function livingAgents(state: SurvivalRunState): SurvivalAgent[] {
  return state.agents.filter(({ alive }) => alive);
}

function enableSuccession(state: SurvivalRunState): void {
  if((state.policyVersion===3||state.policyVersion===4)&&!state.config.continuity)return;
  state.schemaVersion = state.schemaVersion>=5 ? state.schemaVersion : state.survivalRevision ? SURVIVAL_SCHEMA_VERSION : state.policyVersion === 3 ? 3 : 2;
  if (state.succession) return;
  state.succession = { version: 1, enabledAt: state.tick, plans: [] };
  makeEvent(state, {
    type: "succession_enabled", category: "run",
    summary: "Next-generation choices became available in this study.",
    outcome: "The updated rules add an optional continuity objective alongside individual survival. No life was replaced and no supplies were created.",
    facts: { version: 1 },
  });
}

function reviewSuccession(state: SurvivalRunState, agent: SurvivalAgent): void {
  if (!state.succession || state.tick - agent.spawnedAt < SUCCESSION_MATURITY_STEPS || (agent.successionReview?.reconsiderAfter ?? 0) > state.tick) return;
  if (state.config.durationHours !== null && state.elapsedMinutes >= state.config.durationHours * 60) return;
  // Only personally received funding receipts influence target selection.
  const knownPlans = new Set(agent.knownSuccessionPredecessors ?? []);
  const observedLoss = agent.observations.filter(o => o.kind === "agent" && o.facts.alive === false && o.confidence >= .5 && state.tick - o.observedAt <= 144 && !knownPlans.has(o.subjectId))
    .sort((a,b) => b.observedAt-a.observedAt || a.subjectId.localeCompare(b.subjectId))[0];
  const predecessorId = observedLoss?.subjectId ?? (!knownPlans.has(agent.id) ? agent.id : null);
  if (!predecessorId) return;
  const predecessor = state.agents.find(other => other.id === predecessorId);
  if (!predecessor || (predecessorId !== agent.id && predecessor.alive)) return;
  const review = evaluateSuccession(state.policyVersion===4?discoveryInput(agent,state.tick,state.environment.bounds).agent:agent, state.tick, predecessorId);
  const requestedChoice = review.choice;
  // Admission is an execution result, not secret knowledge fed into preference.
  if (review.choice === "planned") {
    agent.knownSuccessionPredecessors = [...knownPlans, predecessorId];
    if (state.succession.plans.some(plan => plan.predecessorId === predecessorId)) {
      review.choice = "deferred";
      review.rationale = "Chose to fund a successor, but admission reported that this predecessor already has a funded plan. No supplies were spent. This receipt is now known to the agent.";
    }
  }
  const previous = agent.successionReview;
  agent.successionReview = review;
  if (review.choice === "planned") {
    for (const kind of ["freshwater", "food"] as const) {
      agent.inventory[kind] = rounded(agent.inventory[kind] - SUCCESSION_PROVISIONS[kind]);
      // A separated sample must not remain evidence for the remaining stock.
      if (agent.materialSamples) delete agent.materialSamples[kind];
    }
    state.succession.plans.push({
      id: `succession-${predecessor.id}`, predecessorId, sponsorId: agent.id,
      mode: review.mode, plannedAt: state.tick, position: {...agent.position},
      rationale: review.rationale, score: review.score, evidence: structuredClone(review.evidence),
      provisions: {...SUCCESSION_PROVISIONS}, status: "pending", successorId: null, fulfilledAt: null,
    });
  }
  if (review.choice !== "deferred" || !previous || previous.choice !== review.choice || previous.predecessorId !== predecessorId) {
    makeEvent(state, {
      type: "succession_decision", category: "agent", agentIds: [...new Set([agent.id, predecessorId])],
      summary: review.choice === "planned"
        ? `${agent.label} planned a next generation ${review.mode === "before_death" ? "for after its own death" : `after observing ${predecessor.label}'s death`}.`
        : `${agent.label} ${review.choice === "declined" ? "declined" : "deferred"} successor planning.`,
      outcome: review.choice === "planned" ? `${review.rationale} Set aside 0.5 food and 0.5 water; a new life still requires the predecessor's death and a vacant slot.` : review.rationale,
      position: agent.position, facts: { choice: review.choice, requestedChoice, mode: review.mode, score: review.score, predecessorId },
    });
  }
}

function fulfillSuccession(state: SurvivalRunState): void {
  // Duration wins over every pending admission, including the last agent's death.
  if (!state.succession || (state.config.durationHours !== null && state.elapsedMinutes >= state.config.durationHours * 60)) return;
  for (const plan of state.succession.plans) {
    if (plan.status !== "pending" || livingAgents(state).length >= state.config.agentCap) continue;
    const predecessor = state.agents.find(agent => agent.id === plan.predecessorId);
    if (!predecessor || predecessor.alive) continue;
    const child = makeAgent(state, "autonomous_successor", predecessor.slot);
    child.position = {...plan.position};
    child.lineage = { generation: (predecessor.lineage?.generation ?? 1) + 1, predecessorId: predecessor.id, sponsorId: plan.sponsorId, planId: plan.id };
    child.name = `Agent ${child.label} · Generation ${child.lineage.generation}`;
    child.inventory.freshwater = plan.provisions.freshwater;
    child.inventory.food = plan.provisions.food;
    state.agents.push(child);
    state.stats.totalAgentsIntroduced++;
    plan.status = "fulfilled"; plan.successorId = child.id; plan.fulfilledAt = state.tick;
    makeEvent(state, {
      type: "agent_added", category: "agent", agentIds: [...new Set([child.id, predecessor.id, plan.sponsorId])],
      summary: `${child.label} entered as generation ${child.lineage.generation}, succeeding ${predecessor.label}.`,
      outcome: "A new life received the previously reserved starter supplies, but no inherited memories, roles or research. The predecessor remains dead.",
      position: child.position, facts: { source: child.spawnSource, planId: plan.id, predecessorId: predecessor.id, sponsorId: plan.sponsorId, generation: child.lineage.generation, slot: child.slot, food: plan.provisions.food, freshwater: plan.provisions.freshwater },
    });
  }
}

function updateRunStatus(state: SurvivalRunState): void {
  const count = livingAgents(state).length;
  state.stats.livingAgents = count;
  state.stats.peakLivingAgents = Math.max(state.stats.peakLivingAgents, count);
  if (
    state.status === "running"
    && state.config.durationHours !== null
    && state.elapsedMinutes >= state.config.durationHours * 60
  ) {
    state.status = "completed";
    makeEvent(state, {
      type: "run_completed",
      category: "run",
      agentIds: livingAgents(state).map(({ id }) => id),
      summary: "The configured observation duration ended.",
      outcome: `${count} agent${count === 1 ? "" : "s"} remained alive.`,
      facts: { elapsedMinutes: state.elapsedMinutes, survivors: count },
    });
    return;
  }
  if (count === 0 && state.status === "running") {
    state.status = "extinct";
    makeEvent(state, {
      type: "run_extinct",
      category: "run",
      summary: "No agents remain alive.",
      outcome: "Only an explicit observer intervention or a new run can introduce another agent.",
      facts: { elapsedMinutes: state.elapsedMinutes },
    });
  }
}

function advanceOneStep(state: SurvivalRunState): void {
  state.tick += 1;
  state.elapsedMinutes += SURVIVAL_STEP_MINUTES;
  state.day = Math.floor(state.elapsedMinutes / (24 * 60)) + 1;
  state.timeOfDay = state.elapsedMinutes % (24 * 60);
  updateEnvironment(state);
  if (!state.survivalRevision) {
    state.survivalRevision=1;if(state.schemaVersion<5)state.schemaVersion=SURVIVAL_SCHEMA_VERSION;
    for(const agent of state.agents.filter(a=>a.alive)){agent.navigation=freshNavigation();agent.survivalRecord=freshSurvivalRecord(state.tick);}
    makeEvent(state,{type:"action_outcome",category:"run",agentIds:[],summary:"Survival planning and route recovery were updated.",outcome:"New decisions use complete need-restoration plans, private routes and refusal-aware forecasts. Earlier records and deaths are unchanged.",facts:{survivalRevision:1}});
  }
  if(state.physical)agePhysicalWorld(state.physical,state.environment);
  enableSuccession(state);

  const activeAgents = livingAgents(state).sort((left, right) => left.id.localeCompare(right.id));
  for (const agent of activeAgents) {
    if (agent.needs.health <= 0) {
      markDead(state, agent);
      continue;
    }
    const warmthBefore=agent.needs.warmth;
    if(agent.physicalMind?.version===1){
      agent.physicalMind.version=2;agent.physicalMind.uses=[];
      makeEvent(state,{type:"action_outcome",category:"run",agentIds:[agent.id],summary:`${agent.label}'s construction reasoning was updated.`,outcome:"Observed geometry, prerequisite planning, project recovery and experience from use are enabled. Prior records are unchanged.",facts:{constructionReasoning:2}});
    }
    applyNeedDrift(state, agent);
    if (agent.needs.health <= 0) {
      markDead(state, agent);
      continue;
    }
    perceive(state, agent);
    if(agent.physicalMind && agent.physicalMind.namedAt===null && state.tick-agent.spawnedAt>=6 && Math.min(agent.needs.hydration,agent.needs.nutrition,agent.needs.energy)>55){
      const seen=agent.observations.filter(o=>o.kind==="resource").sort((a,b)=>a.id.localeCompare(b.id));
      if(seen.length){const syllables=["Ara","Bel","Cai","Dara","Eli","Fen","Ira","Kai","Luma","Mira","Neri","Ori","Ren","Sola","Tavi","Una"];
        const personal=survivalHash(state.policyVersion===4?0x4d31504f:state.seed,agent.id,...seen.map(o=>o.subjectId));agent.name=syllables[personal%syllables.length]+["n","ra","el","i","on","a"][Math.floor(personal/16)%6];
        agent.physicalMind.namedAt=state.tick;agent.physicalMind.nameEvidence=seen.slice(0,4).map(o=>o.id);
        makeEvent(state,{type:"action_outcome",category:"agent",agentIds:[agent.id],summary:`${agent.label} adopted the name ${agent.name}.`,outcome:"A local naming decision derived from this life’s observed environment; the stable ID is unchanged.",position:agent.position,facts:{name:agent.name,mechanism:"bounded local name generation, not language-model reasoning"}});
      }
    }
    reviewSuccession(state, agent);
    const water = freshwaterFeatures(state.environment), depth = depthAt(water, agent.position);
    const pending = agent.currentPlan?.steps[agent.currentPlan.activeStepIndex];
    // Reconsider a land activity while immersed, or a crossing when reserves collapse.
    // The replacement destination still comes from the private planner, not the observer.
    if (depth > 0 && agent.currentPlan?.status === "active" && (pending?.action !== "move"
      || ((agent.needs.energy < 18 || agent.needs.warmth < 18) && agent.currentPlan.goal !== "seek_safety"))) agent.currentPlan.status = "abandoned";
    if (agent.currentPlan?.status === "active" && shouldAbandonForUrgency(state.policyVersion===4?discoveryInput(agent,state.tick,state.environment.bounds).agent:agent,state.tick,state.environment.bounds)) {
      agent.currentPlan.status = "abandoned";
    }
    if (agent.discovery?.active && agent.currentPlan?.discoveryProjectId === agent.discovery.active.projectId && (agent.discovery.active.spentTicks >= 36 || agent.discovery.active.spentEffort >= 10)) agent.currentPlan.status = "abandoned";
    if (!agent.currentPlan || agent.currentPlan.status !== "active") {
      deliberate(state, agent);
    }
    const beforeMove = { ...agent.position };
    const experiencedAction=agent.currentPlan?.steps[agent.currentPlan.activeStepIndex]?.action;
    if (agent.discovery?.active && agent.currentPlan?.discoveryProjectId === agent.discovery.active.projectId) agent.discovery.active.spentTicks++;
    executePlanStep(state, agent);
    if(state.physical&&agent.physicalMind&&experiencedAction&&["rest","shelter","warm"].includes(experiencedAction)&&depthAt(water,agent.position)===0){
      const protection=protectionAt(state.physical,agent.position,state.environment.weather);
      const part=state.physical.parts.filter(p=>p.supported&&p.condition>.05&&distance(p.position,agent.position)<5&&agent.observations.some(o=>o.subjectId===p.id)).sort((a,b)=>distance(a.position,agent.position)-distance(b.position,agent.position))[0];
      if(part&&protection>.025&&state.tick-(agent.physicalMind.uses?.at(-1)?.tick??-6)>=6){
        const use={id:`use-${agent.id}-${state.tick}`,tick:state.tick,partId:part.id,revision:part.revision,position:{...agent.position},action:experiencedAction as "rest"|"shelter"|"warm",weather:state.environment.weather,temperature:state.environment.temperatureC,warmthBefore,warmthAfter:agent.needs.warmth,protection};
        agent.physicalMind.uses=[...(agent.physicalMind.uses??[]),use].slice(-32);
        const project=[...agent.physicalMind.projects].reverse().find(p=>p.partIds.includes(part.id));
        makeEvent(state,{type:"action_outcome",category:"survival",agentIds:[agent.id],summary:`${agent.label} used a protective arrangement.`,outcome:`Warmth changed from ${warmthBefore.toFixed(0)} to ${agent.needs.warmth.toFixed(0)} during ${use.action}. Experienced protection is not a controlled test of causation.`,position:agent.position,facts:{operation:"use",partId:part.id,projectId:project?.id??null,protection,warmthBefore,warmthAfter:agent.needs.warmth,weather:use.weather,success:true}});
      }
    }
    const travel = estimateWaterTravel(water, beforeMove, agent.position, state.environment.temperatureC, state.environment.weather === "storm");
    const exposure = distance(beforeMove, agent.position) > 0
      ? travel : immersionCost(locomotionAt(water, agent.position), state.environment.temperatureC, state.environment.weather === "storm");
    agent.needs.energy = rounded(clamp(agent.needs.energy - exposure.energy));
    agent.needs.warmth = rounded(clamp(agent.needs.warmth - exposure.warmth));
    if (depthAt(water, agent.position) >= SWIMMING_DEPTH && agent.needs.energy <= 0) agent.needs.health = rounded(clamp(agent.needs.health - 8));
    sampleSurvival(agent,state.tick);
    const entered = depth === 0 && depthAt(water, agent.position) > 0;
    const exited = depth > 0 && depthAt(water, agent.position) === 0;
    if (entered || exited) {
      const summary = entered ? `${agent.label} entered freshwater; wading and swimming take extra effort and warmth.` : `${agent.label} reached dry ground after crossing freshwater.`;
      const outcome = recordOutcome(state,agent,"move",agent.currentAction.targetId,true,-exposure.energy || 0,summary,false);
      makeEvent(state,{type:"action_outcome",category:"survival",agentIds:[agent.id],summary,outcome:entered?"Water entry confirmed. No water was collected or consumed.":"Shore reached; the crossing is complete.",position:agent.position,facts:{action:"move",success:true,locomotion:locomotionAt(water,agent.position),energyCost:rounded(exposure.energy),warmthCost:rounded(exposure.warmth),decisionId:outcome.decisionId??null}});
    }
    if (agent.needs.health <= 0) markDead(state, agent);
  }
  fulfillSuccession(state);
  state.soleSurvivor.previousLivingCount = livingAgents(state).length;
  updateRunStatus(state);
}

/**
 * Advances a cloned state by deterministic fixed ten-minute steps. The input
 * object is never mutated, which makes checkpoint/replay comparisons simple.
 */
export function advanceSurvivalRun(stateInput: SurvivalRunState, steps = 1): SurvivalAdvanceResult {
  if (stateInput.policyVersion !== 2 && stateInput.policyVersion !== 3 && stateInput.policyVersion !== 4) return advanceBaseline(stateInput, steps);
  if (!Number.isInteger(steps) || steps < 0) throw new RangeError("steps must be a non-negative integer.");
  const state = cloneState(stateInput);
  const generatedEvents: SurvivalEvent[] = [];
  let stepsProcessed = 0;
  while (stepsProcessed < steps && state.status === "running") {
    const stepEventStart = state.events.length;
    advanceOneStep(state);
    generatedEvents.push(...state.events.slice(stepEventStart));
    trimEventWindow(state);
    stepsProcessed += 1;
  }
  return { state, events: generatedEvents, stepsProcessed };
}

/** Explicit observer intervention. The engine chooses identity and placement. */
export function addObserverAgent(stateInput: SurvivalRunState): AddObserverAgentResult {
  const state = cloneState(stateInput);
  if (state.status === "completed") {
    return { ok: false, state, agent: null, event: null, reason: "run_completed" };
  }
  const survivors = livingAgents(state);
  if (survivors.length >= 5) {
    return { ok: false, state, agent: null, event: null, reason: "agent_cap_reached" };
  }
  const previousCap = state.config.agentCap;
  state.config.agentCap = 5;
  const priorStatus = state.status;
  const { agent, event } = introduceAgent(
    state,
    "observer",
    "The observer explicitly introduced one new agent.",
    true,
  );
  state.stats.observerInterventions += 1;
  if (event) event.facts.previousAgentCap = previousCap;
  if (priorStatus === "extinct") {
    state.status = "running";
    state.soleSurvivor = {
      epoch: state.soleSurvivor.epoch,
      previousLivingCount: 1,
      agentId: state.policyVersion !== 2 && state.policyVersion !== 3 && state.policyVersion !== 4 && state.config.agentCap > 1 ? agent.id : null,
      decidedAt: null,
      decision: null,
      rationale: null,
      companionAgentId: null,
    };
  } else {
    state.soleSurvivor.previousLivingCount = livingAgents(state).length;
  }
  trimEventWindow(state);
  return { ok: true, state, agent, event };
}

export function setSurvivalRunPaused(stateInput: SurvivalRunState, paused: boolean): SurvivalRunState {
  const state = cloneState(stateInput);
  if (state.status === "completed" || state.status === "extinct") return state;
  state.status = paused ? "paused" : "running";
  return state;
}

export function serializeSurvivalRun(state: SurvivalRunState): string {
  try {
    return JSON.stringify(normalizeSurvivalRun(state));
  } catch {
    throw new TypeError("Cannot serialize an invalid survival run.");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonSafe(value: unknown, ancestors = new Set<object>()): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object") return false;
  if (ancestors.has(value)) return false;
  ancestors.add(value);
  const valid = Array.isArray(value)
    ? value.every((item) => isJsonSafe(item, ancestors))
    : Object.values(value).every((item) => isJsonSafe(item, ancestors));
  ancestors.delete(value);
  return valid;
}

function isFiniteNumber(
  value: unknown,
  minimum = Number.NEGATIVE_INFINITY,
  maximum = Number.POSITIVE_INFINITY,
): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function sequenceNumber(id: string, prefix: MutableIdKind): number | null {
  const match = new RegExp(`^${prefix}-(\\d+)$`).exec(id);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) && value >= 1 ? value : null;
}

function isPosition(value: unknown, bounds?: SurvivalEnvironment["bounds"]): value is SurvivalPosition {
  if (!isRecord(value) || !isFiniteNumber(value.x) || !isFiniteNumber(value.z)) return false;
  return !bounds || (
    value.x >= bounds.minX
    && value.x <= bounds.maxX
    && value.z >= bounds.minZ
    && value.z <= bounds.maxZ
  );
}

function isInventory(value: unknown, partial = false): boolean {
  if (!isRecord(value)) return false;
  if (Object.keys(value).some((kind) => !RESOURCE_KINDS.includes(kind as SurvivalResourceKind))) return false;
  if (!partial && RESOURCE_KINDS.some((kind) => !(kind in value))) return false;
  return Object.values(value).every((amount) => isFiniteNumber(amount, 0));
}

function isNeedSet(value: unknown): value is SurvivalNeeds {
  if (!isRecord(value)) return false;
  return ["health", "hydration", "nutrition", "energy", "warmth", "safety"].every((key) => (
    isFiniteNumber(value[key], 0, 100)
  ));
}

export function validateSurvivalRun(value: unknown): value is SurvivalRunState {
  if (!isRecord(value) || !isJsonSafe(value)) return false;
  if (value.policyVersion !== undefined && value.policyVersion !== 1 && value.policyVersion !== 2 && value.policyVersion !== 3 && value.policyVersion !== 4) return false;
  if (value.schemaVersion!==1&&value.schemaVersion!==2&&value.schemaVersion!==3&&value.schemaVersion!==4&&value.schemaVersion!==5&&value.schemaVersion!==6) return false;
  // A fenced pre-update backup uses format 4 without claiming the rules have
  // already been adopted. Its next advancing tick performs the audited adoption.
  if(value.policyVersion===4){if((value.schemaVersion!==5&&value.schemaVersion!==6)||value.survivalRevision!==1)return false;}
  else if(value.schemaVersion===5||value.schemaVersion===6){if(![2,3].includes(Number(value.policyVersion))||(value.survivalRevision!==undefined&&value.survivalRevision!==1))return false;}
  else if(value.schemaVersion===4){if((value.survivalRevision!==undefined&&value.survivalRevision!==1)||(value.policyVersion!==2&&value.policyVersion!==3))return false;}
  else if(value.survivalRevision!==undefined || (value.policyVersion === 3 ? value.schemaVersion !== 3 : value.schemaVersion === 3 || (value.schemaVersion === 2 && value.policyVersion !== 2))) return false;
  if (!isRecord(value.config) || !isRecord(value.environment) || !isRecord(value.stats) || !isRecord(value.nextIds) || !isRecord(value.soleSurvivor) || !isRecord(value.eventWindow)) return false;
  if (!Array.isArray(value.agents) || !Array.isArray(value.events)) return false;
  const rawAgents = value.agents;
  const rawEvents = value.events;
  const config = value.config;
  if (!Number.isInteger(config.initialAgentCount) || Number(config.initialAgentCount) < 1 || Number(config.initialAgentCount) > 5) return false;
  if (!Number.isInteger(config.agentCap) || Number(config.agentCap) < 1 || Number(config.agentCap) > 5) return false;
  if (Number(config.initialAgentCount) > Number(config.agentCap)) return false;
  if (!isRecord(config.objective) || config.objective.kind !== "survive" || config.objective.statement !== SURVIVAL_OBJECTIVE.statement) return false;
  if (config.stepMinutes !== SURVIVAL_STEP_MINUTES) return false;
  if (config.durationHours !== null && !isFiniteNumber(config.durationHours, Number.EPSILON)) return false;
  if (!isFiniteNumber(config.worldSize, 96, 1024)) return false;
  if (!(config.resourceAbundance === "scarce" || config.resourceAbundance === "balanced" || config.resourceAbundance === "plentiful")) return false;
  if (!(config.climateVolatility === "stable" || config.climateVolatility === "variable" || config.climateVolatility === "harsh")) return false;
  if (!["running", "paused", "completed", "extinct"].includes(String(value.status))) return false;
  if (!isNonNegativeInteger(value.tick) || !isFiniteNumber(value.elapsedMinutes, 0) || value.elapsedMinutes !== value.tick * SURVIVAL_STEP_MINUTES) return false;
  if (!Number.isInteger(value.day) || Number(value.day) < 1 || !isFiniteNumber(value.timeOfDay, 0, 1439)) return false;
  if (Number(value.day) !== Math.floor(value.elapsedMinutes / 1440) + 1 || value.timeOfDay !== value.elapsedMinutes % 1440) return false;
  if (!isNonNegativeInteger(value.seed) || typeof value.id !== "string" || typeof value.seedLabel !== "string") return false;

  const environment = value.environment;
  if (!isFiniteNumber(environment.size, 96, 1024) || environment.size !== config.worldSize || !isRecord(environment.bounds)) return false;
  const rawBounds = environment.bounds;
  if (!isFiniteNumber(rawBounds.minX) || !isFiniteNumber(rawBounds.maxX) || !isFiniteNumber(rawBounds.minZ) || !isFiniteNumber(rawBounds.maxZ)) return false;
  if (rawBounds.minX >= rawBounds.maxX || rawBounds.minZ >= rawBounds.maxZ) return false;
  const bounds = rawBounds as unknown as SurvivalEnvironment["bounds"];
  if (!isFiniteNumber(environment.daylight, 0, 1) || !isFiniteNumber(environment.temperatureC)) return false;
  if (!isNonNegativeInteger(environment.weatherChangedAt)) return false;
  if (!["clear", "overcast", "rain", "storm", "cold_snap", "heat_wave"].includes(String(environment.weather))) return false;
  if (!Array.isArray(environment.resources) || !Array.isArray(environment.structures)) return false;
  const siteIds = new Set<string>();
  const siteKindsById = new Map<string, SurvivalResourceKind>();
  for (const rawSite of environment.resources) {
    if (!isRecord(rawSite) || typeof rawSite.id !== "string" || siteIds.has(rawSite.id)) return false;
    siteIds.add(rawSite.id);
    if (!RESOURCE_KINDS.includes(rawSite.kind as SurvivalResourceKind) || !isPosition(rawSite.position, bounds)) return false;
    siteKindsById.set(rawSite.id, rawSite.kind as SurvivalResourceKind);
    if (!isFiniteNumber(rawSite.quantity, 0) || !isFiniteNumber(rawSite.capacity, 0)) return false;
    if (rawSite.quantity > rawSite.capacity || !isFiniteNumber(rawSite.regenerationPerDay, 0) || typeof rawSite.contaminated !== "boolean") return false;
  }
  const structureIds = new Set<string>();
  for (const rawStructure of environment.structures) {
    if (!isRecord(rawStructure) || typeof rawStructure.id !== "string" || sequenceNumber(rawStructure.id, "structure") === null || structureIds.has(rawStructure.id)) return false;
    structureIds.add(rawStructure.id);
    if (!(rawStructure.kind === "shelter" || rawStructure.kind === "fire" || rawStructure.kind === "storage")) return false;
    if (!isPosition(rawStructure.position, bounds) || !isNonNegativeInteger(rawStructure.builtAt) || rawStructure.builtAt > value.tick) return false;
    if (!Array.isArray(rawStructure.builderIds) || !rawStructure.builderIds.every((id) => typeof id === "string")) return false;
    if (!isFiniteNumber(rawStructure.condition, 0, 100) || !isInventory(rawStructure.stored)) return false;
  }

  const ids = new Set<string>();
  const livingSlots = new Set<number>();
  const globalObservationIds = new Set<string>();
  const projectIds = new Set<string>();
  const attemptIds = new Set<string>();
  const currentDecisionIds = new Set<string>();
  const currentPlanIds = new Set<string>();
  const retainedStepIds = new Set<string>();
  const retainedMemoryIds = new Set<string>();
  const validTechnologies = new Set<string>(RESEARCH_CATALOG.map(({ id }) => id));
  let confirmedProjectCount = 0;
  for (const rawAgent of rawAgents) {
    if (!isRecord(rawAgent) || typeof rawAgent.id !== "string" || sequenceNumber(rawAgent.id, "agent") === null || ids.has(rawAgent.id)) return false;
    ids.add(rawAgent.id);
    if (!Number.isInteger(rawAgent.slot) || Number(rawAgent.slot) < 1 || Number(rawAgent.slot) > Number(config.agentCap)) return false;
    if (rawAgent.label !== `A${rawAgent.slot}` || !Number.isInteger(rawAgent.slotGeneration) || Number(rawAgent.slotGeneration) < 1) return false;
    if (typeof rawAgent.name !== "string" || !["initial", "observer", "autonomous_companion", "autonomous_successor"].includes(String(rawAgent.spawnSource))) return false;
    if (!isNonNegativeInteger(rawAgent.spawnedAt) || rawAgent.spawnedAt > value.tick || !isPosition(rawAgent.position, bounds)) return false;
    if (typeof rawAgent.alive !== "boolean" || !isNeedSet(rawAgent.needs)) return false;
    if (rawAgent.alive && (rawAgent.diedAt !== null || rawAgent.causeOfDeath !== null)) return false;
    if (!rawAgent.alive && (!isNonNegativeInteger(rawAgent.diedAt) || rawAgent.diedAt > value.tick || typeof rawAgent.causeOfDeath !== "string")) return false;
    if (!Array.isArray(rawAgent.observations) || !Array.isArray(rawAgent.memory) || !Array.isArray(rawAgent.learning) || !Array.isArray(rawAgent.relationships)) return false;
    if (!Array.isArray(rawAgent.research) || !Array.isArray(rawAgent.technologies) || !isInventory(rawAgent.inventory)) return false;
    if (rawAgent.observations.length > MAX_OBSERVATIONS || rawAgent.memory.length > MAX_MEMORIES || rawAgent.learning.length > MAX_LEARNING_CONTEXTS) return false;
    const observationIds = new Set<string>();
    const observationsById = new Map<string, Record<string, unknown>>();
    for (const rawObservation of rawAgent.observations) {
      if (!isRecord(rawObservation) || rawObservation.observerId !== rawAgent.id || typeof rawObservation.id !== "string") return false;
      if (observationIds.has(rawObservation.id) || globalObservationIds.has(rawObservation.id)) return false;
      observationIds.add(rawObservation.id);
      observationsById.set(rawObservation.id, rawObservation);
      globalObservationIds.add(rawObservation.id);
      if (typeof rawObservation.subjectId !== "string" || !isNonNegativeInteger(rawObservation.observedAt) || rawObservation.observedAt > value.tick) return false;
      if (!(rawObservation.position === null || isPosition(rawObservation.position, bounds))) return false;
      if (!isFiniteNumber(rawObservation.confidence, 0, 1) || !isRecord(rawObservation.facts)) return false;
      if (!["resource", "agent", "weather", "structure", "outcome"].includes(String(rawObservation.kind))) return false;
      if (rawObservation.receivedAt !== undefined && (!isNonNegativeInteger(rawObservation.receivedAt) || rawObservation.receivedAt < rawObservation.observedAt || rawObservation.receivedAt > value.tick)) return false;
      if (rawObservation.originalObserverId !== undefined && typeof rawObservation.originalObserverId !== "string") return false;
      if (rawObservation.transmissionChain !== undefined && (!Array.isArray(rawObservation.transmissionChain) || rawObservation.transmissionChain.length > 5 || !rawObservation.transmissionChain.every(id => typeof id === "string"))) return false;
    }
    if (rawAgent.materialSamples !== undefined) {
      if (!isRecord(rawAgent.materialSamples)) return false;
      for (const [kind, sample] of Object.entries(rawAgent.materialSamples)) {
        if (!RESOURCE_KINDS.includes(kind as SurvivalResourceKind) || !isRecord(sample) || typeof sample.sourceId !== "string" || siteKindsById.get(sample.sourceId) !== kind) return false;
        if (!isNonNegativeInteger(sample.sampledAt) || sample.sampledAt > value.tick) return false;
        if (!(sample.contamination === null || isFiniteNumber(sample.contamination, 0, 1)) || !(sample.activity === null || isFiniteNumber(sample.activity, 0, 1))) return false;
      }
    }
    const memoryIds = new Set<string>();
    for (const rawMemory of rawAgent.memory) {
      if (!isRecord(rawMemory) || typeof rawMemory.id !== "string" || sequenceNumber(rawMemory.id, "memory") === null || memoryIds.has(rawMemory.id) || retainedMemoryIds.has(rawMemory.id)) return false;
      memoryIds.add(rawMemory.id);
      retainedMemoryIds.add(rawMemory.id);
      if (!isNonNegativeInteger(rawMemory.recordedAt) || !isFiniteNumber(rawMemory.utility)) return false;
    }
    for (const rawLearning of rawAgent.learning) {
      if (isRecord(rawLearning)) {
        if (rawLearning.successes !== undefined && (!isNonNegativeInteger(rawLearning.successes) || Number(rawLearning.successes) > Number(rawLearning.attempts))) return false;
        if (rawLearning.variance !== undefined && !isFiniteNumber(rawLearning.variance, 0)) return false;
        if (rawLearning.expectedYield !== undefined && !isFiniteNumber(rawLearning.expectedYield, 0)) return false;
      }
      if (!isRecord(rawLearning) || typeof rawLearning.context !== "string" || !isNonNegativeInteger(rawLearning.attempts)) return false;
      if (!isFiniteNumber(rawLearning.expectedUtility) || !isNonNegativeInteger(rawLearning.updatedAt)) return false;
    }
    for (const rawRelationship of rawAgent.relationships) {
      if (!isRecord(rawRelationship) || typeof rawRelationship.agentId !== "string" || !isFiniteNumber(rawRelationship.trust, 0, 100)) return false;
      if (!isNonNegativeInteger(rawRelationship.encounters) || !isNonNegativeInteger(rawRelationship.aidGiven) || !isNonNegativeInteger(rawRelationship.aidReceived) || !isNonNegativeInteger(rawRelationship.lastInteractionAt)) return false;
    }
    if (!rawAgent.technologies.every((id) => typeof id === "string" && validTechnologies.has(id))) return false;
    const unlockedTechnologyIds = new Set(rawAgent.technologies as string[]);
    if (unlockedTechnologyIds.size !== rawAgent.technologies.length) return false;
    const projectsByTechnology = new Map<string, {
      project: Record<string, unknown>;
      definition: ResearchDefinition;
    }>();
    const confirmedTechnologyIds = new Set<string>();
    for (const rawProject of rawAgent.research) {
      if (!isRecord(rawProject) || typeof rawProject.id !== "string" || sequenceNumber(rawProject.id, "project") === null || projectIds.has(rawProject.id) || !Array.isArray(rawProject.attempts)) return false;
      projectIds.add(rawProject.id);
      if (typeof rawProject.technologyId !== "string" || !validTechnologies.has(rawProject.technologyId)) return false;
      const definition = RESEARCH_CATALOG.find(({ id }) => id === rawProject.technologyId);
      if (!definition || projectsByTechnology.has(definition.id) || rawProject.hypothesis !== definition.hypothesisTemplate) return false;
      projectsByTechnology.set(definition.id, { project: rawProject, definition });
      if (!isNonNegativeInteger(rawProject.startedAt) || rawProject.startedAt > value.tick || !(rawProject.status === "testing" || rawProject.status === "confirmed")) return false;
      if (!isNonNegativeInteger(rawProject.successfulTrials) || rawProject.requiredSuccessfulTrials !== definition.requiredSuccessfulTrials) return false;
      if (!isFiniteNumber(rawProject.confidence, 0, 100)) return false;
      if (!(rawProject.discoveredAt === null || (isNonNegativeInteger(rawProject.discoveredAt) && rawProject.discoveredAt <= value.tick))) return false;
      let supportedTrials = 0;
      let previousAttemptAt = -1;
      for (const rawAttempt of rawProject.attempts) {
        if (!isRecord(rawAttempt) || typeof rawAttempt.id !== "string" || sequenceNumber(rawAttempt.id, "attempt") === null || attemptIds.has(rawAttempt.id)) return false;
        attemptIds.add(rawAttempt.id);
        if (rawAttempt.agentId !== rawAgent.id || !isNonNegativeInteger(rawAttempt.attemptedAt) || rawAttempt.attemptedAt < rawProject.startedAt || rawAttempt.attemptedAt > value.tick || rawAttempt.attemptedAt < previousAttemptAt) return false;
        previousAttemptAt = rawAttempt.attemptedAt;
        if (!Array.isArray(rawAttempt.procedure) || !Array.isArray(rawAttempt.observationIds) || !isInventory(rawAttempt.materialsConsumed, true)) return false;
        const materialsConsumed = rawAttempt.materialsConsumed as Partial<SurvivalInventory>;
        if (rawAttempt.hypothesis !== rawProject.hypothesis || typeof rawAttempt.evidence !== "string") return false;
        if (rawAttempt.procedure.length !== definition.procedure.length || !rawAttempt.procedure.every((step, index) => step === definition.procedure[index])) return false;
        if (rawAttempt.observationIds.length !== definition.requiredObservations.length || !rawAttempt.observationIds.every((id) => typeof id === "string") || new Set(rawAttempt.observationIds).size !== rawAttempt.observationIds.length) return false;
        for (let evidenceIndex = 0; evidenceIndex < definition.requiredObservations.length; evidenceIndex += 1) {
          const evidenceId = rawAttempt.observationIds[evidenceIndex];
          const expectedKind = definition.requiredObservations[evidenceIndex];
          if (evidenceId !== researchEvidenceObservationId(rawAgent.id, rawProject.id, evidenceIndex)) return false;
          const evidence = observationsById.get(evidenceId);
          if (!evidence || evidence.kind !== "resource" || evidence.observerId !== rawAgent.id) return false;
          if (evidence.facts === undefined || !isRecord(evidence.facts) || evidence.facts.researchEvidence !== true || evidence.facts.resourceKind !== expectedKind) return false;
          if (typeof evidence.subjectId !== "string" || siteKindsById.get(evidence.subjectId) !== expectedKind) return false;
          if (!isNonNegativeInteger(evidence.observedAt) || evidence.observedAt > rawAttempt.attemptedAt) return false;
        }
        if (RESOURCE_KINDS.some((kind) => Number(materialsConsumed[kind] ?? 0) !== Number(definition.inputs[kind] ?? 0))) return false;
        if (!(rawAttempt.result === "supported" || rawAttempt.result === "not_supported") || rawAttempt.utility !== (rawAttempt.result === "supported" ? 10 : -5)) return false;
        if (value.policyVersion === 2) {
          if (!isRecord(rawAttempt.causal) || !isRecord(rawAttempt.causal.context)) return false;
          const c = rawAttempt.causal as unknown as import("./experiments").CausalExperimentEvidence;
          if (JSON.stringify(evaluateCausalExperiment(definition.id, c.dose, c.context)) !== JSON.stringify(c)) return false;
          if ((c.verdict === "supported") !== (rawAttempt.result === "supported")) return false;
        }
        if (rawAttempt.result === "supported") supportedTrials += 1;
      }
      if (supportedTrials !== rawProject.successfulTrials) return false;
      if (rawProject.attempts.length < 1 || rawProject.startedAt !== rawProject.attempts[0].attemptedAt) return false;
      if (rawProject.confidence !== researchProjectConfidence(supportedTrials, definition.requiredSuccessfulTrials, rawProject.attempts.length)) return false;
      if (rawProject.status === "confirmed") {
        confirmedProjectCount += 1;
        const finalAttempt = rawProject.attempts.at(-1);
        if (supportedTrials < definition.requiredSuccessfulTrials || !unlockedTechnologyIds.has(definition.id)) return false;
        if (value.policyVersion === 2 && !hasReplicatedCausalEffect(rawProject.attempts as unknown as ResearchAttempt[], definition.requiredSuccessfulTrials)) return false;
        if (!isRecord(finalAttempt) || finalAttempt.result !== "supported" || rawProject.discoveredAt !== finalAttempt.attemptedAt) return false;
        confirmedTechnologyIds.add(definition.id);
      } else if ((value.policyVersion !== 2 && supportedTrials >= definition.requiredSuccessfulTrials) || rawProject.discoveredAt !== null || unlockedTechnologyIds.has(definition.id)) {
        return false;
      }
    }
    if (confirmedTechnologyIds.size !== unlockedTechnologyIds.size || [...unlockedTechnologyIds].some((id) => !confirmedTechnologyIds.has(id))) return false;
    for (const { project, definition } of projectsByTechnology.values()) {
      for (const prerequisiteId of definition.prerequisiteTechnologies) {
        const prerequisite = projectsByTechnology.get(prerequisiteId)?.project;
        if (!prerequisite || prerequisite.status !== "confirmed" || !isNonNegativeInteger(prerequisite.discoveredAt) || prerequisite.discoveredAt > Number(project.startedAt)) return false;
      }
    }
    if (isRecord(rawAgent.currentDeliberation)) {
      const decision = rawAgent.currentDeliberation;
      if (!isNonNegativeInteger(decision.decidedAt) || decision.decidedAt > value.tick || !GOAL_KINDS.includes(decision.selectedGoal as AgentGoalKind) || !isFiniteNumber(decision.uncertainty, 0, 1) || typeof decision.recordedIntent !== "string") return false;
      if (decision.evidenceSnapshot !== undefined) {
        if (!Array.isArray(decision.evidenceSnapshot) || decision.evidenceSnapshot.length > MAX_OBSERVATIONS) return false;
        if (!decision.evidenceSnapshot.every(o => isRecord(o) && o.observerId === rawAgent.id && typeof o.id === "string" && typeof o.subjectId === "string" && isNonNegativeInteger(o.observedAt) && o.observedAt <= Number(decision.decidedAt) && isFiniteNumber(o.confidence, 0, 1) && isRecord(o.facts) && (o.position === null || isPosition(o.position, bounds)))) return false;
      }
      if (typeof rawAgent.currentDeliberation.id !== "string" || sequenceNumber(rawAgent.currentDeliberation.id, "decision") === null || currentDecisionIds.has(rawAgent.currentDeliberation.id)) return false;
      currentDecisionIds.add(rawAgent.currentDeliberation.id);
      const cited = rawAgent.currentDeliberation.knownObservationIds;
      const candidates = rawAgent.currentDeliberation.candidates;
      if (!Array.isArray(cited) || !Array.isArray(candidates)) return false;
      if (!cited.every((id) => typeof id === "string" && observationIds.has(id))) return false;
      for (const candidate of candidates) {
        if (!isRecord(candidate) || !Array.isArray(candidate.knownObservationIds)) return false;
        if (!GOAL_KINDS.includes(candidate.goal as AgentGoalKind) || !isFiniteNumber(candidate.score) || !isFiniteNumber(candidate.expectedBenefit) || !isFiniteNumber(candidate.risk) || typeof candidate.summary !== "string") return false;
        if (candidate.predictedSteps !== undefined && !isNonNegativeInteger(candidate.predictedSteps)) return false;
        if (candidate.predictedSurvival !== undefined && !isFiniteNumber(candidate.predictedSurvival)) return false;
        if (candidate.planActions !== undefined && (!Array.isArray(candidate.planActions) || !candidate.planActions.every(action => ACTION_KINDS.includes(action as SurvivalActionKind)))) return false;
        if (!candidate.knownObservationIds.every((id) => typeof id === "string" && observationIds.has(id))) return false;
      }
    } else if (rawAgent.currentDeliberation !== null) {
      return false;
    }
    if (isRecord(rawAgent.currentPlan)) {
      if (rawAgent.currentPlan.initialNeeds !== undefined && !isNeedSet(rawAgent.currentPlan.initialNeeds)) return false;
      if (rawAgent.currentPlan.initialInventory !== undefined && !isInventory(rawAgent.currentPlan.initialInventory)) return false;
      if (typeof rawAgent.currentPlan.id !== "string" || sequenceNumber(rawAgent.currentPlan.id, "plan") === null || currentPlanIds.has(rawAgent.currentPlan.id)) return false;
      currentPlanIds.add(rawAgent.currentPlan.id);
      if (!GOAL_KINDS.includes(rawAgent.currentPlan.goal as AgentGoalKind) || !["active", "complete", "failed", "abandoned"].includes(String(rawAgent.currentPlan.status))) return false;
      if (!Array.isArray(rawAgent.currentPlan.steps) || !(rawAgent.currentPlan.targetPosition === null || isPosition(rawAgent.currentPlan.targetPosition, bounds))) return false;
      if (!Number.isInteger(rawAgent.currentPlan.activeStepIndex) || Number(rawAgent.currentPlan.activeStepIndex) < 0 || Number(rawAgent.currentPlan.activeStepIndex) > rawAgent.currentPlan.steps.length) return false;
      for (const rawStep of rawAgent.currentPlan.steps) {
        if (isRecord(rawStep) && rawStep.arrivalRadius!==undefined && (value.policyVersion!==4 || rawStep.action!=="move" || !isFiniteNumber(rawStep.arrivalRadius,.1,MOVEMENT_ARRIVAL_RADIUS)))return false;
        if (isRecord(rawStep) && rawStep.experimentDose !== undefined && !isFiniteNumber(rawStep.experimentDose, 0, 1)) return false;
        if (isRecord(rawStep) && rawStep.resource !== undefined && rawStep.resource !== "freshwater" && rawStep.resource !== "food") return false;
        if (isRecord(rawStep) && rawStep.amount !== undefined && !isFiniteNumber(rawStep.amount, Number.EPSILON, 5)) return false;
        if (!isRecord(rawStep) || typeof rawStep.id !== "string" || sequenceNumber(rawStep.id, "step") === null || retainedStepIds.has(rawStep.id)) return false;
        retainedStepIds.add(rawStep.id);
        if (!ACTION_KINDS.includes(rawStep.action as SurvivalActionKind) || !["pending", "active", "complete", "failed"].includes(String(rawStep.status))) return false;
        if (!(rawStep.destination === null || isPosition(rawStep.destination, bounds))) return false;
        if (!Number.isInteger(rawStep.remainingSteps) || Number(rawStep.remainingSteps) < 0) return false;
      }
    } else if (rawAgent.currentPlan !== null) {
      return false;
    }
    if (!isRecord(rawAgent.currentAction) || !ACTION_KINDS.includes(rawAgent.currentAction.kind as SurvivalActionKind) || !ACTION_STATUSES.includes(rawAgent.currentAction.status as SurvivalCurrentAction["status"])) return false;
    if (!(rawAgent.currentAction.targetId === null || typeof rawAgent.currentAction.targetId === "string")) return false;
    if (!isNonNegativeInteger(rawAgent.currentAction.startedAt) || rawAgent.currentAction.startedAt > value.tick || !isNonNegativeInteger(rawAgent.currentAction.updatedAt) || rawAgent.currentAction.updatedAt > value.tick) return false;
    if (rawAgent.lastOutcome !== null) {
      if (!isRecord(rawAgent.lastOutcome) || !ACTION_KINDS.includes(rawAgent.lastOutcome.action as SurvivalActionKind)) return false;
      if (!isNonNegativeInteger(rawAgent.lastOutcome.tick) || rawAgent.lastOutcome.tick > value.tick || !isFiniteNumber(rawAgent.lastOutcome.utility)) return false;
      if (typeof rawAgent.lastOutcome.success !== "boolean" || typeof rawAgent.lastOutcome.summary !== "string") return false;
      if (rawAgent.lastOutcome.observedYield !== undefined && !isFiniteNumber(rawAgent.lastOutcome.observedYield, 0)) return false;
      if (rawAgent.lastOutcome.decisionId !== undefined && (typeof rawAgent.lastOutcome.decisionId !== "string" || sequenceNumber(rawAgent.lastOutcome.decisionId, "decision") === null)) return false;
    }
    if (rawAgent.alive) {
      if (livingSlots.has(Number(rawAgent.slot))) return false;
      livingSlots.add(Number(rawAgent.slot));
    }
  }
  if (livingSlots.size > Number(config.agentCap)) return false;
  if (!validateSuccessionState(value as unknown as SurvivalRunState)) return false;
  if (!validatePhysicalState(value as unknown as SurvivalRunState)) return false;
  if (!validateDiscoveryState(value as unknown as SurvivalRunState)) return false;
  if (!validateGeology(value as unknown as SurvivalRunState)) return false;
  if (!validateSurvivalExperience(value as unknown as SurvivalRunState)) return false;

  const eventIds = new Set<string>();
  const eventSequenceNumbers: number[] = [];
  for (const rawEvent of rawEvents) {
    if (!isRecord(rawEvent) || typeof rawEvent.id !== "string" || eventIds.has(rawEvent.id)) return false;
    const eventSequence = sequenceNumber(rawEvent.id, "event");
    if (eventSequence === null) return false;
    eventSequenceNumbers.push(eventSequence);
    eventIds.add(rawEvent.id);
    if (!isNonNegativeInteger(rawEvent.tick) || !Number.isInteger(rawEvent.day) || Number(rawEvent.day) < 1) return false;
    if (!EVENT_TYPES.includes(rawEvent.type as SurvivalEventType) || !EVENT_CATEGORIES.includes(rawEvent.category as SurvivalEventCategory)) return false;
    if (!Array.isArray(rawEvent.agentIds) || !rawEvent.agentIds.every((id) => typeof id === "string" && ids.has(id))) return false;
    if (!(rawEvent.position === null || isPosition(rawEvent.position, bounds)) || !isRecord(rawEvent.facts)) return false;
    if (typeof rawEvent.summary !== "string" || typeof rawEvent.outcome !== "string" || typeof rawEvent.intervention !== "boolean") return false;
  }

  const stats = value.stats;
  if (!isNonNegativeInteger(stats.livingAgents) || stats.livingAgents !== livingSlots.size) return false;
  if (!isNonNegativeInteger(stats.peakLivingAgents) || stats.peakLivingAgents < livingSlots.size || stats.peakLivingAgents > Number(config.agentCap)) return false;
  if (!isNonNegativeInteger(stats.totalAgentsIntroduced) || stats.totalAgentsIntroduced !== rawAgents.length) return false;
  const deadCount = rawAgents.filter((agent) => isRecord(agent) && agent.alive === false).length;
  if (!isNonNegativeInteger(stats.deaths) || stats.deaths !== deadCount) return false;
  if (!isNonNegativeInteger(stats.decisions)) return false;
  if (!isNonNegativeInteger(stats.experiments) || stats.experiments !== attemptIds.size) return false;
  if (!isNonNegativeInteger(stats.discoveries) || stats.discoveries !== confirmedProjectCount) return false;
  const interventions = rawAgents.filter((agent) => isRecord(agent) && agent.spawnSource === "observer").length;
  if (!isNonNegativeInteger(stats.observerInterventions) || stats.observerInterventions !== interventions) return false;
  if (!isNonNegativeInteger(stats.planSteps) || !isNonNegativeInteger(stats.memories)) return false;
  const configuredEndMinutes = config.durationHours === null ? null : Number(config.durationHours) * 60;
  const durationReached = configuredEndMinutes !== null && Number(value.elapsedMinutes) >= configuredEndMinutes;
  if (value.status === "completed" && !durationReached) return false;
  if (value.status === "extinct" && (livingSlots.size !== 0 || durationReached)) return false;
  if ((value.status === "running" || value.status === "paused") && (livingSlots.size === 0 || durationReached)) return false;

  const window = value.eventWindow;
  const totalEvents = window.totalEvents;
  const droppedEvents = window.droppedEvents;
  if (window.capacity !== SURVIVAL_EVENT_RING_LIMIT || !isNonNegativeInteger(totalEvents) || !isNonNegativeInteger(droppedEvents)) return false;
  if (rawEvents.length > SURVIVAL_EVENT_RING_LIMIT || droppedEvents !== totalEvents - rawEvents.length) return false;
  if (window.firstRetainedTick !== (rawEvents[0]?.tick ?? null)) return false;
  if (eventSequenceNumbers.some((sequence, index) => sequence !== droppedEvents + index + 1)) return false;

  const expectedNextIds: SurvivalRunState["nextIds"] = {
    agent: rawAgents.length + 1,
    event: totalEvents + 1,
    decision: stats.decisions + 1,
    plan: stats.decisions + 1,
    step: stats.planSteps + 1,
    memory: stats.memories + 1,
    project: projectIds.size + 1,
    attempt: stats.experiments + 1,
    structure: structureIds.size + 1,
  };
  const nextIdKinds = Object.keys(expectedNextIds) as MutableIdKind[];
  const rawNextIds = value.nextIds;
  if (Object.keys(rawNextIds).length !== nextIdKinds.length) return false;
  if (!nextIdKinds.every((kind) => isNonNegativeInteger(rawNextIds[kind]) && rawNextIds[kind] === expectedNextIds[kind])) return false;
  const validatedNextIds = rawNextIds as unknown as SurvivalRunState["nextIds"];
  const retainedSequences: Array<[Set<string>, MutableIdKind]> = [
    [ids, "agent"],
    [currentDecisionIds, "decision"],
    [currentPlanIds, "plan"],
    [retainedStepIds, "step"],
    [retainedMemoryIds, "memory"],
    [projectIds, "project"],
    [attemptIds, "attempt"],
    [structureIds, "structure"],
  ];
  for (const [retainedIds, kind] of retainedSequences) {
    if ([...retainedIds].some((id) => {
      const sequence = sequenceNumber(id, kind);
      return sequence === null || sequence >= validatedNextIds[kind];
    })) return false;
  }
  const sole = value.soleSurvivor;
  if (!isNonNegativeInteger(sole.epoch) || !isNonNegativeInteger(sole.previousLivingCount) || sole.previousLivingCount > Number(config.agentCap)) return false;
  if (!(sole.agentId === null || (typeof sole.agentId === "string" && ids.has(sole.agentId)))) return false;
  if (!(sole.companionAgentId === null || (typeof sole.companionAgentId === "string" && ids.has(sole.companionAgentId)))) return false;
  if (!(sole.decidedAt === null || (isNonNegativeInteger(sole.decidedAt) && sole.decidedAt <= value.tick))) return false;
  if (!(sole.decision === null || sole.decision === "requested" || sole.decision === "declined")) return false;
  return true;
}

function validateSuccessionState(state: SurvivalRunState): boolean {
  const { succession, agents, tick } = state;
  if (succession === undefined) return agents.every(a => a.lineage === undefined && a.successionReview === undefined && a.knownSuccessionPredecessors === undefined && a.spawnSource !== "autonomous_successor");
  if ((state.policyVersion !== 2 && state.policyVersion !== 3 && state.policyVersion !== 4) || !isRecord(succession) || succession.version !== 1 || !isNonNegativeInteger(succession.enabledAt) || succession.enabledAt > tick || !Array.isArray(succession.plans) || succession.plans.length > agents.length) return false;
  const byId = new Map(agents.map(a => [a.id, a]));
  const evidenceValid = (value: unknown, owner: SurvivalAgent, when: number) => Array.isArray(value) && value.length <= 5 && new Set(value.map(o => o?.id)).size === value.length && value.every(o =>
    isRecord(o) && typeof o.id === "string" && o.observerId === owner.id && typeof o.subjectId === "string" && ["agent","resource","weather","structure"].includes(String(o.kind))
    && isNonNegativeInteger(o.observedAt) && o.observedAt <= when && isFiniteNumber(o.confidence,0,1)
    && (o.receivedAt === undefined ? o.observedAt >= owner.spawnedAt : isNonNegativeInteger(o.receivedAt) && o.receivedAt >= Math.max(owner.spawnedAt,o.observedAt) && o.receivedAt <= when)
    && (o.position === null || isPosition(o.position,state.environment.bounds)) && isRecord(o.facts));
  for (const agent of agents) {
    const receipts = agent.knownSuccessionPredecessors;
    if (receipts !== undefined && (!Array.isArray(receipts) || receipts.length > agents.length || new Set(receipts).size !== receipts.length || !receipts.every(id => typeof id === "string" && succession.plans.some(p => p?.predecessorId === id)))) return false;
    const lineage = agent.lineage;
    if (lineage !== undefined && (!isRecord(lineage) || agent.spawnSource !== "autonomous_successor" || !Number.isInteger(lineage.generation) || lineage.generation < 2 || !byId.has(lineage.predecessorId) || !byId.has(lineage.sponsorId) || typeof lineage.planId !== "string")) return false;
    if (agent.spawnSource === "autonomous_successor" && !lineage) return false;
    const review = agent.successionReview;
    if (review !== undefined) {
      if (!isRecord(review) || !byId.has(review.predecessorId) || !["before_death","after_death"].includes(review.mode) || (review.mode === "before_death") !== (review.predecessorId === agent.id)) return false;
      if (!isNonNegativeInteger(review.checkedAt) || review.checkedAt < Math.max(succession.enabledAt,agent.spawnedAt + SUCCESSION_MATURITY_STEPS) || review.checkedAt > tick || (agent.diedAt !== null && review.checkedAt > agent.diedAt) || review.reconsiderAfter !== review.checkedAt + SUCCESSION_REVIEW_STEPS) return false;
      if (!["planned","deferred","declined"].includes(review.choice) || typeof review.rationale !== "string" || review.rationale.length > 2000 || !isFiniteNumber(review.score,0,1) || !evidenceValid(review.evidence,agent,review.checkedAt)) return false;
      if (review.mode === "after_death") {
        const predecessor = byId.get(review.predecessorId)!;
        if (predecessor.alive || predecessor.diedAt === null || predecessor.diedAt > review.checkedAt || !review.evidence.some(o => o.kind === "agent" && o.subjectId === predecessor.id && o.facts.alive === false && o.observedAt >= predecessor.diedAt!)) return false;
      }
      if (review.choice === "planned" && !succession.plans.some(p => p?.sponsorId === agent.id && p?.predecessorId === review.predecessorId && p?.plannedAt === review.checkedAt)) return false;
    }
  }
  const predecessors = new Set<string>(), children = new Set<string>();
  for (const plan of succession.plans) {
    if (!isRecord(plan) || typeof plan.predecessorId !== "string" || typeof plan.sponsorId !== "string" || plan.id !== `succession-${plan.predecessorId}` || predecessors.has(plan.predecessorId)) return false;
    predecessors.add(plan.predecessorId);
    const predecessor = byId.get(plan.predecessorId), sponsor = byId.get(plan.sponsorId);
    if (!predecessor || !sponsor || !["before_death","after_death"].includes(plan.mode) || (plan.mode === "before_death") !== (predecessor.id === sponsor.id)) return false;
    if (!isNonNegativeInteger(plan.plannedAt) || plan.plannedAt < succession.enabledAt || plan.plannedAt < sponsor.spawnedAt + SUCCESSION_MATURITY_STEPS || plan.plannedAt > tick || (sponsor.diedAt !== null && plan.plannedAt > sponsor.diedAt)) return false;
    if (typeof plan.rationale !== "string" || plan.rationale.length > 2000 || !isFiniteNumber(plan.score,0,1) || !isPosition(plan.position,state.environment.bounds) || !evidenceValid(plan.evidence,sponsor,plan.plannedAt)) return false;
    if (plan.mode === "after_death" && (predecessor.alive || predecessor.diedAt === null || predecessor.diedAt > plan.plannedAt || !plan.evidence.some(o => o.kind === "agent" && o.subjectId === predecessor.id && o.facts.alive === false && o.observedAt >= predecessor.diedAt!))) return false;
    if (!isRecord(plan.provisions) || plan.provisions.freshwater !== SUCCESSION_PROVISIONS.freshwater || plan.provisions.food !== SUCCESSION_PROVISIONS.food || Object.keys(plan.provisions).length !== 2) return false;
    if (plan.status === "pending") {
      if (plan.successorId !== null || plan.fulfilledAt !== null) return false;
    } else if (plan.status === "fulfilled") {
      const child = typeof plan.successorId === "string" ? byId.get(plan.successorId) : null;
      if (!child || children.has(child.id) || child.spawnSource !== "autonomous_successor" || child.lineage?.planId !== plan.id || child.lineage.predecessorId !== predecessor.id || child.lineage.sponsorId !== sponsor.id || child.lineage.generation !== (predecessor.lineage?.generation ?? 1) + 1) return false;
      if (!isNonNegativeInteger(plan.fulfilledAt) || plan.fulfilledAt < plan.plannedAt || plan.fulfilledAt > tick || child.spawnedAt !== plan.fulfilledAt || predecessor.alive || predecessor.diedAt === null || predecessor.diedAt > plan.fulfilledAt) return false;
      if (sequenceNumber(predecessor.id,"agent")! >= sequenceNumber(child.id,"agent")! || sequenceNumber(sponsor.id,"agent")! >= sequenceNumber(child.id,"agent")!) return false;
      children.add(child.id);
    } else return false;
  }
  if (state.status === "extinct" && succession.plans.some(p => p.status === "pending" && byId.get(p.predecessorId)?.alive === false)) return false;
  return agents.filter(a => a.spawnSource === "autonomous_successor").every(a => children.has(a.id));
}

export function restoreSurvivalRun(input: string | unknown): SurvivalRunState {
  let value: unknown;
  try {
    value = typeof input === "string" ? JSON.parse(input) : input;
  } catch {
    throw new TypeError("Invalid survival run checkpoint.");
  }
  try {
    return normalizeSurvivalRun(value);
  } catch {
    throw new TypeError("Invalid survival run checkpoint.");
  }
}

/**
 * Clones, upgrades the local pre-event-window schema-1 shape, and validates a
 * checkpoint. This is also safe to call on an already-materialized HMR state.
 */
export function normalizeSurvivalRun(input: unknown): SurvivalRunState {
  let value: unknown;
  try {
    value = structuredClone(input);
  } catch {
    throw new TypeError("Invalid survival run checkpoint.");
  }
  if (!isRecord(value)) throw new TypeError("Invalid survival run checkpoint.");
  upgradeLegacyStateInPlace(value as unknown as SurvivalRunState);
  if (!validateSurvivalRun(value)) throw new TypeError("Invalid survival run checkpoint.");
  return value;
}
