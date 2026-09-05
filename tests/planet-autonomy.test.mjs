import assert from "node:assert/strict";
import test from "node:test";

import {
  PLANET_DAY_SECONDS,
  advancePlanet,
  applyAcceptedProposal,
  applyExternalAgentCounsel,
  catchUpPlanet,
  considerAutonomousProposal,
  considerAutonomousRenaming,
  createOffspring,
  createPlanetWorld,
  decideOnProposal,
  killPlanetAgent,
  resolveProposal,
  submitProposal,
  validatePlanetWorld,
} from "../app/simulation/planet/index.ts";

test("family formation is mutually accepted and creates a persistent lineage", () => {
  const world = createPlanetWorld("mutual-family", { initialAgentCount: 2, initialSettlementCount: 1 });
  const [first, second] = world.agents;
  const undecided = submitProposal(world, first.id, {
    kind: "family",
    title: "Consider a household",
    requiredDecisionAgentIds: [first.id, second.id],
    payload: { partnerId: second.id, benefit: 50, cost: 10 },
  });
  assert.ok(undecided);
  decideOnProposal(world, undecided.id, first.id);
  undecided.decisions.push({ agentId: second.id, choice: "abstain", score: 0, decidedAt: world.time, rationale: "Not enough evidence." });
  resolveProposal(world, undecided.id);
  assert.equal(undecided.status, "open", "abstention must never count as family consent");
  assert.equal(applyAcceptedProposal(world, undecided.id), false);

  const rejected = submitProposal(world, first.id, {
    kind: "family",
    title: "An unaffordable household",
    requiredDecisionAgentIds: [first.id, second.id],
    payload: { partnerId: second.id, benefit: 0, cost: 1_000 },
  });
  assert.ok(rejected);
  decideOnProposal(world, rejected.id, first.id);
  decideOnProposal(world, rejected.id, second.id);
  assert.equal(rejected.status, "rejected");

  const accepted = submitProposal(world, first.id, {
    kind: "family",
    title: "Raise a new generation",
    requiredDecisionAgentIds: [first.id, second.id],
    payload: { partnerId: second.id, benefit: 100, cost: 0 },
  });
  decideOnProposal(world, accepted.id, first.id);
  decideOnProposal(world, accepted.id, second.id);
  assert.equal(accepted.status, "accepted");
  assert.equal(applyAcceptedProposal(world, accepted.id), true);
  const child = world.agents.at(-1);
  assert.deepEqual(child.parentIds, [first.id, second.id].sort());
  assert.ok(first.childIds.includes(child.id));
  assert.ok(second.childIds.includes(child.id));
  assert.equal(child.generation, 1);
});

test("supported dependents survive to autonomy while deprived dependents can die", () => {
  const supplied = createPlanetWorld("supported-child", { initialAgentCount: 2, initialSettlementCount: 1 });
  const child = createOffspring(supplied, supplied.agents[0].id, supplied.agents[1].id);
  assert.ok(child);
  catchUpPlanet(supplied, PLANET_DAY_SECONDS * 20, { maxEvents: 100_000 });
  assert.equal(child.alive, true);
  assert.ok(child.mind.decisionSequence > 0, "the surviving child should deliberate after adulthood");

  const deprived = createPlanetWorld("deprived-child", { initialAgentCount: 2, initialSettlementCount: 1 });
  const deprivedChild = createOffspring(deprived, deprived.agents[0].id, deprived.agents[1].id);
  assert.ok(deprivedChild);
  killPlanetAgent(deprived, deprived.agents[0].id, "accident");
  killPlanetAgent(deprived, deprived.agents[1].id, "accident");
  deprived.settlements[0].stocks = {};
  catchUpPlanet(deprived, PLANET_DAY_SECONDS * 20, { maxEvents: 100_000 });
  assert.equal(deprivedChild.alive, false);
  assert.ok(deprived.history.some(({ type, actorIds }) => type === "death" && actorIds.includes(deprivedChild.id)));
});

test("forced deprivation performs a complete terminal transition", () => {
  const world = createPlanetWorld("deprivation", { initialAgentCount: 1 });
  const agent = world.agents[0];
  const decisionSequence = agent.mind.decisionSequence;
  agent.needs.health = 1;
  agent.needs.hydration = 0;
  agent.lastWakeAt = -PLANET_DAY_SECONDS;
  advancePlanet(world, agent.nextWakeAt + 1, { maxEvents: 100 });
  assert.equal(agent.alive, false);
  assert.equal(agent.deathDay, world.day);
  assert.equal(world.stats.livingAgents, 0);
  assert.equal(world.settlements[0].residentIds.includes(agent.id), false);
  assert.equal(world.polities[0].citizenIds.includes(agent.id), false);
  advancePlanet(world, PLANET_DAY_SECONDS * 10, { maxEvents: 1_000 });
  assert.equal(agent.mind.decisionSequence, decisionSequence, "a dead agent must never receive another decision");
  assert.equal(validatePlanetWorld(world), true);
});

test("life stages bound family formation and produce deterministic natural mortality", () => {
  const familyWorld = createPlanetWorld("life-stages", { initialAgentCount: 2, initialSettlementCount: 1 });
  familyWorld.agents[0].birthDay = familyWorld.day - 53;
  familyWorld.agents[1].birthDay = familyWorld.day - 53;
  assert.equal(
    createOffspring(familyWorld, familyWorld.agents[0].id, familyWorld.agents[1].id),
    null,
    "agents beyond the reproductive life stage should not create offspring",
  );

  const mortalityWorld = createPlanetWorld("natural-lifespan", { initialAgentCount: 1 });
  mortalityWorld.agents[0].birthDay = -120;
  advancePlanet(mortalityWorld, mortalityWorld.agents[0].nextWakeAt + 1, { maxEvents: 100 });
  assert.equal(mortalityWorld.agents[0].alive, false);
  assert.ok(mortalityWorld.history.some(({ type, summary }) =>
    type === "death" && /natural causes at age/i.test(summary)));
  assert.equal(validatePlanetWorld(mortalityWorld), true);
});

