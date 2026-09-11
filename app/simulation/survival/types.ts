/**
 * JSON-safe contracts for the focused survival experiment.
 *
 * The observer may change playback and add an agent through the explicit
 * intervention API. Everything else in this file is simulation state. There
 * are deliberately no personality, profession, job, or assigned-strategy
 * fields on an agent.
 */

export type SurvivalSeed = number | string;
export type AgentLimit = 1 | 2 | 3 | 4 | 5;
export type ResourceAbundance = "scarce" | "balanced" | "plentiful";
export type ClimateVolatility = "stable" | "variable" | "harsh";
export type RunStatus = "running" | "paused" | "completed" | "extinct";
export type WeatherKind = "clear" | "overcast" | "rain" | "storm" | "cold_snap" | "heat_wave";

export interface SurvivalPosition {
  x: number;
  z: number;
}

export interface SurvivalObjective {
  kind: "survive";
  statement: "Survive as long as possible.";
}

export interface SurvivalRunOptions {
  materialFoundation?: "geology-v1";
  /** Explicit opt-in for executable thermal/material transformations. */
  knowledgeFoundation?: "materials-v1";
  /** Explicit opt-in for persistent, non-conscious affective control signals. */
  affectModel?: "adaptive-v1";
  policyVersion?: 2 | 3 | 4;
  continuity?: boolean;
  agentCount?: AgentLimit;
  agentCap?: AgentLimit;
  /** Omit or use null for the normal open-ended study. A number is an explicit finite evaluation horizon. */
  durationHours?: number | null;
  resourceAbundance?: ResourceAbundance;
  climateVolatility?: ClimateVolatility;
  worldSize?: number;
}

export interface SurvivalRunConfig {
  materialFoundation?: "geology-v1";
  knowledgeFoundation?: "materials-v1";
  affectModel?: "adaptive-v1";
  continuity?: boolean;
  initialAgentCount: AgentLimit;
  agentCap: AgentLimit;
  durationHours: number | null;
  resourceAbundance: ResourceAbundance;
  climateVolatility: ClimateVolatility;
  worldSize: number;
  stepMinutes: 10;
  objective: SurvivalObjective;
}

export type SurvivalResourceKind =
  | "freshwater"
  | "food"
  | "wood"
  | "stone"
  | "fiber"
  | "herbs"
  | "clay";

export type SurvivalInventory = Record<SurvivalResourceKind, number>;

export interface SurvivalResourceSite {
  /** Observer-only raw-rock identity. Not a refined material or agent assay. */
  feedstock?: import("./geology").GeologicalFeedstock;
  id: string;
  kind: SurvivalResourceKind;
  position: SurvivalPosition;
  quantity: number;
  capacity: number;
  regenerationPerDay: number;
  contaminated: boolean;
}

export type SurvivalStructureKind = "shelter" | "fire" | "storage";

export interface SurvivalStructure {
  id: string;
  kind: SurvivalStructureKind;
  position: SurvivalPosition;
  builtAt: number;
  builderIds: string[];
  condition: number;
  stored: SurvivalInventory;
}

export interface SurvivalEnvironment {
  size: number;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  daylight: number;
  temperatureC: number;
  weather: WeatherKind;
  weatherChangedAt: number;
  resources: SurvivalResourceSite[];
  structures: SurvivalStructure[];
}

/** All values use one direction: 100 is best and 0 is worst. */
export interface SurvivalNeeds {
  health: number;
  hydration: number;
  nutrition: number;
  energy: number;
  warmth: number;
  safety: number;
}

export type AgentObservationKind = "resource" | "agent" | "weather" | "structure" | "outcome";
export type FactValue = string | number | boolean | null;

export interface AgentObservation {
  receivedAt?: number;
  originalObserverId?: string;
  transmissionChain?: string[];
  id: string;
  observerId: string;
  kind: AgentObservationKind;
  subjectId: string;
  observedAt: number;
  position: SurvivalPosition | null;
  confidence: number;
  facts: Record<string, FactValue>;
}

