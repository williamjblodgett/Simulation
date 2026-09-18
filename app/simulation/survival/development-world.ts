import { COMPONENT_AFFORDANCES, componentForms, componentMaterials, componentMass, componentMetric, operationEffort } from "./development-catalog";
import { DEVELOPMENT_LIMITS, type DevelopmentComponent, type DevelopmentOperation, type DevelopmentReading, type DevelopmentWorld, type ConnectionPort } from "./development-types";
import { mergeFeedstocks, splitFeedstocks } from "./geology";
import { canCollectFreshwater, depthAt, freshwaterFeatures, freshwaterFootprint } from "./water";
import type { SurvivalAgent, SurvivalPosition, SurvivalRunState, SurvivalResourceKind } from "./types";

const round = (n: number) => Math.round(n * 1e6) / 1e6;
const clip = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
const distance = (a: SurvivalPosition, b: SurvivalPosition) => Math.hypot(a.x - b.x, a.z - b.z);
const numeric = (n: unknown, lo: number, hi: number): n is number => typeof n === "number" && Number.isFinite(n) && n >= lo && n <= hi;
const text = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length < 200;
export const capacity = (c: DevelopmentComponent) => round(Math.max(.1, c.size ** 3 * (1 - Math.min(.85, c.thickness))));
export const freshDevelopmentWorld = (): DevelopmentWorld => ({ version: 1, nextId: 1, components: [], links: [], debited: {}, waste: {}, wasteFeedstocks: {}, water: { deposited: 0, withdrawn: 0, extracted: 0, leaked: 0, irrigated: 0 }, food: { deposited: 0, withdrawn: 0, grown: 0, spoiled: 0, seeds: 0 }, energy: { wind: 0, heat: 0, delivered: 0, lost: 0, fuelConsumed: 0 }, metrics: { operations: 0, rejected: 0, tests: 0, transfers: 0, repairs: 0, runningTicks: 0 } });

export function validDevelopmentOperation(value: unknown): value is DevelopmentOperation {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const op = value as Record<string, unknown>;
  if (op.kind === "form") return componentForms.includes(op.form as never) && componentMaterials.includes(op.material as never) && numeric(op.size, .6, 3) && numeric(op.thickness, .1, .65) && numeric(op.orientation, -Math.PI * 2, Math.PI * 2) && !!op.position && typeof op.position === "object" && numeric((op.position as SurvivalPosition).x, -1000, 1000) && numeric((op.position as SurvivalPosition).z, -1000, 1000) && Array.isArray(op.batchIds) && op.batchIds.length <= 3 && op.batchIds.every(text);
  if (op.kind === "connect") return text(op.from) && text(op.to) && ["mechanical", "electric", "water", "control"].includes(String(op.port)) && (op.metalBatchId === undefined || text(op.metalBatchId));
  if (!text(op.componentId)) return false;
  if (op.kind === "transfer") return ["freshwater", "food", "wood"].includes(String(op.resource)) && numeric(op.amount, .01, 10) && ["deposit", "withdraw"].includes(String(op.direction));
  if (op.kind === "treat") return numeric(op.fuel, .1, 5) && numeric(op.temperature, 300, 1500);
  if (op.kind === "test") return numeric(op.dose, .1, 2);
  if (op.kind === "tune") return numeric(op.setting, 0, 1);
  if (op.kind === "plant") return numeric(op.seeds, .05, .5);
  if (op.kind === "document") return text(op.procedureId);
  return ["repair", "reclaim", "read"].includes(String(op.kind));
}

