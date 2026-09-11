import { survivalHash } from "./random";
import type { PrivatePolicyInput } from "./planner";
import type { AgentObservation, SurvivalAgent, SurvivalEnvironment } from "./types";

const facts = new Set(["resourceKind", "availableEstimate", "bulkDensity", "waterRadiusX", "waterRadiusZ", "waterCenterX", "waterCenterZ", "waterRotation", "waterDepth", "alive", "label", "healthEstimate", "hydrationEstimate", "nutritionEstimate", "lastPresenceFailureAt", "weather", "temperatureC", "daylight", "structureKind", "width", "height", "depth", "elevation", "rotation", "condition", "makerId", "revision", "material", "mass", "hollow", "storedWater", "supported", "bindingIds", "treatment"]);
const inventoryKeys = ["freshwater", "food", "wood", "stone", "fiber", "herbs", "clay"] as const;
facts.add("mineralAppearance"); // A local visible description, not a chemical assay or global deposit list.
/** Explicit recursively allowlisted private record fields, not a TS cast hiding live properties. */
const privateKeys = new Set((`version mode goals models evidence experiments procedures decisions lastReviewAt nextId evidenceFloor active failures metrics id parentId objective metric evidenceIds createdAt updatedAt target predictedBenefit urgency budget ticks effort material status criterion abandonWhen reason features mean m2 samples lastTick originalId originalObserverId tick receivedAt source value before dose partId experimentId interpretation confounds goalId projectId claim prediction competingOutcomes low high decisionAffected intervention stoppingRule maxTicks maxEffort evidenceId result spentEffort endedAt origin program inputs symbol size minimumCondition resources effect uncertainty successes weather minTemperature maxTemperature selectedId alternatives omitted expansions kind label score cost informationValue predictedProtection rejection operations position supportPrediction procedureId completed bindings startedAt sourceProcedureId signature predictions squaredError measurements testEffort adaptations transfers failedOperations duplicateReports width height depth mass condition supported rotation elevation distance lateral longitudinal temperature treatment measurementLimit residualError x y z wood stone fiber clay readings estimates uses namedAt nameEvidence learningEnabled projects source test observation demonstration observerId after confidence summary revision originalEvidenceId measurementKind lastTick receivedAt sizePerMass relativePosition learnedAt conditions minTemperature maxTemperature lastReviewAt baseline reason reserved cursor partIds revisions blocker retryAt history action warmthBefore warmthAfter protection successes variance recordedAt context attempts expectedUtility expectedYield targetId utility result recordedAt action updatedAt agentId trust encounters aidGiven aidReceived lastInteractionAt destination waypoints blocked failures retryAt arrivedAt contact radius sampledAt sourceId contamination activity materialSamples fraction a b fuel measure hollow jointId`).split(/\s+/));
privateKeys.add("alternative");
privateKeys.add("arrivalRadius");
for (const key of ["discoveryProjectId", "spentTicks", "originatingConditions", "temperatureC", "daylight", "forecastWarmth", "forecastSafety"]) privateKeys.add(key);
function privateRecord<T>(value: T): T {
  if (Array.isArray(value)) return value.map(privateRecord) as T;
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([key, entry]) => entry !== undefined && (privateKeys.has(key) || ["recent", "from", "to", "freshwater", "food", "herbs", "frame", "remainingSteps", "steps", "activeStepIndex", "formedAt", "goal", "rationale", "initialNeeds", "initialInventory", "health", "hydration", "nutrition", "energy", "warmth", "safety", "decisionId", "amount", "resource", "manipulation", "targetPosition"].includes(key) || /^\$\d+$/.test(key)))
    .map(([key, entry]) => [key, privateRecord(entry)])) as T;
}
export function privateObservation(observation: AgentObservation): AgentObservation {
  return { id: observation.id, observerId: observation.observerId, kind: observation.kind, subjectId: observation.subjectId,
    observedAt: observation.observedAt, position: observation.position ? { x: observation.position.x, z: observation.position.z } : null,
    confidence: observation.confidence, facts: Object.fromEntries(Object.entries(observation.facts).filter(([key]) => facts.has(key))),
    ...(observation.originalObserverId ? { originalObserverId: observation.originalObserverId, receivedAt: observation.receivedAt,
      transmissionChain: observation.transmissionChain?.slice() } : {}) };
}
export function discoveryInput(agent: SurvivalAgent, tick: number, bounds: SurvivalEnvironment["bounds"]): PrivatePolicyInput {
  const copy: SurvivalAgent = {
    id: agent.id, label: agent.label, slot: agent.slot, slotGeneration: agent.slotGeneration, name: agent.name,
    spawnSource: agent.spawnSource, spawnedAt: agent.spawnedAt, alive: agent.alive, diedAt: agent.diedAt,
    causeOfDeath: agent.causeOfDeath, position: { x: agent.position.x, z: agent.position.z },
    needs: { health: agent.needs.health, hydration: agent.needs.hydration, nutrition: agent.needs.nutrition, energy: agent.needs.energy, warmth: agent.needs.warmth, safety: agent.needs.safety },
    inventory: Object.fromEntries(inventoryKeys.map(k => [k, agent.inventory[k]])) as SurvivalAgent["inventory"],
    observations: agent.observations.filter(o => o.observerId === agent.id).map(privateObservation),
    memory: privateRecord(agent.memory), learning: privateRecord(agent.learning), relationships: privateRecord(agent.relationships),
    technologies: [], research: [], currentDeliberation: null, currentPlan: privateRecord(agent.currentPlan),
    currentAction: { kind: agent.currentAction.kind, status: agent.currentAction.status, targetId: agent.currentAction.targetId,
      startedAt: agent.currentAction.startedAt, updatedAt: agent.currentAction.updatedAt }, lastOutcome: null,
    navigation: privateRecord(agent.navigation), materialSamples: privateRecord(agent.materialSamples),
    physicalMind: privateRecord(agent.physicalMind), discovery: privateRecord(agent.discovery),
  };
  if(copy.physicalMind)copy.physicalMind.readings=copy.physicalMind.readings.filter(r=>r.measurementKind==="local");
  // Independent deterministic stream: NOT a transform of the world seed. The
  // policy cannot reconstruct world generation from this constant/identity stream.
  return { agent: copy, physical: true, tick, seed: survivalHash(0x4d31504f, agent.id, "private-policy"),
    bounds: { minX: bounds.minX, maxX: bounds.maxX, minZ: bounds.minZ, maxZ: bounds.maxZ } };
}
