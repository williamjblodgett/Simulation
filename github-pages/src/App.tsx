import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  BELIEF_TENET_LABELS,
  TECHNOLOGY_LABELS,
  catchUpCivilization,
  createCivilizationWorld,
  getCivilizationSummary,
  getGeneratedCivilizationEvents,
  getRankedBeliefs,
  getRankedCamps,
  getRankedInfluentialAgents,
  getWorldTimeLabel,
  simulateCivilization,
  type CivilizationAgent,
  type CivilizationBeliefSystem,
  type CivilizationCamp,
  type CivilizationWorldState,
  type MajorEvent,
} from "../../app/simulation/civilization-engine";
import {
  createCivilizationScene,
  type CameraMode,
  type MapOverlayMode,
} from "../../app/simulation/civilization-scene";
import {
  clearWorld,
  loadWorld,
  mergeHistory,
  saveWorld,
  type LoadedWorld,
} from "./persistence";
import { toVisualWorld } from "./visual-world";

type Route = "map" | "archive" | "history";
type Selection = { kind: "agent" | "camp" | "belief"; id: string } | null;

const OVERLAYS: Array<{ id: MapOverlayMode; label: string }> = [
  { id: "world", label: "World" },
  { id: "territories", label: "Territories" },
  { id: "alliances", label: "Alliances" },
  { id: "wars", label: "Wars" },
  { id: "beliefs", label: "Beliefs" },
  { id: "resources", label: "Resources" },
];

const AGENT_BROWSER_PAGE_SIZE = 40;

const EVENT_WEIGHT: Record<string, number> = {
  world_started: 9, camp_founded: 9, camp_destroyed: 10, camp_captured: 10,
  breakaway: 9, coup: 9, war: 8, peace: 7, alliance: 7, tech_unlocked: 8,
  belief_founded: 9, belief_schism: 9, belief_reformed: 7, leadership_change: 6,
  power_lead_change: 8, birth: 3, death: 6, camp_renamed: 6, agent_renamed: 4,
};

