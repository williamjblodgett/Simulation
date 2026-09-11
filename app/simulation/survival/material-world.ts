import { feedstockKinds, mergeFeedstocks, type GeologicalFeedstock } from "./geology";
import type { MaterialBatch, MaterialOperation, MaterialProcessResult, MaterialProvenance, MaterialWorld, ToolForm } from "./material-types";
import type { SurvivalAgent, SurvivalEnvironment, SurvivalResourceKind } from "./types";

export const MATERIAL_PROCESS_LIMITS = Object.freeze({ batches: 128, records: 96, operationDuration: 24, operationMass: 8 });
const round = (value: number) => Math.round(value * 1_000_000) / 1_000_000;
const clip = (value: number, minimum = 0, maximum = 1) => Math.max(minimum, Math.min(maximum, value));
const finite = (value: unknown, minimum: number, maximum: number) => typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
const batchId = (value: unknown) => typeof value === "string" && /^material-batch-[1-9]\d*$/.test(value);

/** Exact authoritative simplifications. This table is never imported by policy code. */
const REDUCTION_RULES: Partial<Record<GeologicalFeedstock, { family: "iron" | "copper"; grade: number; onsetC: number; usefulC: number; carbonRatio: number }>> = {
  iron_ore: { family: "iron", grade: 0.38, onsetC: 820, usefulC: 1_080, carbonRatio: 0.2 },
  copper_ore: { family: "copper", grade: 0.2, onsetC: 610, usefulC: 820, carbonRatio: 0.12 },
};

export function freshMaterialWorld(): MaterialWorld {
  return { version: 1, nextId: 1, batches: [], records: [], operations: 0, failedOperations: 0, tests: 0, consumed: { wood: 0, stone: 0, clay: 0 }, consumedFeedstocks: {} };
}

export function provenanceMass(provenance: MaterialProvenance): number {
  return round((provenance.wood ?? 0) + (provenance.stone ?? 0) + (provenance.clay ?? 0));
}

function mergeProvenance(...entries: MaterialProvenance[]): MaterialProvenance {
  const result: MaterialProvenance = {};
  for (const entry of entries) {
    for (const key of ["wood", "stone", "clay"] as const) if (entry[key]) result[key] = round((result[key] ?? 0) + entry[key]!);
    if (entry.feedstocks) result.feedstocks = mergeFeedstocks(result.feedstocks, entry.feedstocks);
  }
  return result;
}

function splitProvenance(provenance: MaterialProvenance, masses: number[]): MaterialProvenance[] {
  const total = masses.reduce((sum, mass) => sum + mass, 0);
  const result = masses.map(() => ({} as MaterialProvenance));
  const distribute = (amount: number, assign: (target: MaterialProvenance, value: number) => void) => {
    let assigned = 0;
    masses.forEach((mass, index) => {
      const value = index === masses.length - 1 ? round(amount - assigned) : round(amount * mass / total);
      assigned = round(assigned + value);
      if (value > 0) assign(result[index], value);
    });
  };
  for (const key of ["wood", "stone", "clay"] as const) if (provenance[key]) distribute(provenance[key]!, (target, value) => { target[key] = value; });
  for (const kind of feedstockKinds) if (provenance.feedstocks?.[kind]) distribute(provenance.feedstocks[kind]!, (target, value) => { target.feedstocks ??= {}; target.feedstocks[kind] = value; });
  return result;
}

function operationEffort(operation: MaterialOperation): number {
  switch (operation.kind) {
    case "prepare_charcoal": return 2.2;
    case "concentrate_ore": return 2.6 + operation.separation * 1.4;
    case "form_hearth": return 4.4;
    case "fire_clay": return 2.8;
    case "reduce_ore": return 4.8 + operation.airflow * 1.2;
    case "work_metal": return 4.2 + operation.work * 1.4;
    case "test_tool": return 1.2 + operation.force * 0.6;
  }
}

