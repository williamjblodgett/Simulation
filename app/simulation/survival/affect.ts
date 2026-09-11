import type { AgentGoalKind, SurvivalActionOutcome, SurvivalAgent, WeatherKind } from "./types";

export type AffectSignal = "fear" | "frustration" | "confidence" | "curiosity" | "socialNeed";

export interface AffectDriver {
  tick: number;
  signal: AffectSignal;
  direction: "raised" | "lowered";
  strength: number;
  /** Factual cause recorded by the engine; never generated inner speech. */
  summary: string;
  evidenceId: string | null;
}

/**
 * Normalized adaptive control signals. They influence bounded policy weights,
 * but are not a claim of feelings, sentience, personality, or hidden prose.
 */
export interface AgentAffect {
  version: 1;
  fear: number;
  frustration: number;
  confidence: number;
  curiosity: number;
  socialNeed: number;
  valence: number;
  arousal: number;
  updatedAt: number;
  drivers: AffectDriver[];
}

const clip = (value: number, minimum = 0, maximum = 1) => Math.max(minimum, Math.min(maximum, value));
const round = (value: number) => Math.round(value * 1_000) / 1_000;
const blend = (current: number, target: number, rate: number) => round(clip(current * (1 - rate) + target * rate));

export function freshAgentAffect(tick = 0): AgentAffect {
  return {
    version: 1,
    fear: 0.12,
    frustration: 0.05,
    confidence: 0.42,
    curiosity: 0.34,
    socialNeed: 0.18,
    valence: 0.55,
    arousal: 0.25,
    updatedAt: tick,
    drivers: [],
  };
}

function pushDriver(affect: AgentAffect, driver: AffectDriver): void {
  const previous = [...affect.drivers].reverse().find((entry) => entry.signal === driver.signal && entry.summary === driver.summary);
  if (previous && driver.tick - previous.tick < 6) return;
  affect.drivers = [...affect.drivers, { ...driver, strength: round(clip(driver.strength)) }].slice(-12);
}

/** Update from the conditions this life actually experiences. */
export function updateAgentAffect(
  agent: SurvivalAgent,
  tick: number,
  weather: WeatherKind,
  observedLivingCompanions: number,
): void {
  const affect = agent.affect;
  if (!affect) return;
  const critical = Math.min(agent.needs.health, agent.needs.hydration, agent.needs.nutrition, agent.needs.energy, agent.needs.warmth, agent.needs.safety);
  const danger = clip((62 - critical) / 52);
  const weatherStress = weather === "storm" || weather === "cold_snap" || weather === "heat_wave" ? 0.18 : weather === "rain" ? 0.07 : 0;
  const uncertainty = agent.currentDeliberation?.uncertainty ?? 0.35;
  const stable = clip((critical - 48) / 42);
  const lastSocial = Math.max(agent.spawnedAt, ...agent.relationships.map((relationship) => relationship.lastInteractionAt));
  const isolation = observedLivingCompanions <= 0 ? 0.42 : clip((tick - lastSocial - 18) / 126);

  affect.fear = blend(affect.fear, clip(danger + weatherStress), danger > affect.fear ? 0.34 : 0.12);
  affect.frustration = blend(affect.frustration, 0.06 + danger * 0.16, 0.08);
  affect.confidence = blend(affect.confidence, clip(0.28 + stable * 0.44 - danger * 0.25), 0.08);
  // Curiosity only weights decision-relevant information while conditions are
  // stable. It never rewards raw novelty, experiment count, or construction.
  affect.curiosity = blend(affect.curiosity, clip(0.12 + stable * uncertainty * 0.72), 0.1);
  affect.socialNeed = blend(affect.socialNeed, isolation, 0.08);
  affect.arousal = round(clip(affect.fear * 0.62 + affect.frustration * 0.28 + stable * affect.curiosity * 0.1));
  affect.valence = round(clip(0.48 + affect.confidence * 0.42 - affect.fear * 0.36 - affect.frustration * 0.24));
  affect.updatedAt = tick;

  if (danger > 0.35) pushDriver(affect, { tick, signal: "fear", direction: "raised", strength: danger, summary: `A vital condition fell to ${Math.round(critical)} of 100.`, evidenceId: null });
  else if (stable > 0.65 && affect.fear < 0.25) pushDriver(affect, { tick, signal: "fear", direction: "lowered", strength: stable, summary: "Immediate vital conditions remained stable.", evidenceId: null });
  if (isolation > 0.5) pushDriver(affect, { tick, signal: "socialNeed", direction: "raised", strength: isolation, summary: "No recent social interaction was recorded.", evidenceId: null });
}

