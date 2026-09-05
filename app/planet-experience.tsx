"use client";

import {
  Activity,
  ArrowLeft,
  Atom,
  BookOpen,
  Building2,
  ChevronDown,
  CircleDot,
  CloudSun,
  Compass,
  Crosshair,
  Factory,
  Flame,
  Globe2,
  Handshake,
  LocateFixed,
  MapPin,
  Minus,
  Orbit,
  Plus,
  Search,
  Shield,
  Sparkles,
  Sprout,
  Telescope,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { PlanetCanvas } from "./planet/planet-canvas";
import { createPlanetHttpAdapter } from "./planet/http-adapter";
import {
  PLANET_OVERLAYS,
  type GeoPoint,
  type PlanetAgent,
  type PlanetCamera,
  type PlanetEntityDetail,
  type PlanetEntitySelection,
  type PlanetExperienceAdapter,
  type PlanetOverlay,
  type PlanetSnapshot,
} from "./planet/types";
import styles from "./planet/planet-experience.module.css";

const DEFAULT_CAMERA: PlanetCamera = { longitude: -12, latitude: 16, zoom: 0.86 };
const VIEW_SECTIONS = ["overview", "people", "societies", "settlements", "research", "timeline"] as const;

type LeftPanel = "agents" | "chronicle" | "nearby" | null;
type ExperienceView = (typeof VIEW_SECTIONS)[number];
type DetailLoadState = "idle" | "loading" | "ready" | "error";

const VIEW_DETAILS: Record<ExperienceView, { label: string; icon: LucideIcon; description: string }> = {
  overview: { label: "Overview", icon: Globe2, description: "Observe the living planet" },
  people: { label: "People", icon: Users, description: "Every named autonomous life" },
  societies: { label: "Societies", icon: Shield, description: "Polities, beliefs, and relations" },
  settlements: { label: "Settlements", icon: Building2, description: "Camps, towns, and growing cities" },
  research: { label: "Research", icon: Atom, description: "Capabilities discovered in the world" },
  timeline: { label: "Timeline", icon: BookOpen, description: "A causal record of change" },
};

const OVERLAY_DETAILS: Record<PlanetOverlay, {
  label: string;
  compactLabel: string;
  description: string;
  icon: LucideIcon;
  color: string;
}> = {
  political: { label: "Territories", compactLabel: "Borders", description: "Exclusive sovereign claims and unsettled land", icon: Shield, color: "#7dd3fc" },
  diplomacy: { label: "Diplomacy", compactLabel: "Relations", description: "Alliances, exchange routes, and active truces", icon: Handshake, color: "#6ee7b7" },
  wars: { label: "Conflicts", compactLabel: "Wars", description: "Active fronts and disputed strategic positions", icon: Flame, color: "#fb8371" },
  beliefs: { label: "Belief systems", compactLabel: "Beliefs", description: "Dominant traditions and secular populations", icon: Sparkles, color: "#d8b4fe" },
  resources: { label: "Resources", compactLabel: "Resources", description: "Known deposits, renewable stocks, and energy sites", icon: Sprout, color: "#b8dc69" },
  technology: { label: "Knowledge", compactLabel: "Knowledge", description: "Capability depth and routes of knowledge diffusion", icon: Atom, color: "#67e8f9" },
  climate: { label: "Climate & ecology", compactLabel: "Ecology", description: "Biomes, ecological stress, and environmental recovery", icon: CloudSun, color: "#7dd3a8" },
  population: { label: "Population", compactLabel: "People", description: "Population density, settlement growth, and migration", icon: Users, color: "#f9e979" },
};

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  discovery: Atom,
  ecology: Sprout,
  politics: Shield,
  war: Flame,
  belief: Sparkles,
  migration: Users,
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", { notation: value >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function wrapLongitude(longitude: number) {
  return ((((longitude + 180) % 360) + 360) % 360) - 180;
}

function describeScale(zoom: number) {
  if (zoom < 1.2) return "Planet";
  if (zoom < 2.1) return "Continental";
  if (zoom < 6.5) return "Regional";
  return "Local lives";
}

function coordinates(point: GeoPoint) {
  const latitude = `${Math.abs(point.latitude).toFixed(1)}°${point.latitude >= 0 ? "N" : "S"}`;
  const longitude = `${Math.abs(point.longitude).toFixed(1)}°${point.longitude >= 0 ? "E" : "W"}`;
  return `${latitude} · ${longitude}`;
}

function findSelectionPoint(snapshot: PlanetSnapshot, selection: PlanetEntitySelection): GeoPoint | null {
  if (selection.kind === "agent") return snapshot.agents.find((agent) => agent.id === selection.id) ?? null;
  if (selection.kind === "settlement") return snapshot.settlements.find((settlement) => settlement.id === selection.id) ?? null;
  if (selection.kind === "resource") return snapshot.resources.find((resource) => resource.id === selection.id) ?? null;
  const capital = snapshot.settlements
    .filter((settlement) => settlement.civilizationId === selection.id)
    .sort((left, right) => right.population - left.population)[0];
  return capital ?? null;
}

function readInitialUrlState() {
  if (typeof window === "undefined") return null;
  const url = new URL(window.location.href);
  const longitude = Number(url.searchParams.get("lon"));
  const latitude = Number(url.searchParams.get("lat"));
  const zoom = Number(url.searchParams.get("z"));
  const overlay = url.searchParams.get("layer") as PlanetOverlay | null;
  const kind = url.searchParams.get("kind") as PlanetEntitySelection["kind"] | null;
  const id = url.searchParams.get("id");
  const requestedView = url.searchParams.get("view") as ExperienceView | null;
  return {
    camera: Number.isFinite(longitude) && Number.isFinite(latitude) && Number.isFinite(zoom)
      ? { longitude: wrapLongitude(longitude), latitude: clamp(latitude, -82, 82), zoom: clamp(zoom, 0.7, 18) }
      : null,
    overlay: overlay && PLANET_OVERLAYS.includes(overlay) ? overlay : null,
    selection: kind && id && ["agent", "settlement", "civilization", "resource"].includes(kind)
      ? { kind, id } as PlanetEntitySelection
      : null,
    view: requestedView && VIEW_SECTIONS.includes(requestedView) ? requestedView : "overview" as const,
  };
}

interface PlanetExperienceProps {
  adapter?: PlanetExperienceAdapter;
  archiveHref?: string;
  historyHref?: string;
}

