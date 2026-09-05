import {
  CAPABILITY_CATALOG,
  getCapabilityDefinition,
  getResourceDefinition,
  RESOURCE_CATALOG,
} from "./catalog";
import {
  coordinateChunkKey,
  generatePlanetChunk,
  greatCircleDistanceKm,
  normalizeCoordinate,
  normalizeLongitude,
  sampleTerrain,
  territoryCellKey,
  TERRITORY_CELL_DEGREES,
} from "./geography";
import {
  advanceInvention,
  createCompositionalInvention,
  discoverResourcesInChunk,
  extractResource,
  nextReferenceCapability,
} from "./economy";
import { decideOnProposal, resolveProposal, submitProposal } from "./governance";
import { considerBeliefAdoption, considerBeliefFormation, reformBelief } from "./beliefs";
import {
  createAgentMind,
  deliberateAgent,
  learnFromGoalOutcome,
  rememberObservation,
  validateAgentMind,
} from "./mind";
import { deterministicBetween, deterministicIndex, deterministicUnit, seedToUint32, stableId } from "./random";
import type {
  AdvanceOptions,
  AdvanceResult,
  AgentGoal,
  GeographicBounds,
  GoalKind,
  PlanetAgent,
  PlanetCoordinate,
  PlanetHistoryEvent,
  PlanetHistoryEventType,
  PlanetSummary,
  PlanetViewportSnapshot,
  PlanetWorldOptions,
  PlanetWorldState,
  PolityState,
  ProposalKind,
  RegionIndexEntry,
  ScheduledEvent,
  SeedInput,
  SettlementState,
} from "./types";

export const PLANET_SCHEMA_VERSION = 3 as const;
export const PLANET_CATALOG_VERSION = "era-3-catalog-v1" as const;
export const DEFAULT_PLANET_SEED = "wildgrid-era-3";
export const PLANET_DAY_SECONDS = 60;
export const MAX_PLANET_AGENTS = 10_000;
export const DEFAULT_PLANET_AGENTS = 10;
export const DEFAULT_PLANET_SETTLEMENTS = 10;
export const MAX_PLANET_HISTORY_EVENTS = 5_000;
export const MAX_VIEWPORT_AGENTS = 1_000;
export const MAX_VIEWPORT_SETTLEMENTS = 500;

const FOUNDATIONAL_CAPABILITIES = ["field_observation", "fire_control", "basic_tools", "sustainable_harvesting"];
const FIRST_NAMES = [
  "Ari", "Bela", "Cala", "Daro", "Eli", "Fara", "Galen", "Hana", "Ilan", "Jora",
  "Kavi", "Lina", "Mara", "Niko", "Orin", "Pera", "Quin", "Rhea", "Sami", "Tala",
  "Uma", "Vero", "Wren", "Xara", "Yori", "Zena", "Aven", "Bryn", "Ciro", "Dena",
];
const LAST_NAMES = [
  "Alder", "Brook", "Cairn", "Dawn", "Ember", "Field", "Grove", "Harbor", "Isle", "Juniper",
  "Keel", "Lark", "Moss", "North", "Oak", "Pine", "Quill", "Reed", "Stone", "Thorn",
  "Umber", "Vale", "Willow", "Yarrow", "Zephyr", "Ash", "Birch", "Cove", "Drift", "Ever",
];
const PLACE_PREFIXES = [
  "Aster", "Bright", "Cedar", "Dawn", "Ember", "Fern", "Gale", "High", "Iris", "Juniper",
  "Kestrel", "Lumen", "Moss", "North", "Oak", "Peregrine", "Quartz", "River", "Stone", "Thistle",
];
const PLACE_SUFFIXES = ["Haven", "Reach", "Crossing", "Vale", "Watch", "Field", "Harbor", "Rise", "Gate", "Rest"];

interface RuntimeIndexes {
  agents: Map<string, PlanetAgent>;
  settlements: Map<string, SettlementState>;
  polities: Map<string, PolityState>;
}

const RUNTIME_INDEXES = new WeakMap<PlanetWorldState, RuntimeIndexes>();

function runtimeIndexes(world: PlanetWorldState): RuntimeIndexes {
  let indexes = RUNTIME_INDEXES.get(world);
  if (!indexes) {
    indexes = {
      agents: new Map(world.agents.map((agent) => [agent.id, agent])),
      settlements: new Map(world.settlements.map((settlement) => [settlement.id, settlement])),
      polities: new Map(world.polities.map((polity) => [polity.id, polity])),
    };
    RUNTIME_INDEXES.set(world, indexes);
  }
  return indexes;
}

function findAgent(world: PlanetWorldState, id: string | null | undefined): PlanetAgent | undefined {
  return id ? runtimeIndexes(world).agents.get(id) : undefined;
}

function findSettlement(world: PlanetWorldState, id: string | null | undefined): SettlementState | undefined {
  return id ? runtimeIndexes(world).settlements.get(id) : undefined;
}

function findPolity(world: PlanetWorldState, id: string | null | undefined): PolityState | undefined {
  return id ? runtimeIndexes(world).polities.get(id) : undefined;
}

function eventCompare(left: ScheduledEvent, right: ScheduledEvent): number {
  return left.at - right.at || left.sequence - right.sequence || left.id.localeCompare(right.id);
}

function heapPush(heap: ScheduledEvent[], event: ScheduledEvent): void {
  heap.push(event);
  let index = heap.length - 1;
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (eventCompare(heap[parent], heap[index]) <= 0) break;
    [heap[parent], heap[index]] = [heap[index], heap[parent]];
    index = parent;
  }
}

function heapPop(heap: ScheduledEvent[]): ScheduledEvent | undefined {
  if (heap.length === 0) return undefined;
  const first = heap[0];
  const last = heap.pop()!;
  if (heap.length > 0) {
    heap[0] = last;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;
      if (left < heap.length && eventCompare(heap[left], heap[smallest]) < 0) smallest = left;
      if (right < heap.length && eventCompare(heap[right], heap[smallest]) < 0) smallest = right;
      if (smallest === index) break;
      [heap[index], heap[smallest]] = [heap[smallest], heap[index]];
      index = smallest;
    }
  }
  return first;
}

function heapify(events: ScheduledEvent[]): void {
  const ordered = [...events].sort(eventCompare);
  events.length = 0;
  for (const event of ordered) heapPush(events, event);
}

function schedule(
  world: PlanetWorldState,
  kind: ScheduledEvent["kind"],
  entityId: string,
  at: number,
  token: number,
): void {
  const sequence = world.nextIds.event++;
  heapPush(world.scheduler, {
    id: `scheduled-${sequence}`,
    at,
    sequence,
    kind,
    entityId,
    token,
  });
}

function historyFingerprint(type: PlanetHistoryEventType, title: string, actorIds: string[]): string {
  return `${type}:${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}:${[...actorIds].sort().join(",")}`;
}

export function recordPlanetHistory(
  world: PlanetWorldState,
  input: Omit<PlanetHistoryEvent, "id" | "day" | "fingerprint"> & { fingerprint?: string },
): PlanetHistoryEvent {
  const sequence = world.nextIds.history++;
  const event: PlanetHistoryEvent = {
    ...input,
    id: `history-${sequence}`,
    day: Math.floor(input.at / PLANET_DAY_SECONDS) + 1,
    fingerprint: input.fingerprint ?? historyFingerprint(input.type, input.title, input.actorIds),
  };
  world.history.push(event);
  if (world.history.length > MAX_PLANET_HISTORY_EVENTS) {
    world.history.splice(0, world.history.length - MAX_PLANET_HISTORY_EVENTS);
  }
  return event;
}

function nextName(seed: number, index: number, used: Set<string>): string {
  const first = FIRST_NAMES[deterministicIndex(seed, FIRST_NAMES.length, "first", index)];
  const last = LAST_NAMES[deterministicIndex(seed, LAST_NAMES.length, "last", index)];
  const base = `${first} ${last}`;
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let suffix = (index + 1).toString(36).toUpperCase();
  let name = `${base} ${suffix}`;
  while (used.has(name)) {
    suffix = `${suffix}A`;
    name = `${base} ${suffix}`;
  }
  used.add(name);
  return name;
}

function placeName(seed: number, index: number): string {
  const prefix = PLACE_PREFIXES[deterministicIndex(seed, PLACE_PREFIXES.length, "place-prefix", index)];
  const suffix = PLACE_SUFFIXES[deterministicIndex(seed, PLACE_SUFFIXES.length, "place-suffix", index)];
  return `${prefix}${suffix}`;
}

function findLandCoordinate(seed: number, index: number): PlanetCoordinate {
  for (let attempt = 0; attempt < 1_000; attempt += 1) {
    const longitude = deterministicBetween(seed, -179.5, 179.5, "settlement-longitude", index, attempt);
    const latitude = deterministicBetween(seed, -62, 68, "settlement-latitude", index, attempt);
    const x = ((longitude + 180) / 360) * 8_192;
    const y = ((90 - latitude) / 180) * 4_096;
    const terrain = sampleTerrain(seed, x, y);
    if (!terrain.ocean && terrain.fertility > 0.18 && terrain.elevation < 0.82) return { longitude, latitude };
  }
  return { longitude: normalizeLongitude(index * 137.508), latitude: 0 };
}

function jitterCoordinate(seed: number, home: PlanetCoordinate, index: number): PlanetCoordinate {
  return normalizeCoordinate({
    longitude: home.longitude + deterministicBetween(seed, -0.16, 0.16, "agent-lon", index),
    latitude: home.latitude + deterministicBetween(seed, -0.12, 0.12, "agent-lat", index),
  });
}

function addRegionEntity(world: PlanetWorldState, coordinate: PlanetCoordinate, kind: "agent" | "settlement", id: string): void {
  const key = coordinateChunkKey(coordinate);
  const entry = world.regionIndex[key] ?? { agentIds: [], settlementIds: [] } satisfies RegionIndexEntry;
  const list = kind === "agent" ? entry.agentIds : entry.settlementIds;
  if (!list.includes(id)) list.push(id);
  world.regionIndex[key] = entry;
}

function moveRegionAgent(world: PlanetWorldState, agent: PlanetAgent, coordinate: PlanetCoordinate): void {
  const oldKey = coordinateChunkKey(agent.coordinate);
  const next = normalizeCoordinate(coordinate);
  const newKey = coordinateChunkKey(next);
  if (oldKey !== newKey) {
    const oldEntry = world.regionIndex[oldKey];
    if (oldEntry) oldEntry.agentIds = oldEntry.agentIds.filter((id) => id !== agent.id);
    addRegionEntity(world, next, "agent", agent.id);
  }
  agent.coordinate = next;
}

function createSettlement(seed: number, index: number): SettlementState {
  const coordinate = findLandCoordinate(seed, index);
  return {
    id: `settlement-${index + 1}`,
    name: placeName(seed, index),
    lastRenameDay: -1_000,
    nameHistory: [],
    coordinate,
    polityId: `polity-${index + 1}`,
    founderIds: [],
    residentIds: [],
    stocks: { clean_water: 80, preserved_food: 60, hardwood: 25, clay: 20 },
    facilities: { hearth: 1, workshop: 1, shelter: 2 },
    knownResourceSiteIds: [],
    capabilities: [...FOUNDATIONAL_CAPABILITIES],
    knowledgeEvidence: {},
    projectIds: [],
    createdAt: 0,
  };
}

