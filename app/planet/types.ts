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
}

export interface PlanetChronicleEntry {
  id: string;
  day: number;
  category: "discovery" | "ecology" | "politics" | "war" | "belief" | "migration";
  title: string;
  summary: string;
  entity?: PlanetEntitySelection;
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
    goals: Array<{ id: string; purpose: string; priority: number; confidence: number; status: string; rationale: string; steps: Array<{ id: string; action: string; status: string; requirements: string[] }> }>;
    commitments: Array<{ id: string; kind: string; targetId: string; strength: number }>;
    lastDecision: null | { explanation: string; uncertainty: number; alternatives: Array<{ purpose: string; score: number; summary: string }> };
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
}

export type PlanetEntityDetail =
  | { kind: "agent"; record: PlanetAgentDetailRecord }
  | { kind: "settlement"; record: PlanetSettlementDetailRecord }
  | { kind: "civilization"; record: PlanetCivilizationDetailRecord };
