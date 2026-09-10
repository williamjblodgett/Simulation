import type { SurvivalPosition } from "./types";

/** Shared approach tolerance for movement completion and work-site proposals. */
export const MOVEMENT_ARRIVAL_RADIUS = 2.4;

/** Shared contact geometry, with no registry access or behavioral choices. */
export function bodyOverlap(point: SurvivalPosition, center: SurvivalPosition, width: number, depth: number, rotation: number, clearance = 0.38): number {
  const dx=point.x-center.x,dz=point.z-center.z,c=Math.cos(rotation),s=Math.sin(rotation);
  return Math.max(0,Math.min(width/2+clearance-Math.abs(dx*c+dz*s),depth/2+clearance-Math.abs(-dx*s+dz*c)));
}

/** Existing invalid overlaps can be left continuously, never traversed more deeply. */
export function reducesOverlap(previous: readonly number[], next: readonly number[]): boolean {
  return previous.some(n=>n>0)&&next.every((n,i)=>n<=previous[i]+1e-9)&&next.reduce((a,b)=>a+b,0)<previous.reduce((a,b)=>a+b,0)-1e-9;
}