function createPolity(settlement: SettlementState): PolityState {
  return {
    id: settlement.polityId,
    name: `${settlement.name} Commons`,
    lastRenameDay: -1_000,
    nameHistory: [],
    settlementIds: [settlement.id],
    citizenIds: [],
    institutionIds: [],
    beliefIds: [],
    leaderId: null,
    createdAt: 0,
  };
}

export function createPlanetWorld(
  seedInput: SeedInput = DEFAULT_PLANET_SEED,
  options: PlanetWorldOptions = {},
): PlanetWorldState {
  const seed = seedToUint32(seedInput);
  const initialAgentCount = Math.max(1, Math.min(MAX_PLANET_AGENTS, Math.floor(options.initialAgentCount ?? DEFAULT_PLANET_AGENTS)));
  const initialSettlementCount = Math.max(
    1,
    Math.min(initialAgentCount, 256, Math.floor(options.initialSettlementCount ?? Math.min(DEFAULT_PLANET_SETTLEMENTS, initialAgentCount))),
  );
  const settlements = Array.from({ length: initialSettlementCount }, (_, index) => createSettlement(seed, index));
  const polities = settlements.map(createPolity);
  const world: PlanetWorldState = {
    schemaVersion: PLANET_SCHEMA_VERSION,
    seed,
    seedLabel: String(seedInput),
    time: 0,
    day: 1,
    revision: 1,
    agents: [],
    settlements,
    polities,
    beliefs: [],
    institutions: [],
    proposals: [],
    diplomacy: {},
    projects: [],
    territoryOwners: {},
    territoryDisputes: {},
    modifiedResourceSites: {},
    regionIndex: {},
    scheduler: [],
    history: [],
    stats: { livingAgents: initialAgentCount, peakAgents: initialAgentCount, discoveries: 0, inventions: 0, proposals: 0, processedEvents: 0 },
    nextIds: { agent: initialAgentCount + 1, settlement: initialSettlementCount + 1, polity: initialSettlementCount + 1, proposal: 1, project: 1, event: 1, history: 1, belief: 1 },
  };
  const usedNames = new Set<string>();
  for (let index = 0; index < initialAgentCount; index += 1) {
    const settlement = settlements[index % settlements.length];
    const agent: PlanetAgent = {
      id: `agent-${String(index + 1).padStart(5, "0")}`,
      name: nextName(seed, index, usedNames),
      lastRenameDay: -1_000,
      nameHistory: [],
      alive: true,
      birthDay: -20,
      deathDay: null,
      coordinate: jitterCoordinate(seed, settlement.coordinate, index),
      homeSettlementId: settlement.id,
      polityId: settlement.polityId,
      beliefId: null,
      beliefConviction: 0,
      parentIds: [],
      childIds: [],
      generation: 0,
      lastReproductionDay: -1_000,
      needs: { health: 100, nutrition: 82, hydration: 82, rest: 90, safety: 85 },
      inventory: {},
      capabilities: [...FOUNDATIONAL_CAPABILITIES],
      influence: 1,
      mind: createAgentMind(),
      lastWakeAt: 0,
      nextWakeAt: deterministicBetween(seed, 5, 50, "first-wake", index),
      scheduleToken: 1,
    };
    rememberObservation(agent, {
      id: stableId("observation", seed, agent.id, settlement.id),
      kind: "settlement",
      subjectId: settlement.id,
      learnedAt: 0,
      coordinate: { ...settlement.coordinate },
      confidence: 1,
      facts: { name: settlement.name, home: true },
    });
    world.agents.push(agent);
    settlement.residentIds.push(agent.id);
    if (settlement.founderIds.length < 3) settlement.founderIds.push(agent.id);
    polities[index % polities.length].citizenIds.push(agent.id);
    addRegionEntity(world, agent.coordinate, "agent", agent.id);
    schedule(world, "agent_wake", agent.id, agent.nextWakeAt, agent.scheduleToken);
  }
  for (const polity of polities) polity.leaderId = polity.citizenIds[0] ?? null;
  for (const settlement of settlements) {
    addRegionEntity(world, settlement.coordinate, "settlement", settlement.id);
    claimTerritory(world, settlement.polityId, [settlement.coordinate]);
  }
  schedule(world, "ecology", "planet", PLANET_DAY_SECONDS, 1);
  recordPlanetHistory(world, {
    at: 0,
    type: "world_started",
    title: "Era III began",
    summary: `${initialAgentCount.toLocaleString()} named people began in ${initialSettlementCount} independent camps on an unexplored planet.`,
    actorIds: world.agents.slice(0, 10).map(({ id }) => id),
    entityIds: settlements.map(({ id }) => id),
    coordinate: null,
    importance: 100,
    causalEventIds: [],
  });
  return world;
}

export interface TerritoryClaimResult {
  claimed: string[];
  retained: string[];
  contested: string[];
}

export function claimTerritory(
  world: PlanetWorldState,
  polityId: string,
  coordinates: PlanetCoordinate[],
): TerritoryClaimResult {
  if (!world.polities.some(({ id }) => id === polityId)) return { claimed: [], retained: [], contested: [] };
  const result: TerritoryClaimResult = { claimed: [], retained: [], contested: [] };
  for (const coordinate of coordinates) {
    const cellKey = territoryCellKey(coordinate);
    const owner = world.territoryOwners[cellKey];
    if (!owner) {
      world.territoryOwners[cellKey] = polityId;
      result.claimed.push(cellKey);
      recordPlanetHistory(world, {
        at: world.time,
        type: "territory_claim",
        title: "Territory claimed",
        summary: `${findPolity(world, polityId)?.name ?? polityId} established an exclusive claim.`,
        actorIds: [],
        entityIds: [polityId],
        coordinate: normalizeCoordinate(coordinate),
        importance: 18,
        causalEventIds: [],
      });
    } else if (owner === polityId) {
      result.retained.push(cellKey);
    } else {
      const dispute = world.territoryDisputes[cellKey] ?? {
        cellKey,
        ownerPolityId: owner,
        claimantPolityIds: [],
        startedAt: world.time,
      };
      if (!dispute.claimantPolityIds.includes(polityId)) dispute.claimantPolityIds.push(polityId);
      dispute.claimantPolityIds.sort();
      world.territoryDisputes[cellKey] = dispute;
      result.contested.push(cellKey);
      recordPlanetHistory(world, {
        at: world.time,
        type: "territory_contested",
        title: "Border contested",
        summary: `${polityId} disputed ${owner}'s claim without overlapping its sovereign ownership.`,
        actorIds: [],
        entityIds: [owner, polityId],
        coordinate: normalizeCoordinate(coordinate),
        importance: 42,
        causalEventIds: [],
      });
    }
  }
  if (result.claimed.length || result.contested.length) world.revision += 1;
  return result;
}

function copySettlementResourceKnowledge(world: PlanetWorldState, agent: PlanetAgent, settlement: SettlementState): void {
  for (const siteId of settlement.knownResourceSiteIds.slice(0, 8)) {
    const site = world.modifiedResourceSites[siteId];
    if (!site) continue;
    rememberObservation(agent, {
      id: stableId("observation", world.seed, agent.id, site.id),
      kind: "resource",
      subjectId: site.id,
      learnedAt: world.time,
      coordinate: { ...site.coordinate },
      confidence: 0.8,
      facts: { resourceId: site.resourceId, reserveEstimate: Math.round(site.reserve / 100) * 100 },
    });
  }
}

function consumeSettlementSupply(agent: PlanetAgent, settlement: SettlementState | undefined, need: "hydration" | "nutrition"): boolean {
  if (!settlement) return false;
  const sources = need === "hydration"
    ? ["clean_water", "freshwater_spring", "surface_water", "aquifer", "glacier_ice"]
    : ["preserved_food", "wild_grain", "edible_tubers", "orchard_fruit", "berries", "wild_legumes", "tree_nuts", "game_animals", "grazing_herds", "marine_fish", "freshwater_fish"];
  const source = sources.find((id) => (settlement.stocks[id] ?? 0) >= 1);
  if (!source) return false;
  settlement.stocks[source] -= 1;
  agent.needs[need] = Math.min(100, agent.needs[need] + 28);
  return true;
}

function completeReferenceResearch(world: PlanetWorldState, agent: PlanetAgent, settlement: SettlementState): boolean {
  const target = nextReferenceCapability(agent, settlement);
  if (!target) return false;
  const definition = getCapabilityDefinition(target);
  if (!definition) return false;
  settlement.knowledgeEvidence[target] = (settlement.knowledgeEvidence[target] ?? 0) + 1 + (agent.mind.skills.research ?? 0) * 0.1;
  agent.mind.skills.research = Math.min(10, (agent.mind.skills.research ?? 0) + 0.06);
  if (settlement.knowledgeEvidence[target] < definition.complexity * 4) return true;
  if (!settlement.capabilities.includes(target)) settlement.capabilities.push(target);
  if (!agent.capabilities.includes(target)) agent.capabilities.push(target);
  recordPlanetHistory(world, {
    at: world.time,
    type: "invention",
    title: `${definition.name} established`,
    summary: `${agent.name} converted accumulated evidence into a practiced capability at ${settlement.name}.`,
    actorIds: [agent.id],
    entityIds: [settlement.id, target],
    coordinate: { ...settlement.coordinate },
    importance: 55 + definition.complexity * 2,
    causalEventIds: [],
  });
  world.stats.inventions += 1;
  return true;
}

function executeGoal(world: PlanetWorldState, agent: PlanetAgent, goal: AgentGoal): number {
  const settlement = findSettlement(world, agent.homeSettlementId);
  if (goal.purpose === "secure_water" || goal.purpose === "secure_food") {
    const need = goal.purpose === "secure_water" ? "hydration" : "nutrition";
    if (consumeSettlementSupply(agent, settlement, need)) return 0.9;
    const observation = agent.mind.observations.find(
      ({ kind, subjectId }) => kind === "resource" && subjectId === goal.targetId,
    );
    if (observation) {
      const result = extractResource(world, agent.id, observation.subjectId, 2);
      if (result.ok) {
        consumeSettlementSupply(agent, settlement, need);
        return 0.65;
      }
    }
    return -0.35;
  }
  if (goal.purpose === "explore") {
    const direction = deterministicUnit(world.seed, agent.id, agent.mind.decisionSequence, "explore-direction") * Math.PI * 2;
    moveRegionAgent(world, agent, {
      longitude: agent.coordinate.longitude + Math.cos(direction) * 0.8,
      latitude: agent.coordinate.latitude + Math.sin(direction) * 0.55,
    });
    const before = agent.mind.observations.length;
    discoverResourcesInChunk(world, agent.id);
    return agent.mind.observations.length > before ? 0.8 : -0.05;
  }
  if (goal.purpose === "research" && settlement) {
    if (completeReferenceResearch(world, agent, settlement)) {
      maybeProposeResearch(world, agent, settlement);
      return 0.5;
    }
    const material = agent.mind.observations.find(({ kind }) => kind === "resource")?.facts.resourceId;
    const process = agent.capabilities.find((id) => id !== "field_observation");
    if (typeof material === "string" && process) {
      const active = world.projects.find(({ sponsorAgentId, status }) =>
        sponsorAgentId === agent.id && !["institutionalized", "failed"].includes(status),
      );
      const project = active ?? createCompositionalInvention(world, agent.id, {
        purpose: `improve_${material}`,
        materialIds: [material],
        processIds: [process],
      });
      if (project) {
        const prior = project.status;
        advanceInvention(world, project.id, agent.id);
        if (project.status === "institutionalized" && prior !== project.status) {
          recordPlanetHistory(world, {
            at: world.time,
            type: "invention",
            title: project.name,
            summary: `${agent.name}'s experiments became a repeatable local capability.`,
            actorIds: [agent.id],
            entityIds: [project.id, project.generatedCapabilityId],
            coordinate: { ...agent.coordinate },
            importance: 58,
            causalEventIds: [],
          });
        }
        return 0.55;
      }
    }
    return -0.12;
  }
  if (goal.purpose === "defend") {
    agent.needs.safety = Math.min(100, agent.needs.safety + 8);
    return 0.25;
  }
  if (goal.purpose === "prosper" && settlement) {
    settlement.stocks.hardwood = (settlement.stocks.hardwood ?? 0) + 0.4;
    agent.influence = Math.min(100, agent.influence + 0.05);
    return 0.2;
  }
  return 0;
}

