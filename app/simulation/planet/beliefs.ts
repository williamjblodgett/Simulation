import { deterministicIndex, deterministicUnit } from "./random";
import type { BeliefState, PlanetAgent, PlanetWorldState } from "./types";

export const MAX_PLANET_BELIEFS = 128;
export const MAX_BELIEF_VALUES = 5;
export const MAX_BELIEF_TENETS = 7;
export const MAX_BELIEF_REFORMS = 24;

const VALUE_LABELS: Record<string, string> = {
  survival: "Preservation of life",
  nutrition: "Shared provision",
  hydration: "Guardianship of water",
  safety: "Mutual protection",
  belonging: "Reciprocal obligation",
  competence: "Knowledge through practice",
  prosperity: "Stewarded abundance",
};
const TENETS_BY_VALUE: Record<string, string[]> = {
  survival: ["Life should be preserved through foresight", "Preparation is a duty to future generations"],
  nutrition: ["Food stores belong first to those in need", "Cultivation creates an obligation to replenish the soil"],
  hydration: ["Water must remain accessible and clean", "Springs and watersheds deserve collective care"],
  safety: ["A community protects without wasting life", "Threats should be understood before force is used"],
  belonging: ["Commitments freely made should be honored", "Strangers may earn belonging through contribution"],
  competence: ["Claims gain authority through observable evidence", "Knowledge should pass to willing learners"],
  prosperity: ["Surplus should secure tomorrow before displaying power", "Trade is worthy when every party consents"],
};
const BELIEF_SUFFIXES = ["Accord", "Way", "Covenant", "Practice", "Concord", "Path", "Memory", "Circle"];
const BELIEF_COLORS = ["#73d2de", "#f6bd60", "#f28482", "#84a59d", "#cdb4db", "#90be6d", "#f8961e", "#7b9acc"];

function inferredValues(agent: PlanetAgent): string[] {
  return Object.entries(agent.mind.learnedDriveWeights)
    .sort(([leftId, left], [rightId, right]) => right - left || leftId.localeCompare(rightId))
    .slice(0, 3)
    .map(([id]) => VALUE_LABELS[id] ?? id.replaceAll("_", " "));
}

function valueKey(label: string): string {
  return Object.entries(VALUE_LABELS).find(([, value]) => value === label)?.[0] ?? "belonging";
}

export interface FoundBeliefInput {
  name?: string;
  kind?: BeliefState["kind"];
  coreValues?: string[];
  tenets?: string[];
  parentBeliefId?: string | null;
}

export function foundBeliefSystem(
  world: PlanetWorldState,
  founderAgentId: string,
  input: FoundBeliefInput = {},
): BeliefState | null {
  const founder = world.agents.find(({ id }) => id === founderAgentId);
  if (!founder || !founder.alive || founder.beliefId || world.beliefs.length >= MAX_PLANET_BELIEFS) return null;
  const coreValues = [...new Set(input.coreValues ?? inferredValues(founder))].slice(0, MAX_BELIEF_VALUES);
  const tenets = [...new Set(input.tenets ?? coreValues.flatMap((value) => TENETS_BY_VALUE[valueKey(value)] ?? []).slice(0, 4))]
    .slice(0, MAX_BELIEF_TENETS);
  const sequence = world.nextIds.belief++;
  const settlement = world.settlements.find(({ id }) => id === founder.homeSettlementId);
  const name = input.name?.trim().slice(0, 80)
    || `${settlement?.name.split(/(?=[A-Z])/)[0] ?? founder.name.split(" ")[1]} ${BELIEF_SUFFIXES[deterministicIndex(world.seed, BELIEF_SUFFIXES.length, founder.id, sequence)]}`;
  const belief: BeliefState = {
    id: `belief-${sequence}`,
    name,
    color: BELIEF_COLORS[deterministicIndex(world.seed, BELIEF_COLORS.length, founder.id, "belief-color")],
    kind: input.kind ?? (founder.mind.observations.some(({ kind }) => kind === "outcome") ? "philosophy" : "ethical_system"),
    coreValues,
    tenets,
    founderAgentId: founder.id,
    originSettlementId: founder.homeSettlementId,
    originDay: world.day,
    adherentIds: [founder.id],
    influence: founder.influence,
    parentBeliefId: input.parentBeliefId ?? null,
    reformHistory: [],
    schismIds: [],
    active: true,
  };
  world.beliefs.push(belief);
  founder.beliefId = belief.id;
  founder.beliefConviction = 0.62;
  const polity = world.polities.find(({ id }) => id === founder.polityId);
  if (polity && !polity.beliefIds.includes(belief.id)) polity.beliefIds.push(belief.id);
  const parent = world.beliefs.find(({ id }) => id === belief.parentBeliefId);
  if (parent && !parent.schismIds.includes(belief.id)) parent.schismIds.push(belief.id);
  world.revision += 1;
  return belief;
}

