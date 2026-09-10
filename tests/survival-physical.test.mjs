import assert from "node:assert/strict";
import test from "node:test";
import { createSurvivalRun, advanceSurvivalRun, restoreSurvivalRun, serializeSurvivalRun, validateSurvivalRun, addObserverAgent, setSurvivalRunPaused } from "../app/simulation/survival/engine.ts";
import { executeManipulation, protectionAt, settleAssemblies, properties, agePhysicalWorld } from "../app/simulation/survival/physical-world.ts";
import { planPhysicalKnowledge, preparePhysicalProjects, learnPhysicalReading, completePhysicalOperation, procedureForObservation, projectChoice } from "../app/simulation/survival/physical-policy.ts";
import { observedPoseFits, findObservedPose } from "../app/simulation/survival/physical-spatial.ts";
import { constructionRecord, projectEpisodes } from "../app/survival/construction-record.ts";
import { validManipulation } from "../app/simulation/survival/physical-validation.ts";
import { physicalNextPosition, physicalWalkable, physicalTraversable } from "../app/simulation/survival/physical-navigation.ts";
import { depthAt, freshwaterFeatures, locomotionAt, observedWater, waterDepth, estimateWaterTravel } from "../app/simulation/survival/water.ts";
import { planFromPrivateKnowledge } from "../app/simulation/survival/planner.ts";
import { createPhysicalCollection } from "../app/survival/scene/physical-models.ts";
import * as THREE from "three";

function observePart(s,p){s.agents[0].observations.push({id:`seen-${p.id}`,observerId:s.agents[0].id,kind:"structure",subjectId:p.id,observedAt:s.tick,position:{x:p.position.x,z:p.position.z},confidence:.9,facts:{structureKind:"physical_part",width:p.size.x,height:p.size.y,depth:p.size.z,elevation:p.position.y,rotation:p.rotation,condition:p.condition*100,mass:Object.values(p.composition).reduce((a,b)=>a+b,0),material:Object.keys(p.composition)[0],hollow:p.hollow,storedWater:p.water,supported:p.supported,bindingIds:"[]",revision:p.revision}});}
const policyInput=s=>({agent:s.agents[0],tick:s.tick,seed:s.seed,bounds:s.environment.bounds});
function projectAt(a,op){return {id:"project-test",createdAt:0,updatedAt:0,lastReviewAt:0,metric:"exposure",target:.3,baseline:0,status:"active",reason:"Reduce exposure",position:{...a.position},reserved:{},operations:[op],cursor:0,partIds:[],predictedBenefit:10,spentEffort:0,revisions:0};}

test("spatial proposals avoid observed overlap and floating roofs but admit grounded support",()=>{
  const s=fixture();shape(s);const p=s.physical.parts[0];p.position={x:62,y:.5,z:60};observePart(s,p);
  const input=policyInput(s),size={x:1,y:1,z:1};
  assert.equal(observedPoseFits(input,size,p.position,0),false);
  assert.equal(observedPoseFits(input,size,{x:64,y:3,z:60},0),false);
  assert.equal(observedPoseFits(input,size,{x:62,y:1.5,z:60},0),true);
  const repaired=findObservedPose(input,size,p.position,0);assert.ok(repaired);assert.notDeepEqual(repaired.position,p.position);
  assert.equal(observedPoseFits(input,size,repaired.position,repaired.rotation),true);
  assert.equal(observedPoseFits(input,size,{x:60,y:.5,z:60},0),false,"leave the agent and an approach unoccupied");
});

test("clearance reasoning only sees private geometry and observed water",()=>{
  const s=fixture(),input=policyInput(s),size={x:1,y:1,z:1},pose={x:62,y:.5,z:60};
  const before=findObservedPose(input,size,pose,0);shape(s);s.physical.parts[0].position=pose;
  assert.deepEqual(findObservedPose(input,size,pose,0),before,"unseen registry entries cannot affect the planner");
  observePart(s,s.physical.parts[0]);assert.notDeepEqual(findObservedPose(input,size,pose,0),before);
});

