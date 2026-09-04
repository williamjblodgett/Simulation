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
  Apple,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Droplets,
  Eye,
  Focus,
  Heart,
  Leaf,
  Map as MapIcon,
  Package,
  Pause,
  Play,
  RotateCcw,
  Shield,
  Sparkles,
  StepForward,
  TreePine,
  Users,
  Zap,
} from "lucide-react";
import {
  ACTION_LABELS,
  FIXED_STEP,
  createWorld,
  getTimeLabel,
  simulateWorld,
  stepWorld,
  type AgentState,
  type WorldState,
} from "./simulation/engine";
import {
  createWorldScene,
  type CameraMode,
  type VisualWorld,
} from "./simulation/scene";

const INITIAL_SEED = 372_941;
const SPEEDS = [0.5, 1, 2, 4] as const;

type EventFilter = "all" | "selected" | "critical";
type LooseCamp = {
  food?: number;
  water?: number;
  wood?: number;
  inventory?: { food?: number; water?: number; wood?: number };
  storage?: { food?: number; water?: number; wood?: number };
};
type LooseEvent = {
  id?: number;
  type?: string;
  kind?: string;
  message?: string;
  text?: string;
  time?: number;
  agentId?: string;
  agentIds?: string[];
  severity?: string;
  tone?: string;
};

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function humanize(value: string) {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function actionLabel(action: AgentState["action"]) {
  const key = String(action);
  return (ACTION_LABELS as Record<string, string>)[key] ?? humanize(key);
}

function campStock(world: WorldState, kind: "food" | "water" | "wood") {
  const camp = world.camp as unknown as LooseCamp;
  return Math.round(camp[kind] ?? camp.storage?.[kind] ?? camp.inventory?.[kind] ?? 0);
}

function personalityScore(agent: AgentState, key: "altruism" | "cooperation" | "curiosity") {
  const personality = agent.personality as unknown as Record<string, number>;
  const raw = personality?.[key] ?? personality?.cooperation ?? personality?.altruism ?? 0.5;
  return clamp(raw <= 1 ? raw * 100 : raw);
}

function contributionTotal(agent: AgentState) {
  const raw = agent.contribution as unknown;
  if (typeof raw === "number") return Math.round(raw);
  if (raw && typeof raw === "object") {
    return Math.round(Object.values(raw as Record<string, unknown>).reduce<number>(
      (total, value) => total + (typeof value === "number" ? value : 0),
      0,
    ));
  }
  return 0;
}

function eventView(event: WorldState["events"][number]) {
  const raw = event as unknown as LooseEvent;
  const type = raw.type ?? raw.kind ?? "world";
  return {
    id: raw.id ?? 0,
    type,
    message: raw.message ?? raw.text ?? humanize(type),
    time: raw.time ?? 0,
    agentIds: raw.agentIds ?? (raw.agentId == null ? [] : [raw.agentId]),
    critical: raw.severity === "critical" || raw.tone === "critical" || /death|critical|collapse|starv|dehydrat|rescue|upgrade/i.test(type),
  };
}

function elapsedLabel(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function toVisualWorld(world: WorldState): VisualWorld {
  return {
    seed: world.seed,
    elapsed: world.time,
    agents: world.agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      color: agent.color,
      position: agent.position,
      velocity: agent.velocity,
      alive: agent.alive,
      health: agent.health,
      inventory: agent.inventory,
    })),
    resources: world.resources.map((resource) => ({
      id: resource.id,
      kind: resource.kind,
      position: resource.position,
      amount: resource.amount,
      capacity: resource.maxAmount,
    })),
    camp: { position: world.camp.position, level: world.camp.level },
  };
}

function Meter({ label, value, color, icon }: { label: string; value: number; color: string; icon: React.ReactNode }) {
  const safeValue = clamp(value);
  return (
    <div className="need-meter">
      <div className="need-label"><span className="need-name">{icon}{label}</span><span>{Math.round(safeValue)}%</span></div>
      <div className="need-track" aria-hidden="true"><span style={{ width: `${safeValue}%`, background: color }} /></div>
    </div>
  );
}

