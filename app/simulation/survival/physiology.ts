import type { SurvivalNeeds } from "./types";

export interface NeedConditions { temperatureC: number; weather: string; daylight: number; sheltered: boolean; byFire: boolean }
const clamp = (value: number) => Math.max(0, Math.min(100, value));
const rounded = (value: number) => Math.round(value * 1000) / 1000;

/** Shared initial physiological law. Prediction receives remembered conditions; execution receives world truth. */
export function driftNeeds(needs: SurvivalNeeds, conditions: NeedConditions): void {
  const heatHydrationCost = conditions.temperatureC >= 31 ? 0.42 : 0;
  needs.hydration = rounded(clamp(needs.hydration - 0.82 - heatHydrationCost));
  needs.nutrition = rounded(clamp(needs.nutrition - 0.25));
  needs.energy = rounded(clamp(needs.energy - 0.31));

  let warmthDelta = 0.1;
  if (conditions.temperatureC < 4) warmthDelta = -1.3;
  else if (conditions.temperatureC < 11) warmthDelta = -0.62;
  else if (conditions.temperatureC < 16) warmthDelta = -0.24;
  else warmthDelta = 0.18;
  if (conditions.weather === "rain") warmthDelta -= 0.18;
  if (conditions.weather === "storm") warmthDelta -= 0.45;
  if (conditions.sheltered) warmthDelta += 0.46;
  if (conditions.byFire) warmthDelta += 0.8;
  needs.warmth = rounded(clamp(needs.warmth + warmthDelta));

  let safetyDelta = conditions.daylight < 0.08 ? -0.14 : 0.1;
  if (conditions.weather === "storm") safetyDelta -= 0.72;
  if (conditions.weather === "cold_snap" || conditions.weather === "heat_wave") safetyDelta -= 0.17;
  if (conditions.sheltered) safetyDelta += 0.5;
  needs.safety = rounded(clamp(needs.safety + safetyDelta));

  let healthDelta = 0;
  if (needs.hydration <= 0) healthDelta -= 6;
  else if (needs.hydration < 14) healthDelta -= 2.2;
  if (needs.nutrition <= 0) healthDelta -= 2.8;
  else if (needs.nutrition < 12) healthDelta -= 0.8;
  if (needs.warmth < 8) healthDelta -= 1.2;
  if (needs.safety < 5) healthDelta -= 0.45;
  if (Math.min(needs.hydration, needs.nutrition, needs.warmth, needs.safety) > 58) {
    healthDelta += 0.08;
  }
  needs.health = rounded(clamp(needs.health + healthDelta));
}
