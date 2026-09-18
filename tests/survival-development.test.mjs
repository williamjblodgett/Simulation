import assert from "node:assert/strict";
import test from "node:test";
import "fake-indexeddb/auto";
import * as THREE from "three";
import { commitCheckpoint, loadCheckpoint, recoverLastGoodCheckpoint, exportRunArchive } from "../app/survival/survival-persistence.ts";
import { createDevelopmentCollection } from "../app/survival/scene/development-models.ts";
import { advanceSurvivalRun, createSurvivalRun, enableDevelopment, restoreSurvivalRun, serializeSurvivalRun, validateSurvivalRun } from "../app/simulation/survival/engine.ts";
import { executeDevelopment, advanceDevelopment, capacity, developmentWorkFactor } from "../app/simulation/survival/development-world.ts";
import { attachDevelopmentView, freshDevelopmentMind, learnDevelopment, planDevelopment, predictDevelopment, shareDevelopmentProcedure } from "../app/simulation/survival/development-policy.ts";
import { validateDevelopment } from "../app/simulation/survival/development-validation.ts";
import { discoveryInput } from "../app/simulation/survival/discovery-boundary.ts";
import { attachPrivateMaterialView } from "../app/simulation/survival/material-policy.ts";
import { executeMaterialOperation } from "../app/simulation/survival/material-world.ts";
import { DEVELOPMENT_LIMITS } from "../app/simulation/survival/development-types.ts";
import { depthAt, freshwaterFeatures, freshwaterFootprint, shorePoints } from "../app/simulation/survival/water.ts";
import { physicalNextPosition } from "../app/simulation/survival/physical-navigation.ts";
import { executeManipulation } from "../app/simulation/survival/physical-world.ts";

const options = { policyVersion:4, materialFoundation:"geology-v1", knowledgeFoundation:"materials-v1", affectModel:"adaptive-v1", developmentModel:"open-workshop-v1", agentCount:1, durationHours:null };
function fixture(seed="development-unit") {
  const state=createSurvivalRun(seed,options),agent=state.agents[0],bounds=state.environment.bounds;
  let origin;
  for(let x=bounds.minX+8;x<bounds.maxX-8&&!origin;x+=8)for(let z=bounds.minZ+8;z<bounds.maxZ-8;z+=8)if([-4,0,4].every(dx=>[-4,0,4].every(dz=>!depthAt(freshwaterFeatures(state.environment),{x:x+dx,z:z+dz})))){origin={x,z};break;}
  assert.ok(origin);
  agent.position={...origin};
  // Isolated executor fixtures have explicit supplies. The natural engine test
  // below does not inject supplies, goals, memories, hypotheses or programs.
  agent.needs={health:100,hydration:95,nutrition:95,energy:100,warmth:95,safety:95};
  Object.assign(agent.inventory,{wood:40,fiber:20,clay:20,freshwater:12,food:12});
  return {state,agent,origin};
}
function perform(f,op){const result=executeDevelopment(f.state,f.agent,op);assert.equal(result.accepted,true,result.summary);return result;}
function form(f,kind,x=2,z=0,material="wood",batchIds=[],size=1.25){
  const position={x:f.origin.x+x,z:f.origin.z+z};
  f.agent.position={x:position.x-1.8,z:position.z};
  const result=perform(f,{kind:"form",form:kind,material,size,thickness:.18,orientation:0,position,batchIds});
  return f.state.development.components.find(c=>c.id===result.componentId);
}
function bind(f,from,to,port="mechanical",metalBatchId){f.agent.position={x:(from.position.x+to.position.x)/2,z:(from.position.z+to.position.z)/2};return perform(f,{kind:"connect",from:from.id,to:to.id,port,...(metalBatchId?{metalBatchId}:{})});}
function privateView(f){const input=attachPrivateMaterialView(discoveryInput(f.agent,f.state.tick,f.state.environment.bounds),f.agent,f.state.materials);attachDevelopmentView(input,f.agent,f.state.config.discoveryObjective);return input;}
function tickWorld(f,ticks){for(let i=0;i<ticks;i++){f.state.tick++;f.state.elapsedMinutes=f.state.tick*10;f.state.day=Math.floor(f.state.elapsedMinutes/1440)+1;f.state.timeOfDay=f.state.elapsedMinutes%1440;advanceDevelopment(f.state);}}
function smelt(f){
  const site=f.state.environment.resources.find(s=>s.feedstock==="iron_ore");site.quantity-=1.5;f.agent.inventory.stone+=1.5;f.agent.rawFeedstocks.iron_ore=(f.agent.rawFeedstocks.iron_ore??0)+1.5;
  f.agent.materialSamples??={};f.agent.materialSamples.stone={sourceId:site.id,sampledAt:f.state.tick,contamination:null,activity:null};
  f.agent.inventory.wood+=6;f.agent.inventory.clay+=1.2;f.agent.needs.energy=100;
  const run=op=>{const r=executeMaterialOperation(f.state.materials,f.agent,op,f.state.environment,f.state.tick);assert.ok(r.accepted,r.summary);return f.state.materials.batches.filter(b=>r.outputIds.includes(b.id));};
  const charcoal=()=>run({kind:"prepare_charcoal",wood:2,cover:.72,duration:6}).find(b=>b.kind==="charcoal");
  const c=charcoal(),ore=run({kind:"concentrate_ore",sourceId:site.id,mass:1.5,separation:.62,duration:5}).find(b=>b.kind==="concentrate");
  const hearth=run({kind:"form_hearth",clay:1.2,charcoalId:c.id,wallThickness:.24,duration:8}).find(b=>b.kind==="hearth"),fuel=charcoal();
  const bloom=run({kind:"reduce_ore",concentrateId:ore.id,charcoalId:fuel.id,hearthId:hearth.id,airflow:.7,duration:9}).find(b=>b.kind==="bloom");
  assert.ok(bloom);return bloom;
}

