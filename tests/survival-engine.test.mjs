import assert from "node:assert/strict";
import test from "node:test";
import { createSurvivalRun as baselineCreate } from "../app/simulation/survival/baseline-engine.ts";

import {
  RESEARCH_CATALOG,
  SURVIVAL_EVENT_RING_LIMIT,
  SURVIVAL_OBJECTIVE,
  addObserverAgent,
  advanceSurvivalRun,
  createSurvivalRun,
  freshwaterShorePosition,
  freshwaterVisualFootprint,
  normalizeSurvivalRun,
  restoreSurvivalRun,
  serializeSurvivalRun,
  setSurvivalRunPaused,
  validateSurvivalRun,
} from "../app/simulation/survival/index.ts";

const living = (state) => state.agents.filter(({ alive }) => alive);

// Protocol tests supply an affordable opportunity, not a prescribed action or discovery date.
function researchOpportunity() {
  const run = createSurvivalRun("research-opportunity-fixture", { agentCount: 3, agentCap: 3, durationHours: null, resourceAbundance: "plentiful", climateVolatility: "stable" });
  for (const agent of run.agents) {
    agent.needs = { health:95, hydration:95, nutrition:95, energy:95, warmth:95, safety:95 };
    agent.inventory = { freshwater:4, food:4, wood:8, stone:8, fiber:8, herbs:0, clay:0 };
  }
  return run;
}

function setForcedStep(state, action, targetId = null, destination = null, goal = "wait", remainingSteps = 1) {
  const agent = state.agents[0];
  agent.currentPlan = {
    id: "forced-plan",
    formedAt: state.tick,
    goal,
    targetId,
    targetPosition: destination,
    status: "active",
    rationale: "Test fixture for an already selected action.",
    activeStepIndex: 0,
    steps: [{
      id: "forced-step",
      action,
      targetId,
      destination,
      remainingSteps,
      status: "pending",
    }],
  };
  agent.currentAction = {
    kind: action,
    status: "awaiting_decision",
    targetId,
    startedAt: state.tick,
    updatedAt: state.tick,
  };
  return agent;
}

test("creates one through five agents, defaults to three with room for five, and retains the primary survival objective", () => {
  const defaults = createSurvivalRun("default-run");
  assert.equal(defaults.agents.length, 3);
  assert.equal(defaults.config.agentCap, 5);
  assert.deepEqual(defaults.config.objective, SURVIVAL_OBJECTIVE);

  const one = createSurvivalRun("one-agent", { agentCount: 1, agentCap: 5 });
  const five = createSurvivalRun("five-agents", { agentCount: 5, agentCap: 5 });
  assert.equal(living(one).length, 1);
  assert.equal(living(five).length, 5);
  assert.deepEqual(five.agents.map(({ label }) => label), ["A1", "A2", "A3", "A4", "A5"]);
  assert.deepEqual(five.agents.map(({ slotGeneration }) => slotGeneration), [1, 1, 1, 1, 1]);

  for (const agent of five.agents) {
    assert.equal("personality" in agent, false);
    assert.equal("job" in agent, false);
    assert.equal("role" in agent, false);
    assert.equal("strategy" in agent, false);
    assert.equal("children" in agent, false);
  }
  assert.throws(() => createSurvivalRun("too-many", { agentCount: 5, agentCap: 4 }), /cannot exceed/);
  assert.throws(() => createSurvivalRun("bad-cap", { agentCap: 6 }), /1 through 5/);
});

test("fixed-step advance is pure, seed deterministic, split-replay exact, and JSON safe", () => {
  const original = createSurvivalRun("split-replay", {
    agentCount: 3,
    agentCap: 5,
    durationHours: null,
  });
  const originalCheckpoint = JSON.stringify(original);
  const direct = advanceSurvivalRun(original, 180).state;
  assert.equal(JSON.stringify(original), originalCheckpoint, "advance must not mutate its input checkpoint");

  let sliced = createSurvivalRun("split-replay", {
    agentCount: 3,
    agentCap: 5,
    durationHours: null,
  });
  for (let index = 0; index < 18; index += 1) sliced = advanceSurvivalRun(sliced, 10).state;
  assert.equal(serializeSurvivalRun(sliced), serializeSurvivalRun(direct));
  assert.equal(validateSurvivalRun(direct), true);

  const restored = restoreSurvivalRun(serializeSurvivalRun(direct));
  assert.equal(serializeSurvivalRun(restored), serializeSurvivalRun(direct));
  restored.tick += 1;
  assert.notEqual(restored.tick, direct.tick, "restoring must not return the input object by reference");

  const paused = setSurvivalRunPaused(direct, true);
  assert.equal(paused.status, "paused");
  assert.equal(advanceSurvivalRun(paused, 20).stepsProcessed, 0);
  assert.equal(direct.status, "running");
});