function maybeProposeResearch(world: PlanetWorldState, agent: PlanetAgent, settlement: SettlementState): void {
  const hasOpen = world.proposals.some(({ sponsorAgentId, kind, status }) =>
    sponsorAgentId === agent.id && kind === "research" && status === "open",
  );
  if (hasOpen || deterministicUnit(world.seed, agent.id, agent.mind.decisionSequence, "propose-research") > 0.035) return;
  const partnerId = settlement.residentIds.find((id) => id !== agent.id);
  const proposal = submitProposal(world, agent.id, {
    kind: "research",
    title: `Investigate ${nextReferenceCapability(agent, settlement)?.replaceAll("_", " ") ?? "a new local method"}`,
    requiredDecisionAgentIds: partnerId ? [agent.id, partnerId] : [agent.id],
    polityId: settlement.polityId,
    payload: { benefit: 35, cost: 15 },
  });
  if (!proposal) return;
  decideOnProposal(world, proposal.id, agent.id);
  if (partnerId) decideOnProposal(world, proposal.id, partnerId);
  if (proposal.status === "accepted") applyAcceptedProposal(world, proposal.id);
  recordPlanetHistory(world, {
    at: world.time,
    type: "proposal",
    title: proposal.title,
    summary: `${agent.name} sponsored a named research proposal; ${proposal.decisions.length} participants recorded independent choices.`,
    actorIds: [agent.id, ...(partnerId ? [partnerId] : [])],
    entityIds: [proposal.id, settlement.id],
    coordinate: { ...settlement.coordinate },
    importance: 25,
    causalEventIds: [],
  });
}

export function diplomacyKey(leftPolityId: string, rightPolityId: string): string {
  return [leftPolityId, rightPolityId].sort().join(":");
}

function settlementSupportCapacity(settlement: SettlementState): number {
  return 8 + (settlement.facilities.shelter ?? 0) * 8 + (settlement.facilities.sanitation ?? 0) * 4;
}

function availableNecessities(settlement: SettlementState): { food: number; water: number } {
  const sum = (ids: string[]) => ids.reduce((total, id) => total + (settlement.stocks[id] ?? 0), 0);
  return {
    food: sum(["preserved_food", "wild_grain", "edible_tubers", "orchard_fruit", "berries", "wild_legumes", "tree_nuts", "game_animals", "grazing_herds", "marine_fish", "freshwater_fish"]),
    water: sum(["clean_water", "freshwater_spring", "surface_water", "aquifer", "glacier_ice"]),
  };
}

function isAdult(world: PlanetWorldState, agent: PlanetAgent): boolean {
  return world.day - agent.birthDay >= 18;
}

export function getPlanetAgentAge(world: PlanetWorldState, agent: PlanetAgent): number {
  return Math.max(0, Math.floor((agent.deathDay ?? world.day) - agent.birthDay));
}

function isReproductiveAdult(world: PlanetWorldState, agent: PlanetAgent): boolean {
  const age = getPlanetAgentAge(world, agent);
  return age >= 18 && age <= 52;
}

function naturalLifespan(world: PlanetWorldState, agent: PlanetAgent): number {
  const settlement = findSettlement(world, agent.homeSettlementId);
  const medicalCapabilities = new Set([
    "sanitation",
    "epidemiology",
    "vaccination",
    "germ_theory",
    "surgery",
    "antibiotics",
    "genomics",
    "regenerative_medicine",
  ]);
  const healthExtension = Math.min(
    14,
    (settlement?.capabilities.filter((id) => medicalCapabilities.has(id)).length ?? 0) * 2,
  );
  return 68
    + Math.floor(deterministicUnit(world.seed, agent.id, "natural-lifespan") * 25)
    + healthExtension;
}

function removeFromArray(values: string[], id: string): void {
  const index = values.indexOf(id);
  if (index >= 0) values.splice(index, 1);
}

function relocateAgent(world: PlanetWorldState, agent: PlanetAgent, settlement: SettlementState): void {
  const oldSettlement = findSettlement(world, agent.homeSettlementId);
  const oldPolity = findPolity(world, agent.polityId);
  if (oldSettlement) removeFromArray(oldSettlement.residentIds, agent.id);
  if (oldPolity) removeFromArray(oldPolity.citizenIds, agent.id);
  if (!settlement.residentIds.includes(agent.id)) settlement.residentIds.push(agent.id);
  const polity = findPolity(world, settlement.polityId);
  if (polity && !polity.citizenIds.includes(agent.id)) polity.citizenIds.push(agent.id);
  agent.homeSettlementId = settlement.id;
  agent.polityId = settlement.polityId;
  moveRegionAgent(world, agent, jitterCoordinate(world.seed, settlement.coordinate, world.nextIds.event + Number(agent.id.replace(/\D/g, ""))));
}

function uniqueChildName(world: PlanetWorldState, ordinal: number): string {
  const used = new Set(world.agents.map(({ name }) => name));
  return nextName(world.seed, ordinal + 20_000, used);
}

export function createOffspring(
  world: PlanetWorldState,
  parentAId: string,
  parentBId: string,
): PlanetAgent | null {
  if (world.stats.livingAgents >= MAX_PLANET_AGENTS) return null;
  const parentA = findAgent(world, parentAId);
  const parentB = findAgent(world, parentBId);
  if (!parentA || !parentB || parentA.id === parentB.id || !parentA.alive || !parentB.alive) return null;
  if (!isReproductiveAdult(world, parentA) || !isReproductiveAdult(world, parentB)) return null;
  if (parentA.homeSettlementId !== parentB.homeSettlementId || !parentA.homeSettlementId) return null;
  if (world.day - parentA.lastReproductionDay < 5 || world.day - parentB.lastReproductionDay < 5) return null;
  if (parentA.parentIds.includes(parentB.id) || parentB.parentIds.includes(parentA.id)) return null;
  const settlement = findSettlement(world, parentA.homeSettlementId);
  if (!settlement || settlement.residentIds.length >= settlementSupportCapacity(settlement)) return null;
  const necessities = availableNecessities(settlement);
  if (necessities.food < Math.max(6, settlement.residentIds.length * 0.5)
    || necessities.water < Math.max(6, settlement.residentIds.length * 0.5)) return null;
  // Reserve the household support before creating a persistent person.
  const foodId = ["preserved_food", "wild_grain", "edible_tubers", "orchard_fruit", "berries", "wild_legumes", "tree_nuts", "game_animals", "grazing_herds", "marine_fish", "freshwater_fish"]
    .find((id) => (settlement.stocks[id] ?? 0) >= 4);
  const waterId = ["clean_water", "freshwater_spring", "surface_water", "aquifer", "glacier_ice"]
    .find((id) => (settlement.stocks[id] ?? 0) >= 4);
  if (!foodId || !waterId) return null;
  settlement.stocks[foodId] -= 4;
  settlement.stocks[waterId] -= 4;
  const ordinal = world.nextIds.agent++;
  const child: PlanetAgent = {
    id: `agent-${String(ordinal).padStart(5, "0")}`,
    name: uniqueChildName(world, ordinal),
    lastRenameDay: -1_000,
    nameHistory: [],
    alive: true,
    birthDay: world.day,
    deathDay: null,
    coordinate: jitterCoordinate(world.seed, settlement.coordinate, ordinal),
    homeSettlementId: settlement.id,
    polityId: settlement.polityId,
    beliefId: null,
    beliefConviction: 0,
    parentIds: [parentA.id, parentB.id].sort(),
    childIds: [],
    generation: Math.max(parentA.generation, parentB.generation) + 1,
    lastReproductionDay: -1_000,
    needs: { health: 100, nutrition: 88, hydration: 88, rest: 95, safety: 90 },
    inventory: {},
    capabilities: [...FOUNDATIONAL_CAPABILITIES],
    influence: 0.5,
    mind: createAgentMind(),
    lastWakeAt: world.time,
    // Dependents wake daily for household support but do not make independent
    // strategic choices until adulthood.
    nextWakeAt: world.time + PLANET_DAY_SECONDS,
    scheduleToken: 1,
  };
  rememberObservation(child, {
    id: stableId("observation", world.seed, child.id, settlement.id),
    kind: "settlement",
    subjectId: settlement.id,
    learnedAt: world.time,
    coordinate: { ...settlement.coordinate },
    confidence: 1,
    facts: { name: settlement.name, home: true },
  });
  world.agents.push(child);
  runtimeIndexes(world).agents.set(child.id, child);
  settlement.residentIds.push(child.id);
  const polity = findPolity(world, settlement.polityId);
  if (polity) polity.citizenIds.push(child.id);
  parentA.childIds.push(child.id);
  parentB.childIds.push(child.id);
  if (!parentA.mind.commitments.some(({ kind, targetId }) => kind === "family" && targetId === parentB.id)) {
    parentA.mind.commitments.push({ id: stableId("commitment", world.seed, parentA.id, parentB.id), kind: "family", targetId: parentB.id, strength: 0.8, createdAt: world.time, expiresAt: null });
  }
  if (!parentB.mind.commitments.some(({ kind, targetId }) => kind === "family" && targetId === parentA.id)) {
    parentB.mind.commitments.push({ id: stableId("commitment", world.seed, parentB.id, parentA.id), kind: "family", targetId: parentA.id, strength: 0.8, createdAt: world.time, expiresAt: null });
  }
  parentA.lastReproductionDay = world.day;
  parentB.lastReproductionDay = world.day;
  addRegionEntity(world, child.coordinate, "agent", child.id);
  schedule(world, "agent_wake", child.id, child.nextWakeAt, child.scheduleToken);
  world.stats.livingAgents += 1;
  world.stats.peakAgents = Math.max(world.stats.peakAgents, world.stats.livingAgents);
  recordPlanetHistory(world, {
    at: world.time,
    type: "birth",
    title: `${child.name} was born`,
    summary: `${parentA.name} and ${parentB.name} mutually committed resources to raise a new generation at ${settlement.name}.`,
    actorIds: [parentA.id, parentB.id, child.id],
    entityIds: [settlement.id],
    coordinate: { ...settlement.coordinate },
    importance: 20,
    causalEventIds: [],
    fingerprint: `birth:${settlement.id}:generation-${child.generation}`,
  });
  world.revision += 1;
  return child;
}

