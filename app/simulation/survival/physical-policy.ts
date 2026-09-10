import { driftNeeds } from "./physiology";
import { planFromPrivateKnowledge, survivalPotential, type LocalPlanChoice, type PrivatePolicyInput } from "./planner";
import { survivalUnit } from "./random";
import { depthAt, estimateWaterTravel, observedWater } from "./water";
import type { LearnedProcedure, Manipulation, MaterialKind, PhysicalProject, PhysicalReading, Vec3 } from "./physical-types";
import type { SurvivalAgent } from "./types";
import { findObservedPose, observedParts } from "./physical-spatial";

// The policy deliberately does not import physical-world or MATERIALS. It cannot run the true solver.
export const PHYSICAL_SEARCH_BUDGET = { candidates: 24, horizon: 72, maxProjects: 8, maxReadings: 64, maxProcedures: 16 } as const;
const clip=(n:number,lo=0,hi=1)=>Math.max(lo,Math.min(hi,n));
const distance=(a:{x:number;z:number},b:{x:number;z:number})=>Math.hypot(a.x-b.x,a.z-b.z);
const feature=(size:Vec3,rotation:number)=>clip(size.x*size.y/5)*Math.max(0.15,Math.abs(Math.cos(rotation)));
function observedBindings(raw:unknown):string[]{try{const parsed=JSON.parse(String(raw??"[]"));return Array.isArray(parsed)?parsed.filter((v):v is string=>typeof v==="string"&&/^joint-[1-9]\d*$/.test(v)):[];}catch{return [];}}

export function projectNote(project:PhysicalProject,tick:number,kind:NonNullable<PhysicalProject["history"]>[number]["kind"],summary:string) {
  if(project.history?.at(-1)?.summary===summary)return;
  project.history=[...(project.history??[]),{tick,kind,summary}].slice(-16);
}

