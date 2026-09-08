import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AdvanceResult,
  PlanetHistoryEvent,
  PlanetWorldState,
} from "../../app/simulation/planet";
import {
  createPlanetWorldAdapter,
  type UpdatablePlanetExperienceAdapter,
} from "../../app/planet/engine-adapter";
import {
  clearPlanetWorld,
  appendPlanetHistory,
  createFreshPlanetWorld,
  loadPlanetWorld,
  readPlanetHistory,
  savePlanetWorld,
  type PlanetPersistenceMode,
  type PlanetReconstructionProgress,
} from "./planet-persistence";

const UI_REFRESH_MS = 750;
const SAVE_INTERVAL_MS = 6_000;
const SIMULATION_INTERVAL_MS = 240;
const EVENTS_PER_BATCH = 4_000;
const CATCH_UP_EVENTS_PER_BATCH = 20_000;

export interface LocalPlanetRuntime {
  adapter: UpdatablePlanetExperienceAdapter | null;
  world: PlanetWorldState | null;
  worldRevision: number;
  speed: number;
  persistence: PlanetPersistenceMode;
  saved: boolean;
  catchingUp: boolean;
  catchUpSeconds: number;
  reconstruction: PlanetReconstructionProgress;
  historyLedger: PlanetHistoryEvent[];
  error: string;
  setSpeed(speed: number): void;
  reset(seed?: string | number): Promise<void>;
  readHistory(startDay?: number, endDay?: number): Promise<PlanetHistoryEvent[]>;
}

interface WorkerReply {
  id: number;
  ok: boolean;
  world?: PlanetWorldState;
  result?: AdvanceResult;
  error?: string;
}

class PlanetWorkerBridge {
  private readonly worker = new Worker(
    new URL("./planet-simulation.worker.ts", import.meta.url),
    { type: "module", name: "wildgrid-planet-simulation" },
  );
  private nextId = 1;
  private pending = new Map<number, {
    resolve(value: WorkerReply): void;
    reject(reason: Error): void;
  }>();

  constructor() {
    this.worker.onmessage = ({ data }: MessageEvent<WorkerReply>) => {
      const operation = this.pending.get(data.id);
      if (!operation) return;
      this.pending.delete(data.id);
      if (data.ok) operation.resolve(data);
      else operation.reject(new Error(data.error ?? "The simulation worker failed."));
    };
    this.worker.onerror = () => {
      for (const operation of this.pending.values()) {
        operation.reject(new Error("The simulation worker stopped unexpectedly."));
      }
      this.pending.clear();
    };
  }

  private request(message: Record<string, unknown>): Promise<WorkerReply> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ ...message, id });
    });
  }

  async initialize(world: PlanetWorldState): Promise<PlanetWorldState> {
    const response = await this.request({ kind: "initialize", world });
    if (!response.world) throw new Error("The simulation worker returned no world.");
    return response.world;
  }

  async advance(seconds: number, maxEvents: number): Promise<{
    world: PlanetWorldState;
    result: AdvanceResult;
  }> {
    const response = await this.request({ kind: "advance", seconds, maxEvents });
    if (!response.world || !response.result) {
      throw new Error("The simulation worker returned an incomplete update.");
    }
    return { world: response.world, result: response.result };
  }

  terminate() {
    this.worker.terminate();
    for (const operation of this.pending.values()) {
      operation.reject(new Error("The simulation worker was replaced."));
    }
    this.pending.clear();
  }
}

