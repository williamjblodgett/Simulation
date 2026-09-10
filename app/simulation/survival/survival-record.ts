import type { AgentSurvivalRecord, SurvivalAgent, SurvivalRunState } from "./types";

export const freshSurvivalRecord = (tick: number): AgentSurvivalRecord => ({ since: tick, samples: [], lastDrinkAt: null, lastMealAt: null, blockedMoves: 0, refusedRequests: 0, incidents: [] });

/** Observer measurements only: never a source of policy knowledge or rewards. */
export function sampleSurvival(agent: SurvivalAgent, tick: number): void {
  const record = agent.survivalRecord;
  if (!record || (tick % 6 !== 0 && agent.alive)) return;
  const sample = { tick, health: agent.needs.health, hydration: agent.needs.hydration, nutrition: agent.needs.nutrition, warmth: agent.needs.warmth };
  if (record.samples.at(-1)?.tick === tick) record.samples[record.samples.length-1] = sample;
  else record.samples.push(sample);
  record.samples = record.samples.slice(-25);
}

const object = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const number = (v: unknown, min = 0, max = Infinity): v is number => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const integer = (v: unknown, max: number) => number(v,0,max) && Number.isInteger(v);

export function validateSurvivalExperience(state: SurvivalRunState): boolean {
  const bounds = state.environment.bounds;
  const position = (p: unknown) => object(p) && number(p.x,bounds.minX,bounds.maxX) && number(p.z,bounds.minZ,bounds.maxZ);
  for (const agent of state.agents) {
    const nav = agent.navigation;
    if (nav !== undefined && (!object(nav) || !(nav.destination === null || position(nav.destination))
      || !Array.isArray(nav.waypoints) || nav.waypoints.length > 64 || !nav.waypoints.every(position)
      || !integer(nav.failures,1e9) || !integer(nav.retryAt,state.tick+36)
      || !Array.isArray(nav.recent) || nav.recent.length > 12 || !nav.recent.every(r=>object(r)&&integer(r.tick,state.tick)&&position(r.position))
      || !Array.isArray(nav.blocked) || nav.blocked.length > 24 || !nav.blocked.every(b=>object(b)&&integer(b.tick,state.tick)&&position(b.from)&&position(b.to)))) return false;
    const record = agent.survivalRecord;
    if (record !== undefined) {
      if (!object(record) || !integer(record.since,state.tick) || !integer(record.blockedMoves,1e9) || !integer(record.refusedRequests,1e9)
        || !(record.lastDrinkAt === null || integer(record.lastDrinkAt,state.tick)) || !(record.lastMealAt === null || integer(record.lastMealAt,state.tick))
        || !Array.isArray(record.samples) || record.samples.length > 25 || !Array.isArray(record.incidents) || record.incidents.length > 24) return false;
      if (!record.samples.every((s,i)=>object(s)&&integer(s.tick,agent.diedAt??state.tick)&&s.tick>=record.since&&(i===0||s.tick>record.samples[i-1].tick)&&[s.health,s.hydration,s.nutrition,s.warmth].every(v=>number(v,0,100)))) return false;
      if (!record.incidents.every(r=>object(r)&&integer(r.tick,state.tick)&&typeof r.action==="string"&&typeof r.success==="boolean"&&typeof r.summary==="string"&&r.summary.length<=2000)) return false;
    }
  }
  return true;
}
