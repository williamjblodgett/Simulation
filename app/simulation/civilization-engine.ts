/**
 * Wildgrid: Sovereignty's deterministic civilization simulation.
 *
 * This module deliberately has no renderer, DOM, or storage dependency. Every
 * branch of CivilizationWorldState is JSON serializable. and the PRNG state is
 * stored in the world, which makes a seed plus a sequence of deltas replayable.
 */

export const CIVILIZATION_SCHEMA_VERSION = 2 as const;
export const DEFAULT_CIVILIZATION_SEED = 0x53_4f_56_45;
export const FIXED_STEP = 0.25;
export const WORLD_HALF_SIZE = 100;
export const DAY_LENGTH = 90;
export const MAX_POPULATION = 160;
export const MAX_ACTIVE_CAMPS = 48;

const TAU = Math.PI * 2;
const EPSILON = 0.000_001;
const MAX_FOREGROUND_DELTA = 90;
const MAX_CATCH_UP_STEPS = 360;
export const EXACT_CATCH_UP_LIMIT_SECONDS = MAX_CATCH_UP_STEPS * FIXED_STEP;
const MAX_LONG_GAP_STEPS = 48;
const MAX_MAJOR_EVENTS = 1_000;
const MAX_BELIEF_SYSTEMS = 36;
const MAX_AGENT_MEMORIES = 8;
const MAX_DELIBERATION_ALTERNATIVES = 3;
const STRATEGY_INTERVAL = 5;
const CAMP_STORAGE_LIMIT = 600;

export type SeedInput = number | string;
export type ResourceKind = "food" | "water" | "wood" | "ore";
export type BeliefTenetId =
  | "reciprocal_aid"
  | "land_stewardship"
  | "ancestor_memory"
  | "martial_merit"
  | "knowledge_seeking"
  | "ordered_duty"
  | "free_conscience"
  | "shared_prosperity";
export type TechnologyId =
  | "basic_tools"
  | "agriculture"
  | "wells"
  | "masonry"
  | "bronze_working"
  | "medicine"
  | "writing"
  | "logistics"
  | "governance";
export type StructureKind =
  | "shelter"
  | "farm"
  | "well"
  | "walls"
  | "workshop"
  | "infirmary"
  | "archive"
  | "roads"
  | "council";
export type AgentAction =
  | "idle"
  | "wander"
  | "eat"
  | "drink"
  | "rest"
  | "gather_food"
  | "gather_water"
  | "gather_wood"
  | "mine_ore"
  | "return_camp"
  | "build"
  | "research"
  | "reproduce"
  | "raid"
  | "defend"
  | "negotiate"
  | "recruit"
  | "defect"
  | "breakaway"
  | "coup"
  | "join_camp"
  | "flee";
export type AgentPlan =
  | "survive"
  | "secure_food"
  | "secure_water"
  | "stockpile"
  | "fortify"
  | "advance_knowledge"
  | "grow_lineage"
  | "expand_influence"
  | "defend_home"
  | "weaken_rival"
  | "make_peace"
  | "change_allegiance"
  | "seize_leadership"
  | "found_camp"
  | "seek_home";
export type AgentOutcome = "success" | "mixed" | "setback";
export type DiplomaticStatus = "neutral" | "alliance" | "truce" | "war";
export type EventTone = "neutral" | "positive" | "warning" | "critical";
export type MajorEventType =
  | "world_started"
  | "birth"
  | "death"
  | "camp_founded"
  | "camp_destroyed"
  | "camp_captured"
  | "defection"
  | "join"
  | "breakaway"
  | "coup"
  | "alliance"
  | "truce"
  | "war"
  | "peace"
  | "tech_unlocked"
  | "leadership_change"
  | "power_lead_change"
  | "belief_founded"
  | "belief_conversion_wave"
  | "belief_schism"
  | "belief_reformed"
  | "belief_rejected"
  | "belief_faded"
  | "shrine_built";
export type AgentTargetKind = "resource" | "agent" | "camp" | "point";

export interface Vec2 {
  x: number;
  z: number;
}

export interface Inventory {
  food: number;
  water: number;
  wood: number;
  ore: number;
}

export interface RelationshipState {
  trust: number;
  respect: number;
  grievance: number;
  lastInteractionDay: number;
}

export interface AgentTarget {
  kind: AgentTargetKind;
  id: string;
  label: string;
  position: Vec2;
}

/** A learned estimate starts empty for every agent and changes only after outcomes. */
export interface AgentPlanLearning {
  attempts: number;
  expectedValue: number;
}

export interface AgentDecisionAlternative {
  plan: AgentPlan;
  goal: string;
  score: number;
}

/** UI-ready account of the choice an agent most recently made. */
export interface AgentDeliberation {
  formedDay: number;
  chosenPlan: AgentPlan;
  statement: string;
  confidence: number;
  alternatives: AgentDecisionAlternative[];
}

/** Bounded autobiographical evidence used by the local learning rule. */
export interface AgentMemory {
  id: string;
  day: number;
  plan: AgentPlan;
  outcome: AgentOutcome;
  score: number;
  summary: string;
}

export interface AgentOutcomeSignals {
  health: number;
  nutrition: number;
  hydration: number;
  energy: number;
  personalPower: number;
  influence: number;
  knowledge: number;
  family: number;
  campSecurity: number;
  resources: number;
}

/** Persisted baseline for reflecting on a plan when the next choice is due. */
export interface AgentDecisionSnapshot {
  formedTime: number;
  formedDay: number;
  plan: AgentPlan;
  signals: AgentOutcomeSignals;
}

export interface AgentInfluenceBreakdown {
  agentId: string;
  socialInfluence: number;
  spiritualInfluence: number;
  achievedInfluence: number;
  personalPower: number;
  knowledge: number;
  directDescendants: number;
}

export interface AgentFamilyTreeOptions {
  direction?: "ancestors" | "descendants" | "both";
  maxDepth?: number;
  maxNodes?: number;
}

export interface AgentFamilyTreeNode {
  id: string;
  name: string;
  alive: boolean;
  generation: number;
  campId: string | null;
  parentIds: string[];
  childrenIds: string[];
  achievedInfluence: number;
}

export interface AgentFamilyTreeEdge {
  parentId: string;
  childId: string;
}

export interface AgentFamilyTree {
  rootId: string;
  nodes: AgentFamilyTreeNode[];
  edges: AgentFamilyTreeEdge[];
  unresolvedIds: string[];
  truncated: boolean;
}

export interface CivilizationAgent {
  id: string;
  name: string;
  color: string;
  position: Vec2;
  velocity: Vec2;
  heading: number;
  /** Base physical values are identical for all founders. */
  speed: number;
  capacity: number;
  /** Age is expressed in world-days. */
  age: number;
  generation: number;
  parentIds: string[];
  childrenIds: string[];
  bornAtDay: number;
  alive: boolean;
  deathDay: number | null;
  health: number;
  hunger: number;
  hydration: number;
  energy: number;
  inventory: Inventory;
  campId: string | null;
  currentPlan: AgentPlan;
  goal: string;
  rationale: string;
  action: AgentAction;
  target: AgentTarget | null;
  actionProgress: number;
  decisionTimer: number;
  personalPower: number;
  influence: number;
  knowledge: number;
  experience: number;
  relationships: Record<string, RelationshipState>;
  loyalty: number;
  satisfaction: number;
  lastReproductionDay: number;
  joinedCampDay: number;
  unaffiliatedSinceDay: number | null;
  kills: number;
  harvested: number;
  buildContribution: number;
  researchContribution: number;
  /** A null value is a valid autonomous choice: agents can remain secular. */
  beliefId: string | null;
  conviction: number;
  spiritualInfluence: number;
  lastBeliefChangeDay: number;
  /** Identical empty priors at birth; entries appear only after lived outcomes. */
  planLearning: Partial<Record<AgentPlan, AgentPlanLearning>>;
  recentMemories: AgentMemory[];
  deliberation: AgentDeliberation;
  decisionSnapshot: AgentDecisionSnapshot | null;
}

export interface StructureLevels {
  shelter: number;
  farm: number;
  well: number;
  walls: number;
  workshop: number;
  infirmary: number;
  archive: number;
  roads: number;
  council: number;
}

export interface CivilizationCamp {
  id: string;
  name: string;
  color: string;
  position: Vec2;
  radius: number;
  active: boolean;
  foundedDay: number;
  founderAgentId: string;
  parentCampId: string | null;
  leaderId: string | null;
  memberIds: string[];
  storage: Inventory;
  structures: StructureLevels;
  technologies: TechnologyId[];
  researchTarget: TechnologyId | null;
  researchProgress: number;
  constructionTarget: StructureKind | null;
  constructionProgress: number;
  territoryRadius: number;
  cohesion: number;
  power: number;
  economicPower: number;
  militaryPower: number;
  knowledgePower: number;
  capturedByCampId: string | null;
  destroyedDay: number | null;
  victories: number;
  losses: number;
  dominantBeliefId: string | null;
  beliefDiversity: number;
  shrineLevel: number;
}

export interface CivilizationBeliefSystem {
  id: string;
  name: string;
  color: string;
  foundedDay: number;
  founderAgentId: string;
  originCampId: string | null;
  parentBeliefId: string | null;
  tenets: BeliefTenetId[];
  sacredSite: Vec2;
  adherentIds: string[];
  campIds: string[];
  influence: number;
  unity: number;
  active: boolean;
  reformationCount: number;
  schismCount: number;
}

export interface CivilizationResource {
  id: string;
  kind: ResourceKind;
  position: Vec2;
  amount: number;
  maxAmount: number;
  regenRate: number;
  richness: number;
  discoveredByCampIds: string[];
}

export interface DiplomaticRelation {
  id: string;
  campAId: string;
  campBId: string;
  status: DiplomaticStatus;
  trust: number;
  tension: number;
  sinceDay: number;
  truceUntilDay: number | null;
  lastConflictDay: number | null;
  warScoreA: number;
  warScoreB: number;
}

export interface MajorEvent {
  id: string;
  time: number;
  day: number;
  type: MajorEventType;
  tone: EventTone;
  title: string;
  message: string;
  agentIds: string[];
  campIds: string[];
  beliefIds: string[];
}

export interface CivilizationStatistics {
  births: number;
  deaths: number;
  wars: number;
  peaceTreaties: number;
  defections: number;
  breakaways: number;
  coups: number;
  technologiesUnlocked: number;
  campsFounded: number;
  campsCaptured: number;
  campsDestroyed: number;
  peakPopulation: number;
  beliefsFounded: number;
  conversions: number;
  schisms: number;
  reformations: number;
  beliefRejections: number;
  beliefsFaded: number;
  shrinesBuilt: number;
  resourcesHarvested: Inventory;
}

export interface CivilizationMap {
  halfSize: number;
  biome: string;
}

export interface CivilizationWorldState {
  version: typeof CIVILIZATION_SCHEMA_VERSION;
  seed: number;
  randomState: number;
  time: number;
  day: number;
  timeOfDay: number;
  tick: number;
  accumulator: number;
  lastSavedAt: number | null;
  map: CivilizationMap;
  agents: CivilizationAgent[];
  resources: CivilizationResource[];
  camps: CivilizationCamp[];
  beliefs: CivilizationBeliefSystem[];
  relations: DiplomaticRelation[];
  majorEvents: MajorEvent[];
  nextAgentId: number;
  nextCampId: number;
  nextEventId: number;
  nextBeliefId: number;
  nextWorldStrategyAt: number;
  powerLeaderCampId: string | null;
  powerLeaderSince: number;
  stats: CivilizationStatistics;
}

export type CivilizationWorld = CivilizationWorldState;

export interface CivilizationSummary {
  day: number;
  timeOfDay: number;
  population: number;
  totalBorn: number;
  activeCamps: number;
  wars: number;
  alliances: number;
  unaffiliated: number;
  technologiesUnlocked: number;
  activeBeliefs: number;
  secularPopulation: number;
  mostPowerfulCampId: string | null;
  mostPowerfulCampName: string | null;
  mostPowerfulCampPower: number;
  mostPowerfulAgentId: string | null;
  averageHealth: number;
  resourcesRemaining: Inventory;
}

export interface TechnologyDefinition {
  id: TechnologyId;
  label: string;
  description: string;
  prerequisites: readonly TechnologyId[];
  cost: number;
}

export const ACTION_LABELS: Readonly<Record<AgentAction, string>> = {
  idle: "Assessing options",
  wander: "Surveying the frontier",
  eat: "Eating",
  drink: "Drinking",
  rest: "Recovering",
  gather_food: "Gathering food",
  gather_water: "Collecting water",
  gather_wood: "Cutting timber",
  mine_ore: "Mining ore",
  return_camp: "Returning to camp",
  build: "Building infrastructure",
  research: "Advancing research",
  reproduce: "Securing a successor",
  raid: "Raiding a rival",
  defend: "Defending camp",
  negotiate: "Negotiating",
  recruit: "Recruiting",
  defect: "Changing allegiance",
  breakaway: "Founding a breakaway camp",
  coup: "Contesting leadership",
  join_camp: "Seeking membership",
  flee: "Escaping danger",
};

export const TECHNOLOGY_LABELS: Readonly<Record<TechnologyId, string>> = {
  basic_tools: "Basic tools",
  agriculture: "Agriculture",
  wells: "Wells",
  masonry: "Masonry",
  bronze_working: "Bronze working",
  medicine: "Medicine",
  writing: "Writing",
  logistics: "Logistics",
  governance: "Governance",
};

export const BELIEF_TENET_LABELS: Readonly<Record<BeliefTenetId, string>> = {
  reciprocal_aid: "Reciprocal aid",
  land_stewardship: "Land stewardship",
  ancestor_memory: "Ancestor memory",
  martial_merit: "Martial merit",
  knowledge_seeking: "Knowledge seeking",
  ordered_duty: "Ordered duty",
  free_conscience: "Free conscience",
  shared_prosperity: "Shared prosperity",
};

export const TECHNOLOGY_TREE: Readonly<Record<TechnologyId, TechnologyDefinition>> = {
  basic_tools: {
    id: "basic_tools",
    label: "Basic tools",
    description: "Stone and wood tools improve gathering and construction.",
    prerequisites: [],
    cost: 0,
  },
  agriculture: {
    id: "agriculture",
    label: "Agriculture",
    description: "Farms create a dependable food surplus.",
    prerequisites: ["basic_tools"],
    cost: 15,
  },
  wells: {
    id: "wells",
    label: "Wells",
    description: "Reliable water supports larger settlements.",
    prerequisites: ["basic_tools"],
    cost: 15,
  },
  masonry: {
    id: "masonry",
    label: "Masonry",
    description: "Stone structures strengthen shelter and defenses.",
    prerequisites: ["basic_tools"],
    cost: 23,
  },
  bronze_working: {
    id: "bronze_working",
    label: "Bronze working",
    description: "Metal tools improve labor and combat effectiveness.",
    prerequisites: ["masonry"],
    cost: 34,
  },
  medicine: {
    id: "medicine",
    label: "Medicine",
    description: "Care and sanitation reduce injury and recovery costs.",
    prerequisites: ["agriculture", "wells"],
    cost: 32,
  },
  writing: {
    id: "writing",
    label: "Writing",
    description: "Recorded knowledge accelerates all later research.",
    prerequisites: ["basic_tools"],
    cost: 24,
  },
  logistics: {
    id: "logistics",
    label: "Logistics",
    description: "Roads and supply planning extend territory and capacity.",
    prerequisites: ["writing", "masonry"],
    cost: 42,
  },
  governance: {
    id: "governance",
    label: "Governance",
    description: "Institutions improve cohesion and stable growth.",
    prerequisites: ["writing", "masonry"],
    cost: 46,
  },
};

export const CAMP_COLORS = [
  "#61e6b7",
  "#ffb35c",
  "#69a9ff",
  "#ec6f86",
  "#b58cff",
  "#f0df68",
  "#55d6e8",
  "#ef8e62",
  "#88d66c",
  "#d37ee8",
  "#74c3ff",
  "#ffc971",
] as const;

export const BELIEF_COLORS = [
  "#e6ca70",
  "#9ddc8b",
  "#8ecdf0",
  "#cf9df2",
  "#f59d83",
  "#74ddd2",
  "#d9a6c9",
  "#bacb72",
] as const;

const BELIEF_NAME_PREFIXES = [
  "Open",
  "Living",
  "Common",
  "Steadfast",
  "Far",
  "Quiet",
  "Bright",
  "Rooted",
  "Many",
  "Rising",
  "Boundless",
  "Kindled",
] as const;

const BELIEF_NAME_NOUNS = [
  "Accord",
  "Path",
  "Ember",
  "Circle",
  "Covenant",
  "Horizon",
  "Current",
  "Memory",
  "Lantern",
  "Concord",
  "Way",
  "Promise",
] as const;

const RESOURCE_LABELS: Readonly<Record<ResourceKind, string>> = {
  food: "food grove",
  water: "water source",
  wood: "timber stand",
  ore: "ore deposit",
};

export const AGENT_PLANS: readonly AgentPlan[] = [
  "survive",
  "secure_food",
  "secure_water",
  "stockpile",
  "fortify",
  "advance_knowledge",
  "grow_lineage",
  "expand_influence",
  "defend_home",
  "weaken_rival",
  "make_peace",
  "change_allegiance",
  "seize_leadership",
  "found_camp",
  "seek_home",
] as const;

const AGENT_PLAN_SET = new Set<AgentPlan>(AGENT_PLANS);

interface RandomCursor {
  state: number;
}

interface ActionCandidate {
  action: AgentAction;
  plan: AgentPlan;
  score: number;
  goal: string;
  rationale: string;
  target: AgentTarget | null;
}

interface ConstructionCost {
  wood: number;
  ore: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function round(value: number, digits = 2): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function emptyInventory(): Inventory {
  return { food: 0, water: 0, wood: 0, ore: 0 };
}

function copyVec(position: Vec2): Vec2 {
  return { x: position.x, z: position.z };
}

function copyInventory(inventory: Inventory): Inventory {
  return { ...inventory };
}

function emptyDeliberation(day = 1): AgentDeliberation {
  return {
    formedDay: day,
    chosenPlan: "survive",
    statement: "I have no prior outcomes yet; present conditions will guide my first plan.",
    confidence: 0.5,
    alternatives: [],
  };
}

function totalInventory(inventory: Inventory): number {
  return inventory.food + inventory.water + inventory.wood + inventory.ore;
}

function resourceInventory(resources: CivilizationResource[]): Inventory {
  const result = emptyInventory();
  for (const resource of resources) result[resource.kind] += resource.amount;
  return result;
}

export function distanceBetween(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function normalizeCivilizationSeed(
  input: SeedInput = DEFAULT_CIVILIZATION_SEED,
): number {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) return DEFAULT_CIVILIZATION_SEED;
    const normalized = Math.trunc(input) >>> 0;
    return normalized || DEFAULT_CIVILIZATION_SEED;
  }
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) || DEFAULT_CIVILIZATION_SEED;
}

function nextRandomState(input: number): { state: number; value: number } {
  let state = (input >>> 0) || DEFAULT_CIVILIZATION_SEED;
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  state >>>= 0;
  return { state, value: state / 4_294_967_296 };
}

function cursorRandom(cursor: RandomCursor): number {
  const sample = nextRandomState(cursor.state);
  cursor.state = sample.state;
  return sample.value;
}

function worldRandom(world: CivilizationWorldState): number {
  const sample = nextRandomState(world.randomState);
  world.randomState = sample.state;
  return sample.value;
}

function randomRange(cursor: RandomCursor, minimum: number, maximum: number): number {
  return minimum + (maximum - minimum) * cursorRandom(cursor);
}

function chanceForPeriod(
  world: CivilizationWorldState,
  ratePerDay: number,
  elapsedDays: number,
): boolean {
  if (ratePerDay <= 0 || elapsedDays <= 0) return false;
  const probability = 1 - Math.exp(-ratePerDay * elapsedDays);
  return worldRandom(world) < clamp(probability, 0, 1);
}

function boundedPosition(position: Vec2, inset = 1): Vec2 {
  const bound = WORLD_HALF_SIZE - inset;
  return {
    x: clamp(finite(position.x, 0), -bound, bound),
    z: clamp(finite(position.z, 0), -bound, bound),
  };
}

function target(
  kind: AgentTargetKind,
  id: string,
  label: string,
  position: Vec2,
): AgentTarget {
  return { kind, id, label, position: copyVec(position) };
}

function blankStructures(): StructureLevels {
  return {
    shelter: 1,
    farm: 0,
    well: 0,
    walls: 0,
    workshop: 0,
    infirmary: 0,
    archive: 0,
    roads: 0,
    council: 0,
  };
}

function campPosition(index: number, cursor: RandomCursor): Vec2 {
  const angle = -Math.PI / 2 + (index / 10) * TAU + randomRange(cursor, -0.045, 0.045);
  const radius = 58 + randomRange(cursor, -3.2, 3.2);
  return boundedPosition({ x: Math.cos(angle) * radius, z: Math.sin(angle) * radius }, 7);
}

function createCamp(
  id: string,
  ordinal: number,
  founder: CivilizationAgent,
  position: Vec2,
  day: number,
  parentCampId: string | null,
): CivilizationCamp {
  return {
    id,
    name: `Camp ${String(ordinal).padStart(2, "0")}`,
    color: CAMP_COLORS[(ordinal - 1) % CAMP_COLORS.length],
    position: boundedPosition(position, 5),
    radius: 3.7,
    active: true,
    foundedDay: day,
    founderAgentId: founder.id,
    parentCampId,
    leaderId: founder.id,
    memberIds: [founder.id],
    storage: { food: 16, water: 16, wood: 10, ore: 3 },
    structures: blankStructures(),
    technologies: ["basic_tools"],
    researchTarget: null,
    researchProgress: 0,
    constructionTarget: null,
    constructionProgress: 0,
    territoryRadius: 8,
    cohesion: 0.72,
    power: 0,
    economicPower: 0,
    militaryPower: 0,
    knowledgePower: 0,
    capturedByCampId: null,
    destroyedDay: null,
    victories: 0,
    losses: 0,
    dominantBeliefId: null,
    beliefDiversity: 0,
    shrineLevel: 0,
  };
}

function createFounder(index: number, position: Vec2): CivilizationAgent {
  const id = `agent-${String(index + 1).padStart(3, "0")}`;
  return {
    id,
    name: `Agent ${String(index + 1).padStart(2, "0")}`,
    color: CAMP_COLORS[index % CAMP_COLORS.length],
    position: copyVec(position),
    velocity: { x: 0, z: 0 },
    heading: (index / 10) * TAU,
    speed: 3,
    capacity: 12,
    age: 20,
    generation: 0,
    parentIds: [],
    childrenIds: [],
    bornAtDay: 1,
    alive: true,
    deathDay: null,
    health: 100,
    hunger: 88,
    hydration: 88,
    energy: 90,
    inventory: { food: 1, water: 1, wood: 0, ore: 0 },
    campId: `camp-${String(index + 1).padStart(3, "0")}`,
    currentPlan: "stockpile",
    goal: "Build an independent base of power",
    rationale: "Survival stores and knowledge are the first durable sources of power.",
    action: "idle",
    target: null,
    actionProgress: 0,
    decisionTimer: 0,
    personalPower: 0,
    influence: 0,
    knowledge: 1,
    experience: 0,
    relationships: {},
    loyalty: 0.72,
    satisfaction: 0.72,
    lastReproductionDay: -10,
    joinedCampDay: 1,
    unaffiliatedSinceDay: null,
    kills: 0,
    harvested: 0,
    buildContribution: 0,
    researchContribution: 0,
    beliefId: null,
    conviction: 0,
    spiritualInfluence: 0,
    lastBeliefChangeDay: -100,
    planLearning: {},
    recentMemories: [],
    deliberation: emptyDeliberation(1),
    decisionSnapshot: null,
  };
}

function makeFoundersAndCamps(cursor: RandomCursor): {
  agents: CivilizationAgent[];
  camps: CivilizationCamp[];
} {
  const agents: CivilizationAgent[] = [];
  const camps: CivilizationCamp[] = [];
  for (let index = 0; index < 10; index += 1) {
    const position = campPosition(index, cursor);
    const founder = createFounder(index, position);
    const camp = createCamp(`camp-${String(index + 1).padStart(3, "0")}`, index + 1, founder, position, 1, null);
    agents.push(founder);
    camps.push(camp);
  }
  return { agents, camps };
}

function resourceSpecification(kind: ResourceKind): {
  count: number;
  maximum: readonly [number, number];
  regeneration: readonly [number, number];
} {
  switch (kind) {
    case "food":
      return { count: 72, maximum: [16, 30], regeneration: [0.013, 0.025] };
    case "water":
      return { count: 60, maximum: [22, 38], regeneration: [0.019, 0.034] };
    case "wood":
      return { count: 72, maximum: [22, 42], regeneration: [0.009, 0.018] };
    case "ore":
      return { count: 44, maximum: [14, 28], regeneration: [0.0025, 0.006] };
  }
}