function SimulationCanvas({
  worldRef,
  selectedAgentId,
  cameraMode,
  paused,
  speed,
  worldVersion,
  onSnapshot,
  onSelectAgent,
  onCameraModeChange,
}: {
  worldRef: MutableRefObject<WorldState>;
  selectedAgentId: string;
  cameraMode: CameraMode;
  paused: boolean;
  speed: number;
  worldVersion: number;
  onSnapshot: (world: WorldState) => void;
  onSelectAgent: (id: string) => void;
  onCameraModeChange: (mode: CameraMode) => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef(selectedAgentId);
  const cameraRef = useRef(cameraMode);
  const pausedRef = useRef(paused);
  const speedRef = useRef(speed);

  useEffect(() => { selectedRef.current = selectedAgentId; }, [selectedAgentId]);
  useEffect(() => { cameraRef.current = cameraMode; }, [cameraMode]);
  useEffect(() => { pausedRef.current = paused; }, [paused]);
  useEffect(() => { speedRef.current = speed; }, [speed]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let sceneController: ReturnType<typeof createWorldScene>;
    try {
      sceneController = createWorldScene(mount, toVisualWorld(worldRef.current), {
        onAgentSelect: onSelectAgent,
        onCameraModeChange,
      });
    } catch {
      mount.dataset.webglError = "true";
      return;
    }

    let animationFrame = 0;
    let previousTime = performance.now();
    let accumulator = 0;
    let publishTimer = 0;
    const frame = (now: number) => {
      const realDelta = Math.min((now - previousTime) / 1000, 0.1);
      previousTime = now;
      if (!pausedRef.current) {
        accumulator += realDelta * speedRef.current;
        let steps = 0;
        while (accumulator >= FIXED_STEP && steps < 16) {
          worldRef.current = simulateWorld(worldRef.current, FIXED_STEP);
          accumulator -= FIXED_STEP;
          steps += 1;
        }
      }
      sceneController.update(toVisualWorld(worldRef.current), selectedRef.current, cameraRef.current, realDelta);
      publishTimer += realDelta;
      if (publishTimer >= 0.16) {
        publishTimer = 0;
        onSnapshot(worldRef.current);
      }
      animationFrame = requestAnimationFrame(frame);
    };
    animationFrame = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(animationFrame);
      sceneController.dispose();
    };
  }, [onCameraModeChange, onSelectAgent, onSnapshot, worldRef, worldVersion]);

  return (
    <div ref={mountRef} className="world-canvas" aria-label="Live three-dimensional autonomous habitat">
      <div className="webgl-fallback"><Sparkles size={18} /><span>The habitat needs WebGL to render.</span></div>
    </div>
  );
}

function ResourceStat({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className="resource-stat">
      <span className="resource-icon" style={{ color }}>{icon}</span>
      <span><b>{value}</b><small>{label}</small></span>
    </div>
  );
}