function routeFromHash(): Route {
  const route = location.hash.replace(/^#\/?/, "").split("?")[0];
  return route === "archive" || route === "history" ? route : "map";
}

function compact(value: number) {
  return Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function titleCase(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function importance(event: MajorEvent) {
  return (EVENT_WEIGHT[event.type] ?? 4) + (event.tone === "critical" ? 3 : event.tone === "warning" ? 2 : 0);
}

type ChapterMeasure = {
  births: number;
  deaths: number;
  wars: number;
  advances: number;
  political: number;
  beliefs: number;
  identity: number;
};

function chapterMeasure(events: readonly MajorEvent[]): ChapterMeasure {
  const count = (...types: string[]) => events.filter((event) => types.includes(event.type)).length;
  return {
    births: count("birth"),
    deaths: count("death"),
    wars: count("war"),
    advances: count("tech_unlocked", "shrine_built"),
    political: count("camp_founded", "camp_destroyed", "camp_captured", "breakaway", "coup", "defection", "alliance", "peace", "truce", "power_lead_change"),
    beliefs: count("belief_founded", "belief_conversion_wave", "belief_schism", "belief_reformed", "belief_rejected", "belief_faded"),
    identity: count("agent_renamed", "camp_renamed", "leadership_change"),
  };
}

function eventFingerprint(event: MajorEvent): string {
  const camps = [...event.campIds].sort().join("+");
  const beliefs = [...event.beliefIds].sort().join("+");
  const agents = [...event.agentIds].sort().slice(0, 2).join("+");
  if (["war", "peace", "alliance", "truce"].includes(event.type)) {
    return `diplomacy:${camps}`;
  }
  if (["belief_conversion_wave", "belief_reformed", "belief_schism", "belief_rejected", "belief_faded"].includes(event.type)) {
    return `belief:${beliefs || camps}`;
  }
  if (["leadership_change", "coup", "camp_captured", "camp_destroyed", "camp_renamed"].includes(event.type)) {
    return `power:${camps}`;
  }
  if (event.type === "agent_renamed") return `identity:${agents}`;
  return `${event.type}:${camps || beliefs || agents || event.title.toLowerCase().replace(/\W+/g, " ").trim()}`;
}

function selectDiverseMoments(
  events: readonly MajorEvent[],
  previousFingerprints: ReadonlySet<string> = new Set(),
  limit = 5,
): MajorEvent[] {
  const ranked = [...events].sort((left, right) => importance(right) - importance(left) || right.day - left.day || left.id.localeCompare(right.id));
  const selected: MajorEvent[] = [];
  const typeCounts = new Map<string, number>();
  const fingerprints = new Set<string>();

  // Prefer developments this era did not simply inherit from the last one.
  for (const allowRecurrence of [false, true]) {
    for (const event of ranked) {
      if (selected.some((candidate) => candidate.id === event.id)) continue;
      const typeCount = typeCounts.get(event.type) ?? 0;
      const fingerprint = eventFingerprint(event);
      if (typeCount >= 2 || fingerprints.has(fingerprint)) continue;
      if (!allowRecurrence && previousFingerprints.has(fingerprint)) continue;
      selected.push(event);
      typeCounts.set(event.type, typeCount + 1);
      fingerprints.add(fingerprint);
      if (selected.length >= limit) break;
    }
    if (selected.length >= limit) break;
  }

  return selected.sort((left, right) => left.day - right.day || left.id.localeCompare(right.id));
}

function chapterTheme(index: number, moments: readonly MajorEvent[], measure: ChapterMeasure): string {
  if (index === 1) return "The First Claims";
  const defining = moments.slice().sort((left, right) => importance(right) - importance(left))[0];
  if (defining && !["birth", "death"].includes(defining.type)) {
    return defining.title;
  }
  if (defining?.type === "camp_captured" || defining?.type === "camp_destroyed") return "Borders Redrawn";
  if (defining?.type === "breakaway" || defining?.type === "camp_founded") return "New Powers Rising";
  if (defining?.type === "belief_schism" || defining?.type === "belief_reformed") return "Convictions Divided";
  if (defining?.type === "belief_founded" || measure.beliefs > Math.max(measure.wars, measure.advances)) return "New Convictions";
  if (defining?.type === "tech_unlocked" || measure.advances > Math.max(measure.wars, measure.beliefs)) return "An Age of Invention";
  if (defining?.type === "coup" || defining?.type === "power_lead_change") return "The Contest for Power";
  if (measure.wars > 0) return "The Years of Conflict";
  if (measure.identity > measure.political) return "Names and Leaders Remade";
  return "Generations in Motion";
}

function chapterSynopsis(
  start: number,
  end: number,
  events: readonly MajorEvent[],
  moments: readonly MajorEvent[],
  measure: ChapterMeasure,
  previous?: ChapterMeasure,
): string {
  if (events.length === 0) return `Days ${start}–${end} remain a quiet part of the surviving record.`;
  const measures: Array<[keyof ChapterMeasure, string]> = [
    ["political", "political upheaval"],
    ["wars", "open conflict"],
    ["advances", "advancement"],
    ["beliefs", "belief change"],
    ["identity", "changes of name and leadership"],
  ];
  const dominant = measures.sort((left, right) => measure[right[0]] - measure[left[0]])[0];
  const comparison = previous
    ? measures
        .map(([key, label]) => ({ label, delta: measure[key] - previous[key] }))
        .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta) || left.label.localeCompare(right.label))[0]
    : null;
  const change = comparison && comparison.delta !== 0
    ? ` Compared with the prior chapter, ${comparison.label} ${comparison.delta > 0 ? "rose" : "fell"} by ${Math.abs(comparison.delta)} recorded event${Math.abs(comparison.delta) === 1 ? "" : "s"}.`
    : "";
  const turningPoint = moments.slice().sort((left, right) => importance(right) - importance(left))[0];
  return `Across Days ${start}–${end}, the ledger records ${events.length} major events; ${dominant?.[1] ?? "daily survival"} defined the era. ${measure.births} people were born and ${measure.deaths} died.${change}${turningPoint ? ` Its clearest turning point was “${turningPoint.title}.”` : ""}`;
}

function campName(world: CivilizationWorldState, id: string | null) {
  return id ? world.camps.find((camp) => camp.id === id)?.name ?? "Lost camp" : "Unaffiliated";
}

function beliefName(world: CivilizationWorldState, id: string | null) {
  return id ? world.beliefs.find((belief) => belief.id === id)?.name ?? "Faded belief" : "Secular";
}

function Nav({ route }: { route: Route }) {
  return (
    <nav className="main-nav" aria-label="World sections">
      <a className={route === "map" ? "active" : ""} href="#/map">Map</a>
      <a className={route === "archive" ? "active" : ""} href="#/archive">Civilizations</a>
      <a className={route === "history" ? "active" : ""} href="#/history">History book</a>
    </nav>
  );
}

function MapCanvas({
  world,
  overlay,
  selection,
  onSelect,
}: {
  world: CivilizationWorldState;
  overlay: MapOverlayMode;
  selection: Selection;
  onSelect(selection: Selection): void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const visual = useMemo(
    () => toVisualWorld(world, overlay, selection?.kind === "belief" ? selection.id : null),
    [world, overlay, selection],
  );
  const visualRef = useRef(visual);
  const selectionRef = useRef(selection);
  const selectRef = useRef(onSelect);

  useEffect(() => {
    visualRef.current = visual;
    selectionRef.current = selection;
    selectRef.current = onSelect;
  }, [onSelect, selection, visual]);

  useEffect(() => {
    if (!mountRef.current) return;
    const controller = createCivilizationScene(mountRef.current, visualRef.current, {
      onAgentSelect: (id) => selectRef.current({ kind: "agent", id }),
      onCampSelect: (id) => selectRef.current({ kind: "camp", id }),
      onBeliefSelect: (id) => selectRef.current({ kind: "belief", id }),
    });
    let frame = 0;
    let last = performance.now();
    const render = (now: number) => {
      const delta = Math.min(0.1, Math.max(0, (now - last) / 1_000));
      last = now;
      const selected = selectionRef.current;
      const camera: CameraMode = selected?.kind === "agent"
        ? "followAgent"
        : selected?.kind === "camp" ? "followCamp" : "overview";
      controller.update(
        visualRef.current,
        selected?.kind === "agent" ? selected.id : null,
        selected?.kind === "camp" ? selected.id : null,
        camera,
        delta,
      );
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(frame);
      controller.dispose();
    };
  }, []);

  return <div className="map-canvas" ref={mountRef} />;
}

function AgentInspector({
  agent,
  world,
  onSelectAgent,
}: {
  agent: CivilizationAgent;
  world: CivilizationWorldState;
  onSelectAgent(id: string): void;
}) {
  const relatives = [...new Set([...agent.parentIds, ...agent.childrenIds])]
    .map((id) => world.agents.find((candidate) => candidate.id === id))
    .filter((candidate): candidate is CivilizationAgent => Boolean(candidate));
  return (
    <div className="inspector-body">
      <div className="entity-heading">
        <span className="avatar" style={{ "--entity": agent.color } as CSSProperties}>{agent.name.slice(0, 2).toUpperCase()}</span>
        <div><p>Autonomous agent · Gen {agent.generation}</p><h2>{agent.name}</h2></div>
      </div>
      <div className="metric-grid">
        <span><small>Camp</small><b>{campName(world, agent.campId)}</b></span>
        <span><small>Belief</small><b>{beliefName(world, agent.beliefId)}</b></span>
        <span><small>Power</small><b>{Math.round(agent.personalPower)}</b></span>
        <span><small>Influence</small><b>{Math.round(agent.influence + agent.spiritualInfluence)}</b></span>
      </div>
      <section className="thought-card"><small>Current plan</small><h3>{titleCase(agent.currentPlan)}</h3><p>{agent.goal}</p><blockquote>{agent.rationale}</blockquote></section>
      <section><div className="section-title"><span>Family tree</span><em>{agent.childrenIds.length} descendants</em></div>
        <div className="family-list">
          {relatives.length ? relatives.slice(0, 8).map((relative) => (
            <button type="button" key={relative.id} onClick={() => onSelectAgent(relative.id)}><i style={{ background: relative.color }} />{relative.name}<small>{agent.parentIds.includes(relative.id) ? "Parent" : "Child"}</small></button>
          )) : <p className="empty">No recorded relatives yet.</p>}
        </div>
      </section>
      <section><div className="section-title"><span>Recent reflections</span></div>
        {agent.recentMemories.slice(-3).reverse().map((memory) => <p className="memory" key={memory.id}>Day {memory.day} · {memory.summary}</p>)}
      </section>
    </div>
  );
}

function CampInspector({ camp, world }: { camp: CivilizationCamp; world: CivilizationWorldState }) {
  const leader = world.agents.find((agent) => agent.id === camp.leaderId);
  return <div className="inspector-body">
    <div className="entity-heading"><span className="camp-sigil" style={{ background: camp.color }} /><div><p>Civilization · founded day {camp.foundedDay}</p><h2>{camp.name}</h2></div></div>
    <div className="metric-grid">
      <span><small>Power</small><b>{Math.round(camp.power)}</b></span><span><small>Population</small><b>{camp.memberIds.length}</b></span>
      <span><small>Cohesion</small><b>{Math.round(camp.cohesion * 100)}%</b></span><span><small>Territory</small><b>{Math.round(camp.territoryRadius)}</b></span>
    </div>
    <section className="thought-card"><small>Leadership</small><h3>{leader?.name ?? "No living leader"}</h3><p>{camp.parentCampId ? `Broke from ${campName(world, camp.parentCampId)}` : "An original frontier claim"}</p></section>
    <section><div className="section-title"><span>Technology</span><em>{camp.technologies.length} advances</em></div><div className="tag-list">
      {camp.technologies.map((technology) => <span key={technology}>{TECHNOLOGY_LABELS[technology]}</span>)}
      {!camp.technologies.length && <p className="empty">No advances unlocked.</p>}
    </div></section>
    <section><div className="section-title"><span>Belief</span></div><p>{beliefName(world, camp.dominantBeliefId)} · shrine level {camp.shrineLevel}</p></section>
  </div>;
}

function BeliefInspector({ belief, world }: { belief: CivilizationBeliefSystem; world: CivilizationWorldState }) {
  const founder = world.agents.find((agent) => agent.id === belief.founderAgentId);
  return <div className="inspector-body">
    <div className="entity-heading"><span className="belief-orb" style={{ background: belief.color }} /><div><p>Belief system · founded day {belief.foundedDay}</p><h2>{belief.name}</h2></div></div>
    <div className="metric-grid"><span><small>Adherents</small><b>{belief.adherentIds.length}</b></span><span><small>Influence</small><b>{Math.round(belief.influence)}</b></span><span><small>Unity</small><b>{Math.round(belief.unity * 100)}%</b></span><span><small>Founder</small><b>{founder?.name ?? "Archived"}</b></span></div>
    <section><div className="section-title"><span>Core values</span></div><div className="tenets">{belief.tenets.map((tenet) => <article key={tenet}><b>{BELIEF_TENET_LABELS[tenet]}</b><p>An autonomously adopted principle shaping cooperation and power.</p></article>)}</div></section>
  </div>;
}

function AgentBrowserRow({
  agent,
  world,
  rank,
  selected,
  pinned = false,
  onSelect,
}: {
  agent: CivilizationAgent;
  world: CivilizationWorldState;
  rank: number;
  selected: boolean;
  pinned?: boolean;
  onSelect(): void;
}) {
  return <button
    type="button"
    className={`agent-row${selected ? " selected" : ""}${pinned ? " pinned" : ""}`}
    aria-current={selected ? "true" : undefined}
    onClick={onSelect}
  >
    <strong>{pinned ? "PIN" : String(rank).padStart(2, "0")}</strong>
    <i style={{ background: agent.color }} />
    <span>
      <b>{agent.name}</b>
      <small>{campName(world, agent.campId)} · {beliefName(world, agent.beliefId)}</small>
      <small className="agent-row-action">{agent.alive ? titleCase(agent.currentPlan) : "Archived"} · {agent.id}</small>
    </span>
    <em>{Math.round(agent.influence + agent.spiritualInfluence)}</em>
  </button>;
}

function MapView({
  world, history, overlay, setOverlay, selection, setSelection,
}: {
  world: CivilizationWorldState; history: MajorEvent[]; overlay: MapOverlayMode;
  setOverlay(value: MapOverlayMode): void; selection: Selection; setSelection(value: Selection): void;
}) {
  const [agentBrowserMode, setAgentBrowserMode] = useState<"top" | "find">("top");
  const [agentQuery, setAgentQuery] = useState("");
  const [agentPage, setAgentPage] = useState(0);
  const rankedAgents = useMemo(
    () => getRankedInfluentialAgents(world).filter((agent) => agent.alive),
    [world],
  );
  const leaders = rankedAgents.slice(0, 10);
  const selectedAgent = selection?.kind === "agent" ? world.agents.find((agent) => agent.id === selection.id) : undefined;
  const selectedCamp = selection?.kind === "camp" ? world.camps.find((camp) => camp.id === selection.id) : undefined;
  const selectedBelief = selection?.kind === "belief" ? world.beliefs.find((belief) => belief.id === selection.id) : undefined;
  const influenceRank = useMemo(
    () => new Map(rankedAgents.map((agent, index) => [agent.id, index + 1])),
    [rankedAgents],
  );
  const normalizedAgentQuery = agentQuery.trim().toLocaleLowerCase();
  const matchingAgents = useMemo(() => {
    if (!normalizedAgentQuery) return rankedAgents;
    return rankedAgents.filter((agent) => {
      const searchable = [
        agent.id,
        agent.name,
        campName(world, agent.campId),
        beliefName(world, agent.beliefId),
        agent.currentPlan,
        titleCase(agent.currentPlan),
        agent.goal,
      ].join(" ").toLocaleLowerCase();
      return searchable.includes(normalizedAgentQuery);
    });
  }, [normalizedAgentQuery, rankedAgents, world]);
  const agentPageCount = Math.max(1, Math.ceil(matchingAgents.length / AGENT_BROWSER_PAGE_SIZE));
  const safeAgentPage = Math.min(agentPage, agentPageCount - 1);
  const pagedAgents = matchingAgents.slice(
    safeAgentPage * AGENT_BROWSER_PAGE_SIZE,
    (safeAgentPage + 1) * AGENT_BROWSER_PAGE_SIZE,
  );
  const displayedAgents = agentBrowserMode === "top" ? leaders : pagedAgents;
  const pinnedAgent = selectedAgent && !displayedAgents.some((agent) => agent.id === selectedAgent.id)
    ? selectedAgent
    : undefined;

  function switchAgentBrowser(mode: "top" | "find") {
    setAgentBrowserMode(mode);
    setAgentPage(0);
  }

  return <main className="map-layout">
    <aside className={`ranking panel agent-browser agent-browser--${agentBrowserMode}`} aria-label="Agent browser">
      <div className="section-title"><span>Switch agents</span><em>{rankedAgents.length} living</em></div>
      <div
        className="agent-browser-tabs"
        role="tablist"
        aria-label="Agent lists"
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          const nextMode = agentBrowserMode === "top" ? "find" : "top";
          switchAgentBrowser(nextMode);
          document.getElementById(`agent-tab-${nextMode}`)?.focus();
        }}
      >
        <button type="button" id="agent-tab-top" role="tab" aria-controls="agent-roster" aria-selected={agentBrowserMode === "top"} className={agentBrowserMode === "top" ? "active" : ""} onClick={() => switchAgentBrowser("top")}>Top influence</button>
        <button type="button" id="agent-tab-find" role="tab" aria-controls="agent-roster" aria-selected={agentBrowserMode === "find"} className={agentBrowserMode === "find" ? "active" : ""} onClick={() => switchAgentBrowser("find")}>Find agents</button>
      </div>
      {agentBrowserMode === "find" && <div className="agent-search">
        <label htmlFor="agent-search-input">Name, camp, belief, action, or ID</label>
        <input
          id="agent-search-input"
          type="search"
          value={agentQuery}
          placeholder={`Search ${rankedAgents.length} living agents`}
          autoComplete="off"
          onChange={(event) => {
            setAgentQuery(event.target.value);
            setAgentPage(0);
          }}
        />
        <small aria-live="polite">{matchingAgents.length} {matchingAgents.length === 1 ? "match" : "matches"}</small>
      </div>}
      <div className="agent-list" id="agent-roster" role="tabpanel" aria-labelledby={agentBrowserMode === "top" ? "agent-tab-top" : "agent-tab-find"}>
        {pinnedAgent && <AgentBrowserRow
          agent={pinnedAgent}
          world={world}
          rank={influenceRank.get(pinnedAgent.id) ?? 0}
          selected
          pinned
          onSelect={() => setSelection({ kind: "agent", id: pinnedAgent.id })}
        />}
        {displayedAgents.map((agent) => <AgentBrowserRow
          key={agent.id}
          agent={agent}
          world={world}
          rank={influenceRank.get(agent.id) ?? 0}
          selected={selection?.kind === "agent" && selection.id === agent.id}
          onSelect={() => setSelection({ kind: "agent", id: agent.id })}
        />)}
        {!displayedAgents.length && <div className="agent-list-empty"><b>No living agents found</b><small>Try a name, camp, belief, action, or agent ID.</small></div>}
      </div>
      {agentBrowserMode === "find" && <nav className="agent-pagination" aria-label="Agent result pages">
        <button type="button" disabled={safeAgentPage === 0} onClick={() => setAgentPage(Math.max(0, safeAgentPage - 1))} aria-label="Previous agent results">←</button>
        <span>Page {safeAgentPage + 1} / {agentPageCount}<small>{AGENT_BROWSER_PAGE_SIZE} per page</small></span>
        <button type="button" disabled={safeAgentPage >= agentPageCount - 1} onClick={() => setAgentPage(Math.min(agentPageCount - 1, safeAgentPage + 1))} aria-label="Next agent results">→</button>
      </nav>}
    </aside>
    <section className="map-stage">
      <MapCanvas world={world} overlay={overlay} selection={selection} onSelect={setSelection} />
      <div className="overlay-switcher" role="group" aria-label="Map overlays">{OVERLAYS.map((item) => <button type="button" key={item.id} className={overlay === item.id ? "active" : ""} aria-pressed={overlay === item.id} onClick={() => setOverlay(item.id)}>{item.label}</button>)}</div>
      <div className="map-help">Drag to orbit · pinch or scroll to zoom · tap a person or camp</div>
    </section>
    <aside className="inspector panel">
      {selectedAgent ? <AgentInspector agent={selectedAgent} world={world} onSelectAgent={(id) => setSelection({ kind: "agent", id })} /> : selectedCamp ? <CampInspector camp={selectedCamp} world={world} /> : selectedBelief ? <BeliefInspector belief={selectedBelief} world={world} /> : <div className="empty-state"><span>◎</span><h2>Explore the living world</h2><p>Select an agent, camp, or belief on the map—or switch agents from the influence ranking.</p></div>}
    </aside>
    <section className="chronicle panel"><div className="section-title"><span>Live chronicle</span><a href="#/history">Open book →</a></div><div className="event-row">
      {history.slice(-8).reverse().map((event) => <article key={event.id} data-tone={event.tone}><small>DAY {event.day}</small><b>{event.title}</b><p>{event.message}</p></article>)}
    </div></section>
  </main>;
}

