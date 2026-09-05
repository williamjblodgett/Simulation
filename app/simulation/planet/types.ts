/**
 * Serializable contracts for WildGrid's Era III planetary simulation.
 *
 * The engine deliberately stores only data here: no DOM objects, class
 * instances, Sets, Maps, dates, or renderer handles. That keeps a world safe
 * to shard, persist, replay, and consume from either the hosted or local app.
 */

export type SeedInput = number | string;
export type EntityId = string;
export type StockMap = Record<string, number>;

export interface PlanetCoordinate {
  longitude: number;
  latitude: number;
}

export interface ChunkCoordinate {
  x: number;
  y: number;
}

export type ResourceFamily =
  | "water"
  | "food"
  | "biological"
  | "fiber"
  | "construction"
  | "industrial_mineral"
  | "metal"
  | "strategic_mineral"
  | "precious"
  | "fossil_fuel"
  | "nuclear"
  | "renewable_energy";

export type ResourceForm =
  | "deposit"
  | "biological"
  | "soil"
  | "water"
  | "energy_flow";

export interface ResourceSpawnRules {
  minTemperature?: number;
  maxTemperature?: number;
  minRainfall?: number;
  maxRainfall?: number;
  minElevation?: number;
  maxElevation?: number;
  geology?: GeologyKind[];
  biomes?: BiomeKind[];
  coastal?: boolean;
  baseChance: number;
}

export interface YieldModel {
  baseYield: number;
  reserveMin: number;
  reserveMax: number;
  regenerationPerDay?: number;
  carryingCapacity?: number;
}

export interface ResourceDefinition {
  id: string;
  name: string;
  family: ResourceFamily;
  form: ResourceForm;
  renewability: "renewable" | "slow" | "finite";
  spawn: ResourceSpawnRules;
  discoveryRequirements: string[];
  extractionRequirements: string[];
  yield: YieldModel;
  hazards: string[];
  pollution: Record<string, number>;
}

export interface CommodityDefinition {
  id: string;
  name: string;
  family: string;
  properties: string[];
  decayPerDay?: number;
}

export interface RecipeDefinition {
  id: string;
  name: string;
  inputs: StockMap;
  outputs: StockMap;
  requiredCapabilities: string[];
  requiredFacilities: string[];
  energyCost: number;
  labor: number;
  pollution: Record<string, number>;
}

export interface CapabilityDefinition {
  id: string;
  name: string;
  domain: TechnologyDomain;
  prerequisites: string[];
  evidence: string[];
  unlocksRecipes: string[];
  complexity: number;
}

export type TechnologyDomain =
  | "survival"
  | "agriculture"
  | "materials"
  | "construction"
  | "energy"
  | "transport"
  | "medicine"
  | "science"
  | "communication"
  | "governance"
  | "manufacturing"
  | "computation"
  | "environment"
  | "aerospace";

export type BiomeKind =
  | "ocean"
  | "ice"
  | "tundra"
  | "boreal_forest"
  | "temperate_forest"
  | "grassland"
  | "desert"
  | "savanna"
  | "tropical_forest"
  | "wetland"
  | "alpine";

export type GeologyKind =
  | "sedimentary"
  | "igneous"
  | "metamorphic"
  | "volcanic"
  | "alluvial"
  | "oceanic";

export interface TerrainSample {
  x: number;
  y: number;
  coordinate: PlanetCoordinate;
  elevation: number;
  temperature: number;
  rainfall: number;
  fertility: number;
  geology: GeologyKind;
  biome: BiomeKind;
  ocean: boolean;
}

export interface ResourceSite {
  id: string;
  resourceId: string;
  coordinate: PlanetCoordinate;
  reserve: number;
  capacity: number;
  discoveredBy: EntityId[];
  extractionFacilityId: EntityId | null;
}

export interface PlanetChunk {
  key: string;
  coordinate: ChunkCoordinate;
  revision: number;
  terrain: TerrainSample[];
  resourceSites: ResourceSite[];
}

export type ObservationKind =
  | "resource"
  | "terrain"
  | "agent"
  | "settlement"
  | "threat"
  | "route"
  | "outcome"
  | "knowledge";

export interface KnowledgeObservation {
  id: string;
  kind: ObservationKind;
  subjectId: string;
  learnedAt: number;
  coordinate: PlanetCoordinate | null;
  confidence: number;
  facts: Record<string, string | number | boolean>;
}

export interface ContextLearning {
  key: string;
  attempts: number;
  expectedValue: number;
  lastUpdatedAt: number;
}

export type GoalKind =
  | "survive"
  | "secure_water"
  | "secure_food"
  | "find_shelter"
  | "explore"
  | "gather"
  | "trade"
  | "migrate"
  | "build"
  | "research"
  | "teach"
  | "organize"
  | "negotiate"
  | "defend"
  | "rebel"
  | "prosper";

export type GoalStatus = "considered" | "active" | "blocked" | "complete" | "abandoned";

export interface PlanStep {
  id: string;
  action: string;
  targetId: string | null;
  duration: number;
  status: "pending" | "active" | "complete" | "failed";
  requirements: string[];
}

