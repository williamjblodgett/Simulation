import assert from "node:assert/strict";
import test from "node:test";
import {createSurvivalRun,advanceSurvivalRun,validateSurvivalRun,serializeSurvivalRun,restoreSurvivalRun,setSurvivalRunPaused,SURVIVAL_SCHEMA_VERSION} from "../app/simulation/survival/engine.ts";
import {planFromPrivateKnowledge} from "../app/simulation/survival/planner.ts";
import {findPrivateRoute,privateSegmentClear,freshNavigation} from "../app/simulation/survival/private-navigation.ts";
import {physicalNextPosition} from "../app/simulation/survival/physical-navigation.ts";
import {executeManipulation} from "../app/simulation/survival/physical-world.ts";
import {projectChoice} from "../app/simulation/survival/physical-policy.ts";
import {rememberedProtection,planNeedsRepair,requestExpectation,timeToHarm,rememberedConditions} from "../app/simulation/survival/survival-forecast.ts";
import {freshwaterFootprint,shorePoints,canCollectFreshwater,depthAt} from "../app/simulation/survival/water.ts";
import {repeatedEventEpisodes} from "../app/survival/repeated-events.ts";

function fixture(){
  const world=createSurvivalRun("recovery-private",{policyVersion:3,agentCount:1,climateVolatility:"stable"}),agent=world.agents[0];
  agent.position={x:0,z:0};agent.needs={health:90,hydration:18,nutrition:90,energy:90,warmth:90,safety:90};
  agent.observations=[{id:"water-observation",observerId:agent.id,subjectId:"known-water",kind:"resource",observedAt:0,confidence:.94,position:{x:18,z:0},facts:{resourceKind:"freshwater",availableEstimate:8,contaminated:false}},{id:"weather",observerId:agent.id,subjectId:"weather",kind:"weather",observedAt:0,confidence:1,position:null,facts:{temperatureC:18,daylight:.5,weather:"clear"}}];
  return {world,agent,input:{agent,tick:0,seed:world.seed,bounds:world.environment.bounds,physical:true}};
}
const step=(action,extra={})=>({id:"step-fixture",action,targetId:null,destination:null,remainingSteps:1,status:"pending",...extra});
const plan=steps=>({id:"plan-fixture",formedAt:0,goal:"secure_water",targetId:null,targetPosition:null,status:"active",rationale:"Executor fixture",activeStepIndex:0,steps});

test("private search retains a complete travel, collection and drinking opportunity",()=>{
  const {input}=fixture(),before=structuredClone(input),choice=planFromPrivateKnowledge(input)[0];
  const actions=choice.actions.map(a=>a.action);
  assert.equal(actions[0],"move");assert.equal(choice.actions[0].targetId,"known-water");
  assert.ok(actions.indexOf("collect")>0);assert.ok(actions.indexOf("drink")>actions.indexOf("collect"));
  assert.deepEqual(input,before);
  input.agent.survivalRecord={unseenWaterLocation:{x:1,z:1},fakeSurvivalReward:1e9};
  assert.deepEqual(planFromPrivateKnowledge(input)[0],choice,"observer telemetry cannot influence choices");
});

test("route recovery can backtrack around observed geometry without reading unseen parts",()=>{
  const {world,agent}=fixture();world.environment.resources=[];
  const part=(id,x,z,sx,sz)=>({id,makerId:agent.id,condition:1,position:{x,y:1,z},size:{x:sx,y:2,z:sz},rotation:0});
  const parts=[part("part-1",2,0,1,6),part("part-2",0,3,4,1),part("part-3",0,-3,4,1)];
  const seen=parts.map(p=>({id:`obs-${p.id}`,observerId:agent.id,kind:"structure",subjectId:p.id,position:p.position,observedAt:0,confidence:1,facts:{structureKind:"physical_part",width:p.size.x,height:p.size.y,depth:p.size.z,elevation:p.position.y,rotation:0,condition:100}}));
  const start={x:0,z:0},target={x:8,z:0};
  assert.deepEqual(findPrivateRoute([],world.environment.bounds,start,target),[target]);
  const route=findPrivateRoute(seen,world.environment.bounds,start,target);assert.ok(route);assert.ok(route.some(p=>p.x<0),"escape requires backtracking");
  let position=start;
  for(const p of route){assert.equal(privateSegmentClear(seen,world.environment.bounds,position,p),true);for(let i=0;Math.hypot(position.x-p.x,position.z-p.z)>.05&&i<100;i++){const next=physicalNextPosition(world.environment,{parts},position,p,{strict:true});assert.ok(next);position=next;}}
  assert.ok(Math.hypot(position.x-target.x,position.z-target.z)<.05);
});

