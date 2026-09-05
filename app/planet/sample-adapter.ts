import type {
  GeoPoint,
  PlanetAgent,
  PlanetBelief,
  PlanetCivilization,
  PlanetConflict,
  PlanetExperienceAdapter,
  PlanetLandmass,
  PlanetRelation,
  PlanetResourceFamily,
  PlanetResourceSite,
  PlanetSettlement,
  PlanetSnapshot,
} from "./types";

const SEED = 7_031_947;

const CIVILIZATION_SEEDS = [
  ["Aster Commonwealth", "#7dd3fc", "Aster Reach"],
  ["Vesper Assembly", "#c4b5fd", "Vespera"],
  ["Koru League", "#6ee7b7", "Koru Expanse"],
  ["Ember Compact", "#fb923c", "Ember Coast"],
  ["Morrow Union", "#f9a8d4", "Morrow Vale"],
  ["Orison Houses", "#fde047", "Orison"],
  ["Tern Republic", "#67e8f9", "Ternward"],
  ["Sable Accord", "#a3e635", "Sable March"],
  ["Caldera Kin", "#f87171", "Caldera"],
  ["Halcyon Council", "#5eead4", "Halcyon Shelf"],
  ["Nacre Federation", "#93c5fd", "Nacre Isles"],
  ["Rill Covenant", "#d8b4fe", "Rill Basin"],
] as const;

const BELIEF_SEEDS = [
  ["The Living Measure", "#64d7c2", ["reciprocity", "restraint", "shared memory"]],
  ["Open Sky Practice", "#7dd3fc", ["curiosity", "mobility", "honest witness"]],
  ["Ember Testament", "#fb923c", ["craft", "continuity", "earned duty"]],
  ["Quiet Current", "#c4b5fd", ["adaptation", "mercy", "patient inquiry"]],
  ["Many Roots", "#a3e635", ["kinship", "stewardship", "local freedom"]],
  ["The Unwritten", "#f9a8d4", ["doubt", "direct experience", "non-rule"]],
] as const;

const LAND_SEEDS = [
  [-142, 43, 35, 23, "tundra"],
  [-104, 9, 31, 23, "tropical"],
  [-67, 52, 24, 17, "boreal"],
  [-42, -23, 29, 20, "grassland"],
  [-4, 30, 35, 25, "temperate"],
  [33, -17, 25, 30, "desert"],
  [50, 55, 20, 16, "alpine"],
  [81, 15, 36, 20, "tropical"],
  [117, -35, 25, 18, "grassland"],
  [139, 42, 29, 20, "temperate"],
  [159, -2, 18, 25, "tropical"],
  [-164, -39, 16, 12, "boreal"],
  [7, -58, 28, 12, "tundra"],
  [95, 62, 18, 10, "tundra"],
  [-78, -58, 16, 9, "alpine"],
  [-13, 2, 10, 8, "tropical"],
  [61, 22, 9, 7, "desert"],
  [172, 52, 7, 6, "boreal"],
] as const;

const RESOURCE_CATALOG: ReadonlyArray<[string, PlanetResourceFamily, boolean]> = [
  ["Fresh water", "water", false],
  ["Wild grain", "food", false],
  ["Fruit grove", "food", false],
  ["Fisheries", "food", false],
  ["Hardwood", "biological", false],
  ["Medicinal flora", "biological", false],
  ["Clay", "construction", false],
  ["Limestone", "construction", true],
  ["Silica sand", "construction", true],
  ["Iron ore", "metal", true],
  ["Copper", "metal", true],
  ["Tin", "metal", true],
  ["Nickel", "strategic", true],
  ["Lithium", "strategic", true],
  ["Rare earths", "strategic", true],
  ["Phosphate", "strategic", true],
  ["Coal seam", "fuel", true],
  ["Crude oil", "fuel", true],
  ["Natural gas", "fuel", true],
  ["Uranium", "fuel", true],
  ["Strong wind", "energy", false],
  ["High solar flux", "energy", false],
  ["Geothermal field", "energy", false],
  ["Tidal reach", "energy", false],
];

