"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MutableRefObject,
} from "react";
import {
  Activity,
  Baby,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Compass,
  Crown,
  Droplets,
  Eye,
  Focus,
  Heart,
  Leaf,
  Map as MapIcon,
  Maximize2,
  Minimize2,
  Package,
  ScrollText,
  Shield,
  Sparkles,
  Swords,
  Tent,
  Users,
  Wheat,
  Zap,
} from "lucide-react";
import {
  BELIEF_TENET_LABELS,
  FIXED_STEP,
  MAX_ACTIVE_CAMPS,
  TECHNOLOGY_TREE,
  WORLD_HALF_SIZE,
  createCivilizationWorld,
  getActionLabel,
  getRankedAgents,
  getRankedBeliefs,
  getRankedCamps,
  getTechnologyLabel,
  getWorldTimeLabel,
  normalizeCivilizationWorld,
  simulateCivilization,
  type CivilizationAgent,
  type CivilizationBeliefSystem,
  type CivilizationCamp,
  type CivilizationWorldState,
  type MajorEvent,
  type ResourceKind,
} from "./simulation/civilization-engine";
import {
  createCivilizationScene,
  type CameraMode,
  type DiplomaticRelation as VisualDiplomaticRelation,
  type VisualWorld,
} from "./simulation/civilization-scene";

const INITIAL_SEED = 2_846_731;
const POLL_INTERVAL = 4_000;
const ROSTER_MODES = ["powers", "agents", "beliefs"] as const;

type RosterMode = "powers" | "agents" | "beliefs";
type EventFilter = "all" | "power" | "war" | "lineage" | "technology" | "belief";
type SyncState = "connecting" | "persistent" | "catching_up" | "reconnecting";
type Selection = { kind: "agent" | "camp" | "belief"; id: string };

interface WorldResponse {
  world: unknown;
  revision?: number;
  serverTime?: number;
  persistent?: boolean;
  history?: MajorEvent[];
  caughtUp?: boolean;
  catchUpPendingSeconds?: number;
}

interface LooseResource {
  id: string;
  kind: ResourceKind;
  position: { x: number; z: number };
  amount: number;
  maxAmount?: number;
  max?: number;
}

interface LooseRelation {
  id?: string;
  campAId?: string;
  campBId?: string;
  fromCampId?: string;
  toCampId?: string;
  status?: string;
  relation?: string;
  trust?: number;
  strength?: number;
  tension?: number;
  sinceDay?: number;
  startedDay?: number;
  warScore?: number;
  warScoreA?: number;
  warScoreB?: number;
}

interface LooseEvent {
  id?: string | number;
  type?: string;
  tone?: string;
  title?: string;
  message?: string;
  day?: number;
  time?: number;
  agentIds?: string[];
  campIds?: string[];
  agentId?: string;
  campId?: string;
}

interface LooseStructures {
  [key: string]: number | undefined;
}

function clamp(value: number, minimum = 0, maximum = 100) {
  return Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum));
}

function percent(value: number) {
  return clamp(value <= 1 ? value * 100 : value);
}

