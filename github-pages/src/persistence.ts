import {
  catchUpCivilization,
  createCivilizationWorld,
  normalizeCivilizationWorld,
  type CivilizationWorldState,
  type MajorEvent,
} from "../../app/simulation/civilization-engine";

const DATABASE_NAME = "wildgrid-pages";
const STORE_NAME = "simulation";
const RECORD_KEY = "active-world-v2";
const FALLBACK_KEY = "wildgrid:pages:active-world:v2";
const INITIAL_SEED = 2_846_731;

export interface PersistedWorld {
  world: CivilizationWorldState;
  history: MajorEvent[];
  savedAt: number;
  speed: number;
}

export interface LoadedWorld extends PersistedWorld {
  caughtUpSeconds: number;
  persistence: "indexeddb" | "localstorage" | "memory";
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB could not be opened"));
  });
}

async function readIndexedDb(): Promise<unknown> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(RECORD_KEY);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("World could not be read"));
    });
  } finally {
    database.close();
  }
}

async function writeIndexedDb(record: PersistedWorld): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(record, RECORD_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("World could not be saved"));
      transaction.onabort = () => reject(transaction.error ?? new Error("World save was aborted"));
    });
  } finally {
    database.close();
  }
}

function validEvent(value: unknown): value is MajorEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<MajorEvent>;
  return typeof event.id === "string" && Number.isFinite(event.day) && typeof event.type === "string";
}

export function mergeHistory(previous: readonly MajorEvent[], incoming: readonly MajorEvent[]) {
  const events = new Map<string, MajorEvent>();
  for (const event of [...previous, ...incoming]) {
    if (validEvent(event)) events.set(event.id, event);
  }
  return [...events.values()].sort((left, right) => left.day - right.day || left.id.localeCompare(right.id));
}

function normalizeRecord(value: unknown, persistence: LoadedWorld["persistence"]): LoadedWorld | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<PersistedWorld>;
  if (!raw.world) return null;
  const savedAt = Number.isFinite(raw.savedAt) ? Number(raw.savedAt) : Date.now();
  const speed = Number.isFinite(raw.speed) ? Math.max(0, Math.min(16, Number(raw.speed))) : 4;
  let world = normalizeCivilizationWorld(raw.world, INITIAL_SEED);
  const elapsedRealSeconds = Math.max(0, (Date.now() - savedAt) / 1_000);
  const caughtUpSeconds = speed > 0 ? elapsedRealSeconds * speed : 0;
  if (caughtUpSeconds > 0) world = catchUpCivilization(world, caughtUpSeconds);
  return {
    world,
    history: mergeHistory(Array.isArray(raw.history) ? raw.history : [], world.majorEvents),
    savedAt: Date.now(),
    speed,
    caughtUpSeconds,
    persistence,
  };
}

export async function loadWorld(): Promise<LoadedWorld> {
  if (typeof indexedDB !== "undefined") {
    try {
      const record = normalizeRecord(await readIndexedDb(), "indexeddb");
      if (record) return record;
    } catch {
      // Safari private browsing and hardened browsers can reject IndexedDB.
    }
  }
  try {
    const serialized = localStorage.getItem(FALLBACK_KEY);
    const record = normalizeRecord(serialized ? JSON.parse(serialized) : null, "localstorage");
    if (record) return record;
  } catch {
    // A fresh in-memory world is still fully playable.
  }
  const world = createCivilizationWorld(INITIAL_SEED);
  return {
    world,
    history: [...world.majorEvents],
    savedAt: Date.now(),
    speed: 4,
    caughtUpSeconds: 0,
    persistence: typeof indexedDB === "undefined" ? "memory" : "indexeddb",
  };
}

export async function saveWorld(record: PersistedWorld): Promise<LoadedWorld["persistence"]> {
  const normalized: PersistedWorld = {
    ...record,
    world: { ...record.world, lastSavedAt: record.savedAt },
    history: mergeHistory(record.history, record.world.majorEvents),
  };
  if (typeof indexedDB !== "undefined") {
    try {
      await writeIndexedDb(normalized);
      return "indexeddb";
    } catch {
      // Fall through to the smaller synchronous store where available.
    }
  }
  try {
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(normalized));
    return "localstorage";
  } catch {
    return "memory";
  }
}

export async function clearWorld(): Promise<void> {
  try {
    localStorage.removeItem(FALLBACK_KEY);
  } catch {
    // Ignore storage restrictions.
  }
  if (typeof indexedDB === "undefined") return;
  try {
    const database = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).delete(RECORD_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  } catch {
    // Resetting the in-memory state still succeeds.
  }
}