function reachable(state: SurvivalRunState, a: SurvivalAgent, c: DevelopmentComponent) {
  return distance(a.position, c.position) <= 4 && depthAt(freshwaterFeatures(state.environment), a.position) === 0;
}
export function compatiblePort(a: DevelopmentComponent["form"], b: DevelopmentComponent["form"], port: ConnectionPort) {
  if (port === "mechanical") return ["rotor", "gear", "coil", "chamber"].includes(a) && ["gear", "shaft", "coil", "piston"].includes(b);
  if (port === "electric") return ["coil", "cell", "contact"].includes(a) && ["cell", "coil", "contact", "filament"].includes(b);
  if (port === "water") return ["vessel", "piston"].includes(a) && ["vessel", "bed", "chamber"].includes(b);
  return a === "contact" && ["rotor", "coil", "piston", "chamber"].includes(b);
}
function cycle(world: DevelopmentWorld, from: string, to: string, port: ConnectionPort) {
  const seen = new Set<string>(), todo = [to];
  const energy = ["electric", "mechanical"].includes(port);
  while (todo.length) { const id = todo.pop()!; if (id === from) return true; if (seen.has(id)) continue; seen.add(id); for (const link of world.links) if ((energy ? ["electric", "mechanical"].includes(link.port) : link.port === port) && link.from === id) todo.push(link.to); }
  return false;
}
function addStock(target: Partial<Record<SurvivalResourceKind, number>>, kind: SurvivalResourceKind, amount: number) { target[kind] = round((target[kind] ?? 0) + amount); }
function debit(world: DevelopmentWorld, a: SurvivalAgent, kind: SurvivalResourceKind, amount: number) {
  a.inventory[kind] = round(a.inventory[kind] - amount); addStock(world.debited, kind, amount);
  if (a.materialSamples) delete a.materialSamples[kind];
}
function availableBatch(state: SurvivalRunState, a: SurvivalAgent, id: string) {
  return state.materials?.batches.find(b => b.id === id && !b.installedIn && b.ownerId === a.id && b.condition > .1 && distance(a.position, b.position) <= 4 && ["bloom", "tool", "ceramic"].includes(b.kind));
}
function measure(c: DevelopmentComponent, dose: number) {
  if (c.form === "vessel") return c.condition * (1 - c.leakage) * capacity(c);
  if (c.form === "panel") return clip(c.size * c.thickness * c.insulation * c.condition * (.45 + .55 * Math.abs(Math.cos(c.orientation))));
  if (c.form === "rack") return clip(c.condition * (.4 + .4 * c.precision));
  if (c.form === "bed") return c.food;
  if (c.form === "record") return c.document ? 1 : 0;
  if (c.form === "cell") return c.charge;
  return Math.min(dose, c.output);
}

/** Atomic preflight precedes every debit. Measurements and failed realized tests
 * cost effort. A request can never grant a new physical capability. */
