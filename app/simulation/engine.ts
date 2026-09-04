/**
 * Wildgrid's deterministic survival simulation.
 *
 * The engine deliberately has no rendering or browser dependencies. Every value
 * in WorldState is JSON serializable and all pseudo-random choices are made from
 * the `randomState` stored in the world, so identical seeds and inputs produce
 * identical worlds.
 */

export const SIMULATION_VERSION = 1 as const;
export const DEFAULT_SEED = 0x57_49_4c_44;
export const FIXED_STEP = 0.1;
export const MAX_SIMULATE_DELTA = 30;
export const WORLD_HALF_SIZE = 24;
export const DAY_LENGTH = 240;
export const CAMP_ID = "camp";

const TAU = Math.PI * 2;
const MAX_EVENTS = 80;
const STORAGE_LIMIT = 99;
const EPSILON = 0.000_001;

export type SeedInput = number | string;
export type ResourceKind = "food" | "water" | "wood";
export type AgentRole =
  | "forager"
  | "caretaker"
  | "builder"
  | "scout"
  | "hydrologist"
  | "quartermaster";

export type AgentAction =
  | "idle"
  | "eat"
  | "drink"
  | "rest"
  | "gather_food"
  | "gather_water"
  | "gather_wood"
  | "deposit"
  | "share"
  | "rescue"
  | "build"
  | "explore";

export type TargetType = "resource" | "agent" | "camp" | "point" | "structure";

export type SimulationEventType =
  | "world"
  | "day"
  | "decision"
  | "discover"
  | "harvest"
  | "depleted"
  | "deposit"
  | "share"
  | "rescue"
  | "build"
  | "death";

export type EventTone = "neutral" | "positive" | "warning" | "critical";

export interface Vec2 {
  x: number;
  z: number;
}

export interface Inventory {
  food: number;
  water: number;
  wood: number;
}

export interface Personality {
  label: string;
  description: string;
  cooperation: number;
  curiosity: number;
  caution: number;
  industriousness: number;
}

export interface AgentTarget {
  type: TargetType;
  id: string;
  label: string;
  position: Vec2;
}

export interface AgentContribution {
  gathered: number;
  deposited: number;
  shared: number;
  rescues: number;
  builds: number;
  discoveries: number;
}

export interface AgentState {
  id: string;
  name: string;
  role: AgentRole;
  roleLabel: string;
  color: string;
  personality: Personality;
  position: Vec2;
  velocity: Vec2;
  heading: number;
  /** Survival meters are 0 (critical) to 100 (healthy/full). */
  hunger: number;
  hydration: number;
  energy: number;
  health: number;
  alive: boolean;
  inventory: Inventory;
  capacity: number;
  speed: number;
  action: AgentAction;
  goal: string;
  rationale: string;
  target: AgentTarget | null;
  actionTime: number;
  decisionTimer: number;
  contribution: AgentContribution;
}

export interface ResourceNode {
  id: string;
  kind: ResourceKind;
  position: Vec2;
  amount: number;
  maxAmount: number;
  regenRate: number;
  discovered: boolean;
  depletedAt: number | null;
}

export interface CampState {
  id: typeof CAMP_ID;
  name: string;
  position: Vec2;
  radius: number;
  storage: Inventory;
  level: number;
  shelterLevel: number;
  gardenLevel: number;
  waterCollectorLevel: number;
  buildProgress: number;
  nextUpgradeCost: number;
}

export interface WorldMap {
  halfSize: number;
  campRadius: number;
  biome: string;
}

export interface WorldStatistics {
  resourcesHarvested: Inventory;
  resourcesDeposited: Inventory;
  resourcesShared: number;
  campUpgrades: number;
  discoveries: number;
  deaths: number;
  extinction: boolean;
}

export interface SimulationEvent {
  id: number;
  time: number;
  day: number;
  type: SimulationEventType;
  tone: EventTone;
  message: string;
  agentId: string | null;
  targetId: string | null;
  resourceKind: ResourceKind | null;
}

export interface WorldState {
  version: typeof SIMULATION_VERSION;
  seed: number;
  randomState: number;
  time: number;
  day: number;
  timeOfDay: number;
  tick: number;
  accumulator: number;
  map: WorldMap;
  agents: AgentState[];
  resources: ResourceNode[];
  camp: CampState;
  events: SimulationEvent[];
  nextEventId: number;
  stats: WorldStatistics;
}

export interface WorldSummary {
  day: number;
  timeOfDay: number;
  aliveAgents: number;
  totalAgents: number;
  criticalAgents: number;
  averageHealth: number;
  campLevel: number;
  storage: Inventory;
  discoveredResources: number;
  totalResources: number;
}

export interface RandomSample {
  state: number;
  value: number;
}

export const ACTION_LABELS: Readonly<Record<AgentAction, string>> = {
  idle: "Standing by",
  eat: "Eating",
  drink: "Drinking",
  rest: "Resting",
  gather_food: "Foraging",
  gather_water: "Collecting water",
  gather_wood: "Gathering timber",
  deposit: "Returning supplies",
  share: "Sharing supplies",
  rescue: "Emergency aid",
  build: "Upgrading camp",
  explore: "Exploring",
};

export const RESOURCE_LABELS: Readonly<Record<ResourceKind, string>> = {
  food: "Wild food",
  water: "Fresh water",
  wood: "Timber",
};

export const RESOURCE_COLORS: Readonly<Record<ResourceKind, string>> = {
  food: "#c7f36a",
  water: "#66d7d1",
  wood: "#d69b61",
};