test("reachable freshwater banks agree with the shared collection rule",()=>{
  const footprint=freshwaterFootprint({position:{x:0,z:0},capacity:70});
  assert.ok(shorePoints(footprint).every(p=>canCollectFreshwater(footprint,p)));
  assert.equal(canCollectFreshwater(footprint,footprint.position),false);
  assert.equal(canCollectFreshwater(footprint,{x:50,z:50}),false);
});

test("a blocked dry destination cannot resolve to a stationary underwater approach",()=>{
  const {world,agent}=fixture(),pond=world.environment.resources.find(r=>r.kind==="freshwater");
  pond.position={x:0,z:0};pond.capacity=28.24;world.environment.resources=[pond];
  const f=freshwaterFootprint(pond);
  const parts=[{id:"part-3",condition:1,position:{x:5.983949493661166,y:.8066218589898198,z:3.442949493661166},size:{x:2.740849909558892,y:1.6132437179796395,z:.3149156356388458},rotation:.16044184647547557},{id:"part-9",condition:1,position:{x:3.9350505063388335,y:.9840003107907249,z:4.654949493661166},size:{x:2.706798410532065,y:1.9680006215814498,z:.20172497101448114},rotation:3.135260479246458}];
  const seen=parts.map(p=>({id:p.id,observerId:agent.id,kind:"structure",subjectId:p.id,position:p.position,observedAt:0,confidence:1,facts:{structureKind:"physical_part",condition:100,width:p.size.x,height:p.size.y,depth:p.size.z,elevation:p.position.y,rotation:p.rotation}}));
  seen.push({id:"pond",observerId:agent.id,kind:"resource",subjectId:pond.id,position:{x:0,z:5},observedAt:0,confidence:1,facts:{resourceKind:"freshwater",waterCenterX:0,waterCenterZ:0,waterRadiusX:f.radiusX,waterRadiusZ:f.radiusZ,waterRotation:0}});
  let position={x:2.745,z:2.811};const target={x:4.778,z:3.653};
  assert.ok(depthAt([f],position)>0);assert.equal(depthAt([f],target),0);
  const route=findPrivateRoute(seen,world.environment.bounds,position,target);assert.ok(route);
  assert.equal(depthAt([f],route.at(-1)),0,"contact-radius adjustments must still reach dry ground");
  for(const waypoint of route)for(let n=0;Math.hypot(position.x-waypoint.x,position.z-waypoint.z)>.05&&n<30;n++){
    const next=physicalNextPosition(world.environment,{parts},position,waypoint,{strict:true});assert.ok(next);
    position={x:Math.round(next.x*1000)/1000,z:Math.round(next.z*1000)/1000};
  }
  assert.equal(depthAt([f],position),0);assert.ok(Math.hypot(position.x-target.x,position.z-target.z)<=2.4);
});

test("construction cannot create or place a component through another living agent",()=>{
  const {world,agent}=fixture();world.environment.resources=[];agent.inventory.wood=4;
  const neighbor={x:1.5,z:0},occupants=[agent.position,neighbor];
  const shaped=executeManipulation(world.physical,agent,{kind:"shape",material:"wood",mass:.65,size:{x:1,y:1,z:1}},world.environment,0,occupants);
  assert.equal(shaped.ok,true);
  const p=world.physical.parts[0];assert.ok(Math.hypot(p.position.x-neighbor.x,p.position.z-neighbor.z)>.9);
  const before=structuredClone(p);
  const placed=executeManipulation(world.physical,agent,{kind:"place",partId:p.id,position:{...neighbor,y:.5},rotation:0},world.environment,0,occupants);
  assert.equal(placed.ok,false);assert.deepEqual(p,before);
});

test("an arrived work-site proposal offers work instead of an endless completed move",()=>{
  const {agent,input}=fixture();agent.inventory.wood=2;
  const project={position:{x:2,z:0},cursor:0,predictedBenefit:4,target:.3,operations:[{kind:"shape",material:"wood",mass:1,size:{x:1,y:1,z:1}}]};
  const choice=projectChoice(input,project);
  assert.equal(choice.actions[0].action,"build");assert.equal(choice.actions[0].manipulation.kind,"shape");
});

