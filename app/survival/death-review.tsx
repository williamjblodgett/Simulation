"use client";

import { History } from "lucide-react";
import type { SurvivalAgent, SurvivalRunState } from "../simulation/survival";
import styles from "./survival-experience.module.css";

export function DeathReview({agent,world}:{agent:SurvivalAgent;world:SurvivalRunState}) {
  if(agent.alive)return null;
  const record=agent.survivalRecord;
  const time=(tick:number|null|undefined)=>tick==null?"Not recorded":`Day ${Math.floor(tick*world.config.stepMinutes/1440)+1} · ${String(Math.floor(tick*world.config.stepMinutes%1440/60)).padStart(2,"0")}:${String(tick*world.config.stepMinutes%60).padStart(2,"0")}`;
  const water=agent.observations.filter(o=>o.kind==="resource"&&o.facts.resourceKind==="freshwater"&&o.facts.researchEvidence!==true);
  return <section className={`${styles.recordSection} ${styles.deathReview}`} aria-label={`Death review for ${agent.label}`}>
    <header><History size={18}/><div><span>Death review</span><small>Recorded evidence · no inferred thoughts</small></div></header>
    <p><strong>{agent.causeOfDeath}</strong> · {time(agent.diedAt)}</p>
    {record?<>
      <dl className={styles.rowList}>
        <div><dt>Last successful drink</dt><dd>{record.lastDrinkAt===null?"None in measured record":time(record.lastDrinkAt)}</dd></div>
        <div><dt>Last successful meal</dt><dd>{record.lastMealAt===null?"None in measured record":time(record.lastMealAt)}</dd></div>
        <div><dt>Blocked movements</dt><dd>{record.blockedMoves}</dd></div>
        <div><dt>Own requests refused</dt><dd>{record.refusedRequests}</dd></div>
      </dl>
      <p className={styles.emptyCopy}>Measurements began {time(record.since)}. Counts cover that interval; earlier actions are not reconstructed.</p>
      {record.samples.length?<details className={styles.decisionAlternatives}><summary>Need history · {record.samples.length} measurements</summary><div className={styles.needHistory}><table><caption>Hourly values and final measurement. Higher is better.</caption><thead><tr><th scope="col">Time</th><th scope="col">Health</th><th scope="col">Water</th><th scope="col">Food</th><th scope="col">Warmth</th></tr></thead><tbody>{record.samples.map(s=><tr key={s.tick}><th scope="row">{time(s.tick)}</th><td>{Math.round(s.health)}</td><td>{Math.round(s.hydration)}</td><td>{Math.round(s.nutrition)}</td><td>{Math.round(s.warmth)}</td></tr>)}</tbody></table></div></details>:null}
      {record.incidents.length?<details className={styles.decisionAlternatives}><summary>Recent consumption and failures</summary><ol>{record.incidents.map((r,i)=><li key={`${r.tick}-${i}`}><small>{time(r.tick)} · {r.success?"Confirmed":"Unsuccessful"}</small><p>{r.summary}</p></li>)}</ol></details>:null}
    </>:<p className={styles.emptyCopy}>This life predates detailed survival measurements. Its Timeline is preserved; missing measurements cannot be reconstructed.</p>}
    <details className={styles.decisionAlternatives}><summary>Water sources in this agent’s last observations · {water.length}</summary>{water.length?<ul>{water.map(o=><li key={o.id}><strong>{o.subjectId}</strong><p>Observed {time(o.observedAt)} · estimated stock {String(o.facts.availableEstimate??"unknown")}</p></li>)}</ul>:<p>No water observation was retained.</p>}<small>Remembered stock is not proof of current availability or a traversable route.</small></details>
    <details className={styles.decisionAlternatives}><summary>Final recorded plan</summary><p>{agent.currentDeliberation?.recordedIntent??"No decision was recorded."}</p><ol>{agent.currentPlan?.steps.map(step=><li key={step.id}>{step.action} · {step.status}</li>)}</ol></details>
  </section>;
}