export function useLocalPlanetRuntime(): LocalPlanetRuntime {
  const [adapter, setAdapter] = useState<UpdatablePlanetExperienceAdapter | null>(null);
  const [worldView, setWorldView] = useState<PlanetWorldState | null>(null);
  const [worldRevision, setWorldRevision] = useState(0);
  const [speed, setSpeedState] = useState(8);
  const [persistence, setPersistence] = useState<PlanetPersistenceMode>("memory");
  const [saved, setSaved] = useState(true);
  const [catchingUp, setCatchingUp] = useState(false);
  const [catchUpSeconds, setCatchUpSeconds] = useState(0);
  const [reconstruction, setReconstruction] = useState<PlanetReconstructionProgress>({
    resolution: "exact",
    coverageFromDay: 1,
    coarseEpochDays: null,
    targetSavedAt: null,
  });
  const [error, setError] = useState("");
  const [historyLedger, setHistoryLedger] = useState<PlanetHistoryEvent[]>([]);

  const worldRef = useRef<PlanetWorldState | null>(null);
  const adapterRef = useRef<UpdatablePlanetExperienceAdapter | null>(null);
  const speedRef = useRef(8);
  const dirtyRef = useRef(false);
  const catchingRef = useRef(false);
  const mountedRef = useRef(true);
  const taskTokenRef = useRef(0);
  const simulationTargetRef = useRef(0);
  const lastAdvanceAtRef = useRef(0);
  const lastUiAtRef = useRef(0);
  const hiddenAtRef = useRef<number | null>(null);
  const workerRef = useRef<PlanetWorkerBridge | null>(null);
  const advancePendingRef = useRef(false);
  const reconstructionRef = useRef(reconstruction);

  const recordHistory = useCallback(async (events: readonly PlanetHistoryEvent[]) => {
    if (events.length === 0) return;
    await appendPlanetHistory(events).catch(() => undefined);
    if (!mountedRef.current) return;
    setHistoryLedger((existing) => {
      const byId = new Map(existing.map((event) => [event.id, event]));
      for (const event of events) byId.set(event.id, event);
      return [...byId.values()].sort((left, right) => left.at - right.at || left.id.localeCompare(right.id));
    });
  }, []);

  const publishWorld = useCallback((force = false) => {
    const world = worldRef.current;
    const currentAdapter = adapterRef.current;
    if (!world || !currentAdapter) return;
    const now = Date.now();
    if (!force && now - lastUiAtRef.current < UI_REFRESH_MS) return;
    currentAdapter.update(world);
    lastUiAtRef.current = now;
    if (mountedRef.current) {
      setWorldView({ ...world });
      setWorldRevision(world.revision);
    }
  }, []);

  const persist = useCallback(async (savedAt = Date.now()) => {
    const world = worldRef.current;
    if (!world) return;
    const persistedRevision = world.revision;
    const recordsBeforeSave = world.agents.length;
    try {
      const mode = await savePlanetWorld(
        world,
        speedRef.current,
        savedAt,
        reconstructionRef.current,
      );
      if (!mountedRef.current) return;
      // Serialization intentionally bounds the rich deceased-person archive
      // in place. Refresh the adapter immediately if that maintenance changed
      // the observable record without advancing simulation time.
      if (world.agents.length !== recordsBeforeSave) publishWorld(true);
      const changedWhileSaving = worldRef.current?.revision !== persistedRevision;
      setPersistence(mode);
      setSaved(!changedWhileSaving);
      dirtyRef.current = changedWhileSaving;
    } catch {
      if (!mountedRef.current) return;
      // A transient quota/serialization failure must not turn a healthy,
      // already-open world into a fatal boot screen. Keep the last durable
      // checkpoint in place and retry on the next save interval.
      setSaved(false);
      dirtyRef.current = true;
    }
  }, [publishWorld]);

  const runCatchUp = useCallback(async (seconds: number, token: number) => {
    const world = worldRef.current;
    const bridge = workerRef.current;
    if (!world || !bridge || seconds <= 0) return;
    const targetTime = world.time + seconds;
    const startingTime = world.time;
    const startingSavedAt = Date.now() - seconds / Math.max(0.001, speedRef.current) * 1_000;
    catchingRef.current = true;
    if (mountedRef.current) {
      setCatchingUp(true);
      setCatchUpSeconds(seconds);
    }
    let batches = 0;
    while ((worldRef.current?.time ?? targetTime) < targetTime && token === taskTokenRef.current && mountedRef.current) {
      const current = worldRef.current;
      if (!current) break;
      let advanced;
      try {
        advanced = await bridge.advance(targetTime - current.time, CATCH_UP_EVENTS_PER_BATCH);
      } catch (reason) {
        if (token !== taskTokenRef.current || !mountedRef.current) return;
        catchingRef.current = false;
        setCatchingUp(false);
        setError(reason instanceof Error ? reason.message : "The local planet could not reconstruct elapsed time.");
        return;
      }
      const { world: advancedWorld, result } = advanced;
      worldRef.current = advancedWorld;
      const generatedEvents = result.generatedEvents;
      await recordHistory(generatedEvents);
      const resultReconstruction = result.reconstruction;
      {
        const previous = reconstructionRef.current;
        const severity = { exact: 0, mixed: 1, coarse: 2 } as const;
        const nextReconstruction = {
          resolution: severity[resultReconstruction.resolution] > severity[previous.resolution]
            ? resultReconstruction.resolution
            : previous.resolution,
          coverageFromDay: Math.min(previous.coverageFromDay, resultReconstruction.coverageFromDay),
          coarseEpochDays: Math.max(previous.coarseEpochDays ?? 0, resultReconstruction.coarseEpochDays ?? 0) || null,
          targetSavedAt: Date.now(),
        };
        reconstructionRef.current = nextReconstruction;
        setReconstruction(nextReconstruction);
      }
      dirtyRef.current = true;
      batches += 1;
      setCatchUpSeconds(Math.max(0, targetTime - advancedWorld.time));
      publishWorld(true);
      if (result.complete || result.processedEvents === 0) break;
      if (batches % 2 === 0) {
        const completedFraction = Math.max(0, Math.min(1,
          (advancedWorld.time - startingTime) / Math.max(0.001, targetTime - startingTime),
        ));
        const checkpointSavedAt = startingSavedAt
          + completedFraction * seconds / Math.max(0.001, speedRef.current) * 1_000;
        await persist(checkpointSavedAt);
      }
    }
    if (token !== taskTokenRef.current || !mountedRef.current) return;
    simulationTargetRef.current = worldRef.current?.time ?? targetTime;
    lastAdvanceAtRef.current = Date.now();
    catchingRef.current = false;
    setCatchingUp(false);
    setCatchUpSeconds(0);
    publishWorld(true);
    await persist();
  }, [persist, publishWorld, recordHistory]);

  useEffect(() => {
    mountedRef.current = true;
    const token = ++taskTokenRef.current;
    loadPlanetWorld().then(async (loaded) => {
      if (!mountedRef.current || token !== taskTokenRef.current) return;
      worldRef.current = loaded.world;
      const bridge = new PlanetWorkerBridge();
      workerRef.current?.terminate();
      workerRef.current = bridge;
      const workerWorld = await bridge.initialize(loaded.world);
      worldRef.current = workerWorld;
      await appendPlanetHistory(workerWorld.history).catch(() => undefined);
      const ledger = await readPlanetHistory().catch(() => []);
      if (mountedRef.current && token === taskTokenRef.current) {
        const byId = new Map([...ledger, ...workerWorld.history].map((event) => [event.id, event]));
        setHistoryLedger([...byId.values()].sort((left, right) => left.at - right.at || left.id.localeCompare(right.id)));
      }
      speedRef.current = loaded.speed;
      simulationTargetRef.current = loaded.world.time;
      lastAdvanceAtRef.current = Date.now();
      const nextAdapter = createPlanetWorldAdapter(loaded.world);
      adapterRef.current = nextAdapter;
      setAdapter(nextAdapter);
      setWorldView({ ...loaded.world });
      setWorldRevision(loaded.world.revision);
      setSpeedState(loaded.speed);
      setPersistence(loaded.persistence);
      reconstructionRef.current = loaded.reconstruction;
      setReconstruction(loaded.reconstruction);
      setError("");
      if (loaded.catchUpSeconds > 0.2) await runCatchUp(loaded.catchUpSeconds, token);
      else await persist();
    }).catch((reason: unknown) => {
      if (mountedRef.current) setError(reason instanceof Error ? reason.message : "The local planet could not be opened.");
    });
    return () => {
      mountedRef.current = false;
      taskTokenRef.current += 1;
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, [persist, runCatchUp]);

  useEffect(() => {
    if (!adapter) return;
    const interval = window.setInterval(async () => {
      const world = worldRef.current;
      const bridge = workerRef.current;
      if (!world || !bridge || advancePendingRef.current || catchingRef.current || document.visibilityState === "hidden") return;
      const now = Date.now();
      const realElapsed = Math.min(1, Math.max(0, (now - lastAdvanceAtRef.current) / 1_000));
      lastAdvanceAtRef.current = now;
      simulationTargetRef.current += realElapsed * speedRef.current;
      if (speedRef.current <= 0 || simulationTargetRef.current <= world.time) return;
      advancePendingRef.current = true;
      try {
        const { world: advancedWorld, result } = await bridge.advance(
          simulationTargetRef.current - world.time,
          EVENTS_PER_BATCH,
        );
        worldRef.current = advancedWorld;
        const generatedEvents = result.generatedEvents;
        await recordHistory(generatedEvents);
        if (result.processedEvents > 0 || result.complete) {
          dirtyRef.current = true;
          setSaved(false);
          publishWorld();
        }
      } catch (reason) {
        if (mountedRef.current) setError(reason instanceof Error ? reason.message : "The local planet could not advance.");
      } finally {
        advancePendingRef.current = false;
      }
    }, SIMULATION_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [adapter, publishWorld, recordHistory]);

  useEffect(() => {
    if (!adapter) return;
    const interval = window.setInterval(() => {
      if (dirtyRef.current && document.visibilityState === "visible") void persist();
    }, SAVE_INTERVAL_MS);

    const onVisibilityChange = () => {
      const now = Date.now();
      if (document.visibilityState === "hidden") {
        hiddenAtRef.current = now;
        lastAdvanceAtRef.current = now;
        void persist(now);
        return;
      }
      const hiddenAt = hiddenAtRef.current;
      hiddenAtRef.current = null;
      lastAdvanceAtRef.current = now;
      if (catchingRef.current) return;
      if (hiddenAt === null || speedRef.current <= 0) return;
      const elapsed = Math.max(0, (now - hiddenAt) / 1_000) * speedRef.current;
      if (elapsed <= 0.2) return;
      const token = ++taskTokenRef.current;
      void runCatchUp(elapsed, token);
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (dirtyRef.current) void persist();
    };
  }, [adapter, persist, runCatchUp]);

  const setSpeed = useCallback((nextSpeed: number) => {
    const normalized = Math.max(0, Math.min(24, Number.isFinite(nextSpeed) ? nextSpeed : 8));
    speedRef.current = normalized;
    simulationTargetRef.current = worldRef.current?.time ?? 0;
    lastAdvanceAtRef.current = Date.now();
    dirtyRef.current = true;
    setSpeedState(normalized);
    setSaved(false);
  }, []);

  const reset = useCallback(async (seed: string | number = Date.now()) => {
    const token = ++taskTokenRef.current;
    catchingRef.current = false;
    setCatchingUp(false);
    setCatchUpSeconds(0);
    await clearPlanetWorld();
    if (!mountedRef.current || token !== taskTokenRef.current) return;
    const world = createFreshPlanetWorld(seed);
    const bridge = new PlanetWorkerBridge();
    workerRef.current?.terminate();
    workerRef.current = bridge;
    worldRef.current = await bridge.initialize(world);
    setHistoryLedger([...world.history]);
    const freshReconstruction: PlanetReconstructionProgress = {
      resolution: "exact",
      coverageFromDay: 1,
      coarseEpochDays: null,
      targetSavedAt: null,
    };
    reconstructionRef.current = freshReconstruction;
    setReconstruction(freshReconstruction);
    simulationTargetRef.current = world.time;
    lastAdvanceAtRef.current = Date.now();
    dirtyRef.current = true;
    adapterRef.current?.update(world);
    setWorldView({ ...world });
    setWorldRevision(world.revision);
    setSaved(false);
    await persist();
  }, [persist]);

  return {
    adapter,
    world: worldView,
    worldRevision,
    speed,
    persistence,
    saved,
    catchingUp,
    catchUpSeconds,
    reconstruction,
    historyLedger,
    error,
    setSpeed,
    reset,
    readHistory: readPlanetHistory,
  };
}
