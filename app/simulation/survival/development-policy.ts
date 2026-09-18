import { COMPONENT_AFFORDANCES, componentForms, componentMass, componentMetric, modelKey, operationDuration, operationEffort } from "./development-catalog";
import { DEVELOPMENT_LIMITS, type Capability, type ComponentForm, type DevelopmentCandidate, type DevelopmentGoal, type DevelopmentMind, type DevelopmentOperation, type DevelopmentPrimitive, type DevelopmentProcedure, type DevelopmentReading, type ObservedComponent } from "./development-types";
import type { LocalPlanChoice, PlannedAction, PrivatePolicyInput } from "./planner";
import { depthAt, observedWater } from "./water";
import type { SurvivalAgent, SurvivalInventory, SurvivalPosition } from "./types";
import { affectDecisionAdjustment } from "./affect";
import { survivalUnit } from "./random";

const distance = (a: SurvivalPosition, b: SurvivalPosition) => Math.hypot(a.x - b.x, a.z - b.z);
const round = (n: number) => Math.round(n * 1000) / 1000;
const freshId = (mind: DevelopmentMind, agent: string, kind: string) => `development-${kind}-${agent}-${mind.nextId++}`;
export const freshDevelopmentMind = (): DevelopmentMind => ({ version: 1, nextId: 1, goals: [], evidence: [], models: [], procedures: [], active: null, decision: null, lastReviewAt: -6, seenEvidence: [], prunedEvidence: 0, experimentWindow: 0, experimentalEffort: 0, expansions: 0, materialGoalHistory: [] });

/** This recursive allowlist copies private records, never world objects or diagnostics. */
const keys = new Set(`version nextId goals evidence models procedures active decision lastReviewAt seenEvidence prunedEvidence experimentWindow experimentalEffort expansions materialGoalHistory id parentId metric origin evidenceIds createdAt updatedAt status target benefit urgency spent budget retryAt failures lastEvidence originalId observerId receivedAt tick source form material size thickness treatment value predicted uncertainty componentId conditions summary key mean m2 samples authorId learnedAt parts links finishing successes expected duration from to port goalId label score prediction informationValue ticks materialCost rejection operations kind orientation position x z batchIds metalBatchId resource amount direction fuel temperature dose setting seeds procedureId cursor bindings startedAt additionalMotivation selectedId candidates omitted reason endedAt`.split(" "));
function allowed(value: unknown): unknown { if (Array.isArray(value)) return value.map(allowed); if (!value || typeof value !== "object") return value; return Object.fromEntries(Object.entries(value).filter(([key])=>keys.has(key)).map(([key, v])=>[key,allowed(v)])); }
keys.add("candidate");
export function attachDevelopmentView(input: PrivatePolicyInput, source: SurvivalAgent, discoveryObjective: boolean) {
  input.agent.developmentMind = allowed(source.developmentMind) as DevelopmentMind;
  input.discoveryObjective = discoveryObjective;
  input.components = source.observations.filter(o=>o.observerId===source.id && o.kind==="structure" && typeof o.facts.developmentForm==="string").map(o=>({
    id: o.subjectId, form: o.facts.developmentForm as ComponentForm, material: o.facts.material as ObservedComponent["material"],
    position: { x: o.position!.x, z: o.position!.z }, size: Number(o.facts.componentSize), thickness: Number(o.facts.thickness), orientation: Number(o.facts.rotation),
    condition: Number(o.facts.condition)/100, treatment: o.facts.treatment as ObservedComponent["treatment"], water: Number(o.facts.storedWater), food: Number(o.facts.storedFood), charge: Number(o.facts.storedCharge), observedAt: o.observedAt, evidenceId: o.id, output: Number(o.facts.output), documentId: typeof o.facts.documentId === "string" ? o.facts.documentId : null,
  }));
}
export function predictDevelopment(mind: DevelopmentMind, part: DevelopmentPrimitive, treatment = "raw") {
  const model = mind.models.find(m=>m.key===modelKey(part,treatment));
  const prior = COMPONENT_AFFORDANCES[part.form].prior;
  return { value: model ? (prior * 2 + model.mean * model.samples) / (model.samples + 2) : prior, uncertainty: model ? Math.min(.8, .16 + .4 / Math.sqrt(model.samples + 1) + Math.sqrt(model.m2 / Math.max(1,model.samples)) * .2) : .62 };
}

