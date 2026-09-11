import fs from "node:fs";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { createSurvivalRun, advanceSurvivalRun, validateSurvivalRun } from "../app/simulation/survival/engine.ts";
import { protectionPressure } from "./discovery-pressure-fixture.mjs";

const evaluation = process.argv.includes("--evaluation"), pressure = process.argv.includes("--pressure"), long = process.argv.includes("--long"), legacy = process.argv.includes("--legacy");
const option = key => process.argv.find(a => a.startsWith(`${key}=`))?.slice(key.length + 1);
const release = process.argv.includes("--release");
const candidate = process.argv.includes("--candidate");
const modes = option("--mode") ? [option("--mode")] : ["directed", "frozen", "random", "none", "fixed"];
const scenarios = legacy ? ["construction-review-1", "survival-audit-1", "survival-audit-2", "survival-audit-3"].map(seed => ({ seed, agentCount: 3, resourceAbundance: "balanced", climateVolatility: "variable", durationHours: 72 }))
  : long ? [{ seed: "discovery-dev-long-4", agentCount: 1, resourceAbundance: "balanced", climateVolatility: "harsh", durationHours: 168 }]
  : evaluation ? [{ seed: candidate ? "discovery-candidate-estuary-311" : release ? "discovery-release-estuary-902" : "discovery-eval-estuary-641", agentCount: 1, resourceAbundance: "balanced", climateVolatility: "variable", durationHours: 72 }, { seed: candidate ? "discovery-candidate-ridge-673" : release ? "discovery-release-ridge-457" : "discovery-eval-ridge-829", agentCount: 3, resourceAbundance: "balanced", climateVolatility: "harsh", durationHours: 72 }, { seed: candidate ? "discovery-candidate-cove-884" : release ? "discovery-release-cove-318" : "discovery-eval-cove-173", agentCount: 5, resourceAbundance: "scarce", climateVolatility: "variable", durationHours: 72 }]
  : [{ seed: "discovery-dev-basin-1", agentCount: pressure ? 1 : 3, resourceAbundance: "balanced", climateVolatility: "variable", durationHours: 72 }, { seed: "discovery-dev-cold-2", agentCount: pressure ? 1 : 3, resourceAbundance: "balanced", climateVolatility: "harsh", durationHours: 72 }, { seed: "discovery-dev-scarce-3", agentCount: pressure ? 1 : 3, resourceAbundance: "scarce", climateVolatility: "variable", durationHours: 72 }];
