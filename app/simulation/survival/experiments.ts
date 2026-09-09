import type { SurvivalAgent, TechnologyId } from "./types";

export interface ExperimentContext {
  materialKey: string;
  dryness: number;
  materialIntegrity: number;
  contamination: number | null;
  herbalActivity: number | null;
}
export interface CausalExperimentEvidence {
  version: 1;
  technologyId: string;
  contextKey: string;
  context: ExperimentContext;
  dose: number;
  controlDose: 0;
  metric: string;
  unit: "normalized_simulation_proxy";
  direction: "higher_is_better" | "lower_is_better";
  control: number | null;
  treatment: number | null;
  improvement: number | null;
  verdict: "supported" | "not_supported" | "uninformative";
  explanation: string;
}
const clip = (n: number) => Math.max(0, Math.min(1, n));
const round = (n: number) => Math.round(n * 1e6) / 1e6;
const triangle = (n: number, optimum: number, width: number) => clip(1 - Math.abs(n - optimum) / width);
type Prior = { causal?: CausalExperimentEvidence };
export function experimentContextKey(c: ExperimentContext): string {
  return JSON.stringify([c.materialKey, c.dryness, c.materialIntegrity, c.contamination, c.herbalActivity]);
}
/** Policy-side parameter choice only reads personally recorded experiment results. */
export function chooseExperimentDose(id: TechnologyId, attempts: readonly Prior[], context: ExperimentContext): number | null {
  const key = experimentContextKey(context);
  const history = attempts.flatMap(a => a.causal?.technologyId === id && a.causal.contextKey === key ? [a.causal] : []);
  if (history.some(h => h.verdict === "uninformative")) return null;
  const positive = history.filter(h => h.verdict === "supported").sort((a, b) => (b.improvement ?? 0) - (a.improvement ?? 0) || a.dose - b.dose)[0];
  if (positive) return history.filter(h => h.dose === positive.dose && h.verdict === "supported").length >= 2 ? null : positive.dose;
  const untried = [0.25, 0.75, 0.5, 1].filter(dose => !history.some(h => h.dose === dose));
  const best = history.filter(h => h.improvement !== null).sort((a, b) => (b.improvement ?? 0) - (a.improvement ?? 0))[0];
  return (best ? untried.sort((a, b) => Math.abs(a - best.dose) - Math.abs(b - best.dose) || a - b) : untried)[0] ?? null;
}
export function hasReplicatedCausalEffect(attempts: readonly Prior[], required = 2): boolean {
  const counts = new Map<string, number>();
  for (const { causal: c } of attempts) {
    if (!c || c.verdict !== "supported") continue;
    const key = `${c.technologyId}:${c.contextKey}:${c.dose}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (counts.get(key)! >= required) return true;
  }
  return false;
}
/** World-side bounded material laws. No agent, seed, retry count or policy inputs. */
export function evaluateCausalExperiment(id: string, dose: number, context: ExperimentContext): CausalExperimentEvidence {
  const base = { version: 1 as const, technologyId: id, contextKey: experimentContextKey(context), context: { ...context }, dose, controlDose: 0 as const, unit: "normalized_simulation_proxy" as const };
  const unknown = (explanation: string): CausalExperimentEvidence => ({ ...base, metric: "unmeasured_effect", direction: "higher_is_better", control: null, treatment: null, improvement: null, verdict: "uninformative", explanation });
  if (![dose, context.dryness, context.materialIntegrity, context.contamination ?? 0, context.herbalActivity ?? 0].every(n => Number.isFinite(n) && n >= 0 && n <= 1)) return unknown("Invalid sample measurements.");
  let metric: string, treatment: number, control = 0;
  let direction: CausalExperimentEvidence["direction"] = "higher_is_better";
  switch (id) {
    case "controlled_fire": metric = "sustained_heat"; treatment = clip((dose - 0.4) * 2) * context.dryness * context.materialIntegrity; break;
    case "knapped_edge": metric = "cutting_performance"; treatment = triangle(dose, 0.65, 0.55) * context.materialIntegrity; break;
    case "twisted_cordage": metric = "binding_strength"; treatment = triangle(dose, 0.6, 0.6) * context.materialIntegrity; break;
    case "fired_vessel": metric = "container_integrity"; treatment = clip((dose - 0.35) / 0.4) * context.dryness * context.materialIntegrity * (dose > 0.9 ? 0.6 : 1); break;
    case "water_boiling":
      if (!context.contamination) return unknown("No measured contamination contrast in this sample; safer water cannot be established.");
      metric = "remaining_contamination"; direction = "lower_is_better"; control = context.contamination; treatment = control * (1 - dose); break;
    case "food_smoking": metric = "preservation_proxy"; treatment = triangle(dose, 0.5, 0.5) * context.dryness * context.materialIntegrity; break;
    case "herbal_poultice":
      if (context.herbalActivity === null) return unknown("This sample's recovery activity is unmeasured.");
      metric = "recovery_proxy"; treatment = context.herbalActivity * 4 * dose * (1 - dose) - Math.max(0, dose - 0.75) * 2; break;
    default: return unknown("The world has no mechanism for this hypothesis.");
  }
  if (dose === 0) treatment = control;
  control = round(control); treatment = round(treatment);
  const improvement = round(direction === "higher_is_better" ? treatment - control : control - treatment);
  return { ...base, metric, direction, control, treatment, improvement, verdict: improvement >= 0.2 ? "supported" : "not_supported", explanation: `${metric}: control ${control.toFixed(3)}, treatment ${treatment.toFixed(3)}; improvement ${improvement.toFixed(3)}. ${improvement >= 0.2 ? "A measurable modeled effect was observed." : "The predicted effect was not established."}` };
}

/** Samples are prepared by the executor, not inferred from a nearby resource site. */
export function preparedMaterialContext(technologyId: string, wet: boolean, samples?: SurvivalAgent["materialSamples"]): ExperimentContext {
  return { materialKey: `prepared-${technologyId}`, dryness: wet ? 0.35 : 0.9, materialIntegrity: 0.9, contamination: technologyId === "water_boiling" ? samples?.freshwater?.contamination ?? null : null, herbalActivity: technologyId === "herbal_poultice" ? samples?.herbs?.activity ?? null : null };
}