export function foundSettlementFromAgents(
  world: PlanetWorldState,
  founderIds: string[],
  independent = true,
): SettlementState | null {
  const founders = [...new Set(founderIds)]
    .map((id) => findAgent(world, id))
    .filter((agent): agent is PlanetAgent => Boolean(agent?.alive));
  if (founders.length === 0) return null;
  const sponsor = founders[0];
  const ordinal = world.nextIds.settlement++;
  let coordinate: PlanetCoordinate | null = null;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const angle = deterministicUnit(world.seed, "new-settlement", ordinal, attempt) * Math.PI * 2;
    const candidate = normalizeCoordinate({
      longitude: sponsor.coordinate.longitude + Math.cos(angle) * (2.5 + attempt * 0.12),
      latitude: sponsor.coordinate.latitude + Math.sin(angle) * (1.8 + attempt * 0.08),
    });
    const logicalX = ((candidate.longitude + 180) / 360) * 8_192;
    const logicalY = ((90 - candidate.latitude) / 180) * 4_096;
    const terrain = sampleTerrain(world.seed, logicalX, logicalY);
    if (!terrain.ocean && !world.territoryOwners[territoryCellKey(candidate)]) {
      coordinate = candidate;
      break;
    }
  }
  if (!coordinate) return null;
  const polityId = independent ? `polity-${world.nextIds.polity++}` : sponsor.polityId ?? `polity-${world.nextIds.polity++}`;
  const settlement: SettlementState = {
    id: `settlement-${ordinal}`,
    name: placeName(world.seed, ordinal + 100),
    lastRenameDay: -1_000,
    nameHistory: [],
    coordinate,
    polityId,
    founderIds: founders.map(({ id }) => id),
    residentIds: [],
    stocks: { clean_water: 18, preserved_food: 15, hardwood: 8, clay: 4 },
    facilities: { hearth: 1, shelter: 1 },
    knownResourceSiteIds: [],
    // A breakaway carries what its founders personally know, not the former
    // polity's entire institutional knowledge base.
    capabilities: [...new Set(founders.flatMap(({ capabilities }) => capabilities))],
    knowledgeEvidence: {},
    projectIds: [],
    createdAt: world.time,
  };
  world.settlements.push(settlement);
  runtimeIndexes(world).settlements.set(settlement.id, settlement);
  if (independent || !world.polities.some(({ id }) => id === polityId)) {
    const newPolity: PolityState = {
      id: polityId,
      name: `${settlement.name} Assembly`,
      lastRenameDay: -1_000,
      nameHistory: [],
      settlementIds: [settlement.id],
      citizenIds: [],
      institutionIds: [],
      beliefIds: [],
      leaderId: sponsor.id,
      createdAt: world.time,
    };
    world.polities.push(newPolity);
    runtimeIndexes(world).polities.set(newPolity.id, newPolity);
  } else {
    findPolity(world, polityId)?.settlementIds.push(settlement.id);
  }
  addRegionEntity(world, settlement.coordinate, "settlement", settlement.id);
  for (const founder of founders) relocateAgent(world, founder, settlement);
  claimTerritory(world, polityId, [settlement.coordinate]);
  recordPlanetHistory(world, {
    at: world.time,
    type: "settlement_founded",
    title: `${settlement.name} was founded`,
    summary: `${founders.map(({ name }) => name).join(" and ")} left to establish ${independent ? "an independent settlement" : "a new settlement"}.`,
    actorIds: founders.map(({ id }) => id),
    entityIds: [settlement.id, polityId],
    coordinate: { ...settlement.coordinate },
    importance: 66,
    causalEventIds: [],
  });
  world.revision += 1;
  return settlement;
}

/** Apply the concrete consequence once; proposal payload records idempotence. */
export function applyAcceptedProposal(world: PlanetWorldState, proposalId: string): boolean {
  const proposal = world.proposals.find(({ id }) => id === proposalId);
  if (!proposal || proposal.status !== "accepted" || proposal.payload.executed === true) return false;
  const sponsor = findAgent(world, proposal.sponsorAgentId);
  if (!sponsor?.alive) return false;
  const proposalCauseIds = world.history
    .filter(({ type, entityIds }) => type === "proposal" && entityIds.includes(proposal.id))
    .slice(-1)
    .map(({ id }) => id);
  let changed = false;
  if (proposal.kind === "family") {
    const partnerId = String(proposal.payload.partnerId ?? proposal.requiredDecisionAgentIds.find((id) => id !== sponsor.id) ?? "");
    changed = Boolean(createOffspring(world, sponsor.id, partnerId));
  } else if (proposal.kind === "migration") {
    if (proposal.payload.foundSettlement === true) {
      const founded = foundSettlementFromAgents(world, proposal.requiredDecisionAgentIds, proposal.payload.independent !== false);
      changed = Boolean(founded);
      if (founded) {
        const foundingEvent = [...world.history].reverse().find(({ type, entityIds }) =>
          type === "settlement_founded" && entityIds.includes(founded.id),
        );
        if (foundingEvent) {
          foundingEvent.causalEventIds = proposalCauseIds;
          if (proposal.payload.breakaway === true) {
            recordPlanetHistory(world, {
              at: world.time, type: "breakaway", title: `${founded.name} broke away`,
              summary: `${sponsor.name} and supporting adults separated from their former polity after a mutually accepted plan.`,
              actorIds: proposal.requiredDecisionAgentIds, entityIds: [founded.id, founded.polityId, proposal.id],
              coordinate: { ...founded.coordinate }, importance: 78, causalEventIds: proposalCauseIds,
            });
          }
        }
      }
    } else {
      const destination = findSettlement(world, String(proposal.payload.targetSettlementId ?? ""));
      if (destination) {
        relocateAgent(world, sponsor, destination);
        recordPlanetHistory(world, {
          at: world.time, type: "migration", title: `${sponsor.name} migrated`,
          summary: `${sponsor.name} joined ${destination.name} after its residents accepted the move.`,
          actorIds: proposal.requiredDecisionAgentIds, entityIds: [destination.id, proposal.id],
          coordinate: { ...destination.coordinate }, importance: 34, causalEventIds: proposalCauseIds,
        });
        changed = true;
      }
    }
  } else if (proposal.kind === "construction") {
    const settlement = findSettlement(world, String(proposal.payload.settlementId ?? sponsor.homeSettlementId ?? ""));
    const facility = String(proposal.payload.facility ?? "shelter");
    const cost = Math.max(1, Number(proposal.payload.cost ?? 6));
    if (settlement && (settlement.stocks.hardwood ?? 0) >= cost) {
      settlement.stocks.hardwood -= cost;
      settlement.facilities[facility] = (settlement.facilities[facility] ?? 0) + 1;
      recordPlanetHistory(world, {
        at: world.time, type: "construction", title: `${settlement.name} expanded ${facility.replaceAll("_", " ")}`,
        summary: `${sponsor.name}'s accepted proposal converted local stocks into a functioning facility.`,
        actorIds: proposal.requiredDecisionAgentIds, entityIds: [settlement.id, proposal.id],
        coordinate: { ...settlement.coordinate }, importance: 38, causalEventIds: proposalCauseIds,
      });
      changed = true;
    }
  } else if (proposal.kind === "trade") {
    const from = findSettlement(world, String(proposal.payload.fromSettlementId ?? ""));
    const to = findSettlement(world, String(proposal.payload.toSettlementId ?? ""));
    const resourceId = String(proposal.payload.resourceId ?? "preserved_food");
    const amount = Math.max(1, Number(proposal.payload.amount ?? 4));
    if (from && to && (from.stocks[resourceId] ?? 0) >= amount) {
      from.stocks[resourceId] -= amount;
      to.stocks[resourceId] = (to.stocks[resourceId] ?? 0) + amount;
      recordPlanetHistory(world, {
        at: world.time, type: "trade", title: `${from.name} and ${to.name} traded`,
        summary: `${amount} ${resourceId.replaceAll("_", " ")} moved by mutual agreement.`,
        actorIds: proposal.requiredDecisionAgentIds, entityIds: [from.id, to.id, proposal.id],
        coordinate: { ...to.coordinate }, importance: 40, causalEventIds: proposalCauseIds,
      });
      changed = true;
    }
  } else if (proposal.kind === "alliance" || proposal.kind === "war" || proposal.kind === "peace") {
    const polityIds = [sponsor.polityId, ...proposal.counterpartyIds]
      .filter((id): id is string => Boolean(id))
      .slice(0, 2);
    if (polityIds.length === 2 && polityIds[0] !== polityIds[1]) {
      const key = diplomacyKey(polityIds[0], polityIds[1]);
      const status = proposal.kind === "peace" ? "truce" : proposal.kind;
      world.diplomacy[key] = {
        key,
        polityIds: [...polityIds].sort() as [string, string],
        status,
        trust: status === "alliance" ? 65 : status === "truce" ? 30 : -60,
        tension: status === "war" ? 90 : status === "truce" ? 25 : 10,
        changedAt: world.time,
        proposalId: proposal.id,
      };
      if (status === "war") {
        sponsor.needs.safety = Math.max(0, sponsor.needs.safety - 20);
        const home = findSettlement(world, sponsor.homeSettlementId);
        if (home) home.stocks.preserved_food = Math.max(0, (home.stocks.preserved_food ?? 0) - 5);
      }
      recordPlanetHistory(world, {
        at: world.time, type: status === "truce" ? "peace" : status, title: proposal.title,
        summary: `${proposal.requiredDecisionAgentIds.length} named participants determined a new ${status} relationship.`,
        actorIds: proposal.requiredDecisionAgentIds, entityIds: [...polityIds, proposal.id],
        coordinate: { ...sponsor.coordinate }, importance: status === "war" ? 82 : 64, causalEventIds: proposalCauseIds,
      });
      changed = true;
    }
  } else if (proposal.kind === "leadership" && sponsor.polityId) {
    const polity = findPolity(world, sponsor.polityId);
    if (polity) {
      const former = polity.leaderId;
      polity.leaderId = sponsor.id;
      recordPlanetHistory(world, {
        at: world.time, type: "leadership_change", title: `${sponsor.name} became leader`,
        summary: `${proposal.title} replaced ${former ? findAgent(world, former)?.name ?? former : "an unfilled office"}.`,
        actorIds: proposal.requiredDecisionAgentIds, entityIds: [polity.id, proposal.id],
        coordinate: { ...sponsor.coordinate }, importance: 58, causalEventIds: proposalCauseIds,
      });
      changed = true;
    }
  } else if (proposal.kind === "belief_reform" && sponsor.beliefId) {
    changed = Boolean(reformBelief(world, sponsor.beliefId, sponsor.id, String(proposal.payload.addedValue ?? "Mutual survival"), null));
  } else if (proposal.kind === "research") {
    const settlement = findSettlement(world, sponsor.homeSettlementId);
    if (settlement) {
      completeReferenceResearch(world, sponsor, settlement);
      changed = true;
    }
  }
  proposal.payload.executed = true;
  if (changed) world.revision += 1;
  return changed;
}