test("versioned development is opt-in at the engine boundary; enabling preserves every life and supply",()=>{
  const old=createSurvivalRun("preserved",{...options,developmentModel:undefined});const before=structuredClone(old);
  assert.equal(old.schemaVersion,7);assert.equal(old.development,undefined);
  const enabled=enableDevelopment(old);assert.deepEqual(old,before);assert.equal(enabled.state.schemaVersion,8);
  assert.equal(enabled.events.length,1);assert.equal(enabled.state.tick,old.tick);
  assert.deepEqual(enabled.state.agents.map(a=>a.inventory),old.agents.map(a=>a.inventory));
  assert.equal(enabled.state.config.discoveryObjective,false);assert.equal(validateSurvivalRun(enabled.state),true);
  assert.deepEqual(restoreSurvivalRun(serializeSurvivalRun(enabled.state)),enabled.state);
  assert.deepEqual(enableDevelopment(enabled.state).events,[]);
  const corrupt=structuredClone(enabled.state);corrupt.development.version=2;assert.equal(validateSurvivalRun(corrupt),false);
  assert.throws(()=>createSurvivalRun("bad",{discoveryObjective:true}),/workshop/);
});

test("invalid components and transfers are atomic; dead actors and overlapping bodies cannot fabricate",()=>{
  const f=fixture();const operation={kind:"form",form:"vessel",material:"clay",size:1.25,thickness:.18,orientation:0,position:{...f.agent.position},batchIds:[]};
  const before=structuredClone(f.state);assert.equal(executeDevelopment(f.state,f.agent,operation).accepted,false);assert.deepEqual(f.state,before);
  const c=form(f,"vessel",2,0,"clay");const snapshot=structuredClone(f.state);
  assert.equal(executeDevelopment(f.state,f.agent,{kind:"transfer",componentId:c.id,resource:"freshwater",amount:9,direction:"withdraw"}).accepted,false);assert.deepEqual(f.state,snapshot);
  f.agent.alive=false;assert.equal(executeDevelopment(f.state,f.agent,{kind:"test",componentId:c.id,dose:.5}).accepted,false);
});

test("retention trials consume actual water and distinguish capacity overflow from leakage",()=>{
  const f=fixture(),c=form(f,"vessel",2,0,"clay"),water=f.agent.inventory.freshwater;
  const first=perform(f,{kind:"test",componentId:c.id,dose:.5});assert.ok(first.evidence);assert.equal(f.agent.inventory.freshwater,water-.5);
  assert.ok(c.water<.5&&c.water>0);assert.ok(Math.abs(c.water+f.state.development.water.leaked-.5)<1e-6);
  const retained=first.value;perform(f,{kind:"treat",componentId:c.id,fuel:2,temperature:900});
  const second=perform(f,{kind:"test",componentId:c.id,dose:.5});assert.ok(second.value>retained);
  const before=structuredClone(f.state);assert.equal(executeDevelopment(f.state,f.agent,{kind:"test",componentId:c.id,dose:2}).accepted,false);assert.deepEqual(f.state,before);
  perform(f,{kind:"transfer",componentId:c.id,resource:"freshwater",amount:.2,direction:"withdraw"});
  assert.equal(validateDevelopment(f.state),true);assert.equal(validateSurvivalRun(f.state),true);
});

