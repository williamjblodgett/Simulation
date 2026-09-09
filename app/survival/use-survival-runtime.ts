"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  addObserverAgent,
  advanceSurvivalRun,
  createSurvivalRun,
  restoreSurvivalRun,
  serializeSurvivalRun,
  setSurvivalRunPaused,
  type AddObserverAgentResult,
  type SurvivalRunOptions,
  type SurvivalRunState,
} from "../simulation/survival";

const STORAGE_KEY = "simulation:survival-run:v1";
const RECOVERY_STORAGE_KEY = "simulation:survival-run:unreadable-backup";
export const SURVIVAL_RUNTIME_LEASE_KEY = "simulation:survival-run:leader-lease:v1";
export const SURVIVAL_RUNTIME_LEASE_MILLISECONDS = 3_000;
const LEASE_RENEWAL_WINDOW_MILLISECONDS = 1_250;
const DEFAULT_SEED = "simulation-survival-study-1";
const REAL_MILLISECONDS_PER_STEP_AT_1X = 1_000;
const MAX_STEPS_PER_INTERVAL = 24;

export type PlaybackSpeed = 0.5 | 1 | 2 | 4;

export interface SurvivalRuntimeLease {
  ownerId: string;
  expiresAt: number;
}

export interface SurvivalRuntime {
  world: SurvivalRunState | null;
  ready: boolean;
  speed: PlaybackSpeed;
  storageStatus: "saved-on-device" | "memory-only";
  recoveryNotice: string | null;
  lastEvents: string[];
  setSpeed(speed: PlaybackSpeed): void;
  setPaused(paused: boolean): void;
  start(options: SurvivalRunOptions, seed?: string | number): void;
  addAgent(): AddObserverAgentResult | null;
  dismissRecoveryNotice(): void;
}