function humanize(value: string) {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function compactNumber(value: number) {
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}k`;
  return Math.round(value).toString();
}

function compactDuration(seconds: number) {
  if (seconds >= 86_400) return `${Math.ceil(seconds / 86_400)}D`;
  if (seconds >= 3_600) return `${Math.ceil(seconds / 3_600)}H`;
  if (seconds >= 60) return `${Math.ceil(seconds / 60)}M`;
  return `${Math.ceil(seconds)}S`;
}

function getCampName(world: CivilizationWorldState, campId: string | null) {
  if (!campId) return "Unaffiliated";
  return world.camps.find((camp) => camp.id === campId)?.name ?? "Lost camp";
}

function getBeliefName(world: CivilizationWorldState, beliefId: string | null) {
  if (!beliefId) return "No shared belief";
  return world.beliefs.find((belief) => belief.id === beliefId)?.name ?? "Faded belief";
}

function relationView(relation: unknown, index: number) {
  const raw = relation as LooseRelation;
  const fromCampId = raw.campAId ?? raw.fromCampId ?? "";
  const toCampId = raw.campBId ?? raw.toCampId ?? "";
  const status = String(raw.status ?? raw.relation ?? "neutral").toLowerCase();
  const rawStrength = raw.strength ?? (status === "war" ? raw.tension : raw.trust) ?? 0.5;
  const strength = clamp(rawStrength > 1 ? rawStrength / 100 : rawStrength, 0, 1);
  return {
    id: raw.id ?? `relation-${index}`,
    fromCampId,
    toCampId,
    status,
    strength,
    startedDay: raw.sinceDay ?? raw.startedDay ?? 0,
    warScore: raw.warScore ?? Math.max(Math.abs(raw.warScoreA ?? 0), Math.abs(raw.warScoreB ?? 0)),
  };
}

function eventView(event: MajorEvent) {
  const raw = event as unknown as LooseEvent;
  const type = String(raw.type ?? "world").toLowerCase();
  const title = raw.title ?? humanize(type);
  const message = raw.message ?? title;
  return {
    id: String(raw.id ?? `${type}-${raw.day ?? raw.time ?? 0}-${message}`),
    type,
    tone: String(raw.tone ?? "neutral").toLowerCase(),
    title,
    message,
    day: Math.max(0, raw.day ?? 1),
    time: Math.max(0, raw.time ?? 0),
    agentIds: raw.agentIds ?? (raw.agentId ? [raw.agentId] : []),
    campIds: raw.campIds ?? (raw.campId ? [raw.campId] : []),
  };
}

function eventColor(type: string, tone: string) {
  if (/war|raid|battle|death|destroy|capture|coup/.test(type) || tone === "danger") return "#ff8066";
  if (/belief|faith|shrine|schism|reform|conversion/.test(type)) return "#cf9df2";
  if (/birth|offspring|lineage|join|allegiance|alliance|peace/.test(type)) return "#c7f36a";
  if (/tech|research|discover|build/.test(type)) return "#66d7d1";
  if (/break|defect|found|leader|power/.test(type)) return "#e7b95e";
  return "#8c9a91";
}

function eventMatches(type: string, filter: EventFilter) {
  if (filter === "all") return true;
  if (filter === "war") return /war|raid|battle|death|destroy|capture|truce|peace/.test(type);
  if (filter === "lineage") return /birth|offspring|lineage|join|allegiance|defect|break|found|coup/.test(type);
  if (filter === "technology") return /tech|research|discover|build|advance/.test(type);
  if (filter === "belief") return /belief|faith|shrine|schism|reform|conversion/.test(type);
  return /power|leader|camp|capture|coup|victory|found/.test(type);
}

function relationLabel(status: string) {
  if (status === "war") return "At war";
  if (status === "alliance" || status === "allied") return "Alliance";
  if (status === "truce") return "Truce";
  if (status === "trade") return "Trade pact";
  return humanize(status);
}

function relationColor(status: string) {
  if (status === "war" || status === "hostile") return "#ff8066";
  if (status === "alliance" || status === "allied") return "#c7f36a";
  if (status === "trade") return "#66d7d1";
  if (status === "truce") return "#e7b95e";
  return "#718078";
}

function worldEra(world: CivilizationWorldState) {
  const technologyCount = world.camps.reduce((highest, camp) => Math.max(highest, camp.technologies.length), 0);
  if (technologyCount >= 8) return "Dominion age";
  if (technologyCount >= 6) return "Forged age";
  if (technologyCount >= 3) return "Workshop age";
  if (technologyCount >= 1) return "Settlement age";
  return "Founding age";
}

function toVisualWorld(world: CivilizationWorldState, selectedBeliefId: string | null = null): VisualWorld {
  const activeCampIds = new Set(world.camps.filter((camp) => camp.active).map((camp) => camp.id));
  const relations = world.relations.map(relationView);
  const beliefById = new Map(world.beliefs.map((belief) => [belief.id, belief]));
  return {
    seed: world.seed,
    elapsed: world.time,
    halfSize: world.map.halfSize || WORLD_HALF_SIZE,
    agents: world.agents.filter((agent) => agent.alive || (agent.deathDay !== null && world.day - agent.deathDay < 1.5)).map((agent) => ({
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
    resources: world.resources.map((resource) => {
      const loose = resource as unknown as LooseResource;
      return {
        id: resource.id,
        kind: resource.kind,
        position: resource.position,
        amount: resource.amount,
        max: loose.maxAmount ?? loose.max ?? Math.max(1, resource.amount),
      };
    }),
    camps: world.camps.filter((camp) => camp.active).map((camp) => ({
      id: camp.id,
      name: camp.name,
      color: camp.color,
      position: camp.position,
      level: Math.max(1, Object.values(camp.structures as unknown as LooseStructures).reduce<number>((total, value) => total + (value ?? 0), 0)),
      power: camp.power,
      territory: camp.territoryRadius,
      population: camp.memberIds.length,
      techLevel: camp.technologies.length,
      leaderId: camp.leaderId,
      underAttack: relations.some((relation) => relation.status === "war" && (relation.fromCampId === camp.id || relation.toCampId === camp.id)),
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
    selectedBeliefId,
    diplomaticLinks: relations
      .filter((relation) => relation.fromCampId && relation.toCampId && relation.status !== "neutral" && relation.status !== "war")
      .filter((relation) => activeCampIds.has(relation.fromCampId) && activeCampIds.has(relation.toCampId))
      .map((relation) => ({
        id: relation.id,
        fromCampId: relation.fromCampId,
        toCampId: relation.toCampId,
        relation: (relation.status === "alliance" || relation.status === "allied" ? "alliance" : relation.status === "trade" || relation.status === "truce" ? "trade" : "hostile") as VisualDiplomaticRelation,
        strength: relation.strength,
      })),
    wars: relations
      .filter((relation) => relation.status === "war" && activeCampIds.has(relation.fromCampId) && activeCampIds.has(relation.toCampId))
      .map((relation) => ({
        id: `war-${relation.id}`,
        attackerCampId: relation.fromCampId,
        defenderCampId: relation.toCampId,
        intensity: clamp(Math.max(relation.strength, Math.abs(relation.warScore) > 1 ? Math.abs(relation.warScore) / 100 : Math.abs(relation.warScore), 0.2), 0, 1),
      })),
  };
}

function Meter({ label, value, color, icon }: { label: string; value: number; color: string; icon: React.ReactNode }) {
  const safeValue = percent(value);
  return (
    <div>
      <div className="sov-meter-label"><span>{icon}{label}</span><span>{Math.round(safeValue)}%</span></div>
      <div className="sov-meter-track" aria-hidden="true"><span style={{ width: `${safeValue}%`, background: color }} /></div>
    </div>
  );
}

function DataCell({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="sov-data-cell"><span>{label}</span><b>{value}</b></div>;
}

function CivilizationCanvas({
  worldRef,
  selection,
  cameraMode,
  onSnapshot,
  onAgentSelect,
  onCampSelect,
  onBeliefSelect,
  onCameraModeChange,
}: {
  worldRef: MutableRefObject<CivilizationWorldState>;
  selection: Selection;
  cameraMode: CameraMode;
  onSnapshot(world: CivilizationWorldState): void;
  onAgentSelect(id: string): void;
  onCampSelect(id: string): void;
  onBeliefSelect(id: string): void;
  onCameraModeChange(mode: CameraMode): void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef(selection);
  const cameraRef = useRef(cameraMode);

  useEffect(() => { selectionRef.current = selection; }, [selection]);
  useEffect(() => { cameraRef.current = cameraMode; }, [cameraMode]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let controller: ReturnType<typeof createCivilizationScene>;
    try {
      controller = createCivilizationScene(mount, toVisualWorld(worldRef.current), {
        onAgentSelect,
        onCampSelect,
        onBeliefSelect,
        onCameraModeChange,
        reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      });
    } catch {
      mount.dataset.webglError = "true";
      return;
    }

    let frameId = 0;
    let previous = performance.now();
    let publishClock = 0;
    let simulationClock = 0;
    let sourceWorld = worldRef.current;
    let visualWorld = toVisualWorld(sourceWorld);
    const frame = (now: number) => {
      const delta = Math.min(0.1, Math.max(0, (now - previous) / 1_000));
      previous = now;
      simulationClock += delta;
      if (simulationClock >= FIXED_STEP) {
        worldRef.current = simulateCivilization(worldRef.current, simulationClock);
        simulationClock = 0;
      }
      if (sourceWorld !== worldRef.current) {
        sourceWorld = worldRef.current;
        visualWorld = toVisualWorld(sourceWorld);
      }
      const active = selectionRef.current;
      visualWorld.selectedBeliefId = active.kind === "belief" ? active.id : null;
      controller.update(
        visualWorld,
        active.kind === "agent" ? active.id : null,
        active.kind === "camp" ? active.id : null,
        cameraRef.current,
        delta,
      );
      publishClock += delta;
      if (publishClock >= 0.22) {
        publishClock = 0;
        onSnapshot(worldRef.current);
      }
      frameId = requestAnimationFrame(frame);
    };
    frameId = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(frameId);
      controller.dispose();
    };
  }, [onAgentSelect, onBeliefSelect, onCampSelect, onCameraModeChange, onSnapshot, worldRef]);

  return (
    <div ref={mountRef} className="sov-world" aria-label="Live three-dimensional autonomous civilization map">
      <div className="sov-world-fallback"><Leaf size={18} /><span>This living map needs WebGL to render.</span></div>
    </div>
  );
}

function AgentInspector({ world, agent }: { world: CivilizationWorldState; agent: CivilizationAgent }) {
  const camp = world.camps.find((candidate) => candidate.id === agent.campId);
  const belief = world.beliefs.find((candidate) => candidate.id === agent.beliefId);
  const parents = agent.parentIds.map((id) => world.agents.find((candidate) => candidate.id === id)?.name).filter(Boolean).join(" + ");
  const relationshipEntries = Object.entries(agent.relationships)
    .sort(([, left], [, right]) => (right.trust + right.respect - right.grievance) - (left.trust + left.respect - left.grievance))
    .slice(0, 3);
  return (
    <div className="sov-inspector-scroll">
      <div>
        <div className="sov-identity">
          <div className="sov-identity-mark">{initials(agent.name)}</div>
          <div><h1>{agent.name}</h1><p>Generation {agent.generation} · {getCampName(world, agent.campId)}</p></div>
          <span className="sov-status-chip"><CircleDot size={9} />{agent.alive ? getActionLabel(agent.action) : "Fallen"}</span>
        </div>
        <div className="sov-decision">
          <div className="sov-decision-label"><Activity size={12} /> AUTONOMOUS PLAN</div>
          <p>{agent.rationale}</p>
          <div className="sov-detail-line"><span>GOAL</span><b>{agent.goal}</b></div>
          <div className="sov-detail-line"><span>FATE</span><b>{agent.currentPlan ? humanize(String(agent.currentPlan)) : "Reassessing the world"}</b></div>
        </div>
        <div className="sov-metrics">
          <Meter label="Health" value={agent.health} color={agent.health < 35 ? "#ff8066" : agent.color} icon={<Heart size={10} />} />
          <Meter label="Nourished" value={agent.hunger} color="#e7b95e" icon={<Wheat size={10} />} />
          <Meter label="Hydration" value={agent.hydration} color="#66d7d1" icon={<Droplets size={10} />} />
          <Meter label="Energy" value={agent.energy} color="#b99cff" icon={<Zap size={10} />} />
        </div>
      </div>
      <div>
        <section className="sov-section sov-belief-section" style={{ "--belief-color": belief?.color ?? "#718078" } as CSSProperties}>
          <div className="sov-section-head"><span className="sov-kicker">Chosen worldview</span><Compass size={13} /></div>
          <div className="sov-belief-summary">
            <span className="sov-belief-glyph" aria-hidden="true"><i /></span>
            <div><b>{belief?.name ?? "Secular path"}</b><p>{belief ? `${Math.round(percent(agent.conviction))}% conviction · joined day ${Math.max(1, agent.lastBeliefChangeDay).toFixed(0)}` : "No doctrine adopted; this agent may remain secular or respond to a future movement."}</p></div>
          </div>
          {belief && <div className="sov-tenet-list">{belief.tenets.map((tenet) => <span key={tenet}>{BELIEF_TENET_LABELS[tenet]}</span>)}</div>}
        </section>
        <section className="sov-section">
          <div className="sov-section-head"><span className="sov-kicker">Power & allegiance</span><b>{Math.round(agent.personalPower)} PWR</b></div>
          <div className="sov-data-grid">
            <DataCell label="Influence" value={Math.round(agent.influence)} />
            <DataCell label="Knowledge" value={Math.round(agent.knowledge)} />
            <DataCell label="Belief influence" value={Math.round(agent.spiritualInfluence)} />
            <DataCell label="Loyalty" value={`${Math.round(percent(agent.loyalty))}%`} />
            <DataCell label="Satisfaction" value={`${Math.round(percent(agent.satisfaction))}%`} />
          </div>
        </section>
        <section className="sov-section">
          <div className="sov-section-head"><span className="sov-kicker">Lineage & record</span><Baby size={13} /></div>
          <div className="sov-data-grid">
            <DataCell label="Age" value={`${agent.age.toFixed(1)} world days`} />
            <DataCell label="Parents" value={parents || "Founder-born"} />
            <DataCell label="Offspring" value={agent.childrenIds.length} />
            <DataCell label="Camp tenure" value={`${Math.max(0, world.day - agent.joinedCampDay).toFixed(1)} days`} />
            <DataCell label="Victories" value={agent.kills} />
            <DataCell label="Harvested" value={compactNumber(agent.harvested)} />
          </div>
        </section>
        <section className="sov-section">
          <div className="sov-section-head"><span className="sov-kicker">Pack</span><Package size={13} /></div>
          <div className="sov-data-grid">
            <DataCell label="Food" value={Math.round(agent.inventory.food)} />
            <DataCell label="Water" value={Math.round(agent.inventory.water)} />
            <DataCell label="Wood" value={Math.round(agent.inventory.wood)} />
            <DataCell label="Ore" value={Math.round(agent.inventory.ore)} />
          </div>
        </section>
        {relationshipEntries.length > 0 && <section className="sov-section">
          <div className="sov-section-head"><span className="sov-kicker">Strongest bonds</span><Users size={13} /></div>
          <div className="sov-relations">{relationshipEntries.map(([id, relationship]) => {
            const other = world.agents.find((candidate) => candidate.id === id);
            const score = relationship.trust + relationship.respect - relationship.grievance;
            return <div className="sov-relation" key={id} style={{ "--relation-color": score >= 0 ? "#c7f36a" : "#ff8066" } as CSSProperties}><i /><span>{other?.name ?? "Unknown agent"}</span><em>{score >= 0 ? "Bond" : "Rival"} {Math.round(Math.abs(score) * 100)}</em></div>;
          })}</div>
        </section>}
        {!camp && <section className="sov-section"><div className="sov-principle"><div><Shield size={12} /> BETWEEN ALLEGIANCES</div><p>This agent may join a power, found a breakaway camp, or remain independent.</p></div></section>}
      </div>
    </div>
  );
}

function CampInspector({ world, camp }: { world: CivilizationWorldState; camp: CivilizationCamp }) {
  const leader = world.agents.find((agent) => agent.id === camp.leaderId);
  const dominantBelief = world.beliefs.find((belief) => belief.id === camp.dominantBeliefId);
  const structures = Object.entries(camp.structures as unknown as LooseStructures).filter(([, level]) => (level ?? 0) > 0);
  const relations = world.relations.map(relationView).filter((relation) => relation.fromCampId === camp.id || relation.toCampId === camp.id);
  const stock = camp.storage.food + camp.storage.water + camp.storage.wood + camp.storage.ore;
  const researchCost = camp.researchTarget ? TECHNOLOGY_TREE[camp.researchTarget].cost : 1;
  return (
    <div className="sov-inspector-scroll">
      <div>
        <div className="sov-identity">
          <div className="sov-identity-mark"><Tent size={18} /></div>
          <div><h1>{camp.name}</h1><p>Founded day {camp.foundedDay.toFixed(0)} · {camp.memberIds.length} citizens</p></div>
          <span className="sov-status-chip"><Crown size={9} />{camp.active ? `#${getRankedCamps(world).findIndex((item) => item.id === camp.id) + 1}` : "Fallen"}</span>
        </div>
        <div className="sov-decision">
          <div className="sov-decision-label"><Crown size={12} /> POWER DOCTRINE</div>
          <p>{camp.researchTarget ? `Knowledge is being directed toward ${getTechnologyLabel(camp.researchTarget)} while the camp balances survival, loyalty, and expansion.` : "The camp is consolidating its resources and allowing members to choose the next advantage."}</p>
          <div className="sov-detail-line"><span>LEADER</span><b>{leader?.name ?? "Leadership contested"}</b></div>
          <div className="sov-detail-line"><span>ORIGIN</span><b>{camp.parentCampId ? `Breakaway from ${getCampName(world, camp.parentCampId)}` : "Independent founding power"}</b></div>
        </div>
        <div className="sov-metrics">
          <Meter label="Cohesion" value={camp.cohesion} color={percent(camp.cohesion) < 35 ? "#ff8066" : camp.color} icon={<Users size={10} />} />
          <Meter label="Territory" value={camp.territoryRadius / 0.42} color="#c7f36a" icon={<MapIcon size={10} />} />
          <Meter label="Economic" value={camp.economicPower} color="#e7b95e" icon={<Wheat size={10} />} />
          <Meter label="Military" value={camp.militaryPower} color="#ff8066" icon={<Swords size={10} />} />
        </div>
      </div>
      <div>
        <section className="sov-section">
          <div className="sov-section-head"><span className="sov-kicker">Power structure</span><b>{Math.round(camp.power)} PWR</b></div>
          <div className="sov-data-grid">
            <DataCell label="Population" value={camp.memberIds.length} />
            <DataCell label="Territory" value={`${camp.territoryRadius.toFixed(1)} km²`} />
            <DataCell label="Knowledge" value={Math.round(camp.knowledgePower)} />
            <DataCell label="Stores" value={compactNumber(stock)} />
            <DataCell label="Worldview" value={dominantBelief?.name ?? getBeliefName(world, camp.dominantBeliefId)} />
            <DataCell label="Belief diversity" value={`${Math.round(percent(camp.beliefDiversity))}%`} />
            <DataCell label="Victories" value={camp.victories} />
            <DataCell label="Losses" value={camp.losses} />
          </div>
        </section>
        <section className="sov-section sov-belief-section" style={{ "--belief-color": dominantBelief?.color ?? "#718078" } as CSSProperties}>
          <div className="sov-section-head"><span className="sov-kicker">Belief landscape</span><Sparkles size={13} /></div>
          <div className="sov-belief-summary">
            <span className="sov-belief-glyph" aria-hidden="true"><i /></span>
            <div><b>{dominantBelief?.name ?? "No dominant belief"}</b><p>{camp.shrineLevel > 0 ? `Tier ${camp.shrineLevel} gathering site · beliefs may strengthen unity or seed dissent.` : "Citizens decide individually; no shared gathering site has been raised."}</p></div>
          </div>
          {dominantBelief && <div className="sov-tenet-list">{dominantBelief.tenets.map((tenet) => <span key={tenet}>{BELIEF_TENET_LABELS[tenet]}</span>)}</div>}
        </section>
        <section className="sov-section">
          <div className="sov-section-head"><span className="sov-kicker">Technology</span><BookOpen size={13} /></div>
          <div className="sov-tech-track"><span style={{ width: `${clamp((camp.researchProgress / researchCost) * 100)}%` }} /></div>
          <div className="sov-tech-list">
            {camp.technologies.length > 0 ? camp.technologies.map((technology) => <span key={technology}>{getTechnologyLabel(technology)}</span>) : <span>Oral knowledge</span>}
            {camp.researchTarget && <span>Researching: {getTechnologyLabel(camp.researchTarget)}</span>}
          </div>
        </section>
        <section className="sov-section">
          <div className="sov-section-head"><span className="sov-kicker">Settlement</span><Tent size={13} /></div>
          <div className="sov-data-grid">
            {structures.length > 0 ? structures.map(([kind, level]) => <DataCell key={kind} label={humanize(kind)} value={`Tier ${level}`} />) : <DataCell label="Campfire" value="Foundational" />}
          </div>
        </section>
        <section className="sov-section">
          <div className="sov-section-head"><span className="sov-kicker">Diplomacy</span><Shield size={13} /></div>
          <div className="sov-relations">
            {relations.length > 0 ? relations.map((relation) => {
              const otherId = relation.fromCampId === camp.id ? relation.toCampId : relation.fromCampId;
              const other = world.camps.find((candidate) => candidate.id === otherId);
              const color = relationColor(relation.status);
              return <div className="sov-relation" key={relation.id} style={{ "--relation-color": color } as CSSProperties}><i /><span>{other?.name ?? "Unknown power"}</span><em>{relationLabel(relation.status)}</em></div>;
            }) : <div className="sov-relation"><i /><span>No binding pacts</span><em>Independent</em></div>}
          </div>
        </section>
      </div>
    </div>
  );
}

