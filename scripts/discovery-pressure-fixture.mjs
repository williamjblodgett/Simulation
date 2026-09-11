import { createSurvivalRun } from "../app/simulation/survival/engine.ts";

/** Development environment fixture, NOT a policy instruction or a seeded answer.
 * A cold/exposed starting life has reachable raw materials. No goals, hypotheses,
 * trained models, buildings, inventory gifts or operation sequences are supplied. */
export function protectionPressure(seed = "discovery-dev-cold-2", config = {}) {
  const world = createSurvivalRun(seed, { climateVolatility: "harsh", durationHours: 72, ...config, policyVersion: 4, agentCount: 1, continuity: false });
  const agent = world.agents[0]; agent.position = { x: 60, z: 60 };
  agent.needs.warmth = 45; agent.needs.safety = 18;
  // The constructor observed the unmodified origin. Relocation precedes the
  // scenario's first tick; clear those observations, not replace them with clues.
  agent.observations = [];
  let n = 0;
  for (const site of world.environment.resources) {
    if (site.id.endsWith("-1")) {
      site.position = site.kind === "freshwater" ? { x: 74, z: 60 } : { x: 55 + n++ * 2, z: 64 };
    }
  }
  return world;
}

/** Isolated support-domain environment: existing raw standing wood, not a roof,
 * learned answer, assigned project or inventory gift. The maker field is only
 * the fixture's required registry owner; no claim of agent manufacture is made. */
export function supportPressure() {
  const world = protectionPressure("discovery-dev-cold-2");
  const a = world.agents[0];
  world.physical.parts.push({ id: "part-1", makerId: a.id, createdAt: 0, sources: [],
    composition: { wood: .7 * 2.4 * .7 * .65 }, size: { x: .7, y: 2.4, z: .7 },
    position: { x: 61, y: 1.2, z: 60 }, rotation: 0, condition: 1, temperature: 5,
    peakTemperature: 5, hollow: 0, water: 0, supported: true, revision: 1 });
  world.physical.nextId = 2;
  return world;
}

/** A second environmental episode for a life that learned through execution.
 * Test-only relocation, storm damage and raw-site relocation are explicit fixture
 * interventions, NOT a UI capability or an unexplained autonomous world event.
 * Keeps all inventory, private evidence and procedures exactly as earned. */
export function transferPressure(world) {
  const next = structuredClone(world), a = next.agents[0];
  a.position = { x: 60, z: 82 }; a.needs.warmth = 45; a.needs.safety = 18;
  next.environment.weather = "cold_snap";
  for (const p of next.physical.parts) p.condition = .05;
  let n = 0;
  for (const site of next.environment.resources) if (site.id.endsWith("-1")) site.position = site.kind === "freshwater" ? { x: 74, z: 82 } : { x: 55 + n++ * 2, z: 86 };
  return next;
}