function makeResources(cursor: RandomCursor, camps: CivilizationCamp[]): CivilizationResource[] {
  const resources: CivilizationResource[] = [];
  const kinds: readonly ResourceKind[] = ["food", "water", "wood", "ore"];
  for (const kind of kinds) {
    const specification = resourceSpecification(kind);
    for (let index = 0; index < specification.count; index += 1) {
      let position: Vec2 | null = null;
      let starterCampId: string | null = null;
      if (index < camps.length) {
        const camp = camps[index];
        const kindOffset = kinds.indexOf(kind) * 0.72;
        const angle = (index / camps.length) * TAU + kindOffset + 0.35;
        const radius = 6.2 + kinds.indexOf(kind) * 0.55;
        position = boundedPosition({
          x: camp.position.x + Math.cos(angle) * radius,
          z: camp.position.z + Math.sin(angle) * radius,
        }, 2);
        starterCampId = camp.id;
      } else {
        for (let attempt = 0; attempt < 80; attempt += 1) {
          const candidate = {
            x: randomRange(cursor, -WORLD_HALF_SIZE + 2, WORLD_HALF_SIZE - 2),
            z: randomRange(cursor, -WORLD_HALF_SIZE + 2, WORLD_HALF_SIZE - 2),
          };
          const separated = resources.every(
            (resource) => distanceBetween(resource.position, candidate) > 1.25,
          );
          if (separated) {
            position = candidate;
            break;
          }
        }
      }
      if (!position) {
        const ordinal = resources.length + 1;
        const angle = ordinal * 2.399963229728653;
        const radius = 9 + ((ordinal * 7.31) % 57);
        position = boundedPosition({ x: Math.cos(angle) * radius, z: Math.sin(angle) * radius }, 2);
      }
      const maximum = index < camps.length
        ? (specification.maximum[0] + specification.maximum[1]) / 2
        : randomRange(cursor, specification.maximum[0], specification.maximum[1]);
      resources.push({
        id: `${kind}-${String(index + 1).padStart(3, "0")}`,
        kind,
        position,
        amount: round(maximum * (index < camps.length ? 0.82 : randomRange(cursor, 0.55, 1))),
        maxAmount: round(maximum),
        regenRate: index < camps.length
          ? (specification.regeneration[0] + specification.regeneration[1]) / 2
          : randomRange(cursor, specification.regeneration[0], specification.regeneration[1]),
        richness: index < camps.length ? 1 : round(randomRange(cursor, 0.82, 1.18), 3),
        discoveredByCampIds: starterCampId ? [starterCampId] : [],
      });
    }
  }
  return resources;
}

function relationId(a: string, b: string): string {
  return a < b ? `${a}::${b}` : `${b}::${a}`;
}

function makeRelations(cursor: RandomCursor, camps: CivilizationCamp[]): DiplomaticRelation[] {
  const relations: DiplomaticRelation[] = [];
  for (let left = 0; left < camps.length; left += 1) {
    for (let right = left + 1; right < camps.length; right += 1) {
      const campA = camps[left];
      const campB = camps[right];
      relations.push({
        id: relationId(campA.id, campB.id),
        campAId: campA.id,
        campBId: campB.id,
        status: "neutral",
        trust: round(randomRange(cursor, 0.43, 0.5), 3),
        tension: round(randomRange(cursor, 0.08, 0.15), 3),
        sinceDay: 1,
        truceUntilDay: null,
        lastConflictDay: null,
        warScoreA: 0,
        warScoreB: 0,
      });
    }
  }
  return relations;
}

function pushMajorEvent(
  world: CivilizationWorldState,
  type: MajorEventType,
  tone: EventTone,
  title: string,
  message: string,
  agentIds: string[] = [],
  campIds: string[] = [],
  beliefIds: string[] = [],
): void {
  world.majorEvents.push({
    id: `event-${String(world.nextEventId).padStart(8, "0")}`,
    time: world.time,
    day: world.day,
    type,
    tone,
    title,
    message,
    agentIds: [...new Set(agentIds)],
    campIds: [...new Set(campIds)],
    beliefIds: [...new Set(beliefIds)],
  });
  world.nextEventId += 1;
  if (world.majorEvents.length > MAX_MAJOR_EVENTS) {
    world.majorEvents.splice(0, world.majorEvents.length - MAX_MAJOR_EVENTS);
  }
}

export function createCivilizationWorld(
  seedInput: SeedInput = DEFAULT_CIVILIZATION_SEED,
): CivilizationWorldState {
  const seed = normalizeCivilizationSeed(seedInput);
  const cursor: RandomCursor = { state: seed };
  const { agents, camps } = makeFoundersAndCamps(cursor);
  const resources = makeResources(cursor, camps);
  const relations = makeRelations(cursor, camps);
  const world: CivilizationWorldState = {
    version: CIVILIZATION_SCHEMA_VERSION,
    seed,
    randomState: cursor.state,
    time: 0,
    day: 1,
    timeOfDay: 0.28,
    tick: 0,
    accumulator: 0,
    lastSavedAt: null,
    map: { halfSize: WORLD_HALF_SIZE, biome: "Sovereign frontier" },
    agents,
    resources,
    camps,
    beliefs: [],
    relations,
    majorEvents: [],
    nextAgentId: 11,
    nextCampId: 11,
    nextEventId: 1,
    nextBeliefId: 1,
    nextWorldStrategyAt: STRATEGY_INTERVAL,
    powerLeaderCampId: null,
    powerLeaderSince: 0,
    stats: {
      births: 0,
      deaths: 0,
      wars: 0,
      peaceTreaties: 0,
      defections: 0,
      breakaways: 0,
      coups: 0,
      technologiesUnlocked: 0,
      campsFounded: 10,
      campsCaptured: 0,
      campsDestroyed: 0,
      peakPopulation: 10,
      beliefsFounded: 0,
      conversions: 0,
      schisms: 0,
      reformations: 0,
      beliefRejections: 0,
      beliefsFaded: 0,
      shrinesBuilt: 0,
      resourcesHarvested: emptyInventory(),
    },
  };
  recomputePower(world);
  const ranked = getRankedCamps(world);
  world.powerLeaderCampId = ranked[0]?.id ?? null;
  pushMajorEvent(
    world,
    "world_started",
    "neutral",
    "Ten claims on the frontier",
    "Ten equal founders establish independent camps. No doctrine or destiny has been assigned; every choice will follow survival and personal power.",
    agents.map((agent) => agent.id),
    camps.map((camp) => camp.id),
  );
  for (const agent of world.agents) chooseAgentAction(world, agent);
  return world;
}

/** Deep copy used at every public mutation boundary. */
export function cloneCivilizationWorld(state: CivilizationWorldState): CivilizationWorldState {
  return {
    ...state,
    map: { ...state.map },
    agents: state.agents.map((agent) => ({
      ...agent,
      position: copyVec(agent.position),
      velocity: copyVec(agent.velocity),
      parentIds: [...agent.parentIds],
      childrenIds: [...agent.childrenIds],
      inventory: copyInventory(agent.inventory),
      relationships: Object.fromEntries(
        Object.entries(agent.relationships).map(([id, relationship]) => [
          id,
          { ...relationship },
        ]),
      ),
      target: agent.target
        ? { ...agent.target, position: copyVec(agent.target.position) }
        : null,
      planLearning: Object.fromEntries(
        Object.entries(agent.planLearning ?? {}).map(([plan, learning]) => [
          plan,
          learning ? { ...learning } : learning,
        ]),
      ),
      recentMemories: (agent.recentMemories ?? []).map((memory) => ({ ...memory })),
      deliberation: agent.deliberation
        ? {
            ...agent.deliberation,
            alternatives: (agent.deliberation.alternatives ?? []).map((alternative) => ({ ...alternative })),
          }
        : emptyDeliberation(state.day),
      decisionSnapshot: agent.decisionSnapshot
        ? {
            ...agent.decisionSnapshot,
            signals: { ...agent.decisionSnapshot.signals },
          }
        : null,
    })),
    resources: state.resources.map((resource) => ({
      ...resource,
      position: copyVec(resource.position),
      discoveredByCampIds: [...resource.discoveredByCampIds],
    })),
    camps: state.camps.map((camp) => ({
      ...camp,
      position: copyVec(camp.position),
      memberIds: [...camp.memberIds],
      storage: copyInventory(camp.storage),
      structures: { ...camp.structures },
      technologies: [...camp.technologies],
    })),
    relations: state.relations.map((relation) => ({ ...relation })),
    majorEvents: state.majorEvents.map((event) => ({
      ...event,
      agentIds: [...event.agentIds],
      campIds: [...event.campIds],
      beliefIds: [...event.beliefIds],
    })),
    beliefs: state.beliefs.map((belief) => ({
      ...belief,
      tenets: [...belief.tenets],
      sacredSite: copyVec(belief.sacredSite),
      adherentIds: [...belief.adherentIds],
      campIds: [...belief.campIds],
    })),
    stats: {
      ...state.stats,
      resourcesHarvested: copyInventory(state.stats.resourcesHarvested),
    },
  };
}

/**
 * The foreground path is fixed-step: render cadence cannot change outcomes.
 * Large foreground deltas are clamped; persisted/offline time belongs in
 * catchUpCivilization, whose explicitly coarser semantics are bounded.
 */
export function simulateCivilization(
  state: CivilizationWorldState,
  dtSeconds: number,
): CivilizationWorldState {
  const next = cloneCivilizationWorld(state);
  if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) return next;
  next.accumulator += Math.min(dtSeconds, MAX_FOREGROUND_DELTA);
  const steps = Math.floor((next.accumulator + EPSILON) / FIXED_STEP);
  for (let index = 0; index < steps; index += 1) advanceWorld(next, FIXED_STEP);
  next.accumulator = Math.max(0, next.accumulator - steps * FIXED_STEP);
  if (next.accumulator < EPSILON) next.accumulator = 0;
  stabilizeWorld(next);
  return next;
}

export function stepCivilization(state: CivilizationWorldState): CivilizationWorldState {
  const next = cloneCivilizationWorld(state);
  advanceWorld(next, FIXED_STEP);
  stabilizeWorld(next);
  return next;
}

/**
 * Ordinary offline time (up to 90 seconds) retains exact fixed-step replay.
 * Longer gaps are compressed into at most 48 deterministic strategic updates.
 * Biology and travel use a capped local delta inside each update, while
 * production, chronology, diplomacy rates, and resource renewal cover the full
 * elapsed duration. This keeps arbitrary absences finite without NaN cascades.
 */
export function catchUpCivilization(
  state: CivilizationWorldState,
  elapsedRealSeconds: number,
): CivilizationWorldState {
  const next = cloneCivilizationWorld(state);
  if (!Number.isFinite(elapsedRealSeconds) || elapsedRealSeconds <= 0) return next;
  const total = next.accumulator + Math.max(0, elapsedRealSeconds);
  const exactSteps = Math.floor((total + EPSILON) / FIXED_STEP);
  if (exactSteps <= MAX_CATCH_UP_STEPS) {
    for (let index = 0; index < exactSteps; index += 1) advanceWorld(next, FIXED_STEP);
    next.accumulator = normalizedRemainder(total - exactSteps * FIXED_STEP);
  } else {
    // Only genuinely long absences switch semantics. Consume the same whole
    // fixed-step duration while retaining its fractional remainder for the next
    // call, then distribute that duration across a bounded number of updates.
    const remainder = normalizedRemainder(total % FIXED_STEP);
    const wholeDuration = total - remainder;
    const coarseSteps = Math.min(
      MAX_LONG_GAP_STEPS,
      Math.max(12, Math.ceil(wholeDuration / 180)),
    );
    const coarseStep = wholeDuration / coarseSteps;
    for (let index = 0; index < coarseSteps; index += 1) {
      advanceWorld(next, coarseStep);
    }
    next.accumulator = remainder;
  }
  stabilizeWorld(next);
  return next;
}

function normalizedRemainder(value: number): number {
  const normalized = round(Math.max(0, value), 9);
  if (normalized < EPSILON || FIXED_STEP - normalized < EPSILON) return 0;
  return clamp(normalized, 0, FIXED_STEP - EPSILON);
}

function advanceWorld(world: CivilizationWorldState, dt: number): void {
  if (!Number.isFinite(dt) || dt <= 0) return;
  const localDt = Math.min(dt, 10);
  world.time += dt;
  world.tick += 1;
  world.day = Math.floor(world.time / DAY_LENGTH) + 1;
  world.timeOfDay = (0.28 + (world.time % DAY_LENGTH) / DAY_LENGTH) % 1;

  growResources(world, dt);
  produceCampResources(world, dt);

  for (const agent of world.agents) {
    if (!agent.alive) continue;
    agent.age += dt / DAY_LENGTH;
    updateAgentNeeds(world, agent, localDt);
    if (!agent.alive) continue;
    agent.decisionTimer -= localDt;
    if (agent.decisionTimer <= 0 || !isActionValid(world, agent)) {
      chooseAgentAction(world, agent);
    }
    executeAgentAction(world, agent, localDt);
    discoverResources(world, agent);
  }

  if (world.time + EPSILON >= world.nextWorldStrategyAt) {
    const strategicElapsed = Math.max(
      STRATEGY_INTERVAL,
      world.time - (world.nextWorldStrategyAt - STRATEGY_INTERVAL),
    );
    runWorldStrategy(world, strategicElapsed);
    world.nextWorldStrategyAt = world.time + STRATEGY_INTERVAL;
  }

  world.stats.peakPopulation = Math.max(
    world.stats.peakPopulation,
    world.agents.filter((agent) => agent.alive).length,
  );
}

function growResources(world: CivilizationWorldState, dt: number): void {
  for (const resource of world.resources) {
    const missing = Math.max(0, resource.maxAmount - resource.amount);
    if (missing <= EPSILON) continue;
    const regeneration = resource.regenRate * resource.richness * dt;
    resource.amount = clamp(resource.amount + Math.min(missing, regeneration), 0, resource.maxAmount);
  }
}

function produceCampResources(world: CivilizationWorldState, dt: number): void {
  for (const camp of world.camps) {
    if (!camp.active) continue;
    const population = livingCampMembers(world, camp).length;
    const prosperity = campBeliefHasTenet(world, camp, "shared_prosperity") ? 1.06 : 1;
    const stewardship = campBeliefHasTenet(world, camp, "land_stewardship") ? 1.05 : 1;
    const beliefProduction = prosperity * stewardship;
    const agricultureMultiplier = hasTechnology(camp, "agriculture") ? 1.45 : 0;
    const wellMultiplier = hasTechnology(camp, "wells") ? 1.5 : 0;
    if (camp.structures.farm > 0 && agricultureMultiplier > 0) {
      camp.storage.food = clamp(
        camp.storage.food + camp.structures.farm * 0.028 * agricultureMultiplier * beliefProduction * dt,
        0,
        CAMP_STORAGE_LIMIT,
      );
    }
    if (camp.structures.well > 0 && wellMultiplier > 0) {
      camp.storage.water = clamp(
        camp.storage.water + camp.structures.well * 0.034 * wellMultiplier * beliefProduction * dt,
        0,
        CAMP_STORAGE_LIMIT,
      );
    }
    // Large settlements pay a small passive maintenance cost; this prevents
    // mature powers from accumulating infinite strategic reserves.
    const maintenance = population * 0.0007 * dt;
    camp.storage.food = Math.max(0, camp.storage.food - maintenance);
    camp.storage.water = Math.max(0, camp.storage.water - maintenance * 1.12);
  }
}

function updateAgentNeeds(
  world: CivilizationWorldState,
  agent: CivilizationAgent,
  dt: number,
): void {
  const camp = getActiveCamp(world, agent.campId);
  const logistics = camp && hasTechnology(camp, "logistics") ? 0.88 : 1;
  const shelter = camp && isNear(agent.position, camp.position, camp.radius)
    ? 1 - Math.min(0.32, camp.structures.shelter * 0.035)
    : 1;
  agent.hunger = clamp(agent.hunger - 0.13 * logistics * dt, 0, 100);
  agent.hydration = clamp(agent.hydration - 0.16 * logistics * dt, 0, 100);
  agent.energy = clamp(agent.energy - 0.075 * shelter * dt, 0, 100);

  const deprivation =
    Math.max(0, 14 - agent.hunger) * 0.018 +
    Math.max(0, 14 - agent.hydration) * 0.024 +
    Math.max(0, 7 - agent.energy) * 0.01;
  if (deprivation > 0) agent.health -= deprivation * dt;
  if (agent.health <= 0) killAgent(world, agent, null, "succumbed after prolonged deprivation");
}

function isNear(a: Vec2, b: Vec2, radius: number): boolean {
  return distanceBetween(a, b) <= radius;
}

function getActiveCamp(
  world: CivilizationWorldState,
  campId: string | null,
): CivilizationCamp | null {
  if (!campId) return null;
  return world.camps.find((camp) => camp.id === campId && camp.active) ?? null;
}

function livingCampMembers(
  world: CivilizationWorldState,
  camp: CivilizationCamp,
): CivilizationAgent[] {
  return world.agents.filter((agent) => agent.alive && agent.campId === camp.id);
}

function hasTechnology(camp: CivilizationCamp, technology: TechnologyId): boolean {
  return camp.technologies.includes(technology);
}

function activeRelation(
  world: CivilizationWorldState,
  campAId: string,
  campBId: string,
): DiplomaticRelation | null {
  return world.relations.find((relation) => relation.id === relationId(campAId, campBId)) ?? null;
}

function getOrCreateRelation(
  world: CivilizationWorldState,
  campAId: string,
  campBId: string,
): DiplomaticRelation {
  const existing = activeRelation(world, campAId, campBId);
  if (existing) return existing;
  const [campA, campB] = campAId < campBId ? [campAId, campBId] : [campBId, campAId];
  const relation: DiplomaticRelation = {
    id: relationId(campA, campB),
    campAId: campA,
    campBId: campB,
    status: "neutral",
    trust: 0.4,
    tension: 0.16,
    sinceDay: world.day,
    truceUntilDay: null,
    lastConflictDay: null,
    warScoreA: 0,
    warScoreB: 0,
  };
  world.relations.push(relation);
  return relation;
}

function enemyCamps(world: CivilizationWorldState, camp: CivilizationCamp): CivilizationCamp[] {
  const enemyIds = new Set<string>();
  for (const relation of world.relations) {
    if (relation.status !== "war") continue;
    if (relation.campAId === camp.id) enemyIds.add(relation.campBId);
    if (relation.campBId === camp.id) enemyIds.add(relation.campAId);
  }
  return world.camps.filter((candidate) => candidate.active && enemyIds.has(candidate.id));
}

function observeAgentOutcome(
  world: CivilizationWorldState,
  agent: CivilizationAgent,
): AgentOutcomeSignals {
  const camp = getActiveCamp(world, agent.campId);
  const population = camp ? Math.max(1, camp.memberIds.length) : 1;
  const perMemberStores = camp ? totalInventory(camp.storage) / population : 0;
  const campSecurity = camp
    ? clamp(
        28 +
          camp.cohesion * 26 +
          camp.structures.walls * 4 +
          camp.structures.council * 2 +
          camp.militaryPower / population * 0.22 +
          Math.min(12, perMemberStores * 0.18) -
          camp.losses * 0.35,
        0,
        100,
      )
    : 0;
  return {
    health: round(agent.health, 3),
    nutrition: round(agent.hunger, 3),
    hydration: round(agent.hydration, 3),
    energy: round(agent.energy, 3),
    personalPower: round(agent.personalPower, 3),
    influence: round(agent.influence + agent.spiritualInfluence, 3),
    knowledge: round(agent.knowledge, 3),
    family: agent.childrenIds.length,
    campSecurity: round(campSecurity, 3),
    resources: round(totalInventory(agent.inventory) + perMemberStores * 0.18, 3),
  };
}

function outcomeDeltaScore(
  before: AgentOutcomeSignals,
  after: AgentOutcomeSignals,
): number {
  const score =
    clamp((after.health - before.health) / 14, -1, 1) * 0.18 +
    clamp((after.nutrition - before.nutrition) / 30, -1, 1) * 0.03 +
    clamp((after.hydration - before.hydration) / 30, -1, 1) * 0.04 +
    clamp((after.energy - before.energy) / 35, -1, 1) * 0.01 +
    clamp((after.personalPower - before.personalPower) / 3, -1, 1) * 0.16 +
    clamp((after.influence - before.influence) / 0.8, -1, 1) * 0.15 +
    clamp((after.knowledge - before.knowledge) / 0.35, -1, 1) * 0.12 +
    clamp(after.family - before.family, -1, 1) * 0.14 +
    clamp((after.campSecurity - before.campSecurity) / 24, -1, 1) * 0.1 +
    clamp((after.resources - before.resources) / 7, -1, 1) * 0.07;
  return clamp(round(score, 4), -1, 1);
}

function outcomeSummary(
  plan: AgentPlan,
  outcome: AgentOutcome,
  score: number,
  before: AgentOutcomeSignals,
  after: AgentOutcomeSignals,
): string {
  const changes: Array<{ magnitude: number; phrase: string }> = [
    { magnitude: Math.abs(after.health - before.health) / 8, phrase: after.health >= before.health ? "protected my health" : "lost health" },
    { magnitude: Math.abs(after.nutrition - before.nutrition) / 18, phrase: after.nutrition >= before.nutrition ? "restored nutrition" : "became hungrier" },
    { magnitude: Math.abs(after.hydration - before.hydration) / 18, phrase: after.hydration >= before.hydration ? "restored hydration" : "became thirstier" },
    { magnitude: Math.abs(after.energy - before.energy) / 20, phrase: after.energy >= before.energy ? "recovered energy" : "spent energy" },
    { magnitude: Math.abs(after.personalPower - before.personalPower) / 2, phrase: after.personalPower >= before.personalPower ? "gained personal power" : "lost personal power" },
    { magnitude: Math.abs(after.influence - before.influence) / 0.5, phrase: after.influence >= before.influence ? "expanded my influence" : "lost influence" },
    { magnitude: Math.abs(after.knowledge - before.knowledge) / 0.2, phrase: after.knowledge >= before.knowledge ? "gained knowledge" : "made no knowledge gain" },
    { magnitude: Math.abs(after.family - before.family), phrase: after.family > before.family ? "expanded my family" : "my family did not grow" },
    { magnitude: Math.abs(after.campSecurity - before.campSecurity) / 15, phrase: after.campSecurity >= before.campSecurity ? "improved camp security" : "saw camp security weaken" },
    { magnitude: Math.abs(after.resources - before.resources) / 4, phrase: after.resources >= before.resources ? "gained usable resources" : "spent or lost resources" },
  ];
  changes.sort((left, right) => right.magnitude - left.magnitude || left.phrase.localeCompare(right.phrase));
  const planLabel = plan.replaceAll("_", " ");
  if ((changes[0]?.magnitude ?? 0) < 0.035) {
    return `I saw little measurable change from ${planLabel}; the result was ${outcome}.`;
  }
  return `I ${changes[0].phrase} while pursuing ${planLabel}; the result was ${outcome} (${score >= 0 ? "+" : ""}${round(score, 2)}).`;
}

/** Reflects without consuming randomness, preserving fixed-step replay. */
function reflectOnPreviousPlan(
  world: CivilizationWorldState,
  agent: CivilizationAgent,
): AgentMemory | null {
  const snapshot = agent.decisionSnapshot;
  if (!snapshot || world.time - snapshot.formedTime < EPSILON) return null;
  const after = observeAgentOutcome(world, agent);
  const score = outcomeDeltaScore(snapshot.signals, after);
  const outcome: AgentOutcome = score > 0.035 ? "success" : score < -0.035 ? "setback" : "mixed";
  const previous = agent.planLearning[snapshot.plan] ?? { attempts: 0, expectedValue: 0 };
  const attempts = Math.min(1_000_000, previous.attempts + 1);
  agent.planLearning[snapshot.plan] = {
    attempts,
    expectedValue: clamp(
      round(previous.expectedValue + (score - previous.expectedValue) / attempts, 4),
      -1,
      1,
    ),
  };
  const memory: AgentMemory = {
    id: `${agent.id}-memory-${String(world.tick).padStart(9, "0")}`,
    day: world.day,
    plan: snapshot.plan,
    outcome,
    score,
    summary: outcomeSummary(snapshot.plan, outcome, score, snapshot.signals, after),
  };
  agent.recentMemories.push(memory);
  if (agent.recentMemories.length > MAX_AGENT_MEMORIES) {
    agent.recentMemories.splice(0, agent.recentMemories.length - MAX_AGENT_MEMORIES);
  }
  return memory;
}

function learnedPlanBonus(agent: CivilizationAgent, plan: AgentPlan): number {
  const learned = agent.planLearning[plan] ?? { attempts: 0, expectedValue: 0 };
  const exploration = 2.4 / Math.sqrt(learned.attempts + 1);
  // Survival may become more attractive after success, but negative outcomes
  // can never suppress it. Immediate survival utilities remain hard constraints.
  const expected = plan === "survive"
    ? Math.max(0, learned.expectedValue)
    : clamp(learned.expectedValue, -1, 1);
  return expected * 4 + exploration;
}

/**
 * Every agent evaluates this same utility slate. Scores contain no personality,
 * role, faction archetype, or hidden ambition term: only current needs, achieved
 * power, relationships, camp conditions, travel cost, and a tiny seeded tie
 * break. Plans therefore diverge only after histories and circumstances do.
 */
