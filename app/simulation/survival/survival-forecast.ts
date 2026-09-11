import { driftNeeds, type NeedConditions } from "./physiology";
import type { AgentObservation, SurvivalAgent, SurvivalEnvironment, SurvivalNeeds, SurvivalPosition } from "./types";
import { canCollectFreshwater, estimateWaterTravel, observedWater } from "./water";
import { findPrivateRoute } from "./private-navigation";

const distance = (a: SurvivalPosition, b: SurvivalPosition) => Math.hypot(a.x - b.x, a.z - b.z);
const clip = (n: number) => Math.max(0, Math.min(100, n));

/** The same experienced passive benefit is used at the start and after returning. */
export function rememberedProtection(agent: SurvivalAgent, position: SurvivalPosition, tick: number, weather: string): number {
  if (!agent.physicalMind?.learningEnabled) return 0;
  const readings = agent.physicalMind.readings.filter(r => r.metric === "protection" && r.source !== "demonstration")
    .map(r => ({ ...r, protection: r.after }));
  const records = [...readings, ...(agent.physicalMind.uses ?? [])].sort((a, b) => b.tick - a.tick);
  const place = records.find(r => {
    const observation = agent.observations.find(o => o.subjectId === r.partId && o.facts.structureKind === "physical_part");
    return tick - r.tick <= 288 && distance(position, r.position) < 2 && observation
      && Number(observation.facts.condition) > 5 && (r.revision === undefined || observation.facts.revision === r.revision);
  });
  return place ? Math.min(1, place.protection) * (place.weather === weather ? 1 : 0.6) * Math.max(0.3, 1 - (tick - place.tick) / 360) : 0;
}

export function rememberedConditions(agent: SurvivalAgent, tick: number, position = agent.position): NeedConditions {
  const weather = agent.observations.find(o => o.kind === "weather");
  const kind = String(weather?.facts.weather ?? "clear");
  const structures = agent.observations.filter(o => o.kind === "structure" && o.position && Number(o.facts.condition) > 5);
  return { temperatureC: Number(weather?.facts.temperatureC ?? 13), weather: kind, daylight: Number(weather?.facts.daylight ?? 0.5),
    sheltered: structures.some(o => o.facts.structureKind === "shelter" && distance(position, o.position!) <= 6),
    byFire: structures.some(o => o.facts.structureKind === "fire" && distance(position, o.position!) <= 7),
    ...(agent.physicalMind ? { protection: rememberedProtection(agent, position, tick, kind) } : {}) };
}

export function timeToHarm(needs: SurvivalNeeds, conditions: NeedConditions, maxTicks = 72): number | null {
  const projected = { ...needs };
  for (let i = 1; i <= maxTicks; i++) {
    const health = projected.health; driftNeeds(projected, conditions);
    if (projected.health < health) return i;
  }
  return null;
}

/** Expected aid is a contingent branch, never inventory already possessed. */
export function requestExpectation(agent: SurvivalAgent, other: AgentObservation, resource: "freshwater" | "food", tick: number): number {
  const experience = agent.learning.find(l => l.context === `aid:${other.subjectId}:${resource}`);
  const observedNeed = Number(other.facts[resource === "freshwater" ? "hydrationEstimate" : "nutritionEstimate"] ?? 55);
  const evidence = experience ? ((experience.successes ?? 0) + 1) / (experience.attempts + 3) : 0.35;
  const recentRefusal = experience && experience.expectedUtility < 0 && tick - experience.updatedAt < 12;
  return Math.max(0.01, Math.min(0.8, evidence * (observedNeed < 55 ? 0.12 : 1) * (recentRefusal ? 0.25 : 1)));
}