const GIVEN_NAMES = [
  "Ari", "Mara", "Sol", "Ilyan", "Nia", "Tomas", "Esme", "Rook", "Sena", "Kavi",
  "Milo", "Lumi", "Ren", "Orla", "Dara", "Pax", "Asha", "Cael", "Noor", "Thea",
];

const FAMILY_NAMES = [
  "Vale", "Flint", "Rill", "Moss", "Dawn", "Kestrel", "Ash", "Reed", "Quill", "Stone",
  "Tide", "Wren", "Alder", "Frost", "Ember", "Hollow", "Morrow", "Tern", "Sable", "Koru",
];

const ACTIONS = [
  "Surveying a watershed", "Teaching an apprentice", "Negotiating a caravan route",
  "Testing a new kiln", "Restoring exhausted soil", "Mapping an iron outcrop",
  "Questioning the council", "Caring for family", "Building flood defenses",
  "Comparing medicinal plants", "Following a migrating herd", "Recording oral histories",
];

const GOALS = [
  "Secure water before the dry season", "Find a safer route between settlements",
  "Test whether hotter firing strengthens clay", "Build support for a new council vote",
  "Restore the northern fishery", "Teach the next generation what survived the crossing",
  "Learn why the western crops failed", "Create a durable alliance without surrendering autonomy",
];