function chooseAgentAction(world: CivilizationWorldState, agent: CivilizationAgent): void {
  if (!agent.alive) return;
  reflectOnPreviousPlan(world, agent);
  const candidates: ActionCandidate[] = [];
  const camp = getActiveCamp(world, agent.campId);
  const atCamp = camp ? isNear(agent.position, camp.position, camp.radius) : false;
  const add = (
    action: AgentAction,
    plan: AgentPlan,
    score: number,
    goal: string,
    rationale: string,
    actionTarget: AgentTarget | null = null,
  ): void => {
    if (!Number.isFinite(score)) return;
    candidates.push({
      action,
      plan,
      score: score + learnedPlanBonus(agent, plan) + worldRandom(world) * 0.035,
      goal,
      rationale,
      target: actionTarget,
    });
  };

  if (!camp) {
    const destination = bestCampToJoin(world, agent);
    if (destination && agent.unaffiliatedSinceDay !== null && world.day - agent.unaffiliatedSinceDay >= 0.18) {
      add(
        "join_camp",
        "seek_home",
        48 + destination.power / Math.max(3, destination.memberIds.length + 2),
        `Seek admission to ${destination.name}`,
        "Membership offers protection and a new route to influence after losing a camp.",
        target("camp", destination.id, destination.name, destination.position),
      );
    }
    if (agent.inventory.food > 0.05 && agent.hunger < 72) {
      add("eat", "survive", 88 - agent.hunger, "Restore nutrition", "Power is impossible without immediate survival.");
    }
    if (agent.inventory.water > 0.05 && agent.hydration < 76) {
      add("drink", "survive", 92 - agent.hydration, "Restore hydration", "Power is impossible without immediate survival.");
    }
    const point = frontierTarget(world, agent);
    add(
      "wander",
      "seek_home",
      18,
      "Search for security and opportunity",
      "No active camp currently provides protection.",
      point,
    );
    chooseCandidate(agent, candidates, world);
    return;
  }

  const inventoryLoad = totalInventory(agent.inventory);
  const population = livingCampMembers(world, camp).length;
  const foodPerMember = camp.storage.food / Math.max(1, population);
  const waterPerMember = camp.storage.water / Math.max(1, population);

  if (agent.hunger < 84 && (agent.inventory.food > 0.04 || (atCamp && camp.storage.food > 0.04))) {
    add(
      "eat",
      "survive",
      5 + Math.max(0, 84 - agent.hunger) * 1.7,
      "Protect health with food",
      `Nutrition is at ${round(agent.hunger)}%; restoring it protects all accumulated power.`,
    );
  }
  if (agent.hydration < 86 && (agent.inventory.water > 0.04 || (atCamp && camp.storage.water > 0.04))) {
    add(
      "drink",
      "survive",
      6 + Math.max(0, 86 - agent.hydration) * 1.8,
      "Protect health with water",
      `Hydration is at ${round(agent.hydration)}%; dehydration is the most immediate risk.`,
    );
  }
  add(
    "rest",
    "survive",
    8 + Math.max(0, 55 - agent.energy) * 1.15 + Math.max(0, 65 - agent.health) * 0.35,
    "Recover at camp",
    "Rest preserves health and combat effectiveness.",
    target("camp", camp.id, camp.name, camp.position),
  );

  if (inventoryLoad > Math.max(3.2, agent.capacity * 0.52)) {
    add(
      "return_camp",
      "stockpile",
      32 + inventoryLoad * 1.8,
      `Bank supplies at ${camp.name}`,
      "Stored resources become infrastructure, knowledge, and durable camp power.",
      target("camp", camp.id, camp.name, camp.position),
    );
  }

  const gatherNeeds: ReadonlyArray<{
    kind: ResourceKind;
    action: AgentAction;
    plan: AgentPlan;
    base: number;
  }> = [
    { kind: "food", action: "gather_food", plan: "secure_food", base: 20 + Math.max(0, 10 - foodPerMember) * 1.8 + Math.max(0, 75 - agent.hunger) * 0.25 },
    { kind: "water", action: "gather_water", plan: "secure_water", base: 21 + Math.max(0, 11 - waterPerMember) * 1.9 + Math.max(0, 78 - agent.hydration) * 0.28 },
    { kind: "wood", action: "gather_wood", plan: "stockpile", base: 15 + (camp.constructionTarget ? 9 : 2) + Math.max(0, 14 - camp.storage.wood) * 0.28 },
    { kind: "ore", action: "mine_ore", plan: "advance_knowledge", base: 11 + (camp.constructionTarget ? 4 : 0) + (camp.researchTarget === "bronze_working" ? 12 : 0) },
  ];
  if (inventoryLoad < agent.capacity - 0.4) {
    for (const gatherNeed of gatherNeeds) {
      const resource = bestResourceFor(world, agent, camp, gatherNeed.kind);
      if (!resource) continue;
      const travelCost = distanceBetween(agent.position, resource.position) * 0.12;
      add(
        gatherNeed.action,
        gatherNeed.plan,
        gatherNeed.base - travelCost,
        `Secure ${gatherNeed.kind} for personal and camp reserves`,
        `${RESOURCE_LABELS[gatherNeed.kind]} ${resource.id} offers the best known return for the travel cost.`,
        target("resource", resource.id, resource.id, resource.position),
      );
    }
  }

  if (camp.constructionTarget && canBuild(camp, camp.constructionTarget)) {
    const defensiveNeed = enemyCamps(world, camp).length > 0 ? 7 : 0;
    add(
      "build",
      camp.constructionTarget === "walls" ? "fortify" : "expand_influence",
      21 + defensiveNeed + camp.structures.workshop * 0.7,
      `Build ${structureLabel(camp.constructionTarget)}`,
      "Infrastructure converts current stores into lasting economic, military, or institutional power.",
      target("camp", camp.id, camp.name, camp.position),
    );
  }

  if (camp.researchTarget) {
    const scarcityBonus = camp.researchTarget === "agriculture"
      ? Math.max(0, 8 - foodPerMember)
      : camp.researchTarget === "wells"
        ? Math.max(0, 9 - waterPerMember)
        : 0;
    add(
      "research",
      "advance_knowledge",
      22 + scarcityBonus + camp.structures.archive * 1.4,
      `Unlock ${TECHNOLOGY_LABELS[camp.researchTarget]}`,
      "Knowledge compounds personal influence and raises the camp's future power ceiling.",
      target("camp", camp.id, camp.name, camp.position),
    );
  }

  if (canReproduce(world, agent, camp)) {
    const lineageValue = agent.childrenIds.length === 0 ? 13 : Math.max(0, 7 - agent.childrenIds.length * 2);
    const capacityValue = Math.max(0, camp.structures.shelter * 3 + 2 - population) * 1.5;
    add(
      "reproduce",
      "grow_lineage",
      20 + lineageValue + capacityValue,
      "Create an heir and expand the camp",
      "A descendant extends personal influence and adds future labor, knowledge, and defense.",
      target("camp", camp.id, camp.name, camp.position),
    );
  }

  const enemies = enemyCamps(world, camp);
  if (enemies.length > 0 && agent.health > 54 && agent.energy > 34 && agent.hunger > 42 && agent.hydration > 42) {
    const victim = [...enemies].sort((left, right) => {
      const leftValue = left.power + distanceBetween(agent.position, left.position) * 0.55;
      const rightValue = right.power + distanceBetween(agent.position, right.position) * 0.55;
      return leftValue - rightValue;
    })[0];
    if (victim) {
      const advantage = clamp((camp.militaryPower - victim.militaryPower) / Math.max(10, victim.militaryPower), -1, 1);
      add(
        "raid",
        "weaken_rival",
        18 + advantage * 10 + agent.experience * 0.35,
        `Raid ${victim.name}`,
        "A successful raid can seize supplies, gain experience, and remove a rival source of power.",
        target("camp", victim.id, victim.name, victim.position),
      );
    }
    const nearbyRaider = world.agents.find(
      (other) => other.alive && other.action === "raid" && other.target?.id === camp.id && distanceBetween(other.position, camp.position) < camp.territoryRadius,
    );
    if (nearbyRaider) {
      add(
        "defend",
        "defend_home",
        58,
        `Defend ${camp.name}`,
        "An active threat endangers stored resources, lineage, and territorial power.",
        target("agent", nearbyRaider.id, nearbyRaider.name, nearbyRaider.position),
      );
    }
  }

  add(
    "wander",
    "expand_influence",
    7 + Math.max(0, 3 - agent.knowledge * 0.04),
    "Survey new opportunities",
    "New resource knowledge can create an advantage over rival camps.",
    frontierTarget(world, agent),
  );
  add("idle", "stockpile", 2, "Reassess the balance of power", "No current commitment outweighs waiting for better information.");
  chooseCandidate(agent, candidates, world);
}

function chooseCandidate(
  agent: CivilizationAgent,
  candidates: ActionCandidate[],
  world: CivilizationWorldState,
): void {
  candidates.sort((left, right) => right.score - left.score || left.action.localeCompare(right.action));
  const choice = candidates[0];
  if (!choice) return;
  const alternatives: AgentDecisionAlternative[] = [];
  const representedPlans = new Set<AgentPlan>([choice.plan]);
  for (const candidate of candidates.slice(1)) {
    if (representedPlans.has(candidate.plan)) continue;
    representedPlans.add(candidate.plan);
    alternatives.push({
      plan: candidate.plan,
      goal: candidate.goal,
      score: round(candidate.score, 2),
    });
    if (alternatives.length >= MAX_DELIBERATION_ALTERNATIVES) break;
  }
  const runnerUpScore = candidates[1]?.score ?? choice.score - 18;
  const confidence = clamp(0.5 + (choice.score - runnerUpScore) / 44, 0.36, 0.96);
  const latestMemory = agent.recentMemories.at(-1);
  const evidence = latestMemory
    ? `${latestMemory.summary} `
    : "I have no personal outcome to rely on yet. ";
  agent.action = choice.action;
  agent.currentPlan = choice.plan;
  agent.goal = choice.goal;
  agent.rationale = choice.rationale;
  agent.target = choice.target;
  agent.actionProgress = 0;
  agent.decisionTimer = 2.2 + worldRandom(world) * 2.8;
  agent.deliberation = {
    formedDay: world.day,
    chosenPlan: choice.plan,
    statement: `${evidence}I choose to ${choice.goal.charAt(0).toLowerCase()}${choice.goal.slice(1)} because ${choice.rationale.charAt(0).toLowerCase()}${choice.rationale.slice(1)}`.slice(0, 360),
    confidence: round(confidence, 3),
    alternatives,
  };
  agent.decisionSnapshot = {
    formedTime: world.time,
    formedDay: world.day,
    plan: choice.plan,
    signals: observeAgentOutcome(world, agent),
  };
}

function bestResourceFor(
  world: CivilizationWorldState,
  agent: CivilizationAgent,
  camp: CivilizationCamp,
  kind: ResourceKind,
): CivilizationResource | null {
  let best: CivilizationResource | null = null;
  let bestScore = -Infinity;
  for (const resource of world.resources) {
    if (resource.kind !== kind || resource.amount <= 0.08) continue;
    const known = resource.discoveredByCampIds.includes(camp.id);
    const distance = distanceBetween(agent.position, resource.position);
    if (!known && distance > 13 + agent.knowledge * 0.06) continue;
    const score = resource.amount * resource.richness / (3 + distance) + (known ? 0.8 : 0);
    if (score > bestScore || (score === bestScore && resource.id < (best?.id ?? "~"))) {
      bestScore = score;
      best = resource;
    }
  }
  return best;
}

function bestCampToJoin(
  world: CivilizationWorldState,
  agent: CivilizationAgent,
): CivilizationCamp | null {
  let best: CivilizationCamp | null = null;
  let bestScore = -Infinity;
  for (const camp of world.camps) {
    if (!camp.active) continue;
    const population = livingCampMembers(world, camp).length;
    const safety = camp.militaryPower / Math.max(2, population + 1);
    const supply = (camp.storage.food + camp.storage.water) / Math.max(4, population + 2);
    const opportunity = camp.power / Math.max(8, population + 2);
    const distanceCost = distanceBetween(agent.position, camp.position) * 0.12;
    const score = safety * 0.16 + supply * 0.38 + opportunity * 0.2 - distanceCost;
    if (score > bestScore) {
      bestScore = score;
      best = camp;
    }
  }
  return best;
}

function frontierTarget(world: CivilizationWorldState, agent: CivilizationAgent): AgentTarget {
  const angle = worldRandom(world) * TAU;
  const distance = 8 + worldRandom(world) * (WORLD_HALF_SIZE - 12);
  const position = boundedPosition({
    x: agent.position.x + Math.cos(angle) * distance,
    z: agent.position.z + Math.sin(angle) * distance,
  }, 2);
  return target("point", `frontier-${world.tick}-${agent.id}`, "unmapped frontier", position);
}

function isActionValid(world: CivilizationWorldState, agent: CivilizationAgent): boolean {
  if (!agent.alive) return false;
  const camp = getActiveCamp(world, agent.campId);
  switch (agent.action) {
    case "gather_food":
    case "gather_water":
    case "gather_wood":
    case "mine_ore": {
      const resource = world.resources.find((item) => item.id === agent.target?.id);
      return Boolean(resource && resource.amount > 0.02 && totalInventory(agent.inventory) < agent.capacity);
    }
    case "return_camp":
    case "build":
    case "research":
    case "reproduce":
    case "rest":
      return Boolean(camp);
    case "raid": {
      const victim = getActiveCamp(world, agent.target?.id ?? null);
      return Boolean(camp && victim && activeRelation(world, camp.id, victim.id)?.status === "war");
    }
    case "join_camp":
      return Boolean(getActiveCamp(world, agent.target?.id ?? null));
    case "defend": {
      const opponent = world.agents.find((candidate) => candidate.id === agent.target?.id);
      return Boolean(camp && opponent?.alive);
    }
    default:
      return true;
  }
}

function executeAgentAction(
  world: CivilizationWorldState,
  agent: CivilizationAgent,
  dt: number,
): void {
  agent.actionProgress += dt;
  switch (agent.action) {
    case "eat":
      executeConsume(world, agent, "food", dt);
      break;
    case "drink":
      executeConsume(world, agent, "water", dt);
      break;
    case "rest":
      executeRest(world, agent, dt);
      break;
    case "gather_food":
      executeGather(world, agent, "food", dt);
      break;
    case "gather_water":
      executeGather(world, agent, "water", dt);
      break;
    case "gather_wood":
      executeGather(world, agent, "wood", dt);
      break;
    case "mine_ore":
      executeGather(world, agent, "ore", dt);
      break;
    case "return_camp":
      executeReturn(world, agent, dt);
      break;
    case "build":
      executeBuild(world, agent, dt);
      break;
    case "research":
      executeResearch(world, agent, dt);
      break;
    case "reproduce":
      executeReproduce(world, agent, dt);
      break;
    case "raid":
      executeRaid(world, agent, dt);
      break;
    case "defend":
      executeDefend(world, agent, dt);
      break;
    case "join_camp":
      executeJoinCamp(world, agent, dt);
      break;
    case "wander":
    case "flee":
      executeMovementTarget(world, agent, dt);
      break;
    default:
      dampVelocity(agent, dt);
      break;
  }
}

function executeConsume(
  world: CivilizationWorldState,
  agent: CivilizationAgent,
  kind: "food" | "water",
  dt: number,
): void {
  dampVelocity(agent, dt);
  const meter = kind === "food" ? agent.hunger : agent.hydration;
  const desired = Math.min(kind === "food" ? 0.72 * dt : 0.82 * dt, (98 - meter) / 22);
  let amount = Math.min(desired, agent.inventory[kind]);
  agent.inventory[kind] -= amount;
  const camp = getActiveCamp(world, agent.campId);
  if (camp && amount < desired && isNear(agent.position, camp.position, camp.radius)) {
    const fromCamp = Math.min(desired - amount, camp.storage[kind]);
    camp.storage[kind] -= fromCamp;
    amount += fromCamp;
  }
  if (kind === "food") agent.hunger = clamp(agent.hunger + amount * 22, 0, 100);
  else agent.hydration = clamp(agent.hydration + amount * 25, 0, 100);
  if (amount <= EPSILON || (kind === "food" ? agent.hunger : agent.hydration) >= 94) {
    agent.decisionTimer = 0;
  }
}

function executeRest(world: CivilizationWorldState, agent: CivilizationAgent, dt: number): void {
  const camp = getActiveCamp(world, agent.campId);
  if (!camp) {
    agent.decisionTimer = 0;
    return;
  }
  if (!moveToward(world, agent, camp.position, dt, camp.radius * 0.7)) return;
  const medicine = hasTechnology(camp, "medicine") ? 1.65 : 1;
  const infirmary = 1 + camp.structures.infirmary * 0.2;
  agent.energy = clamp(agent.energy + (1.7 + camp.structures.shelter * 0.22) * dt, 0, 100);
  agent.health = clamp(agent.health + 0.055 * medicine * infirmary * dt, 0, 100);
  if (agent.energy >= 94 && agent.health >= 92) agent.decisionTimer = 0;
}

function executeGather(
  world: CivilizationWorldState,
  agent: CivilizationAgent,
  kind: ResourceKind,
  dt: number,
): void {
  const resource = world.resources.find((item) => item.id === agent.target?.id);
  if (!resource || resource.kind !== kind || resource.amount <= EPSILON) {
    agent.decisionTimer = 0;
    return;
  }
  if (!moveToward(world, agent, resource.position, dt, 0.85)) return;
  const camp = getActiveCamp(world, agent.campId);
  const toolMultiplier = camp && hasTechnology(camp, "bronze_working") ? 1.42 : 1;
  const logistics = camp && hasTechnology(camp, "logistics") ? 1.18 : 1;
  const baseRate = kind === "water" ? 1.18 : kind === "food" ? 1.02 : kind === "wood" ? 0.86 : 0.62;
  const capacity = Math.max(0, agent.capacity - totalInventory(agent.inventory));
  const amount = Math.min(resource.amount, capacity, baseRate * toolMultiplier * logistics * dt);
  if (amount <= EPSILON) {
    agent.decisionTimer = 0;
    return;
  }
  resource.amount = Math.max(0, resource.amount - amount);
  agent.inventory[kind] += amount;
  agent.harvested += amount;
  agent.experience += amount * 0.012;
  world.stats.resourcesHarvested[kind] += amount;
  if (resource.amount <= EPSILON || totalInventory(agent.inventory) >= agent.capacity - 0.05) {
    agent.decisionTimer = 0;
  }
}

function executeReturn(world: CivilizationWorldState, agent: CivilizationAgent, dt: number): void {
  const camp = getActiveCamp(world, agent.campId);
  if (!camp) {
    agent.decisionTimer = 0;
    return;
  }
  if (!moveToward(world, agent, camp.position, dt, camp.radius * 0.72)) return;
  for (const kind of ["food", "water", "wood", "ore"] as const) {
    const reserve = kind === "food" || kind === "water" ? 0.8 : 0;
    const available = Math.max(0, agent.inventory[kind] - reserve);
    const amount = Math.min(available, Math.max(0, CAMP_STORAGE_LIMIT - camp.storage[kind]));
    camp.storage[kind] += amount;
    agent.inventory[kind] -= amount;
    agent.influence += amount * 0.012;
  }
  agent.decisionTimer = 0;
}

function constructionCost(camp: CivilizationCamp, kind: StructureKind): ConstructionCost {
  const nextLevel = camp.structures[kind] + 1;
  const woodBase: Record<StructureKind, number> = {
    shelter: 8,
    farm: 7,
    well: 8,
    walls: 10,
    workshop: 9,
    infirmary: 9,
    archive: 8,
    roads: 9,
    council: 11,
  };
  const oreBase: Record<StructureKind, number> = {
    shelter: 0,
    farm: 0,
    well: 1,
    walls: 3,
    workshop: 3,
    infirmary: 2,
    archive: 1,
    roads: 2,
    council: 3,
  };
  return {
    wood: woodBase[kind] * (1 + (nextLevel - 1) * 0.62),
    ore: oreBase[kind] * (1 + (nextLevel - 1) * 0.52),
  };
}

function canBuild(camp: CivilizationCamp, kind: StructureKind): boolean {
  const cost = constructionCost(camp, kind);
  return camp.storage.wood >= Math.min(1, cost.wood) && camp.storage.ore >= Math.min(0.25, cost.ore);
}

function executeBuild(world: CivilizationWorldState, agent: CivilizationAgent, dt: number): void {
  const camp = getActiveCamp(world, agent.campId);
  const kind = camp?.constructionTarget ?? null;
  if (!camp || !kind) {
    agent.decisionTimer = 0;
    return;
  }
  if (!moveToward(world, agent, camp.position, dt, camp.radius * 0.72)) return;
  const cost = constructionCost(camp, kind);
  const workshop = 1 + camp.structures.workshop * 0.11;
  const bronze = hasTechnology(camp, "bronze_working") ? 1.22 : 1;
  let labor = 0.42 * workshop * bronze * dt;
  labor = Math.min(labor, 1 - camp.constructionProgress);
  if (cost.wood > 0) labor = Math.min(labor, camp.storage.wood / cost.wood);
  if (cost.ore > 0) labor = Math.min(labor, camp.storage.ore / cost.ore);
  if (labor <= EPSILON) {
    agent.decisionTimer = 0;
    return;
  }
  camp.storage.wood -= cost.wood * labor;
  camp.storage.ore -= cost.ore * labor;
  camp.constructionProgress += labor;
  agent.buildContribution += labor;
  agent.experience += labor * 0.15;
  agent.influence += labor * 0.08;
  if (camp.constructionProgress >= 1 - EPSILON) {
    camp.structures[kind] += 1;
    camp.constructionProgress = 0;
    camp.constructionTarget = null;
    agent.decisionTimer = 0;
  }
}

function executeResearch(world: CivilizationWorldState, agent: CivilizationAgent, dt: number): void {
  const camp = getActiveCamp(world, agent.campId);
  const technology = camp?.researchTarget ?? null;
  if (!camp || !technology) {
    agent.decisionTimer = 0;
    return;
  }
  if (!moveToward(world, agent, camp.position, dt, camp.radius * 0.74)) return;
  const definition = TECHNOLOGY_TREE[technology];
  const writing = hasTechnology(camp, "writing") ? 1.3 : 1;
  const archives = 1 + camp.structures.archive * 0.14;
  const inquiry = campBeliefHasTenet(world, camp, "knowledge_seeking") ? 1.07 : 1;
  const progress = 0.42 * writing * archives * inquiry * dt;
  camp.researchProgress += progress;
  agent.knowledge += progress * 0.032;
  agent.researchContribution += progress;
  agent.influence += progress * 0.008;
  if (camp.researchProgress + EPSILON < definition.cost) return;
  camp.technologies.push(technology);
  camp.researchProgress = 0;
  camp.researchTarget = null;
  world.stats.technologiesUnlocked += 1;
  pushMajorEvent(
    world,
    "tech_unlocked",
    "positive",
    `${camp.name} unlocks ${definition.label}`,
    `${agent.name}'s work completes ${definition.label}, changing what ${camp.name} can build and sustain.`,
    [agent.id],
    [camp.id],
  );
  agent.decisionTimer = 0;
}

function canReproduce(
  world: CivilizationWorldState,
  agent: CivilizationAgent,
  camp: CivilizationCamp,
): boolean {
  if (world.time < DAY_LENGTH * 0.72) return false;
  if (world.agents.filter((candidate) => candidate.alive).length >= MAX_POPULATION) return false;
  if (agent.age < 16 || world.day - agent.lastReproductionDay < 3.1) return false;
  const population = livingCampMembers(world, camp).length;
  const lineageSupport = campBeliefHasTenet(world, camp, "ancestor_memory") ? 1 : 0;
  const softCapacity = 2 + camp.structures.shelter * 3 + camp.structures.farm * 2 + camp.structures.well * 2 + lineageSupport;
  if (population >= Math.max(3, softCapacity)) return false;
  return camp.storage.food >= 9 + population * 1.2 && camp.storage.water >= 9 + population * 1.2;
}

function ancestorIds(
  byId: ReadonlyMap<string, CivilizationAgent>,
  agent: CivilizationAgent,
  maxDepth = 4,
): Set<string> {
  const ancestors = new Set<string>();
  let frontier = [...agent.parentIds];
  for (let depth = 0; depth < maxDepth && frontier.length > 0; depth += 1) {
    const next: string[] = [];
    for (const id of frontier) {
      if (ancestors.has(id)) continue;
      ancestors.add(id);
      const relative = byId.get(id);
      if (relative) next.push(...relative.parentIds);
    }
    frontier = next;
  }
  return ancestors;
}

function areCloseKin(
  byId: ReadonlyMap<string, CivilizationAgent>,
  left: CivilizationAgent,
  right: CivilizationAgent,
): boolean {
  if (left.id === right.id || left.parentIds.includes(right.id) || right.parentIds.includes(left.id)) return true;
  if (left.childrenIds.includes(right.id) || right.childrenIds.includes(left.id)) return true;
  const leftAncestors = ancestorIds(byId, left);
  const rightAncestors = ancestorIds(byId, right);
  return leftAncestors.has(right.id) || rightAncestors.has(left.id) ||
    [...leftAncestors].some((id) => rightAncestors.has(id));
}

function chooseReproductionPartner(
  world: CivilizationWorldState,
  agent: CivilizationAgent,
  camp: CivilizationCamp,
): CivilizationAgent | null {
  const byId = new Map(world.agents.map((candidate) => [candidate.id, candidate]));
  return world.agents
    .filter((candidate) => {
      if (!candidate.alive || candidate.campId !== camp.id || areCloseKin(byId, agent, candidate)) return false;
      if (candidate.age < 16 || world.day - candidate.lastReproductionDay < 3.1) return false;
      if (candidate.health < 52 || candidate.hunger < 48 || candidate.hydration < 48) return false;
      return true;
    })
    .sort((left, right) => {
      const leftBond = agent.relationships[left.id];
      const rightBond = agent.relationships[right.id];
      const leftScore = (leftBond?.trust ?? 0.48) + (leftBond?.respect ?? 0.28) - (leftBond?.grievance ?? 0) + left.satisfaction * 0.16;
      const rightScore = (rightBond?.trust ?? 0.48) + (rightBond?.respect ?? 0.28) - (rightBond?.grievance ?? 0) + right.satisfaction * 0.16;
      return rightScore - leftScore || left.id.localeCompare(right.id);
    })[0] ?? null;
}

