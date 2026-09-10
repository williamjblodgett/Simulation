import type { SurvivalEvent } from "../simulation/survival";

export interface RepeatedEpisode { latest: SurvivalEvent; records: SurvivalEvent[]; attempts: number }

/** Presentation only. Exact records remain available and exports are unchanged. */
export function repeatedEventEpisodes(events: readonly SurvivalEvent[]): RepeatedEpisode[] {
  const current = new Map<string, RepeatedEpisode>(), episodes: RepeatedEpisode[] = [];
  const interactionKey=(e:SurvivalEvent)=>`${e.tick}:${e.agentIds.join(",")}:${e.facts.action}:${e.facts.resource??""}:${e.facts.decisionId??""}`;
  const proposals = new Map(events.filter(e=>e.type==="social_proposal").map(e=>[interactionKey(e),e]));
  for (const event of [...events].sort((a,b)=>a.tick-b.tick||a.id.localeCompare(b.id,undefined,{numeric:true}))) {
    const social = event.type === "social_refused" || event.type === "social_accepted";
    const movement = event.type === "action_outcome" && event.facts.action === "move";
    if (!social && !movement) continue;
    const key = `${event.day}:${event.agentIds.join(",")}:${event.facts.action}:${event.facts.resource??""}:${event.facts.targetId??""}`;
    if (event.type === "social_accepted" || event.facts.success === true) { current.delete(key); continue; }
    if (!social && event.facts.success !== false) continue;
    const prior=current.get(key), proposal=proposals.get(interactionKey(event));
    const records=proposal?[proposal,event]:[event];
    if(prior&&event.tick-prior.latest.tick<=18){prior.latest=event;prior.attempts++;prior.records.push(...records);}
    else {const episode={latest:event,records,attempts:1};current.set(key,episode);episodes.push(episode);}
  }
  return episodes.filter(e=>e.attempts>1);
}
