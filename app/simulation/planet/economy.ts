import {
  CAPABILITY_CATALOG,
  getCapabilityDefinition,
  getRecipeDefinition,
  getResourceDefinition,
  RESOURCE_CATALOG,
} from "./catalog";
import { coordinateToChunk, generatePlanetChunk } from "./geography";
import { rememberObservation } from "./mind";
import { deterministicUnit, stableId } from "./random";
import type {
  InventionProject,
  PlanetAgent,
  PlanetChunk,
  PlanetWorldState,
  RecipeDefinition,
  ResourceSite,
  SettlementState,
  StockMap,
} from "./types";

export interface EconomyActionResult {
  ok: boolean;
  reason: string;
  outputs: StockMap;
}

function hasCapabilities(available: readonly string[], required: readonly string[]): boolean {
  const known = new Set(available);
  return required.every((capability) => known.has(capability));
}

function combinedCapabilities(agent: PlanetAgent, settlement: SettlementState | undefined): string[] {
  return [...new Set([...agent.capabilities, ...(settlement?.capabilities ?? [])])];
}

export function getGeneratedChunk(world: PlanetWorldState, chunkX: number, chunkY: number): PlanetChunk {
  const generated = generatePlanetChunk(world.seed, chunkX, chunkY, RESOURCE_CATALOG);
  generated.resourceSites = generated.resourceSites.map((site) => world.modifiedResourceSites[site.id] ?? site);
  return generated;
}

export function discoverResourcesInChunk(
  world: PlanetWorldState,
  agentId: string,
  chunkX?: number,
  chunkY?: number,
): ResourceSite[] {
  const agent = world.agents.find(({ id }) => id === agentId);
  if (!agent || !agent.alive) return [];
  const agentChunk = coordinateToChunk(agent.coordinate);
  const chunk = getGeneratedChunk(world, chunkX ?? agentChunk.x, chunkY ?? agentChunk.y);
  const settlement = world.settlements.find(({ id }) => id === agent.homeSettlementId);
  const capabilities = combinedCapabilities(agent, settlement);
  const discoveries: ResourceSite[] = [];
  for (const site of chunk.resourceSites) {
    const definition = getResourceDefinition(site.resourceId);
    if (!definition || !hasCapabilities(capabilities, definition.discoveryRequirements)) continue;
    // Even a qualified survey can miss a subtle deposit. Repeated surveys are
    // reproducible because confidence derives from the agent's decision count.
    const visibility = definition.form === "biological" || definition.form === "water" ? 0.96 : 0.68;
    if (deterministicUnit(world.seed, agent.id, site.id, agent.mind.decisionSequence, "discover") > visibility) continue;
    const stored = world.modifiedResourceSites[site.id] ?? structuredClone(site);
    const discoveringEntityId = settlement?.id ?? agent.id;
    if (!stored.discoveredBy.includes(discoveringEntityId)) stored.discoveredBy.push(discoveringEntityId);
    stored.discoveredBy.sort();
    world.modifiedResourceSites[site.id] = stored;
    if (settlement && !settlement.knownResourceSiteIds.includes(site.id)) {
      settlement.knownResourceSiteIds.push(site.id);
      settlement.knownResourceSiteIds.sort();
    }
    rememberObservation(agent, {
      id: stableId("observation", world.seed, agent.id, site.id),
      kind: "resource",
      subjectId: site.id,
      learnedAt: world.time,
      coordinate: { ...site.coordinate },
      confidence: visibility,
      facts: { resourceId: site.resourceId, reserveEstimate: Math.round(site.reserve / 100) * 100 },
    });
    discoveries.push(stored);
  }
  if (discoveries.length > 0) {
    world.stats.discoveries += discoveries.length;
    world.revision += 1;
  }
  return discoveries;
}

