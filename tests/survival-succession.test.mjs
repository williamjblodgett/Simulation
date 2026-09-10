import assert from "node:assert/strict";
import test from "node:test";
import { createSurvivalRun, advanceSurvivalRun, addObserverAgent, setSurvivalRunPaused, validateSurvivalRun, serializeSurvivalRun, restoreSurvivalRun, normalizeSurvivalRun } from "../app/simulation/survival/index.ts";
import { evaluateSuccession } from "../app/simulation/survival/succession.ts";
import { validateSurvivalRun as validateLegacySchema } from "../app/simulation/survival/baseline-engine.ts";

const alive = run => run.agents.filter(a => a.alive);
const step = run => advanceSurvivalRun(run, 1).state;
function hold(agent) {
  const plan = agent.currentPlan;
  assert.ok(plan?.steps.length);
  plan.status = "active"; plan.goal = "wait"; plan.activeStepIndex = 0;
  plan.targetId = null; plan.targetPosition = null;
  plan.steps = [{ ...plan.steps[0], action: "rest", targetId: null, destination: null, remainingSteps: 1000, status: "active" }];
}
// A controlled opportunity: supplies/conditions permit a choice, no choice is injected.
function opportunity(count = 1) {
  const run = advanceSurvivalRun(createSurvivalRun(`succession-${count}`, {
    agentCount: count, agentCap: 5, durationHours: null, resourceAbundance: "plentiful", climateVolatility: "stable",
  }), 35).state;
  for (const site of run.environment.resources) site.position = ["freshwater","food"].includes(site.kind) ? {x: 2, z: 2} : {x:100,z:100};
  for (const agent of alive(run)) {
    agent.position = {x: 0, z: 0};
    agent.needs = {health:100,hydration:100,nutrition:100,energy:100,warmth:100,safety:100};
    agent.inventory.freshwater = 4; agent.inventory.food = 4;
    hold(agent);
  }
  assert.equal(validateSurvivalRun(run), true);
  return run;
}
function planned() {
  const run = step(opportunity());
  assert.equal(run.succession.plans.length, 1);
  assert.equal(run.succession.plans[0].status, "pending");
  assert.equal(validateSurvivalRun(run), true);
  return run;
}

test("observer may fill five slots before any death, preserving pause and immutable inputs", () => {
  const original = setSurvivalRunPaused(createSurvivalRun("manual", {agentCount:1,agentCap:1}), true);
  const before = serializeSurvivalRun(original);
  let run = original;
  for (let n=2;n<=5;n++) {
    const result = addObserverAgent(run);
    assert.equal(result.ok,true); run=result.state;
    assert.equal(run.status,"paused"); assert.equal(alive(run).length,n);
    assert.equal(run.config.agentCap,5); assert.equal(result.event.intervention,true);
    assert.equal(validateSurvivalRun(run),true);
  }
  assert.equal(serializeSurvivalRun(original),before);
  assert.equal(addObserverAgent(run).reason,"agent_cap_reached");
  assert.equal(run.stats.observerInterventions,4);
});

test("pre-death planning spends the starter kit exactly once and is not a living agent", () => {
  const run = planned();
  assert.equal(run.agents.length,1);
  assert.equal(run.agents[0].inventory.freshwater,3.5);
  assert.equal(run.agents[0].inventory.food,3.5);
  assert.equal(run.agents[0].successionReview.choice,"planned");
  assert.deepEqual(run.agents[0].knownSuccessionPredecessors,[run.agents[0].id]);
  const result = advanceSurvivalRun(run,40), later = result.state;
  assert.equal(later.succession.plans.length,1);
  assert.deepEqual(later.succession.plans,run.succession.plans,"the funded kit is not charged again");
  // An agent may now interrupt the fixture's long rest to consume a ration.
  // Account for confirmed use instead of requiring the agent to ignore thirst.
  const used=action=>result.events.filter(e=>e.type==="action_outcome"&&e.facts.action===action&&e.facts.success===true).length;
  assert.equal(later.agents[0].inventory.freshwater,3.5-used("drink"));
  assert.equal(later.agents[0].inventory.food,3.5-used("eat"));
  assert.equal(validateSurvivalRun(later),true);
});

