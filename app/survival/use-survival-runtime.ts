"use client";

import { createElement, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { SurvivalRuntimeContext } from "./survival-runtime-context";
import { ObserverSelectionProvider } from "./observer-selection";
import { commitCheckpoint, eventSequence, exportRunArchive, extendHistoryWindow, loadCheckpoint, loadCommandCheckpoint, loadEventPage, recoverLastGoodCheckpoint, type SurvivalCheckpoint } from "./survival-persistence";
import { SurvivalWorkerBridge, SURVIVAL_WORKER_STEP_LIMIT } from "./survival-worker-bridge";
import {
  addObserverAgent,
  createSurvivalRun,
  restoreSurvivalRun,
  validateSurvivalRun,
  setSurvivalRunPaused,
  type AddObserverAgentResult,
  type SurvivalRunOptions,
  type SurvivalRunState,
  type SurvivalEvent,
} from "../simulation/survival";

const STORAGE_KEY = "simulation:survival-run:v1";
const RECOVERY_STORAGE_KEY = "simulation:survival-run:unreadable-backup";
export const SURVIVAL_RUNTIME_LEASE_KEY = "simulation:survival-run:leader-lease:v1";
export const SURVIVAL_RUNTIME_LEASE_MILLISECONDS = 3_000;
const LEASE_RENEWAL_WINDOW_MILLISECONDS = 1_250;
const DEFAULT_SEED = "simulation-survival-study-1";
const REAL_MILLISECONDS_PER_STEP_AT_1X = 1_000;

export type PlaybackSpeed = 0.5 | 1 | 2 | 4;

export interface SurvivalRuntimeLease {
  ownerId: string;
  expiresAt: number;
}

export interface SurvivalRuntime {
  runInstanceId: string;
  busy: boolean;
  lastSavedAt: number | null;
  historyEvents: SurvivalEvent[];
  archiveStatus: "saved" | "partial" | "unavailable";
  hasOlderEvents: boolean;
  historyFrozen: boolean;
  freezeHistory(): void;
  returnLiveHistory(): void;
  loadOlderEvents(): Promise<void>;
  exportHistory(): Promise<void>;
  retry(): Promise<void>;
  recoverBackup(): Promise<void>;
  world: SurvivalRunState | null;
  ready: boolean;
  speed: PlaybackSpeed;
  storageStatus: "saved-on-device" | "save-unavailable";
  recoveryNotice: string | null;
  lastEvents: string[];
  setSpeed(speed: PlaybackSpeed): void;
  setPaused(paused: boolean): Promise<void>;
  start(options: SurvivalRunOptions, seed?: string | number): Promise<void>;
  addAgent(): Promise<AddObserverAgentResult | null>;
  dismissRecoveryNotice(): void;
}

export function loadStoredRun(storage?: Pick<Storage, "getItem" | "setItem">): { world: SurvivalRunState | null; recoveryNotice: string | null } {
  try {
    const source = storage ?? window.localStorage;
    const stored = source.getItem(STORAGE_KEY);
    if (!stored) return { world: null, recoveryNotice: null };
    try {
      return { world: restoreSurvivalRun(stored), recoveryNotice: null };
    } catch {
      try {
        source.setItem(RECOVERY_STORAGE_KEY, stored);
      } catch {
        // A readable notice still matters when the browser also refuses backup storage.
      }
      return {
        world: null,
        recoveryNotice: "The previous checkpoint was invalid. A backup was preserved when storage allowed. No new run has replaced it.",
      };
    }
  } catch {
    // An inaccessible legacy record is not evidence that no study exists.
    // Initialization must stop instead of committing a new default study.
    throw new Error("The previous device record could not be read. Allow browser storage, then retry. No new study has replaced it.");
  }
}

export function readSurvivalRuntimeLease(storage: Pick<Storage, "getItem">): SurvivalRuntimeLease | null {
  try {
    const value: unknown = JSON.parse(storage.getItem(SURVIVAL_RUNTIME_LEASE_KEY) ?? "null");
    if (!value || typeof value !== "object") return null;
    const lease = value as Partial<SurvivalRuntimeLease>;
    if (typeof lease.ownerId !== "string" || !lease.ownerId || typeof lease.expiresAt !== "number" || !Number.isFinite(lease.expiresAt)) return null;
    return { ownerId: lease.ownerId, expiresAt: lease.expiresAt };
  } catch {
    return null;
  }
}

/**
 * Best-effort localStorage lease. The confirming read makes concurrent claims
 * converge on the last writer; every write/advance also rechecks ownership.
 */
export function claimSurvivalRuntimeLease(
  storage: Pick<Storage, "getItem" | "setItem">,
  ownerId: string,
  now: number,
  force = false,
): boolean {
  const current = readSurvivalRuntimeLease(storage);
  if (!force && current && current.ownerId !== ownerId && current.expiresAt > now) return false;
  if (current?.ownerId === ownerId && current.expiresAt - now > LEASE_RENEWAL_WINDOW_MILLISECONDS) return true;
  const candidate: SurvivalRuntimeLease = { ownerId, expiresAt: now + SURVIVAL_RUNTIME_LEASE_MILLISECONDS };
  storage.setItem(SURVIVAL_RUNTIME_LEASE_KEY, JSON.stringify(candidate));
  const confirmed = readSurvivalRuntimeLease(storage);
  return confirmed?.ownerId === ownerId && confirmed.expiresAt > now;
}

export function ownsSurvivalRuntimeLease(storage: Pick<Storage, "getItem">, ownerId: string, now: number): boolean {
  const current = readSurvivalRuntimeLease(storage);
  return current?.ownerId === ownerId && current.expiresAt > now;
}

export function releaseSurvivalRuntimeLease(
  storage: Pick<Storage, "getItem" | "removeItem">,
  ownerId: string,
): boolean {
  const current = readSurvivalRuntimeLease(storage);
  if (current?.ownerId !== ownerId) return false;
  storage.removeItem(SURVIVAL_RUNTIME_LEASE_KEY);
  return true;
}

function createRuntimeOwnerId(): string {
  try {
    return `observer-${globalThis.crypto.randomUUID()}`;
  } catch {
    return `observer-${Date.now().toString(36)}-${performance.now().toString(36).replace(".", "")}`;
  }
}

export function useSurvivalRuntimeController(): SurvivalRuntime {
  const [checkpoint, setCheckpoint] = useState<SurvivalCheckpoint | null>(null);
  const [ready, setReady] = useState(false);
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null);
  const [storageStatus, setStorageStatus] = useState<"saved-on-device" | "save-unavailable">("saved-on-device");
  const [lastEvents, setLastEvents] = useState<string[]>([]);
  const [historyWindow, setHistoryWindow] = useState<{ runInstanceId: string; events: SurvivalEvent[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const current = useRef<SurvivalCheckpoint | null>(null);
  const [ownerId] = useState(createRuntimeOwnerId);
  const bridge = useRef<SurvivalWorkerBridge | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const generation = useRef(0);
  const disposed = useRef(false);
  const channel = useRef<BroadcastChannel | null>(null);
  const accumulated = useRef(0);
  const workerBusy = useRef(false);
  const commandBusy = useRef(false);
  const hasCheckpoint = Boolean(checkpoint);

  const accept = useCallback((next: SurvivalCheckpoint) => {
    if (disposed.current || (current.current && next.revision < current.current.revision)) return;
    if (current.current?.runInstanceId !== next.runInstanceId) { setHistoryWindow(null); setLastEvents([]); accumulated.current = 0; }
    current.current = next; setCheckpoint(next); setLastSavedAt(next.savedAt);
  }, []);

  const locked = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const invoke = async (): Promise<T> => navigator.locks
      ? await navigator.locks.request("simulation-survival-authority-v2", task)
      : await task(); // IndexedDB revision CAS remains authoritative without Web Locks.
    const work = queue.current.then(invoke, invoke);
    queue.current = work.catch(() => {});
    return work;
  }, []);

  const save = useCallback(async (next: SurvivalCheckpoint, events: SurvivalEvent[], expected: number | null) => {
    // Reject malformed output before it can replace the last known good checkpoint.
    if (!validateSurvivalRun(next.world)) throw new Error("The planner produced an invalid checkpoint. The previous saved run is intact.");
    if (!await commitCheckpoint(next, events, expected)) throw new Error("Another tab updated the run. Retry the command against its latest state.");
    accept(next); setStorageStatus("saved-on-device");
    channel.current?.postMessage({ revision: next.revision });
  }, [accept]);

  useEffect(() => {
    disposed.current = false;
    bridge.current = new SurvivalWorkerBridge();
    channel.current = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("simulation-survival-sync-v2") : null;
    const sync = async () => {
      try { const saved = await loadCheckpoint(); if (saved && !disposed.current) accept(saved); }
      catch { /* Preserve useful last-known state; the next write reports storage trouble. */ }
    };
    if (channel.current) channel.current.onmessage = () => void sync();
    const init = async () => {
      try {
        await locked(async () => {
          const saved = await loadCheckpoint();
          if (saved) {
            if (!validateSurvivalRun(saved.world)) throw new Error("The saved checkpoint is invalid; it has not been replaced.");
            if (saved.world.policyVersion === 2 && saved.world.schemaVersion === 1) {
              // Fence already-open pre-succession clients: their validator rejects
              // schema 2, so their workers cannot silently advance the old rules.
              await save({ ...saved, revision: saved.revision + 1, savedAt: Date.now(), world: { ...saved.world, schemaVersion: 2 } }, [], saved.revision);
            } else accept(saved);
            return;
          }
          const legacy = loadStoredRun();
          if (legacy.recoveryNotice) throw new Error(legacy.recoveryNotice);
          const world = legacy.world ?? createSurvivalRun(DEFAULT_SEED, { policyVersion: 4, materialFoundation: "geology-v1", agentCount: 3, agentCap: 5, durationHours: 72 });
          if (world.policyVersion === 2 && world.schemaVersion === 1) world.schemaVersion = 2;
          await save({ runInstanceId: crypto.randomUUID(), revision: 1, savedAt: Date.now(), speed: 1, world, missingBefore: world.eventWindow.droppedEvents }, world.events, null);
        });
      } catch (error) {
        setStorageStatus("save-unavailable");
        setRecoveryNotice(error instanceof Error ? error.message : "Device storage is unavailable. No saved study was replaced.");
      } finally { if (!disposed.current) setReady(true); }
    };
    void init();
    const visibility = () => { if (!document.hidden) void sync(); };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      disposed.current = true;
      bridge.current?.dispose(); channel.current?.close();
      try { releaseSurvivalRuntimeLease(localStorage, ownerId); } catch { /* The lease expires independently. */ }
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [accept, locked, save, ownerId]);

  useEffect(() => {
    if (!ready || !hasCheckpoint) return;
    let previous = performance.now();
    const timer = setInterval(() => {
      const now = performance.now(), elapsed = Math.min(2000, now - previous); previous = now;
      if (workerBusy.current || busy || storageStatus === "save-unavailable") return;
      const visible = current.current;
      if (!visible || visible.world.status !== "running") return;
      try { if (!claimSurvivalRuntimeLease(localStorage, ownerId, Date.now())) return; }
      catch { setRecoveryNotice("Run ownership could not be checked. Free device storage, then retry."); setStorageStatus("save-unavailable"); return; }
      accumulated.current += elapsed * visible.speed;
      const steps = Math.min(SURVIVAL_WORKER_STEP_LIMIT, Math.floor(accumulated.current / REAL_MILLISECONDS_PER_STEP_AT_1X));
      if (steps < 1) return;
      accumulated.current -= steps * REAL_MILLISECONDS_PER_STEP_AT_1X;
      workerBusy.current = true;
      const epoch = generation.current;
      void locked(async () => {
        const source = await loadCheckpoint();
        if (!source || epoch !== generation.current || disposed.current) return;
        if (source.world.status !== "running") { accept(source); return; }
        if (!ownsSurvivalRuntimeLease(localStorage, ownerId, Date.now())) { accept(source); return; }
        const result = await bridge.current!.advance(source.world, steps);
        if (epoch !== generation.current || disposed.current) return;
        const next = { ...source, revision: source.revision + 1, savedAt: Date.now(), world: result.state };
        await save(next, result.events, source.revision);
        const important = result.events.filter(e => ["agent_added", "agent_died", "discovery", "sole_survivor_decision", "succession_decision", "run_completed", "run_extinct"].includes(e.type));
        if (important.length) setLastEvents(important.slice(-2).map(e => e.summary + " " + e.outcome));
      }).catch(error => {
        if (epoch !== generation.current || disposed.current) return;
        setRecoveryNotice(error instanceof Error ? error.message : "The local run stopped. The last saved checkpoint is intact.");
        setStorageStatus("save-unavailable");
      }).finally(() => { workerBusy.current = false; });
    }, 200);
    return () => clearInterval(timer);
  }, [ready, hasCheckpoint, busy, storageStatus, ownerId, accept, locked, save]);

  const command = useCallback(async <T,>(change: (source: SurvivalCheckpoint) => { next: SurvivalCheckpoint; events: SurvivalEvent[]; value: T }): Promise<T | null> => {
    if (commandBusy.current) throw new Error("A command is already being saved.");
    const expectedRunInstanceId = current.current?.runInstanceId;
    commandBusy.current = true;
    generation.current++; accumulated.current = 0; setBusy(true);
    try {
      return await locked(async () => {
        const source = await loadCommandCheckpoint(expectedRunInstanceId);
        const result = change(source);
        result.next.revision = source.revision + 1; result.next.savedAt = Date.now();
        await save(result.next, result.events, source.revision);
        setRecoveryNotice(null);
        return result.value;
      });
    } catch (error) { setRecoveryNotice(error instanceof Error ? error.message : "This command could not be saved."); throw error; }
    finally { commandBusy.current = false; setBusy(false); }
  }, [locked, save]);

  const setPaused = useCallback(async (paused: boolean) => {
    await command(source => ({ next: { ...source, world: setSurvivalRunPaused(source.world, paused) }, events: [], value: null }));
  }, [command]);
  const start = useCallback(async (options: SurvivalRunOptions, seed?: string | number) => {
    await command(source => {
      const world = createSurvivalRun(seed ?? `survival-${Date.now()}`, options);
      return { next: { ...source, runInstanceId: crypto.randomUUID(), world, missingBefore: 0 }, events: world.events, value: null };
    });
  }, [command]);
  const addAgent = useCallback(async () => command(source => {
    const result = addObserverAgent(source.world);
    return { next: { ...source, world: result.state }, events: result.event ? [result.event] : [], value: result };
  }), [command]);
  const setSpeed = useCallback((speed: PlaybackSpeed) => {
    void command(source => ({ next: { ...source, speed }, events: [], value: null })).catch(() => {});
  }, [command]);
  const retry = useCallback(async () => {
    try {
      bridge.current?.dispose(); bridge.current = new SurvivalWorkerBridge();
      const saved = await loadCheckpoint();
      if (saved) { accept(saved); setStorageStatus("saved-on-device"); setRecoveryNotice(null); }
      else window.location.reload();
    } catch (error) { setRecoveryNotice(error instanceof Error ? error.message : "Device storage is still unavailable. Your last known record has not been discarded."); }
  }, [accept]);
  const recoverBackup = useCallback(async () => {
    if (!window.confirm("Recover the previous good checkpoint? This may roll back recent progress. The current checkpoint will be preserved separately.")) return;
    generation.current++;
    try {
      await locked(async () => {
        const saved = await recoverLastGoodCheckpoint();
        accept(saved); setStorageStatus("saved-on-device");
        setRecoveryNotice("Recovered the last good save. The unreadable checkpoint was kept separately.");
        channel.current?.postMessage({ revision: saved.revision });
      });
    } catch (error) { setRecoveryNotice(error instanceof Error ? error.message : "The backup could not be recovered."); }
  }, [accept, locked]);
  // A historical window stays fixed while the live tail advances. Mixing a fixed
  // older page with that moving tail would silently leave holes in the middle.
  const historyFrozen = Boolean(historyWindow && historyWindow.runInstanceId === checkpoint?.runInstanceId);
  const historyEvents = useMemo(() => historyFrozen ? historyWindow!.events : checkpoint?.world.events ?? [], [historyFrozen, historyWindow, checkpoint]);
  const freezeHistory = useCallback(() => {
    const source = current.current;
    if (source) setHistoryWindow(previous => previous?.runInstanceId === source.runInstanceId ? previous : { runInstanceId: source.runInstanceId, events: source.world.events });
  }, []);
  const returnLiveHistory = useCallback(() => setHistoryWindow(null), []);
  const loadOlderEvents = useCallback(async () => {
    const source = current.current;
    if (!source) return;
    try {
      const earliest = Math.min(...historyEvents.map(eventSequence), Number.MAX_SAFE_INTEGER);
      const page = await loadEventPage(source.runInstanceId, earliest);
      if (current.current?.runInstanceId === source.runInstanceId) setHistoryWindow(previous => {
        const windowEvents = previous?.runInstanceId === source.runInstanceId ? previous.events : historyEvents;
        return { runInstanceId: source.runInstanceId, events: extendHistoryWindow(windowEvents, page) };
      });
    } catch { throw new Error("Earlier history could not be read. The current record is still available."); }
  }, [historyEvents]);
  const exportHistory = useCallback(async () => {
    const source = current.current;
    if (!source) return;
    const text = await locked(() => exportRunArchive(source));
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `simulation-${source.runInstanceId}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [locked]);
  return {
    world: checkpoint?.world ?? null, ready, speed: checkpoint?.speed ?? 1, storageStatus, recoveryNotice, lastEvents,
    runInstanceId: checkpoint?.runInstanceId ?? "", busy, lastSavedAt, historyEvents,
    archiveStatus: storageStatus === "save-unavailable" ? "unavailable" : checkpoint?.missingBefore ? "partial" : "saved",
    hasOlderEvents: Boolean(checkpoint && historyEvents.length < 4608 && historyEvents.length && eventSequence(historyEvents[0]) > checkpoint.missingBefore + 1),
    historyFrozen, freezeHistory, returnLiveHistory,
    loadOlderEvents, exportHistory, retry, recoverBackup, setPaused, start, addAgent, setSpeed,
    dismissRecoveryNotice: () => setRecoveryNotice(null),
  };
}

export function SurvivalRuntimeProvider({ children }: { children: ReactNode }) {
  const runtime = useSurvivalRuntimeController();
  return createElement(SurvivalRuntimeContext.Provider, { value: runtime }, createElement(ObserverSelectionProvider, null, children));
}
export function useSurvivalRuntime(): SurvivalRuntime {
  const runtime = useContext(SurvivalRuntimeContext);
  if (!runtime) throw new Error("Simulation runtime provider is missing.");
  return runtime;
}