const ROLE_BLUEPRINTS: ReadonlyArray<{
  name: string;
  role: AgentRole;
  roleLabel: string;
  color: string;
  speed: number;
  capacity: number;
  personality: Personality;
}> = [
  {
    name: "NOVA",
    role: "forager",
    roleLabel: "Forager",
    color: "#c7f36a",
    speed: 2.35,
    capacity: 7,
    personality: {
      label: "Practical optimist",
      description: "Reads abundance quickly and favors reliable food routes.",
      cooperation: 0.7,
      curiosity: 0.62,
      caution: 0.55,
      industriousness: 0.78,
    },
  },
  {
    name: "MOSS",
    role: "caretaker",
    roleLabel: "Caretaker",
    color: "#72dfc3",
    speed: 2.05,
    capacity: 6,
    personality: {
      label: "Quiet guardian",
      description: "Continuously watches the group and responds to distress.",
      cooperation: 0.98,
      curiosity: 0.38,
      caution: 0.76,
      industriousness: 0.68,
    },
  },
  {
    name: "RUNE",
    role: "builder",
    roleLabel: "Builder",
    color: "#ffb45c",
    speed: 1.95,
    capacity: 8,
    personality: {
      label: "Patient maker",
      description: "Turns timber and time into durable shared infrastructure.",
      cooperation: 0.75,
      curiosity: 0.32,
      caution: 0.64,
      industriousness: 0.97,
    },
  },
  {
    name: "SOLA",
    role: "scout",
    roleLabel: "Scout",
    color: "#ff8066",
    speed: 2.65,
    capacity: 5.5,
    personality: {
      label: "Bold pathfinder",
      description: "Accepts uncertainty to reveal distant opportunities.",
      cooperation: 0.58,
      curiosity: 0.98,
      caution: 0.25,
      industriousness: 0.63,
    },
  },
  {
    name: "KIRO",
    role: "hydrologist",
    roleLabel: "Water keeper",
    color: "#61a9ff",
    speed: 2.2,
    capacity: 7,
    personality: {
      label: "Measured analyst",
      description: "Prioritizes water security and avoids fragile supply lines.",
      cooperation: 0.82,
      curiosity: 0.57,
      caution: 0.88,
      industriousness: 0.76,
    },
  },
  {
    name: "EMBER",
    role: "quartermaster",
    roleLabel: "Quartermaster",
    color: "#cf91ff",
    speed: 2.1,
    capacity: 8.5,
    personality: {
      label: "Adaptive coordinator",
      description: "Balances stockpiles and fills whichever gap is most urgent.",
      cooperation: 0.9,
      curiosity: 0.48,
      caution: 0.72,
      industriousness: 0.86,
    },
  },
] as const;

interface RandomCursor {
  state: number;
}

interface ActionChoice {
  action: AgentAction;
  score: number;
  goal: string;
  rationale: string;
  target: AgentTarget | null;
}

/** Converts a number or string into a stable, non-zero 32-bit seed. */
export function normalizeSeed(seed: SeedInput = DEFAULT_SEED): number {
  if (typeof seed === "number") {
    if (!Number.isFinite(seed)) return DEFAULT_SEED;
    const normalized = Math.trunc(seed) >>> 0;
    return normalized === 0 ? DEFAULT_SEED : normalized;
  }

  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  const normalized = hash >>> 0;
  return normalized === 0 ? DEFAULT_SEED : normalized;
}

/** A stateless xorshift32 PRNG sample. Store the returned state for the next call. */
export function randomFromState(inputState: number): RandomSample {
  let state = (inputState >>> 0) || DEFAULT_SEED;
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  state >>>= 0;
  return { state, value: state / 4_294_967_296 };
}

function cursorRandom(cursor: RandomCursor): number {
  const sample = randomFromState(cursor.state);
  cursor.state = sample.state;
  return sample.value;
}

function worldRandom(world: WorldState): number {
  const sample = randomFromState(world.randomState);
  world.randomState = sample.state;
  return sample.value;
}

function randomRange(cursor: RandomCursor, minimum: number, maximum: number): number {
  return minimum + (maximum - minimum) * cursorRandom(cursor);
}

function emptyInventory(): Inventory {
  return { food: 0, water: 0, wood: 0 };
}

function copyVec(vector: Vec2): Vec2 {
  return { x: vector.x, z: vector.z };
}

function targetFor(
  type: TargetType,
  id: string,
  label: string,
  position: Vec2,
): AgentTarget {
  return { type, id, label, position: copyVec(position) };
}

function campTarget(camp: CampState, type: "camp" | "structure" = "camp"): AgentTarget {
  return targetFor(type, camp.id, type === "structure" ? "Camp shelter" : camp.name, camp.position);
}

function totalInventory(inventory: Inventory): number {
  return inventory.food + inventory.water + inventory.wood;
}

