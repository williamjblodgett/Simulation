import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_AGENT_RELATIONSHIPS,
  MAX_POPULATION,
  MAX_RETAINED_HISTORICAL_AGENTS,
  catchUpCivilizationInPlace,
  catchUpCivilization,
  createCivilizationWorld,
  getGeneratedCivilizationEvents,
  isCompactCivilizationWorld,
  normalizeCivilizationWorld,
  simulateCivilization,
  validateCivilizationWorld,
} from "../app/simulation/civilization-engine.ts";

function populatedWorld(population, seed = "population-cap-fixture") {
  const world = createCivilizationWorld(seed);
  const founders = structuredClone(world.agents);
  const template = founders[0];
  world.agents = Array.from({ length: population }, (_, index) => {
    const ordinal = index + 1;
    const agent = structuredClone(founders[index] ?? template);
    agent.id = `agent-${String(ordinal).padStart(4, "0")}`;
    agent.name = `Agent ${String(ordinal).padStart(4, "0")}`;
    agent.alive = true;
    agent.deathDay = null;
    agent.parentIds = [];
    agent.childrenIds = [];
    agent.relationships = {};
    agent.campId = world.camps[index % world.camps.length].id;
    return agent;
  });
  for (const camp of world.camps) {
    camp.memberIds = world.agents
      .filter((agent) => agent.campId === camp.id)
      .map((agent) => agent.id);
    camp.leaderId = camp.memberIds[0] ?? null;
  }
  world.nextAgentId = population + 1;
  world.stats.births = Math.max(0, population - founders.length);
  world.stats.peakPopulation = population;
  return world;
}

function prepareBirthAt(world, population) {
  for (const agent of world.agents) agent.campId = null;
  for (const camp of world.camps) camp.memberIds = [];
  const camp = world.camps[0];
  const parent = world.agents[0];
  const partner = world.agents[1];
  for (const agent of [parent, partner]) {
    agent.campId = camp.id;
    agent.position = { ...camp.position };
    agent.age = 20;
    agent.lastReproductionDay = -100;
    agent.health = 100;
    agent.hunger = 100;
    agent.hydration = 100;
    agent.energy = 100;
  }
  camp.memberIds = [parent.id, partner.id];
  camp.leaderId = parent.id;
  camp.storage = { food: 600, water: 600, wood: 600, ore: 600 };
  camp.structures = {
    shelter: 6,
    farm: 6,
    well: 6,
    walls: 0,
    workshop: 0,
    infirmary: 0,
    archive: 0,
    roads: 0,
    council: 0,
  };
  parent.action = "reproduce";
  parent.currentPlan = "grow_lineage";
  parent.target = {
    kind: "camp",
    id: camp.id,
    label: camp.name,
    position: { ...camp.position },
  };
  parent.actionProgress = 4.5;
  parent.decisionTimer = 100;
  world.time = 20 * 90;
  world.day = 21;
  world.nextWorldStrategyAt = world.time + 5;
  world.stats.peakPopulation = population;
  return parent.id;
}

test("the living population ceiling is 1,000 and survives JSON normalization", () => {
  assert.equal(MAX_POPULATION, 1_000);
  assert.equal(MAX_AGENT_RELATIONSHIPS, 16);
  assert.equal(MAX_RETAINED_HISTORICAL_AGENTS, 240);
  const atCap = populatedWorld(MAX_POPULATION);
  assert.equal(validateCivilizationWorld(atCap), true);
  assert.equal(isCompactCivilizationWorld(atCap), true);

  const restored = normalizeCivilizationWorld(JSON.stringify(atCap), "fallback");
  assert.equal(restored.seed, atCap.seed);
  assert.equal(restored.agents.filter((agent) => agent.alive).length, MAX_POPULATION);
  assert.equal(restored.agents.length, MAX_POPULATION);

  const overCap = populatedWorld(MAX_POPULATION + 1, "over-cap-fixture");
  assert.equal(validateCivilizationWorld(overCap), false);
});

test("a final birth reaches 1,000 but no action can exceed the cap", () => {
  const world = populatedWorld(MAX_POPULATION - 1, "birth-gate-fixture");
  const parentId = prepareBirthAt(world, MAX_POPULATION - 1);

  const atCap = simulateCivilization(world, 0.25);
  assert.equal(atCap.agents.filter((agent) => agent.alive).length, MAX_POPULATION);
  assert.equal(atCap.stats.births, world.stats.births + 1);

  const parent = atCap.agents.find((agent) => agent.id === parentId);
  assert.ok(parent);
  parent.action = "reproduce";
  parent.currentPlan = "grow_lineage";
  parent.actionProgress = 4.5;
  parent.decisionTimer = 100;
  parent.lastReproductionDay = -100;
  const stillAtCap = simulateCivilization(atCap, 0.25);
  assert.equal(stillAtCap.agents.filter((agent) => agent.alive).length, MAX_POPULATION);
  assert.equal(stillAtCap.stats.births, atCap.stats.births);
  assert.equal(validateCivilizationWorld(stillAtCap), true);
});

