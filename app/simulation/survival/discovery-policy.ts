import { DISCOVERY_LIMITS, type DiscoveryAlternative, type DiscoveryExperiment, type DiscoveryFeatures, type DiscoveryGoal, type DiscoveryMind, type DiscoveryPrediction, type DiscoveryProcedure } from "./discovery-types";
import { decisionInformationValue, predictDiscovery } from "./discovery-model";
import { driftNeeds } from "./physiology";
import { planFromPrivateKnowledge, survivalPotential, type LocalPlanChoice, type PlannedAction, type PrivatePolicyInput } from "./planner";
import { observedParts, observedPoseFits } from "./physical-spatial";
import { findPrivateRoute } from "./private-navigation";
import { canCollectFreshwater, depthAt, estimateWaterTravel, observedWater } from "./water";
import { rememberedProtection } from "./survival-forecast";
import { survivalUnit } from "./random";
import type { Manipulation, MaterialKind, Vec3 } from "./physical-types";
import type { AgentObservation, SurvivalPosition } from "./types";

const clip = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
const dist = (a: SurvivalPosition, b: SurvivalPosition) => Math.hypot(a.x - b.x, a.z - b.z);
const materials = ["wood", "stone", "fiber", "clay"] as const;
const effort = (op: Manipulation) => op.kind === "shape" ? 1.6 : op.kind === "heat" ? 2 : .6;
const weatherOf = (input: PrivatePolicyInput) => input.agent.observations.find(o => o.kind === "weather");
export const discoverySignature = (operations: Manipulation[]) => JSON.stringify(operations);
const id = (mind: DiscoveryMind, agentId: string, kind: string) => `discovery-${kind}-${agentId}-${mind.nextId++}`;

export function featuresFor(input: PrivatePolicyInput, part: { size: Vec3; position: Vec3; rotation: number; material: MaterialKind; mass: number; condition?: number; supported?: boolean; treatment?: number }, position = input.agent.position, dose = 1): DiscoveryFeatures {
  const weather = weatherOf(input), dx = position.x - part.position.x, dz = position.z - part.position.z;
  return { material: part.material, width: part.size.x, height: part.size.y, depth: part.size.z, mass: part.mass,
    condition: part.condition ?? 1, supported: part.supported ?? true, rotation: part.rotation, elevation: part.position.y,
    distance: dist(position, part.position), lateral: dx * Math.cos(part.rotation) + dz * Math.sin(part.rotation),
    longitudinal: -dx * Math.sin(part.rotation) + dz * Math.cos(part.rotation),
    temperature: Number(weather?.facts.temperatureC ?? 13), weather: String(weather?.facts.weather ?? "clear"), treatment: part.treatment ?? 0, dose };
}
export function observationFeatures(input: PrivatePolicyInput, o: AgentObservation, position = input.agent.position, dose = 1) {
  return featuresFor(input, { size: { x: Number(o.facts.width), y: Number(o.facts.height), z: Number(o.facts.depth) },
    position: { ...o.position!, y: Number(o.facts.elevation) }, rotation: Number(o.facts.rotation), material: o.facts.material as MaterialKind,
    mass: Number(o.facts.mass), condition: Number(o.facts.condition) / 100, supported: o.facts.supported !== false,
    treatment: Number(o.facts.treatment ?? 0) }, position, dose);
}

/** Complete-plan pricing: private routes, travel/immersion, every material debit,
 * work and physiological time precede predicted protection. No hypothetical solver. */
