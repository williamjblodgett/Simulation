import { driftNeeds } from "./physiology";
import { planFromPrivateKnowledge, survivalPotential, type LocalPlanChoice, type PrivatePolicyInput } from "./planner";
import { survivalUnit } from "./random";
import type { LearnedProcedure, Manipulation, MaterialKind, PhysicalProject, PhysicalReading, Vec3 } from "./physical-types";
import type { SurvivalAgent } from "./types";

// The policy deliberately does not import physical-world or MATERIALS. It cannot run the true solver.
export const PHYSICAL_SEARCH_BUDGET = { candidates: 24, horizon: 72, maxProjects: 8, maxReadings: 64, maxProcedures: 16 } as const;
const clip=(n:number,lo=0,hi=1)=>Math.max(lo,Math.min(hi,n));
const distance=(a:{x:number;z:number},b:{x:number;z:number})=>Math.hypot(a.x-b.x,a.z-b.z);
const feature=(size:Vec3,rotation:number)=>clip(size.x*size.y/5)*Math.max(0.15,Math.abs(Math.cos(rotation)));
function observedBindings(raw:unknown):string[]{try{const parsed=JSON.parse(String(raw??"[]"));return Array.isArray(parsed)?parsed.filter((v):v is string=>typeof v==="string"&&/^joint-[1-9]\d*$/.test(v)):[];}catch{return [];}}