function executeReproduce(world: CivilizationWorldState, agent: CivilizationAgent, dt: number): void {
  const camp = getActiveCamp(world, agent.campId);
  if (!camp || !canReproduce(world, agent, camp)) {
    agent.decisionTimer = 0;
    return;
  }
  if (!moveToward(world, agent, camp.position, dt, camp.radius * 0.66)) return;
  if (agent.actionProgress < 4.5) return;
  camp.storage.food -= 6;
  camp.storage.water -= 6;
  const ordinal = world.nextAgentId;
  const id = `agent-${String(ordinal).padStart(3, "0")}`;
  world.nextAgentId += 1;
  const angle = worldRandom(world) * TAU;
  const coParent = chooseReproductionPartner(world, agent, camp);
  const parents = coParent ? [agent, coParent] : [agent];
  const childRelationships = Object.fromEntries(
    parents.map((parent) => [
      parent.id,
      { trust: 0.82, respect: 0.58, grievance: 0, lastInteractionDay: world.day },
    ]),
  );
  const child: CivilizationAgent = {
    id,
    name: `Agent ${String(ordinal).padStart(2, "0")}`,
    color: camp.color,
    position: boundedPosition({
      x: camp.position.x + Math.cos(angle) * 1.2,
      z: camp.position.z + Math.sin(angle) * 1.2,
    }, 1),
    velocity: { x: 0, z: 0 },
    heading: angle,
    speed: 3,
    capacity: 12,
    age: 0,
    generation: Math.max(...parents.map((parent) => parent.generation)) + 1,
    parentIds: parents.map((parent) => parent.id),
    childrenIds: [],
    bornAtDay: world.day,
    alive: true,
    deathDay: null,
    health: 100,
    hunger: 90,
    hydration: 90,
    energy: 92,
    inventory: { food: 0.8, water: 0.8, wood: 0, ore: 0 },
    campId: camp.id,
    currentPlan: "survive",
    goal: "Learn how to survive and gain power",
    rationale: "The new agent begins with equal base capabilities and only inherited circumstances.",
    action: "idle",
    target: null,
    actionProgress: 0,
    decisionTimer: 0,
    personalPower: 0,
    influence: 0,
    knowledge: 0,
    experience: 0,
    relationships: childRelationships,
    loyalty: 0.76,
    satisfaction: 0.76,
    lastReproductionDay: world.day,
    joinedCampDay: world.day,
    unaffiliatedSinceDay: null,
    kills: 0,
    harvested: 0,
    buildContribution: 0,
    researchContribution: 0,
    beliefId: agent.beliefId,
    conviction: agent.beliefId ? clamp(agent.conviction * 0.45, 0.08, 0.42) : 0,
    spiritualInfluence: 0,
    lastBeliefChangeDay: world.day,
    planLearning: {},
    recentMemories: [],
    deliberation: emptyDeliberation(world.day),
    decisionSnapshot: null,
  };
  for (const parent of parents) {
    parent.childrenIds.push(child.id);
    parent.lastReproductionDay = world.day;
    parent.relationships[child.id] = {
      trust: 0.84,
      respect: 0.48,
      grievance: 0,
      lastInteractionDay: world.day,
    };
  }
  if (coParent) {
    const bond = agent.relationships[coParent.id] ?? {
      trust: 0.5,
      respect: 0.32,
      grievance: 0,
      lastInteractionDay: world.day,
    };
    agent.relationships[coParent.id] = {
      ...bond,
      trust: clamp(bond.trust + 0.05, 0, 1),
      lastInteractionDay: world.day,
    };
    coParent.relationships[agent.id] = { ...agent.relationships[coParent.id] };
  }
  camp.memberIds.push(child.id);
  world.agents.push(child);
  world.stats.births += 1;
  pushMajorEvent(
    world,
    "birth",
    "positive",
    `${child.name} is born at ${camp.name}`,
    `${parents.map((parent) => parent.name).join(" and ")} ${parents.length === 1 ? "creates" : "create"} a generation ${child.generation} descendant, extending the lineage and ${camp.name}'s future population.`,
    [...parents.map((parent) => parent.id), child.id],
    [camp.id],
  );
  chooseAgentAction(world, child);
  agent.decisionTimer = 0;
}

function executeMovementTarget(
  world: CivilizationWorldState,
  agent: CivilizationAgent,
  dt: number,
): void {
  if (!agent.target) {
    agent.decisionTimer = 0;
    return;
  }
  if (moveToward(world, agent, agent.target.position, dt, 0.7)) {
    agent.knowledge += 0.04;
    agent.experience += 0.015;
    agent.decisionTimer = 0;
  }
}

function executeJoinCamp(world: CivilizationWorldState, agent: CivilizationAgent, dt: number): void {
  const camp = getActiveCamp(world, agent.target?.id ?? null);
  if (!camp) {
    agent.decisionTimer = 0;
    return;
  }
  if (!moveToward(world, agent, camp.position, dt, camp.radius)) return;
  transferAgentToCamp(world, agent, camp, "join");
  agent.action = "idle";
  agent.decisionTimer = 2;
}

function executeDefend(world: CivilizationWorldState, agent: CivilizationAgent, dt: number): void {
  const opponent = world.agents.find((candidate) => candidate.id === agent.target?.id && candidate.alive);
  if (!opponent) {
    agent.decisionTimer = 0;
    return;
  }
  if (!moveToward(world, agent, opponent.position, dt, 1.15)) return;
  if (agent.actionProgress >= 1.7) {
    resolveCombatRound(world, opponent, agent);
    agent.actionProgress = 0;
  }
}

function executeRaid(world: CivilizationWorldState, attacker: CivilizationAgent, dt: number): void {
  const home = getActiveCamp(world, attacker.campId);
  const victimCamp = getActiveCamp(world, attacker.target?.id ?? null);
  if (!home || !victimCamp || activeRelation(world, home.id, victimCamp.id)?.status !== "war") {
    attacker.decisionTimer = 0;
    return;
  }
  if (!moveToward(world, attacker, victimCamp.position, dt, victimCamp.radius * 0.78)) return;
  if (attacker.actionProgress < 1.8) return;
  attacker.actionProgress = 0;
  const defenders = livingCampMembers(world, victimCamp)
    .filter((candidate) => candidate.id !== attacker.id)
    .sort((left, right) => distanceBetween(left.position, victimCamp.position) - distanceBetween(right.position, victimCamp.position));
  const defender = defenders[0];
  if (defender) {
    resolveCombatRound(world, attacker, defender);
  } else {
    captureCamp(world, home, victimCamp, attacker);
  }
  if (!attacker.alive || !victimCamp.active) return;
  const remaining = livingCampMembers(world, victimCamp);
  const averageHealth = remaining.length === 0
    ? 0
    : remaining.reduce((sum, member) => sum + member.health, 0) / remaining.length;
  const captureChance = home.militaryPower > victimCamp.militaryPower * 1.3 && averageHealth < 33
    ? 0.16
    : 0;
  if (captureChance > 0 && worldRandom(world) < captureChance) {
    captureCamp(world, home, victimCamp, attacker);
    return;
  }
  const kind: ResourceKind = victimCamp.storage.food >= victimCamp.storage.water ? "food" : "water";
  const stolen = Math.min(victimCamp.storage[kind], 0.5 + worldRandom(world) * 1.1, attacker.capacity - totalInventory(attacker.inventory));
  victimCamp.storage[kind] -= stolen;
  attacker.inventory[kind] += stolen;
  attacker.influence += stolen * 0.03;
}

function resolveCombatRound(
  world: CivilizationWorldState,
  attacker: CivilizationAgent,
  defender: CivilizationAgent,
): void {
  if (!attacker.alive || !defender.alive) return;
  const attackerCamp = getActiveCamp(world, attacker.campId);
  const defenderCamp = getActiveCamp(world, defender.campId);
  const attackTech = attackerCamp && hasTechnology(attackerCamp, "bronze_working") ? 1.22 : 1;
  const defenseTech = defenderCamp && hasTechnology(defenderCamp, "masonry") ? 1.12 : 1;
  const attackBelief = campBeliefHasTenet(world, attackerCamp, "martial_merit") ? 1.055 : 1;
  const defenseBelief = campBeliefHasTenet(world, defenderCamp, "ordered_duty") ? 1.035 : 1;
  const walls = defenderCamp && isNear(defender.position, defenderCamp.position, defenderCamp.radius * 1.6)
    ? 1 + defenderCamp.structures.walls * 0.1
    : 1;
  const attackCondition = (0.48 + attacker.health / 210 + attacker.energy / 420) * attackTech * attackBelief;
  const defenseCondition = (0.48 + defender.health / 220 + defender.energy / 440) * defenseTech * defenseBelief * walls;
  const damageToDefender = (5.2 + worldRandom(world) * 5.8 + attacker.experience * 0.12) * attackCondition / defenseCondition;
  const damageToAttacker = (3.1 + worldRandom(world) * 4.5 + defender.experience * 0.08) * defenseCondition / attackCondition;
  defender.health -= damageToDefender;
  attacker.health -= damageToAttacker;
  attacker.energy = clamp(attacker.energy - 4.2, 0, 100);
  defender.energy = clamp(defender.energy - 3.4, 0, 100);
  attacker.experience += 0.22;
  defender.experience += 0.16;
  recordConflictRelationship(attacker, defender, world.day);
  recordConflictRelationship(defender, attacker, world.day);
  if (defender.health <= 0) {
    attacker.kills += 1;
    attacker.influence += 3;
    killAgent(world, defender, attacker, `was killed by ${attacker.name} during combat`);
    updateWarScore(world, attackerCamp, defenderCamp, 2.2);
  }
  if (attacker.health <= 0) {
    defender.kills += 1;
    defender.influence += 3;
    killAgent(world, attacker, defender, `was killed by ${defender.name} while attacking`);
    updateWarScore(world, defenderCamp, attackerCamp, 2.2);
  }
}

function recordConflictRelationship(
  observer: CivilizationAgent,
  opponent: CivilizationAgent,
  day: number,
): void {
  const relation = observer.relationships[opponent.id] ?? {
    trust: 0.35,
    respect: 0.25,
    grievance: 0,
    lastInteractionDay: day,
  };
  relation.trust = clamp(relation.trust - 0.08, 0, 1);
  relation.respect = clamp(relation.respect + 0.025, 0, 1);
  relation.grievance = clamp(relation.grievance + 0.13, 0, 1);
  relation.lastInteractionDay = day;
  observer.relationships[opponent.id] = relation;
}

function updateWarScore(
  world: CivilizationWorldState,
  winner: CivilizationCamp | null,
  loser: CivilizationCamp | null,
  amount: number,
): void {
  if (!winner || !loser) return;
  const relation = activeRelation(world, winner.id, loser.id);
  if (!relation) return;
  if (relation.campAId === winner.id) relation.warScoreA += amount;
  else relation.warScoreB += amount;
  relation.tension = clamp(relation.tension + 0.05, 0, 1);
  relation.lastConflictDay = world.day;
}

function moveToward(
  world: CivilizationWorldState,
  agent: CivilizationAgent,
  destination: Vec2,
  dt: number,
  stopDistance: number,
): boolean {
  const offsetX = destination.x - agent.position.x;
  const offsetZ = destination.z - agent.position.z;
  const distance = Math.hypot(offsetX, offsetZ);
  if (distance <= stopDistance) {
    dampVelocity(agent, dt);
    return true;
  }
  const directionX = offsetX / Math.max(distance, EPSILON);
  const directionZ = offsetZ / Math.max(distance, EPSILON);
  const camp = getActiveCamp(world, agent.campId);
  const logistics = camp && hasTechnology(camp, "logistics") ? 1.18 : 1;
  const condition = clamp(0.58 + agent.energy / 230 + agent.health / 500, 0.45, 1.18);
  const speed = agent.speed * logistics * condition;
  const travel = Math.min(Math.max(0, distance - stopDistance), speed * dt);
  agent.velocity.x = directionX * speed;
  agent.velocity.z = directionZ * speed;
  agent.position = boundedPosition({
    x: agent.position.x + directionX * travel,
    z: agent.position.z + directionZ * travel,
  }, 0.6);
  agent.heading = Math.atan2(directionX, directionZ);
  agent.energy = clamp(agent.energy - travel * 0.017, 0, 100);
  return distanceBetween(agent.position, destination) <= stopDistance + EPSILON;
}

function dampVelocity(agent: CivilizationAgent, dt: number): void {
  const damping = Math.exp(-Math.min(12, dt * 7));
  agent.velocity.x *= damping;
  agent.velocity.z *= damping;
  if (Math.abs(agent.velocity.x) < 0.001) agent.velocity.x = 0;
  if (Math.abs(agent.velocity.z) < 0.001) agent.velocity.z = 0;
}

function discoverResources(world: CivilizationWorldState, agent: CivilizationAgent): void {
  const camp = getActiveCamp(world, agent.campId);
  if (!camp) return;
  const radius = 5.5 + Math.min(4, agent.knowledge * 0.04) + (hasTechnology(camp, "writing") ? 1.4 : 0);
  let discoveries = 0;
  for (const resource of world.resources) {
    if (resource.discoveredByCampIds.includes(camp.id)) continue;
    if (distanceBetween(agent.position, resource.position) <= radius) {
      resource.discoveredByCampIds.push(camp.id);
      discoveries += 1;
    }
  }
  if (discoveries > 0) {
    agent.knowledge += discoveries * 0.08;
    agent.experience += discoveries * 0.02;
  }
}

function getActiveBelief(
  world: CivilizationWorldState,
  beliefId: string | null,
): CivilizationBeliefSystem | null {
  if (!beliefId) return null;
  return world.beliefs.find((belief) => belief.id === beliefId && belief.active) ?? null;
}

function campBeliefHasTenet(
  world: CivilizationWorldState,
  camp: CivilizationCamp | null,
  tenet: BeliefTenetId,
): boolean {
  const belief = camp ? getActiveBelief(world, camp.dominantBeliefId) : null;
  return Boolean(belief?.tenets.includes(tenet));
}

function beliefTenetUtility(
  world: CivilizationWorldState,
  agent: CivilizationAgent,
  camp: CivilizationCamp | null,
  tenet: BeliefTenetId,
): number {
  const population = camp ? Math.max(1, livingCampMembers(world, camp).length) : 1;
  const foodSecurity = camp ? clamp(camp.storage.food / (population * 10), 0, 1) : agent.hunger / 100;
  const waterSecurity = camp ? clamp(camp.storage.water / (population * 11), 0, 1) : agent.hydration / 100;
  const scarcity = 1 - (foodSecurity + waterSecurity) / 2;
  const warPressure = camp ? clamp(enemyCamps(world, camp).length * 0.45, 0, 1) : 0.15;
  const family = clamp(agent.childrenIds.length * 0.18 + agent.parentIds.length * 0.08, 0, 1);
  const learning = clamp(agent.knowledge / 14 + (camp?.technologies.length ?? 1) / 12, 0, 1);
  const disorder = camp ? 1 - camp.cohesion : 0.45;
  const wealth = camp
    ? clamp(totalInventory(camp.storage) / Math.max(35, population * 34), 0, 1)
    : clamp(totalInventory(agent.inventory) / Math.max(1, agent.capacity), 0, 1);
  switch (tenet) {
    case "reciprocal_aid":
      return clamp(0.28 + scarcity * 0.38 + (camp ? allianceCount(world, camp.id) * 0.08 : 0) + family * 0.15, 0, 1);
    case "land_stewardship":
      return clamp(0.3 + scarcity * 0.32 + agent.harvested / 90, 0, 1);
    case "ancestor_memory":
      return clamp(0.28 + family * 0.46 + Math.min(0.22, agent.age / 160), 0, 1);
    case "martial_merit":
      return clamp(0.18 + warPressure * 0.52 + agent.kills * 0.12 + agent.experience / 28, 0, 1);
    case "knowledge_seeking":
      return clamp(0.24 + learning * 0.58 + agent.researchContribution / 120, 0, 1);
    case "ordered_duty":
      return clamp(0.25 + disorder * 0.46 + (camp && hasTechnology(camp, "governance") ? 0.15 : 0), 0, 1);
    case "free_conscience":
      return clamp(0.24 + (1 - agent.loyalty) * 0.34 + (1 - agent.satisfaction) * 0.22 + agent.influence / 60, 0, 1);
    case "shared_prosperity":
      return clamp(0.25 + wealth * 0.46 + Math.max(0, 0.65 - agent.satisfaction) * 0.24, 0, 1);
  }
}

function beliefFit(
  world: CivilizationWorldState,
  agent: CivilizationAgent,
  belief: CivilizationBeliefSystem,
): number {
  const camp = getActiveCamp(world, agent.campId);
  const tenetFit = belief.tenets.reduce(
    (sum, tenet) => sum + beliefTenetUtility(world, agent, camp, tenet),
    0,
  ) / Math.max(1, belief.tenets.length);
  const localAdherents = camp
    ? livingCampMembers(world, camp).filter((member) => member.beliefId === belief.id).length
    : 0;
  const localExposure = camp ? localAdherents / Math.max(1, livingCampMembers(world, camp).length) : 0;
  const familyExposure = agent.parentIds.concat(agent.childrenIds)
    .filter((id) => world.agents.some((candidate) => candidate.id === id && candidate.alive && candidate.beliefId === belief.id))
    .length;
  const founderBond = agent.relationships[belief.founderAgentId];
  const founderTrust = founderBond
    ? founderBond.trust * 0.12 + founderBond.respect * 0.1 - founderBond.grievance * 0.12
    : 0;
  const distanceReach = clamp(1 - distanceBetween(agent.position, belief.sacredSite) / (WORLD_HALF_SIZE * 1.45), 0, 1);
  const institutionalReach = camp && belief.campIds.includes(camp.id)
    ? 0.12 + camp.shrineLevel * 0.025
    : 0;
  return clamp(
    tenetFit * 0.58 + localExposure * 0.2 + Math.min(0.12, familyExposure * 0.06) + founderTrust + distanceReach * 0.07 + institutionalReach,
    0,
    1,
  );
}

function chooseBeliefTenets(
  world: CivilizationWorldState,
  founder: CivilizationAgent,
  excluded: readonly BeliefTenetId[] = [],
): BeliefTenetId[] {
  const camp = getActiveCamp(world, founder.campId);
  const excludedSet = new Set(excluded);
  const ranked = (Object.keys(BELIEF_TENET_LABELS) as BeliefTenetId[])
    .filter((tenet) => !excludedSet.has(tenet))
    .map((tenet) => ({
      tenet,
      score: beliefTenetUtility(world, founder, camp, tenet) + worldRandom(world) * 0.07,
    }))
    .sort((left, right) => right.score - left.score || left.tenet.localeCompare(right.tenet));
  const count = camp && (hasTechnology(camp, "writing") || hasTechnology(camp, "governance")) ? 3 : 2;
  return ranked.slice(0, count).map((entry) => entry.tenet);
}

function beliefName(world: CivilizationWorldState): string {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const prefix = BELIEF_NAME_PREFIXES[Math.floor(worldRandom(world) * BELIEF_NAME_PREFIXES.length)];
    const noun = BELIEF_NAME_NOUNS[Math.floor(worldRandom(world) * BELIEF_NAME_NOUNS.length)];
    const candidate = `${prefix} ${noun}`;
    if (!world.beliefs.some((belief) => belief.name === candidate)) return candidate;
  }
  return `Frontier Accord ${world.nextBeliefId}`;
}

function createBeliefSystem(
  world: CivilizationWorldState,
  founder: CivilizationAgent,
  parent: CivilizationBeliefSystem | null,
  initialAdherentIds: string[],
): CivilizationBeliefSystem {
  const camp = getActiveCamp(world, founder.campId);
  const ordinal = world.nextBeliefId;
  world.nextBeliefId += 1;
  const id = `belief-${String(ordinal).padStart(3, "0")}`;
  const inherited = parent ? [...parent.tenets] : [];
  let tenets = chooseBeliefTenets(world, founder);
  if (parent && inherited.length > 0) {
    const replacement = chooseBeliefTenets(world, founder, inherited)[0];
    const replaceAt = Math.floor(worldRandom(world) * inherited.length);
    if (replacement) inherited[replaceAt] = replacement;
    tenets = [...new Set(inherited)];
  }
  const angle = worldRandom(world) * TAU;
  const base = camp?.position ?? founder.position;
  const sacredSite = boundedPosition({
    x: base.x + Math.cos(angle) * (1.4 + worldRandom(world) * 1.7),
    z: base.z + Math.sin(angle) * (1.4 + worldRandom(world) * 1.7),
  }, 4);
  const belief: CivilizationBeliefSystem = {
    id,
    name: beliefName(world),
    color: BELIEF_COLORS[(ordinal - 1) % BELIEF_COLORS.length],
    foundedDay: world.day,
    founderAgentId: founder.id,
    originCampId: camp?.id ?? null,
    parentBeliefId: parent?.id ?? null,
    tenets,
    sacredSite,
    adherentIds: [...new Set(initialAdherentIds)],
    campIds: camp ? [camp.id] : [],
    influence: 0,
    unity: 0.62,
    active: true,
    reformationCount: 0,
    schismCount: 0,
  };
  world.beliefs.push(belief);
  for (const idToJoin of belief.adherentIds) {
    const adherent = world.agents.find((agent) => agent.id === idToJoin && agent.alive);
    if (!adherent) continue;
    if (adherent.beliefId !== belief.id) world.stats.conversions += 1;
    adherent.beliefId = belief.id;
    adherent.conviction = adherent.id === founder.id ? 0.68 : 0.46;
    adherent.lastBeliefChangeDay = world.day;
  }
  founder.spiritualInfluence += parent ? 0.7 : 1;
  founder.action = parent ? "negotiate" : "idle";
  founder.currentPlan = parent ? "expand_influence" : "advance_knowledge";
  founder.goal = parent ? `Establish ${belief.name} as an independent belief` : `Give ${belief.name} a durable foundation`;
  founder.rationale = parent
    ? "Current doctrine no longer fits lived conditions, so a coherent alternative may create greater unity and influence."
    : "A shared account of survival, obligation, and power may coordinate voluntary adherents without assigning anyone a fixed identity.";
  founder.decisionTimer = 3;
  world.stats.beliefsFounded += 1;
  if (parent) {
    parent.schismCount += 1;
    world.stats.schisms += 1;
    pushMajorEvent(
      world,
      "belief_schism",
      "warning",
      `${belief.name} breaks from ${parent.name}`,
      `${founder.name} and ${belief.adherentIds.length - 1} supporter${belief.adherentIds.length === 2 ? "" : "s"} reject part of ${parent.name}, forming a new belief around ${tenets.map(getBeliefTenetLabel).join(" and ")}.`,
      belief.adherentIds,
      [...new Set([camp?.id, parent.originCampId].filter((value): value is string => Boolean(value)))],
      [parent.id, belief.id],
    );
  } else {
    pushMajorEvent(
      world,
      "belief_founded",
      "positive",
      `${founder.name} founds ${belief.name}`,
      `${founder.name} turns lived conditions into a voluntary belief system centered on ${tenets.map(getBeliefTenetLabel).join(" and ")}. Others remain free to join, leave, or stay secular.`,
      [founder.id],
      camp ? [camp.id] : [],
      [belief.id],
    );
  }
  return belief;
}

