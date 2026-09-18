import { componentForms, componentMaterials } from "./development-catalog";
import { DEVELOPMENT_LIMITS, type DevelopmentProcedure } from "./development-types";
import { capacity, compatiblePort, validDevelopmentOperation } from "./development-world";
import { feedstockKinds, feedstockMass } from "./geology";
import type { SurvivalRunState } from "./types";

const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
const num=(v:unknown,lo=0,hi=Infinity):v is number=>typeof v==="number"&&Number.isFinite(v)&&v>=lo&&v<=hi;
const integer=(v:unknown,lo=0,hi=Infinity)=>num(v,lo,hi)&&Number.isInteger(v);
const text=(v:unknown,limit=2000):v is string=>typeof v==="string"&&v.length<=limit;
const list=(v:unknown,limit:number):v is unknown[]=>Array.isArray(v)&&v.length<=limit;
const strings=(v:unknown,limit=16)=>list(v,limit)&&v.every(x=>text(x,200));
const metric=(v:unknown)=>["water_access","food_reliability","protection","work_effort","mechanical","electric","energy_storage","regulation","knowledge"].includes(String(v));
const stock=(v:unknown)=>obj(v)&&Object.entries(v).every(([k,n])=>["wood","stone","fiber","clay"].includes(k)&&num(n));
const feeds=(v:unknown)=>obj(v)&&Object.entries(v).every(([k,n])=>feedstockKinds.includes(k as never)&&num(n));
function primitive(v:unknown){return obj(v)&&componentForms.includes(v.form as never)&&componentMaterials.includes(v.material as never)&&num(v.size,.6,3)&&num(v.thickness,.1,.65)&&num(v.orientation,-Math.PI*2,Math.PI*2);}
function program(parts:unknown,links:unknown){return list(parts,12)&&parts.length>0&&parts.every(primitive)&&list(links,16)&&links.every(l=>obj(l)&&integer(l.from,0,parts.length-1)&&integer(l.to,0,parts.length-1)&&l.from!==l.to&&compatiblePort((parts[Number(l.from)] as {form:never}).form,(parts[Number(l.to)] as {form:never}).form,l.port as never));}
function procedure(v:unknown,tick:number):v is DevelopmentProcedure{return obj(v)&&text(v.id,200)&&text(v.authorId,200)&&integer(v.learnedAt,0,tick)&&metric(v.metric)&&program(v.parts,v.links)&&list(v.finishing,DEVELOPMENT_LIMITS.operations)&&v.finishing.every(op=>validDevelopmentOperation(op)&&!["form","connect","document"].includes(op.kind))&&strings(v.evidenceIds,12)&&integer(v.successes)&&integer(v.failures)&&num(v.expected)&&num(v.uncertainty,0,1)&&num(v.duration)&&text(v.conditions);}
function candidate(v:unknown){return obj(v)&&text(v.id,300)&&text(v.goalId,200)&&text(v.label)&&num(v.score,-1e6,1e6)&&num(v.prediction)&&num(v.uncertainty,0,1)&&num(v.informationValue)&&integer(v.ticks)&&num(v.materialCost)&&(v.rejection===null||text(v.rejection))&&list(v.operations,DEVELOPMENT_LIMITS.operations)&&v.operations.every(validDevelopmentOperation)&&program(v.parts,v.links);}

/** Reject unknown versions, dangling ownership and non-conservative stores before
 * a checkpoint can replace the last known good study. */