function ArchiveView({ world, history }: { world: CivilizationWorldState; history: MajorEvent[] }) {
  const camps = getRankedCamps(world);
  const beliefs = getRankedBeliefs(world);
  return <main className="reading-page">
    <header className="page-intro"><p className="eyebrow">Civilization intelligence</p><h1>The world beyond the map</h1><p>Compare every society, the ideas its people chose, and the moments that changed its course.</p></header>
    <section><div className="reading-heading"><h2>Civilizations</h2><span>{camps.filter((camp) => camp.active).length} active · {camps.length} recorded</span></div>
      <div className="civ-grid">{camps.map((camp) => {
        const leader = world.agents.find((agent) => agent.id === camp.leaderId);
        const moments = history.filter((event) => event.campIds.includes(camp.id)).sort((a, b) => importance(b) - importance(a)).slice(0, 3);
        return <article className={!camp.active ? "historical" : ""} key={camp.id} style={{ "--entity": camp.color } as CSSProperties}>
          <div className="card-top"><span /><small>{camp.active ? "ACTIVE" : "HISTORICAL"}</small></div><h3>{camp.name}</h3><p>Founded day {camp.foundedDay} by {world.agents.find((agent) => agent.id === camp.founderAgentId)?.name ?? "an archived founder"}.</p>
          <div className="metric-grid"><span><small>Power</small><b>{Math.round(camp.power)}</b></span><span><small>People</small><b>{camp.memberIds.length}</b></span><span><small>Leader</small><b>{leader?.name ?? "—"}</b></span><span><small>Belief</small><b>{beliefName(world, camp.dominantBeliefId)}</b></span></div>
          <div className="tag-list">{camp.technologies.map((technology) => <span key={technology}>{TECHNOLOGY_LABELS[technology]}</span>)}</div>
          <div className="moments"><b>Defining moments</b>{moments.map((event) => <p key={event.id}><small>D{event.day}</small>{event.title}</p>)}{!moments.length && <p>No defining events yet.</p>}</div>
        </article>;
      })}</div>
    </section>
    <section><div className="reading-heading"><h2>Beliefs and religions</h2><span>Created only when agents choose to believe</span></div>
      {beliefs.length ? <div className="belief-grid">{beliefs.map((belief) => <article key={belief.id} style={{ "--entity": belief.color } as CSSProperties}>
        <div className="card-top"><span /><small>{belief.active ? "LIVING" : "FADED"}</small></div><h3>{belief.name}</h3><p>Founded on day {belief.foundedDay} by {world.agents.find((agent) => agent.id === belief.founderAgentId)?.name ?? "an archived founder"}.</p>
        <div className="tag-list">{belief.tenets.map((tenet) => <span key={tenet}>{BELIEF_TENET_LABELS[tenet]}</span>)}</div><p>{belief.adherentIds.length} adherents · {belief.campIds.length} camps · {Math.round(belief.influence)} influence</p>
      </article>)}</div> : <div className="blank-slate"><span>◇</span><h3>No belief has been founded yet</h3><p>The agents are free to remain secular. A belief appears only when lived conditions make one worthwhile.</p></div>}
    </section>
  </main>;
}

