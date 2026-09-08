export const PLANET_OVERLAYS = [
  "political",
  "diplomacy",
  "wars",
  "beliefs",
  "resources",
  "technology",
  "climate",
  "population",
] as const;

export type PlanetOverlay = (typeof PLANET_OVERLAYS)[number];

export interface GeoPoint {
  longitude: number;
  latitude: number;
}

export interface PlanetCamera extends GeoPoint {
  zoom: number;
}

export interface PlanetCivilization {
  id: string;
  name: string;
  color: string;
  population: number;
  beliefId: string | null;
  technologyScore: number;
  prosperity: number;
  summary: string;
  lifecycleStatus?: "active" | "dissolved" | "merged" | "historical";
  endedDay?: number | null;
  successorId?: string | null;
}

export interface PlanetBelief {
  id: string;
  name: string;
  color: string;
  followers: number;
  values: string[];
  tenets?: string[];
  kind?: string;
  founderAgentId?: string;
  founderName?: string | null;
  originSettlementId?: string | null;
  originName?: string | null;
  originDay?: number;
  parentBeliefId?: string | null;
  active?: boolean;
  lifecycleStatus?: "active" | "dormant" | "revived" | "historical";
  status?: "active" | "dormant" | "revived" | "historical";
  reforms?: Array<{ day: number; summary: string }>;
  schisms?: number;
}

export interface PlanetLandmass {
  id: string;
  name: string;
  biome: "tundra" | "boreal" | "temperate" | "grassland" | "desert" | "tropical" | "alpine";
  civilizationId: string | null;
  points: GeoPoint[];
}

export interface PlanetSettlement extends GeoPoint {
  id: string;
  name: string;
  civilizationId: string;
  population: number;
  kind: "camp" | "village" | "town" | "city" | "capital";
  prosperity: number;
  capabilities?: string[];
  lifecycleStatus?: "active" | "declining" | "abandoned" | "absorbed" | "historical";
  endedDay?: number | null;
  successorId?: string | null;
}

export interface PlanetAgent extends GeoPoint {
  id: string;
  name: string;
  civilizationId: string | null;
  settlementId: string | null;
  beliefId: string | null;
  action: string;
  influence: number;
  generation: number;
  age?: number;
  currentGoal: string;
  knownFacts: string[];
}

export type PlanetResourceFamily =
  | "food"
  | "water"
  | "biological"
  | "construction"
  | "metal"
  | "strategic"
  | "fuel"
  | "energy";

export interface PlanetResourceSite extends GeoPoint {
  id: string;
  name: string;
  family: PlanetResourceFamily;
  abundance: number;
  discoveredBy: string[];
  finite: boolean;
}

export interface PlanetRelation {
  id: string;
  fromCivilizationId: string;
  toCivilizationId: string;
  kind: "alliance" | "trade" | "truce";
  strength: number;
  trust?: number;
  tension?: number;
  sinceDay?: number;
}

export interface PlanetConflict {
  id: string;
  name: string;
  attackerCivilizationId: string;
  defenderCivilizationId: string;
  longitude: number;
  latitude: number;
  intensity: number;
  sinceDay: number;
  tension?: number;
}

export interface PlanetChronicleEntry {
  id: string;
  day: number;
  category: "discovery" | "ecology" | "life" | "politics" | "war" | "belief" | "migration";
  title: string;
  summary: string;
  entity?: PlanetEntitySelection;
  actorIds?: string[];
  entityIds?: string[];
  causalEventIds?: string[];
}

export interface PlanetSnapshot {
  meta: {
    seed: number;
    era: string;
    day: number;
    population: number;
    status: "connecting" | "live" | "catching-up" | "offline";
    revision: number;
    dataMode?: "live" | "sample";
    notice?: string;
    continuity?: {
      persistent: boolean;
      serverTimeMs: number;
      simulatedAtMs: number;
      pendingSeconds: number;
      caughtUp: boolean;
      reconstructionResolution?: "exact" | "mixed" | "coarse";
      coverageFromDay?: number;
      coarseEpochDays?: number | null;
    };
  };
  civilizations: PlanetCivilization[];
  beliefs: PlanetBelief[];
  landmasses: PlanetLandmass[];
  settlements: PlanetSettlement[];
  agents: PlanetAgent[];
  resources: PlanetResourceSite[];
  relations: PlanetRelation[];
  conflicts: PlanetConflict[];
  chronicle: PlanetChronicleEntry[];
  terrain?: PlanetTerrainCell[];
  agentClusters?: PlanetAgentCluster[];
  resourceCells?: PlanetResourceCell[];
  territoryCells?: PlanetTerritoryCell[];
  beliefInfluence?: PlanetBeliefInfluence[];
  aiCounsel?: {
    configured: boolean;
    model: string;
    activeSlots: number;
    topAgentIds: string[];
    lastCompletedDay: number | null;
    callsToday: number;
    dailyCallLimit: number;
    consecutiveFailures: number;
  };
  observation?: {
    windowDays: number;
    ageBands: { children: number; adults: number; elders: number };
    medianAge: number;
    oldestAge: number;
    autonomousDecisions: number;
    births: number;
    deaths: number;
    migrations: number;
    inventions: number;
    discoveries: number;
    secularAgents: number;
    independentAgents: number;
    knownCapabilities: number;
    activeGoals: Partial<Record<string, number>>;
  };
  coverage?: {
    sampled: boolean;
    shown: Partial<Record<string, number>>;
    available: Partial<Record<string, number>>;
  };
  knowledgeProjects?: PlanetKnowledgeProject[];
}