test("funded last-agent death creates one fresh generation before extinction, with no birth-tick actions", () => {
  const run = restoreSurvivalRun(serializeSurvivalRun(planned()));
  const parent = run.agents[0]; parent.needs.health=0;
  const result = advanceSurvivalRun(run,1), next=result.state, child=next.agents[1];
  assert.equal(parent.alive,true,"pure advance preserves its input");
  assert.equal(next.agents[0].alive,false);
  assert.equal(next.status,"running"); assert.equal(alive(next).length,1);
  assert.notEqual(child.id,parent.id); assert.equal(child.slot,parent.slot);
  assert.equal(child.slotGeneration,2); assert.equal(child.lineage.generation,2);
  assert.equal(child.lineage.predecessorId,parent.id);
  assert.equal(child.spawnSource,"autonomous_successor");
  assert.equal(child.inventory.freshwater,.5); assert.equal(child.inventory.food,.5);
  assert.deepEqual(child.observations,[]); assert.deepEqual(child.memory,[]);
  assert.equal(child.currentPlan,null); assert.equal(child.currentDeliberation,null);
  assert.deepEqual(child.research,[]); assert.deepEqual(child.technologies,[]);
  assert.equal(next.stats.observerInterventions,0);
  assert.equal(result.events.filter(e=>e.type==="agent_added").length,1);
  assert.equal(next.succession.plans[0].status,"fulfilled");
  assert.equal(validateSurvivalRun(next),true);
  const restored=restoreSurvivalRun(serializeSurvivalRun(next));
  assert.equal(step(restored).agents.length,2,"a fulfilled plan cannot admit twice");
});

test("need urgency, missing supplies, young age, and poor known prospects allow defer or decline", () => {
  const run=planned(), source=run.agents[0];
  const young=structuredClone(source); young.spawnedAt=35;
  assert.equal(evaluateSuccession(young,36,young.id).choice,"deferred");
  const thirsty=structuredClone(source); thirsty.needs.hydration=20;
  assert.equal(evaluateSuccession(thirsty,36,thirsty.id).choice,"deferred");
  const poor=structuredClone(source); poor.inventory.food=1;
  assert.equal(evaluateSuccession(poor,36,poor.id).choice,"deferred");
  const uncertain=structuredClone(source); uncertain.observations=uncertain.observations.filter(o=>o.kind!=="resource");
  assert.equal(evaluateSuccession(uncertain,36,uncertain.id).choice,"declined");
  assert.deepEqual(evaluateSuccession(source,36,source.id),evaluateSuccession(structuredClone(source),36,source.id));
});

test("a surviving sponsor may fund after observing death; duplicate claims return a receipt without double spending", () => {
  const run=opportunity(3); run.agents[0].needs.health=0;
  const next=step(run), predecessor=next.agents[0], first=next.agents[1], second=next.agents[2];
  assert.equal(next.succession.plans.length,1);
  const plan=next.succession.plans[0];
  assert.equal(plan.mode,"after_death"); assert.equal(plan.predecessorId,predecessor.id);
  assert.equal(plan.sponsorId,first.id); assert.equal(plan.status,"fulfilled");
  assert.equal(first.inventory.food,3.5); assert.equal(second.inventory.food,4);
  assert.equal(second.successionReview.choice,"deferred");
  assert.match(second.successionReview.rationale,/already has a funded plan/);
  assert.deepEqual(second.knownSuccessionPredecessors,[predecessor.id]);
  assert.equal(next.agents[3].lineage.sponsorId,first.id);
  assert.equal(validateSurvivalRun(next),true);
});

test("unseen or low-confidence deaths cannot change private succession target or invalidate saves", () => {
  const run=opportunity(2); run.agents[0].needs.health=0; run.agents[0].position={x:100,z:100};
  const sponsor=run.agents[1];
  sponsor.observations=sponsor.observations.filter(o=>o.kind!=="agent");
  sponsor.observations.push({id:"uncertain-death",observerId:sponsor.id,kind:"agent",subjectId:run.agents[0].id,observedAt:35,confidence:.2,position:{x:100,z:100},facts:{alive:false}});
  const next=step(run);
  assert.equal(next.agents[1].successionReview.mode,"before_death");
  assert.equal(next.succession.plans[0].predecessorId,sponsor.id);
  assert.equal(validateSurvivalRun(next),true);
});

test("shared evidence can predate a new agent's birth while its receipt is current", () => {
  let run=advanceSurvivalRun(createSurvivalRun("shared-succession",{agentCount:1,durationHours:null}),1).state;
  run=addObserverAgent(run).state;
  run=advanceSurvivalRun(run,35).state;
  const agent=run.agents[1]; agent.position={x:-100,z:-100};
  for(const observation of agent.observations) if(observation.kind==="resource") observation.facts.availableEstimate=0;
  agent.observations.push({id:"old-shared-water",observerId:agent.id,kind:"resource",subjectId:run.environment.resources[0].id,observedAt:0,receivedAt:1,originalObserverId:run.agents[0].id,transmissionChain:[run.agents[0].id,agent.id],confidence:.7,position:{x:0,z:0},facts:{resourceKind:"freshwater",availableEstimate:8}});
  assert.equal(validateSurvivalRun(run),true);
  const next=step(run), review=next.agents[1].successionReview;
  assert.ok(review.evidence.some(o=>o.id==="old-shared-water"));
  assert.equal(validateSurvivalRun(next),true);
  assert.doesNotThrow(()=>restoreSurvivalRun(serializeSurvivalRun(next)));
});