/** Evidence is retained privately; sharing a demonstration does not copy the other agent's model. */
export function learnPhysicalReading(agent: SurvivalAgent, reading: PhysicalReading): void {
  const mind=agent.physicalMind;if(!mind)return;
  mind.readings.push(structuredClone(reading));mind.readings=mind.readings.slice(-64);
  const project=reading.source==="test"?[...mind.projects].reverse().find(p=>p.createdAt<=reading.tick&&p.partIds.includes(reading.partId)&&(p.status==="active"||p.status==="interrupted")):undefined;
  // Preserve only the operations that produced this reading. A proposed repair
  // below must not be remembered as if it had already been tried successfully.
  const completedOperations=project?structuredClone(project.operations.slice(0,project.cursor)):[];
  if(project&&reading.metric==="protection"){
    project.lastReviewAt=reading.tick;
    project.reason=`Measured protection ${reading.after.toFixed(2)} ${reading.after>=project.target?"met":"did not meet"} the proposed ${project.target.toFixed(2)} target.`;
    projectNote(project,reading.tick,"measured",project.reason);
    if(reading.after>=project.target){project.status="satisfied";delete project.blocker;}
    else if(mind.version===2&&(project.failures??0)<3){
      project.failures=(project.failures??0)+1;project.revisions++;project.status="interrupted";project.retryAt=reading.tick+3;
      project.blocker="Protection was below the target; reconsider the orientation and test again.";
      project.operations=[...project.operations.slice(0,project.cursor),{kind:"place" as const,partId:reading.partId,position:{x:project.position.x,y:reading.size.y/2,z:project.position.z+1.4},rotation:reading.rotation+Math.PI/4},{kind:"test" as const,partId:reading.partId,measure:"protection" as const,dose:1}].slice(0,24);
      projectNote(project,reading.tick,"revised",project.blocker);
    } else {project.status="abandoned";project.blocker="Repeated measurements did not justify further work.";project.reserved={};}
  }
  if(!mind.learningEnabled)return;
  const effect=reading.metric==="protection"?Math.max(0,reading.after-reading.before)/Math.max(0.05,feature(reading.size,reading.rotation)):reading.metric==="retention"?reading.after/reading.dose:reading.after<reading.before?reading.dose*0.5:reading.dose;
  let estimate=mind.estimates.find(e=>e.material===reading.material&&e.metric===reading.metric);
  if(!estimate){estimate={material:reading.material,metric:reading.metric,mean:effect,variance:0.25,samples:0,evidenceIds:[]};mind.estimates.push(estimate);}
  estimate.samples++;const delta=effect-estimate.mean;estimate.mean+=delta/estimate.samples;estimate.variance=(estimate.variance*(estimate.samples-1)+delta*(effect-estimate.mean))/estimate.samples;
  estimate.evidenceIds=[...estimate.evidenceIds,reading.id].slice(-12);
  if(reading.metric!=="protection")return;
  if(!project)return;
  const measured=Math.max(0,reading.after-reading.before);
  let procedure=mind.procedures.find(p=>p.id===`procedure-${project.id}`);
  if(!procedure&&measured>0.025){
    const place=completedOperations.find(o=>o.kind==="place");
    procedure={id:`procedure-${project.id}`,learnedAt:reading.tick,material:reading.material,sizePerMass:{x:reading.size.x,y:reading.size.y,z:reading.size.z},relativePosition:place?.kind==="place"?{x:place.position.x-project.position.x,y:place.position.y,z:place.position.z-project.position.z}:{x:0,y:reading.size.y/2,z:1},rotation:reading.rotation,mass:reading.mass,effect:measured,uncertainty:0.5,successes:0,failures:0,evidenceIds:[],conditions:{minTemperature:reading.temperature,maxTemperature:reading.temperature,weather:[]}};
    const produced=completedOperations.some(o=>o.kind==="shape")?project.partIds.at(-1):null;
    procedure.origin={...project.position};
    procedure.program=completedOperations.map(o=>"partId"in o&&o.partId===produced?{...o,partId:"$new"}:o.kind==="join"||o.kind==="mix"?{...o,a:o.a===produced?"$new":o.a,b:o.b===produced?"$new":o.b}:o);
    mind.procedures.push(procedure);mind.procedures=mind.procedures.slice(-16);
  }
  if(procedure){
    if(measured>0.025)procedure.successes++;else procedure.failures++;
    procedure.effect+=(measured-procedure.effect)/(procedure.successes+procedure.failures);
    procedure.uncertainty=1/Math.sqrt(procedure.successes+procedure.failures+1);
    procedure.evidenceIds=[...procedure.evidenceIds,reading.id].slice(-12);
    procedure.conditions.minTemperature=Math.min(procedure.conditions.minTemperature,reading.temperature);procedure.conditions.maxTemperature=Math.max(procedure.conditions.maxTemperature,reading.temperature);
    procedure.conditions.weather=[...new Set([...procedure.conditions.weather,reading.weather])];
  }
}

function projectedValue(input:PrivatePolicyInput,protection:number,cost:number):number {
  const agent=input.agent,weather=agent.observations.find(o=>o.kind==="weather");
  const needs={...agent.needs},inventory={...agent.inventory};needs.energy=Math.max(0,needs.energy-cost);
  for(let i=0;i<72;i++){
    // A fallible night-cooling prior, not access to the future environmental schedule.
    driftNeeds(needs,{temperatureC:Number(weather?.facts.temperatureC??13)-(i>18?3:0),weather:String(weather?.facts.weather??"clear"),daylight:i>18?0:Number(weather?.facts.daylight??0.5),sheltered:false,byFire:false,protection});
    // Same available reserves in both counterfactuals, consumed at the same need thresholds.
    if(needs.hydration<35&&inventory.freshwater>=1){needs.hydration=Math.min(100,needs.hydration+34);inventory.freshwater--;}
    if(needs.nutrition<35&&inventory.food>=1){needs.nutrition=Math.min(100,needs.nutrition+27);inventory.food--;}
  }
  return survivalPotential(needs,inventory);
}

