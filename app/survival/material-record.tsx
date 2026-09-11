"use client";
import type { SurvivalAgent, SurvivalRunState } from "../simulation/survival/types";
import { feedstockKinds, GEOLOGICAL_FEEDSTOCKS, geologicalHoldings } from "../simulation/survival/geology";
import styles from "./survival-experience.module.css";

/** Observer diagnostics only; raw-stock identities are not agent assays. */
export function MaterialWorldRecord({ world }: { world: SurvivalRunState }) {
  if (!world.geology) return <details><summary>Raw-material world · preserved original endowment</summary><p>This study has not received extra deposits. New studies include 28 finite raw-mineral families for future material-processing work; existing studies and histories are unchanged.</p></details>;
  return <details className={styles.materialRecord}><summary>Raw-material world · {feedstockKinds.length} finite mineral families</summary>
    <p>Observer geology, not agent knowledge. These deposits hold raw rock, not refined metals or unlocked inventions. Agents encounter local appearances and can collect material; chemical identities below are not supplied to their planner.</p>
    <p>Ore-bearing material is included in the existing stone mass, not additional inventory. It remains accounted for in carried stock, constructed parts and remnants. Deposits do not regenerate.</p>
    <p><strong>Modern technology is not yet executable.</strong> Refining, powered machinery, electrical circuits and semiconductor manufacturing still need physical rules. More simulation time does not unlock them.</p>
    <dl className={styles.rowList}>{feedstockKinds.map(kind => {
      const site = world.environment.resources.find(s => s.feedstock === kind);
      const held = geologicalHoldings(world.agents, world.physical?.parts ?? [], kind);
      return <div key={kind}><dt>{GEOLOGICAL_FEEDSTOCKS[kind].label}<small>{GEOLOGICAL_FEEDSTOCKS[kind].potential}</small></dt><dd>{site?.quantity.toFixed(1) ?? "Unavailable"} in ground<br/><small>{held.carried.toFixed(1)} carried · {held.embodied.toFixed(1)} in parts</small></dd></div>;
    })}</dl>
    <small>Amounts are normalized raw bulk-material units, not kilograms of refined product. Air and separated gases are not an inventory; this is not a full element or chemical system.</small>
  </details>;
}

export function RawFeedstockRecord({ agent }: { agent: SurvivalAgent }) {
  const carried = feedstockKinds.filter(kind => (agent.rawFeedstocks?.[kind] ?? 0) > .001);
  if (!carried.length) return null;
  return <details className={styles.decisionAlternatives}><summary>Observer mineral provenance · included in carried stone</summary>
    <p>Raw-rock identity from the world ledger, not a chemical measurement made by this agent. These amounts are already included in stone above.</p>
    <dl className={styles.rowList}>{carried.map(kind => <div key={kind}><dt>{GEOLOGICAL_FEEDSTOCKS[kind].label}</dt><dd>{agent.rawFeedstocks![kind]!.toFixed(2)}</dd></div>)}</dl>
  </details>;
}