test("legacy contact overlap permits a continuous escape but not deeper penetration",()=>{
  const {world}=fixture();world.environment.resources=[];
  const parts=[{id:"part-1",position:{x:0,y:1,z:0},size:{x:2,y:2,z:2},rotation:0,condition:1}];
  const start={x:1.2,z:0};
  assert.ok(physicalNextPosition(world.environment,{parts},start,{x:4,z:0},{strict:true}));
  assert.equal(physicalNextPosition(world.environment,{parts},start,{x:-4,z:0},{strict:true}),null);
});

test("refusal forecasts are partner and resource specific and never create carried water",()=>{
  const {agent,input}=fixture(),other={id:"other",kind:"agent",subjectId:"agent-2",observerId:agent.id,observedAt:0,confidence:1,position:{x:1,z:0},facts:{alive:true,hydrationEstimate:80,nutritionEstimate:80}};
  const before=requestExpectation(agent,other,"freshwater",0);
  agent.learning.push({context:"aid:agent-2:freshwater",attempts:5,successes:0,expectedUtility:-1,updatedAt:0});
  assert.ok(requestExpectation(agent,other,"freshwater",1)<before/5);
  assert.equal(requestExpectation(agent,other,"food",1),before);
  agent.observations=[other];const choices=planFromPrivateKnowledge(input);
  for(const c of choices)assert.equal(c.actions.some(a=>a.action==="drink"),false);
  assert.equal(agent.inventory.freshwater,0);
});

test("urgency examines timely relief rather than the presence of a request action",()=>{
  const {agent}=fixture();agent.needs.hydration=10;
  agent.currentPlan=plan([step("request",{targetId:"agent-2",resource:"freshwater"})]);
  assert.equal(planNeedsRepair(agent,0),true);
  agent.inventory.freshwater=1;agent.currentPlan=plan([step("drink")]);
  assert.equal(planNeedsRepair(agent,0),false);
  agent.inventory.freshwater=0;agent.currentPlan=plan([step("move",{destination:{x:100,z:0}}),step("collect",{targetId:"known-water"}),step("drink")]);
  assert.equal(planNeedsRepair(agent,0),true);
  assert.equal(timeToHarm(agent.needs,rememberedConditions(agent,0)),1);
});

test("remembered passive protection uses one baseline and invalidates changed geometry",()=>{
  const {agent}=fixture();agent.observations.push({id:"part",subjectId:"part-1",kind:"structure",observerId:agent.id,position:{x:1,z:0},observedAt:0,confidence:1,facts:{structureKind:"physical_part",condition:100,revision:1}});
  agent.physicalMind.uses=[{tick:0,partId:"part-1",revision:1,position:{x:0,z:0},weather:"clear",protection:.5}];
  assert.equal(rememberedProtection(agent,agent.position,0,"clear"),.5);
  agent.observations.at(-1).facts.revision=2;
  assert.equal(rememberedProtection(agent,agent.position,0,"clear"),0);
});

test("save upgrade happens only on advancement and never invents past measurements",()=>{
  const old=createSurvivalRun("old-recovery",{policyVersion:3});delete old.survivalRevision;old.schemaVersion=3;
  for(const a of old.agents){delete a.navigation;delete a.survivalRecord;}
  assert.equal(validateSurvivalRun(old),true);
  const paused=setSurvivalRunPaused(old,true);assert.deepEqual(advanceSurvivalRun(paused,10).state,paused);
  const updated=advanceSurvivalRun(old,1).state;assert.equal(updated.schemaVersion,4);assert.equal(updated.schemaVersion,SURVIVAL_SCHEMA_VERSION);assert.equal(updated.survivalRevision,1);
  assert.ok(updated.agents.every(a=>a.survivalRecord.since===1));assert.ok(updated.events.some(e=>e.facts.survivalRevision===1));
  assert.deepEqual(restoreSurvivalRun(serializeSurvivalRun(updated)),updated);
  const bad=structuredClone(updated);bad.agents[0].navigation.waypoints=[{x:Infinity,z:0}];assert.equal(validateSurvivalRun(bad),false);
  assert.equal(validateSurvivalRun({...updated,survivalRevision:2}),false);
});