test("the default observation duration is a real 72 hours and fractional stock is not a full ration", () => {
  const configured = createSurvivalRun("duration", {
    agentCount: 3,
    agentCap: 3,
    resourceAbundance: "plentiful",
    climateVolatility: "stable",
  });
  assert.equal(configured.config.durationHours, 72);
  const completed = advanceSurvivalRun(configured, 432).state;
  assert.equal(completed.elapsedMinutes, 72 * 60);
  assert.equal(completed.status, "completed");

  const fractional = createSurvivalRun("fractional", { agentCount: 1, agentCap: 1, durationHours: null });
  const half = fractional.environment.size / 2;
  fractional.agents[0].position = { x: -half + 1, z: -half + 1 };
  fractional.agents[0].inventory.freshwater = 0.5;
  fractional.agents[0].inventory.food = 0.5;
  fractional.agents[0].needs.hydration = 5;
  fractional.agents[0].needs.nutrition = 5;
  fractional.agents[0].observations = [];
  fractional.agents[0].currentPlan = null;
  for (const site of fractional.environment.resources) site.position = { x: half - 1, z: half - 1 };
  const fractionAdvanced = advanceSurvivalRun(fractional, 1).state.agents[0];
  assert.equal(fractionAdvanced.currentDeliberation.candidates.some(({ goal }) => goal === "secure_water" || goal === "secure_food"), false);
  assert.equal(fractionAdvanced.inventory.freshwater, 0.5);
  assert.equal(fractionAdvanced.inventory.food, 0.5);

  const whole = structuredClone(fractional);
  whole.agents[0].inventory.freshwater = 1;
  const wholeAdvanced = advanceSurvivalRun(whole, 1).state.agents[0];
  assert.equal(wholeAdvanced.currentDeliberation.selectedGoal, "secure_water");
  assert.equal(wholeAdvanced.inventory.freshwater, 0);
});

test("a zero-survivor duration boundary completes the configured study and cannot be restarted", () => {
  const run = createSurvivalRun("duration-boundary", {
    agentCount: 1,
    agentCap: 2,
    durationHours: 10 / 60,
  });
  run.agents[0].needs.health = 0;
  const finished = advanceSurvivalRun(run, 1).state;
  assert.equal(finished.status, "completed");
  assert.equal(living(finished).length, 0);
  assert.equal(finished.events.at(-1).type, "run_completed");
  assert.equal(finished.events.some(({ type }) => type === "run_extinct"), false);
  assert.equal(validateSurvivalRun(finished), true);
  assert.equal(addObserverAgent(finished).reason, "run_completed");
});

test("freshwater collection uses the same deterministic dry shoreline shown by the renderer", () => {
  const run = createSurvivalRun("shoreline", { agentCount: 1, agentCap: 1, durationHours: null });
  const site = run.environment.resources.find(({ kind }) => kind === "freshwater");
  assert.ok(site);
  const shore = freshwaterShorePosition(site);
  const footprint = freshwaterVisualFootprint(site);
  assert.ok(Math.hypot(shore.x - site.position.x, shore.z - site.position.z) > footprint.radiusZ);
  const agent = setForcedStep(run, "gather", site.id, shore, "secure_water");
  agent.position = { ...shore };
  const result = advanceSurvivalRun(run, 1);
  assert.ok(result.state.agents[0].inventory.freshwater > 0);
  const gathered = result.events.find(({ summary }) => summary.includes("gathered") && summary.includes("freshwater"));
  assert.ok(gathered);
  assert.ok(Math.hypot(gathered.position.x - shore.x, gathered.position.z - shore.z) < 0.01);
});

test("decisions cite only private observations and cannot target globally known resource sites", () => {
  const isolated = createSurvivalRun("local-knowledge", { agentCount: 1, agentCap: 1, durationHours: null });
  const agent = isolated.agents[0];
  const half = isolated.environment.size / 2;
  agent.position = { x: -half + 1, z: -half + 1 };
  agent.observations = [];
  agent.currentPlan = null;
  for (const site of isolated.environment.resources) site.position = { x: half - 1, z: half - 1 };

  const state = advanceSurvivalRun(isolated, 1).state;
  const advancedAgent = state.agents[0];
  assert.equal(advancedAgent.observations.some(({ kind }) => kind === "resource"), false);
  assert.ok(advancedAgent.currentDeliberation);
  assert.equal(
    advancedAgent.currentDeliberation.candidates.some(({ targetId }) => state.environment.resources.some(({ id }) => id === targetId)),
    false,
    "global sites must not leak into candidates without a local observation",
  );

  for (const current of state.agents) {
    const ownIds = new Set(current.observations.map(({ id, observerId }) => {
      assert.equal(observerId, current.id);
      return id;
    }));
    for (const candidate of current.currentDeliberation?.candidates ?? []) {
      assert.ok(candidate.knownObservationIds.every((id) => ownIds.has(id)));
    }
    assert.ok((current.currentDeliberation?.knownObservationIds ?? []).every((id) => ownIds.has(id)));
  }
});

