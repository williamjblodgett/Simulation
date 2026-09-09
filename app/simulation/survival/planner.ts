import { RESEARCH_CATALOG } from "./catalog";
import { researchMaterialEvidence } from "./research-evidence";
import { driftNeeds, type NeedConditions } from "./physiology";
import { survivalUnit } from "./random";
import { chooseExperimentDose, preparedMaterialContext } from "./experiments";
import type { AgentDecisionCandidate, AgentGoalKind, AgentObservation, SurvivalActionKind, SurvivalAgent, SurvivalInventory, SurvivalNeeds, SurvivalPosition } from "./types";

/** This is the entire policy boundary: no resources, other agents or world truth. */
export interface PrivatePolicyInput {
  agent: SurvivalAgent;
  tick: number;
  seed: number;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}
export interface PlannedAction {
  experimentDose?: number;
  action: SurvivalActionKind;
  targetId: string | null;
  destination: SurvivalPosition | null;
  duration: number;
  resource?: "freshwater" | "food";
  amount?: number;
}
export interface LocalPlanChoice {
  candidate: AgentDecisionCandidate;
  actions: PlannedAction[];
  uncertainty: number;
}
interface SearchState {
  needs: SurvivalNeeds;
  inventory: SurvivalInventory;
  remainingSites: Record<string, number>;
  position: SurvivalPosition;
  actions: PlannedAction[];
  used: string[];
  evidence: string[];
  elapsed: number;
  goal: AgentGoalKind;
  targetId: string | null;
  informationValue: number;
  risk: number;
  sheltered: boolean;
  summary: string;
}
const clip = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const dist = (a: SurvivalPosition, b: SurvivalPosition) => Math.hypot(a.x - b.x, a.z - b.z);
const round = (n: number) => Math.round(n * 1000) / 1000;
export const POLICY_SEARCH_BUDGET = { depth: 5, width: 10, expansions: 700 } as const;

/** A disclosed survival potential, not a probability of being alive. */
export function survivalPotential(needs: SurvivalNeeds, inventory: SurvivalInventory): number {
  const water = clip(needs.hydration + Math.min(2, inventory.freshwater) * 24);
  const food = clip(needs.nutrition + Math.min(2, inventory.food) * 22);
  const values = [needs.health, water, food, needs.energy, needs.warmth, needs.safety];
  const weights = [3, 3, 2, 1, 1.5, 1];
  return values.reduce((sum, value, index) => sum + weights[index] * Math.log(5 + value) * 10, 0);
}

function decay(node: SearchState, ticks: number, conditions: Omit<NeedConditions, "sheltered" | "byFire">, fires: SurvivalPosition[]): void {
  for (let i = 0; i < ticks; i++) driftNeeds(node.needs, { ...conditions, sheltered: node.sheltered, byFire: fires.some(p => dist(p, node.position) <= 7) });
  node.elapsed += ticks;
}

function materialValue(node: SearchState, agent: SurvivalAgent): number {
  // Initial affordance priors: materials matter only for a reachable survival investment.
  const shelter = node.sheltered ? 0 : Math.min(node.inventory.wood / 4, 1) * Math.min(node.inventory.fiber / 2, 1) * 7;
  const cold = Math.max(0, 75 - node.needs.warmth) / 30;
  let techniques = 0;
  for (const def of RESEARCH_CATALOG) {
    if (agent.technologies.includes(def.id) || !def.prerequisiteTechnologies.every(id => agent.technologies.includes(id))) continue;
    if (!def.requiredObservations.every(kind => agent.observations.some(o => o.facts.resourceKind === kind))) continue;
    const fraction = Math.min(...Object.entries(def.inputs).map(([kind, amount]) => Math.min(1, node.inventory[kind as keyof SurvivalInventory] / amount)));
    techniques += fraction * (def.id === "controlled_fire" ? 3 + cold : 2);
  }
  return shelter + Math.min(9, techniques);
}