export function distanceBetween(a: Vec2, b: Vec2): number {
  const x = a.x - b.x;
  const z = a.z - b.z;
  return Math.sqrt(x * x + z * z);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function makeResources(cursor: RandomCursor): ResourceNode[] {
  const resources: ResourceNode[] = [];
  const specifications: ReadonlyArray<{
    kind: ResourceKind;
    count: number;
    maximum: readonly [number, number];
    regeneration: readonly [number, number];
  }> = [
    { kind: "food", count: 24, maximum: [8, 15], regeneration: [0.018, 0.032] },
    { kind: "water", count: 16, maximum: [15, 26], regeneration: [0.032, 0.052] },
    { kind: "wood", count: 22, maximum: [12, 23], regeneration: [0.006, 0.012] },
  ];

  for (const specification of specifications) {
    for (let index = 0; index < specification.count; index += 1) {
      let position: Vec2 | null = null;

      for (let attempt = 0; attempt < 100; attempt += 1) {
        const isStarterNode = index < 3;
        const angle = cursorRandom(cursor) * TAU;
        const radius = isStarterNode
          ? randomRange(cursor, 6.2, 9.5)
          : Math.sqrt(cursorRandom(cursor)) * (WORLD_HALF_SIZE - 4.2) + 3.2;
        const candidate = {
          x: clamp(Math.cos(angle) * radius, -WORLD_HALF_SIZE + 1, WORLD_HALF_SIZE - 1),
          z: clamp(Math.sin(angle) * radius, -WORLD_HALF_SIZE + 1, WORLD_HALF_SIZE - 1),
        };
        const clearOfCamp = distanceBetween(candidate, { x: 0, z: 0 }) > 4.6;
        const clearOfNodes = resources.every(
          (resource) => distanceBetween(candidate, resource.position) > 1.1,
        );
        if (clearOfCamp && clearOfNodes) {
          position = candidate;
          break;
        }
      }

      // The fallback is deterministic and only relevant for unusually crowded maps.
      if (!position) {
        const ordinal = resources.length + 1;
        const angle = ordinal * 2.399963229728653;
        const radius = 6 + ((ordinal * 3.17) % (WORLD_HALF_SIZE - 8));
        position = {
          x: clamp(Math.cos(angle) * radius, -WORLD_HALF_SIZE + 1, WORLD_HALF_SIZE - 1),
          z: clamp(Math.sin(angle) * radius, -WORLD_HALF_SIZE + 1, WORLD_HALF_SIZE - 1),
        };
      }

      const maxAmount = round1(
        randomRange(cursor, specification.maximum[0], specification.maximum[1]),
      );
      resources.push({
        id: `${specification.kind}-${String(index + 1).padStart(2, "0")}`,
        kind: specification.kind,
        position,
        amount: round1(maxAmount * randomRange(cursor, 0.62, 1)),
        maxAmount,
        regenRate: randomRange(
          cursor,
          specification.regeneration[0],
          specification.regeneration[1],
        ),
        discovered: distanceBetween(position, { x: 0, z: 0 }) <= 10.25,
        depletedAt: null,
      });
    }
  }

  return resources;
}

function makeAgents(cursor: RandomCursor): AgentState[] {
  return ROLE_BLUEPRINTS.map((blueprint, index) => {
    const angle = (index / ROLE_BLUEPRINTS.length) * TAU - Math.PI / 2;
    const radius = randomRange(cursor, 1.75, 2.45);
    return {
      id: blueprint.name.toLowerCase(),
      name: blueprint.name,
      role: blueprint.role,
      roleLabel: blueprint.roleLabel,
      color: blueprint.color,
      personality: { ...blueprint.personality },
      position: { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius },
      velocity: { x: 0, z: 0 },
      heading: angle + Math.PI / 2,
      hunger: round1(randomRange(cursor, 67, 91)),
      hydration: round1(randomRange(cursor, 65, 93)),
      energy: round1(randomRange(cursor, 72, 96)),
      health: 100,
      alive: true,
      inventory: {
        food: index === 0 || index === 1 ? 0.8 : 0,
        water: index === 1 || index === 4 ? 0.8 : 0,
        wood: 0,
      },
      capacity: blueprint.capacity,
      speed: blueprint.speed,
      action: "idle",
      goal: "Assess the habitat",
      rationale: "The simulation has just begun; nearby needs and supplies are being assessed.",
      target: null,
      actionTime: 0,
      decisionTimer: 0,
      contribution: {
        gathered: 0,
        deposited: 0,
        shared: 0,
        rescues: 0,
        builds: 0,
        discoveries: 0,
      },
    };
  });
}

/** Creates a fresh deterministic six-agent habitat. */
export function createWorld(seedInput: SeedInput = DEFAULT_SEED): WorldState {
  const seed = normalizeSeed(seedInput);
  const cursor: RandomCursor = { state: seed };
  const resources = makeResources(cursor);
  const world: WorldState = {
    version: SIMULATION_VERSION,
    seed,
    randomState: cursor.state,
    time: 0,
    day: 1,
    timeOfDay: 0.28,
    tick: 0,
    accumulator: 0,
    map: {
      halfSize: WORLD_HALF_SIZE,
      campRadius: 3.15,
      biome: "Verdant basin",
    },
    agents: makeAgents(cursor),
    resources,
    camp: {
      id: CAMP_ID,
      name: "Hearth Camp",
      position: { x: 0, z: 0 },
      radius: 3.15,
      storage: { food: 10, water: 12, wood: 7 },
      level: 1,
      shelterLevel: 1,
      gardenLevel: 0,
      waterCollectorLevel: 0,
      buildProgress: 0,
      nextUpgradeCost: 14,
    },
    events: [],
    nextEventId: 1,
    stats: {
      resourcesHarvested: emptyInventory(),
      resourcesDeposited: emptyInventory(),
      resourcesShared: 0,
      campUpgrades: 0,
      discoveries: resources.filter((resource) => resource.discovered).length,
      deaths: 0,
      extinction: false,
    },
  };

  // Agent generation consumes the same cursor after resource generation.
  world.randomState = cursor.state;
  pushEvent(world, "world", "neutral", "Six autonomous minds awaken around Hearth Camp.");
  pushEvent(
    world,
    "discover",
    "positive",
    `The opening survey reveals ${world.stats.discoveries} nearby resource sites.`,
  );
  for (const agent of world.agents) chooseAction(world, agent, false);
  return world;
}

/** Alias kept intentionally explicit for React initial-state factories. */
export const createInitialWorld = createWorld;

/** Resets from a prior world's original seed, or starts from the supplied seed. */
export function resetWorld(stateOrSeed: WorldState | SeedInput = DEFAULT_SEED): WorldState {
  return createWorld(typeof stateOrSeed === "object" ? stateOrSeed.seed : stateOrSeed);
}

/** Deep-copies every mutable branch without relying on structuredClone. */
export function cloneWorldState(state: WorldState): WorldState {
  return {
    ...state,
    map: { ...state.map },
    agents: state.agents.map((agent) => ({
      ...agent,
      personality: { ...agent.personality },
      position: copyVec(agent.position),
      velocity: copyVec(agent.velocity),
      inventory: { ...agent.inventory },
      target: agent.target
        ? { ...agent.target, position: copyVec(agent.target.position) }
        : null,
      contribution: { ...agent.contribution },
    })),
    resources: state.resources.map((resource) => ({
      ...resource,
      position: copyVec(resource.position),
    })),
    camp: {
      ...state.camp,
      position: copyVec(state.camp.position),
      storage: { ...state.camp.storage },
    },
    events: state.events.map((event) => ({ ...event })),
    stats: {
      ...state.stats,
      resourcesHarvested: { ...state.stats.resourcesHarvested },
      resourcesDeposited: { ...state.stats.resourcesDeposited },
    },
  };
}

/**
 * Advances a world using a fixed 100ms tick and returns a new state.
 * Deltas above 30 seconds are clamped to protect an accidentally suspended tab.
 */
export function simulateWorld(state: WorldState, dtSeconds: number): WorldState {
  if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) return state;
  const next = cloneWorldState(state);
  next.accumulator += Math.min(dtSeconds, MAX_SIMULATE_DELTA);

  const steps = Math.floor((next.accumulator + EPSILON) / FIXED_STEP);
  for (let index = 0; index < steps; index += 1) updateWorld(next, FIXED_STEP);
  next.accumulator -= steps * FIXED_STEP;
  if (Math.abs(next.accumulator) < EPSILON) next.accumulator = 0;
  return next;
}

/** Advances exactly one fixed tick, independent of the render accumulator. */
export function stepWorld(state: WorldState): WorldState {
  const next = cloneWorldState(state);
  updateWorld(next, FIXED_STEP);
  return next;
}