export interface AgentGoal {
  id: string;
  purpose: GoalKind;
  targetId: string | null;
  steps: PlanStep[];
  priority: number;
  confidence: number;
  status: GoalStatus;
  expectedBenefits: Record<string, number>;
  formedAt: number;
  lastReconsideredAt: number;
  rationale: string;
}

export interface AgentMindState {
  learnedDriveWeights: Record<string, number>;
  observations: KnowledgeObservation[];
  skills: Record<string, number>;
  goals: AgentGoal[];
  commitments: AgentCommitment[];
  contextualLearning: ContextLearning[];
  decisionSequence: number;
  lastDecision: AgentDecisionRecord | null;
  advisory: AgentAdvisory | null;
}

export interface AgentAdvisory {
  id: EntityId;
  source: "openai";
  receivedAt: number;
  expiresAt: number;
  goalKind: GoalKind;
  proposalIntent: ProposalKind | null;
  targetId: EntityId | null;
  reasoning: string;
  status: "accepted" | "expired";
  provenance: string;
}

export interface AgentCommitment {
  id: string;
  kind: "family" | "work" | "office" | "project" | "agreement";
  targetId: string;
  strength: number;
  createdAt: number;
  expiresAt: number | null;
}

export interface AgentDecisionAlternative {
  purpose: GoalKind;
  score: number;
  summary: string;
}

export interface AgentDecisionRecord {
  id: string;
  decidedAt: number;
  chosenGoalId: string;
  knownFactIds: string[];
  alternatives: AgentDecisionAlternative[];
  uncertainty: number;
  explanation: string;
}

export interface AgentNeeds {
  health: number;
  nutrition: number;
  hydration: number;
  rest: number;
  safety: number;
}

export interface PlanetAgent {
  id: EntityId;
  name: string;
  lastRenameDay: number;
  nameHistory: RenameRecord[];
  alive: boolean;
  birthDay: number;
  deathDay: number | null;
  coordinate: PlanetCoordinate;
  homeSettlementId: EntityId | null;
  polityId: EntityId | null;
  beliefId: EntityId | null;
  beliefConviction: number;
  parentIds: EntityId[];
  childIds: EntityId[];
  generation: number;
  lastReproductionDay: number;
  needs: AgentNeeds;
  inventory: StockMap;
  capabilities: string[];
  influence: number;
  mind: AgentMindState;
  lastWakeAt: number;
  nextWakeAt: number;
  scheduleToken: number;
}

export interface SettlementState {
  id: EntityId;
  name: string;
  lastRenameDay: number;
  nameHistory: RenameRecord[];
  coordinate: PlanetCoordinate;
  polityId: EntityId;
  founderIds: EntityId[];
  residentIds: EntityId[];
  stocks: StockMap;
  facilities: Record<string, number>;
  knownResourceSiteIds: EntityId[];
  capabilities: string[];
  knowledgeEvidence: Record<string, number>;
  projectIds: EntityId[];
  createdAt: number;
}

export interface PolityState {
  id: EntityId;
  name: string;
  lastRenameDay: number;
  nameHistory: RenameRecord[];
  settlementIds: EntityId[];
  citizenIds: EntityId[];
  institutionIds: EntityId[];
  beliefIds: EntityId[];
  leaderId: EntityId | null;
  createdAt: number;
}

export interface RenameRecord {
  day: number;
  previousName: string;
  newName: string;
  agentId: EntityId;
  reason: string;
}

export interface BeliefReformEvent {
  id: EntityId;
  day: number;
  agentId: EntityId;
  addedValue: string | null;
  removedValue: string | null;
  summary: string;
}

export interface BeliefState {
  id: EntityId;
  name: string;
  color: string;
  kind: "religion" | "philosophy" | "ethical_system" | "civic_creed";
  coreValues: string[];
  tenets: string[];
  founderAgentId: EntityId;
  originSettlementId: EntityId | null;
  originDay: number;
  adherentIds: EntityId[];
  influence: number;
  parentBeliefId: EntityId | null;
  reformHistory: BeliefReformEvent[];
  schismIds: EntityId[];
  active: boolean;
}

export interface InstitutionState {
  id: EntityId;
  name: string;
  kind: "council" | "assembly" | "guild" | "school" | "faith" | "militia" | "market";
  polityId: EntityId;
  memberIds: EntityId[];
  rule: "consensus" | "majority" | "authority" | "contract";
  createdAt: number;
}

export type ProposalKind =
  | "family"
  | "trade"
  | "migration"
  | "construction"
  | "research"
  | "law"
  | "alliance"
  | "war"
  | "peace"
  | "leadership"
  | "belief_reform";

export interface ProposalDecision {
  agentId: EntityId;
  choice: "accept" | "reject" | "abstain";
  score: number;
  decidedAt: number;
  rationale: string;
}

