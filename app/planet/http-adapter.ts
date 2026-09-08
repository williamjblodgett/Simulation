import { createSamplePlanetAdapter } from "./sample-adapter";
import type {
  PlanetAgent,
  PlanetAgentCluster,
  PlanetBelief,
  PlanetCamera,
  PlanetChronicleEntry,
  PlanetCivilization,
  PlanetConflict,
  PlanetEntityDetail,
  PlanetEntitySelection,
  PlanetExperienceAdapter,
  PlanetRelation,
  PlanetResourceCell,
  PlanetResourceFamily,
  PlanetResourceSite,
  PlanetSettlement,
  PlanetSnapshot,
  PlanetTerrainCell,
  PlanetTerritoryCell,
} from "./types";

interface CompactApiAgent {
  id: string;
  name: string;
  alive?: boolean;
  coordinate: { longitude: number; latitude: number };
  homeSettlementId: string | null;
  polityId: string | null;
  beliefId?: string | null;
  influence: number;
  health?: number;
  birthDay?: number;
  generation?: number;
  observationCount?: number;
  lastDecisionExplanation?: string | null;
  currentGoal: null | { id: string; purpose: string; status: string; targetId: string | null; rationale?: string };
}

interface ApiViewport {
  revision: number;
  stateRevision: number;
  day: number;
  bounds: { west: number; east: number; south: number; north: number };
  zoom: number;
  agents: CompactApiAgent[];
  agentClusters: Array<{ coordinate: { longitude: number; latitude: number }; count: number; polityIds: string[] }>;
  settlements: Array<{
    id: string;
    name: string;
    coordinate: { longitude: number; latitude: number };
    polityId: string;
    population: number;
    capabilities: string[];
  }>;
  territory: Array<{ cellKey: string; ownerPolityId: string }>;
  disputes: Array<{ cellKey: string; ownerPolityId: string; claimantPolityIds: string[] }>;
  beliefInfluence: Array<{
    beliefId: string;
    name: string;
    color: string;
    coordinate: { longitude: number; latitude: number };
    adherents: number;
    influence: number;
  }>;
  terrain: Array<{
    coordinate: { longitude: number; latitude: number };
    elevation: number;
    temperature: number;
    rainfall: number;
    fertility: number;
    biome: string;
    ocean: boolean;
  }>;
  resourceSites: Array<{
    id: string;
    resourceId: string;
    family?: string;
    renewability?: "renewable" | "slow" | "finite";
    coordinate: { longitude: number; latitude: number };
    reserve: number;
    capacity: number;
    discovered: boolean;
    discoveredBy?: string[];
    extractionFacilityId: string | null;
  }>;
  resourceCells: Array<{
    coordinate: { longitude: number; latitude: number };
    resources: Record<string, number>;
  }>;
  polities: Array<{ id: string; name: string; color: string; population: number; settlements: number; dominantBeliefId: string | null }>;
  beliefs: Array<{
    id: string;
    name: string;
    color: string;
    kind: string;
    adherents: number;
    influence: number;
    coreValues?: string[];
    tenets?: string[];
    founderAgentId?: string;
    founderName?: string | null;
    originSettlementId?: string | null;
    originName?: string | null;
    originDay?: number;
    parentBeliefId?: string | null;
    active?: boolean;
    reforms?: Array<{ day: number; summary: string }>;
    schisms?: number;
  }>;
  diplomacy: Array<{ id: string; kind: string; title: string; polityId: string | null; counterpartyIds: string[]; status: string; trust?: number; tension?: number; changedAt?: number }>;
  conflicts: Array<{ id: string; title: string; polityId: string | null; counterpartyIds: string[]; status: string; trust?: number; tension?: number; changedAt?: number }>;
  chronicle: Array<{
    id: string;
    at: number;
    day: number;
    type: string;
    title: string;
    summary: string;
    importance: number;
    coordinate: { longitude: number; latitude: number } | null;
    actorIds: string[];
    entityIds: string[];
    causalEventIds: string[];
  }>;
  truncated?: Partial<Record<string, boolean>>;
  sourceCounts?: Partial<Record<string, number>>;
}