function updateWorld(world: WorldState, dt: number): void {
  const previousDay = world.day;
  world.time += dt;
  world.tick += 1;
  world.day = Math.floor(world.time / DAY_LENGTH) + 1;
  world.timeOfDay = (0.28 + (world.time % DAY_LENGTH) / DAY_LENGTH) % 1;

  if (world.day !== previousDay) {
    pushEvent(world, "day", "neutral", `Day ${world.day} begins in the verdant basin.`);
  }

  updateCampProduction(world, dt);
  updateResourceGrowth(world, dt);

  for (const agent of world.agents) {
    if (!agent.alive) continue;
    updateNeeds(world, agent, dt);
    if (!agent.alive) continue;
    agent.decisionTimer -= dt;
    if (agent.decisionTimer <= 0 || !isActionValid(world, agent)) {
      chooseAction(world, agent, true);
    }
    executeAction(world, agent, dt);
    revealNearbyResources(world, agent);
  }

  if (!world.stats.extinction && world.agents.every((agent) => !agent.alive)) {
    world.stats.extinction = true;
    pushEvent(world, "death", "critical", "Hearth Camp has fallen silent.");
  }
}

function daylightAt(timeOfDay: number): number {
  return clamp(0.5 + Math.sin((timeOfDay - 0.25) * TAU) * 0.5, 0, 1);
}

function updateCampProduction(world: WorldState, dt: number): void {
  const daylight = daylightAt(world.timeOfDay);
  if (world.camp.gardenLevel > 0) {
    world.camp.storage.food = clamp(
      world.camp.storage.food + world.camp.gardenLevel * (0.012 + daylight * 0.016) * dt,
      0,
      STORAGE_LIMIT,
    );
  }
  if (world.camp.waterCollectorLevel > 0) {
    world.camp.storage.water = clamp(
      world.camp.storage.water + world.camp.waterCollectorLevel * 0.026 * dt,
      0,
      STORAGE_LIMIT,
    );
  }
}

function updateResourceGrowth(world: WorldState, dt: number): void {
  const daylight = daylightAt(world.timeOfDay);
  for (const resource of world.resources) {
    const environmentFactor =
      resource.kind === "food" ? 0.55 + daylight * 0.7 : resource.kind === "wood" ? 0.75 : 1;
    resource.amount = Math.min(
      resource.maxAmount,
      resource.amount + resource.regenRate * environmentFactor * dt,
    );
    if (resource.depletedAt !== null && resource.amount >= 0.75) resource.depletedAt = null;
  }
}

function updateNeeds(world: WorldState, agent: AgentState, dt: number): void {
  const moving = isMovementAction(agent.action) &&
    Math.abs(agent.velocity.x) + Math.abs(agent.velocity.z) > 0.1;
  const atCamp = distanceBetween(agent.position, world.camp.position) <= world.camp.radius;
  const shelterRelief = atCamp ? world.camp.shelterLevel * 0.008 : 0;
  agent.hunger = clamp(agent.hunger - (0.095 + (moving ? 0.022 : 0)) * dt, 0, 100);
  agent.hydration = clamp(agent.hydration - (0.135 + (moving ? 0.035 : 0)) * dt, 0, 100);
  agent.energy = clamp(
    agent.energy - Math.max(0.035, 0.068 + (moving ? 0.042 : 0) - shelterRelief) * dt,
    0,
    100,
  );

  let healthDelta = 0;
  if (agent.hunger <= 0) healthDelta -= 1.15;
  else if (agent.hunger < 12) healthDelta -= 0.22;
  if (agent.hydration <= 0) healthDelta -= 1.8;
  else if (agent.hydration < 12) healthDelta -= 0.34;
  if (agent.energy <= 0) healthDelta -= 0.45;
  if (agent.hunger > 55 && agent.hydration > 55 && agent.energy > 35) healthDelta += 0.035;
  agent.health = clamp(agent.health + healthDelta * dt, 0, 100);

  if (agent.health <= 0) {
    agent.alive = false;
    agent.action = "idle";
    agent.goal = "No active goal";
    agent.rationale = "Vital systems have failed.";
    agent.target = null;
    agent.velocity = { x: 0, z: 0 };
    world.stats.deaths += 1;
    pushEvent(
      world,
      "death",
      "critical",
      `${agent.name} could not survive the resource crisis.`,
      agent.id,
    );
  }
}

function isMovementAction(action: AgentAction): boolean {
  return (
    action === "gather_food" ||
    action === "gather_water" ||
    action === "gather_wood" ||
    action === "deposit" ||
    action === "share" ||
    action === "rescue" ||
    action === "build" ||
    action === "rest" ||
    action === "explore"
  );
}

function isActionValid(world: WorldState, agent: AgentState): boolean {
  if (!agent.alive) return false;
  switch (agent.action) {
    case "eat":
      return agent.inventory.food > EPSILON ||
        (isAtCamp(world, agent) && world.camp.storage.food > EPSILON);
    case "drink":
      return agent.inventory.water > EPSILON ||
        (isAtCamp(world, agent) && world.camp.storage.water > EPSILON);
    case "gather_food":
    case "gather_water":
    case "gather_wood": {
      const resource = agent.target
        ? world.resources.find((candidate) => candidate.id === agent.target?.id)
        : null;
      return Boolean(resource && resource.discovered && resource.amount > EPSILON) &&
        totalInventory(agent.inventory) < agent.capacity - EPSILON;
    }
    case "deposit":
      return totalInventory(agent.inventory) > EPSILON;
    case "share":
    case "rescue":
      return Boolean(
        agent.target &&
          world.agents.some((candidate) => candidate.id === agent.target?.id && candidate.alive) &&
          (agent.inventory.food > EPSILON || agent.inventory.water > EPSILON),
      );
    case "build":
      return world.camp.level < 4 && world.camp.storage.wood > EPSILON;
    case "explore":
      return Boolean(agent.target);
    default:
      return true;
  }
}