type PriceCache = Map<string, { duration: number; energy: number; warmth: number } | null>;
export function priceDiscoveryPlan(input: PrivatePolicyInput, actions: PlannedAction[], protection: number, cache: PriceCache = new Map()) {
  const needs = { ...input.agent.needs }, inventory = { ...input.agent.inventory }, weather = weatherOf(input);
  const conditions = { temperatureC: Number(weather?.facts.temperatureC ?? 13), weather: String(weather?.facts.weather ?? "clear"), daylight: Number(weather?.facts.daylight ?? .5), sheltered: false, byFire: false };
  let position = { ...input.agent.position }, ticks = 0, cost = 0, currentProtection = rememberedProtection(input.agent, position, input.tick, conditions.weather);
  const water = observedWater(input.agent.observations), remaining = new Map<string, number>();
  const elapse = (duration: number) => { for (let n = 0; n < duration; n++) { if (ticks > 0) driftNeeds(needs, { ...conditions, protection: currentProtection }); ticks++; } };
  for (const action of actions) {
    let duration = Math.max(1, action.duration);
    if (action.action === "move" && action.destination) {
      const key = `${position.x},${position.z}:${action.destination.x},${action.destination.z}`;
      let travel = cache.get(key);
      if (travel === undefined) {
        const route = findPrivateRoute(input.agent.observations, input.bounds, position, action.destination, input.agent.navigation?.blocked, 160);
        // A contact-radius route may end beside a solid target. A precise test
        // cannot claim it reached the original point inside that obstruction.
        const endpoint = route?.at(-1);
        travel = endpoint && dist(endpoint, action.destination) <= (action.arrivalRadius ?? 2.4) ? { duration: 0, energy: 0, warmth: 0 } : null;
        let from = position;
        if (travel && route) for (const waypoint of route) { const leg = estimateWaterTravel(water, from, waypoint, conditions.temperatureC, conditions.weather === "storm"); travel.duration += leg.duration; travel.energy += leg.energy; travel.warmth += leg.warmth; from = waypoint; }
        // Cache belongs to one decision snapshot only, never a saved policy or
        // another tick. A hard cap bounds memory without changing search results.
        if (cache.size < 256) cache.set(key, travel);
      }
      if (!travel) return { score: -1000, ticks: 999, cost: 999, feasible: false };
      duration = Math.max(1, Math.ceil(travel.duration)); needs.energy -= travel.energy; needs.warmth -= travel.warmth;
      currentProtection = 0; // Destination benefit starts after travel, not during it.
      needs.energy -= duration * .34; cost += duration * .34;
    }
    elapse(duration);
    if (action.action === "move" && action.destination) { position = { ...action.destination }; currentProtection = rememberedProtection(input.agent, position, input.tick, conditions.weather); }
    if (action.action === "rest") { needs.energy = clip(needs.energy + 13 * duration, 0, 100); needs.health = clip(needs.health + .35 * duration, 0, 100); }
    if (action.action === "warm") needs.warmth = clip(needs.warmth + (conditions.daylight > .35 ? 9 : 3), 0, 100);
    if (action.action === "shelter") { needs.warmth = clip(needs.warmth + 2 + currentProtection * 3, 0, 100); needs.safety = clip(needs.safety + currentProtection * 2, 0, 100); }
    if (action.action === "drink" && inventory.freshwater >= 1) { inventory.freshwater--; needs.hydration = clip(needs.hydration + 34, 0, 100); }
    if (action.action === "eat" && inventory.food >= 1) { inventory.food--; needs.nutrition = clip(needs.nutrition + 27, 0, 100); }
    if (action.action === "collect" || action.action === "gather") {
      const site = input.agent.observations.find(o => o.subjectId === action.targetId && o.kind === "resource");
      const footprint = site && observedWater([site])[0];
      const reachable = site?.position && (site.facts.resourceKind === "freshwater" && footprint ? canCollectFreshwater(footprint, position) : dist(position, site.position) <= 4.5);
      if (!site?.position || !reachable) return { score: -1000, ticks, cost, feasible: false };
      const kind = site.facts.resourceKind as keyof typeof inventory;
      const available = remaining.get(site.subjectId) ?? Number(site.facts.availableEstimate);
      const amount = Math.min(available, kind === "freshwater" ? 2 : 1.5);
      remaining.set(site.subjectId, available - amount); inventory[kind] += amount; needs.energy -= .6;
    }
    if (action.manipulation) {
      const op = action.manipulation, charge = effort(op); needs.energy -= charge; cost += charge;
      const required = op.kind === "shape" ? { material: op.material, amount: op.mass } : op.kind === "join" ? { material: "fiber" as const, amount: op.fiber } : op.kind === "heat" ? { material: "wood" as const, amount: op.fuel } : null;
      if (required) { if (inventory[required.material] < required.amount) return { score: -1000, ticks, cost, feasible: false }; inventory[required.material] -= required.amount; cost += required.amount * .3; }
    }
    if (Math.min(needs.health, needs.hydration, needs.nutrition, needs.energy) < 16 || ticks > 36) return { score: -1000, ticks, cost, feasible: false };
  }
  const workTicks = ticks;
  currentProtection = protection;
  // Equal finite reserve-use forecast for all candidates; use costs one tick.
  while (ticks < DISCOVERY_LIMITS.horizon) {
    elapse(1);
    if (needs.hydration < 32 && inventory.freshwater >= 1) { inventory.freshwater--; needs.hydration = Math.min(100, needs.hydration + 34); }
    else if (needs.nutrition < 32 && inventory.food >= 1) { inventory.food--; needs.nutrition = Math.min(100, needs.nutrition + 27); }
  }
  return { score: survivalPotential(needs, inventory) - survivalPotential(input.agent.needs, input.agent.inventory) - cost * .12, ticks: workTicks, cost, feasible: true };
}