export function considerBeliefAdoption(world: PlanetWorldState, agentId: string): BeliefState | null {
  const agent = world.agents.find(({ id }) => id === agentId);
  if (!agent || !agent.alive || agent.beliefId) return null;
  const settlement = world.settlements.find(({ id }) => id === agent.homeSettlementId);
  if (!settlement) return null;
  const localBeliefs = world.beliefs
    .filter(({ active, adherentIds }) => active && adherentIds.some((id) => settlement.residentIds.includes(id)))
    .sort((left, right) => right.influence - left.influence || left.id.localeCompare(right.id));
  const chosen = localBeliefs[0];
  if (!chosen) return null;
  const matchingValues = chosen.coreValues.filter((value) => inferredValues(agent).includes(value)).length;
  const probability = Math.min(0.7, 0.04 + matchingValues * 0.12 + chosen.influence / 2_000);
  if (deterministicUnit(world.seed, agent.id, chosen.id, agent.mind.decisionSequence, "adopt-belief") > probability) return null;
  agent.beliefId = chosen.id;
  agent.beliefConviction = Math.min(0.85, 0.35 + matchingValues * 0.12);
  if (!chosen.adherentIds.includes(agent.id)) chosen.adherentIds.push(agent.id);
  chosen.adherentIds.sort();
  chosen.influence += agent.influence * agent.beliefConviction;
  world.revision += 1;
  return chosen;
}

export function considerBeliefFormation(world: PlanetWorldState, agentId: string): BeliefState | null {
  const agent = world.agents.find(({ id }) => id === agentId);
  if (!agent || !agent.alive || agent.beliefId || world.day < 3 || agent.mind.contextualLearning.length < 2) return null;
  const experience = agent.mind.contextualLearning.reduce((sum, record) => sum + Math.abs(record.expectedValue), 0);
  const probability = Math.min(0.02, 0.001 + experience * 0.001);
  if (deterministicUnit(world.seed, agent.id, agent.mind.decisionSequence, "found-belief") > probability) return null;
  return foundBeliefSystem(world, agent.id);
}

export function reformBelief(
  world: PlanetWorldState,
  beliefId: string,
  agentId: string,
  addedValue: string | null,
  removedValue: string | null,
): BeliefState | null {
  const belief = world.beliefs.find(({ id }) => id === beliefId);
  const agent = world.agents.find(({ id }) => id === agentId);
  if (!belief || !agent || agent.beliefId !== belief.id || agent.beliefConviction < 0.65) return null;
  if (removedValue) belief.coreValues = belief.coreValues.filter((value) => value !== removedValue);
  if (addedValue && !belief.coreValues.includes(addedValue)) belief.coreValues.push(addedValue);
  belief.coreValues = belief.coreValues.slice(0, MAX_BELIEF_VALUES);
  belief.reformHistory.push({
    id: `belief-reform-${world.nextIds.history++}`,
    day: world.day,
    agentId: agent.id,
    addedValue,
    removedValue,
    summary: `${agent.name} argued from recorded experience to ${addedValue ? `add ${addedValue}` : "restate the tradition"}${removedValue ? ` and remove ${removedValue}` : ""}.`,
  });
  if (belief.reformHistory.length > MAX_BELIEF_REFORMS) belief.reformHistory.shift();
  world.revision += 1;
  return belief;
}

export function schismBelief(world: PlanetWorldState, beliefId: string, founderAgentId: string): BeliefState | null {
  const parent = world.beliefs.find(({ id }) => id === beliefId);
  const founder = world.agents.find(({ id }) => id === founderAgentId);
  if (!parent || !founder || founder.beliefId !== parent.id || founder.beliefConviction < 0.55) return null;
  parent.adherentIds = parent.adherentIds.filter((id) => id !== founder.id);
  founder.beliefId = null;
  founder.beliefConviction = 0;
  return foundBeliefSystem(world, founder.id, {
    name: `${parent.name} Renewal`,
    kind: parent.kind,
    coreValues: [...parent.coreValues].reverse(),
    tenets: [...parent.tenets],
    parentBeliefId: parent.id,
  });
}
