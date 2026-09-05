import {
  PLANET_HEIGHT,
  PLANET_WIDTH,
  coordinateToLogical,
  getResourceDefinition,
  sampleTerrain,
  territoryCellKey,
  type PlanetWorldState,
} from "../simulation/planet";
import type {
  PlanetAgent,
  PlanetBelief,
  PlanetChronicleEntry,
  PlanetCivilization,
  PlanetConflict,
  PlanetEntityDetail,
  PlanetEntitySelection,
  PlanetExperienceAdapter,
  PlanetLandmass,
  PlanetRelation,
  PlanetResourceFamily,
  PlanetResourceSite,
  PlanetSettlement,
  PlanetSnapshot,
} from "./types";

const POLITY_COLORS = [
  "#78d4eb", "#b6a3ed", "#67d6a1", "#ed986b", "#e9a0c7", "#dfcb6b",
  "#61cbd0", "#9dcb61", "#e77b78", "#62c9b7", "#87ace8", "#c899e4",
];

const BIOME_MAP: Record<string, PlanetLandmass["biome"]> = {
  ice: "tundra",
  tundra: "tundra",
  boreal_forest: "boreal",
  temperate_forest: "temperate",
  grassland: "grassland",
  desert: "desert",
  savanna: "grassland",
  tropical_forest: "tropical",
  wetland: "tropical",
  alpine: "alpine",
};

const RESOURCE_FAMILY_MAP: Record<string, PlanetResourceFamily> = {
  water: "water",
  food: "food",
  biological: "biological",
  fiber: "biological",
  construction: "construction",
  industrial_mineral: "construction",
  metal: "metal",
  strategic_mineral: "strategic",
  precious: "strategic",
  fossil_fuel: "fuel",
  nuclear: "fuel",
  renewable_energy: "energy",
};