function addGoal(input: PrivatePolicyInput, metric: Capability, origin: string, evidenceIds: string[], benefit: number, parentId: string | null = null): DevelopmentGoal | null {
  const mind = input.agent.developmentMind!;
  const existing = [...mind.goals].reverse().find(g=>g.metric===metric && g.parentId===parentId);
  const signature = [...evidenceIds].sort().join("|");
  if (existing && ["active","deferred"].includes(existing.status)) { existing.benefit = benefit; existing.urgency = Math.min(1,benefit/35); return existing; }
  if (existing && (input.tick < existing.retryAt || existing.lastEvidence === signature)) return null;
  if (parentId && mind.goals.find(g=>g.id===parentId)?.parentId) return null;
  if (mind.goals.length >= DEVELOPMENT_LIMITS.goals) { const index=mind.goals.findIndex(g=>["satisfied","abandoned"].includes(g.status)&&!mind.goals.some(child=>child.parentId===g.id)); if(index<0)return null; mind.goals.splice(index,1); }
  const goal: DevelopmentGoal = { id:freshId(mind,input.agent.id,"goal"), parentId,metric,origin,evidenceIds:evidenceIds.slice(-12),createdAt:input.tick,updatedAt:input.tick,status:"active",target:.3,benefit,urgency:Math.min(1,benefit/35),spent:0,budget:40,retryAt:input.tick,failures:0,lastEvidence:signature };
  mind.goals.push(goal); return goal;
}
function reviewProblems(input: PrivatePolicyInput) {
  const mind=input.agent.developmentMind!; if(input.tick-mind.lastReviewAt<6)return; mind.lastReviewAt=input.tick;
  const memories=input.agent.memory.slice(-40), collection=memories.filter(m=>m.action==="collect"), gathering=memories.filter(m=>m.action==="gather"), eating=memories.filter(m=>m.action==="eat");
  const nearby=(input.components??[]).filter(c=>input.tick-c.observedAt<24&&distance(c.position,input.agent.position)<12);
  // A measured, maintained arrangement is an alternative to more construction.
  for(const goal of mind.goals.filter(g=>["active","deferred"].includes(g.status)&&g.id!==mind.active?.goalId)) {
    if(nearby.some(c=>componentMetric(c.form)===goal.metric&&c.condition>.5&&mind.evidence.some(e=>e.componentId===c.id&&e.source==="personal"&&e.value>=goal.target)&&(goal.metric==="water_access"?c.water>.5:goal.metric==="food_reliability"?c.food>.3:goal.metric==="protection"?true:c.output>.05))) {goal.status="satisfied";goal.updatedAt=input.tick;goal.retryAt=input.tick+144;}
  }
  if(collection.length>=3)addGoal(input,"water_access",`${collection.length} personally remembered collection trips suggest a recurring water-access cost.`,collection.map(m=>m.id),Math.min(28,8+collection.length*2));
  if(eating.length>=3)addGoal(input,"food_reliability",`${eating.length} meals depended on repeatedly acquired food.`,eating.map(m=>m.id),Math.min(25,7+eating.length*1.7));
  if(gathering.length>=4)addGoal(input,"work_effort",`${gathering.length} gathering outcomes provide evidence of repeated physical work.`,gathering.map(m=>m.id),Math.min(32,8+gathering.length*2));
  const weather=input.agent.observations.find(o=>o.kind==="weather");
  if(weather && Math.min(input.agent.needs.warmth,input.agent.needs.safety)<72 && memories.filter(m=>["warm","shelter"].includes(m.action)).length>=2)addGoal(input,"protection","Repeated exposure and a personally observed cold or unsafe condition.",[weather.id,...memories.filter(m=>["warm","shelter"].includes(m.action)).map(m=>m.id)],26);
  // Optional additional motivation is explicit and budgeted. It studies uncertain
  // working capabilities whose measurements could change a retained plan.
  if(input.discoveryObjective && mind.procedures.some(p=>p.successes>0) && !mind.goals.some(g=>g.metric==="knowledge"&&g.status==="active"))addGoal(input,"knowledge","A tested procedure could remain useful after separation or death.",mind.procedures.flatMap(p=>p.evidenceIds),12);
  const interrupted=nearby.find(c=>c.form==="coil"&&mind.evidence.some(e=>e.source==="personal"&&e.componentId===c.id&&e.value>c.output+.05));
  if(interrupted)addGoal(input,"energy_storage","Observed electrical output fell below a personally measured earlier output; buffering might reduce interruptions.",[interrupted.evidenceId,...mind.evidence.filter(e=>e.componentId===interrupted.id).map(e=>e.originalId)],24);
  const overflowing=nearby.find(c=>c.form==="vessel"&&c.water>c.size**3*.65&&nearby.some(p=>p.form==="piston"&&p.output>.05));
  if(overflowing)addGoal(input,"regulation","A nearly full observed receiver is still attached to running water machinery; stopping surplus work may reduce wear.",[overflowing.evidenceId],18);
  const unread=nearby.find(c=>c.documentId&&!mind.procedures.some(p=>p.id===c.documentId));
  if(unread)addGoal(input,"knowledge","Observed a marked surface. Reading may reveal a relevant procedure, but it remains testimony.",[unread.evidenceId],18);
  for(const goal of mind.goals)if(["active","deferred"].includes(goal.status)&&goal.spent>=goal.budget){goal.status="abandoned";goal.retryAt=input.tick+144;goal.updatedAt=input.tick;}
}

