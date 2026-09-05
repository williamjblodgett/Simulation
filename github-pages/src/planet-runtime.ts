import { useCallback, useEffect, useRef, useState } from "react";
import {
  advancePlanet,
  type PlanetWorldState,
} from "../../app/simulation/planet";
import {
  createPlanetWorldAdapter,
  type UpdatablePlanetExperienceAdapter,
} from "../../app/planet/engine-adapter";
import {
  clearPlanetWorld,
  createFreshPlanetWorld,
  loadPlanetWorld,
  savePlanetWorld,
  type PlanetPersistenceMode,
} from "./planet-persistence";

const UI_REFRESH_MS = 750;
const SAVE_INTERVAL_MS = 6_000;
const SIMULATION_INTERVAL_MS = 240;
const EVENTS_PER_BATCH = 4_000;

export interface LocalPlanetRuntime {
  adapter: UpdatablePlanetExperienceAdapter | null;
  world: PlanetWorldState | null;
  worldRevision: number;
  speed: number;
  persistence: PlanetPersistenceMode;
  saved: boolean;
  catchingUp: boolean;
  catchUpSeconds: number;
  error: string;
  setSpeed(speed: number): void;
  reset(seed?: string | number): Promise<void>;
}

function yieldToBrowser() {
  return new Promise<void>((resolve) => window.setTimeout(resolve, 0));
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
  const [error, setError] = useState("");

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
    try {
      const mode = await savePlanetWorld(world, speedRef.current, savedAt);
      if (!mountedRef.current) return;
      const changedWhileSaving = worldRef.current?.revision !== persistedRevision;
      setPersistence(mode);
      setSaved(!changedWhileSaving);
      dirtyRef.current = changedWhileSaving;
    } catch (reason) {
      if (!mountedRef.current) return;
      setPersistence("memory");
      setSaved(false);
      setError(reason instanceof Error ? reason.message : "This world could not be saved on the device.");
    }
  }, []);

  const runCatchUp = useCallback(async (seconds: number, token: number) => {
    const world = worldRef.current;
    if (!world || seconds <= 0) return;
    const targetTime = world.time + seconds;
    catchingRef.current = true;
    if (mountedRef.current) {
      setCatchingUp(true);
      setCatchUpSeconds(seconds);
    }
    let batches = 0;
    while (world.time < targetTime && token === taskTokenRef.current && mountedRef.current) {
      const result = advancePlanet(world, targetTime - world.time, { maxEvents: EVENTS_PER_BATCH });
      dirtyRef.current = true;
      batches += 1;
      if (batches % 3 === 0 || result.complete) publishWorld(true);
      if (result.complete || result.processedEvents === 0) break;
      await yieldToBrowser();
    }
    if (token !== taskTokenRef.current || !mountedRef.current) return;
    simulationTargetRef.current = world.time;
    lastAdvanceAtRef.current = Date.now();
    catchingRef.current = false;
    setCatchingUp(false);
    setCatchUpSeconds(0);
    publishWorld(true);
    await persist();
  }, [persist, publishWorld]);

  useEffect(() => {
    mountedRef.current = true;
    const token = ++taskTokenRef.current;
    loadPlanetWorld().then(async (loaded) => {
      if (!mountedRef.current || token !== taskTokenRef.current) return;
      worldRef.current = loaded.world;
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
      if (loaded.catchUpSeconds > 0.2) await runCatchUp(loaded.catchUpSeconds, token);
      else await persist();
    }).catch((reason: unknown) => {
      if (mountedRef.current) setError(reason instanceof Error ? reason.message : "The local planet could not be opened.");
    });
    return () => {
      mountedRef.current = false;
      taskTokenRef.current += 1;
    };
  }, [persist, runCatchUp]);

  useEffect(() => {
    if (!adapter) return;
    const interval = window.setInterval(() => {
      const world = worldRef.current;
      if (!world || catchingRef.current || document.visibilityState === "hidden") return;
      const now = Date.now();
      const realElapsed = Math.min(1, Math.max(0, (now - lastAdvanceAtRef.current) / 1_000));
      lastAdvanceAtRef.current = now;
      simulationTargetRef.current += realElapsed * speedRef.current;
      if (speedRef.current <= 0 || simulationTargetRef.current <= world.time) return;
      const result = advancePlanet(world, simulationTargetRef.current - world.time, { maxEvents: EVENTS_PER_BATCH });
      if (result.processedEvents > 0 || result.complete) {
        dirtyRef.current = true;
        setSaved(false);
        publishWorld();
      }
    }, SIMULATION_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [adapter, publishWorld]);

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
    worldRef.current = world;
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
    error,
    setSpeed,
    reset,
  };
}
