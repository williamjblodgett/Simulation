/// <reference lib="webworker" />

import {
  advancePlanet,
  normalizePlanetWorld,
  type AdvanceResult,
  type PlanetWorldState,
} from "../../app/simulation/planet";

type WorkerRequest =
  | { id: number; kind: "initialize"; world: PlanetWorldState }
  | { id: number; kind: "advance"; seconds: number; maxEvents: number }
  | { id: number; kind: "snapshot" };

type WorkerResponse =
  | { id: number; ok: true; world: PlanetWorldState; result?: AdvanceResult }
  | { id: number; ok: false; error: string };

let world: PlanetWorldState | null = null;

self.onmessage = (message: MessageEvent<WorkerRequest>) => {
  const request = message.data;
  try {
    if (request.kind === "initialize") {
      world = normalizePlanetWorld(request.world);
      self.postMessage({ id: request.id, ok: true, world } satisfies WorkerResponse);
      return;
    }
    if (!world) throw new Error("The simulation worker has not been initialized.");
    if (request.kind === "advance") {
      const result = advancePlanet(world, request.seconds, {
        maxEvents: Math.max(1, Math.min(20_000, Math.floor(request.maxEvents))),
      });
      self.postMessage({ id: request.id, ok: true, world, result } satisfies WorkerResponse);
      return;
    }
    self.postMessage({ id: request.id, ok: true, world } satisfies WorkerResponse);
  } catch (reason) {
    self.postMessage({
      id: request.id,
      ok: false,
      error: reason instanceof Error ? reason.message : "The simulation worker failed.",
    } satisfies WorkerResponse);
  }
};

export {};
