"use client";

import { GitBranch } from "lucide-react";
import type { SurvivalAgent, SurvivalRunState } from "../simulation/survival";
import styles from "./survival-experience.module.css";

export function SuccessionRecord({ world, agent, onSelectAgent }: { world: SurvivalRunState; agent: SurvivalAgent; onSelectAgent(id: string): void }) {
  const plans = world.succession?.plans.filter(p => p.predecessorId === agent.id || p.sponsorId === agent.id) ?? [];
  const review = agent.successionReview;
  if(Boolean(world.physical)&&!world.config.continuity)return null;
  const relation = (id: string) => { const other = world.agents.find(a => a.id === id); return <button type="button" className={styles.lineageLink} onClick={() => onSelectAgent(id)}>{other?.name ?? id} · entry {other?.slotGeneration ?? "?"}</button>; };
  return <section className={styles.recordSection}>
    <header><GitBranch size={17}/><div><span>Next generation</span><small>Recorded lineage and succession choices</small></div></header>
    {agent.lineage ? <div className={styles.lineageRecord}><strong>Generation {agent.lineage.generation}</strong><p>Predecessor: {relation(agent.lineage.predecessorId)}</p><p>Planned by: {relation(agent.lineage.sponsorId)}</p><small>A fresh life; no inherited memories or research.</small></div> : <p className={styles.emptyCopy}>Generation 1 · {agent.spawnSource === "observer" ? "introduced by you" : agent.spawnSource === "autonomous_companion" ? "requested as a companion" : "initial agent"}.</p>}
    {plans.map(plan => <div className={styles.successionPlan} key={plan.id}>
      <strong>{plan.status === "fulfilled" ? "Successor entered" : world.status === "completed" ? "Plan retained · study ended" : world.agents.find(a => a.id === plan.predecessorId)?.alive ? "Planned before death" : "Waiting for a vacant slot"}</strong>
      <p>For {relation(plan.predecessorId)} · planned by {relation(plan.sponsorId)}</p>
      <p>{plan.rationale}</p>
      <small>{plan.status === "fulfilled" ? "Transferred" : "Reserved"}: 0.5 food + 0.5 water. {plan.status === "pending" ? "A commitment, not a living agent." : "The predecessor was not revived."}</small>
      {plan.successorId ? <p>Successor: {relation(plan.successorId)}</p> : null}
    </div>)}
    {review && review.choice !== "planned" ? <div className={styles.successionPlan}><strong>{review.choice === "declined" ? "Declined for now" : "Not ready to commit"}</strong><p>{review.rationale}</p><small>Recorded at day {Math.floor(review.checkedAt / 144) + 1}. Reconsidered no sooner than six modeled hours later.</small></div> : null}
    {!plans.length && !review ? <p className={styles.emptyCopy}>{world.policyVersion !== 2 && !world.physical ? "This earlier decision model does not plan next generations." : agent.alive ? "No successor is planned. After six modeled hours, this agent may consider the choice using its own conditions and supplies." : "No successor was planned before this life ended. A surviving agent may still choose to sponsor one after observing the death."}</p> : null}
  </section>;
}
