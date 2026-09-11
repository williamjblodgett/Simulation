import type { FeedstockMass, GeologicalFeedstock } from "./geology";
import type { SurvivalPosition } from "./types";

export type MaterialBatchKind =
  | "charcoal"
  | "exhaust"
  | "concentrate"
  | "roasted_ore"
  | "gangue"
  | "hearth"
  | "bloom"
  | "slag"
  | "tool"
  | "ceramic"
  | "scale"
  | "scrap";

export type MaterialFamily = "carbon" | "iron" | "copper" | "mineral" | "ceramic" | "mixed";
export type ToolForm = "cutting_edge" | "hammer_head";

/** Base-resource origin. Feedstocks are a subset of stone, never extra mass. */
export interface MaterialProvenance {
  wood?: number;
  stone?: number;
  clay?: number;
  feedstocks?: FeedstockMass;
}

/** Authoritative batch. Exact composition is deliberately excluded from policy views. */
export interface MaterialBatch {
  id: string;
  ownerId: string | null;
  createdAt: number;
  position: SurvivalPosition;
  portable: boolean;
  kind: MaterialBatchKind;
  family: MaterialFamily;
  mass: number;
  temperatureC: number;
  condition: number;
  quality: number;
  durability: number | null;
  uses: number;
  provenance: MaterialProvenance;
  /** Hidden authoritative quantities; agents must infer performance by testing. */
  chemistry: { carbon: number; metal: number; gangue: number };
  feedstock: GeologicalFeedstock | null;
  form: ToolForm | null;
}

export type MaterialOperation =
  | { kind: "prepare_charcoal"; wood: number; cover: number; duration: number }
  | { kind: "concentrate_ore"; sourceId: string; mass: number; separation: number; duration: number }
  | { kind: "form_hearth"; clay: number; charcoalId: string; wallThickness: number; duration: number }
  | { kind: "fire_clay"; clay: number; charcoalId: string; hearthId: string; duration: number }
  | { kind: "reduce_ore"; concentrateId: string; charcoalId: string; hearthId: string; airflow: number; duration: number }
  | { kind: "work_metal"; bloomId: string; charcoalId: string; hearthId: string; form: ToolForm; work: number; duration: number }
  | { kind: "test_tool"; toolId: string; medium: "wood" | "stone"; force: number; duration: number };

export interface MaterialReading {
  id: string;
  tick: number;
  agentId: string;
  operation: MaterialOperation["kind"];
  metric: "solid_yield" | "temperature" | "metal_response" | "tool_efficiency" | "durability";
  value: number;
  unit: "fraction" | "celsius" | "multiplier" | "durability_points";
  uncertainty: number;
  inputIds: string[];
  outputIds: string[];
  summary: string;
}

export interface MaterialProcessResult {
  /** False means validation rejected the request and nothing was mutated. */
  accepted: boolean;
  /** Whether the physically executed intervention supported its useful claim. */
  supported: boolean;
  summary: string;
  duration: number;
  effort: number;
  temperatureC: number | null;
  solidYield: number;
  wasteMass: number;
  inputIds: string[];
  outputIds: string[];
  reading: MaterialReading | null;
}

export interface MaterialProcessRecord extends MaterialProcessResult {
  id: string;
  tick: number;
  agentId: string;
  operation: MaterialOperation;
}

export interface MaterialWorld {
  version: 1;
  nextId: number;
  batches: MaterialBatch[];
  records: MaterialProcessRecord[];
  operations: number;
  failedOperations: number;
  tests: number;
  /** Direct debits from ordinary inventory; transformed batches retain provenance. */
  consumed: { wood: number; stone: number; clay: number };
  consumedFeedstocks: FeedstockMass;
}

export interface MaterialBelief {
  key: string;
  mean: number;
  m2: number;
  samples: number;
  uncertainty: number;
  evidenceIds: string[];
  updatedAt: number;
}

export interface MaterialEvidence {
  id: string;
  tick: number;
  operation: MaterialOperation["kind"];
  predictionId: string | null;
  reading: MaterialReading;
  interpretation: string;
  confounds: string[];
}

export interface MaterialExperiment {
  id: string;
  goalId: string;
  createdAt: number;
  operation: MaterialOperation;
  claim: string;
  prediction: {
    temperatureLow: number | null;
    temperatureHigh: number | null;
    yieldLow: number;
    yieldHigh: number;
    usefulEffect: number;
    uncertainty: number;
    evidenceIds: string[];
  };
  decisionAffected: string;
  status: "planned" | "performed" | "failed" | "inconclusive";
  result: string | null;
  readingId: string | null;
  endedAt: number | null;
}

export interface MaterialProcedure {
  id: string;
  operation: MaterialOperation["kind"];
  learnedAt: number;
  parameters: Record<string, number | string>;
  successes: number;
  failures: number;
  expectedEffect: number;
  uncertainty: number;
  evidenceIds: string[];
}

export interface MaterialGoal {
  id: string;
  createdAt: number;
  updatedAt: number;
  objective: "survive";
  condition: "reduce_recurring_work_cost";
  reason: string;
  evidenceIds: string[];
  predictedBenefit: number;
  urgency: number;
  budget: { ticks: number; effort: number; material: number };
  status: "active" | "deferred" | "satisfied" | "abandoned";
  criterion: string;
  abandonWhen: string;
}

export interface MaterialMind {
  version: 1;
  /** IDs of disclosed authored priors, not hidden coefficients or recipes. */
  priorIds: string[];
  beliefs: MaterialBelief[];
  evidence: MaterialEvidence[];
  experiments: MaterialExperiment[];
  procedures: MaterialProcedure[];
  goal: MaterialGoal | null;
  lastReviewAt: number;
  nextId: number;
}

/** Runtime-filtered material observation supplied to one policy. */
export interface PrivateMaterialBatch {
  id: string;
  kind: MaterialBatchKind;
  family: MaterialFamily;
  massEstimate: number;
  temperatureBand: "ambient" | "warm" | "hot" | "white_hot";
  conditionEstimate: number;
  durabilityEstimate: number | null;
  portable: boolean;
  position: SurvivalPosition;
  form: ToolForm | null;
}