export interface AgentMemory {
  id: string;
  recordedAt: number;
  action: SurvivalActionKind;
  targetId: string | null;
  result: "helpful" | "neutral" | "harmful" | "failed";
  utility: number;
  summary: string;
}

export interface AgentLearning {
  successes?: number;
  variance?: number;
  expectedYield?: number;
  context: string;
  attempts: number;
  expectedUtility: number;
  updatedAt: number;
}

export interface AgentRelationship {
  agentId: string;
  trust: number;
  encounters: number;
  aidGiven: number;
  aidReceived: number;
  lastInteractionAt: number;
}

export type AgentGoalKind =
  | "secure_water"
  | "secure_food"
  | "recover"
  | "stay_warm"
  | "seek_safety"
  | "explore"
  | "gather_material"
  | "build_shelter"
  | "research"
  | "develop_capability"
  | "share"
  | "request_help"
  | "cooperate"
  | "wait";

export type SurvivalActionKind =
  | "move"
  | "collect"
  | "drink"
  | "eat"
  | "rest"
  | "warm"
  | "shelter"
  | "explore"
  | "gather"
  | "build"
  | "prepare_experiment"
  | "test_hypothesis"
  | "review_evidence"
  | "process_material"
  | "test_material"
  | "share"
  | "request"
  | "cooperate"
  | "wait";

export interface AgentDecisionCandidate {
  predictedSteps?: number;
  predictedSurvival?: number;
  planActions?: SurvivalActionKind[];
  goal: AgentGoalKind;
  targetId: string | null;
  score: number;
  expectedBenefit: number;
  risk: number;
  knownObservationIds: string[];
  summary: string;
}

/** A factual decision record, not hidden chain-of-thought or consciousness. */
export interface AgentDeliberation {
  physicalEvidenceSnapshot?: import("./physical-types").PhysicalReading[];
  policyVersion?: number;
  evidenceSnapshot?: AgentObservation[];
  id: string;
  decidedAt: number;
  selectedGoal: AgentGoalKind;
  candidates: AgentDecisionCandidate[];
  knownObservationIds: string[];
  uncertainty: number;
  recordedIntent: string;
}

export type PlanStepStatus = "pending" | "active" | "complete" | "failed";

export interface SurvivalPlanStep {
  /** Policy-4 work approaches can request a precise position, not movement orders from the observer. */
  arrivalRadius?: number;
  manipulation?: import("./physical-types").Manipulation;
  materialOperation?: import("./material-types").MaterialOperation;
  experimentDose?: number;
  resource?: "freshwater" | "food";
  amount?: number;
  id: string;
  action: SurvivalActionKind;
  targetId: string | null;
  destination: SurvivalPosition | null;
  remainingSteps: number;
  status: PlanStepStatus;
}

export interface SurvivalPlan {
  discoveryProjectId?: string;
  materialGoalId?: string;
  initialInventory?: SurvivalInventory;
  decisionId?: string;
  initialNeeds?: SurvivalNeeds;
  id: string;
  formedAt: number;
  goal: AgentGoalKind;
  targetId: string | null;
  targetPosition: SurvivalPosition | null;
  status: "active" | "complete" | "failed" | "abandoned";
  rationale: string;
  activeStepIndex: number;
  steps: SurvivalPlanStep[];
}

export interface SurvivalCurrentAction {
  kind: SurvivalActionKind;
  status: "moving" | "acting" | "resting" | "awaiting_decision" | "blocked" | "complete";
  targetId: string | null;
  startedAt: number;
  updatedAt: number;
}

export interface SurvivalActionOutcome {
  decisionId?: string;
  observedYield?: number;
  tick: number;
  action: SurvivalActionKind;
  targetId: string | null;
  success: boolean;
  utility: number;
  summary: string;
}

export type TechnologyId =
  | "controlled_fire"
  | "knapped_edge"
  | "twisted_cordage"
  | "fired_vessel"
  | "water_boiling"
  | "food_smoking"
  | "herbal_poultice";

