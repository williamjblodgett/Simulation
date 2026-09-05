import type { GeographicBounds } from "@/app/simulation/planet/types";

export interface PlanetViewportQuery {
  bounds: GeographicBounds;
  zoom: number;
  sinceRevision: number | null;
}

function finiteParam(
  search: URLSearchParams,
  name: string,
  fallback: number,
): number {
  const raw = search.get(name);
  if (raw === null || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${name} must be a finite number.`);
  return value;
}

export function parseViewportQuery(request: Request): PlanetViewportQuery {
  const search = new URL(request.url).searchParams;
  const bounds: GeographicBounds = {
    west: finiteParam(search, "west", -180),
    east: finiteParam(search, "east", 180),
    south: finiteParam(search, "south", -90),
    north: finiteParam(search, "north", 90),
  };
  if (bounds.west < -180 || bounds.west > 180) {
    throw new Error("west must be between -180 and 180 degrees.");
  }
  if (bounds.east < -180 || bounds.east > 180) {
    throw new Error("east must be between -180 and 180 degrees.");
  }
  if (bounds.south < -90 || bounds.south > 90) {
    throw new Error("south must be between -90 and 90 degrees.");
  }
  if (bounds.north < -90 || bounds.north > 90) {
    throw new Error("north must be between -90 and 90 degrees.");
  }
  if (bounds.south >= bounds.north) {
    throw new Error("south must be lower than north.");
  }
  const zoom = Math.min(20, Math.max(0, finiteParam(search, "zoom", 0)));
  const rawRevision = search.get("sinceRevision");
  let sinceRevision: number | null = null;
  if (rawRevision !== null && rawRevision !== "") {
    const parsed = Number(rawRevision);
    if (!Number.isSafeInteger(parsed) || parsed < 0) {
      throw new Error("sinceRevision must be a non-negative integer.");
    }
    sinceRevision = parsed;
  }
  return { bounds, zoom, sinceRevision };
}

export function pathParts(request: Request): string[] {
  return new URL(request.url).pathname
    .split("/")
    .filter(Boolean)
    .map((part) => decodeURIComponent(part));
}