function nearestOccupiedSettlement(world: PlanetWorldState, agent: PlanetAgent): SettlementState | null {
  return world.settlements
    .filter(({ id, residentIds }) => id !== agent.homeSettlementId && residentIds.length > 0)
    .sort((left, right) => greatCircleDistanceKm(agent.coordinate, left.coordinate) - greatCircleDistanceKm(agent.coordinate, right.coordinate) || left.id.localeCompare(right.id))[0] ?? null;
}

function sponsorAndResolve(world: PlanetWorldState, agent: PlanetAgent, input: Parameters<typeof submitProposal>[2]): boolean {
  const proposal = submitProposal(world, agent.id, input);
  if (!proposal) return false;
  recordPlanetHistory(world, {
    at: world.time,
    type: "proposal",
    title: proposal.title,
    summary: `${agent.name} sponsored a ${proposal.kind.replaceAll("_", " ")} proposal requiring ${proposal.requiredDecisionAgentIds.length} named decision-maker${proposal.requiredDecisionAgentIds.length === 1 ? "" : "s"}.`,
    actorIds: [agent.id],
    entityIds: [proposal.id, ...(proposal.polityId ? [proposal.polityId] : [])],
    coordinate: { ...agent.coordinate },
    importance: ["war", "peace", "alliance", "leadership"].includes(proposal.kind) ? 55 : 25,
    causalEventIds: [],
  });
  for (const voterId of proposal.requiredDecisionAgentIds) decideOnProposal(world, proposal.id, voterId);
  resolveProposal(world, proposal.id);
  if (proposal.status === "accepted") applyAcceptedProposal(world, proposal.id);
  return true;
}

/** Generate at most one circumstance-driven collective decision per wake. */
export function considerAutonomousProposal(world: PlanetWorldState, agentId: string): boolean {
  const agent = findAgent(world, agentId);
  const settlement = findSettlement(world, agent?.homeSettlementId);
  if (!agent?.alive || !settlement || !isAdult(world, agent)) return false;
  const counselIntent = agent.mind.advisory?.status === "accepted"
    && agent.mind.advisory.expiresAt > world.time
    ? agent.mind.advisory.proposalIntent
    : null;
  const counselBoost = (kind: ProposalKind, amount: number) =>
    counselIntent === kind ? amount : 0;
  if (world.proposals.some(({ sponsorAgentId, status }) => sponsorAgentId === agent.id && status === "open")) return false;
  if (settlement.residentIds.length === 1) {
    const destination = nearestOccupiedSettlement(world, agent);
    const host = destination && findAgent(world, destination.residentIds[0]);
    if (destination && host) {
      return sponsorAndResolve(world, agent, {
        kind: "migration", title: `${agent.name} seeks to join ${destination.name}`,
        requiredDecisionAgentIds: [agent.id, host.id], counterpartyIds: [destination.polityId],
        payload: { targetSettlementId: destination.id, benefit: 75, cost: 10 },
      });
    }
  }
  const adults = settlement.residentIds
    .map((id) => findAgent(world, id))
    .filter((candidate): candidate is PlanetAgent => Boolean(candidate?.alive && isAdult(world, candidate)));
  const necessities = availableNecessities(settlement);
  const learnedOutcomes = agent.mind.contextualLearning;
  const dissatisfaction = learnedOutcomes.length
    ? learnedOutcomes.reduce((sum, record) => sum + record.expectedValue, 0) / learnedOutcomes.length
    : 0;
  const supportLinkedAdult = adults.find((candidate) => candidate.id !== agent.id && (
    agent.childIds.includes(candidate.id)
    || agent.parentIds.includes(candidate.id)
    || agent.mind.commitments.some(({ targetId, strength }) => targetId === candidate.id && strength >= 0.55)
    || (agent.beliefId && candidate.beliefId === agent.beliefId)
  ));
  if (supportLinkedAdult && settlement.residentIds.length >= 4
    && (dissatisfaction < -0.08 || agent.needs.safety < 52)
    && deterministicUnit(world.seed, agent.id, world.day, agent.mind.decisionSequence, "breakaway") < 0.018 + counselBoost("migration", 0.08)) {
    return sponsorAndResolve(world, agent, {
      kind: "migration",
      title: `${agent.name} proposes a breakaway from ${world.polities.find(({ id }) => id === settlement.polityId)?.name ?? settlement.name}`,
      requiredDecisionAgentIds: [agent.id, supportLinkedAdult.id],
      payload: { foundSettlement: true, independent: true, breakaway: true, benefit: 72, cost: 24 },
    });
  }
  const partner = isReproductiveAdult(world, agent)
    ? adults.find((candidate) => candidate.id !== agent.id
    && isReproductiveAdult(world, candidate)
    && world.day - candidate.lastReproductionDay >= 5
    && !candidate.parentIds.includes(agent.id)
    && !agent.parentIds.includes(candidate.id))
    : undefined;
  if (partner && world.stats.livingAgents < MAX_PLANET_AGENTS
    && world.day - agent.lastReproductionDay >= 5
    && settlement.residentIds.length < settlementSupportCapacity(settlement)
    && necessities.food >= Math.max(6, settlement.residentIds.length * 0.5)
    && necessities.water >= Math.max(6, settlement.residentIds.length * 0.5)
    && deterministicUnit(world.seed, agent.id, world.day, agent.mind.decisionSequence, "family-proposal") < 0.92 + counselBoost("family", 0.08)) {
    return sponsorAndResolve(world, agent, {
      kind: "family", title: `${agent.name} and ${partner.name} consider raising a child`,
      requiredDecisionAgentIds: [agent.id, partner.id], payload: { partnerId: partner.id, benefit: 55, cost: 20 },
    });
  }
  const capacity = settlementSupportCapacity(settlement);
  if (settlement.residentIds.length >= capacity * 0.45 && adults.length >= 2
    && deterministicUnit(world.seed, agent.id, world.day, "expand-or-build") < 0.34 + counselBoost("migration", 0.2)) {
    const companion = adults.find(({ id }) => id !== agent.id)!;
    return sponsorAndResolve(world, agent, {
      kind: "migration", title: `${agent.name} proposes a new settlement`,
      requiredDecisionAgentIds: [agent.id, companion.id], payload: { foundSettlement: true, independent: true, benefit: 65, cost: 25 },
    });
  }
  if (settlement.residentIds.length >= capacity * 0.62 && (settlement.stocks.hardwood ?? 0) >= 6) {
    const leaderId = findPolity(world, settlement.polityId)?.leaderId;
    return sponsorAndResolve(world, agent, {
      kind: "construction", title: `${agent.name} proposes more shelter at ${settlement.name}`,
      requiredDecisionAgentIds: [agent.id, ...(leaderId && leaderId !== agent.id ? [leaderId] : [])],
      payload: { settlementId: settlement.id, facility: "shelter", cost: 6, benefit: 60 },
    });
  }
  const shortResource = necessities.food < settlement.residentIds.length * 2
    ? "preserved_food"
    : necessities.water < settlement.residentIds.length * 2 ? "clean_water" : null;
  if (shortResource) {
    const donor = world.settlements.find((candidate) => candidate.id !== settlement.id && (candidate.stocks[shortResource] ?? 0) > 20);
    const donorAgent = donor && findAgent(world, donor.residentIds[0]);
    if (donor && donorAgent) {
      return sponsorAndResolve(world, agent, {
        kind: "trade", title: `${settlement.name} requests ${shortResource.replaceAll("_", " ")}`,
        requiredDecisionAgentIds: [agent.id, donorAgent.id], counterpartyIds: [donor.polityId],
        payload: { fromSettlementId: donor.id, toSettlementId: settlement.id, resourceId: shortResource, amount: 8, benefit: 55, cost: 12 },
      });
    }
  }
  const polity = findPolity(world, agent.polityId);
  const leader = findAgent(world, polity?.leaderId);
  if (polity && leader && leader.id !== agent.id && agent.influence > leader.influence + 2
    && deterministicUnit(world.seed, agent.id, world.day, "leadership") < 0.04 + counselBoost("leadership", 0.12)) {
    return sponsorAndResolve(world, agent, {
      kind: "leadership", title: `${agent.name} challenges leadership through ${polity.name}`,
      requiredDecisionAgentIds: polity.citizenIds.filter((id) => world.agents.some((candidate) => candidate.id === id && candidate.alive)).slice(0, 7),
      payload: { benefit: 20, cost: 10 },
    });
  }
  const dispute = Object.values(world.territoryDisputes).find(({ ownerPolityId, claimantPolityIds }) =>
    ownerPolityId === agent.polityId || claimantPolityIds.includes(agent.polityId ?? ""),
  );
  if (dispute && agent.needs.safety > 55 && deterministicUnit(world.seed, agent.id, world.day, "war") < 0.025 + counselBoost("war", 0.08)) {
    const rivalId = dispute.ownerPolityId === agent.polityId ? dispute.claimantPolityIds[0] : dispute.ownerPolityId;
    const rival = findPolity(world, rivalId);
    const rivalLeader = findAgent(world, rival?.leaderId);
    if (rival && rivalLeader) return sponsorAndResolve(world, agent, {
      kind: "war", title: `${agent.name} calls for war over a contested border`,
      requiredDecisionAgentIds: [agent.id, ...(polity?.leaderId && polity.leaderId !== agent.id ? [polity.leaderId] : [])],
      counterpartyIds: [rival.id], payload: { benefit: 25, cost: 55 },
    });
  }
  const war = Object.values(world.diplomacy).find(({ status, polityIds }) => status === "war" && polityIds.includes(agent.polityId ?? ""));
  if (war && agent.needs.safety < 65) {
    const rivalId = war.polityIds.find((id) => id !== agent.polityId)!;
    const rivalLeader = findAgent(world, findPolity(world, rivalId)?.leaderId);
    if (rivalLeader) return sponsorAndResolve(world, agent, {
      kind: "peace", title: `${agent.name} seeks a truce`, requiredDecisionAgentIds: [agent.id, rivalLeader.id],
      counterpartyIds: [rivalId], payload: { benefit: 75, cost: 5 },
    });
  }
  if (agent.beliefId && agent.beliefConviction > 0.68
    && deterministicUnit(world.seed, agent.id, world.day, "belief-reform") < 0.015 + counselBoost("belief_reform", 0.12)) {
    return sponsorAndResolve(world, agent, {
      kind: "belief_reform", title: `${agent.name} proposes a reform`, requiredDecisionAgentIds: [agent.id],
      payload: { addedValue: "Mutual survival", benefit: 20, cost: 5 },
    });
  }
  if (world.day > 10 && polity && deterministicUnit(world.seed, agent.id, world.day, "alliance") < 0.008 + counselBoost("alliance", 0.1)) {
    const other = world.polities.find(({ id }) => id !== polity.id);
    const otherLeader = findAgent(world, other?.leaderId);
    if (other && otherLeader) return sponsorAndResolve(world, agent, {
      kind: "alliance", title: `${agent.name} offers mutual protection to ${other.name}`,
      requiredDecisionAgentIds: [agent.id, otherLeader.id], counterpartyIds: [other.id], payload: { benefit: 55, cost: 10 },
    });
  }
  return false;
}

