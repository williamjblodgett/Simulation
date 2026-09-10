"use client";

import { Eye, Users } from "lucide-react";
import { useState } from "react";
import type { SurvivalAgent, SurvivalRunState } from "../simulation/survival";
import { activityLabel, AgentPortrait, ConditionLine, NeedMeter } from "./presentation";
import styles from "./survival-experience.module.css";
import { AgentAdmission } from "./agent-admission";

interface AgentsViewProps {
  world: SurvivalRunState;
  selectedId: string | null;
  onInspect(agent: SurvivalAgent): void;
  onViewInWorld(agent: SurvivalAgent): void;
}

export function AgentsView({ world, selectedId, onInspect, onViewInWorld }: AgentsViewProps) {
  const [allLives, setAllLives] = useState(false);
  const currentRecords = [1, 2, 3, 4, 5].slice(0, world.config.agentCap).flatMap((slot) => {
    const records = world.agents
      .filter((agent) => agent.slot === slot)
      .sort((left, right) => right.slotGeneration - left.slotGeneration || right.spawnedAt - left.spawnedAt);
    const current = records.find((agent) => agent.alive) ?? records[0];
    return current ? [current] : [];
  });
  return <section className={styles.screenView} aria-labelledby="agents-heading">
    <header className={styles.screenHeading}><div><span>Independent lives</span><h1 id="agents-heading">Agents</h1></div><div className={styles.recordCount}><Users size={15} />{world.stats.livingAgents} living</div></header>
    <AgentAdmission world={world}/>
    <div className={styles.scopeButtons}><button type="button" aria-pressed={!allLives} onClick={() => setAllLives(false)}>Current agents</button><button type="button" aria-pressed={allLives} onClick={() => setAllLives(true)}>All lives · {world.agents.length}</button></div>
    <div className={styles.agentDirectory}>
      {(allLives ? world.agents : currentRecords).map((agent) => <article key={agent.id} data-selected={selectedId === agent.id} data-alive={agent.alive}>
        <button type="button" className={styles.agentDirectoryMain} onClick={() => onInspect(agent)}>
          <AgentPortrait id={agent.label} name={agent.name} size="large" />
          <div className={styles.agentDirectoryIdentity}><span>{agent.label}{agent.slotGeneration > 1 ? ` · Entry ${agent.slotGeneration}` : ""} · {agent.alive ? "Living" : "Died"}</span><h2>{agent.name.startsWith("Agent ") ? "Unnamed" : agent.name}</h2><p>{activityLabel(agent,world.environment)}</p><ConditionLine agent={agent} /></div>
          <div className={styles.compactNeeds}><NeedMeter compact label="Health" value={agent.needs.health} /><NeedMeter compact label="Hydration" value={agent.needs.hydration} /><NeedMeter compact label="Energy" value={agent.needs.energy} /></div>
        </button>
        <button type="button" className={styles.viewWorldButton} onClick={() => onViewInWorld(agent)} disabled={!agent.alive}><Eye size={16} />{agent.alive ? "View in world" : "Not in current world"}</button>
      </article>)}
      {world.stats.livingAgents < 5 && world.status !== "completed" ? <div className={styles.emptyAgentSlot}><span>Room for another life</span><p>You can add an agent above. {world.policyVersion===3&&!world.config.continuity?"Autonomous succession is disabled in this survival-only study.":"Agents can also choose to fund a next generation; an empty slot never forces them to do so."}</p></div> : null}
    </div>
  </section>;
}
