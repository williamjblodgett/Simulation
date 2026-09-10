import fs from "node:fs";
import { performance } from "node:perf_hooks";
import { createSurvivalRun, advanceSurvivalRun, validateSurvivalRun } from "../app/simulation/survival/engine.ts";

const holdout=process.argv.includes("--holdout"),quick=process.argv.includes("--quick");
const seeds=holdout?["recovery-holdout-coast-91","recovery-holdout-valley-57","recovery-holdout-basin-83"]:["construction-review-1","survival-audit-1","survival-audit-2","survival-audit-3"];
const scenarios=quick?[{seed:"survival-audit-3",agentCount:3,resourceAbundance:"balanced",climateVolatility:"variable",durationHours:20}]:holdout?seeds.flatMap(seed=>[1,3,5].map(agentCount=>({seed,agentCount,resourceAbundance:seed.includes("valley")?"scarce":"balanced",climateVolatility:seed.includes("basin")?"harsh":"variable",durationHours:72}))):seeds.map(seed=>({seed,agentCount:3,resourceAbundance:"balanced",climateVolatility:"variable",durationHours:72}));
const results=[];
for(const scenario of scenarios){
  let world=createSurvivalRun(scenario.seed,{...scenario,policyVersion:3,continuity:false});
  const durations=[];let blocked=0,refused=0,decisions=0;
  const started=performance.now();
  while(world.status==="running"){
    const before=performance.now(),result=advanceSurvivalRun(world,1);world=result.state;durations.push(performance.now()-before);
    for(const e of result.events){if(e.facts.action==="move"&&e.facts.success===false)blocked++;if(e.type==="social_refused")refused++;if(e.type==="decision_recorded")decisions++;}
    if(quick&&world.tick%24===0)console.log(JSON.stringify({progress:world.tick,living:world.stats.livingAgents,lastStepMs:durations.at(-1)}));
  }
  durations.sort((a,b)=>a-b);
  const row={...scenario,survivors:world.stats.livingAgents,deaths:world.agents.filter(a=>!a.alive).map(a=>({id:a.id,cause:a.causeOfDeath,hour:a.diedAt/6})),blocked,refused,decisions,valid:validateSurvivalRun(world),wallMs:Math.round(performance.now()-started),stepP50:Math.round(durations[Math.floor(durations.length*.5)]),stepP95:Math.round(durations[Math.floor(durations.length*.95)]),maxStep:Math.round(durations.at(-1))};
  results.push(row);console.log(JSON.stringify(row));
}
if(!quick)fs.writeFileSync(new URL(`../docs/survival-recovery-${holdout?"holdout":"development"}.json`,import.meta.url),JSON.stringify({measuredOn:new Date().toISOString(),environment:"Node.js on Windows desktop; wall times are not real-device rendering measurements",results},null,2)+"\n");
