"use client";

import { ChevronDown, ChevronUp, FlaskConical, Footprints, PackageOpen, Radio, Route, Users } from "lucide-react";
import type { PointerEventHandler } from "react";
import type { SurvivalAgent, SurvivalRunState } from "../simulation/survival";
import { activityLabel, AgentPortrait, ConditionLine, humanize, NeedMeter } from "./presentation";
import styles from "./survival-experience.module.css";
import { AgentKnowledge } from "./agent-knowledge";

export type InspectorLevel = "peek" | "half" | "expanded";

interface AgentInspectorProps {
  world: SurvivalRunState;
  agent: SurvivalAgent;
  level: InspectorLevel;
  onLevelChange(level: InspectorLevel): void;
  onSelectAgent(id: string): void;
  onHandlePointerDown?: PointerEventHandler<HTMLSpanElement>;
  onHandlePointerUp?: PointerEventHandler<HTMLSpanElement>;
}

function inventoryRows(agent: SurvivalAgent) {
  return Object.entries(agent.inventory).filter(([, amount]) => amount > 0.01).sort((left, right) => right[1] - left[1]);
}

export function AgentInspector({ world, agent, level, onLevelChange, onSelectAgent, onHandlePointerDown, onHandlePointerUp }: AgentInspectorProps) {
  const observations = [...agent.observations].sort((left, right) => right.observedAt - left.observedAt).slice(0, 5);
  const memories = [...agent.memory].sort((left, right) => right.recordedAt - left.recordedAt).slice(0, 4);
  const project = agent.research.find(({ status }) => status === "testing") ?? agent.research.at(-1);
  const inventory = inventoryRows(agent);
  const activePlan = agent.currentPlan;
  const levels: InspectorLevel[] = ["peek", "half", "expanded"];
  const levelIndex = levels.indexOf(level);
  const decision = agent.currentDeliberation;
  const choice = decision?.candidates[0];
  const evidence = decision?.evidenceSnapshot ?? agent.observations.filter(o => decision?.knownObservationIds.includes(o.id));

  return <article className={styles.agentInspector} data-level={level} aria-label={`${agent.label} agent inspector`}>
    <div className={styles.peekSummary}>
      <div><strong>{agent.label} <span>· {activityLabel(agent)}</span></strong><ConditionLine agent={agent} /></div>
      <button type="button" onClick={() => onLevelChange("half")} aria-label="Expand agent details"><ChevronUp size={19} /></button>
    </div>
    <div className={styles.sheetHandle} aria-label="Agent detail height controls">
      <button type="button" disabled={levelIndex === 0} onClick={() => onLevelChange(levels[levelIndex - 1])} aria-label="Collapse agent details"><ChevronDown size={18} /></button>
      <span onPointerDown={onHandlePointerDown} onPointerUp={onHandlePointerUp}><i />{level === "peek" ? "Conditions" : level === "half" ? "More details" : "Full record"}</span>
      <button type="button" disabled={levelIndex === levels.length - 1} onClick={() => onLevelChange(levels[levelIndex + 1])} aria-label="Expand agent details"><ChevronUp size={18} /></button>
    </div>

    <div className={styles.inspectorIdentity}>
      <AgentPortrait id={agent.label} name={agent.name} size="normal" />
      <div><span>{agent.label}{agent.slotGeneration > 1 ? ` · Entry ${agent.slotGeneration}` : ""} · {agent.alive ? "Living agent" : "Historical record"}</span><h2>{agent.name}</h2><p>{activityLabel(agent)}</p></div>
      <ConditionLine agent={agent} />
    </div>

    {choice ? <p className={styles.peekIntent}><strong>Chose {humanize(choice.goal).toLowerCase()}.</strong> {choice.summary}</p> : null}
    <div className={styles.inspectorHalf}>
      <section className={styles.needsSection} aria-label="Needs, higher is better">
        <NeedMeter label="Health" value={agent.needs.health} />
        <NeedMeter label="Hydration" value={agent.needs.hydration} />
        <NeedMeter label="Energy" value={agent.needs.energy} />
      </section>
      <section className={styles.intentOutcome}>
        <div><span>Recorded intent</span><strong>{agent.currentDeliberation?.recordedIntent ?? (agent.alive ? "Awaiting the next recorded decision." : "No active intent.")}</strong></div>
        <div><span>Latest confirmed outcome</span><strong>{agent.lastOutcome?.summary ?? "No completed action has been recorded yet."}</strong></div>
      </section>
    </div>

    <div className={styles.inspectorExpanded}>
      {decision ? <section className={styles.recordSection}>
        <header><Route size={17} /><div><span>Decision evidence</span><small>{decision.id} · {(world.tick - decision.decidedAt) * world.config.stepMinutes} modeled minutes ago</small></div></header>
        <p>{choice?.planActions?.map(humanize).join(" → ") ?? decision.recordedIntent}</p>
        <small>Scores compare modeled survival value; they are not probabilities or private thoughts.</small>
        <details className={styles.decisionAlternatives}><summary>Alternatives considered · {Math.max(0, decision.candidates.length - 1)}</summary><ol>{decision.candidates.slice(1, 4).map((candidate, i) => <li key={i}><strong>{humanize(candidate.goal)}{candidate.targetId ? ` · ${candidate.targetId}` : ""}</strong><span>Value {candidate.score.toFixed(1)} · risk {candidate.risk.toFixed(1)} · {candidate.predictedSteps ?? "?"} steps</span><p>{candidate.summary}</p></li>)}</ol></details>
        <details className={styles.decisionAlternatives}><summary>{decision.evidenceSnapshot ? "Evidence when chosen" : "Retained referenced evidence"} · {evidence.length}</summary><ul>{evidence.map(o => <li key={o.id}><strong>{o.subjectId}</strong><span>Observed at step {o.observedAt} · {Math.round(o.confidence * 100)}% confidence</span><p>{Object.entries(o.facts).slice(0, 5).map(([key,value]) => `${humanize(key)}: ${String(value)}`).join(" · ")}</p></li>)}</ul></details>
        {agent.lastOutcome ? <p><strong>{agent.lastOutcome.decisionId === decision.id ? "Result linked to this decision" : "Separate latest result"}:</strong> {agent.lastOutcome.summary}</p> : null}
      </section> : null}
      <AgentKnowledge agent={agent} world={world} />
      <section className={styles.recordSection}>
        <header><PackageOpen size={17} /><div><span>Possessions</span><small>Personal inventory reported by the simulation</small></div></header>
        {inventory.length ? <dl className={styles.rowList}>{inventory.map(([kind, amount]) => <div key={kind}><dt>{humanize(kind)}</dt><dd>{amount.toFixed(1)}</dd></div>)}</dl> : <p className={styles.emptyCopy}>Nothing is currently carried.</p>}
      </section>

      <section className={styles.recordSection}>
        <header><Radio size={17} /><div><span>Recent observations</span><small>Only facts this agent has encountered</small></div></header>
        {observations.length ? <ol className={styles.observationList}>{observations.map((observation) => <li key={observation.id}><span>Day {Math.floor((observation.observedAt * world.config.stepMinutes) / 1440) + 1}</span><strong>{humanize(observation.kind)} · {humanize(observation.subjectId)}</strong><small>{Object.entries(observation.facts).slice(0, 4).map(([key, value]) => `${humanize(key)}: ${String(value)}`).join(" · ") || `${Math.round(observation.confidence * 100)}% confidence`}</small></li>)}</ol> : <p className={styles.emptyCopy}>No local observations are retained yet.</p>}
      </section>

      <section className={styles.recordSection}>
        <header><Route size={17} /><div><span>Current plan</span><small>Attempted actions, not guaranteed outcomes</small></div></header>
        {activePlan ? <div className={styles.planRecord}><strong>{humanize(activePlan.goal)}</strong><p>{activePlan.rationale}</p><ol>{activePlan.steps.map((step) => <li key={step.id} data-status={step.status}><i />{humanize(step.action)}<span>{humanize(step.status)}</span></li>)}</ol></div> : <p className={styles.emptyCopy}>No plan is currently active.</p>}
      </section>

      <section className={styles.recordSection}>
        <header><FlaskConical size={17} /><div><span>Research notebook</span><small>Hypotheses require repeatable evidence</small></div></header>
        {project ? <div className={styles.researchRecord}><span>{humanize(project.status)} · {project.successfulTrials}/{project.requiredSuccessfulTrials} supported trials</span><strong>{humanize(project.technologyId)}</strong><p>{project.hypothesis}</p>{project.attempts.at(-1) ? <small>Latest test: {project.attempts.at(-1)!.evidence}</small> : null}</div> : <p className={styles.emptyCopy}>This agent has not opened a research project.</p>}
      </section>

      <section className={styles.recordSection}>
        <header><Users size={17} /><div><span>Social record</span><small>Interaction history, not assigned affinity</small></div></header>
        {agent.relationships.length ? <div className={styles.relationshipList}>{agent.relationships.map((relationship) => {
          const other = world.agents.find(({ id }) => id === relationship.agentId);
          return <button type="button" key={relationship.agentId} onClick={() => other && onSelectAgent(other.id)} disabled={!other}><span>{other?.label ?? "—"}{other && other.slotGeneration > 1 ? ` · Entry ${other.slotGeneration}` : ""} · {other?.name ?? "Archived agent"}</span><small>Trust {Math.round(relationship.trust)} · {relationship.encounters} encounters · aid {relationship.aidGiven} given / {relationship.aidReceived} received</small></button>;
        })}</div> : <p className={styles.emptyCopy}>No social encounters are recorded.</p>}
      </section>

      {memories.length ? <section className={styles.recordSection}><header><Footprints size={17} /><div><span>Learned outcomes</span><small>Experience used in later comparisons</small></div></header><ol className={styles.memoryList}>{memories.map((memory) => <li key={memory.id}><span>{humanize(memory.result)}</span><p>{memory.summary}</p></li>)}</ol></section> : null}
      <details className={styles.decisionAlternatives}><summary>Learned expectations · {agent.learning.length} contexts</summary><ul>{[...agent.learning].sort((a,b) => b.updatedAt - a.updatedAt).slice(0, 12).map(item => <li key={item.context}><strong>{item.context}</strong><span>{item.attempts} experiences · mean outcome {item.expectedUtility.toFixed(1)}{item.expectedYield === undefined ? "" : ` · expected yield ${item.expectedYield.toFixed(2)}`}</span></li>)}</ul></details>
    </div>
  </article>;
}
