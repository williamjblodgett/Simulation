import type { Manipulation, MaterialKind } from "./physical-types";
import type { SurvivalPosition } from "./types";

/** All limits are deterministic; no wall-clock deadline influences a choice. */
export const DISCOVERY_LIMITS = Object.freeze({ goals: 8, depth: 3, candidates: 16, operations: 12,
  models: 32, evidence: 96, experiments: 24, procedures: 8, decisions: 16, horizon: 36, expansions: 64 });
export type DiscoveryMetric = "protection" | "support";
export type DiscoveryMode = "directed" | "frozen" | "random" | "none" | "fixed";
export interface DiscoveryFeatures {
  material: MaterialKind;
  /** Observable geometry in world length units, mass in material units. */
  width: number; height: number; depth: number; mass: number;
  condition: number; supported: boolean; rotation: number; elevation: number;
  distance: number; lateral: number; longitudinal: number;
  temperature: number; weather: string; treatment: number; dose: number;
}
export interface DiscoveryPrediction {
  metric: DiscoveryMetric; features: DiscoveryFeatures; mean: number; low: number; high: number;
  uncertainty: number; samples: number; evidenceIds: string[];
  /** A normalized uncertainty width, NOT a calibrated probability. */
  measurementLimit: number; residualError: number;
}
export interface DiscoveryModelCell {
  metric: DiscoveryMetric; features: DiscoveryFeatures; mean: number; m2: number;
  samples: number; evidenceIds: string[]; lastTick: number;
}
export interface DiscoveryEvidence {
  id: string; originalId: string; originalObserverId: string; tick: number; receivedAt: number;
  source: "personal" | "testimony"; metric: DiscoveryMetric; features: DiscoveryFeatures;
  value: number; before: number; dose: number; partId: string; experimentId: string | null;
  interpretation: string; confounds: string[];
}
export interface DiscoveryGoal {
  id: string; parentId: string | null; objective: "survive"; metric: DiscoveryMetric;
  evidenceIds: string[]; createdAt: number; updatedAt: number; target: number;
  /** Immutable originating readings; observation IDs may later be refreshed. */
  originatingConditions: { weather: string; temperatureC: number; daylight: number; warmth: number; safety: number; forecastWarmth: number; forecastSafety: number };
  predictedBenefit: number; urgency: number;
  budget: { ticks: number; effort: number; material: number };
  status: "active" | "deferred" | "satisfied" | "abandoned";
  criterion: string; abandonWhen: string; reason: string;
}
export interface DiscoveryAlternative {
  id: string; kind: "survival" | "stay" | "reuse" | "arrange" | "test" | "procedure";
  label: string; score: number; cost: number; ticks: number; informationValue: number;
  predictedProtection: number; uncertainty: number; evidenceIds: string[];
  rejection: string | null; operations: Manipulation[]; position: SurvivalPosition;
  prediction?: DiscoveryPrediction; supportPrediction?: DiscoveryPrediction;
  procedureId?: string;
}
export interface DiscoveryDecision {
  id: string; tick: number; goalId: string | null; selectedId: string;
  alternatives: DiscoveryAlternative[]; omitted: number; expansions: number; reason: string;
}
export interface DiscoveryExperiment {
  id: string; goalId: string; projectId: string; createdAt: number;
  metric: DiscoveryMetric; claim: string; prediction: DiscoveryPrediction;
  competingOutcomes: { low: string; high: string }; decisionAffected: string;
  intervention: string; stoppingRule: string; maxTicks: number; maxEffort: number;
  status: "planned" | "running" | "interrupted" | "measured" | "failed" | "inconclusive";
  evidenceId: string | null; result: string | null; spentEffort: number; endedAt: number | null;
}
export interface DiscoveryProcedure {
  id: string; createdAt: number; origin: SurvivalPosition;
  program: Manipulation[];
  /** Symbols bind by observable properties, never by the original world's object ID. */
  inputs: Array<{ symbol: string; material: MaterialKind; size: { x: number; y: number; z: number }; minimumCondition: number }>;
  resources: Partial<Record<MaterialKind, number>>; ticks: number; effort: number;
  effect: number; uncertainty: number; successes: number; failures: number;
  evidenceIds: string[]; weather: string[]; minTemperature: number; maxTemperature: number;
}
export interface DiscoveryMind {
  version: 1; mode: DiscoveryMode; goals: DiscoveryGoal[]; models: DiscoveryModelCell[];
  evidence: DiscoveryEvidence[]; experiments: DiscoveryExperiment[]; procedures: DiscoveryProcedure[];
  decisions: DiscoveryDecision[]; lastReviewAt: number; nextId: number;
  /** Reports older than this pruned horizon are ignored, not invented or recounted. */
  evidenceFloor: number;
  active: { projectId: string; goalId: string; alternative: DiscoveryAlternative; completed: Manipulation[];
    bindings: Record<string, string>; startedAt: number; spentEffort: number; spentTicks: number; sourceProcedureId?: string } | null;
  failures: Array<{ signature: string; tick: number; evidence: string }>;
  metrics: { expansions: number; predictions: number; squaredError: number; measurements: number;
    testEffort: number; adaptations: number; transfers: number; failedOperations: number; duplicateReports: number };
}
export const freshDiscoveryMind = (): DiscoveryMind => ({ version: 1, mode: "directed", goals: [], models: [],
  evidence: [], experiments: [], procedures: [], decisions: [], lastReviewAt: -12, nextId: 1, evidenceFloor: 0,
  active: null, failures: [], metrics: { expansions: 0, predictions: 0, squaredError: 0, measurements: 0,
    testEffort: 0, adaptations: 0, transfers: 0, failedOperations: 0, duplicateReports: 0 } });
