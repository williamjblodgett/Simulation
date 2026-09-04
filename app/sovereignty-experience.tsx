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
  Brain,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Compass,
  Crown,
  Droplets,
  Eye,
  Focus,
  GitBranch,
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
  Trophy,
  Users,
  Wheat,
  X,
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
  getRankedInfluentialAgents,
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
  type MapOverlayMode,
  type MapRelationSelection,
  type VisualWorld,
} from "./simulation/civilization-scene";

const INITIAL_SEED = 2_846_731;
const POLL_INTERVAL = 4_000;
const ROSTER_MODES = ["powers", "agents", "influence", "beliefs"] as const;
const MAP_OVERLAY_OPTIONS: ReadonlyArray<{
  mode: MapOverlayMode;
  label: string;
  shortcut: string;
  description: string;
}> = [
  { mode: "world", label: "World", shortcut: "1", description: "Show the complete living world" },
  { mode: "alliances", label: "Alliances", shortcut: "2", description: "Trace alliances, trade routes, and truces" },
  { mode: "wars", label: "Wars", shortcut: "3", description: "Isolate active wars and belligerent camps" },
  { mode: "beliefs", label: "Beliefs", shortcut: "4", description: "Map religions, belief systems, and secular populations" },
  { mode: "territories", label: "Territories", shortcut: "5", description: "Compare exclusive claims and their shared political edges" },
  { mode: "resources", label: "Resources", shortcut: "6", description: "Reveal food, water, wood, and ore deposits" },
];

type RosterMode = "powers" | "agents" | "influence" | "beliefs";
type EventFilter = "all" | "power" | "war" | "lineage" | "technology" | "belief";
type SyncState = "connecting" | "persistent" | "catching_up" | "reconnecting";
type Selection = { kind: "agent" | "camp" | "belief"; id: string };
type MobileSheetTab = "roster" | "inspector" | "chronicle";
type MobileSheetLevel = "collapsed" | "peek" | "open";
type OverlayLegendKind = "dot" | "line" | "area";

const MOBILE_SHEET_TABS: MobileSheetTab[] = ["roster", "inspector", "chronicle"];

interface OverlayLegendItem {
  label: string;
  color: string;
  kind?: OverlayLegendKind;
}

interface OverlayPresentation {
  summary: string;
  legend: OverlayLegendItem[];
}

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
  const rawTrust = raw.trust ?? (status === "alliance" || status === "trade" ? rawStrength : 0);
  const rawTension = raw.tension ?? (status === "war" || status === "hostile" ? rawStrength : 0);
  return {
    id: raw.id ?? `relation-${index}`,
    fromCampId,
    toCampId,
    status,
    strength,
    trust: clamp(rawTrust > 1 ? rawTrust / 100 : rawTrust, 0, 1),
    tension: clamp(rawTension > 1 ? rawTension / 100 : rawTension, 0, 1),
    startedDay: raw.sinceDay ?? raw.startedDay ?? 0,
    warScore: raw.warScore ?? (raw.warScoreA ?? 0) - (raw.warScoreB ?? 0),
    warScoreA: raw.warScoreA ?? 0,
    warScoreB: raw.warScoreB ?? 0,
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
  if (/rename|identity|self.naming/.test(type)) return "#e7b95e";
  if (/break|defect|found|leader|power/.test(type)) return "#e7b95e";
  return "#8c9a91";
}