export function validMaterialOperation(value: unknown): value is MaterialOperation {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const operation = value as Record<string, unknown>;
  const duration = finite(operation.duration, 1, MATERIAL_PROCESS_LIMITS.operationDuration) && Number.isInteger(operation.duration);
  if (!duration) return false;
  switch (operation.kind) {
    case "prepare_charcoal": return finite(operation.wood, 0.5, 4) && finite(operation.cover, 0, 1);
    case "concentrate_ore": return typeof operation.sourceId === "string" && finite(operation.mass, 0.5, 4) && finite(operation.separation, 0, 1);
    case "form_hearth": return finite(operation.clay, 0.5, 3) && batchId(operation.charcoalId) && finite(operation.wallThickness, 0.08, 0.5);
    case "fire_clay": return finite(operation.clay, 0.25, 3) && batchId(operation.charcoalId) && batchId(operation.hearthId);
    case "reduce_ore": return batchId(operation.concentrateId) && batchId(operation.charcoalId) && batchId(operation.hearthId) && finite(operation.airflow, 0, 1);
    case "work_metal": return batchId(operation.bloomId) && batchId(operation.charcoalId) && batchId(operation.hearthId) && ["cutting_edge", "hammer_head"].includes(String(operation.form)) && finite(operation.work, 0, 1);
    case "test_tool": return batchId(operation.toolId) && ["wood", "stone"].includes(String(operation.medium)) && finite(operation.force, 0.1, 2);
    default: return false;
  }
}

function next(world: MaterialWorld, prefix: "batch" | "reading" | "record"): string {
  return `material-${prefix}-${world.nextId++}`;
}

type Output = Omit<MaterialBatch, "id" | "ownerId" | "createdAt" | "position" | "provenance"> & { ownerId?: string | null };

function addOutputs(world: MaterialWorld, agent: SurvivalAgent, tick: number, provenance: MaterialProvenance, outputs: Output[]): string[] {
  const masses = outputs.map((output) => round(output.mass));
  const portions = splitProvenance(provenance, masses);
  return outputs.map((output, index) => {
    const id = next(world, "batch");
    world.batches.push({ ...output, id, ownerId: output.ownerId === undefined ? agent.id : output.ownerId, createdAt: tick, position: { ...agent.position }, provenance: portions[index] });
    return id;
  });
}

function ownedBatch(world: MaterialWorld, agent: SurvivalAgent, id: string, kinds: MaterialBatch["kind"][]): MaterialBatch | null {
  const batch = world.batches.find((candidate) => candidate.id === id && candidate.ownerId === agent.id && kinds.includes(candidate.kind));
  if (!batch || (!batch.portable && Math.hypot(batch.position.x - agent.position.x, batch.position.z - agent.position.z) > 4)) return null;
  return batch;
}

function removeBatches(world: MaterialWorld, ids: string[]): void {
  const removed = new Set(ids);
  world.batches = world.batches.filter((batch) => !removed.has(batch.id));
}

function applyWear(batch: MaterialBatch, amount: number): boolean {
  if (batch.durability === null) return false;
  batch.durability = round(Math.max(0, batch.durability - amount));
  batch.uses++;
  batch.condition = clip(batch.durability / (batch.kind === "hearth" ? 36 : 70));
  const broke = batch.durability <= 0;
  if (broke && (batch.kind === "tool" || batch.kind === "hearth")) {
    batch.kind = "scrap";
    batch.form = null;
    batch.quality = round(batch.quality * 0.5);
  }
  return broke;
}

function consumeInventory(agent: SurvivalAgent, kind: "wood" | "stone" | "clay", amount: number): void {
  agent.inventory[kind] = round(agent.inventory[kind] - amount);
  if (agent.inventory[kind] <= 0 && agent.materialSamples) delete agent.materialSamples[kind];
}