/** Reconsider an unsafe plan using private forecasts, without choosing the replacement. */
export function planNeedsRepair(agent: SurvivalAgent, tick: number, bounds?: SurvivalEnvironment["bounds"]): boolean {
  const plan = agent.currentPlan;
  if (!plan || plan.status !== "active") return false;
  const conditions = rememberedConditions(agent, tick), deadline = timeToHarm(agent.needs, conditions);
  if (deadline === null) return false;
  const needs = { ...agent.needs }, inventory = { ...agent.inventory };
  const waiting = { ...agent.needs };
  let position = { ...agent.position }, elapsed = 0;
  const water = observedWater(agent.observations);
  for (const step of plan.steps.slice(plan.activeStepIndex)) {
    let duration = Math.max(1, step.remainingSteps);
    if (step.action === "move" && step.destination) {
      // Recorded route length is preferable to assuming an unobstructed straight line.
      const route=agent.navigation?.destination&&distance(agent.navigation.destination,step.destination)<.1&&agent.navigation.waypoints.length?agent.navigation.waypoints:bounds?findPrivateRoute(agent.observations,bounds,position,step.destination,agent.navigation?.blocked,400):[step.destination];
      if(!route)return true;
      let from=position,total=0;
      for(const waypoint of route){total+=estimateWaterTravel(water,from,waypoint,conditions.temperatureC,conditions.weather==="storm").duration;from=waypoint;}
      duration=Math.max(1,Math.ceil(total));
    }
    for (let i = 0; i < duration; i++) {
      // The current tick's physiological drift has already occurred before deliberation.
      if (elapsed > 0) {
        driftNeeds(needs, rememberedConditions(agent, tick, position));
        if (agent.discovery) driftNeeds(waiting, conditions);
      }
      // Legacy studies retain their original interruption rule. Policy 4 must
      // not cancel every recovery journey merely because injury already exists.
      // Compare the complete remaining plan with staying exposed, below.
      if (needs.health <= 0 || (!agent.discovery && needs.health < agent.needs.health)) return true;
      elapsed++;
      if (elapsed > 40) return deadline < elapsed;
    }
    if (step.action === "move" && step.destination) position = step.destination;
    if (step.action === "collect") {
      const site = agent.observations.find(o => o.subjectId === step.targetId && o.kind === "resource");
      const kind = site?.facts.resourceKind;
      const footprint=site&&observedWater([site])[0];
      const accessible=site?.position&&(kind==="freshwater"&&footprint?canCollectFreshwater(footprint,position):distance(position,site.position)<=4.5);
      if (accessible && (kind === "freshwater" || kind === "food")) inventory[kind] += Math.min(Number(site?.facts.availableEstimate) || 0, kind === "freshwater" ? 2 : 1.5);
    }
    if (step.action === "drink" && inventory.freshwater >= 1) { inventory.freshwater--; needs.hydration = clip(needs.hydration + 34); }
    if (step.action === "eat" && inventory.food >= 1) { inventory.food--; needs.nutrition = clip(needs.nutrition + (agent.technologies.includes("food_smoking") ? 32 : 27)); }
    if (step.action === "rest") { needs.energy = clip(needs.energy + 13 * duration); needs.health = clip(needs.health + 0.35 * duration); }
    if (step.action === "warm") needs.warmth = clip(needs.warmth + (conditions.daylight > 0.35 ? 9 : 3));
    if (step.action === "shelter") {
      const local = agent.discovery ? rememberedConditions(agent, tick, position) : conditions;
      needs.warmth = clip(needs.warmth + 2 + (local.protection ?? 0) * 3); needs.safety = clip(needs.safety + (local.protection ?? 0) * 2);
    }
    // A refusal branch has no transfer. A request alone cannot certify survival.
  }
  if (agent.discovery) {
    // Equal, bounded private forecast; no future weather or hypothetical world
    // evaluation. Retain a viable recovery chain that reduces the injury, even
    // when it cannot undo existing damage before the next tick.
    const local = rememberedConditions(agent, tick, position);
    for (let i = elapsed; i < 36; i++) { driftNeeds(needs, local); driftNeeds(waiting, conditions); }
    if (needs.health <= 0) return true;
    if (needs.health > 0 && needs.health > waiting.health + .1) return false;
  }
  const afterDeadline = timeToHarm(needs, rememberedConditions(agent, tick, position));
  return deadline <= Math.max(6, elapsed + 2) && (afterDeadline ?? Infinity) <= Math.max(2, deadline - elapsed + 1);
}