test("stone shaping reserves a separate striker before attempting work",()=>{
  const s=fixture(),a=s.agents[0];a.inventory.stone=1.1;
  a.observations.push({id:"known-stone",observerId:a.id,kind:"resource",subjectId:"stone-site",position:{x:65,z:60},observedAt:0,confidence:1,facts:{resourceKind:"stone",availableEstimate:10}});
  const p=projectAt(a,{kind:"shape",material:"stone",mass:1,size:{x:1,y:1,z:.4}});
  const choice=projectChoice(policyInput(s),p);assert.equal(choice.actions.at(-1).action,"gather");assert.match(p.blocker,/striking stone/);
  a.inventory.stone=1.5;assert.equal(projectChoice(policyInput(s),p).actions[0].manipulation.kind,"shape");
});

test("failed operations preserve completed work and have bounded retries",()=>{
  const s=fixture(),a=s.agents[0],op={kind:"place",partId:"part-1",position:{x:62,y:.5,z:60},rotation:0};
  const p=projectAt(a,op);a.physicalMind.projects=[p];
  for(let i=0;i<4;i++){p.status="active";completePhysicalOperation(a,op,false,null,0,.6,"Observed overlap");assert.equal(p.cursor,0);}
  assert.equal(p.failures,4);assert.equal(p.status,"abandoned");assert.equal(p.history[0].summary,"Observed overlap");
});

test("physical reasoning upgrades at advancement only and survives an exact checkpoint",()=>{
  const s=createSurvivalRun("construction-upgrade",{policyVersion:3});
  for(const a of s.agents){a.physicalMind.version=1;delete a.physicalMind.uses;}
  const paused=setSurvivalRunPaused(s,true),unchanged=advanceSurvivalRun(paused,10);
  assert.equal(unchanged.state.agents[0].physicalMind.version,1);
  const updated=advanceSurvivalRun(s,24).state;assert.ok(updated.agents.every(a=>a.physicalMind.version===2));
  assert.ok(updated.events.some(e=>e.facts.constructionReasoning===2));
  assert.deepEqual(restoreSurvivalRun(serializeSurvivalRun(updated)),updated);
  const corrupt=structuredClone(updated);corrupt.agents[0].physicalMind.uses=[{tick:-1}];assert.equal(validateSurvivalRun(corrupt),false);
});

test("construction inspection distinguishes damage and observed tests without mutating state",()=>{
  const s=fixture();shape(s);const p=s.physical.parts[0],before=serializeSurvivalRun(s);
  assert.equal(constructionRecord(s,p.id).status,"Untested part");assert.equal(serializeSurvivalRun(s),before);
  p.condition=.01;assert.equal(constructionRecord(s,p.id).status,"Damaged");assert.equal(constructionRecord(s,"part-999"),null);
});

test("project stories use exact project IDs and preserve the source event order",()=>{
  const event=(id,tick,projectId)=>({id,tick,day:1,facts:{projectId}});
  const source=[event("e3",3,"p1"),event("e2",2,"p2"),event("e1",1,"p1")],copy=structuredClone(source);
  const stories=projectEpisodes(source);assert.deepEqual(stories[0].records.map(e=>e.id),["e1","e3"]);assert.equal(stories[0].latest.id,"e3");assert.deepEqual(source,copy);
  assert.equal(projectEpisodes([event("event-12",3,"p1"),event("event-11",3,"p1")])[0].latest.id,"event-12");
});

test("experience records the executed rest, not the queued next action",()=>{
  const s=fixture(),a=s.agents[0];shape(s,"wood",{x:2,y:2,z:.25},.65);const p=s.physical.parts[0];p.position={x:60,y:1,z:61.2};observePart(s,p);
  a.needs.energy=50;
  a.currentPlan={id:"plan-1",decisionId:"decision-1",initialNeeds:{...a.needs},initialInventory:{...a.inventory},formedAt:0,goal:"recover",targetId:null,targetPosition:null,status:"active",rationale:"Protocol test",activeStepIndex:0,steps:[{id:"step-1",action:"rest",targetId:null,destination:null,remainingSteps:1,status:"active"},{id:"step-2",action:"move",targetId:null,destination:{x:65,z:60},remainingSteps:1,status:"pending"}]};
  const next=advanceSurvivalRun(s,1).state;
  assert.equal(next.agents[0].physicalMind.uses.length,1);assert.equal(next.agents[0].physicalMind.uses[0].action,"rest");assert.equal(next.agents[0].currentAction.kind,"move");
  assert.equal(constructionRecord(next,p.id).status,"In use");
  next.tick++;assert.notEqual(constructionRecord(next,p.id).status,"In use","past use is not current activity");
});