export function executeDevelopment(state: SurvivalRunState, a: SurvivalAgent, op: DevelopmentOperation): DevelopmentReading {
  const fail = (summary: string): DevelopmentReading => ({ accepted: false, success: false, summary, componentId: null, value: 0, metric: "knowledge", effort: 0, evidence: null });
  if (!state.development || !a.alive || a.needs.health <= 0 || !validDevelopmentOperation(op)) return fail("Invalid operation or no living actor in this world model.");
  const world = state.development;
  if (depthAt(freshwaterFeatures(state.environment), a.position) > 0) return fail("Work requires dry ground.");
  let c = "componentId" in op ? world.components.find(p => p.id === op.componentId) : undefined;
  if ("componentId" in op && (!c || !reachable(state, a, c))) return fail("The observed object is missing or out of reach.");
  const effort = operationEffort(op);
  if (a.needs.energy < effort + 3) return fail("Insufficient energy for this operation.");
  let summary = "", value = 0, success = true;
  if (op.kind === "form") {
    const b = state.environment.bounds, mass = componentMass(op);
    if (world.components.length >= DEVELOPMENT_LIMITS.components || distance(a.position, op.position) > 3 || op.position.x < b.minX + 2 || op.position.x > b.maxX - 2 || op.position.z < b.minZ + 2 || op.position.z > b.maxZ - 2 || depthAt(freshwaterFeatures(state.environment), op.position) > 0) return fail("No reachable, dry fabrication space within the component budget.");
    if (world.components.some(p => distance(p.position, op.position) < (p.size + op.size) * .35) || state.physical?.parts.some(p => distance(p.position, op.position) < Math.max(p.size.x, p.size.z) * .5 + op.size * .4) || state.agents.some(other => other.alive && distance(other.position, op.position) < op.size * .4 + .4)) return fail("The proposed footprint overlaps another solid or living body.");
    if (!COMPONENT_AFFORDANCES[op.form].materials.includes(op.material)) return fail("This operation cannot form the requested material into that component.");
    const processed = op.material === "metal" || op.material === "ceramic";
    const batches = op.batchIds.map(id => availableBatch(state, a, id));
    if (new Set(op.batchIds).size !== op.batchIds.length || (processed ? !batches.length || batches.some(batch => !batch || (op.material === "metal" ? !["iron", "copper"].includes(batch.family) : batch.kind !== "ceramic")) || batches.reduce((n, batch) => n + (batch?.mass ?? 0), 0) < mass : op.batchIds.length > 0 || a.inventory[op.material as SurvivalResourceKind] < mass)) return fail("Required material has not been acquired or is already installed elsewhere.");
    const id = `component-${world.nextId++}`;
    const strength = op.material === "metal" ? .85 : op.material === "stone" ? .65 : op.material === "ceramic" ? .7 : op.material === "wood" ? .56 : .35;
    const quality = processed ? batches.reduce((n, b) => n + b!.quality, 0) / batches.length : .6;
    c = { id, makerId: a.id, createdAt: state.tick, revision: 1, form: op.form, material: op.material, position: { ...op.position }, size: op.size, thickness: op.thickness, orientation: op.orientation, condition: 1, treatment: new Set(batches.map(b => b?.family)).size > 1 ? "alloyed" : op.material === "ceramic" ? "fired" : "raw", efficiency: clip(strength * quality * (1 - Math.abs(op.thickness - .25)), .05, .9), leakage: op.material === "ceramic" || op.material === "metal" ? .003 : op.material === "wood" ? .035 : .07, insulation: op.material === "fiber" ? .9 : op.material === "wood" ? .7 : .35, precision: clip(.3 + quality * .4 - Math.abs(op.thickness - .25)), stock: {}, feedstocks: {}, batchIds: [...op.batchIds], water: 0, food: 0, charge: 0, fuel: 0, seedMass: 0, growth: 0, power: 0, output: 0, setting: .5, enabled: true, damage: null, document: null };
    if (processed) { for (const batch of batches) { batch!.installedIn = id; batch!.portable = false; batch!.position = { ...op.position }; } }
    else { if (op.material === "stone") c.feedstocks = splitFeedstocks(a.rawFeedstocks, mass / Math.max(mass, a.inventory.stone)) ?? {}; debit(world, a, op.material as SurvivalResourceKind, mass); c.stock[op.material as SurvivalResourceKind] = mass; }
    world.components.push(c); summary = `Formed a ${op.material} ${op.form}; no contents or power were supplied.`;
  } else if (op.kind === "connect") {
    const from = world.components.find(p => p.id === op.from), to = world.components.find(p => p.id === op.to);
    const wire = op.metalBatchId ? availableBatch(state, a, op.metalBatchId) : undefined;
    if (!from || !to || from === to || !reachable(state, a, from) || !reachable(state, a, to) || distance(from.position, to.position) > 7 || world.links.length >= DEVELOPMENT_LIMITS.links || world.links.some(l => l.from === op.from && l.to === op.to && l.port === op.port) || cycle(world, op.from, op.to, op.port) || !compatiblePort(from.form, to.form, op.port)) return fail("Connection needs compatible, reachable ports and an acyclic path.");
    if (a.inventory.fiber < .15 || (op.port === "electric" && (!wire || wire.mass < .05 || !["copper", "iron"].includes(wire.family))) || (op.port !== "electric" && op.metalBatchId)) return fail("Binding or a real paired conductor is missing.");
    const id = `connection-${world.nextId++}`;
    debit(world, a, "fiber", .15); if (wire) { wire.installedIn = id; wire.portable = false; wire.position = { ...from.position }; }
    world.links.push({ id, from: from.id, to: to.id, port: op.port, condition: 1, fiber: .15, metalBatchId: wire?.id ?? null }); c = to; summary = `Connected ${from.form} to ${to.form} through ${op.port}; transfer still requires an input.`;
  } else if (op.kind === "transfer" && c) {
    const field = op.resource === "freshwater" ? "water" : op.resource === "food" ? "food" : "fuel";
    if (op.resource === "freshwater" ? !["vessel", "bed", "chamber"].includes(c.form) : op.resource === "food" ? !["rack", "bed"].includes(c.form) : c.form !== "chamber") return fail("This object cannot hold that resource.");
    if (op.direction === "deposit" ? a.inventory[op.resource] < op.amount || c[field] + op.amount > capacity(c) : c[field] < op.amount) return fail("Requested transfer exceeds actual supplies or free capacity.");
    const sign = op.direction === "deposit" ? 1 : -1;
    a.inventory[op.resource] = round(a.inventory[op.resource] - sign * op.amount); c[field] = round(c[field] + sign * op.amount);
    if (op.resource === "wood") { addStock(world.debited, "wood", sign * op.amount); }
    else world[op.resource === "freshwater" ? "water" : "food"][op.direction === "deposit" ? "deposited" : "withdrawn"] += op.amount;
    world.metrics.transfers++; value = op.amount; summary = `Confirmed ${op.direction} of ${op.amount.toFixed(2)} ${op.resource} units.`;
  } else if (op.kind === "treat" && c) {
    if (a.inventory.wood < op.fuel || !["clay", "stone", "metal"].includes(c.material)) return fail("Heat treatment needs fuel and a compatible solid.");
    const attained = 180 + op.fuel * 260 + c.thickness * 100;
    debit(world, a, "wood", op.fuel); addStock(world.waste, "wood", op.fuel);
    value = Math.min(op.temperature, attained);
    const glass = (c.feedstocks.silica ?? 0) / Math.max(.001, c.stock.stone ?? 0) > .45;
    success = value >= (glass ? 1100 : c.material === "metal" ? 700 : 600);
    if (success) { c.treatment = glass ? "glassy" : c.material === "metal" ? c.treatment : "fired"; c.leakage *= .12; c.precision = clip(c.precision + .12); c.efficiency = clip(c.efficiency + .1, 0, .9); }
    else { c.condition = clip(c.condition - .08); c.damage = "Treatment did not reach its useful range."; }
    summary = `Paid ${op.fuel.toFixed(2)} fuel; measured ${value.toFixed(0)} modeled °C. ${success ? "The solid changed; retention and precision still require testing." : "The treatment was insufficient; fuel remains spent."}`;
  } else if (op.kind === "plant" && c) {
    if (c.form !== "bed" || c.seedMass > 0 || a.inventory.food < op.seeds) return fail("Planting needs an empty bed and actual seed-food reserves.");
    a.inventory.food = round(a.inventory.food - op.seeds); c.seedMass = op.seeds; world.food.seeds += op.seeds; summary = "Planting consumed food reserves; growth now requires water, daylight and time.";
  } else if (op.kind === "tune" && c) { c.setting = op.setting; summary = `Changed the operating setting to ${op.setting.toFixed(2)}; the result is not yet measured.`;
  } else if (op.kind === "repair" && c) {
    if (a.inventory.fiber < .2 || a.inventory.wood < .2) return fail("Repair requires real binding and replacement material.");
    debit(world, a, "fiber", .2); debit(world, a, "wood", .2); addStock(c.stock, "fiber", .2); addStock(c.stock, "wood", .2); c.condition = clip(c.condition + .35); c.damage = null; world.metrics.repairs++; summary = "Paid binding and patch material; restored some condition.";
  } else if (op.kind === "reclaim" && c) {
    if (world.links.some(l => l.from === c!.id || l.to === c!.id) || c.water + c.food + c.fuel + c.charge + c.seedMass > .00001) return fail("Connected or occupied assemblies must be emptied before reclamation.");
    for (const [kind, mass] of Object.entries(c.stock)) { const recovered = round(mass! * .8); a.inventory[kind as SurvivalResourceKind] = round(a.inventory[kind as SurvivalResourceKind] + recovered); addStock(world.debited, kind as SurvivalResourceKind, -recovered); addStock(world.waste, kind as SurvivalResourceKind, mass! - recovered); }
    const recovered = splitFeedstocks(c.feedstocks, .8); a.rawFeedstocks = mergeFeedstocks(a.rawFeedstocks, recovered); world.wasteFeedstocks = mergeFeedstocks(world.wasteFeedstocks, c.feedstocks) ?? {};
    for (const batch of state.materials?.batches ?? []) if (batch.installedIn === c.id) { delete batch.installedIn; batch.portable = true; batch.ownerId = a.id; batch.position = { ...a.position }; }
    world.components = world.components.filter(p => p !== c); summary = "Recovered 80% of raw material and detached processed batches; remnants remain accounted for.";
  } else if (op.kind === "document" && c) {
    const procedure = a.developmentMind?.procedures.find(p => p.id === op.procedureId && p.successes > 0);
    if (c.form !== "record" || !procedure) return fail("Only an executed, measured procedure can be inscribed on a record surface.");
    c.document = structuredClone(procedure); summary = `Inscribed a procedure with ${procedure.evidenceIds.length} original evidence reference(s).`;
  } else if (op.kind === "read" && c) {
    if (!c.document || !a.developmentMind) return fail("This object contains no readable procedure.");
    const copy = structuredClone(c.document);
    if (!a.developmentMind.procedures.some(p => p.id === copy.id)) { copy.uncertainty = Math.max(.45, copy.uncertainty); a.developmentMind.procedures = [...a.developmentMind.procedures, copy].slice(-DEVELOPMENT_LIMITS.procedures); }
    summary = "Read a documented procedure as testimony. Its author's evidence is preserved; no personal trial was added.";
  } else if (op.kind === "test" && c) {
    // A water trial uses a real measured dose, not a hypothetical evaluator.
    // The reading is retained fraction, not capacity or exact permeability.
    if (c.form === "vessel" && (a.inventory.freshwater < op.dose || capacity(c) - c.water < op.dose)) return fail("A retention trial needs its water dose and unoccupied capacity; overflow is not leakage.");
    if (c.form === "rack" && c.food < op.dose) return fail("A storage trial requires food already deposited on the rack.");
    c.condition = clip(c.condition - .002 * op.dose);
    if (c.form === "vessel") {
      a.inventory.freshwater = round(a.inventory.freshwater - op.dose); world.water.deposited += op.dose;
      const leaked = op.dose * clip(c.leakage / Math.max(.1,c.condition));
      c.water += op.dose - leaked; world.water.leaked += leaked; value = 1 - leaked / op.dose;
    } else if (c.form === "rack") {
      const spoiled = op.dose * (1 - c.condition * .995); c.food -= spoiled; world.food.spoiled += spoiled; value = 1 - spoiled / op.dose;
    } else value = measure(c, op.dose);
    success = value > .05; world.metrics.tests++;
    summary = `Measured ${componentMetric(c.form).replaceAll("_", " ")}: ${value.toFixed(3)} at dose ${op.dose}. ${["vessel","rack"].includes(c.form) ? "Retained fraction after a paid holding trial; not a measurement of maximum capacity." : "Applies to the current geometry, treatment and operating conditions."}`;
  }
  if (!c) return fail("No executable target.");
  c.revision++; world.metrics.operations++; a.needs.energy = round(Math.max(0, a.needs.energy - effort));
  const reading: DevelopmentReading = { accepted: true, success, summary, componentId: c.id, value, metric: componentMetric(c.form), effort, evidence: null };
  if (op.kind === "test") reading.evidence = { id: `development-reading-${world.nextId++}`, originalId: "", observerId: a.id, receivedAt: state.tick, tick: state.tick, source: "personal", form: c.form, material: c.material, size: c.size, thickness: c.thickness, treatment: c.treatment, metric: reading.metric, value, predicted: a.developmentMind?.active?.candidate.prediction ?? 0, uncertainty: .1, componentId: c.id, conditions: `${state.environment.weather}; ${state.environment.temperatureC.toFixed(0)} °C; connected output ${c.output.toFixed(3)}`, summary };
  if (reading.evidence) reading.evidence.originalId = reading.evidence.id;
  return reading;
}

