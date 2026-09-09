"use client";

import { Camera, CloudRain, Eye, List, Map, Maximize2, Pause, Play, RotateCcw, Settings2, Users, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SurvivalAgent, SurvivalEvent, SurvivalRunState } from "../simulation/survival";
import { AgentInspector, type InspectorLevel } from "./agent-inspector";
import { AgentsView } from "./agents-view";
import { AGENT_IDS, AgentPortrait, formatClock, humanize } from "./presentation";
import { RunView } from "./run-view";
import type { HabitatCameraMode, SurvivalAgentId } from "./scene";
import { SurvivalWorld } from "./survival-world";
import { TimelineView } from "./timeline-view";
import { useSurvivalRuntime, type PlaybackSpeed } from "./use-survival-runtime";
import styles from "./survival-experience.module.css";

type AppView = "world" | "agents" | "timeline" | "run";

const VIEW_LABELS: Record<AppView, string> = { world: "World", agents: "Agents", timeline: "Timeline", run: "Run" };

function currentSlotAgents(world: SurvivalRunState) {
  return AGENT_IDS.slice(0, world.config.agentCap).map((label) => {
    const records = world.agents.filter((agent) => agent.label === label).sort((left, right) => right.spawnedAt - left.spawnedAt);
    return records.find(({ alive }) => alive) ?? records[0] ?? null;
  });
}

function MiniMap({ world, selectedId, onSelect }: { world: SurvivalRunState; selectedId: string | null; onSelect(id: string): void }) {
  const bounds = world.environment.bounds;
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const depth = Math.max(1, bounds.maxZ - bounds.minZ);
  return <div className={styles.miniMap} aria-label="Habitat minimap"><span>Habitat overview</span><div>{world.agents.filter(({ alive }) => alive).map((agent) => <button key={agent.id} type="button" aria-label={`Select ${agent.label}, ${agent.name}`} data-selected={selectedId === agent.id} onClick={() => onSelect(agent.id)} style={{ left: `${(agent.position.x - bounds.minX) / width * 100}%`, top: `${(agent.position.z - bounds.minZ) / depth * 100}%`, "--mini-color": `var(--${agent.label.toLowerCase()})` } as React.CSSProperties}>{agent.label}</button>)}</div></div>;
}

function AgentRail({ world, selectedId, onSelect }: { world: SurvivalRunState; selectedId: string | null; onSelect(agent: SurvivalAgent): void }) {
  const slots = currentSlotAgents(world);
  return <div className={styles.agentRail} aria-label="Agents in this run">{slots.map((agent, index) => {
    const label = AGENT_IDS[index];
    return agent ? <button type="button" key={`${label}-${agent.id}`} data-selected={selectedId === agent.id} data-alive={agent.alive} aria-label={`${label}, ${agent.name}, ${agent.alive ? "living" : "historical record"}`} aria-pressed={selectedId === agent.id} onClick={() => onSelect(agent)}><AgentPortrait id={label} name={agent.name} size="small" /><span>{label}</span><i aria-hidden="true" /></button> : <div className={styles.emptyRailSlot} key={label}><span>{label}</span><small>Empty</small></div>;
  })}</div>;
}

function WorldHeader({ world, speed, onSpeed, onPause }: { world: SurvivalRunState; speed: PlaybackSpeed; onSpeed(speed: PlaybackSpeed): void; onPause(): void }) {
  const isPaused = world.status === "paused";
  const isTerminal = world.status === "completed" || world.status === "extinct";
  return <header className={styles.appHeader}>
    <div className={styles.appTitle}><strong>Simulation</strong><span><i data-status={world.status} />{world.status === "running" ? "Run active" : humanize(world.status)}</span></div>
    <div className={styles.clock}><span>Day {world.day}</span><strong>{formatClock(world.elapsedMinutes)}</strong></div>
    <div className={styles.playback} aria-label="Observer playback controls">
      <button type="button" onClick={onPause} disabled={isTerminal} aria-label={isTerminal ? "Playback unavailable for an ended run" : isPaused ? "Resume simulation" : "Pause simulation"}>{isPaused ? <Play size={18} /> : <Pause size={18} />}</button>
      <label><span>Speed</span><select value={speed} onChange={(event) => onSpeed(Number(event.target.value) as PlaybackSpeed)} disabled={world.status === "completed" || world.status === "extinct"}>{([0.5,1,2,4] as PlaybackSpeed[]).map((value) => <option value={value} key={value}>{value}×</option>)}</select></label>
    </div>
  </header>;
}