test("needs remain high-is-good and bounded; death is permanent without automatic respawn", () => {
  const doomed = createSurvivalRun("permanent-death", { agentCount: 1, agentCap: 1, durationHours: null });
  doomed.agents[0].needs.health = 0;
  const ended = advanceSurvivalRun(doomed, 1).state;
  assert.equal(ended.status, "extinct");
  assert.equal(living(ended).length, 0);
  assert.equal(ended.agents.length, 1);
  assert.equal(ended.agents[0].alive, false);
  assert.equal(ended.events.filter(({ type }) => type === "agent_died").length, 1);
  assert.equal(ended.events.some(({ type }) => type === "agent_added"), false);
  for (const value of Object.values(ended.agents[0].needs)) assert.ok(value >= 0 && value <= 100);

  const later = advanceSurvivalRun(ended, 100);
  assert.equal(later.stepsProcessed, 0);
  assert.equal(later.state.agents.length, 1);
  assert.equal(living(later.state).length, 0);
});

test("observer addition is explicit, logged, cap-safe, pure, and reuses only a vacant visual slot", () => {
  const noVacancy = createSurvivalRun("no-prior-death", { agentCount: 2, agentCap: 3, durationHours: null });
  const premature = addObserverAgent(noVacancy);
  assert.equal(premature.ok, true);
  assert.equal(premature.state.config.agentCap, 5);

  const run = createSurvivalRun("observer-add", { agentCount: 3, agentCap: 3, durationHours: null });
  run.agents[0].needs.health = 0;
  const afterDeath = advanceSurvivalRun(run, 1).state;
  assert.equal(living(afterDeath).length, 2);
  assert.equal(afterDeath.events.some(({ type }) => type === "agent_added"), false, "death alone does not trigger replacement");
  const checkpoint = serializeSurvivalRun(afterDeath);

  const result = addObserverAgent(afterDeath);
  assert.equal(result.ok, true);
  assert.equal(serializeSurvivalRun(afterDeath), checkpoint, "observer addition must not mutate its input");
  assert.equal(living(result.state).length, 3);
  assert.equal(result.agent.spawnSource, "observer");
  assert.equal(result.agent.label, "A1");
  assert.equal(result.agent.slotGeneration, 2);
  assert.equal(result.event.intervention, true);
  assert.equal(result.state.stats.observerInterventions, 1);
  assert.equal(new Set(living(result.state).map(({ slot }) => slot)).size, 3);

  const fourth = addObserverAgent(result.state);
  const fifth = addObserverAgent(fourth.state);
  assert.equal(living(fifth.state).length, 5);
  const full = addObserverAgent(fifth.state);
  assert.equal(full.ok, false);
  assert.equal(full.reason, "agent_cap_reached");

  const extinct = createSurvivalRun("observer-restart", { agentCount: 1, agentCap: 1, durationHours: null });
  extinct.agents[0].needs.health = 0;
  const empty = advanceSurvivalRun(extinct, 1).state;
  const restarted = addObserverAgent(empty);
  assert.equal(restarted.ok, true);
  assert.equal(restarted.state.status, "running");
  assert.equal(restarted.agent.slotGeneration, 2);
});

test("legacy policy preserves its sole-survivor choice while observer admission is expanded", () => {
  let requested = null;
  let declined = null;
  for (let index = 0; index < 120 && (!requested || !declined); index += 1) {
    const run = baselineCreate(`sole-${index}`, { agentCount: 2, agentCap: 3, durationHours: null });
    run.agents[1].needs.health = 0;
    const state = advanceSurvivalRun(run, 1).state;
    if (state.soleSurvivor.decision === "requested") requested = state;
    if (state.soleSurvivor.decision === "declined") declined = state;
  }
  assert.ok(requested, "at least one deterministic seed should support requesting a companion");
  assert.ok(declined, "at least one deterministic seed should support remaining alone");

  assert.equal(living(requested).length, 2);
  assert.equal(requested.stats.peakLivingAgents, 2, "a companion must not inflate peak population through stale counters");
  assert.equal(requested.agents.filter(({ spawnSource }) => spawnSource === "autonomous_companion").length, 1);
  const companionEvent = requested.events.find(({ type, facts }) => type === "agent_added" && facts.source === "autonomous_companion");
  assert.ok(companionEvent);
  assert.equal(companionEvent.intervention, false);

  assert.equal(living(declined).length, 1);
  const observerOverride = addObserverAgent(declined);
  assert.equal(observerOverride.ok, true);
  assert.equal(observerOverride.event.intervention, true);
  assert.equal(declined.agents.some(({ spawnSource }) => spawnSource === "autonomous_companion"), false);
  const stillAlone = advanceSurvivalRun(declined, 8).state;
  assert.equal(stillAlone.agents.some(({ spawnSource }) => spawnSource === "autonomous_companion"), false);
  assert.equal(stillAlone.soleSurvivor.epoch, declined.soleSurvivor.epoch, "a declined transition is not retried every tick");
});

