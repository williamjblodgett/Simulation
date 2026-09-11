import fs from "node:fs";
import { protectionPressure, transferPressure } from "./discovery-pressure-fixture.mjs";
import { advanceSurvivalRun, validateSurvivalRun } from "../app/simulation/survival/engine.ts";
import { discoveryInput } from "../app/simulation/survival/discovery-boundary.ts";
import { prepareDiscovery } from "../app/simulation/survival/discovery-policy.ts";

// A development/regression demonstration, NOT an untouched evaluation trial.
// Both environmental episodes are declared in the fixture. It never supplies a
// goal, hypothesis, program, trained answer, or extra carried resources.
let world = protectionPressure("discovery-dev-basin-1", { climateVolatility: "variable" });
const events = [], choices = [], snapshots = [];
function advance() {
  const result = advanceSurvivalRun(world, 1); world = result.state;
  if (!validateSurvivalRun(world)) throw new Error(`Invalid checkpoint at ${world.tick}`);
  for (const event of result.events) {
    if (event.facts.operation === "discovery_comparison") {
      const comparison = JSON.parse(event.facts.candidateSummary);
      if (comparison.selectedId !== "ordinary") events.push({ id: event.id, tick: event.tick, kind: "comparison", comparison });
    } else if (event.facts.operation === "discovery_measurement") events.push({ id: event.id, tick: event.tick, kind: "measurement", prediction: JSON.parse(event.facts.preActionPrediction), measurement: JSON.parse(event.facts.measurement), outcome: event.outcome });
  }
}
while (world.tick < 36) advance();
snapshots.push({ tick: world.tick, goals: structuredClone(world.agents[0].discovery.goals), procedures: structuredClone(world.agents[0].discovery.procedures), workEnergy: world.physical.workEnergy });
world = transferPressure(world);
for (let n = 0; n < 50 && world.status === "running"; n++) {
  world.environment.weather = "cold_snap";
  advance();
  const learned = discoveryInput(world.agents[0], world.tick, world.environment.bounds), frozen = structuredClone(learned);
  frozen.agent.discovery.mode = "frozen";
  const a = prepareDiscovery(learned)[0], b = prepareDiscovery(frozen)[0];
  if (JSON.stringify(a?.actions) !== JSON.stringify(b?.actions)) choices.push({ tick: world.tick, learned: a?.discoveryId ?? a?.candidate.goal, frozen: b?.discoveryId ?? b?.candidate.goal, learnedNextAction: a?.actions[0], frozenNextAction: b?.actions[0] });
}
snapshots.push({ tick: world.tick, goals: world.agents[0].discovery.goals, procedures: world.agents[0].discovery.procedures, metrics: world.agents[0].discovery.metrics, workEnergy: world.physical.workEnergy });
const trace = { kind: "Explicit two-episode development fixture; not natural-world or holdout performance", seed: "discovery-dev-basin-1", sourceBaseline: "b1473b10596b2e7f252c40f0af94e95b473b06a2", conditions: "One agent; initial warmth 45/safety 18 with nearby raw resources, no extra inventory. At tick 36 relocate the same life and raw sites, damage prior parts, apply a cold period. Keep all inventory and earned knowledge unchanged.", units: "One tick = 10 modeled minutes. Protection and prediction intervals are normalized 0–1. Support dose uses model load units, not newtons. Work energy uses normalized physiology units.", events, pairedChoiceChecks: choices, snapshots };
fs.writeFileSync(new URL("../docs/discovery-goal-trace.json", import.meta.url), JSON.stringify(trace, null, 2) + "\n");
console.log(JSON.stringify({ recordedEvents: events.length, changedPairedChoices: choices.length, firstChangedChoice: choices[0], metrics: world.agents[0].discovery.metrics, valid: validateSurvivalRun(world) }));
