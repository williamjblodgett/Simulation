import type { SurvivalEvent, SurvivalRunState } from "../simulation/survival/types";
import { validateSurvivalRun } from "../simulation/survival/engine";

export interface SurvivalCheckpoint {
  runInstanceId: string;
  revision: number;
  savedAt: number;
  speed: 0.5 | 1 | 2 | 4;
  world: SurvivalRunState;
  missingBefore: number;
}
const DATABASE = "simulation-survival-evidence-v2";
export const HISTORY_RETENTION = 100_000;
export const eventSequence = (event: SurvivalEvent) => Number(event.id.slice(6));
let connection: Promise<IDBDatabase> | null = null;
function database(): Promise<IDBDatabase> {
  if (connection) return connection;
  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("checkpoints");
      request.result.createObjectStore("events", { keyPath: ["runInstanceId", "sequence"] });
    };
    request.onerror = () => { connection = null; reject(request.error); };
    request.onblocked = () => { connection = null; reject(new Error("Close older Simulation tabs to open the evidence store.")); };
    request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); connection = null; }; resolve(request.result); };
  });
  connection = opening;
  void opening.catch(() => { if (connection === opening) connection = null; });
  return connection;
}
export function validateCheckpoint(value: unknown): value is SurvivalCheckpoint {
  if (!value || typeof value !== "object") return false;
  const entry = value as SurvivalCheckpoint;
  return typeof entry.runInstanceId === "string" && entry.runInstanceId.length > 0 && entry.runInstanceId.length < 200
    && Number.isSafeInteger(entry.revision) && entry.revision > 0
    && Number.isFinite(entry.savedAt) && entry.savedAt >= 0
    && [0.5, 1, 2, 4].includes(entry.speed)
    && validateSurvivalRun(entry.world)
    && Number.isSafeInteger(entry.missingBefore) && entry.missingBefore >= 0 && entry.missingBefore <= entry.world.eventWindow.totalEvents;
}
export async function loadCheckpoint(key = "active"): Promise<SurvivalCheckpoint | null> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction("checkpoints").objectStore("checkpoints").get(key);
    request.onsuccess = () => {
      if (request.result === undefined) resolve(null);
      else if (validateCheckpoint(request.result)) resolve(request.result);
      else reject(new Error("The saved checkpoint is invalid. It has not been replaced; try Recover last good save."));
    };
    request.onerror = () => reject(request.error);
  });
}
/** Resolve after acquiring authority, but never retarget an observer command. */
export async function loadCommandCheckpoint(expectedRunInstanceId: string | undefined): Promise<SurvivalCheckpoint> {
  const source = await loadCheckpoint();
  if (!source) throw new Error("No saved study is available.");
  if (source.runInstanceId !== expectedRunInstanceId) throw new Error("The active study changed in another tab. Review it before retrying.");
  return source;
}

export function extendHistoryWindow(windowEvents: SurvivalEvent[], page: SurvivalEvent[]): SurvivalEvent[] {
  const merged = new Map([...page, ...windowEvents].map(event => [event.id, event]));
  return [...merged.values()].sort((a, b) => eventSequence(a) - eventSequence(b)).slice(-4608);
}
/** Checkpoint cursor and every emitted event commit atomically. CAS rejects stale tabs. */
function fenceCheckpoint(checkpoint: SurvivalCheckpoint, survivalFence = false, discoveryFence = false, materialFence = false): SurvivalCheckpoint {
  if(materialFence && [2,3,4].includes(checkpoint.world.policyVersion??1))return {...checkpoint,world:{...checkpoint.world,schemaVersion:6}};
  // A later commit from a preserved older study cannot downgrade a newer backup.
  if(checkpoint.world.schemaVersion>=5)return checkpoint;
  if(discoveryFence && [2,3,4].includes(checkpoint.world.policyVersion??1))return {...checkpoint,world:{...checkpoint.world,schemaVersion:5}};
  // A format-only fence preserves the original tick, decisions and observations.
  // No survival revision or measurements are invented for a pre-adoption backup.
  if (survivalFence && (checkpoint.world.policyVersion === 2 || checkpoint.world.policyVersion === 3)) {
    return { ...checkpoint, world: { ...checkpoint.world, schemaVersion: 4 } };
  }
  return checkpoint.world.policyVersion === 2 && checkpoint.world.schemaVersion === 1
    ? { ...checkpoint, world: { ...checkpoint.world, schemaVersion: 2 } }
    : checkpoint;
}

