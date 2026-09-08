import {
  createPlanetWorld,
  normalizePlanetWorld,
  serializePlanetWorld,
  type PlanetHistoryEvent,
  type PlanetWorldState,
} from "../../app/simulation/planet";

const DATABASE_NAME = "wildgrid-pages-era3";
const DATABASE_VERSION = 2;
const STORE_NAME = "planet-worlds";
const EVENT_STORE_NAME = "planet-events";
const RECORD_KEY = "active-world-v3";
const RECOVERY_RECORD_KEY = "last-unreadable-world-v3";
const FALLBACK_KEY = "wildgrid:pages:active-world:v3";
const FALLBACK_RECOVERY_KEY = "wildgrid:pages:last-unreadable-world:v3";
const INITIAL_SEED = "wildgrid-github-pages-era-3";

export type PlanetPersistenceMode = "indexeddb" | "localstorage" | "memory";

export interface PersistedPlanetWorld {
  schemaVersion: 3 | 4;
  serializedWorld: string;
  savedAt: number;
  speed: number;
  reconstruction?: PlanetReconstructionProgress;
}

export interface PlanetReconstructionProgress {
  resolution: "exact" | "mixed" | "coarse";
  coverageFromDay: number;
  coarseEpochDays: number | null;
  targetSavedAt: number | null;
}

export interface LoadedPlanetWorld {
  world: PlanetWorldState;
  savedAt: number;
  speed: number;
  catchUpSeconds: number;
  persistence: PlanetPersistenceMode;
  reconstruction: PlanetReconstructionProgress;
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
      if (!request.result.objectStoreNames.contains(EVENT_STORE_NAME)) {
        const events = request.result.createObjectStore(EVENT_STORE_NAME, { keyPath: "id" });
        events.createIndex("by-day", ["day", "at", "id"], { unique: false });
        events.createIndex("by-at", ["at", "id"], { unique: false });
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
  return writeIndexedDbValue(RECORD_KEY, record);
}

async function writeIndexedDbValue(key: string, value: unknown): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction([STORE_NAME, EVENT_STORE_NAME], "readwrite");
      transaction.objectStore(STORE_NAME).put(value, key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("The local Era III world could not be saved."));
      transaction.onabort = () => reject(transaction.error ?? new Error("The local Era III save was interrupted."));
    });
  } finally {
    database.close();
  }
}

async function preserveUnreadableIndexedDbRecord(value: unknown): Promise<void> {
  if (value === undefined || value === null) return;
  try {
    await writeIndexedDbValue(RECOVERY_RECORD_KEY, {
      preservedAt: Date.now(),
      record: value,
    });
  } catch {
    // A failed recovery copy must not prevent the simulation from opening.
  }
}

function preserveUnreadableLocalRecord(value: string): void {
  if (!value) return;
  try {
    localStorage.setItem(FALLBACK_RECOVERY_KEY, JSON.stringify({
      preservedAt: Date.now(),
      record: value,
    }));
  } catch {
    // Storage quotas and privacy modes can prevent a recovery copy.
  }
}

function normalizeRecord(value: unknown, persistence: PlanetPersistenceMode): LoadedPlanetWorld | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<PersistedPlanetWorld>;
  if ((candidate.schemaVersion !== 3 && candidate.schemaVersion !== 4) || typeof candidate.serializedWorld !== "string") return null;
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
      reconstruction: normalizeReconstruction(
        candidate.reconstruction,
        world.history[0]?.day ?? world.day,
      ),
    };
  } catch {
    return null;
  }
}

function normalizeReconstruction(
  value: unknown,
  fallbackDay: number,
): PlanetReconstructionProgress {
  const candidate = value && typeof value === "object"
    ? value as Partial<PlanetReconstructionProgress>
    : {};
  const resolution = candidate.resolution === "mixed" || candidate.resolution === "coarse"
    ? candidate.resolution
    : "exact";
  return {
    resolution,
    coverageFromDay: Number.isFinite(candidate.coverageFromDay)
      ? Math.max(1, Number(candidate.coverageFromDay))
      : Math.max(1, fallbackDay),
    coarseEpochDays: Number.isFinite(candidate.coarseEpochDays)
      ? Math.max(1, Number(candidate.coarseEpochDays))
      : null,
    targetSavedAt: Number.isFinite(candidate.targetSavedAt)
      ? Number(candidate.targetSavedAt)
      : null,
  };
}