/** Fixed expansion counts keep decisions independent of frame rate and worker scheduling. */
export function planFromPrivateKnowledge(input: PrivatePolicyInput): LocalPlanChoice[] {
  const { agent, tick, seed, bounds } = input;
  const weather = agent.observations.find(o => o.kind === "weather");
  const temperature = Number(weather?.facts.temperatureC ?? 13);
  const storm = weather?.facts.weather === "storm";
  const conditions = { temperatureC: temperature, weather: String(weather?.facts.weather ?? "clear"), daylight: Number(weather?.facts.daylight ?? 0.5) };
  const known = agent.observations.filter(o => o.position && o.facts.researchEvidence !== true);
  const fires = known.filter(o => o.kind === "structure" && o.facts.structureKind === "fire" && Number(o.facts.condition) > 5).map(o => o.position!);
  const resources = known.filter(o => o.kind === "resource" && Number(o.facts.availableEstimate) > 0)
    .sort((a, b) => dist(agent.position, a.position!) - dist(agent.position, b.position!) || a.id.localeCompare(b.id));
  const start: SearchState = { needs: { ...agent.needs }, inventory: { ...agent.inventory }, remainingSites: Object.fromEntries(resources.map(o => [o.subjectId, Number(o.facts.availableEstimate)])), position: { ...agent.position }, actions: [], used: [], evidence: agent.observations.filter(o => o.kind === "weather" || (o.kind === "structure" && o.position && dist(o.position, agent.position) <= 7)).map(o => o.id), elapsed: 0, goal: "wait", targetId: null, informationValue: 0, risk: 0, sheltered: known.some(o => o.kind === "structure" && o.facts.structureKind === "shelter" && Number(o.facts.condition) > 5 && dist(agent.position, o.position!) <= 6), summary: "Wait briefly while preserving reserves." };
  const initialValue = survivalPotential(start.needs, start.inventory);
  const rankCache = new WeakMap<SearchState, number>();
  const rank = (node: SearchState) => {
    const cached = rankCache.get(node);
    if (cached !== undefined) return cached;
    const horizon = { ...node, needs: { ...node.needs } };
    decay(horizon, Math.max(0, 18 - node.elapsed), conditions, fires);
    const goalExperience = agent.learning.find(item => item.context === `goal:${node.goal}`);
    const learnedLoss = Math.max(0, -(goalExperience?.expectedUtility ?? 0)) * 0.04;
    const value = survivalPotential(horizon.needs, node.inventory) - initialValue + materialValue(node, agent) + node.informationValue - node.risk - learnedLoss - node.elapsed * 0.12;
    rankCache.set(node, value);
    return value;
  };
  let beam = [start];
  const terminals: SearchState[] = [];
  let expansions = 0;
  for (let depth = 0; depth < POLICY_SEARCH_BUDGET.depth && expansions < POLICY_SEARCH_BUDGET.expansions; depth++) {
    const next: SearchState[] = [];
    for (const parent of beam) {
      const add = (key: string, action: PlannedAction, goal: AgentGoalKind, summary: string, apply: (node: SearchState) => void, observation?: AgentObservation) => {
        if (expansions >= POLICY_SEARCH_BUDGET.expansions || parent.used.includes(key)) return;
        expansions++;
        const node: SearchState = { ...parent, needs: { ...parent.needs }, inventory: { ...parent.inventory }, remainingSites: { ...parent.remainingSites }, position: { ...parent.position }, actions: [...parent.actions, action], used: [...parent.used, key], evidence: [...parent.evidence], goal: parent.actions.length ? parent.goal : goal, targetId: parent.actions.length ? parent.targetId : action.targetId, summary: parent.actions.length ? parent.summary : summary };
        if (action.action === "move") node.sheltered = false;
        decay(node, Math.max(0, action.duration - (parent.actions.length ? 0 : 1)), conditions, fires);
        apply(node);
        if (observation) node.evidence.push(observation.id);
        if (node.needs.health <= 0 || node.elapsed > 40) return;
        next.push(node);
        if (action.action !== "move" || goal === "explore") terminals.push(node);
      };
      const simple = (action: SurvivalActionKind, duration = 1): PlannedAction => ({ action, targetId: null, destination: null, duration });
      if (parent.inventory.freshwater >= 1 && parent.needs.hydration < 77) add(`drink-${Math.floor(parent.inventory.freshwater)}`, simple("drink"), "secure_water", "Use carried water before hydration falls further.", n => { n.inventory.freshwater--; n.needs.hydration = clip(n.needs.hydration + 34); });
      if (parent.inventory.food >= 1 && parent.needs.nutrition < 79) add(`eat-${Math.floor(parent.inventory.food)}`, simple("eat"), "secure_food", "Eat carried food to protect future nutrition.", n => { n.inventory.food--; n.needs.nutrition = clip(n.needs.nutrition + (agent.technologies.includes("food_smoking") ? 32 : 27)); });
      if (parent.needs.energy < 80) add("rest", simple("rest", 2), "recover", "Rest now so the next journey starts with more energy.", n => { n.needs.energy = clip(n.needs.energy + 26); n.needs.health = clip(n.needs.health + 0.7); });
      if (!parent.sheltered && (parent.needs.safety < 80 || parent.needs.warmth < 70)) add("reduce-exposure", simple("shelter"), "seek_safety", "Reduce exposure here while considering a built shelter.", n => { n.needs.warmth = clip(n.needs.warmth + 5); n.needs.safety = clip(n.needs.safety + 4); });
      if (parent.needs.warmth < 82) add("warm", simple("warm"), "stay_warm", "Conserve warmth using the conditions this agent observed.", n => { const fire = agent.technologies.includes("controlled_fire") && n.inventory.wood >= 1; n.needs.warmth = clip(n.needs.warmth + (fire ? 29 : Number(weather?.facts.daylight) > 0.35 ? 9 : 3)); if (fire) n.inventory.wood--; });
      const nearbyResources = [...new Set(resources.map(o => o.facts.resourceKind))].flatMap(kind => resources.filter(o => o.facts.resourceKind === kind).sort((a,b) => dist(parent.position,a.position!) - dist(parent.position,b.position!)).slice(0,3));
      for (const observation of nearbyResources) {
        if (parent.remainingSites[observation.subjectId] < 0.25) continue;
        const kind = observation.facts.resourceKind as keyof SurvivalInventory;
        if (!(kind in parent.inventory)) continue;
        const needed = kind === "freshwater" || kind === "food" ? parent.inventory[kind] < 2 : parent.inventory[kind] < (kind === "wood" ? 5 : 3);
        if (!needed) continue;
        const distance = dist(parent.position, observation.position!);
        const goal: AgentGoalKind = kind === "freshwater" ? "secure_water" : kind === "food" ? "secure_food" : "gather_material";
        if (distance > 3) {
          add(`move-${observation.subjectId}`, { action: "move", targetId: observation.subjectId, destination: { ...observation.position! }, duration: Math.max(1, Math.ceil((distance - 2.4) / 7.5)) }, goal, `Travel to remembered ${kind}; estimated travel cost includes falling needs.`, n => { n.position = { ...observation.position! }; n.needs.energy = clip(n.needs.energy - distance / 7.5 * 0.34); n.sheltered = false; }, observation);
        } else {
          const action = kind === "freshwater" || kind === "food" ? "collect" : "gather";
          const learned = agent.learning.find(l => l.context === `site:${observation.subjectId}:${action}`);
          const reliability = learned ? ((learned.successes ?? learned.attempts) + 1) / (learned.attempts + 2) : 0.82;
          const freshness = Math.max(0.25, 1 - (tick - observation.observedAt) / 300);
          add(`collect-${observation.subjectId}-${parent.actions.filter(a => (a.action === "collect" || a.action === "gather") && a.targetId === observation.subjectId).length}`, { action, targetId: observation.subjectId, destination: { ...observation.position! }, duration: 1 }, goal, `Gather ${kind} at ${observation.subjectId}; compare remembered yield, evidence age and travel risk.`, n => {
            const yieldEstimate = learned?.expectedYield ?? (kind === "freshwater" ? agent.technologies.includes("fired_vessel") ? 2.8 : 2 : agent.technologies.includes("knapped_edge") ? 2 : 1.5);
            const quantity = Math.min(n.remainingSites[observation.subjectId], yieldEstimate);
            n.inventory[kind] += quantity;
            n.remainingSites[observation.subjectId] -= quantity;
            n.risk += (1 - reliability * freshness) * 12;
            if (observation.facts.contaminated === true && !(agent.technologies.includes("water_boiling") && n.inventory.wood >= 0.25)) n.risk += 9;
          }, observation);
        }
      }
      for (const observation of known.filter(o => o.kind === "structure" && o.facts.structureKind === "shelter" && Number(o.facts.condition) > 5).slice(0, 3)) {
        const distance = dist(parent.position, observation.position!);
        if (distance > 3) add(`shelter-move-${observation.subjectId}`, { action: "move", targetId: observation.subjectId, destination: observation.position, duration: Math.max(1, Math.ceil((distance - 2.4) / 7.5)) }, "seek_safety", "Move toward an observed shelter before exposure worsens.", n => { n.position = { ...observation.position! }; n.sheltered = true; }, observation);
        else if (parent.needs.warmth < 85 || parent.needs.safety < 85) add("shelter", { action: "shelter", targetId: observation.subjectId, destination: observation.position, duration: 1 }, "seek_safety", "Use the remembered shelter to reduce exposure.", n => { n.sheltered = true; n.needs.warmth = clip(n.needs.warmth + 18); n.needs.safety = clip(n.needs.safety + 16); }, observation);
      }
      if (!parent.sheltered && parent.inventory.wood >= 4 && parent.inventory.fiber >= (agent.technologies.includes("twisted_cordage") ? 1 : 2)) add("build", { ...simple("build", 2), destination: parent.position }, "build_shelter", "Invest carried materials in shelter to reduce future exposure.", n => { n.inventory.wood -= 4; n.inventory.fiber -= agent.technologies.includes("twisted_cordage") ? 1 : 2; n.sheltered = true; n.needs.energy = clip(n.needs.energy - 2.4); n.needs.safety = clip(n.needs.safety + 18); n.needs.warmth = clip(n.needs.warmth + 12); });
      if (Math.min(parent.needs.hydration, parent.needs.nutrition, parent.needs.energy, parent.needs.health) > 55) {
        for (const def of RESEARCH_CATALOG) {
          if (agent.technologies.includes(def.id) || !def.prerequisiteTechnologies.every(id => agent.technologies.includes(id))) continue;
          if (!Object.entries(def.inputs).every(([kind, amount]) => parent.inventory[kind as keyof SurvivalInventory] >= amount)) continue;
          const evidence = def.requiredObservations.map(kind => researchMaterialEvidence(agent, kind));
          if (evidence.some(o => !o)) continue;
          const last = agent.research.find(p => p.technologyId === def.id)?.attempts.at(-1);
          if (last && tick - last.attemptedAt < 12) continue;
          const previousTest = agent.learning.find(l => l.context === `site:${def.id}:test_hypothesis`);
          if (previousTest && tick - previousTest.updatedAt < 12) continue;
          const experimentDose = chooseExperimentDose(def.id, agent.research.find(p => p.technologyId === def.id)?.attempts ?? [], preparedMaterialContext(def.id, weather?.facts.weather === "rain" || storm, agent.materialSamples));
          if (experimentDose === null) continue;
          add(`test-${def.id}`, { action: "test_hypothesis", targetId: def.id, destination: null, duration: 1, experimentDose }, "research", `Test ${def.discoveryName.toLowerCase()} at intensity ${experimentDose} while reserves permit.`, n => {
            for (const [kind, amount] of Object.entries(def.inputs)) n.inventory[kind as keyof SurvivalInventory] -= amount;
            n.informationValue += def.id === "controlled_fire" && temperature < 14 ? 11 : 7;
            n.needs.energy = clip(n.needs.energy - 0.4);
            n.evidence.push(...evidence.map(o => o!.id));
          });
        }
      }
      for (const observation of known.filter(o => o.kind === "agent" && o.facts.alive === true && dist(parent.position, o.position!) <= 8).slice(0, 4)) {
        if (Number(observation.facts.lastPresenceFailureAt ?? -1) >= observation.observedAt || observation.confidence < 0.4) continue;
        const relation = agent.relationships.find(r => r.agentId === observation.subjectId);
        const resource = parent.needs.hydration <= parent.needs.nutrition ? "freshwater" : "food";
        if (Math.min(parent.needs.hydration, parent.needs.nutrition) < 42 && parent.inventory[resource] < 1) add(`request-${observation.subjectId}`, { ...simple("request"), targetId: observation.subjectId, resource, amount: 1 }, "request_help", `Request one ${resource}; the other agent may refuse.`, n => { n.inventory[resource] += 0.45; n.risk += 2; }, observation);
        const theirWater = Number(observation.facts.hydrationEstimate ?? 100), theirFood = Number(observation.facts.nutritionEstimate ?? 100);
        const gift = theirWater <= theirFood ? "freshwater" : "food";
        if (Math.min(theirWater, theirFood) < 50 && parent.inventory[gift] >= 2 && Math.min(parent.needs.hydration, parent.needs.nutrition) > 65) add(`share-${observation.subjectId}`, { ...simple("share"), targetId: observation.subjectId, resource: gift, amount: 1 }, "share", `Offer one ${gift} while retaining a reserve; future mutual aid is uncertain.`, n => { n.inventory[gift]--; n.informationValue += (relation?.aidReceived ?? 0) > 0 ? 4 : 1; }, observation);
        if (tick - (relation?.lastInteractionAt ?? -100) > 36 && parent.needs.energy > 65) add(`cooperate-${observation.subjectId}`, { ...simple("cooperate"), targetId: observation.subjectId }, "cooperate", "Request fresh resource information; another agent decides what to share.", n => { n.informationValue += resources.length < 6 ? 5 : 0.5; n.needs.energy = clip(n.needs.energy - 0.5); }, observation);
      }
      if (!parent.used.includes("explore") && parent.actions.length < 3) {
        for (let direction = 0; direction < 3; direction++) {
          const angle = (survivalUnit(seed, "private-explore", agent.id, tick) + direction / 3) * Math.PI * 2;
          const destination = { x: clip(parent.position.x + Math.cos(angle) * 25, bounds.minX, bounds.maxX), z: clip(parent.position.z + Math.sin(angle) * 25, bounds.minZ, bounds.maxZ) };
          const overlap = known.filter(o => dist(destination, o.position!) < 22).length;
          add(`explore`, { action: "move", targetId: null, destination, duration: 4 }, "explore", "Explore less-observed terrain for future water, food or shelter options.", n => { n.position = destination; n.sheltered = false; n.informationValue += (resources.some(o => o.facts.resourceKind === "freshwater") ? 3 : 14) / (1 + overlap); n.actions.push({ action: "explore", targetId: null, destination, duration: 1 }); decay(n, 1, conditions, fires); n.needs.energy = clip(n.needs.energy - 1.36); });
        }
      }
      if (!parent.actions.length) add("wait", simple("wait"), "wait", "Wait briefly while preserving effort.", () => {});
    }
    next.sort((a, b) => rank(b) - rank(a) || signature(a).localeCompare(signature(b)));
    beam = next.slice(0, POLICY_SEARCH_BUDGET.width);
  }
  const unique = new Map<string, SearchState>();
  for (const node of terminals.sort((a, b) => rank(b) - rank(a) || signature(a).localeCompare(signature(b)))) {
    const first = node.actions[0];
    const key = `${first.action}:${first.targetId ?? ""}:${first.destination?.x ?? ""}:${first.destination?.z ?? ""}`;
    if (!unique.has(key)) unique.set(key, node);
  }
  return [...unique.values()].slice(0, 8).map(node => ({
    candidate: { goal: node.goal, targetId: node.targetId, score: round(rank(node)), expectedBenefit: round(survivalPotential(node.needs, node.inventory) - initialValue), risk: round(node.risk), knownObservationIds: [...new Set(node.evidence)], summary: node.summary, predictedSteps: node.elapsed, predictedSurvival: round(rank(node) - node.informationValue), planActions: node.actions.map(a => a.action) },
    actions: node.actions,
    uncertainty: round(clip(node.risk / 12 + node.informationValue / 25, 0.05, 0.95)),
  }));
}

function signature(node: SearchState): string {
  return node.actions.map(a => `${a.action}:${a.targetId ?? ""}`).join("|");
}

/** Conservative independently evaluated resource terms; no proposer mind/world state. */
export function evaluateDonation(agent: SurvivalAgent, resource: "freshwater" | "food", amount: number): { accepted: boolean; score: number; retained: number; reason: string } {
  const need = resource === "freshwater" ? agent.needs.hydration : agent.needs.nutrition;
  const retained = agent.inventory[resource] - amount;
  const score = clip((need - 25) / 100 + Math.min(2, retained) * 0.2, 0, 1);
  const accepted = amount > 0 && retained >= 1 && need >= 55 && agent.needs.health >= 25;
  return { accepted, score: round(score), retained, reason: accepted ? `One ${resource} remains in reserve and current need is stable.` : `Retain ${resource}: current need or post-transfer reserve is insufficient.` };
}
