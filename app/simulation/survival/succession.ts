import { driftNeeds } from "./physiology";
import type { AgentObservation, SuccessionReview, SurvivalAgent } from "./types";

export const SUCCESSION_MATURITY_STEPS = 36; // Six modeled hours, not biological maturity.
export const SUCCESSION_REVIEW_STEPS = 36;
export const SUCCESSION_PROVISIONS = Object.freeze({ freshwater: .5, food: .5 });

/** Private, deterministic population choice. No world/death count or random retry. */
export function evaluateSuccession(agent: SurvivalAgent, tick: number, predecessorId: string): SuccessionReview {
  const mode = predecessorId === agent.id ? "before_death" : "after_death";
  const recent = agent.observations.filter(o => tick - o.observedAt <= 144 && o.confidence >= .5);
  const death = recent.find(o => o.kind === "agent" && o.subjectId === predecessorId && o.facts.alive === false);
  const water = recent.find(o => o.kind === "resource" && o.facts.resourceKind === "freshwater" && Number(o.facts.availableEstimate) >= 3);
  const food = recent.find(o => o.kind === "resource" && o.facts.resourceKind === "food" && Number(o.facts.availableEstimate) >= 3);
  const weather = recent.find(o => o.kind === "weather");
  const shelter = recent.find(o => o.kind === "structure" && o.facts.structureKind === "shelter" && Number(o.facts.condition) > 10 && o.position && Math.hypot(o.position.x-agent.position.x,o.position.z-agent.position.z) <= 7);
  const evidence = [death, water, food, weather, shelter].filter((o): o is AgentObservation => Boolean(o)).map(o => structuredClone(o));
  const base = { predecessorId, mode, checkedAt: tick, reconsiderAfter: tick + SUCCESSION_REVIEW_STEPS, evidence } as const;
  const defer = (rationale: string): SuccessionReview => ({...base, choice:"deferred", score:0, rationale});
  if (!agent.alive || tick - agent.spawnedAt < SUCCESSION_MATURITY_STEPS) return defer("Gain at least six modeled hours of personal experience before considering a successor.");
  if (mode === "after_death" && !death) return defer("No recent personal observation confirms this agent's death.");
  if (!weather || typeof weather.facts.temperatureC !== "number" || typeof weather.facts.daylight !== "number") return defer("Observe current conditions before committing supplies to another life.");
  const future = {...agent.needs};
  for (let step=0; step<6; step++) driftNeeds(future, { temperatureC: weather.facts.temperatureC, weather:String(weather.facts.weather), daylight:weather.facts.daylight, sheltered:Boolean(shelter), byFire:false });
  if (Math.min(future.health, future.hydration, future.nutrition, future.energy, future.warmth, future.safety) < 35) return defer("Immediate survival takes priority: the next modeled hour would leave an essential condition too low.");
  const waterReserve = future.hydration < 60 ? 2 : 1;
  const foodReserve = future.nutrition < 60 ? 2 : 1;
  if (agent.inventory.freshwater - SUCCESSION_PROVISIONS.freshwater < waterReserve || agent.inventory.food - SUCCESSION_PROVISIONS.food < foodReserve) return defer("Keep personal food and water reserves before setting aside a successor's starter supplies.");
  const security = Object.values(future).reduce((sum,value)=>sum+value,0) / 600;
  const prospects = ((water?.confidence ?? 0)+(food?.confidence ?? 0)) / 2;
  const helpfulSocial = Math.min(1, agent.memory.filter(m => ["share","request","cooperate"].includes(m.action) && m.result === "helpful").length / 4);
  // This explicitly authored continuity value is not individual-survival utility.
  const score = Math.round((.2 + security*.3 + prospects*.25 + helpfulSocial*.1 + Number(Boolean(shelter))*.08 - .08) * 1000) / 1000;
  const plans = Boolean(water && food) && score >= .6;
  return {...base, score, choice: plans ? "planned" : "declined", rationale: plans
    ? `Chose to fund one next-generation agent while retaining personal reserves. Continuity value ${score.toFixed(3)}; only personally observed resource prospects and conditions were considered.`
    : `Chose not to fund a successor: observed prospects and current reserves did not justify the continuity cost (value ${score.toFixed(3)}). This can be reconsidered after six modeled hours.`};
}