function BeliefInspector({ world, belief }: { world: CivilizationWorldState; belief: CivilizationBeliefSystem }) {
  const founder = world.agents.find((agent) => agent.id === belief.founderAgentId);
  const origin = world.camps.find((camp) => camp.id === belief.originCampId);
  const parent = world.beliefs.find((candidate) => candidate.id === belief.parentBeliefId);
  const livingAdherents = belief.adherentIds.filter((id) => world.agents.some((agent) => agent.id === id && agent.alive)).length;
  const activeCampIds = new Set(world.camps.filter((camp) => camp.active).map((camp) => camp.id));
  const activeCampReach = belief.campIds.filter((id) => activeCampIds.has(id)).length;
  const totalLiving = Math.max(1, world.agents.filter((agent) => agent.alive).length);
  const totalCamps = Math.max(1, activeCampIds.size);
  const influenceCeiling = Math.max(1, ...world.beliefs.filter((candidate) => candidate.active).map((candidate) => candidate.influence));
  const tenetStory = belief.tenets.map((tenet) => BELIEF_TENET_LABELS[tenet].toLowerCase()).join(", ");
  return (
    <div className="sov-inspector-scroll">
      <div>
        <div className="sov-identity">
          <div className="sov-identity-mark sov-identity-belief"><span className="sov-belief-glyph" aria-hidden="true"><i /></span></div>
          <div><h1>{belief.name}</h1><p>Founded day {belief.foundedDay.toFixed(0)} · {livingAdherents} living adherents</p></div>
          <span className="sov-status-chip"><CircleDot size={9} />{belief.active ? "Evolving" : "Faded"}</span>
        </div>
        <div className="sov-decision">
          <div className="sov-decision-label"><Sparkles size={12} /> EMERGENT WORLDVIEW</div>
          <p>This movement formed from lived conditions around {tenetStory || "shared meaning"}. No agent was assigned it; each may embrace, reinterpret, abandon, or oppose it.</p>
          <div className="sov-detail-line"><span>FOUNDER</span><b>{founder?.name ?? "Remembered founder"}</b></div>
          <div className="sov-detail-line"><span>ORIGIN</span><b>{origin?.name ?? "Beyond a surviving camp"}</b></div>
        </div>
        <div className="sov-metrics">
          <Meter label="Influence" value={belief.influence / influenceCeiling} color={belief.color} icon={<Sparkles size={10} />} />
          <Meter label="Unity" value={belief.unity} color="#c7f36a" icon={<Users size={10} />} />
          <Meter label="Population reach" value={livingAdherents / totalLiving} color="#cf9df2" icon={<CircleDot size={10} />} />
          <Meter label="Camp reach" value={activeCampReach / totalCamps} color="#66d7d1" icon={<Tent size={10} />} />
        </div>
      </div>
      <div>
        <section className="sov-section sov-belief-section" style={{ "--belief-color": belief.color } as CSSProperties}>
          <div className="sov-section-head"><span className="sov-kicker">Living tenets</span><Compass size={13} /></div>
          <div className="sov-tenet-list prominent">{belief.tenets.map((tenet) => <span key={tenet}>{BELIEF_TENET_LABELS[tenet]}</span>)}</div>
          <p className="sov-section-note">Tenets shift the incentives agents weigh for aid, stewardship, research, expansion, duty, freedom, or conflict.</p>
        </section>
        <section className="sov-section">
          <div className="sov-section-head"><span className="sov-kicker">Movement record</span><ScrollText size={13} /></div>
          <div className="sov-data-grid">
            <DataCell label="Living adherents" value={livingAdherents} />
            <DataCell label="Active camps" value={activeCampReach} />
            <DataCell label="Reformations" value={belief.reformationCount} />
            <DataCell label="Schisms" value={belief.schismCount} />
            <DataCell label="Parent belief" value={parent?.name ?? "Original movement"} />
            <DataCell label="Sacred site" value={`${belief.sacredSite.x.toFixed(0)}, ${belief.sacredSite.z.toFixed(0)}`} />
          </div>
        </section>
        <section className="sov-section">
          <div className="sov-section-head"><span className="sov-kicker">Autonomous fate</span><Activity size={13} /></div>
          <div className="sov-principle"><div><Sparkles size={12} /> NO FIXED DESTINY</div><p>Survival, kinship, camp politics, alliances, war, and knowledge can spread this belief—or fracture it into something new.</p></div>
        </section>
      </div>
    </div>
  );
}