export async function commitCheckpoint(next: SurvivalCheckpoint, events: SurvivalEvent[], expectedRevision: number | null): Promise<boolean> {
  if (!validateCheckpoint(next)) throw new Error("Invalid checkpoint; the saved study was not replaced.");
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["checkpoints", "events"], "readwrite");
    let committed = false;
    const checkpoints = tx.objectStore("checkpoints");
    const read = checkpoints.get("active");
    read.onsuccess = () => {
      const previous = read.result as SurvivalCheckpoint | undefined;
      if (previous && !validateCheckpoint(previous)) { tx.abort(); return; }
      if ((previous?.revision ?? null) !== expectedRevision) return;
      const store = tx.objectStore("events");
      const cutoff = Math.max(next.missingBefore, next.world.eventWindow.totalEvents - HISTORY_RETENTION);
      next.missingBefore = cutoff;
      for (const event of events) if (eventSequence(event) > cutoff) store.put({ runInstanceId: next.runInstanceId, sequence: eventSequence(event), event });
      if (cutoff > 0) store.delete(IDBKeyRange.bound([next.runInstanceId, 0], [next.runInstanceId, cutoff]));
      // Recovery must not reopen an old client's ability to run earlier rules.
      if (previous) checkpoints.put(fenceCheckpoint(previous, next.world.schemaVersion === 4, next.world.schemaVersion === 5, next.world.schemaVersion === 6), "last-good");
      checkpoints.put(next, "active");
      checkpoints.put(next, `run:${next.runInstanceId}`);
      committed = true;
    };
    tx.oncomplete = () => resolve(committed);
    tx.onerror = () => reject(tx.error ?? new Error("Evidence transaction failed."));
    tx.onabort = () => reject(tx.error ?? new Error("Evidence transaction was interrupted."));
  });
}
export async function loadEventPage(runInstanceId: string, before = Number.MAX_SAFE_INTEGER, limit = 256): Promise<SurvivalEvent[]> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("events");
    const records: SurvivalEvent[] = [];
    const cursor = tx.objectStore("events").openCursor(IDBKeyRange.bound([runInstanceId, 0], [runInstanceId, before], false, true), "prev");
    cursor.onsuccess = () => {
      if (cursor.result && records.length < limit) { records.push(cursor.result.value.event); cursor.result.continue(); }
      else resolve(records);
    };
    cursor.onerror = () => reject(cursor.error);
  });
}
export async function loadSavedRuns(): Promise<SurvivalCheckpoint[]> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction("checkpoints").objectStore("checkpoints").getAll(IDBKeyRange.bound("run:", "run:\uffff"));
    request.onsuccess = () => resolve(request.result.filter(validateCheckpoint).sort((a: SurvivalCheckpoint, b: SurvivalCheckpoint) => b.savedAt - a.savedAt));
    request.onerror = () => reject(request.error);
  });
}
export async function exportRunArchive(checkpoint: SurvivalCheckpoint): Promise<string> {
  const events: SurvivalEvent[] = [];
  let before = checkpoint.world.eventWindow.totalEvents + 1;
  for (;;) {
    const page = await loadEventPage(checkpoint.runInstanceId, before, 1000);
    events.push(...page.filter(event => eventSequence(event) > checkpoint.missingBefore));
    if (page.length < 1000 || eventSequence(page.at(-1)!) <= checkpoint.missingBefore + 1) break;
    before = eventSequence(page.at(-1)!);
  }
  return JSON.stringify({ format: "simulation-evidence-v2", checkpoint, events: events.sort((a, b) => eventSequence(a) - eventSequence(b)), retentionLimit: HISTORY_RETENTION }, null, 2);
}

/** Explicit recovery preserves the unreadable active value before restoring a validated backup. */
export async function recoverLastGoodCheckpoint(): Promise<SurvivalCheckpoint> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("checkpoints", "readwrite");
    const store = tx.objectStore("checkpoints");
    let recovered: SurvivalCheckpoint | null = null;
    const active = store.get("active");
    active.onsuccess = () => {
      const backup = store.get("last-good");
      backup.onsuccess = () => {
        if (!validateCheckpoint(backup.result)) { tx.abort(); return; }
        if (active.result) store.put(active.result, `unreadable:${Date.now()}`);
        const knownCutoff = active.result?.runInstanceId === backup.result.runInstanceId && Number.isSafeInteger(active.result?.missingBefore) ? active.result.missingBefore : 0;
        recovered = fenceCheckpoint({ ...backup.result, missingBefore: Math.min(backup.result.world.eventWindow.totalEvents, Math.max(backup.result.missingBefore, knownCutoff)), revision: Math.max(backup.result.revision, Number.isSafeInteger(active.result?.revision) ? active.result.revision : 0) + 1, savedAt: Date.now() }, active.result?.world?.schemaVersion === 4, active.result?.world?.schemaVersion === 5, active.result?.world?.schemaVersion === 6);
        store.put(recovered, "active");
        store.put(recovered, `run:${recovered.runInstanceId}`);
      };
    };
    tx.oncomplete = () => recovered ? resolve(recovered) : reject(new Error("No valid backup is available."));
    tx.onabort = tx.onerror = () => reject(new Error("No valid backup could be recovered. Existing records remain untouched."));
  });
}
