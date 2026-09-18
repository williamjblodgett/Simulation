import fs from "node:fs";
import {createHash} from "node:crypto";
import {performance} from "node:perf_hooks";
import {createSurvivalRun,advanceSurvivalRun,validateSurvivalRun} from "../app/simulation/survival/engine.ts";

const evaluation=process.argv.includes("--evaluation"),long=process.argv.includes("--long"),discovery=process.argv.includes("--discovery");
const option=key=>process.argv.find(s=>s.startsWith(`${key}=`))?.slice(key.length+1);
const tag=option("--tag");
if(tag&&!/^[a-z0-9-]{1,32}$/.test(tag))throw new Error("A result tag must contain only 1-32 lowercase letters, digits or hyphens.");
const modes=option("--mode")?[option("--mode")]:evaluation?["directed","frozen","random","none","fixed"]:["directed"];
const seeds=evaluation?["workshop-holdout-estuary-926","workshop-holdout-ridge-713","workshop-holdout-cove-584"]:["workshop-regression-1","workshop-regression-3","workshop-regression-5"];
const scenarios=long?[{seed:"workshop-endurance-168",agentCount:3,resourceAbundance:"balanced",climateVolatility:"variable",hours:168}]:seeds.map((seed,i)=>({seed,agentCount:[1,3,5][i],resourceAbundance:i===2?"scarce":"balanced",climateVolatility:i===1?"harsh":"variable",hours:72}));
const source=new URL("../app/simulation/survival/",import.meta.url),fingerprint=createHash("sha256").update(fs.readdirSync(source).filter(f=>f.endsWith(".ts")).sort().map(f=>f+fs.readFileSync(new URL(f,source),"utf8")).join("\n")).digest("hex");
const suffix=[evaluation?"evaluation":"regression",long?"long":null,option("--mode")??"matrix",discovery?"discovery":"survival",tag].filter(Boolean).join("-");
const results=[],started=new Date().toISOString();
const flush=()=>fs.writeFileSync(new URL(`../docs/workshop-${suffix}.json`,import.meta.url),JSON.stringify({started,sourceBaseline:"50b0b35473e60a2cdc139cf48a28a998529d0ce3",fingerprint,protocol:"DEVELOPMENT_EVALUATION.md",environment:"Node on shared Windows desktop; wall time, not browser FPS.",results},null,2)+"\n");
for(const scenario of scenarios)for(const mode of modes){
  console.log(JSON.stringify({starting:scenario.seed,mode,hours:scenario.hours}));
  let world=createSurvivalRun(scenario.seed,{...scenario,durationHours:null,policyVersion:4,materialFoundation:"geology-v1",knowledgeFoundation:"materials-v1",affectModel:"adaptive-v1",developmentModel:"open-workshop-v1",discoveryObjective:discovery,continuity:false});
  for(const a of world.agents)a.discovery.mode=mode;
  const before=performance.now(),times=[],lastBlocked=new Map(),seenEvidence=new Set(),trace=[];
  let failure=null,failedActions=0,blocked=0,repeatedBlocked=0,maxBytes=0,squaredError=0,measurements=0,expansions=0,adaptations=0;
  const decisions=new Map();
  try{
    while(world.status==="running"&&world.tick<scenario.hours*6){const at=performance.now(),result=advanceSurvivalRun(world,1);world=result.state;times.push(performance.now()-at);
      for(const e of result.events){
        if(e.type==="action_outcome"&&typeof e.facts.action==="string"&&e.facts.success===false){failedActions++;if(e.facts.action==="move"){blocked++;const id=e.agentIds.join(),signature=`${e.facts.targetId}:${e.summary}`;if(lastBlocked.get(id)===signature)repeatedBlocked++;lastBlocked.set(id,signature);}}
        if(e.facts.operation==="development"&&e.facts.measurement){const m=JSON.parse(e.facts.measurement);if(!seenEvidence.has(m.originalId)){seenEvidence.add(m.originalId);measurements++;squaredError+=(m.value-m.predicted)**2;if(Math.abs(m.value-m.predicted)>.15)adaptations++;if(trace.length<12)trace.push({tick:e.tick,agentId:e.agentIds[0],goalId:e.facts.goalId,evidenceId:m.originalId,predicted:m.predicted,measured:m.value,result:e.outcome});}}
      }
      for(const a of world.agents)if(a.currentDeliberation?.id!==decisions.get(a.id)){decisions.set(a.id,a.currentDeliberation?.id);expansions+=a.developmentMind.expansions;}
      if(world.tick%36===0){if(!validateSurvivalRun(world))throw new Error(`Invalid checkpoint at tick ${world.tick}`);maxBytes=Math.max(maxBytes,Buffer.byteLength(JSON.stringify(world)));}
    }
    if(!validateSurvivalRun(world))throw new Error("Invalid final checkpoint");
  }catch(e){failure=String(e?.stack??e);process.exitCode=1;}
  times.sort((a,b)=>a-b);const d=world.development;
  const row={...scenario,mode,discovery,status:failure?"error":world.status,tick:world.tick,survivors:world.stats.livingAgents,deaths:world.agents.filter(a=>!a.alive).map(a=>({id:a.id,hour:a.diedAt/6,cause:a.causeOfDeath})),failedActions,blocked,repeatedBlocked,development:d.metrics,components:d.components.map(c=>({form:c.form,material:c.material,condition:c.condition,water:c.water,food:c.food,output:c.output})),physicalTests:world.physical.tests,materialTests:world.materials.tests,materialOperations:world.materials.operations,physicalWork:world.physical.workEnergy,goals:world.agents.flatMap(a=>a.developmentMind.goals.map(g=>({agentId:a.id,metric:g.metric,status:g.status,spent:g.spent,failures:g.failures}))),models:world.agents.reduce((n,a)=>n+a.developmentMind.models.length,0),procedures:world.agents.reduce((n,a)=>n+a.developmentMind.procedures.length,0),measurements,squaredError,contradictoryMeasurements:adaptations,planningExpansions:expansions,waste:d.waste,water:d.water,energy:d.energy,trace,valid:validateSurvivalRun(world),wallMs:Math.round(performance.now()-before),stepP50:times[Math.floor(times.length*.5)],stepP95:times[Math.floor(times.length*.95)],maxStep:times.at(-1),maxCheckpointBytes:Math.max(maxBytes,Buffer.byteLength(JSON.stringify(world))),heapBytes:process.memoryUsage().heapUsed,residentBytes:process.memoryUsage().rss,failure};
  results.push(row);flush();console.log(JSON.stringify({seed:row.seed,mode,status:row.status,survivors:row.survivors,components:row.components.length,tests:row.measurements,valid:row.valid,wallMs:row.wallMs,failure}));
}
