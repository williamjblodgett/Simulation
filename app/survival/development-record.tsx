import type { SurvivalAgent, SurvivalRunState } from "../simulation/survival";
import { COMPONENT_AFFORDANCES } from "../simulation/survival/development-catalog";
import { DEVELOPMENT_LIMITS } from "../simulation/survival/development-types";
import { humanize } from "./presentation";
import styles from "./survival-experience.module.css";

export function DevelopmentSummary({agent}:{agent:SurvivalAgent}) {
  const mind=agent.developmentMind,goal=mind?.goals.find(g=>g.id===mind.active?.goalId)??mind?.goals.filter(g=>g.parentId===null).at(-1);
  if(!mind||!goal)return null;
  const selected=agent.currentPlan?.developmentGoalId===goal.id&&agent.currentPlan.status==="active";
  return <section className={styles.projectSummary} aria-label="Agent development goal"><span>Longer-term problem · {selected?"attempt in progress":humanize(goal.status)}</span><h3>{humanize(goal.metric)}</h3><p>{goal.origin}</p>{mind.active?.goalId===goal.id?<small>{mind.active.cursor} of {mind.active.candidate.operations.length} physical operations completed. {selected?"Measured outcomes may change the next choice.":"Ordinary survival may take priority; paid work remains."}</small>:<small>Target {goal.target.toFixed(2)} · {goal.spent.toFixed(1)} effort spent. This is an evidence-backed record, not hidden thoughts.</small>}</section>;
}

export function DevelopmentRecord({agent,onViewRecord}:{agent:SurvivalAgent;onViewRecord?(id:string):void}) {
  const mind=agent.developmentMind;if(!mind)return null;
  const active=mind.active, latest=mind.evidence.at(-1), decision=mind.decision;
  return <section className={styles.recordSection} aria-label="Development and learning">
    <header><div><span>Problems &amp; possibilities</span><small>Each life keeps its own experience</small></div></header>
    {mind.goals.length?<dl className={styles.rowList}>{[...mind.goals].reverse().slice(0,6).map(goal=><div key={goal.id}><dt><strong>{humanize(goal.metric)}</strong><small>{goal.origin}</small><small>{goal.evidenceIds.length} evidence references · {goal.spent.toFixed(1)} / {goal.budget} effort spent{goal.parentId?" · prerequisite for another goal":""}</small></dt><dd>{humanize(goal.status)}</dd></div>)}</dl>:<p>No recurring problem has yet justified optional development. Ordinary survival continues.</p>}
    {active?<p className={styles.inlineNotice}><strong>Attempt in progress</strong><br/>{active.candidate.label}<br/><small>{active.cursor} of {active.candidate.operations.length} operations completed. Built objects and paid costs remain when work pauses.</small></p>:null}
    {decision?<details className={styles.decisionAlternatives}><summary>Latest comparison · step {decision.tick}</summary><p>{decision.reason}</p><p>Moving, gathering, consuming, resting and doing no optional work remain competing choices.</p>{decision.candidates.map(c=><div key={c.id}><strong>{c.label}</strong><p>Predicted effect {c.prediction.toFixed(2)} · uncertainty {c.uncertainty.toFixed(2)} · estimated {c.ticks} steps and {c.materialCost.toFixed(1)} material units.</p><small>{c.rejection??"Selected proposal; effect awaits measurement."}</small></div>)}{decision.omitted?<p>{decision.omitted} additional candidates omitted from this bounded record.</p>:null}</details>:null}
    {latest?<div className={styles.materialGoal}><span>{latest.source==="personal"?"Personal measurement":"Reported result"}</span><strong>{humanize(latest.metric)} · {latest.value.toFixed(3)}</strong><p>{latest.summary}</p><small>Prediction {latest.predicted.toFixed(3)} · {latest.conditions}</small>{onViewRecord?<button type="button" onClick={()=>onViewRecord(latest.originalId)}>View evidence in Timeline</button>:null}</div>:null}
    <details className={styles.decisionAlternatives}><summary>Reusable procedures · {mind.procedures.length}</summary>{mind.procedures.length?mind.procedures.map(p=><div key={p.id}><strong>{humanize(p.metric)} · {p.successes>1?`${p.successes} successful trials`:"Single-trial candidate"}</strong><p>{p.parts.map(part=>humanize(`${part.material} ${part.form}`)).join(" → ")}</p><small>{p.authorId===agent.id?"Personally learned":"Received from another life"} · {p.failures} failures · uncertainty {p.uncertainty.toFixed(2)}. Reuse still pays the costs of every operation.</small></div>):<p>No tested procedure yet.</p>}</details>
    <small>{mind.evidence.length} retained evidence records · {mind.prunedEvidence} older personal records compacted; retained models keep their evidence references.</small>
  </section>;
}

export function DevelopmentWorldRecord({world}:{world:SurvivalRunState}) {
  const development=world.development;if(!development)return null;
  return <section className={styles.recordSection} aria-label="Physical development">
    <header><div><span>A world they can change</span><small>{world.config.discoveryObjective?"Survival + discovery":"Individual survival"} · {world.config.durationHours===null?"open-ended":`${world.config.durationHours}-hour study`}</small></div></header>
    <p>Agents can assemble, test, repair and reuse physical systems. Progress depends on their observations and choices.</p>
    <dl className={styles.rowList}><div><dt>Realized components</dt><dd>{development.components.length} / {DEVELOPMENT_LIMITS.components}</dd></div><div><dt>Connections</dt><dd>{development.links.length}</dd></div><div><dt>Confirmed tests</dt><dd>{development.metrics.tests}</dd></div><div><dt>Stored water / food</dt><dd>{development.components.reduce((n,c)=>n+c.water,0).toFixed(2)} / {development.components.reduce((n,c)=>n+c.food,0).toFixed(2)}</dd></div><div><dt>Work &amp; heat delivered</dt><dd>{development.energy.delivered.toFixed(2)} energy units</dd></div></dl>
    <details className={styles.decisionAlternatives}><summary>Available physical capabilities</summary><ul>{Object.entries(COMPONENT_AFFORDANCES).map(([form,entry])=><li key={form}><strong>{humanize(form)}</strong><p>{entry.description}</p></li>)}</ul><p>These component semantics are supplied world rules. Connections and useful procedures must be chosen and tested. This model supports simplified powered systems and relay control; semiconductor fabrication and general-purpose computers are not simulated.</p></details>
    {world.config.discoveryObjective?<p>Discovery is an additional authored motivation. Optional inquiry has a ceiling of {DEVELOPMENT_LIMITS.dailyExperimentEffort} effort units per modeled day and still yields to urgent survival.</p>:<p>Survival is the sole motivation. Staying with a reliable strategy is a valid outcome.</p>}
  </section>;
}