function chooseAction(world: WorldState, agent: AgentState, logDecision: boolean): void {
  const choices: ActionChoice[] = [
    {
      action: "idle",
      score: 1,
      goal: "Observe the habitat",
      rationale: "No urgent need currently outweighs waiting and watching.",
      target: null,
    },
  ];
  const atCamp = isAtCamp(world, agent);
  const load = totalInventory(agent.inventory);
  const capacityRemaining = agent.capacity - load;
  const foodUrgency = 100 - agent.hunger;
  const waterUrgency = 100 - agent.hydration;
  const restUrgency = 100 - agent.energy;

  const knownFood = nearestResource(world, agent.position, "food");
  const knownWater = nearestResource(world, agent.position, "water");
  const knownWood = nearestResource(world, agent.position, "wood");

  if (agent.inventory.food > 0.08 || (atCamp && world.camp.storage.food > 0.08)) {
    choices.push({
      action: "eat",
      score: foodUrgency * 1.75 + agent.personality.caution * 14,
      goal: "Restore nourishment",
      rationale: `Nourishment is at ${Math.round(agent.hunger)}%; a ration is already within reach.`,
      target: atCamp && agent.inventory.food <= 0.08 ? campTarget(world.camp) : null,
    });
  } else if (knownFood) {
    choices.push({
      action: "gather_food",
      score: foodUrgency * 1.63 + roleBias(agent.role, "food"),
      goal: "Find something edible",
      rationale: `Nourishment is at ${Math.round(agent.hunger)}%; ${knownFood.id} is the best known food source.`,
      target: resourceTarget(knownFood),
    });
  }

  if (agent.inventory.water > 0.08 || (atCamp && world.camp.storage.water > 0.08)) {
    choices.push({
      action: "drink",
      score: waterUrgency * 2 + agent.personality.caution * 16,
      goal: "Restore hydration",
      rationale: `Hydration is at ${Math.round(agent.hydration)}%; clean water is available now.`,
      target: atCamp && agent.inventory.water <= 0.08 ? campTarget(world.camp) : null,
    });
  } else if (knownWater) {
    choices.push({
      action: "gather_water",
      score: waterUrgency * 1.88 + roleBias(agent.role, "water"),
      goal: "Secure drinking water",
      rationale: `Hydration is at ${Math.round(agent.hydration)}%; ${knownWater.id} is the safest known source.`,
      target: resourceTarget(knownWater),
    });
  }

  choices.push({
    action: "rest",
    score: restUrgency * 1.28 + agent.personality.caution * 5,
    goal: "Recover at the shelter",
    rationale: `Energy is at ${Math.round(agent.energy)}%; the camp shelter offers the safest recovery.`,
    target: campTarget(world.camp),
  });

  const rescueTarget = mostDistressedAlly(world, agent);
  if (
    rescueTarget &&
    (agent.inventory.food > 0.12 || agent.inventory.water > 0.12)
  ) {
    const distress = allyDistress(rescueTarget);
    choices.push({
      action: "rescue",
      score:
        distress * 1.45 +
        agent.personality.cooperation * 42 +
        (agent.role === "caretaker" ? 38 : 0),
      goal: `Stabilize ${rescueTarget.name}`,
      rationale: `${rescueTarget.name}'s vital meters are critical; immediate aid takes priority.`,
      target: agentTarget(rescueTarget),
    });
  }

  const shareTarget = mostShareableAlly(world, agent);
  if (shareTarget) {
    const needGap = Math.max(
      agent.hunger - shareTarget.hunger,
      agent.hydration - shareTarget.hydration,
    );
    choices.push({
      action: "share",
      score:
        8 + needGap * 0.62 + agent.personality.cooperation * 30 +
        (agent.role === "caretaker" ? 22 : 0),
      goal: `Share supplies with ${shareTarget.name}`,
      rationale: `${shareTarget.name} has the greater immediate need, and cooperation improves group survival.`,
      target: agentTarget(shareTarget),
    });
  }

  if (load > 0.12) {
    const nearlyFull = load / agent.capacity;
    choices.push({
      action: "deposit",
      score:
        13 + load * 5.4 + nearlyFull * 22 +
        (agent.role === "quartermaster" ? 24 : 0),
      goal: "Return supplies to camp",
      rationale: `${round1(load)} units are ready to enter the shared stockpile.`,
      target: campTarget(world.camp),
    });
  }

  if (world.camp.level < 4 && world.camp.storage.wood > 0.08) {
    choices.push({
      action: "build",
      score:
        13 +
        world.camp.storage.wood * 0.55 +
        (world.camp.buildProgress > 0 ? 10 : 0) +
        agent.personality.industriousness * 10 +
        (agent.role === "builder" ? 38 : 0),
      goal: `Upgrade camp to level ${world.camp.level + 1}`,
      rationale: `${round1(world.camp.nextUpgradeCost - world.camp.buildProgress)} timber units remain in the current upgrade.`,
      target: campTarget(world.camp, "structure"),
    });
  }

  if (capacityRemaining > 0.2) {
    const foodDeficit = Math.max(0, 20 - world.camp.storage.food);
    const waterDeficit = Math.max(0, 24 - world.camp.storage.water);
    const woodDeficit = Math.max(0, 28 - world.camp.storage.wood);
    if (knownFood) {
      choices.push({
        action: "gather_food",
        score: 11 + foodDeficit * 1.05 + roleBias(agent.role, "food"),
        goal: "Provision the shared pantry",
        rationale: `Camp holds ${Math.floor(world.camp.storage.food)} food; this known patch can improve the reserve.`,
        target: resourceTarget(knownFood),
      });
    }
    if (knownWater) {
      choices.push({
        action: "gather_water",
        score: 11 + waterDeficit * 1.1 + roleBias(agent.role, "water"),
        goal: "Replenish the shared cistern",
        rationale: `Camp holds ${Math.floor(world.camp.storage.water)} water; the group needs a safer buffer.`,
        target: resourceTarget(knownWater),
      });
    }
    if (knownWood) {
      choices.push({
        action: "gather_wood",
        score: 10 + woodDeficit * 0.9 + roleBias(agent.role, "wood"),
        goal: "Gather timber for camp",
        rationale: `Camp holds ${Math.floor(world.camp.storage.wood)} timber; upgrades depend on a larger reserve.`,
        target: resourceTarget(knownWood),
      });
    }
  }

  choices.push({
    action: "explore",
    score:
      8 + agent.personality.curiosity * 20 + (agent.role === "scout" ? 31 : 0) +
      world.resources.filter((resource) => !resource.discovered).length * 0.12,
    goal: "Reveal the unknown basin",
    rationale: "Unmapped ground may contain the resources the camp needs next.",
    target:
      agent.action === "explore" && agent.target?.type === "point"
        ? { ...agent.target, position: copyVec(agent.target.position) }
        : explorationTarget(world, agent),
  });

  let best = choices[0];
  for (const choice of choices) {
    let score = choice.score;
    if (choice.action === agent.action && isActionValid(world, agent)) score += 8;
    if (score > best.score) best = { ...choice, score };
  }

  const previousAction = agent.action;
  const previousTarget = agent.target?.id ?? null;
  agent.action = best.action;
  agent.goal = best.goal;
  agent.rationale = best.rationale;
  agent.target = best.target;
  agent.actionTime = previousAction === best.action && previousTarget === best.target?.id
    ? agent.actionTime
    : 0;
  agent.decisionTimer = 0.85 + worldRandom(world) * 0.65;

  if (
    logDecision &&
    (previousAction !== agent.action || previousTarget !== agent.target?.id) &&
    (agent.action === "rescue" ||
      agent.action === "share" ||
      agent.action === "build" ||
      agent.action === "explore")
  ) {
    pushEvent(
      world,
      "decision",
      agent.action === "rescue" ? "warning" : "neutral",
      `${agent.name}: ${agent.goal}.`,
      agent.id,
      agent.target?.id ?? null,
    );
  }
}