function pathAction(from: SurvivalPosition, to: SurvivalPosition): PlannedAction[] {
  return dist(from, to) <= .2 ? [] : [{ action: "move", targetId: null, destination: { ...to }, duration: Math.max(1, Math.ceil(dist(from, to) / 7.5)), arrivalRadius: .2 }];
}
/** Compose prerequisite acquisition and return travel; no material is granted. */
function compileActions(input: PrivatePolicyInput, operations: Manipulation[], position: SurvivalPosition): PlannedAction[] | null {
  const required: Partial<Record<MaterialKind, number>> = {}, reserves = { ...input.agent.inventory };
  for (const op of operations) {
    if (op.kind === "shape") required[op.material] = (required[op.material] ?? 0) + op.mass;
    if (op.kind === "join") required.fiber = (required.fiber ?? 0) + op.fiber;
    if (op.kind === "heat") required.wood = (required.wood ?? 0) + op.fuel;
  }
  if (Object.values(required).reduce((total, amount) => total + amount, 0) > 8) return null;
  if (required.stone) required.stone += .5; // Authored striker feasibility, not a learned invention.
  const actions: PlannedAction[] = []; let from = input.agent.position;
  for (const kind of materials) {
    let missing = Math.max(0, (required[kind] ?? 0) - reserves[kind]);
    if (missing <= 0) continue;
    const site = input.agent.observations.filter(o => o.kind === "resource" && o.facts.resourceKind === kind && o.position && Number(o.facts.availableEstimate) >= missing)
      .sort((a, b) => dist(from, a.position!) - dist(from, b.position!))[0];
    if (!site?.position) return null;
    const approach = findPrivateRoute(input.agent.observations, input.bounds, from, site.position, input.agent.navigation?.blocked, 160)?.at(-1);
    if (!approach || dist(approach, site.position) > 4.5) return null;
    actions.push(...pathAction(from, approach)); from = approach;
    while (missing > 0 && actions.length < 20) { actions.push({ action: "gather", targetId: site.subjectId, destination: null, duration: 1 }); missing -= 1.4; }
    if (missing > 0) return null;
  }
  actions.push(...pathAction(from, position));
  actions.push(...operations.map(op => ({ action: op.kind === "test" ? "test_hypothesis" as const : "build" as const, targetId: "partId" in op ? op.partId : null, destination: null, duration: 1, manipulation: op })));
  return actions.length <= 24 ? actions : null;
}

export function bindDiscoveryProcedure(input: PrivatePolicyInput, procedure: DiscoveryProcedure, position: SurvivalPosition): Manipulation[] | null {
  const bindings: Record<string, string> = {}, used = new Set<string>();
  for (const slot of procedure.inputs) {
    const source = input.agent.observations.find(o => o.facts.structureKind === "physical_part" && o.position && !used.has(o.subjectId)
      && o.facts.material === slot.material && Number(o.facts.condition) >= slot.minimumCondition * 100 && dist(o.position, position) < 4
      && Math.abs(Number(o.facts.width) - slot.size.x) < .3 && Math.abs(Number(o.facts.height) - slot.size.y) < .3 && Math.abs(Number(o.facts.depth) - slot.size.z) < .3);
    if (!source) return null; bindings[slot.symbol] = source.subjectId; used.add(source.subjectId);
  }
  return procedure.program.map(operation => {
    const op = structuredClone(operation);
    if ("partId" in op) op.partId = bindings[op.partId] ?? op.partId;
    if (op.kind === "join" || op.kind === "mix") { op.a = bindings[op.a] ?? op.a; op.b = bindings[op.b] ?? op.b; }
    if (op.kind === "place") { op.position.x += position.x; op.position.z += position.z; }
    return op;
  });
}