test("cultivation pays seed food, water and modeled time and yields withdrawable actual food",()=>{
  const f=fixture(),bed=form(f,"bed");const food=f.agent.inventory.food;
  tickWorld(f,10);assert.equal(bed.food,0);
  perform(f,{kind:"plant",componentId:bed.id,seeds:.1});assert.equal(f.agent.inventory.food,food-.1);
  tickWorld(f,10);assert.equal(bed.food,0);
  perform(f,{kind:"transfer",componentId:bed.id,resource:"freshwater",amount:1,direction:"deposit"});
  f.state.environment.daylight=1;tickWorld(f,90);assert.ok(bed.food>.1);assert.ok(bed.water<1);
  perform(f,{kind:"transfer",componentId:bed.id,resource:"food",amount:.1,direction:"withdraw"});
  assert.equal(validateDevelopment(f.state),true);assert.ok(f.state.development.food.grown>0);
});

test("wind work is functional, wear and energy losses are accounted, fanout cannot multiply energy",()=>{
  const f=fixture(),rotor=form(f,"rotor",0,0),shaft=form(f,"shaft",2,0),second=form(f,"shaft",0,2);
  bind(f,rotor,shaft);bind(f,rotor,second);tickWorld(f,20);
  assert.ok(shaft.output>0&&second.output>0);assert.ok(developmentWorkFactor(f.state,shaft.position)>1);
  const e=f.state.development.energy;assert.ok(e.wind>e.delivered);assert.ok(Math.abs(e.wind-e.delivered-e.lost)<1e-8);
  assert.equal(validateDevelopment(f.state),true);
  rotor.condition=0;tickWorld(f,1);assert.equal(shaft.output,0);assert.equal(second.output,0);
});

test("metal must be physically processed, can only be installed once, and supports an electrical storage network",()=>{
  const f=fixture(),rotor=form(f,"rotor",0,0);f.agent.position={x:f.origin.x+.5,z:f.origin.z};
  const metal=smelt(f),coil=form(f,"coil",2,0,"metal",[metal.id],.6);
  f.agent.position={x:f.origin.x+.5,z:f.origin.z};const storageMetal=smelt(f),cell=form(f,"cell",2,2,"metal",[storageMetal.id],.6);
  bind(f,rotor,coil);
  f.agent.position={x:f.origin.x+2,z:f.origin.z+1};const wire=smelt(f);bind(f,coil,cell,"electric",wire.id);
  const before=structuredClone(f.state);assert.equal(executeDevelopment(f.state,f.agent,{kind:"form",form:"coil",material:"metal",size:.6,thickness:.18,orientation:0,position:{x:f.origin.x+4,z:f.origin.z+1},batchIds:[metal.id]}).accepted,false);assert.deepEqual(f.state,before);
  tickWorld(f,40);assert.ok(cell.charge>0);assert.ok(cell.charge<=capacity(cell));assert.ok(f.state.development.energy.lost>0);
  assert.equal(validateSurvivalRun(f.state),true);
  const forged=structuredClone(f.state);forged.development.components[1].batchIds.push(wire.id);assert.equal(validateSurvivalRun(forged),false);
});

test("mixed-port energy cycles are rejected before any debit",()=>{
  const f=fixture();const coil1=form(f,"coil",0,0,"metal",[smelt(f).id],.6);
  f.agent.position={x:f.origin.x+.5,z:f.origin.z};const coil2=form(f,"coil",2,0,"metal",[smelt(f).id],.6);
  bind(f,coil1,coil2);f.agent.position={x:f.origin.x+1,z:f.origin.z};const wire=smelt(f),before=structuredClone(f.state);
  assert.equal(executeDevelopment(f.state,f.agent,{kind:"connect",from:coil2.id,to:coil1.id,port:"electric",metalBatchId:wire.id}).accepted,false);assert.deepEqual(f.state,before);
});

