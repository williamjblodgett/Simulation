import type { SurvivalAgent, SurvivalRunState } from "../simulation/survival/types";
import styles from "./survival-experience.module.css";

/** An observer visualization of private memory; never reads subjects' world positions. */
export function AgentKnowledge({ agent, world, expanded = false }: { agent: SurvivalAgent; world: SurvivalRunState; expanded?:boolean }) {
  const places = agent.observations.filter(o => o.position && o.facts.researchEvidence !== true);
  const positions = [agent.position, ...places.map(o => o.position!), ...(agent.currentPlan?.steps.flatMap(s => s.destination ? [s.destination] : []) ?? [])];
  const minX = Math.min(...positions.map(p => p.x)) - 12, maxX = Math.max(...positions.map(p => p.x)) + 12;
  const minZ = Math.min(...positions.map(p => p.z)) - 12, maxZ = Math.max(...positions.map(p => p.z)) + 12;
  const x = (value: number) => 10 + (value - minX) / (maxX - minX) * 280;
  const y = (value: number) => 10 + (value - minZ) / (maxZ - minZ) * 160;
  return <details className={styles.knowledgeLens} open={expanded}><summary>{agent.label}&apos;s recorded knowledge</summary>
    <p>Remembered positions, not the observer&apos;s live map. Faded marks are older or uncertain.</p>
    <svg viewBox="0 0 300 180" role="img" aria-label={`${agent.label}'s observed places and remembered route`}>
      {places.map(o => <g key={o.id} opacity={Math.max(0.2, o.confidence * Math.exp(-(world.tick - o.observedAt) / 200))}><circle cx={x(o.position!.x)} cy={y(o.position!.z)} r={o.kind === "agent" ? 4 : 3} fill={o.facts.resourceKind === "freshwater" ? "#429fff" : o.kind === "agent" ? "#f2bd62" : "#4bd39a"} /><title>{o.subjectId} · observed {(world.tick - o.observedAt) * world.config.stepMinutes} minutes ago</title></g>)}
      {agent.currentPlan?.steps.filter(s => s.destination && s.status !== "complete").slice(0,1).map(s => <line key={s.id} x1={x(agent.position.x)} y1={y(agent.position.z)} x2={x(s.destination!.x)} y2={y(s.destination!.z)} stroke="#a6b4c3" strokeDasharray="4 4" />)}
      <circle cx={x(agent.position.x)} cy={y(agent.position.z)} r="5" fill="#f3f6fa" /><text x={x(agent.position.x) + 7} y={y(agent.position.z) + 4} fill="#f3f6fa" fontSize="12">{agent.label}</text>
    </svg>
    <ul>{places.filter(o => o.kind === "resource").slice(0, 8).map(o => <li key={o.id}><strong>{String(o.facts.resourceKind)}</strong><span>{Math.max(0, world.tick - o.observedAt) * world.config.stepMinutes}m ago · {Math.round(o.confidence * 100)}% confidence{o.originalObserverId ? " · reported by another agent" : " · observed directly"}</span></li>)}</ul>
  </details>;
}
