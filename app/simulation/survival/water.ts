import type { AgentObservation, SurvivalEnvironment, SurvivalPosition, SurvivalResourceSite } from "./types";

/** Simplified freshwater locomotion, in world units per ten-minute simulation step. */
export type Locomotion = "walk" | "wade" | "swim";
export const TRAVEL_SPEED = { walk: 7.5, wade: 4.5, swim: 2.8 } as const;
export const SWIMMING_DEPTH = 0.85;
export interface WaterFootprint {
  position: SurvivalPosition;
  radiusX: number;
  radiusZ: number;
  rotation: number;
}

export function freshwaterFootprint(site: Pick<SurvivalResourceSite, "capacity" | "position">): WaterFootprint {
  return { position: site.position, radiusX: 5 + site.capacity / 110, radiusZ: 3.5 + site.capacity / 170, rotation: (site.position.x + site.position.z) * 0.03 };
}

export function freshwaterFeatures(env: SurvivalEnvironment): WaterFootprint[] {
  return env.resources.filter(s => s.kind === "freshwater").map(freshwaterFootprint);
}

export function waterDepth(feature: WaterFootprint, point: SurvivalPosition): number {
  const dx = point.x - feature.position.x, dz = point.z - feature.position.z;
  const x = Math.cos(feature.rotation) * dx - Math.sin(feature.rotation) * dz;
  const z = Math.sin(feature.rotation) * dx + Math.cos(feature.rotation) * dz;
  const radius = Math.hypot(x / feature.radiusX, z / feature.radiusZ);
  // A continuous bowl: ankle-deep shore, deeper center. Not a fluid dynamics solver.
  return 2.1 * Math.max(0, 1 - radius * radius);
}

export function depthAt(features: readonly WaterFootprint[], point: SurvivalPosition): number {
  return features.reduce((depth, feature) => Math.max(depth, waterDepth(feature, point)), 0);
}

export function locomotionAt(features: readonly WaterFootprint[], point: SurvivalPosition): Locomotion {
  const depth = depthAt(features, point);
  return depth >= SWIMMING_DEPTH ? "swim" : depth > 0 ? "wade" : "walk";
}

export function immersionCost(mode: Locomotion, temperatureC: number, storm = false) {
  const exposure = mode === "swim" ? 1 : mode === "wade" ? 0.35 : 0;
  return { energy: exposure * 0.9, warmth: exposure * (0.25 + Math.max(0, 22 - temperatureC) * 0.055 + (storm ? 0.35 : 0)) };
}

/** Only already observed outlines reach planning. No lookup in the environment registry. */
export function observedWater(observations: readonly AgentObservation[]): WaterFootprint[] {
  return observations.filter(o => o.kind === "resource" && o.facts.resourceKind === "freshwater" && o.facts.researchEvidence !== true).flatMap(o => {
    const f = o.facts;
    if (![f.waterCenterX, f.waterCenterZ, f.waterRadiusX, f.waterRadiusZ, f.waterRotation].every(n => typeof n === "number" && Number.isFinite(n)) || Number(f.waterRadiusX) <= 0 || Number(f.waterRadiusZ) <= 0) return [];
    return [{ position: { x: Number(f.waterCenterX), z: Number(f.waterCenterZ) }, radiusX: Number(f.waterRadiusX), radiusZ: Number(f.waterRadiusZ), rotation: Number(f.waterRotation) }];
  });
}

export function shorePoints(feature: WaterFootprint): SurvivalPosition[] {
  return Array.from({ length: 16 }, (_, i) => {
    const angle = i * Math.PI / 8, x = Math.cos(angle) * (feature.radiusX + 1.5), z = Math.sin(angle) * (feature.radiusZ + 1.5);
    return { x: feature.position.x + Math.cos(feature.rotation) * x + Math.sin(feature.rotation) * z, z: feature.position.z - Math.sin(feature.rotation) * x + Math.cos(feature.rotation) * z };
  });
}

/** Reachable dry-bank access, shared by sensing and execution. Crossing is not collection. */
export function canCollectFreshwater(feature: WaterFootprint, point: SurvivalPosition): boolean {
  return waterDepth(feature,point) === 0 && shorePoints(feature).some(p=>Math.hypot(p.x-point.x,p.z-point.z)<=3);
}

export function estimateWaterTravel(features: readonly WaterFootprint[], from: SurvivalPosition, to: SurvivalPosition, temperatureC: number, storm = false) {
  const distance = Math.hypot(to.x - from.x, to.z - from.z), samples = Math.max(1, Math.ceil(distance / 0.5));
  const nearby = features.filter(f => {
    const radius=Math.max(f.radiusX,f.radiusZ);
    return f.position.x+radius>=Math.min(from.x,to.x)&&f.position.x-radius<=Math.max(from.x,to.x)&&f.position.z+radius>=Math.min(from.z,to.z)&&f.position.z-radius<=Math.max(from.z,to.z);
  });
  if(!nearby.length)return {duration:distance/TRAVEL_SPEED.walk,energy:0,warmth:0,wetDuration:0};
  let duration = 0, energy = 0, warmth = 0, wetDuration = 0;
  for (let i = 0; i < samples; i++) {
    const t = (i + 0.5) / samples, mode = locomotionAt(nearby, { x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t });
    const dt = distance / samples / TRAVEL_SPEED[mode], cost = immersionCost(mode, temperatureC, storm);
    duration += dt; energy += cost.energy * dt; warmth += cost.warmth * dt;
    if (mode !== "walk") wetDuration += dt;
  }
  return { duration, energy, warmth, wetDuration };
}
