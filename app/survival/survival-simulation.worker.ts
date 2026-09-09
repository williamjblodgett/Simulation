import { advanceSurvivalRun } from "../simulation/survival/engine";
import type { SurvivalRunState } from "../simulation/survival/types";

self.onmessage = (event: MessageEvent<{ id: number; world: SurvivalRunState; steps: number }>) => {
  try {
    self.postMessage({ id: event.data.id, ok: true, result: advanceSurvivalRun(event.data.world, event.data.steps) });
  } catch (error) {
    self.postMessage({ id: event.data.id, ok: false, error: error instanceof Error ? error.message : "The local planner failed." });
  }
};
