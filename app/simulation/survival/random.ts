import type { SurvivalSeed } from "./types";

export function survivalSeedToUint32(seed: SurvivalSeed): number {
  if (typeof seed === "number") return (Number.isFinite(seed) ? seed : 0) >>> 0;
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function survivalHash(seed: SurvivalSeed, ...parts: Array<string | number>): number {
  let hash = survivalSeedToUint32(seed) ^ 0x9e3779b9;
  for (const part of parts) {
    const value = String(part);
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 0x85ebca6b);
      hash ^= hash >>> 13;
    }
    hash ^= 0x27d4eb2d;
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  return (hash ^ (hash >>> 16)) >>> 0;
}

export function survivalUnit(seed: SurvivalSeed, ...parts: Array<string | number>): number {
  return survivalHash(seed, ...parts) / 0x1_0000_0000;
}

export function survivalBetween(
  seed: SurvivalSeed,
  minimum: number,
  maximum: number,
  ...parts: Array<string | number>
): number {
  return minimum + (maximum - minimum) * survivalUnit(seed, ...parts);
}
