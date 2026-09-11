"use client";
import type { SurvivalAgent, SurvivalRunState } from "../simulation/survival/types";
import { feedstockKinds, GEOLOGICAL_FEEDSTOCKS, geologicalHoldings } from "../simulation/survival/geology";
import { MATERIAL_MECHANISM_PRIORS } from "../simulation/survival/material-catalog";
import { humanize } from "./presentation";
import styles from "./survival-experience.module.css";

/** Observer diagnostics only; raw-stock identities are not agent assays. */
export function MaterialWorldRecord({ world }: { world: SurvivalRunState }) {
  if (!world.geology) return <details><summary>Raw-material world · preserved original endowment</summary><p>This study has not received extra deposits. New studies include 28 finite raw-mineral families for future material-processing work; existing studies and histories are unchanged.</p></details>;
  return <details className={styles.materialRecord}><summary>Raw-material world · {feedstockKinds.length} finite mineral families</summary>
    <p>Observer geology, not agent knowledge. These deposits hold raw rock, not refined metals or unlocked inventions. Agents encounter local appearances and can collect material; chemical identities below are not supplied to their planner.</p>
    <p>Ore-bearing material is included in the existing stone mass, not additional inventory. It remains accounted for in carried stock, constructed parts and remnants. Deposits do not regenerate.</p>
    {world.materials ? <p><strong>First processing mechanisms are executable.</strong> Agents can test carbon preparation, mineral separation, fired heat containment, copper/iron reduction, hot working, ceramics and degrading tools. Exact grades and operating thresholds remain hidden world truth. Powered machinery, electricity and semiconductor manufacture still require additional physical rules; time alone unlocks nothing.</p> : <p><strong>Modern technology is not executable in this preserved study.</strong> Configure a new run to use the first material-process rules. Powered machinery, electrical circuits and semiconductor manufacturing still need later world rules.</p>}
    <dl className={styles.rowList}>{feedstockKinds.map(kind => {
      const site = world.environment.resources.find(s => s.feedstock === kind);
      const held = geologicalHoldings(world.agents, world.physical?.parts ?? [], kind);
      const processed = world.materials?.batches.reduce((sum,batch)=>sum+(batch.provenance.feedstocks?.[kind]??0),0)??0;
      return <div key={kind}><dt>{GEOLOGICAL_FEEDSTOCKS[kind].label}<small>{GEOLOGICAL_FEEDSTOCKS[kind].potential}</small></dt><dd>{site?.quantity.toFixed(1) ?? "Unavailable"} in ground<br/><small>{held.carried.toFixed(1)} carried · {held.embodied.toFixed(1)} in parts · {processed.toFixed(1)} processed/remnant</small></dd></div>;
    })}</dl>
    <small>Amounts are normalized raw bulk-material units, not kilograms of refined product. Air and separated gases are not an inventory; this is not a full element or chemical system.</small>
  </details>;
}

export function AgentMaterialRecord({ world, agent }: { world: SurvivalRunState; agent: SurvivalAgent }) {
  if (!agent.materialMind || !world.materials) return null;
  const batches = world.materials.batches.filter(batch => batch.ownerId === agent.id && !["exhaust","gangue","slag","scale"].includes(batch.kind));
  const latest = agent.materialMind.experiments.at(-1), goal = agent.materialMind.goal;
  return <section className={styles.recordSection}>
    <header><div><span>Material problem solving</span><small>Private expectations · physically executed consequences</small></div></header>
    {goal ? <div className={styles.materialGoal} data-status={goal.status}><span>{humanize(goal.status)} · survival-derived goal</span><strong>Reduce recurring physical work cost</strong><p>{goal.reason}</p><small>Criterion: {goal.criterion}</small></div> : <p className={styles.emptyCopy}>No material capability goal has outweighed ordinary survival actions yet.</p>}
    {latest ? <details className={styles.decisionAlternatives}><summary>Latest material hypothesis · {humanize(latest.status)}</summary><p>{latest.claim}</p><p><strong>Decision it could change:</strong> {latest.decisionAffected}</p><p><strong>Before-action prediction:</strong> useful effect {latest.prediction.usefulEffect.toFixed(2)}; uncertainty {latest.prediction.uncertainty.toFixed(2)}. This is not a calibrated probability.</p><p>{latest.result ?? "The intervention has not completed."}</p>{latest.readingId?<small>Personal measurement {latest.readingId}</small>:null}</details> : null}
    <details className={styles.decisionAlternatives}><summary>Observed processed batches · {batches.length}</summary>{batches.length?<dl className={styles.rowList}>{batches.map(batch=><div key={batch.id}><dt>{humanize(batch.kind)}{batch.form?<small>{humanize(batch.form)}</small>:null}</dt><dd>{batch.mass.toFixed(2)} mass units<br/><small>{batch.durability===null?`${Math.round(batch.quality*100)}% observer-measured quality`:`${batch.durability.toFixed(1)} durability · ${batch.uses} uses`}</small></dd></div>)}</dl>:<p>No retained processed batch.</p>}<small>Batch chemistry and provenance shown here are observer diagnostics; the policy receives only coarse observations of its own reachable batches.</small></details>
    <details className={styles.decisionAlternatives}><summary>Authored mechanism priors · {MATERIAL_MECHANISM_PRIORS.length}</summary><p>These broad starting relationships define what can be considered. They do not include exact grades, thresholds, yields or a successful sequence.</p><ul>{MATERIAL_MECHANISM_PRIORS.map(prior=><li key={prior.id}><strong>{humanize(prior.id)} · <small>{humanize(prior.domain)}</small></strong><p>{prior.statement}</p></li>)}</ul></details>
    <details className={styles.decisionAlternatives}><summary>Personal evidence · {agent.materialMind.evidence.length}</summary>{[...agent.materialMind.evidence].reverse().slice(0,8).map(evidence=><div key={evidence.id}><strong>{humanize(evidence.operation)} · {humanize(evidence.reading.metric)}</strong><p>{evidence.interpretation}</p><small>{evidence.reading.value.toFixed(2)} {humanize(evidence.reading.unit)} · step {evidence.tick}</small></div>)}</details>
    <small>{agent.materialMind.procedures.length} parameterized procedures retained. Reuse still executes every operation and pays full costs.</small>
  </section>;
}

export function RawFeedstockRecord({ agent }: { agent: SurvivalAgent }) {
  const carried = feedstockKinds.filter(kind => (agent.rawFeedstocks?.[kind] ?? 0) > .001);
  if (!carried.length) return null;
  return <details className={styles.decisionAlternatives}><summary>Observer mineral provenance · included in carried stone</summary>
    <p>Raw-rock identity from the world ledger, not a chemical measurement made by this agent. These amounts are already included in stone above.</p>
    <dl className={styles.rowList}>{carried.map(kind => <div key={kind}><dt>{GEOLOGICAL_FEEDSTOCKS[kind].label}</dt><dd>{agent.rawFeedstocks![kind]!.toFixed(2)}</dd></div>)}</dl>
  </details>;
}