export interface PlanetKnowledgeProject {
  id: string;
  title: string;
  capabilityId?: string | null;
  status: "proposed" | "active" | "failed" | "established" | "abandoned";
  originatorAgentId?: string | null;
  originatorName?: string | null;
  settlementId?: string | null;
  settlementName?: string | null;
  societyId?: string | null;
  societyName?: string | null;
  startedDay?: number;
  completedDay?: number | null;
  evidence?: string[];
  prerequisiteIds?: string[];
  materialIds?: string[];
  processIds?: string[];
  failureReason?: string | null;
  diffusionSettlementIds?: string[];
}

export interface PlanetTerrainCell extends GeoPoint {
  longitudeSize: number;
  latitudeSize: number;
  elevation: number;
  temperature: number;
  rainfall: number;
  fertility: number;
  biome: string;
  ocean: boolean;
}

export interface PlanetAgentCluster extends GeoPoint {
  count: number;
  civilizationIds: string[];
}

export interface PlanetResourceCell extends GeoPoint {
  families: Record<string, number>;
}

export interface PlanetTerritoryCell {
  cellKey: string;
  civilizationId: string;
  contestedBy: string[];
}

export interface PlanetBeliefInfluence extends GeoPoint {
  beliefId: string;
  adherents: number;
  influence: number;
}

export type PlanetEntitySelection =
  | { kind: "agent"; id: string }
  | { kind: "settlement"; id: string }
  | { kind: "civilization"; id: string }
  | { kind: "resource"; id: string };

/**
 * The UI intentionally depends on this small read-only contract rather than on
 * a particular simulation engine or persistence layer. A live adapter can
 * stream viewport snapshots later; the included fallback makes Era III
 * independently previewable while that engine is being built.
 */
export interface PlanetExperienceAdapter {
  readonly mode: "sample" | "live";
  getSnapshot(): PlanetSnapshot;
  subscribe?(listener: (snapshot: PlanetSnapshot) => void): () => void;
  searchAgents?(
    query: string,
    limit: number,
  ): PlanetAgent[] | Promise<PlanetAgent[]>;
  setViewport?(camera: PlanetCamera): void;
  loadEntity?(
    selection: PlanetEntitySelection,
    signal?: AbortSignal,
  ): Promise<PlanetEntityDetail | null>;
  dispose?(): void;
}

export interface PlanetAgentDetailRecord {
  id: string;
  name: string;
  alive: boolean;
  birthDay: number;
  deathDay: number | null;
  homeSettlementId: string | null;
  polityId: string | null;
  beliefId: string | null;
  beliefConviction: number;
  parentIds: string[];
  childIds: string[];
  generation: number;
  needs: Record<string, number> | {
    health: number;
    nutrition: number;
    hydration: number;
    rest: number;
    safety: number;
  };
  inventory: Record<string, number>;
  capabilities: string[];
  influence: number;
  mind: {
    goals: Array<{ id: string; purpose: string; targetId: string | null; priority: number; confidence: number; status: string; rationale: string; expectedBenefits: Record<string, number>; formedAt: number; lastReconsideredAt: number; steps: Array<{ id: string; action: string; status: string; requirements: string[] }> }>;
    commitments: Array<{ id: string; kind: string; targetId: string; strength: number; createdAt: number; expiresAt: number | null }>;
    observations: Array<{ id: string; kind: string; subjectId: string; learnedAt: number; confidence: number; facts: Record<string, string | number | boolean> }>;
    contextualLearning: Array<{ key: string; attempts: number; expectedValue: number; lastUpdatedAt: number }>;
    learnedDriveWeights: Record<string, number>;
    advisory: null | { source: "openai"; receivedAt: number; expiresAt: number; goalKind: string; proposalIntent: string | null; targetId: string | null; reasoning: string; status: string; provenance: string };
    lastDecision: null | { decidedAt: number; chosenGoalId: string; knownFactIds: string[]; explanation: string; uncertainty: number; alternatives: Array<{ purpose: string; score: number; summary: string }> };
  };
}

export interface PlanetSettlementDetailRecord {
  id: string;
  name: string;
  polityId: string;
  founderIds: string[];
  residentIds: string[];
  stocks: Record<string, number>;
  facilities: Record<string, number>;
  capabilities: string[];
  knownResourceSiteIds: string[];
  projectIds: string[];
  createdAt: number;
  lifecycleStatus?: PlanetSettlement["lifecycleStatus"];
  statusChangedAt?: number;
  endedDay?: number | null;
  successorId?: string | null;
}

export interface PlanetCivilizationDetailRecord {
  id: string;
  name: string;
  settlementIds: string[];
  citizenIds: string[];
  institutionIds: string[];
  beliefIds: string[];
  leaderId: string | null;
  createdAt: number;
  lifecycleStatus?: PlanetCivilization["lifecycleStatus"];
  statusChangedAt?: number;
  endedDay?: number | null;
  successorId?: string | null;
}

export type PlanetEntityDetail =
  | { kind: "agent"; record: PlanetAgentDetailRecord }
  | { kind: "settlement"; record: PlanetSettlementDetailRecord }
  | { kind: "civilization"; record: PlanetCivilizationDetailRecord };