function reconcileBeliefs(world: CivilizationWorldState): void {
  const validBeliefIds = new Set(world.beliefs.map((belief) => belief.id));
  for (const agent of world.agents) {
    if (agent.beliefId && (!agent.alive || !validBeliefIds.has(agent.beliefId))) {
      agent.beliefId = null;
      agent.conviction = 0;
    }
  }
  for (const camp of world.camps) {
    if (!camp.active) {
      camp.dominantBeliefId = null;
      camp.beliefDiversity = 0;
      continue;
    }
    const members = livingCampMembers(world, camp);
    const counts = new Map<string, number>();
    let secular = 0;
    for (const member of members) {
      if (member.beliefId && validBeliefIds.has(member.beliefId)) {
        counts.set(member.beliefId, (counts.get(member.beliefId) ?? 0) + 1);
      } else {
        secular += 1;
      }
    }
    const ranked = [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
    const leading = ranked[0] ?? null;
    camp.dominantBeliefId = leading && leading[1] / Math.max(1, members.length) >= 0.5 ? leading[0] : null;
    const largestGroup = Math.max(secular, leading?.[1] ?? 0);
    camp.beliefDiversity = members.length > 1 ? clamp(1 - largestGroup / members.length, 0, 1) : 0;
  }
  for (const belief of world.beliefs) {
    const wasActive = belief.active;
    const previousCampIds = [...belief.campIds];
    const adherents = world.agents.filter((agent) => agent.alive && agent.beliefId === belief.id);
    belief.adherentIds = adherents.map((agent) => agent.id);
    belief.campIds = [...new Set(adherents.map((agent) => agent.campId).filter((id): id is string => Boolean(id)))];
    belief.unity = adherents.length > 0
      ? clamp(adherents.reduce((sum, agent) => sum + agent.conviction, 0) / adherents.length, 0, 1)
      : 0;
    belief.influence = adherents.reduce(
      (sum, agent) => sum + 1 + agent.influence * 0.08 + agent.conviction * 1.8,
      0,
    ) + belief.campIds.reduce((sum, campId) => sum + (getActiveCamp(world, campId)?.shrineLevel ?? 0) * 2.2, 0);
    belief.active = adherents.length > 0;
    if (wasActive && !belief.active && world.day - belief.foundedDay > 0.2) {
      world.stats.beliefsFaded += 1;
      pushMajorEvent(
        world,
        "belief_faded",
        "neutral",
        `${belief.name} loses its last adherent`,
        `${belief.name} passes out of active practice, though its record remains in the world's history.`,
        [],
        previousCampIds,
        [belief.id],
      );
    }
  }
}

function lastBeliefEventDay(
  world: CivilizationWorldState,
  beliefId: string,
  types: MajorEventType[],
): number {
  for (let index = world.majorEvents.length - 1; index >= 0; index -= 1) {
    const event = world.majorEvents[index];
    if (event.beliefIds.includes(beliefId) && types.includes(event.type)) return event.day;
  }
  return -100;
}

function runBeliefDynamics(world: CivilizationWorldState, elapsedSeconds: number): void {
  const elapsedDays = elapsedSeconds / DAY_LENGTH;
  reconcileBeliefs(world);
  const living = world.agents.filter((agent) => agent.alive).sort((left, right) => left.id.localeCompare(right.id));
  const activeBeliefs = world.beliefs.filter((belief) => belief.active);
  const beliefCeiling = Math.min(MAX_BELIEF_SYSTEMS, Math.max(2, Math.ceil(living.length / 4)));

  if (world.day >= 4 && activeBeliefs.length < beliefCeiling && world.beliefs.length < MAX_BELIEF_SYSTEMS) {
    const prospectiveFounders = living
      .filter((agent) => agent.age >= 16 && !agent.beliefId && world.day - agent.lastBeliefChangeDay > 1.5)
      .map((agent) => {
        const camp = getActiveCamp(world, agent.campId);
        const circumstance =
          agent.knowledge * 0.025 +
          agent.influence * 0.014 +
          agent.childrenIds.length * 0.07 +
          Math.max(0, 0.7 - agent.satisfaction) * 0.55 +
          (camp ? (1 - camp.cohesion) * 0.16 : 0.24);
        return { agent, pressure: 0.28 + circumstance };
      })
      .sort((left, right) => right.pressure - left.pressure || left.agent.id.localeCompare(right.agent.id));
    for (const prospective of prospectiveFounders) {
      if (chanceForPeriod(world, 0.16 + prospective.pressure * 0.28, elapsedDays)) {
        createBeliefSystem(world, prospective.agent, null, [prospective.agent.id]);
        break;
      }
    }
  }

  const changedByBelief = new Map<string, string[]>();
  for (const agent of living) {
    const available = world.beliefs.filter((belief) => belief.active);
    if (available.length === 0 || world.day - agent.lastBeliefChangeDay < 0.75) continue;
    const ranked = available
      .map((belief) => ({ belief, fit: beliefFit(world, agent, belief) }))
      .sort((left, right) => right.fit - left.fit || left.belief.id.localeCompare(right.belief.id));
    const best = ranked[0];
    const current = getActiveBelief(world, agent.beliefId);
    if (!current) {
      if (best && best.fit > 0.58 && chanceForPeriod(world, 0.04 + (best.fit - 0.58) * 0.7, elapsedDays)) {
        agent.beliefId = best.belief.id;
        agent.conviction = clamp(0.3 + best.fit * 0.3, 0.35, 0.64);
        agent.lastBeliefChangeDay = world.day;
        world.stats.conversions += 1;
        changedByBelief.set(best.belief.id, [...(changedByBelief.get(best.belief.id) ?? []), agent.id]);
      }
      continue;
    }
    const currentFit = beliefFit(world, agent, current);
    const convictionTarget = clamp(0.14 + currentFit * 0.76, 0.08, 0.93);
    agent.conviction += (convictionTarget - agent.conviction) * clamp(elapsedDays * 0.3, 0, 0.3);
    if (best && best.belief.id !== current.id && best.fit > currentFit + 0.2 && agent.conviction < 0.66) {
      if (chanceForPeriod(world, 0.04 + (best.fit - currentFit) * 0.42, elapsedDays)) {
        agent.beliefId = best.belief.id;
        agent.conviction = clamp(0.3 + best.fit * 0.26, 0.34, 0.62);
        agent.lastBeliefChangeDay = world.day;
        world.stats.conversions += 1;
        changedByBelief.set(best.belief.id, [...(changedByBelief.get(best.belief.id) ?? []), agent.id]);
        continue;
      }
    }
    if (currentFit < 0.45 && agent.conviction < 0.55) {
      const rejectionPressure = (0.45 - currentFit) + (0.55 - agent.conviction);
      if (chanceForPeriod(world, 0.11 + rejectionPressure * 0.62, elapsedDays)) {
        const rejected = current;
        agent.beliefId = null;
        agent.conviction = 0;
        agent.lastBeliefChangeDay = world.day;
        world.stats.beliefRejections += 1;
        pushMajorEvent(
          world,
          "belief_rejected",
          "neutral",
          `${agent.name} leaves ${rejected.name}`,
          `${agent.name} judges that ${rejected.name} no longer fits current experience and returns to a secular position.`,
          [agent.id],
          agent.campId ? [agent.campId] : [],
          [rejected.id],
        );
      }
    }
  }
  reconcileBeliefs(world);

  for (const [beliefId, agentIds] of changedByBelief) {
    const belief = getActiveBelief(world, beliefId);
    if (!belief || agentIds.length < Math.max(2, Math.ceil(living.length / 12))) continue;
    if (world.day - lastBeliefEventDay(world, belief.id, ["belief_conversion_wave"]) < 1) continue;
    const campIds = [...new Set(agentIds.map((id) => world.agents.find((agent) => agent.id === id)?.campId).filter((id): id is string => Boolean(id)))];
    pushMajorEvent(
      world,
      "belief_conversion_wave",
      "positive",
      `${belief.name} gains a wave of adherents`,
      `${agentIds.length} agents independently judge ${belief.name}'s tenets useful to their circumstances and adopt it.`,
      agentIds,
      campIds,
      [belief.id],
    );
  }

  for (const belief of world.beliefs.filter((candidate) => candidate.active)) {
    const adherents = belief.adherentIds
      .map((id) => world.agents.find((agent) => agent.id === id && agent.alive))
      .filter((agent): agent is CivilizationAgent => Boolean(agent));
    if (adherents.length >= 3 && world.day - belief.foundedDay > 4 && world.day - lastBeliefEventDay(world, belief.id, ["belief_reformed", "belief_schism"]) > 2) {
      const reformPressure = Math.max(0, 0.82 - belief.unity) + belief.campIds.length * 0.025;
      if (reformPressure > 0.08 && chanceForPeriod(world, 0.035 + reformPressure * 0.16, elapsedDays)) {
        const reformer = [...adherents].sort((left, right) => {
          const leftFit = beliefFit(world, left, belief);
          const rightFit = beliefFit(world, right, belief);
          return leftFit - rightFit || right.influence - left.influence || left.id.localeCompare(right.id);
        })[0];
        const replacement = chooseBeliefTenets(world, reformer, belief.tenets)[0];
        if (replacement) {
          const oldIndex = Math.floor(worldRandom(world) * belief.tenets.length);
          const oldTenet = belief.tenets[oldIndex];
          belief.tenets[oldIndex] = replacement;
          belief.tenets = [...new Set(belief.tenets)];
          belief.reformationCount += 1;
          reformer.spiritualInfluence += 0.55;
          world.stats.reformations += 1;
          pushMajorEvent(
            world,
            "belief_reformed",
            "neutral",
            `${reformer.name} reforms ${belief.name}`,
            `${belief.name} replaces ${getBeliefTenetLabel(oldTenet)} with ${getBeliefTenetLabel(replacement)} as adherents adapt doctrine to changed conditions.`,
            [reformer.id],
            belief.campIds,
            [belief.id],
          );
        }
      }
    }

    if (
      adherents.length >= 6 &&
      belief.campIds.length >= 2 &&
      belief.unity < 0.78 &&
      world.beliefs.filter((candidate) => candidate.active).length < beliefCeiling &&
      world.beliefs.length < MAX_BELIEF_SYSTEMS &&
      world.day - belief.foundedDay > 5 &&
      world.day - lastBeliefEventDay(world, belief.id, ["belief_schism", "belief_reformed"]) > 2
    ) {
      const dissenter = [...adherents]
        .filter((agent) => agent.id !== belief.founderAgentId && agent.conviction < 0.75)
        .sort((left, right) => beliefFit(world, left, belief) - beliefFit(world, right, belief) || right.influence - left.influence || left.id.localeCompare(right.id))[0];
      const schismPressure = dissenter ? Math.max(0, 0.78 - dissenter.conviction) + (0.78 - belief.unity) : 0;
      if (dissenter && chanceForPeriod(world, 0.018 + schismPressure * 0.12, elapsedDays)) {
        const supporters = adherents
          .filter((agent) => agent.id !== dissenter.id && agent.campId === dissenter.campId && agent.conviction < 0.55)
          .sort((left, right) => left.conviction - right.conviction || left.id.localeCompare(right.id))
          .slice(0, 2);
        createBeliefSystem(world, dissenter, belief, [dissenter.id, ...supporters.map((agent) => agent.id)]);
      }
    }
  }

  for (const camp of world.camps.filter((candidate) => candidate.active && candidate.dominantBeliefId)) {
    if (camp.shrineLevel >= 4 || camp.storage.wood < 8 + camp.shrineLevel * 3 || camp.storage.ore < 2 + camp.shrineLevel) continue;
    const members = livingCampMembers(world, camp);
    const belief = getActiveBelief(world, camp.dominantBeliefId);
    if (!belief || members.length < 2) continue;
    const institutionalPressure = belief.unity * 0.12 + members.length * 0.015 + (hasTechnology(camp, "masonry") ? 0.06 : 0);
    if (chanceForPeriod(world, 0.025 + institutionalPressure, elapsedDays)) {
      camp.storage.wood -= 8 + camp.shrineLevel * 3;
      camp.storage.ore -= 2 + camp.shrineLevel;
      camp.shrineLevel += 1;
      world.stats.shrinesBuilt += 1;
      pushMajorEvent(
        world,
        "shrine_built",
        "positive",
        `${camp.name} raises a shrine to ${belief.name}`,
        `${camp.name} invests resources in a level ${camp.shrineLevel} gathering place, increasing the belief's local reach without compelling dissenters.`,
        members.filter((agent) => agent.beliefId === belief.id).map((agent) => agent.id),
        [camp.id],
        [belief.id],
      );
    }
  }
  reconcileBeliefs(world);
}

function runWorldStrategy(world: CivilizationWorldState, elapsedSeconds: number): void {
  reconcileCamps(world);
  recomputePower(world);
  applyAllianceBenefits(world, elapsedSeconds);
  for (const camp of world.camps) {
    if (!camp.active) continue;
    updateCampCohesion(world, camp, elapsedSeconds);
    if (!camp.researchTarget) camp.researchTarget = selectResearchTarget(world, camp);
    if (!camp.constructionTarget) camp.constructionTarget = selectConstructionTarget(world, camp);
    updateLeadership(world, camp);
  }
  attemptSocialChange(world, elapsedSeconds);
  runBeliefDynamics(world, elapsedSeconds);
  updateDiplomacy(world, elapsedSeconds);
  reconcileCamps(world);
  recomputePower(world);
  updatePowerLead(world);
  if (world.agents.length > 260 || world.camps.length > 50) pruneHistoricalEntities(world);
}

function reconcileCamps(world: CivilizationWorldState): void {
  for (const agent of world.agents) {
    if (!agent.alive) continue;
    if (agent.campId && !getActiveCamp(world, agent.campId)) {
      agent.campId = null;
      agent.unaffiliatedSinceDay ??= world.day;
      agent.decisionTimer = 0;
    }
  }
  for (const camp of world.camps) {
    if (!camp.active) continue;
    camp.memberIds = world.agents
      .filter((agent) => agent.alive && agent.campId === camp.id)
      .map((agent) => agent.id);
    if (camp.memberIds.length > 0) continue;
    camp.active = false;
    camp.leaderId = null;
    camp.destroyedDay = world.day;
    world.stats.campsDestroyed += 1;
    pushMajorEvent(
      world,
      "camp_destroyed",
      "critical",
      `${camp.name} is abandoned`,
      `${camp.name} has no living members and ceases to exist as an independent power.`,
      [],
      [camp.id],
    );
  }
}

function selectResearchTarget(
  world: CivilizationWorldState,
  camp: CivilizationCamp,
): TechnologyId | null {
  const available = (Object.keys(TECHNOLOGY_TREE) as TechnologyId[]).filter((technology) => {
    if (camp.technologies.includes(technology)) return false;
    return TECHNOLOGY_TREE[technology].prerequisites.every((required) => camp.technologies.includes(required));
  });
  if (available.length === 0) return null;
  const population = Math.max(1, livingCampMembers(world, camp).length);
  const foodPerMember = camp.storage.food / population;
  const waterPerMember = camp.storage.water / population;
  const averageHealth = livingCampMembers(world, camp)
    .reduce((sum, member) => sum + member.health, 0) / population;
  const warCount = enemyCamps(world, camp).length;
  const scores: Record<TechnologyId, number> = {
    basic_tools: -100,
    agriculture: 9 + Math.max(0, 12 - foodPerMember) * 1.25,
    wells: 9 + Math.max(0, 13 - waterPerMember) * 1.25,
    masonry: 8 + warCount * 11 + camp.structures.shelter * 0.6,
    bronze_working: 7 + warCount * 14 + camp.storage.ore * 0.15,
    medicine: 8 + Math.max(0, 88 - averageHealth) * 0.45 + population,
    writing: 10 + population * 0.8 + camp.technologies.length * 0.7,
    logistics: 9 + population * 1.2 + camp.territoryRadius * 0.12,
    governance: 8 + Math.max(0, 0.7 - camp.cohesion) * 34 + population * 1.1,
  };
  return available
    .map((technology) => ({ technology, score: scores[technology] + worldRandom(world) * 0.5 }))
    .sort((left, right) => right.score - left.score || left.technology.localeCompare(right.technology))[0]
    ?.technology ?? null;
}

function selectConstructionTarget(
  world: CivilizationWorldState,
  camp: CivilizationCamp,
): StructureKind | null {
  const population = Math.max(1, livingCampMembers(world, camp).length);
  const warCount = enemyCamps(world, camp).length;
  const candidates: Array<{ kind: StructureKind; score: number; allowed: boolean }> = [
    { kind: "shelter", score: 8 + Math.max(0, population - camp.structures.shelter * 2.2) * 5, allowed: true },
    { kind: "farm", score: 8 + Math.max(0, population * 9 - camp.storage.food) * 0.5, allowed: hasTechnology(camp, "agriculture") },
    { kind: "well", score: 8 + Math.max(0, population * 10 - camp.storage.water) * 0.5, allowed: hasTechnology(camp, "wells") },
    { kind: "walls", score: 5 + warCount * 18 + camp.losses * 2, allowed: hasTechnology(camp, "masonry") },
    { kind: "workshop", score: 7 + camp.technologies.length * 1.5, allowed: hasTechnology(camp, "masonry") },
    { kind: "infirmary", score: 6 + livingCampMembers(world, camp).filter((agent) => agent.health < 75).length * 5, allowed: hasTechnology(camp, "medicine") },
    { kind: "archive", score: 7 + (camp.researchTarget ? 6 : 0), allowed: hasTechnology(camp, "writing") },
    { kind: "roads", score: 7 + population * 1.2, allowed: hasTechnology(camp, "logistics") },
    { kind: "council", score: 6 + Math.max(0, 0.72 - camp.cohesion) * 35 + population, allowed: hasTechnology(camp, "governance") },
  ];
  const chosen = candidates
    .filter((candidate) => candidate.allowed && camp.structures[candidate.kind] < 6)
    .map((candidate) => ({ ...candidate, score: candidate.score + worldRandom(world) * 0.5 }))
    .sort((left, right) => right.score - left.score || left.kind.localeCompare(right.kind))[0];
  return chosen?.kind ?? null;
}

function structureLabel(kind: StructureKind): string {
  return kind === "infirmary"
    ? "infirmary"
    : kind === "council"
      ? "council hall"
      : kind;
}

function updateCampCohesion(
  world: CivilizationWorldState,
  camp: CivilizationCamp,
  elapsedSeconds: number,
): void {
  const members = livingCampMembers(world, camp);
  if (members.length === 0) return;
  const population = members.length;
  const foodSecurity = clamp(camp.storage.food / Math.max(8, population * 9), 0, 1);
  const waterSecurity = clamp(camp.storage.water / Math.max(8, population * 10), 0, 1);
  const warPenalty = Math.min(0.24, enemyCamps(world, camp).length * 0.09);
  const comfortableCapacity = 2 + camp.structures.shelter * 3 + camp.structures.farm * 2 + camp.structures.well * 2;
  const crowdPenalty = Math.min(0.2, Math.max(0, population - comfortableCapacity) * 0.025);
  const governance = hasTechnology(camp, "governance")
    ? 0.08 + camp.structures.council * 0.025
    : 0;
  const sharedDuty = campBeliefHasTenet(world, camp, "ordered_duty")
    ? Math.min(0.055, 0.02 + camp.shrineLevel * 0.009)
    : 0;
  const conscienceTolerance = campBeliefHasTenet(world, camp, "free_conscience")
    ? camp.beliefDiversity * 0.045
    : 0;
  const leader = members.find((member) => member.id === camp.leaderId) ?? null;
  const response = 1 - Math.exp(-elapsedSeconds / (DAY_LENGTH * 0.75));
  for (const member of members) {
    const leaderRelationship = leader && leader.id !== member.id
      ? member.relationships[leader.id]
      : null;
    const relationshipValue = leaderRelationship
      ? leaderRelationship.trust * 0.11 + leaderRelationship.respect * 0.08 - leaderRelationship.grievance * 0.13
      : 0.08;
    const targetSatisfaction = clamp(
      0.22 + foodSecurity * 0.21 + waterSecurity * 0.23 + member.health / 500 + governance + sharedDuty + conscienceTolerance + relationshipValue - warPenalty - crowdPenalty,
      0.05,
      0.96,
    );
    if (leaderRelationship) {
      const elapsedDays = elapsedSeconds / DAY_LENGTH;
      const institutionalStress =
        (1 - foodSecurity) * 0.24 +
        (1 - waterSecurity) * 0.28 +
        warPenalty * 0.7 +
        crowdPenalty * 0.9;
      const grievanceDelta = elapsedDays * (institutionalStress * 0.16 - governance * 0.055 - 0.006);
      leaderRelationship.grievance = clamp(leaderRelationship.grievance + grievanceDelta, 0, 1);
      leaderRelationship.trust = clamp(
        leaderRelationship.trust - Math.max(0, grievanceDelta) * 0.35 + Math.max(0, -grievanceDelta) * 0.12,
        0,
        1,
      );
      leaderRelationship.lastInteractionDay = world.day;
    }
    member.satisfaction += (targetSatisfaction - member.satisfaction) * response;
    const familyInCamp = member.parentIds.concat(member.childrenIds)
      .filter((id) => members.some((candidate) => candidate.id === id)).length;
    const tenure = clamp((world.day - member.joinedCampDay) / 6, 0, 0.12);
    const targetLoyalty = clamp(
      member.satisfaction * 0.62 + relationshipValue + familyInCamp * 0.035 + tenure + governance + sharedDuty + conscienceTolerance,
      0.03,
      0.98,
    );
    member.loyalty += (targetLoyalty - member.loyalty) * response;
  }
  const averageLoyalty = members.reduce((sum, member) => sum + member.loyalty, 0) / population;
  const averageSatisfaction = members.reduce((sum, member) => sum + member.satisfaction, 0) / population;
  camp.cohesion = clamp(
    averageLoyalty * 0.58 + averageSatisfaction * 0.32 + governance + sharedDuty + conscienceTolerance - Math.max(0, population - 8) * 0.008,
    0.05,
    1,
  );
}

function leadershipScore(
  candidate: CivilizationAgent,
  members: CivilizationAgent[],
): number {
  const support = members.reduce((sum, member) => {
    if (member.id === candidate.id) return sum + 0.4;
    const relationship = member.relationships[candidate.id];
    return sum + (relationship ? relationship.trust * 0.5 + relationship.respect * 0.7 - relationship.grievance * 0.55 : 0);
  }, 0);
  return candidate.personalPower + support + candidate.influence * 0.35;
}

function updateLeadership(world: CivilizationWorldState, camp: CivilizationCamp): void {
  const members = livingCampMembers(world, camp);
  if (members.length === 0) return;
  const current = members.find((member) => member.id === camp.leaderId) ?? null;
  const ranked = [...members].sort((left, right) => {
    const delta = leadershipScore(right, members) - leadershipScore(left, members);
    return delta || left.id.localeCompare(right.id);
  });
  const challenger = ranked[0];
  if (!challenger) return;
  if (!current) {
    camp.leaderId = challenger.id;
    pushMajorEvent(
      world,
      "leadership_change",
      "neutral",
      `${challenger.name} leads ${camp.name}`,
      `${challenger.name} has the strongest achieved influence and support among the remaining members.`,
      [challenger.id],
      [camp.id],
    );
    return;
  }
  if (challenger.id === current.id) return;
  const currentScore = leadershipScore(current, members) * 1.08;
  const challengerScore = leadershipScore(challenger, members);
  const recentChange = lastCampEventDay(world, camp.id, ["leadership_change", "coup"]);
  if (challengerScore < currentScore * 1.12 || world.day - recentChange < 0.7) return;
  camp.leaderId = challenger.id;
  pushMajorEvent(
    world,
    "leadership_change",
    "neutral",
    `${challenger.name} rises in ${camp.name}`,
    `${challenger.name}'s demonstrated power and member support overtake ${current.name}'s claim to leadership.`,
    [current.id, challenger.id],
    [camp.id],
  );
}

function lastCampEventDay(
  world: CivilizationWorldState,
  campId: string,
  types: MajorEventType[],
): number {
  for (let index = world.majorEvents.length - 1; index >= 0; index -= 1) {
    const event = world.majorEvents[index];
    if (event.campIds.includes(campId) && types.includes(event.type)) return event.day;
  }
  return -100;
}

function attemptSocialChange(world: CivilizationWorldState, elapsedSeconds: number): void {
  const elapsedDays = elapsedSeconds / DAY_LENGTH;
  const unaffiliated = world.agents
    .filter((agent) => agent.alive && !agent.campId && agent.unaffiliatedSinceDay !== null)
    .sort((left, right) => left.id.localeCompare(right.id));
  for (const agent of unaffiliated) {
    const aloneFor = world.day - (agent.unaffiliatedSinceDay ?? world.day);
    if (aloneFor < 0.55 || activeCampCount(world) >= MAX_ACTIVE_CAMPS) continue;
    if (totalInventory(agent.inventory) < 3.2 && world.camps.some((camp) => camp.active)) continue;
    if (chanceForPeriod(world, 0.8, elapsedDays)) {
      foundIndependentCamp(world, agent);
      return;
    }
  }

  if (world.day >= 8 && activeCampCount(world) < MAX_ACTIVE_CAMPS) {
    const expansionCandidates = world.camps
      .filter((camp) => camp.active)
      .map((camp) => {
        const members = livingCampMembers(world, camp);
        const surplus = Math.min(
          camp.storage.food / Math.max(1, members.length * 10),
          camp.storage.water / Math.max(1, members.length * 11),
        );
        const crowded = members.length - (3 + camp.structures.shelter * 2);
        return { camp, members, surplus, pressure: Math.max(0, crowded) * 0.1 + surplus * 0.16 + (hasTechnology(camp, "logistics") ? 0.12 : 0) };
      })
      .filter(({ camp, members, surplus }) =>
        members.length >= 6 &&
        surplus >= 0.62 &&
        world.day - lastCampEventDay(world, camp.id, ["camp_founded", "breakaway"]) > 1.4)
      .sort((left, right) => right.pressure - left.pressure || left.camp.id.localeCompare(right.camp.id));
    for (const candidate of expansionCandidates) {
      const founder = candidate.members
        .filter((member) => member.id !== candidate.camp.leaderId && member.age >= 16 && member.satisfaction >= 0.5)
        .sort((left, right) => right.influence - left.influence || right.knowledge - left.knowledge || left.id.localeCompare(right.id))[0];
      if (!founder) continue;
      if (chanceForPeriod(world, 0.055 + candidate.pressure * 0.22, elapsedDays)) {
        foundExpansionCamp(world, founder, candidate.camp);
        return;
      }
    }
  }

  const candidates = world.agents
    .filter((agent) => agent.alive && Boolean(agent.campId))
    .sort((left, right) => {
      const dissatisfaction = (1 - right.satisfaction) + (1 - right.loyalty);
      const leftDissatisfaction = (1 - left.satisfaction) + (1 - left.loyalty);
      return dissatisfaction - leftDissatisfaction || left.id.localeCompare(right.id);
    });

  for (const agent of candidates) {
    const camp = getActiveCamp(world, agent.campId);
    if (!camp) continue;
    const members = livingCampMembers(world, camp);
    if (members.length < 2 || world.day - agent.joinedCampDay < 0.75) continue;
    const leader = members.find((member) => member.id === camp.leaderId) ?? null;
    const alternatives = world.camps.filter((candidate) => {
      if (!candidate.active || candidate.id === camp.id) return false;
      const relation = activeRelation(world, camp.id, candidate.id);
      return relation?.status !== "war";
    });
    let bestTarget: CivilizationCamp | null = null;
    let bestAdvantage = -Infinity;
    const currentShare = camp.power / Math.max(4, members.length + 1);
    for (const alternative of alternatives) {
      const targetPopulation = livingCampMembers(world, alternative).length;
      const safety = alternative.militaryPower / Math.max(3, targetPopulation + 1);
      const supply = (alternative.storage.food + alternative.storage.water) / Math.max(8, targetPopulation * 2 + 2);
      const opportunity = alternative.power / Math.max(5, targetPopulation + 2);
      const distanceCost = distanceBetween(agent.position, alternative.position) * 0.035;
      const advantage = safety * 0.12 + supply * 0.28 + opportunity * 0.24 - currentShare * 0.3 - distanceCost;
      if (advantage > bestAdvantage) {
        bestAdvantage = advantage;
        bestTarget = alternative;
      }
    }

    const lastStrife = lastCampEventDay(world, camp.id, ["breakaway", "coup", "defection"]);
    const relativePower = agent.personalPower / Math.max(1, leader?.personalPower ?? 1);
    const leaderRelationship = leader ? agent.relationships[leader.id] : null;
    const leadershipRatio = leader
      ? leadershipScore(agent, members) / Math.max(1, leadershipScore(leader, members))
      : 0;
    const politicalPressure =
      Math.max(0, leadershipRatio - 0.72) +
      Math.max(0, 0.82 - agent.satisfaction) * 0.7 +
      (leaderRelationship?.grievance ?? 0) * 0.5;
    const canCoup =
      members.length >= 3 &&
      leader &&
      leader.id !== agent.id &&
      agent.age >= 16 &&
      world.day >= 7 &&
      world.day - lastStrife > 1.15 &&
      politicalPressure > 0.06;
    if (canCoup) {
      if (chanceForPeriod(world, 0.006 + politicalPressure * 0.03, elapsedDays)) {
        attemptCoup(world, camp, agent, leader);
        return;
      }
    }

    const independencePressure =
      Math.max(0, relativePower - 0.62) * 0.62 +
      Math.max(0, members.length - 5) * 0.035 +
      Math.max(0, 0.78 - agent.satisfaction) * 0.45 +
      Math.max(0, 0.72 - agent.loyalty) * 0.35;
    const canBreakAway =
      members.length >= 6 &&
      activeCampCount(world) < MAX_ACTIVE_CAMPS &&
      agent.id !== camp.leaderId &&
      agent.age >= 16 &&
      world.day >= 9 &&
      world.day - lastStrife > 1.2 &&
      independencePressure > 0.08;
    if (canBreakAway) {
      if (chanceForPeriod(world, 0.008 + independencePressure * 0.025, elapsedDays)) {
        foundBreakawayCamp(world, agent, camp);
        return;
      }
    }

    const defectionPressure = (0.66 - agent.satisfaction) * 1.8 + (0.62 - agent.loyalty) * 1.6 + bestAdvantage * 0.08;
    if (
      bestTarget &&
      defectionPressure > 0.18 &&
      chanceForPeriod(world, 0.32 + defectionPressure * 0.28, elapsedDays)
    ) {
      const previousName = camp.name;
      transferAgentToCamp(world, agent, bestTarget, "defection");
      agent.action = "defect";
      agent.currentPlan = "change_allegiance";
      agent.goal = `Build power inside ${bestTarget.name}`;
      agent.rationale = `${bestTarget.name} now offers a stronger combination of safety, resources, and personal opportunity than ${previousName}.`;
      agent.decisionTimer = 3;
      return;
    }
  }
}

function transferAgentToCamp(
  world: CivilizationWorldState,
  agent: CivilizationAgent,
  destination: CivilizationCamp,
  reason: "defection" | "join",
): void {
  const previous = getActiveCamp(world, agent.campId);
  if (previous?.id === destination.id) return;
  if (previous) previous.memberIds = previous.memberIds.filter((id) => id !== agent.id);
  agent.campId = destination.id;
  agent.color = destination.color;
  agent.joinedCampDay = world.day;
  agent.unaffiliatedSinceDay = null;
  agent.loyalty = reason === "defection" ? 0.48 : 0.55;
  agent.satisfaction = clamp(agent.satisfaction + 0.12, 0, 1);
  if (!destination.memberIds.includes(agent.id)) destination.memberIds.push(agent.id);
  for (const member of livingCampMembers(world, destination)) {
    if (member.id === agent.id) continue;
    agent.relationships[member.id] ??= {
      trust: 0.42,
      respect: 0.35,
      grievance: 0,
      lastInteractionDay: world.day,
    };
  }
  if (reason === "defection" && previous) {
    const recruiter = world.agents.find((candidate) => candidate.id === destination.leaderId && candidate.alive);
    if (recruiter && recruiter.id !== agent.id) {
      recruiter.action = "recruit";
      recruiter.currentPlan = "expand_influence";
      recruiter.goal = `Integrate ${agent.name} into ${destination.name}`;
      recruiter.rationale = "A capable recruit adds labor, knowledge, lineage, and military strength to the camp.";
      recruiter.target = target("agent", agent.id, agent.name, agent.position);
      recruiter.decisionTimer = 3;
    }
    world.stats.defections += 1;
    pushMajorEvent(
      world,
      "defection",
      "warning",
      `${agent.name} defects to ${destination.name}`,
      `${agent.name} leaves ${previous.name} after judging ${destination.name} the stronger or safer route to personal power.`,
      [agent.id],
      [previous.id, destination.id],
    );
  } else if (reason === "join" && !previous) {
    pushMajorEvent(
      world,
      "join",
      "positive",
      `${agent.name} joins ${destination.name}`,
      `${agent.name} ends an independent period after judging ${destination.name} the best available path to safety and power.`,
      [agent.id],
      [destination.id],
    );
  }
}

function activeCampCount(world: CivilizationWorldState): number {
  return world.camps.filter((camp) => camp.active).length;
}

function foundIndependentCamp(world: CivilizationWorldState, founder: CivilizationAgent): void {
  const newCamp = createNewCampFromAgent(world, founder, null);
  pushMajorEvent(
    world,
    "camp_founded",
    "positive",
    `${founder.name} founds ${newCamp.name}`,
    `${founder.name} converts an independent existence into a new sovereign claim.`,
    [founder.id],
    [newCamp.id],
  );
}

function foundExpansionCamp(
  world: CivilizationWorldState,
  founder: CivilizationAgent,
  parent: CivilizationCamp,
): void {
  const newCamp = createNewCampFromAgent(world, founder, parent);
  const remaining = livingCampMembers(world, parent)
    .filter((member) => member.id !== parent.leaderId && member.id !== founder.id && member.age >= 12)
    .sort((left, right) => {
      const leftBond = left.relationships[founder.id];
      const rightBond = right.relationships[founder.id];
      const leftSupport = left.parentIds.includes(founder.id) || founder.parentIds.includes(left.id)
        ? 1
        : leftBond ? leftBond.trust + leftBond.respect - leftBond.grievance : 0;
      const rightSupport = right.parentIds.includes(founder.id) || founder.parentIds.includes(right.id)
        ? 1
        : rightBond ? rightBond.trust + rightBond.respect - rightBond.grievance : 0;
      return rightSupport - leftSupport || left.id.localeCompare(right.id);
    });
  const follower = remaining[0];
  if (follower) transferAgentToCamp(world, follower, newCamp, "join");
  founder.action = "recruit";
  founder.currentPlan = "expand_influence";
  founder.goal = `Establish ${newCamp.name} as a durable frontier camp`;
  founder.rationale = "A prosperous parent camp can extend access to land and resources by founding another autonomous settlement.";
  founder.decisionTimer = 3;
  pushMajorEvent(
    world,
    "camp_founded",
    "positive",
    `${parent.name} seeds ${newCamp.name}`,
    `${founder.name}${follower ? ` and ${follower.name}` : ""} establish a new frontier camp after judging expansion more valuable than crowding the original settlement.`,
    [founder.id, ...(follower ? [follower.id] : [])],
    [parent.id, newCamp.id],
  );
}

function foundBreakawayCamp(
  world: CivilizationWorldState,
  founder: CivilizationAgent,
  parent: CivilizationCamp,
): void {
  const newCamp = createNewCampFromAgent(world, founder, parent);
  const formerMembers = livingCampMembers(world, parent)
    .filter((member) => member.id !== founder.id && member.id !== parent.leaderId)
    .sort((left, right) => {
      const leftRelation = left.relationships[founder.id];
      const rightRelation = right.relationships[founder.id];
      const leftSupport = leftRelation ? leftRelation.trust + leftRelation.respect - leftRelation.grievance : 0;
      const rightSupport = rightRelation ? rightRelation.trust + rightRelation.respect - rightRelation.grievance : 0;
      return rightSupport - leftSupport || left.id.localeCompare(right.id);
    });
  const followers: CivilizationAgent[] = [];
  for (const member of formerMembers.slice(0, 2)) {
    const relationship = member.relationships[founder.id];
    const support = relationship ? relationship.trust + relationship.respect - relationship.grievance : 0;
    if (support > 0.65 && member.loyalty < 0.58) {
      transferAgentToCamp(world, member, newCamp, "join");
      followers.push(member);
    }
  }
  world.stats.breakaways += 1;
  pushMajorEvent(
    world,
    "breakaway",
    "warning",
    `${newCamp.name} breaks from ${parent.name}`,
    `${founder.name}${followers.length > 0 ? ` and ${followers.length} supporter${followers.length === 1 ? "" : "s"}` : ""} reject old leadership and establish an independent camp.`,
    [founder.id, ...followers.map((member) => member.id)],
    [parent.id, newCamp.id],
  );
  founder.action = "breakaway";
  founder.currentPlan = "found_camp";
  founder.goal = `Make ${newCamp.name} powerful`;
  founder.rationale = "Independence offers more control over resources, research, and leadership than remaining dissatisfied.";
  founder.decisionTimer = 3;
}

function createNewCampFromAgent(
  world: CivilizationWorldState,
  founder: CivilizationAgent,
  parent: CivilizationCamp | null,
): CivilizationCamp {
  const ordinal = world.nextCampId;
  const id = `camp-${String(ordinal).padStart(3, "0")}`;
  world.nextCampId += 1;
  if (parent) parent.memberIds = parent.memberIds.filter((memberId) => memberId !== founder.id);
  const angle = worldRandom(world) * TAU;
  const origin = parent?.position ?? founder.position;
  const expansionDistance = parent
    ? 13 + worldRandom(world) * 9 + Math.min(8, activeCampCount(world) * 0.12)
    : 7 + worldRandom(world) * 7;
  const location = boundedPosition({
    x: origin.x + Math.cos(angle) * expansionDistance,
    z: origin.z + Math.sin(angle) * expansionDistance,
  }, 5);
  const camp = createCamp(id, ordinal, founder, location, world.day, parent?.id ?? null);
  camp.color = CAMP_COLORS[(ordinal - 1) % CAMP_COLORS.length];
  camp.storage = {
    food: Math.max(3, founder.inventory.food),
    water: Math.max(3, founder.inventory.water),
    wood: Math.max(3, founder.inventory.wood),
    ore: founder.inventory.ore,
  };
  if (parent) {
    for (const kind of ["food", "water", "wood", "ore"] as const) {
      const share = Math.min(parent.storage[kind] * 0.14, kind === "food" || kind === "water" ? 6 : 4);
      parent.storage[kind] -= share;
      camp.storage[kind] += share;
    }
    camp.technologies = parent.technologies.slice(0, Math.max(1, parent.technologies.length - 1));
  }
  founder.inventory = { food: 0.8, water: 0.8, wood: 0, ore: 0 };
  founder.campId = camp.id;
  founder.position = copyVec(location);
  founder.color = camp.color;
  founder.joinedCampDay = world.day;
  founder.unaffiliatedSinceDay = null;
  founder.loyalty = 0.78;
  founder.satisfaction = clamp(founder.satisfaction + 0.18, 0, 1);
  world.camps.push(camp);
  world.stats.campsFounded += 1;
  for (const other of world.camps) {
    if (other.active && other.id !== camp.id) getOrCreateRelation(world, camp.id, other.id);
  }
  return camp;
}

function attemptCoup(
  world: CivilizationWorldState,
  camp: CivilizationCamp,
  challenger: CivilizationAgent,
  leader: CivilizationAgent,
): void {
  const members = livingCampMembers(world, camp);
  const challengerScore = leadershipScore(challenger, members);
  const leaderScore = leadershipScore(leader, members);
  const successChance = clamp(0.28 + (challengerScore - leaderScore) / Math.max(20, leaderScore * 2), 0.18, 0.72);
  const success = worldRandom(world) < successChance;
  world.stats.coups += 1;
  challenger.action = "coup";
  challenger.currentPlan = "seize_leadership";
  challenger.decisionTimer = 3;
  if (success) {
    camp.leaderId = challenger.id;
    challenger.influence += 2;
    leader.influence = Math.max(0, leader.influence - 1);
    challenger.goal = `Lead ${camp.name}`;
    challenger.rationale = "Control of camp policy now offers the strongest path to personal and collective power.";
  } else {
    challenger.health = Math.max(18, challenger.health - 8 - worldRandom(world) * 9);
    challenger.loyalty = Math.max(0.05, challenger.loyalty - 0.12);
    challenger.goal = `Recover from the failed challenge in ${camp.name}`;
    challenger.rationale = "The attempt to replace leadership failed; survival requires a new calculation.";
  }
  pushMajorEvent(
    world,
    "coup",
    success ? "warning" : "critical",
    success ? `${challenger.name} seizes ${camp.name}` : `${camp.name} defeats a coup`,
    success
      ? `${challenger.name} displaces ${leader.name} after judging direct control the best route to power.`
      : `${challenger.name} challenges ${leader.name}, but the existing support balance holds.`,
    [challenger.id, leader.id],
    [camp.id],
  );
}

function applyAllianceBenefits(world: CivilizationWorldState, elapsedSeconds: number): void {
  for (const relation of world.relations) {
    if (relation.status !== "alliance") continue;
    const campA = getActiveCamp(world, relation.campAId);
    const campB = getActiveCamp(world, relation.campBId);
    if (!campA || !campB) continue;
    const populationA = Math.max(1, livingCampMembers(world, campA).length);
    const populationB = Math.max(1, livingCampMembers(world, campB).length);
    let aidMoved = 0;
    for (const kind of ["food", "water"] as const) {
      const perMemberA = campA.storage[kind] / populationA;
      const perMemberB = campB.storage[kind] / populationB;
      if (Math.abs(perMemberA - perMemberB) < 3) continue;
      const donor = perMemberA > perMemberB ? campA : campB;
      const receiver = donor.id === campA.id ? campB : campA;
      const donorPopulation = donor.id === campA.id ? populationA : populationB;
      const receiverPopulation = receiver.id === campA.id ? populationA : populationB;
      const donorPerMember = donor.storage[kind] / donorPopulation;
      const receiverPerMember = receiver.storage[kind] / receiverPopulation;
      const protectedReserve = donorPopulation * 8;
      const surplus = Math.max(0, donor.storage[kind] - protectedReserve);
      const equalizingAmount = Math.max(0, donorPerMember - receiverPerMember) * receiverPopulation * 0.06;
      const reciprocalAid = campBeliefHasTenet(world, donor, "reciprocal_aid") ? 1.1 : 1;
      const transfer = Math.min(surplus, equalizingAmount, elapsedSeconds * 0.028 * reciprocalAid);
      if (transfer <= EPSILON) continue;
      donor.storage[kind] -= transfer;
      receiver.storage[kind] = clamp(receiver.storage[kind] + transfer, 0, CAMP_STORAGE_LIMIT);
      aidMoved += transfer;
    }
    if (aidMoved > 0) {
      relation.trust = clamp(relation.trust + Math.min(0.012, aidMoved * 0.0008), 0, 1);
      relation.tension = clamp(relation.tension - Math.min(0.008, aidMoved * 0.0005), 0, 1);
    }
  }
}

function updateDiplomacy(world: CivilizationWorldState, elapsedSeconds: number): void {
  const elapsedDays = elapsedSeconds / DAY_LENGTH;
  const activeIds = new Set(world.camps.filter((camp) => camp.active).map((camp) => camp.id));
  for (const relation of world.relations) {
    if (!activeIds.has(relation.campAId) || !activeIds.has(relation.campBId)) continue;
    const campA = getActiveCamp(world, relation.campAId);
    const campB = getActiveCamp(world, relation.campBId);
    if (!campA || !campB) continue;
    const overlap = Math.max(
      0,
      campA.territoryRadius + campB.territoryRadius - distanceBetween(campA.position, campB.position),
    );
    const scarcityA = campScarcity(world, campA);
    const scarcityB = campScarcity(world, campB);
    if (relation.status === "war") {
      relation.tension = clamp(relation.tension + elapsedDays * 0.04, 0, 1);
      relation.trust = clamp(relation.trust - elapsedDays * 0.08, 0, 1);
    } else if (relation.status === "alliance") {
      relation.trust = clamp(relation.trust + elapsedDays * 0.045, 0, 1);
      relation.tension = clamp(relation.tension - elapsedDays * 0.055, 0, 1);
    } else {
      relation.tension = clamp(
        relation.tension + elapsedDays * (overlap * 0.012 + (scarcityA + scarcityB) * 0.018 - 0.025),
        0,
        1,
      );
      relation.trust = clamp(relation.trust + elapsedDays * (0.015 - overlap * 0.004), 0, 1);
    }
    if (relation.status === "truce" && relation.truceUntilDay !== null && world.day >= relation.truceUntilDay) {
      relation.status = "neutral";
      relation.sinceDay = world.day;
      relation.truceUntilDay = null;
    }
  }

  // At most one treaty or declaration is made per strategic update. This rate
  // limit lets motives develop visibly and prevents a 45-pair opening cascade.
  const wars = world.relations
    .filter((relation) => relation.status === "war" && activeIds.has(relation.campAId) && activeIds.has(relation.campBId))
    .sort((left, right) => left.id.localeCompare(right.id));
  for (const relation of wars) {
    const campA = getActiveCamp(world, relation.campAId);
    const campB = getActiveCamp(world, relation.campBId);
    if (!campA || !campB || world.day - relation.sinceDay < 0.85) continue;
    const scoreGap = Math.abs(relation.warScoreA - relation.warScoreB);
    const exhaustion = campScarcity(world, campA) + campScarcity(world, campB);
    const imbalance = Math.abs(campA.militaryPower - campB.militaryPower) / Math.max(10, campA.militaryPower + campB.militaryPower);
    const peaceRate = 0.22 + exhaustion * 0.35 + scoreGap * 0.025 + imbalance * 0.28;
    if (chanceForPeriod(world, peaceRate, elapsedDays)) {
      makePeace(world, relation, campA, campB);
      return;
    }
  }

  const neutralRelations = world.relations
    .filter((relation) => relation.status === "neutral" && activeIds.has(relation.campAId) && activeIds.has(relation.campBId))
    .sort((left, right) => left.id.localeCompare(right.id));

  if (world.time >= DAY_LENGTH * 0.45) {
    const allianceCandidates = neutralRelations
      .map((relation) => {
        const campA = getActiveCamp(world, relation.campAId);
        const campB = getActiveCamp(world, relation.campBId);
        if (!campA || !campB) return null;
        if (allianceCount(world, campA.id) >= 2 || allianceCount(world, campB.id) >= 2) return null;
        const proximity = clamp(1 - distanceBetween(campA.position, campB.position) / 95, 0, 1);
        const vulnerability = clamp(1 - (campA.militaryPower + campB.militaryPower) / 90, 0, 1);
        const sharedEnemy = enemyCamps(world, campA).some((enemy) => enemyCamps(world, campB).some((other) => other.id === enemy.id)) ? 0.3 : 0;
        const utility = relation.trust * 0.72 + proximity * 0.22 + vulnerability * 0.2 + sharedEnemy - relation.tension * 0.44;
        return { relation, campA, campB, utility };
      })
      .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
      .sort((left, right) => right.utility - left.utility || left.relation.id.localeCompare(right.relation.id));
    const candidate = allianceCandidates[0];
    if (candidate && candidate.utility > 0.43 && chanceForPeriod(world, 0.34 + candidate.utility * 0.22, elapsedDays)) {
      formAlliance(world, candidate.relation, candidate.campA, candidate.campB);
      return;
    }
  }

  if (world.time < DAY_LENGTH * 2.35) return;
  const warCandidates = neutralRelations
    .map((relation) => {
      const campA = getActiveCamp(world, relation.campAId);
      const campB = getActiveCamp(world, relation.campBId);
      if (!campA || !campB) return null;
      const aggressor = campA.militaryPower >= campB.militaryPower ? campA : campB;
      const targetCamp = aggressor.id === campA.id ? campB : campA;
      if (enemyCamps(world, aggressor).length >= 1 || enemyCamps(world, targetCamp).length >= 2) return null;
      const advantage = clamp((aggressor.militaryPower - targetCamp.militaryPower) / Math.max(8, targetCamp.militaryPower), -1, 2);
      const spoils = (targetCamp.storage.food + targetCamp.storage.water + targetCamp.storage.ore * 2) / Math.max(18, livingCampMembers(world, targetCamp).length * 15);
      const proximity = clamp(1 - distanceBetween(aggressor.position, targetCamp.position) / 90, 0, 1);
      const scarcity = campScarcity(world, aggressor);
      const utility = advantage * 0.32 + spoils * 0.2 + proximity * 0.22 + scarcity * 0.32 + relation.tension * 0.52 - relation.trust * 0.25;
      return { relation, aggressor, targetCamp, utility };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
    .sort((left, right) => right.utility - left.utility || left.relation.id.localeCompare(right.relation.id));
  const warCandidate = warCandidates[0];
  if (warCandidate && warCandidate.utility > 0.35 && chanceForPeriod(world, 0.2 + warCandidate.utility * 0.25, elapsedDays)) {
    declareWar(world, warCandidate.relation, warCandidate.aggressor, warCandidate.targetCamp, warCandidate.utility);
  }
}

function campScarcity(world: CivilizationWorldState, camp: CivilizationCamp): number {
  const population = Math.max(1, livingCampMembers(world, camp).length);
  const food = clamp(camp.storage.food / (population * 8), 0, 1);
  const water = clamp(camp.storage.water / (population * 9), 0, 1);
  return clamp(1 - (food + water) / 2, 0, 1);
}

function allianceCount(world: CivilizationWorldState, campId: string): number {
  return world.relations.filter(
    (relation) => relation.status === "alliance" && (relation.campAId === campId || relation.campBId === campId),
  ).length;
}

function formAlliance(
  world: CivilizationWorldState,
  relation: DiplomaticRelation,
  campA: CivilizationCamp,
  campB: CivilizationCamp,
): void {
  relation.status = "alliance";
  relation.sinceDay = world.day;
  relation.trust = clamp(relation.trust + 0.12, 0, 1);
  relation.tension = clamp(relation.tension - 0.1, 0, 1);
  for (const leaderId of [campA.leaderId, campB.leaderId]) {
    const leader = leaderId ? world.agents.find((agent) => agent.id === leaderId && agent.alive) : null;
    if (!leader) continue;
    leader.action = "negotiate";
    leader.currentPlan = "expand_influence";
    leader.goal = `Consolidate the alliance between ${campA.name} and ${campB.name}`;
    leader.rationale = "Cooperation currently yields more security and influence than confrontation.";
    leader.target = target("camp", leader.campId === campA.id ? campB.id : campA.id, leader.campId === campA.id ? campB.name : campA.name, leader.campId === campA.id ? campB.position : campA.position);
    leader.decisionTimer = 3;
  }
  pushMajorEvent(
    world,
    "alliance",
    "positive",
    `${campA.name} and ${campB.name} form an alliance`,
    "Both camps calculate that shared security and knowledge offer more power than immediate rivalry.",
    [campA.leaderId, campB.leaderId].filter((id): id is string => id !== null),
    [campA.id, campB.id],
  );
}

function declareWar(
  world: CivilizationWorldState,
  relation: DiplomaticRelation,
  aggressor: CivilizationCamp,
  targetCamp: CivilizationCamp,
  utility: number,
): void {
  relation.status = "war";
  relation.sinceDay = world.day;
  relation.tension = clamp(relation.tension + 0.28, 0, 1);
  relation.trust = clamp(relation.trust - 0.25, 0, 1);
  relation.truceUntilDay = null;
  relation.warScoreA = 0;
  relation.warScoreB = 0;
  world.stats.wars += 1;
  pushMajorEvent(
    world,
    "war",
    "critical",
    `${aggressor.name} declares war on ${targetCamp.name}`,
    `${aggressor.name} judges the rival's supplies, proximity, and military balance worth the risk (strategic utility ${round(utility)}).`,
    [aggressor.leaderId, targetCamp.leaderId].filter((id): id is string => id !== null),
    [aggressor.id, targetCamp.id],
  );
  for (const member of livingCampMembers(world, aggressor)) member.decisionTimer = 0;
  for (const member of livingCampMembers(world, targetCamp)) member.decisionTimer = 0;
}

function makePeace(
  world: CivilizationWorldState,
  relation: DiplomaticRelation,
  campA: CivilizationCamp,
  campB: CivilizationCamp,
): void {
  relation.status = "truce";
  relation.sinceDay = world.day;
  relation.truceUntilDay = world.day + 1.8 + worldRandom(world) * 1.4;
  relation.tension = clamp(relation.tension - 0.3, 0, 1);
  relation.trust = clamp(relation.trust + 0.06, 0, 1);
  world.stats.peaceTreaties += 1;
  for (const leaderId of [campA.leaderId, campB.leaderId]) {
    const leader = leaderId ? world.agents.find((agent) => agent.id === leaderId && agent.alive) : null;
    if (!leader) continue;
    leader.action = "negotiate";
    leader.currentPlan = "make_peace";
    leader.goal = `Preserve the truce between ${campA.name} and ${campB.name}`;
    leader.rationale = "Current losses and scarcity make recovery more valuable than another attack.";
    leader.target = target("camp", leader.campId === campA.id ? campB.id : campA.id, leader.campId === campA.id ? campB.name : campA.name, leader.campId === campA.id ? campB.position : campA.position);
    leader.decisionTimer = 3;
  }
  pushMajorEvent(
    world,
    "peace",
    "positive",
    `${campA.name} and ${campB.name} agree to peace`,
    `War exhaustion and the balance of losses produce a truce through day ${Math.ceil(relation.truceUntilDay)}.`,
    [campA.leaderId, campB.leaderId].filter((id): id is string => id !== null),
    [campA.id, campB.id],
  );
  for (const member of [...livingCampMembers(world, campA), ...livingCampMembers(world, campB)]) {
    if (member.action === "raid" || member.action === "defend") member.decisionTimer = 0;
  }
}

function recomputePower(world: CivilizationWorldState): void {
  for (const agent of world.agents) {
    if (!agent.alive) {
      agent.personalPower = 0;
      continue;
    }
    const livingChildren = agent.childrenIds.filter((id) => world.agents.some((candidate) => candidate.id === id && candidate.alive)).length;
    const earnedRespect = Object.values(agent.relationships).reduce(
      (sum, relationship) => sum + relationship.respect * 0.8 + relationship.trust * 0.25 - relationship.grievance * 0.3,
      0,
    );
    agent.influence = Math.max(
      0,
      Math.sqrt(Math.max(0, agent.harvested)) * 0.42 +
        agent.buildContribution * 0.8 +
        agent.researchContribution * 0.055 +
        agent.kills * 3.8 +
        livingChildren * 1.5 +
        earnedRespect,
    );
    const practicedBelief = getActiveBelief(world, agent.beliefId);
    agent.spiritualInfluence = practicedBelief
      ? Math.max(
        0,
        agent.conviction * 1.5 +
          (practicedBelief.founderAgentId === agent.id ? practicedBelief.adherentIds.length * 0.32 + 1.5 : 0) +
          practicedBelief.reformationCount * 0.16,
      )
      : 0;
    const survival = agent.health * 0.075 + agent.hunger * 0.018 + agent.hydration * 0.022 + agent.energy * 0.012;
    const possessions = agent.inventory.food * 0.45 + agent.inventory.water * 0.5 + agent.inventory.wood * 0.3 + agent.inventory.ore * 0.75;
    agent.personalPower = Math.max(
      0,
      survival + possessions + agent.experience * 1.15 + agent.knowledge * 1.28 + agent.influence * 1.12 + agent.spiritualInfluence * 0.42,
    );
  }

  for (const camp of world.camps) {
    if (!camp.active) {
      camp.power = 0;
      camp.economicPower = 0;
      camp.militaryPower = 0;
      camp.knowledgePower = 0;
      continue;
    }
    const members = livingCampMembers(world, camp);
    const storageValue = camp.storage.food * 0.32 + camp.storage.water * 0.36 + camp.storage.wood * 0.26 + camp.storage.ore * 0.68;
    const production = camp.structures.farm * 5 + camp.structures.well * 5.5 + camp.structures.workshop * 4 + camp.structures.roads * 3.5;
    const prosperityPower = campBeliefHasTenet(world, camp, "shared_prosperity") ? members.length * 0.55 : 0;
    camp.economicPower = storageValue + production + members.length * 2.4 + prosperityPower;
    const fightingCapacity = members.reduce(
      (sum, member) => sum + member.health * 0.075 + member.energy * 0.028 + member.experience * 0.95,
      0,
    );
    const weaponMultiplier = hasTechnology(camp, "bronze_working") ? 1.2 : 1;
    const defense = camp.structures.walls * 8 + camp.structures.shelter * 1.4 + (hasTechnology(camp, "masonry") ? 5 : 0);
    camp.militaryPower = fightingCapacity * weaponMultiplier + defense + camp.victories * 2.5;
    const memberKnowledge = members.reduce((sum, member) => sum + member.knowledge, 0);
    const beliefKnowledge = campBeliefHasTenet(world, camp, "knowledge_seeking") ? members.length * 0.45 : 0;
    camp.knowledgePower = camp.technologies.length * 7 + memberKnowledge * 0.85 + camp.structures.archive * 6 + camp.structures.council * 3 + beliefKnowledge;
    camp.territoryRadius = clamp(
      8 + Math.sqrt(Math.max(1, members.length)) * 2.2 + camp.structures.roads * 1.8 + (hasTechnology(camp, "logistics") ? 3 : 0),
      8,
      24,
    );
    camp.radius = 3.5 + Math.min(2.5, members.length * 0.13 + camp.structures.shelter * 0.18);
    camp.power = Math.max(
      0,
      camp.economicPower * 0.34 +
        camp.militaryPower * 0.39 +
        camp.knowledgePower * 0.27 +
        camp.cohesion * 12 +
        camp.territoryRadius * 0.45,
    );
  }
}

function updatePowerLead(world: CivilizationWorldState): void {
  const ranked = getRankedCamps(world);
  const leader = ranked[0] ?? null;
  const previous = getActiveCamp(world, world.powerLeaderCampId);
  if (!leader) {
    world.powerLeaderCampId = null;
    return;
  }
  if (!previous) {
    world.powerLeaderCampId = leader.id;
    world.powerLeaderSince = world.day;
    return;
  }
  if (leader.id === previous.id) return;
  if (leader.power < previous.power * 1.07 && world.day - world.powerLeaderSince < 0.5) return;
  world.powerLeaderCampId = leader.id;
  world.powerLeaderSince = world.day;
  pushMajorEvent(
    world,
    "power_lead_change",
    "positive",
    `${leader.name} becomes the leading power`,
    `${leader.name}'s achieved economic, military, knowledge, and cohesion score reaches ${round(leader.power)}, overtaking ${previous.name}.`,
    [leader.leaderId].filter((id): id is string => id !== null),
    [previous.id, leader.id],
  );
}

function killAgent(
  world: CivilizationWorldState,
  agent: CivilizationAgent,
  killer: CivilizationAgent | null,
  reason: string,
): void {
  if (!agent.alive) return;
  const campId = agent.campId;
  agent.alive = false;
  agent.health = 0;
  agent.deathDay = world.day;
  agent.velocity = { x: 0, z: 0 };
  agent.action = "idle";
  agent.target = null;
  agent.goal = "Dead";
  agent.rationale = reason;
  agent.personalPower = 0;
  if (campId) {
    const camp = getActiveCamp(world, campId);
    if (camp) camp.memberIds = camp.memberIds.filter((id) => id !== agent.id);
  }
  agent.campId = null;
  world.stats.deaths += 1;
  pushMajorEvent(
    world,
    "death",
    "critical",
    `${agent.name} dies`,
    `${agent.name} ${reason}. The death changes the balance of lineage, labor, and power.`,
    killer ? [agent.id, killer.id] : [agent.id],
    campId ? [campId] : [],
  );
}

function captureCamp(
  world: CivilizationWorldState,
  victor: CivilizationCamp,
  defeated: CivilizationCamp,
  captor: CivilizationAgent,
): void {
  if (!defeated.active) return;
  const displaced = livingCampMembers(world, defeated);
  for (const kind of ["food", "water", "wood", "ore"] as const) {
    const spoils = defeated.storage[kind] * 0.68;
    defeated.storage[kind] -= spoils;
    victor.storage[kind] = clamp(victor.storage[kind] + spoils, 0, CAMP_STORAGE_LIMIT);
  }
  victor.structures.shelter = Math.min(6, victor.structures.shelter + Math.floor(defeated.structures.shelter / 2));
  victor.victories += 1;
  defeated.losses += 1;
  defeated.active = false;
  defeated.capturedByCampId = victor.id;
  defeated.destroyedDay = world.day;
  defeated.leaderId = null;
  defeated.memberIds = [];
  for (const member of displaced) {
    member.campId = null;
    member.unaffiliatedSinceDay = world.day;
    member.loyalty = 0.15;
    member.satisfaction = 0.24;
    member.action = "flee";
    member.currentPlan = "seek_home";
    member.goal = "Survive the fall of the camp";
    member.rationale = "The camp has been captured; independence, a new camp, or a safer allegiance must now be evaluated.";
    member.target = frontierTarget(world, member);
    member.decisionTimer = 4;
  }
  for (const relation of world.relations) {
    if (relation.campAId === defeated.id || relation.campBId === defeated.id) {
      if (relation.status === "war") relation.status = "truce";
    }
  }
  world.stats.campsCaptured += 1;
  pushMajorEvent(
    world,
    "camp_captured",
    "critical",
    `${victor.name} captures ${defeated.name}`,
    `${captor.name} breaks the remaining defense. ${victor.name} seizes most stores while ${displaced.length} survivor${displaced.length === 1 ? " becomes" : "s become"} independent.`,
    [captor.id, ...displaced.map((member) => member.id)],
    [victor.id, defeated.id],
  );
}

function validInventory(value: unknown): value is Inventory {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return ["food", "water", "wood", "ore"].every(
    (kind) => typeof record[kind] === "number" && Number.isFinite(record[kind]) && (record[kind] as number) >= 0,
  );
}

function validPosition(value: unknown): value is Vec2 {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const position = value as Record<string, unknown>;
  return typeof position.x === "number" && Number.isFinite(position.x) &&
    typeof position.z === "number" && Number.isFinite(position.z);
}

function uniqueStringIds(items: unknown[]): boolean {
  const ids = items.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const id = (item as Record<string, unknown>).id;
    return typeof id === "string" && id.length > 0 ? id : null;
  });
  return ids.every((id): id is string => id !== null) && new Set(ids).size === ids.length;
}

function isAgentPlan(value: unknown): value is AgentPlan {
  return typeof value === "string" && AGENT_PLAN_SET.has(value as AgentPlan);
}

function validOutcomeSignals(value: unknown): value is AgentOutcomeSignals {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const signals = value as Record<string, unknown>;
  return ["health", "nutrition", "hydration", "energy", "personalPower", "influence", "knowledge", "family", "campSecurity", "resources"].every(
    (key) => typeof signals[key] === "number" && Number.isFinite(signals[key]),
  );
}

function validAgentCognition(agent: Record<string, unknown>): boolean {
  // Old schema-v2 rows predate cognition. Missing fields are accepted here so
  // parseWorld can pass them to normalizeCivilizationWorld for deterministic
  // hydration. Any cognition that is present must already be structurally safe.
  if (agent.planLearning !== undefined) {
    if (!agent.planLearning || typeof agent.planLearning !== "object" || Array.isArray(agent.planLearning)) return false;
    for (const [plan, learningValue] of Object.entries(agent.planLearning as Record<string, unknown>)) {
      if (!isAgentPlan(plan) || !learningValue || typeof learningValue !== "object" || Array.isArray(learningValue)) return false;
      const learning = learningValue as Record<string, unknown>;
      if (typeof learning.attempts !== "number" || !Number.isSafeInteger(learning.attempts) || learning.attempts < 0) return false;
      if (typeof learning.expectedValue !== "number" || !Number.isFinite(learning.expectedValue) || learning.expectedValue < -1 || learning.expectedValue > 1) return false;
    }
  }
  if (agent.recentMemories !== undefined) {
    if (!Array.isArray(agent.recentMemories) || agent.recentMemories.length > MAX_AGENT_MEMORIES) return false;
    for (const memoryValue of agent.recentMemories) {
      if (!memoryValue || typeof memoryValue !== "object" || Array.isArray(memoryValue)) return false;
      const memory = memoryValue as Record<string, unknown>;
      if (typeof memory.id !== "string" || memory.id.length === 0 || !isAgentPlan(memory.plan)) return false;
      if (!(["success", "mixed", "setback"] as const).includes(memory.outcome as AgentOutcome)) return false;
      if (typeof memory.day !== "number" || !Number.isFinite(memory.day)) return false;
      if (typeof memory.score !== "number" || !Number.isFinite(memory.score) || memory.score < -1 || memory.score > 1) return false;
      if (typeof memory.summary !== "string" || memory.summary.length > 500) return false;
    }
  }
  if (agent.deliberation !== undefined) {
    if (!agent.deliberation || typeof agent.deliberation !== "object" || Array.isArray(agent.deliberation)) return false;
    const deliberation = agent.deliberation as Record<string, unknown>;
    if (typeof deliberation.formedDay !== "number" || !Number.isFinite(deliberation.formedDay) || !isAgentPlan(deliberation.chosenPlan)) return false;
    if (typeof deliberation.statement !== "string" || deliberation.statement.length > 500) return false;
    if (typeof deliberation.confidence !== "number" || !Number.isFinite(deliberation.confidence) || deliberation.confidence < 0 || deliberation.confidence > 1) return false;
    if (!Array.isArray(deliberation.alternatives) || deliberation.alternatives.length > MAX_DELIBERATION_ALTERNATIVES) return false;
    for (const alternativeValue of deliberation.alternatives) {
      if (!alternativeValue || typeof alternativeValue !== "object" || Array.isArray(alternativeValue)) return false;
      const alternative = alternativeValue as Record<string, unknown>;
      if (!isAgentPlan(alternative.plan) || typeof alternative.goal !== "string" || alternative.goal.length > 300) return false;
      if (typeof alternative.score !== "number" || !Number.isFinite(alternative.score)) return false;
    }
  }
  if (agent.decisionSnapshot !== undefined && agent.decisionSnapshot !== null) {
    if (!agent.decisionSnapshot || typeof agent.decisionSnapshot !== "object" || Array.isArray(agent.decisionSnapshot)) return false;
    const snapshot = agent.decisionSnapshot as Record<string, unknown>;
    if (typeof snapshot.formedTime !== "number" || !Number.isFinite(snapshot.formedTime)) return false;
    if (typeof snapshot.formedDay !== "number" || !Number.isFinite(snapshot.formedDay) || !isAgentPlan(snapshot.plan)) return false;
    if (!validOutcomeSignals(snapshot.signals)) return false;
  }
  return true;
}

/** A non-throwing structural and finite-number validation for persisted JSON. */
export function validateCivilizationWorld(input: unknown): input is CivilizationWorldState {
  try {
    if (!input || typeof input !== "object" || Array.isArray(input)) return false;
    const world = input as Record<string, unknown>;
    if (world.version !== CIVILIZATION_SCHEMA_VERSION) return false;
    for (const key of ["seed", "randomState", "time", "day", "timeOfDay", "tick", "accumulator", "nextAgentId", "nextCampId", "nextEventId", "nextBeliefId", "nextWorldStrategyAt", "powerLeaderSince"] as const) {
      if (typeof world[key] !== "number" || !Number.isFinite(world[key])) return false;
    }
    if (world.lastSavedAt !== null && (typeof world.lastSavedAt !== "number" || !Number.isFinite(world.lastSavedAt))) return false;
    if (!world.map || typeof world.map !== "object" || Array.isArray(world.map)) return false;
    const map = world.map as Record<string, unknown>;
    if (typeof map.halfSize !== "number" || !Number.isFinite(map.halfSize) || typeof map.biome !== "string") return false;
    if (!Array.isArray(world.agents) || !Array.isArray(world.resources) || !Array.isArray(world.camps) || !Array.isArray(world.beliefs) || !Array.isArray(world.relations) || !Array.isArray(world.majorEvents)) return false;
    if (!uniqueStringIds(world.agents) || !uniqueStringIds(world.resources) || !uniqueStringIds(world.camps) || !uniqueStringIds(world.beliefs) || !uniqueStringIds(world.relations) || !uniqueStringIds(world.majorEvents)) return false;
    if (world.agents.length > 360 || world.camps.length > 96 || world.resources.length > 320 || world.beliefs.length > MAX_BELIEF_SYSTEMS || world.majorEvents.length > MAX_MAJOR_EVENTS) return false;

    for (const item of world.agents) {
      if (!item || typeof item !== "object" || Array.isArray(item)) return false;
      const agent = item as Record<string, unknown>;
      if (typeof agent.id !== "string" || typeof agent.name !== "string" || typeof agent.color !== "string") return false;
      if (!validPosition(agent.position) || !validPosition(agent.velocity) || !validInventory(agent.inventory)) return false;
      if (typeof agent.alive !== "boolean" || typeof agent.action !== "string" || !isAgentPlan(agent.currentPlan)) return false;
      if (!(agent.action in ACTION_LABELS)) return false;
      if (!validAgentCognition(agent)) return false;
      if (!Array.isArray(agent.parentIds) || !agent.parentIds.every((id) => typeof id === "string")) return false;
      if (!Array.isArray(agent.childrenIds) || !agent.childrenIds.every((id) => typeof id === "string")) return false;
      if (!agent.relationships || typeof agent.relationships !== "object" || Array.isArray(agent.relationships)) return false;
      for (const relationshipValue of Object.values(agent.relationships as Record<string, unknown>)) {
        if (!relationshipValue || typeof relationshipValue !== "object" || Array.isArray(relationshipValue)) return false;
        const relationship = relationshipValue as Record<string, unknown>;
        for (const key of ["trust", "respect", "grievance", "lastInteractionDay"] as const) {
          if (typeof relationship[key] !== "number" || !Number.isFinite(relationship[key])) return false;
        }
      }
      if (agent.target !== null) {
        if (!agent.target || typeof agent.target !== "object" || Array.isArray(agent.target)) return false;
        const agentTarget = agent.target as Record<string, unknown>;
        if (typeof agentTarget.kind !== "string" || typeof agentTarget.id !== "string" || typeof agentTarget.label !== "string" || !validPosition(agentTarget.position)) return false;
      }
      for (const key of ["heading", "speed", "capacity", "age", "generation", "bornAtDay", "health", "hunger", "hydration", "energy", "actionProgress", "decisionTimer", "personalPower", "influence", "knowledge", "experience", "loyalty", "satisfaction", "lastReproductionDay", "joinedCampDay", "kills", "harvested", "buildContribution", "researchContribution"] as const) {
        if (typeof agent[key] !== "number" || !Number.isFinite(agent[key])) return false;
      }
      if (agent.beliefId !== null && typeof agent.beliefId !== "string") return false;
      for (const key of ["conviction", "spiritualInfluence", "lastBeliefChangeDay"] as const) {
        if (typeof agent[key] !== "number" || !Number.isFinite(agent[key])) return false;
      }
    }

    for (const item of world.resources) {
      if (!item || typeof item !== "object" || Array.isArray(item)) return false;
      const resource = item as Record<string, unknown>;
      if (typeof resource.id !== "string" || typeof resource.kind !== "string" || !validPosition(resource.position)) return false;
      if (!Array.isArray(resource.discoveredByCampIds) || !resource.discoveredByCampIds.every((id) => typeof id === "string")) return false;
      for (const key of ["amount", "maxAmount", "regenRate", "richness"] as const) {
        if (typeof resource[key] !== "number" || !Number.isFinite(resource[key]) || (resource[key] as number) < 0) return false;
      }
    }

    for (const item of world.camps) {
      if (!item || typeof item !== "object" || Array.isArray(item)) return false;
      const camp = item as Record<string, unknown>;
      if (typeof camp.id !== "string" || typeof camp.name !== "string" || typeof camp.color !== "string") return false;
      if (!validPosition(camp.position) || !validInventory(camp.storage) || typeof camp.active !== "boolean") return false;
      if (!Array.isArray(camp.memberIds) || !camp.memberIds.every((id) => typeof id === "string")) return false;
      if (!Array.isArray(camp.technologies) || !camp.technologies.every((id) => typeof id === "string")) return false;
      if (!camp.technologies.every((id) => id in TECHNOLOGY_TREE)) return false;
      if (!camp.structures || typeof camp.structures !== "object" || Array.isArray(camp.structures)) return false;
      const structures = camp.structures as Record<string, unknown>;
      for (const key of ["shelter", "farm", "well", "walls", "workshop", "infirmary", "archive", "roads", "council"] as const) {
        if (typeof structures[key] !== "number" || !Number.isFinite(structures[key]) || (structures[key] as number) < 0) return false;
      }
      if (camp.researchTarget !== null && (typeof camp.researchTarget !== "string" || !(camp.researchTarget in TECHNOLOGY_TREE))) return false;
      if (camp.constructionTarget !== null && !["shelter", "farm", "well", "walls", "workshop", "infirmary", "archive", "roads", "council"].includes(String(camp.constructionTarget))) return false;
      for (const key of ["radius", "foundedDay", "researchProgress", "constructionProgress", "territoryRadius", "cohesion", "power", "economicPower", "militaryPower", "knowledgePower", "victories", "losses"] as const) {
        if (typeof camp[key] !== "number" || !Number.isFinite(camp[key])) return false;
      }
      if (camp.dominantBeliefId !== null && typeof camp.dominantBeliefId !== "string") return false;
      for (const key of ["beliefDiversity", "shrineLevel"] as const) {
        if (typeof camp[key] !== "number" || !Number.isFinite(camp[key])) return false;
      }
    }

    for (const item of world.beliefs) {
      if (!item || typeof item !== "object" || Array.isArray(item)) return false;
      const belief = item as Record<string, unknown>;
      if (typeof belief.id !== "string" || typeof belief.name !== "string" || typeof belief.color !== "string") return false;
      if (typeof belief.founderAgentId !== "string" || typeof belief.active !== "boolean" || !validPosition(belief.sacredSite)) return false;
      if (belief.originCampId !== null && typeof belief.originCampId !== "string") return false;
      if (belief.parentBeliefId !== null && typeof belief.parentBeliefId !== "string") return false;
      if (!Array.isArray(belief.tenets) || belief.tenets.length < 1 || belief.tenets.length > 4 || !belief.tenets.every((tenet) => typeof tenet === "string" && tenet in BELIEF_TENET_LABELS)) return false;
      if (!Array.isArray(belief.adherentIds) || !belief.adherentIds.every((id) => typeof id === "string")) return false;
      if (!Array.isArray(belief.campIds) || !belief.campIds.every((id) => typeof id === "string")) return false;
      for (const key of ["foundedDay", "influence", "unity", "reformationCount", "schismCount"] as const) {
        if (typeof belief[key] !== "number" || !Number.isFinite(belief[key]) || (belief[key] as number) < 0) return false;
      }
    }

    for (const item of world.relations) {
      if (!item || typeof item !== "object" || Array.isArray(item)) return false;
      const relation = item as Record<string, unknown>;
      if (typeof relation.id !== "string" || typeof relation.campAId !== "string" || typeof relation.campBId !== "string" || typeof relation.status !== "string") return false;
      if (!["neutral", "alliance", "truce", "war"].includes(relation.status)) return false;
      if (relation.truceUntilDay !== null && (typeof relation.truceUntilDay !== "number" || !Number.isFinite(relation.truceUntilDay))) return false;
      if (relation.lastConflictDay !== null && (typeof relation.lastConflictDay !== "number" || !Number.isFinite(relation.lastConflictDay))) return false;
      for (const key of ["trust", "tension", "sinceDay", "warScoreA", "warScoreB"] as const) {
        if (typeof relation[key] !== "number" || !Number.isFinite(relation[key])) return false;
      }
    }

    for (const item of world.majorEvents) {
      if (!item || typeof item !== "object" || Array.isArray(item)) return false;
      const event = item as Record<string, unknown>;
      if (typeof event.id !== "string" || typeof event.type !== "string" || typeof event.tone !== "string" || typeof event.title !== "string" || typeof event.message !== "string") return false;
      if (typeof event.time !== "number" || !Number.isFinite(event.time) || typeof event.day !== "number" || !Number.isFinite(event.day)) return false;
      if (!Array.isArray(event.agentIds) || !event.agentIds.every((id) => typeof id === "string")) return false;
      if (!Array.isArray(event.campIds) || !event.campIds.every((id) => typeof id === "string")) return false;
      if (!Array.isArray(event.beliefIds) || !event.beliefIds.every((id) => typeof id === "string")) return false;
    }
    if (!world.stats || typeof world.stats !== "object" || Array.isArray(world.stats)) return false;
    const stats = world.stats as Record<string, unknown>;
    if (!validInventory(stats.resourcesHarvested)) return false;
    for (const key of ["births", "deaths", "wars", "peaceTreaties", "defections", "breakaways", "coups", "technologiesUnlocked", "campsFounded", "campsCaptured", "campsDestroyed", "peakPopulation", "beliefsFounded", "conversions", "schisms", "reformations", "beliefRejections", "beliefsFaded", "shrinesBuilt"] as const) {
      if (typeof stats[key] !== "number" || !Number.isFinite(stats[key]) || (stats[key] as number) < 0) return false;
    }
    return typeof world.powerLeaderCampId === "string" || world.powerLeaderCampId === null;
  } catch {
    return false;
  }
}

/**
 * Upgrades a structurally sound schema-1 snapshot without erasing history.
 * Outer-frontier resources use a separate migration cursor, so the live PRNG
 * stream and every pre-existing entity/timestamp remain untouched.
 */
function upgradeSchemaOneWorld(input: unknown): CivilizationWorldState | null {
  try {
    if (!input || typeof input !== "object" || Array.isArray(input)) return null;
    const source = input as Record<string, unknown>;
    if (source.version !== 1) return null;
    if (!Array.isArray(source.agents) || !Array.isArray(source.camps) || !Array.isArray(source.resources) || !Array.isArray(source.relations) || !Array.isArray(source.majorEvents)) return null;
    const migrated = JSON.parse(JSON.stringify(source)) as Record<string, unknown>;
    const agents = migrated.agents as Array<Record<string, unknown>>;
    const camps = migrated.camps as Array<Record<string, unknown>>;
    const resources = migrated.resources as Array<Record<string, unknown>>;
    const events = migrated.majorEvents as Array<Record<string, unknown>>;
    const stats = migrated.stats as Record<string, unknown>;
    if (!stats || typeof stats !== "object" || Array.isArray(stats)) return null;

    migrated.version = CIVILIZATION_SCHEMA_VERSION;
    migrated.beliefs = [];
    migrated.nextBeliefId = 1;
    if (!migrated.map || typeof migrated.map !== "object" || Array.isArray(migrated.map)) return null;
    (migrated.map as Record<string, unknown>).halfSize = WORLD_HALF_SIZE;
    (migrated.map as Record<string, unknown>).biome = "Expanded sovereign frontier";

    for (const agent of agents) {
      agent.beliefId = null;
      agent.conviction = 0;
      agent.spiritualInfluence = 0;
      agent.lastBeliefChangeDay = -100;
      agent.planLearning = {};
      agent.recentMemories = [];
      agent.deliberation = emptyDeliberation(
        typeof migrated.day === "number" && Number.isFinite(migrated.day) ? migrated.day : 1,
      );
      agent.decisionSnapshot = null;
    }
    for (const camp of camps) {
      camp.dominantBeliefId = null;
      camp.beliefDiversity = 0;
      camp.shrineLevel = 0;
    }
    for (const event of events) event.beliefIds = [];
    for (const key of ["beliefsFounded", "conversions", "schisms", "reformations", "beliefRejections", "beliefsFaded", "shrinesBuilt"] as const) {
      stats[key] = 0;
    }

    const seed = normalizeCivilizationSeed(
      typeof migrated.seed === "number" || typeof migrated.seed === "string"
        ? migrated.seed
        : DEFAULT_CIVILIZATION_SEED,
    );
    const tick = typeof migrated.tick === "number" && Number.isFinite(migrated.tick)
      ? Math.floor(migrated.tick)
      : 0;
    const cursor: RandomCursor = { state: (seed ^ 0xa7_19_4d_3b ^ tick) >>> 0 };
    const resourceIds = new Set(resources.map((resource) => String(resource.id ?? "")));
    const kinds: readonly ResourceKind[] = ["food", "water", "wood", "ore"];
    for (const kind of kinds) {
      const specification = resourceSpecification(kind);
      let existing = resources.filter((resource) => resource.kind === kind).length;
      let ordinal = existing + 1;
      while (existing < specification.count) {
        while (resourceIds.has(`${kind}-${String(ordinal).padStart(3, "0")}`)) ordinal += 1;
        const id = `${kind}-${String(ordinal).padStart(3, "0")}`;
        resourceIds.add(id);
        let position: Vec2 | null = null;
        for (let attempt = 0; attempt < 80; attempt += 1) {
          const angle = cursorRandom(cursor) * TAU;
          const radius = randomRange(cursor, 72, WORLD_HALF_SIZE - 2.5);
          const candidate = { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius };
          if (resources.every((resource) => validPosition(resource.position) && distanceBetween(resource.position, candidate) > 1.2)) {
            position = candidate;
            break;
          }
        }
        if (!position) {
          const angle = ordinal * 2.399963229728653;
          const radius = 74 + ((ordinal * 7.31) % 23);
          position = boundedPosition({ x: Math.cos(angle) * radius, z: Math.sin(angle) * radius }, 2);
        }
        const maximum = randomRange(cursor, specification.maximum[0], specification.maximum[1]);
        resources.push({
          id,
          kind,
          position,
          amount: round(maximum * randomRange(cursor, 0.62, 1)),
          maxAmount: round(maximum),
          regenRate: randomRange(cursor, specification.regeneration[0], specification.regeneration[1]),
          richness: round(randomRange(cursor, 0.82, 1.18), 3),
          discoveredByCampIds: [],
        });
        existing += 1;
        ordinal += 1;
      }
    }

    return validateCivilizationWorld(migrated)
      ? migrated
      : null;
  } catch {
    return null;
  }
}

/**
 * Adds cognition defaults to pre-cognition schema-v2 JSON without advancing the
 * simulation or PRNG. This is a field hydration, not a schema/timeline reset.
 */
function hydrateSchemaTwoCognition(input: unknown): unknown {
  try {
    if (!input || typeof input !== "object" || Array.isArray(input)) return input;
    const source = input as Record<string, unknown>;
    if (source.version !== CIVILIZATION_SCHEMA_VERSION || !Array.isArray(source.agents)) return input;
    const hydrated = JSON.parse(JSON.stringify(source)) as Record<string, unknown>;
    const agents = hydrated.agents as Array<Record<string, unknown>>;
    const day = typeof hydrated.day === "number" && Number.isFinite(hydrated.day)
      ? hydrated.day
      : 1;
    for (const agent of agents) {
      if (agent.planLearning === undefined) agent.planLearning = {};
      if (agent.recentMemories === undefined) agent.recentMemories = [];
      if (agent.deliberation === undefined) agent.deliberation = emptyDeliberation(day);
      if (agent.decisionSnapshot === undefined) agent.decisionSnapshot = null;
    }
    return hydrated;
  } catch {
    return input;
  }
}

/**
 * Normalization never throws. Schema-1 snapshots are upgraded in place and
 * schema-2 states are cloned, bounded, and de-duplicated. Corrupt or unknown versions restart from a deterministic
 * fallback seed rather than allowing damaged state into the live simulation.
 */
export function normalizeCivilizationWorld(
  input: unknown,
  fallbackSeed: SeedInput = DEFAULT_CIVILIZATION_SEED,
): CivilizationWorldState {
  let candidate: unknown = input;
  if (typeof input === "string") {
    try {
      candidate = JSON.parse(input) as unknown;
    } catch {
      return createCivilizationWorld(fallbackSeed);
    }
  }
  if (candidate && typeof candidate === "object" && !Array.isArray(candidate) && (candidate as { version?: unknown }).version === 1) {
    candidate = upgradeSchemaOneWorld(candidate);
  }
  if (candidate && typeof candidate === "object" && !Array.isArray(candidate) && (candidate as { version?: unknown }).version === CIVILIZATION_SCHEMA_VERSION) {
    candidate = hydrateSchemaTwoCognition(candidate);
  }
  if (!validateCivilizationWorld(candidate)) {
    const seed = candidate && typeof candidate === "object" && !Array.isArray(candidate)
      ? (candidate as { seed?: unknown }).seed
      : undefined;
    return createCivilizationWorld(
      typeof seed === "string" || typeof seed === "number" ? seed : fallbackSeed,
    );
  }
  const world = cloneCivilizationWorld(candidate);
  stabilizeWorld(world);
  return validateCivilizationWorld(world) ? world : createCivilizationWorld(fallbackSeed);
}

export const migrateCivilizationWorld = normalizeCivilizationWorld;
export const cloneCivilizationState = cloneCivilizationWorld;

function stabilizeWorld(world: CivilizationWorldState): void {
  world.randomState = (finite(world.randomState, world.seed) >>> 0) || DEFAULT_CIVILIZATION_SEED;
  world.time = Math.max(0, finite(world.time, 0));
  world.day = Math.max(1, Math.floor(finite(world.day, 1)));
  world.timeOfDay = ((finite(world.timeOfDay, 0.28) % 1) + 1) % 1;
  world.tick = Math.max(0, Math.floor(finite(world.tick, 0)));
  world.accumulator = clamp(finite(world.accumulator, 0), 0, FIXED_STEP);
  world.nextAgentId = Math.max(1, Math.floor(finite(world.nextAgentId, 1)));
  world.nextCampId = Math.max(1, Math.floor(finite(world.nextCampId, 1)));
  world.nextEventId = Math.max(1, Math.floor(finite(world.nextEventId, 1)));
  world.nextBeliefId = Math.max(1, Math.floor(finite(world.nextBeliefId, 1)));
  world.nextWorldStrategyAt = Math.max(world.time, finite(world.nextWorldStrategyAt, world.time));
  world.powerLeaderSince = Math.max(0, finite(world.powerLeaderSince, 0));
  world.map.halfSize = WORLD_HALF_SIZE;
  for (const agent of world.agents) {
    agent.position = boundedPosition(agent.position, 0.55);
    agent.velocity.x = finite(agent.velocity.x, 0);
    agent.velocity.z = finite(agent.velocity.z, 0);
    agent.heading = finite(agent.heading, 0);
    agent.speed = clamp(finite(agent.speed, 3), 0.2, 12);
    agent.capacity = clamp(finite(agent.capacity, 12), 1, 100);
    agent.age = Math.max(0, finite(agent.age, 0));
    agent.generation = Math.max(0, Math.floor(finite(agent.generation, 0)));
    agent.health = clamp(finite(agent.health, 0), 0, 100);
    agent.hunger = clamp(finite(agent.hunger, 0), 0, 100);
    agent.hydration = clamp(finite(agent.hydration, 0), 0, 100);
    agent.energy = clamp(finite(agent.energy, 0), 0, 100);
    agent.loyalty = clamp(finite(agent.loyalty, 0.5), 0, 1);
    agent.satisfaction = clamp(finite(agent.satisfaction, 0.5), 0, 1);
    agent.personalPower = Math.max(0, finite(agent.personalPower, 0));
    agent.influence = Math.max(0, finite(agent.influence, 0));
    agent.knowledge = Math.max(0, finite(agent.knowledge, 0));
    agent.experience = Math.max(0, finite(agent.experience, 0));
    agent.actionProgress = Math.max(0, finite(agent.actionProgress, 0));
    agent.decisionTimer = finite(agent.decisionTimer, 0);
    agent.kills = Math.max(0, Math.floor(finite(agent.kills, 0)));
    agent.harvested = Math.max(0, finite(agent.harvested, 0));
    agent.buildContribution = Math.max(0, finite(agent.buildContribution, 0));
    agent.researchContribution = Math.max(0, finite(agent.researchContribution, 0));
    agent.conviction = clamp(finite(agent.conviction, 0), 0, 1);
    agent.spiritualInfluence = Math.max(0, finite(agent.spiritualInfluence, 0));
    agent.lastBeliefChangeDay = finite(agent.lastBeliefChangeDay, -100);
    const normalizedLearning: Partial<Record<AgentPlan, AgentPlanLearning>> = {};
    for (const plan of AGENT_PLANS) {
      const learning = agent.planLearning?.[plan];
      if (!learning) continue;
      normalizedLearning[plan] = {
        attempts: clamp(Math.floor(finite(learning.attempts, 0)), 0, 1_000_000),
        expectedValue: clamp(finite(learning.expectedValue, 0), -1, 1),
      };
    }
    agent.planLearning = normalizedLearning;
    agent.recentMemories = (agent.recentMemories ?? []).slice(-MAX_AGENT_MEMORIES).map((memory) => ({
      ...memory,
      day: Math.max(0, finite(memory.day, world.day)),
      score: clamp(finite(memory.score, 0), -1, 1),
      summary: String(memory.summary ?? "").slice(0, 500),
    }));
    const deliberation = agent.deliberation ?? emptyDeliberation(world.day);
    agent.deliberation = {
      formedDay: Math.max(0, finite(deliberation.formedDay, world.day)),
      chosenPlan: AGENT_PLAN_SET.has(deliberation.chosenPlan) ? deliberation.chosenPlan : "survive",
      statement: String(deliberation.statement ?? "").slice(0, 500),
      confidence: clamp(finite(deliberation.confidence, 0.5), 0, 1),
      alternatives: (deliberation.alternatives ?? []).slice(0, MAX_DELIBERATION_ALTERNATIVES).map((alternative) => ({
        plan: AGENT_PLAN_SET.has(alternative.plan) ? alternative.plan : "survive",
        goal: String(alternative.goal ?? "Reassess current conditions").slice(0, 300),
        score: finite(alternative.score, 0),
      })),
    };
    if (agent.decisionSnapshot) {
      const signals = agent.decisionSnapshot.signals;
      agent.decisionSnapshot = {
        formedTime: Math.max(0, finite(agent.decisionSnapshot.formedTime, world.time)),
        formedDay: Math.max(0, finite(agent.decisionSnapshot.formedDay, world.day)),
        plan: AGENT_PLAN_SET.has(agent.decisionSnapshot.plan) ? agent.decisionSnapshot.plan : "survive",
        signals: {
          health: finite(signals.health, agent.health),
          nutrition: finite(signals.nutrition, agent.hunger),
          hydration: finite(signals.hydration, agent.hydration),
          energy: finite(signals.energy, agent.energy),
          personalPower: finite(signals.personalPower, agent.personalPower),
          influence: finite(signals.influence, agent.influence + agent.spiritualInfluence),
          knowledge: finite(signals.knowledge, agent.knowledge),
          family: Math.max(0, finite(signals.family, agent.childrenIds.length)),
          campSecurity: clamp(finite(signals.campSecurity, 0), 0, 100),
          resources: Math.max(0, finite(signals.resources, totalInventory(agent.inventory))),
        },
      };
    } else {
      agent.decisionSnapshot = null;
    }
    for (const kind of ["food", "water", "wood", "ore"] as const) {
      agent.inventory[kind] = clamp(finite(agent.inventory[kind], 0), 0, Math.max(0, agent.capacity));
    }
    agent.parentIds = [...new Set(agent.parentIds)].filter((id) => id !== agent.id);
    agent.childrenIds = [...new Set(agent.childrenIds)].filter((id) => id !== agent.id);
    for (const relationship of Object.values(agent.relationships)) {
      relationship.trust = clamp(finite(relationship.trust, 0.4), 0, 1);
      relationship.respect = clamp(finite(relationship.respect, 0.3), 0, 1);
      relationship.grievance = clamp(finite(relationship.grievance, 0), 0, 1);
      relationship.lastInteractionDay = Math.max(0, finite(relationship.lastInteractionDay, world.day));
    }
    if (!agent.alive) {
      agent.health = 0;
      agent.velocity = { x: 0, z: 0 };
      agent.target = null;
      agent.personalPower = 0;
    }
  }
  for (const resource of world.resources) {
    resource.position = boundedPosition(resource.position, 1);
    resource.maxAmount = Math.max(0.01, finite(resource.maxAmount, 1));
    resource.amount = clamp(finite(resource.amount, 0), 0, resource.maxAmount);
    resource.regenRate = Math.max(0, finite(resource.regenRate, 0));
    resource.richness = clamp(finite(resource.richness, 1), 0.1, 4);
    resource.discoveredByCampIds = [...new Set(resource.discoveredByCampIds)];
  }
  for (const camp of world.camps) {
    camp.position = boundedPosition(camp.position, 4);
    camp.radius = clamp(finite(camp.radius, 3.5), 2, 9);
    camp.territoryRadius = clamp(finite(camp.territoryRadius, 8), 4, 28);
    camp.cohesion = clamp(finite(camp.cohesion, 0.5), 0, 1);
    camp.power = Math.max(0, finite(camp.power, 0));
    camp.economicPower = Math.max(0, finite(camp.economicPower, 0));
    camp.militaryPower = Math.max(0, finite(camp.militaryPower, 0));
    camp.knowledgePower = Math.max(0, finite(camp.knowledgePower, 0));
    camp.researchProgress = Math.max(0, finite(camp.researchProgress, 0));
    camp.constructionProgress = clamp(finite(camp.constructionProgress, 0), 0, 1);
    camp.victories = Math.max(0, Math.floor(finite(camp.victories, 0)));
    camp.losses = Math.max(0, Math.floor(finite(camp.losses, 0)));
    camp.beliefDiversity = clamp(finite(camp.beliefDiversity, 0), 0, 1);
    camp.shrineLevel = clamp(Math.floor(finite(camp.shrineLevel, 0)), 0, 4);
    camp.memberIds = [...new Set(camp.memberIds)];
    camp.technologies = [...new Set(camp.technologies)].filter(
      (technology): technology is TechnologyId => technology in TECHNOLOGY_TREE,
    );
    if (!camp.technologies.includes("basic_tools")) camp.technologies.unshift("basic_tools");
    for (const kind of ["food", "water", "wood", "ore"] as const) {
      camp.storage[kind] = clamp(finite(camp.storage[kind], 0), 0, CAMP_STORAGE_LIMIT);
    }
    for (const kind of Object.keys(camp.structures) as StructureKind[]) {
      camp.structures[kind] = clamp(Math.floor(finite(camp.structures[kind], 0)), 0, 6);
    }
  }
  for (const relation of world.relations) {
    relation.trust = clamp(finite(relation.trust, 0.4), 0, 1);
    relation.tension = clamp(finite(relation.tension, 0.2), 0, 1);
    relation.warScoreA = finite(relation.warScoreA, 0);
    relation.warScoreB = finite(relation.warScoreB, 0);
    relation.sinceDay = Math.max(0, finite(relation.sinceDay, world.day));
  }
  const beliefIds = new Set(world.beliefs.map((belief) => belief.id));
  for (const agent of world.agents) {
    if (agent.beliefId && !beliefIds.has(agent.beliefId)) {
      agent.beliefId = null;
      agent.conviction = 0;
    }
  }
  for (const camp of world.camps) {
    if (camp.dominantBeliefId && !beliefIds.has(camp.dominantBeliefId)) camp.dominantBeliefId = null;
  }
  for (const belief of world.beliefs) {
    belief.sacredSite = boundedPosition(belief.sacredSite, 4);
    belief.tenets = [...new Set(belief.tenets)].filter((tenet): tenet is BeliefTenetId => tenet in BELIEF_TENET_LABELS).slice(0, 4);
    if (belief.tenets.length === 0) belief.tenets = ["reciprocal_aid"];
    belief.adherentIds = [...new Set(belief.adherentIds)];
    belief.campIds = [...new Set(belief.campIds)];
    belief.foundedDay = Math.max(0, finite(belief.foundedDay, world.day));
    belief.influence = Math.max(0, finite(belief.influence, 0));
    belief.unity = clamp(finite(belief.unity, 0), 0, 1);
    belief.reformationCount = Math.max(0, Math.floor(finite(belief.reformationCount, 0)));
    belief.schismCount = Math.max(0, Math.floor(finite(belief.schismCount, 0)));
  }
  for (const event of world.majorEvents) {
    event.agentIds = [...new Set(event.agentIds)];
    event.campIds = [...new Set(event.campIds)];
    event.beliefIds = [...new Set(event.beliefIds)];
  }
  for (const key of ["births", "deaths", "wars", "peaceTreaties", "defections", "breakaways", "coups", "technologiesUnlocked", "campsFounded", "campsCaptured", "campsDestroyed", "peakPopulation", "beliefsFounded", "conversions", "schisms", "reformations", "beliefRejections", "beliefsFaded", "shrinesBuilt"] as const) {
    world.stats[key] = Math.max(0, Math.floor(finite(world.stats[key], 0)));
  }
  for (const kind of ["food", "water", "wood", "ore"] as const) {
    world.stats.resourcesHarvested[kind] = Math.max(0, finite(world.stats.resourcesHarvested[kind], 0));
  }
  if (world.majorEvents.length > MAX_MAJOR_EVENTS) {
    world.majorEvents.splice(0, world.majorEvents.length - MAX_MAJOR_EVENTS);
  }
  pruneHistoricalEntities(world);
}

function pruneHistoricalEntities(world: CivilizationWorldState): void {
  if (world.agents.length > 240) {
    const living = world.agents.filter((agent) => agent.alive);
    const beliefFounderIds = new Set(world.beliefs.map((belief) => belief.founderAgentId));
    const byId = new Map(world.agents.map((agent) => [agent.id, agent]));
    const genealogyDistance = new Map<string, number>();
    const queue: Array<{ id: string; distance: number }> = living.map((agent) => ({
      id: agent.id,
      distance: 0,
    }));
    for (let index = 0; index < queue.length; index += 1) {
      const current = queue[index];
      if (!current || genealogyDistance.has(current.id)) continue;
      genealogyDistance.set(current.id, current.distance);
      const relative = byId.get(current.id);
      if (!relative) continue;
      for (const id of [...relative.parentIds, ...relative.childrenIds]) {
        if (!genealogyDistance.has(id) && byId.has(id)) {
          queue.push({ id, distance: current.distance + 1 });
        }
      }
    }
    const dead = world.agents
      .filter((agent) => !agent.alive)
      .sort((left, right) => {
        const leftFoundedBelief = beliefFounderIds.has(left.id) ? 0 : 1;
        const rightFoundedBelief = beliefFounderIds.has(right.id) ? 0 : 1;
        const leftDistance = genealogyDistance.get(left.id) ?? Number.POSITIVE_INFINITY;
        const rightDistance = genealogyDistance.get(right.id) ?? Number.POSITIVE_INFINITY;
        return leftFoundedBelief - rightFoundedBelief ||
          leftDistance - rightDistance ||
          (right.deathDay ?? 0) - (left.deathDay ?? 0) ||
          left.id.localeCompare(right.id);
      });
    world.agents = [...living, ...dead.slice(0, Math.max(0, 240 - living.length))];
    const retained = new Set(world.agents.map((agent) => agent.id));
    for (const agent of world.agents) {
      for (const id of Object.keys(agent.relationships)) {
        if (!retained.has(id)) delete agent.relationships[id];
      }
    }
  }
  const inactive = world.camps.filter((camp) => !camp.active);
  if (inactive.length > 48) {
    const beliefOriginCampIds = new Set(
      world.beliefs
        .map((belief) => belief.originCampId)
        .filter((id): id is string => id !== null),
    );
    const keptInactive = inactive
      .sort((left, right) => {
        const leftOrigin = beliefOriginCampIds.has(left.id) ? 0 : 1;
        const rightOrigin = beliefOriginCampIds.has(right.id) ? 0 : 1;
        return leftOrigin - rightOrigin ||
          (right.destroyedDay ?? 0) - (left.destroyedDay ?? 0) ||
          left.id.localeCompare(right.id);
      })
      .slice(0, 48);
    const keptIds = new Set([
      ...world.camps.filter((camp) => camp.active).map((camp) => camp.id),
      ...keptInactive.map((camp) => camp.id),
    ]);
    world.camps = world.camps.filter((camp) => keptIds.has(camp.id));
    world.relations = world.relations.filter(
      (relation) => keptIds.has(relation.campAId) && keptIds.has(relation.campBId),
    );
  }
}

export function getRankedCamps(world: CivilizationWorldState): CivilizationCamp[] {
  return [...world.camps].sort((left, right) => {
    if (left.active !== right.active) return left.active ? -1 : 1;
    return right.power - left.power || right.memberIds.length - left.memberIds.length || left.id.localeCompare(right.id);
  });
}

export function getRankedAgents(world: CivilizationWorldState): CivilizationAgent[] {
  return [...world.agents].sort((left, right) => {
    if (left.alive !== right.alive) return left.alive ? -1 : 1;
    return right.personalPower - left.personalPower || right.influence - left.influence || left.id.localeCompare(right.id);
  });
}

export function getAgentInfluenceBreakdown(
  world: CivilizationWorldState,
  agentOrId: CivilizationAgent | string,
): AgentInfluenceBreakdown | null {
  const agent = typeof agentOrId === "string"
    ? world.agents.find((candidate) => candidate.id === agentOrId)
    : agentOrId;
  if (!agent) return null;
  const socialInfluence = Math.max(0, finite(agent.influence, 0));
  const spiritualInfluence = Math.max(0, finite(agent.spiritualInfluence, 0));
  return {
    agentId: agent.id,
    socialInfluence,
    spiritualInfluence,
    achievedInfluence: socialInfluence + spiritualInfluence,
    personalPower: Math.max(0, finite(agent.personalPower, 0)),
    knowledge: Math.max(0, finite(agent.knowledge, 0)),
    directDescendants: agent.childrenIds.length,
  };
}

/** Ranks attained influence, without any hidden or assigned prestige trait. */
export function getRankedInfluentialAgents(world: CivilizationWorldState): CivilizationAgent[] {
  return [...world.agents].sort((left, right) => {
    const leftInfluence = left.influence + left.spiritualInfluence;
    const rightInfluence = right.influence + right.spiritualInfluence;
    return rightInfluence - leftInfluence ||
      right.personalPower - left.personalPower ||
      right.knowledge - left.knowledge ||
      right.childrenIds.length - left.childrenIds.length ||
      Number(right.alive) - Number(left.alive) ||
      left.id.localeCompare(right.id);
  });
}

/** Cycle-safe bounded genealogy projection suitable for a compact UI panel. */
export function getAgentFamilyTree(
  world: CivilizationWorldState,
  rootId: string,
  options: AgentFamilyTreeOptions = {},
): AgentFamilyTree {
  const direction = options.direction ?? "both";
  const maxDepth = clamp(Math.floor(finite(options.maxDepth, 4)), 0, 12);
  const maxNodes = clamp(Math.floor(finite(options.maxNodes, 60)), 1, 160);
  const byId = new Map(world.agents.map((agent) => [agent.id, agent]));
  const root = byId.get(rootId);
  if (!root) {
    return { rootId, nodes: [], edges: [], unresolvedIds: [rootId], truncated: false };
  }

  const visited = new Set<string>();
  const unresolved = new Set<string>();
  const edgeKeys = new Set<string>();
  const edges: AgentFamilyTreeEdge[] = [];
  const nodes: AgentFamilyTreeNode[] = [];
  const queue: Array<{ id: string; depth: number }> = [{ id: root.id, depth: 0 }];
  let truncated = false;

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    if (!current || visited.has(current.id)) continue;
    const agent = byId.get(current.id);
    if (!agent) {
      unresolved.add(current.id);
      continue;
    }
    if (nodes.length >= maxNodes) {
      truncated = true;
      break;
    }
    visited.add(agent.id);
    nodes.push({
      id: agent.id,
      name: agent.name,
      alive: agent.alive,
      generation: agent.generation,
      campId: agent.campId,
      parentIds: [...agent.parentIds],
      childrenIds: [...agent.childrenIds],
      achievedInfluence: agent.influence + agent.spiritualInfluence,
    });
    if (current.depth >= maxDepth) {
      if ((direction !== "descendants" && agent.parentIds.length > 0) ||
          (direction !== "ancestors" && agent.childrenIds.length > 0)) {
        truncated = true;
      }
      continue;
    }

    if (direction !== "descendants") {
      for (const parentId of agent.parentIds) {
        const key = `${parentId}>${agent.id}`;
        if (!edgeKeys.has(key)) {
          edgeKeys.add(key);
          edges.push({ parentId, childId: agent.id });
        }
        if (byId.has(parentId)) queue.push({ id: parentId, depth: current.depth + 1 });
        else unresolved.add(parentId);
      }
    }
    if (direction !== "ancestors") {
      for (const childId of agent.childrenIds) {
        const key = `${agent.id}>${childId}`;
        if (!edgeKeys.has(key)) {
          edgeKeys.add(key);
          edges.push({ parentId: agent.id, childId });
        }
        if (byId.has(childId)) queue.push({ id: childId, depth: current.depth + 1 });
        else unresolved.add(childId);
      }
    }
  }

  const retainedIds = new Set(nodes.map((node) => node.id));
  return {
    rootId,
    nodes,
    edges: edges.filter((edge) => retainedIds.has(edge.parentId) && retainedIds.has(edge.childId)),
    unresolvedIds: [...unresolved].sort(),
    truncated,
  };
}