function fail(summary: string, duration: number): MaterialProcessResult {
  return { accepted: false, supported: false, summary, duration, effort: 0, temperatureC: null, solidYield: 0, wasteMass: 0, inputIds: [], outputIds: [], reading: null };
}

function finalize(
  world: MaterialWorld,
  agent: SurvivalAgent,
  tick: number,
  operation: MaterialOperation,
  result: Omit<MaterialProcessResult, "accepted" | "duration" | "effort">,
): MaterialProcessResult {
  const complete: MaterialProcessResult = { accepted: true, duration: operation.duration, effort: round(operationEffort(operation)), ...result };
  agent.needs.energy = round(Math.max(0, agent.needs.energy - complete.effort));
  world.operations++;
  if (!complete.supported) world.failedOperations++;
  if (operation.kind === "test_tool") world.tests++;
  const record = { ...structuredClone(complete), id: next(world, "record"), tick, agentId: agent.id, operation: structuredClone(operation) };
  world.records = [...world.records, record].slice(-MATERIAL_PROCESS_LIMITS.records);
  return complete;
}

/**
 * Authoritative executor. Desired outcomes and private predictions are absent;
 * only typed inputs and world state determine the result.
 */
export function executeMaterialOperation(
  world: MaterialWorld,
  agent: SurvivalAgent,
  operation: MaterialOperation,
  environment: SurvivalEnvironment,
  tick: number,
): MaterialProcessResult {
  if (!agent.alive || agent.needs.health <= 0) return fail("A dead agent cannot perform material work.", Number((operation as { duration?: number }).duration ?? 0));
  if (!validMaterialOperation(operation)) return fail("Invalid material operation; no inventory, batch, effort or world state changed.", Number((operation as { duration?: number }).duration ?? 0));
  const effort = operationEffort(operation);
  if (agent.needs.energy < effort + 12) return fail("The operation was deferred because the required physiological reserve was unavailable.", operation.duration);

  if (operation.kind === "prepare_charcoal") {
    if (agent.inventory.wood < operation.wood || world.batches.length + 2 > MATERIAL_PROCESS_LIMITS.batches) return fail("Charcoal preparation needs the proposed wood and two free material records.", operation.duration);
    const quality = clip(1 - Math.abs(operation.cover - 0.72) * 1.7);
    const charcoalMass = round(operation.wood * (0.16 + quality * 0.18));
    const exhaustMass = round(operation.wood - charcoalMass);
    consumeInventory(agent, "wood", operation.wood); world.consumed.wood = round(world.consumed.wood + operation.wood);
    const temperatureC = round(360 + quality * 250 + operation.wood * 18);
    const outputIds = addOutputs(world, agent, tick, { wood: operation.wood }, [
      { portable: true, kind: "charcoal", family: "carbon", mass: charcoalMass, temperatureC, condition: 1, quality, durability: null, uses: 0, chemistry: { carbon: 0.65 + quality * 0.25, metal: 0, gangue: 0.1 }, feedstock: null, form: null },
      { ownerId: null, portable: false, kind: "exhaust", family: "mixed", mass: exhaustMass, temperatureC, condition: 1, quality: 0, durability: null, uses: 0, chemistry: { carbon: 0.12, metal: 0, gangue: 0.08 }, feedstock: null, form: null },
    ]);
    const reading = { id: next(world, "reading"), tick, agentId: agent.id, operation: operation.kind, metric: "solid_yield" as const, value: round(charcoalMass / operation.wood), unit: "fraction" as const, uncertainty: 0.12, inputIds: ["inventory:wood"], outputIds, summary: `Covered heating left ${charcoalMass.toFixed(2)} solid units from ${operation.wood.toFixed(2)} wood; gases and residue account for the remainder.` };
    return finalize(world, agent, tick, operation, { supported: quality > 0.35 && charcoalMass >= 0.12, summary: reading.summary, temperatureC, solidYield: reading.value, wasteMass: exhaustMass, inputIds: reading.inputIds, outputIds, reading });
  }

  if (operation.kind === "concentrate_ore") {
    const site = environment.resources.find((candidate) => candidate.id === operation.sourceId && candidate.feedstock);
    const feedstock = site?.feedstock;
    if (!feedstock || agent.materialSamples?.stone?.sourceId !== operation.sourceId || agent.inventory.stone < operation.mass || (agent.rawFeedstocks?.[feedstock] ?? 0) < operation.mass || world.batches.length + 2 > MATERIAL_PROCESS_LIMITS.batches) return fail("The proposed source-specific rock sample was unavailable or mixed; no rock was consumed.", operation.duration);
    const rule = REDUCTION_RULES[feedstock];
    const grade = rule?.grade ?? 0.015;
    const recovery = 0.52 + operation.separation * 0.4;
    const metalMass = operation.mass * grade * recovery;
    const retainedGangue = operation.mass * (1 - grade) * (0.2 + (1 - operation.separation) * 0.34);
    const concentrateMass = round(Math.min(operation.mass, metalMass + retainedGangue));
    const gangueMass = round(operation.mass - concentrateMass);
    consumeInventory(agent, "stone", operation.mass);
    agent.rawFeedstocks![feedstock] = round(agent.rawFeedstocks![feedstock]! - operation.mass);
    if (!agent.rawFeedstocks![feedstock]) delete agent.rawFeedstocks![feedstock];
    if (agent.materialSamples) delete agent.materialSamples.stone;
    world.consumed.stone = round(world.consumed.stone + operation.mass);
    world.consumedFeedstocks[feedstock] = round((world.consumedFeedstocks[feedstock] ?? 0) + operation.mass);
    const quality = clip((metalMass / Math.max(0.001, concentrateMass)) / Math.max(0.08, grade * 1.8));
    const family = rule?.family ?? "mineral";
    const outputIds = addOutputs(world, agent, tick, { stone: operation.mass, feedstocks: { [feedstock]: operation.mass } }, [
      { portable: true, kind: "concentrate", family, mass: concentrateMass, temperatureC: environment.temperatureC, condition: 1, quality, durability: null, uses: 0, chemistry: { carbon: 0, metal: round(metalMass / Math.max(concentrateMass, 0.001)), gangue: round(1 - metalMass / Math.max(concentrateMass, 0.001)) }, feedstock, form: null },
      { ownerId: null, portable: false, kind: "gangue", family: "mineral", mass: gangueMass, temperatureC: environment.temperatureC, condition: 1, quality: 0, durability: null, uses: 0, chemistry: { carbon: 0, metal: round((operation.mass * grade - metalMass) / Math.max(gangueMass, 0.001)), gangue: 0.98 }, feedstock, form: null },
    ]);
    const reading = { id: next(world, "reading"), tick, agentId: agent.id, operation: operation.kind, metric: "solid_yield" as const, value: round(concentrateMass / operation.mass), unit: "fraction" as const, uncertainty: 0.2, inputIds: [`site:${operation.sourceId}`], outputIds, summary: `Separation retained ${concentrateMass.toFixed(2)} denser units and left ${gangueMass.toFixed(2)} units of tailings; composition remains uncertain until further tests.` };
    return finalize(world, agent, tick, operation, { supported: Boolean(rule) && quality > 0.28, summary: reading.summary, temperatureC: environment.temperatureC, solidYield: reading.value, wasteMass: gangueMass, inputIds: reading.inputIds, outputIds, reading });
  }

  if (operation.kind === "form_hearth") {
    const charcoal = ownedBatch(world, agent, operation.charcoalId, ["charcoal"]);
    if (!charcoal || agent.inventory.clay < operation.clay || world.batches.length + 1 > MATERIAL_PROCESS_LIMITS.batches) return fail("A local charcoal batch and enough clay are required to form and fire the proposed hearth.", operation.duration);
    const inputs = operation.clay + charcoal.mass;
    const quality = clip(0.35 + operation.wallThickness * 1.3 + charcoal.quality * 0.3 - Math.abs(operation.wallThickness - 0.24) * 0.8);
    const hearthMass = round(inputs * (0.72 + quality * 0.12));
    const exhaustMass = round(inputs - hearthMass);
    const provenance = mergeProvenance({ clay: operation.clay }, charcoal.provenance);
    consumeInventory(agent, "clay", operation.clay); world.consumed.clay = round(world.consumed.clay + operation.clay); removeBatches(world, [charcoal.id]);
    const temperatureC = round(520 + charcoal.quality * 360);
    const outputIds = addOutputs(world, agent, tick, provenance, [
      { portable: false, kind: "hearth", family: "ceramic", mass: hearthMass, temperatureC, condition: 1, quality, durability: round(8 + quality * 28), uses: 0, chemistry: { carbon: 0.03, metal: 0, gangue: 0.92 }, feedstock: null, form: null },
      { ownerId: null, portable: false, kind: "exhaust", family: "mixed", mass: exhaustMass, temperatureC, condition: 1, quality: 0, durability: null, uses: 0, chemistry: { carbon: 0.18, metal: 0, gangue: 0.12 }, feedstock: null, form: null },
    ]);
    const reading = { id: next(world, "reading"), tick, agentId: agent.id, operation: operation.kind, metric: "temperature" as const, value: temperatureC, unit: "celsius" as const, uncertainty: 45, inputIds: [charcoal.id, "inventory:clay"], outputIds, summary: `The fired enclosure reached an estimated ${Math.round(temperatureC)} °C; wall geometry and later cycling still limit confidence.` };
    return finalize(world, agent, tick, operation, { supported: quality >= 0.45, summary: reading.summary, temperatureC, solidYield: round(hearthMass / inputs), wasteMass: exhaustMass, inputIds: reading.inputIds, outputIds, reading });
  }

  if (operation.kind === "fire_clay") {
    const charcoal = ownedBatch(world, agent, operation.charcoalId, ["charcoal"]), hearth = ownedBatch(world, agent, operation.hearthId, ["hearth"]);
    if (!charcoal || !hearth || agent.inventory.clay < operation.clay || world.batches.length + 1 > MATERIAL_PROCESS_LIMITS.batches) return fail("Clay firing needs clay, a local hearth and a charcoal charge.", operation.duration);
    const temperatureC = round(Math.min(1_150, 470 + charcoal.mass * 780 + hearth.quality * 270 + operation.duration * 8));
    const fired = clip((temperatureC - 450) / 430) * clip(operation.duration / 8);
    const total = operation.clay + charcoal.mass, ceramicMass = round(total * (0.72 + fired * 0.08)), exhaustMass = round(total - ceramicMass);
    const provenance = mergeProvenance({ clay: operation.clay }, charcoal.provenance);
    consumeInventory(agent, "clay", operation.clay); world.consumed.clay = round(world.consumed.clay + operation.clay); removeBatches(world, [charcoal.id]);
    applyWear(hearth, 1);
    const outputIds = addOutputs(world, agent, tick, provenance, [
      { portable: true, kind: "ceramic", family: "ceramic", mass: ceramicMass, temperatureC, condition: fired > 0.2 ? 1 : 0.55, quality: fired, durability: round(4 + fired * 24), uses: 0, chemistry: { carbon: 0.02, metal: 0, gangue: 0.96 }, feedstock: null, form: null },
      { ownerId: null, portable: false, kind: "exhaust", family: "mixed", mass: exhaustMass, temperatureC, condition: 1, quality: 0, durability: null, uses: 0, chemistry: { carbon: 0.2, metal: 0, gangue: 0.08 }, feedstock: null, form: null },
    ]);
    const reading = { id: next(world, "reading"), tick, agentId: agent.id, operation: operation.kind, metric: "temperature" as const, value: temperatureC, unit: "celsius" as const, uncertainty: 38, inputIds: [charcoal.id, hearth.id, "inventory:clay"], outputIds, summary: `The clay charge reached about ${Math.round(temperatureC)} °C and produced a ${fired > 0.55 ? "coherent" : "weak or under-fired"} solid.` };
    return finalize(world, agent, tick, operation, { supported: fired > 0.55, summary: reading.summary, temperatureC, solidYield: round(ceramicMass / total), wasteMass: exhaustMass, inputIds: reading.inputIds, outputIds, reading });
  }

  if (operation.kind === "reduce_ore") {
    const concentrate = ownedBatch(world, agent, operation.concentrateId, ["concentrate", "roasted_ore"]), charcoal = ownedBatch(world, agent, operation.charcoalId, ["charcoal"]), hearth = ownedBatch(world, agent, operation.hearthId, ["hearth"]);
    if (!concentrate || !charcoal || !hearth || world.batches.length - 2 + 3 > MATERIAL_PROCESS_LIMITS.batches) return fail("Reduction needs one observed concentrate, a charcoal charge and a reachable hearth.", operation.duration);
    const rule = concentrate.feedstock ? REDUCTION_RULES[concentrate.feedstock] : undefined;
    const heatPotential = 430 + charcoal.mass * (720 + charcoal.quality * 360) + operation.airflow * 330 + hearth.quality * 250 + operation.duration * 10 - concentrate.mass * 65;
    const hearthLimit = 760 + hearth.quality * 510;
    const temperatureC = round(Math.min(hearthLimit, environment.temperatureC + heatPotential));
    const carbonAvailable = charcoal.mass * charcoal.chemistry.carbon;
    const requiredCarbon = concentrate.mass * (rule?.carbonRatio ?? 0.24);
    const thermal = rule ? clip((temperatureC - rule.onsetC) / Math.max(1, rule.usefulC - rule.onsetC)) : 0;
    const reduction = clip(thermal * clip(carbonAvailable / Math.max(0.01, requiredCarbon)) * clip(operation.duration / 9));
    const metalMass = concentrate.mass * concentrate.chemistry.metal * reduction;
    const total = concentrate.mass + charcoal.mass;
    const useful = Boolean(rule) && reduction > 0.42 && metalMass > 0.08;
    const bloomMass = useful ? round(Math.min(total * 0.55, metalMass + concentrate.mass * concentrate.chemistry.gangue * (0.05 + (1 - reduction) * 0.12))) : 0;
    const roastedMass = useful ? 0 : round(concentrate.mass * (0.86 + (1 - reduction) * 0.08));
    const slagMass = round(useful ? Math.min(total - bloomMass, concentrate.mass - bloomMass + charcoal.mass * 0.08) : Math.min(total - roastedMass, concentrate.mass * 0.05 + charcoal.mass * 0.08));
    const exhaustMass = round(total - bloomMass - roastedMass - slagMass);
    const provenance = mergeProvenance(concentrate.provenance, charcoal.provenance);
    removeBatches(world, [concentrate.id, charcoal.id]);
    applyWear(hearth, 1.1 + temperatureC / 1_500);
    const outputs: Output[] = [];
    if (useful) outputs.push({ portable: true, kind: "bloom", family: rule!.family, mass: bloomMass, temperatureC, condition: 1, quality: clip(metalMass / Math.max(0.001, bloomMass) * reduction), durability: null, uses: 0, chemistry: { carbon: round(Math.min(0.08, carbonAvailable / Math.max(bloomMass, 0.001) * 0.06)), metal: round(metalMass / Math.max(bloomMass, 0.001)), gangue: round(Math.max(0, 1 - metalMass / Math.max(bloomMass, 0.001))) }, feedstock: concentrate.feedstock, form: null });
    else outputs.push({ portable: true, kind: "roasted_ore", family: concentrate.family, mass: roastedMass, temperatureC, condition: 0.9, quality: clip(concentrate.quality * (0.85 + reduction * 0.1)), durability: null, uses: 0, chemistry: { ...concentrate.chemistry }, feedstock: concentrate.feedstock, form: null });
    outputs.push(
      { ownerId: null, portable: false, kind: "slag", family: "mixed", mass: slagMass, temperatureC, condition: 1, quality: 0, durability: null, uses: 0, chemistry: { carbon: 0.03, metal: round(useful ? Math.max(0, concentrate.chemistry.metal - metalMass / Math.max(concentrate.mass, 0.001)) : concentrate.chemistry.metal * 0.04), gangue: 0.9 }, feedstock: concentrate.feedstock, form: null },
      { ownerId: null, portable: false, kind: "exhaust", family: "mixed", mass: exhaustMass, temperatureC, condition: 1, quality: 0, durability: null, uses: 0, chemistry: { carbon: 0.35, metal: 0, gangue: 0.04 }, feedstock: concentrate.feedstock, form: null },
    );
    const outputIds = addOutputs(world, agent, tick, provenance, outputs);
    const reading = { id: next(world, "reading"), tick, agentId: agent.id, operation: operation.kind, metric: "metal_response" as const, value: round(reduction), unit: "fraction" as const, uncertainty: 0.18, inputIds: [concentrate.id, charcoal.id, hearth.id], outputIds, summary: useful ? `At about ${Math.round(temperatureC)} °C the charge produced ${bloomMass.toFixed(2)} units of a metal-rich bloom and ${slagMass.toFixed(2)} slag.` : `The charge reached about ${Math.round(temperatureC)} °C but retained mostly altered ore; fuel, heat, composition or duration was insufficient for a useful bloom.` };
    return finalize(world, agent, tick, operation, { supported: useful, summary: reading.summary, temperatureC, solidYield: round(bloomMass / total), wasteMass: round(slagMass + exhaustMass), inputIds: reading.inputIds, outputIds, reading });
  }

  if (operation.kind === "work_metal") {
    const bloom = ownedBatch(world, agent, operation.bloomId, ["bloom"]), charcoal = ownedBatch(world, agent, operation.charcoalId, ["charcoal"]), hearth = ownedBatch(world, agent, operation.hearthId, ["hearth"]);
    if (!bloom || !charcoal || !hearth || world.batches.length - 1 + 3 > MATERIAL_PROCESS_LIMITS.batches) return fail("Hot working needs a bloom, a fresh charcoal charge and a reachable hearth.", operation.duration);
    const temperatureC = round(Math.min(1_180, environment.temperatureC + 410 + charcoal.mass * 810 + hearth.quality * 230 + operation.duration * 9));
    const workable = clip((temperatureC - 540) / 430) * clip(0.3 + operation.work * 0.8);
    const quality = clip(bloom.quality * (0.68 + workable * 0.28));
    const total = bloom.mass + charcoal.mass, toolMass = round(Math.min(bloom.mass * (0.78 + workable * 0.12), total));
    const scaleMass = round(Math.min(total - toolMass, bloom.mass - toolMass + charcoal.mass * 0.1));
    const exhaustMass = round(total - toolMass - scaleMass);
    const provenance = mergeProvenance(bloom.provenance, charcoal.provenance);
    removeBatches(world, [bloom.id, charcoal.id]);
    applyWear(hearth, 1.2);
    const durability = round(5 + quality * 52 + operation.work * 12);
    const outputIds = addOutputs(world, agent, tick, provenance, [
      { portable: true, kind: "tool", family: bloom.family, mass: toolMass, temperatureC, condition: 1, quality, durability, uses: 0, chemistry: { ...bloom.chemistry }, feedstock: bloom.feedstock, form: operation.form },
      { ownerId: null, portable: false, kind: "scale", family: "mixed", mass: scaleMass, temperatureC, condition: 1, quality: 0, durability: null, uses: 0, chemistry: { carbon: 0.02, metal: bloom.chemistry.metal * 0.18, gangue: 0.7 }, feedstock: bloom.feedstock, form: null },
      { ownerId: null, portable: false, kind: "exhaust", family: "mixed", mass: exhaustMass, temperatureC, condition: 1, quality: 0, durability: null, uses: 0, chemistry: { carbon: 0.35, metal: 0, gangue: 0.03 }, feedstock: bloom.feedstock, form: null },
    ]);
    const supported = quality > 0.34 && workable > 0.35;
    const reading = { id: next(world, "reading"), tick, agentId: agent.id, operation: operation.kind, metric: "durability" as const, value: durability, unit: "durability_points" as const, uncertainty: 8, inputIds: [bloom.id, charcoal.id, hearth.id], outputIds, summary: `Hot working formed a ${operation.form.replaceAll("_", " ")} with ${durability.toFixed(1)} modeled durability points; only use can establish its work effect.` };
    return finalize(world, agent, tick, operation, { supported, summary: reading.summary, temperatureC, solidYield: round(toolMass / total), wasteMass: round(scaleMass + exhaustMass), inputIds: reading.inputIds, outputIds, reading });
  }

  const tool = ownedBatch(world, agent, operation.toolId, ["tool"]);
  if (!tool || tool.durability === null) return fail("The proposed tool was unavailable for a physical comparison.", operation.duration);
  const match = (tool.form === "cutting_edge" && operation.medium === "wood") || (tool.form === "hammer_head" && operation.medium === "stone");
  const multiplier = round(1 + (match ? tool.quality * 0.38 : tool.quality * 0.06));
  const wear = round(operation.force * (operation.medium === "stone" ? 2.2 : 1.15) * (1.25 - tool.quality * 0.45));
  applyWear(tool, wear);
  const reading = { id: next(world, "reading"), tick, agentId: agent.id, operation: operation.kind, metric: "tool_efficiency" as const, value: multiplier, unit: "multiplier" as const, uncertainty: 0.08, inputIds: [operation.toolId], outputIds: [operation.toolId], summary: `The comparison measured ${multiplier.toFixed(2)}× baseline work and ${wear.toFixed(2)} durability points of wear on ${operation.medium}.` };
  return finalize(world, agent, tick, operation, { supported: multiplier > 1.1, summary: reading.summary, temperatureC: tool.temperatureC, solidYield: 1, wasteMass: 0, inputIds: reading.inputIds, outputIds: reading.outputIds, reading });
}

