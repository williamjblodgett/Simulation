import type { AgentObservation, SurvivalAgent, SurvivalResourceKind } from "./types";

/** Material knowledge does not disappear when the source is depleted. */
export function researchMaterialEvidence(agent: SurvivalAgent, kind: SurvivalResourceKind): AgentObservation | undefined {
  return agent.observations.filter(o => o.observerId === agent.id && o.kind === "resource" && o.facts.resourceKind === kind)
    .sort((a,b) => b.observedAt - a.observedAt || a.id.localeCompare(b.id))[0];
}