export function getRankedBeliefs(world: CivilizationWorldState): CivilizationBeliefSystem[] {
  return [...world.beliefs].sort((left, right) => {
    if (left.active !== right.active) return left.active ? -1 : 1;
    return right.influence - left.influence || right.adherentIds.length - left.adherentIds.length || left.id.localeCompare(right.id);
  });
}

export function getCivilizationSummary(world: CivilizationWorldState): CivilizationSummary {
  const living = world.agents.filter((agent) => agent.alive);
  const camps = world.camps.filter((camp) => camp.active);
  const rankedCamps = getRankedCamps(world).filter((camp) => camp.active);
  const rankedAgents = getRankedAgents(world).filter((agent) => agent.alive);
  const leadingCamp = rankedCamps[0] ?? null;
  return {
    day: world.day,
    timeOfDay: world.timeOfDay,
    population: living.length,
    totalBorn: 10 + world.stats.births,
    activeCamps: camps.length,
    wars: world.relations.filter((relation) => relation.status === "war").length,
    alliances: world.relations.filter((relation) => relation.status === "alliance").length,
    unaffiliated: living.filter((agent) => !agent.campId).length,
    technologiesUnlocked: new Set(camps.flatMap((camp) => camp.technologies)).size,
    activeBeliefs: world.beliefs.filter((belief) => belief.active).length,
    secularPopulation: living.filter((agent) => !agent.beliefId).length,
    mostPowerfulCampId: leadingCamp?.id ?? null,
    mostPowerfulCampName: leadingCamp?.name ?? null,
    mostPowerfulCampPower: leadingCamp?.power ?? 0,
    mostPowerfulAgentId: rankedAgents[0]?.id ?? null,
    averageHealth: living.length > 0
      ? living.reduce((sum, agent) => sum + agent.health, 0) / living.length
      : 0,
    resourcesRemaining: resourceInventory(world.resources),
  };
}

