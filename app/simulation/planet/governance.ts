import { deterministicUnit } from "./random";
import type {
  NamedProposal,
  PlanetAgent,
  PlanetWorldState,
  ProposalDecision,
  ProposalKind,
} from "./types";

export interface ProposalInput {
  kind: ProposalKind;
  title: string;
  polityId?: string | null;
  counterpartyIds?: string[];
  requiredDecisionAgentIds: string[];
  payload?: Record<string, string | number | boolean>;
  duration?: number;
}

export const MAX_PLANET_PROPOSALS = 2_000;
export const MAX_OPEN_PROPOSALS = 512;

export function submitProposal(
  world: PlanetWorldState,
  sponsorAgentId: string,
  input: ProposalInput,
): NamedProposal | null {
  const sponsor = world.agents.find(({ id }) => id === sponsorAgentId);
  if (!sponsor || !sponsor.alive || !input.title.trim()) return null;
  if (world.proposals.filter(({ status }) => status === "open").length >= MAX_OPEN_PROPOSALS) return null;
  if (world.proposals.length >= MAX_PLANET_PROPOSALS) {
    const removable = world.proposals.findIndex(({ status }) => status !== "open");
    if (removable < 0) return null;
    world.proposals.splice(removable, 1);
  }
  const required = [...new Set(input.requiredDecisionAgentIds)].filter((id) =>
    world.agents.some((agent) => agent.id === id && agent.alive),
  );
  if (!required.includes(sponsor.id)) required.unshift(sponsor.id);
  const proposal: NamedProposal = {
    id: `proposal-${world.nextIds.proposal++}`,
    kind: input.kind,
    title: input.title.trim().slice(0, 120),
    sponsorAgentId: sponsor.id,
    polityId: input.polityId ?? sponsor.polityId,
    counterpartyIds: [...new Set(input.counterpartyIds ?? [])].sort(),
    requiredDecisionAgentIds: required.sort(),
    decisions: [],
    payload: { ...(input.payload ?? {}) },
    createdAt: world.time,
    expiresAt: world.time + Math.max(60, input.duration ?? 1_200),
    status: "open",
  };
  world.proposals.push(proposal);
  world.stats.proposals += 1;
  world.revision += 1;
  return proposal;
}

function proposalUtility(agent: PlanetAgent, proposal: NamedProposal): number {
  const needs = agent.needs;
  const survivalPressure = (100 - needs.hydration + 100 - needs.nutrition + 100 - needs.safety) / 300;
  const kindValue: Record<ProposalKind, number> = {
    family: agent.needs.safety > 45 && agent.needs.nutrition > 45 && agent.needs.hydration > 45 ? 0.65 : -0.75,
    trade: 0.5 + survivalPressure,
    migration: needs.safety < 45 ? 1.1 : -0.1,
    construction: 0.45,
    research: 0.4 + (agent.mind.skills.research ?? 0) * 0.08,
    law: 0.15,
    alliance: 0.55 + (100 - needs.safety) / 100,
    war: needs.safety < 50 ? -0.9 : -0.25,
    peace: needs.safety < 70 ? 1.1 : 0.4,
    leadership: agent.influence > 60 ? 0.3 : -0.15,
    belief_reform: 0,
  };
  const requestedCost = Number(proposal.payload.cost ?? 0);
  const promisedBenefit = Number(proposal.payload.benefit ?? 0);
  const commitment = agent.mind.commitments.find(({ targetId }) => targetId === proposal.sponsorAgentId)?.strength ?? 0;
  return kindValue[proposal.kind] + promisedBenefit / 100 - requestedCost / 100 + commitment * 0.35;
}

export function decideOnProposal(
  world: PlanetWorldState,
  proposalId: string,
  agentId: string,
): ProposalDecision | null {
  const proposal = world.proposals.find(({ id }) => id === proposalId);
  const agent = world.agents.find(({ id }) => id === agentId);
  if (!proposal || proposal.status !== "open" || !agent || !agent.alive) return null;
  if (!proposal.requiredDecisionAgentIds.includes(agent.id)) return null;
  const existing = proposal.decisions.find(({ agentId: decidingAgentId }) => decidingAgentId === agent.id);
  if (existing) return existing;
  const score = proposal.sponsorAgentId === agent.id
    ? 1
    : proposalUtility(agent, proposal)
      + deterministicUnit(world.seed, proposal.id, agent.id, agent.mind.decisionSequence) * 0.22 - 0.11;
  const choice: ProposalDecision["choice"] = score > 0.18 ? "accept" : score < -0.18 ? "reject" : "abstain";
  const decision: ProposalDecision = {
    agentId: agent.id,
    choice,
    score,
    decidedAt: world.time,
    rationale: `${agent.name} ${choice === "accept" ? "expects a net benefit" : choice === "reject" ? "expects the costs or danger to outweigh the benefit" : "finds the evidence inconclusive"}.`,
  };
  proposal.decisions.push(decision);
  proposal.decisions.sort((left, right) => left.agentId.localeCompare(right.agentId));
  resolveProposal(world, proposal.id);
  world.revision += 1;
  return decision;
}

/**
 * Trade, migration, alliances, and peace require explicit acceptance from
 * every named party. Institutional proposals use a majority of named voters.
 */
export function resolveProposal(world: PlanetWorldState, proposalId: string): NamedProposal | null {
  const proposal = world.proposals.find(({ id }) => id === proposalId);
  if (!proposal || proposal.status !== "open") return proposal ?? null;
  if (world.time >= proposal.expiresAt) {
    proposal.status = "expired";
    return proposal;
  }
  const mutual = ["family", "trade", "migration", "alliance", "peace"].includes(proposal.kind);
  const decisionsByAgent = new Map(proposal.decisions.map((decision) => [decision.agentId, decision]));
  const allDecided = proposal.requiredDecisionAgentIds.every((id) => decisionsByAgent.has(id));
  if (mutual) {
    if (proposal.decisions.some(({ choice }) => choice === "reject")) proposal.status = "rejected";
    else if (allDecided && proposal.requiredDecisionAgentIds.every((id) => decisionsByAgent.get(id)?.choice === "accept")) {
      proposal.status = "accepted";
    }
  } else if (allDecided) {
    const accepts = proposal.decisions.filter(({ choice }) => choice === "accept").length;
    const rejects = proposal.decisions.filter(({ choice }) => choice === "reject").length;
    proposal.status = accepts > rejects ? "accepted" : "rejected";
  }
  return proposal;
}