export function discoveryAlternatives(input: PrivatePolicyInput, competingValue?: number, cache: PriceCache = new Map()): { alternatives: DiscoveryAlternative[]; expansions: number } {
  const price = (actions: PlannedAction[], protection: number) => priceDiscoveryPlan(input, actions, protection, cache);
  const mind = input.agent.discovery!, weather = weatherOf(input), baseline = rememberedProtection(input.agent, input.agent.position, input.tick, String(weather?.facts.weather));
  const stay = price([{ action: "rest", targetId: null, destination: null, duration: 2 }], baseline);
  const alternatives: DiscoveryAlternative[] = [{ id: "stay", kind: "stay", label: "Rest here without optional work", score: stay.score, cost: stay.cost, ticks: 2, informationValue: 0, predictedProtection: baseline, uncertainty: 0, evidenceIds: weather ? [weather.id] : [], rejection: null, operations: [], position: { ...input.agent.position } }];
  let expansions = 0;
  const add = (candidate: Omit<DiscoveryAlternative, "score" | "cost" | "ticks" | "informationValue" | "rejection">) => {
    if (expansions >= DISCOVERY_LIMITS.expansions) return;
    expansions++;
    const actions = compileActions(input, candidate.operations, candidate.position), priced = actions ? price(actions, candidate.predictedProtection) : { score: -1000, cost: 999, ticks: 999, feasible: false };
    const signature = discoverySignature(candidate.operations);
    const repeated = mind.failures.some(f => f.signature === signature);
    const rejection = !priced.feasible ? "Complete travel, resources and work are unaffordable or unreachable." : repeated ? "This unchanged proposal already failed; a changed proposal is required." : null;
    alternatives.push({ ...candidate, score: priced.score, cost: priced.cost, ticks: priced.ticks, informationValue: 0, rejection });
  };
  const parts = input.agent.observations.filter(o => o.facts.structureKind === "physical_part" && o.position && Number(o.facts.condition) > 5 && input.tick - o.observedAt < 36).slice(-6);
  for (const part of parts.slice(0, 3)) {
    const proposed = { x: part.position!.x, z: part.position!.z - Number(part.facts.depth) / 2 - .9 };
    // Use the reachable occupied point for BOTH prediction and execution. The
    // initial world-axis sample can lie inside a rotated part's footprint.
    const position = findPrivateRoute(input.agent.observations, input.bounds, input.agent.position, proposed, input.agent.navigation?.blocked, 160)?.at(-1);
    if (!position || dist(position, part.position!) > 4) continue;
    if (depthAt(observedWater(input.agent.observations), position) > 0) continue;
    const prediction = predictDiscovery(mind, "protection", observationFeatures(input, part, position));
    add({ id: `reuse-${part.subjectId}`, kind: "reuse", label: "Move to an observed arrangement; no new construction", operations: [], position,
      prediction, predictedProtection: prediction.mean, uncertainty: prediction.uncertainty, evidenceIds: [part.id, ...prediction.evidenceIds] });
    add({ id: `measure-${part.subjectId}`, kind: "test", label: "Measure local protection before relying on this place", operations: [{ kind: "test", partId: part.subjectId, measure: "protection", dose: 1 }], position,
      prediction, predictedProtection: prediction.mean, uncertainty: prediction.uncertainty, evidenceIds: [part.id, ...prediction.evidenceIds] });
  }
  // A small backwards composition: choose a desired pose, then satisfy its
  // support/material prerequisites with the same primitive vocabulary. No names,
  // unlocks, or rotation-as-diagnosis repair rules.
  const sources = input.agent.observations.filter(o => o.kind === "resource" && o.position && materials.includes(o.facts.resourceKind as MaterialKind) && Number(o.facts.bulkDensity) > 0 && Number(o.facts.availableEstimate) > 0).slice(0, 4);
  for (let n = 0; n < 8 && sources.length; n++) {
    const source = sources[n % sources.length], material = source.facts.resourceKind as MaterialKind, density = Number(source.facts.bulkDensity);
    const sample = (key: string) => survivalUnit(input.seed, input.agent.id, mind.mode === "fixed" ? 0 : Math.floor(input.tick / 24), n, key);
    const elevated = n >= 4, width = elevated ? 2.8 + sample("width") * 1.2 : 1.4 + sample("width") * 1.8, height = elevated ? .14 + sample("height") * .16 : .9 + sample("height") * 1.2;
    const depth = elevated ? 2.4 + sample("depth") * 1.4 : .15 + sample("depth") * .25, mass = width * height * depth * density;
    if (mass > 4 || mass < .05) continue;
    const size = { x: width, y: height, z: depth }, rotation = sample("rotation") * Math.PI;
    const origin = { ...input.agent.position }, radius = .95 + sample("radius") * 1.05, angle = sample("angle") * Math.PI * 2;
    const pose = { x: origin.x + Math.cos(angle) * radius, y: height / 2, z: origin.z + Math.sin(angle) * radius };
    const operations: Manipulation[] = [], virtual = structuredClone(input);
    let supportPrediction: DiscoveryPrediction | undefined;
    if (elevated) {
      const bearing = observedParts(input).find(p => p.supported && p.size.y > 1.2 && p.size.x > .3 && p.size.z > .3 && dist(p.position, origin) < 3);
      let supportId = bearing?.id;
      if (bearing) {
        pose.x = bearing.position.x; pose.z = bearing.position.z; pose.y = bearing.position.y + bearing.size.y / 2 + height / 2;
        supportPrediction = predictDiscovery(mind, "support", observationFeatures(input, parts.find(o => o.subjectId === bearing.id) ?? input.agent.observations.find(o => o.subjectId === bearing.id)!, origin, Math.min(5, mass)));
      } else {
        const supportSize = { x: .5 + sample("support") * .35, y: 2.4, z: .5 + sample("support") * .35 };
        const supportMass = supportSize.x * supportSize.y * supportSize.z * density;
        const supportPose = { x: pose.x, y: supportSize.y / 2, z: pose.z };
        if (!observedPoseFits(input, supportSize, supportPose, 0)) continue;
        supportId = "$0";
        operations.push({ kind: "shape", material, mass: supportMass, size: supportSize }, { kind: "place", partId: supportId, position: supportPose, rotation: 0 });
        virtual.agent.observations.push({ id: "imagined-support", observerId: input.agent.id, subjectId: supportId, kind: "structure", observedAt: input.tick, position: supportPose, confidence: .5,
          facts: { structureKind: "physical_part", width: supportSize.x, height: supportSize.y, depth: supportSize.z, elevation: supportPose.y, rotation: 0, condition: 100, supported: true } });
        pose.y = supportSize.y + height / 2;
        supportPrediction = predictDiscovery(mind, "support", featuresFor(input, { size: supportSize, position: supportPose, rotation: 0, material, mass: supportMass }, origin, Math.min(5, mass)));
      }
      // A load probe is a real effort/condition intervention, not exact strength.
      if (supportPrediction.high < .5) continue;
      if (mind.mode !== "none" && mind.mode !== "fixed") operations.push({ kind: "test", partId: supportId!, measure: "load", dose: Math.min(5, mass) });
    }
    if (!observedPoseFits(virtual, size, pose, rotation)) continue;
    const symbol = operations.some(o => o.kind === "shape") ? "$1" : "$0";
    operations.push({ kind: "shape", material, mass, size }, { kind: "place", partId: symbol, position: pose, rotation });
    const prediction = predictDiscovery(mind, "protection", featuresFor(input, { size, position: pose, rotation, material, mass }, origin));
    if (mind.mode !== "none" && mind.mode !== "fixed") operations.push({ kind: "test", partId: symbol, measure: "protection", dose: 1 });
    add({ id: `arrange-${n}`, kind: "arrange", label: elevated ? "Place a raised surface after satisfying support" : "Shape and position a grounded surface", operations, position: origin,
      prediction, ...(supportPrediction ? { supportPrediction } : {}), predictedProtection: Math.max(baseline, prediction.mean) * (supportPrediction?.mean ?? 1), uncertainty: Math.max(prediction.uncertainty, supportPrediction?.uncertainty ?? 0), evidenceIds: [source.id, ...(weather ? [weather.id] : []), ...prediction.evidenceIds] });
  }
  for (const procedure of mind.mode === "fixed" ? [] : mind.procedures.slice(-2)) {
    const operations = bindDiscoveryProcedure(input, procedure, input.agent.position); if (!operations) continue;
    const shape = operations.filter(o => o.kind === "shape").at(-1), place = [...operations].reverse().find(o => o.kind === "place");
    if (shape?.kind !== "shape" || place?.kind !== "place") continue;
    const prediction = predictDiscovery(mind, "protection", featuresFor(input, { size: shape.size, position: place.position, rotation: place.rotation, material: shape.material, mass: shape.mass }));
    let supportPrediction: DiscoveryPrediction | undefined;
    const probe = operations.find(o => o.kind === "test" && o.measure === "load");
    if (probe?.kind === "test") {
      const existing = input.agent.observations.find(o => o.subjectId === probe.partId);
      const shapeIndex = Number(probe.partId.slice(1)), shaped = operations.filter(o => o.kind === "shape")[shapeIndex];
      const posed = operations.find(o => o.kind === "place" && o.partId === probe.partId);
      if (existing) supportPrediction = predictDiscovery(mind, "support", observationFeatures(input, existing, input.agent.position, probe.dose));
      else if (shaped?.kind === "shape" && posed?.kind === "place") supportPrediction = predictDiscovery(mind, "support", featuresFor(input, { size: shaped.size, position: posed.position, rotation: posed.rotation, material: shaped.material, mass: shaped.mass }, input.agent.position, probe.dose));
      if (!supportPrediction) continue;
    }
    add({ id: `reuse-${procedure.id}`, kind: "procedure", label: "Adapt an executed procedure to this observed site", operations, position: { ...input.agent.position }, prediction,
      ...(supportPrediction ? { supportPrediction } : {}), procedureId: procedure.id, predictedProtection: prediction.mean * (supportPrediction?.mean ?? 1), uncertainty: prediction.uncertainty, evidenceIds: procedure.evidenceIds.slice() });
  }
  // Compare tests against ALL independent alternative plans, not only resting.
  // Options with the same uncertain geometry are correlated, not independent
  // fallbacks. This bounded three-outcome calculation is a VOI heuristic.
  const baseScores = new Map(alternatives.map(a => [a.id, a.score]));
  for (const a of alternatives.filter(a => !a.rejection && a.operations.some(o => o.kind === "test"))) {
    const actions = compileActions(input, a.operations, a.position); if (!actions) continue;
    const otherValue = Math.max(stay.score, competingValue ?? stay.score, ...alternatives.filter(b => b !== a && !b.rejection && JSON.stringify(b.prediction?.features) !== JSON.stringify(a.prediction?.features)).map(b => baseScores.get(b.id)!));
    const informationValue = Math.max(0, ...[a.supportPrediction, a.prediction].filter((p): p is DiscoveryPrediction => Boolean(p)).map(p =>
      decisionInformationValue(p, value => price(actions, p.metric === "support" ? (a.prediction?.mean ?? 0) * value : value * (a.supportPrediction?.mean ?? 1)).score, otherValue, .15)));
    a.informationValue = informationValue; a.score += informationValue;
    if (informationValue <= 0) {
      if (a.kind === "test") a.rejection = "Plausible readings would not change the preferred plan enough to pay for this test.";
      else {
        a.operations = a.operations.filter(o => o.kind !== "test");
        const untested = compileActions(input, a.operations, a.position);
        if (untested) { const priced = price(untested, a.predictedProtection); a.score = priced.score; a.cost = priced.cost; a.ticks = priced.ticks; }
      }
    }
  }
  // Reserve representation for executed procedures rather than exhausting the
  // candidate budget before considering them. This affects search, not reward.
  const procedures = alternatives.filter(a => a.kind === "procedure");
  return { alternatives: [...alternatives.filter(a => a.kind !== "procedure").slice(0, DISCOVERY_LIMITS.candidates - procedures.length), ...procedures], expansions };
}