export interface ResearchDefinition {
  id: TechnologyId;
  discoveryName: string;
  hypothesisTemplate: string;
  /** Small modeled consequence used by the survival loop after confirmation. */
  survivalEffect: string;
  inputs: Partial<SurvivalInventory>;
  prerequisiteTechnologies: TechnologyId[];
  requiredObservations: SurvivalResourceKind[];
  procedure: string[];
  requiredSuccessfulTrials: number;
  difficulty: number;
}

export interface ResearchAttempt {
  causal?: import("./experiments").CausalExperimentEvidence;
  id: string;
  attemptedAt: number;
  agentId: string;
  hypothesis: string;
  materialsConsumed: Partial<SurvivalInventory>;
  procedure: string[];
  observationIds: string[];
  result: "supported" | "not_supported";
  evidence: string;
  utility: number;
}

export interface AgentResearchProject {
  id: string;
  technologyId: TechnologyId;
  hypothesis: string;
  startedAt: number;
  status: "testing" | "confirmed";
  attempts: ResearchAttempt[];
  successfulTrials: number;
  requiredSuccessfulTrials: number;
  confidence: number;
  discoveredAt: number | null;
}

export interface SurvivalAgent {
  /** Embedded in inventory.stone; observer provenance, not extra inventory. */
  rawFeedstocks?: import("./geology").FeedstockMass;
  /** New studies only: private, fallible material expectations and evidence. */
  materialMind?: import("./material-types").MaterialMind;
  /** Authored control signals derived from experienced conditions, not consciousness. */
  affect?: import("./affect").AgentAffect;
  /** Policy 4 only: private goals, contextual expectations and executed evidence. */
  discovery?: import("./discovery-types").DiscoveryMind;
  /** Private route experience; never populated from the observer's global map. */
  navigation?: AgentNavigation;
  /** Observer-only measurements. The policy input explicitly excludes this record. */
  survivalRecord?: AgentSurvivalRecord;
  physicalMind?: import("./physical-types").PhysicalMind;
  lineage?: { generation: number; predecessorId: string; sponsorId: string; planId: string };
  successionReview?: SuccessionReview;
  /** Admission receipts personally received after a funding attempt, not global knowledge. */
  knownSuccessionPredecessors?: string[];
  materialSamples?: Partial<Record<SurvivalResourceKind, { sourceId: string; sampledAt: number; contamination: number | null; activity: number | null }>>;
  id: string;
  label: `A${AgentLimit}`;
  slot: AgentLimit;
  /** Increments when a deceased occupant's visual slot is reused. */
  slotGeneration: number;
  name: string;
  spawnSource: "initial" | "observer" | "autonomous_companion" | "autonomous_successor";
  spawnedAt: number;
  alive: boolean;
  diedAt: number | null;
  causeOfDeath: string | null;
  position: SurvivalPosition;
  needs: SurvivalNeeds;
  inventory: SurvivalInventory;
  observations: AgentObservation[];
  memory: AgentMemory[];
  learning: AgentLearning[];
  relationships: AgentRelationship[];
  technologies: TechnologyId[];
  research: AgentResearchProject[];
  currentDeliberation: AgentDeliberation | null;
  currentPlan: SurvivalPlan | null;
  currentAction: SurvivalCurrentAction;
  lastOutcome: SurvivalActionOutcome | null;
}

export type SurvivalEventType =
  | "run_started"
  | "agent_added"
  | "agent_died"
  | "decision_recorded"
  | "action_outcome"
  | "resource_observed"
  | "structure_built"
  | "social_proposal"
  | "social_accepted"
  | "social_refused"
  | "experiment"
  | "discovery"
  | "sole_survivor_decision"
  | "succession_enabled"
  | "succession_decision"
  | "run_completed"
  | "run_extinct";

export type SurvivalEventCategory = "run" | "agent" | "survival" | "social" | "research" | "environment";

export interface SurvivalEvent {
  id: string;
  tick: number;
  day: number;
  type: SurvivalEventType;
  category: SurvivalEventCategory;
  agentIds: string[];
  summary: string;
  outcome: string;
  position: SurvivalPosition | null;
  facts: Record<string, FactValue>;
  intervention: boolean;
}