interface SummaryResponse {
  world?: {
    seedLabel?: string;
    status?: string;
    revision?: number;
    stateRevision?: number;
    day?: number;
  };
  summary?: {
    day?: number;
    livingAgents?: number;
    settlements?: number;
    polities?: number;
    beliefs?: number;
    observation?: PlanetSnapshot["observation"];
  };
  sync?: {
    revision?: number;
    catchUpPendingSeconds?: number;
    caughtUp?: boolean;
    serverTime?: number;
    simulatedAtMs?: number;
    persistent?: boolean;
  };
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

interface RegionsResponse {
  unchanged?: boolean;
  revision?: number;
  stateRevision?: number;
  day?: number;
  viewport?: ApiViewport;
  sync?: { catchUpPendingSeconds?: number; caughtUp?: boolean; serverTime?: number; simulatedAtMs?: number; persistent?: boolean };
}

const EMPTY_SNAPSHOT: PlanetSnapshot = {
  meta: {
    seed: 0,
    era: "Era III · Planetfall",
    day: 0,
    population: 0,
    status: "connecting",
    revision: 0,
    dataMode: "live",
    notice: "Connecting to the shared Era III planet",
  },
  civilizations: [],
  beliefs: [],
  landmasses: [],
  settlements: [],
  agents: [],
  resources: [],
  relations: [],
  conflicts: [],
  chronicle: [],
  terrain: [],
  agentClusters: [],
  resourceCells: [],
  territoryCells: [],
  beliefInfluence: [],
};

function copyEmptySnapshot(): PlanetSnapshot {
  return {
    ...EMPTY_SNAPSHOT,
    meta: { ...EMPTY_SNAPSHOT.meta },
    civilizations: [], beliefs: [], landmasses: [], settlements: [], agents: [], resources: [],
    relations: [], conflicts: [], chronicle: [], terrain: [], agentClusters: [], resourceCells: [], territoryCells: [], beliefInfluence: [],
  };
}

function hashSeed(value: string) {
  let hash = 2_166_136_261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function humanize(value: string) {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function resourceFamily(value: string): PlanetResourceFamily {
  const normalized = value.toLocaleLowerCase();
  if (normalized === "water") return "water";
  if (normalized === "food") return "food";
  if (normalized === "biological" || normalized === "fiber") return "biological";
  if (normalized === "construction" || normalized === "industrial_mineral") return "construction";
  if (normalized === "metal") return "metal";
  if (normalized === "fossil_fuel") return "fuel";
  if (normalized === "renewable_energy") return "energy";
  if (normalized === "strategic_mineral" || normalized === "precious" || normalized === "nuclear") return "strategic";
  return "strategic";
}

function settlementKind(population: number): PlanetSettlement["kind"] {
  if (population >= 1_000) return "capital";
  if (population >= 500) return "city";
  if (population >= 180) return "town";
  if (population >= 60) return "village";
  return "camp";
}

function chronicleCategory(type: string): PlanetChronicleEntry["category"] {
  if (/invent|discover|extract|produc|knowledge|research/.test(type)) return "discovery";
  if (/territory_contested|war|raid|conflict/.test(type)) return "war";
  if (/belief|faith|reform|schism/.test(type)) return "belief";
  if (/birth|death|famil|offspring|renam/.test(type)) return "life";
  if (/migrat|settlement|found/.test(type)) return "migration";
  if (/ecology|pollution|deplet|recover/.test(type)) return "ecology";
  return "politics";
}

function longitudeSpan(west: number, east: number) {
  if (east - west >= 359.99) return 360;
  return west <= east ? east - west : 360 - west + east;
}

function cameraBounds(camera: PlanetCamera) {
  if (camera.zoom < 1.8) return { west: -180, east: 180, south: -90, north: 90 };
  const longitudeRadius = Math.min(175, Math.max(6, 155 / camera.zoom));
  const latitudeRadius = Math.min(86, Math.max(4, 80 / camera.zoom));
  let west = camera.longitude - longitudeRadius;
  let east = camera.longitude + longitudeRadius;
  while (west < -180) west += 360;
  while (west > 180) west -= 360;
  while (east < -180) east += 360;
  while (east > 180) east -= 360;
  return {
    west,
    east,
    south: Math.max(-90, camera.latitude - latitudeRadius),
    north: Math.min(90, camera.latitude + latitudeRadius),
  };
}

function mapCompactAgent(agent: CompactApiAgent, currentDay?: number): PlanetAgent {
  return {
    id: agent.id,
    name: agent.name,
    civilizationId: agent.polityId,
    settlementId: agent.homeSettlementId,
    beliefId: agent.beliefId ?? null,
    longitude: agent.coordinate.longitude,
    latitude: agent.coordinate.latitude,
    action: agent.currentGoal ? humanize(agent.currentGoal.purpose) : "Reconsidering immediate needs",
    influence: Math.round(agent.influence),
    generation: agent.generation ?? 0,
    age: typeof currentDay === "number" && typeof agent.birthDay === "number"
      ? Math.max(0, Math.floor(currentDay - agent.birthDay))
      : undefined,
    currentGoal: agent.currentGoal?.rationale ?? (agent.currentGoal ? humanize(agent.currentGoal.purpose) : "Survive and prosper"),
    knownFacts: [
      agent.lastDecisionExplanation ?? "No completed deliberation is available in this compact record.",
      `${agent.observationCount ?? 0} retained local observation${agent.observationCount === 1 ? "" : "s"} informed the current mind state.`,
    ],
  };
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, 2_000) : [];
}

function numericRecord(value: unknown) {
  const record = objectRecord(value);
  if (!record) return {};
  return Object.fromEntries(Object.entries(record).flatMap(([key, item]) => typeof item === "number" && Number.isFinite(item) ? [[key, item]] : []));
}

function factRecord(value: unknown) {
  const record = objectRecord(value);
  if (!record) return {};
  return Object.fromEntries(Object.entries(record).flatMap(([key, item]) =>
    typeof item === "string" || typeof item === "boolean" || (typeof item === "number" && Number.isFinite(item))
      ? [[key, item]]
      : [],
  ));
}

function normalizeEntityDetail(kind: PlanetEntitySelection["kind"], value: unknown): PlanetEntityDetail | null {
  const record = objectRecord(value);
  if (!record || typeof record.id !== "string" || typeof record.name !== "string") return null;
  if (kind === "agent") {
    const mind = objectRecord(record.mind);
    const decision = objectRecord(mind?.lastDecision);
    const goals = Array.isArray(mind?.goals) ? mind.goals.flatMap((rawGoal) => {
      const goal = objectRecord(rawGoal);
      if (!goal || typeof goal.id !== "string") return [];
      return [{
        id: goal.id,
        purpose: typeof goal.purpose === "string" ? goal.purpose : "survive",
        targetId: typeof goal.targetId === "string" ? goal.targetId : null,
        priority: typeof goal.priority === "number" ? goal.priority : 0,
        confidence: typeof goal.confidence === "number" ? goal.confidence : 0,
        status: typeof goal.status === "string" ? goal.status : "considered",
        rationale: typeof goal.rationale === "string" ? goal.rationale : "No rationale was recorded.",
        expectedBenefits: numericRecord(goal.expectedBenefits),
        formedAt: typeof goal.formedAt === "number" ? goal.formedAt : 0,
        lastReconsideredAt: typeof goal.lastReconsideredAt === "number" ? goal.lastReconsideredAt : 0,
        steps: Array.isArray(goal.steps) ? goal.steps.flatMap((rawStep) => {
          const step = objectRecord(rawStep);
          return step && typeof step.id === "string" ? [{
            id: step.id,
            action: typeof step.action === "string" ? step.action : "observe",
            status: typeof step.status === "string" ? step.status : "pending",
            requirements: stringList(step.requirements),
          }] : [];
        }) : [],
      }];
    }) : [];
    const alternatives = Array.isArray(decision?.alternatives) ? decision.alternatives.flatMap((rawAlternative) => {
      const alternative = objectRecord(rawAlternative);
      return alternative && typeof alternative.purpose === "string" ? [{
        purpose: alternative.purpose,
        score: typeof alternative.score === "number" ? alternative.score : 0,
        summary: typeof alternative.summary === "string" ? alternative.summary : "No summary was recorded.",
      }] : [];
    }) : [];
    return {
      kind: "agent",
      record: {
        id: record.id,
        name: record.name,
        alive: record.alive !== false,
        birthDay: typeof record.birthDay === "number" ? record.birthDay : 0,
        deathDay: typeof record.deathDay === "number" ? record.deathDay : null,
        homeSettlementId: typeof record.homeSettlementId === "string" ? record.homeSettlementId : null,
        polityId: typeof record.polityId === "string" ? record.polityId : null,
        beliefId: typeof record.beliefId === "string" ? record.beliefId : null,
        beliefConviction: typeof record.beliefConviction === "number" ? record.beliefConviction : 0,
        parentIds: stringList(record.parentIds),
        childIds: stringList(record.childIds),
        generation: typeof record.generation === "number" ? record.generation : 0,
        needs: numericRecord(record.needs),
        inventory: numericRecord(record.inventory),
        capabilities: stringList(record.capabilities),
        influence: typeof record.influence === "number" ? record.influence : 0,
        mind: {
          goals,
          commitments: Array.isArray(mind?.commitments) ? mind.commitments.flatMap((rawCommitment) => {
            const commitment = objectRecord(rawCommitment);
            return commitment && typeof commitment.id === "string" && typeof commitment.targetId === "string" ? [{
              id: commitment.id,
              kind: typeof commitment.kind === "string" ? commitment.kind : "agreement",
              targetId: commitment.targetId,
              strength: typeof commitment.strength === "number" ? commitment.strength : 0,
              createdAt: typeof commitment.createdAt === "number" ? commitment.createdAt : 0,
              expiresAt: typeof commitment.expiresAt === "number" ? commitment.expiresAt : null,
            }] : [];
          }) : [],
          observations: Array.isArray(mind?.observations) ? mind.observations.slice(-12).flatMap((rawObservation) => {
            const observation = objectRecord(rawObservation);
            return observation && typeof observation.id === "string" && typeof observation.subjectId === "string" ? [{
              id: observation.id,
              kind: typeof observation.kind === "string" ? observation.kind : "knowledge",
              subjectId: observation.subjectId,
              learnedAt: typeof observation.learnedAt === "number" ? observation.learnedAt : 0,
              confidence: typeof observation.confidence === "number" ? observation.confidence : 0,
              facts: factRecord(observation.facts),
            }] : [];
          }) : [],
          contextualLearning: Array.isArray(mind?.contextualLearning) ? mind.contextualLearning.slice(-12).flatMap((rawLearning) => {
            const learning = objectRecord(rawLearning);
            return learning && typeof learning.key === "string" ? [{
              key: learning.key,
              attempts: typeof learning.attempts === "number" ? learning.attempts : 0,
              expectedValue: typeof learning.expectedValue === "number" ? learning.expectedValue : 0,
              lastUpdatedAt: typeof learning.lastUpdatedAt === "number" ? learning.lastUpdatedAt : 0,
            }] : [];
          }) : [],
          learnedDriveWeights: numericRecord(mind?.learnedDriveWeights),
          advisory: (() => {
            const advisory = objectRecord(mind?.advisory);
            if (!advisory || advisory.source !== "openai") return null;
            return {
              source: "openai" as const,
              receivedAt: typeof advisory.receivedAt === "number" ? advisory.receivedAt : 0,
              expiresAt: typeof advisory.expiresAt === "number" ? advisory.expiresAt : 0,
              goalKind: typeof advisory.goalKind === "string" ? advisory.goalKind : "survive",
              proposalIntent: typeof advisory.proposalIntent === "string" ? advisory.proposalIntent : null,
              targetId: typeof advisory.targetId === "string" ? advisory.targetId : null,
              reasoning: typeof advisory.reasoning === "string" ? advisory.reasoning : "No reasoning was retained.",
              status: typeof advisory.status === "string" ? advisory.status : "expired",
              provenance: typeof advisory.provenance === "string" ? advisory.provenance : "External counsel record",
            };
          })(),
          lastDecision: decision ? {
            decidedAt: typeof decision.decidedAt === "number" ? decision.decidedAt : 0,
            chosenGoalId: typeof decision.chosenGoalId === "string" ? decision.chosenGoalId : "",
            knownFactIds: stringList(decision.knownFactIds),
            explanation: typeof decision.explanation === "string" ? decision.explanation : "No explanation was recorded.",
            uncertainty: typeof decision.uncertainty === "number" ? decision.uncertainty : 0,
            alternatives,
          } : null,
        },
      },
    };
  }
  if (kind === "settlement") {
    return {
      kind: "settlement",
      record: {
        id: record.id,
        name: record.name,
        polityId: typeof record.polityId === "string" ? record.polityId : "",
        founderIds: stringList(record.founderIds),
        residentIds: stringList(record.residentIds),
        stocks: numericRecord(record.stocks),
        facilities: numericRecord(record.facilities),
        capabilities: stringList(record.capabilities),
        knownResourceSiteIds: stringList(record.knownResourceSiteIds),
        projectIds: stringList(record.projectIds),
        createdAt: typeof record.createdAt === "number" ? record.createdAt : 0,
      },
    };
  }
  if (kind === "civilization") {
    return {
      kind: "civilization",
      record: {
        id: record.id,
        name: record.name,
        settlementIds: stringList(record.settlementIds),
        citizenIds: stringList(record.citizenIds),
        institutionIds: stringList(record.institutionIds),
        beliefIds: stringList(record.beliefIds),
        leaderId: typeof record.leaderId === "string" ? record.leaderId : null,
        createdAt: typeof record.createdAt === "number" ? record.createdAt : 0,
      },
    };
  }
  return null;
}

function mapViewport(current: PlanetSnapshot, viewport: ApiViewport, sync?: RegionsResponse["sync"]): PlanetSnapshot {
  const longitudeSize = longitudeSpan(viewport.bounds.west, viewport.bounds.east) / (viewport.zoom < 3 ? 48 : viewport.zoom < 7 ? 36 : 28);
  const latitudeSize = (viewport.bounds.north - viewport.bounds.south) / Math.max(12, Math.round((viewport.zoom < 3 ? 48 : viewport.zoom < 7 ? 36 : 28) / 2));
  const terrain: PlanetTerrainCell[] = viewport.terrain.map((sample) => ({
    longitude: sample.coordinate.longitude,
    latitude: sample.coordinate.latitude,
    longitudeSize,
    latitudeSize,
    elevation: sample.elevation,
    temperature: sample.temperature,
    rainfall: sample.rainfall,
    fertility: sample.fertility,
    biome: sample.biome,
    ocean: sample.ocean,
  }));
  const civilizations: PlanetCivilization[] = viewport.polities.map((polity) => {
    const politySettlements = viewport.settlements.filter((settlement) => settlement.polityId === polity.id);
    const capabilityCount = new Set(politySettlements.flatMap((settlement) => settlement.capabilities)).size;
    return {
      id: polity.id,
      name: polity.name,
      color: polity.color,
      population: polity.population,
      beliefId: polity.dominantBeliefId,
      technologyScore: Math.min(100, capabilityCount * 3.5),
      prosperity: Math.min(100, 24 + Math.log2(polity.population + 1) * 7),
      summary: `${polity.settlements} autonomous settlement${polity.settlements === 1 ? "" : "s"} held together by proposals, relationships, and shared knowledge.`,
    };
  });
  const settlements: PlanetSettlement[] = viewport.settlements.map((settlement) => ({
    id: settlement.id,
    name: settlement.name,
    civilizationId: settlement.polityId,
    population: settlement.population,
    kind: settlementKind(settlement.population),
    prosperity: Math.min(100, 24 + settlement.capabilities.length * 3.2),
    capabilities: settlement.capabilities,
    longitude: settlement.coordinate.longitude,
    latitude: settlement.coordinate.latitude,
  }));
  const beliefs: PlanetBelief[] = viewport.beliefs.map((belief) => ({
    id: belief.id,
    name: belief.name,
    color: belief.color,
    followers: belief.adherents,
    values: belief.coreValues ?? [],
    tenets: belief.tenets ?? [],
    kind: belief.kind,
    founderAgentId: belief.founderAgentId,
    founderName: belief.founderName,
    originSettlementId: belief.originSettlementId,
    originName: belief.originName,
    originDay: belief.originDay,
    parentBeliefId: belief.parentBeliefId,
    active: belief.active,
    reforms: belief.reforms ?? [],
    schisms: belief.schisms ?? 0,
  }));
  const resources: PlanetResourceSite[] = viewport.resourceSites.map((resource) => ({
    id: resource.id,
    name: humanize(resource.resourceId),
    family: resourceFamily(resource.family ?? "strategic_mineral"),
    abundance: resource.capacity > 0 ? Math.round(resource.reserve / resource.capacity * 100) : 0,
    discoveredBy: resource.discoveredBy ?? (resource.discovered ? ["archived observer"] : []),
    finite: resource.renewability ? resource.renewability === "finite" : true,
    longitude: resource.coordinate.longitude,
    latitude: resource.coordinate.latitude,
  }));
  const resourceCells: PlanetResourceCell[] = viewport.resourceCells.map((cell) => {
    const families: Record<string, number> = {};
    for (const [family, count] of Object.entries(cell.resources)) {
      const mapped = resourceFamily(family);
      families[mapped] = (families[mapped] ?? 0) + count;
    }
    return { longitude: cell.coordinate.longitude, latitude: cell.coordinate.latitude, families };
  });
  const agentClusters: PlanetAgentCluster[] = viewport.agentClusters.map((cluster) => ({
    longitude: cluster.coordinate.longitude,
    latitude: cluster.coordinate.latitude,
    count: cluster.count,
    civilizationIds: cluster.polityIds,
  }));
  const disputes = new Map(viewport.disputes.map((dispute) => [dispute.cellKey, dispute.claimantPolityIds]));
  const territoryCells: PlanetTerritoryCell[] = viewport.territory.map((cell) => ({
    cellKey: cell.cellKey,
    civilizationId: cell.ownerPolityId,
    contestedBy: disputes.get(cell.cellKey) ?? [],
  }));

  const capitalByPolity = new Map<string, PlanetSettlement>();
  for (const settlement of settlements) {
    const currentCapital = capitalByPolity.get(settlement.civilizationId);
    if (!currentCapital || settlement.population > currentCapital.population) capitalByPolity.set(settlement.civilizationId, settlement);
  }
  const relations: PlanetRelation[] = viewport.diplomacy
    .filter((proposal) => proposal.polityId && proposal.counterpartyIds[0] && proposal.status !== "rejected" && proposal.status !== "expired")
    .map((proposal) => ({
      id: proposal.id,
      fromCivilizationId: proposal.polityId!,
      toCivilizationId: proposal.counterpartyIds[0],
      kind: proposal.kind === "peace" ? "truce" : proposal.kind === "alliance" ? "alliance" : "trade",
      strength: typeof proposal.trust === "number" ? clamp((proposal.trust + 100) / 2, 0, 100) : proposal.status === "accepted" ? 65 : 45,
      trust: proposal.trust,
      tension: proposal.tension,
      sinceDay: typeof proposal.changedAt === "number" ? Math.floor(proposal.changedAt / 60) + 1 : undefined,
    }));
  const conflicts: PlanetConflict[] = viewport.conflicts
    .filter((proposal) => proposal.polityId && proposal.counterpartyIds[0] && proposal.status !== "rejected" && proposal.status !== "expired")
    .map((proposal) => {
      const location = capitalByPolity.get(proposal.polityId!);
      return {
        id: proposal.id,
        name: proposal.title,
        attackerCivilizationId: proposal.polityId!,
        defenderCivilizationId: proposal.counterpartyIds[0],
        longitude: location?.longitude ?? 0,
        latitude: location?.latitude ?? 0,
        intensity: typeof proposal.tension === "number" ? clamp(proposal.tension, 0, 100) : 50,
        tension: proposal.tension,
        sinceDay: typeof proposal.changedAt === "number" ? Math.floor(proposal.changedAt / 60) + 1 : viewport.day,
      };
    });

  return {
    ...current,
    meta: {
      ...current.meta,
      day: viewport.day,
      revision: viewport.revision,
      status: (sync?.catchUpPendingSeconds ?? 0) > 35 ? "catching-up" : "live",
      dataMode: "live",
      notice: "Shared Era III planet",
    },
    civilizations,
    beliefs,
    settlements,
    agents: viewport.agents
      .filter((agent) => agent.alive !== false)
      .map((agent) => mapCompactAgent(agent, viewport.day)),
    resources,
    relations,
    conflicts,
    chronicle: viewport.chronicle.map((entry) => ({
      id: entry.id,
      day: entry.day,
      category: chronicleCategory(entry.type),
      title: entry.title,
      summary: entry.summary,
      actorIds: entry.actorIds ?? [],
      entityIds: entry.entityIds ?? [],
      causalEventIds: entry.causalEventIds ?? [],
      entity: entry.actorIds?.[0] ? { kind: "agent", id: entry.actorIds[0] } : undefined,
    })),
    terrain,
    agentClusters,
    resourceCells,
    territoryCells,
    beliefInfluence: (viewport.beliefInfluence ?? []).map((cell) => ({
      beliefId: cell.beliefId,
      adherents: cell.adherents,
      influence: cell.influence,
      longitude: cell.coordinate.longitude,
      latitude: cell.coordinate.latitude,
    })),
    coverage: {
      sampled: Object.values(viewport.truncated ?? {}).some(Boolean),
      shown: {
        agents: viewport.agents.length,
        settlements: viewport.settlements.length,
        terrain: viewport.terrain.length,
        resourceSites: viewport.resourceSites.length,
        resourceCells: viewport.resourceCells.length,
        chronicle: viewport.chronicle.length,
      },
      available: viewport.sourceCounts ?? {},
    },
  };
}

export class PlanetHttpAdapter implements PlanetExperienceAdapter {
  readonly mode = "live" as const;
  private snapshot = copyEmptySnapshot();
  private readonly listeners = new Set<(snapshot: PlanetSnapshot) => void>();
  private camera: PlanetCamera = { longitude: -12, latitude: 16, zoom: 0.86 };
  private regionRevision: number | null = null;
  private requestedViewKey = "";
  private appliedViewKey = "";
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private viewportTimer: ReturnType<typeof setTimeout> | null = null;
  private regionController: AbortController | null = null;
  private started = false;

  constructor(private readonly baseUrl = "") {}

  getSnapshot() {
    return this.snapshot;
  }

  subscribe(listener: (snapshot: PlanetSnapshot) => void) {
    this.listeners.add(listener);
    if (!this.started) this.start();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.stop();
    };
  }

  setViewport(camera: PlanetCamera) {
    this.camera = camera;
    const bounds = cameraBounds(camera);
    this.requestedViewKey = `${bounds.west.toFixed(3)}:${bounds.east.toFixed(3)}:${bounds.south.toFixed(3)}:${bounds.north.toFixed(3)}:${camera.zoom.toFixed(2)}`;
    if (this.viewportTimer) clearTimeout(this.viewportTimer);
    this.viewportTimer = setTimeout(() => void this.fetchRegion(), 160);
  }

  async searchAgents(query: string, limit: number) {
    try {
      const search = new URLSearchParams({ query: query.trim(), cursor: "0", limit: String(Math.max(1, Math.min(40, limit))) });
      const response = await fetch(`${this.baseUrl}/api/planet/search?${search}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`Search failed with ${response.status}`);
      const payload = await response.json() as { agents?: CompactApiAgent[] };
      return (payload.agents ?? []).map((agent) => mapCompactAgent(agent, this.snapshot.meta.day));
    } catch {
      const normalized = query.trim().toLocaleLowerCase();
      return this.snapshot.agents
        .filter((agent) => !normalized || agent.name.toLocaleLowerCase().includes(normalized))
        .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id))
        .slice(0, limit);
    }
  }

  async loadEntity(selection: PlanetEntitySelection, signal?: AbortSignal) {
    if (selection.kind === "resource") return null;
    const apiKind = selection.kind === "civilization" ? "polity" : selection.kind;
    const response = await fetch(
      `${this.baseUrl}/api/planet/entities/${apiKind}/${encodeURIComponent(selection.id)}`,
      { cache: "no-store", signal },
    );
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Entity failed with ${response.status}`);
    const payload = await response.json() as { entity?: unknown };
    return normalizeEntityDetail(selection.kind, payload.entity);
  }

  dispose() {
    this.stop();
    this.listeners.clear();
  }

  private emit(snapshot: PlanetSnapshot) {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }

  private start() {
    if (typeof window === "undefined") return;
    this.started = true;
    void this.refresh();
    this.pollTimer = setInterval(() => void this.refresh(), 5_000);
  }

  private stop() {
    this.started = false;
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.viewportTimer) clearTimeout(this.viewportTimer);
    this.pollTimer = null;
    this.viewportTimer = null;
    this.regionController?.abort();
    this.regionController = null;
  }

  private async refresh() {
    await this.fetchSummary();
    await this.fetchRegion();
  }

  private async fetchSummary() {
    try {
      const response = await fetch(`${this.baseUrl}/api/planet/summary`, { cache: "no-store" });
      if (!response.ok) throw new Error(`Summary failed with ${response.status}`);
      const payload = await response.json() as SummaryResponse;
      const seedLabel = payload.world?.seedLabel ?? "wildgrid-era-3";
      const pending = payload.sync?.catchUpPendingSeconds ?? 0;
      this.emit({
        ...this.snapshot,
        aiCounsel: payload.aiCounsel,
        observation: payload.summary?.observation ?? this.snapshot.observation,
        meta: {
          ...this.snapshot.meta,
          seed: hashSeed(seedLabel),
          day: payload.summary?.day ?? payload.world?.day ?? this.snapshot.meta.day,
          population: payload.summary?.livingAgents ?? this.snapshot.meta.population,
          revision: payload.sync?.revision ?? payload.world?.revision ?? this.snapshot.meta.revision,
          status: pending > 35 ? "catching-up" : "live",
          dataMode: "live",
          notice: "Shared Era III planet",
          continuity: {
            persistent: payload.sync?.persistent ?? true,
            serverTimeMs: payload.sync?.serverTime ?? Date.now(),
            simulatedAtMs: payload.sync?.simulatedAtMs ?? Date.now(),
            pendingSeconds: pending,
            caughtUp: payload.sync?.caughtUp ?? pending <= 0,
          },
        },
      });
    } catch {
      this.useFallback("The shared planet is temporarily unreachable. Showing a clearly labeled deterministic preview while reconnecting.");
    }
  }

  private async fetchRegion() {
    const bounds = cameraBounds(this.camera);
    const viewKey = this.requestedViewKey || `${bounds.west}:${bounds.east}:${bounds.south}:${bounds.north}:${this.camera.zoom}`;
    this.regionController?.abort();
    const controller = new AbortController();
    this.regionController = controller;
    const params = new URLSearchParams({
      west: String(bounds.west),
      east: String(bounds.east),
      south: String(bounds.south),
      north: String(bounds.north),
      zoom: String(this.camera.zoom),
    });
    if (this.appliedViewKey === viewKey && this.regionRevision !== null) params.set("sinceRevision", String(this.regionRevision));
    try {
      const response = await fetch(`${this.baseUrl}/api/planet/regions?${params}`, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error(`Viewport failed with ${response.status}`);
      const payload = await response.json() as RegionsResponse;
      if (payload.unchanged) return;
      if (!payload.viewport) throw new Error("Viewport response was empty");
      this.regionRevision = payload.viewport.revision;
      this.appliedViewKey = viewKey;
      this.emit(mapViewport(this.snapshot, payload.viewport, payload.sync));
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      this.useFallback("This region is temporarily unreachable. Showing a clearly labeled deterministic preview while reconnecting.");
    }
  }

  private useFallback(notice: string) {
    if (this.snapshot.meta.dataMode === "sample") {
      this.emit({ ...this.snapshot, meta: { ...this.snapshot.meta, status: "offline", notice } });
      return;
    }
    const fallback = createSamplePlanetAdapter().getSnapshot();
    this.emit({ ...fallback, meta: { ...fallback.meta, status: "offline", dataMode: "sample", notice } });
  }
}

export function createPlanetHttpAdapter(baseUrl = ""): PlanetExperienceAdapter {
  return new PlanetHttpAdapter(baseUrl);
}