interface Assembly { parts: DevelopmentPrimitive[]; links: DevelopmentCandidate["links"] }
/** Bounded backward chaining over capability ports. No complete machine sequence
 * is stored in the catalog. Cycles cannot satisfy a prerequisite. */
export function composeCapability(input: PrivatePolicyInput, metric: Capability, variant: number, ancestors: Capability[] = [], result: Assembly = {parts:[],links:[]}): Assembly | null {
  const mind=input.agent.developmentMind!;
  if(ancestors.length>=DEVELOPMENT_LIMITS.depth || ancestors.includes(metric) || mind.expansions>=DEVELOPMENT_LIMITS.expansions)return null;
  const forms=componentForms.filter(form=>componentMetric(form)===metric && !COMPONENT_AFFORDANCES[form].needs.includes(metric));
  if(!forms.length)return null;
  const form=forms[variant%forms.length], definition=COMPONENT_AFFORDANCES[form]; mind.expansions++;
  const material=definition.materials.find(m=>m==="metal"?input.materialBatches?.some(b=>b.kind==="bloom"||b.kind==="tool"):m==="ceramic"?input.materialBatches?.some(b=>b.kind==="ceramic"):input.agent.inventory[m]>0||input.agent.observations.some(o=>o.kind==="resource"&&o.facts.resourceKind===m&&Number(o.facts.availableEstimate)>0));
  if(!material)return null;
  const requirements:number[]=[];
  for(const requirement of definition.needs){const partial=composeCapability(input,requirement,Math.floor(variant/2),[...ancestors,metric],result);if(!partial)return null;requirements.push(result.parts.length-1);}
  const index=result.parts.length;
  const geometryVariant=Math.floor(variant/forms.length)%2;
  result.parts.push({form,material,size:form==="rotor"?1.6:1.25,thickness:geometryVariant?.32:.18,orientation:geometryVariant?Math.PI/2:0});
  for(const from of requirements){const cap=componentMetric(result.parts[from].form);result.links.push({from,to:index,port:cap==="water_access"?"water":cap==="electric"?"electric":"mechanical"});}
  // A pump needs an actual receiver: the useful arrangement includes a vessel.
  if(form==="piston"){result.parts.push({form:"vessel",material:"clay",size:1.5,thickness:.25,orientation:0});result.links.push({from:index,to:result.parts.length-1,port:"water"});}
  return result;
}
function siteFor(input: PrivatePolicyInput, parts: DevelopmentPrimitive[]) {
  const water=input.agent.observations.filter(o=>o.kind==="resource"&&o.facts.resourceKind==="freshwater"&&o.position).sort((a,b)=>distance(input.agent.position,a.position!)-distance(input.agent.position,b.position!))[0];
  let center={...input.agent.position};
  if(parts.some(p=>p.form==="piston")&&water?.position)center={...water.position};
  for(let attempt=0;attempt<12;attempt++) {
    const position={x:center.x+Math.cos(attempt*Math.PI/6)*2,z:center.z+Math.sin(attempt*Math.PI/6)*2};
    if(position.x<input.bounds.minX+5||position.x>input.bounds.maxX-5||position.z<input.bounds.minZ+5||position.z>input.bounds.maxZ-5)continue;
    if(depthAt(observedWater(input.agent.observations),position)>0)continue;
    if((input.components??[]).some(c=>distance(c.position,position)<c.size+2))continue;
    if(input.agent.observations.some(o=>o.kind==="structure"&&o.position&&distance(o.position,position)<Number(o.facts.width??1)+1))continue;
    return position;
  }
  return null;
}
function makeCandidate(input: PrivatePolicyInput, goal: DevelopmentGoal, assembly: Assembly, variant: number, procedure?: DevelopmentProcedure): DevelopmentCandidate | null {
  const mind=input.agent.developmentMind!, origin=siteFor(input,assembly.parts); if(!origin)return null;
  const operations:DevelopmentOperation[]=[], available=[...(input.materialBatches??[])];
  for(const [index,part] of assembly.parts.entries()) {
    const batchIds:string[]=[];
    if(part.material==="metal"||part.material==="ceramic") {const batchIndex=available.findIndex(b=>b.massEstimate>=componentMass(part)&&(part.material==="metal"?["bloom","tool"].includes(b.kind):b.kind==="ceramic"));if(batchIndex<0)return null;batchIds.push(available.splice(batchIndex,1)[0].id);}
    operations.push({kind:"form",...part,position:{x:origin.x+(index%3)*1.8,z:origin.z+Math.floor(index/3)*1.8},batchIds});
  }
  for(const link of assembly.links) {
    let metalBatchId:string|undefined;
    if(link.port==="electric"){const index=available.findIndex(b=>["bloom","tool"].includes(b.kind)&&b.massEstimate>=.05);if(index<0)return null;metalBatchId=available.splice(index,1)[0].id;}
    operations.push({kind:"connect",from:`$${link.from}`,to:`$${link.to}`,port:link.port,...(metalBatchId?{metalBatchId}:{})});
  }
  if(procedure)operations.push(...structuredClone(procedure.finishing));
  else for(const [index,part]of assembly.parts.entries()) {
    if(part.form==="bed")operations.push({kind:"plant",componentId:`$${index}`,seeds:.1},{kind:"transfer",componentId:`$${index}`,resource:"freshwater",amount:1,direction:"deposit"});
    if(part.form==="rack")operations.push({kind:"transfer",componentId:`$${index}`,resource:"food",amount:.5,direction:"deposit"});
    if(part.form==="chamber")operations.push({kind:"transfer",componentId:`$${index}`,resource:"wood",amount:.5,direction:"deposit"},{kind:"transfer",componentId:`$${index}`,resource:"freshwater",amount:.5,direction:"deposit"});
    if(variant>=2&&part.form==="vessel"&&part.material==="clay")operations.push({kind:"treat",componentId:`$${index}`,fuel:2,temperature:900});
  }
  const target=Math.max(0,assembly.parts.findIndex(p=>componentMetric(p.form)===goal.metric));
  if(goal.metric==="knowledge") {const procedure=mind.procedures.find(p=>p.successes>0);if(procedure)operations.push({kind:"document",componentId:`$${target}`,procedureId:procedure.id});}
  operations.push({kind:"test",componentId:`$${target}`,dose:.5});
  const prediction=predictDevelopment(mind,assembly.parts[target]);
  const resources:Partial<SurvivalInventory>={};
  for(const part of assembly.parts)if(!["metal","ceramic"].includes(part.material)){const key=part.material as keyof SurvivalInventory;resources[key]=(resources[key]??0)+componentMass(part);}
  resources.fiber=(resources.fiber??0)+assembly.links.length*.15;
  for(const op of operations){if(op.kind==="transfer"&&op.direction==="deposit")resources[op.resource]=(resources[op.resource]??0)+op.amount;if(op.kind==="treat")resources.wood=(resources.wood??0)+op.fuel;if(op.kind==="plant")resources.food=(resources.food??0)+op.seeds;}
  if(assembly.parts[target].form==="vessel")resources.freshwater=(resources.freshwater??0)+.5;
  let travel=distance(input.agent.position,origin)/2, gather=0;const materialCost=Object.values(resources).reduce((n,v)=>n+v,0);
  for(const [kind,amount] of Object.entries(resources))if(input.agent.inventory[kind as keyof SurvivalInventory]<amount!){const source=input.agent.observations.find(o=>o.facts.resourceKind===kind&&Number(o.facts.availableEstimate)>0&&o.position);if(!source)return null;travel+=2*distance(origin,source.position!)/2;gather+=Math.ceil((amount!-input.agent.inventory[kind as keyof SurvivalInventory])/1.5)*2;}
  const ticks=operations.reduce((n,op)=>n+operationDuration(op),0)+travel+gather+(assembly.parts[target].form==="bed"?120:0), effort=operations.reduce((n,op)=>n+operationEffort(op),0);
  const completeCost=ticks*.12+materialCost*.8+effort*.6;
  const optimistic=goal.benefit*Math.min(1,prediction.value+prediction.uncertainty)-completeCost;
  const pessimistic=goal.benefit*Math.max(0,prediction.value-prediction.uncertainty)-completeCost;
  const info=optimistic>0&&pessimistic<0?Math.min(4,Math.min(optimistic,-pessimistic)*.3):0;
  const score=goal.benefit*prediction.value-completeCost+info+affectDecisionAdjustment(input.agent.affect,"develop_capability",prediction.uncertainty,info,Math.min(...Object.values(input.agent.needs)));
  return {id:`proposal-${goal.id}-${variant}`,goalId:goal.id,label:`Test ${assembly.parts.map(p=>`${p.material} ${p.form}`).join(" + ")} against the recurring ${goal.metric.replaceAll("_"," ")} cost`,score:round(score),prediction:prediction.value,uncertainty:prediction.uncertainty,informationValue:info,ticks:Math.ceil(ticks),materialCost:round(materialCost),rejection:effort>goal.budget-goal.spent?"Remaining effort budget cannot pay the whole intervention.":ticks>180?"Complete travel, acquisition and work exceeds the planning horizon.":null,operations,parts:assembly.parts,links:assembly.links};
}
function boundOperation(op: DevelopmentOperation, bindings: string[]): DevelopmentOperation {
  const copy=structuredClone(op);for(const field of ["componentId","from","to"] as const)if(field in copy){const value=(copy as unknown as Record<string,string>)[field];if(value.startsWith("$"))(copy as unknown as Record<string,string>)[field]=bindings[Number(value.slice(1))]??value;}return copy;
}
function actionFor(input: PrivatePolicyInput, operation: DevelopmentOperation): PlannedAction | null {
  let position="position"in operation?operation.position:"componentId"in operation?input.components?.find(c=>c.id===operation.componentId)?.position:input.components?.find(c=>c.id===operation.from)?.position;
  if(operation.kind==="connect"){const to=input.components?.find(c=>c.id===operation.to);if(position&&to)position={x:(position.x+to.position.x)/2,z:(position.z+to.position.z)/2};}
  let resource:keyof SurvivalInventory|undefined,needed=0;
  if(operation.kind==="form"&&!["metal","ceramic"].includes(operation.material)){resource=operation.material as keyof SurvivalInventory;needed=componentMass(operation);}
  if(operation.kind==="connect"){resource="fiber";needed=.15;}
  if(operation.kind==="transfer"&&operation.direction==="deposit"){resource=operation.resource;needed=operation.amount;}
  if(operation.kind==="plant"){resource="food";needed=operation.seeds+.6;}
  if(operation.kind==="treat"){resource="wood";needed=operation.fuel;}
  if(operation.kind==="repair"){resource=input.agent.inventory.fiber<.2?"fiber":"wood";needed=.2;}
  if(operation.kind==="test"&&input.components?.find(c=>c.id===operation.componentId)?.form==="vessel"){resource="freshwater";needed=operation.dose+.5;}
  if(resource&&input.agent.inventory[resource]<needed){const source=input.agent.observations.filter(o=>o.kind==="resource"&&o.facts.resourceKind===resource&&Number(o.facts.availableEstimate)>0&&o.position).sort((a,b)=>distance(a.position!,input.agent.position)-distance(b.position!,input.agent.position))[0];if(!source)return null;position=source.position!;return distance(input.agent.position,position)>2?{action:"move",targetId:source.subjectId,destination:position,duration:1}:{action:resource==="freshwater"?"collect":"gather",targetId:source.subjectId,destination:null,duration:1};}
  if(position && distance(input.agent.position,position)>2.7)return {action:"move",targetId:null,destination:{...position},duration:1,arrivalRadius:2.1};
  if(operation.kind==="form"&&position&&distance(input.agent.position,position)<operation.size*.4+.5){
    const candidates=Array.from({length:8},(_,i)=>({x:position!.x+Math.cos(i*Math.PI/4)*2,z:position!.z+Math.sin(i*Math.PI/4)*2}));
    const bank=candidates.find(p=>!depthAt(observedWater(input.agent.observations),p)&&!(input.components??[]).some(c=>distance(c.position,p)<c.size*.4+.5));
    if(!bank)return null;return {action:"move",targetId:null,destination:bank,duration:1,arrivalRadius:.5};
  }
  if(operation.kind==="test"&&input.components?.find(c=>c.id===operation.componentId)?.form==="bed"&&Number(input.components.find(c=>c.id===operation.componentId)?.food)<.05)return null;
  return {action:operation.kind==="test"?"test_material":"process_material",targetId:"componentId"in operation?operation.componentId:null,destination:null,duration:operationDuration(operation),developmentOperation:operation};
}