test("learned procedures contain measured operations, not an untested repair",()=>{
  const s=fixture(),a=s.agents[0],p=projectAt(a,{kind:"place",partId:"part-1",position:{x:62,y:1,z:60},rotation:0});
  p.operations.push({kind:"test",partId:"part-1",measure:"protection",dose:1});p.partIds=["part-1"];p.cursor=2;p.target=.5;a.physicalMind.projects=[p];
  const reading={id:"reading-repair",tick:1,observerId:a.id,source:"test",partId:"part-1",material:"wood",position:a.position,size:{x:2,y:2,z:.25},rotation:0,mass:.65,condition:1,revision:0,metric:"protection",before:0,after:.2,dose:1,temperature:4,weather:"clear",confidence:.9,summary:"Useful, but below the target."};
  learnPhysicalReading(a,reading);assert.equal(p.status,"interrupted");assert.equal(p.operations.length,4);
  const procedure=a.physicalMind.procedures[0];assert.equal(procedure.program.length,2);assert.equal(procedure.program[0].rotation,0);assert.notEqual(p.operations[2].rotation,0);
  const priorStatus=p.status;learnPhysicalReading(a,{...reading,id:"reported-success",source:"demonstration",after:.8});assert.equal(p.status,priorStatus,"testimony must not satisfy an untested repair");
});

test("constructed parts remain pickable with proposals rendered separately",()=>{
  const s=fixture();shape(s);const p=s.physical.parts[0];p.position={x:0,y:.5,z:0};
  const scene=createPhysicalCollection();scene.sync(s.physical,{selectedPartId:p.id,proposal:{size:{x:1,y:1,z:1},position:{x:5,y:.5,z:0},rotation:0}});scene.group.updateMatrixWorld(true);
  assert.equal(scene.raycast(new THREE.Raycaster(new THREE.Vector3(0,2,5),new THREE.Vector3(0,0,-1))),p.id);
  assert.equal(scene.raycast(new THREE.Raycaster(new THREE.Vector3(5,2,5),new THREE.Vector3(0,0,-1))),null,"a proposal is not a built object");scene.dispose();
});

function fixture(){const s=createSurvivalRun("physical-fixture",{policyVersion:3,agentCount:1});s.agents[0].position={x:60,z:60};s.agents[0].inventory.wood=10;s.agents[0].inventory.fiber=10;s.agents[0].inventory.clay=10;s.agents[0].inventory.stone=10;s.agents[0].inventory.freshwater=5;return s;}
const act=(s,op)=>executeManipulation(s.physical,s.agents[0],op,s.environment,s.tick);
const shape=(s,material="wood",size={x:1,y:1,z:1},mass=0.65,hollow=0)=>act(s,{kind:"shape",material,size,mass,hollow});
const total=(s,kind)=>s.agents.reduce((sum,a)=>sum+a.inventory[kind],0)+s.physical.parts.reduce((sum,p)=>sum+(p.composition[kind]??0),0)+(kind==="fiber"?s.physical.joints.reduce((sum,j)=>sum+j.fiber,0):0)+(s.physical.spent[kind]??0);

test("new physical studies are explicit; old studies keep their policy and schema",()=>{
  const old=createSurvivalRun("versions"),modern=createSurvivalRun("versions",{policyVersion:3});
  assert.equal(old.policyVersion,2);assert.equal(old.schemaVersion,2);assert.equal(old.physical,undefined);
  assert.equal(modern.policyVersion,3);assert.equal(modern.schemaVersion,3);assert.equal(modern.succession,undefined);
  assert.equal(advanceSurvivalRun(old,12).state.schemaVersion,2);assert.equal(advanceSurvivalRun(modern,12).state.schemaVersion,3);
  for(const schema of ["1","2","3",1,2])assert.equal(validateSurvivalRun({...modern,schemaVersion:schema}),false);
  assert.equal(validateSurvivalRun({...old,schemaVersion:3}),false);
});

