import assert from "node:assert/strict";
import test from "node:test";
import { createSurvivalRun, advanceSurvivalRun, restoreSurvivalRun, serializeSurvivalRun, validateSurvivalRun, addObserverAgent, setSurvivalRunPaused } from "../app/simulation/survival/engine.ts";
import { executeManipulation, protectionAt, settleAssemblies, properties, agePhysicalWorld } from "../app/simulation/survival/physical-world.ts";
import { planPhysicalKnowledge, preparePhysicalProjects, learnPhysicalReading, completePhysicalOperation, procedureForObservation } from "../app/simulation/survival/physical-policy.ts";
import { validManipulation } from "../app/simulation/survival/physical-validation.ts";
import { physicalNextPosition, physicalWalkable } from "../app/simulation/survival/physical-navigation.ts";
import { createPhysicalCollection } from "../app/survival/scene/physical-models.ts";
import * as THREE from "three";

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
    assert.equal(p.status,"abandoned");assert.equal(a.physicalMind.estimates.length,enabled?1:0);
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

test("navigation cannot cross solid components or water and produces an explicit alternative",()=>{
  const s=fixture();shape(s);const p=s.physical.parts[0];p.position={x:62,y:0.5,z:60};
  assert.equal(physicalWalkable(s.environment,s.physical,{x:62,z:60}),false);
  const next=physicalNextPosition(s.environment,s.physical,{x:60,z:60},{x:66,z:60});assert.ok(next);assert.notEqual(next.z,60);
  const pond=s.environment.resources.find(r=>r.kind==="freshwater");assert.equal(physicalWalkable(s.environment,s.physical,pond.position),false);
});

test("the instanced renderer uses exact physical dimensions and releases removed geometry",()=>{
  const s=fixture();shape(s);const p=s.physical.parts[0],copy=structuredClone(s.physical),collection=createPhysicalCollection();collection.sync(s.physical);
  const mesh=collection.group.getObjectByName("wood"),matrix=new THREE.Matrix4(),position=new THREE.Vector3(),scale=new THREE.Vector3();mesh.getMatrixAt(0,matrix);matrix.decompose(position,new THREE.Quaternion(),scale);
  assert.deepEqual(scale.toArray(),[p.size.x,p.size.y,p.size.z]);assert.ok(Math.abs(position.y-(p.position.y+1.5))<1e-6);assert.equal(mesh.count,1);
  assert.deepEqual(s.physical,copy);collection.sync();assert.equal(mesh.count,0);collection.dispose();
});