function eventMatches(type: string, filter: EventFilter) {
  if (filter === "all") return true;
  if (filter === "war") return /war|raid|battle|death|destroy|capture|truce|peace/.test(type);
  if (filter === "lineage") return /birth|offspring|lineage|join|allegiance|defect|break|found|coup|rename|identity/.test(type);
  if (filter === "technology") return /tech|research|discover|build|advance/.test(type);
  if (filter === "belief") return /belief|faith|shrine|schism|reform|conversion/.test(type);
  return /power|leader|camp|capture|coup|victory|found|rename|identity/.test(type);
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

function overlayIcon(mode: MapOverlayMode) {
  if (mode === "alliances") return <Users size={12} />;
  if (mode === "wars") return <Swords size={12} />;
  if (mode === "beliefs") return <Sparkles size={12} />;
  if (mode === "territories") return <Tent size={12} />;
  if (mode === "resources") return <Package size={12} />;
  return <MapIcon size={12} />;
}

function getOverlayPresentation(
  mode: MapOverlayMode,
  world: CivilizationWorldState,
  camps: CivilizationCamp[],
  beliefs: CivilizationBeliefSystem[],
  relations: ReturnType<typeof relationView>[],
): OverlayPresentation {
  const activeCampIds = new Set(camps.map((camp) => camp.id));
  const visibleRelations = relations.filter((relation) => activeCampIds.has(relation.fromCampId) && activeCampIds.has(relation.toCampId));
  const alliances = visibleRelations.filter((relation) => relation.status === "alliance" || relation.status === "allied");
  const tradeRoutes = visibleRelations.filter((relation) => relation.status === "trade" || relation.status === "truce");
  const wars = visibleRelations.filter((relation) => relation.status === "war");
  const belligerentCampIds = new Set(wars.flatMap((war) => [war.fromCampId, war.toCampId]));
  const livingAgents = world.agents.filter((agent) => agent.alive);

  if (mode === "alliances") {
    return {
      summary: `${alliances.length} alliance ${alliances.length === 1 ? "link" : "links"} · ${tradeRoutes.length} trade or truce ${tradeRoutes.length === 1 ? "route" : "routes"}`,
      legend: [
        { label: `Alliances · ${alliances.length}`, color: "#69d8bd", kind: "line" },
        { label: `Trade / truce · ${tradeRoutes.length}`, color: "#f1c66d", kind: "line" },
      ],
    };
  }

  if (mode === "wars") {
    return {
      summary: `${wars.length} active ${wars.length === 1 ? "front" : "fronts"} · ${belligerentCampIds.size} camps committed to war`,
      legend: [
        { label: `War fronts · ${wars.length}`, color: "#f05b54", kind: "line" },
        { label: `Belligerent camps · ${belligerentCampIds.size}`, color: "#ffb06b", kind: "area" },
        { label: `Outside active wars · ${Math.max(0, camps.length - belligerentCampIds.size)}`, color: "#718078", kind: "dot" },
      ],
    };
  }

  if (mode === "beliefs") {
    const topBeliefs = beliefs.slice(0, 5);
    const secularAgents = livingAgents.filter((agent) => !agent.beliefId).length;
    return {
      summary: `${beliefs.length} living belief ${beliefs.length === 1 ? "system" : "systems"} · ${secularAgents} secular or unaffiliated agents`,
      legend: [
        ...topBeliefs.map((belief) => ({
          label: `${belief.name} · ${belief.adherentIds.filter((id) => livingAgents.some((agent) => agent.id === id)).length}`,
          color: belief.color,
          kind: "area" as const,
        })),
        { label: `Secular / unaffiliated · ${secularAgents}`, color: "#8a938d", kind: "dot" },
      ],
    };
  }

  if (mode === "territories") {
    return {
      summary: `${camps.length} exclusive camp ${camps.length === 1 ? "territory" : "territories"} · adjoining claims resolve to one shared edge`,
      legend: [
        ...camps.slice(0, 5).map((camp) => ({
          label: `${camp.name} · claim reach ${Math.round(camp.territoryRadius)}`,
          color: camp.color,
          kind: "area" as const,
        })),
        ...(camps.length > 5 ? [{ label: `${camps.length - 5} more camps`, color: "#718078", kind: "area" as const }] : []),
      ],
    };
  }

  if (mode === "resources") {
    const count = (kind: ResourceKind) => world.resources.filter((resource) => resource.kind === kind).length;
    return {
      summary: `${world.resources.length} renewable resource sites · brighter rings hold more stock`,
      legend: [
        { label: `Food · ${count("food")}`, color: "#f17778" },
        { label: `Water · ${count("water")}`, color: "#64e2f0" },
        { label: `Wood · ${count("wood")}`, color: "#8dd277" },
        { label: `Ore · ${count("ore")}`, color: "#d1dbe4" },
      ],
    };
  }

  return {
    summary: `${camps.length} camps · ${livingAgents.length} autonomous agents · ${world.resources.length} resource sites`,
    legend: [
      { label: `Camps · ${camps.length}`, color: "#c7f36a", kind: "area" },
      { label: `Agents · ${livingAgents.length}`, color: "#f0f3ec" },
      { label: `Beliefs · ${beliefs.length}`, color: "#cf9df2", kind: "area" },
      { label: `Resources · ${world.resources.length}`, color: "#e7b95e" },
    ],
  };
}

function toVisualWorld(
  world: CivilizationWorldState,
  selectedBeliefId: string | null = null,
  overlayMode: MapOverlayMode = "world",
): VisualWorld {
  const activeCampIds = new Set(world.camps.filter((camp) => camp.active).map((camp) => camp.id));
  const relations = world.relations.map(relationView);
  const beliefById = new Map(world.beliefs.map((belief) => [belief.id, belief]));
  return {
    seed: world.seed,
    elapsed: world.time,
    halfSize: world.map.halfSize || WORLD_HALF_SIZE,
    overlayMode,
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

function getFamilyMembers(world: CivilizationWorldState, ids: string[]) {
  const seen = new Set<string>();
  return ids.flatMap((id) => {
    if (seen.has(id)) return [];
    seen.add(id);
    const agent = world.agents.find((candidate) => candidate.id === id);
    return agent ? [agent] : [];
  });
}

function FamilyTreeNode({
  agent,
  relationship,
  selected,
  world,
  onSelect,
}: {
  agent: CivilizationAgent;
  relationship: string;
  selected?: boolean;
  world: CivilizationWorldState;
  onSelect(id: string): void;
}) {
  return (
    <button
      className={`sov-family-node ${selected ? "selected" : ""} ${agent.alive ? "" : "fallen"}`}
      style={{ "--family-color": agent.color } as CSSProperties}
      onClick={() => onSelect(agent.id)}
      aria-label={`${relationship}: ${agent.name}, generation ${agent.generation}, ${agent.alive ? "living. Select and follow this agent" : "fallen. Select to inspect this record"}.`}
      aria-current={selected ? "true" : undefined}
    >
      <span className="sov-family-avatar">{initials(agent.name)}</span>
      <span><b>{agent.name}</b><small>{relationship} · GEN {agent.generation}</small><em>{agent.alive ? getCampName(world, agent.campId) : "Fallen"}</em></span>
    </button>
  );
}

function FamilyTreeArchivedNode({ relationship, id }: { relationship: string; id: string }) {
  return (
    <div className="sov-family-node archived" aria-label={`${relationship}: archived lineage record`}>
      <span className="sov-family-avatar">?</span>
      <span><b>Archived record</b><small>{relationship}</small><em title={id}>Identity no longer active</em></span>
    </div>
  );
}

function FamilyTree({
  world,
  agent,
  onClose,
  onSelect,
}: {
  world: CivilizationWorldState;
  agent: CivilizationAgent;
  onClose(): void;
  onSelect(id: string): void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const parentIds = [...new Set(agent.parentIds)].filter((id) => id !== agent.id);
  const parents = getFamilyMembers(world, parentIds);
  const archivedParentIds = parentIds.filter((id) => !parents.some((parent) => parent.id === id));
  const grandparentIds = [...new Set(parents.flatMap((parent) => parent.parentIds))]
    .filter((id) => id !== agent.id && !parentIds.includes(id));
  const grandparents = getFamilyMembers(world, grandparentIds);
  const archivedGrandparentIds = grandparentIds.filter((id) => !grandparents.some((grandparent) => grandparent.id === id));
  const childIds = [...new Set([
    ...agent.childrenIds,
    ...world.agents.filter((candidate) => candidate.parentIds.includes(agent.id)).map((candidate) => candidate.id),
  ])].filter((id) => id !== agent.id);
  const children = getFamilyMembers(world, [
    ...childIds,
  ]);
  const archivedChildIds = childIds.filter((id) => !children.some((child) => child.id === id));
  const grandchildIds = [...new Set(children.flatMap((child) => [
    ...child.childrenIds,
    ...world.agents.filter((candidate) => candidate.parentIds.includes(child.id)).map((candidate) => candidate.id),
  ]))].filter((id) => id !== agent.id && !childIds.includes(id));
  const grandchildren = getFamilyMembers(world, grandchildIds);
  const archivedGrandchildIds = grandchildIds.filter((id) => !grandchildren.some((grandchild) => grandchild.id === id));
  const siblings = agent.parentIds.length > 0
    ? world.agents.filter((candidate) => candidate.id !== agent.id && candidate.parentIds.some((id) => agent.parentIds.includes(id)))
    : [];
  const partnerIds = children.flatMap((child) => child.parentIds.filter((id) => id !== agent.id));
  const partners = getFamilyMembers(world, partnerIds);
  const peers = getFamilyMembers(world, [...siblings.map((member) => member.id), ...partners.map((member) => member.id)]);

  useEffect(() => {
    closeRef.current?.focus();
    const dialog = dialogRef.current;
    if (!dialog) return;
    const keepFocusInside = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>("button:not([disabled]), [href], [tabindex]:not([tabindex='-1'])")];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    dialog.addEventListener("keydown", keepFocusInside);
    return () => dialog.removeEventListener("keydown", keepFocusInside);
  }, [agent.id]);

  const lane = (label: string, members: CivilizationAgent[], relationship: string, archivedIds: string[] = []) => (
    <section className="sov-family-lane" aria-label={label}>
      <h3>{label}</h3>
      <div className="sov-family-nodes">
        {members.length > 0 || archivedIds.length > 0
          ? <>{members.map((member) => <FamilyTreeNode key={member.id} agent={member} relationship={relationship} world={world} onSelect={onSelect} />)}{archivedIds.map((id) => <FamilyTreeArchivedNode key={id} id={id} relationship={relationship} />)}</>
          : <span className="sov-family-empty">No known {label.toLowerCase()}</span>}
      </div>
    </section>
  );

  return (
    <div className="sov-family-backdrop">
      <div ref={dialogRef} className="sov-family-dialog sov-panel" role="dialog" aria-modal="true" aria-labelledby="sov-family-title" aria-describedby="sov-family-description">
        <header className="sov-family-head">
          <div><span className="sov-kicker">Living lineage explorer</span><h2 id="sov-family-title">{agent.name}&apos;s family tree</h2><p id="sov-family-description">Select any person to inspect and follow them. Dashed connectors indicate generational descent.</p></div>
          <button ref={closeRef} onClick={onClose} aria-label="Close family tree and return to the agent inspector"><X size={18} /><span>Back</span></button>
        </header>
        <div className="sov-family-scroll">
          {lane("Grandparents", grandparents, "Grandparent", archivedGrandparentIds)}
          {lane("Parents", parents, "Parent", archivedParentIds)}
          <section className="sov-family-lane focus" aria-label="Selected agent, siblings, and partners">
            <h3>Selected generation</h3>
            <div className="sov-family-nodes">
              <FamilyTreeNode agent={agent} relationship="Selected agent" selected world={world} onSelect={onSelect} />
              {peers.map((member) => <FamilyTreeNode key={member.id} agent={member} relationship={partners.some((partner) => partner.id === member.id) ? "Partner" : "Sibling"} world={world} onSelect={onSelect} />)}
            </div>
          </section>
          {lane("Children", children, "Child", archivedChildIds)}
          {lane("Grandchildren", grandchildren, "Grandchild", archivedGrandchildIds)}
        </div>
        <footer className="sov-family-key"><span><i /> Living</span><span><i className="fallen" /> Fallen (name retained)</span><span><b /> Descent connector</span></footer>
      </div>
    </div>
  );
}

function CivilizationCanvas({
  worldRef,
  selection,
  cameraMode,
  overlayMode,
  onSnapshot,
  onAgentSelect,
  onCampSelect,
  onBeliefSelect,
  onRelationSelect,
  onCameraModeChange,
}: {
  worldRef: MutableRefObject<CivilizationWorldState>;
  selection: Selection;
  cameraMode: CameraMode;
  overlayMode: MapOverlayMode;
  onSnapshot(world: CivilizationWorldState): void;
  onAgentSelect(id: string): void;
  onCampSelect(id: string): void;
  onBeliefSelect(id: string): void;
  onRelationSelect(selection: MapRelationSelection): void;
  onCameraModeChange(mode: CameraMode): void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef(selection);
  const cameraRef = useRef(cameraMode);
  const overlayRef = useRef(overlayMode);

  useEffect(() => { selectionRef.current = selection; }, [selection]);
  useEffect(() => { cameraRef.current = cameraMode; }, [cameraMode]);
  useEffect(() => { overlayRef.current = overlayMode; }, [overlayMode]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let controller: ReturnType<typeof createCivilizationScene>;
    try {
      controller = createCivilizationScene(mount, toVisualWorld(worldRef.current, null, overlayRef.current), {
        onAgentSelect,
        onCampSelect,
        onBeliefSelect,
        onRelationSelect,
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
    let visualWorld = toVisualWorld(sourceWorld, null, overlayRef.current);
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
        visualWorld = toVisualWorld(sourceWorld, null, overlayRef.current);
      }
      const active = selectionRef.current;
      visualWorld.selectedBeliefId = active.kind === "belief" ? active.id : null;
      visualWorld.overlayMode = overlayRef.current;
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
  }, [onAgentSelect, onBeliefSelect, onCampSelect, onCameraModeChange, onRelationSelect, onSnapshot, worldRef]);

  return (
    <div ref={mountRef} className="sov-world" aria-label="Live three-dimensional autonomous civilization map">
      <div className="sov-world-fallback"><Leaf size={18} /><span>This living map needs WebGL to render.</span></div>
    </div>
  );
}

function AgentInspector({
  world,
  agent,
  onOpenFamily,
  familyTreeTriggerRef,
}: {
  world: CivilizationWorldState;
  agent: CivilizationAgent;
  onOpenFamily(): void;
  familyTreeTriggerRef: MutableRefObject<HTMLButtonElement | null>;
}) {
  const camp = world.camps.find((candidate) => candidate.id === agent.campId);
  const belief = world.beliefs.find((candidate) => candidate.id === agent.beliefId);
  const parents = agent.parentIds.map((id) => world.agents.find((candidate) => candidate.id === id)?.name).filter(Boolean).join(" + ");
  const deliberation = agent.deliberation;
  const chosenLearning = agent.planLearning[deliberation.chosenPlan];
  const recentMemories = agent.recentMemories.slice(-3).reverse();
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
        <div className="sov-decision sov-thinking">
          <div className="sov-decision-label"><Brain size={12} /> CURRENT THINKING <span className="sov-confidence">{Math.round(percent(deliberation.confidence))}% confidence</span></div>
          <p>{deliberation.statement}</p>
          <div className="sov-detail-line"><span>CHOSEN</span><b>{humanize(deliberation.chosenPlan)} · {agent.goal}</b></div>
          <div className="sov-detail-line"><span>LEARNING</span><b>{chosenLearning ? `${chosenLearning.attempts} prior attempts · ${chosenLearning.expectedValue.toFixed(2)} learned value` : "Testing this plan for the first time"}</b></div>
          {deliberation.alternatives.length > 0 && <div className="sov-alternatives" aria-label="Plans considered but not chosen">
            <span>TOP ALTERNATIVES</span>
            {deliberation.alternatives.slice(0, 2).map((alternative) => <div key={`${alternative.plan}-${alternative.goal}`}><b>{humanize(alternative.plan)}</b><small>{alternative.goal}</small><em>{alternative.score.toFixed(2)}</em></div>)}
          </div>}
          <p className="sov-learning-note">Strategy is learned from outcomes and present conditions—not a preset personality.</p>
        </div>
        <div className="sov-metrics">
          <Meter label="Health" value={agent.health} color={agent.health < 35 ? "#ff8066" : agent.color} icon={<Heart size={10} />} />
          <Meter label="Nourished" value={agent.hunger} color="#e7b95e" icon={<Wheat size={10} />} />
          <Meter label="Hydration" value={agent.hydration} color="#66d7d1" icon={<Droplets size={10} />} />
          <Meter label="Energy" value={agent.energy} color="#b99cff" icon={<Zap size={10} />} />
        </div>
        <button ref={familyTreeTriggerRef} className="sov-family-open sov-family-open-primary" onClick={onOpenFamily}><GitBranch size={14} /><span>Explore family tree</span><small>Ancestors → grandchildren</small></button>
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
        <section className="sov-section sov-memory-section">
          <div className="sov-section-head"><span className="sov-kicker">Recent outcome memory</span><Brain size={13} /></div>
          <div className="sov-memory-list">
            {recentMemories.length > 0 ? recentMemories.map((memory) => <article key={memory.id} data-outcome={memory.outcome}>
              <span>{memory.outcome}</span><p><b>{humanize(memory.plan)}</b>{memory.summary}</p><time>DAY {Math.max(1, Math.floor(memory.day))} · {memory.score >= 0 ? "+" : ""}{memory.score.toFixed(2)}</time>
            </article>) : <p className="sov-section-note">No completed plan outcomes yet. Experience will accumulate as this agent acts.</p>}
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
  const bindingRelations = relations.filter((relation) => relation.status !== "neutral");
  const neutralRelations = relations.filter((relation) => relation.status === "neutral");
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
          <Meter label="Claim reach" value={camp.territoryRadius / 0.42} color="#c7f36a" icon={<MapIcon size={10} />} />
          <Meter label="Economic" value={camp.economicPower} color="#e7b95e" icon={<Wheat size={10} />} />
          <Meter label="Military" value={camp.militaryPower} color="#ff8066" icon={<Swords size={10} />} />
        </div>
      </div>
      <div>
        <section className="sov-section">
          <div className="sov-section-head"><span className="sov-kicker">Power structure</span><b>{Math.round(camp.power)} PWR</b></div>
          <div className="sov-data-grid">
            <DataCell label="Population" value={camp.memberIds.length} />
            <DataCell label="Claim radius" value={`${camp.territoryRadius.toFixed(1)} map units`} />
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
            {bindingRelations.length > 0 ? bindingRelations.map((relation) => {
              const otherId = relation.fromCampId === camp.id ? relation.toCampId : relation.fromCampId;
              const other = world.camps.find((candidate) => candidate.id === otherId);
              const color = relationColor(relation.status);
              return <div className="sov-relation" key={relation.id} style={{ "--relation-color": color } as CSSProperties}><i /><span>{other?.name ?? "Unknown power"}</span><em>{relationLabel(relation.status)}</em></div>;
            }) : <div className="sov-relation"><i /><span>No binding pacts</span><em>Independent</em></div>}
            {neutralRelations.length > 0 && <details className="sov-neutral-relations">
              <summary>Show {neutralRelations.length} neutral {neutralRelations.length === 1 ? "power" : "powers"}</summary>
              <div>{neutralRelations.map((relation) => {
                const otherId = relation.fromCampId === camp.id ? relation.toCampId : relation.fromCampId;
                const other = world.camps.find((candidate) => candidate.id === otherId);
                return <div className="sov-relation" key={relation.id} style={{ "--relation-color": relationColor(relation.status) } as CSSProperties}><i /><span>{other?.name ?? "Unknown power"}</span><em>Neutral</em></div>;
              })}</div>
            </details>}
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
  const [mapOverlayMode, setMapOverlayMode] = useState<MapOverlayMode>("world");
  const [mapFocus, setMapFocus] = useState(false);
  const [mapLayersExpanded, setMapLayersExpanded] = useState(true);
  const [mobileSheetTab, setMobileSheetTab] = useState<MobileSheetTab>("inspector");
  const [mobileSheetLevel, setMobileSheetLevel] = useState<MobileSheetLevel>("collapsed");
  const [selectedMapRelation, setSelectedMapRelation] = useState<MapRelationSelection | null>(null);
  const [familyTreeAgentId, setFamilyTreeAgentId] = useState<string | null>(null);
  const [eventFilter, setEventFilter] = useState<EventFilter>("all");
  const [chronicleExpanded, setChronicleExpanded] = useState(false);
  const [syncState, setSyncState] = useState<SyncState>("connecting");
  const [authoritativeReady, setAuthoritativeReady] = useState(false);
  const [history, setHistory] = useState<MajorEvent[]>(initialWorld.majorEvents);
  const [revision, setRevision] = useState(0);
  const [catchUpPendingSeconds, setCatchUpPendingSeconds] = useState(0);
  const familyTreeTriggerRef = useRef<HTMLButtonElement | null>(null);
  const relationCardRef = useRef<HTMLElement | null>(null);
  const relationReturnFocusRef = useRef<HTMLElement | null>(null);
  const queryStateHydratedRef = useRef(false);
  const mobileSheetGestureRef = useRef<{ pointerId: number; startY: number; level: MobileSheetLevel } | null>(null);
  const ignoreNextSheetClickRef = useRef(false);

  const rankedCamps = useMemo(() => getRankedCamps(hud).filter((camp) => camp.active), [hud]);
  const rankedAgents = useMemo(() => getRankedAgents(hud), [hud]);
  const influentialAgents = useMemo(() => getRankedInfluentialAgents(hud).filter((agent) => agent.alive).slice(0, 10), [hud]);
  const beliefRanking = useMemo(() => getRankedBeliefs(hud).filter((belief) => belief.active), [hud]);
  const aliveAgents = rankedAgents.filter((agent) => agent.alive);
  const activeCamps = rankedCamps.length;
  const activeBeliefs = beliefRanking.length;
  const relationViews = useMemo(() => hud.relations.map(relationView), [hud.relations]);
  const selectedRelationRecord = selectedMapRelation
    ? relationViews.find((relation) => (
      (relation.fromCampId === selectedMapRelation.fromCampId && relation.toCampId === selectedMapRelation.toCampId)
      || (relation.fromCampId === selectedMapRelation.toCampId && relation.toCampId === selectedMapRelation.fromCampId)
    ))
    : undefined;
  const selectedRelationFromCamp = selectedMapRelation ? hud.camps.find((camp) => camp.id === selectedMapRelation.fromCampId) : undefined;
  const selectedRelationToCamp = selectedMapRelation ? hud.camps.find((camp) => camp.id === selectedMapRelation.toCampId) : undefined;
  const selectedRelationStartedDay = Math.max(1, Math.floor(selectedRelationRecord?.startedDay ?? hud.day));
  const selectedRelationDuration = Math.max(0, Math.floor(hud.day) - selectedRelationStartedDay);
  const selectedWarScore = selectedRelationRecord?.warScore ?? 0;
  const selectedWarLead = Math.abs(selectedWarScore) < 0.5
    ? "Even"
    : `${selectedWarScore > 0 ? selectedRelationFromCamp?.name ?? "First power" : selectedRelationToCamp?.name ?? "Second power"} +${Math.round(Math.abs(selectedWarScore))}`;
  const wars = relationViews.filter((relation) => relation.status === "war");
  const topCamp = rankedCamps[0];
  const selectedAgent = selection.kind === "agent" ? hud.agents.find((agent) => agent.id === selection.id) : undefined;
  const selectedCamp = selection.kind === "camp" ? hud.camps.find((camp) => camp.id === selection.id) : undefined;
  const selectedBelief = selection.kind === "belief" ? hud.beliefs.find((belief) => belief.id === selection.id) : undefined;
  const familyTreeAgent = familyTreeAgentId ? hud.agents.find((agent) => agent.id === familyTreeAgentId) : undefined;
  const selectedName = selectedAgent?.name ?? selectedCamp?.name ?? selectedBelief?.name ?? "World observer";
  const selectedContext = selectedAgent
    ? `${getActionLabel(selectedAgent.action)} · ${getCampName(hud, selectedAgent.campId)}`
    : selectedCamp
      ? `${compactNumber(selectedCamp.power)} power · ${selectedCamp.memberIds.length} citizens`
      : selectedBelief
        ? `${selectedBelief.adherentIds.length} adherents · ${selectedBelief.tenets.map((tenet) => BELIEF_TENET_LABELS[tenet]).join(" / ")}`
        : "Tap an agent, camp, or belief to observe it";
  const accent = selectedAgent?.color ?? selectedCamp?.color ?? selectedBelief?.color ?? topCamp?.color ?? "#c7f36a";
  const overlayOption = MAP_OVERLAY_OPTIONS.find((option) => option.mode === mapOverlayMode) ?? MAP_OVERLAY_OPTIONS[0];
  const overlayPresentation = useMemo(
    () => getOverlayPresentation(mapOverlayMode, hud, rankedCamps, beliefRanking, relationViews),
    [beliefRanking, hud, mapOverlayMode, rankedCamps, relationViews],
  );
  const accessibleMapRelations = useMemo(() => relationViews
    .filter((relation) => mapOverlayMode === "alliances"
      ? relation.status === "alliance" || relation.status === "trade" || relation.status === "truce"
      : mapOverlayMode === "wars"
        ? relation.status === "war" || relation.status === "hostile"
        : false)
    .sort((left, right) => right.strength - left.strength || left.id.localeCompare(right.id))
    .slice(0, 8), [mapOverlayMode, relationViews]);

  const prepareMobileSheet = useCallback(() => {
    if (window.matchMedia("(max-width: 860px)").matches) setMapLayersExpanded(false);
  }, []);
  const publishSnapshot = useCallback((world: CivilizationWorldState) => setHud(world), []);
  const selectAgent = useCallback((id: string) => {
    prepareMobileSheet();
    setSelectedMapRelation(null);
    setSelection({ kind: "agent", id });
    setCameraMode("followAgent");
    setMobileSheetTab("inspector");
    setMobileSheetLevel((level) => level === "collapsed" ? "peek" : level);
  }, [prepareMobileSheet]);
  const selectCamp = useCallback((id: string) => {
    prepareMobileSheet();
    setSelectedMapRelation(null);
    setSelection({ kind: "camp", id });
    setCameraMode("followCamp");
    setMobileSheetTab("inspector");
    setMobileSheetLevel((level) => level === "collapsed" ? "peek" : level);
  }, [prepareMobileSheet]);
  const selectBelief = useCallback((id: string) => {
    prepareMobileSheet();
    setSelectedMapRelation(null);
    setSelection({ kind: "belief", id });
    setRosterMode("beliefs");
    setMapOverlayMode("beliefs");
    setCameraMode("overview");
    setMobileSheetTab("inspector");
    setMobileSheetLevel((level) => level === "collapsed" ? "peek" : level);
  }, [prepareMobileSheet]);
  const selectMapRelation = useCallback((relation: MapRelationSelection) => {
    relationReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSelectedMapRelation(relation);
    setMapOverlayMode(relation.kind === "war" ? "wars" : "alliances");
  }, []);
  const closeMapRelation = useCallback(() => {
    setSelectedMapRelation(null);
    window.requestAnimationFrame(() => relationReturnFocusRef.current?.focus());
  }, []);
  const openFamilyTree = useCallback(() => {
    if (selection.kind === "agent") setFamilyTreeAgentId(selection.id);
  }, [selection]);
  const closeFamilyTree = useCallback(() => {
    setFamilyTreeAgentId(null);
    window.requestAnimationFrame(() => familyTreeTriggerRef.current?.focus());
  }, []);
  const selectFamilyAgent = useCallback((id: string) => {
    setFamilyTreeAgentId(id);
    setSelection({ kind: "agent", id });
    const relative = worldRef.current.agents.find((agent) => agent.id === id);
    setCameraMode(relative?.alive ? "followAgent" : "overview");
  }, []);
  const toggleMapFocus = useCallback(() => {
    setMapFocus((focused) => {
      if (!focused) {
        setCameraMode("free");
        setMobileSheetLevel("collapsed");
      }
      return !focused;
    });
  }, []);

  const showMobileSheetTab = useCallback((tab: MobileSheetTab) => {
    prepareMobileSheet();
    setMobileSheetTab(tab);
    setMobileSheetLevel((level) => level === "collapsed" ? "peek" : level);
  }, [prepareMobileSheet]);

  const toggleMobileSheet = useCallback(() => {
    if (ignoreNextSheetClickRef.current) {
      ignoreNextSheetClickRef.current = false;
      return;
    }
    prepareMobileSheet();
    setMobileSheetLevel((level) => level === "collapsed" ? "peek" : level === "peek" ? "open" : "collapsed");
  }, [prepareMobileSheet]);

  const toggleChronicle = useCallback(() => {
    prepareMobileSheet();
    setChronicleExpanded((expanded) => {
      const next = !expanded;
      setMobileSheetTab("chronicle");
      setMobileSheetLevel(next ? "open" : "peek");
      return next;
    });
  }, [prepareMobileSheet]);

  const startMobileSheetDrag = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    mobileSheetGestureRef.current = { pointerId: event.pointerId, startY: event.clientY, level: mobileSheetLevel };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [mobileSheetLevel]);

  const endMobileSheetDrag = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    const gesture = mobileSheetGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    mobileSheetGestureRef.current = null;
    const distance = event.clientY - gesture.startY;
    if (Math.abs(distance) < 38) return;
    ignoreNextSheetClickRef.current = true;
    const levels: MobileSheetLevel[] = ["collapsed", "peek", "open"];
    const current = levels.indexOf(gesture.level);
    const next = Math.max(0, Math.min(levels.length - 1, current + (distance < 0 ? 1 : -1)));
    if (levels[next] !== "collapsed") prepareMobileSheet();
    setMobileSheetLevel(levels[next]);
  }, [prepareMobileSheet]);

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

  const moveMobileSheetFocus = useCallback((event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const currentIndex = MOBILE_SHEET_TABS.indexOf(mobileSheetTab);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? MOBILE_SHEET_TABS.length - 1
        : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + MOBILE_SHEET_TABS.length) % MOBILE_SHEET_TABS.length;
    const nextTab = MOBILE_SHEET_TABS[nextIndex];
    setMobileSheetTab(nextTab);
    event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`#sov-sheet-tab-${nextTab}`)?.focus();
  }, [mobileSheetTab]);

  useEffect(() => {
    if (!selectedMapRelation) return;
    window.requestAnimationFrame(() => relationCardRef.current?.focus());
  }, [selectedMapRelation]);

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
        let requestedSelection: Selection | undefined;
        if (!queryStateHydratedRef.current) {
          const params = new URLSearchParams(window.location.search);
          requestedSelection = params.get("agent")
            ? { kind: "agent", id: params.get("agent") ?? "" }
            : params.get("belief")
              ? { kind: "belief", id: params.get("belief") ?? "" }
              : params.get("camp")
                ? { kind: "camp", id: params.get("camp") ?? "" }
                : undefined;
          const requestedOverlay = params.get("overlay");
          if (requestedOverlay && MAP_OVERLAY_OPTIONS.some((option) => option.mode === requestedOverlay)) {
            setMapOverlayMode(requestedOverlay as MapOverlayMode);
          }
          queryStateHydratedRef.current = true;
        }
        setSelection((current) => {
          if (requestedSelection) {
            const requestedExists = requestedSelection.kind === "agent"
              ? world.agents.some((agent) => agent.id === requestedSelection.id)
              : requestedSelection.kind === "camp"
                ? world.camps.some((camp) => camp.id === requestedSelection.id && camp.active)
                : world.beliefs.some((belief) => belief.id === requestedSelection.id && belief.active);
            if (requestedExists) return requestedSelection;
          }
          const exists = current.kind === "agent"
            ? world.agents.some((agent) => agent.id === current.id)
            : current.kind === "camp"
              ? world.camps.some((camp) => camp.id === current.id && camp.active)
              : world.beliefs.some((belief) => belief.id === current.id && belief.active);
          return exists ? current : { kind: "agent", id: world.agents.find((agent) => agent.alive)?.id ?? world.agents[0]?.id ?? "" };
        });
        setAuthoritativeReady(true);
      } catch (error) {
        if (!disposed && !(error instanceof DOMException && error.name === "AbortError")) {
          setSyncState("reconnecting");
        }
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
    if (!authoritativeReady || !queryStateHydratedRef.current) return;
    if (window.location.pathname !== "/") return;
    const url = new URL(window.location.href);
    url.searchParams.delete("agent");
    url.searchParams.delete("camp");
    url.searchParams.delete("belief");
    if (selection.id) url.searchParams.set(selection.kind, selection.id);
    if (mapOverlayMode === "world") url.searchParams.delete("overlay");
    else url.searchParams.set("overlay", mapOverlayMode);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, [authoritativeReady, mapOverlayMode, selection]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (familyTreeAgentId) {
        if (event.key === "Escape") {
          event.preventDefault();
          closeFamilyTree();
        }
        return;
      }
      if (selectedMapRelation && event.key === "Escape") {
        event.preventDefault();
        closeMapRelation();
        return;
      }
      if (!event.altKey && !event.ctrlKey && !event.metaKey) {
        const overlay = MAP_OVERLAY_OPTIONS.find((option) => option.shortcut === event.key);
        if (overlay) {
          event.preventDefault();
          setMapOverlayMode(overlay.mode);
          return;
        }
      }
      if (event.key === "[") cycleSelection(-1, true);
      else if (event.key === "]") cycleSelection(1, true);
      else if (event.key.toLowerCase() === "f" && selection.kind === "agent") setCameraMode("followAgent");
      else if (event.key.toLowerCase() === "c" && selection.kind === "camp") setCameraMode("followCamp");
      else if (event.key.toLowerCase() === "b" && selection.kind === "belief") setCameraMode("overview");
      else if (event.key === "Escape" && mapFocus) {
        event.preventDefault();
        setMapFocus(false);
      } else if (event.key === "Escape") setCameraMode("overview");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeFamilyTree, closeMapRelation, cycleSelection, familyTreeAgentId, mapFocus, selectedMapRelation, selection.kind]);

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

  if (!authoritativeReady) {
    return <main className="sov-shell" style={style}>
      <div className="sov-world sov-world-pending" aria-hidden="true" />
      <div className="sov-atmosphere" aria-hidden="true" />
      <div className="sov-sync-gate" role="status" aria-live="polite">
        <span className="sov-brand-mark"><Leaf size={18} /></span>
        <strong>{syncState === "reconnecting" ? "Waiting for the living world" : "Rejoining the living world"}</strong>
        <small>Loading the latest civilization and chronicle without resetting its timeline.</small>
        <i aria-hidden="true" />
      </div>
    </main>;
  }

  return (
    <main className={`sov-shell sov-sheet-${mobileSheetLevel} sov-sheet-tab-${mobileSheetTab} ${mapFocus ? "sov-map-focus" : ""}`} style={style}>
      <CivilizationCanvas worldRef={worldRef} selection={selection} cameraMode={cameraMode} overlayMode={mapOverlayMode} onSnapshot={publishSnapshot} onAgentSelect={selectAgent} onCampSelect={selectCamp} onBeliefSelect={selectBelief} onRelationSelect={selectMapRelation} onCameraModeChange={setCameraMode} />
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
        <div className="sov-top-actions">
          <span className={`sov-live ${syncState === "persistent" ? "" : "reconnecting"}`} title={syncState === "catching_up" ? "The durable world is checkpointing an offline interval; each refresh continues from the last completed checkpoint." : "The shared world reconciles elapsed time on the server and resumes from durable state"}><span className="sov-live-dot" />{syncLabel}</span>
          <nav className="site-section-nav sov-site-nav" aria-label="World sections">
            <span className="site-section-link active" aria-current="page"><MapIcon size={13} /><span>Map</span></span>
            <a className="site-section-link" href="/archive" aria-label="Open civilization and belief archive"><BookOpen size={13} /><span>Civilizations</span></a>
            <a className="site-section-link" href="/history" aria-label="Read the world history in 200-day chapters"><ScrollText size={13} /><span>History</span></a>
          </nav>
          <button className="sov-map-focus-toggle" onClick={toggleMapFocus} aria-controls="sov-map-exploration" aria-pressed={mapFocus}><span>{mapFocus ? "Exit map" : "Explore map"}</span>{mapFocus ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>
          <div className="sov-camera" aria-label="Camera mode">
            <button className={cameraMode === "overview" ? "active" : ""} onClick={() => setCameraMode("overview")} aria-label="Overview camera" aria-pressed={cameraMode === "overview"} title="World overview (Esc)"><MapIcon size={14} /></button>
            <button className={cameraMode === "followAgent" ? "active" : ""} onClick={() => selectedAgent && setCameraMode("followAgent")} aria-label="Follow selected agent" aria-pressed={cameraMode === "followAgent"} title="Follow selected AI (F)"><Focus size={14} /></button>
            <button className={cameraMode === "followCamp" ? "active" : ""} onClick={() => selectedCamp && setCameraMode("followCamp")} aria-label="Focus selected camp" aria-pressed={cameraMode === "followCamp"} title="Focus selected camp (C)"><Tent size={14} /></button>
            <button className={cameraMode === "free" ? "active" : ""} onClick={() => setCameraMode("free")} aria-label="Free orbit camera" aria-pressed={cameraMode === "free"} title="Free orbit"><Eye size={14} /></button>
          </div>
        </div>
      </header>

      {topCamp && <div className="sov-leader-ribbon"><Crown size={11} /> #1 {topCamp.name.toUpperCase()} <span>{Math.round(topCamp.power)} power · {topCamp.memberIds.length} citizens · {worldEra(hud)}</span></div>}

      <section id="sov-map-exploration" className={`sov-map-overlays ${mapLayersExpanded ? "expanded" : "collapsed"}`} aria-labelledby="sov-map-layers-title">
        <div className="sov-map-overlay-head">
          <span id="sov-map-layers-title"><MapIcon size={11} /> Map layers</span>
          <div><strong>{overlayOption.label} active</strong><button className="sov-layer-toggle" onClick={() => setMapLayersExpanded((expanded) => !expanded)} aria-controls="sov-map-layer-controls" aria-expanded={mapLayersExpanded}><span>{mapLayersExpanded ? "Hide" : "Choose"}</span><ChevronDown size={15} /></button></div>
        </div>
        <div className="sov-map-overlay-content" id="sov-map-layer-controls">
          <div className="sov-map-overlay-buttons" role="toolbar" aria-label="Choose a map overlay">
            {MAP_OVERLAY_OPTIONS.map((option) => {
              const active = mapOverlayMode === option.mode;
              return <button
                key={option.mode}
                className={active ? "active" : ""}
                onClick={() => setMapOverlayMode(option.mode)}
                aria-controls="sov-map-layer-detail"
                aria-label={`${option.label} map layer. ${option.description}. Keyboard shortcut ${option.shortcut}.`}
                aria-keyshortcuts={option.shortcut}
                aria-pressed={active}
                title={`${option.description} (${option.shortcut})`}
              >
                {overlayIcon(option.mode)}
                <span>{option.label}</span>
                <kbd aria-hidden="true">{option.shortcut}</kbd>
              </button>;
            })}
          </div>
          <div className="sov-map-overlay-detail" id="sov-map-layer-detail">
            <p><strong>{overlayOption.label} layer</strong><span>{overlayPresentation.summary}</span></p>
            <div className="sov-map-overlay-legend" aria-label={`${overlayOption.label} map legend`}>
              {overlayPresentation.legend.map((item, index) => <span key={`${item.label}-${index}`}>
                <i className={item.kind ?? "dot"} style={{ "--layer-color": item.color } as CSSProperties} aria-hidden="true" />
                {item.label}
              </span>)}
            </div>
          </div>
          {accessibleMapRelations.length > 0 && <div className="sov-map-relation-index" aria-label={`${overlayOption.label} available to inspect`}>
            <span>Inspect on map</span>
            <div>
              {accessibleMapRelations.map((relation) => {
                const fromCamp = hud.camps.find((camp) => camp.id === relation.fromCampId);
                const toCamp = hud.camps.find((camp) => camp.id === relation.toCampId);
                const kind: MapRelationSelection["kind"] = relation.status === "war"
                  ? "war"
                  : relation.status === "alliance"
                    ? "alliance"
                    : relation.status === "trade" || relation.status === "truce"
                      ? "trade"
                      : "hostile";
                return <button
                  key={relation.id}
                  type="button"
                  onClick={() => selectMapRelation({
                    id: relation.id,
                    kind,
                    fromCampId: relation.fromCampId,
                    toCampId: relation.toCampId,
                    strength: relation.strength,
                    intensity: relation.strength,
                    clientX: window.innerWidth / 2,
                    clientY: window.innerHeight / 3,
                  })}
                >
                  <i aria-hidden="true" />
                  <span>{fromCamp?.name ?? "Archived power"} ↔ {toCamp?.name ?? "Archived power"}</span>
                  <small>{relationLabel(relation.status)}</small>
                </button>;
              })}
            </div>
          </div>}
        </div>
      </section>
      <div className="sov-map-gesture-hint" aria-hidden="true"><span>Drag to orbit</span><span>Pinch to zoom</span><span>Tap an agent or camp</span></div>

      {selectedMapRelation && selectedRelationFromCamp && selectedRelationToCamp && <article
        ref={relationCardRef}
        role="dialog"
        tabIndex={-1}
        className="sov-relation-card sov-panel"
        data-kind={selectedMapRelation.kind}
        style={{ "--relation-x": `${selectedMapRelation.clientX}px`, "--relation-y": `${selectedMapRelation.clientY}px` } as CSSProperties}
        aria-label={`${relationLabel(selectedRelationRecord?.status ?? selectedMapRelation.kind)} between ${selectedRelationFromCamp.name} and ${selectedRelationToCamp.name}`}
      >
        <header>
          <span><i aria-hidden="true" />{relationLabel(selectedRelationRecord?.status ?? selectedMapRelation.kind)}</span>
          <button onClick={closeMapRelation} aria-label="Close diplomatic relation details"><X size={15} /></button>
        </header>
        <h2>{selectedRelationFromCamp.name} <em>↔</em> {selectedRelationToCamp.name}</h2>
        <div className="sov-relation-stats">
          <span><small>Duration</small><b>{selectedRelationDuration} days · since {selectedRelationStartedDay}</b></span>
          <span><small>Trust</small><b>{Math.round(percent(selectedRelationRecord?.trust ?? 0))}%</b></span>
          <span><small>Tension</small><b>{Math.round(percent(selectedRelationRecord?.tension ?? 0))}%</b></span>
          <span><small>{selectedMapRelation.kind === "war" ? "War lead" : "Strength"}</small><b>{selectedMapRelation.kind === "war" ? selectedWarLead : `${Math.round(percent(selectedRelationRecord?.strength ?? selectedMapRelation.strength ?? 0))}%`}</b></span>
        </div>
        <div className="sov-relation-actions">
          <button onClick={() => selectCamp(selectedRelationFromCamp.id)}><Focus size={13} /><span>Focus {selectedRelationFromCamp.name}</span></button>
          <button onClick={() => selectCamp(selectedRelationToCamp.id)}><Focus size={13} /><span>Focus {selectedRelationToCamp.name}</span></button>
        </div>
      </article>}

      <div className="sov-mobile-selection-bar sov-panel" aria-label={`Current selection: ${selectedName}`} aria-hidden={mobileSheetLevel === "open"}>
        <button tabIndex={mobileSheetLevel === "open" ? -1 : 0} onClick={() => cycleSelection(-1)} aria-label="Previous selected AI or power"><ChevronLeft size={18} /></button>
        <button tabIndex={mobileSheetLevel === "open" ? -1 : 0} className="sov-mobile-selection-main" onClick={() => showMobileSheetTab("inspector")} aria-controls="sov-sheet-panel-inspector" aria-expanded={mobileSheetLevel !== "collapsed"}>
          <i style={{ "--selection-color": accent } as CSSProperties}>{initials(selectedName)}</i>
          <span>
            <b>{selectedName}</b>
            <small>{selectedContext}</small>
            <em><time>{getWorldTimeLabel(hud)}</time>{latestMajor ? ` · ${latestMajor.title}` : " · The founding era begins"}</em>
          </span>
        </button>
        <button tabIndex={mobileSheetLevel === "open" ? -1 : 0} onClick={() => cycleSelection(1)} aria-label="Next selected AI or power"><ChevronRight size={18} /></button>
      </div>

      <section className="sov-mobile-sheet sov-panel" aria-label="World information sheet">
        <header className="sov-mobile-sheet-head">
          <button
            className="sov-mobile-sheet-handle"
            onClick={toggleMobileSheet}
            onPointerDown={startMobileSheetDrag}
            onPointerUp={endMobileSheetDrag}
            onPointerCancel={() => { mobileSheetGestureRef.current = null; }}
            aria-expanded={mobileSheetLevel !== "collapsed"}
            aria-label={mobileSheetLevel === "collapsed" ? "Open world information" : mobileSheetLevel === "peek" ? "Expand world information" : "Reduce world information"}
          >
            <span aria-hidden="true" />
            <small>{mobileSheetLevel === "collapsed" ? "Swipe up for world details" : mobileSheetLevel === "peek" ? "Swipe up to expand" : "Swipe down to reduce"}</small>
            <ChevronDown size={15} />
          </button>
          <div className="sov-mobile-sheet-tabs" role="tablist" aria-label="World information">
            {MOBILE_SHEET_TABS.map((tab) => <button
              key={tab}
              role="tab"
              id={`sov-sheet-tab-${tab}`}
              aria-controls={`sov-sheet-panel-${tab}`}
              aria-selected={mobileSheetTab === tab}
              className={mobileSheetTab === tab ? "active" : ""}
              tabIndex={mobileSheetTab === tab ? 0 : -1}
              onClick={() => showMobileSheetTab(tab)}
              onKeyDown={moveMobileSheetFocus}
            >
              {tab === "roster" ? <Users size={15} /> : tab === "inspector" ? <Eye size={15} /> : <ScrollText size={15} />}
              <span>{humanize(tab)}</span>
            </button>)}
          </div>
        </header>
        <div className="sov-mobile-sheet-panels">
      <aside id="sov-sheet-panel-roster" className="sov-left sov-panel" role="tabpanel" aria-label="Civilization roster" aria-labelledby="sov-sheet-tab-roster">
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
          }) : rosterMode === "influence" ? influentialAgents.map((agent, index) => {
            const active = selection.kind === "agent" && selection.id === agent.id;
            const influenceScore = agent.influence + agent.spiritualInfluence;
            const topInfluence = Math.max(1, (influentialAgents[0]?.influence ?? 0) + (influentialAgents[0]?.spiritualInfluence ?? 0));
            return <button key={agent.id} className={`sov-agent-card sov-influence-card ${active ? "active" : ""}`} style={{ "--card-color": agent.color, "--power-width": `${clamp((influenceScore / topInfluence) * 100)}%` } as CSSProperties} onClick={() => selectAgent(agent.id)} aria-pressed={active} aria-label={`Rank ${index + 1}: ${agent.name}, achieved influence ${Math.round(influenceScore)}, generation ${agent.generation}, ${getCampName(hud, agent.campId)}. Current aim: ${agent.goal || getActionLabel(agent.action)}. Select and follow.`}>
              <span className="sov-power-rank"><Trophy size={11} />{String(index + 1).padStart(2, "0")}</span>
              <span className="sov-card-copy"><span className="sov-card-title">{agent.name}</span><span className="sov-card-meta">{getCampName(hud, agent.campId)} · GEN {agent.generation} · {agent.goal || getActionLabel(agent.action)}</span></span>
              <span className="sov-card-value" title={`${Math.round(agent.influence)} social + ${Math.round(agent.spiritualInfluence)} belief influence`}>{compactNumber(influenceScore)}<small>ACHIEVED</small></span>
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

      <aside id="sov-sheet-panel-inspector" className="sov-inspector sov-panel" role="tabpanel" aria-labelledby="sov-sheet-tab-inspector" aria-label={selectedAgent ? `Observed AI: ${selectedAgent.name}` : selectedCamp ? `Observed power: ${selectedCamp.name}` : selectedBelief ? `Observed belief: ${selectedBelief.name}` : "World observer"}>
        <div className="sov-inspector-nav"><button onClick={() => cycleSelection(-1)} aria-label="Previous selection" title="Previous selection ([)"><ChevronLeft size={16} /></button><span>{selection.kind === "agent" ? "OBSERVING AUTONOMOUS AI" : selection.kind === "camp" ? "OBSERVING SOVEREIGN POWER" : "OBSERVING EMERGENT BELIEF"}</span><button onClick={() => cycleSelection(1)} aria-label="Next selection" title="Next selection (])"><ChevronRight size={16} /></button></div>
        {selectedAgent ? <AgentInspector world={hud} agent={selectedAgent} onOpenFamily={openFamilyTree} familyTreeTriggerRef={familyTreeTriggerRef} /> : selectedCamp ? <CampInspector world={hud} camp={selectedCamp} /> : selectedBelief ? <BeliefInspector world={hud} belief={selectedBelief} /> : <div className="sov-empty">Select an agent, camp, or belief to inspect its evolving strategy.</div>}
      </aside>

      <section id="sov-sheet-panel-chronicle" className={`sov-chronicle sov-panel ${chronicleExpanded ? "expanded" : ""}`} role="tabpanel" aria-labelledby="sov-sheet-tab-chronicle" aria-label="Persistent world chronicle">
        <div className="sov-chronicle-head">
          <div className="sov-chronicle-title"><ScrollText size={13} /> World chronicle</div>
          <div className="sov-event-filters" role="group" aria-label="Filter chronicle events">{(["all", "power", "war", "lineage", "technology", "belief"] as EventFilter[]).map((filter) => <button key={filter} className={eventFilter === filter ? "active" : ""} onClick={() => setEventFilter(filter)} aria-pressed={eventFilter === filter}>{filter}</button>)}</div>
          <button className="sov-chronicle-toggle" onClick={toggleChronicle} aria-label={chronicleExpanded ? "Collapse world chronicle" : "Expand world chronicle"} aria-expanded={chronicleExpanded}>{chronicleExpanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}</button>
        </div>
        <div className="sov-event-stream">
          {mergedEvents.length > 0 ? mergedEvents.map((event) => {
            const color = eventColor(event.type, event.tone);
            return <article className="sov-event" key={event.id} style={{ "--event-color": color } as CSSProperties}><span className="sov-event-node" /><p><strong>{event.title}</strong>{event.message}</p><time>DAY {Math.max(1, Math.floor(event.day))}</time></article>;
          }) : <div className="sov-empty">The world is young. Major decisions will be recorded here permanently.</div>}
        </div>
      </section>
        </div>
      </section>

      {familyTreeAgent && <FamilyTree world={hud} agent={familyTreeAgent} onClose={closeFamilyTree} onSelect={selectFamilyAgent} />}

      <div className="sov-screen-reader-status" aria-live="polite">{latestMajor ? `${latestMajor.title}: ${latestMajor.message}` : "Ten founders are establishing independent camps."}</div>
    </main>
  );
}