test("funded admissions wait for space and never displace an occupant", () => {
  let run=opportunity(2);
  // Delay sponsor's review until after the observer fills the vacancy.
  run.agents[1].spawnedAt=1;
  run.agents[1].observations=run.agents[1].observations.filter(o=>o.observedAt>=1);
  run.agents[0].needs.health=0;
  run=step(run);
  assert.equal(run.succession.plans.length,0);
  while(alive(run).length<5) run=addObserverAgent(run).state;
  run=step(run);
  assert.equal(run.succession.plans[0]?.status,"pending",JSON.stringify(run.agents.map(a=>({id:a.id,review:a.successionReview,inventory:a.inventory}))));
  assert.equal(alive(run).length,5);
  const occupant=run.agents.find(a=>a.alive && a.slot===1);
  const later=step(run); assert.equal(later.agents.find(a=>a.id===occupant.id).alive,true);
  run.agents.find(a=>a.alive && a.slot===3).needs.health=0;
  const admitted=step(run), plan=admitted.succession.plans[0];
  assert.equal(plan.status,"fulfilled"); assert.equal(alive(admitted).length,5);
  assert.equal(admitted.agents.find(a=>a.id===plan.successorId).slot,3);
  assert.equal(validateSurvivalRun(admitted),true);
});

test("configured duration wins over pending succession and forbids last-tick new funding", () => {
  const run=planned(); run.config.durationHours=37/6; run.agents[0].needs.health=0;
  const next=step(run);
  assert.equal(next.status,"completed"); assert.equal(next.agents.length,1);
  assert.equal(next.succession.plans[0].status,"pending");
  assert.equal(addObserverAgent(next).reason,"run_completed");
  assert.equal(validateSurvivalRun(next),true);
  const unplanned=opportunity(); unplanned.config.durationHours=6;
  const boundary=step(unplanned);
  assert.equal(boundary.succession.plans.length,0);
  assert.equal(boundary.agents[0].inventory.food,4);
});

test("old policy-2 checkpoints enable the additive rules once without fabricated past decisions", () => {
  const old=opportunity(); delete old.succession; delete old.survivalRevision; old.schemaVersion=1;
  const normalized=normalizeSurvivalRun(old);
  assert.equal(normalized.succession,undefined);
  const next=step(normalized);
  assert.equal(next.succession.enabledAt,36);
  assert.equal(next.schemaVersion,4);
  assert.equal(next.events.filter(e=>e.type==="succession_enabled").length,1);
  assert.equal(step(next).events.filter(e=>e.type==="succession_enabled").length,1);
  assert.equal(validateSurvivalRun(next),true);
});

test("the next-generation schema fences older clients without deleting the pre-upgrade checkpoint", () => {
  const old=opportunity(); delete old.succession; delete old.survivalRevision; old.schemaVersion=1;
  const snapshot=serializeSurvivalRun(old);
  const fenced={...old,schemaVersion:2};
  assert.equal(validateSurvivalRun(fenced),true);
  assert.equal(validateLegacySchema(fenced),false,"schema-1 clients must stop before running old rules");
  assert.equal(fenced.tick,old.tick);
  assert.equal(serializeSurvivalRun(old),snapshot);
});

test("succession survives batched advancement, restoration, and timeline tail eviction without duplication", () => {
  const run=planned(); run.agents[0].needs.health=0;
  const direct=advanceSurvivalRun(run,12).state;
  let split=run;
  for(let i=0;i<12;i++) split=step(restoreSurvivalRun(serializeSurvivalRun(split)));
  assert.equal(serializeSurvivalRun(direct),serializeSurvivalRun(split));
  const tail=structuredClone(direct);
  tail.events=tail.events.slice(-1);
  tail.eventWindow.droppedEvents=tail.eventWindow.totalEvents-tail.events.length;
  tail.eventWindow.firstRetainedTick=tail.events[0].tick;
  assert.equal(validateSurvivalRun(tail),true);
  assert.equal(step(tail).agents.length,2);
});

test("malformed lineage, escrow, review timestamps and duplicate plans are rejected without throwing", () => {
  const run=planned(); run.agents[0].needs.health=0;
  const source=step(run);
  const mutations=[
    r=>r.succession.plans.push(structuredClone(r.succession.plans[0])),
    r=>r.succession.plans[0].provisions.food=-1,
    r=>r.succession.plans[0].successorId="missing",
    r=>r.succession.plans[0].fulfilledAt=0,
    r=>r.succession.plans[0].plannedAt=38,
    r=>r.succession.plans[0].evidence[0].observedAt=100,
    r=>r.agents[1].lineage.generation=3,
    r=>r.agents[1].lineage.predecessorId=r.agents[1].id,
    r=>delete r.agents[1].lineage,
    r=>r.agents[0].successionReview.reconsiderAfter=0,
    r=>r.agents[0].knownSuccessionPredecessors.push("missing"),
    r=>delete r.succession,
  ];
  for(const mutate of mutations) {
    const bad=structuredClone(source); mutate(bad);
    assert.doesNotThrow(()=>validateSurvivalRun(bad));
    assert.equal(validateSurvivalRun(bad),false);
  }
});