test("an agent follows a local position snapshot and updates a nearby observation after death", () => {
  let state = advanceSurvivalRun(createSurvivalRun("observation-snapshot", {
    agentCount: 2,
    agentCap: 2,
    durationHours: null,
  }), 1).state;
  const observer = state.agents[0];
  const target = state.agents[1];
  const observation = observer.observations.find(({ subjectId }) => subjectId === target.id);
  assert.ok(observation);
  const lastSeen = { ...observation.position };
  observer.position = { x: lastSeen.x - 24, z: lastSeen.z };
  target.position = { x: 100, z: 100 };
  setForcedStep(state, "move", target.id, lastSeen, "cooperate");
  const moved = advanceSurvivalRun(state, 1).state;
  const movedObserver = moved.agents[0];
  const movedTarget = moved.agents[1];
  const retained = movedObserver.observations.find(({ subjectId }) => subjectId === movedTarget.id);
  assert.deepEqual(retained.position, lastSeen);
  assert.deepEqual(movedObserver.currentPlan.steps[0].destination, lastSeen);
  assert.notDeepEqual(retained.position, movedTarget.position, "an unseen target must not become a live tracking feed");

  state = advanceSurvivalRun(createSurvivalRun("dead-observation", {
    agentCount: 2,
    agentCap: 2,
    durationHours: null,
  }), 1).state;
  state.agents[1].needs.health = 0;
  state = advanceSurvivalRun(state, 1).state;
  assert.equal(state.agents[1].alive, false);
  state.agents[0].position = { ...state.agents[1].position };
  state.agents[0].currentPlan = null;
  state = advanceSurvivalRun(state, 1).state;
  const deathObservation = state.agents[0].observations.find(({ subjectId }) => subjectId === state.agents[1].id);
  assert.equal(deathObservation.facts.alive, false);
});

test("social actions record independent consent and never treat refusal as a completed transfer", () => {
  // Test the consent protocol directly. Changed routes need not reproduce a
  // particular refused encounter in the first 120 steps of one arbitrary seed.
  let state = createSurvivalRun("consent", { agentCount: 2, durationHours: null });
  for (const site of state.environment.resources) site.position={x:-80,z:-80};
  for (const agent of state.agents) agent.position={x:60,z:60};
  const events=[];
  for (const reserves of [0,4]) {
    const [requester,responder]=state.agents;
    requester.needs.hydration=20;requester.inventory.freshwater=0;
    responder.needs.hydration=95;responder.inventory.freshwater=reserves;
    setForcedStep(state,"request",responder.id,null,"request_help");
    requester.currentPlan.steps[0].resource="freshwater";
    // Hold the responder's own activity only; its resource/consent choice remains independent.
    responder.currentPlan={...structuredClone(requester.currentPlan),id:"held-responder",goal:"wait",steps:[{id:"held-step",action:"wait",targetId:null,destination:null,remainingSteps:1,status:"pending"}]};
    const result=advanceSurvivalRun(state,1);state=result.state;events.push(...result.events);
    assert.equal(state.agents[0].inventory.freshwater,reserves===0?0:1);
    assert.equal(state.agents[1].inventory.freshwater,reserves===0?0:3);
  }
  const proposals = events.filter(({ type }) => type === "social_proposal");
  const accepted = events.filter(({ type }) => type === "social_accepted");
  const refused = events.filter(({ type }) => type === "social_refused");
  assert.ok(proposals.length > 0);
  assert.ok(accepted.length > 0);
  assert.ok(refused.length > 0);
  assert.equal(proposals.length, accepted.length + refused.length);
  assert.ok(refused.every(({ outcome, facts }) => outcome.includes("No resource or knowledge changed hands") && facts.accepted === false));
});

test("autonomous research preserves hypotheses, failures, provenance, and repeatability before discovery", () => {
  const state = advanceSurvivalRun(researchOpportunity(), 160).state;
  const projects = state.agents.flatMap((agent) => agent.research.map((project) => ({ agent, project })));
  const attempts = projects.flatMap(({ agent, project }) => project.attempts.map((attempt) => ({ agent, project, attempt })));
  assert.ok(attempts.length > 0, "agents should autonomously choose material testing when survival conditions allow");
  assert.ok(attempts.some(({ attempt }) => attempt.result === "not_supported"), "failed experiments remain in the notebook");

  for (const { agent, project, attempt } of attempts) {
    assert.equal(attempt.agentId, agent.id);
    assert.equal(attempt.hypothesis, project.hypothesis);
    assert.ok(attempt.procedure.length > 1);
    assert.ok(Object.values(attempt.materialsConsumed).some((amount) => amount > 0));
    assert.ok(attempt.observationIds.length > 0);
    assert.ok(attempt.observationIds.every((id, index) => agent.observations.some((observation) => (
      observation.id === id
      && id === `obs-${agent.id}-research-${project.id}-${index + 1}`
      && observation.observerId === agent.id
      && observation.facts.researchEvidence === true
    ))));
    assert.ok(attempt.evidence.length > 20);
  }

  const confirmed = projects.filter(({ project }) => project.status === "confirmed");
  assert.ok(confirmed.length > 0, "repeatable evidence should eventually establish a technology for this seed");
  for (const { agent, project } of confirmed) {
    assert.ok(project.successfulTrials >= project.requiredSuccessfulTrials);
    assert.ok(project.requiredSuccessfulTrials >= 2);
    assert.equal(project.successfulTrials, project.attempts.filter(({ result }) => result === "supported").length);
    assert.ok(agent.technologies.includes(project.technologyId));
    const discovery = state.events.find(({ type, facts }) => type === "discovery" && facts.projectId === project.id);
    assert.ok(discovery);
    assert.ok(Number(discovery.facts.successfulTrials) >= Number(discovery.facts.requiredSuccessfulTrials));
  }
});