export function projectChoice(input:PrivatePolicyInput,project:PhysicalProject):LocalPlanChoice|null {
  const a=input.agent;let op=project.operations[project.cursor];if(!op)return null;
  if((project.retryAt??0)>input.tick)return null;
  const actions:LocalPlanChoice["actions"]=[];
  // Knowing how an operation works is a capability, not an instruction to build.
  const required=op.kind==="shape"?{kind:op.material,amount:op.mass+(op.material==="stone"?.5:0)}:op.kind==="join"?{kind:"fiber" as const,amount:op.fiber}:op.kind==="heat"?{kind:"wood" as const,amount:op.fuel}:null;
  if(required&&a.inventory[required.kind]<required.amount){
    const site=a.observations.filter(o=>o.kind==="resource"&&o.facts.resourceKind===required.kind&&o.position&&Number(o.facts.availableEstimate)>0).sort((x,y)=>distance(a.position,x.position!)-distance(a.position,y.position!))[0];
    project.blocker=`Needs ${Math.max(0,required.amount-a.inventory[required.kind]).toFixed(1)} more ${required.kind}${op.kind==="shape"&&op.material==="stone"?" including a separate striking stone":""}.`;
    if(!site){project.blocker+=" No available source is remembered.";return null;}
    return {candidate:{goal:"gather_material",targetId:site.subjectId,score:project.predictedBenefit-2,expectedBenefit:project.predictedBenefit,risk:2,knownObservationIds:[site.id],summary:`Obtain ${required.kind} for a self-proposed exposure test; ${required.amount.toFixed(1)} material reserved.`},actions:[{action:"move",targetId:site.subjectId,destination:site.position,duration:1},{action:"gather",targetId:site.subjectId,destination:site.position,duration:1}],uncertainty:0.5};
  }
  const workPoint=project.position;
  if(distance(a.position,workPoint)>1.1){
    project.blocker="Returning to the work site before handling the next part.";
    return {candidate:{goal:"stay_warm",targetId:null,score:project.predictedBenefit,expectedBenefit:project.predictedBenefit,risk:1,knownObservationIds:a.observations.filter(o=>o.kind==="structure").map(o=>o.id),summary:project.blocker},actions:[{action:"move",targetId:null,destination:workPoint,duration:Math.max(1,Math.ceil(distance(a.position,workPoint)/7.5))}],uncertainty:.4};
  }
  const parts=observedParts(input);
  if(op.kind==="place"){
    const partId=op.partId,part=parts.find(p=>p.id===partId);
    if(!part){project.blocker="The part is not in recent observations; locate it before placing it.";return null;}
    const fit=findObservedPose(input,part.size,op.position,op.rotation,part.id);
    if(!fit){project.blocker="No clear, supported pose with an accessible approach is currently known.";return null;}
    if(distance(fit.position,op.position)>.05||Math.abs(fit.rotation-op.rotation)>.05){project.revisions++;projectNote(project,input.tick,"revised","Repositioned the proposal around observed obstacles, leaving an approach open.");}
    op={...op,...fit};project.operations[project.cursor]=op;
  }
  if(op.kind==="join"){
    const {a:firstId,b:secondId}=op,first=parts.find(p=>p.id===firstId),second=parts.find(p=>p.id===secondId);
    if(!first||!second){project.blocker="Both parts must be observed before connecting them.";return null;}
    // Place one component against the other before attempting a binding.
    if(distance(first.position,second.position)>(Math.max(first.size.x,first.size.z)+Math.max(second.size.x,second.size.z))/2+.1){
      const pose=findObservedPose(input,second.size,{x:first.position.x+(first.size.x+second.size.x)/2,y:second.size.y/2,z:first.position.z},0,second.id);
      if(!pose){project.blocker="The parts cannot yet be brought together with a clear approach.";return null;}
      if(project.operations.length>=23){project.blocker="The bounded positioning plan is exhausted; no further arrangement is currently known.";return null;}
      project.operations.splice(project.cursor,0,{kind:"place",partId:second.id,...pose});op=project.operations[project.cursor];
      projectNote(project,input.tick,"revised","Bring the observed surfaces together before binding.");
    }
  }
  delete project.blocker;
  actions.push({action:op.kind==="test"?"test_hypothesis":"build",targetId:"partId"in op?op.partId:null,destination:null,duration:1,manipulation:op});
  return {candidate:{goal:op.kind==="test"?"research":"stay_warm",targetId:"partId"in op?op.partId:null,score:project.predictedBenefit,expectedBenefit:project.predictedBenefit,risk:1,knownObservationIds:a.observations.filter(o=>o.kind==="weather"||o.subjectId=== ("partId"in op?op.partId:null)).map(o=>o.id),summary:`${op.kind} for self-proposed project: reduce exposure to ${(1-project.target).toFixed(2)} or less. This is a prediction, not a confirmed benefit.`},actions,uncertainty:0.5};
}