export function SimulationExperience() {
  const [initialWorld] = useState<WorldState>(() => createWorld(INITIAL_SEED));
  const worldRef = useRef<WorldState>(initialWorld);
  const [hud, setHud] = useState<WorldState>(initialWorld);
  const [selectedAgentId, setSelectedAgentId] = useState(initialWorld.agents[0]?.id ?? "");
  const [cameraMode, setCameraMode] = useState<CameraMode>("overview");
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState<number>(1);
  const [eventFilter, setEventFilter] = useState<EventFilter>("all");
  const [resetOpen, setResetOpen] = useState(false);
  const [worldVersion, setWorldVersion] = useState(0);

  const selected = hud.agents.find((agent) => agent.id === selectedAgentId) ?? hud.agents[0];
  const alive = hud.agents.filter((agent) => agent.alive).length;
  const cooperation = Math.round(hud.agents.reduce((total, agent) => total + personalityScore(agent, "altruism"), 0) / Math.max(1, hud.agents.length));
  const resourceHealth = Math.round((hud.resources.reduce((total, resource) => total + resource.amount / Math.max(1, resource.maxAmount), 0) / Math.max(1, hud.resources.length)) * 100);

  const selectAgent = useCallback((id: string) => {
    setSelectedAgentId(id);
    setCameraMode("follow");
  }, []);
  const publishSnapshot = useCallback((world: WorldState) => setHud(world), []);
  const cycleAgent = useCallback((direction: number) => {
    const agents = worldRef.current.agents;
    if (!agents.length) return;
    const current = agents.findIndex((agent) => agent.id === selectedAgentId);
    const next = (Math.max(0, current) + direction + agents.length) % agents.length;
    setSelectedAgentId(agents[next].id);
    setCameraMode("follow");
  }, [selectedAgentId, worldRef]);
  const advanceOneStep = useCallback(() => {
    worldRef.current = stepWorld(worldRef.current);
    setHud(worldRef.current);
  }, [worldRef]);
  const resetSimulation = useCallback((newWorld: boolean) => {
    const seed = newWorld ? ((worldRef.current.seed * 1_664_525 + 1_013_904_223) >>> 0) : worldRef.current.seed;
    const next = createWorld(seed);
    worldRef.current = next;
    setHud(next);
    setSelectedAgentId(next.agents[0]?.id ?? "");
    setCameraMode("overview");
    setPaused(false);
    setWorldVersion((version) => version + 1);
    setResetOpen(false);
  }, [worldRef]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
      if (event.code === "Space") {
        event.preventDefault();
        setPaused((value) => !value);
      } else if (event.key === "[") cycleAgent(-1);
      else if (event.key === "]") cycleAgent(1);
      else if (event.key.toLowerCase() === "f") setCameraMode("follow");
      else if (event.key === "Escape") {
        if (resetOpen) setResetOpen(false);
        else setCameraMode("overview");
      } else if (["1", "2", "3", "4"].includes(event.key)) setSpeed(SPEEDS[Number(event.key) - 1]);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cycleAgent, resetOpen]);

  const events = useMemo(() => {
    const viewed = hud.events.map(eventView).sort((a, b) => b.id - a.id);
    if (eventFilter === "selected") return viewed.filter((event) => event.agentIds.includes(selectedAgentId));
    if (eventFilter === "critical") return viewed.filter((event) => event.critical);
    return viewed;
  }, [eventFilter, hud.events, selectedAgentId]);
  const latestCritical = useMemo(() => [...hud.events].reverse().map(eventView).find((event) => event.critical)?.message ?? "", [hud.events]);

  if (!selected) return null;

  const agentStyle = { "--agent-color": selected.color } as CSSProperties;
  const foodStored = campStock(hud, "food");
  const waterStored = campStock(hud, "water");
  const woodStored = campStock(hud, "wood");
  const targetDistance = selected.target?.position ? Math.hypot(selected.target.position.x - selected.position.x, selected.target.position.z - selected.position.z) : 0;
  const nourishment = selected.hunger;

  return (
    <main className="sim-shell" style={agentStyle}>
      <SimulationCanvas worldRef={worldRef} selectedAgentId={selectedAgentId} cameraMode={cameraMode} paused={paused} speed={speed} worldVersion={worldVersion} onSnapshot={publishSnapshot} onSelectAgent={selectAgent} onCameraModeChange={setCameraMode} />
      <div className="world-vignette" aria-hidden="true" />

      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark"><Leaf size={15} strokeWidth={2.2} /></span>
          <div><div className="brand-name">WILDGRID</div><div className="brand-sub">Autonomous survival ecology</div></div>
        </div>
        <div className="world-status" aria-label="World status">
          <div className="status-item"><span className="status-label">World time</span><b className="status-value">{getTimeLabel(hud)}</b></div>
          <div className="status-item"><span className="status-label">Population</span><b className="status-value">{String(alive).padStart(2, "0")} / {String(hud.agents.length).padStart(2, "0")}</b></div>
          <div className="status-item status-item-wide"><span className="status-label">Camp stores</span><b className="status-value stores-value"><Apple size={11} /> {foodStored}<Droplets size={11} /> {waterStored}<TreePine size={11} /> {woodStored}</b></div>
          <span className={`live-pill ${paused ? "paused" : ""}`}><span className="live-dot" /> {paused ? "PAUSED" : "LIVE"}</span>
        </div>
        <div className="top-controls">
          <div className="camera-switch" aria-label="Camera mode">
            <button className={cameraMode === "overview" ? "active" : ""} onClick={() => setCameraMode("overview")} aria-label="Overview camera" aria-pressed={cameraMode === "overview"} title="Overview camera (Esc)"><MapIcon size={14} /></button>
            <button className={cameraMode === "follow" ? "active" : ""} onClick={() => setCameraMode("follow")} aria-label="Follow selected agent" aria-pressed={cameraMode === "follow"} title="Follow selected agent (F)"><Focus size={14} /></button>
            <button className={cameraMode === "free" ? "active" : ""} onClick={() => setCameraMode("free")} aria-label="Free orbit camera" aria-pressed={cameraMode === "free"} title="Free orbit camera"><Eye size={14} /></button>
          </div>
          <button className="icon-control primary-control" onClick={() => setPaused((value) => !value)} aria-label={paused ? "Resume simulation" : "Pause simulation"} title={`${paused ? "Resume" : "Pause"} (Space)`}>{paused ? <Play size={15} fill="currentColor" /> : <Pause size={15} fill="currentColor" />}</button>
          <div className="speed-switch" aria-label="Simulation speed">{SPEEDS.map((option) => <button key={option} className={speed === option ? "active" : ""} onClick={() => setSpeed(option)} aria-pressed={speed === option}>{option}×</button>)}</div>
          <button className="icon-control step-control" onClick={advanceOneStep} disabled={!paused} aria-label="Advance one simulation step" title="Step forward while paused"><StepForward size={15} /></button>
          <div className="reset-wrap">
            <button className="icon-control" onClick={() => setResetOpen((open) => !open)} aria-label="Restart or create a new world" aria-expanded={resetOpen} title="Restart world"><RotateCcw size={15} /></button>
            {resetOpen && <div className="reset-popover" role="dialog" aria-label="Restart simulation">
              <button onClick={() => resetSimulation(false)}><RotateCcw size={14} /><span><b>Restart seed</b><small>Replay #{hud.seed}</small></span></button>
              <button onClick={() => resetSimulation(true)}><Sparkles size={14} /><span><b>New world</b><small>Generate a new habitat</small></span></button>
            </div>}
          </div>
        </div>
      </header>

      <aside className="roster-panel glass-panel" aria-label="AI agent roster">
        <div className="panel-heading"><div><span className="eyebrow">Active intelligences</span><h2>Agent roster</h2></div><span className="count-chip">{alive} ALIVE</span></div>
        <div className="roster-list">
          {hud.agents.map((agent) => {
            const active = agent.id === selectedAgentId;
            return <button key={agent.id} className={`roster-card ${active ? "active" : ""} ${agent.alive ? "" : "dead"}`} style={{ "--card-color": agent.color } as CSSProperties} onClick={() => selectAgent(agent.id)} aria-pressed={active}>
              <span className="roster-avatar">{agent.name.slice(0, 2)}</span>
              <span className="roster-copy"><span className="roster-name">{agent.name}<small>{agent.roleLabel}</small></span><span className="roster-action">{agent.alive ? actionLabel(agent.action) : "Inactive"}</span></span>
              <span className="roster-vitals" title={`${Math.round(agent.health)}% health`}><span style={{ height: `${clamp(agent.health)}%` }} /></span>
            </button>;
          })}
        </div>
        <div className="directive-card"><div className="directive-title"><Shield size={13} /> CORE DIRECTIVE</div><p>Stay alive. Share, build, or compete—the agents decide.</p></div>
        <div className="world-mini-stats"><div><span>COOPERATION</span><b>{cooperation}%</b></div><div><span>RESOURCE HEALTH</span><b>{resourceHealth}%</b></div><div><span>WORLD SEED</span><b>#{hud.seed}</b></div></div>
      </aside>

      <aside className="intel-panel glass-panel" aria-label={`Observed agent: ${selected.name}`}>
        <div className="inspector-nav"><button onClick={() => cycleAgent(-1)} aria-label="Observe previous agent" title="Previous agent ([)"><ChevronLeft size={16} /></button><span>OBSERVING AI {String(hud.agents.findIndex((agent) => agent.id === selected.id) + 1).padStart(2, "0")}</span><button onClick={() => cycleAgent(1)} aria-label="Observe next agent" title="Next agent (])"><ChevronRight size={16} /></button></div>
        <div className="inspector-identity">
          <div className="agent-orb" style={{ background: selected.color }}>{selected.name.slice(0, 2)}</div>
          <div><h1>{selected.name}</h1><p>AI · {selected.roleLabel}</p></div>
          <span className={`state-chip ${selected.alive ? "" : "critical"}`}><CircleDot size={10} /> {selected.alive ? actionLabel(selected.action) : "Offline"}</span>
        </div>
        <div className="decision-card">
          <div className="decision-kicker"><Activity size={12} /> DECISION TRACE</div><p>{selected.rationale}</p><div className="goal-line"><span>GOAL</span><b>{selected.goal}</b></div>
          {selected.target && <div className="target-line"><CircleDot size={9} /><span>{selected.target.label}</span><em>{targetDistance.toFixed(1)}m</em></div>}
        </div>
        <div className="needs-grid">
          <Meter label="Health" value={selected.health} color={selected.health < 35 ? "#ff8066" : selected.color} icon={<Heart size={11} />} />
          <Meter label="Nourished" value={nourishment} color="#e7b95e" icon={<Apple size={11} />} />
          <Meter label="Hydration" value={selected.hydration} color="#66d7d1" icon={<Droplets size={11} />} />
          <Meter label="Energy" value={selected.energy} color="#b99cff" icon={<Zap size={11} />} />
        </div>
        <div className="section-rule" />
        <div className="inventory-heading"><span className="eyebrow">Carried resources</span><span>{selected.inventory.food + selected.inventory.water + selected.inventory.wood} / {selected.capacity}</span></div>
        <div className="inventory-grid">
          <ResourceStat icon={<Apple size={14} />} label="FOOD" value={selected.inventory.food} color="#e7b95e" />
          <ResourceStat icon={<Droplets size={14} />} label="WATER" value={selected.inventory.water} color="#66d7d1" />
          <ResourceStat icon={<TreePine size={14} />} label="WOOD" value={selected.inventory.wood} color="#a8cc7b" />
        </div>
        <div className="social-readout"><div><Users size={13} /><span>Social instinct</span><b>{Math.round(personalityScore(selected, "altruism"))}%</b></div><div><Package size={13} /><span>Camp contribution</span><b>{contributionTotal(selected)}</b></div></div>
        <div className="event-section">
          <div className="event-header"><span className="eyebrow">World activity</span><div className="event-filters" aria-label="Filter world activity">{(["all", "selected", "critical"] as const).map((filter) => <button key={filter} className={eventFilter === filter ? "active" : ""} onClick={() => setEventFilter(filter)} aria-pressed={eventFilter === filter}>{filter}</button>)}</div></div>
          <div className="event-list">{events.slice(0, 5).map((event) => <div className={`event-row ${event.critical ? "critical" : ""}`} key={`${event.id}-${event.message}`}><span className="event-node" /><p>{event.message}</p><time>{elapsedLabel(event.time)}</time></div>)}{!events.length && <div className="event-empty">Waiting for the next decision…</div>}</div>
        </div>
      </aside>

      <section className="resource-bar glass-panel" aria-label="Habitat resources">
        <span className="resource-bar-title"><Leaf size={13} /> HABITAT BALANCE</span>
        <ResourceStat icon={<Apple size={14} />} label="CAMP FOOD" value={foodStored} color="#e7b95e" />
        <ResourceStat icon={<Droplets size={14} />} label="CAMP WATER" value={waterStored} color="#66d7d1" />
        <ResourceStat icon={<TreePine size={14} />} label="CAMP WOOD" value={woodStored} color="#a8cc7b" />
        <div className="shelter-level"><span>SHELTER</span><b>LVL {hud.camp.level}</b></div>
      </section>

      <div className="camera-hint" aria-hidden="true">{cameraMode === "free" ? "DRAG TO ORBIT · SCROLL TO ZOOM" : cameraMode === "follow" ? `FOLLOWING ${selected.name}` : "WORLD OVERVIEW"}</div>
      <div className="observer-badge"><Eye size={11} /> OBSERVER ONLY · AGENTS ARE AUTONOMOUS</div>
      <div className="sr-only" aria-live="polite">{latestCritical}</div>
      <section className="sr-only" aria-label="Current agent status">{selected.name}, {selected.roleLabel}. Health {Math.round(selected.health)} percent. Current goal: {selected.goal}. Reason: {selected.rationale}.</section>
    </main>
  );
}