export function planDevelopment(input: PrivatePolicyInput, ordinary: LocalPlanChoice[]): LocalPlanChoice | null {
  const mind=input.agent.developmentMind; if(!mind)return null;
  mind.expansions=0;reviewProblems(input);
  if(["none","fixed"].includes(input.agent.discovery?.mode??"directed"))return null;
  const lowest=Math.min(...Object.values(input.agent.needs));
  if(input.tick-mind.experimentWindow>=144){mind.experimentWindow=input.tick;mind.experimentalEffort=0;}
  if(lowest<55||depthAt(observedWater(input.agent.observations),input.agent.position)>0){for(const goal of mind.goals)if(goal.status==="active")goal.status="deferred";return null;}
  if(mind.active){const active=mind.active,goal=mind.goals.find(g=>g.id===active.goalId);if(!goal||goal.spent>=goal.budget||input.tick-active.startedAt>576){if(goal){goal.status="abandoned";goal.retryAt=input.tick+144;}mind.active=null;}
    else{goal.status="active";const op=active.candidate.operations[active.cursor];if(op){if(active.additionalMotivation&&mind.experimentalEffort+operationEffort(op)>DEVELOPMENT_LIMITS.dailyExperimentEffort){goal.status="deferred";return null;}const action=actionFor(input,boundOperation(op,active.bindings));if(action && (ordinary[0]?.candidate.score??0)<effectiveScore(active.candidate,active.additionalMotivation)+1.5)return choice(active.candidate,action,goal,active.additionalMotivation);goal.status="deferred";return null;}}
  }
  const candidates:DevelopmentCandidate[]=[];
  const ordinaryScore=ordinary[0]?.candidate.score??0;
  for(const goal of mind.goals.filter(g=>["active","deferred"].includes(g.status)&&g.retryAt<=input.tick).sort((a,b)=>b.urgency-a.urgency).slice(0,3)) {
    for(const c of (input.components??[]).filter(c=>componentMetric(c.form)===goal.metric&&input.tick-c.observedAt<36).slice(0,2)){
      const proof=mind.evidence.find(e=>e.componentId===c.id&&e.source==="personal");
      if(proof&&c.condition>=.4)continue;
      const repair=c.condition<.4&&proof&&proof.value>.05;
      if(repair&&(input.agent.inventory.wood<.2||input.agent.inventory.fiber<.2))continue;
      if(c.form==="rack"&&c.food<.5||c.form==="vessel"&&c.water+.5>c.size**3*(1-c.thickness))continue;
      const prediction=predictDevelopment(mind,c,c.treatment),operations:DevelopmentOperation[]=[...(repair?[{kind:"repair" as const,componentId:c.id}]:[]),{kind:"test",componentId:c.id,dose:.5}];
      const ticks=operations.length+Math.ceil(distance(input.agent.position,c.position)/2),cost=ticks*.12+(repair?.4:0)+.6;
      candidates.push({id:`${repair?"repair":"reuse"}-${c.id}`,goalId:goal.id,label:`${repair?"Repair and test":"Test and consider reusing"} an observed ${c.form} instead of making another`,score:goal.benefit*prediction.value-cost,prediction:prediction.value,uncertainty:prediction.uncertainty,informationValue:1,ticks,materialCost:repair?.4:0,rejection:null,operations,parts:[{form:c.form,material:c.material,size:c.size,thickness:c.thickness,orientation:c.orientation}],links:[]});
    }
    const readable=input.components?.find(c=>c.documentId&&!mind.procedures.some(p=>p.id===c.documentId));
    if(goal.metric==="knowledge"&&readable)candidates.push({id:`read-${readable.id}`,goalId:goal.id,label:"Read observed documented evidence instead of repeating an unknown trial",score:6,prediction:.5,uncertainty:.7,informationValue:2,ticks:1,materialCost:0,rejection:null,operations:[{kind:"read",componentId:readable.id}],parts:[{form:readable.form,material:readable.material,size:readable.size,thickness:readable.thickness,orientation:readable.orientation}],links:[]});
    for(let variant=0;variant<4;variant++){const assembly=composeCapability(input,goal.metric,variant);if(!assembly)continue;const candidate=makeCandidate(input,goal,assembly,variant);if(candidate)candidates.push(candidate);}
    for(const procedure of mind.procedures.filter(p=>p.metric===goal.metric&&p.successes>p.failures).slice(-2)){const candidate=makeCandidate(input,goal,{parts:structuredClone(procedure.parts),links:structuredClone(procedure.links)},10+candidates.length,procedure);if(candidate){candidate.id=`reuse-${procedure.id}`;candidate.label=`Adapt a measured ${goal.metric.replaceAll("_"," ")} procedure to this site`;candidates.push(candidate);}}
  }
  const ranked=candidates.filter(c=>!c.rejection).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
  let selected=ranked.find(c=>c.score>ordinaryScore+.5);
  const survivalChoice=!!selected;
  if(!selected&&input.discoveryObjective&&mind.experimentalEffort<DEVELOPMENT_LIMITS.dailyExperimentEffort)selected=ranked.find(c=>c.informationValue>1&&c.score+c.informationValue>ordinaryScore&&c.operations.reduce((n,op)=>n+operationEffort(op),0)<=DEVELOPMENT_LIMITS.dailyExperimentEffort-mind.experimentalEffort);
  if(selected&&input.agent.discovery?.mode==="random") {
    const selectedEffort=selected.operations.reduce((n,op)=>n+operationEffort(op),0);
    const matched=ranked.filter(c=>c.ticks<=selected!.ticks&&c.materialCost<=selected!.materialCost&&c.operations.reduce((n,op)=>n+operationEffort(op),0)<=selectedEffort);
    if(matched.length)selected=matched[Math.floor(survivalUnit(input.seed,input.tick,"development-matched-test")*matched.length)];
  }
  mind.decision={tick:input.tick,selectedId:selected?.id??null,candidates:candidates.slice(0,DEVELOPMENT_LIMITS.candidates).map(c=>({...c,rejection:c.rejection??(selected?.id===c.id?null:`Lower net value than ${selected?.id??"ordinary survival / do not test"}.`)})),omitted:Math.max(0,candidates.length-DEVELOPMENT_LIMITS.candidates),reason:selected?"Chosen using private evidence, uncertain outcomes, and complete travel, material and work estimates.":"No affordable experiment currently improves on ordinary survival or abstaining."};
  if(!selected)return null;
  const goal=mind.goals.find(g=>g.id===selected.goalId)!;goal.status="active";
  const required=selected.parts.flatMap(p=>COMPONENT_AFFORDANCES[p.form].needs).find(m=>m!==goal.metric);
  if(required)addGoal(input,required,`A proposed ${goal.metric.replaceAll("_"," ")} improvement needs this supporting capability.`,goal.evidenceIds,goal.benefit,goal.id);
  mind.active={goalId:goal.id,candidate:structuredClone(selected),cursor:0,bindings:[],startedAt:input.tick,additionalMotivation:!survivalChoice};
  if (!survivalChoice && mind.decision) mind.decision.reason += " The separately selected discovery objective adds bounded information value to this proposal; the base survival score remains recorded.";
  const action=actionFor(input,selected.operations[0]);return action?choice(selected,action,goal,!survivalChoice):null;
}
const effectiveScore = (candidate: DevelopmentCandidate, additionalMotivation: boolean) => candidate.score + (additionalMotivation ? candidate.informationValue + .5 : 0);
function choice(candidate:DevelopmentCandidate,action:PlannedAction,goal:DevelopmentGoal,additionalMotivation=false):LocalPlanChoice{return {developmentGoalId:goal.id,candidate:{goal:"develop_capability",targetId:action.targetId,score:effectiveScore(candidate,additionalMotivation),expectedBenefit:goal.benefit*candidate.prediction,risk:candidate.uncertainty,knownObservationIds:[],summary:`${candidate.label}. Predicted effect ${candidate.prediction.toFixed(2)}, uncertainty ${candidate.uncertainty.toFixed(2)}; ${candidate.ticks} estimated steps including prerequisites.${additionalMotivation?` The explicit discovery objective adds ${(candidate.informationValue+.5).toFixed(2)} score units, subject to its daily effort limit.`:""}`,predictedSteps:candidate.ticks,planActions:[action.action]},actions:[action],uncertainty:candidate.uncertainty};}