/** Bounded geometry search with empirical, uncertain coefficients. No named building catalog. */
export function preparePhysicalProjects(input:PrivatePolicyInput):void {
  const a=input.agent,mind=a.physicalMind;if(!mind)return;
  if(depthAt(observedWater(a.observations),a.position)>0)return;
  const emergency=Math.min(a.needs.health,a.needs.hydration,a.needs.nutrition,a.needs.energy)<32;
  const current=mind.projects.find(p=>p.status==="active"||p.status==="interrupted");
  if(current){
    if(emergency){current.status="interrupted";current.blocker="Food, water, health or energy needs take priority. Work is retained.";projectNote(current,input.tick,"paused",current.blocker);return;}
    if((current.retryAt??0)>input.tick)return;
    if(input.tick-current.updatedAt>288){current.status="abandoned";current.reason="No progress for two days; release the reservation and reconsider alternatives.";current.reserved={};}
    else {
      const remembered=input.agent.physicalMind?.readings.filter(r=>r.metric==="protection"&&distance(r.position,current.position)<2&&input.tick-r.tick<36).at(-1)?.after??0;
      const benefit=projectedValue(input,Math.max(remembered,current.target),Math.max(0,current.operations.length-current.cursor)*0.6)-projectedValue(input,remembered,0);
      if(benefit<=0&&current.cursor===0){current.status="abandoned";current.reason="Updated conditions no longer justify this investment.";current.reserved={};current.lastReviewAt=input.tick;return;}
      current.predictedBenefit=benefit;
      if(current.status==="interrupted")projectNote(current,input.tick,"resumed","Immediate needs allow the remaining work to compete with other choices again.");
      current.status="active";return;
    }
  }
  if(emergency||Math.min(a.needs.hydration,a.needs.nutrition,a.needs.energy)<55||input.tick-(mind.projects.at(-1)?.lastReviewAt??-24)<12)return;
  const weather=a.observations.find(o=>o.kind==="weather");if(!weather)return;
  const existing=mind.readings.filter(r=>r.metric==="protection"&&distance(r.position,a.position)<2&&input.tick-r.tick<36&&r.weather===weather.facts.weather).sort((a,b)=>b.tick-a.tick)[0]?.after??0;
  const control=projectedValue(input,existing,0);
  const candidates:{operations:Manipulation[];value:number;mass:number;material:MaterialKind;target:number}[]=[];
  const known=a.observations.filter(o=>o.kind==="resource"&&o.position&&["wood","fiber","clay","stone"].includes(String(o.facts.resourceKind))&&Number(o.facts.availableEstimate)>0);
  const artifacts=a.observations.filter(o=>o.facts.structureKind==="physical_part"&&o.position&&distance(o.position,a.position)<3.5&&input.tick-o.observedAt<36);
  for(let n=0;n<PHYSICAL_SEARCH_BUDGET.candidates/2;n++){
    const sample=known[n%Math.max(1,known.length)];if(!sample)break;
    const material=sample.facts.resourceKind as MaterialKind;
    const priorDensity=Number(sample.facts.bulkDensity??0);if(priorDensity<=0)continue;
    const random=(key:string)=>survivalUnit(input.seed,a.id,input.tick,n,key);
    const learned=mind.learningEnabled?mind.procedures.filter(p=>p.material===material&&p.successes>p.failures).at(-1):undefined;
    const transfer=!!learned&&(!learned.conditions.weather.includes(String(weather.facts.weather))||Number(weather.facts.temperatureC)<learned.conditions.minTemperature-3||Number(weather.facts.temperatureC)>learned.conditions.maxTemperature+3);
    const mass=learned&&n%3===0?learned.mass:0.4+random("mass")*1.4;
    // Dimensions are independent continuous parameters; volume follows the measured batch density.
    const x=learned&&n%3===0?learned.sizePerMass.x:0.6+random("width")*2.3;
    const y=learned&&n%3===0?learned.sizePerMass.y:0.35+random("height")*1.9;
    const hollow=material==="clay"&&n%4===0?0.15+random("hollow")*0.45:0;
    const z=mass/priorDensity/x/y/(1-hollow);if(z<0.06||z>4)continue;
    const rotation=learned&&n%3===0?learned.rotation:random("angle")*Math.PI;
    const size={x,y,z},estimate=mind.estimates.find(e=>e.material===material&&e.metric==="protection");
    const coefficient=estimate?.mean??0.32;
    const predicted=clip(existing+feature(size,rotation)*coefficient,0,0.9);
    const travel=distance(a.position,sample.position!)/7.5;
    const uncertainty=estimate?Math.sqrt(estimate.variance)+1/Math.sqrt(estimate.samples+1)+(transfer?0.4:0):0.45;
    const survivalGain=projectedValue(input,predicted,4)-control;
    // Information has value only when uncertain performance could change this survival decision.
    const informationValue=Math.min(3,Math.max(0,survivalGain)*uncertainty*0.25);
    const value=survivalGain+informationValue-2.5-mass*1.2-(a.inventory[material]>=mass?0:travel*0.5)-(transfer?1:0);
    const offset=learned&&n%3===0?learned.relativePosition:{x:(random("offsetX")-0.5)*1.6,y:y/2,z:0.9+random("offsetZ")*0.8};
    const position={x:clip(a.position.x+offset.x,input.bounds.minX+2,input.bounds.maxX-2),y:y/2,z:clip(a.position.z+offset.z,input.bounds.minZ+2,input.bounds.maxZ-2)};
    const fit=findObservedPose(input,size,position,rotation);if(!fit)continue;
    candidates.push({value,mass,material,target:Math.max(0.08,predicted*0.8),operations:[{kind:"shape",material,mass,size,hollow},{kind:"place",partId:"$new",...fit},{kind:"test",partId:"$new",measure:"protection",dose:1}]});
    if(learned?.program&&n%3===0){
      const transferred=procedureForObservation(learned,a.position);
      const available=transferred.every(o=>"partId"in o?o.partId==="$new"||artifacts.some(p=>p.subjectId===o.partId):o.kind==="join"||o.kind==="mix"?[o.a,o.b].every(id=>id==="$new"||artifacts.some(p=>p.subjectId===id)):true);
      if(available)candidates[candidates.length-1].operations=transferred;
    }
  }
  // Mutate observed artifacts as well as parameterized new parts. The proposal vocabulary
  // contains physical verbs, never a named invention or a guaranteed success path.
  for(let n=0;n<12&&artifacts.length;n++){
    const artifact=artifacts[n%artifacts.length],other=artifacts[(n+1)%artifacts.length],f=artifact.facts;
    const material=f.material as MaterialKind,partId=artifact.subjectId;
    const size={x:Number(f.width),y:Number(f.height),z:Number(f.depth)};
    const r=(key:string)=>survivalUnit(input.seed,a.id,input.tick,n,"mutation",key);
    const operations:Manipulation[]=[];
    let estimated=0.12,cost=1.8;
    switch(n%8){
      case 0:operations.push({kind:"place",partId,position:{x:a.position.x+(r("dx")-0.5)*2,y:size.y/2,z:a.position.z+0.9},rotation:r("rotation")*Math.PI});estimated=feature(size,(operations[0] as Extract<Manipulation,{kind:"place"}>).rotation)*(mind.estimates.find(e=>e.material===material&&e.metric==="protection")?.mean??0.32);break;
      case 1:if(size.x>0.6){operations.push({kind:"split",partId,fraction:0.3+r("split")*0.4});estimated=feature(size,Number(f.rotation))*0.15;}break;
      case 2:if(other!==artifact){operations.push({kind:"join",a:partId,b:other.subjectId,fiber:0.25+r("binding")*0.5},{kind:"test",partId,measure:"load",dose:1+r("load")*3});estimated=0.18;cost=3;}break;
      case 3:if(other!==artifact){operations.push({kind:"mix",a:partId,b:other.subjectId});estimated=0.14;cost=2.5;}break;
      case 4:operations.push({kind:"heat",partId,fuel:0.3+r("fuel")*0.5},{kind:"test",partId,measure:Number(f.hollow)>0?"retention":"load",dose:0.5});estimated=material==="clay"?0.2:0.02;cost=3;break;
      case 5:{const bindings=observedBindings(f.bindingIds);if(bindings[0])operations.push({kind:"detach",jointId:bindings[0]});if(Number(f.condition)<20)operations.push({kind:"reclaim",partId});else operations.push({kind:"test",partId,measure:"load",dose:1+r("probe")*3});estimated=0.06;break;}
      case 6:operations.push({kind:"test",partId,measure:Number(f.hollow)>0?"retention":"load",dose:0.5+r("probe")});estimated=0.05;cost=0.8;break;
      case 7:{const base=candidates[n%candidates.length];const shape=base?.operations.find(o=>o.kind==="shape");if(shape?.kind==="shape"&&size.y>0.6){const top={x:shape.size.x,y:shape.size.z,z:shape.size.y};operations.push({...shape,size:top},{kind:"place",partId:"$new",position:{x:artifact.position!.x,y:Number(f.elevation)+size.y/2+top.y/2,z:artifact.position!.z},rotation:Number(f.rotation)},{kind:"join",a:partId,b:"$new",fiber:0.5},{kind:"test",partId:"$new",measure:"load",dose:1});estimated=0.3;cost=5;}break;}
    }
    if(!operations.length)continue;
    const tested=operations.some(o=>o.kind==="shape")?"$new":partId;
    if(!operations.some(o=>o.kind==="reclaim"))operations.push({kind:"test",partId:tested,measure:"protection",dose:1});
    const previous=mind.readings.filter(q=>q.partId===partId&&q.metric==="protection").at(-1);
    const opportunity=projectedValue(input,clip(existing+estimated,0,0.9),cost)-control-cost;
    const information=previous?0:Math.min(2,Math.max(0,opportunity)*0.2);
    const repeatedFailure=mind.projects.filter(p=>p.status==="abandoned"&&p.operations[0]?.kind===operations[0].kind&&p.partIds.includes(partId)).length;
    candidates.push({value:opportunity+information-repeatedFailure*3,mass:0,material,target:clip(existing+estimated*0.7,0.05,0.9),operations});
  }
  const best=candidates.sort((a,b)=>b.value-a.value)[0];
  if(!best||best.value<=1)return;
  const project:PhysicalProject={id:`physical-project-${a.id}-${input.tick}`,createdAt:input.tick,updatedAt:input.tick,metric:"exposure",target:best.target,baseline:existing,status:"active",reason:"Compare predicted future warmth and safety against effort, material cost, uncertainty, and ordinary survival alternatives.",position:{...a.position},reserved:{[best.material]:best.mass},operations:best.operations,cursor:0,partIds:[...new Set(best.operations.flatMap(o=>"partId"in o&&o.partId!=="$new"?[o.partId]:[]))],predictedBenefit:best.value,spentEffort:0,revisions:mind.projects.filter(p=>p.status==="abandoned").length,lastReviewAt:input.tick};
  mind.projects.push(project);mind.projects=mind.projects.slice(-8);
}

