import { deterministicBetween, deterministicUnit, seedToUint32, stableId } from "./random";
import type {
  BiomeKind,
  ChunkCoordinate,
  GeologyKind,
  PlanetChunk,
  PlanetCoordinate,
  ResourceDefinition,
  ResourceSite,
  SeedInput,
  TerrainSample,
} from "./types";

export const PLANET_WIDTH = 8_192;
export const PLANET_HEIGHT = 4_096;
export const PLANET_CHUNK_SIZE = 128;
export const PLANET_CHUNKS_X = PLANET_WIDTH / PLANET_CHUNK_SIZE;
export const PLANET_CHUNKS_Y = PLANET_HEIGHT / PLANET_CHUNK_SIZE;
export const TERRAIN_SAMPLES_PER_CHUNK = 16;
export const TERRITORY_CELL_DEGREES = 2;

export function normalizeLongitude(longitude: number): number {
  const wrapped = ((longitude + 180) % 360 + 360) % 360 - 180;
  return wrapped === -180 && longitude > 0 ? 180 : wrapped;
}

export function normalizeCoordinate(coordinate: PlanetCoordinate): PlanetCoordinate {
  return {
    longitude: normalizeLongitude(coordinate.longitude),
    latitude: Math.max(-90, Math.min(90, coordinate.latitude)),
  };
}

export function logicalToCoordinate(x: number, y: number): PlanetCoordinate {
  return normalizeCoordinate({
    longitude: (x / PLANET_WIDTH) * 360 - 180,
    latitude: 90 - (y / PLANET_HEIGHT) * 180,
  });
}

export function coordinateToLogical(coordinate: PlanetCoordinate): { x: number; y: number } {
  const normalized = normalizeCoordinate(coordinate);
  const longitude = normalized.longitude === 180 ? -180 : normalized.longitude;
  return {
    x: ((longitude + 180) / 360) * PLANET_WIDTH,
    y: ((90 - normalized.latitude) / 180) * PLANET_HEIGHT,
  };
}

export function normalizeChunkCoordinate(x: number, y: number): ChunkCoordinate {
  return {
    x: ((Math.trunc(x) % PLANET_CHUNKS_X) + PLANET_CHUNKS_X) % PLANET_CHUNKS_X,
    y: Math.max(0, Math.min(PLANET_CHUNKS_Y - 1, Math.trunc(y))),
  };
}

export function chunkKey(x: number, y: number): string {
  const coordinate = normalizeChunkCoordinate(x, y);
  return `${coordinate.x}:${coordinate.y}`;
}

export function coordinateToChunk(coordinate: PlanetCoordinate): ChunkCoordinate {
  const logical = coordinateToLogical(coordinate);
  return normalizeChunkCoordinate(
    Math.floor(logical.x / PLANET_CHUNK_SIZE),
    Math.floor(logical.y / PLANET_CHUNK_SIZE),
  );
}

export function coordinateChunkKey(coordinate: PlanetCoordinate): string {
  const chunk = coordinateToChunk(coordinate);
  return chunkKey(chunk.x, chunk.y);
}

export function territoryCellKey(coordinate: PlanetCoordinate): string {
  const normalized = normalizeCoordinate(coordinate);
  const x = Math.floor((normalized.longitude + 180) / TERRITORY_CELL_DEGREES) % 180;
  const y = Math.min(89, Math.floor((90 - normalized.latitude) / TERRITORY_CELL_DEGREES));
  return `${Math.max(0, x)}:${Math.max(0, y)}`;
}

function smooth(value: number): number {
  return value * value * (3 - 2 * value);
}

function lattice(seed: number, x: number, y: number, label: string): number {
  const wrappedX = ((x % PLANET_WIDTH) + PLANET_WIDTH) % PLANET_WIDTH;
  const clampedY = Math.max(0, Math.min(PLANET_HEIGHT, y));
  return deterministicUnit(seed, label, wrappedX, clampedY);
}