test("ten isolated founders grow, migrate, and found additional settlements deterministically", () => {
  const first = createPlanetWorld("growth", { initialAgentCount: 10, initialSettlementCount: 10 });
  const second = createPlanetWorld("growth", { initialAgentCount: 10, initialSettlementCount: 10 });
  catchUpPlanet(first, PLANET_DAY_SECONDS * 250, { maxEvents: 1_000_000 });
  catchUpPlanet(second, PLANET_DAY_SECONDS * 250, { maxEvents: 1_000_000 });
  assert.ok(first.stats.livingAgents > 10);
  assert.ok(first.settlements.length > 10);
  assert.ok(first.history.some(({ type }) => type === "birth"));
  assert.ok(first.history.some(({ type }) => type === "migration"));
  assert.ok(first.history.some(({ type }) => type === "settlement_founded"));
  assert.ok(first.history.some(({ causalEventIds }) => causalEventIds.length > 0));
  assert.deepEqual(first, second);
});

test("experience-supported political breakaways create a new polity and retain only personal knowledge", () => {
  const world = createPlanetWorld("breakaway-probe", { initialAgentCount: 4, initialSettlementCount: 1 });
  const [sponsor, supporter] = world.agents;
  sponsor.needs.safety = 40;
  sponsor.mind.contextualLearning.push({ key: "prosper:settlement-1", attempts: 4, expectedValue: -0.8, lastUpdatedAt: 0 });
  sponsor.mind.commitments.push({ id: "support-link", kind: "agreement", targetId: supporter.id, strength: 0.9, createdAt: 0, expiresAt: null });
  sponsor.capabilities.push("writing");
  world.settlements[0].capabilities.push("nuclear_fission");
  let brokeAway = false;
  for (let day = 30; day <= 500 && !brokeAway; day += 1) {
    world.day = day;
    world.time = day * PLANET_DAY_SECONDS;
    brokeAway = considerAutonomousProposal(world, sponsor.id)
      && world.history.some(({ type }) => type === "breakaway");
  }
  assert.equal(brokeAway, true);
  const newest = world.settlements.at(-1);
  assert.notEqual(newest.polityId, "polity-1");
  assert.ok(newest.capabilities.includes("writing"));
  assert.equal(newest.capabilities.includes("nuclear_fission"), false);
});

test("autonomous renaming is earned, unique, bounded, and preserves stable references", () => {
  const world = createPlanetWorld("rename-probe", { initialAgentCount: 2, initialSettlementCount: 1 });
  const agent = world.agents[0];
  const stableAgentId = agent.id;
  const stableSettlementId = world.settlements[0].id;
  world.history.push({
    id: "earned-founding", at: 0, day: 1, type: "settlement_founded", title: "Founded",
    summary: "Earned", actorIds: [agent.id], entityIds: [stableSettlementId], coordinate: agent.coordinate,
    importance: 50, causalEventIds: [], fingerprint: "earned",
  });
  let renamed = false;
  for (let day = 30; day <= 1_500 && !renamed; day += 1) {
    world.day = day;
    world.time = day * PLANET_DAY_SECONDS;
    agent.mind.decisionSequence = day;
    renamed = considerAutonomousRenaming(world, agent.id);
  }
  assert.equal(renamed, true);
  assert.equal(agent.id, stableAgentId);
  assert.equal(world.settlements[0].id, stableSettlementId);
  assert.equal(new Set(world.agents.map(({ name }) => name)).size, world.agents.length);
  assert.ok(agent.nameHistory.length <= 8);
  assert.ok(world.history.some(({ type, entityIds }) => type === "agent_renamed" && entityIds.includes(stableAgentId)));
});

test("external counsel is bounded, provenance-labelled, local, temporary, and non-commanding", () => {
  const world = createPlanetWorld("counsel", { initialAgentCount: 8, initialSettlementCount: 2 });
  world.agents.forEach((agent, index) => { agent.influence = 100 - index; });
  const beforeStocks = structuredClone(world.settlements.map(({ stocks }) => stocks));
  const beforeTerritory = structuredClone(world.territoryOwners);
  const result = applyExternalAgentCounsel(world, [
    { agentId: world.agents[0].id, goalKind: "research", targetId: world.agents[0].homeSettlementId, proposalIntent: "war", reasoning: "Consider evidence before acting." },
    { agentId: world.agents[6].id, goalKind: "research" },
    { agentId: world.agents[1].id, goalKind: "explore", targetId: "unknown-secret-target" },
  ]);
  assert.deepEqual(result.acceptedAgentIds, [world.agents[0].id]);
  assert.equal(world.agents[0].mind.advisory.source, "openai");
  assert.match(world.agents[0].mind.advisory.provenance, /not an agent thought/i);
  assert.deepEqual(world.settlements.map(({ stocks }) => stocks), beforeStocks);
  assert.deepEqual(world.territoryOwners, beforeTerritory);
  assert.deepEqual(world.diplomacy, {});
  advancePlanet(world, PLANET_DAY_SECONDS * 3, { maxEvents: 10_000 });
  assert.equal(world.agents[0].mind.advisory.status, "expired");
});
