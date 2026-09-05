import type { SeedInput } from "./types";

/** Stable 32-bit seed. Never depends on JavaScript object or iteration order. */
export function seedToUint32(seed: SeedInput): number {
  if (typeof seed === "number") return (Number.isFinite(seed) ? seed : 0) >>> 0;
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function hashParts(seed: SeedInput, ...parts: Array<string | number>): number {
  let hash = seedToUint32(seed) ^ 0x9e3779b9;
  for (const part of parts) {
    const text = String(part);
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
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

export function deterministicUnit(seed: SeedInput, ...parts: Array<string | number>): number {
  return hashParts(seed, ...parts) / 0x1_0000_0000;
}

export function deterministicBetween(
  seed: SeedInput,
  minimum: number,
  maximum: number,
  ...parts: Array<string | number>
): number {
  return minimum + (maximum - minimum) * deterministicUnit(seed, ...parts);
}

export function deterministicIndex(
  seed: SeedInput,
  length: number,
  ...parts: Array<string | number>
): number {
  return Math.floor(deterministicUnit(seed, ...parts) * Math.max(1, length));
}

export function stableId(prefix: string, seed: SeedInput, ...parts: Array<string | number>): string {
  return `${prefix}-${hashParts(seed, ...parts).toString(36).padStart(7, "0")}`;
}