/** Apply a confirmed action result to future affective weighting. */
export function noteAffectOutcome(agent: SurvivalAgent, outcome: SurvivalActionOutcome): void {
  const affect = agent.affect;
  if (!affect) return;
  const magnitude = clip(Math.abs(outcome.utility) / 16, 0.08, 0.7);
  if (outcome.success) {
    affect.confidence = round(clip(affect.confidence + magnitude * 0.16));
    affect.frustration = round(clip(affect.frustration - magnitude * 0.12));
    pushDriver(affect, { tick: outcome.tick, signal: "confidence", direction: "raised", strength: magnitude, summary: `A confirmed ${outcome.action.replaceAll("_", " ")} outcome succeeded.`, evidenceId: outcome.decisionId ?? null });
  } else {
    affect.confidence = round(clip(affect.confidence - magnitude * 0.1));
    affect.frustration = round(clip(affect.frustration + magnitude * 0.2));
    pushDriver(affect, { tick: outcome.tick, signal: "frustration", direction: "raised", strength: magnitude, summary: `A confirmed ${outcome.action.replaceAll("_", " ")} attempt failed.`, evidenceId: outcome.decisionId ?? null });
  }
  affect.arousal = round(clip(affect.fear * 0.62 + affect.frustration * 0.28 + affect.curiosity * 0.1));
  affect.valence = round(clip(0.48 + affect.confidence * 0.42 - affect.fear * 0.36 - affect.frustration * 0.24));
  affect.updatedAt = outcome.tick;
}

/**
 * A disclosed, bounded policy adjustment. Survival potential remains dominant;
 * emergency actions receive support while optional inquiry is suppressed.
 */
export function affectDecisionAdjustment(
  affect: AgentAffect | undefined,
  goal: AgentGoalKind,
  risk: number,
  informationValue: number,
  lowestNeed: number,
): number {
  if (!affect) return 0;
  const urgent = lowestNeed < 45;
  let value = 0;
  if (["secure_water", "secure_food", "recover", "stay_warm", "seek_safety"].includes(goal)) value += affect.fear * 3.2;
  if (["explore", "research", "develop_capability"].includes(goal)) {
    value += urgent ? -affect.fear * 5 : affect.curiosity * Math.min(3, informationValue * 0.16);
    value -= affect.frustration * Math.min(2.5, risk * 0.12);
  }
  if (["share", "request_help", "cooperate"].includes(goal)) value += affect.socialNeed * 2.2;
  if (goal === "wait") value -= affect.confidence * 0.45;
  return round(Math.max(-5, Math.min(5, value)));
}

export function affectLabel(affect: AgentAffect): string {
  const signals: Array<[number, string]> = [
    [affect.fear, affect.fear > 0.62 ? "alarmed" : "vigilant"],
    [affect.frustration, "frustrated"],
    [affect.curiosity, "engaged"],
    [affect.socialNeed, "socially deprived"],
    [affect.confidence, "confident"],
  ];
  signals.sort((left, right) => right[0] - left[0] || left[1].localeCompare(right[1]));
  return signals[0][0] < 0.36 ? "settled" : signals[0][1];
}

export function validateAgentAffect(value: unknown, tick: number, spawnedAt: number): value is AgentAffect {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const affect = value as Record<string, unknown>;
  const finite = (entry: unknown, low = 0, high = 1) => typeof entry === "number" && Number.isFinite(entry) && entry >= low && entry <= high;
  if (affect.version !== 1 || !["fear", "frustration", "confidence", "curiosity", "socialNeed", "valence", "arousal"].every((key) => finite(affect[key]))) return false;
  if (!Number.isInteger(affect.updatedAt) || Number(affect.updatedAt) < spawnedAt || Number(affect.updatedAt) > tick || !Array.isArray(affect.drivers) || affect.drivers.length > 12) return false;
  return affect.drivers.every((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
    const driver = entry as Record<string, unknown>;
    return Number.isInteger(driver.tick) && Number(driver.tick) >= spawnedAt && Number(driver.tick) <= tick
      && ["fear", "frustration", "confidence", "curiosity", "socialNeed"].includes(String(driver.signal))
      && (driver.direction === "raised" || driver.direction === "lowered") && finite(driver.strength)
      && typeof driver.summary === "string" && driver.summary.length <= 240
      && (driver.evidenceId === null || typeof driver.evidenceId === "string");
  });
}