test("powered pumps use observed-bank geometry and deplete the actual freshwater source",()=>{
  const f=fixture(),site=f.state.environment.resources.find(s=>s.kind==="freshwater"&&!s.contaminated);
  const bank=shorePoints(freshwaterFootprint(site)).find(p=>[-1.8,0,1.2,3].every(x=>[0,2].every(z=>!depthAt(freshwaterFeatures(f.state.environment),{x:p.x+x,z:p.z+z}))));assert.ok(bank);
  f.origin={...bank};const piston=form(f,"piston",0,0),rotor=form(f,"rotor",3,0),vessel=form(f,"vessel",3,2,"clay");
  bind(f,rotor,piston);bind(f,piston,vessel,"water");const start=site.quantity;tickWorld(f,8);
  assert.ok(site.quantity<start);assert.ok(vessel.water>0);assert.equal(validateDevelopment(f.state),true);
});

test("raw reclamation has explicit remnants and never grants a free duplicate",()=>{
  const f=fixture(),wood=f.agent.inventory.wood,c=form(f,"panel"),paid=wood-f.agent.inventory.wood;
  perform(f,{kind:"reclaim",componentId:c.id});assert.ok(Math.abs(f.agent.inventory.wood-(wood-paid*.2))<1e-6);
  assert.equal(f.state.development.components.length,0);assert.equal(executeDevelopment(f.state,f.agent,{kind:"reclaim",componentId:c.id}).accepted,false);
  assert.equal(validateSurvivalRun(f.state),true);
});

test("both walking and old physical fabrication respect the new component footprint",()=>{
  const f=fixture(),c=form(f,"panel");
  const extra={position:c.position,width:c.size*.7,depth:c.size*.7,rotation:0};
  const start={x:c.position.x-1,z:c.position.z},target={x:c.position.x+1,z:c.position.z};
  assert.equal(physicalNextPosition(f.state.environment,f.state.physical,start,target,{strict:true,additionalColliders:[extra]}),null);
  f.agent.position={x:c.position.x-2,z:c.position.z};
  const shaped=executeManipulation(f.state.physical,f.agent,{kind:"shape",material:"wood",mass:.65,size:{x:1,y:1,z:1}},f.state.environment,0,[f.agent.position],true);
  assert.ok(shaped.ok);
  const result=executeManipulation(f.state.physical,f.agent,{kind:"place",partId:shaped.partId,position:{...c.position,y:.5},rotation:0},f.state.environment,0,[f.agent.position],true,[{position:{...c.position,y:c.size/2},size:{x:c.size*.7,y:c.size,z:c.size*.7},rotation:0}]);
  assert.equal(result.ok,false);
});

test("hidden world coefficients, seed and other private memory never reach the policy",()=>{
  const f=fixture();f.agent.memory=Array.from({length:5},(_,i)=>({id:`m-${i}`,recordedAt:0,action:"collect",result:"helpful",utility:1,summary:"Collected water.",targetId:null}));
  const first=privateView(f);f.state.seed=123;f.state.development.secret=100;f.agent.developmentMind.hiddenWorld={efficiency:999};
  const second=privateView(f);assert.deepEqual(second,first);assert.equal(second.agent.developmentMind.hiddenWorld,undefined);
  const one=planDevelopment(first,[]),two=planDevelopment(second,[]);assert.deepEqual(two,one);assert.ok(one);
  assert.equal(first.agent.developmentMind.goals[0].metric,"water_access");assert.ok(first.agent.developmentMind.decision.candidates.length>=2);
});

test("learned contextual measurements alter predictions; frozen parameters retain the old expectation",()=>{
  const f=fixture(),c=form(f,"vessel",2,0,"clay"),part={form:"vessel",material:"clay",size:c.size,thickness:c.thickness,orientation:0};
  const before=predictDevelopment(f.agent.developmentMind,part),frozen=structuredClone(f.agent.developmentMind);
  const op={kind:"test",componentId:c.id,dose:.5},r=perform(f,op);learnDevelopment(f.agent,op,r,0);learnDevelopment(f.agent,op,r,0);
  assert.equal(f.agent.developmentMind.models[0].samples,1,"repeated reporting cannot double-count the same intervention");
  assert.ok(predictDevelopment(f.agent.developmentMind,part).value>before.value);assert.deepEqual(predictDevelopment(frozen,part),before);
  const otherSize={...part,size:2.5};assert.deepEqual(predictDevelopment(f.agent.developmentMind,otherSize),before);
});