test("physical actions conserve material through shape, split, mix and reclaim",()=>{
  const s=fixture(),before=total(s,"wood");
  const made=shape(s);assert.equal(made.ok,true);assert.ok(Math.abs(total(s,"wood")-before)<1e-6);
  assert.equal(act(s,{kind:"split",partId:made.partId,fraction:0.4}).ok,true);
  assert.ok(Math.abs(total(s,"wood")-before)<1e-6);
  const parts=s.physical.parts;assert.equal(parts.length,2);
  assert.equal(act(s,{kind:"mix",a:parts[0].id,b:parts[1].id}).ok,true);
  assert.ok(Math.abs(total(s,"wood")-before)<1e-6);
  assert.equal(act(s,{kind:"reclaim",partId:parts[0].id}).ok,true);
  assert.ok(Math.abs(total(s,"wood")-before)<1e-6);assert.equal(s.physical.parts.length,0);
});

test("invalid shape and remote manipulation cannot create matter or successful no-ops",()=>{
  const s=fixture(),before=total(s,"wood");
  assert.equal(shape(s,"wood",{x:4,y:4,z:4},0.65).ok,false);assert.equal(s.physical.parts.length,0);
  assert.equal(act(s,{kind:"reclaim",partId:"part-missing"}).ok,false);
  assert.equal(act(s,{kind:"invent_perpetual_motion"}).ok,false);
  assert.equal(total(s,"wood"),before);assert.ok(s.physical.workEnergy>0);
});

test("creation allocates distinct free poses and solid placement rejects overlap",()=>{
  const s=fixture();const a=shape(s),b=shape(s);assert.equal(a.ok,true);assert.equal(b.ok,true);
  const first=s.physical.parts[0],second=s.physical.parts[1];assert.notDeepEqual(first.position,second.position);
  assert.equal(act(s,{kind:"place",partId:second.id,position:first.position,rotation:0}).ok,false);
  assert.equal(validateSurvivalRun(s),true);
});

test("binding fibers are charged once, detached once, and cannot be reclaimed twice",()=>{
  const s=fixture(),before=total(s,"fiber");shape(s);shape(s);
  const [a,b]=s.physical.parts;b.position={...a.position,x:a.position.x+1};
  assert.equal(act(s,{kind:"join",a:a.id,b:b.id,fiber:0.5}).ok,true);assert.ok(Math.abs(total(s,"fiber")-before)<1e-6);
  const joint=s.physical.joints[0];assert.equal(act(s,{kind:"detach",jointId:joint.id}).ok,true);
  assert.equal(act(s,{kind:"detach",jointId:joint.id}).ok,false);assert.ok(Math.abs(total(s,"fiber")-before)<1e-6);
});

test("loads propagate through a stack and unsupported assemblies remain failed remnants",()=>{
  const s=fixture();
  const base={id:"part-1",makerId:"agent-1",createdAt:0,composition:{fiber:0.04},size:{x:1,y:0.2,z:1},position:{x:60,y:0.1,z:60},rotation:0,condition:1,temperature:10,hollow:0,water:0,supported:true,revision:1};
  s.physical.parts=[base,...Array.from({length:5},(_,i)=>({...structuredClone(base),id:`part-${i+2}`,composition:{stone:2.5},size:{x:1,y:1,z:1},position:{x:60,y:0.7+i,z:60}}))];
  settleAssemblies(s.physical);assert.ok(s.physical.parts.some(p=>!p.supported&&p.condition<=0.05));
  settleAssemblies(s.physical);assert.ok(s.physical.parts.some(p=>!p.supported));
});

test("an unnamed arrangement protects according to geometry, condition and orientation",()=>{
  const s=fixture();shape(s,"wood",{x:2,y:2,z:0.25},0.65);const p=s.physical.parts[0];
  p.position={x:60,y:1,z:61.1};p.rotation=0;
  const useful=protectionAt(s.physical,s.agents[0].position,"clear");assert.ok(useful>0.1);
  p.rotation=Math.PI/2;assert.ok(protectionAt(s.physical,s.agents[0].position,"clear")<useful);
  p.condition=0;assert.equal(protectionAt(s.physical,s.agents[0].position,"clear"),0);
  assert.ok(!("kind" in p));
});

test("heating charges finite fuel and water tests conserve retained plus leaked water",()=>{
  const s=fixture(),wood=total(s,"wood");shape(s,"clay",{x:1,y:1,z:1},0.75,0.5);const p=s.physical.parts[0];
  assert.equal(act(s,{kind:"heat",partId:p.id,fuel:1}).ok,true);assert.ok(Math.abs(total(s,"wood")-wood)<1e-6);
  const initial=s.agents[0].inventory.freshwater;
  assert.equal(act(s,{kind:"test",partId:p.id,measure:"retention",dose:1}).ok,true);
  agePhysicalWorld(s.physical,s.environment);
  assert.ok(Math.abs(s.agents[0].inventory.freshwater+p.water+(s.physical.spent.freshwater??0)-initial)<1e-5);
  assert.equal(s.physical.tests,1);assert.ok(properties(p).permeability>=0);
});

