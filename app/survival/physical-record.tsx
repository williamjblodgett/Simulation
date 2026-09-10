"use client";
import { FlaskConical, Hammer } from "lucide-react";
import type { SurvivalAgent } from "../simulation/survival";
import { humanize } from "./presentation";
import styles from "./survival-experience.module.css";
import { currentProject } from "./construction-record";

export function ProjectSummary({agent,onInspect}:{agent:SurvivalAgent;onInspect?(id:string):void}){
  if(!agent.physicalMind)return null;
  const p=currentProject(agent);
  return <section className={styles.projectSummary} aria-label="Current construction project"><span><Hammer size={16}/> Construction</span><h3>{p?"Reduce weather exposure":"No active project"}</h3>
    {p?<><p>{humanize(p.status)} · {Math.min(p.cursor,p.operations.length)} of {p.operations.length} operations completed</p><strong>{p.blocker?`Last planning note: ${p.blocker}`:(p.status==="satisfied"?"The measured target was met; this is not proof of a complete building.":p.reason)}</strong><div className={styles.partButtons}>{p.partIds.slice(-4).map(id=><button type="button" key={id} onClick={()=>onInspect?.(id)} disabled={!onInspect}>Inspect part {id.replace("part-","")}</button>)}</div></>:<p>No construction project has been selected. Survival choices remain the agent’s decision.</p>}
  </section>;
}

export function PhysicalRecord({agent,onInspect}:{agent:SurvivalAgent;onInspect?(id:string):void}){
  const mind=agent.physicalMind;if(!mind)return null;
  return <>
    <section className={styles.recordSection}><header><Hammer size={17}/><div><span>Self-proposed projects</span><small>Survival predictions, not assigned construction jobs</small></div></header>
      {!mind.projects.length?<p>No physical investment has yet outweighed this agent’s immediate survival alternatives.</p>:null}
      {[...mind.projects].reverse().map(p=><details key={p.id} className={styles.decisionAlternatives} open={p.status==="active"||p.status==="interrupted"}><summary>{humanize(p.status)} · Reduce exposure · step {Math.min(p.cursor+1,p.operations.length)}/{p.operations.length}</summary><p>{p.reason}</p><dl className={styles.rowList}><div><dt>Proposed protection</dt><dd>{Math.round(p.target*100)}%</dd></div><div><dt>Effort spent</dt><dd>{p.spentEffort.toFixed(1)}</dd></div><div><dt>Parts</dt><dd>{p.partIds.join(", ")||"None yet"}</dd></div><div><dt>Material reservation</dt><dd>{Object.entries(p.reserved).map(([k,n])=>`${n.toFixed(1)} ${k}`).join(", ")||"None"}</dd></div></dl><ol>{p.operations.map((o,i)=><li key={i}>{humanize(o.kind)}{o.kind==="shape"?` ${o.material} · ${o.mass.toFixed(2)} units`:"partId"in o?` ${o.partId}`:""} · {i<p.cursor?"attempted":"proposed"}</li>)}</ol></details>)}
    </section>
    <section className={styles.recordSection}><h3>Project recovery</h3>{[...mind.projects].reverse().slice(0,3).map(p=><div key={p.id}>{p.blocker?<p className={styles.projectBlocker}>{p.blocker}</p>:null}<div className={styles.partButtons}>{p.partIds.map(id=><button type="button" key={id} disabled={!onInspect} onClick={()=>onInspect?.(id)}>Inspect part {id.replace("part-","")}</button>)}</div>{p.history?.slice(-4).map((h,i)=><p key={i}>Day {Math.floor(h.tick/144)+1} · {humanize(h.kind)} · {h.summary}</p>)}</div>)}</section>
    <section className={styles.recordSection}><header><FlaskConical size={17}/><div><span>Physical evidence</span><small>Measured consequences with conditions and uncertainty</small></div></header>
      {!mind.readings.length?<p>No physical measurements recorded yet.</p>:null}
      <ol className={styles.observationList}>{[...mind.readings].reverse().slice(0,8).map(r=><li key={r.id}><span>Day {Math.floor(r.tick/144)+1} · {r.source}</span><strong>{r.partId} · {humanize(r.metric)}</strong><small>{r.summary} {r.temperature.toFixed(1)}°C · {humanize(r.weather)}. This is a modeled measurement, not proof of a general invention.</small></li>)}</ol>
      <details className={styles.decisionAlternatives}><summary>Learned procedures · {mind.procedures.length}</summary>{mind.procedures.map(p=><div key={p.id}><strong>{p.material} arrangement · {p.successes} positive tests, {p.failures} setbacks</strong><p>Mean measured protection {Math.round(p.effect*100)}% · uncertainty {Math.round(p.uncertainty*100)}%. {p.successes<2?"Single-trial prototype; not yet replicated.":"Repeated measurements; transfer still requires testing."}</p><small>Observed in {p.conditions.weather.join(", ")}, {p.conditions.minTemperature.toFixed(0)}–{p.conditions.maxTemperature.toFixed(0)}°C.</small></div>)}</details>
    </section>
  </>;
}