export function planPhysicalKnowledge(input:PrivatePolicyInput):LocalPlanChoice[]{
  const choices=planFromPrivateKnowledge({...input,physical:true});
  if(depthAt(observedWater(input.agent.observations),input.agent.position)>0)return choices;
  const project=input.agent.physicalMind?.projects.find(p=>p.status==="active");
  if(project){const proposed=projectChoice(input,project);if(proposed){
    const water=observedWater(input.agent.observations),weather=input.agent.observations.find(o=>o.kind==="weather");
    let from=input.agent.position,cost=0;
    for(const action of proposed.actions){
      if(action.action!=="move"||!action.destination)continue;
      const travel=estimateWaterTravel(water,from,action.destination,Number(weather?.facts.temperatureC??13),weather?.facts.weather==="storm");
      from=action.destination;
      if(travel.wetDuration>0){action.duration=Math.max(action.duration,Math.ceil(travel.duration));cost+=travel.energy+travel.warmth*.75+travel.wetDuration*.12;}
    }
    if(cost>0){proposed.candidate.score-=cost;proposed.candidate.risk+=cost;proposed.candidate.summary+=" Observed water adds swimming effort, slower travel and cooling.";proposed.candidate.knownObservationIds=[...new Set([...proposed.candidate.knownObservationIds,...input.agent.observations.filter(o=>o.facts.resourceKind==="freshwater"&&typeof o.facts.waterRadiusX==="number").map(o=>o.id)])];}
    proposed.projectId=project.id;choices.push(proposed);
  }}
  return choices.sort((a,b)=>b.candidate.score-a.candidate.score||a.candidate.summary.localeCompare(b.candidate.summary)).slice(0,8);
}