function uniqueAutonomousName(world: PlanetWorldState, base: string, excludeId: string): string {
  const occupied = new Set([
    ...world.agents.filter(({ id }) => id !== excludeId).map(({ name }) => name),
    ...world.settlements.filter(({ id }) => id !== excludeId).map(({ name }) => name),
    ...world.polities.filter(({ id }) => id !== excludeId).map(({ name }) => name),
  ]);
  if (!occupied.has(base)) return base;
  let ordinal = 2;
  while (occupied.has(`${base} ${ordinal}`)) ordinal += 1;
  return `${base} ${ordinal}`;
}

function renameRecord<T extends { name: string; lastRenameDay: number; nameHistory: Array<{ day: number; previousName: string; newName: string; agentId: string; reason: string }> }>(
  entity: T,
  day: number,
  newName: string,
  agentId: string,
  reason: string,
): string {
  const previousName = entity.name;
  entity.name = newName;
  entity.lastRenameDay = day;
  entity.nameHistory.push({ day, previousName, newName, agentId, reason });
  if (entity.nameHistory.length > 8) entity.nameHistory.shift();
  return previousName;
}

/** Names are consequences of lived records; no identity style is assigned at birth. */
export function considerAutonomousRenaming(world: PlanetWorldState, agentId: string): boolean {
  const agent = findAgent(world, agentId);
  if (!agent?.alive || world.day < 30 || world.day - agent.lastRenameDay < 120) return false;
  const invention = [...world.projects].reverse().find(({ sponsorAgentId, status }) => sponsorAgentId === agent.id && status === "institutionalized");
  const founded = [...world.history].reverse().find(({ type, actorIds }) => type === "settlement_founded" && actorIds.includes(agent.id));
  const belief = world.beliefs.find(({ founderAgentId }) => founderAgentId === agent.id);
  const survivedHardship = agent.needs.health < 45
    || agent.mind.contextualLearning.some(({ expectedValue, attempts }) => attempts >= 2 && expectedValue < -0.35);
  const achievement = invention
    ? `${invention.materialIds[0]?.replaceAll("_", " ") ?? "method"} maker`
    : founded
      ? "settlement founder"
      : belief
        ? `${belief.name} founder`
        : survivedHardship
          ? "survivor"
          : (agent.mind.skills.research ?? 0) >= 2
            ? "researcher"
            : null;
  if (!achievement) return false;
  if (deterministicUnit(world.seed, agent.id, world.day, agent.mind.decisionSequence, "self-rename") >= 0.006) return false;
  const firstName = agent.name.split(" ")[0];
  const earnedWord = invention
    ? `${String(invention.materialIds[0] ?? "method").split("_")[0]}wright`
    : founded
      ? "Founder"
      : belief
        ? belief.name.split(" ")[0]
        : survivedHardship
          ? "Wayfarer"
          : "Scholar";
  const newName = uniqueAutonomousName(world, `${firstName} ${earnedWord.replace(/^./, (letter) => letter.toUpperCase())}`, agent.id);
  if (newName === agent.name) return false;
  const previousName = renameRecord(agent, world.day, newName, agent.id, `Self-chosen after becoming known as a ${achievement}.`);
  const cause = [...world.history].reverse().find(({ type, actorIds }) =>
    actorIds.includes(agent.id) && ["invention", "settlement_founded", "belief_founded"].includes(type),
  );
  recordPlanetHistory(world, {
    at: world.time, type: "agent_renamed", title: `${previousName} became ${newName}`,
    summary: `${newName} chose a name grounded in lived history as a ${achievement}.`,
    actorIds: [agent.id], entityIds: [agent.id], coordinate: { ...agent.coordinate }, importance: 36,
    causalEventIds: cause ? [cause.id] : [],
  });
  const polity = findPolity(world, agent.polityId);
  const settlement = findSettlement(world, agent.homeSettlementId);
  if (polity?.leaderId === agent.id && settlement && world.day - settlement.lastRenameDay >= 180
    && deterministicUnit(world.seed, settlement.id, world.day, "cultural-rename") < 0.18) {
    const culturalRoot = belief?.coreValues[0]?.split(" ")[0]
      ?? settlement.capabilities.at(-1)?.split("_")[0]
      ?? newName.split(" ").at(-1)
      ?? "Common";
    const settlementName = uniqueAutonomousName(world, `${culturalRoot.replace(/^./, (letter) => letter.toUpperCase())}${PLACE_SUFFIXES[deterministicIndex(world.seed, PLACE_SUFFIXES.length, settlement.id, world.day)]}`, settlement.id);
    const oldSettlementName = renameRecord(settlement, world.day, settlementName, agent.id, `Residents adopted a name reflecting ${culturalRoot}.`);
    recordPlanetHistory(world, {
      at: world.time, type: "settlement_renamed", title: `${oldSettlementName} became ${settlementName}`,
      summary: `${agent.name}'s community adopted a name reflecting its changed knowledge and culture.`,
      actorIds: [agent.id], entityIds: [settlement.id], coordinate: { ...settlement.coordinate }, importance: 45,
      causalEventIds: cause ? [cause.id] : [],
    });
    if (world.day - polity.lastRenameDay >= 180) {
      const polityName = uniqueAutonomousName(world, `${settlementName} ${polity.institutionIds.length > 0 ? "Union" : "Commons"}`, polity.id);
      const oldPolityName = renameRecord(polity, world.day, polityName, agent.id, `Political identity followed ${settlementName}'s cultural change.`);
      recordPlanetHistory(world, {
        at: world.time, type: "polity_renamed", title: `${oldPolityName} became ${polityName}`,
        summary: `The polity changed its public name without changing its stable identity or historical references.`,
        actorIds: [agent.id], entityIds: [polity.id, settlement.id], coordinate: { ...settlement.coordinate }, importance: 48,
        causalEventIds: cause ? [cause.id] : [],
      });
    }
  }
  world.revision += 1;
  return true;
}

function decayNeeds(agent: PlanetAgent, elapsed: number): void {
  const days = elapsed / PLANET_DAY_SECONDS;
  agent.needs.hydration = Math.max(0, agent.needs.hydration - days * 12);
  agent.needs.nutrition = Math.max(0, agent.needs.nutrition - days * 8);
  agent.needs.rest = Math.max(0, agent.needs.rest - days * 5);
  if (agent.needs.hydration === 0 || agent.needs.nutrition === 0) {
    agent.needs.health = Math.max(0, agent.needs.health - days * 15);
  }
}

function adaptiveWakeInterval(world: PlanetWorldState, agent: PlanetAgent, focused: Set<string>): number {
  const urgent = Math.min(agent.needs.hydration, agent.needs.nutrition, agent.needs.health, agent.needs.safety) < 30;
  if (urgent || focused.has(agent.id)) return deterministicBetween(world.seed, 12, 24, agent.id, agent.scheduleToken, "urgent-wake");
  const safe = Math.min(agent.needs.hydration, agent.needs.nutrition, agent.needs.health, agent.needs.safety) > 70;
  return safe
    ? deterministicBetween(world.seed, 120, 240, agent.id, agent.scheduleToken, "background-wake")
    : deterministicBetween(world.seed, 45, 90, agent.id, agent.scheduleToken, "normal-wake");
}

export function killPlanetAgent(
  world: PlanetWorldState,
  agentId: string,
  cause: "dehydration" | "starvation" | "violence" | "accident" | "natural causes" = "accident",
): boolean {
  const agent = findAgent(world, agentId);
  if (!agent?.alive) return false;
  agent.alive = false;
  agent.deathDay = world.day;
  agent.scheduleToken += 1;
  agent.nextWakeAt = Number.MAX_SAFE_INTEGER;
  const settlement = findSettlement(world, agent.homeSettlementId);
  if (settlement) removeFromArray(settlement.residentIds, agent.id);
  const polity = findPolity(world, agent.polityId);
  if (polity) {
    removeFromArray(polity.citizenIds, agent.id);
    if (polity.leaderId === agent.id) {
      polity.leaderId = polity.citizenIds
        .map((id) => findAgent(world, id))
        .filter((candidate): candidate is PlanetAgent => Boolean(candidate?.alive))
        .sort((left, right) => right.influence - left.influence || left.id.localeCompare(right.id))[0]?.id ?? null;
    }
  }
  if (agent.beliefId) {
    const belief = world.beliefs.find(({ id }) => id === agent.beliefId);
    if (belief) {
      removeFromArray(belief.adherentIds, agent.id);
      belief.influence = Math.max(0, belief.influence - agent.influence * agent.beliefConviction);
    }
  }
  const region = world.regionIndex[coordinateChunkKey(agent.coordinate)];
  if (region) removeFromArray(region.agentIds, agent.id);
  world.stats.livingAgents = Math.max(0, world.stats.livingAgents - 1);
  recordPlanetHistory(world, {
    at: world.time,
    type: "death",
    title: `${agent.name} died`,
    summary: `${agent.name} died from ${cause}${cause === "natural causes" ? ` at age ${getPlanetAgentAge(world, agent)}` : ""}; their unfinished plans will no longer receive scheduled turns.`,
    actorIds: [agent.id],
    entityIds: [...(agent.homeSettlementId ? [agent.homeSettlementId] : [])],
    coordinate: { ...agent.coordinate },
    importance: agent.influence > 20 ? 55 : 24,
    causalEventIds: [],
  });
  world.revision += 1;
  return true;
}