function roleBias(role: AgentRole, resource: ResourceKind): number {
  if (role === "forager" && resource === "food") return 34;
  if (role === "hydrologist" && resource === "water") return 36;
  if (role === "builder" && resource === "wood") return 32;
  if (role === "quartermaster") return 15;
  return 0;
}

function resourceTarget(resource: ResourceNode): AgentTarget {
  return targetFor("resource", resource.id, RESOURCE_LABELS[resource.kind], resource.position);
}

function agentTarget(agent: AgentState): AgentTarget {
  return targetFor("agent", agent.id, agent.name, agent.position);
}

function nearestResource(
  world: WorldState,
  position: Vec2,
  kind: ResourceKind,
): ResourceNode | null {
  let best: ResourceNode | null = null;
  let bestCost = Number.POSITIVE_INFINITY;
  for (const resource of world.resources) {
    if (!resource.discovered || resource.kind !== kind || resource.amount <= 0.08) continue;
    const cost = distanceBetween(position, resource.position) - Math.min(3, resource.amount * 0.12);
    if (cost < bestCost) {
      best = resource;
      bestCost = cost;
    }
  }
  return best;
}

function allyDistress(agent: AgentState): number {
  return Math.max(
    100 - agent.health,
    (35 - agent.hunger) * 1.5,
    (35 - agent.hydration) * 1.75,
    (22 - agent.energy) * 0.8,
    0,
  );
}

function mostDistressedAlly(world: WorldState, actor: AgentState): AgentState | null {
  let target: AgentState | null = null;
  let distress = 24;
  for (const candidate of world.agents) {
    if (!candidate.alive || candidate.id === actor.id) continue;
    const candidateDistress = allyDistress(candidate);
    const canHelpHunger = candidate.hunger < 34 && actor.inventory.food > 0.12;
    const canHelpThirst = candidate.hydration < 34 && actor.inventory.water > 0.12;
    const canHelpHealth = candidate.health < 58 &&
      (actor.inventory.food > 0.12 || actor.inventory.water > 0.12);
    if ((canHelpHunger || canHelpThirst || canHelpHealth) && candidateDistress > distress) {
      target = candidate;
      distress = candidateDistress;
    }
  }
  return target;
}

function mostShareableAlly(world: WorldState, actor: AgentState): AgentState | null {
  let target: AgentState | null = null;
  let gap = 18;
  for (const candidate of world.agents) {
    if (!candidate.alive || candidate.id === actor.id) continue;
    const hungerGap = actor.inventory.food > 0.65 ? actor.hunger - candidate.hunger : 0;
    const hydrationGap = actor.inventory.water > 0.65 ? actor.hydration - candidate.hydration : 0;
    const candidateGap = Math.max(hungerGap, hydrationGap);
    if (candidateGap > gap) {
      target = candidate;
      gap = candidateGap;
    }
  }
  return target;
}

function explorationTarget(world: WorldState, agent: AgentState): AgentTarget {
  const angle = worldRandom(world) * TAU;
  const radius = 8 + worldRandom(world) * (world.map.halfSize - 10);
  // A small forward bias makes repeated exploration look intentional.
  const forwardX = Math.sin(agent.heading) * 3;
  const forwardZ = Math.cos(agent.heading) * 3;
  const position = {
    x: clamp(Math.cos(angle) * radius + forwardX, -world.map.halfSize + 1, world.map.halfSize - 1),
    z: clamp(Math.sin(angle) * radius + forwardZ, -world.map.halfSize + 1, world.map.halfSize - 1),
  };
  return targetFor("point", `survey-${world.tick}-${agent.id}`, "Unsurveyed ground", position);
}

function executeAction(world: WorldState, agent: AgentState, dt: number): void {
  agent.actionTime += dt;
  switch (agent.action) {
    case "eat":
      executeEat(world, agent, dt);
      break;
    case "drink":
      executeDrink(world, agent, dt);
      break;
    case "rest":
      executeRest(world, agent, dt);
      break;
    case "gather_food":
      executeHarvest(world, agent, "food", dt);
      break;
    case "gather_water":
      executeHarvest(world, agent, "water", dt);
      break;
    case "gather_wood":
      executeHarvest(world, agent, "wood", dt);
      break;
    case "deposit":
      executeDeposit(world, agent, dt);
      break;
    case "share":
      executeShare(world, agent, false, dt);
      break;
    case "rescue":
      executeShare(world, agent, true, dt);
      break;
    case "build":
      executeBuild(world, agent, dt);
      break;
    case "explore":
      executeExplore(world, agent, dt);
      break;
    default:
      dampVelocity(agent, dt);
      agent.energy = clamp(agent.energy + 0.025 * dt, 0, 100);
      break;
  }
}

function executeEat(world: WorldState, agent: AgentState, dt: number): void {
  dampVelocity(agent, dt);
  const desired = Math.min(0.82 * dt, Math.max(0, (100 - agent.hunger) / 20));
  let consumed = Math.min(desired, agent.inventory.food);
  agent.inventory.food -= consumed;
  if (consumed < desired && isAtCamp(world, agent)) {
    const fromCamp = Math.min(desired - consumed, world.camp.storage.food);
    world.camp.storage.food -= fromCamp;
    consumed += fromCamp;
  }
  agent.hunger = clamp(agent.hunger + consumed * 20, 0, 100);
  if (consumed <= EPSILON || agent.hunger >= 91) agent.decisionTimer = 0;
}

function executeDrink(world: WorldState, agent: AgentState, dt: number): void {
  dampVelocity(agent, dt);
  const desired = Math.min(0.9 * dt, Math.max(0, (100 - agent.hydration) / 24));
  let consumed = Math.min(desired, agent.inventory.water);
  agent.inventory.water -= consumed;
  if (consumed < desired && isAtCamp(world, agent)) {
    const fromCamp = Math.min(desired - consumed, world.camp.storage.water);
    world.camp.storage.water -= fromCamp;
    consumed += fromCamp;
  }
  agent.hydration = clamp(agent.hydration + consumed * 24, 0, 100);
  if (consumed <= EPSILON || agent.hydration >= 93) agent.decisionTimer = 0;
}