test("private decisions do not consult unseen physical truth",()=>{
  const first=advanceSurvivalRun(createSurvivalRun("private-physical",{policyVersion:3}),8).state;
  const unseen=structuredClone(first);unseen.environment.temperatureC=-50;unseen.physical.parts=[];
  const input=s=>({agent:structuredClone(s.agents[0]),tick:s.tick,seed:s.seed,bounds:s.environment.bounds});
  assert.deepEqual(planPhysicalKnowledge(input(first)),planPhysicalKnowledge(input(unseen)));
});

test("a dangerous need interrupts retained projects without forcing construction",()=>{
  const s=advanceSurvivalRun(createSurvivalRun("physical-check",{policyVersion:3,climateVolatility:"harsh"}),1).state,a=s.agents[0];
  assert.ok(a.physicalMind.projects.length>0);const project=a.physicalMind.projects[0],operations=structuredClone(project.operations);
  a.needs.hydration=5;preparePhysicalProjects({agent:a,tick:2,seed:s.seed,bounds:s.environment.bounds});
  assert.equal(project.status,"interrupted");assert.deepEqual(project.operations,operations);
  assert.ok(planPhysicalKnowledge({agent:a,tick:2,seed:s.seed,bounds:s.environment.bounds})[0].actions.every(a=>!a.manipulation));
});

test("learning ablation keeps measurements truthful and transfer translates learned operations",()=>{
  for(const enabled of [true,false]){
    const s=advanceSurvivalRun(createSurvivalRun("physical-check",{policyVersion:3,climateVolatility:"harsh"}),1).state,a=s.agents[0],p=a.physicalMind.projects[0];
    a.physicalMind.learningEnabled=enabled;p.partIds=["part-1"];p.cursor=2;
    const reading={id:"reading-1",tick:1,observerId:a.id,source:"test",partId:"part-1",material:"wood",position:a.position,size:{x:2,y:2,z:0.25},rotation:0,mass:0.65,condition:1,metric:"protection",before:0,after:0,dose:1,temperature:4,weather:"clear",confidence:0.9,summary:"No measurable effect."};
    completePhysicalOperation(a,{kind:"test",partId:"part-1",measure:"protection",dose:1},true,"part-1",1,0.6);learnPhysicalReading(a,reading);
    assert.equal(p.status,"interrupted");assert.equal(p.failures,1);assert.equal(a.physicalMind.estimates.length,enabled?1:0);
    p.status="active";p.target=0.1;learnPhysicalReading(a,{...reading,id:"reading-2",after:0.2});
    if(enabled){const procedure=a.physicalMind.procedures[0];assert.ok(procedure);const moved=procedureForObservation(procedure,{x:procedure.origin.x+20,z:procedure.origin.z-10});const oldPlace=p.operations.find(o=>o.kind==="place"),newPlace=moved.find(o=>o.kind==="place");assert.ok(Math.abs(newPlace.position.x-oldPlace.position.x-20)<1e-8);assert.ok(Math.abs(newPlace.position.z-oldPlace.position.z+10)<1e-8);}
  }
});

test("stepped, batched and restored physical studies agree, including succession options",()=>{
  const start=createSurvivalRun("physical-replay",{policyVersion:3,continuity:true,agentCount:5});
  const batch=advanceSurvivalRun(start,72).state;let steps=start;for(let i=0;i<72;i++)steps=advanceSurvivalRun(steps).state;
  assert.deepEqual(batch,steps);assert.equal(validateSurvivalRun(batch),true);
  assert.deepEqual(advanceSurvivalRun(restoreSurvivalRun(serializeSurvivalRun(batch)),8),advanceSurvivalRun(batch,8));
  const paused=setSurvivalRunPaused(batch,true);assert.equal(advanceSurvivalRun(paused,100).stepsProcessed,0);
  assert.equal(addObserverAgent(paused).ok,false);
});