export interface SoleSurvivorState {
  epoch: number;
  previousLivingCount: number;
  agentId: string | null;
  decidedAt: number | null;
  decision: "requested" | "declined" | null;
  rationale: string | null;
  companionAgentId: string | null;
}

/** Optional continuity objective, separate from the original survival planner. */
export interface SuccessionReview {
  predecessorId: string;
  mode: "before_death" | "after_death";
  checkedAt: number;
  reconsiderAfter: number;
  choice: "planned" | "deferred" | "declined";
  score: number;
  rationale: string;
  evidence: AgentObservation[];
}

export interface SuccessionPlan {
  id: string;
  predecessorId: string;
  sponsorId: string;
  mode: SuccessionReview["mode"];
  plannedAt: number;
  position: SurvivalPosition;
  rationale: string;
  score: number;
  evidence: AgentObservation[];
  /** Debited from the sponsor once at commitment, transferred once at admission. */
  provisions: { freshwater: number; food: number };
  status: "pending" | "fulfilled";
  successorId: string | null;
  fulfilledAt: number | null;
}

export interface SuccessionState {
  version: 1;
  enabledAt: number;
  /** One entitlement per immutable predecessor ID, retained beyond the event tail. */
  plans: SuccessionPlan[];
}

export interface SurvivalRunStats {
  livingAgents: number;
  peakLivingAgents: number;
  totalAgentsIntroduced: number;
  deaths: number;
  decisions: number;
  experiments: number;
  discoveries: number;
  observerInterventions: number;
  /** Exact high-water counts used to validate deterministic ID sequences. */
  planSteps: number;
  memories: number;
}

export interface SurvivalEventWindow {
  /** Maximum number of recent events retained inside the run checkpoint. */
  capacity: number;
  /** Total events emitted since the run began, including archived/dropped rows. */
  totalEvents: number;
  /** Oldest events no longer held in `events`; archive `advance.events` externally if needed. */
  droppedEvents: number;
  firstRetainedTick: number | null;
}

export interface SurvivalRunState {
  materials?: import("./material-types").MaterialWorld;
  geology?: import("./geology").GeologyState;
  survivalRevision?: 1;
  physical?: import("./physical-types").PhysicalWorld;
  succession?: SuccessionState;
  /** Missing means the preserved original policy; new runs use version 2. */
  policyVersion?: 1 | 2 | 3 | 4;
  schemaVersion: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  id: string;
  seed: number;
  seedLabel: string;
  config: SurvivalRunConfig;
  status: RunStatus;
  tick: number;
  elapsedMinutes: number;
  day: number;
  timeOfDay: number;
  environment: SurvivalEnvironment;
  agents: SurvivalAgent[];
  /** Bounded, chronological recent-event window. */
  events: SurvivalEvent[];
  eventWindow: SurvivalEventWindow;
  stats: SurvivalRunStats;
  nextIds: Record<"agent" | "event" | "decision" | "plan" | "step" | "memory" | "project" | "attempt" | "structure", number>;
  soleSurvivor: SoleSurvivorState;
}

export interface AgentNavigation {
  destination: SurvivalPosition | null;
  waypoints: SurvivalPosition[];
  recent: Array<{ tick: number; position: SurvivalPosition }>;
  blocked: Array<{ tick: number; from: SurvivalPosition; to: SurvivalPosition }>;
  failures: number;
  retryAt: number;
}

export interface AgentSurvivalRecord {
  since: number;
  samples: Array<{ tick: number; health: number; hydration: number; nutrition: number; warmth: number }>;
  lastDrinkAt: number | null;
  lastMealAt: number | null;
  blockedMoves: number;
  refusedRequests: number;
  incidents: Array<{ tick: number; action: SurvivalActionKind; success: boolean; summary: string }>;
}

export interface SurvivalAdvanceResult {
  state: SurvivalRunState;
  events: SurvivalEvent[];
  stepsProcessed: number;
}

export interface AddObserverAgentResult {
  ok: boolean;
  state: SurvivalRunState;
  agent: SurvivalAgent | null;
  event: SurvivalEvent | null;
  reason?: "agent_cap_reached" | "run_completed" | "replacement_not_available" | "sole_survivor_decides";
}