export function extractResource(
  world: PlanetWorldState,
  agentId: string,
  siteId: string,
  requestedAmount = 1,
): EconomyActionResult {
  const agent = world.agents.find(({ id }) => id === agentId);
  const site = world.modifiedResourceSites[siteId];
  if (!agent || !agent.alive) return { ok: false, reason: "Agent is unavailable.", outputs: {} };
  if (!site || !site.discoveredBy.some((id) => id === agent.id || id === agent.homeSettlementId)) {
    return { ok: false, reason: "The agent has not discovered this resource.", outputs: {} };
  }
  const definition = getResourceDefinition(site.resourceId);
  if (!definition) return { ok: false, reason: "Unknown resource.", outputs: {} };
  const settlement = world.settlements.find(({ id }) => id === agent.homeSettlementId);
  if (!hasCapabilities(combinedCapabilities(agent, settlement), definition.extractionRequirements)) {
    return { ok: false, reason: `Missing extraction capability: ${definition.extractionRequirements.join(", ")}.`, outputs: {} };
  }
  const amount = Math.max(0, Math.min(site.reserve, requestedAmount, definition.yield.baseYield));
  if (amount <= 0) return { ok: false, reason: "The site is depleted.", outputs: {} };
  site.reserve -= amount;
  const destination = settlement?.stocks ?? agent.inventory;
  destination[site.resourceId] = (destination[site.resourceId] ?? 0) + amount;
  world.revision += 1;
  return { ok: true, reason: `Extracted ${amount} ${definition.name}.`, outputs: { [site.resourceId]: amount } };
}

export function canRunRecipe(
  world: PlanetWorldState,
  settlementId: string,
  agentId: string,
  recipeId: string,
  batches = 1,
): EconomyActionResult {
  const settlement = world.settlements.find(({ id }) => id === settlementId);
  const agent = world.agents.find(({ id }) => id === agentId);
  const recipeDefinition = getRecipeDefinition(recipeId);
  if (!settlement || !agent || !agent.alive || !recipeDefinition) {
    return { ok: false, reason: "Recipe, settlement, or agent is unavailable.", outputs: {} };
  }
  if (recipeDefinition.id.startsWith("extract_")) {
    return { ok: false, reason: "Extraction recipes require a discovered resource site.", outputs: {} };
  }
  if (!hasCapabilities(combinedCapabilities(agent, settlement), recipeDefinition.requiredCapabilities)) {
    return { ok: false, reason: `Missing capability: ${recipeDefinition.requiredCapabilities.join(", ")}.`, outputs: {} };
  }
  const missingFacility = recipeDefinition.requiredFacilities.find((facility) => (settlement.facilities[facility] ?? 0) < 1);
  if (missingFacility) return { ok: false, reason: `Missing facility: ${missingFacility}.`, outputs: {} };
  const batchCount = Math.max(1, Math.floor(batches));
  const missingStock = Object.entries(recipeDefinition.inputs).find(
    ([stockId, amount]) => (settlement.stocks[stockId] ?? 0) + 1e-9 < amount * batchCount,
  );
  if (missingStock) return { ok: false, reason: `Insufficient stock: ${missingStock[0]}.`, outputs: {} };
  return {
    ok: true,
    reason: "Recipe can run.",
    outputs: scaleStock(recipeDefinition.outputs, batchCount),
  };
}

function scaleStock(stock: StockMap, multiplier: number): StockMap {
  return Object.fromEntries(Object.entries(stock).map(([id, amount]) => [id, amount * multiplier]));
}

export function runRecipe(
  world: PlanetWorldState,
  settlementId: string,
  agentId: string,
  recipeId: string,
  batches = 1,
): EconomyActionResult {
  const check = canRunRecipe(world, settlementId, agentId, recipeId, batches);
  if (!check.ok) return check;
  const settlement = world.settlements.find(({ id }) => id === settlementId)!;
  const recipeDefinition = getRecipeDefinition(recipeId)!;
  const batchCount = Math.max(1, Math.floor(batches));
  for (const [stockId, amount] of Object.entries(recipeDefinition.inputs)) {
    settlement.stocks[stockId] = Math.max(0, (settlement.stocks[stockId] ?? 0) - amount * batchCount);
  }
  for (const [stockId, amount] of Object.entries(recipeDefinition.outputs)) {
    settlement.stocks[stockId] = (settlement.stocks[stockId] ?? 0) + amount * batchCount;
  }
  world.revision += 1;
  return { ok: true, reason: `Completed ${recipeDefinition.name}.`, outputs: check.outputs };
}

function knownMaterial(agent: PlanetAgent, materialId: string): boolean {
  return (agent.inventory[materialId] ?? 0) > 0
    || agent.mind.observations.some(
      (observation) => observation.kind === "resource" && observation.facts.resourceId === materialId,
    );
}

export interface InventionInput {
  purpose: string;
  materialIds: string[];
  processIds: string[];
}

/**
 * Create an open-ended but grounded project: every material must have been
 * observed and every process must be known. The generated capability is a
 * stable composition rather than a node at the end of a finite tree.
 */