function processAgentWake(world: PlanetWorldState, event: ScheduledEvent, focused: Set<string>): void {
  const agent = findAgent(world, event.entityId);
  if (!agent || !agent.alive || event.token !== agent.scheduleToken) return;
  const age = getPlanetAgentAge(world, agent);
  if (age >= naturalLifespan(world, agent)) {
    killPlanetAgent(world, agent.id, "natural causes");
    return;
  }
  if (agent.mind.advisory?.status === "accepted" && agent.mind.advisory.expiresAt <= world.time) {
    agent.mind.advisory.status = "expired";
  }
  decayNeeds(agent, Math.max(0, world.time - agent.lastWakeAt));
  if (!isAdult(world, agent)) {
    const household = findSettlement(world, agent.homeSettlementId);
    const fed = consumeSettlementSupply(agent, household, "nutrition");
    const watered = consumeSettlementSupply(agent, household, "hydration");
    if (!fed || !watered) agent.needs.health = Math.max(0, agent.needs.health - 9);
    if (agent.needs.health <= 0) {
      killPlanetAgent(world, agent.id, !watered ? "dehydration" : "starvation");
      return;
    }
    agent.needs.rest = Math.min(100, agent.needs.rest + 18);
    agent.lastWakeAt = world.time;
    agent.scheduleToken += 1;
    agent.nextWakeAt = world.time + PLANET_DAY_SECONDS;
    schedule(world, "agent_wake", agent.id, agent.nextWakeAt, agent.scheduleToken);
    return;
  }
  if (agent.needs.health <= 0) {
    killPlanetAgent(world, agent.id, agent.needs.hydration <= 0 ? "dehydration" : "starvation");
    return;
  }
  const settlement = findSettlement(world, agent.homeSettlementId);
  const resourceKnowledge = agent.mind.observations.some(({ kind }) => kind === "resource");
  if (!resourceKnowledge && settlement) {
    if (settlement.knownResourceSiteIds.length > 0) copySettlementResourceKnowledge(world, agent, settlement);
    else if (settlement.residentIds[0] === agent.id) {
      const discoveries = discoverResourcesInChunk(world, agent.id);
      if (discoveries.length > 0) {
        recordPlanetHistory(world, {
          at: world.time,
          type: "discovery",
          title: `${settlement.name} surveyed its surroundings`,
          summary: `${agent.name} documented ${discoveries.length} local resources and shared their locations.`,
          actorIds: [agent.id],
          entityIds: [settlement.id, ...discoveries.slice(0, 4).map(({ id }) => id)],
          coordinate: { ...agent.coordinate },
          importance: 35,
          causalEventIds: [],
        });
      }
    }
  }
  const goal = deliberateAgent(world, agent);
  const outcome = executeGoal(world, agent, goal);
  goal.status = outcome >= 0 ? "complete" : "blocked";
  for (const planStep of goal.steps) planStep.status = outcome >= 0 ? "complete" : "failed";
  learnFromGoalOutcome(agent, goal, outcome, world.time);
  if (!agent.beliefId && deterministicUnit(world.seed, agent.id, agent.mind.decisionSequence, "belief-check") < 0.05) {
    const founded = considerBeliefFormation(world, agent.id);
    if (founded) {
      recordPlanetHistory(world, {
        at: world.time,
        type: "belief_founded",
        title: `${founded.name} emerged`,
        summary: `${agent.name} formed ${founded.kind.replaceAll("_", " ")} from learned experience: ${founded.coreValues.join(", ")}.`,
        actorIds: [agent.id],
        entityIds: [founded.id],
        coordinate: { ...agent.coordinate },
        importance: 58,
        causalEventIds: [],
      });
    } else {
      considerBeliefAdoption(world, agent.id);
    }
  }
  if (settlement?.residentIds.length === 1
    || deterministicUnit(world.seed, agent.id, agent.mind.decisionSequence, "social-check")
      < (world.stats.livingAgents < 100 ? 0.45 : 0.08)) {
    considerAutonomousProposal(world, agent.id);
  }
  considerAutonomousRenaming(world, agent.id);
  agent.lastWakeAt = world.time;
  agent.scheduleToken += 1;
  agent.nextWakeAt = world.time + adaptiveWakeInterval(world, agent, focused);
  schedule(world, "agent_wake", agent.id, agent.nextWakeAt, agent.scheduleToken);
}

function processEcology(world: PlanetWorldState, event: ScheduledEvent): void {
  for (const site of Object.values(world.modifiedResourceSites)) {
    const definition = getResourceDefinition(site.resourceId);
    const regeneration = definition?.yield.regenerationPerDay ?? 0;
    if (regeneration > 0) site.reserve = Math.min(site.capacity, site.reserve + regeneration);
  }
  for (const proposal of world.proposals) resolveProposal(world, proposal.id);
  for (const settlement of world.settlements) {
    const workers = settlement.residentIds
      .map((id) => findAgent(world, id))
      .filter((agent): agent is PlanetAgent => Boolean(agent?.alive && isAdult(world, agent)));
    if (workers.length === 0) continue;
    // Coarse regional production is attributed to an actual rotating worker;
    // individual cognition remains detailed when a person next wakes.
    const worker = workers[Math.floor(world.day) % workers.length];
    const foodGain = workers.length * (worker.capabilities.includes("sustainable_harvesting") ? 1.15 : 0.3);
    const waterGain = workers.length * (worker.capabilities.includes("water_treatment") ? 1.25 : 0.85);
    const stockCeiling = Math.max(30, settlementSupportCapacity(settlement) * 12);
    settlement.stocks.preserved_food = Math.min(stockCeiling, (settlement.stocks.preserved_food ?? 0) + foodGain);
    settlement.stocks.clean_water = Math.min(stockCeiling, (settlement.stocks.clean_water ?? 0) + waterGain);
    settlement.stocks.hardwood = Math.min(stockCeiling, (settlement.stocks.hardwood ?? 0) + workers.length * 0.18);
  }
  schedule(world, "ecology", "planet", event.at + PLANET_DAY_SECONDS, event.token + 1);
}

export function advancePlanet(
  world: PlanetWorldState,
  elapsedSeconds: number,
  options: AdvanceOptions = {},
): AdvanceResult {
  const elapsed = Math.max(0, Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0);
  const targetTime = world.time + elapsed;
  const maxEvents = Math.max(1, Math.floor(options.maxEvents ?? 50_000));
  const focused = new Set(options.focusedAgentIds ?? []);
  let processedEvents = 0;
  while (world.scheduler.length > 0 && world.scheduler[0].at <= targetTime && processedEvents < maxEvents) {
    const event = heapPop(world.scheduler)!;
    world.time = Math.max(world.time, event.at);
    world.day = Math.floor(world.time / PLANET_DAY_SECONDS) + 1;
    if (event.kind === "agent_wake") processAgentWake(world, event, focused);
    else if (event.kind === "ecology") processEcology(world, event);
    else if (event.kind === "proposal_expiry") resolveProposal(world, event.entityId);
    else if (event.kind === "project_review") {
      const project = world.projects.find(({ id }) => id === event.entityId);
      if (project) advanceInvention(world, project.id, project.sponsorAgentId);
    }
    processedEvents += 1;
  }
  const complete = world.scheduler.length === 0 || world.scheduler[0].at > targetTime;
  if (complete) {
    world.time = targetTime;
    world.day = Math.floor(world.time / PLANET_DAY_SECONDS) + 1;
  }
  for (const agent of world.agents) {
    if (agent.mind.advisory?.status === "accepted" && agent.mind.advisory.expiresAt <= world.time) {
      agent.mind.advisory.status = "expired";
    }
  }
  world.stats.processedEvents += processedEvents;
  return { processedEvents, reachedTime: world.time, targetTime, complete };
}

/** Mutating event-driven catch-up; all times in the result are simulation seconds. */
export function catchUpPlanet(
  world: PlanetWorldState,
  elapsedSeconds: number,
  options: AdvanceOptions = {},
): AdvanceResult {
  const targetTime = world.time + Math.max(0, elapsedSeconds);
  let processedEvents = 0;
  let complete = false;
  for (let batch = 0; batch < 64 && !complete; batch += 1) {
    const result = advancePlanet(world, Math.max(0, targetTime - world.time), options);
    processedEvents += result.processedEvents;
    complete = result.complete;
    if (result.processedEvents === 0 && !complete) break;
  }
  return { processedEvents, reachedTime: world.time, targetTime, complete };
}

export function getPlanetSummary(world: PlanetWorldState): PlanetSummary {
  return {
    schemaVersion: PLANET_SCHEMA_VERSION,
    seedLabel: world.seedLabel,
    day: world.day,
    revision: world.revision,
    livingAgents: world.stats.livingAgents,
    settlements: world.settlements.length,
    polities: world.polities.length,
    beliefs: world.beliefs.length,
    openProposals: world.proposals.filter(({ status }) => status === "open").length,
    activeProjects: world.projects.filter(({ status }) => !["institutionalized", "failed"].includes(status)).length,
  };
}

const COUNSEL_GOALS = new Set<GoalKind>([
  "secure_water", "secure_food", "defend", "explore", "research", "prosper",
]);
const COUNSEL_PROPOSALS = new Set<ProposalKind>([
  "family", "trade", "migration", "construction", "research", "law", "alliance", "war", "peace", "leadership", "belief_reform",
]);

export interface ExternalAgentCounselInput {
  agentId: string;
  goalKind: GoalKind;
  proposalIntent?: ProposalKind | null;
  targetId?: string | null;
  reasoning?: string;
}

export interface ExternalAgentCounselResult {
  acceptedAgentIds: string[];
  rejected: Array<{ agentId: string; reason: string }>;
}

/**
 * Narrow integration seam for optional model counsel. This records a short
 * suggestion for at most five currently influential people. It never executes
 * an action and cannot directly change needs, stocks, borders, or diplomacy.
 */
export function applyExternalAgentCounsel(
  world: PlanetWorldState,
  counsel: readonly ExternalAgentCounselInput[],
): ExternalAgentCounselResult {
  const result: ExternalAgentCounselResult = { acceptedAgentIds: [], rejected: [] };
  const topIds = new Set(world.agents
    .filter(({ alive }) => alive)
    .sort((left, right) => right.influence - left.influence || left.id.localeCompare(right.id))
    .slice(0, 5)
    .map(({ id }) => id));
  const seen = new Set<string>();
  for (const suggestion of counsel.slice(0, 5)) {
    const agent = findAgent(world, suggestion.agentId);
    const reject = (reason: string) => result.rejected.push({ agentId: suggestion.agentId, reason });
    if (seen.has(suggestion.agentId)) {
      reject("Duplicate agent counsel was ignored.");
      continue;
    }
    seen.add(suggestion.agentId);
    if (!agent?.alive) {
      reject("Agent is not living.");
      continue;
    }
    if (!topIds.has(agent.id)) {
      reject("Agent is not currently among the five most influential living agents.");
      continue;
    }
    if (!COUNSEL_GOALS.has(suggestion.goalKind)) {
      reject("Goal is not an actionable bounded planner goal.");
      continue;
    }
    if (suggestion.proposalIntent && !COUNSEL_PROPOSALS.has(suggestion.proposalIntent)) {
      reject("Proposal intent is unknown.");
      continue;
    }
    const targetId = suggestion.targetId ?? null;
    const targetKnown = !targetId
      || targetId === agent.id
      || targetId === agent.homeSettlementId
      || targetId === agent.polityId
      || agent.mind.observations.some(({ subjectId }) => subjectId === targetId);
    if (!targetKnown) {
      reject("Target is outside the agent's local knowledge.");
      continue;
    }
    const advisoryId = stableId("advisory", world.seed, agent.id, world.time, suggestion.goalKind, targetId ?? "none");
    agent.mind.advisory = {
      id: advisoryId,
      source: "openai",
      receivedAt: world.time,
      expiresAt: world.time + PLANET_DAY_SECONDS * 2,
      goalKind: suggestion.goalKind,
      proposalIntent: suggestion.proposalIntent ?? null,
      targetId,
      reasoning: String(suggestion.reasoning ?? "Consider this option.").slice(0, 240),
      status: "accepted",
      provenance: "Optional OpenAI-generated counsel; not an agent thought, command, or claim of consciousness.",
    };
    recordPlanetHistory(world, {
      at: world.time,
      type: "external_counsel",
      title: `${agent.name} received outside counsel`,
      summary: `A bounded OpenAI suggestion to consider ${suggestion.goalKind.replaceAll("_", " ")} was recorded separately from the agent's own deliberation.`,
      actorIds: [agent.id],
      entityIds: [agent.id, advisoryId],
      coordinate: { ...agent.coordinate },
      importance: 12,
      causalEventIds: [],
    });
    result.acceptedAgentIds.push(agent.id);
  }
  for (const omitted of counsel.slice(5)) {
    result.rejected.push({ agentId: omitted.agentId, reason: "Only five counsel entries are accepted per call." });
  }
  if (result.acceptedAgentIds.length > 0) world.revision += 1;
  return result;
}