function executeRest(world: WorldState, agent: AgentState, dt: number): void {
  if (!isAtCamp(world, agent)) {
    moveToward(world, agent, world.camp.position, dt, world.camp.radius * 0.68);
    return;
  }
  dampVelocity(agent, dt);
  agent.energy = clamp(agent.energy + (2.55 + world.camp.shelterLevel * 0.72) * dt, 0, 100);
  agent.health = clamp(agent.health + 0.1 * world.camp.shelterLevel * dt, 0, 100);
  if (agent.energy >= 92) agent.decisionTimer = 0;
}

function executeHarvest(
  world: WorldState,
  agent: AgentState,
  kind: ResourceKind,
  dt: number,
): void {
  const resource = agent.target
    ? world.resources.find((candidate) => candidate.id === agent.target?.id)
    : null;
  if (!resource || resource.kind !== kind || resource.amount <= EPSILON) {
    agent.decisionTimer = 0;
    return;
  }
  if (!moveToward(world, agent, resource.position, dt, 0.78)) return;

  const remainingCapacity = Math.max(0, agent.capacity - totalInventory(agent.inventory));
  const baseRate = kind === "water" ? 1.42 : kind === "food" ? 1.12 : 0.88;
  const expertise =
    (agent.role === "forager" && kind === "food") ||
    (agent.role === "hydrologist" && kind === "water") ||
    (agent.role === "builder" && kind === "wood")
      ? 1.32
      : 1;
  const amount = Math.min(resource.amount, remainingCapacity, baseRate * expertise * dt);
  if (amount <= EPSILON) {
    agent.decisionTimer = 0;
    return;
  }

  resource.amount = Math.max(0, resource.amount - amount);
  agent.inventory[kind] += amount;
  agent.contribution.gathered += amount;
  world.stats.resourcesHarvested[kind] += amount;

  if (resource.amount <= EPSILON && resource.depletedAt === null) {
    resource.amount = 0;
    resource.depletedAt = world.time;
    pushEvent(
      world,
      "depleted",
      "warning",
      `${agent.name} exhausts ${resource.id}; the site will slowly recover.`,
      agent.id,
      resource.id,
      kind,
    );
  }
  if (resource.amount <= EPSILON || totalInventory(agent.inventory) >= agent.capacity - 0.04) {
    agent.decisionTimer = 0;
  }
}

function executeDeposit(world: WorldState, agent: AgentState, dt: number): void {
  if (!isAtCamp(world, agent)) {
    moveToward(world, agent, world.camp.position, dt, world.camp.radius * 0.68);
    return;
  }
  dampVelocity(agent, dt);
  const deposited = { ...agent.inventory };
  const total = totalInventory(deposited);
  if (total <= EPSILON) {
    agent.decisionTimer = 0;
    return;
  }
  for (const kind of ["food", "water", "wood"] as const) {
    const space = Math.max(0, STORAGE_LIMIT - world.camp.storage[kind]);
    const transfer = Math.min(agent.inventory[kind], space);
    world.camp.storage[kind] += transfer;
    agent.inventory[kind] -= transfer;
    world.stats.resourcesDeposited[kind] += transfer;
  }
  const actual = total - totalInventory(agent.inventory);
  agent.contribution.deposited += actual;
  if (actual > 0.05) {
    pushEvent(
      world,
      "deposit",
      "positive",
      `${agent.name} adds ${round1(actual)} supply units to the shared stores.`,
      agent.id,
      world.camp.id,
    );
  }
  agent.decisionTimer = 0;
}

function executeShare(
  world: WorldState,
  agent: AgentState,
  rescue: boolean,
  dt: number,
): void {
  const ally = agent.target
    ? world.agents.find((candidate) => candidate.id === agent.target?.id)
    : null;
  if (!ally || !ally.alive) {
    agent.decisionTimer = 0;
    return;
  }
  if (!moveToward(world, agent, ally.position, dt, 0.9)) return;

  const waterNeed = 100 - ally.hydration;
  const foodNeed = 100 - ally.hunger;
  let kind: "food" | "water" | null = null;
  if (agent.inventory.water > 0.08 && (waterNeed >= foodNeed || agent.inventory.food <= 0.08)) {
    kind = "water";
  } else if (agent.inventory.food > 0.08) {
    kind = "food";
  }
  if (!kind) {
    agent.decisionTimer = 0;
    return;
  }

  const amount = Math.min(rescue ? 1.15 : 0.85, agent.inventory[kind]);
  agent.inventory[kind] -= amount;
  if (rescue) {
    if (kind === "food") ally.hunger = clamp(ally.hunger + amount * 23, 0, 100);
    else ally.hydration = clamp(ally.hydration + amount * 28, 0, 100);
    ally.health = clamp(ally.health + amount * 8, 0, 100);
    agent.contribution.rescues += 1;
  } else {
    ally.inventory[kind] += amount;
  }
  agent.contribution.shared += amount;
  world.stats.resourcesShared += amount;
  pushEvent(
    world,
    rescue ? "rescue" : "share",
    rescue ? "positive" : "neutral",
    rescue
      ? `${agent.name} reaches ${ally.name} with emergency ${kind}.`
      : `${agent.name} shares ${round1(amount)} ${kind} with ${ally.name}.`,
    agent.id,
    ally.id,
    kind,
  );
  ally.decisionTimer = 0;
  agent.decisionTimer = 0;
}

function executeBuild(world: WorldState, agent: AgentState, dt: number): void {
  if (!isAtCamp(world, agent)) {
    moveToward(world, agent, world.camp.position, dt, world.camp.radius * 0.7);
    return;
  }
  dampVelocity(agent, dt);
  const expertise = agent.role === "builder" ? 1.42 : 1;
  const amount = Math.min(world.camp.storage.wood, 0.62 * expertise * dt);
  if (amount <= EPSILON) {
    agent.decisionTimer = 0;
    return;
  }
  world.camp.storage.wood -= amount;
  world.camp.buildProgress += amount;
  agent.contribution.builds += amount;

  if (world.camp.buildProgress + EPSILON >= world.camp.nextUpgradeCost) {
    world.camp.buildProgress = 0;
    world.camp.level += 1;
    world.camp.shelterLevel = world.camp.level;
    if (world.camp.level >= 2) world.camp.waterCollectorLevel = world.camp.level - 1;
    if (world.camp.level >= 3) world.camp.gardenLevel = world.camp.level - 2;
    world.camp.nextUpgradeCost = 14 + (world.camp.level - 1) * 9;
    world.stats.campUpgrades += 1;
    pushEvent(
      world,
      "build",
      "positive",
      `${agent.name} completes Hearth Camp level ${world.camp.level}.`,
      agent.id,
      world.camp.id,
      "wood",
    );
    agent.decisionTimer = 0;
  }
}

