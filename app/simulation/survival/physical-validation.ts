import type { SurvivalRunState } from "./types";
import type { Manipulation } from "./physical-types";
import { MATERIALS, PHYSICAL_LIMITS, partMass } from "./physical-world";

const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
const finite=(v:unknown,lo=-Infinity,hi=Infinity):v is number=>typeof v==="number"&&Number.isFinite(v)&&v>=lo&&v<=hi;
const integer=(v:unknown,lo=0):v is number=>finite(v,lo)&&Number.isInteger(v);
const vector=(v:unknown,lo=-Infinity,hi=Infinity)=>record(v)&&["x","y","z"].every(k=>finite(v[k],lo,hi));
const material=(v:unknown)=>typeof v==="string"&&Object.hasOwn(MATERIALS,v);
const id=(v:unknown)=>typeof v==="string"&&/^part-[1-9]\d*$/.test(v);
export function validManipulation(v:unknown,placeholder=false):v is Manipulation {
  if(!record(v))return false;
  const part=(n:unknown)=>id(n)||(placeholder&&typeof n==="string"&&(n==="$new"||/^\$(?:input)?[0-9]$/.test(n)));
  switch(v.kind){
    case "shape":return material(v.material)&&finite(v.mass,0.001,12)&&vector(v.size,0.06,4)&&(v.hollow===undefined||finite(v.hollow,0,0.7));
    case "place":return part(v.partId)&&vector(v.position)&&finite(v.rotation);
    case "split":return part(v.partId)&&finite(v.fraction,0.1,0.9);
    case "join":return part(v.a)&&part(v.b)&&v.a!==v.b&&finite(v.fiber,0.001,12);
    case "detach":return typeof v.jointId==="string"&&/^joint-[1-9]\d*$/.test(v.jointId);
    case "mix":return part(v.a)&&part(v.b)&&v.a!==v.b;
    case "heat":return part(v.partId)&&finite(v.fuel,0.001,2);
    case "test":return part(v.partId)&&["load","retention","protection"].includes(String(v.measure))&&finite(v.dose,0.001,5);
    case "reclaim":return part(v.partId);
    default:return false;
  }
}