export interface NamedProposal {
  id: EntityId;
  kind: ProposalKind;
  title: string;
  sponsorAgentId: EntityId;
  polityId: EntityId | null;
  counterpartyIds: EntityId[];
  requiredDecisionAgentIds: EntityId[];
  decisions: ProposalDecision[];
  payload: Record<string, string | number | boolean>;
  createdAt: number;
  expiresAt: number;
  status: "open" | "accepted" | "rejected" | "expired";
}

export type DiplomaticStatus = "neutral" | "alliance" | "truce" | "war";

export interface DiplomaticRelation {
  key: string;
  polityIds: [EntityId, EntityId];
  status: DiplomaticStatus;
  trust: number;
  tension: number;
  changedAt: number;
  proposalId: EntityId | null;
}

export interface InventionProject {
  id: EntityId;
  name: string;
  sponsorAgentId: EntityId;
  settlementId: EntityId | null;
  purpose: string;
  materialIds: string[];
  processIds: string[];
  prerequisiteCapabilities: string[];
  generatedCapabilityId: string;
  evidence: number;
  difficulty: number;
  attempts: number;
  status: "hypothesis" | "experiment" | "prototype" | "practiced" | "institutionalized" | "failed";
  createdAt: number;
  updatedAt: number;
}

export interface TerritoryDispute {
  cellKey: string;
  ownerPolityId: EntityId;
  claimantPolityIds: EntityId[];
  startedAt: number;
}

export interface RegionIndexEntry {
  agentIds: EntityId[];
  settlementIds: EntityId[];
}

export type ScheduledEventKind = "agent_wake" | "project_review" | "proposal_expiry" | "ecology";

export interface ScheduledEvent {
  id: string;
  at: number;
  sequence: number;
  kind: ScheduledEventKind;
  entityId: EntityId;
  token: number;
}

export type PlanetHistoryEventType =
  | "world_started"
  | "agent_decision"
  | "discovery"
  | "extraction"
  | "production"
  | "birth"
  | "construction"
  | "trade"
  | "alliance"
  | "war"
  | "peace"
  | "leadership_change"
  | "invention"
  | "proposal"
  | "agreement"
  | "territory_claim"
  | "territory_contested"
  | "migration"
  | "breakaway"
  | "settlement_founded"
  | "belief_founded"
  | "belief_adopted"
  | "belief_reformed"
  | "belief_schism"
  | "agent_renamed"
  | "settlement_renamed"
  | "polity_renamed"
  | "external_counsel"
  | "death";

export interface PlanetHistoryEvent {
  id: EntityId;
  at: number;
  day: number;
  type: PlanetHistoryEventType;
  title: string;
  summary: string;
  actorIds: EntityId[];
  entityIds: EntityId[];
  coordinate: PlanetCoordinate | null;
  importance: number;
  causalEventIds: EntityId[];
  fingerprint: string;
}

export interface PlanetWorldStats {
  livingAgents: number;
  peakAgents: number;
  discoveries: number;
  inventions: number;
  proposals: number;
  processedEvents: number;
}

export interface PlanetWorldState {
  schemaVersion: 3;
  seed: number;
  seedLabel: string;
  time: number;
  day: number;
  revision: number;
  agents: PlanetAgent[];
  settlements: SettlementState[];
  polities: PolityState[];
  beliefs: BeliefState[];
  institutions: InstitutionState[];
  proposals: NamedProposal[];
  diplomacy: Record<string, DiplomaticRelation>;
  projects: InventionProject[];
  territoryOwners: Record<string, EntityId>;
  territoryDisputes: Record<string, TerritoryDispute>;
  modifiedResourceSites: Record<string, ResourceSite>;
  regionIndex: Record<string, RegionIndexEntry>;
  scheduler: ScheduledEvent[];
  history: PlanetHistoryEvent[];
  stats: PlanetWorldStats;
  nextIds: Record<string, number>;
}

export interface PlanetWorldOptions {
  initialAgentCount?: number;
  initialSettlementCount?: number;
}

export interface AdvanceOptions {
  maxEvents?: number;
  focusedAgentIds?: string[];
}

export interface AdvanceResult {
  processedEvents: number;
  reachedTime: number;
  targetTime: number;
  complete: boolean;
}

export interface GeographicBounds {
  west: number;
  east: number;
  south: number;
  north: number;
}

export interface PlanetViewportSnapshot {
  revision: number;
  day: number;
  bounds: GeographicBounds;
  zoom: number;
  agents: PlanetAgent[];
  agentClusters: Array<{ coordinate: PlanetCoordinate; count: number; polityIds: string[] }>;
  settlements: SettlementState[];
  territory: Array<{ cellKey: string; ownerPolityId: string }>;
  disputes: TerritoryDispute[];
  beliefInfluence: Array<{
    beliefId: EntityId;
    name: string;
    color: string;
    coordinate: PlanetCoordinate;
    adherents: number;
    influence: number;
  }>;
}

export interface PlanetSummary {
  schemaVersion: 3;
  seedLabel: string;
  day: number;
  revision: number;
  livingAgents: number;
  settlements: number;
  polities: number;
  beliefs: number;
  openProposals: number;
  activeProjects: number;
}