function valueNoise(seed: number, x: number, y: number, scale: number, label: string): number {
  const gx = Math.floor(x / scale);
  const gy = Math.floor(y / scale);
  const tx = smooth((x % scale) / scale);
  const ty = smooth((y % scale) / scale);
  const period = Math.max(1, Math.floor(PLANET_WIDTH / scale));
  const wrapped = (value: number) => ((value % period) + period) % period;
  const a = lattice(seed, wrapped(gx), gy, label);
  const b = lattice(seed, wrapped(gx + 1), gy, label);
  const c = lattice(seed, wrapped(gx), gy + 1, label);
  const d = lattice(seed, wrapped(gx + 1), gy + 1, label);
  const top = a + (b - a) * tx;
  const bottom = c + (d - c) * tx;
  return top + (bottom - top) * ty;
}

function fractalNoise(seed: number, x: number, y: number, label: string): number {
  const scales = [1024, 512, 256, 128];
  const weights = [0.48, 0.27, 0.16, 0.09];
  return scales.reduce(
    (total, scale, index) => total + valueNoise(seed, x, y, scale, `${label}-${index}`) * weights[index],
    0,
  );
}

function chooseGeology(seed: number, x: number, y: number, ocean: boolean): GeologyKind {
  if (ocean) return "oceanic";
  const tectonic = fractalNoise(seed, x + 911, y + 487, "geology");
  if (tectonic > 0.8) return "volcanic";
  if (tectonic > 0.63) return "igneous";
  if (tectonic < 0.24) return "alluvial";
  if (tectonic < 0.52) return "sedimentary";
  return "metamorphic";
}

function chooseBiome(
  ocean: boolean,
  elevation: number,
  temperature: number,
  rainfall: number,
): BiomeKind {
  if (ocean) return "ocean";
  if (elevation > 0.84) return temperature < 0.3 ? "ice" : "alpine";
  if (temperature < 0.12) return "ice";
  if (temperature < 0.25) return rainfall > 0.42 ? "boreal_forest" : "tundra";
  if (rainfall < 0.17) return "desert";
  if (rainfall > 0.82 && elevation < 0.55) return "wetland";
  if (temperature > 0.68) return rainfall > 0.5 ? "tropical_forest" : "savanna";
  if (rainfall > 0.52) return "temperate_forest";
  return "grassland";
}

export function sampleTerrain(seedInput: SeedInput, logicalX: number, logicalY: number): TerrainSample {
  const seed = seedToUint32(seedInput);
  const x = ((logicalX % PLANET_WIDTH) + PLANET_WIDTH) % PLANET_WIDTH;
  const y = Math.max(0, Math.min(PLANET_HEIGHT - 0.0001, logicalY));
  const coordinate = logicalToCoordinate(x, y);
  const continental = fractalNoise(seed, x, y, "elevation");
  const ridge = Math.abs(fractalNoise(seed, x + 317, y - 181, "ridge") - 0.5) * 0.45;
  const elevation = Math.max(0, Math.min(1, continental + ridge - 0.14));
  const ocean = elevation < 0.46;
  const latitudeCooling = Math.pow(Math.abs(coordinate.latitude) / 90, 1.35);
  const temperature = Math.max(
    0,
    Math.min(1, 0.96 - latitudeCooling * 0.94 - Math.max(0, elevation - 0.58) * 0.75 + (fractalNoise(seed, x, y, "temperature") - 0.5) * 0.18),
  );
  const rainfall = Math.max(
    0,
    Math.min(1, fractalNoise(seed, x + 731, y + 239, "rainfall") * 0.88 + (ocean ? 0.12 : 0)),
  );
  const fertility = ocean
    ? 0
    : Math.max(0, Math.min(1, rainfall * 0.62 + temperature * 0.28 - Math.abs(elevation - 0.56) * 0.55));
  const geology = chooseGeology(seed, x, y, ocean);
  return {
    x: Math.round(x),
    y: Math.round(y),
    coordinate,
    elevation,
    temperature,
    rainfall,
    fertility,
    geology,
    biome: chooseBiome(ocean, elevation, temperature, rainfall),
    ocean,
  };
}

