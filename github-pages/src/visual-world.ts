import type { CivilizationWorldState, ResourceKind } from "../../app/simulation/civilization-engine";
import type {
  DiplomaticRelation as VisualDiplomaticRelation,
  MapOverlayMode,
  VisualWorld,
} from "../../app/simulation/civilization-scene";

interface LooseRelation {
  id?: string;
  campAId?: string;
  campBId?: string;
  fromCampId?: string;
  toCampId?: string;
  status?: string;
  relation?: string;
  trust?: number;
  tension?: number;
  strength?: number;
  warScore?: number;
  warScoreA?: number;
  warScoreB?: number;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function relationView(relation: unknown, index: number) {
  const raw = relation as LooseRelation;
  const fromCampId = raw.campAId ?? raw.fromCampId ?? "";
  const toCampId = raw.campBId ?? raw.toCampId ?? "";
  const status = String(raw.status ?? raw.relation ?? "neutral").toLowerCase();
  const rawStrength = raw.strength ?? (status === "war" ? raw.tension : raw.trust) ?? 0.5;
  return {
    id: raw.id ?? `relation-${index}`,
    fromCampId,
    toCampId,
    status,
    strength: clamp(rawStrength > 1 ? rawStrength / 100 : rawStrength, 0, 1),
    warScore: raw.warScore ?? (raw.warScoreA ?? 0) - (raw.warScoreB ?? 0),
  };
}

export function toVisualWorld(
  world: CivilizationWorldState,
  overlayMode: MapOverlayMode,
  selectedBeliefId: string | null,
): VisualWorld {
  const activeCamps = world.camps.filter((camp) => camp.active);
  const activeCampIds = new Set(activeCamps.map((camp) => camp.id));
  const relations = world.relations.map(relationView);
  const beliefById = new Map(world.beliefs.map((belief) => [belief.id, belief]));

  return {
    seed: world.seed,
    elapsed: world.time,
    halfSize: world.map.halfSize,
    overlayMode,
    selectedBeliefId,
    agents: world.agents
      .filter((agent) => agent.alive || (agent.deathDay !== null && world.day - agent.deathDay < 1.5))
      .map((agent) => ({
        id: agent.id,
        name: agent.name,
        color: agent.color,
        position: agent.position,
        velocity: agent.velocity,
        alive: agent.alive,
        health: agent.health,
        age: agent.age,
        adult: agent.age >= 16,
        campId: agent.campId,
        power: agent.personalPower,
        inventory: agent.inventory,
        beliefId: agent.beliefId,
        beliefColor: agent.beliefId ? beliefById.get(agent.beliefId)?.color ?? null : null,
        conviction: agent.conviction,
      })),
    resources: world.resources.map((resource) => ({
      id: resource.id,
      kind: resource.kind as ResourceKind,
      position: resource.position,
      amount: resource.amount,
      max: resource.maxAmount,
    })),
    camps: activeCamps.map((camp) => ({
      id: camp.id,
      name: camp.name,
      color: camp.color,
      position: camp.position,
      level: Math.max(1, Object.values(camp.structures).reduce((total, value) => total + value, 0)),
      power: camp.power,
      territory: camp.territoryRadius,
      population: camp.memberIds.length,
      techLevel: camp.technologies.length,
      leaderId: camp.leaderId,
      underAttack: world.relations.some((relation) => relation.status === "war" && (
        relation.campAId === camp.id || relation.campBId === camp.id
      )),
      dominantBeliefId: camp.dominantBeliefId,
      beliefColor: camp.dominantBeliefId ? beliefById.get(camp.dominantBeliefId)?.color ?? null : null,
      beliefDiversity: camp.beliefDiversity,
      shrineLevel: camp.shrineLevel,
    })),
    beliefs: world.beliefs.map((belief) => ({
      id: belief.id,
      name: belief.name,
      color: belief.color,
      sacredSite: belief.sacredSite,
      influence: belief.influence,
      adherents: belief.adherentIds.length,
      active: belief.active,
    })),
    diplomaticLinks: relations
      .filter((relation) => relation.status !== "neutral" && relation.status !== "war")
      .filter((relation) => activeCampIds.has(relation.fromCampId) && activeCampIds.has(relation.toCampId))
      .map((relation) => ({
        id: relation.id,
        fromCampId: relation.fromCampId,
        toCampId: relation.toCampId,
        relation: (
          relation.status === "alliance" ? "alliance" :
            relation.status === "trade" || relation.status === "truce" ? "trade" : "hostile"
        ) as VisualDiplomaticRelation,
        strength: relation.strength,
      })),
    wars: relations
      .filter((relation) => relation.status === "war")
      .filter((relation) => activeCampIds.has(relation.fromCampId) && activeCampIds.has(relation.toCampId))
      .map((relation) => ({
        id: `war-${relation.id}`,
        attackerCampId: relation.fromCampId,
        defenderCampId: relation.toCampId,
        intensity: clamp(Math.max(relation.strength, Math.abs(relation.warScore) / 100, 0.2), 0, 1),
      })),
  };
}