function formGoal(input: PrivatePolicyInput, metric: "protection" | "support", parent: DiscoveryGoal | null, target: number, benefit: number, evidenceIds: string[], forecast = input.agent.needs): DiscoveryGoal | null {
  const mind = input.agent.discovery!;
  const weather = weatherOf(input);
  // Parents only point to older roots, so cycles cannot be generated.
  if (parent?.parentId || mind.goals.filter(g => g.status === "active" || g.status === "deferred").length >= DISCOVERY_LIMITS.goals) return null;
  const goal: DiscoveryGoal = { id: id(mind, input.agent.id, "goal"), parentId: parent?.id ?? null, objective: "survive", metric,
    evidenceIds: evidenceIds.slice(0, 12), createdAt: input.tick, updatedAt: input.tick, target, predictedBenefit: Math.max(0, benefit), urgency: clip((70 - Math.min(input.agent.needs.warmth, input.agent.needs.safety)) / 70),
    originatingConditions: { weather: String(weather?.facts.weather ?? "unknown"), temperatureC: Number(weather?.facts.temperatureC ?? 13), daylight: Number(weather?.facts.daylight ?? .5), warmth: input.agent.needs.warmth, safety: input.agent.needs.safety, forecastWarmth: forecast.warmth, forecastSafety: forecast.safety },
    budget: { ticks: 36, effort: 10, material: 8 }, status: "active",
    criterion: metric === "protection" ? "A local measurement meets the protective target; no named invention is required." : "The candidate support tolerates the required test load without observed damage.",
    abandonWhen: "Survival cost exceeds benefit, changed evidence favors another plan, a failed prerequisite, or budget exhausted.",
    reason: metric === "protection" ? "Observed conditions predict deteriorating warmth or safety; compare protection with ordinary survival." : "A useful raised placement requires support; evidence at the proposed load is uncertain." };
  mind.goals.push(goal);
  if (mind.goals.length > DISCOVERY_LIMITS.goals) { const unused = mind.goals.findIndex(g => g !== goal && g.status !== "active" && g.status !== "deferred" && !mind.goals.some(child => child.parentId === g.id)); if (unused >= 0) mind.goals.splice(unused, 1); else { mind.goals.pop(); return null; } }
  return goal;
}