/** Fixed-step, conservative directed networks. Normalized energy units per
 * ten-minute tick; neither watts nor complete thermodynamics. Cyclic paths are
 * rejected, fan-out divides energy, batteries only release previous charge. */
export function advanceDevelopment(state: SurvivalRunState): void {
  const world = state.development; if (!world) return;
  const ordered = [...world.components].sort((a, b) => a.id.localeCompare(b.id));
  const priorCharge = new Map(ordered.map(c => [c.id, c.charge]));
  const input = new Map(ordered.map(c => [c.id, { mechanical: 0, electric: 0 }]));
  const enabled = new Map(ordered.map(c => [c.id, c.enabled]));
  for (const link of world.links.filter(l => l.port === "control")) {
    const sensor = ordered.find(c => c.id === link.from), target = ordered.find(c => c.id === link.to);
    const reservoir = target && ordered.find(c => c.form === "vessel" && distance(c.position, target.position) < 7);
    if (sensor && target && reservoir && sensor.power > .01) enabled.set(target.id, reservoir.water / capacity(reservoir) < sensor.setting);
  }
  const todo = [...ordered], visited = new Set<string>();
  for (let pass = 0; pass < ordered.length && todo.length; pass++) {
    for (let index = 0; index < todo.length;) {
      const c = todo[index];
      const parents = world.links.filter(l => l.to === c.id && ["electric", "mechanical"].includes(l.port));
      if (parents.some(l => !visited.has(l.from))) { index++; continue; }
      todo.splice(index, 1); visited.add(c.id); c.output = 0;
      const received = input.get(c.id)!; c.power = received.mechanical + received.electric;
      let mechanical = 0, electric = 0;
      const operational = c.condition > .1 && enabled.get(c.id);
      if (operational) {
        const efficiency = c.efficiency * c.condition;
        if (c.form === "rotor") { const wind = state.environment.weather === "storm" ? 1.5 : state.environment.weather === "clear" ? .35 : .8; const source = wind * c.size ** 2 * .2; world.energy.wind += source; mechanical = source * efficiency; world.energy.lost += source - mechanical; }
        if (c.form === "chamber" && c.fuel > .01 && c.water > .01) { const fuel = Math.min(.04, c.fuel), water = Math.min(.02, c.water); c.fuel -= fuel; c.water -= water; world.water.irrigated += water; addStock(world.waste, "wood", fuel); world.energy.fuelConsumed += fuel; const heat = fuel * 6; world.energy.heat += heat; mechanical += heat * efficiency * .2; world.energy.lost += heat * (1 - efficiency * .2); }
        if (c.form === "gear") mechanical = received.mechanical * efficiency;
        if (c.form === "coil") { if (c.setting <= .5) electric = received.mechanical * efficiency; else mechanical = received.electric * efficiency; }
        if (c.form === "cell") { const released = Math.min(priorCharge.get(c.id)!, .1); c.charge -= released; electric = released * efficiency; world.energy.lost += released - electric; const stored = Math.min(capacity(c) - c.charge, received.electric * efficiency); c.charge += stored; world.energy.lost += received.electric - stored; }
        if (c.form === "contact") electric = received.electric * .85;
        c.output = mechanical + electric;
        if (["shaft", "piston", "filament"].includes(c.form)) { c.output = c.power * efficiency; world.energy.delivered += c.output; world.energy.lost += c.power - c.output; }
        if (["gear", "coil", "contact"].includes(c.form)) world.energy.lost += Math.max(0, c.power - c.output);
        c.condition = clip(c.condition - .00004 - c.output * .00015); if (c.condition <= .1) c.damage = "Wear stopped useful operation.";
      } else world.energy.lost += c.power;
      for (const port of ["mechanical", "electric"] as const) {
        const outgoing = world.links.filter(l => l.from === c.id && l.port === port && l.condition > .1);
        const energy = port === "mechanical" ? mechanical : electric;
        if (!outgoing.length) world.energy.lost += energy;
        for (const link of outgoing) { const supply = energy / outgoing.length, transfer = supply * .9 * link.condition; const receiver = input.get(link.to); if (receiver) receiver[port] += transfer; world.energy.lost += supply - (receiver ? transfer : 0); link.condition = clip(link.condition - transfer * .00001); }
      }
    }
  }
  for (const c of ordered) {
    if (c.form === "piston" && c.output > 0) {
      const source = state.environment.resources.filter(s => s.kind === "freshwater" && !s.contaminated && canCollectFreshwater(freshwaterFootprint(s), c.position)).sort((a,b)=>a.id.localeCompare(b.id))[0];
      for (const link of world.links.filter(l => l.from === c.id && l.port === "water")) {
        const destination = world.components.find(p => p.id === link.to); if (!source || !destination) continue;
        const share = c.output / Math.max(1, world.links.filter(l => l.from === c.id && l.port === "water").length);
        const amount = Math.min(source.quantity, capacity(destination) - destination.water, share * .5 * link.condition);
        source.quantity = round(source.quantity - amount); destination.water = round(destination.water + amount); world.water.extracted += amount;
      }
    }
    if (c.form === "vessel") for (const link of world.links.filter(l => l.from === c.id && l.port === "water")) { const dest = world.components.find(p => p.id === link.to); if (dest) { const amount = Math.min(c.water, capacity(dest) - dest.water, .02 * link.condition); c.water -= amount; dest.water += amount; } }
    const leaked = c.water * c.leakage * .08; c.water -= leaked; world.water.leaked += leaked;
    const lostCharge = c.charge * .0005; c.charge -= lostCharge; world.energy.lost += lostCharge;
    if (c.form === "bed" && c.seedMass > 0 && c.water > .005 && c.condition > .1) {
      const water = Math.min(c.water, .012 * state.environment.daylight); c.water -= water; world.water.irrigated += water; c.growth += water;
      if (c.growth >= .8) { const grown = Math.max(0,Math.min(capacity(c) - c.food,c.seedMass * 3 * c.condition)); c.food += grown; world.food.grown += grown; c.growth = 0; }
    }
    const spoiled = c.food * (c.form === "rack" ? .00025 : .001); c.food -= spoiled; world.food.spoiled += spoiled;
    for (const field of ["water", "food", "charge", "fuel", "condition", "output", "power"] as const) c[field] = Math.max(0, c[field]);
  }
  world.metrics.runningTicks++;
}

export function developmentProtection(state: SurvivalRunState, position: SurvivalPosition): number {
  return clip((state.development?.components ?? []).filter(c => c.form === "panel" && distance(position, c.position) < 3).reduce((n,c)=>n+measure(c,1)*Math.max(0,1-distance(position,c.position)/4),0),0,.8);
}
export function developmentWarmth(state: SurvivalRunState, position: SurvivalPosition): boolean {
  return !!state.development?.components.some(c => c.form === "filament" && c.output > .015 && distance(position,c.position) < 3);
}
export function developmentWorkFactor(state: SurvivalRunState, position: SurvivalPosition): number {
  return 1 + Math.min(.6, (state.development?.components ?? []).filter(c=>c.form==="shaft" && c.output>0 && distance(position,c.position)<4).reduce((n,c)=>n+c.output,0));
}