function resourceSuitability(definition: ResourceDefinition, terrain: TerrainSample): number {
  const rule = definition.spawn;
  if (rule.minTemperature !== undefined && terrain.temperature < rule.minTemperature) return 0;
  if (rule.maxTemperature !== undefined && terrain.temperature > rule.maxTemperature) return 0;
  if (rule.minRainfall !== undefined && terrain.rainfall < rule.minRainfall) return 0;
  if (rule.maxRainfall !== undefined && terrain.rainfall > rule.maxRainfall) return 0;
  if (rule.minElevation !== undefined && terrain.elevation < rule.minElevation) return 0;
  if (rule.maxElevation !== undefined && terrain.elevation > rule.maxElevation) return 0;
  if (rule.geology?.length && !rule.geology.includes(terrain.geology)) return 0;
  if (rule.biomes?.length && !rule.biomes.includes(terrain.biome)) return 0;
  if (definition.form !== "water" && definition.form !== "energy_flow" && terrain.ocean && !rule.biomes?.includes("ocean")) return 0;
  return rule.baseChance;
}

export function generateResourceSitesForChunk(
  seedInput: SeedInput,
  chunkX: number,
  chunkY: number,
  resourceCatalog: readonly ResourceDefinition[],
): ResourceSite[] {
  const seed = seedToUint32(seedInput);
  const chunk = normalizeChunkCoordinate(chunkX, chunkY);
  const sites: ResourceSite[] = [];
  for (const definition of resourceCatalog) {
    // Two stable candidate locations per resource/chunk keep generation sparse
    // while ensuring rare deposits can still occur on a large planet.
    for (let candidate = 0; candidate < 2; candidate += 1) {
      const x = chunk.x * PLANET_CHUNK_SIZE + deterministicBetween(seed, 4, PLANET_CHUNK_SIZE - 4, definition.id, chunk.x, chunk.y, candidate, "x");
      const y = chunk.y * PLANET_CHUNK_SIZE + deterministicBetween(seed, 4, PLANET_CHUNK_SIZE - 4, definition.id, chunk.x, chunk.y, candidate, "y");
      const terrain = sampleTerrain(seed, x, y);
      const suitability = resourceSuitability(definition, terrain);
      if (suitability <= 0) continue;
      if (deterministicUnit(seed, definition.id, chunk.x, chunk.y, candidate, "spawn") >= suitability) continue;
      const reserve = Math.round(
        deterministicBetween(
          seed,
          definition.yield.reserveMin,
          definition.yield.reserveMax,
          definition.id,
          chunk.x,
          chunk.y,
          candidate,
          "reserve",
        ),
      );
      sites.push({
        id: stableId("site", seed, definition.id, chunk.x, chunk.y, candidate),
        resourceId: definition.id,
        coordinate: terrain.coordinate,
        reserve,
        capacity: definition.yield.carryingCapacity ?? reserve,
        discoveredBy: [],
        extractionFacilityId: null,
      });
    }
  }
  return sites.sort((left, right) => left.id.localeCompare(right.id));
}

export function generatePlanetChunk(
  seedInput: SeedInput,
  chunkX: number,
  chunkY: number,
  resourceCatalog: readonly ResourceDefinition[] = [],
): PlanetChunk {
  const seed = seedToUint32(seedInput);
  const coordinate = normalizeChunkCoordinate(chunkX, chunkY);
  const step = PLANET_CHUNK_SIZE / TERRAIN_SAMPLES_PER_CHUNK;
  const terrain: TerrainSample[] = [];
  for (let row = 0; row < TERRAIN_SAMPLES_PER_CHUNK; row += 1) {
    for (let column = 0; column < TERRAIN_SAMPLES_PER_CHUNK; column += 1) {
      terrain.push(
        sampleTerrain(
          seed,
          coordinate.x * PLANET_CHUNK_SIZE + column * step + step / 2,
          coordinate.y * PLANET_CHUNK_SIZE + row * step + step / 2,
        ),
      );
    }
  }
  return {
    key: chunkKey(coordinate.x, coordinate.y),
    coordinate,
    revision: 0,
    terrain,
    resourceSites: generateResourceSitesForChunk(seed, coordinate.x, coordinate.y, resourceCatalog),
  };
}

export function greatCircleDistanceKm(left: PlanetCoordinate, right: PlanetCoordinate): number {
  const radians = Math.PI / 180;
  const lat1 = left.latitude * radians;
  const lat2 = right.latitude * radians;
  const deltaLatitude = (right.latitude - left.latitude) * radians;
  const deltaLongitude = normalizeLongitude(right.longitude - left.longitude) * radians;
  const a = Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLongitude / 2) ** 2;
  return 6_371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
