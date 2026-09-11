import type { DiscoveryEvidence, DiscoveryFeatures, DiscoveryMetric, DiscoveryMind, DiscoveryPrediction } from "./discovery-types";
import { DISCOVERY_LIMITS } from "./discovery-types";

const clip = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
/** Authored, fallible geometry/material priors. No import of the world's material solver. */
export function discoveryPrior(metric: DiscoveryMetric, f: DiscoveryFeatures): number {
  if (!f.supported || f.condition <= .05) return 0;
  if (metric === "support") {
    const resistance = ({ wood: 9, stone: 24, fiber: 3, clay: 7 }[f.material]) * Math.min(f.width, f.depth) ** 2 / Math.max(.2, f.height) * f.condition;
    return clip(.5 + (resistance - f.dose) / Math.max(2, resistance + f.dose), .05, .95);
  }
  const overhead = f.elevation - f.height / 2 > 1.2 && Math.abs(f.lateral) < f.width / 2 + .3 && Math.abs(f.longitudinal) < f.depth / 2 + .3;
  const wall = f.height > .6 && Math.abs(f.lateral) < f.width / 2 + .6 && Math.abs(f.longitudinal) < 2.2;
  // This rough prior is deliberately less informed than authoritative protection.
  const wind = f.weather === "storm" ? Math.PI / 3 : f.weather === "rain" ? Math.PI / 5 : 0;
  const area = overhead ? f.width * f.depth : wall ? f.width * f.height * Math.abs(Math.cos(f.rotation - wind)) : 0;
  return clip(area / 5) * (overhead ? 1.25 : 1) * ({ wood: .38, stone: .28, fiber: .3, clay: .32 }[f.material]) * f.condition * clip(1 - f.distance / 6);
}
function vector(f: DiscoveryFeatures) {
  return [f.width / 4, f.height / 4, f.depth / 4, f.mass / 8, f.condition,
    Number(f.supported), Math.cos(f.rotation), Math.sin(f.rotation), f.elevation / 5,
    f.distance / 5, f.lateral / 5, f.longitudinal / 5, f.temperature / 30, f.treatment, f.dose / 5];
}
export function contextDistance(a: DiscoveryFeatures, b: DiscoveryFeatures): number {
  if (a.material !== b.material) return Infinity;
  const av = vector(a), bv = vector(b);
  return av.reduce((sum, v, i) => sum + (v - bv[i]) ** 2, 0) + (a.weather === b.weather ? 0 : .65);
}
/** Local residual table: similar observed contexts inform predictions; unrelated contexts revert to priors. */
export function predictDiscovery(mind: DiscoveryMind, metric: DiscoveryMetric, features: DiscoveryFeatures): DiscoveryPrediction {
  const prior = discoveryPrior(metric, features);
  const neighbours = mind.mode === "frozen" || mind.mode === "fixed" ? [] : mind.models.filter(c => c.metric === metric)
    .map(c => ({ c, distance: contextDistance(features, c.features) })).filter(n => n.distance < 1.6)
    .sort((a, b) => a.distance - b.distance).slice(0, 4);
  let weight = 1, residual = 0, error = 0, samples = 0;
  for (const { c, distance } of neighbours) {
    const w = Math.min(6, c.samples) * Math.exp(-distance * 3);
    residual += w * (c.mean - discoveryPrior(metric, c.features)); weight += w;
    error += w * c.m2 / Math.max(1, c.samples); samples += c.samples;
  }
  const mean = clip(prior + residual / weight), residualError = Math.sqrt(error / weight);
  const measurementLimit = metric === "protection" ? .02 : .08;
  const uncertainty = clip(measurementLimit + .38 / Math.sqrt(weight) + residualError + (neighbours[0]?.distance ?? .15) * .1, measurementLimit, .65);
  return { metric, features: structuredClone(features), mean, low: clip(mean - uncertainty), high: clip(mean + uncertainty), uncertainty,
    samples, evidenceIds: [...new Set(neighbours.flatMap(n => n.c.evidenceIds))].slice(-12), measurementLimit, residualError };
}

/** One experiment remains one piece of evidence even after multiple reports. */
export function acceptDiscoveryEvidence(mind: DiscoveryMind, evidence: DiscoveryEvidence): boolean {
  if (evidence.tick < mind.evidenceFloor || mind.evidence.some(e => e.originalId === evidence.originalId)
      || mind.models.some(c => c.evidenceIds.includes(evidence.originalId))) { mind.metrics.duplicateReports++; return false; }
  mind.evidence.push(structuredClone(evidence));
  if (mind.evidence.length > DISCOVERY_LIMITS.evidence) {
    const dropped = mind.evidence.shift()!; mind.evidenceFloor = Math.max(mind.evidenceFloor, dropped.tick + 1);
  }
  // Frozen ablation retains all outcomes and costs; only parameter updates are frozen.
  if (mind.mode === "frozen" || mind.mode === "fixed") return true;
  let cell = mind.models.find(c => c.metric === evidence.metric && contextDistance(c.features, evidence.features) < .018);
  if (!cell) {
    cell = { metric: evidence.metric, features: structuredClone(evidence.features), mean: 0, m2: 0, samples: 0, evidenceIds: [], lastTick: evidence.receivedAt };
    mind.models.push(cell);
    if (mind.models.length > DISCOVERY_LIMITS.models) mind.models.splice(mind.models.reduce((best, c, i, all) => c.lastTick < all[best].lastTick ? i : best, 0), 1);
  }
  const delta = evidence.value - cell.mean;
  cell.samples++; cell.mean += delta / cell.samples; cell.m2 += delta * (evidence.value - cell.mean);
  cell.evidenceIds = [...cell.evidenceIds, evidence.originalId].slice(-12); cell.lastTick = evidence.receivedAt;
  return true;
}

/** Three-point value-of-information approximation; not a curiosity or novelty bonus.
 * Even a below-baseline mean can justify a cheap test if its plausible high result
 * would change which survival plan is preferred. */
export function decisionInformationValue(prediction: DiscoveryPrediction, valueAt: (value: number) => number, alternativeValue: number, cost: number) {
  const current = Math.max(alternativeValue, valueAt(prediction.mean));
  const informed = (Math.max(alternativeValue, valueAt(prediction.low)) + 2 * Math.max(alternativeValue, valueAt(prediction.mean)) + Math.max(alternativeValue, valueAt(prediction.high))) / 4;
  const switches = valueAt(prediction.low) < alternativeValue && valueAt(prediction.high) > alternativeValue;
  return switches ? Math.max(0, informed - current - cost) : 0;
}