test("urgent needs preempt optional work; already adequate conditions do not force an invention",()=>{
  const f=fixture();assert.equal(planDevelopment(privateView(f),[]),null);assert.equal(f.agent.developmentMind.goals.length,0);
  f.agent.memory=Array.from({length:5},(_,i)=>({id:`m-${i}`,recordedAt:0,action:"collect",result:"helpful",utility:1,summary:"Collected water.",targetId:null}));
  let input=privateView(f);const choice=planDevelopment(input,[]);assert.ok(choice);f.agent.developmentMind=input.agent.developmentMind;
  const progress=structuredClone(f.agent.developmentMind.active);f.agent.needs.hydration=10;input=privateView(f);
  assert.equal(planDevelopment(input,[]),null);assert.deepEqual(input.agent.developmentMind.active,progress);assert.ok(input.agent.developmentMind.goals.some(g=>g.status==="deferred"));
  assert.ok(input.agent.developmentMind.expansions<=DEVELOPMENT_LIMITS.expansions);
});

test("schema-eight storage fences legacy backups without silently adopting new world behavior",async()=>{
  const old=createSurvivalRun("workshop-backup-3",{policyVersion:3,agentCount:1});
  const envelope=(world,revision,runInstanceId)=>({world,revision,runInstanceId,speed:1,savedAt:0,missingBefore:0});
  assert.equal(await commitCheckpoint(envelope(old,1,"old-workshop-fixture"),old.events,null),true);
  const modern=createSurvivalRun("workshop-current",options),next=envelope(modern,2,"current-workshop-fixture");
  assert.equal(await commitCheckpoint(next,modern.events,1),true);assert.deepEqual(await loadCheckpoint(),next);
  assert.equal(await commitCheckpoint({...next,revision:3},[],1),false);
  const backup=await loadCheckpoint("last-good");assert.equal(backup.world.schemaVersion,8);assert.equal(backup.world.policyVersion,3);assert.equal(backup.world.development,undefined);assert.deepEqual(backup.world.agents,old.agents);
  assert.equal(validateSurvivalRun(backup.world),true);assert.ok(JSON.parse(await exportRunArchive(next)).events.length);
  const recovered=await recoverLastGoodCheckpoint();assert.equal(recovered.world.schemaVersion,8);assert.equal(recovered.world.policyVersion,3);
  assert.equal(advanceSurvivalRun(recovered.world,1).state.development,undefined);
});

test("the separately chosen discovery objective reaches the common planner and obeys its daily budget",()=>{
  const f=fixture();
  f.agent.memory=Array.from({length:5},(_,i)=>({id:`budget-memory-${i}`,recordedAt:0,action:"collect",result:"helpful",utility:1,summary:"Collected water.",targetId:null}));
  // Isolated choice/budget fixture: previous poor retention makes the uncertain
  // mechanical alternative relevant. This is not a natural discovery demo.
  f.agent.developmentMind.models.push({key:"vessel:clay:1:2:raw",mean:.1,m2:.01,samples:4,evidenceIds:["budget-prior-trial"]});
  const initial=privateView(f);assert.ok(planDevelopment(initial,[]));
  const best=initial.agent.developmentMind.decision.candidates.filter(c=>!c.rejection).sort((a,b)=>b.score-a.score)[0];
  assert.ok(best.informationValue>1);
  const ordinary=[{candidate:{score:best.score+.75}}];
  const survivalOnly=privateView(f);assert.equal(planDevelopment(survivalOnly,ordinary),null);
  f.state.config.discoveryObjective=true;
  const discovery=privateView(f),choice=planDevelopment(discovery,ordinary);assert.ok(choice);
  assert.equal(discovery.agent.developmentMind.active.additionalMotivation,true);
  assert.ok(choice.candidate.score>=ordinary[0].candidate.score+.5,"the common planner sees the explicit additional objective, not only the losing base score");
  assert.match(choice.candidate.summary,/explicit discovery objective/);
  const active=structuredClone(discovery.agent.developmentMind.active);
  discovery.agent.developmentMind.experimentalEffort=DEVELOPMENT_LIMITS.dailyExperimentEffort;
  assert.equal(planDevelopment(discovery,ordinary),null);assert.deepEqual(discovery.agent.developmentMind.active,active);
  discovery.tick=144;
  assert.ok(planDevelopment(discovery,ordinary));assert.equal(discovery.agent.developmentMind.experimentalEffort,0);
});