export function syncPortableMaterials(world: MaterialWorld, agent: SurvivalAgent): void {
  for (const batch of world.batches) if (batch.ownerId === agent.id && batch.portable) batch.position = { ...agent.position };
}

/** Apply a real, degrading tool effect to gathering; no technology flag is read. */
export function applyMaterialTool(world: MaterialWorld | undefined, agent: SurvivalAgent, resource: SurvivalResourceKind): { multiplier: number; toolId: string | null; broke: boolean } {
  if (!world || resource === "freshwater") return { multiplier: 1, toolId: null, broke: false };
  const desired: ToolForm = resource === "stone" || resource === "clay" ? "hammer_head" : "cutting_edge";
  const tool = world.batches.filter((batch) => batch.ownerId === agent.id && batch.kind === "tool" && batch.form === desired && (batch.durability ?? 0) > 0)
    .sort((left, right) => right.quality - left.quality || left.id.localeCompare(right.id))[0];
  if (!tool) return { multiplier: 1, toolId: null, broke: false };
  const multiplier = round(1 + tool.quality * (desired === "cutting_edge" ? 0.3 : 0.22));
  const wear = round((desired === "hammer_head" ? 1.35 : 0.8) * (1.2 - tool.quality * 0.4));
  const broke = applyWear(tool, wear);
  return { multiplier, toolId: tool.id, broke };
}