export async function loadPlanetWorld(): Promise<LoadedPlanetWorld> {
  if (typeof indexedDB !== "undefined") {
    try {
      const stored = await readIndexedDb();
      const record = normalizeRecord(stored, "indexeddb");
      if (record) return record;
      await preserveUnreadableIndexedDbRecord(stored);
    } catch {
      // Some private browsing modes expose IndexedDB but reject operations.
    }
  }

  try {
    const serialized = localStorage.getItem(FALLBACK_KEY);
    let candidate: unknown = null;
    if (serialized) {
      try {
        candidate = JSON.parse(serialized);
      } catch {
        preserveUnreadableLocalRecord(serialized);
      }
    }
    const record = normalizeRecord(candidate, "localstorage");
    if (record) return record;
    if (serialized && candidate !== null) preserveUnreadableLocalRecord(serialized);
  } catch {
    // The in-memory simulation remains usable when storage is unavailable.
  }

  return {
    world: createFounders(),
    savedAt: Date.now(),
    speed: 8,
    catchUpSeconds: 0,
    persistence: typeof indexedDB === "undefined" ? "memory" : "indexeddb",
    reconstruction: {
      resolution: "exact",
      coverageFromDay: 1,
      coarseEpochDays: null,
      targetSavedAt: null,
    },
  };
}

export async function savePlanetWorld(
  world: PlanetWorldState,
  speed: number,
  savedAt = Date.now(),
  reconstruction?: PlanetReconstructionProgress,
): Promise<PlanetPersistenceMode> {
  let serializedWorld: string;
  try {
    serializedWorld = serializePlanetWorld(world);
  } catch (initialReason) {
    // Compatibility normalization is deliberately attempted on a clone. It
    // can compact bounded historical records from older Era III releases
    // without mutating the world that the observer is currently watching.
    try {
      serializedWorld = serializePlanetWorld(normalizePlanetWorld(world));
    } catch {
      throw initialReason;
    }
  }
  const record: PersistedPlanetWorld = {
    schemaVersion: 4,
    serializedWorld,
    savedAt,
    speed,
    reconstruction: reconstruction ?? {
      resolution: "exact",
      coverageFromDay: Math.max(1, world.day),
      coarseEpochDays: null,
      targetSavedAt: null,
    },
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

/** Append-only device-local chronicle, independent of the world's bounded display tail. */
export async function appendPlanetHistory(
  events: readonly PlanetHistoryEvent[],
): Promise<void> {
  if (events.length === 0 || typeof indexedDB === "undefined") return;
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(EVENT_STORE_NAME, "readwrite");
      const store = transaction.objectStore(EVENT_STORE_NAME);
      for (const event of events) store.put(event);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("The local history ledger could not be updated."));
      transaction.onabort = () => reject(transaction.error ?? new Error("The local history ledger update was interrupted."));
    });
  } finally {
    database.close();
  }
}

export async function readPlanetHistory(
  startDay = 1,
  endDay = Number.MAX_SAFE_INTEGER,
): Promise<PlanetHistoryEvent[]> {
  if (typeof indexedDB === "undefined") return [];
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(EVENT_STORE_NAME, "readonly");
      const index = transaction.objectStore(EVENT_STORE_NAME).index("by-day");
      const range = IDBKeyRange.bound(
        [Math.max(1, startDay), Number.MIN_SAFE_INTEGER, ""],
        [Math.max(startDay, endDay), Number.MAX_SAFE_INTEGER, "\uffff"],
      );
      const request = index.getAll(range);
      request.onsuccess = () => resolve(request.result as PlanetHistoryEvent[]);
      request.onerror = () => reject(request.error ?? new Error("The local history ledger could not be read."));
    });
  } finally {
    database.close();
  }
}

export async function clearPlanetWorld(): Promise<void> {
  try {
    localStorage.removeItem(FALLBACK_KEY);
    localStorage.removeItem(FALLBACK_RECOVERY_KEY);
  } catch {
    // Resetting the in-memory world still succeeds.
  }

  if (typeof indexedDB === "undefined") return;
  try {
    const database = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction([STORE_NAME, EVENT_STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      store.delete(RECORD_KEY);
      store.delete(RECOVERY_RECORD_KEY);
      transaction.objectStore(EVENT_STORE_NAME).clear();
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