export function createCompositionalInvention(
  world: PlanetWorldState,
  agentId: string,
  input: InventionInput,
): InventionProject | null {
  const agent = world.agents.find(({ id }) => id === agentId);
  if (!agent || !agent.alive || !input.purpose.trim()) return null;
  const materials = [...new Set(input.materialIds)].sort();
  const processes = [...new Set(input.processIds)].sort();
  if (materials.length === 0 || materials.some((material) => !knownMaterial(agent, material))) return null;
  if (processes.length === 0 || processes.some((process) => !agent.capabilities.includes(process))) return null;
  const sequence = world.nextIds.project++;
  const compositionHash = stableId("capability", world.seed, input.purpose, ...materials, ...processes);
  const project: InventionProject = {
    id: `project-${sequence}`,
    name: `${titleCase(input.purpose)} ${titleCase(materials[0])} Method`,
    sponsorAgentId: agent.id,
    settlementId: agent.homeSettlementId,
    purpose: input.purpose,
    materialIds: materials,
    processIds: processes,
    prerequisiteCapabilities: processes,
    generatedCapabilityId: compositionHash,
    evidence: 0,
    difficulty: Math.max(2, materials.length * 1.5 + processes.length * 2),
    attempts: 0,
    status: "hypothesis",
    createdAt: world.time,
    updatedAt: world.time,
  };
  world.projects.push(project);
  const settlement = world.settlements.find(({ id }) => id === agent.homeSettlementId);
  if (settlement && !settlement.projectIds.includes(project.id)) settlement.projectIds.push(project.id);
  world.revision += 1;
  return project;
}

function titleCase(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function advanceInvention(
  world: PlanetWorldState,
  projectId: string,
  agentId: string,
): InventionProject | null {
  const project = world.projects.find(({ id }) => id === projectId);
  const agent = world.agents.find(({ id }) => id === agentId);
  if (!project || !agent || !agent.alive || project.sponsorAgentId !== agent.id) return null;
  if (project.status === "institutionalized" || project.status === "failed") return project;
  project.attempts += 1;
  const skill = agent.mind.skills.research ?? 0;
  const evidenceGain = 0.7 + skill * 0.3 + deterministicUnit(world.seed, project.id, project.attempts) * 1.4;
  project.evidence += evidenceGain;
  project.updatedAt = world.time;
  agent.mind.skills.research = Math.min(10, skill + 0.08);
  const ratio = project.evidence / project.difficulty;
  project.status = ratio >= 2.2
    ? "institutionalized"
    : ratio >= 1.45
      ? "practiced"
      : ratio >= 0.8
        ? "prototype"
        : "experiment";
  if (project.status === "institutionalized") {
    if (!agent.capabilities.includes(project.generatedCapabilityId)) agent.capabilities.push(project.generatedCapabilityId);
    const settlement = world.settlements.find(({ id }) => id === project.settlementId);
    if (settlement && !settlement.capabilities.includes(project.generatedCapabilityId)) {
      settlement.capabilities.push(project.generatedCapabilityId);
    }
    world.stats.inventions += 1;
  }
  world.revision += 1;
  return project;
}

export function nextReferenceCapability(agent: PlanetAgent, settlement?: SettlementState): string | null {
  const known = new Set(combinedCapabilities(agent, settlement));
  return CAPABILITY_CATALOG.map(({ id }) => id).find((id) => {
    if (known.has(id)) return false;
    const capability = getCapabilityDefinition(id);
    return capability?.prerequisites.every((prerequisite) => known.has(prerequisite)) ?? false;
  }) ?? null;
}

export function recipeProductionChain(targetStockId: string): RecipeDefinition[] {
  const result: RecipeDefinition[] = [];
  const visited = new Set<string>();
  const visitStock = (stockId: string) => {
    if (visited.has(stockId)) return;
    visited.add(stockId);
    const producer = [
      "purify_water", "preserve_food", "mill_grain", "saw_lumber", "make_textiles", "tan_hides",
      "fire_brick", "make_glass", "make_cement", "mix_concrete", "smelt_copper", "smelt_tin",
      "cast_bronze", "smelt_iron", "make_steel", "make_fertilizer", "distill_crude", "crack_naphtha",
      "coal_power", "gas_power", "solar_power", "wind_power", "hydro_power", "make_hydrogen",
      "make_battery", "refine_silicon", "make_electronics", "prepare_medicine", "build_machinery",
    ].map(getRecipeDefinition).find((recipeDefinition) => recipeDefinition && recipeDefinition.outputs[stockId] !== undefined);
    if (!producer) return;
    for (const inputId of Object.keys(producer.inputs)) visitStock(inputId);
    result.push(producer);
  };
  visitStock(targetStockId);
  return result;
}