export function SovereigntyExperience() {
  const [initialWorld] = useState(() => createCivilizationWorld(INITIAL_SEED));
  const worldRef = useRef<CivilizationWorldState>(initialWorld);
  const [hud, setHud] = useState(initialWorld);
  const [selection, setSelection] = useState<Selection>({ kind: "agent", id: initialWorld.agents[0]?.id ?? "" });
  const [rosterMode, setRosterMode] = useState<RosterMode>("powers");
  const [cameraMode, setCameraMode] = useState<CameraMode>("overview");
  const [eventFilter, setEventFilter] = useState<EventFilter>("all");
  const [chronicleExpanded, setChronicleExpanded] = useState(false);
  const [syncState, setSyncState] = useState<SyncState>("connecting");
  const [history, setHistory] = useState<MajorEvent[]>(initialWorld.majorEvents);
  const [revision, setRevision] = useState(0);
  const [catchUpPendingSeconds, setCatchUpPendingSeconds] = useState(0);

  const rankedCamps = useMemo(() => getRankedCamps(hud).filter((camp) => camp.active), [hud]);
  const rankedAgents = useMemo(() => getRankedAgents(hud), [hud]);
  const beliefRanking = useMemo(() => getRankedBeliefs(hud).filter((belief) => belief.active), [hud]);
  const aliveAgents = rankedAgents.filter((agent) => agent.alive);
  const activeCamps = rankedCamps.length;
  const activeBeliefs = beliefRanking.length;
  const relationViews = useMemo(() => hud.relations.map(relationView), [hud.relations]);
  const wars = relationViews.filter((relation) => relation.status === "war");
  const topCamp = rankedCamps[0];
  const selectedAgent = selection.kind === "agent" ? hud.agents.find((agent) => agent.id === selection.id) : undefined;
  const selectedCamp = selection.kind === "camp" ? hud.camps.find((camp) => camp.id === selection.id) : undefined;
  const selectedBelief = selection.kind === "belief" ? hud.beliefs.find((belief) => belief.id === selection.id) : undefined;
  const accent = selectedAgent?.color ?? selectedCamp?.color ?? selectedBelief?.color ?? topCamp?.color ?? "#c7f36a";

  const publishSnapshot = useCallback((world: CivilizationWorldState) => setHud(world), []);
  const selectAgent = useCallback((id: string) => {
    setSelection({ kind: "agent", id });
    setCameraMode("followAgent");
  }, []);
  const selectCamp = useCallback((id: string) => {
    setSelection({ kind: "camp", id });
    setCameraMode("followCamp");
  }, []);
  const selectBelief = useCallback((id: string) => {
    setSelection({ kind: "belief", id });
    setRosterMode("beliefs");
    setCameraMode("overview");
  }, []);

  const moveRosterFocus = useCallback((event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const currentIndex = ROSTER_MODES.indexOf(rosterMode);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? ROSTER_MODES.length - 1
        : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + ROSTER_MODES.length) % ROSTER_MODES.length;
    const nextMode = ROSTER_MODES[nextIndex];
    setRosterMode(nextMode);
    event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`#sov-tab-${nextMode}`)?.focus();
  }, [rosterMode]);

  const cycleSelection = useCallback((direction: number, forceAgents = false) => {
    const list = forceAgents || selection.kind === "agent"
      ? getRankedAgents(worldRef.current).filter((agent) => agent.alive)
      : selection.kind === "camp"
        ? getRankedCamps(worldRef.current).filter((camp) => camp.active)
        : getRankedBeliefs(worldRef.current).filter((belief) => belief.active);
    if (!list.length) return;
    const current = list.findIndex((item) => item.id === selection.id);
    const next = (Math.max(0, current) + direction + list.length) % list.length;
    if (forceAgents || selection.kind === "agent") selectAgent(list[next].id);
    else if (selection.kind === "camp") selectCamp(list[next].id);
    else selectBelief(list[next].id);
  }, [selectAgent, selectBelief, selectCamp, selection]);

  useEffect(() => {
    let disposed = false;
    let controller: AbortController | undefined;
    const sync = async () => {
      controller?.abort();
      controller = new AbortController();
      try {
        const response = await fetch("/api/world", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("World feed unavailable");
        const payload = await response.json() as WorldResponse;
        const world = normalizeCivilizationWorld(payload.world, INITIAL_SEED);
        if (disposed) return;
        worldRef.current = world;
        setHud(world);
        setHistory(payload.history?.length ? payload.history : world.majorEvents);
        setRevision(payload.revision ?? 0);
        setCatchUpPendingSeconds(Math.max(0, payload.catchUpPendingSeconds ?? 0));
        setSyncState(payload.persistent ? payload.caughtUp === false ? "catching_up" : "persistent" : "reconnecting");
        setSelection((current) => {
          const exists = current.kind === "agent"
            ? world.agents.some((agent) => agent.id === current.id)
            : current.kind === "camp"
              ? world.camps.some((camp) => camp.id === current.id && camp.active)
              : world.beliefs.some((belief) => belief.id === current.id && belief.active);
          return exists ? current : { kind: "agent", id: world.agents.find((agent) => agent.alive)?.id ?? world.agents[0]?.id ?? "" };
        });
      } catch (error) {
        if (!disposed && !(error instanceof DOMException && error.name === "AbortError")) setSyncState("reconnecting");
      }
    };
    void sync();
    const interval = window.setInterval(() => void sync(), POLL_INTERVAL);
    return () => {
      disposed = true;
      controller?.abort();
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
      if (event.key === "[") cycleSelection(-1, true);
      else if (event.key === "]") cycleSelection(1, true);
      else if (event.key.toLowerCase() === "f" && selection.kind === "agent") setCameraMode("followAgent");
      else if (event.key.toLowerCase() === "c" && selection.kind === "camp") setCameraMode("followCamp");
      else if (event.key.toLowerCase() === "b" && selection.kind === "belief") setCameraMode("overview");
      else if (event.key === "Escape") setCameraMode("overview");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cycleSelection, selection.kind]);

  const mergedEvents = useMemo(() => {
    const byId = new Map<string, MajorEvent>();
    [...history, ...hud.majorEvents].forEach((event) => byId.set(eventView(event).id, event));
    return [...byId.values()]
      .map(eventView)
      .filter((event) => eventMatches(event.type, eventFilter))
      .sort((left, right) => right.time - left.time || right.day - left.day)
      .slice(0, chronicleExpanded ? 200 : 9);
  }, [chronicleExpanded, eventFilter, history, hud.majorEvents]);

  const latestMajor = useMemo(() => {
    const candidates = [...history, ...hud.majorEvents].map(eventView).sort((left, right) => right.time - left.time || right.day - left.day);
    return candidates[0];
  }, [history, hud.majorEvents]);

  const style = { "--sov-accent": accent, "--leader-color": topCamp?.color ?? "#c7f36a" } as CSSProperties;
  const syncLabel = syncState === "persistent"
    ? `PERSISTENT · R${revision}`
    : syncState === "catching_up"
      ? `CATCHING UP · ${compactDuration(catchUpPendingSeconds)}`
      : syncState === "connecting"
        ? "CONNECTING"
        : "LOCAL · RECONNECTING";

  return (
    <main className="sov-shell" style={style}>
      <CivilizationCanvas worldRef={worldRef} selection={selection} cameraMode={cameraMode} onSnapshot={publishSnapshot} onAgentSelect={selectAgent} onCampSelect={selectCamp} onBeliefSelect={selectBelief} onCameraModeChange={setCameraMode} />
      <div className="sov-atmosphere" aria-hidden="true" />

      <header className="sov-topbar">
        <div className="sov-brand">
          <span className="sov-brand-mark"><Leaf size={16} /></span>
          <div><div className="sov-brand-name">WILDGRID <span>SOVEREIGNTY</span></div><div className="sov-brand-sub">200 × 200 autonomous frontier</div></div>
        </div>
        <div className="sov-top-stats" aria-label="World status">
          <div className="sov-stat"><span>World time</span><b>{getWorldTimeLabel(hud)}</b></div>
          <div className="sov-stat"><span>Population</span><b><Users size={11} />{aliveAgents.length}</b></div>
          <div className="sov-stat"><span>Active powers</span><b><Tent size={11} />{activeCamps}</b></div>
          <div className="sov-stat"><span>Living beliefs</span><b><Sparkles size={11} />{activeBeliefs}</b></div>
          <div className="sov-stat"><span>Open wars</span><b><Swords size={11} />{wars.length}</b></div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className={`sov-live ${syncState === "persistent" ? "" : "reconnecting"}`} title={syncState === "catching_up" ? "The durable world is checkpointing an offline interval; each refresh continues from the last completed checkpoint." : "The shared world reconciles elapsed time on the server and resumes from durable state"}><span className="sov-live-dot" />{syncLabel}</span>
          <div className="sov-camera" aria-label="Camera mode">
            <button className={cameraMode === "overview" ? "active" : ""} onClick={() => setCameraMode("overview")} aria-label="Overview camera" aria-pressed={cameraMode === "overview"} title="World overview (Esc)"><MapIcon size={14} /></button>
            <button className={cameraMode === "followAgent" ? "active" : ""} onClick={() => selectedAgent && setCameraMode("followAgent")} aria-label="Follow selected agent" aria-pressed={cameraMode === "followAgent"} title="Follow selected AI (F)"><Focus size={14} /></button>
            <button className={cameraMode === "followCamp" ? "active" : ""} onClick={() => selectedCamp && setCameraMode("followCamp")} aria-label="Focus selected camp" aria-pressed={cameraMode === "followCamp"} title="Focus selected camp (C)"><Tent size={14} /></button>
            <button className={cameraMode === "free" ? "active" : ""} onClick={() => setCameraMode("free")} aria-label="Free orbit camera" aria-pressed={cameraMode === "free"} title="Free orbit"><Eye size={14} /></button>
          </div>
        </div>
      </header>

      {topCamp && <div className="sov-leader-ribbon"><Crown size={11} /> #1 {topCamp.name.toUpperCase()} <span>{Math.round(topCamp.power)} power · {topCamp.memberIds.length} citizens · {worldEra(hud)}</span></div>}

      <aside className="sov-left sov-panel" aria-label="Civilization roster">
        <div className="sov-panel-head"><div><span className="sov-kicker">Power, people & meaning</span><h2>World roster</h2></div><span className="sov-count-chip">{activeCamps}/{MAX_ACTIVE_CAMPS} CAMPS</span></div>
        <div className="sov-tabs" role="tablist" aria-label="Roster view">
          {ROSTER_MODES.map((mode) => <button id={`sov-tab-${mode}`} key={mode} className={rosterMode === mode ? "active" : ""} onClick={() => setRosterMode(mode)} onKeyDown={moveRosterFocus} aria-controls="sov-roster-panel" aria-selected={rosterMode === mode} role="tab" tabIndex={rosterMode === mode ? 0 : -1}>{humanize(mode)}</button>)}
        </div>
        <div className="sov-roster" id="sov-roster-panel" role="tabpanel" aria-labelledby={`sov-tab-${rosterMode}`}>
          {rosterMode === "powers" ? rankedCamps.map((camp, index) => {
            const active = selection.kind === "camp" && selection.id === camp.id;
            const powerWidth = topCamp ? clamp((camp.power / Math.max(1, topCamp.power)) * 100) : 0;
            const campRelations = relationViews.filter((relation) => relation.fromCampId === camp.id || relation.toCampId === camp.id);
            const atWar = campRelations.some((relation) => relation.status === "war");
            return <button key={camp.id} className={`sov-power-card ${active ? "active" : ""}`} style={{ "--card-color": camp.color, "--power-width": `${powerWidth}%` } as CSSProperties} onClick={() => selectCamp(camp.id)} aria-pressed={active}>
              <span className="sov-power-rank">{String(index + 1).padStart(2, "0")}</span>
              <span className="sov-card-copy"><span className="sov-card-title">{camp.name}</span><span className="sov-card-meta">{camp.memberIds.length} citizens · {camp.technologies.length} tech · {atWar ? "at war" : `${Math.round(percent(camp.cohesion))}% cohesion`}</span></span>
              <span className="sov-card-value">{compactNumber(camp.power)}<small>POWER</small></span>
            </button>;
          }) : rosterMode === "agents" ? aliveAgents.map((agent, index) => {
            const active = selection.kind === "agent" && selection.id === agent.id;
            const topAgentPower = Math.max(1, aliveAgents[0]?.personalPower ?? 1);
            return <button key={agent.id} className={`sov-agent-card ${active ? "active" : ""} ${agent.alive ? "" : "inactive"}`} style={{ "--card-color": agent.color, "--power-width": `${clamp((agent.personalPower / topAgentPower) * 100)}%` } as CSSProperties} onClick={() => selectAgent(agent.id)} aria-pressed={active}>
              <span className="sov-agent-token">{initials(agent.name)}</span>
              <span className="sov-card-copy"><span className="sov-card-title">{agent.name}</span><span className="sov-card-meta">#{index + 1} · {getCampName(hud, agent.campId)} · {agent.alive ? getActionLabel(agent.action) : "fallen"}</span></span>
              <span className="sov-card-value">{compactNumber(agent.personalPower)}<small>POWER</small></span>
            </button>;
          }) : beliefRanking.length > 0 ? beliefRanking.map((belief, index) => {
            const active = selection.kind === "belief" && selection.id === belief.id;
            const strongestBelief = Math.max(1, beliefRanking[0]?.influence ?? 1);
            const livingAdherents = belief.adherentIds.filter((id) => hud.agents.some((agent) => agent.id === id && agent.alive)).length;
            return <button key={belief.id} className={`sov-belief-card ${active ? "active" : ""}`} style={{ "--card-color": belief.color, "--belief-color": belief.color, "--power-width": `${clamp((belief.influence / strongestBelief) * 100)}%` } as CSSProperties} onClick={() => selectBelief(belief.id)} aria-pressed={active}>
              <span className="sov-agent-token sov-belief-token"><span className="sov-belief-glyph" aria-hidden="true"><i /></span></span>
              <span className="sov-card-copy"><span className="sov-card-title">{belief.name}</span><span className="sov-card-meta">#{index + 1} · {livingAdherents} adherents · {belief.tenets.map((tenet) => BELIEF_TENET_LABELS[tenet]).join(" / ")}</span></span>
              <span className="sov-card-value">{compactNumber(belief.influence)}<small>INFLUENCE</small></span>
            </button>;
          }) : <div className="sov-empty sov-belief-empty"><Sparkles size={16} /><span>No religion or belief system has formed yet. Agents may create one when lived conditions make shared meaning useful.</span></div>}
        </div>
        <div className="sov-principle"><div><Shield size={12} /> ONE DIRECTIVE</div><p>Become the strongest power. Religions, civic traditions, or secular worldviews can emerge from incentives—none are assigned alongside personality scripts or fixed destinies.</p></div>
      </aside>

      <aside className="sov-inspector sov-panel" aria-label={selectedAgent ? `Observed AI: ${selectedAgent.name}` : selectedCamp ? `Observed power: ${selectedCamp.name}` : selectedBelief ? `Observed belief: ${selectedBelief.name}` : "World observer"}>
        <div className="sov-inspector-nav"><button onClick={() => cycleSelection(-1)} aria-label="Previous selection" title="Previous selection ([)"><ChevronLeft size={16} /></button><span>{selection.kind === "agent" ? "OBSERVING AUTONOMOUS AI" : selection.kind === "camp" ? "OBSERVING SOVEREIGN POWER" : "OBSERVING EMERGENT BELIEF"}</span><button onClick={() => cycleSelection(1)} aria-label="Next selection" title="Next selection (])"><ChevronRight size={16} /></button></div>
        {selectedAgent ? <AgentInspector world={hud} agent={selectedAgent} /> : selectedCamp ? <CampInspector world={hud} camp={selectedCamp} /> : selectedBelief ? <BeliefInspector world={hud} belief={selectedBelief} /> : <div className="sov-empty">Select an agent, camp, or belief to inspect its evolving strategy.</div>}
      </aside>

      <section className={`sov-chronicle sov-panel ${chronicleExpanded ? "expanded" : ""}`} aria-label="Persistent world chronicle">
        <div className="sov-chronicle-head">
          <div className="sov-chronicle-title"><ScrollText size={13} /> World chronicle</div>
          <div className="sov-event-filters">{(["all", "power", "war", "lineage", "technology", "belief"] as EventFilter[]).map((filter) => <button key={filter} className={eventFilter === filter ? "active" : ""} onClick={() => setEventFilter(filter)} aria-pressed={eventFilter === filter}>{filter}</button>)}</div>
          <button className="sov-chronicle-toggle" onClick={() => setChronicleExpanded((open) => !open)} aria-label={chronicleExpanded ? "Collapse world chronicle" : "Expand world chronicle"} aria-expanded={chronicleExpanded}>{chronicleExpanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}</button>
        </div>
        <div className="sov-event-stream">
          {mergedEvents.length > 0 ? mergedEvents.map((event) => {
            const color = eventColor(event.type, event.tone);
            return <article className="sov-event" key={event.id} style={{ "--event-color": color } as CSSProperties}><span className="sov-event-node" /><p><strong>{event.title}</strong>{event.message}</p><time>DAY {Math.max(1, Math.floor(event.day))}</time></article>;
          }) : <div className="sov-empty">The world is young. Major decisions will be recorded here permanently.</div>}
        </div>
      </section>

      <div className="sov-map-key" aria-hidden="true"><span><i style={{ "--key-color": "#e7b95e" } as CSSProperties} />Food</span><span><i style={{ "--key-color": "#66d7d1" } as CSSProperties} />Water</span><span><i style={{ "--key-color": "#94be75" } as CSSProperties} />Wood</span><span><i style={{ "--key-color": "#b9a8c8" } as CSSProperties} />Ore</span><span><i className="belief" style={{ "--key-color": "#cf9df2" } as CSSProperties} />Sacred site</span></div>
      <div className="sov-screen-reader-status" aria-live="polite">{latestMajor ? `${latestMajor.title}: ${latestMajor.message}` : "Ten founders are establishing independent camps."}</div>
    </main>
  );
}
