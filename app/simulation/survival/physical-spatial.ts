import type { PrivatePolicyInput } from "./planner";
import type { Vec3 } from "./physical-types";
import { depthAt, observedWater } from "./water";

/** Perceptual geometry only. Never imports the physical registry or material laws. */
export function observedParts(input: PrivatePolicyInput) {
  return input.agent.observations.filter(o => o.facts.structureKind === "physical_part" && o.position && input.tick - o.observedAt < 72)
    .map(o => ({ id: o.subjectId, position: { ...o.position!, y: Number(o.facts.elevation) },
      size: { x: Number(o.facts.width), y: Number(o.facts.height), z: Number(o.facts.depth) },
      rotation: Number(o.facts.rotation), condition: Number(o.facts.condition), supported: o.facts.supported !== false }));
}
function extent(size: Vec3, rotation: number) {
  return { x: (Math.abs(Math.cos(rotation)) * size.x + Math.abs(Math.sin(rotation)) * size.z) / 2,
    z: (Math.abs(Math.sin(rotation)) * size.x + Math.abs(Math.cos(rotation)) * size.z) / 2 };
}

/** Conservative clearance, support and a human-width approach. Unseen obstacles can still defeat it. */
export function observedPoseFits(input: PrivatePolicyInput, size: Vec3, position: Vec3, rotation: number, ignoreId?: string) {
  const e = extent(size, rotation), b = input.bounds, parts = observedParts(input).filter(p => p.id !== ignoreId && p.condition > 5);
  if (position.x-e.x < b.minX || position.x+e.x > b.maxX || position.z-e.z < b.minZ || position.z+e.z > b.maxZ || position.y < size.y/2 || position.y > 5) return false;
  const water = observedWater(input.agent.observations);
  // Sample edges as well as the center; a dry center alone is not a dry work site.
  for (const x of [-e.x, 0, e.x]) for (const z of [-e.z, 0, e.z]) if (depthAt(water, {x:position.x+x,z:position.z+z}) > 0) return false;
  if (parts.some(p => { const q=extent(p.size,p.rotation); return Math.abs(position.x-p.position.x)<e.x+q.x-.02 && Math.abs(position.z-p.position.z)<e.z+q.z-.02 && Math.abs(position.y-p.position.y)<size.y/2+p.size.y/2-.04; })) return false;
  const bottom=position.y-size.y/2;
  if (bottom>.08 && !parts.some(p => { const q=extent(p.size,p.rotation);return p.supported && Math.abs(bottom-p.position.y-p.size.y/2)<.12 && Math.abs(position.x-p.position.x)<q.x && Math.abs(position.z-p.position.z)<q.z; })) return false;
  const person=input.agent.position;
  const people=[person,...input.agent.observations.filter(o=>o.kind==="agent"&&o.facts.alive===true&&o.position&&input.tick-o.observedAt<6).map(o=>o.position!)];
  if (bottom<=2.3 && people.some(p=>Math.abs(p.x-position.x)<e.x+.5 && Math.abs(p.z-position.z)<e.z+.5)) return false;
  // Preserve at least one unobstructed exit from the occupied work/rest point.
  return [[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dz]) => [0.6,1.2,1.8].every(r => {
    const at={x:person.x+dx*r,z:person.z+dz*r};
    if (at.x<b.minX || at.x>b.maxX || at.z<b.minZ || at.z>b.maxZ || depthAt(water,at)>0) return false;
    return ![...parts,{position,size,rotation}].some(p => { const q=extent(p.size,p.rotation);return p.position.y-p.size.y/2<1.6 && Math.abs(at.x-p.position.x)<q.x+.42 && Math.abs(at.z-p.position.z)<q.z+.42; });
  }));
}

export function findObservedPose(input: PrivatePolicyInput, size: Vec3, preferred: Vec3, rotation: number, ignoreId?: string) {
  const at=input.agent.position;
  const candidates=[{position:preferred,rotation}];
  if (preferred.y-size.y/2>.08) {
    for (const support of observedParts(input).filter(p=>p.id!==ignoreId&&p.supported&&p.size.y>1.2)) candidates.push({position:{x:support.position.x,y:support.position.y+support.size.y/2+size.y/2,z:support.position.z},rotation});
  } else {
    const weather=input.agent.observations.find(o=>o.kind==="weather")?.facts.weather;
    const wind=weather==="storm"?Math.PI/3:weather==="rain"?Math.PI/5:0;
    for(let i=0;i<24;i++){
      const angle=i%8*Math.PI/4, radius=1.4+Math.floor(i/8)*.65;
      candidates.push({position:{x:at.x+Math.cos(angle)*radius,y:size.y/2,z:at.z+Math.sin(angle)*radius},rotation:i<8?rotation:wind});
    }
  }
  return candidates.find(c=>Math.hypot(c.position.x-at.x,c.position.z-at.z)<=3.95 && observedPoseFits(input,size,c.position,c.rotation,ignoreId)) ?? null;
}
