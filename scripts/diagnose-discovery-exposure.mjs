import fs from "node:fs";
import { protectionPressure } from "./discovery-pressure-fixture.mjs";
import { createSurvivalRun, advanceSurvivalRun, validateSurvivalRun } from "../app/simulation/survival/engine.ts";

const label = process.argv[2] ?? "before";
const results = [];
const long = process.argv.includes("--long");
for (const mode of long ? ["directed"] : ["directed", "none", "fixed"]) {
  let world = long ? createSurvivalRun("discovery-dev-long-4", { policyVersion: 4, agentCount: 1, climateVolatility: "harsh", durationHours: 168, continuity: false }) : protectionPressure("discovery-dev-cold-2");
  world.agents[0].discovery.mode = mode;
  const hourly = [], decisions = [], actions = [], outcomes = [];
  while (world.status === "running") {
    const result = advanceSurvivalRun(world, 1); world = result.state;
    if (!validateSurvivalRun(world)) throw new Error(`Invalid ${mode} checkpoint at ${world.tick}`);
    const a = world.agents[0];
    if (world.tick % 6 === 0 || !a.alive) hourly.push({ tick: world.tick, needs: structuredClone(a.needs), inventory: structuredClone(a.inventory), weather: world.environment.weather, position: structuredClone(a.position), action: a.currentAction.kind, plan: a.currentPlan?.rationale, activeProject: a.discovery.active?.projectId ?? null });
    actions.push({ tick: world.tick, action: a.currentAction.kind, needs: structuredClone(a.needs), rationale: a.currentPlan?.rationale });
    for (const e of result.events) {
      if (e.facts.operation === "discovery_comparison") decisions.push({ tick: world.tick, ...JSON.parse(e.facts.candidateSummary) });
      if (e.facts.operation === "discovery_measurement" || e.type === "agent_died") outcomes.push(e);
    }
  }
  results.push({ mode, status: world.status, survivors: world.stats.livingAgents, lastTick: world.tick, hourly, decisions, actions, outcomes, parts: world.physical.parts, projects: world.agents[0].physicalMind.projects, goals: world.agents[0].discovery.goals });
  console.log(JSON.stringify({ mode, status: world.status, survivors: world.stats.livingAgents, final: hourly.at(-1), decisions: decisions.map(d => ({ tick: d.tick, selected: d.selectedId, label: d.alternatives[0]?.label, value: d.alternatives[0]?.score })), outcomes: outcomes.map(e => ({ tick: e.tick, outcome: e.outcome })) }));
}
fs.writeFileSync(new URL(`../docs/discovery-exposure-${label}.json`, import.meta.url), JSON.stringify({ fixture: long ? "Declared 168-hour development study, natural environment, no interventions" : "Declared development pressure fixture, no injected policy answers or extra inventory", results }, null, 2) + "\n");