test("all seven confirmed technologies have small modeled survival effects", () => {
  assert.equal(RESEARCH_CATALOG.length, 7);
  assert.ok(RESEARCH_CATALOG.every(({ survivalEffect }) => survivalEffect.length > 20));
  const makePair = (seed) => {
    const baseline = createSurvivalRun(seed, { agentCount: 1, agentCap: 1, durationHours: null });
    return [baseline, structuredClone(baseline)];
  };

  {
    const [baseline, learned] = makePair("effect-fire");
    for (const run of [baseline, learned]) {
      run.agents[0].needs.warmth = 20;
      run.agents[0].inventory.wood = 1;
      setForcedStep(run, "warm", null, null, "stay_warm");
    }
    learned.agents[0].technologies.push("controlled_fire");
    const ordinary = advanceSurvivalRun(baseline, 1).state;
    const improved = advanceSurvivalRun(learned, 1).state;
    assert.ok(improved.agents[0].needs.warmth > ordinary.agents[0].needs.warmth);
    assert.ok(improved.environment.structures.some(({ kind }) => kind === "fire"));
  }

  {
    const [baseline, learned] = makePair("effect-edge");
    const baselineSite = baseline.environment.resources.find(({ kind }) => kind === "wood");
    const learnedSite = learned.environment.resources.find(({ id }) => id === baselineSite.id);
    for (const [run, site] of [[baseline, baselineSite], [learned, learnedSite]]) {
      run.agents[0].position = { ...site.position };
      setForcedStep(run, "gather", site.id, site.position, "gather_material");
    }
    learned.agents[0].technologies.push("knapped_edge");
    assert.ok(advanceSurvivalRun(learned, 1).state.agents[0].inventory.wood > advanceSurvivalRun(baseline, 1).state.agents[0].inventory.wood);
  }

  {
    const [baseline, learned] = makePair("effect-cordage");
    for (const run of [baseline, learned]) {
      run.agents[0].inventory.wood = 4;
      run.agents[0].inventory.fiber = 1;
      setForcedStep(run, "build", null, run.agents[0].position, "build_shelter", 1);
    }
    learned.agents[0].technologies.push("twisted_cordage");
    assert.equal(advanceSurvivalRun(baseline, 1).state.environment.structures.some(({ kind }) => kind === "shelter"), false);
    assert.equal(advanceSurvivalRun(learned, 1).state.environment.structures.some(({ kind }) => kind === "shelter"), true);
  }

  {
    const [baseline, learned] = makePair("effect-vessel");
    const baselineSite = baseline.environment.resources.find(({ kind }) => kind === "freshwater");
    const learnedSite = learned.environment.resources.find(({ id }) => id === baselineSite.id);
    for (const [run, site] of [[baseline, baselineSite], [learned, learnedSite]]) {
      const shore = freshwaterShorePosition(site);
      run.agents[0].position = { ...shore };
      setForcedStep(run, "collect", site.id, shore, "secure_water");
    }
    learned.agents[0].technologies.push("fired_vessel");
    assert.ok(advanceSurvivalRun(learned, 1).state.agents[0].inventory.freshwater > advanceSurvivalRun(baseline, 1).state.agents[0].inventory.freshwater);
  }

  {
    const [baseline, learned] = makePair("effect-boiling");
    const baselineSite = baseline.environment.resources.find(({ kind }) => kind === "freshwater");
    const learnedSite = learned.environment.resources.find(({ id }) => id === baselineSite.id);
    baselineSite.contaminated = true;
    learnedSite.contaminated = true;
    for (const [run, site] of [[baseline, baselineSite], [learned, learnedSite]]) {
      run.agents[0].needs.health = 80;
      run.agents[0].inventory.wood = 0.25;
      const shore = freshwaterShorePosition(site);
      run.agents[0].position = { ...shore };
      setForcedStep(run, "collect", site.id, shore, "secure_water");
    }
    learned.agents[0].technologies.push("water_boiling");
    const ordinary = advanceSurvivalRun(baseline, 1).state;
    const improved = advanceSurvivalRun(learned, 1).state;
    assert.ok(improved.agents[0].needs.health > ordinary.agents[0].needs.health);
    assert.equal(improved.agents[0].inventory.wood, 0);
  }

  {
    const [baseline, learned] = makePair("effect-smoking");
    for (const run of [baseline, learned]) {
      run.agents[0].needs.nutrition = 40;
      run.agents[0].inventory.food = 1;
      setForcedStep(run, "eat", null, null, "secure_food");
    }
    learned.agents[0].technologies.push("food_smoking");
    assert.equal(
      advanceSurvivalRun(learned, 1).state.agents[0].needs.nutrition - advanceSurvivalRun(baseline, 1).state.agents[0].needs.nutrition,
      5,
    );
  }

  {
    const [baseline, learned] = makePair("effect-herbs");
    for (const run of [baseline, learned]) {
      run.agents[0].needs.health = 70;
      run.agents[0].inventory.herbs = 0.25;
      setForcedStep(run, "rest", null, null, "recover", 1);
    }
    learned.agents[0].technologies.push("herbal_poultice");
    const ordinary = advanceSurvivalRun(baseline, 1).state;
    const improved = advanceSurvivalRun(learned, 1).state;
    assert.equal(improved.agents[0].needs.health - ordinary.agents[0].needs.health, 1);
    assert.equal(improved.agents[0].inventory.herbs, 0);
  }
});