function mulberry32(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function clampLatitude(latitude: number) {
  return Math.max(-84, Math.min(84, latitude));
}

function wrapLongitude(longitude: number) {
  return ((((longitude + 180) % 360) + 360) % 360) - 180;
}

function createLandmasses(random: () => number): PlanetLandmass[] {
  return LAND_SEEDS.map(([longitude, latitude, width, height, biome], index) => {
    const points: GeoPoint[] = [];
    const steps = 28;
    for (let pointIndex = 0; pointIndex < steps; pointIndex += 1) {
      const angle = (pointIndex / steps) * Math.PI * 2;
      const roughness = 0.72 + random() * 0.38;
      points.push({
        longitude: wrapLongitude(longitude + Math.cos(angle) * width * roughness),
        latitude: clampLatitude(latitude + Math.sin(angle) * height * roughness),
      });
    }
    return {
      id: `land-${index + 1}`,
      name: `${CIVILIZATION_SEEDS[index % CIVILIZATION_SEEDS.length][2]} ${index < 12 ? "" : "Isles"}`.trim(),
      biome,
      civilizationId: index < 16 ? `civ-${(index % 12) + 1}` : null,
      points,
    };
  });
}

function samplePointOnLand(landmass: PlanetLandmass, random: () => number): GeoPoint {
  const center = landmass.points.reduce(
    (sum, point) => ({ longitude: sum.longitude + point.longitude, latitude: sum.latitude + point.latitude }),
    { longitude: 0, latitude: 0 },
  );
  center.longitude /= landmass.points.length;
  center.latitude /= landmass.points.length;
  const anchor = landmass.points[Math.floor(random() * landmass.points.length)];
  const radius = Math.sqrt(random()) * 0.7;
  return {
    longitude: wrapLongitude(center.longitude + (anchor.longitude - center.longitude) * radius),
    latitude: clampLatitude(center.latitude + (anchor.latitude - center.latitude) * radius),
  };
}

function createSnapshot(): PlanetSnapshot {
  const random = mulberry32(SEED);
  const beliefs: PlanetBelief[] = BELIEF_SEEDS.map(([name, color, values], index) => ({
    id: `belief-${index + 1}`,
    name,
    color,
    values: [...values],
    followers: 0,
  }));

  const civilizations: PlanetCivilization[] = CIVILIZATION_SEEDS.map(([name, color], index) => ({
    id: `civ-${index + 1}`,
    name,
    color,
    population: 0,
    beliefId: index === 11 ? null : beliefs[index % beliefs.length].id,
    technologyScore: 18 + Math.round(random() * 64),
    prosperity: 28 + Math.round(random() * 58),
    summary: [
      "A river-linked society balancing local councils with a growing exchange network.",
      "A dispersed coalition whose workshops and navigators hold its settlements together.",
      "A young federation debating whether expansion is worth the ecological cost.",
    ][index % 3],
  }));

  const landmasses = createLandmasses(random);
  const settlements: PlanetSettlement[] = [];
  for (let index = 0; index < 84; index += 1) {
    const landmass = landmasses[index % 16];
    const civilizationId = landmass.civilizationId ?? civilizations[index % civilizations.length].id;
    const civilization = civilizations.find((candidate) => candidate.id === civilizationId) ?? civilizations[0];
    const position = samplePointOnLand(landmass, random);
    const population = index < 12 ? 260 + Math.floor(random() * 280) : 35 + Math.floor(random() * 155);
    settlements.push({
      id: `settlement-${index + 1}`,
      name: `${FAMILY_NAMES[(index * 7) % FAMILY_NAMES.length]} ${index < 12 ? "Haven" : index % 4 === 0 ? "Crossing" : "Reach"}`,
      civilizationId: civilization.id,
      population,
      kind: index < 4 ? "capital" : population > 220 ? "city" : population > 130 ? "town" : population > 70 ? "village" : "camp",
      prosperity: 20 + Math.round(random() * 75),
      ...position,
    });
  }

  const agents: PlanetAgent[] = [];
  for (let index = 0; index < 10_000; index += 1) {
    const settlement = settlements[Math.floor(random() * settlements.length)];
    const civilization = civilizations.find((candidate) => candidate.id === settlement.civilizationId) ?? civilizations[0];
    const angle = random() * Math.PI * 2;
    const spread = Math.pow(random(), 2) * (1.2 + Math.sqrt(settlement.population) * 0.035);
    const beliefId = random() < 0.18 ? null : civilization.beliefId;
    agents.push({
      id: `agent-${index + 1}`,
      name: `${GIVEN_NAMES[index % GIVEN_NAMES.length]} ${FAMILY_NAMES[Math.floor(index / GIVEN_NAMES.length) % FAMILY_NAMES.length]} ${String(index + 1).padStart(4, "0")}`,
      civilizationId: civilization.id,
      settlementId: settlement.id,
      beliefId,
      longitude: wrapLongitude(settlement.longitude + Math.cos(angle) * spread),
      latitude: clampLatitude(settlement.latitude + Math.sin(angle) * spread * 0.66),
      action: ACTIONS[Math.floor(random() * ACTIONS.length)],
      influence: Math.round(Math.pow(random(), 3) * 100),
      generation: Math.floor(random() * 5),
      currentGoal: GOALS[Math.floor(random() * GOALS.length)],
      knownFacts: [
        "Conditions nearby have changed since the last observation.",
        random() > 0.5 ? "A trusted contact supports this plan." : "No reliable ally has committed yet.",
        random() > 0.65 ? "The needed material has been seen locally." : "The needed material may require travel or trade.",
      ],
    });
    civilization.population += 1;
    if (beliefId) {
      const belief = beliefs.find((candidate) => candidate.id === beliefId);
      if (belief) belief.followers += 1;
    }
  }

  const resources: PlanetResourceSite[] = [];
  for (let index = 0; index < 620; index += 1) {
    const landmass = landmasses[Math.floor(random() * landmasses.length)];
    const [name, family, finite] = RESOURCE_CATALOG[index % RESOURCE_CATALOG.length];
    const position = samplePointOnLand(landmass, random);
    const discoverer = landmass.civilizationId && random() > 0.38 ? [landmass.civilizationId] : [];
    resources.push({
      id: `resource-${index + 1}`,
      name,
      family,
      abundance: Math.round(12 + random() * 88),
      discoveredBy: discoverer,
      finite,
      ...position,
    });
  }

  const relations: PlanetRelation[] = Array.from({ length: 22 }, (_, index) => ({
    id: `relation-${index + 1}`,
    fromCivilizationId: civilizations[index % civilizations.length].id,
    toCivilizationId: civilizations[(index * 5 + 3) % civilizations.length].id,
    kind: index % 4 === 0 ? "alliance" : index % 3 === 0 ? "truce" : "trade",
    strength: 32 + Math.round(random() * 68),
  }));

  const conflicts: PlanetConflict[] = [1, 2, 3, 4].map((value, index) => {
    const settlement = settlements[(index * 17 + 8) % settlements.length];
    return {
      id: `conflict-${value}`,
      name: ["The Amber Ford Dispute", "War of the Split Estuary", "Morrow Border Rising", "The Northroad Interdiction"][index],
      attackerCivilizationId: civilizations[index * 2].id,
      defenderCivilizationId: civilizations[index * 2 + 1].id,
      longitude: settlement.longitude,
      latitude: settlement.latitude,
      intensity: 34 + Math.round(random() * 62),
      sinceDay: 1_300 + index * 107,
    };
  });

  return {
    meta: {
      seed: SEED,
      era: "Era III · Planetfall",
      day: 1_847,
      population: agents.length,
      status: "live",
      revision: 2_604,
      dataMode: "sample",
      notice: "Deterministic Era III preview",
    },
    civilizations,
    beliefs,
    landmasses,
    settlements,
    agents,
    resources,
    relations,
    conflicts,
    chronicle: [
      { id: "event-1", day: 1_847, category: "discovery", title: "Pressure furnace holds", summary: "Ilyan Quill’s third ceramic chamber survived a full night at unprecedented heat. The Aster workshops are debating what to test inside it." },
      { id: "event-2", day: 1_839, category: "ecology", title: "Rill fishery reopens", summary: "After eleven seasons of restraint, local spawning counts crossed the threshold chosen by the river council." },
      { id: "event-3", day: 1_826, category: "politics", title: "Seven camps reject the levy", summary: "Northern Koru delegates refused the road contribution and proposed a rotating labor compact instead." },
      { id: "event-4", day: 1_801, category: "war", title: "Amber Ford changes hands", summary: "Vesper scouts withdrew before dawn. No settlement was taken, but the river crossing is now controlled by the Ember Compact." },
      { id: "event-5", day: 1_776, category: "belief", title: "Quiet Current divides", summary: "Three teachers now argue that mercy applies to exhausted land as strongly as it does to people. Their students call this the Patient Earth reading." },
      { id: "event-6", day: 1_743, category: "migration", title: "The western crossing", summary: "One hundred and twelve people left Caldera after the well council failed. Most are traveling toward Nacre territory." },
      { id: "event-7", day: 1_704, category: "discovery", title: "Black seep ignites", summary: "A Tern survey party recorded a dark liquid burning on water. The site is guarded while they test whether it can be stored." },
      { id: "event-8", day: 1_662, category: "politics", title: "Morrow chooses two voices", summary: "The hill and coast assemblies ended a succession crisis by dividing external and domestic authority." },
    ],
  };
}

class SamplePlanetAdapter implements PlanetExperienceAdapter {
  readonly mode = "sample" as const;
  private readonly snapshot = createSnapshot();

  getSnapshot() {
    return this.snapshot;
  }

  searchAgents(query: string, limit: number) {
    const normalized = query.trim().toLocaleLowerCase();
    return this.snapshot.agents
      .filter((agent) => !normalized || agent.name.toLocaleLowerCase().includes(normalized))
      .sort((left, right) => right.influence - left.influence)
      .slice(0, limit);
  }
}

export function createSamplePlanetAdapter(): PlanetExperienceAdapter {
  return new SamplePlanetAdapter();
}