test("multi-day agents voluntarily attempt, measure, revise and name themselves",()=>{
  const start=createSurvivalRun("physical-check",{policyVersion:3,climateVolatility:"harsh"});
  const {state,events}=advanceSurvivalRun(start,432);assert.equal(validateSurvivalRun(state),true);
  assert.ok(state.physical.parts.length>0);assert.ok(state.physical.tests>0);
  assert.ok(events.some(e=>e.facts.operation==="place"));assert.ok(events.some(e=>e.facts.success===false));
  assert.ok(state.agents.some(a=>a.physicalMind.projects.some(p=>p.status==="abandoned")));
  assert.ok(state.agents.every(a=>a.physicalMind.namedAt!==null));assert.equal(state.succession,undefined);
  assert.ok(state.agents.every(a=>a.technologies.length===0));
});

test("physical validation rejects malformed actions, material, bindings and private evidence",()=>{
  const valid=fixture();shape(valid);assert.equal(validateSurvivalRun(valid),true);
  for(const mutate of [s=>s.physical.parts[0].composition.wood=-1,s=>s.physical.parts.push(structuredClone(s.physical.parts[0])),s=>s.physical.parts[0].position.y=-1,s=>s.physical.parts[0].size.x=100,s=>s.agents[0].physicalMind.projects=[{operations:[{kind:"delete-world"}]}],s=>s.agents[0].technologies.push("controlled_fire")]){const s=structuredClone(valid);mutate(s);assert.equal(validateSurvivalRun(s),false);}
  assert.equal(validManipulation({kind:"test",partId:"part-1",measure:"magic",dose:1}),false);
  assert.equal(validManipulation({kind:"join",a:"part-1",b:"part-1",fiber:1}),false);
});

test("navigation steers around solid components; water is traversable but not dry walkable ground",()=>{
  const s=fixture();shape(s);const p=s.physical.parts[0];p.position={x:62,y:0.5,z:60};
  assert.equal(physicalWalkable(s.environment,s.physical,{x:62,z:60}),false);
  const next=physicalNextPosition(s.environment,s.physical,{x:60,z:60},{x:66,z:60});assert.ok(next);assert.notEqual(next.z,60);
  const pond=s.environment.resources.find(r=>r.kind==="freshwater");assert.equal(physicalWalkable(s.environment,s.physical,pond.position),false);
  assert.equal(physicalTraversable(s.environment,s.physical,pond.position),true);
});

function crossingFixture(policyVersion=3){
  const s=createSurvivalRun("water-crossing",{policyVersion,agentCount:1,climateVolatility:"stable"});
  const pond=s.environment.resources.find(r=>r.kind==="freshwater");
  pond.position={x:0,z:0};pond.capacity=55;pond.quantity=55;s.environment.resources=[pond];
  const a=s.agents[0];a.position={x:-8,z:0};a.needs={health:95,hydration:95,nutrition:95,energy:95,warmth:95,safety:95};
  a.observations=[];const destination={x:8,z:0};
  a.currentPlan={id:"plan-1",formedAt:0,goal:"explore",targetId:null,targetPosition:destination,status:"active",rationale:"Cross to a selected exploration destination.",activeStepIndex:0,steps:[{id:"step-1",action:"move",targetId:null,destination,remainingSteps:1,status:"pending"}]};
  s.nextIds.plan=2;s.nextIds.decision=2;s.stats.decisions=1;s.nextIds.step=2;s.stats.planSteps=1;
  return s;
}

test("rotated water depth and movement distinguish walking, wading and swimming",()=>{
  const f={position:{x:4,z:6},radiusX:9,radiusZ:2,rotation:Math.PI/4};
  assert.equal(locomotionAt([f],f.position),"swim");
  const nearEdge={x:4+Math.cos(f.rotation)*8.5,z:6-Math.sin(f.rotation)*8.5};
  assert.equal(locomotionAt([f],nearEdge),"wade");
  assert.equal(waterDepth(f,{x:20,z:20}),0);
  const s=crossingFixture(),water=freshwaterFeatures(s.environment);
  const dry=physicalNextPosition(s.environment,s.physical,{x:-20,z:15},{x:20,z:15});
  assert.ok(Math.abs(dry.x+12.5)<1e-8);
  const swim=physicalNextPosition(s.environment,s.physical,{x:0,z:0},{x:8,z:0});
  assert.ok(swim.x>2.7&&swim.x<3);
  const travel=estimateWaterTravel(water,{x:-8,z:0},{x:8,z:0},8);
  assert.ok(travel.duration>16/7.5);assert.ok(travel.energy>0);assert.ok(travel.warmth>0);
  assert.equal(physicalTraversable(s.environment,s.physical,{x:s.environment.bounds.maxX+1,z:0}),false);
});