export function learnDevelopment(agent:SurvivalAgent,op:DevelopmentOperation,result:DevelopmentReading,tick:number) {
  const mind=agent.developmentMind;if(!mind)return;
  const active=mind.active,goal=active&&mind.goals.find(g=>g.id===active.goalId);
  if(goal){goal.spent+=result.effort;goal.updatedAt=tick;}
  if(result.accepted&&active?.additionalMotivation)mind.experimentalEffort+=result.effort;
  if(result.evidence){const e=result.evidence; if(!mind.seenEvidence.includes(e.originalId)) {
    mind.seenEvidence=[...mind.seenEvidence,e.originalId].slice(-512);mind.evidence.push(structuredClone(e));if(mind.evidence.length>DEVELOPMENT_LIMITS.evidence){mind.evidence.shift();mind.prunedEvidence++;}
    if(agent.discovery?.mode==="frozen") {
      // Keep the outcome, paid costs, failures and program progress. Only learned
      // expectation/procedure parameters are frozen in this evaluation arm.
      const shadow={...agent,developmentMind:{...mind,seenEvidence:[...mind.seenEvidence]}};
      learnDevelopment(shadow,op,{...result,evidence:null,effort:0},tick);
      Object.assign(mind,{active:shadow.developmentMind.active,goals:shadow.developmentMind.goals});return;
    }
    const key=modelKey(e,e.treatment);let model=mind.models.find(m=>m.key===key);if(!model){model={key,mean:0,m2:0,samples:0,evidenceIds:[]};mind.models.push(model);mind.models=mind.models.slice(-DEVELOPMENT_LIMITS.models);}const delta=e.value-model.mean;model.samples++;model.mean+=delta/model.samples;model.m2+=delta*(e.value-model.mean);model.evidenceIds=[...model.evidenceIds,e.originalId].slice(-12);
    if(active){const existing=mind.procedures.find(p=>p.metric===e.metric&&JSON.stringify(p.parts)===JSON.stringify(active.candidate.parts));if(existing){if(result.success)existing.successes++;else existing.failures++;existing.expected=model.mean;existing.uncertainty=Math.max(.15,.6/Math.sqrt(Math.max(1,existing.successes)));existing.evidenceIds=[...existing.evidenceIds,e.originalId].slice(-12);}else if(result.success&&active.candidate.operations.some(o=>o.kind==="form"))mind.procedures=[...mind.procedures,{id:freshId(mind,agent.id,"procedure"),authorId:agent.id,learnedAt:tick,metric:e.metric,parts:structuredClone(active.candidate.parts),links:structuredClone(active.candidate.links),finishing:structuredClone(active.candidate.operations.filter(o=>!["form","connect","test","document"].includes(o.kind))),evidenceIds:[e.originalId],successes:1,failures:0,expected:e.value,uncertainty:.6,duration:active.candidate.ticks,conditions:e.conditions}].slice(-DEVELOPMENT_LIMITS.procedures);}
  }}
  if(!active||!goal)return;
  if(!result.accepted||!result.success){goal.failures++;goal.retryAt=tick+12; if(!result.accepted||op.kind==="test"){goal.status=goal.failures>=3?"abandoned":"deferred";mind.active=null;}}
  if(result.accepted&&mind.active){if(op.kind==="form"&&result.componentId)active.bindings.push(result.componentId);active.cursor++;if(active.cursor>=active.candidate.operations.length){goal.status=result.success&&(op.kind!=="test"||result.value>=goal.target)?"satisfied":"deferred";goal.retryAt=tick+(goal.status==="satisfied"?144:12);for(const child of mind.goals.filter(g=>g.parentId===goal.id)){child.status=goal.status;child.updatedAt=tick;child.retryAt=goal.retryAt;}mind.active=null;}}
}

/** Voluntary cooperation calls this only after acceptance. Sharing never grants
 * supplies or turns testimony into personal measurements. */
export function shareDevelopmentProcedure(from:SurvivalAgent,to:SurvivalAgent,tick:number):boolean {
  const procedure=from.developmentMind?.procedures.find(p=>p.successes>p.failures&&!to.developmentMind?.procedures.some(q=>q.id===p.id));
  if(!procedure||!to.developmentMind)return false;
  to.developmentMind.procedures=[...to.developmentMind.procedures,{...structuredClone(procedure),uncertainty:Math.max(.45,procedure.uncertainty)}].slice(-DEVELOPMENT_LIMITS.procedures);
  for(const e of from.developmentMind!.evidence.filter(e=>procedure.evidenceIds.includes(e.originalId)).slice(-2))if(!to.developmentMind.seenEvidence.includes(e.originalId)) {to.developmentMind.seenEvidence=[...to.developmentMind.seenEvidence,e.originalId].slice(-512);to.developmentMind.evidence=[...to.developmentMind.evidence,{...structuredClone(e),observerId:to.id,receivedAt:tick,source:"testimony" as const}].slice(-DEVELOPMENT_LIMITS.evidence);}
  return true;
}