test("realized components are selectable instanced geometry and removed content is cleared",()=>{
  const f=fixture(),part=form(f,"panel"),collection=createDevelopmentCollection();
  collection.sync(f.state.development,0,part.id);collection.group.updateMatrixWorld(true);
  assert.equal(collection.group.children.length,4);assert.ok(collection.group.children.some(m=>m.count>0));
  const ray=new THREE.Raycaster(new THREE.Vector3(part.position.x,10,part.position.z),new THREE.Vector3(0,-1,0));
  assert.equal(collection.raycast(ray),part.id);
  collection.sync(undefined,0);assert.ok(collection.group.children.every(m=>m.count===0));assert.equal(collection.raycast(ray),null);collection.dispose();
});

test("a frozen development learner retains real failures but cannot update its parameters",()=>{
  const f=fixture(),c=form(f,"vessel",2,0,"clay");f.agent.discovery.mode="frozen";
  const op={kind:"test",componentId:c.id,dose:.5},r=perform(f,op);learnDevelopment(f.agent,op,r,0);
  assert.equal(f.agent.developmentMind.models.length,0);assert.equal(f.agent.developmentMind.procedures.length,0);assert.equal(f.agent.developmentMind.evidence.length,1);
  assert.equal(f.state.development.metrics.tests,1);assert.ok(f.state.development.water.leaked>0);
});

test("documented procedures require an actual surface and reading is testimony, not a personal trial",()=>{
  const f=fixture(),record=form(f,"record",2,0,"clay");
  // Explicit isolated procedure fixture, not an autonomous progression demo.
  const proof={id:"document-unit-proof",authorId:f.agent.id,learnedAt:0,metric:"water_access",parts:[{form:"vessel",material:"clay",size:1.25,thickness:.18,orientation:0}],links:[],finishing:[],evidenceIds:["document-original-reading"],successes:1,failures:0,expected:.6,uncertainty:.6,duration:4,conditions:"Single isolated unit-test trial"};
  f.agent.developmentMind.procedures.push(proof);perform(f,{kind:"document",componentId:record.id,procedureId:proof.id});assert.deepEqual(record.document,proof);
  f.agent.developmentMind=freshDevelopmentMind();perform(f,{kind:"read",componentId:record.id});perform(f,{kind:"read",componentId:record.id});
  assert.equal(f.agent.developmentMind.procedures.length,1);assert.deepEqual(f.agent.developmentMind.procedures[0].evidenceIds,proof.evidenceIds);assert.equal(f.agent.developmentMind.models.length,0);assert.equal(f.agent.developmentMind.evidence.length,0);
  const corrupt=structuredClone(f.state);delete corrupt.development.energy.wind;assert.equal(validateDevelopment(corrupt),false);
});

test("a natural 72-hour run identifies problems, tests real arrangements and survives without a supplied answer",()=>{
  let state=createSurvivalRun("workshop-regression-1",options);const events=[];
  for(let i=0;i<432;i++){const step=advanceSurvivalRun(state,1);state=step.state;events.push(...step.events);if(i%36===0)assert.equal(validateSurvivalRun(state),true,`tick ${state.tick}`);}
  assert.equal(state.tick,432);assert.equal(state.status,"running");assert.equal(state.agents[0].alive,true);
  const mind=state.agents[0].developmentMind;assert.ok(mind.goals.some(g=>g.evidenceIds.length));assert.ok(mind.evidence.length>0);assert.ok(mind.models.length>0);assert.ok(mind.procedures.length>0);
  const measured=events.find(e=>e.facts.operation==="development"&&e.facts.measurement);assert.ok(measured.facts.preActionPrediction);assert.ok(measured.facts.evidenceId);
  assert.deepEqual(restoreSurvivalRun(serializeSurvivalRun(state)),state);
  assert.deepEqual(advanceSurvivalRun(state,10).state,advanceSurvivalRun(restoreSurvivalRun(serializeSurvivalRun(state)),10).state);
  // Testimony transfer is isolated from the natural demonstration above.
  const recipient=structuredClone(state.agents[0]);recipient.id="isolated-recipient";recipient.developmentMind=freshDevelopmentMind();
  assert.equal(shareDevelopmentProcedure(state.agents[0],recipient,state.tick),true);assert.equal(recipient.developmentMind.models.length,0);
  assert.ok(recipient.developmentMind.evidence.every(e=>e.source==="testimony"));const references=recipient.developmentMind.evidence.map(e=>e.originalId);
  shareDevelopmentProcedure(state.agents[0],recipient,state.tick);assert.equal(new Set(recipient.developmentMind.evidence.map(e=>e.originalId)).size,recipient.developmentMind.evidence.length);assert.ok(references.every(id=>recipient.developmentMind.seenEvidence.includes(id)));
});