test("checkpoint validation requires catalog-backed research evidence for every technology unlock", () => {
  const forgedUnlock = createSurvivalRun("forged-unlock", {
    agentCount: 1,
    agentCap: 1,
    durationHours: null,
  });
  forgedUnlock.agents[0].technologies.push("water_boiling");
  assert.equal(validateSurvivalRun(forgedUnlock), false, "an unlock cannot exist without a confirmed project");
  assert.throws(() => serializeSurvivalRun(forgedUnlock), /invalid survival run/i);

  const researched = advanceSurvivalRun(researchOpportunity(), 160).state;
  const researchedAgentIndex = researched.agents.findIndex((agent) => agent.research.some(({ status }) => status === "confirmed"));
  const confirmedProjectIndex = researched.agents[researchedAgentIndex].research.findIndex(({ status }) => status === "confirmed");
  assert.notEqual(researchedAgentIndex, -1);
  assert.notEqual(confirmedProjectIndex, -1);

  const duplicateProject = structuredClone(researched);
  const duplicateAgent = duplicateProject.agents[researchedAgentIndex];
  const projectCopy = structuredClone(duplicateAgent.research[confirmedProjectIndex]);
  projectCopy.id = `project-${duplicateProject.nextIds.project}`;
  duplicateProject.nextIds.project += 1;
  for (const attempt of projectCopy.attempts) {
    attempt.id = `attempt-${duplicateProject.nextIds.attempt}`;
    duplicateProject.nextIds.attempt += 1;
    duplicateProject.stats.experiments += 1;
  }
  duplicateAgent.research.push(projectCopy);
  duplicateProject.stats.discoveries += 1;
  assert.equal(validateSurvivalRun(duplicateProject), false, "one unlock cannot cite duplicate confirmed projects");

  const wrongDiscoveryTime = structuredClone(researched);
  const timedProject = wrongDiscoveryTime.agents[researchedAgentIndex].research[confirmedProjectIndex];
  timedProject.discoveredAt = timedProject.startedAt;
  assert.notEqual(timedProject.discoveredAt, timedProject.attempts.at(-1).attemptedAt);
  assert.equal(validateSurvivalRun(wrongDiscoveryTime), false, "discovery time must be the threshold-crossing trial");

  const missingEvidence = structuredClone(researched);
  const evidenceProject = missingEvidence.agents[researchedAgentIndex].research[confirmedProjectIndex];
  const evidenceId = evidenceProject.attempts[0].observationIds[0];
  const evidenceObservation = missingEvidence.agents[researchedAgentIndex].observations.find(({ id }) => id === evidenceId);
  evidenceObservation.facts.researchEvidence = false;
  assert.equal(validateSurvivalRun(missingEvidence), false, "an unlock must retain its immutable local evidence snapshot");

  const wrongCatalogThreshold = structuredClone(researched);
  const thresholdProject = wrongCatalogThreshold.agents[researchedAgentIndex].research[confirmedProjectIndex];
  const extraAttempt = structuredClone(thresholdProject.attempts.at(-1));
  extraAttempt.id = `attempt-${wrongCatalogThreshold.nextIds.attempt}`;
  wrongCatalogThreshold.nextIds.attempt += 1;
  thresholdProject.attempts.push(extraAttempt);
  thresholdProject.successfulTrials += 1;
  thresholdProject.requiredSuccessfulTrials += 1;
  thresholdProject.confidence = Math.round(Math.min(100,
    (thresholdProject.successfulTrials / thresholdProject.requiredSuccessfulTrials) * 78
      + Math.min(18, thresholdProject.attempts.length * 3)
      - (thresholdProject.attempts.length - thresholdProject.successfulTrials) * 2,
  ) * 10_000) / 10_000;
  wrongCatalogThreshold.stats.experiments += 1;
  assert.equal(validateSurvivalRun(wrongCatalogThreshold), false, "the project threshold must match its catalog definition");

  const advancedOpportunity = researchOpportunity();
  for (const agent of advancedOpportunity.agents) Object.assign(agent.inventory, { wood:12, stone:12, fiber:12, clay:12 });
  const prerequisiteOrder = advanceSurvivalRun(advancedOpportunity, 400).state;
  const dependentEntry = prerequisiteOrder.agents.flatMap((agent) => agent.research.map((project) => ({ agent, project })))
    .find(({ project }) => RESEARCH_CATALOG.find(({ id }) => id === project.technologyId)?.prerequisiteTechnologies.length);
  assert.ok(dependentEntry);
  const dependentProject = dependentEntry.project;
  assert.ok(dependentProject);
  dependentProject.startedAt = 0;
  dependentProject.attempts[0].attemptedAt = 0;
  assert.equal(validateSurvivalRun(prerequisiteOrder), false, "a dependent project cannot predate its confirmed prerequisites");
});