function longitudeInside(longitude: number, bounds: GeographicBounds): boolean {
  const value = normalizeLongitude(longitude);
  const west = normalizeLongitude(bounds.west);
  const east = normalizeLongitude(bounds.east);
  if (bounds.east - bounds.west >= 360) return true;
  return west <= east ? value >= west && value <= east : value >= west || value <= east;
}

function coordinateInside(coordinate: PlanetCoordinate, bounds: GeographicBounds): boolean {
  return coordinate.latitude >= Math.max(-90, bounds.south)
    && coordinate.latitude <= Math.min(90, bounds.north)
    && longitudeInside(coordinate.longitude, bounds);
}

function clusterAgents(agents: PlanetAgent[], zoom: number): PlanetViewportSnapshot["agentClusters"] {
  const cellSize = zoom < 2 ? 20 : zoom < 4 ? 10 : 5;
  const clusters = new Map<string, { longitude: number; latitude: number; count: number; polityIds: Set<string> }>();
  for (const agent of agents) {
    const x = Math.floor((agent.coordinate.longitude + 180) / cellSize);
    const y = Math.floor((agent.coordinate.latitude + 90) / cellSize);
    const key = `${x}:${y}`;
    const cluster = clusters.get(key) ?? { longitude: 0, latitude: 0, count: 0, polityIds: new Set<string>() };
    cluster.longitude += agent.coordinate.longitude;
    cluster.latitude += agent.coordinate.latitude;
    cluster.count += 1;
    if (agent.polityId) cluster.polityIds.add(agent.polityId);
    clusters.set(key, cluster);
  }
  return [...clusters.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(0, 512)
    .map(([, cluster]) => ({
      coordinate: { longitude: cluster.longitude / cluster.count, latitude: cluster.latitude / cluster.count },
      count: cluster.count,
      polityIds: [...cluster.polityIds].sort(),
    }));
}

export function getViewportSnapshot(
  world: PlanetWorldState,
  bounds: GeographicBounds,
  zoom: number,
): PlanetViewportSnapshot {
  const normalizedBounds: GeographicBounds = {
    west: bounds.west,
    east: bounds.east,
    south: Math.max(-90, Math.min(90, bounds.south)),
    north: Math.max(-90, Math.min(90, bounds.north)),
  };
  const candidates = world.agents
    .filter(({ alive, coordinate }) => alive && coordinateInside(coordinate, normalizedBounds))
    .sort((left, right) => left.id.localeCompare(right.id));
  const showIndividuals = zoom >= 8;
  const agents = showIndividuals ? candidates.slice(0, MAX_VIEWPORT_AGENTS).map((agent) => structuredClone(agent)) : [];
  const settlements = world.settlements
    .filter(({ coordinate }) => coordinateInside(coordinate, normalizedBounds))
    .sort((left, right) => left.id.localeCompare(right.id))
    .slice(0, MAX_VIEWPORT_SETTLEMENTS)
    .map((settlement) => structuredClone(settlement));
  const beliefInfluence = world.beliefs.flatMap((belief) => {
    const adherents = candidates.filter(({ beliefId }) => beliefId === belief.id);
    if (adherents.length === 0) return [];
    const coordinate = {
      longitude: adherents.reduce((sum, agent) => sum + agent.coordinate.longitude, 0) / adherents.length,
      latitude: adherents.reduce((sum, agent) => sum + agent.coordinate.latitude, 0) / adherents.length,
    };
    return [{
      beliefId: belief.id,
      name: belief.name,
      color: belief.color,
      coordinate,
      adherents: adherents.length,
      influence: adherents.reduce((sum, agent) => sum + agent.beliefConviction * agent.influence, 0),
    }];
  }).sort((left, right) => right.influence - left.influence || left.beliefId.localeCompare(right.beliefId));
  const territory = Object.entries(world.territoryOwners)
    .filter(([key]) => {
      const [x, y] = key.split(":").map(Number);
      return coordinateInside({
        longitude: -180 + (x + 0.5) * TERRITORY_CELL_DEGREES,
        latitude: 90 - (y + 0.5) * TERRITORY_CELL_DEGREES,
      }, normalizedBounds);
    })
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([cellKey, ownerPolityId]) => ({ cellKey, ownerPolityId }));
  return {
    revision: world.revision,
    day: world.day,
    bounds: normalizedBounds,
    zoom,
    agents,
    agentClusters: showIndividuals ? [] : clusterAgents(candidates, zoom),
    settlements,
    territory,
    disputes: Object.values(world.territoryDisputes)
      .filter(({ cellKey }) => territory.some((cell) => cell.cellKey === cellKey))
      .sort((left, right) => left.cellKey.localeCompare(right.cellKey))
      .map((dispute) => structuredClone(dispute)),
    beliefInfluence,
  };
}

export type PlanetEntityKind = "agent" | "settlement" | "polity" | "belief" | "institution" | "proposal" | "project";

export function getPlanetEntity(world: PlanetWorldState, kind: PlanetEntityKind, id: string): unknown | null {
  const collections: Record<PlanetEntityKind, Array<{ id: string }>> = {
    agent: world.agents,
    settlement: world.settlements,
    polity: world.polities,
    belief: world.beliefs,
    institution: world.institutions,
    proposal: world.proposals,
    project: world.projects,
  };
  const entity = collections[kind].find((candidate) => candidate.id === id);
  return entity ? structuredClone(entity) : null;
}

export interface PlanetHistoryChapter {
  chapter: number;
  startDay: number;
  endDay: number;
  events: PlanetHistoryEvent[];
  themes: Array<{ fingerprint: string; count: number; highestImportance: number }>;
}

export function getPlanetHistoryChapter(world: PlanetWorldState, chapter: number): PlanetHistoryChapter {
  const safeChapter = Math.max(1, Math.floor(chapter));
  const startDay = (safeChapter - 1) * 200 + 1;
  const endDay = safeChapter * 200;
  const events = world.history
    .filter(({ day }) => day >= startDay && day <= endDay)
    .sort((left, right) => right.importance - left.importance || left.at - right.at || left.id.localeCompare(right.id));
  const themeMap = new Map<string, { fingerprint: string; count: number; highestImportance: number }>();
  for (const event of events) {
    const theme = themeMap.get(event.fingerprint) ?? { fingerprint: event.fingerprint, count: 0, highestImportance: 0 };
    theme.count += 1;
    theme.highestImportance = Math.max(theme.highestImportance, event.importance);
    themeMap.set(event.fingerprint, theme);
  }
  return {
    chapter: safeChapter,
    startDay,
    endDay,
    events: events.slice(0, 200).map((event) => structuredClone(event)),
    themes: [...themeMap.values()].sort((left, right) =>
      right.highestImportance - left.highestImportance || right.count - left.count || left.fingerprint.localeCompare(right.fingerprint),
    ),
  };
}

export interface PlanetManifest {
  schemaVersion: 3;
  catalogVersion: string;
  seed: number;
  seedLabel: string;
  revision: number;
  time: number;
  day: number;
  shardHints: { agents: number; maxAgentsPerShard: number; modifiedChunks: number };
}

export function getPlanetManifest(world: PlanetWorldState): PlanetManifest {
  return {
    schemaVersion: PLANET_SCHEMA_VERSION,
    catalogVersion: PLANET_CATALOG_VERSION,
    seed: world.seed,
    seedLabel: world.seedLabel,
    revision: world.revision,
    time: world.time,
    day: world.day,
    shardHints: {
      agents: world.agents.length,
      maxAgentsPerShard: 500,
      modifiedChunks: new Set(Object.values(world.modifiedResourceSites).map(({ coordinate }) => coordinateChunkKey(coordinate))).size,
    },
  };
}

export function serializePlanetWorld(world: PlanetWorldState): string {
  if (!validatePlanetWorld(world)) throw new Error("Cannot serialize an invalid Era III planet world.");
  const regionIndex = Object.fromEntries(Object.entries(world.regionIndex)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => [key, {
      agentIds: [...entry.agentIds].sort(),
      settlementIds: [...entry.settlementIds].sort(),
    }]));
  return JSON.stringify({
    ...world,
    regionIndex,
    scheduler: [...world.scheduler].sort(eventCompare),
  });
}

export function validatePlanetWorld(value: unknown): value is PlanetWorldState {
  if (!value || typeof value !== "object") return false;
  const world = value as Partial<PlanetWorldState>;
  if (world.schemaVersion !== PLANET_SCHEMA_VERSION || !Number.isInteger(world.seed)) return false;
  if (!Number.isFinite(world.time) || !Number.isFinite(world.day) || !Number.isFinite(world.revision)) return false;
  if (!Array.isArray(world.agents) || world.agents.length < 1 || world.agents.length > MAX_PLANET_AGENTS) return false;
  if (!Array.isArray(world.settlements) || !Array.isArray(world.polities) || !Array.isArray(world.scheduler)) return false;
  if (!Array.isArray(world.history) || world.history.length > MAX_PLANET_HISTORY_EVENTS) return false;
  if (!world.territoryOwners || typeof world.territoryOwners !== "object") return false;
  const ids = new Set<string>();
  for (const agent of world.agents) {
    if (!agent || typeof agent.id !== "string" || typeof agent.name !== "string" || !agent.name || ids.has(agent.id)) return false;
    ids.add(agent.id);
    if (!validateAgentMind(agent)) return false;
    if (agent.capabilities.length > CAPABILITY_CATALOG.length + 128) return false;
  }
  if (!world.stats || world.stats.livingAgents !== world.agents.filter(({ alive }) => alive).length) return false;
  const polityIds = new Set(world.polities.map(({ id }) => id));
  if (Object.values(world.territoryOwners).some((owner) => !polityIds.has(owner))) return false;
  return true;
}

export function normalizePlanetWorld(value: unknown): PlanetWorldState {
  const parsed = typeof value === "string" ? JSON.parse(value) : structuredClone(value);
  // Era III remained schema-compatible while bounded external counsel was
  // added. Hydrate that optional field before strict validation so a planet
  // checkpoint created by an earlier Era III build is never mistaken for a
  // corrupt world and reset.
  if (parsed && typeof parsed === "object" && Array.isArray((parsed as { agents?: unknown }).agents)) {
    for (const candidate of (parsed as { agents: unknown[] }).agents) {
      if (!candidate || typeof candidate !== "object") continue;
      const mind = (candidate as { mind?: unknown }).mind;
      if (mind && typeof mind === "object" && !("advisory" in mind)) {
        (mind as { advisory: null }).advisory = null;
      }
    }
  }
  if (!validatePlanetWorld(parsed)) throw new Error("Invalid or unsupported Era III planet world.");
  heapify(parsed.scheduler);
  for (const key of Object.keys(parsed.regionIndex)) {
    parsed.regionIndex[key].agentIds.sort();
    parsed.regionIndex[key].settlementIds.sort();
  }
  return parsed;
}

export function getPlanetChunk(world: PlanetWorldState, x: number, y: number) {
  const chunk = generatePlanetChunk(world.seed, x, y, RESOURCE_CATALOG);
  chunk.resourceSites = chunk.resourceSites.map((site) => world.modifiedResourceSites[site.id] ?? site);
  return chunk;
}
