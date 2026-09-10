import type { AgentNavigation, AgentObservation, SurvivalPosition } from "./types";
import { depthAt, estimateWaterTravel, observedWater } from "./water";
import { bodyOverlap, reducesOverlap } from "./navigation-geometry";

type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number };
const distance = (a: SurvivalPosition, b: SurvivalPosition) => Math.hypot(a.x - b.x, a.z - b.z);
export const freshNavigation = (): AgentNavigation => ({ destination: null, waypoints: [], recent: [], blocked: [], failures: 0, retryAt: 0 });

/** Geometry comes exclusively from personally seen or explicitly shared observations. */
export function privateTraversable(observations: readonly AgentObservation[], bounds: Bounds, point: SurvivalPosition): boolean {
  if (point.x < bounds.minX || point.x > bounds.maxX || point.z < bounds.minZ || point.z > bounds.maxZ) return false;
  return !observations.some(o => {
    const f = o.facts;
    if (f.structureKind !== "physical_part" || !o.position || Number(f.condition) <= 5 || Number(f.elevation) - Number(f.height) / 2 > 2.3) return false;
    const dx = point.x - o.position.x, dz = point.z - o.position.z, angle = Number(f.rotation);
    return Math.abs(dx * Math.cos(angle) + dz * Math.sin(angle)) < Number(f.width) / 2 + 0.4
      && Math.abs(-dx * Math.sin(angle) + dz * Math.cos(angle)) < Number(f.depth) / 2 + 0.4;
  });
}

export function privateSegmentClear(observations: readonly AgentObservation[], bounds: Bounds, from: SurvivalPosition, to: SurvivalPosition, blocked: AgentNavigation["blocked"] = []): boolean {
  const obstacles=observations.filter(o=>o.facts.structureKind==="physical_part"&&o.position&&Number(o.facts.condition)>5&&Number(o.facts.elevation)-Number(o.facts.height)/2<=2.3);
  if (!obstacles.length && !blocked.length) return to.x>=bounds.minX&&to.x<=bounds.maxX&&to.z>=bounds.minZ&&to.z<=bounds.maxZ;
  const overlaps=(p:SurvivalPosition)=>obstacles.map(o=>bodyOverlap(p,o.position!,Number(o.facts.width),Number(o.facts.depth),Number(o.facts.rotation),.4));
  let previous=overlaps(from);
  const length = distance(from, to), samples = Math.max(1, Math.ceil(length / 0.2));
  for (let i = 1; i <= samples; i++) {
    const p = { x: from.x + (to.x - from.x) * i / samples, z: from.z + (to.z - from.z) * i / samples };
    if(p.x<bounds.minX||p.x>bounds.maxX||p.z<bounds.minZ||p.z>bounds.maxZ)return false;
    const next=overlaps(p);
    if(next.some(n=>n>0)&&!reducesOverlap(previous,next))return false;
    previous=next;
    // A failed contact is local evidence, not proof that the entire destination is unreachable.
    if (blocked.some(b => distance(p, b.to) < 0.3)) return false;
  }
  return true;
}

/** Bounded deterministic A*, with unknown terrain treated as uncertain, not omniscient. */
export function findPrivateRoute(observations: readonly AgentObservation[], bounds: Bounds, start: SurvivalPosition, target: SurvivalPosition, blocked: AgentNavigation["blocked"] = [], maxExpansions = 1600): SurvivalPosition[] | null {
  const water = observedWater(observations);
  const needsDryEndpoint = depthAt(water,target) === 0;
  if (!privateTraversable(observations,bounds,target) || blocked.some(b=>distance(b.to,target)<0.3)) {
    // Actions have a contact radius; walking into the center of a remembered part
    // is neither necessary nor valid. Select a nearby observed-clear approach.
    const approaches=Array.from({length:16},(_,i)=>({x:target.x+Math.cos(i*Math.PI/8)*2.2,z:target.z+Math.sin(i*Math.PI/8)*2.2}))
      .filter(p=>privateTraversable(observations,bounds,p)&&(!needsDryEndpoint||depthAt(water,p)===0)&&!blocked.some(b=>distance(b.to,p)<0.3)).sort((a,b)=>distance(start,a)-distance(start,b));
    if(!approaches.length)return null;
    target=approaches[0];
  }
  if (privateSegmentClear(observations, bounds, start, target, blocked)) return [{ ...target }];
  const weather = observations.find(o => o.kind === "weather");
  const temperature = Number(weather?.facts.temperatureC ?? 13), storm = weather?.facts.weather === "storm";
  observations=observations.filter(o=>o.facts.structureKind==="physical_part"&&o.position&&Number(o.facts.condition)>5);
  const cell = 1.25;
  type Node = { x: number; z: number; g: number; f: number; parent: string | null };
  const key = (x: number, z: number) => `${x}:${z}`;
  const position = (n: Pick<Node, "x" | "z">) => ({ x: start.x + n.x * cell, z: start.z + n.z * cell });
  const nodes = new Map<string, Node>();
  const closed = new Set<string>();
  const heap: Array<{id:string;f:number}> = [];
  function push(id:string,f:number){let i=heap.length;heap.push({id,f});while(i>0){const parent=(i-1)>>1;if(heap[parent].f<=f)break;heap[i]=heap[parent];i=parent;}heap[i]={id,f};}
  function pop(){const first=heap[0],last=heap.pop()!;if(heap.length){let i=0;while(i*2+1<heap.length){let child=i*2+1;if(child+1<heap.length&&heap[child+1].f<heap[child].f)child++;if(last.f<=heap[child].f)break;heap[i]=heap[child];i=child;}heap[i]=last;}return first;}
  nodes.set("0:0", { x: 0, z: 0, g: 0, f: distance(start, target) / 7.5, parent: null });
  push("0:0",distance(start,target)/7.5);
  const directions = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [-1, -1], [1, -1]];
  for (let expansions = 0; heap.length && expansions < maxExpansions; expansions++) {
    const currentKey=pop().id;
    if(closed.has(currentKey))continue;
    const current = nodes.get(currentKey)!, p = position(current);
    closed.add(currentKey);
    if (privateSegmentClear(observations, bounds, p, target, blocked)) {
      const route: SurvivalPosition[] = [{ ...target }];
      let trace: Node | undefined = current;
      while (trace?.parent !== null && trace) { route.unshift(position(trace)); trace = nodes.get(trace.parent); }
      // Retain turns but skip redundant intermediate cells. No execution collision is bypassed.
      const simplified: SurvivalPosition[] = []; let anchor = start;
      while (route.length) {
        let farthest = 0;
        while (farthest + 1 < route.length && privateSegmentClear(observations, bounds, anchor, route[farthest + 1], blocked)) farthest++;
        anchor = route[farthest]; simplified.push(anchor); route.splice(0, farthest + 1);
      }
      return simplified.length <= 64 ? simplified : null;
    }
    for (const [dx, dz] of directions) {
      const x = current.x + dx, z = current.z + dz, id = key(x, z);
      if (closed.has(id)) continue;
      const next = position({ x, z });
      if (!privateSegmentClear(observations, bounds, p, next, blocked)) continue;
      const travel = estimateWaterTravel(water, p, next, temperature, storm);
      const g = current.g + travel.duration + travel.energy * 0.15 + travel.warmth * 0.1;
      if (g >= (nodes.get(id)?.g ?? Infinity)) continue;
      const f=g+distance(next,target)/7.5;
      nodes.set(id, { x, z, g, f, parent: currentKey }); push(id,f);
    }
  }
  return null;
}
