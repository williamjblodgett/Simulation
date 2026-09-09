import fs from "node:fs";
import crypto from "node:crypto";
import { createSurvivalRun, advanceSurvivalRun, validateSurvivalRun } from "../app/simulation/survival/index.ts";
import { advanceSurvivalRun as advanceBaseline } from "../app/simulation/survival/baseline-engine.ts";

// Development and validation use separate seed sets. Validation was rerun after
// independent correctness fixes; see IMPLEMENTATION_REPORT.md for that boundary.
const holdout = process.argv.includes("--holdout");
const seeds = [1,2,3,4].map(i => holdout ? `validation-sep09-final-${i}` : `holdout-sep09-${i}`);
const thresholds = { health:25, hydration:14, nutrition:12, warmth:8, safety:5 };
const totals = {}, rows = [];
const fingerprints = Object.fromEntries(["engine","baseline-engine","planner","experiments","physiology"].map(name => [name, crypto.createHash("sha256").update(fs.readFileSync(new URL(`../app/simulation/survival/${name}.ts`,import.meta.url))).digest("hex").slice(0,12)]));
console.log(JSON.stringify({ type:"configuration", seeds, thresholds, steps:432, resources:"scarce", climate:"harsh", fingerprints, note:"Critical ticks count any listed need below threshold. Failure labels are not comparable efficiency measures. Replacement lives do not count as original survivors." }));
for (const seed of seeds) for (const count of [1,3,5]) {
  const original=createSurvivalRun(seed,{agentCount:count,agentCap:count,durationHours:72,resourceAbundance:"scarce",climateVolatility:"harsh"});
  for (const policy of ["baseline","v2","no_learning"]) {
    let state=structuredClone(original),critical=0,failures=0;
    if(policy==="baseline") state.policyVersion=1;
    const initialIds=new Set(state.agents.map(a=>a.id)),contexts=new Map(),criticalByNeed=Object.fromEntries(Object.keys(thresholds).map(k=>[k,0]));
    const started=performance.now();
    for(let step=0;step<432&&state.status==="running";step++) {
      const result=policy==="baseline"?advanceBaseline(state,1):advanceSurvivalRun(state,1);state=result.state;
      for(const agent of state.agents) if(initialIds.has(agent.id)&&agent.alive) {
        if(Object.entries(thresholds).some(([need,threshold])=>agent.needs[need]<threshold)) critical++;
        for(const [need,threshold] of Object.entries(thresholds)) if(agent.needs[need]<threshold) criticalByNeed[need]++;
      }
      for(const event of result.events) if(event.type==="action_outcome"&&event.facts.success===false) {
        failures++; const key=[event.agentIds.join(","),event.facts.action,event.facts.targetId].join(":");contexts.set(key,(contexts.get(key)??0)+1);
      }
      if(policy==="no_learning") for(const agent of state.agents) agent.learning=[];
    }
    const initial=state.agents.filter(a=>initialIds.has(a.id));
    const row={seed,count,policy,survivors:initial.filter(a=>a.alive).length,lifeHours:initial.reduce((sum,a)=>sum+(a.diedAt??432)/6,0),critical,criticalByNeed,failures,repeated:[...contexts.values()].reduce((sum,n)=>sum+Math.max(0,n-1),0),ms:Math.round(performance.now()-started),introduced:state.agents.length,valid:validateSurvivalRun(state),topFailures:[...contexts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,3)};
    rows.push(row); console.log(JSON.stringify({type:"scenario",...row}));
    const aggregate=totals[policy]??={agents:0,survivors:0,lifeHours:0,critical:0,failures:0,repeated:0,ms:0,invalid:0};
    aggregate.agents+=count;for(const key of ["survivors","lifeHours","critical","failures","repeated","ms"]) aggregate[key]+=row[key];aggregate.invalid+=Number(!row.valid);
  }
}
console.log(JSON.stringify({type:"totals",totals}));
const outputIndex=process.argv.indexOf("--output");
if(outputIndex>=0) fs.writeFileSync(process.argv[outputIndex+1],JSON.stringify({seeds,thresholds,fingerprints,rows,totals},null,2));
if(rows.some(row=>!row.valid)) process.exitCode=1;
