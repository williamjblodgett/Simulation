import type { FeedstockMass } from "./geology";
import type { SurvivalInventory, SurvivalPosition } from "./types";

export type ComponentForm = "vessel" | "panel" | "rack" | "bed" | "rotor" | "shaft" | "gear" | "coil" | "cell" | "piston" | "chamber" | "filament" | "contact" | "record";
export type ComponentMaterial = "wood" | "stone" | "fiber" | "clay" | "metal" | "ceramic";
export type ConnectionPort = "mechanical" | "electric" | "water" | "control";
export type Capability = "water_access" | "food_reliability" | "protection" | "work_effort" | "mechanical" | "electric" | "energy_storage" | "regulation" | "knowledge";
export interface DevelopmentComponent {
  id: string; makerId: string; createdAt: number; revision: number;
  form: ComponentForm; material: ComponentMaterial; position: SurvivalPosition;
  /** Size is modeled metres; thickness is a normalized section fraction.
   * Orientation is radians; bulk mass is normalized stock, not kilograms. */
  size: number; thickness: number; orientation: number;
  condition: number; treatment: "raw" | "fired" | "glassy" | "alloyed";
  /** Authoritative properties. Policy sees only coarse geometry and measurements. */
  efficiency: number; leakage: number; insulation: number; precision: number;
  stock: Partial<SurvivalInventory>; feedstocks: FeedstockMass;
  batchIds: string[]; water: number; food: number; charge: number; fuel: number;
  seedMass: number; growth: number; power: number; output: number;
  setting: number; enabled: boolean; damage: string | null;
  document: DevelopmentProcedure | null;
}
export interface DevelopmentLink {
  id: string; from: string; to: string; port: ConnectionPort; condition: number;
  fiber: number; metalBatchId: string | null;
}
export type DevelopmentOperation =
  | { kind: "form"; form: ComponentForm; material: ComponentMaterial; size: number; thickness: number; orientation: number; position: SurvivalPosition; batchIds: string[] }
  | { kind: "connect"; from: string; to: string; port: ConnectionPort; metalBatchId?: string }
  | { kind: "transfer"; componentId: string; resource: "freshwater" | "food" | "wood"; amount: number; direction: "deposit" | "withdraw" }
  | { kind: "treat"; componentId: string; fuel: number; temperature: number }
  | { kind: "test"; componentId: string; dose: number }
  | { kind: "tune"; componentId: string; setting: number }
  | { kind: "plant"; componentId: string; seeds: number }
  | { kind: "repair" | "reclaim" | "read"; componentId: string }
  | { kind: "document"; componentId: string; procedureId: string };
export interface DevelopmentGoal {
  id: string; parentId: string | null; metric: Capability; origin: string;
  evidenceIds: string[]; createdAt: number; updatedAt: number;
  status: "active" | "deferred" | "satisfied" | "abandoned";
  target: number; benefit: number; urgency: number; spent: number; budget: number;
  retryAt: number; failures: number; lastEvidence: string;
}
export interface DevelopmentEvidence {
  id: string; originalId: string; observerId: string; receivedAt: number; tick: number;
  source: "personal" | "testimony" | "document";
  form: ComponentForm; material: ComponentMaterial; size: number; thickness: number;
  treatment: DevelopmentComponent["treatment"]; metric: Capability;
  value: number; predicted: number; uncertainty: number; componentId: string;
  conditions: string; summary: string;
}
export interface DevelopmentModel {
  key: string; mean: number; m2: number; samples: number; evidenceIds: string[];
}
export interface DevelopmentPrimitive {
  form: ComponentForm; material: ComponentMaterial; size: number; thickness: number;
  orientation: number;
}
export interface DevelopmentProcedure {
  id: string; authorId: string; learnedAt: number; metric: Capability;
  /** Relative, role-bound components; never old world IDs. */
  parts: DevelopmentPrimitive[];
  links: Array<{ from: number; to: number; port: ConnectionPort }>;
  finishing: DevelopmentOperation[];
  evidenceIds: string[]; successes: number; failures: number; expected: number;
  uncertainty: number; duration: number; conditions: string;
}
export interface DevelopmentCandidate {
  id: string; goalId: string; label: string; score: number; prediction: number;
  uncertainty: number; informationValue: number; ticks: number; materialCost: number;
  rejection: string | null; operations: DevelopmentOperation[];
  parts: DevelopmentPrimitive[]; links: DevelopmentProcedure["links"];
}
export interface DevelopmentMind {
  version: 1; nextId: number; goals: DevelopmentGoal[]; evidence: DevelopmentEvidence[];
  models: DevelopmentModel[]; procedures: DevelopmentProcedure[];
  active: { goalId: string; candidate: DevelopmentCandidate; cursor: number; bindings: string[]; startedAt: number; additionalMotivation: boolean } | null;
  decision: { tick: number; selectedId: string | null; candidates: DevelopmentCandidate[]; omitted: number; reason: string } | null;
  lastReviewAt: number; seenEvidence: string[]; prunedEvidence: number;
  experimentWindow: number; experimentalEffort: number; expansions: number;
  materialGoalHistory: Array<{ id: string; status: string; endedAt: number; reason: string }>;
}
export interface DevelopmentWorld {
  version: 1; nextId: number; components: DevelopmentComponent[]; links: DevelopmentLink[];
  /** Raw inputs remain here (including waste). Installed processed batches stay in materials. */
  debited: Partial<SurvivalInventory>; waste: Partial<SurvivalInventory>; wasteFeedstocks: FeedstockMass;
  water: { deposited: number; withdrawn: number; extracted: number; leaked: number; irrigated: number };
  food: { deposited: number; withdrawn: number; grown: number; spoiled: number; seeds: number };
  energy: { wind: number; heat: number; delivered: number; lost: number; fuelConsumed: number };
  metrics: { operations: number; rejected: number; tests: number; transfers: number; repairs: number; runningTicks: number };
}
export interface DevelopmentReading {
  accepted: boolean; success: boolean; summary: string; componentId: string | null;
  value: number; metric: Capability; effort: number; evidence: DevelopmentEvidence | null;
}
export interface ObservedComponent {
  id: string; form: ComponentForm; material: ComponentMaterial; position: SurvivalPosition;
  size: number; thickness: number; orientation: number; condition: number;
  treatment: DevelopmentComponent["treatment"]; water: number; food: number; charge: number;
  observedAt: number; evidenceId: string; output: number;
  documentId: string | null;
}
export const DEVELOPMENT_LIMITS = { components: 320, links: 640, goals: 12, models: 64, evidence: 96, procedures: 20, candidates: 12, depth: 4, expansions: 96, operations: 24, dailyExperimentEffort: 8 } as const;