function HistoryView({ world, history }: { world: CivilizationWorldState; history: MajorEvent[] }) {
  const chapterCount = Math.max(1, Math.floor((Math.max(1, world.day) - 1) / 200) + 1);
  const chronologicalChapters: Array<{
    index: number; start: number; end: number; events: MajorEvent[];
    moments: MajorEvent[]; measure: ChapterMeasure; complete: boolean;
  }> = [];
  let previousFingerprints = new Set<string>();
  for (let index = 0; index < chapterCount; index += 1) {
    const start = index * 200 + 1;
    const end = start + 199;
    const events = history.filter((event) => event.day >= start && event.day <= end);
    const moments = selectDiverseMoments(events, previousFingerprints);
    const measure = chapterMeasure(events);
    chronologicalChapters.push({ index: index + 1, start, end, events, moments, measure, complete: world.day > end });
    previousFingerprints = new Set(moments.map(eventFingerprint));
  }
  const chapters = chronologicalChapters.slice().reverse();
  return <main className="reading-page history-page">
    <header className="page-intro"><p className="eyebrow">A living record · 200 days per chapter</p><h1>The History of the Frontier</h1><p>Every chapter is compiled from events the agents caused themselves—births, betrayals, inventions, wars, beliefs, and changing names.</p></header>
    {chapters.map((chapter) => {
      const previous = chronologicalChapters[chapter.index - 2]?.measure;
      return <article className="chapter" key={chapter.index}>
        <header><div><p>CHAPTER {chapter.index} · DAYS {chapter.start}–{chapter.end}</p><h2>{chapterTheme(chapter.index, chapter.moments, chapter.measure)}</h2></div><span>{chapter.complete ? "COMPLETE" : `WRITING · DAY ${world.day}`}</span></header>
        <p className="chapter-synopsis">{chapterSynopsis(chapter.start, chapter.end, chapter.events, chapter.moments, chapter.measure, previous)}</p>
        <div className="chapter-stats"><span><b>{chapter.events.length}</b> major events</span><span><b>{chapter.measure.births}</b> births</span><span><b>{chapter.measure.wars}</b> wars</span><span><b>{chapter.measure.advances}</b> advances</span></div>
        <div className="timeline">{chapter.moments.length ? chapter.moments.map((event) => <div key={event.id} data-tone={event.tone}><small>DAY {event.day}</small><div><h3>{event.title}</h3><p>{event.message}</p><em>{titleCase(event.type)}</em></div></div>) : <div className="empty"><p>This chapter is still quiet. The agents are deciding what comes next.</p></div>}</div>
      </article>;
    })}
  </main>;
}