export function PlanetExperience({
  adapter: providedAdapter,
  archiveHref = "/archive",
  historyHref = "/history",
}: PlanetExperienceProps) {
  const adapter = useMemo(() => providedAdapter ?? createPlanetHttpAdapter(), [providedAdapter]);
  const subscribe = useCallback((listener: () => void) => adapter.subscribe?.(() => listener()) ?? (() => undefined), [adapter]);
  const getSnapshot = useCallback(() => adapter.getSnapshot(), [adapter]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const [view, setView] = useState<ExperienceView>("overview");
  const [overlay, setOverlay] = useState<PlanetOverlay>("political");
  const [camera, setCamera] = useState<PlanetCamera>(DEFAULT_CAMERA);
  const [selection, setSelection] = useState<PlanetEntitySelection | null>(null);
  const [entityDetail, setEntityDetail] = useState<PlanetEntityDetail | null>(null);
  const [detailStatus, setDetailStatus] = useState<DetailLoadState>("idle");
  const [detailRetry, setDetailRetry] = useState(0);
  const [leftPanel, setLeftPanel] = useState<LeftPanel>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PlanetAgent[]>([]);
  const [showOverlayMenu, setShowOverlayMenu] = useState(false);
  const initializedUrlRef = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const initial = readInitialUrlState();
      if (initial?.camera) setCamera(initial.camera);
      if (initial?.overlay) setOverlay(initial.overlay);
      if (initial?.selection) setSelection(initial.selection);
      if (initial?.view) setView(initial.view);
      window.history.replaceState({ wildgrid: true, entry: "initial" }, "", window.location.href);
      initializedUrlRef.current = true;
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    adapter.setViewport?.(camera);
  }, [adapter, camera]);

  useEffect(() => () => {
    if (!providedAdapter) adapter.dispose?.();
  }, [adapter, providedAdapter]);

  useEffect(() => {
    if (!initializedUrlRef.current || typeof window === "undefined") return;
    const timer = window.setTimeout(() => {
      const url = new URL(window.location.href);
      url.searchParams.set("lon", camera.longitude.toFixed(2));
      url.searchParams.set("lat", camera.latitude.toFixed(2));
      url.searchParams.set("z", camera.zoom.toFixed(2));
      url.searchParams.set("layer", overlay);
      url.searchParams.set("view", view);
      if (selection) {
        url.searchParams.set("kind", selection.kind);
        url.searchParams.set("id", selection.id);
      } else {
        url.searchParams.delete("kind");
        url.searchParams.delete("id");
      }
      window.history.replaceState(window.history.state ?? { wildgrid: true }, "", url);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [camera, overlay, selection, view]);

  useEffect(() => {
    const handlePopState = () => {
      const state = readInitialUrlState();
      if (!state) return;
      if (state.camera) setCamera(state.camera);
      if (state.overlay) setOverlay(state.overlay);
      setSelection(state.selection);
      setView(state.view);
      setLeftPanel(null);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    let active = true;
    const query = searchQuery.trim();
    const result = adapter.searchAgents
      ? adapter.searchAgents(query, 24)
      : snapshot.agents.filter((agent) => agent.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())).slice(0, 24);
    Promise.resolve(result).then((agents) => {
      if (active) setSearchResults(agents);
    });
    return () => { active = false; };
  }, [adapter, searchQuery, snapshot.agents]);

  useEffect(() => {
    const controller = new AbortController();
    const currentSelection = selection;
    Promise.resolve().then(() => {
      if (!currentSelection || currentSelection.kind === "resource" || !adapter.loadEntity) {
        setEntityDetail(null);
        setDetailStatus("idle");
        return;
      }
      setEntityDetail(null);
      setDetailStatus("loading");
      adapter.loadEntity(currentSelection, controller.signal)
        .then((detail) => {
          if (controller.signal.aborted) return;
          setEntityDetail(detail);
          setDetailStatus(detail ? "ready" : "error");
        })
        .catch(() => {
          if (!controller.signal.aborted) setDetailStatus("error");
        });
    });
    return () => controller.abort();
  }, [adapter, detailRetry, selection]);

  const selectEntity = useCallback((nextSelection: PlanetEntitySelection | null, focus = false) => {
    setSelection(nextSelection);
    if (typeof window !== "undefined" && initializedUrlRef.current && nextSelection) {
      const url = new URL(window.location.href);
      url.searchParams.set("view", view);
      url.searchParams.set("kind", nextSelection.kind);
      url.searchParams.set("id", nextSelection.id);
      window.history.pushState({ wildgrid: true, entry: "detail" }, "", url);
    }
    if (!nextSelection) return;
    if (focus) {
      const point = findSelectionPoint(snapshot, nextSelection);
      if (point) setCamera({ ...point, zoom: Math.max(camera.zoom, nextSelection.kind === "agent" ? 8.2 : 4.4) });
    }
  }, [camera.zoom, snapshot, view]);

  const nearby = useMemo(() => {
    const withDistance = <T extends GeoPoint>(items: T[]) => items.map((item) => ({
      item,
      distance: Math.hypot(
        wrapLongitude(item.longitude - camera.longitude) * Math.cos(camera.latitude * Math.PI / 180),
        item.latitude - camera.latitude,
      ),
    }));
    const settlements = withDistance(snapshot.settlements)
      .sort((left, right) => left.distance - right.distance)
      .slice(0, 8)
      .map(({ item }) => ({ kind: "settlement" as const, id: item.id, name: item.name, meta: `${formatNumber(item.population)} people` }));
    const agents = camera.zoom >= 5
      ? withDistance(snapshot.agents).sort((left, right) => left.distance - right.distance).slice(0, 8)
        .map(({ item }) => ({ kind: "agent" as const, id: item.id, name: item.name, meta: item.action }))
      : [];
    return [...settlements, ...agents].slice(0, 12);
  }, [camera, snapshot.agents, snapshot.settlements]);

  const topAgents = useMemo(() => [...snapshot.agents]
    .sort((left, right) => right.influence - left.influence)
    .slice(0, 12), [snapshot.agents]);

  const currentOverlay = OVERLAY_DETAILS[overlay];

  function toggleLeftPanel(panel: Exclude<LeftPanel, null>) {
    setLeftPanel((current) => current === panel ? null : panel);
  }

  function navigateView(nextView: ExperienceView, replace = false) {
    if (nextView === view && !selection) return;
    setView(nextView);
    setSelection(null);
    setLeftPanel(null);
    setShowOverlayMenu(false);
    if (typeof window === "undefined" || !initializedUrlRef.current) return;
    const url = new URL(window.location.href);
    url.searchParams.set("view", nextView);
    url.searchParams.delete("kind");
    url.searchParams.delete("id");
    const method = replace ? "replaceState" : "pushState";
    window.history[method]({ wildgrid: true, entry: replace ? "replace" : "view" }, "", url);
  }

  function closeDetail() {
    if (typeof window !== "undefined" && window.history.state?.entry === "detail") {
      window.history.back();
    } else {
      setSelection(null);
    }
  }

  function backToOverview() {
    navigateView("overview");
  }

  return (
    <main className={styles.root}>
      <div className={styles.world}>
        <PlanetCanvas
          snapshot={snapshot}
          overlay={overlay}
          camera={camera}
          selection={selection}
          onCameraChange={setCamera}
          onSelect={(next) => selectEntity(next)}
        />
      </div>

      <header className={styles.topbar}>
        <div className={styles.brandLockup}>
          <span className={styles.brandMark} aria-hidden="true"><Orbit size={21} strokeWidth={1.7} /></span>
          <div>
            <div className={styles.brandLine}><strong>WildGrid</strong><span>Planetary observatory</span></div>
            <div className={styles.eraLine}>{snapshot.meta.era} <span>· Seed {snapshot.meta.seed.toLocaleString()}</span></div>
          </div>
        </div>

        <SectionTabs view={view} onChange={navigateView} className={styles.sectionTabs} />

        <nav className={styles.topActions} aria-label="World navigation">
          <a href={historyHref} className={styles.textAction}><BookOpen size={17} /><span>History</span></a>
          <a href={archiveHref} className={styles.textAction}><Telescope size={17} /><span>Era II</span></a>
          <span className={styles.liveBadge} data-status={snapshot.meta.status}>
            <span aria-hidden="true" />{snapshot.meta.dataMode === "sample" && adapter.mode === "live" ? "Offline preview" : adapter.mode === "sample" ? "Era III preview" : snapshot.meta.status}
          </span>
        </nav>
      </header>

      <nav className={styles.sectionRail} aria-label="Observatory sections">
        <div className={styles.railEra}><span>Era III</span><strong>Planetfall</strong><small>A living world in simulation</small></div>
        {VIEW_SECTIONS.map((section) => {
          const detail = VIEW_DETAILS[section];
          const Icon = detail.icon;
          return <button type="button" key={section} data-active={view === section} aria-current={view === section ? "page" : undefined} onClick={() => navigateView(section)}><Icon size={18} /><span>{detail.label}</span></button>;
        })}
        <div className={styles.railDivider} />
        <button type="button" data-active={leftPanel === "agents"} onClick={() => { if (view !== "overview") navigateView("overview"); toggleLeftPanel("agents"); }}><Search size={18} /><span>Search</span></button>
        <button type="button" data-active={leftPanel === "nearby"} onClick={() => { if (view !== "overview") navigateView("overview"); toggleLeftPanel("nearby"); }}><LocateFixed size={18} /><span>Nearby</span></button>
      </nav>

      {view === "overview" ? (
        <div className={styles.overviewStats} aria-label="Current world statistics">
          <Stat label="Day" value={snapshot.meta.day.toLocaleString()} />
          <Stat label="People" value={formatNumber(snapshot.meta.population)} />
          <Stat label="Societies" value={snapshot.meta.dataMode === "live" && !snapshot.civilizations.length ? "…" : String(snapshot.civilizations.length)} />
          <Stat label="Settlements" value={snapshot.meta.dataMode === "live" && !snapshot.settlements.length ? "…" : String(snapshot.settlements.length)} />
        </div>
      ) : null}

      {view === "overview" && leftPanel ? (
        <aside className={styles.leftDrawer} aria-label={leftPanel === "agents" ? "Agent search" : leftPanel === "chronicle" ? "World chronicle" : "Nearby world"}>
          <div className={styles.drawerHeader}>
            <div>
              <span className={styles.eyebrow}>{leftPanel === "agents" ? "10,000 individual lives" : leftPanel === "chronicle" ? "Causal history" : describeScale(camera.zoom)}</span>
              <h2>{leftPanel === "agents" ? "Find an agent" : leftPanel === "chronicle" ? "World chronicle" : "Nearby world"}</h2>
            </div>
            <button type="button" className={styles.iconButton} aria-label="Close panel" onClick={() => setLeftPanel(null)}><X size={18} /></button>
          </div>
          {leftPanel === "agents" ? (
            <AgentRoster
              query={searchQuery}
              onQueryChange={setSearchQuery}
              agents={searchQuery.trim() ? searchResults : topAgents}
              civilizations={snapshot.civilizations}
              onSelect={(id) => selectEntity({ kind: "agent", id }, true)}
            />
          ) : leftPanel === "chronicle" ? (
            <Chronicle snapshot={snapshot} onSelect={(entity) => entity && selectEntity(entity, true)} />
          ) : (
            <NearbyList nearby={nearby} onSelect={(item) => selectEntity({ kind: item.kind, id: item.id }, true)} />
          )}
        </aside>
      ) : null}

      {selection ? (
        <aside className={styles.inspector} aria-label="Selected entity details">
          <div className={styles.drawerHeader}>
            <span className={styles.eyebrow}>Observed, never controlled</span>
            <button type="button" className={styles.iconButton} aria-label="Close inspector" onClick={closeDetail}><X size={18} /></button>
          </div>
          <EntityInspector snapshot={snapshot} selection={selection} detail={entityDetail} detailStatus={detailStatus} onRetry={() => setDetailRetry((current) => current + 1)} onSelect={(next) => selectEntity(next, true)} />
        </aside>
      ) : view === "overview" ? (
        <OverviewInsights snapshot={snapshot} historyHref={historyHref} onSelect={(next) => selectEntity(next, true)} />
      ) : null}

      {view === "overview" ? <div className={styles.overlayDock}>
        <div className={styles.overlayTitle}>
          <span style={{ "--overlay-color": currentOverlay.color } as React.CSSProperties}><currentOverlay.icon size={16} /></span>
          <div><strong>{currentOverlay.label}</strong><small>{currentOverlay.description}</small></div>
        </div>
        <div className={styles.overlayButtons} role="group" aria-label="Map overlays">
          {PLANET_OVERLAYS.map((option) => {
            const detail = OVERLAY_DETAILS[option];
            const Icon = detail.icon;
            return (
              <button
                type="button"
                key={option}
                className={styles.overlayButton}
                data-active={overlay === option}
                aria-pressed={overlay === option}
                aria-label={`${detail.label}: ${detail.description}`}
                onClick={() => setOverlay(option)}
              >
                <Icon size={17} /><span>{detail.compactLabel}</span>
              </button>
            );
          })}
        </div>
      </div> : null}

      {view === "overview" ? <div className={styles.mapControls} aria-label="Map view controls">
        <button type="button" onClick={() => setCamera((current) => ({ ...current, zoom: clamp(current.zoom * 1.28, 0.7, 18) }))} aria-label="Zoom in"><Plus size={19} /></button>
        <button type="button" onClick={() => setCamera((current) => ({ ...current, zoom: clamp(current.zoom / 1.28, 0.7, 18) }))} aria-label="Zoom out"><Minus size={19} /></button>
        <button type="button" onClick={() => setCamera(DEFAULT_CAMERA)} aria-label="Return to planet view"><Globe2 size={19} /></button>
      </div> : null}

      {view === "overview" ? <div className={styles.viewReadout} aria-live="polite">
        <Crosshair size={14} /> <span>{describeScale(camera.zoom)}</span><small>{coordinates(camera)} · {camera.zoom.toFixed(1)}×</small>
      </div> : null}

      {snapshot.meta.status === "connecting" || snapshot.meta.status === "offline" ? (
        <div className={styles.connectionNotice} data-status={snapshot.meta.status} role="status">
          {snapshot.meta.status === "connecting" ? <Activity size={16} /> : <CloudSun size={16} />}
          <span><strong>{snapshot.meta.status === "connecting" ? "Joining the shared planet" : "Offline preview"}</strong><small>{snapshot.meta.notice}</small></span>
        </div>
      ) : null}

      {view !== "overview" ? (
        <SectionView
          view={view}
          snapshot={snapshot}
          historyHref={historyHref}
          query={searchQuery}
          onQueryChange={setSearchQuery}
          agents={searchQuery.trim() || searchResults.length ? searchResults : topAgents}
          onBack={backToOverview}
          onSelect={(next) => selectEntity(next, true)}
        />
      ) : null}

      {selection ? (
        <section className={styles.mobileDetail} aria-label="Entity details">
          <div className={styles.mobileDetailHeader}>
            <button type="button" onClick={closeDetail}><ArrowLeft size={19} />Back</button>
            <span>Observed life</span>
          </div>
          <EntityInspector snapshot={snapshot} selection={selection} detail={entityDetail} detailStatus={detailStatus} onRetry={() => setDetailRetry((current) => current + 1)} onSelect={(next) => selectEntity(next, true)} />
        </section>
      ) : null}

      <SectionTabs view={view} onChange={navigateView} className={styles.mobileBottomNav} />

      {view === "overview" ? <div className={styles.mobileOverlayPicker}>
        <button type="button" aria-expanded={showOverlayMenu} onClick={() => setShowOverlayMenu((current) => !current)}><currentOverlay.icon size={18} /><span>{currentOverlay.compactLabel}</span><ChevronDown size={16} /></button>
        {showOverlayMenu ? (
          <div className={styles.mobileOverlayMenu}>
            {PLANET_OVERLAYS.map((option) => {
              const detail = OVERLAY_DETAILS[option];
              const Icon = detail.icon;
              return <button key={option} type="button" data-active={overlay === option} onClick={() => { setOverlay(option); setShowOverlayMenu(false); }}><Icon size={17} />{detail.label}</button>;
            })}
          </div>
        ) : null}
      </div> : null}
    </main>
  );
}

function SectionTabs({ view, onChange, className }: { view: ExperienceView; onChange: (view: ExperienceView) => void; className: string }) {
  return (
    <nav className={className} aria-label="Observatory views">
      {VIEW_SECTIONS.map((section) => {
        const detail = VIEW_DETAILS[section];
        const Icon = detail.icon;
        return (
          <button
            type="button"
            key={section}
            data-active={view === section}
            aria-current={view === section ? "page" : undefined}
            onClick={() => onChange(section)}
          >
            <Icon size={17} /><span>{detail.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function OverviewInsights({ snapshot, historyHref, onSelect }: { snapshot: PlanetSnapshot; historyHref: string; onSelect: (selection: PlanetEntitySelection) => void }) {
  const largest = [...snapshot.civilizations].sort((left, right) => right.population - left.population)[0];
  const mappedResources = snapshot.resources.length || snapshot.resourceCells?.length || 0;
  const resourceLabel = snapshot.resources.length ? "Known deposits" : "Resource regions";
  return (
    <aside className={styles.insightStack} aria-label="World insights">
      <section className={styles.insightCard}>
        <div className={styles.insightHeading}><span><Globe2 size={17} /></span><div><small>World pulse</small><strong>{snapshot.meta.status === "live" ? "Simulation current" : snapshot.meta.status === "catching-up" ? "History catching up" : "Connecting"}</strong></div></div>
        <div className={styles.insightGrid}>
          <InspectorValue label="Named lives" value={formatNumber(snapshot.meta.population)} />
          <InspectorValue label="Belief systems" value={String(snapshot.beliefs.length)} />
          <InspectorValue label="Active conflicts" value={String(snapshot.conflicts.length)} />
          <InspectorValue label={resourceLabel} value={mappedResources ? String(mappedResources) : snapshot.meta.status === "connecting" ? "…" : "0"} />
        </div>
      </section>
      <section className={`${styles.insightCard} ${styles.counselCard}`}>
        <div className={styles.insightCardTitle}>
          <div><small>Decision engine</small><strong>{snapshot.aiCounsel?.configured ? "External counsel active" : "Deterministic autonomy only"}</strong></div>
          <Atom size={17} />
        </div>
        {snapshot.aiCounsel?.configured ? (
          <div className={styles.counselFacts}>
            <p>{snapshot.aiCounsel.model} may advise {snapshot.aiCounsel.activeSlots} high-influence agent{snapshot.aiCounsel.activeSlots === 1 ? "" : "s"}; agents still accept or reject advice through their own deliberation.</p>
            <div><span>{snapshot.aiCounsel.callsToday}/{snapshot.aiCounsel.dailyCallLimit} calls today</span><span>{snapshot.aiCounsel.lastCompletedDay === null ? "No completed counsel yet" : `Last completed Day ${snapshot.aiCounsel.lastCompletedDay.toLocaleString()}`}</span>{snapshot.aiCounsel.consecutiveFailures ? <span>{snapshot.aiCounsel.consecutiveFailures} consecutive failure{snapshot.aiCounsel.consecutiveFailures === 1 ? "" : "s"}</span> : null}</div>
          </div>
        ) : (
          <p className={styles.counselCopy}>No external model is configured. Agents observe, plan, learn from outcomes, and choose independently through the simulation engine.</p>
        )}
      </section>
      {largest ? (
        <button type="button" className={styles.leadingSociety} onClick={() => onSelect({ kind: "civilization", id: largest.id })}>
          <span className={styles.eyebrow}>Largest observed society</span>
          <div><span style={{ background: largest.color }} /><strong>{largest.name}</strong><small>{formatNumber(largest.population)} people</small></div>
          <p>{largest.summary}</p>
          <span>Open society <LocateFixed size={14} /></span>
        </button>
      ) : null}
      <section className={styles.insightCard}>
        <div className={styles.insightCardTitle}><div><small>Recent change</small><strong>Causal chronicle</strong></div><a href={historyHref}>Read history</a></div>
        <div className={styles.recentEvents}>
          {snapshot.chronicle.slice(0, 4).map((entry) => {
            const Icon = CATEGORY_ICONS[entry.category] ?? Activity;
            return <div key={entry.id}><Icon size={15} /><span><strong>{entry.title}</strong><small>Day {entry.day.toLocaleString()} · {entry.category}</small></span></div>;
          })}
          {!snapshot.chronicle.length ? <p>No major changes have been recorded yet.</p> : null}
        </div>
      </section>
    </aside>
  );
}

function SectionView({
  view,
  snapshot,
  historyHref,
  query,
  onQueryChange,
  agents,
  onBack,
  onSelect,
}: {
  view: Exclude<ExperienceView, "overview">;
  snapshot: PlanetSnapshot;
  historyHref: string;
  query: string;
  onQueryChange: (query: string) => void;
  agents: PlanetAgent[];
  onBack: () => void;
  onSelect: (selection: PlanetEntitySelection) => void;
}) {
  const detail = VIEW_DETAILS[view];
  const Icon = detail.icon;
  const capabilities = useMemo(() => {
    const records = new Map<string, { settlements: number; societies: Set<string> }>();
    for (const settlement of snapshot.settlements) {
      for (const capability of settlement.capabilities ?? []) {
        const record = records.get(capability) ?? { settlements: 0, societies: new Set<string>() };
        record.settlements += 1;
        record.societies.add(settlement.civilizationId);
        records.set(capability, record);
      }
    }
    return [...records.entries()]
      .map(([id, record]) => ({ id, settlements: record.settlements, societies: record.societies.size }))
      .sort((left, right) => right.settlements - left.settlements || left.id.localeCompare(right.id));
  }, [snapshot.settlements]);

  return (
    <section className={styles.sectionView} data-view={view} aria-labelledby={`section-${view}-title`}>
      <header className={styles.sectionViewHeader}>
        <button type="button" className={styles.sectionBack} onClick={onBack}><ArrowLeft size={19} /><span>Overview</span></button>
        <div className={styles.sectionTitle}><span><Icon size={22} /></span><div><p>{detail.description}</p><h1 id={`section-${view}-title`}>{detail.label}</h1></div></div>
        <div className={styles.sectionCount}>{view === "people" ? formatNumber(snapshot.meta.population) : view === "societies" ? snapshot.civilizations.length : view === "settlements" ? snapshot.settlements.length : view === "research" ? capabilities.length : snapshot.chronicle.length}<span> observed</span></div>
      </header>
      <div className={styles.sectionBody}>
        {view === "people" ? (
          <div className={styles.sectionRoster}><AgentRoster query={query} onQueryChange={onQueryChange} agents={agents} civilizations={snapshot.civilizations} onSelect={(id) => onSelect({ kind: "agent", id })} /></div>
        ) : view === "societies" ? (
          <div className={styles.societiesSection}>
            <div className={styles.recordGrid}>
              {snapshot.civilizations.map((civilization) => {
                const settlementCount = snapshot.settlements.filter((settlement) => settlement.civilizationId === civilization.id).length;
                const belief = snapshot.beliefs.find((candidate) => candidate.id === civilization.beliefId);
                return <button type="button" key={civilization.id} className={styles.recordCard} style={{ "--entity-color": civilization.color } as React.CSSProperties} onClick={() => onSelect({ kind: "civilization", id: civilization.id })}><span className={styles.recordColor} /><div className={styles.recordHeading}><strong>{civilization.name}</strong><small>{formatNumber(civilization.population)} people</small></div><p>{civilization.summary}</p><div className={styles.recordFacts}><span>{settlementCount} settlements</span><span>{belief?.name ?? "Plural / secular"}</span><span>{civilization.technologyScore.toFixed(0)} knowledge</span></div><span className={styles.recordOpen}>View society <LocateFixed size={14} /></span></button>;
              })}
              {!snapshot.civilizations.length ? <SectionEmpty icon={Shield} title="No society records in this view" copy="The shared planet may still be connecting." /> : null}
            </div>
            <section className={styles.beliefDirectory} aria-labelledby="belief-directory-title">
              <header><div><span className={styles.eyebrow}>Beliefs emerge; they are never assigned</span><h2 id="belief-directory-title">Belief-system directory</h2></div><strong>{snapshot.beliefs.length} recorded</strong></header>
              <div className={styles.beliefGrid}>
                {snapshot.beliefs.map((belief) => (
                  <article key={belief.id} className={styles.beliefCard} style={{ "--entity-color": belief.color } as React.CSSProperties}>
                    <div className={styles.beliefHeading}><span /><div><strong>{belief.name}</strong><small>{belief.kind ? humanizeCapability(belief.kind) : "Belief system"} · {belief.active === false ? "historical" : "active"}</small></div><em>{formatNumber(belief.followers)} adherents</em></div>
                    <div className={styles.beliefValues}><span>Core values</span>{belief.values.length ? <ul>{belief.values.map((value) => <li key={value}>{humanizeCapability(value)}</li>)}</ul> : <p>No core values have been recorded yet.</p>}</div>
                    {belief.tenets?.length ? <div className={styles.beliefTenets}><span>Tenets</span><p>{belief.tenets.map(humanizeCapability).join(" · ")}</p></div> : null}
                    <dl className={styles.beliefOrigins}>
                      <div><dt>Founded by</dt><dd>{belief.founderName ?? belief.founderAgentId ?? "Not recorded"}</dd></div>
                      <div><dt>Origin</dt><dd>{belief.originName ?? (belief.originSettlementId ? "Settlement record outside this view" : "No settlement recorded")}</dd></div>
                      <div><dt>Founded</dt><dd>{belief.originDay === undefined ? "Day not recorded" : `Day ${belief.originDay.toLocaleString()}`}</dd></div>
                      <div><dt>Lineage</dt><dd>{belief.parentBeliefId ? "Descended from an earlier belief" : "Original tradition"}{belief.schisms ? ` · ${belief.schisms} schism${belief.schisms === 1 ? "" : "s"}` : ""}</dd></div>
                    </dl>
                    {belief.reforms?.length ? <div className={styles.latestReform}><span>Latest reform · Day {belief.reforms.at(-1)?.day.toLocaleString()}</span><p>{belief.reforms.at(-1)?.summary}</p></div> : null}
                  </article>
                ))}
                {!snapshot.beliefs.length ? <SectionEmpty icon={Sparkles} title="No belief system has formed" copy="The directory will remain empty until agents establish one themselves." /> : null}
              </div>
            </section>
          </div>
        ) : view === "settlements" ? (
          <div className={styles.recordGrid}>
            {[...snapshot.settlements].sort((left, right) => right.population - left.population).map((settlement) => {
              const civilization = snapshot.civilizations.find((candidate) => candidate.id === settlement.civilizationId);
              return <button type="button" key={settlement.id} className={styles.recordCard} style={{ "--entity-color": civilization?.color ?? "#7ecfc7" } as React.CSSProperties} onClick={() => onSelect({ kind: "settlement", id: settlement.id })}><span className={styles.recordColor} /><div className={styles.recordHeading}><strong>{settlement.name}</strong><small>{settlement.kind} · {coordinates(settlement)}</small></div><div className={styles.recordFacts}><span>{formatNumber(settlement.population)} residents</span><span>{settlement.capabilities?.length ?? 0} capabilities</span><span>{settlement.prosperity.toFixed(0)} prosperity</span></div><span className={styles.recordOpen}>Open settlement <LocateFixed size={14} /></span></button>;
            })}
            {!snapshot.settlements.length ? <SectionEmpty icon={Building2} title="No settlements in this view" copy="The shared planet may still be connecting." /> : null}
          </div>
        ) : view === "research" ? (
          <div className={styles.researchLayout}>
            <div className={styles.researchIntro}><Atom size={25} /><div><span className={styles.eyebrow}>No prescribed technology tree</span><h2>Knowledge exists where people have learned it.</h2><p>These are capabilities currently established in observed settlements. New experiments, failures, and inventions enter this record only when the simulation produces them.</p></div></div>
            <div className={styles.researchList}>
              {capabilities.map((capability, index) => <article key={capability.id}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{humanizeCapability(capability.id)}</strong><small>{capability.settlements} settlement{capability.settlements === 1 ? "" : "s"} · {capability.societies} societ{capability.societies === 1 ? "y" : "ies"}</small></div><em>Established</em></article>)}
              {!capabilities.length ? <SectionEmpty icon={Atom} title="No shared capability observed yet" copy="Founders must discover, teach, and institutionalize knowledge themselves." /> : null}
            </div>
          </div>
        ) : (
          <div className={styles.timelineView}><div className={styles.timelineLead}><span>Era III</span><strong>Day {snapshot.meta.day.toLocaleString()}</strong><p>Major changes are grouped by cause and consequence rather than repeated status noise.</p><a href={historyHref}><BookOpen size={16} />Open history book</a></div><Chronicle snapshot={snapshot} onSelect={(entity) => entity && onSelect(entity)} /></div>
        )}
      </div>
    </section>
  );
}

function SectionEmpty({ icon: Icon, title, copy }: { icon: LucideIcon; title: string; copy: string }) {
  return <div className={styles.sectionEmpty}><Icon size={28} /><strong>{title}</strong><p>{copy}</p></div>;
}

function humanizeCapability(value: string) {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className={styles.stat}><span>{label}</span><strong>{value}</strong></div>;
}

function AgentRoster({
  query,
  onQueryChange,
  agents,
  civilizations,
  onSelect,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  agents: PlanetAgent[];
  civilizations: PlanetSnapshot["civilizations"];
  onSelect: (id: string) => void;
}) {
  return (
    <div className={styles.rosterContent}>
      <label className={styles.searchBox}>
        <Search size={18} aria-hidden="true" />
        <span className={styles.srOnly}>Search all agents by name</span>
        <input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search every named life…" autoComplete="off" />
        {query ? <button type="button" aria-label="Clear search" onClick={() => onQueryChange("")}><X size={16} /></button> : null}
      </label>
      <p className={styles.panelHint}>{query ? `${agents.length} closest matches` : "Most influential now · rank emerges from lived outcomes"}</p>
      <div className={styles.entityList}>
        {agents.map((agent, index) => {
          const civilization = civilizations.find((candidate) => candidate.id === agent.civilizationId);
          return (
            <button type="button" key={agent.id} className={styles.entityRow} onClick={() => onSelect(agent.id)}>
              <span className={styles.rank}>{query ? <CircleDot size={13} /> : String(index + 1).padStart(2, "0")}</span>
              <span className={styles.entityCopy}>
                <strong>{agent.name}</strong>
                <small>{agent.action}</small>
              </span>
              <span className={styles.entityMeta} style={{ "--entity-color": civilization?.color ?? "#9aa8aa" } as React.CSSProperties}>{agent.influence}</span>
            </button>
          );
        })}
        {query && agents.length === 0 ? <p className={styles.emptyMessage}>No named agent matches “{query}”.</p> : null}
      </div>
    </div>
  );
}

function Chronicle({ snapshot, onSelect }: { snapshot: PlanetSnapshot; onSelect: (selection?: PlanetEntitySelection) => void }) {
  return (
    <div className={styles.chronicleList}>
      {snapshot.chronicle.map((entry) => {
        const Icon = CATEGORY_ICONS[entry.category] ?? Activity;
        return (
          <button key={entry.id} type="button" className={styles.chronicleEntry} onClick={() => onSelect(entry.entity)} disabled={!entry.entity}>
            <span className={styles.chronicleIcon}><Icon size={16} /></span>
            <span>
              <small>Day {entry.day.toLocaleString()} · {entry.category}</small>
              <strong>{entry.title}</strong>
              <p>{entry.summary}</p>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function NearbyList({ nearby, onSelect }: { nearby: Array<{ kind: "agent" | "settlement"; id: string; name: string; meta: string }>; onSelect: (item: { kind: "agent" | "settlement"; id: string }) => void }) {
  return (
    <div className={styles.entityList}>
      <p className={styles.panelHint}>A keyboard-accessible mirror of what is closest to the center of the map.</p>
      {nearby.map((item) => (
        <button type="button" key={`${item.kind}-${item.id}`} className={styles.nearbyRow} onClick={() => onSelect(item)}>
          {item.kind === "agent" ? <CircleDot size={17} /> : <MapPin size={17} />}
          <span><strong>{item.name}</strong><small>{item.meta}</small></span>
          <LocateFixed size={15} />
        </button>
      ))}
    </div>
  );
}

function EntityInspector({
  snapshot,
  selection,
  detail,
  detailStatus,
  onRetry,
  onSelect,
}: {
  snapshot: PlanetSnapshot;
  selection: PlanetEntitySelection;
  detail: PlanetEntityDetail | null;
  detailStatus: DetailLoadState;
  onRetry: () => void;
  onSelect: (selection: PlanetEntitySelection) => void;
}) {
  const currentDetail = detail?.record.id === selection.id ? detail : null;
  if (detailStatus === "loading" && selection.kind !== "resource") {
    return <DetailState icon={Activity} title="Reading the living record" copy="Loading this entity’s current mind, family, and material state…" />;
  }
  if (detailStatus === "error" && selection.kind !== "resource") {
    return <DetailState icon={CloudSun} title="Detail temporarily unavailable" copy="The compact map record is safe, but the deeper record could not be reached." action="Try again" onAction={onRetry} />;
  }
  if (currentDetail) {
    return <DetailedEntityInspector snapshot={snapshot} detail={currentDetail} onSelect={onSelect} />;
  }
  if (selection.kind === "agent") {
    const agent = snapshot.agents.find((candidate) => candidate.id === selection.id);
    if (!agent) return <MissingSelection />;
    const civilization = snapshot.civilizations.find((candidate) => candidate.id === agent.civilizationId);
    const settlement = snapshot.settlements.find((candidate) => candidate.id === agent.settlementId);
    const belief = snapshot.beliefs.find((candidate) => candidate.id === agent.beliefId);
    return (
      <InspectorFrame icon={<CircleDot size={23} />} title={agent.name} subtitle={`Generation ${agent.generation} · influence ${agent.influence}`} color={civilization?.color}>
        <InspectorSection label="Current intention">
          <div className={styles.goalCard}><Compass size={18} /><span><strong>{agent.currentGoal}</strong><small>Now: {agent.action}</small></span></div>
        </InspectorSection>
        <InspectorSection label="What this mind knows">
          <ul className={styles.factList}>{agent.knownFacts.map((fact) => <li key={fact}>{fact}</li>)}</ul>
        </InspectorSection>
        <InspectorSection label="World ties">
          {civilization ? <InspectorLink label="Allegiance" value={civilization.name} color={civilization.color} onClick={() => onSelect({ kind: "civilization", id: civilization.id })} /> : <InspectorValue label="Allegiance" value="Independent" />}
          {settlement ? <InspectorLink label="Home" value={settlement.name} onClick={() => onSelect({ kind: "settlement", id: settlement.id })} /> : null}
          <InspectorValue label="Worldview" value={belief?.name ?? "No declared system"} />
          <InspectorValue label="Location" value={coordinates(agent)} />
        </InspectorSection>
        <p className={styles.observerNote}>WildGrid exposes the evidence behind this choice. It never supplies the choice.</p>
      </InspectorFrame>
    );
  }

  if (selection.kind === "settlement") {
    const settlement = snapshot.settlements.find((candidate) => candidate.id === selection.id);
    if (!settlement) return <MissingSelection />;
    const civilization = snapshot.civilizations.find((candidate) => candidate.id === settlement.civilizationId);
    const residents = snapshot.agents.filter((agent) => agent.settlementId === settlement.id);
    return (
      <InspectorFrame icon={<MapPin size={23} />} title={settlement.name} subtitle={`${settlement.kind} · ${formatNumber(settlement.population)} residents`} color={civilization?.color}>
        <InspectorSection label="Settlement condition">
          <Metric label="Prosperity" value={settlement.prosperity} />
          <InspectorValue label="Location" value={coordinates(settlement)} />
          {civilization ? <InspectorLink label="Society" value={civilization.name} color={civilization.color} onClick={() => onSelect({ kind: "civilization", id: civilization.id })} /> : null}
        </InspectorSection>
        <InspectorSection label="Lives here">
          {residents.slice(0, 5).map((agent) => <InspectorLink key={agent.id} label={agent.action} value={agent.name} onClick={() => onSelect({ kind: "agent", id: agent.id })} />)}
        </InspectorSection>
      </InspectorFrame>
    );
  }

  if (selection.kind === "civilization") {
    const civilization = snapshot.civilizations.find((candidate) => candidate.id === selection.id);
    if (!civilization) return <MissingSelection />;
    const belief = snapshot.beliefs.find((candidate) => candidate.id === civilization.beliefId);
    const settlements = snapshot.settlements.filter((settlement) => settlement.civilizationId === civilization.id).sort((left, right) => right.population - left.population);
    return (
      <InspectorFrame icon={<Shield size={23} />} title={civilization.name} subtitle={`${formatNumber(civilization.population)} people · ${settlements.length} settlements`} color={civilization.color}>
        <p className={styles.entitySummary}>{civilization.summary}</p>
        <InspectorSection label="Current condition">
          <Metric label="Prosperity" value={civilization.prosperity} />
          <Metric label="Knowledge depth" value={civilization.technologyScore} />
          <InspectorValue label="Largest worldview" value={belief?.name ?? "Plural / secular"} />
        </InspectorSection>
        <InspectorSection label="Settlements">
          {settlements.slice(0, 6).map((settlement) => <InspectorLink key={settlement.id} label={`${settlement.kind} · ${formatNumber(settlement.population)}`} value={settlement.name} onClick={() => onSelect({ kind: "settlement", id: settlement.id })} />)}
        </InspectorSection>
      </InspectorFrame>
    );
  }

  const resource = snapshot.resources.find((candidate) => candidate.id === selection.id);
  if (!resource) return <MissingSelection />;
  return (
    <InspectorFrame icon={<Factory size={23} />} title={resource.name} subtitle={`${resource.family} resource · ${resource.finite ? "finite reserve" : "renewable flow"}`} color="#b8dc69">
      <InspectorSection label="Observed condition">
        <Metric label="Estimated abundance" value={resource.abundance} />
        <InspectorValue label="Location" value={coordinates(resource)} />
        <InspectorValue label="Knowledge" value={resource.discoveredBy.length ? `Known to ${resource.discoveredBy.length} society` : "Not yet understood"} />
      </InspectorSection>
      <p className={styles.observerNote}>A deposit can be present without being known, extractable, transportable, or useful.</p>
    </InspectorFrame>
  );
}

function DetailedEntityInspector({ snapshot, detail, onSelect }: { snapshot: PlanetSnapshot; detail: PlanetEntityDetail; onSelect: (selection: PlanetEntitySelection) => void }) {
  const agentName = (id: string) => snapshot.agents.find((agent) => agent.id === id)?.name ?? id;
  const settlementName = (id: string) => snapshot.settlements.find((settlement) => settlement.id === id)?.name ?? id;
  const civilizationName = (id: string) => snapshot.civilizations.find((civilization) => civilization.id === id)?.name ?? id;
  if (detail.kind === "agent") {
    const agent = detail.record;
    const civilization = snapshot.civilizations.find((candidate) => candidate.id === agent.polityId);
    const belief = snapshot.beliefs.find((candidate) => candidate.id === agent.beliefId);
    const activeGoal = agent.mind.goals.find((goal) => goal.status === "active") ?? agent.mind.goals[0];
    const lastLivingDay = agent.deathDay ?? snapshot.meta.day;
    const age = Math.max(0, Math.floor(lastLivingDay - agent.birthDay));
    return (
      <InspectorFrame icon={<CircleDot size={23} />} title={agent.name} subtitle={`Age ${age} · Generation ${agent.generation} · ${agent.alive ? "living" : `died Day ${agent.deathDay?.toLocaleString()}`}`} color={civilization?.color}>
        <InspectorSection label="Current decision">
          {agent.mind.lastDecision ? <div className={styles.decisionRecord}><Compass size={18} /><div><strong>{agent.mind.lastDecision.explanation}</strong><small>{Math.round((1 - agent.mind.lastDecision.uncertainty) * 100)}% confidence in available evidence</small></div></div> : <p className={styles.missingRecord}>No completed deliberation has been recorded yet.</p>}
          {activeGoal ? <div className={styles.activePlan}><span>{humanizeCapability(activeGoal.purpose)} · {activeGoal.status}</span><strong>{activeGoal.rationale}</strong>{activeGoal.steps.length ? <ol>{activeGoal.steps.map((step) => <li key={step.id} data-status={step.status}><span>{humanizeCapability(step.action)}</span><small>{step.status}{step.requirements.length ? ` · needs ${step.requirements.map(humanizeCapability).join(", ")}` : ""}</small></li>)}</ol> : null}</div> : null}
          {agent.mind.lastDecision?.alternatives.length ? <div className={styles.alternatives}><span>Alternatives considered</span>{agent.mind.lastDecision.alternatives.map((alternative) => <div key={`${alternative.purpose}-${alternative.score}`}><strong>{humanizeCapability(alternative.purpose)}</strong><small>{alternative.summary}</small><em>{alternative.score.toFixed(1)}</em></div>)}</div> : null}
        </InspectorSection>
        <InspectorSection label="Survival state">
          {Object.entries(agent.needs).map(([need, value]) => <Metric key={need} label={humanizeCapability(need)} value={value} />)}
        </InspectorSection>
        <InspectorSection label="Family">
          <DetailRelations label="Parents" ids={agent.parentIds} resolve={agentName} onSelect={(id) => onSelect({ kind: "agent", id })} />
          <DetailRelations label="Children" ids={agent.childIds} resolve={agentName} onSelect={(id) => onSelect({ kind: "agent", id })} />
        </InspectorSection>
        <InspectorSection label="World ties">
          {agent.polityId ? <InspectorLink label="Society" value={civilization?.name ?? civilizationName(agent.polityId)} color={civilization?.color} onClick={() => onSelect({ kind: "civilization", id: agent.polityId! })} /> : <InspectorValue label="Society" value="Independent" />}
          {agent.homeSettlementId ? <InspectorLink label="Home" value={settlementName(agent.homeSettlementId)} onClick={() => onSelect({ kind: "settlement", id: agent.homeSettlementId! })} /> : null}
          <InspectorValue label="Belief" value={belief?.name ?? (agent.beliefId ? humanizeCapability(agent.beliefId) : "No declared system")} />
          {agent.beliefId ? <InspectorValue label="Conviction" value={`${Math.round(agent.beliefConviction * 100)}%`} /> : null}
        </InspectorSection>
        <InspectorSection label="Capabilities & possessions">
          <TagList values={agent.capabilities} empty="No learned capability recorded." />
          <StockList values={agent.inventory} empty="Nothing currently carried." />
        </InspectorSection>
        <p className={styles.observerNote}>These are recorded inputs and outcomes, not a script supplied by the observer.</p>
      </InspectorFrame>
    );
  }
  if (detail.kind === "settlement") {
    const settlement = detail.record;
    const civilization = snapshot.civilizations.find((candidate) => candidate.id === settlement.polityId);
    const publicSettlement = snapshot.settlements.find((candidate) => candidate.id === settlement.id);
    const foundedDay = Math.floor(settlement.createdAt / 60) + 1;
    return (
      <InspectorFrame icon={<Building2 size={23} />} title={settlement.name} subtitle={`${formatNumber(publicSettlement?.population ?? settlement.residentIds.length)} residents · founded Day ${foundedDay.toLocaleString()}`} color={civilization?.color}>
        <InspectorSection label="Material state"><StockList values={settlement.stocks} empty="No communal stocks recorded." /></InspectorSection>
        <InspectorSection label="Built environment"><StockList values={settlement.facilities} empty="No facilities recorded." /><TagList values={settlement.capabilities} empty="No established capability recorded." /></InspectorSection>
        <InspectorSection label="Founders"><DetailRelations label="Founding agents" ids={settlement.founderIds} resolve={agentName} onSelect={(id) => onSelect({ kind: "agent", id })} /></InspectorSection>
        <InspectorSection label="World ties">
          {settlement.polityId ? <InspectorLink label="Society" value={civilization?.name ?? civilizationName(settlement.polityId)} color={civilization?.color} onClick={() => onSelect({ kind: "civilization", id: settlement.polityId })} /> : null}
          <InspectorValue label="Known resource sites" value={String(settlement.knownResourceSiteIds.length)} />
          <InspectorValue label="Active projects" value={String(settlement.projectIds.length)} />
        </InspectorSection>
      </InspectorFrame>
    );
  }
  const civilization = detail.record;
  const publicCivilization = snapshot.civilizations.find((candidate) => candidate.id === civilization.id);
  const foundedDay = Math.floor(civilization.createdAt / 60) + 1;
  return (
    <InspectorFrame icon={<Shield size={23} />} title={civilization.name} subtitle={`${formatNumber(publicCivilization?.population ?? civilization.citizenIds.length)} citizens · formed Day ${foundedDay.toLocaleString()}`} color={publicCivilization?.color}>
      <InspectorSection label="Leadership & institutions">
        {civilization.leaderId ? <InspectorLink label="Current leader" value={agentName(civilization.leaderId)} onClick={() => onSelect({ kind: "agent", id: civilization.leaderId! })} /> : <InspectorValue label="Current leader" value="No sole leader" />}
        <InspectorValue label="Institutions" value={String(civilization.institutionIds.length)} />
      </InspectorSection>
      <InspectorSection label="Settlements">
        {civilization.settlementIds.slice(0, 12).map((id) => <InspectorLink key={id} label="Settlement" value={settlementName(id)} onClick={() => onSelect({ kind: "settlement", id })} />)}
      </InspectorSection>
      <InspectorSection label="Belief systems">
        {civilization.beliefIds.length ? civilization.beliefIds.map((id) => <InspectorValue key={id} label="Belief" value={snapshot.beliefs.find((belief) => belief.id === id)?.name ?? humanizeCapability(id)} />) : <p className={styles.missingRecord}>No shared belief system is recorded.</p>}
      </InspectorSection>
    </InspectorFrame>
  );
}

function DetailRelations({ label, ids, resolve, onSelect }: { label: string; ids: string[]; resolve: (id: string) => string; onSelect: (id: string) => void }) {
  return <div className={styles.detailRelations}><span>{label}</span>{ids.length ? <div>{ids.slice(0, 20).map((id) => <button type="button" key={id} onClick={() => onSelect(id)}>{resolve(id)}</button>)}</div> : <p>None recorded</p>}</div>;
}

function TagList({ values, empty }: { values: string[]; empty: string }) {
  return values.length ? <div className={styles.tagList}>{values.map((value) => <span key={value}>{humanizeCapability(value)}</span>)}</div> : <p className={styles.missingRecord}>{empty}</p>;
}

function StockList({ values, empty }: { values: Record<string, number>; empty: string }) {
  const entries = Object.entries(values).filter(([, amount]) => amount !== 0).sort((left, right) => right[1] - left[1]);
  return entries.length ? <div className={styles.stockList}>{entries.map(([name, amount]) => <div key={name}><span>{humanizeCapability(name)}</span><strong>{Number.isInteger(amount) ? amount.toLocaleString() : amount.toFixed(1)}</strong></div>)}</div> : <p className={styles.missingRecord}>{empty}</p>;
}

function DetailState({ icon: Icon, title, copy, action, onAction }: { icon: LucideIcon; title: string; copy: string; action?: string; onAction?: () => void }) {
  return <div className={styles.detailState}><span><Icon size={25} /></span><h2>{title}</h2><p>{copy}</p>{action && onAction ? <button type="button" onClick={onAction}>{action}</button> : null}</div>;
}

function InspectorFrame({ icon, title, subtitle, color, children }: { icon: ReactNode; title: string; subtitle: string; color?: string; children: ReactNode }) {
  return <div className={styles.inspectorContent} style={{ "--entity-color": color ?? "#81d6cf" } as React.CSSProperties}><div className={styles.entityHeading}><span>{icon}</span><div><h2>{title}</h2><p>{subtitle}</p></div></div>{children}</div>;
}

function InspectorSection({ label, children }: { label: string; children: ReactNode }) {
  return <section className={styles.inspectorSection}><h3>{label}</h3>{children}</section>;
}

function InspectorValue({ label, value }: { label: string; value: string }) {
  return <div className={styles.inspectorValue}><span>{label}</span><strong>{value}</strong></div>;
}

function InspectorLink({ label, value, color, onClick }: { label: string; value: string; color?: string; onClick: () => void }) {
  return <button type="button" className={styles.inspectorLink} style={{ "--link-color": color ?? "#82d6cf" } as React.CSSProperties} onClick={onClick}><span>{label}</span><strong>{value}</strong><LocateFixed size={15} /></button>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className={styles.metric}><div><span>{label}</span><strong>{Math.round(value)}%</strong></div><span className={styles.metricTrack}><span style={{ width: `${clamp(value, 0, 100)}%` }} /></span></div>;
}

function MissingSelection() {
  return <div className={styles.emptySelection}><LocateFixed size={26} /><h2>No longer in view</h2><p>This record changed before the inspector could open it.</p></div>;
}