test("both active policies cross freshwater with costs, shore outcomes and resumable checkpoints",()=>{
  for(const version of [2,3]){
    let s=crossingFixture(version);assert.equal(validateSurvivalRun(s),true);
    const initial=structuredClone(s),events=[];let swimming=false,wading=false;
    for(let i=0;i<12&&s.agents[0].currentPlan.status==="active";i++){
      const result=advanceSurvivalRun(s);s=result.state;events.push(...result.events);
      const mode=locomotionAt(freshwaterFeatures(s.environment),s.agents[0].position);
      swimming ||= mode==="swim";wading ||= mode==="wade";
      assert.equal(validateSurvivalRun(s),true);
      const restored=restoreSurvivalRun(serializeSurvivalRun(s));
      assert.deepEqual(advanceSurvivalRun(restored),advanceSurvivalRun(s));
      assert.equal(advanceSurvivalRun(setSurvivalRunPaused(s,true),20).stepsProcessed,0);
    }
    assert.ok(swimming&&wading);assert.ok(s.agents[0].position.x>5.5);
    assert.equal(s.agents[0].currentPlan.status,"complete");
    assert.deepEqual(s.agents[0].inventory,initial.agents[0].inventory);
    assert.ok(s.agents[0].needs.energy<initial.agents[0].needs.energy);
    assert.ok(events.some(e=>e.summary.includes("entered freshwater")));
    assert.ok(events.some(e=>e.summary.includes("reached dry ground")));
    assert.ok(!events.some(e=>e.facts.action==="drink"||e.facts.action==="collect"));
    assert.deepEqual(initial,crossingFixture(version));
  }
});

test("private water observations inform routes without exposing unseen ponds",()=>{
  const s=advanceSurvivalRun(crossingFixture(),1).state,a=s.agents[0];
  const privateInput={agent:structuredClone(a),tick:s.tick,seed:s.seed,bounds:s.environment.bounds,physical:true};
  assert.ok(observedWater(a.observations).length>0);
  const first=planFromPrivateKnowledge(privateInput);
  s.environment.resources[0].position={x:70,z:70};
  assert.deepEqual(planFromPrivateKnowledge(privateInput),first);
  const unaware=structuredClone(privateInput);unaware.agent.observations=[];
  assert.equal(observedWater(unaware.agent.observations).length,0);
  assert.ok(first.some(c=>c.candidate.summary.includes("water")));
});

test("an exhausted swimmer chooses an observed bank instead of recovering underwater",()=>{
  let s=crossingFixture();s.agents[0].position={x:0,z:0};s.agents[0].needs.energy=15;
  s=advanceSurvivalRun(s).state;
  assert.equal(s.agents[0].currentPlan.goal,"seek_safety");
  assert.equal(s.agents[0].currentPlan.steps[0].action,"move");
  assert.equal(depthAt(freshwaterFeatures(s.environment),s.agents[0].currentPlan.steps[0].destination),0);
  for(let i=0;i<7&&depthAt(freshwaterFeatures(s.environment),s.agents[0].position)>0;i++)s=advanceSurvivalRun(s).state;
  assert.equal(s.agents[0].alive,true);
  assert.equal(depthAt(freshwaterFeatures(s.environment),s.agents[0].position),0);
});

test("the instanced renderer uses exact physical dimensions and releases removed geometry",()=>{
  const s=fixture();shape(s);const p=s.physical.parts[0],copy=structuredClone(s.physical),collection=createPhysicalCollection();collection.sync(s.physical);
  const mesh=collection.group.getObjectByName("wood"),matrix=new THREE.Matrix4(),position=new THREE.Vector3(),scale=new THREE.Vector3();mesh.getMatrixAt(0,matrix);matrix.decompose(position,new THREE.Quaternion(),scale);
  assert.deepEqual(scale.toArray(),[p.size.x,p.size.y,p.size.z]);assert.ok(Math.abs(position.y-(p.position.y+1.5))<1e-6);assert.equal(mesh.count,1);
  assert.deepEqual(s.physical,copy);collection.sync();assert.equal(mesh.count,0);collection.dispose();
});