const selected = option("--seed") ? scenarios.filter(s => s.seed === option("--seed")) : scenarios;
const suffix = [candidate ? "candidate" : release ? "release" : null, evaluation ? "evaluation" : "development", legacy ? "legacy" : long ? "long" : pressure ? "pressure" : "natural", option("--mode") ?? "all", option("--seed") ?? "matrix"].filter(Boolean).join("-");
const output = new URL(`../docs/discovery-${suffix}.json`, import.meta.url), results = [];
const started = new Date().toISOString();
const sourceFiles = ["engine.ts", "planner.ts", "survival-forecast.ts", "physiology.ts", "discovery-types.ts", "discovery-boundary.ts", "discovery-policy.ts", "discovery-model.ts", "discovery-outcomes.ts", "discovery-validation.ts", "physical-world.ts", "physical-validation.ts"];
const sourceFingerprint = createHash("sha256").update(sourceFiles.map(file => file + fs.readFileSync(new URL(`../app/simulation/survival/${file}`, import.meta.url), "utf8")).join("\n")).digest("hex");
const flush = () => fs.writeFileSync(output, JSON.stringify({ started, sourceBaseline: "b1473b10596b2e7f252c40f0af94e95b473b06a2", sourceFingerprint, environment: "Node on Windows desktop; shared-host wall time, not browser FPS or isolated CPU performance. A run, not each agent, is a trial.", protocol: "DISCOVERY_EVALUATION.md", results }, null, 2) + "\n");
for (const scenario of selected) for (const mode of legacy ? ["legacy-3"] : modes) {
  let world = pressure ? protectionPressure(scenario.seed, scenario) : createSurvivalRun(scenario.seed, { ...scenario, policyVersion: legacy ? 3 : 4, continuity: false });
  for (const a of world.agents) if (a.discovery) a.discovery.mode = mode;
  const durations = [], observations = []; let blocked = 0, repeated = 0, priorBlock = "", totalBytes = 0, invalid = false, failure = null, consumedWater = 0, consumedFood = 0;
  const before = performance.now(), startBytes = JSON.stringify(world).length;
  console.log(JSON.stringify({ starting: scenario.seed, mode, pressure, durationHours: scenario.durationHours }));
  try {
    while (world.status === "running") {
      const at = performance.now(), result = advanceSurvivalRun(world, 1); world = result.state; durations.push(performance.now() - at);
      for (const e of result.events) {
        if (e.facts.success === true && e.facts.action === "drink") consumedWater++;
        if (e.facts.success === true && e.facts.action === "eat") consumedFood++;
        if (e.facts.success === false && e.facts.action === "move") { blocked++; const signature = `${e.agentIds.join()}:${e.outcome}`; if (signature === priorBlock) repeated++; priorBlock = signature; }
        if (e.facts.operation === "discovery_measurement" || e.facts.operation === "discovery_comparison") observations.push(e);
      }
      if (world.tick % 36 === 0) { if (!validateSurvivalRun(world)) { invalid = true; break; } totalBytes = Math.max(totalBytes, JSON.stringify(world).length); }
    }
  } catch (error) { failure = String(error?.stack ?? error); }
  durations.sort((a, b) => a - b);
  const minds = world.agents.flatMap(a => a.discovery ? [a.discovery] : []), sum = key => minds.reduce((n, m) => n + m.metrics[key], 0);
  const row = { ...scenario, mode, pressure, status: failure ? "error" : invalid ? "invalid-checkpoint" : world.status, tick: world.tick, survivors: world.stats.livingAgents,
    deaths: world.agents.filter(a => !a.alive).map(a => ({ id: a.id, cause: a.causeOfDeath, hour: a.diedAt / 6 })), blocked, repeatedBlocked: repeated, failedOperations: sum("failedOperations"),
    parts: world.physical.parts.length, materialInParts: world.physical.parts.reduce((n, p) => n + Object.values(p.composition).reduce((a, b) => a + b, 0), 0), spent: world.physical.spent,
    damagedMaterial: world.physical.parts.filter(p => p.condition < .1).reduce((n, p) => n + Object.values(p.composition).reduce((a, b) => a + b, 0), 0),
    measuredTests: sum("measurements"), testEffort: sum("testEffort"), adaptations: sum("adaptations"), transferredProcedures: sum("transfers"), procedures: minds.reduce((n, m) => n + m.procedures.length, 0),
    actualPhysicalTests: world.physical.tests, physicalWorkEnergy: world.physical.workEnergy, gathered: null, consumedWater, consumedFood,
    unconfirmedParts: world.physical.parts.filter(p => !minds.some(m => m.evidence.some(e => e.partId === p.id && e.value > 0))).length,
    preventability: "Not assigned from cause labels; only paired outcomes and recorded feasible alternatives support a preventability review.",
    supportMeasurements: observations.filter(e => e.facts.operation === "discovery_measurement" && JSON.parse(e.facts.measurement).metric === "support").length,
    predictionRMSE: sum("measurements") ? Math.sqrt(sum("squaredError") / sum("measurements")) : null, expansions: sum("expansions"),
    valid: validateSurvivalRun(world), wallMs: Math.round(performance.now() - before), stepP50: durations[Math.floor(durations.length * .5)], stepP95: durations[Math.floor(durations.length * .95)], maxStep: durations.at(-1),
    startBytes, maxCheckpointBytes: Math.max(totalBytes, JSON.stringify(world).length), residentBytes: process.memoryUsage().rss, heapBytes: process.memoryUsage().heapUsed, failure };
  row.instrumentationNotes = ["Collected quantity is unavailable: the action event contract does not include amount. Drink/meal values count confirmed actions, not mass.", "Adaptations counts reconsiderations after evidence; it does not prove the change was useful. RepeatedBlocked counts repeated failure signatures, not a causal diagnosis."];
  if (legacy) {
    for (const key of ["failedOperations", "measuredTests", "testEffort", "adaptations", "transferredProcedures", "procedures", "unconfirmedParts", "supportMeasurements", "expansions"]) row[key] = null;
    row.instrumentationNotes.push("Policy-4 notebook counters are unavailable for legacy policy 3; actualPhysicalTests and physicalWorkEnergy use the shared world ledger.");
  }
  results.push(row); flush(); console.log(JSON.stringify(row));
  if (option("--trace")) fs.writeFileSync(new URL(`../docs/discovery-trace-${scenario.seed}-${mode}.json`, import.meta.url), JSON.stringify({ scenario, mode, events: observations, world }, null, 2) + "\n");
}