export function completePhysicalOperation(agent:SurvivalAgent,op:Manipulation,ok:boolean,partId:string|null,tick:number,effort:number,summary="The attempted operation failed."):void{
  const project=agent.physicalMind?.projects.find(p=>p.status==="active");if(!project)return;
  project.updatedAt=tick;project.spentEffort+=effort;
  if(!ok){project.failures=(project.failures??0)+1;project.blocker=summary;project.lastReviewAt=tick;projectNote(project,tick,"blocked",summary);
    if(agent.physicalMind?.version===2&&project.failures<=3){project.status="interrupted";project.retryAt=tick+3;project.revisions++;project.reason="Retain progress and reconsider the failed operation using fresh observations.";}
    else {project.status="abandoned";project.reason="Repeated failures made further investment uneconomic. Keep the evidence and release reservations.";project.reserved={};}return;}
  delete project.blocker;
  if(op.kind==="shape"&&partId){project.partIds.push(partId);project.operations=project.operations.map(o=>"partId"in o&&o.partId==="$new"?{...o,partId}:o.kind==="join"||o.kind==="mix"?{...o,a:o.a==="$new"?partId:o.a,b:o.b==="$new"?partId:o.b}:o);project.reserved={};}
  project.cursor++;
  if(project.cursor>=project.operations.length&&op.kind!=="test"&&project.status==="active"){project.status="abandoned";project.reason="Operations ended without a confirming measurement.";}
}

export function procedureForObservation(procedure:LearnedProcedure,position:{x:number;z:number}):Manipulation[]{
  if(procedure.program&&procedure.origin)return structuredClone(procedure.program).map(o=>o.kind==="place"?{...o,position:{...o.position,x:o.position.x-procedure.origin!.x+position.x,z:o.position.z-procedure.origin!.z+position.z}}:o);
  return [{kind:"shape",material:procedure.material,mass:procedure.mass,size:{...procedure.sizePerMass}},{kind:"place",partId:"$new",position:{x:position.x+procedure.relativePosition.x,y:procedure.relativePosition.y,z:position.z+procedure.relativePosition.z},rotation:procedure.rotation},{kind:"test",partId:"$new",measure:"protection",dose:1}];
}