function loadStoredRun(): { world: SurvivalRunState | null; recoveryNotice: string | null } {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return { world: null, recoveryNotice: null };
    try {
      return { world: restoreSurvivalRun(stored), recoveryNotice: null };
    } catch {
      try {
        window.localStorage.setItem(RECOVERY_STORAGE_KEY, stored);
      } catch {
        // A readable notice still matters when the browser also refuses backup storage.
      }
      return {
        world: null,
        recoveryNotice: "The previous checkpoint was invalid. A backup was preserved when storage allowed, and a fresh run was opened instead of presenting corrupted data.",
      };
    }
  } catch {
    return { world: null, recoveryNotice: null };
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

export function useSurvivalRuntime(): SurvivalRuntime {
  const [world, setWorld] = useState<SurvivalRunState | null>(null);
  const [ready, setReady] = useState(false);
  const [speed, setSpeedState] = useState<PlaybackSpeed>(1);
  const [storageStatus, setStorageStatus] = useState<"saved-on-device" | "memory-only">("saved-on-device");
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null);
  const [lastEvents, setLastEvents] = useState<string[]>([]);
  const worldRef = useRef<SurvivalRunState | null>(null);
  const speedRef = useRef<PlaybackSpeed>(1);
  const accumulatedMillisecondsRef = useRef(0);
  const lastIntervalAtRef = useRef(0);
  const [ownerId] = useState(createRuntimeOwnerId);
  const isLeaderRef = useRef(false);
  const storageAvailableRef = useRef(true);

  const publish = useCallback((next: SurvivalRunState) => {
    worldRef.current = next;
    setWorld(next);
  }, []);

  const markLeadership = useCallback((isLeader: boolean) => {
    if (isLeaderRef.current === isLeader) return;
    isLeaderRef.current = isLeader;
    accumulatedMillisecondsRef.current = 0;
    lastIntervalAtRef.current = performance.now();
  }, []);

  const claimLeadership = useCallback((force = false) => {
    if (!storageAvailableRef.current) {
      markLeadership(true);
      return true;
    }
    try {
      const claimed = claimSurvivalRuntimeLease(window.localStorage, ownerId, Date.now(), force);
      markLeadership(claimed);
      return claimed;
    } catch {
      storageAvailableRef.current = false;
      setStorageStatus("memory-only");
      markLeadership(true);
      return true;
    }
  }, [markLeadership, ownerId]);

  const persistOwnedWorld = useCallback((next: SurvivalRunState) => {
    if (!storageAvailableRef.current) return false;
    try {
      if (!ownsSurvivalRuntimeLease(window.localStorage, ownerId, Date.now())) {
        markLeadership(false);
        return false;
      }
      window.localStorage.setItem(STORAGE_KEY, serializeSurvivalRun(next));
      setStorageStatus("saved-on-device");
      return true;
    } catch {
      storageAvailableRef.current = false;
      setStorageStatus("memory-only");
      markLeadership(true);
      return false;
    }
  }, [markLeadership, ownerId]);

  useEffect(() => {
    const initialization = window.setTimeout(() => {
      const restored = loadStoredRun();
      setRecoveryNotice(restored.recoveryNotice);
      publish(restored.world ?? createSurvivalRun(DEFAULT_SEED, { agentCount: 3, agentCap: 3, durationHours: 72 }));
      claimLeadership(false);
      setReady(true);
    }, 0);
    return () => window.clearTimeout(initialization);
  }, [claimLeadership, publish]);

  useEffect(() => {
    worldRef.current = world;
    if (!world || !ready) return;
    const timer = window.setTimeout(() => {
      if (isLeaderRef.current && worldRef.current === world) persistOwnedWorld(world);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [persistOwnedWorld, ready, world]);

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  useEffect(() => {
    if (!ready) return;
    const receiveSharedCheckpoint = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage) return;
      if (event.key === SURVIVAL_RUNTIME_LEASE_KEY) {
        if (!ownsSurvivalRuntimeLease(window.localStorage, ownerId, Date.now())) markLeadership(false);
        return;
      }
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      if (ownsSurvivalRuntimeLease(window.localStorage, ownerId, Date.now())) return;
      try {
        const next = restoreSurvivalRun(event.newValue);
        const previous = worldRef.current;
        const cursorBefore = previous?.eventWindow.totalEvents ?? previous?.events.length ?? 0;
        const cursorAfter = next.eventWindow.totalEvents;
        if (previous?.id !== next.id || cursorAfter < cursorBefore) {
          setLastEvents([]);
        } else if (cursorAfter > cursorBefore) {
          const recent = next.events.slice(-Math.min(next.events.length, cursorAfter - cursorBefore));
          const important = recent.filter(({ type }) =>
            type === "agent_added" ||
            type === "agent_died" ||
            type === "discovery" ||
            type === "sole_survivor_decision" ||
            type === "run_completed" ||
            type === "run_extinct",
          );
          if (important.length) setLastEvents(important.slice(-2).map(({ summary, outcome }) => `${summary} ${outcome}`));
        }
        accumulatedMillisecondsRef.current = 0;
        setStorageStatus("saved-on-device");
        publish(next);
      } catch {
        // Ignore an invalid cross-tab write; the valid last-known checkpoint remains visible.
      }
    };
    window.addEventListener("storage", receiveSharedCheckpoint);
    return () => window.removeEventListener("storage", receiveSharedCheckpoint);
  }, [markLeadership, ownerId, publish, ready]);

  useEffect(() => {
    if (!ready) return;
    const release = () => {
      if (!storageAvailableRef.current || !isLeaderRef.current) return;
      const current = worldRef.current;
      if (current) persistOwnedWorld(current);
      try {
        releaseSurvivalRuntimeLease(window.localStorage, ownerId);
      } catch {
        // The lease will expire if storage becomes unavailable during unload.
      }
      isLeaderRef.current = false;
    };
    window.addEventListener("pagehide", release);
    window.addEventListener("beforeunload", release);
    return () => {
      window.removeEventListener("pagehide", release);
      window.removeEventListener("beforeunload", release);
      release();
    };
  }, [ownerId, persistOwnedWorld, ready]);

  useEffect(() => {
    if (!ready) return;
    lastIntervalAtRef.current = performance.now();
    const interval = window.setInterval(() => {
      const now = performance.now();
      const elapsed = Math.min(2_000, Math.max(0, now - lastIntervalAtRef.current));
      lastIntervalAtRef.current = now;
      if (!claimLeadership(false)) return;
      const current = worldRef.current;
      if (!current || current.status !== "running") return;
      accumulatedMillisecondsRef.current += elapsed * speedRef.current;
      const requestedSteps = Math.min(
        MAX_STEPS_PER_INTERVAL,
        Math.floor(accumulatedMillisecondsRef.current / REAL_MILLISECONDS_PER_STEP_AT_1X),
      );
      if (requestedSteps < 1) return;
      accumulatedMillisecondsRef.current -= requestedSteps * REAL_MILLISECONDS_PER_STEP_AT_1X;
      const result = advanceSurvivalRun(current, requestedSteps);
      const importantEvents = result.events.filter(({ type }) =>
        type === "agent_added" ||
        type === "agent_died" ||
        type === "discovery" ||
        type === "sole_survivor_decision" ||
        type === "run_completed" ||
        type === "run_extinct",
      );
      if (importantEvents.length) {
        setLastEvents(importantEvents.slice(-2).map(({ summary, outcome }) => `${summary} ${outcome}`));
      }
      publish(result.state);
    }, 200);
    return () => window.clearInterval(interval);
  }, [claimLeadership, publish, ready]);

  const setPaused = useCallback((paused: boolean) => {
    if (!claimLeadership(true)) return;
    const current = worldRef.current;
    if (!current || current.status === "completed" || current.status === "extinct") return;
    const next = setSurvivalRunPaused(current, paused);
    publish(next);
    persistOwnedWorld(next);
  }, [claimLeadership, persistOwnedWorld, publish]);

  const start = useCallback((options: SurvivalRunOptions, seed?: string | number) => {
    if (!claimLeadership(true)) return;
    accumulatedMillisecondsRef.current = 0;
    setLastEvents([]);
    setRecoveryNotice(null);
    const next = createSurvivalRun(seed ?? `survival-${Date.now()}`, options);
    publish(next);
    persistOwnedWorld(next);
  }, [claimLeadership, persistOwnedWorld, publish]);

  const addAgent = useCallback(() => {
    if (!claimLeadership(true)) return null;
    const current = worldRef.current;
    if (!current) return null;
    const result = addObserverAgent(current);
    if (result.ok) {
      publish(result.state);
      persistOwnedWorld(result.state);
    }
    return result;
  }, [claimLeadership, persistOwnedWorld, publish]);

  const setPlaybackSpeed = useCallback((next: PlaybackSpeed) => {
    claimLeadership(true);
    speedRef.current = next;
    setSpeedState(next);
  }, [claimLeadership]);

  return {
    world,
    ready,
    speed,
    storageStatus,
    recoveryNotice,
    lastEvents,
    setSpeed: setPlaybackSpeed,
    setPaused,
    start,
    addAgent,
    dismissRecoveryNotice: () => setRecoveryNotice(null),
  };
}