function formatIdentifier(value: string) {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function polityName(index: number, id: string) {
  const generated = ["Aster", "Vesper", "Koru", "Ember", "Morrow", "Orison", "Tern", "Sable", "Caldera", "Halcyon"];
  const root = generated[index % generated.length] ?? formatIdentifier(id);
  return `${root} ${index % 3 === 0 ? "Assembly" : index % 3 === 1 ? "League" : "Commonwealth"}`;
}

function settlementKind(population: number): PlanetSettlement["kind"] {
  if (population >= 1_000) return "capital";
  if (population >= 500) return "city";
  if (population >= 180) return "town";
  if (population >= 60) return "village";
  return "camp";
}

function historyCategory(type: string): PlanetChronicleEntry["category"] {
  if (type === "invention" || type === "discovery" || type === "production") return "discovery";
  if (type === "migration" || type === "settlement_founded") return "migration";
  if (type === "proposal" || type === "agreement" || type === "territory_claim") return "politics";
  if (type === "territory_contested") return "war";
  return "ecology";
}

function createTerrainCells(world: PlanetWorldState): PlanetLandmass[] {
  const cells: PlanetLandmass[] = [];
  const longitudeStep = 10;
  const latitudeStep = 8;
  for (let latitude = -80; latitude < 80; latitude += latitudeStep) {
    for (let longitude = -180; longitude < 180; longitude += longitudeStep) {
      const center = { longitude: longitude + longitudeStep / 2, latitude: latitude + latitudeStep / 2 };
      const logical = coordinateToLogical(center);
      const terrain = sampleTerrain(world.seed, logical.x, logical.y);
      if (terrain.ocean || terrain.biome === "ocean") continue;
      const ownerId = world.territoryOwners[territoryCellKey(center)] ?? null;
      cells.push({
        id: `terrain-${longitude}-${latitude}`,
        name: formatIdentifier(terrain.biome),
        biome: BIOME_MAP[terrain.biome] ?? "temperate",
        civilizationId: ownerId,
        points: [
          { longitude, latitude },
          { longitude: longitude + longitudeStep, latitude },
          { longitude: longitude + longitudeStep, latitude: latitude + latitudeStep },
          { longitude, latitude: latitude + latitudeStep },
        ],
      });
    }
  }
  return cells;
}

export function snapshotFromPlanetWorld(world: PlanetWorldState): PlanetSnapshot {
  const civilizations: PlanetCivilization[] = world.polities.map((polity, index) => {
    const settlements = world.settlements.filter((settlement) => settlement.polityId === polity.id);
    const capabilities = new Set(settlements.flatMap((settlement) => settlement.capabilities));
    const food = settlements.reduce((sum, settlement) => sum + (settlement.stocks.food ?? 0), 0);
    return {
      id: polity.id,
      name: polity.name || polityName(index, polity.id),
      color: POLITY_COLORS[index % POLITY_COLORS.length],
      population: polity.citizenIds.length,
      beliefId: polity.beliefIds[0] ?? null,
      technologyScore: Math.min(100, capabilities.size * 3.5),
      prosperity: Math.min(100, 25 + Math.log2(food + 1) * 8 + settlements.length * 2),
      summary: `${settlements.length} autonomous settlement${settlements.length === 1 ? "" : "s"} connected by named people, proposals, and shared knowledge.`,
    };
  });

  const settlements: PlanetSettlement[] = world.settlements.map((settlement) => {
    const population = settlement.residentIds.length;
    const stockTotal = Object.values(settlement.stocks).reduce((sum, amount) => sum + amount, 0);
    return {
      id: settlement.id,
      name: settlement.name,
      civilizationId: settlement.polityId,
      population,
      kind: settlementKind(population),
      prosperity: Math.min(100, 22 + Math.log2(stockTotal + 1) * 7 + settlement.capabilities.length * 2),
      capabilities: settlement.capabilities,
      longitude: settlement.coordinate.longitude,
      latitude: settlement.coordinate.latitude,
    };
  });

  const agents: PlanetAgent[] = world.agents.filter((agent) => agent.alive).map((agent) => {
    const activeGoal = agent.mind.goals.find((goal) => goal.status === "active") ?? agent.mind.goals[0];
    const latestFacts = agent.mind.observations.slice(-3).map((observation) => {
      const details = Object.entries(observation.facts).slice(0, 2).map(([key, value]) => `${formatIdentifier(key)}: ${String(value)}`).join("; ");
      return details || `${formatIdentifier(observation.kind)} observed with ${Math.round(observation.confidence * 100)}% confidence.`;
    });
    return {
      id: agent.id,
      name: agent.name,
      civilizationId: agent.polityId,
      settlementId: agent.homeSettlementId,
      beliefId: null,
      action: activeGoal ? formatIdentifier(activeGoal.purpose) : "Reassessing immediate needs",
      influence: Math.round(agent.influence),
      generation: agent.parentIds.length ? 1 : 0,
      currentGoal: activeGoal?.rationale || (activeGoal ? formatIdentifier(activeGoal.purpose) : "Survive and prosper"),
      knownFacts: latestFacts.length ? latestFacts : ["This agent only knows what has been directly observed or reliably shared."],
      longitude: agent.coordinate.longitude,
      latitude: agent.coordinate.latitude,
    };
  });

  const resources: PlanetResourceSite[] = Object.values(world.modifiedResourceSites).map((site) => {
    const definition = getResourceDefinition(site.resourceId);
    return {
      id: site.id,
      name: definition?.name ?? formatIdentifier(site.resourceId),
      family: RESOURCE_FAMILY_MAP[definition?.family ?? "strategic_mineral"] ?? "strategic",
      abundance: site.capacity > 0 ? Math.round((site.reserve / site.capacity) * 100) : 0,
      discoveredBy: site.discoveredBy,
      finite: definition?.renewability === "finite",
      longitude: site.coordinate.longitude,
      latitude: site.coordinate.latitude,
    };
  });

  const relations: PlanetRelation[] = world.proposals
    .filter((proposal) => proposal.status === "accepted" && (proposal.kind === "trade" || proposal.kind === "alliance" || proposal.kind === "peace"))
    .flatMap((proposal) => proposal.polityId && proposal.counterpartyIds[0] ? [{
      id: proposal.id,
      fromCivilizationId: proposal.polityId,
      toCivilizationId: proposal.counterpartyIds[0],
      kind: proposal.kind === "peace" ? "truce" as const : proposal.kind === "alliance" ? "alliance" as const : "trade" as const,
      strength: Math.min(100, 40 + proposal.decisions.filter((decision) => decision.choice === "accept").length * 6),
    }] : []);

  const conflicts: PlanetConflict[] = world.proposals
    .filter((proposal) => proposal.kind === "war" && proposal.status === "accepted")
    .flatMap((proposal) => {
      if (!proposal.polityId || !proposal.counterpartyIds[0]) return [];
      const sponsor = world.agents.find((agent) => agent.id === proposal.sponsorAgentId);
      return [{
        id: proposal.id,
        name: proposal.title,
        attackerCivilizationId: proposal.polityId,
        defenderCivilizationId: proposal.counterpartyIds[0],
        longitude: sponsor?.coordinate.longitude ?? 0,
        latitude: sponsor?.coordinate.latitude ?? 0,
        intensity: 50,
        sinceDay: Math.floor(proposal.createdAt / 60) + 1,
      }];
    });

  const beliefs: PlanetBelief[] = world.beliefs.map((belief) => ({
    id: belief.id,
    name: belief.name,
    color: belief.color,
    followers: belief.adherentIds.length,
    values: belief.coreValues,
    tenets: belief.tenets,
    kind: belief.kind,
    founderAgentId: belief.founderAgentId,
    founderName: world.agents.find((agent) => agent.id === belief.founderAgentId)?.name ?? null,
    originSettlementId: belief.originSettlementId,
    originName: belief.originSettlementId
      ? world.settlements.find((settlement) => settlement.id === belief.originSettlementId)?.name ?? null
      : null,
    originDay: belief.originDay,
    parentBeliefId: belief.parentBeliefId,
    active: belief.active,
    reforms: belief.reformHistory.slice(-5).map(({ day, summary }) => ({ day, summary })),
    schisms: belief.schismIds.length,
  }));

  return {
    meta: {
      seed: world.seed,
      era: "Era III · Planetfall",
      day: world.day,
      population: world.stats.livingAgents,
      status: "live",
      revision: world.revision,
    },
    civilizations,
    beliefs,
    landmasses: createTerrainCells(world),
    settlements,
    agents,
    resources,
    relations,
    conflicts,
    chronicle: world.history.slice(-80).reverse().map((event) => ({
      id: event.id,
      day: event.day,
      category: historyCategory(event.type),
      title: event.title,
      summary: event.summary,
      entity: event.actorIds[0] ? { kind: "agent", id: event.actorIds[0] } : undefined,
    })),
  };
}

class PlanetWorldAdapter implements PlanetExperienceAdapter {
  readonly mode = "live" as const;
  private world: PlanetWorldState;
  private snapshot: PlanetSnapshot;
  private readonly listeners = new Set<(snapshot: PlanetSnapshot) => void>();

  constructor(world: PlanetWorldState) {
    this.world = world;
    this.snapshot = snapshotFromPlanetWorld(world);
  }

  getSnapshot() {
    return this.snapshot;
  }

  subscribe(listener: (snapshot: PlanetSnapshot) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  searchAgents(query: string, limit: number) {
    const normalized = query.trim().toLocaleLowerCase();
    return this.snapshot.agents
      .filter((agent) => agent.name.toLocaleLowerCase().includes(normalized))
      .sort((left, right) => right.influence - left.influence)
      .slice(0, limit);
  }

  async loadEntity(selection: PlanetEntitySelection): Promise<PlanetEntityDetail | null> {
    if (selection.kind === "agent") {
      const record = this.world.agents.find((agent) => agent.id === selection.id);
      return record ? { kind: "agent", record } : null;
    }
    if (selection.kind === "settlement") {
      const record = this.world.settlements.find((settlement) => settlement.id === selection.id);
      return record ? { kind: "settlement", record } : null;
    }
    if (selection.kind === "civilization") {
      const record = this.world.polities.find((polity) => polity.id === selection.id);
      return record ? { kind: "civilization", record } : null;
    }
    return null;
  }

  update(world: PlanetWorldState) {
    this.world = world;
    this.snapshot = snapshotFromPlanetWorld(this.world);
    for (const listener of this.listeners) listener(this.snapshot);
  }
}

export type UpdatablePlanetExperienceAdapter = PlanetExperienceAdapter & {
  update(world: PlanetWorldState): void;
};

export function createPlanetWorldAdapter(world: PlanetWorldState): UpdatablePlanetExperienceAdapter {
  return new PlanetWorldAdapter(world);
}

// Keep the logical dimensions visibly tied to the adapter contract so a future
// viewport adapter cannot silently substitute the old 200×200 flat frontier.
export const ERA_THREE_LOGICAL_SIZE = { width: PLANET_WIDTH, height: PLANET_HEIGHT } as const;
