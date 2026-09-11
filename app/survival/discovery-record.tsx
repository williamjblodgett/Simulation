"use client";
import type { SurvivalAgent } from "../simulation/survival";
import { humanize } from "./presentation";
import styles from "./survival-experience.module.css";

export function DiscoverySummary({ agent }: { agent: SurvivalAgent }) {
  const mind = agent.discovery; if (!mind) return null;
  const goal = [...mind.goals].reverse().find(g => g.parentId === null);
  const decision = mind.decisions.at(-1), chosen = decision?.alternatives.find(a => a.id === decision.selectedId);
  return <section className={styles.projectSummary} aria-label="Agent discovery goal"><span>Private survival goal</span>
    <h3>{goal ? goal.metric === "protection" ? "Improve protection" : "Satisfy a support requirement" : "No optional investment justified"}</h3>
    <p>{goal ? `${humanize(goal.status)} · ${goal.reason}` : "Ordinary survival remains worthwhile. Experiments are not compulsory."}</p>
    {chosen ? <p><strong>Selected alternative:</strong> {chosen.label}</p> : null}
    <small>Predictions and local evidence—not assigned inventions or hidden thoughts.</small>
  </section>;
}

export function DiscoveryRecord({ agent, onViewRecord }: { agent: SurvivalAgent; onViewRecord?(id: string): void }) {
  const mind = agent.discovery; if (!mind) return null;
  const decision = mind.decisions.at(-1);
  return <section className={`${styles.recordSection} ${styles.discoveryRecord}`} aria-label="Autonomous discovery record">
    <header><div><span>Protection &amp; support study</span><small>Policy 4 · a bounded survival experiment</small></div></header>
    {mind.mode !== "directed" ? <p>Evaluation arm: {humanize(mind.mode)}. This is not the default discovery policy.</p> : null}
    {mind.goals.slice(-4).map(goal => <details key={goal.id} className={styles.decisionAlternatives}><summary>{humanize(goal.status)} · {humanize(goal.metric)}{goal.parentId ? " · prerequisite" : ""}</summary>
      <p>{goal.reason}</p><p>When formed: {humanize(goal.originatingConditions.weather)}, {goal.originatingConditions.temperatureC}°C. Warmth {goal.originatingConditions.warmth.toFixed(0)} → forecast {goal.originatingConditions.forecastWarmth.toFixed(0)}; safety {goal.originatingConditions.safety.toFixed(0)} → forecast {goal.originatingConditions.forecastSafety.toFixed(0)}. Forecasts are not confirmed outcomes.</p><dl className={styles.rowList}><div><dt>Originating evidence</dt><dd>{goal.evidenceIds.join(", ")}</dd></div><div><dt>Target</dt><dd>{goal.target.toFixed(2)} {goal.metric === "support" ? "load units" : "protective fraction"}</dd></div><div><dt>Work budget</dt><dd>{goal.budget.ticks * 10} modeled min · {goal.budget.effort} manipulation energy units</dd></div><div><dt>Completion</dt><dd>{goal.criterion}</dd></div><div><dt>Abandonment</dt><dd>{goal.abandonWhen}</dd></div></dl>
    </details>)}
    {decision ? <details className={styles.decisionAlternatives}><summary>Decision-time alternatives · {decision.alternatives.length} retained</summary><p>{decision.reason}</p><small>{decision.omitted} additional candidates omitted from this bounded summary. Scores are estimated survival value, not probabilities.</small><ol>{decision.alternatives.map(a => <li key={a.id}><strong>{a.id === decision.selectedId ? "Selected · " : ""}{a.label}</strong><p>Value {a.score.toFixed(2)} · estimated work {a.cost.toFixed(2)} · {a.ticks * 10} modeled min</p><p>{a.rejection ?? "Chosen at this decision."}</p>{a.prediction ? <small>Predicted protection {a.prediction.mean.toFixed(2)}; plausible range {a.prediction.low.toFixed(2)}–{a.prediction.high.toFixed(2)}. {a.prediction.samples} relevant samples.</small> : null}</li>)}</ol><small>Timeline reference: {decision.id}</small></details> : <p>No optional protection comparison has yet been justified.</p>}
    <h3>Experiments &amp; consequences</h3>
    {decision && onViewRecord ? <button type="button" className={styles.textControl} onClick={() => onViewRecord(decision.id)}>Open this comparison in Timeline</button> : null}
    {!mind.experiments.length ? <p>No decision-relevant physical experiment has been selected.</p> : null}
    {[...mind.experiments].reverse().slice(0, 6).map(e => <details className={styles.decisionAlternatives} key={e.id}><summary>{humanize(e.status)} · {humanize(e.metric)}</summary><p>{e.claim}</p><p><strong>Decision it could change:</strong> {e.decisionAffected}</p><p><strong>Attempt:</strong> {e.intervention}</p><p><strong>Before-action prediction:</strong> {e.prediction.mean.toFixed(2)}, uncertainty width {e.prediction.uncertainty.toFixed(2)}; not a calibrated probability.</p><p>{e.result ?? "No confirmed measurement yet."}</p><small>{e.spentEffort.toFixed(2)} energy units spent · Timeline experiment {e.id}{e.evidenceId ? ` · evidence ${e.evidenceId}` : ""}</small></details>)}
    <details className={styles.decisionAlternatives}><summary>Reusable procedures · {mind.procedures.length}</summary>{mind.procedures.map(p => <div key={p.id}><strong>{p.program.length} executed operations · {p.successes < 2 ? "single-trial candidate" : "repeated evidence"}</strong><p>{p.successes} favorable measurements · {p.failures} failures · expected local protection {p.effect.toFixed(2)}</p><small>Relative geometry and material prerequisites are rebound at each use. Every operation still pays costs and may fail.</small></div>)}</details>
    {onViewRecord && mind.experiments.some(e => e.evidenceId) ? <button type="button" className={styles.textControl} onClick={() => onViewRecord([...mind.experiments].reverse().find(e => e.evidenceId)!.id)}>Open latest measurement in Timeline</button> : null}
    <details className={styles.decisionAlternatives}><summary>Evidence provenance · {mind.evidence.length} retained</summary>{[...mind.evidence].reverse().slice(0, 8).map(e => <div key={e.id}><strong>{e.source === "personal" ? "Personal measurement" : "Reported testimony"} · {e.metric}</strong><p>{e.interpretation}</p><p>{e.confounds.join(" ")}</p><small>Original: {e.originalId} · observer {e.originalObserverId} · step {e.tick}</small></div>)}</details>
    <p>Protection is a supplied local exposure reading, not a simulated removal of a part. Load survival is evidence about that tested load, not exact breaking strength. Older evidence IDs may remain after raw records are pruned; missing records are not reconstructed.</p>
  </section>;
}