test("normalization keeps a bounded dead archive, nearby ancestry, and belief founders", () => {
  const world = populatedWorld(1, "historical-retention-fixture");
  const living = world.agents[0];
  const template = structuredClone(living);
  const dead = Array.from({ length: 260 }, (_, index) => {
    const agent = structuredClone(template);
    agent.id = `historical-${String(index + 1).padStart(4, "0")}`;
    agent.name = `Historical ${index + 1}`;
    agent.alive = false;
    agent.health = 0;
    agent.deathDay = index + 1;
    agent.campId = null;
    agent.target = null;
    agent.parentIds = [];
    agent.childrenIds = [];
    agent.relationships = {};
    return agent;
  });
  const directParent = dead[0];
  directParent.childrenIds = [living.id];
  living.parentIds = [directParent.id];
  const beliefFounder = dead.at(-1);
  world.beliefs = [{
    id: "belief-0001",
    name: "The Recorded Path",
    color: "#ffffff",
    foundedDay: 1,
    founderAgentId: beliefFounder.id,
    originCampId: world.camps[0].id,
    parentBeliefId: null,
    tenets: ["ancestor_memory"],
    sacredSite: { ...world.camps[0].position },
    adherentIds: [],
    campIds: [],
    influence: 0,
    unity: 0,
    active: false,
    reformationCount: 0,
    schismCount: 0,
  }];
  world.nextBeliefId = 2;
  world.agents.push(...dead);
  world.stats.deaths = dead.length;
  world.nextAgentId = world.agents.length + 1;

  assert.equal(validateCivilizationWorld(world), true);
  const restored = normalizeCivilizationWorld(world);
  assert.equal(restored.agents.filter((agent) => !agent.alive).length, 240);
  assert.ok(restored.agents.some((agent) => agent.id === directParent.id));
  assert.ok(restored.agents.some((agent) => agent.id === beliefFounder.id));
  assert.equal(validateCivilizationWorld(restored), true);
});

test("relationship history is compacted without losing family or belief-founder links", () => {
  const world = populatedWorld(1, "relationship-compaction-fixture");
  const agent = world.agents[0];
  world.tick = 4_321;
  world.randomState = 987_654_321;
  agent.parentIds = ["important-parent"];
  agent.beliefId = "belief-0001";
  agent.relationships = Object.fromEntries(Array.from({ length: 180 }, (_, index) => [
    `contact-${String(index).padStart(3, "0")}`,
    { trust: 0.5, respect: 0.3, grievance: 0, lastInteractionDay: index },
  ]));
  agent.relationships["important-parent"] = { trust: 0.8, respect: 0.8, grievance: 0, lastInteractionDay: 0 };
  agent.relationships["important-founder"] = { trust: 0.7, respect: 0.9, grievance: 0, lastInteractionDay: 0 };
  world.beliefs = [{
    id: "belief-0001",
    name: "The Compact",
    color: "#ffffff",
    foundedDay: 1,
    founderAgentId: "important-founder",
    originCampId: world.camps[0].id,
    parentBeliefId: null,
    tenets: ["reciprocal_aid"],
    sacredSite: { ...world.camps[0].position },
    adherentIds: [agent.id],
    campIds: [world.camps[0].id],
    influence: 1,
    unity: 0.5,
    active: true,
    reformationCount: 0,
    schismCount: 0,
  }];

  const identityBefore = {
    seed: world.seed,
    tick: world.tick,
    randomState: world.randomState,
    agentIds: world.agents.map((candidate) => candidate.id),
    eventIds: world.majorEvents.map((event) => event.id),
    eventTitles: world.majorEvents.map((event) => event.title),
  };
  assert.equal(validateCivilizationWorld(world), true);
  assert.equal(isCompactCivilizationWorld(world), false);
  const restored = normalizeCivilizationWorld(world);
  assert.deepEqual({
    seed: restored.seed,
    tick: restored.tick,
    randomState: restored.randomState,
    agentIds: restored.agents.map((candidate) => candidate.id),
    eventIds: restored.majorEvents.map((event) => event.id),
    eventTitles: restored.majorEvents.map((event) => event.title),
  }, identityBefore);
  assert.equal(Object.keys(restored.agents[0].relationships).length, MAX_AGENT_RELATIONSHIPS);
  assert.ok(restored.agents[0].relationships["important-parent"]);
  assert.ok(restored.agents[0].relationships["important-founder"]);
  assert.equal(isCompactCivilizationWorld(restored), true);
});

test("1,000-agent exact and coarse catch-up remain finite and deterministic", () => {
  const world = populatedWorld(MAX_POPULATION, "large-catch-up-fixture");
  const exactLeft = catchUpCivilization(world, 1);
  const exactRight = catchUpCivilization(world, 1);
  assert.deepEqual(exactLeft, exactRight);
  const left = catchUpCivilization(world, 91);
  const right = catchUpCivilization(world, 91);
  assert.deepEqual(left, right);
  const owned = structuredClone(world);
  const inPlace = catchUpCivilizationInPlace(owned, 91);
  assert.equal(inPlace, owned);
  assert.deepEqual(inPlace, left);
  assert.deepEqual(
    getGeneratedCivilizationEvents(inPlace),
    getGeneratedCivilizationEvents(left),
  );
  assert.equal(validateCivilizationWorld(left), true);
  assert.ok(left.agents.every((agent) => Number.isFinite(agent.health)));
});

test("the transient journal retains generated events evicted from the display tail", () => {
  const world = populatedWorld(MAX_POPULATION, "generated-event-journal-fixture");
  for (const agent of world.agents) {
    agent.health = 0.001;
    agent.hunger = 0;
    agent.hydration = 0;
    agent.energy = 0;
  }
  world.nextWorldStrategyAt = 0;

  const result = catchUpCivilization(world, 0.25);
  const generated = getGeneratedCivilizationEvents(result);
  assert.ok(generated.length > result.majorEvents.length);
  assert.equal(result.majorEvents.length, 1_000);
  assert.equal(new Set(generated.map((event) => event.id)).size, generated.length);
  assert.equal(result.majorEvents.some((event) => event.id === generated[0].id), false);
  assert.equal(Object.hasOwn(JSON.parse(JSON.stringify(result)), "generatedEvents"), false);

  const callerCopy = [...generated];
  callerCopy.pop();
  assert.equal(getGeneratedCivilizationEvents(result).length, generated.length);
});