test("checkpoint validation rejects malformed arrays, invalid numerics, mismatched stats, labels, and duplicate IDs", () => {
  const source = advanceSurvivalRun(createSurvivalRun("validation", {
    agentCount: 3,
    agentCap: 3,
    durationHours: null,
  }), 3).state;
  assert.equal(validateSurvivalRun(source), true);
  const corruptions = [
    (state) => { state.environment.resources = undefined; },
    (state) => { state.agents[0].relationships = undefined; },
    (state) => { state.agents[0].inventory.food = -0.1; },
    (state) => { state.agents[0].inventory.food = "1"; },
    (state) => { state.agents[0].inventory.food = Number.NaN; },
    (state) => { state.environment.resources[0].quantity = -1; },
    (state) => { state.environment.resources[0].capacity = Number.POSITIVE_INFINITY; },
    (state) => { state.agents[0].position.x = state.environment.bounds.minX - 1; },
    (state) => { state.agents[0].position.z = "0"; },
    (state) => { state.stats.livingAgents += 1; },
    (state) => { state.stats.peakLivingAgents = 5; },
    (state) => { state.agents[0].label = "A5"; },
    (state) => { state.events.push(structuredClone(state.events[0])); },
    (state) => { state.agents[0].observations.push(structuredClone(state.agents[0].observations[0])); },
  ];
  for (const corrupt of corruptions) {
    const malformed = structuredClone(source);
    corrupt(malformed);
    assert.doesNotThrow(() => validateSurvivalRun(malformed));
    assert.equal(validateSurvivalRun(malformed), false);
    assert.throws(() => serializeSurvivalRun(malformed), /invalid survival run/i);
  }
  assert.throws(() => restoreSurvivalRun("{not-json"), /Invalid survival run checkpoint/);
  assert.throws(() => restoreSurvivalRun({ ...source, events: undefined }), /Invalid survival run checkpoint/);
});

test("a legacy observer restart retains its independent companion choice and allows another user addition", () => {
  const run = baselineCreate("extinct-restart", { agentCount: 2, agentCap: 3, durationHours: null });
  for (const agent of run.agents) agent.needs.health = 0;
  const extinct = advanceSurvivalRun(run, 1).state;
  assert.equal(extinct.status, "extinct");

  const restarted = addObserverAgent(extinct);
  assert.equal(restarted.ok, true);
  assert.equal(living(restarted.state).length, 1);
  assert.equal(restarted.state.soleSurvivor.agentId, restarted.agent.id);
  assert.equal(restarted.state.soleSurvivor.decision, null);
  const secondAdd = addObserverAgent(restarted.state);
  assert.equal(secondAdd.ok, true);

  const decided = advanceSurvivalRun(restarted.state, 1).state;
  assert.ok(decided.soleSurvivor.decision === "requested" || decided.soleSurvivor.decision === "declined");
  assert.equal(decided.events.filter(({ type, agentIds }) => type === "sole_survivor_decision" && agentIds.includes(restarted.agent.id)).length, 1);
  assert.equal(decided.agents.filter(({ spawnSource }) => spawnSource === "autonomous_companion").length, decided.soleSurvivor.decision === "requested" ? 1 : 0);
  const afterMoreTime = advanceSurvivalRun(decided, 6).state;
  assert.equal(afterMoreTime.soleSurvivor.epoch, decided.soleSurvivor.epoch, "the restart choice must not repeat every step");
});

