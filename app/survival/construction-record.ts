import type { SurvivalAgent, SurvivalEvent, SurvivalRunState } from "../simulation/survival";

export function currentProject(agent: SurvivalAgent) {
  return agent.physicalMind?.projects.find(p=>p.status==="active"||p.status==="interrupted") ?? agent.physicalMind?.projects.at(-1);
}
export function constructionRecord(world: SurvivalRunState, id: string) {
  const part=world.physical?.parts.find(p=>p.id===id);if(!part)return null;
  const maker=world.agents.find(a=>a.id===part.makerId);
  const project=world.agents.flatMap(a=>a.physicalMind?.projects??[]).filter(p=>p.partIds.includes(id)).sort((a,b)=>b.updatedAt-a.updatedAt)[0];
  const readings=world.agents.flatMap(a=>a.physicalMind?.readings??[]).filter(r=>r.partId===id).sort((a,b)=>b.tick-a.tick);
  const uses=world.agents.flatMap(a=>a.physicalMind?.uses??[]).filter(u=>u.partId===id).sort((a,b)=>b.tick-a.tick);
  // currentAction may already describe the next queued step. Only an executed
  // action at this checkpoint establishes present use of this revision.
  const inUse=world.agents.some(a=>a.alive&&(a.physicalMind?.uses??[]).some(u=>u.partId===id&&u.revision===part.revision&&world.tick===u.tick&&Math.hypot(a.position.x-u.position.x,a.position.z-u.position.z)<1));
  const tested=readings.some(r=>r.metric==="protection"&&r.after>r.before&&r.revision===part.revision);
  const status=part.condition<=.05||!part.supported?"Damaged":inUse?"In use":project&&(project.status==="active"||project.status==="interrupted")?"Work in progress":tested?"Tested arrangement":"Untested part";
  return {part,maker,project,readings,uses,status,title:`${Object.entries(part.composition).sort((a,b)=>b[1]-a[1])[0][0]} ${part.hollow>0?"hollow form":part.size.y<.4?"panel":"arrangement"}`};
}

/** Project identity, not text similarity, connects recorded attempts. No invented missing events. */
export function projectEpisodes(events: SurvivalEvent[]) {
  const groups=new Map<string,SurvivalEvent[]>();
  for(const event of events){
    const projectId=event.facts.projectId;
    if(typeof projectId!=="string")continue;
    const group=groups.get(projectId)??[];group.push(event);groups.set(projectId,group);
  }
  const sequence=(event:SurvivalEvent)=>Number(event.id.match(/\d+$/)?.[0]??0);
  return [...groups].map(([id,records])=>({id,records:records.sort((a,b)=>a.tick-b.tick||sequence(a)-sequence(b)),latest:records.at(-1)!})).sort((a,b)=>b.latest.tick-a.latest.tick||sequence(b.latest)-sequence(a.latest));
}
