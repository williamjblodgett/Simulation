import fs from "node:fs";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { createSurvivalRun, advanceSurvivalRun, validateSurvivalRun } from "../app/simulation/survival/engine.ts";
import { feedstockKinds, feedstockMass, geologicalHoldings } from "../app/simulation/survival/geology.ts";

const evaluation = process.argv.includes("--evaluation"), long = process.argv.includes("--long");
const split = long ? "long-development" : evaluation ? "evaluation" : "development";
const scenarios = long ? [{ seed: "materials-long-1", agentCount: 1, resourceAbundance: "balanced", climateVolatility: "harsh", durationHours: 168 }]
  : [
    { seed: evaluation ? "materials-holdout-estuary-582" : "materials-dev-1", agentCount: 1, resourceAbundance: "balanced", climateVolatility: "variable", durationHours: 72 },
    { seed: evaluation ? "materials-holdout-ridge-961" : "materials-dev-2", agentCount: 3, resourceAbundance: "balanced", climateVolatility: "harsh", durationHours: 72 },
    { seed: evaluation ? "materials-holdout-cove-407" : "materials-dev-3", agentCount: 5, resourceAbundance: "scarce", climateVolatility: "variable", durationHours: 72 },
  ];
const sourceDir = new URL("../app/simulation/survival/", import.meta.url);
const sourceFingerprint = createHash("sha256").update(fs.readdirSync(sourceDir).filter(f => f.endsWith(".ts")).sort().map(f => f + fs.readFileSync(new URL(f, sourceDir), "utf8")).join("\n")).digest("hex");
const results = [], started = new Date().toISOString();
const flush = () => fs.writeFileSync(new URL(`../docs/materials-${split}.json`, import.meta.url), JSON.stringify({ started, sourceBaseline: "42f14274a7c0d4bbfb7ed9c195f780ff8ca277e7", sourceFingerprint, protocol: "MATERIAL_EVALUATION.md", environment: "Node on shared Windows desktop, not browser FPS. One run is one trial.", results }, null, 2) + "\n");

for (const scenario of scenarios) for (const arm of long ? ["geology-v1"] : ["basic", "geology-v1"]) {
  const startedAt = performance.now(), durations = [], previousBlocks = new Map();
  let world, failure = null, maxBytes = 0, failedActions = 0, blocked = 0, repeatedBlocked = 0;
  console.log(JSON.stringify({ starting: scenario.seed, arm }));
  try {
    world = createSurvivalRun(scenario.seed, { ...scenario, policyVersion: 4, continuity: false, ...(arm === "geology-v1" ? { materialFoundation: arm } : {}) });
    maxBytes = Buffer.byteLength(JSON.stringify(world));
    while (world.status === "running") {
      const at = performance.now(), result = advanceSurvivalRun(world, 1);
      world = result.state; durations.push(performance.now() - at);
      for (const event of result.events) if (event.facts.success === false) {
        failedActions++;
        if (event.facts.action === "move") {
          blocked++;
          const agent = event.agentIds.join(), signature = `${event.facts.targetId ?? ""}:${event.outcome}`;
          if (previousBlocks.get(agent) === signature) repeatedBlocked++;
          previousBlocks.set(agent, signature);
        }
      }
      if (world.tick % 36 === 0) {
        if (!validateSurvivalRun(world)) throw new Error(`Invalid checkpoint at tick ${world.tick}`);
        maxBytes = Math.max(maxBytes, Buffer.byteLength(JSON.stringify(world)));
      }
    }
    if (!validateSurvivalRun(world)) throw new Error("Invalid final checkpoint");
  } catch (error) { failure = String(error?.stack ?? error); process.exitCode = 1; }
  durations.sort((a, b) => a - b);
  const parts = world?.physical?.parts ?? [], agents = world?.agents ?? [];
  const minerals = world?.geology ? feedstockKinds.map(kind => {
    const site = world.environment.resources.find(s => s.feedstock === kind);
    return { kind, initial: site?.capacity ?? null, remaining: site?.quantity ?? null, extracted: site ? site.capacity - site.quantity : null, ...geologicalHoldings(agents, parts, kind) };
  }) : null;
  const row = { ...scenario, arm, status: failure ? "error" : world.status, tick: world?.tick ?? 0, survivors: agents.filter(a => a.alive).length,
    deaths: agents.filter(a => !a.alive).map(a => ({ id: a.id, hour: a.diedAt / 6, cause: a.causeOfDeath })),
    failedActions, blocked, repeatedBlocked, physicalTests: world?.physical?.tests ?? null, physicalWork: world?.physical?.workEnergy ?? null,
    parts: parts.length, rawInParts: parts.reduce((n, p) => n + feedstockMass(p.rawFeedstocks), 0), minerals,
    expansions: agents.reduce((n, a) => n + (a.discovery?.metrics.expansions ?? 0), 0),
    valid: !!world && validateSurvivalRun(world), wallMs: Math.round(performance.now() - startedAt),
    stepP50: durations[Math.floor(durations.length * .5)] ?? null, stepP95: durations[Math.floor(durations.length * .95)] ?? null, maxStep: durations.at(-1) ?? null,
    maxCheckpointBytes: Math.max(maxBytes, world ? Buffer.byteLength(JSON.stringify(world)) : 0), residentBytes: process.memoryUsage().rss, heapBytes: process.memoryUsage().heapUsed,
    notes: "The legacy field failedActions counts negative outcome RECORDS, not unique attempts: a failed physical operation emits both detail and general action records. Refusals use a separate accepted field. repeatedBlocked counts repeated movement-failure signatures per agent, not proven preventability. Mineral extraction is net deposit depletion, not refined product.", failure };
  results.push(row); flush();
  console.log(JSON.stringify({ ...row, minerals: minerals?.filter(m => m.extracted > 0) ?? null }));
}
