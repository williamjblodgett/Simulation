import type { SurvivalPosition, SurvivalResourceKind } from "./types";

export type MaterialKind = "wood" | "stone" | "fiber" | "clay";
export type Vec3 = { x: number; y: number; z: number };
export interface MaterialProperties {
  density: number; strength: number; insulation: number; permeability: number;
  flammability: number; hardness: number; heatCapacity: number;
}
export interface PhysicalPart {
  sources?: string[];
  peakTemperature?: number;
  id: string; makerId: string; createdAt: number;
  composition: Partial<Record<MaterialKind, number>>;
  size: Vec3; position: Vec3; rotation: number;
  condition: number; temperature: number; hollow: number; water: number;
  supported: boolean; revision: number;
}
export interface PhysicalJoint { id: string; a: string; b: string; fiber: number; condition: number }
export interface PhysicalWorld {
  version: 1; nextId: number; parts: PhysicalPart[]; joints: PhysicalJoint[];
  /** Matter removed from the inventory remains accounted for after combustion/abrasion. */
  spent: Partial<Record<SurvivalResourceKind, number>>;
  workEnergy: number;
  tests: number;
}
export type Manipulation =
  | { kind: "shape"; material: MaterialKind; mass: number; size: Vec3; hollow?: number }
  | { kind: "place"; partId: string; position: Vec3; rotation: number }
  | { kind: "split"; partId: string; fraction: number }
  | { kind: "join"; a: string; b: string; fiber: number }
  | { kind: "detach"; jointId: string }
  | { kind: "mix"; a: string; b: string }
  | { kind: "heat"; partId: string; fuel: number }
  | { kind: "test"; partId: string; measure: "load" | "retention" | "protection"; dose: number }
  | { kind: "reclaim"; partId: string };
export interface PhysicalReading {
  revision?: number;
  originalObserverId?: string;
  receivedAt?: number;
  id: string; tick: number; observerId: string; source: "test" | "observation" | "demonstration";
  partId: string; material: MaterialKind; position: SurvivalPosition;
  size: Vec3; rotation: number; mass: number; condition: number;
  metric: "protection" | "load" | "retention";
  before: number; after: number; dose: number; temperature: number; weather: string;
  confidence: number; summary: string;
}
export interface PropertyEstimate {
  material: MaterialKind; metric: PhysicalReading["metric"];
  mean: number; variance: number; samples: number; evidenceIds: string[];
}
export interface LearnedProcedure {
  program?: Manipulation[];
  origin?: SurvivalPosition;
  id: string; learnedAt: number; material: MaterialKind;
  /** Editable proportions and relative pose, not an unlock granting a bonus. */
  sizePerMass: Vec3; relativePosition: Vec3; rotation: number; mass: number;
  effect: number; uncertainty: number; successes: number; failures: number;
  evidenceIds: string[]; conditions: { minTemperature: number; maxTemperature: number; weather: string[] };
}
export interface PhysicalProject {
  id: string; createdAt: number; updatedAt: number;
  metric: "exposure"; target: number; baseline: number;
  status: "active" | "interrupted" | "satisfied" | "abandoned";
  reason: string; position: SurvivalPosition; reserved: Partial<Record<MaterialKind, number>>;
  operations: Manipulation[]; cursor: number; partIds: string[];
  predictedBenefit: number; spentEffort: number; revisions: number; lastReviewAt: number;
}
export interface PhysicalMind {
  version: 1; readings: PhysicalReading[]; estimates: PropertyEstimate[];
  procedures: LearnedProcedure[]; projects: PhysicalProject[];
  namedAt: number | null; nameEvidence: string[];
  /** Explicit ablation for reproducible scientific comparisons, not a UI strategy control. */
  learningEnabled: boolean;
}