export function prepareDiscovery(input: PrivatePolicyInput): LocalPlanChoice[] {
  const mind = input.agent.discovery!, physical = input.agent.physicalMind!, weather = weatherOf(input);
  const cache: PriceCache = new Map();
  const price = (actions: PlannedAction[], protection: number) => priceDiscoveryPlan(input, actions, protection, cache);
  const ordinary = planFromPrivateKnowledge(input);
  mind.metrics.expansions += ordinary[0]?.searchExpansions ?? 0;
  const closeOptionalWork = (reason: string) => {
    const active = mind.active; if (!active) return;
    const project = physical.projects.find(p => p.id === active.projectId);
    if (project) { project.status = "abandoned"; project.blocker = reason; project.updatedAt = input.tick; }
    for (const g of mind.goals.filter(g => (g.id === active.goalId || g.parentId === active.goalId) && g.status !== "satisfied")) { g.status = "abandoned"; g.reason = reason; g.updatedAt = input.tick; }
    for (const e of mind.experiments.filter(e => e.projectId === active.projectId && ["planned", "running", "interrupted"].includes(e.status))) { e.status = "inconclusive"; e.result = reason; e.endedAt = input.tick; }
    mind.failures = [...mind.failures, { signature: discoverySignature(active.alternative.operations), tick: input.tick, evidence: reason }].slice(-24);
    mind.active = null;
  };
  if (mind.active && (mind.active.spentTicks >= 36 || mind.active.spentEffort >= 10 || input.tick - mind.active.startedAt > 72)) closeOptionalWork("Work budget or bounded resumption window exhausted; retain completed work and all costs.");
  const immediate = Math.min(input.agent.needs.health, input.agent.needs.hydration, input.agent.needs.nutrition, input.agent.needs.energy) < 38 || depthAt(observedWater(input.agent.observations), input.agent.position) > 0;
  if (immediate) {
    for (const goal of mind.goals.filter(g => g.status === "active")) { goal.status = "deferred"; goal.updatedAt = input.tick; goal.reason = "Immediate survival interrupts optional work; realized parts and costs are retained."; }
    for (const experiment of mind.experiments.filter(e => e.status === "running" || e.status === "planned")) experiment.status = "interrupted";
    const project = physical.projects.find(p => p.id === mind.active?.projectId); if (project) { project.status = "interrupted"; project.blocker = "Immediate survival takes priority."; }
    return ordinary;
  }
  const active = mind.active, project = physical.projects.find(p => p.id === active?.projectId);
  if (active && project && project.cursor < project.operations.length) {
    {
      const remaining = project.operations.slice(project.cursor), actions = compileActions(input, remaining, project.position);
      if (actions) {
        const target = active.alternative.prediction ? predictDiscovery(mind, "protection", { ...active.alternative.prediction.features, weather: String(weather?.facts.weather), temperature: Number(weather?.facts.temperatureC) }).mean : active.alternative.predictedProtection;
        const priced = price(actions, target), normal = ordinary[0];
        const normalDestination = normal?.actions.filter(a => a.action === "move").at(-1)?.destination ?? input.agent.position;
        const normalScore = normal ? price(normal.actions, rememberedProtection(input.agent, normalDestination, input.tick, String(weather?.facts.weather))).score : -1000;
        // Hysteresis is a disclosed small continuation margin, not sunk-cost reward.
        if (priced.feasible && priced.score + .6 >= normalScore) {
          project.status = "active"; delete project.blocker;
          for (const g of mind.goals.filter(g => g.status === "deferred")) g.status = "active";
          return [choiceFor(active.alternative, actions, project.id), ...ordinary].slice(0, 8);
        }
        project.status = "interrupted"; project.blocker = "An ordinary survival plan currently has more value; retain completed work.";
        for (const g of mind.goals.filter(g => (g.id === active.goalId || g.parentId === active.goalId) && g.status === "active")) { g.status = "deferred"; g.updatedAt = input.tick; }
        for (const e of mind.experiments.filter(e => e.projectId === active.projectId && ["planned", "running"].includes(e.status))) e.status = "interrupted";
        return ordinary;
      }
      closeOptionalWork("Remaining prerequisites are no longer available in private observations.");
    }
  }
  if (!weather || input.tick - mind.lastReviewAt < 6) return ordinary;
  const forecast = { ...input.agent.needs }, knownProtection = rememberedProtection(input.agent, input.agent.position, input.tick, String(weather.facts.weather));
  for (let n = 0; n < DISCOVERY_LIMITS.horizon; n++) driftNeeds(forecast, { temperatureC: Number(weather.facts.temperatureC), weather: String(weather.facts.weather), daylight: Number(weather.facts.daylight), sheltered: false, byFire: false, protection: knownProtection });
  // No construction for entertainment when warmth/safety are already secure.
  if (forecast.warmth >= 58 && forecast.safety >= 48) return ordinary;
  mind.lastReviewAt = input.tick;
  const ordinaryValue = Math.max(...ordinary.slice(0, 3).map(choice => {
    const destination = choice.actions.filter(a => a.action === "move").at(-1)?.destination ?? input.agent.position;
    return price(choice.actions, rememberedProtection(input.agent, destination, input.tick, String(weather.facts.weather))).score;
  }));
  const generated = discoveryAlternatives(input, ordinaryValue, cache); mind.metrics.expansions += generated.expansions;
  mind.metrics.predictions += generated.alternatives.reduce((n,a)=>n+Number(Boolean(a.prediction))+Number(Boolean(a.supportPrediction)),0);
  let root = [...mind.goals].reverse().find(g => g.metric === "protection" && (g.status === "active" || g.status === "deferred"));
  if (!root) root = formGoal(input, "protection", null, .16, Math.max(0, input.agent.needs.warmth - forecast.warmth, input.agent.needs.safety - forecast.safety), [weather.id], forecast) ?? undefined;
  const alternatives = [...generated.alternatives];
  for (let n = 0; n < Math.min(3, ordinary.length); n++) {
    const choice = ordinary[n], destination = choice.actions.filter(a => a.action === "move").at(-1)?.destination ?? input.agent.position;
    const priced = price(choice.actions, rememberedProtection(input.agent, destination, input.tick, String(weather.facts.weather)));
    alternatives.push({ id: `survival-${n}`, kind: "survival", label: choice.candidate.summary, score: priced.score, cost: priced.cost, ticks: priced.ticks, informationValue: 0, predictedProtection: knownProtection, uncertainty: choice.uncertainty,
      evidenceIds: choice.candidate.knownObservationIds, rejection: null, operations: [], position: { ...destination } });
  }
  if(mind.mode==="none")for(const a of alternatives)if(a.operations.some(o=>o.kind==="test"))a.rejection="Optional experimentation disabled in this evaluation arm.";
  let ranked = alternatives.filter(a => !a.rejection).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  if (mind.mode === "random") {
    const best = ranked[0], tests = ranked.filter(a => a.operations.some(o => o.kind === "test") && a.cost <= (best?.cost ?? 0) && a.ticks <= (best?.ticks ?? 0));
    // Same optional-test opportunity and actual budget ceiling as the directed arm.
    if (best?.operations.some(o => o.kind === "test") && tests.length) { const pick = tests[Math.floor(survivalUnit(input.seed, input.tick, "matched-test") * tests.length)]; ranked = [pick, ...ranked.filter(a => a !== pick)]; }
  }
  if (mind.mode === "fixed") {
    // Competent fixed construction strategy: one stable proposal, measured-site
    // reuse and complete ordinary survival chains; no model updates or tests.
    ranked = ranked.filter(a => a.id === "arrange-0" || a.kind === "survival" || a.kind === "stay" || a.kind === "reuse");
  }
  const chosen = ranked[0] ?? alternatives[0];
  for (const alternative of alternatives) if (!alternative.rejection && alternative.id !== chosen.id) alternative.rejection = `Lower estimated net survival value than ${chosen.id} at this decision.`;
  const record = { id: id(mind, input.agent.id, "decision"), tick: input.tick, goalId: root?.id ?? null, selectedId: chosen.id, alternatives: [chosen, ...alternatives.filter(a => a.id !== chosen.id)].slice(0, 8), omitted: Math.max(0, alternatives.length - 8), expansions: generated.expansions,
    reason: chosen.operations.length ? "Selected after complete-plan costs and decision-relevant uncertainty; outcome remains unconfirmed." : "No optional test or construction currently outweighs this survival alternative." };
  mind.decisions.push(structuredClone(record)); mind.decisions = mind.decisions.slice(-DISCOVERY_LIMITS.decisions);
  if (!chosen.operations.length || !root) {
    if (root) { root.status = "deferred"; root.reason = record.reason; }
    if (chosen.kind === "reuse") return [choiceFor(chosen, [...pathAction(input.agent.position, chosen.position), { action: "rest", targetId: null, destination: null, duration: 2 }]), ...ordinary].slice(0, 8);
    if(chosen.kind==="survival"){const selected=ordinary[Number(chosen.id.split("-")[1])];return selected?[selected,...ordinary.filter(c=>c!==selected)]:ordinary;}
    if(chosen.kind==="stay")return [choiceFor(chosen,[{action:"rest",targetId:null,destination:null,duration:2}]),...ordinary].slice(0,8);
    return ordinary;
  }
  const actions = compileActions(input, chosen.operations, chosen.position); if (!actions) return ordinary;
  root.status = "active"; root.target = Math.max(.08, chosen.predictedProtection * .8); root.predictedBenefit = Math.max(0, chosen.score - (alternatives.find(a => a.id === "stay")?.score ?? 0));
  root.reason = "Observed exposure makes this complete plan worth comparing; its material and protection predictions remain uncertain.";
  const projectId = id(mind, input.agent.id, "project");
  const newProject = { id: projectId, createdAt: input.tick, updatedAt: input.tick, lastReviewAt: input.tick, metric: "exposure" as const, target: root.target, baseline: knownProtection, status: "active" as const,
    reason: root.reason, position: { ...chosen.position }, reserved: {}, operations: structuredClone(chosen.operations), cursor: 0,
    partIds: [...new Set(chosen.operations.flatMap(o => "partId" in o && !o.partId.startsWith("$") ? [o.partId] : []))], predictedBenefit: root.predictedBenefit, spentEffort: 0, revisions: 0 };
  physical.projects.push(newProject); physical.projects = physical.projects.slice(-8);
  mind.active = { projectId, goalId: root.id, alternative: structuredClone(chosen), completed: [], bindings: {}, startedAt: input.tick, spentEffort: 0, spentTicks: 0, ...(chosen.procedureId ? { sourceProcedureId: chosen.procedureId } : {}) };
  if (chosen.procedureId) mind.metrics.transfers++;
  let supportGoal: DiscoveryGoal | null = null;
  if (chosen.supportPrediction) supportGoal = formGoal(input, "support", root, chosen.supportPrediction.features.dose, root.predictedBenefit, chosen.evidenceIds);
  for (const metric of ["support", "protection"] as const) {
    const prediction = metric === "support" ? chosen.supportPrediction : chosen.prediction;
    if (!prediction || !chosen.operations.some(o => o.kind === "test" && o.measure === (metric === "support" ? "load" : "protection"))) continue;
    const experiment: DiscoveryExperiment = { id: id(mind, input.agent.id, "experiment"), projectId, goalId: supportGoal && metric === "support" ? supportGoal.id : root.id, createdAt: input.tick, metric,
      claim: metric === "support" ? `This geometry may tolerate ${prediction.features.dose.toFixed(2)} load units.` : "Local protection may justify using this arrangement instead of the best ordinary survival alternative.",
      prediction: structuredClone(prediction), competingOutcomes: { low: `Reading near ${prediction.low.toFixed(2)} favors another plan.`, high: `Reading near ${prediction.high.toFixed(2)} may justify relying on this option.` },
      decisionAffected: metric === "support" ? "Whether to place the raised part on this support." : "Whether to use, revise or abandon this arrangement.",
      intervention: chosen.operations.map(o => o.kind).join(" → "), stoppingRule: "Stop on urgent needs, a failed prerequisite, excessive cost, changed conditions or a completed local measurement.", maxTicks: 36, maxEffort: 10,
      status: "planned", evidenceId: null, result: null, spentEffort: 0, endedAt: null };
    mind.experiments.push(experiment);
  }
  mind.experiments = mind.experiments.slice(-DISCOVERY_LIMITS.experiments);
  return [choiceFor(chosen, actions, projectId), ...ordinary].slice(0, 8);
}

function choiceFor(alternative: DiscoveryAlternative, actions: PlannedAction[], projectId?: string): LocalPlanChoice {
  // Only the next primitive is committed: symbols created by shape bind before
  // subsequent primitives are proposed. Acquisition/travel remains a full chain.
  const firstOperation = actions.findIndex(a => a.manipulation);
  const next = firstOperation < 0 ? actions : actions.slice(0, firstOperation + 1);
  return { discoveryId: alternative.id, projectId, candidate: { goal: next.at(-1)?.action === "test_hypothesis" ? "research" : "stay_warm", targetId: next[0]?.targetId ?? null,
    score: alternative.score, expectedBenefit: alternative.score, risk: alternative.uncertainty, knownObservationIds: alternative.evidenceIds,
    summary: `${alternative.label}. Predicted protection ${alternative.predictedProtection.toFixed(2)}; this is not a confirmed result.`, predictedSteps: alternative.ticks, planActions: next.map(a => a.action) }, actions: next, uncertainty: alternative.uncertainty };
}
