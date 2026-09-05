import {
  createPlanetWorld,
  normalizePlanetWorld,
  serializePlanetWorld,
  type PlanetWorldState,
} from "../../app/simulation/planet";

const DATABASE_NAME = "wildgrid-pages-era3";
const DATABASE_VERSION = 1;
const STORE_NAME = "planet-worlds";
const RECORD_KEY = "active-world-v3";
const FALLBACK_KEY = "wildgrid:pages:active-world:v3";
const INITIAL_SEED = "wildgrid-github-pages-era-3";

export type PlanetPersistenceMode = "indexeddb" | "localstorage" | "memory";

export interface PersistedPlanetWorld {
  schemaVersion: 3;
  serializedWorld: string;
  savedAt: number;
  speed: number;
}

export interface LoadedPlanetWorld {
  world: PlanetWorldState;
  savedAt: number;
  speed: number;
  catchUpSeconds: number;
  persistence: PlanetPersistenceMode;
}

function createFounders(seed: string | number = INITIAL_SEED) {
  return createPlanetWorld(seed, {
    initialAgentCount: 10,
    initialSettlementCount: 10,
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("The local Era III archive could not be opened."));
  });
}

async function readIndexedDb(): Promise<unknown> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(RECORD_KEY);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("The local Era III world could not be read."));
    });
  } finally {
    database.close();
  }
}

async function writeIndexedDb(record: PersistedPlanetWorld): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(record, RECORD_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("The local Era III world could not be saved."));
      transaction.onabort = () => reject(transaction.error ?? new Error("The local Era III save was interrupted."));
    });
  } finally {
    database.close();
  }
}

function normalizeRecord(value: unknown, persistence: PlanetPersistenceMode): LoadedPlanetWorld | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<PersistedPlanetWorld>;
  if (candidate.schemaVersion !== 3 || typeof candidate.serializedWorld !== "string") return null;
  try {
    const world = normalizePlanetWorld(candidate.serializedWorld);
    const savedAt = Number.isFinite(candidate.savedAt) ? Number(candidate.savedAt) : Date.now();
    const speed = Number.isFinite(candidate.speed) ? Math.max(0, Math.min(24, Number(candidate.speed))) : 8;
    return {
      world,
      savedAt,
      speed,
      catchUpSeconds: Math.max(0, (Date.now() - savedAt) / 1_000) * speed,
      persistence,
    };
  } catch {
    return null;
  }
}

export async function loadPlanetWorld(): Promise<LoadedPlanetWorld> {
  if (typeof indexedDB !== "undefined") {
    try {
      const record = normalizeRecord(await readIndexedDb(), "indexeddb");
      if (record) return record;
    } catch {
      // Some private browsing modes expose IndexedDB but reject operations.
    }
  }

  try {
    const serialized = localStorage.getItem(FALLBACK_KEY);
    const record = normalizeRecord(serialized ? JSON.parse(serialized) : null, "localstorage");
    if (record) return record;
  } catch {
    // The in-memory simulation remains usable when storage is unavailable.
  }

  return {
    world: createFounders(),
    savedAt: Date.now(),
    speed: 8,
    catchUpSeconds: 0,
    persistence: typeof indexedDB === "undefined" ? "memory" : "indexeddb",
  };
}

export async function savePlanetWorld(
  world: PlanetWorldState,
  speed: number,
  savedAt = Date.now(),
): Promise<PlanetPersistenceMode> {
  const record: PersistedPlanetWorld = {
    schemaVersion: 3,
    serializedWorld: serializePlanetWorld(world),
    savedAt,
    speed,
  };

  if (typeof indexedDB !== "undefined") {
    try {
      await writeIndexedDb(record);
      return "indexeddb";
    } catch {
      // Fall through to localStorage for browsers with a disabled IDB backend.
    }
  }

  try {
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(record));
    return "localstorage";
  } catch {
    return "memory";
  }
}

export async function clearPlanetWorld(): Promise<void> {
  try {
    localStorage.removeItem(FALLBACK_KEY);
  } catch {
    // Resetting the in-memory world still succeeds.
  }

  if (typeof indexedDB === "undefined") return;
  try {
    const database = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).delete(RECORD_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("The Era III world could not be cleared."));
      transaction.onabort = () => reject(transaction.error ?? new Error("The Era III reset was interrupted."));
    });
    database.close();
  } catch {
    // Storage can be unavailable while the current session remains functional.
  }
}

export function createFreshPlanetWorld(seed: string | number = Date.now()) {
  return createFounders(seed);
}