test("death measurements persist actual outcomes and cannot resurrect a life",()=>{
  let world=createSurvivalRun("death-review",{policyVersion:3,agentCount:1});
  world.agents[0].needs.health=0;world=advanceSurvivalRun(world,1).state;
  const agent=world.agents[0];assert.equal(agent.alive,false);assert.equal(agent.survivalRecord.samples.at(-1).health,0);
  assert.equal(agent.survivalRecord.lastDrinkAt,null);assert.ok(world.events.some(e=>e.type==="agent_died"&&e.facts.recordSince===0));
  assert.deepEqual(restoreSurvivalRun(serializeSurvivalRun(world)),world);
});

test("hourly measurements include the current step's deep-water injury",()=>{
  const initial=createSurvivalRun("recovery-water-record",{policyVersion:3,agentCount:1});
  initial.tick=5;initial.elapsedMinutes=50;initial.timeOfDay=50;
  const pond=initial.environment.resources.find(r=>r.kind==="freshwater");
  pond.position={x:0,z:0};pond.capacity=500;pond.quantity=500;initial.environment.resources=[pond];
  Object.assign(initial.agents[0],{position:{x:0,z:0},needs:{health:95,hydration:95,nutrition:95,energy:0,warmth:95,safety:95}});
  const final=advanceSurvivalRun(initial,1).state,agent=final.agents[0];
  assert.ok(agent.needs.health<95);assert.equal(agent.survivalRecord.samples.at(-1).health,agent.needs.health);
  assert.equal(validateSurvivalRun(final),true);
});

test("an environment without food or water still permits genuine terminal failure",()=>{
  const initial=createSurvivalRun("recovery-impossible",{policyVersion:3,agentCount:1,durationHours:72,continuity:false});
  initial.environment.resources=[];
  initial.agents[0].observations=[];
  const final=advanceSurvivalRun(initial,432).state;
  assert.equal(final.status,"extinct");assert.equal(final.stats.livingAgents,0);
  assert.equal(final.agents[0].causeOfDeath,"dehydration");
  assert.equal(final.agents[0].survivalRecord.lastDrinkAt,null);
  assert.equal(final.stats.totalAgentsIntroduced,1);assert.equal(final.stats.observerInterventions,0);
  assert.equal(validateSurvivalRun(final),true);
});

test("repeated-event groups preserve raw records and break on consent or day changes",()=>{
  const event=(n,type="social_refused",day=1)=>({id:`event-${n}`,tick:n,day,type,category:"social",agentIds:["agent-1","agent-2"],summary:"Water request",outcome:"No transfer",position:null,intervention:false,facts:{action:"request",resource:"freshwater",decisionId:`decision-${n}`}});
  const rows=[event(1),event(2),event(3,"social_accepted"),event(4),event(5,"social_refused",2)];
  const before=structuredClone(rows),groups=repeatedEventEpisodes(rows);
  assert.equal(groups.length,1);assert.equal(groups[0].attempts,2);assert.deepEqual(groups[0].records,rows.slice(0,2));assert.deepEqual(rows,before);
});

test("survival telemetry and route experience are bounded over a run",()=>{
  let world=createSurvivalRun("recovery-bounds",{policyVersion:3,agentCount:1,durationHours:6});
  world=advanceSurvivalRun(world,36).state;
  assert.equal(validateSurvivalRun(world),true);
  const a=world.agents[0];assert.ok(a.survivalRecord.samples.length<=25);assert.ok(a.survivalRecord.incidents.length<=24);assert.ok(a.navigation.recent.length<=12);
  assert.deepEqual(freshNavigation().blocked,[]);
});

test("the reproduced early dehydration scenario survives a full day without interventions",()=>{
  const initial=createSurvivalRun("survival-audit-3",{policyVersion:3,agentCount:3,durationHours:24,resourceAbundance:"balanced",climateVolatility:"variable",continuity:false});
  const final=advanceSurvivalRun(initial,144).state;
  assert.equal(final.stats.livingAgents,3);assert.equal(final.stats.observerInterventions,0);assert.equal(final.stats.totalAgentsIntroduced,3);
  assert.ok(final.agents.every(a=>a.survivalRecord.lastDrinkAt!==null));assert.equal(validateSurvivalRun(final),true);
});