test("current actions and every next-id high-water mark are validated", () => {
  const source = advanceSurvivalRun(createSurvivalRun("id-audit", {
    agentCount: 3,
    agentCap: 3,
    durationHours: null,
  }), 30).state;
  assert.equal(validateSurvivalRun(source), true);

  for (const [field, invalid] of [["kind", "teleport"], ["status", "thinking"]]) {
    const malformed = structuredClone(source);
    malformed.agents[0].currentAction[field] = invalid;
    assert.equal(validateSurvivalRun(malformed), false);
  }
  const invalidStepAction = structuredClone(source);
  invalidStepAction.agents[0].currentPlan.steps[0].action = "teleport";
  assert.equal(validateSurvivalRun(invalidStepAction), false);
  const invalidStepStatus = structuredClone(source);
  invalidStepStatus.agents[0].currentPlan.steps[0].status = "imagined";
  assert.equal(validateSurvivalRun(invalidStepStatus), false);

  for (const kind of Object.keys(source.nextIds)) {
    const stale = structuredClone(source);
    stale.nextIds[kind] += 1;
    assert.equal(validateSurvivalRun(stale), false, `${kind} must equal its exact deterministic high-water mark`);
  }
  const duplicateEventNext = structuredClone(source);
  duplicateEventNext.nextIds.event = Number(duplicateEventNext.events.at(-1).id.split("-").at(-1));
  assert.equal(validateSurvivalRun(duplicateEventNext), false);
});

test("the in-state timeline is bounded while advance returns a complete archive journal", () => {
  const initial = createSurvivalRun("ring", {
    agentCount: 5,
    agentCap: 5,
    durationHours: null,
    resourceAbundance: "plentiful",
    climateVolatility: "stable",
  });
  const direct = advanceSurvivalRun(initial, 440);
  assert.ok(direct.events.length > SURVIVAL_EVENT_RING_LIMIT);
  assert.equal(direct.state.events.length, SURVIVAL_EVENT_RING_LIMIT);
  assert.equal(direct.state.eventWindow.capacity, SURVIVAL_EVENT_RING_LIMIT);
  assert.equal(direct.state.eventWindow.totalEvents, direct.events.length + 1, "the run-start event precedes the returned advance journal");
  assert.equal(direct.state.eventWindow.droppedEvents, direct.state.eventWindow.totalEvents - direct.state.events.length);
  assert.equal(direct.state.eventWindow.firstRetainedTick, direct.state.events[0].tick);
  assert.equal(direct.events.at(-1).id, direct.state.events.at(-1).id);
  assert.equal(validateSurvivalRun(direct.state), true);

  const restored = restoreSurvivalRun(serializeSurvivalRun(direct.state));
  assert.deepEqual(restored.stats, direct.state.stats);
  assert.deepEqual(restored.eventWindow, direct.state.eventWindow);
  let sliced = initial;
  const archived = [];
  for (let index = 0; index < 44; index += 1) {
    const result = advanceSurvivalRun(sliced, 10);
    sliced = result.state;
    archived.push(...result.events);
  }
  assert.equal(serializeSurvivalRun(sliced), serializeSurvivalRun(direct.state));
  assert.deepEqual(archived, direct.events);
});

test("legacy in-memory and serialized schema-1 runs hydrate before emitting another event", () => {
  const modern = advanceSurvivalRun(createSurvivalRun("legacy-window", {
    agentCount: 3,
    agentCap: 3,
    durationHours: null,
  }), 20).state;
  const legacy = structuredClone(modern);
  delete legacy.eventWindow;
  delete legacy.stats.planSteps;
  delete legacy.stats.memories;

  const normalized = normalizeSurvivalRun(legacy);
  assert.equal(normalized.eventWindow.capacity, SURVIVAL_EVENT_RING_LIMIT);
  assert.equal(validateSurvivalRun(normalized), true);
  assert.doesNotThrow(() => advanceSurvivalRun(legacy, 1));
  assert.doesNotThrow(() => serializeSurvivalRun(legacy));
  const restored = restoreSurvivalRun(JSON.stringify(legacy));
  assert.equal(validateSurvivalRun(restored), true);
  assert.equal(restored.eventWindow.totalEvents, modern.nextIds.event - 1);
});

test("long-running worlds keep deliberation citations aligned with bounded observations", () => {
  for (const seed of ["c", "long-run-a", "long-run-b"]) {
    const state = advanceSurvivalRun(createSurvivalRun(seed, {
      agentCount: 5,
      agentCap: 5,
      durationHours: null,
      resourceAbundance: "plentiful",
    }), 2_500).state;
    assert.equal(validateSurvivalRun(state), true, `${seed} must remain a valid checkpoint after observation eviction`);
    for (const agent of state.agents) {
      const retained = new Set(agent.observations.map(({ id }) => id));
      assert.ok((agent.currentDeliberation?.knownObservationIds ?? []).every((id) => retained.has(id)));
      assert.ok((agent.currentDeliberation?.candidates ?? []).every(({ knownObservationIds }) => knownObservationIds.every((id) => retained.has(id))));
    }
    assert.doesNotThrow(() => restoreSurvivalRun(serializeSurvivalRun(state)));
  }
});