/** Evidence is retained privately; sharing a demonstration does not copy the other agent's model. */
export function learnPhysicalReading(agent: SurvivalAgent, reading: PhysicalReading): void {
  const mind=agent.physicalMind;if(!mind)return;
  mind.readings.push(structuredClone(reading));mind.readings=mind.readings.slice(-64);
  const evaluatedProject=mind.projects.find(p=>p.partIds.includes(reading.partId)&&p.status!=="abandoned");
  if(evaluatedProject && reading.metric==="protection"){
    evaluatedProject.lastReviewAt=reading.tick;evaluatedProject.status=reading.after>=evaluatedProject.target?"satisfied":"abandoned";
    evaluatedProject.reason=`Measured protection ${reading.after.toFixed(2)} ${reading.after>=evaluatedProject.target?"met":"did not meet"} the proposed ${evaluatedProject.target.toFixed(2)} target. Retain this evidence for later decisions.`;
  }
  if(!mind.learningEnabled)return;
  const effect=reading.metric==="protection"?Math.max(0,reading.after-reading.before)/Math.max(0.05,feature(reading.size,reading.rotation)):reading.metric==="retention"?reading.after/reading.dose:reading.after<reading.before?reading.dose*0.5:reading.dose;
  let estimate=mind.estimates.find(e=>e.material===reading.material&&e.metric===reading.metric);
  if(!estimate){estimate={material:reading.material,metric:reading.metric,mean:effect,variance:0.25,samples:0,evidenceIds:[]};mind.estimates.push(estimate);}
  estimate.samples++;const delta=effect-estimate.mean;estimate.mean+=delta/estimate.samples;estimate.variance=(estimate.variance*(estimate.samples-1)+delta*(effect-estimate.mean))/estimate.samples;
  estimate.evidenceIds=[...estimate.evidenceIds,reading.id].slice(-12);
  if(reading.metric!=="protection")return;
  const project=mind.projects.find(p=>p.partIds.includes(reading.partId));
  if(!project)return;
  const measured=Math.max(0,reading.after-reading.before);
  let procedure=mind.procedures.find(p=>p.id===`procedure-${project.id}`);
  if(!procedure&&measured>0.025){
    const place=project.operations.find(o=>o.kind==="place");
    procedure={id:`procedure-${project.id}`,learnedAt:reading.tick,material:reading.material,sizePerMass:{x:reading.size.x,y:reading.size.y,z:reading.size.z},relativePosition:place?.kind==="place"?{x:place.position.x-project.position.x,y:place.position.y,z:place.position.z-project.position.z}:{x:0,y:reading.size.y/2,z:1},rotation:reading.rotation,mass:reading.mass,effect:measured,uncertainty:0.5,successes:0,failures:0,evidenceIds:[],conditions:{minTemperature:reading.temperature,maxTemperature:reading.temperature,weather:[]}};
    const produced=project.operations.some(o=>o.kind==="shape")?project.partIds.at(-1):null;
    procedure.origin={...project.position};
    procedure.program=structuredClone(project.operations).map(o=>"partId"in o&&o.partId===produced?{...o,partId:"$new"}:o.kind==="join"||o.kind==="mix"?{...o,a:o.a===produced?"$new":o.a,b:o.b===produced?"$new":o.b}:o);
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
  project.lastReviewAt=reading.tick;
  if(reading.after>=project.target){project.status="satisfied";project.reason=`Measured protection ${reading.after.toFixed(2)} reached the proposed ${project.target.toFixed(2)} target.`;}
  else {project.status="abandoned";project.reason=`Measured protection ${reading.after.toFixed(2)} did not meet ${project.target.toFixed(2)}; retain the result for a revised attempt.`;}
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

function projectChoice(input:PrivatePolicyInput,project:PhysicalProject):LocalPlanChoice|null {
  const a=input.agent,op=project.operations[project.cursor];if(!op)return null;
  const actions:LocalPlanChoice["actions"]=[];
  if(distance(a.position,project.position)>2.5)actions.push({action:"move",targetId:null,destination:project.position,duration:1});
  const required=op.kind==="shape"?{kind:op.material,amount:op.mass}:op.kind==="join"?{kind:"fiber" as const,amount:op.fiber}:op.kind==="heat"?{kind:"wood" as const,amount:op.fuel}:null;
  if(required&&a.inventory[required.kind]<required.amount){
    const site=a.observations.filter(o=>o.kind==="resource"&&o.facts.resourceKind===required.kind&&o.position&&Number(o.facts.availableEstimate)>0).sort((x,y)=>distance(a.position,x.position!)-distance(a.position,y.position!))[0];
    if(!site)return null;
    return {candidate:{goal:"gather_material",targetId:site.subjectId,score:project.predictedBenefit-2,expectedBenefit:project.predictedBenefit,risk:2,knownObservationIds:[site.id],summary:`Obtain ${required.kind} for a self-proposed exposure test; ${required.amount.toFixed(1)} material reserved.`},actions:[{action:"move",targetId:site.subjectId,destination:site.position,duration:1},{action:"gather",targetId:site.subjectId,destination:site.position,duration:1}],uncertainty:0.5};
  }
  actions.push({action:op.kind==="test"?"test_hypothesis":"build",targetId:"partId"in op?op.partId:null,destination:null,duration:1,manipulation:op});
  return {candidate:{goal:op.kind==="test"?"research":"stay_warm",targetId:"partId"in op?op.partId:null,score:project.predictedBenefit,expectedBenefit:project.predictedBenefit,risk:1,knownObservationIds:a.observations.filter(o=>o.kind==="weather"||o.subjectId=== ("partId"in op?op.partId:null)).map(o=>o.id),summary:`${op.kind} for self-proposed project: reduce exposure to ${(1-project.target).toFixed(2)} or less. This is a prediction, not a confirmed benefit.`},actions,uncertainty:0.5};
}

/** Bounded geometry search with empirical, uncertain coefficients. No named building catalog. */
export function preparePhysicalProjects(input:PrivatePolicyInput):void {
  const a=input.agent,mind=a.physicalMind;if(!mind)return;
  const emergency=Math.min(a.needs.health,a.needs.hydration,a.needs.nutrition,a.needs.energy)<32;
  const current=mind.projects.find(p=>p.status==="active"||p.status==="interrupted");
  if(current){
    if(emergency){current.status="interrupted";current.reason="Immediate needs interrupted the project. Parts and remaining operations are retained.";return;}
    if(input.tick-current.updatedAt>144){current.status="abandoned";current.reason="The project remained uneconomic for a full day; release its reservation.";current.reserved={};}
    else {
      const remembered=input.agent.physicalMind?.readings.filter(r=>r.metric==="protection"&&distance(r.position,current.position)<2&&input.tick-r.tick<36).at(-1)?.after??0;
      const benefit=projectedValue(input,Math.max(remembered,current.target),Math.max(0,current.operations.length-current.cursor)*0.6)-projectedValue(input,remembered,0);
      if(benefit<=0&&current.cursor===0){current.status="abandoned";current.reason="Updated conditions no longer justify this investment.";current.reserved={};current.lastReviewAt=input.tick;return;}
      current.predictedBenefit=benefit;current.status="active";return;
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
    candidates.push({value,mass,material,target:Math.max(0.08,predicted*0.8),operations:[{kind:"shape",material,mass,size,hollow},{kind:"place",partId:"$new",position,rotation},{kind:"test",partId:"$new",measure:"protection",dose:1}]});
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
  const project=input.agent.physicalMind?.projects.find(p=>p.status==="active");
  if(project){const proposed=projectChoice(input,project);if(proposed)choices.push(proposed);}
  return choices.sort((a,b)=>b.candidate.score-a.candidate.score||a.candidate.summary.localeCompare(b.candidate.summary)).slice(0,8);
}

export function completePhysicalOperation(agent:SurvivalAgent,op:Manipulation,ok:boolean,partId:string|null,tick:number,effort:number):void{
  const project=agent.physicalMind?.projects.find(p=>p.status==="active");if(!project)return;
  project.updatedAt=tick;project.spentEffort+=effort;
  if(!ok){project.status="abandoned";project.reason="A physical attempt failed. Keep the prototype and evidence; release remaining material reservations.";project.reserved={};project.lastReviewAt=tick;return;}
  if(op.kind==="shape"&&partId){project.partIds.push(partId);project.operations=project.operations.map(o=>"partId"in o&&o.partId==="$new"?{...o,partId}:o.kind==="join"||o.kind==="mix"?{...o,a:o.a==="$new"?partId:o.a,b:o.b==="$new"?partId:o.b}:o);project.reserved={};}
  project.cursor++;
  if(project.cursor>=project.operations.length&&op.kind!=="test"&&project.status==="active"){project.status="abandoned";project.reason="Operations ended without a confirming measurement.";}
}

export function procedureForObservation(procedure:LearnedProcedure,position:{x:number;z:number}):Manipulation[]{
  if(procedure.program&&procedure.origin)return structuredClone(procedure.program).map(o=>o.kind==="place"?{...o,position:{...o.position,x:o.position.x-procedure.origin!.x+position.x,z:o.position.z-procedure.origin!.z+position.z}}:o);
  return [{kind:"shape",material:procedure.material,mass:procedure.mass,size:{...procedure.sizePerMass}},{kind:"place",partId:"$new",position:{x:position.x+procedure.relativePosition.x,y:procedure.relativePosition.y,z:position.z+procedure.relativePosition.z},rotation:procedure.rotation},{kind:"test",partId:"$new",measure:"protection",dose:1}];
}