/** Fail closed before a saved instruction can enter the executor. No old study is migrated here. */
export function validatePhysicalState(state:SurvivalRunState):boolean {
  if(state.policyVersion!==3&&state.policyVersion!==4)return state.physical===undefined&&state.agents.every(a=>a.physicalMind===undefined&&a.currentPlan?.steps.every(s=>s.manipulation===undefined)!==false);
  const w=state.physical;
  if(!record(w)||w.version!==1||!integer(w.nextId,1)||!finite(w.workEnergy,0)||!integer(w.tests)||!Array.isArray(w.parts)||w.parts.length>160||!Array.isArray(w.joints)||w.joints.length>240||!record(w.spent))return false;
  if(typeof state.config.continuity!=="boolean"||(!state.config.continuity&&state.succession!==undefined))return false;
  if(Object.entries(w.spent).some(([k,v])=>!["wood","fiber","clay","stone","freshwater","food","herbs"].includes(k)||!finite(v,0)))return false;
  const seen=new Set<string>(),lives=new Set(state.agents.map(a=>a.id));
  for(const p of w.parts){
    if(!record(p)||!id(p.id)||seen.has(p.id)||!lives.has(p.makerId)||!integer(p.createdAt)||p.createdAt>state.tick||!record(p.composition)||!Object.keys(p.composition).length)return false;
    seen.add(p.id);if(Number(p.id.slice(5))>=w.nextId)return false;
    if(Object.entries(p.composition).some(([k,v])=>!material(k)||!finite(v,0.000001)))return false;
    if(!vector(p.size,0.06,PHYSICAL_LIMITS.maxDimension)||!vector(p.position)||!finite(p.rotation)||!finite(p.condition,0,1)||!finite(p.hollow,0,0.7)||!finite(p.water,0)||!finite(p.temperature,-100,1e7)||typeof p.supported!=="boolean"||!integer(p.revision,1))return false;
    if(p.peakTemperature!==undefined&&!finite(p.peakTemperature,-100,1e7))return false;
    if(p.sources!==undefined&&(!Array.isArray(p.sources)||!p.sources.every(s=>typeof s==="string")))return false;
    if(p.position.y<p.size.y/2-0.001||p.position.y>5||p.position.x<state.environment.bounds.minX-4||p.position.x>state.environment.bounds.maxX+4||p.position.z<state.environment.bounds.minZ-4||p.position.z>state.environment.bounds.maxZ+4)return false;
    const volume=Object.entries(p.composition).reduce((n,[k,m])=>n+m/MATERIALS[k as keyof typeof MATERIALS].density,0);
    if(Math.abs(p.size.x*p.size.y*p.size.z*(1-p.hollow)-volume)>volume*0.031||partMass(p)>24||p.water>p.size.x*p.size.y*p.size.z*p.hollow*2+0.001)return false;
  }
  const partIds=new Set(seen);
  for(const j of w.joints){if(!record(j)||typeof j.id!=="string"||!/^joint-[1-9]\d*$/.test(j.id)||seen.has(j.id)||!partIds.has(j.a)||!partIds.has(j.b)||j.a===j.b||!finite(j.fiber,0.001,12)||!finite(j.condition,0,1)||Number(j.id.slice(6))>=w.nextId)return false;seen.add(j.id);}
  for(const a of state.agents){
    if(a.technologies.length||a.research.length)return false;
    const m=a.physicalMind;
    if(!record(m)||![1,2].includes(m.version)||typeof m.learningEnabled!=="boolean"||!(m.namedAt===null||integer(m.namedAt)&&m.namedAt>=a.spawnedAt&&m.namedAt<=state.tick)||!Array.isArray(m.nameEvidence)||!m.nameEvidence.every(x=>typeof x==="string"))return false;
    if(m.uses!==undefined&&(!Array.isArray(m.uses)||m.uses.length>32||m.uses.some(u=>!record(u)||typeof u.id!=="string"||!integer(u.tick)||u.tick>state.tick||!id(u.partId)||!integer(u.revision,1)||!record(u.position)||!finite(u.position.x)||!finite(u.position.z)||!["rest","shelter","warm"].includes(u.action)||typeof u.weather!=="string"||!finite(u.temperature)||!finite(u.warmthBefore,0,100)||!finite(u.warmthAfter,0,100)||!finite(u.protection,0,1))))return false;
    if(!Array.isArray(m.readings)||m.readings.length>64||!Array.isArray(m.estimates)||m.estimates.length>12||!Array.isArray(m.procedures)||m.procedures.length>16||!Array.isArray(m.projects)||m.projects.length>8)return false;
    const readingIds=new Set<string>();
    for(const r of m.readings){if(!record(r)||typeof r.id!=="string"||readingIds.has(r.id)||!integer(r.tick)||r.tick>state.tick||r.observerId!==a.id||!id(r.partId)||!material(r.material)||!vector(r.size,0.06,4)||!record(r.position)||!finite(r.position.x)||!finite(r.position.z)||!finite(r.rotation)||!finite(r.mass,0)||!finite(r.condition,0,1)||!finite(r.before,0)||!finite(r.after,0)||!finite(r.dose,0,5)||!finite(r.temperature)||typeof r.weather!=="string"||!finite(r.confidence,0,1)||!["test","observation","demonstration"].includes(r.source)||!["protection","load","retention"].includes(r.metric)||typeof r.summary!=="string")return false;readingIds.add(r.id);}
    for(const e of m.estimates)if(!record(e)||!material(e.material)||!["protection","load","retention"].includes(e.metric)||!finite(e.mean,0)||!finite(e.variance,0)||!integer(e.samples,1)||!Array.isArray(e.evidenceIds)||!e.evidenceIds.every(x=>typeof x==="string"))return false;
    for(const p of m.procedures)if(!record(p)||typeof p.id!=="string"||!integer(p.learnedAt)||p.learnedAt>state.tick||!material(p.material)||!vector(p.sizePerMass,0.06,4)||!vector(p.relativePosition)||!finite(p.mass,0.001,12)||!finite(p.rotation)||!finite(p.effect,0,1)||!finite(p.uncertainty,0,1)||!integer(p.successes)||!integer(p.failures)||!Array.isArray(p.evidenceIds)||!record(p.conditions)||!finite(p.conditions.minTemperature)||!finite(p.conditions.maxTemperature)||!Array.isArray(p.conditions.weather)||(p.program!==undefined&&(!Array.isArray(p.program)||p.program.length>24||!p.program.every(o=>validManipulation(o,true)))))return false;
    for(const p of m.projects)if(!record(p)||typeof p.id!=="string"||!integer(p.createdAt)||p.createdAt>state.tick||!integer(p.updatedAt)||p.updatedAt>state.tick||!integer(p.lastReviewAt)||p.lastReviewAt>state.tick||p.metric!=="exposure"||!finite(p.target,0,1)||!finite(p.baseline,0,1)||!["active","interrupted","satisfied","abandoned"].includes(p.status)||typeof p.reason!=="string"||!record(p.position)||!finite(p.position.x)||!finite(p.position.z)||!record(p.reserved)||Object.entries(p.reserved).some(([k,v])=>!material(k)||!finite(v,0))||!Array.isArray(p.operations)||p.operations.length>24||!p.operations.every(o=>validManipulation(o,true))||!integer(p.cursor)||p.cursor>p.operations.length||!Array.isArray(p.partIds)||!p.partIds.every(id)||!finite(p.predictedBenefit)||!finite(p.spentEffort,0)||!integer(p.revisions))return false;
    for(const p of m.projects){
      if(p.blocker!==undefined&&(typeof p.blocker!=="string"||p.blocker.length>500))return false;
      if(p.failures!==undefined&&!integer(p.failures))return false;
      if(p.retryAt!==undefined&&!integer(p.retryAt))return false;
      if(p.history!==undefined&&(!Array.isArray(p.history)||p.history.length>16||p.history.some(h=>!record(h)||!integer(h.tick)||h.tick>state.tick||!["paused","resumed","revised","blocked","measured"].includes(h.kind)||typeof h.summary!=="string"||h.summary.length>500)))return false;
    }
    for(const s of a.currentPlan?.steps??[])if(s.manipulation!==undefined&&(!validManipulation(s.manipulation)||!["build","test_hypothesis"].includes(s.action)))return false;
    const snapshot=a.currentDeliberation?.physicalEvidenceSnapshot;
    if(snapshot!==undefined&&(!Array.isArray(snapshot)||snapshot.length>8||snapshot.some(r=>!record(r)||r.observerId!==a.id||typeof r.id!=="string"||!integer(r.tick)||r.tick>a.currentDeliberation!.decidedAt||!id(r.partId)||!["test","observation","demonstration"].includes(r.source)||!["protection","load","retention"].includes(r.metric)||!finite(r.before,0)||!finite(r.after,0)||!finite(r.confidence,0,1)||typeof r.summary!=="string")))return false;
    for(const o of a.observations.filter(o=>o.facts.structureKind==="physical_part")){
      const f=o.facts;
      if(!o.position||!material(f.material)||![f.width,f.height,f.depth].every(n=>finite(n,0.06,4))||!finite(f.elevation,0,5)||!finite(f.rotation)||!finite(f.condition,0,100)||!finite(f.mass,0)||!finite(f.hollow,0,0.7)||!finite(f.storedWater,0)||typeof f.bindingIds!=="string")return false;
      try{const bindings:unknown=JSON.parse(f.bindingIds);if(!Array.isArray(bindings)||!bindings.every(v=>typeof v==="string"&&/^joint-[1-9]\d*$/.test(v)))return false;}catch{return false;}
    }
  }
  return true;
}