function BottomNavigation({ view, onChange }: { view: AppView; onChange(view: AppView): void }) {
  const items: Array<{ id: AppView; icon: typeof Map }> = [{ id: "world", icon: Map }, { id: "agents", icon: Users }, { id: "timeline", icon: List }, { id: "run", icon: Settings2 }];
  return <nav className={styles.bottomNav} aria-label="Simulation views">{items.map(({ id, icon: Icon }) => <button type="button" key={id} data-active={view === id} aria-current={view === id ? "page" : undefined} onClick={() => onChange(id)}><Icon size={20} /><span>{VIEW_LABELS[id]}</span></button>)}</nav>;
}

export function SurvivalExperience() {
  const runtime = useSurvivalRuntime();
  const [view, setView] = useState<AppView>("world");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetLevel, setSheetLevel] = useState<InspectorLevel>("peek");
  const [cameraMode, setCameraMode] = useState<HabitatCameraMode>("overview");
  const [manualCamera, setManualCamera] = useState(false);
  const [miniMapOpen, setMiniMapOpen] = useState(false);
  const [rendererFailed, setRendererFailed] = useState(false);
  const [rendererRetry, setRendererRetry] = useState(0);
  const [focusPosition, setFocusPosition] = useState<{ x: number; z: number } | null>(null);
  const [directoryInspectorOpen, setDirectoryInspectorOpen] = useState(false);
  const directoryDialogRef = useRef<HTMLDialogElement>(null);
  const sheetDragRef = useRef<{ y: number; level: InspectorLevel } | null>(null);
  const initializedHistoryRef = useRef(false);
  const world = runtime.world;

  const slotAgents = useMemo(() => world ? currentSlotAgents(world) : [], [world]);
  const effectiveSelectedId = selectedId ?? (slotAgents.find((agent) => agent?.alive) ?? slotAgents.find(Boolean))?.id ?? null;
  const selectedAgent = useMemo(() => {
    if (!world || !effectiveSelectedId) return null;
    return world.agents.find((agent) => agent.id === effectiveSelectedId) ?? null;
  }, [effectiveSelectedId, world]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const initial = url.searchParams.get("view") as AppView | null;
    const initialView = initial && Object.hasOwn(VIEW_LABELS, initial) ? initial : "world";
    const initialization = window.setTimeout(() => setView(initialView), 0);
    window.history.replaceState({ ...(window.history.state ?? {}), simulationView: initial ?? "world" }, "", url);
    initializedHistoryRef.current = true;
    const onPopState = () => {
      const next = new URL(window.location.href).searchParams.get("view") as AppView | null;
      setView(next && Object.hasOwn(VIEW_LABELS, next) ? next : "world");
      setDirectoryInspectorOpen(false);
      setMiniMapOpen(false);
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      window.clearTimeout(initialization);
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  useEffect(() => {
    const dialog = directoryDialogRef.current;
    if (!dialog) return;
    if (directoryInspectorOpen && !dialog.open) dialog.showModal();
    if (!directoryInspectorOpen && dialog.open) dialog.close();
  }, [directoryInspectorOpen]);

  const selectAgent = useCallback((id: string, follow = false) => {
    setSelectedId(id);
    setFocusPosition(null);
    if (follow) {
      setCameraMode("follow");
      setManualCamera(false);
    }
  }, []);

  const handleSceneSelect = useCallback((label: SurvivalAgentId) => {
    const agent = slotAgents.find((candidate) => candidate?.alive && candidate.label === label);
    if (!agent) return;
    selectAgent(agent.id);
    setSheetLevel("peek");
  }, [selectAgent, slotAgents]);

  const handleManualCamera = useCallback(() => {
    setCameraMode("free");
    setManualCamera(true);
    setFocusPosition(null);
  }, []);

  const handleContextLost = useCallback(() => {
    setRendererFailed(true);
  }, []);

  function navigate(next: AppView, replace = false) {
    setDirectoryInspectorOpen(false);
    setMiniMapOpen(false);
    if (next === view) return;
    setView(next);
    if (!initializedHistoryRef.current) return;
    const url = new URL(window.location.href);
    if (next === "world") url.searchParams.delete("view"); else url.searchParams.set("view", next);
    window.history[replace ? "replaceState" : "pushState"]({ ...(window.history.state ?? {}), simulationView: next }, "", url);
  }

  function selectFromRail(agent: SurvivalAgent) {
    selectAgent(agent.id, agent.alive);
    setSheetLevel("peek");
  }

  function locateEvent(event: SurvivalEvent) {
    const agent = event.agentIds.map((id) => world?.agents.find((candidate) => candidate.id === id)).find(Boolean);
    if (agent) setSelectedId(agent.id);
    setFocusPosition(event.position ? { ...event.position } : null);
    navigate("world");
    setCameraMode(event.position ? "overview" : agent?.alive ? "follow" : "overview");
    setManualCamera(false);
  }

  function sheetPointerDown(event: React.PointerEvent<HTMLElement>) {
    sheetDragRef.current = { y: event.clientY, level: sheetLevel };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function sheetPointerUp(event: React.PointerEvent<HTMLElement>) {
    const start = sheetDragRef.current;
    sheetDragRef.current = null;
    if (!start) return;
    const delta = event.clientY - start.y;
    if (Math.abs(delta) < 42) return;
    const levels: InspectorLevel[] = ["peek", "half", "expanded"];
    const current = levels.indexOf(start.level);
    setSheetLevel(levels[Math.max(0, Math.min(levels.length - 1, current + (delta < 0 ? 1 : -1)))]);
  }

  if (!runtime.ready || !world) return <main className={styles.loading}><div><span /><strong>Simulation</strong><p>Preparing the survival habitat and restoring its observation record…</p></div></main>;

  const weatherLabel = world.environment.weather === "overcast" ? "Cloud cover" : humanize(world.environment.weather);
  return <main className={styles.shell} data-view={view}>
    <WorldHeader world={world} speed={runtime.speed} onSpeed={runtime.setSpeed} onPause={() => runtime.setPaused(world.status !== "paused")} />

    {runtime.recoveryNotice ? <div className={styles.recoveryBanner} role="alert"><span>{runtime.recoveryNotice}</span><button type="button" onClick={runtime.dismissRecoveryNotice} aria-label="Dismiss checkpoint recovery notice"><X size={17} /></button></div> : null}

    <div className={styles.content}>
      <section className={styles.worldView} aria-label="Live survival world" hidden={view !== "world"}>
        <div className={styles.worldCanvas} data-failed={rendererFailed}>
          {!rendererFailed ? <SurvivalWorld world={world} selectedId={selectedAgent?.alive ? selectedAgent.label as SurvivalAgentId : null} cameraMode={cameraMode} onSelectAgent={handleSceneSelect} onManualCamera={handleManualCamera} onContextLost={handleContextLost} retryKey={rendererRetry} active={view === "world"} focusPosition={focusPosition} inspectorLevel={sheetLevel} /> : <div className={styles.rendererFallback}><Camera size={27} /><h2>3D view unavailable</h2><p>The run is still active. Agent records and the timeline remain available.</p><button type="button" onClick={() => { setRendererFailed(false); setRendererRetry((current) => current + 1); }}><RotateCcw size={16} /> Retry renderer</button></div>}
        </div>

        <div className={styles.weatherChip}><CloudRain size={16} /><span><strong>{weatherLabel}</strong><small>{Math.round(world.environment.temperatureC)}°C</small></span></div>
        <div className={styles.cameraControls} aria-label="Camera controls">
          <button type="button" aria-label={rendererFailed ? "Overview unavailable while the 3D view is unavailable" : "Show habitat overview"} data-active={!rendererFailed && cameraMode === "overview" && !manualCamera && !focusPosition} disabled={rendererFailed} onClick={() => { setFocusPosition(null); setCameraMode("overview"); setManualCamera(false); }} aria-pressed={!rendererFailed && cameraMode === "overview" && !manualCamera && !focusPosition}><Maximize2 size={17} /><span>Overview</span></button>
          <button type="button" aria-label={rendererFailed ? "Follow unavailable while the 3D view is unavailable" : selectedAgent ? `Follow ${selectedAgent.label}` : "Follow selected agent"} data-active={!rendererFailed && cameraMode === "follow" && Boolean(selectedAgent?.alive)} disabled={rendererFailed || !selectedAgent?.alive} onClick={() => { setFocusPosition(null); setCameraMode("follow"); setManualCamera(false); }} aria-pressed={!rendererFailed && cameraMode === "follow" && Boolean(selectedAgent?.alive)}><Eye size={17} /><span>Follow</span></button>
          <button type="button" aria-label="Toggle habitat minimap" onClick={() => setMiniMapOpen((current) => !current)} aria-expanded={miniMapOpen}><Map size={17} /><span>Map</span></button>
        </div>
        {manualCamera && selectedAgent?.alive ? <button type="button" className={styles.returnFollow} onClick={() => { setFocusPosition(null); setCameraMode("follow"); setManualCamera(false); }}><Eye size={16} /> Return to {selectedAgent.label}</button> : null}
        {miniMapOpen ? <MiniMap world={world} selectedId={effectiveSelectedId} onSelect={(id) => { selectAgent(id, true); setMiniMapOpen(false); }} /> : null}

        {selectedAgent ? <div className={styles.agentSheet} data-level={sheetLevel}>
          <div className={styles.sheetDragZone} onPointerDown={sheetPointerDown} onPointerUp={sheetPointerUp} />
          <AgentRail world={world} selectedId={effectiveSelectedId} onSelect={selectFromRail} />
          <AgentInspector world={world} agent={selectedAgent} level={sheetLevel} onLevelChange={setSheetLevel} onSelectAgent={(id) => { const nextAgent = world.agents.find((agent) => agent.id === id); selectAgent(id, Boolean(nextAgent?.alive)); }} onHandlePointerDown={sheetPointerDown} onHandlePointerUp={sheetPointerUp} />
        </div> : null}
      </section>

      <div className={styles.viewLayer} hidden={view !== "agents"}><AgentsView world={world} selectedId={effectiveSelectedId} onInspect={(agent) => { setSelectedId(agent.id); setDirectoryInspectorOpen(true); }} onViewInWorld={(agent) => { selectAgent(agent.id, true); setSheetLevel("half"); navigate("world"); }} /></div>
      <div className={styles.viewLayer} hidden={view !== "timeline"}><TimelineView world={world} onLocate={locateEvent} /></div>
      <div className={styles.viewLayer} hidden={view !== "run"}><RunView world={world} storageStatus={runtime.storageStatus} onStart={(options, seed) => { runtime.start(options, seed); setSelectedId(null); setFocusPosition(null); setSheetLevel("peek"); setCameraMode("overview"); setManualCamera(false); navigate("world"); }} onAddAgent={runtime.addAgent} /></div>
    </div>

    <BottomNavigation view={view} onChange={navigate} />

    <dialog ref={directoryDialogRef} className={styles.directoryDialog} aria-labelledby="agent-record-dialog-title" onCancel={() => setDirectoryInspectorOpen(false)}>
      <header><span id="agent-record-dialog-title">Agent record</span><button type="button" onClick={() => setDirectoryInspectorOpen(false)} aria-label="Close agent record"><X size={20} /></button></header>
      {selectedAgent ? <AgentInspector world={world} agent={selectedAgent} level="expanded" onLevelChange={() => setDirectoryInspectorOpen(false)} onSelectAgent={(id) => setSelectedId(id)} /> : null}
      {selectedAgent?.alive ? <button className={styles.dialogWorldButton} type="button" onClick={() => { setDirectoryInspectorOpen(false); setSheetLevel("half"); setCameraMode("follow"); setManualCamera(false); navigate("world"); }}><Eye size={17} /> View {selectedAgent.label} in world</button> : null}
    </dialog>

    <div className={styles.srStatus} aria-live="polite">{runtime.lastEvents.join(" ")}</div>
  </main>;
}