export function getWorldTimeLabel(
  world: Pick<CivilizationWorldState, "day" | "timeOfDay">,
): string {
  const minutesInDay = Math.floor(clamp(world.timeOfDay, 0, 0.999999) * 24 * 60);
  const hours = Math.floor(minutesInDay / 60);
  const minutes = minutesInDay % 60;
  return `DAY ${String(Math.max(1, Math.floor(world.day))).padStart(3, "0")} · ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function getActionLabel(action: AgentAction): string {
  return ACTION_LABELS[action] ?? "Reassessing options";
}

export function getTechnologyLabel(technology: TechnologyId): string {
  return TECHNOLOGY_LABELS[technology] ?? technology;
}

export function getBeliefTenetLabel(tenet: BeliefTenetId): string {
  return BELIEF_TENET_LABELS[tenet] ?? tenet;
}

export function getAgentById(
  world: CivilizationWorldState,
  id: string,
): CivilizationAgent | undefined {
  return world.agents.find((agent) => agent.id === id);
}

export function getCampById(
  world: CivilizationWorldState,
  id: string,
): CivilizationCamp | undefined {
  return world.camps.find((camp) => camp.id === id);
}

export function getBeliefById(
  world: CivilizationWorldState,
  id: string,
): CivilizationBeliefSystem | undefined {
  return world.beliefs.find((belief) => belief.id === id);
}