function executeExplore(world: WorldState, agent: AgentState, dt: number): void {
  if (!agent.target) {
    agent.decisionTimer = 0;
    return;
  }
  if (moveToward(world, agent, agent.target.position, dt, 0.62)) {
    dampVelocity(agent, dt);
    agent.decisionTimer = 0;
  }
}

function moveToward(
  world: WorldState,
  agent: AgentState,
  target: Vec2,
  dt: number,
  stopDistance: number,
): boolean {
  let x = target.x - agent.position.x;
  let z = target.z - agent.position.z;
  const distance = Math.sqrt(x * x + z * z);
  if (distance <= stopDistance) {
    dampVelocity(agent, dt);
    return true;
  }

  x /= Math.max(distance, EPSILON);
  z /= Math.max(distance, EPSILON);
  let separationX = 0;
  let separationZ = 0;
  for (const other of world.agents) {
    if (!other.alive || other.id === agent.id) continue;
    const offsetX = agent.position.x - other.position.x;
    const offsetZ = agent.position.z - other.position.z;
    const squared = offsetX * offsetX + offsetZ * offsetZ;
    if (squared > EPSILON && squared < 1.35 * 1.35) {
      const neighborDistance = Math.sqrt(squared);
      const force = (1.35 - neighborDistance) / 1.35;
      separationX += (offsetX / neighborDistance) * force;
      separationZ += (offsetZ / neighborDistance) * force;
    }
  }

  let directionX = x + separationX * 0.78;
  let directionZ = z + separationZ * 0.78;
  const directionLength = Math.sqrt(directionX * directionX + directionZ * directionZ) || 1;
  directionX /= directionLength;
  directionZ /= directionLength;
  const condition = 0.54 + agent.energy / 217;
  const speed = agent.speed * condition;
  const desiredX = directionX * speed;
  const desiredZ = directionZ * speed;
  const response = 1 - Math.exp(-7 * dt);
  agent.velocity.x += (desiredX - agent.velocity.x) * response;
  agent.velocity.z += (desiredZ - agent.velocity.z) * response;

  const border = world.map.halfSize - 0.55;
  agent.position.x = clamp(agent.position.x + agent.velocity.x * dt, -border, border);
  agent.position.z = clamp(agent.position.z + agent.velocity.z * dt, -border, border);
  if (Math.abs(agent.velocity.x) + Math.abs(agent.velocity.z) > 0.015) {
    agent.heading = Math.atan2(agent.velocity.x, agent.velocity.z);
  }
  return distanceBetween(agent.position, target) <= stopDistance;
}

function dampVelocity(agent: AgentState, dt: number): void {
  const damping = Math.exp(-9 * dt);
  agent.velocity.x *= damping;
  agent.velocity.z *= damping;
  if (Math.abs(agent.velocity.x) < 0.001) agent.velocity.x = 0;
  if (Math.abs(agent.velocity.z) < 0.001) agent.velocity.z = 0;
}

function revealNearbyResources(world: WorldState, agent: AgentState): void {
  const radius = agent.role === "scout" ? 7.4 : 5.15;
  const found: ResourceNode[] = [];
  for (const resource of world.resources) {
    if (!resource.discovered && distanceBetween(agent.position, resource.position) <= radius) {
      resource.discovered = true;
      found.push(resource);
    }
  }
  if (found.length === 0) return;

  agent.contribution.discoveries += found.length;
  world.stats.discoveries += found.length;
  const kinds = (["food", "water", "wood"] as const)
    .filter((kind) => found.some((resource) => resource.kind === kind))
    .map((kind) => RESOURCE_LABELS[kind].toLowerCase());
  pushEvent(
    world,
    "discover",
    "positive",
    `${agent.name} maps ${found.length} new site${found.length === 1 ? "" : "s"}: ${kinds.join(", ")}.`,
    agent.id,
    found[0].id,
    found.length === 1 ? found[0].kind : null,
  );
  agent.decisionTimer = 0;
}

function isAtCamp(world: WorldState, agent: AgentState): boolean {
  return distanceBetween(agent.position, world.camp.position) <= world.camp.radius;
}

function pushEvent(
  world: WorldState,
  type: SimulationEventType,
  tone: EventTone,
  message: string,
  agentId: string | null = null,
  targetId: string | null = null,
  resourceKind: ResourceKind | null = null,
): void {
  world.events.push({
    id: world.nextEventId,
    time: world.time,
    day: world.day,
    type,
    tone,
    message,
    agentId,
    targetId,
    resourceKind,
  });
  world.nextEventId += 1;
  if (world.events.length > MAX_EVENTS) {
    world.events.splice(0, world.events.length - MAX_EVENTS);
  }
}

export function getAgentById(world: WorldState, id: string): AgentState | undefined {
  return world.agents.find((agent) => agent.id === id);
}

export function getWorldSummary(world: WorldState): WorldSummary {
  const living = world.agents.filter((agent) => agent.alive);
  const averageHealth = living.length === 0
    ? 0
    : living.reduce((sum, agent) => sum + agent.health, 0) / living.length;
  return {
    day: world.day,
    timeOfDay: world.timeOfDay,
    aliveAgents: living.length,
    totalAgents: world.agents.length,
    criticalAgents: living.filter(
      (agent) =>
        agent.health < 45 || agent.hunger < 20 || agent.hydration < 20 || agent.energy < 15,
    ).length,
    averageHealth,
    campLevel: world.camp.level,
    storage: { ...world.camp.storage },
    discoveredResources: world.resources.filter((resource) => resource.discovered).length,
    totalResources: world.resources.length,
  };
}

export function getTimeLabel(world: Pick<WorldState, "day" | "timeOfDay">): string {
  const totalMinutes = Math.floor(world.timeOfDay * 24 * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `DAY ${String(world.day).padStart(3, "0")} · ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function getNeedLabel(value: number): "stable" | "watch" | "low" | "critical" {
  if (value >= 62) return "stable";
  if (value >= 38) return "watch";
  if (value >= 18) return "low";
  return "critical";
}