function SimulationApp({ initial }: { initial: LoadedWorld }) {
  const [route, setRoute] = useState<Route>(routeFromHash);
  const [world, setWorld] = useState(initial.world);
  const [history, setHistory] = useState(initial.history);
  const [speed, setSpeed] = useState(initial.speed || 4);
  const [overlay, setOverlay] = useState<MapOverlayMode>("world");
  const [selection, setSelection] = useState<Selection>(null);
  const [persistence, setPersistence] = useState(initial.persistence);
  const [saved, setSaved] = useState(true);
  const worldRef = useRef(world);
  const historyRef = useRef(history);
  const speedRef = useRef(speed);
  const lastAdvanceAtRef = useRef(0);
  const resetFrameClockRef = useRef(false);

  useEffect(() => {
    lastAdvanceAtRef.current = Date.now();
  }, []);

  useEffect(() => {
    worldRef.current = world;
    historyRef.current = history;
    speedRef.current = speed;
  }, [history, speed, world]);

  useEffect(() => {
    const onHash = () => setRoute(routeFromHash());
    addEventListener("hashchange", onHash);
    if (!location.hash) window.history.replaceState(null, "", "#/map");
    return () => removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    let batch = 0;
    let ui = 0;
    const tick = (now: number) => {
      if (resetFrameClockRef.current) {
        resetFrameClockRef.current = false;
        last = now;
        frame = requestAnimationFrame(tick);
        return;
      }
      if (document.visibilityState === "hidden") {
        last = now;
        frame = requestAnimationFrame(tick);
        return;
      }
      const elapsed = Math.min(0.5, Math.max(0, (now - last) / 1_000));
      last = now;
      lastAdvanceAtRef.current = Date.now();
      batch += elapsed;
      ui += elapsed;
      // A large world is several megabytes and the pure engine clones it once
      // per call. Batch more fixed steps into each call as population grows so
      // 1,000 agents do not cause eight full-world clones every real second.
      const retainedAgents = worldRef.current.agents.length;
      const simulationBatch = retainedAgents >= 800
        ? 0.75
        : retainedAgents >= 400 ? 0.35 : 0.12;
      if (speedRef.current > 0 && batch >= simulationBatch) {
        const next = simulateCivilization(worldRef.current, batch * speedRef.current);
        worldRef.current = next;
        historyRef.current = mergeHistory(
          historyRef.current,
          getGeneratedCivilizationEvents(next),
        );
        batch = 0;
        setSaved(false);
      }
      if (ui >= 0.55) {
        setWorld(worldRef.current);
        setHistory(historyRef.current);
        ui = 0;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const persist = async (savedAt = Date.now()) => {
      const mode = await saveWorld({ world: worldRef.current, history: historyRef.current, speed: speedRef.current, savedAt });
      setPersistence(mode);
      setSaved(true);
    };
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") void persist();
    }, 4_000);
    const onVisibility = () => {
      const now = Date.now();
      if (document.visibilityState === "hidden") {
        lastAdvanceAtRef.current = now;
        void persist(now);
        return;
      }
      const elapsed = Math.max(0, (now - lastAdvanceAtRef.current) / 1_000) * speedRef.current;
      if (elapsed > 0) {
        const next = catchUpCivilization(worldRef.current, elapsed);
        worldRef.current = next;
        historyRef.current = mergeHistory(
          historyRef.current,
          getGeneratedCivilizationEvents(next),
        );
        setWorld(next);
        setHistory(historyRef.current);
        setSaved(false);
      }
      lastAdvanceAtRef.current = now;
      resetFrameClockRef.current = true;
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { clearInterval(interval); document.removeEventListener("visibilitychange", onVisibility); void persist(); };
  }, []);

  const summary = getCivilizationSummary(world);
  const reset = async () => {
    if (!confirm("Start a completely new device-local world? This permanently clears this browser's civilization and history book.")) return;
    await clearWorld();
    const next = createCivilizationWorld(Date.now());
    worldRef.current = next; historyRef.current = [...next.majorEvents];
    setWorld(next); setHistory([...next.majorEvents]); setSelection(null); setSaved(false); location.hash = "#/map";
  };

  return <div className="app-shell">
    <header className="site-header"><a className="brand" href="#/map"><span>W</span><div><b>WILDGRID</b><small>AUTONOMOUS CIVILIZATION</small></div></a><Nav route={route} />
      <div className="header-actions"><label>Speed<select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}><option value={0}>Paused</option><option value={1}>1×</option><option value={4}>4×</option><option value={12}>12×</option></select></label><button onClick={() => void reset()}>New world</button></div>
    </header>
    <div className="local-banner"><span>●</span><b>{persistence === "memory" ? "Temporary world" : "Saved on this device"}</b><p>This GitHub Pages edition has no shared server. It keeps running while open and catches up when this browser returns.</p><em>{saved ? "SAVED" : "SAVING"}</em></div>
    <section className="world-stats"><span><small>{getWorldTimeLabel(world)}</small><b>{summary.mostPowerfulCampName ?? "The frontier"}</b></span><span><small>Population</small><b>{summary.population}</b></span><span><small>Camps</small><b>{summary.activeCamps}</b></span><span><small>Wars</small><b>{summary.wars}</b></span><span><small>Beliefs</small><b>{summary.activeBeliefs}</b></span><span><small>Events kept</small><b>{compact(history.length)}</b></span></section>
    {route === "map" ? <MapView world={world} history={history} overlay={overlay} setOverlay={setOverlay} selection={selection} setSelection={setSelection} /> : route === "archive" ? <ArchiveView world={world} history={history} /> : <HistoryView world={world} history={history} />}
  </div>;
}

export function App() {
  const [initial, setInitial] = useState<LoadedWorld | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { loadWorld().then(setInitial).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "World could not be opened")); }, []);
  if (error) return <div className="boot"><span>!</span><h1>World unavailable</h1><p>{error}</p><button onClick={() => location.reload()}>Try again</button></div>;
  if (!initial) return <div className="boot"><span>W</span><h1>Opening the frontier</h1><p>Restoring this device’s autonomous civilization…</p></div>;
  return <SimulationApp initial={initial} />;
}
