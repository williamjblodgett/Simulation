export interface TerritoryPoint {
  x: number;
  z: number;
}

export interface TerritoryClaim {
  id: string;
  position: TerritoryPoint;
  radius: number;
}

export interface TerritoryCell {
  id: string;
  center: TerritoryPoint;
  radius: number;
  vertices: TerritoryPoint[];
  geometryKey: string;
}

export interface TerritoryLayoutOptions {
  halfSize: number;
  edgeInset?: number;
  segments?: number;
}

const DEFAULT_SEGMENTS = 56;
const MIN_SEGMENTS = 48;
const MAX_SEGMENTS = 64;
const OVERLAP_EPSILON = 1e-10;
const COINCIDENT_EPSILON = 1e-9;
const TAU = Math.PI * 2;

function finite(value: number, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function compareClaims(a: TerritoryClaim, b: TerritoryClaim) {
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  if (a.position.x !== b.position.x) return a.position.x - b.position.x;
  if (a.position.z !== b.position.z) return a.position.z - b.position.z;
  return a.radius - b.radius;
}

function pairHash(firstId: string, secondId: string) {
  let hash = 2166136261;
  const value = `${firstId}\u0000${secondId}`;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function coincidentPairDirection(firstId: string, secondId: string) {
  const lowId = firstId < secondId ? firstId : secondId;
  const highId = firstId < secondId ? secondId : firstId;
  const angle = pairHash(lowId, highId) / 4294967296 * TAU;
  const direction = { x: Math.cos(angle), z: Math.sin(angle) };
  return firstId === lowId
    ? direction
    : { x: -direction.x, z: -direction.z };
}

/** Clips a convex polygon to n·p <= offset. */
function clipToHalfPlane(
  polygon: TerritoryPoint[],
  normalX: number,
  normalZ: number,
  offset: number,
) {
  if (polygon.length === 0) return polygon;
  const clipped: TerritoryPoint[] = [];
  let start = polygon[polygon.length - 1];
  let startDistance = start.x * normalX + start.z * normalZ - offset;
  let startInside = startDistance <= 0;

  for (const end of polygon) {
    const endDistance = end.x * normalX + end.z * normalZ - offset;
    const endInside = endDistance <= 0;
    if (startInside !== endInside) {
      const denominator = startDistance - endDistance;
      const interpolation = Math.abs(denominator) <= Number.EPSILON
        ? 0
        : clamp(startDistance / denominator, 0, 1);
      clipped.push({
        x: start.x + (end.x - start.x) * interpolation,
        z: start.z + (end.z - start.z) * interpolation,
      });
    }
    if (endInside) clipped.push(end);
    start = end;
    startDistance = endDistance;
    startInside = endInside;
  }
  return clipped;
}

function circlePolygon(center: TerritoryPoint, radius: number, segments: number) {
  if (radius <= 0) return [];
  return Array.from({ length: segments }, (_, index) => {
    const angle = index / segments * TAU;
    return {
      x: center.x + Math.cos(angle) * radius,
      z: center.z + Math.sin(angle) * radius,
    };
  });
}

function stableNumber(value: number) {
  const normalized = Math.abs(value) < 1e-12 ? 0 : value;
  return normalized.toPrecision(15);
}

function territoryGeometryKey(
  center: TerritoryPoint,
  radius: number,
  vertices: TerritoryPoint[],
) {
  return [
    stableNumber(center.x),
    stableNumber(center.z),
    stableNumber(radius),
    ...vertices.flatMap((point) => [stableNumber(point.x), stableNumber(point.z)]),
  ].join("|");
}

/**
 * Builds radius-capped, mutually exclusive weighted Voronoi cells.
 *
 * Each claim starts as a regular polygon inside its desired-radius circle. An
 * overlapping pair shares one weighted divider, so their final polygons can
 * touch along an edge but can never cover the same area. The helper is pure:
 * inputs are copied, ordered by id, and never mutated.
 */
export function layoutExclusiveTerritories(
  claims: readonly TerritoryClaim[],
  options: TerritoryLayoutOptions,
): TerritoryCell[] {
  const halfSize = Math.max(0, finite(options.halfSize));
  const edgeInset = clamp(Math.max(0, finite(options.edgeInset ?? 0)), 0, halfSize);
  const mapLimit = Math.max(0, halfSize - edgeInset);
  const segments = Math.round(clamp(
    finite(options.segments ?? DEFAULT_SEGMENTS, DEFAULT_SEGMENTS),
    MIN_SEGMENTS,
    MAX_SEGMENTS,
  ));
  const ordered = claims.map((claim) => ({
    id: String(claim.id),
    position: {
      x: clamp(finite(claim.position.x), -mapLimit, mapLimit),
      z: clamp(finite(claim.position.z), -mapLimit, mapLimit),
    },
    radius: Math.max(0, finite(claim.radius)),
  })).sort(compareClaims);
  const polygons = ordered.map((claim) => {
    let vertices = circlePolygon(claim.position, claim.radius, segments);
    vertices = clipToHalfPlane(vertices, 1, 0, mapLimit);
    vertices = clipToHalfPlane(vertices, -1, 0, mapLimit);
    vertices = clipToHalfPlane(vertices, 0, 1, mapLimit);
    vertices = clipToHalfPlane(vertices, 0, -1, mapLimit);
    return vertices;
  });

  for (let claimIndex = 0; claimIndex < ordered.length; claimIndex += 1) {
    const claim = ordered[claimIndex];
    for (let otherIndex = claimIndex + 1; otherIndex < ordered.length; otherIndex += 1) {
      const other = ordered[otherIndex];
      const differenceX = other.position.x - claim.position.x;
      const differenceZ = other.position.z - claim.position.z;
      const distance = Math.hypot(differenceX, differenceZ);
      if (distance > claim.radius + other.radius + OVERLAP_EPSILON) continue;

      let normalX: number;
      let normalZ: number;
      let dividerX: number;
      let dividerZ: number;
      if (distance <= COINCIDENT_EPSILON) {
        const direction = coincidentPairDirection(claim.id, other.id);
        normalX = direction.x;
        normalZ = direction.z;
        dividerX = (claim.position.x + other.position.x) * 0.5;
        dividerZ = (claim.position.z + other.position.z) * 0.5;
      } else {
        normalX = differenceX / distance;
        normalZ = differenceZ / distance;
        const combinedRadius = claim.radius + other.radius;
        const weightedDistance = combinedRadius <= Number.EPSILON
          ? distance * 0.5
          : distance * claim.radius / combinedRadius;
        dividerX = claim.position.x + normalX * weightedDistance;
        dividerZ = claim.position.z + normalZ * weightedDistance;
      }
      const dividerOffset = dividerX * normalX + dividerZ * normalZ;
      polygons[claimIndex] = clipToHalfPlane(
        polygons[claimIndex],
        normalX,
        normalZ,
        dividerOffset,
      );
      polygons[otherIndex] = clipToHalfPlane(
        polygons[otherIndex],
        -normalX,
        -normalZ,
        -dividerOffset,
      );
    }
  }

  return ordered.map((claim, claimIndex) => {
    // Keep every returned coordinate strictly inside the same bounds used by
    // the renderer, including values produced by floating-point intersections.
    const vertices = polygons[claimIndex].map((point) => ({
      x: clamp(point.x, -mapLimit, mapLimit),
      z: clamp(point.z, -mapLimit, mapLimit),
    }));
    return {
      id: claim.id,
      center: { ...claim.position },
      radius: claim.radius,
      vertices,
      geometryKey: territoryGeometryKey(claim.position, claim.radius, vertices),
    };
  });
}