export function validateDevelopment(state:SurvivalRunState):boolean {
  try {
    if(!state.config.developmentModel)return state.config.discoveryObjective===undefined&&state.development===undefined&&state.agents.every(a=>a.developmentMind===undefined&&(a.currentPlan?.steps??[]).every(s=>s.developmentOperation===undefined))&&(state.materials?.batches??[]).every(b=>b.installedIn===undefined);
    if(state.config.developmentModel!=="open-workshop-v1"||state.schemaVersion!==8||state.policyVersion!==4||state.config.knowledgeFoundation!=="materials-v1"||typeof state.config.discoveryObjective!=="boolean")return false;
    const w=state.development;if(!obj(w)||w.version!==1||!integer(w.nextId,1)||!list(w.components,DEVELOPMENT_LIMITS.components)||!list(w.links,DEVELOPMENT_LIMITS.links)||!stock(w.debited)||!stock(w.waste)||!feeds(w.wasteFeedstocks))return false;
    const lives=new Set(state.agents.map(a=>a.id)),ids=new Set<string>(),installed=new Set<string>(),bounds=state.environment.bounds;
    const position=(p:unknown)=>obj(p)&&num(p.x,bounds.minX,bounds.maxX)&&num(p.z,bounds.minZ,bounds.maxZ);
    for(const c of w.components){
      if(!obj(c)||!text(c.id,200)||!/^component-[1-9]\d*$/.test(c.id)||ids.has(c.id)||!lives.has(String(c.makerId))||!integer(c.createdAt,0,state.tick)||!integer(c.revision,1)||!primitive(c)||!position(c.position)||!num(c.condition,0,1)||!["raw","fired","glassy","alloyed"].includes(String(c.treatment))||![c.efficiency,c.leakage,c.insulation,c.precision,c.setting].every(n=>num(n,0,1))||![c.water,c.food,c.charge,c.fuel,c.seedMass,c.growth,c.power,c.output].every(n=>num(n))||typeof c.enabled!=="boolean"||!(c.damage===null||text(c.damage))||!stock(c.stock)||!feeds(c.feedstocks)||feedstockMass(c.feedstocks)>Number(c.stock.stone??0)+.001||!strings(c.batchIds,3)||!(c.document===null||procedure(c.document,state.tick)))return false;
      ids.add(c.id);for(const batch of c.batchIds){if(installed.has(batch))return false;installed.add(batch);if(!state.materials?.batches.some(b=>b.id===batch&&b.installedIn===c.id&&!b.portable))return false;}
      if(c.seedMass>.5||[c.water,c.food,c.charge,c.fuel].some(n=>n>capacity(c)+.001))return false;
    }
    for(const l of w.links){
      if(!obj(l)||!text(l.id,200)||!/^connection-[1-9]\d*$/.test(l.id)||ids.has(l.id)||!text(l.from,200)||!text(l.to,200)||l.from===l.to||!w.components.some(c=>c.id===l.from)||!w.components.some(c=>c.id===l.to)||!num(l.condition,0,1)||!num(l.fiber,.15,.15)||!compatiblePort(w.components.find(c=>c.id===l.from)!.form,w.components.find(c=>c.id===l.to)!.form,l.port as never))return false;
      ids.add(l.id);if(l.metalBatchId!==null){if(!text(l.metalBatchId,200)||installed.has(l.metalBatchId)||!state.materials?.batches.some(b=>b.id===l.metalBatchId&&b.installedIn===l.id&&!b.portable))return false;installed.add(l.metalBatchId);}if(l.port==="electric"&&l.metalBatchId===null)return false;
      if(l.port!=="electric"&&l.metalBatchId!==null)return false;
    }
    if((state.materials?.batches??[]).some(b=>b.installedIn!==undefined&&(!ids.has(b.installedIn)||!installed.has(b.id))))return false;
    if([...ids].some(id=>Number(id.split("-").at(-1))>=w.nextId))return false;
    // Linear-time cycle check over the combined energy graph, including paths
    // crossing generator/motor ports. Per-port checks miss those cycles.
    const degree=new Map(w.components.map(c=>[c.id,0])),outgoing=new Map(w.components.map(c=>[c.id,[] as string[]]));
    for(const link of w.links.filter(l=>["mechanical","electric"].includes(l.port))){degree.set(link.to,degree.get(link.to)!+1);outgoing.get(link.from)!.push(link.to);}
    const queue=[...degree].filter(([,n])=>n===0).map(([id])=>id);let visited=0;
    for(let i=0;i<queue.length;i++){visited++;for(const to of outgoing.get(queue[i])!){degree.set(to,degree.get(to)!-1);if(degree.get(to)===0)queue.push(to);}}
    if(visited!==w.components.length)return false;
    for(const [ledger,fields] of [[w.water,["deposited","withdrawn","extracted","leaked","irrigated"]],[w.food,["deposited","withdrawn","grown","spoiled","seeds"]],[w.energy,["wind","heat","delivered","lost","fuelConsumed"]],[w.metrics,["operations","rejected","tests","transfers","repairs","runningTicks"]]] as const)if(!obj(ledger)||fields.some(k=>!num((ledger as unknown as Record<string,unknown>)[k]))||Object.values(ledger).some(n=>!num(n)))return false;
    for(const k of ["wood","stone","fiber","clay"] as const){const sum=w.components.reduce((n,c)=>n+(c.stock[k]??0)+(k==="wood"?c.fuel:0),0)+(w.waste[k]??0)+(k==="fiber"?w.links.reduce((n,l)=>n+l.fiber,0):0);if(Math.abs(sum-(w.debited[k]??0))>.005)return false;}
    if(Math.abs(w.water.deposited+w.water.extracted-w.water.withdrawn-w.water.leaked-w.water.irrigated-w.components.reduce((n,c)=>n+c.water,0))>.01)return false;
    if(Math.abs(w.food.deposited+w.food.grown-w.food.withdrawn-w.food.spoiled-w.components.reduce((n,c)=>n+c.food,0))>.01)return false;
    if(Math.abs(w.food.seeds-w.components.reduce((n,c)=>n+c.seedMass,0))>.001)return false;
    if(Math.abs(w.energy.wind+w.energy.heat-w.energy.lost-w.energy.delivered-w.components.reduce((n,c)=>n+c.charge,0))>.01)return false;
    for(const a of state.agents){
      for(const o of a.observations.filter(o=>o.facts.structureKind==="development_component")){
        const f=o.facts;if(!o.position||!position(o.position)||!componentForms.includes(f.developmentForm as never)||!componentMaterials.includes(f.material as never)||!num(f.componentSize,.6,3)||!num(f.thickness,.1,.65)||!num(f.condition,0,100)||![f.width,f.height,f.depth].every(n=>num(n,.06,4))||![f.storedWater,f.storedFood,f.storedCharge,f.output].every(n=>num(n))||!num(f.rotation,-Math.PI*2,Math.PI*2)||!(f.documentId===null||text(f.documentId,200)))return false;
      }
      const m=a.developmentMind;if(!a.alive&&m===undefined)continue;
      if(!obj(m)||m.version!==1||!integer(m.nextId,1)||!list(m.goals,DEVELOPMENT_LIMITS.goals)||!list(m.evidence,DEVELOPMENT_LIMITS.evidence)||!list(m.models,DEVELOPMENT_LIMITS.models)||!list(m.procedures,DEVELOPMENT_LIMITS.procedures)||!strings(m.seenEvidence,512)||!integer(m.prunedEvidence)||!integer(m.lastReviewAt,-6,state.tick)||!integer(m.experimentWindow,0,state.tick)||!num(m.experimentalEffort)||!integer(m.expansions,0,DEVELOPMENT_LIMITS.expansions)||!list(m.materialGoalHistory,16))return false;
      if(m.materialGoalHistory.some(h=>!obj(h)||!text(h.id,200)||!text(h.status,50)||!integer(h.endedAt,0,state.tick)||!text(h.reason)))return false;
      const goals=new Set<string>();for(const g of m.goals){if(!obj(g)||!text(g.id,200)||goals.has(g.id)||!metric(g.metric)||!(g.parentId===null||goals.has(String(g.parentId)))||!text(g.origin)||!strings(g.evidenceIds,12)||!integer(g.createdAt,0,state.tick)||!integer(g.updatedAt,g.createdAt,state.tick)||!["active","deferred","satisfied","abandoned"].includes(g.status)||![g.target,g.benefit,g.urgency,g.spent,g.budget].every(n=>num(n))||g.urgency>1||!integer(g.retryAt)||!integer(g.failures)||!text(g.lastEvidence,3000))return false;goals.add(g.id);}
      for(const e of m.evidence)if(!obj(e)||!text(e.id,200)||!text(e.originalId,200)||e.observerId!==a.id||!integer(e.tick,0,state.tick)||!integer(e.receivedAt,Math.max(e.tick,a.spawnedAt),state.tick)||!["personal","testimony","document"].includes(e.source)||!componentForms.includes(e.form)||!componentMaterials.includes(e.material)||!num(e.size,.6,3)||!num(e.thickness,.1,.65)||!metric(e.metric)||![e.value,e.predicted,e.uncertainty].every(n=>num(n))||!text(e.conditions)||!text(e.summary))return false;
      if(m.models.some(v=>!obj(v)||!text(v.key,200)||!num(v.mean)||!num(v.m2)||!integer(v.samples,1)||!strings(v.evidenceIds,12))||m.procedures.some(p=>!procedure(p,state.tick)))return false;
      if(m.active!==null&&(!obj(m.active)||!goals.has(m.active.goalId)||!candidate(m.active.candidate)||!integer(m.active.cursor,0,m.active.candidate.operations.length)||!strings(m.active.bindings,12)||!integer(m.active.startedAt,0,state.tick)||typeof m.active.additionalMotivation!=="boolean"))return false;
      if(m.decision!==null&&(!obj(m.decision)||!integer(m.decision.tick,0,state.tick)||!(m.decision.selectedId===null||text(m.decision.selectedId,300))||!list(m.decision.candidates,DEVELOPMENT_LIMITS.candidates)||!m.decision.candidates.every(candidate)||!integer(m.decision.omitted)||!text(m.decision.reason)))return false;
      for(const step of a.currentPlan?.steps??[])if(step.developmentOperation!==undefined&&(!validDevelopmentOperation(step.developmentOperation)||!["process_material","test_material"].includes(step.action)))return false;
    }
    return true;
  }catch{return false;}
}
