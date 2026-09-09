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
  MoreHorizontal,
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

// Begin with the overhead field atlas. The globe remains an optional context view.
const DEFAULT_CAMERA: PlanetCamera = { longitude: -12, latitude: 16, zoom: 2.4 };
const VIEW_SECTIONS = ["overview", "people", "societies", "settlements", "research", "timeline"] as const;

type LeftPanel = "agents" | "chronicle" | "nearby" | null;
type ExperienceView = (typeof VIEW_SECTIONS)[number];
type DetailLoadState = "idle" | "loading" | "ready" | "error";
type DirectoryStatus = "active" | "historical" | "all";
const DIRECTORY_PAGE_SIZE = 24;

const VIEW_DETAILS: Record<ExperienceView, { label: string; icon: LucideIcon; description: string }> = {
  overview: { label: "Overview", icon: Globe2, description: "Live field observation" },
  people: { label: "People", icon: Users, description: "Life courses, choices, and kinship" },
  societies: { label: "Societies", icon: Shield, description: "Emergent institutions and beliefs" },
  settlements: { label: "Settlements", icon: Building2, description: "Habitation and material change" },
  research: { label: "Knowledge", icon: Atom, description: "Capabilities actually established" },
  timeline: { label: "Chronicle", icon: BookOpen, description: "Causes, changes, and consequences" },
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
  resources: { label: "Resource substrate", compactLabel: "Substrate", description: "Observer-only geology and ecology; wide views may include deposits inhabitants have not discovered", icon: Sprout, color: "#b8dc69" },
  technology: { label: "Capability diffusion", compactLabel: "Capabilities", description: "A derived view of established capability breadth and movement between settlements", icon: Atom, color: "#67e8f9" },
  climate: { label: "Climate & ecology", compactLabel: "Ecology", description: "Biomes, ecological stress, and environmental recovery", icon: CloudSun, color: "#7dd3a8" },
  population: { label: "Population", compactLabel: "People", description: "Population density, settlement growth, and migration", icon: Users, color: "#f9e979" },
};

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  discovery: Atom,
  ecology: Sprout,
  life: Users,
  politics: Shield,
  war: Flame,
  belief: Sparkles,
  migration: Users,
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", { notation: value >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);
}

function formatBirthRecord(birthDay: number) {
  return birthDay >= 1
    ? `Day ${birthDay.toLocaleString()}`
    : `${(1 - birthDay).toLocaleString()} modeled age units before Day 1`;
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
  const hasCamera = url.searchParams.has("lon") && url.searchParams.has("lat") && url.searchParams.has("z");
  const longitude = Number(url.searchParams.get("lon"));
  const latitude = Number(url.searchParams.get("lat"));
  const zoom = Number(url.searchParams.get("z"));
  const overlay = url.searchParams.get("layer") as PlanetOverlay | null;
  const kind = url.searchParams.get("kind") as PlanetEntitySelection["kind"] | null;
  const id = url.searchParams.get("id");
  const requestedView = url.searchParams.get("view") as ExperienceView | null;
  const requestedStatus = url.searchParams.get("status") as DirectoryStatus | null;
  const requestedPage = Number(url.searchParams.get("page"));
  return {
    camera: hasCamera && Number.isFinite(longitude) && Number.isFinite(latitude) && Number.isFinite(zoom)
      ? { longitude: wrapLongitude(longitude), latitude: clamp(latitude, -82, 82), zoom: clamp(zoom, 0.7, 18) }
      : null,
    overlay: overlay && PLANET_OVERLAYS.includes(overlay) ? overlay : null,
    selection: kind && id && ["agent", "settlement", "civilization", "resource"].includes(kind)
      ? { kind, id } as PlanetEntitySelection
      : null,
    view: requestedView && VIEW_SECTIONS.includes(requestedView) ? requestedView : "overview" as const,
    directoryQuery: url.searchParams.get("q") ?? "",
    directoryStatus: requestedStatus && ["active", "historical", "all"].includes(requestedStatus) ? requestedStatus : "active" as const,
    directoryPage: Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
  };
}

interface PlanetExperienceProps {
  adapter?: PlanetExperienceAdapter;
  archiveHref?: string;
  historyHref?: string;
  methodHref?: string;
}

export function PlanetExperience({
  adapter: providedAdapter,
  archiveHref = "/archive",
  historyHref = "/history",
  methodHref,
}: PlanetExperienceProps) {
  const adapter = useMemo(() => providedAdapter ?? createPlanetHttpAdapter(), [providedAdapter]);
  const subscribe = useCallback((listener: () => void) => adapter.subscribe?.(() => listener()) ?? (() => undefined), [adapter]);
  const getSnapshot = useCallback(() => adapter.getSnapshot(), [adapter]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const [view, setView] = useState<ExperienceView>("overview");
  const [overlay, setOverlay] = useState<PlanetOverlay>("population");
  const [camera, setCamera] = useState<PlanetCamera>(DEFAULT_CAMERA);
  const [selection, setSelection] = useState<PlanetEntitySelection | null>(null);
  const [entityDetail, setEntityDetail] = useState<PlanetEntityDetail | null>(null);
  const [detailStatus, setDetailStatus] = useState<DetailLoadState>("idle");
  const [detailRetry, setDetailRetry] = useState(0);
  const [leftPanel, setLeftPanel] = useState<LeftPanel>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PlanetAgent[]>([]);
  const [selectedCompactAgent, setSelectedCompactAgent] = useState<PlanetAgent | null>(null);
  const [showOverlayMenu, setShowOverlayMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [directoryQuery, setDirectoryQuery] = useState("");
  const [directoryStatus, setDirectoryStatus] = useState<DirectoryStatus>("active");
  const [directoryPage, setDirectoryPage] = useState(1);
  const initializedUrlRef = useRef(false);
  const mobileDetailRef = useRef<HTMLDialogElement>(null);
  const detailReturnFocusRef = useRef<HTMLElement | null>(null);
  const hadMobileDetailRef = useRef(false);
  const hasSelection = selection !== null;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const initial = readInitialUrlState();
      if (initial?.camera) setCamera(initial.camera);
      if (initial?.overlay) setOverlay(initial.overlay);
      if (initial?.selection) setSelection(initial.selection);
      if (initial?.view) setView(initial.view);
      if (initial) {
        setSearchQuery(initial.directoryQuery);
        setDirectoryQuery(initial.directoryQuery);
        setDirectoryStatus(initial.directoryStatus);
        setDirectoryPage(initial.directoryPage);
      }
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
      if (directoryQuery) url.searchParams.set("q", directoryQuery); else url.searchParams.delete("q");
      if (directoryStatus !== "active") url.searchParams.set("status", directoryStatus); else url.searchParams.delete("status");
      if (directoryPage > 1) url.searchParams.set("page", String(directoryPage)); else url.searchParams.delete("page");
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
  }, [camera, directoryPage, directoryQuery, directoryStatus, overlay, selection, view]);

  useEffect(() => {
    const handlePopState = () => {
      const state = readInitialUrlState();
      if (!state) return;
      if (state.camera) setCamera(state.camera);
      if (state.overlay) setOverlay(state.overlay);
      setSelection(state.selection);
      setView(state.view);
      setDirectoryQuery(state.directoryQuery);
      setSearchQuery(state.directoryQuery);
      setDirectoryStatus(state.directoryStatus);
      setDirectoryPage(state.directoryPage);
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

  useEffect(() => {
    if (typeof window === "undefined" || !hasSelection) return;
    const mobileQuery = window.matchMedia("(max-width: 820px)");
    const dialog = mobileDetailRef.current;
    if (!dialog) return;
    let focusFrame = 0;
    const synchronizeDialog = () => {
      if (!mobileQuery.matches) {
        if (dialog.open) dialog.close();
        return;
      }
      hadMobileDetailRef.current = true;
      if (!dialog.open) dialog.showModal();
      window.cancelAnimationFrame(focusFrame);
      focusFrame = window.requestAnimationFrame(() => dialog.focus());
    };
    synchronizeDialog();
    mobileQuery.addEventListener("change", synchronizeDialog);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      mobileQuery.removeEventListener("change", synchronizeDialog);
      if (dialog.open) dialog.close();
    };
  }, [hasSelection]);

  useEffect(() => {
    if (typeof window === "undefined" || hasSelection || !hadMobileDetailRef.current) return;
    hadMobileDetailRef.current = false;
    const returnTarget = detailReturnFocusRef.current;
    detailReturnFocusRef.current = null;
    const frame = window.requestAnimationFrame(() => {
      if (returnTarget?.isConnected) {
        returnTarget.focus();
        return;
      }
      document.querySelector<HTMLElement>(`.${styles.mobileBottomNav} [aria-current="page"]`)?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [hasSelection]);

  const selectEntity = useCallback((nextSelection: PlanetEntitySelection | null, focus = false) => {
    if (nextSelection && !selection && typeof window !== "undefined" && window.matchMedia("(max-width: 820px)").matches && document.activeElement instanceof HTMLElement) {
      detailReturnFocusRef.current = document.activeElement;
    }
    if (nextSelection?.kind === "agent") {
      const compactAgent = snapshot.agents.find((agent) => agent.id === nextSelection.id)
        ?? searchResults.find((agent) => agent.id === nextSelection.id);
      setSelectedCompactAgent((current) => compactAgent ?? (current?.id === nextSelection.id ? current : null));
    } else {
      setSelectedCompactAgent(null);
    }
    setSelection(nextSelection);
    if (typeof window !== "undefined" && initializedUrlRef.current && nextSelection) {
      const url = new URL(window.location.href);
      url.searchParams.set("view", view);
      url.searchParams.set("kind", nextSelection.kind);
      url.searchParams.set("id", nextSelection.id);
      const method = selection ? "replaceState" : "pushState";
      window.history[method]({ wildgrid: true, entry: "detail" }, "", url);
    }
    if (!nextSelection) return;
    if (focus) {
      const point = findSelectionPoint(snapshot, nextSelection);
      if (point) setCamera({ ...point, zoom: Math.max(camera.zoom, nextSelection.kind === "agent" ? 8.2 : 4.4) });
    }
  }, [camera.zoom, searchResults, selection, snapshot, view]);

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

  const indexedAgents = useMemo(() => [...snapshot.agents]
    .sort((left, right) => left.name.localeCompare(right.name))
    .slice(0, 24), [snapshot.agents]);

  const currentOverlay = OVERLAY_DETAILS[overlay];
  const continuityLabel = snapshot.meta.continuity
    ? `${snapshot.meta.continuity.persistent ? "Persistent shared record" : "Device-local record"} · ${snapshot.meta.continuity.caughtUp ? "caught up to observation time" : `${Math.ceil(snapshot.meta.continuity.pendingSeconds).toLocaleString()} simulated seconds pending`}${snapshot.meta.continuity.reconstructionResolution ? ` · ${snapshot.meta.continuity.reconstructionResolution} reconstruction` : ""}`
    : "Continuity status awaiting record metadata";
  const shownAgents = snapshot.coverage?.shown.agents;
  const availableAgents = snapshot.coverage?.available.agents;
  const coverageLabel = snapshot.coverage?.sampled
    ? `Viewport sample · ${shownAgents ?? 0} of ${availableAgents ?? "available"} nearby life records shown`
    : "Viewport record is not currently truncated";
  const featuredAgent = snapshot.agents.find((agent) => agent.knownFacts.length > 0 && agent.currentGoal)
    ?? searchResults.find((agent) => agent.knownFacts.length > 0 && agent.currentGoal)
    ?? snapshot.agents[0]
    ?? searchResults[0];
  const latestRecord = snapshot.chronicle[0];
  const activeSocietyCount = snapshot.civilizations.filter((civilization) => (civilization.lifecycleStatus ?? (civilization.population > 0 ? "active" : "historical")) === "active").length;
  const activeSettlementCount = snapshot.settlements.filter((settlement) => ["active", "declining"].includes(settlement.lifecycleStatus ?? (settlement.population > 0 ? "active" : "abandoned"))).length;

  function toggleLeftPanel(panel: Exclude<LeftPanel, null>) {
    setLeftPanel((current) => current === panel ? null : panel);
  }

  function navigateView(nextView: ExperienceView, replace = false) {
    if (nextView === view && !selection) return;
    setView(nextView);
    setSelection(null);
    setLeftPanel(null);
    setShowOverlayMenu(false);
    setShowMoreMenu(false);
    setDirectoryPage(1);
    if (typeof window === "undefined" || !initializedUrlRef.current) return;
    const url = new URL(window.location.href);
    url.searchParams.set("view", nextView);
    url.searchParams.delete("kind");
    url.searchParams.delete("id");
    url.searchParams.delete("page");
    const method = replace ? "replaceState" : "pushState";
    window.history[method]({ wildgrid: true, entry: replace ? "replace" : "view" }, "", url);
  }

  function changeDirectory(next: Partial<{ query: string; status: DirectoryStatus; page: number }>, replace = false) {
    const nextQuery = next.query ?? directoryQuery;
    const nextStatus = next.status ?? directoryStatus;
    const nextPage = next.page ?? (next.query !== undefined || next.status !== undefined ? 1 : directoryPage);
    setDirectoryQuery(nextQuery);
    setDirectoryStatus(nextStatus);
    setDirectoryPage(nextPage);
    if (typeof window === "undefined" || !initializedUrlRef.current) return;
    const url = new URL(window.location.href);
    if (nextQuery) url.searchParams.set("q", nextQuery); else url.searchParams.delete("q");
    if (nextStatus !== "active") url.searchParams.set("status", nextStatus); else url.searchParams.delete("status");
    if (nextPage > 1) url.searchParams.set("page", String(nextPage)); else url.searchParams.delete("page");
    window.history[replace ? "replaceState" : "pushState"]({ wildgrid: true, entry: "directory" }, "", url);
  }

  function changePeopleQuery(nextQuery: string) {
    setSearchQuery(nextQuery);
    changeDirectory({ query: nextQuery }, true);
  }

  function closeDetail() {
    if (typeof window !== "undefined" && window.history.state?.entry === "detail") {
      window.history.back();
    } else {
      setSelection(null);
    }
  }

  function containMobileDetailFocus(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeDetail();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      .filter((element) => element.getClientRects().length > 0);
    if (!focusable.length) {
      event.preventDefault();
      event.currentTarget.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable.at(-1)!;
    const activeElement = document.activeElement;
    if (activeElement === event.currentTarget || !event.currentTarget.contains(activeElement)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && activeElement === last) {
      event.preventDefault();
      first.focus();
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
            <div className={styles.brandLine}><strong>Simulation</strong><span>Prior planetary study</span></div>
            <div className={styles.eraLine}>Longitudinal study 03 <span>· Seed {snapshot.meta.seed.toLocaleString()}</span></div>
          </div>
        </div>

        <SectionTabs view={view} onChange={navigateView} className={styles.sectionTabs} />

        <nav className={styles.topActions} aria-label="World navigation">
          <button type="button" className={styles.textAction} aria-expanded={leftPanel === "agents"} onClick={() => { if (view !== "overview") navigateView("overview"); toggleLeftPanel("agents"); }}><Search size={17} /><span>Search lives</span></button>
          <a href={historyHref} className={styles.textAction}><BookOpen size={17} /><span>Archive</span></a>
          {methodHref ? <a href={methodHref} className={styles.textAction}><Compass size={17} /><span>Method</span></a> : null}
          <a href={archiveHref} className={styles.textAction}><Telescope size={17} /><span>Prior study</span></a>
          <span className={styles.mobileReadOnlyBadge} aria-label="Observer controls are read-only">Read-only</span>
          <span className={styles.liveBadge} data-status={snapshot.meta.status}>
            <span aria-hidden="true" />{snapshot.meta.dataMode === "sample" && adapter.mode === "live" ? "Offline record" : adapter.mode === "sample" ? "Study preview" : snapshot.meta.status === "live" ? "Observing" : snapshot.meta.status}
          </span>
        </nav>
      </header>

      {view === "overview" ? (
        <div className={styles.overviewStats} aria-label="Current world statistics">
          <Stat label="Observed day" value={snapshot.meta.day.toLocaleString()} />
          <Stat label="Living population" value={formatNumber(snapshot.meta.population)} />
          <Stat label="Active formations" value={snapshot.meta.dataMode === "live" && !snapshot.civilizations.length ? "…" : String(activeSocietyCount)} />
          <Stat label="Occupied sites" value={snapshot.meta.dataMode === "live" && !snapshot.settlements.length ? "…" : String(activeSettlementCount)} />
        </div>
      ) : null}

      {view === "overview" && !selection ? (
        <div className={styles.observationPlate} aria-label="Non-intervention observation status">
          <span>Field view · {currentOverlay.label}</span>
          <strong>World 01 / continuous autonomous run</strong>
          <small>{continuityLabel}</small>
          {snapshot.meta.continuity?.coverageFromDay !== undefined ? <small>Continuous archive coverage from Day {snapshot.meta.continuity.coverageFromDay.toLocaleString()}{snapshot.meta.continuity.coarseEpochDays ? `; long absences summarized in ${snapshot.meta.continuity.coarseEpochDays}-day epochs` : ""}.</small> : null}
          <small>{coverageLabel}. Navigation changes only the observer&apos;s view.</small>
        </div>
      ) : null}

      {view === "overview" && !selection ? (
        <section className={styles.mobileObservation} aria-label="Latest autonomy evidence">
          {featuredAgent ? (
            <button type="button" onClick={() => selectEntity({ kind: "agent", id: featuredAgent.id }, true)}>
              <span>Named decision trace · {featuredAgent.name}</span>
              <strong>{featuredAgent.knownFacts[0] ?? "No retained observation excerpt"}</strong>
              <small>Choice: {featuredAgent.action} · {featuredAgent.currentGoal}</small>
            </button>
          ) : (
            <div><span>Autonomy evidence</span><strong>Awaiting the first named life record.</strong></div>
          )}
          {latestRecord ? <button type="button" onClick={() => navigateView("timeline")}><span>Latest consequence · Day {latestRecord.day.toLocaleString()}</span><strong>{latestRecord.title}</strong></button> : null}
        </section>
      ) : null}

      {view === "overview" && leftPanel ? (
        <aside className={styles.leftDrawer} aria-label={leftPanel === "agents" ? "Agent search" : leftPanel === "chronicle" ? "World chronicle" : "Nearby world"}>
          <div className={styles.drawerHeader}>
            <div>
              <span className={styles.eyebrow}>{leftPanel === "agents" ? "Named-life register" : leftPanel === "chronicle" ? "Causal archive" : `${describeScale(camera.zoom)} observation`}</span>
              <h2>{leftPanel === "agents" ? "Find a life record" : leftPanel === "chronicle" ? "World chronicle" : "Records in view"}</h2>
            </div>
            <button type="button" className={styles.iconButton} aria-label="Close panel" onClick={() => setLeftPanel(null)}><X size={18} /></button>
          </div>
          {leftPanel === "agents" ? (
            <AgentRoster
              query={searchQuery}
              onQueryChange={setSearchQuery}
              agents={searchQuery.trim() ? searchResults : indexedAgents}
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
            <span className={styles.eyebrow}>Read-only field record · observed, never controlled</span>
            <button type="button" className={styles.iconButton} aria-label="Close inspector" onClick={() => selectEntity(null)}><X size={18} /></button>
          </div>
          <EntityInspector snapshot={snapshot} selection={selection} compactAgent={selectedCompactAgent} detail={entityDetail} detailStatus={detailStatus} onRetry={() => setDetailRetry((current) => current + 1)} onSelect={(next) => selectEntity(next, true)} />
        </aside>
      ) : view === "overview" ? (
        <OverviewInsights snapshot={snapshot} featuredAgent={featuredAgent} historyHref={historyHref} onSelect={(next) => selectEntity(next, true)} />
      ) : null}

      {view === "overview" ? <div className={styles.overlayDock}>
        <div className={styles.overlayTitle}>
          <span style={{ "--overlay-color": currentOverlay.color } as React.CSSProperties}><currentOverlay.icon size={16} /></span>
          <div><strong>Evidence layer · {currentOverlay.label}</strong><small>{currentOverlay.description}</small></div>
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
        <button type="button" onClick={() => setCamera({ ...DEFAULT_CAMERA, zoom: 0.86 })} aria-label="Show optional globe context view"><Globe2 size={19} /></button>
      </div> : null}

      {view === "overview" ? <div className={styles.viewReadout} aria-live="polite">
        <Crosshair size={14} /> <span>{describeScale(camera.zoom)} sample</span><small>{coordinates(camera)} · optical scale {camera.zoom.toFixed(1)}×</small>
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
          onQueryChange={changePeopleQuery}
          agents={searchQuery.trim() || searchResults.length ? searchResults : indexedAgents}
          directoryQuery={directoryQuery}
          directoryStatus={directoryStatus}
          directoryPage={directoryPage}
          onDirectoryChange={changeDirectory}
          onBack={backToOverview}
          onSelect={(next) => selectEntity(next, true)}
        />
      ) : null}

      {selection ? (
        <dialog ref={mobileDetailRef} className={styles.mobileDetail} aria-modal="true" aria-label="Entity details" tabIndex={-1} onCancel={(event) => { event.preventDefault(); closeDetail(); }} onKeyDown={containMobileDetailFocus}>
          <div className={styles.mobileDetailHeader}>
            <button type="button" onClick={closeDetail}><ArrowLeft size={19} />Back</button>
            <span>Read-only field record</span>
          </div>
          <EntityInspector snapshot={snapshot} selection={selection} compactAgent={selectedCompactAgent} detail={entityDetail} detailStatus={detailStatus} onRetry={() => setDetailRetry((current) => current + 1)} onSelect={(next) => selectEntity(next, true)} />
        </dialog>
      ) : null}

      <MobileNavigation view={view} onChange={navigateView} moreOpen={showMoreMenu} onMore={() => setShowMoreMenu((current) => !current)} />

      {showMoreMenu ? <div className={styles.mobileMoreMenu} role="menu" aria-label="More observatory sections">
        {(["societies", "settlements", "research"] as const).map((section) => {
          const detail = VIEW_DETAILS[section];
          const Icon = detail.icon;
          return <button type="button" role="menuitem" key={section} onClick={() => navigateView(section)}><Icon size={18} /><span><strong>{detail.label}</strong><small>{detail.description}</small></span></button>;
        })}
        <a role="menuitem" href={historyHref}><BookOpen size={18} /><span><strong>Archival chapters</strong><small>Permanent 200-day record</small></span></a>
        {methodHref ? <a role="menuitem" href={methodHref}><Compass size={18} /><span><strong>Method</strong><small>What autonomy means in this model</small></span></a> : null}
        <a role="menuitem" href={archiveHref}><Telescope size={18} /><span><strong>Prior study</strong><small>Earlier model retained for comparison</small></span></a>
      </div> : null}

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

function MobileNavigation({ view, onChange, moreOpen, onMore }: { view: ExperienceView; onChange: (view: ExperienceView) => void; moreOpen: boolean; onMore: () => void }) {
  const primary: Array<{ view: ExperienceView; label: string; icon: LucideIcon }> = [
    { view: "overview", label: "Observe", icon: Globe2 },
    { view: "people", label: "Lives", icon: Users },
    { view: "timeline", label: "Record", icon: BookOpen },
  ];
  const inMore = ["societies", "settlements", "research"].includes(view);
  return <nav className={styles.mobileBottomNav} aria-label="Primary observatory views">
    {primary.map((item) => <button type="button" key={item.view} data-active={view === item.view} aria-current={view === item.view ? "page" : undefined} onClick={() => onChange(item.view)}><item.icon size={18} /><span>{item.label}</span></button>)}
    <button type="button" data-active={inMore || moreOpen} aria-expanded={moreOpen} onClick={onMore}><MoreHorizontal size={18} /><span>More</span></button>
  </nav>;
}

function OverviewInsights({ snapshot, featuredAgent, historyHref, onSelect }: { snapshot: PlanetSnapshot; featuredAgent?: PlanetAgent; historyHref: string; onSelect: (selection: PlanetEntitySelection) => void }) {
  const generationCounts = new Map<number, number>();
  for (const agent of snapshot.agents) generationCounts.set(agent.generation, (generationCounts.get(agent.generation) ?? 0) + 1);
  const generationRows = [...generationCounts.entries()].sort((left, right) => left[0] - right[0]);
  const sampledLives = generationRows.reduce((total, [, count]) => total + count, 0);
  const capabilityCount = new Set(snapshot.settlements.flatMap((settlement) => settlement.capabilities ?? [])).size;
  const observation = snapshot.observation;
  const ageRows = observation ? [
    { label: "0–17", description: "children", count: observation.ageBands.children },
    { label: "18–64", description: "adults", count: observation.ageBands.adults },
    { label: "65+", description: "elders", count: observation.ageBands.elders },
  ] : [];
  const ageTotal = ageRows.reduce((total, row) => total + row.count, 0);
  const latestRecord = snapshot.chronicle[0];
  const coverage = snapshot.coverage;
  const continuity = snapshot.meta.continuity;
  const featuredOutcome = featuredAgent ? snapshot.chronicle.find((entry) => entry.actorIds?.includes(featuredAgent.id)) : undefined;
  return (
    <aside className={styles.insightStack} aria-label="World insights">
      <section className={`${styles.insightCard} ${styles.protocolCard}`}>
        <div className={styles.insightHeading}><span><Telescope size={17} /></span><div><small>Study protocol</small><strong>Continuous non-intervention</strong></div></div>
        <p className={styles.studyStatement}>Every inhabitant acts from local knowledge, remembered outcomes, material needs, and social commitments. There is no player faction and no observer command channel.</p>
        <div className={styles.protocolLine}>
          <span>Day {snapshot.meta.day.toLocaleString()}</span>
          <span>Revision {snapshot.meta.revision.toLocaleString()}</span>
          <span>Seed {snapshot.meta.seed.toLocaleString()}</span>
          <span>{continuity ? continuity.persistent ? "Persistent shared record" : "Device-local record" : "Continuity pending"}</span>
          <span>{continuity?.caughtUp ? "Caught up to wall time" : continuity ? `${Math.ceil(continuity.pendingSeconds).toLocaleString()}s pending` : "Timing metadata pending"}</span>
          {continuity?.reconstructionResolution ? <span>{humanizeCapability(continuity.reconstructionResolution)} reconstruction{continuity.coverageFromDay !== undefined ? ` · coverage from Day ${continuity.coverageFromDay}` : ""}</span> : null}
          {coverage?.sampled ? <span>Sampled viewport · {coverage.shown.agents ?? 0}/{coverage.available.agents ?? "?"} agents shown</span> : <span>Viewport not truncated</span>}
        </div>
      </section>

      <section className={`${styles.insightCard} ${styles.decisionEvidenceCard}`}>
        <div className={styles.insightCardTitle}><div><small>Named autonomy evidence</small><strong>{featuredAgent?.name ?? "Awaiting a life record"}</strong></div><CircleDot size={17} /></div>
        {featuredAgent ? (
          <button type="button" className={styles.compactDecisionTrace} onClick={() => onSelect({ kind: "agent", id: featuredAgent.id })}>
            <span><b>Evidence</b>{featuredAgent.knownFacts[0] ?? "No compact observation excerpt retained."}</span>
            <span><b>Alternatives</b>Retained in the full private-mind record when available.</span>
            <span><b>Choice</b>{featuredAgent.action}</span>
            <span><b>Plan</b>{featuredAgent.currentGoal}</span>
            <span><b>Outcome</b>{featuredOutcome?.title ?? "No consequential outcome is linked in this viewport excerpt."}</span>
            <span><b>Learning</b>Later choices update from observed results, not a personality assigned at birth.</span>
            <small>Open {featuredAgent.name}&apos;s evidence file for alternatives, plan steps, confidence, and learned expectations.</small>
          </button>
        ) : <p className={styles.evidenceNote}>A named trace will appear when the first compact agent record reaches this viewport.</p>}
      </section>

      <section className={styles.insightCard}>
        <div className={styles.insightCardTitle}><div><small>Demographic record</small><strong>Living population</strong></div><Users size={17} /></div>
        <div className={styles.populationFigure}><strong>{formatNumber(snapshot.meta.population)}</strong><span>extant lives at Day {snapshot.meta.day.toLocaleString()}</span></div>
        <div className={styles.cohortHeader}><span>{observation ? "Modeled life-cycle age" : "Generation cohorts"}</span><small>{observation ? `median ${observation.medianAge} · oldest ${observation.oldestAge}` : sampledLives ? `${sampledLives.toLocaleString()} mapped records` : "awaiting records"}</small></div>
        {observation ? (
          <div className={styles.cohortBars} role="img" aria-label={`Age distribution: ${observation.ageBands.children} children, ${observation.ageBands.adults} adults, and ${observation.ageBands.elders} elders`}>
            {ageRows.map((row) => (
              <div className={styles.cohortRow} key={row.label}>
                <span>{row.label}<small>{row.description}</small></span>
                <i><b style={{ width: `${ageTotal ? Math.max(3, row.count / ageTotal * 100) : 0}%` }} /></i>
                <strong>{row.count}</strong>
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.cohortBars} role="img" aria-label={`Generation distribution across ${sampledLives} currently mapped life records`}>
            {generationRows.slice(0, 5).map(([generation, count]) => (
              <div className={styles.cohortRow} key={generation}>
                <span>G{generation}</span>
                <i><b style={{ width: `${sampledLives ? Math.max(3, count / sampledLives * 100) : 0}%` }} /></i>
                <strong>{count}</strong>
              </div>
            ))}
            {!generationRows.length ? <p className={styles.evidenceNote}>No compact life records have reached this view yet.</p> : null}
          </div>
        )}
        <p className={styles.evidenceNote}>{observation ? "One world day advances one modeled age unit. These are compressed life cycles derived from persisted birth and death records, not calendar years or assigned demographic targets." : "Exact modeled age, birth day, parentage, and descendants remain attached to each individual life record."}</p>
      </section>

      <section className={styles.insightCard}>
        <div className={styles.insightCardTitle}><div><small>{observation ? `Up to ${observation.windowDays} modeled days` : "Current observation"}</small><strong>Autonomous activity</strong></div><Activity size={17} /></div>
        {observation ? (
          <div className={styles.decisionFigure}>
            <strong>{observation.autonomousDecisions.toLocaleString()}</strong>
            <span>living agents with a retained decision in this window</span>
          </div>
        ) : null}
        {observation ? <div className={styles.eventEvidence}>
          <InspectorValue label="Births / deaths" value={`${observation.births} / ${observation.deaths}`} />
          <InspectorValue label="Migrations" value={String(observation.migrations)} />
          <InspectorValue label="Discoveries" value={String(observation.discoveries)} />
          <InspectorValue label="Inventions" value={String(observation.inventions)} />
        </div> : null}
        <div className={styles.cohortHeader}><span>Emergent organization</span><small>current world</small></div>
        <div className={styles.emergenceGrid}>
          <InspectorValue label="Social formations" value={String(snapshot.civilizations.length)} />
          <InspectorValue label="Belief systems" value={String(snapshot.beliefs.length)} />
          <InspectorValue label="Known capabilities" value={String(observation?.knownCapabilities ?? capabilityCount)} />
          <InspectorValue label="Recorded relations" value={String(snapshot.relations.length)} />
          {observation ? <InspectorValue label="Unaffiliated lives" value={String(observation.independentAgents)} /> : <InspectorValue label="Habitation sites" value={String(snapshot.settlements.length)} />}
          {observation ? <InspectorValue label="No declared belief" value={String(observation.secularAgents)} /> : <InspectorValue label="Active conflicts" value={String(snapshot.conflicts.length)} />}
        </div>
        <p className={styles.evidenceNote}>Counts describe observed outcomes; they are not targets, scores, or authored progression.</p>
      </section>

      <section className={`${styles.insightCard} ${styles.counselCard}`}>
        <div className={styles.insightCardTitle}>
          <div><small>Decision provenance</small><strong>{snapshot.aiCounsel?.configured ? "Bounded external counsel observed" : "Internal deliberation only"}</strong></div>
          <Compass size={17} />
        </div>
        {snapshot.aiCounsel?.configured ? (
          <div className={styles.counselFacts}>
            <p>{snapshot.aiCounsel.model} may offer evidence-bounded counsel to {snapshot.aiCounsel.activeSlots} agent{snapshot.aiCounsel.activeSlots === 1 ? "" : "s"}. It cannot execute an action; each recipient weighs or rejects it through their own deliberation.</p>
            <div><span>{snapshot.aiCounsel.callsToday}/{snapshot.aiCounsel.dailyCallLimit} calls today</span><span>{snapshot.aiCounsel.lastCompletedDay === null ? "No completed counsel yet" : `Last completed Day ${snapshot.aiCounsel.lastCompletedDay.toLocaleString()}`}</span>{snapshot.aiCounsel.consecutiveFailures ? <span>{snapshot.aiCounsel.consecutiveFailures} consecutive failure{snapshot.aiCounsel.consecutiveFailures === 1 ? "" : "s"}</span> : null}</div>
          </div>
        ) : (
          <p className={styles.counselCopy}>Choices currently arise only from each agent&apos;s private observations, needs, relationships, plans, and learned outcome values. The observer supplies none of them.</p>
        )}
      </section>

      <section className={`${styles.insightCard} ${styles.causalCard}`}>
        <div className={styles.insightCardTitle}><div><small>Latest causal record</small><strong>{latestRecord ? `Day ${latestRecord.day.toLocaleString()}` : "Awaiting first change"}</strong></div><a href={historyHref}>Full archive</a></div>
        <div className={styles.causalEvents}>
          {snapshot.chronicle.slice(0, 2).map((entry) => {
            const Icon = CATEGORY_ICONS[entry.category] ?? Activity;
            const content = <><Icon size={15} /><span><small>Day {entry.day.toLocaleString()} · {entry.category}</small><strong>{entry.title}</strong><p>{entry.summary}</p></span></>;
            return entry.entity
              ? <button key={entry.id} type="button" className={styles.causalEvent} onClick={() => onSelect(entry.entity!)}>{content}</button>
              : <article key={entry.id} className={styles.causalEvent}>{content}</article>;
          })}
          {!snapshot.chronicle.length ? <p className={styles.evidenceNote}>No consequential change has been recorded yet.</p> : null}
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
  directoryQuery,
  directoryStatus,
  directoryPage,
  onDirectoryChange,
  onBack,
  onSelect,
}: {
  view: Exclude<ExperienceView, "overview">;
  snapshot: PlanetSnapshot;
  historyHref: string;
  query: string;
  onQueryChange: (query: string) => void;
  agents: PlanetAgent[];
  directoryQuery: string;
  directoryStatus: DirectoryStatus;
  directoryPage: number;
  onDirectoryChange: (next: Partial<{ query: string; status: DirectoryStatus; page: number }>, replace?: boolean) => void;
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
  const normalizedQuery = directoryQuery.trim().toLocaleLowerCase();
  const recordMatches = (text: string, active: boolean) => {
    const statusMatch = directoryStatus === "all" || (directoryStatus === "active" ? active : !active);
    return statusMatch && (!normalizedQuery || text.toLocaleLowerCase().includes(normalizedQuery));
  };
  const civilizationStatus = (civilization: PlanetSnapshot["civilizations"][number]) => civilization.lifecycleStatus ?? (civilization.population > 0 ? "active" : "historical");
  const settlementStatus = (settlement: PlanetSnapshot["settlements"][number]) => settlement.lifecycleStatus ?? (settlement.population > 0 ? "active" : "abandoned");
  const beliefStatus = (belief: PlanetSnapshot["beliefs"][number]) => belief.lifecycleStatus ?? belief.status ?? (belief.active === false || belief.followers === 0 ? "historical" : "active");
  const filteredCivilizations = snapshot.civilizations.filter((civilization) => recordMatches(`${civilization.name} ${civilization.summary}`, civilizationStatus(civilization) === "active"));
  const filteredSettlements = [...snapshot.settlements]
    .filter((settlement) => recordMatches(`${settlement.name} ${snapshot.civilizations.find((candidate) => candidate.id === settlement.civilizationId)?.name ?? ""}`, ["active", "declining"].includes(settlementStatus(settlement))))
    .sort((left, right) => right.population - left.population || left.name.localeCompare(right.name));
  const filteredBeliefs = snapshot.beliefs.filter((belief) => recordMatches(`${belief.name} ${belief.values.join(" ")} ${(belief.tenets ?? []).join(" ")}`, ["active", "revived"].includes(beliefStatus(belief))));
  const filteredCapabilities = capabilities.filter((capability) => !normalizedQuery || humanizeCapability(capability.id).toLocaleLowerCase().includes(normalizedQuery));
  const projects = (snapshot.knowledgeProjects ?? []).filter((project) => !normalizedQuery || `${project.title} ${project.capabilityId ?? ""} ${project.originatorName ?? ""} ${project.settlementName ?? ""}`.toLocaleLowerCase().includes(normalizedQuery));
  const maxRecords = view === "societies" ? Math.max(filteredCivilizations.length, filteredBeliefs.length) : view === "settlements" ? filteredSettlements.length : view === "research" ? Math.max(projects.length, filteredCapabilities.length) : 0;
  const totalPages = Math.max(1, Math.ceil(maxRecords / DIRECTORY_PAGE_SIZE));
  const safePage = Math.min(directoryPage, totalPages);
  const pageSlice = <T,>(records: T[]) => records.slice((safePage - 1) * DIRECTORY_PAGE_SIZE, safePage * DIRECTORY_PAGE_SIZE);

  return (
    <section className={styles.sectionView} data-view={view} aria-labelledby={`section-${view}-title`}>
      <header className={styles.sectionViewHeader}>
        <button type="button" className={styles.sectionBack} onClick={onBack}><ArrowLeft size={19} /><span>Overview</span></button>
        <div className={styles.sectionTitle}><span><Icon size={22} /></span><div><p>{detail.description}</p><h1 id={`section-${view}-title`}>{detail.label}</h1></div></div>
        <div className={styles.sectionCount}>{view === "people" ? formatNumber(snapshot.meta.population) : view === "societies" ? snapshot.civilizations.length : view === "settlements" ? snapshot.settlements.length : view === "research" ? capabilities.length : snapshot.chronicle.length}<span>{view === "people" ? " living" : " records"}</span></div>
      </header>
      <div className={styles.sectionBody}>
        {(["societies", "settlements", "research"] as ExperienceView[]).includes(view) ? <DirectoryControls query={directoryQuery} status={directoryStatus} page={safePage} totalPages={totalPages} resultCount={maxRecords} onChange={onDirectoryChange} showStatus={view !== "research"} /> : null}
        {view === "people" ? (
          <div className={styles.peopleLayout}>
            <PopulationStudySummary snapshot={snapshot} />
            <div className={styles.sectionRoster}><AgentRoster query={query} onQueryChange={onQueryChange} agents={agents} civilizations={snapshot.civilizations} onSelect={(id) => onSelect({ kind: "agent", id })} /></div>
          </div>
        ) : view === "societies" ? (
          <div className={styles.societiesSection}>
            <div className={styles.recordGrid}>
              {pageSlice(filteredCivilizations).map((civilization) => {
                const settlementCount = snapshot.settlements.filter((settlement) => settlement.civilizationId === civilization.id).length;
                const belief = snapshot.beliefs.find((candidate) => candidate.id === civilization.beliefId);
                const relationCount = snapshot.relations.filter((relation) => relation.fromCivilizationId === civilization.id || relation.toCivilizationId === civilization.id).length;
                const status = civilizationStatus(civilization);
                return <button type="button" key={civilization.id} className={styles.recordCard} style={{ "--entity-color": civilization.color } as React.CSSProperties} onClick={() => onSelect({ kind: "civilization", id: civilization.id })}><span className={styles.recordColor} /><div className={styles.recordHeading}><strong>{civilization.name}</strong><small>{formatNumber(civilization.population)} people</small></div><p>{civilization.summary}</p><div className={styles.recordFacts}><span>{humanizeCapability(status)}</span><span>{settlementCount} habitation sites</span><span>{belief?.name ?? "Plural / secular"}</span><span>{relationCount} recorded external ties</span></div><span className={styles.recordOpen}>Open field record <LocateFixed size={14} /></span></button>;
              })}
              {!filteredCivilizations.length ? <SectionEmpty icon={Shield} title="No matching society records" copy="Change the lifecycle filter or search terms to inspect another part of the record." /> : null}
            </div>
            <section className={styles.beliefDirectory} aria-labelledby="belief-directory-title">
              <header><div><span className={styles.eyebrow}>Beliefs emerge; they are never assigned</span><h2 id="belief-directory-title">Belief-system directory</h2></div><strong>{snapshot.beliefs.length} recorded</strong></header>
              <div className={styles.beliefGrid}>
                {pageSlice(filteredBeliefs).map((belief) => (
                  <article key={belief.id} className={styles.beliefCard} style={{ "--entity-color": belief.color } as React.CSSProperties}>
                    <div className={styles.beliefHeading}><span /><div><strong>{belief.name}</strong><small>{belief.kind ? humanizeCapability(belief.kind) : "Belief system"} · {humanizeCapability(beliefStatus(belief))}</small></div><em>{formatNumber(belief.followers)} adherents</em></div>
                    <div className={styles.beliefValues}><span>Core values</span>{belief.values.length ? <ul>{belief.values.map((value) => <li key={value}>{humanizeCapability(value)}</li>)}</ul> : <p>No core values have been recorded yet.</p>}</div>
                    {belief.tenets?.length ? <div className={styles.beliefTenets}><span>Tenets</span><p>{belief.tenets.map(humanizeCapability).join(" · ")}</p></div> : null}
                    <dl className={styles.beliefOrigins}>
                      <div><dt>Founded by</dt><dd>{belief.founderName ?? belief.founderAgentId ?? "Not recorded"}</dd></div>
                      <div><dt>Origin</dt><dd>{belief.originName ?? (belief.originSettlementId ? "Settlement record outside this view" : "No settlement recorded")}</dd></div>
                      <div><dt>Founded</dt><dd>{belief.originDay === undefined ? "Day not recorded" : `Day ${belief.originDay.toLocaleString()}`}</dd></div>
                      <div><dt>Lineage</dt><dd>{belief.parentBeliefId ? `Descended from ${snapshot.beliefs.find((candidate) => candidate.id === belief.parentBeliefId)?.name ?? "an earlier belief"}` : "Original tradition"}{belief.schisms ? ` · ${belief.schisms} schism${belief.schisms === 1 ? "" : "s"}` : ""}</dd></div>
                    </dl>
                    {belief.reforms?.length ? <div className={styles.latestReform}><span>Latest reform · Day {belief.reforms.at(-1)?.day.toLocaleString()}</span><p>{belief.reforms.at(-1)?.summary}</p></div> : null}
                  </article>
                ))}
                {!filteredBeliefs.length ? <SectionEmpty icon={Sparkles} title="No matching belief record" copy="Dormant and historical traditions remain available through the lifecycle filter." /> : null}
              </div>
            </section>
          </div>
        ) : view === "settlements" ? (
          <div className={styles.recordGrid}>
            {pageSlice(filteredSettlements).map((settlement) => {
              const civilization = snapshot.civilizations.find((candidate) => candidate.id === settlement.civilizationId);
              const status = settlementStatus(settlement);
              return <button type="button" key={settlement.id} className={styles.recordCard} style={{ "--entity-color": civilization?.color ?? "#7ecfc7" } as React.CSSProperties} onClick={() => onSelect({ kind: "settlement", id: settlement.id })}><span className={styles.recordColor} /><div className={styles.recordHeading}><strong>{settlement.name}</strong><small>{humanizeCapability(status)} · {coordinates(settlement)}</small></div><div className={styles.recordFacts}><span>{status === "abandoned" ? "Ruins · no current residents" : `${formatNumber(settlement.population)} residents`}</span><span>{settlement.capabilities?.length ?? 0} established capabilities</span><span>{civilization?.name ?? "No polity recorded"}</span></div><span className={styles.recordOpen}>Open site record <LocateFixed size={14} /></span></button>;
            })}
            {!filteredSettlements.length ? <SectionEmpty icon={Building2} title="No matching habitation records" copy="Abandoned sites and ruins remain available under Historical." /> : null}
          </div>
        ) : view === "research" ? (
          <div className={styles.researchLayout}>
            <div className={styles.researchIntro}><Atom size={25} /><div><span className={styles.eyebrow}>No prescribed technology tree</span><h2>Knowledge exists where people have learned it.</h2><p>These are capabilities currently established in observed settlements. New experiments, failures, and inventions enter this record only when the simulation produces them.</p></div></div>
            <div className={styles.researchList}>
              {projects.length ? pageSlice(projects).map((project, index) => <article key={project.id}><span>P{String((safePage - 1) * DIRECTORY_PAGE_SIZE + index + 1).padStart(2, "0")}</span><div><strong>{project.title}</strong><small>{humanizeCapability(project.status)}{project.originatorName ? ` · initiated by ${project.originatorName}` : " · originator not retained"}{project.settlementName ? ` at ${project.settlementName}` : ""}</small><p>{project.evidence?.length ? `Evidence: ${project.evidence.slice(0, 2).join(" · ")}` : project.failureReason ? `Recorded failure: ${project.failureReason}` : "The compact record contains no supporting evidence excerpt."}</p></div><em>{project.completedDay ? `Day ${project.completedDay}` : project.startedDay ? `Since Day ${project.startedDay}` : "Date unrecorded"}</em></article>) : pageSlice(filteredCapabilities).map((capability, index) => <article key={capability.id}><span>R{String((safePage - 1) * DIRECTORY_PAGE_SIZE + index + 1).padStart(2, "0")}</span><div><strong>{humanizeCapability(capability.id)}</strong><small>Observed in {capability.settlements} settlement{capability.settlements === 1 ? "" : "s"} across {capability.societies} societ{capability.societies === 1 ? "y" : "ies"}</small><p>Origin and failed experiments are outside this compact viewport record.</p></div><em>Established by agents</em></article>)}
              {!projects.length && !filteredCapabilities.length ? <SectionEmpty icon={Atom} title="No matching knowledge record" copy="Projects appear only after agents propose, test, and retain them." /> : null}
            </div>
          </div>
        ) : (
          <div className={styles.timelineView}><div className={styles.timelineLead}><span>Longitudinal record · Study 03</span><strong>Through Day {snapshot.meta.day.toLocaleString()}</strong><p>Entries are admitted for causal significance. Routine ticks and repeated status noise are excluded from the archive.</p><a href={historyHref}><BookOpen size={16} />Open archival chapters</a></div><Chronicle snapshot={snapshot} onSelect={(entity) => entity && onSelect(entity)} /></div>
        )}
      </div>
    </section>
  );
}

function DirectoryControls({ query, status, page, totalPages, resultCount, onChange, showStatus }: { query: string; status: DirectoryStatus; page: number; totalPages: number; resultCount: number; onChange: (next: Partial<{ query: string; status: DirectoryStatus; page: number }>, replace?: boolean) => void; showStatus: boolean }) {
  return <div className={styles.directoryControls} aria-label="Directory filters">
    <label><Search size={17} aria-hidden="true" /><span className={styles.srOnly}>Search this directory</span><input value={query} onChange={(event) => onChange({ query: event.target.value }, true)} placeholder="Search the observation record…" /></label>
    {showStatus ? <div className={styles.statusFilters} role="group" aria-label="Lifecycle status">
      {(["active", "historical", "all"] as DirectoryStatus[]).map((option) => <button type="button" key={option} aria-pressed={status === option} onClick={() => onChange({ status: option })}>{option === "active" ? "Living / active" : option === "historical" ? "Historical / ruins" : "All records"}</button>)}
    </div> : null}
    <div className={styles.directoryPager}>
      <span>{resultCount.toLocaleString()} matching · page {page} of {totalPages}</span>
      <button type="button" disabled={page <= 1} onClick={() => onChange({ page: page - 1 })} aria-label="Previous directory page">←</button>
      <button type="button" disabled={page >= totalPages} onClick={() => onChange({ page: page + 1 })} aria-label="Next directory page">→</button>
    </div>
  </div>;
}

function PopulationStudySummary({ snapshot }: { snapshot: PlanetSnapshot }) {
  const observation = snapshot.observation;
  const activePurposes = observation
    ? Object.entries(observation.activeGoals)
      .filter((entry): entry is [string, number] => typeof entry[1] === "number" && entry[1] > 0)
      .sort((left, right) => right[1] - left[1])
      .slice(0, 5)
    : [];
  const totalPurposes = activePurposes.reduce((total, [, count]) => total + count, 0);
  const ageRows = observation ? [
    { label: "Children · 0–17", count: observation.ageBands.children },
    { label: "Adults · 18–64", count: observation.ageBands.adults },
    { label: "Elders · 65+", count: observation.ageBands.elders },
  ] : [];
  const ageTotal = ageRows.reduce((total, row) => total + row.count, 0);

  return (
    <section className={styles.populationStudy} aria-labelledby="population-study-title">
      <header>
        <span className={styles.eyebrow}>Population register · measured lives</span>
        <h2 id="population-study-title">Demographic observation</h2>
        <p>No demographic outcome is prescribed. Birth, death, aging, migration, affiliation, and family formation arise inside the simulation. One world day advances one modeled life-cycle age unit; these are not calendar years.</p>
      </header>
      <div className={styles.censusMeasure}>
        <span>Current living census</span>
        <strong>{snapshot.meta.population.toLocaleString()}</strong>
        <small>as observed on Day {snapshot.meta.day.toLocaleString()}</small>
      </div>
      {observation ? (
        <>
          <div className={styles.populationSectionTitle}><span>Modeled age structure</span><small>median {observation.medianAge} · oldest {observation.oldestAge}</small></div>
          <div className={styles.studyBars}>
            {ageRows.map((row) => (
              <div key={row.label}><span>{row.label}</span><i><b style={{ width: `${ageTotal ? Math.max(2, row.count / ageTotal * 100) : 0}%` }} /></i><strong>{row.count.toLocaleString()}</strong></div>
            ))}
          </div>
          <div className={styles.populationSectionTitle}><span>Up to {observation.windowDays} modeled days ending now</span><small>persisted events</small></div>
          <div className={styles.lifeEventGrid}>
            <InspectorValue label="Living agents with a retained choice" value={observation.autonomousDecisions.toLocaleString()} />
            <InspectorValue label="Births" value={observation.births.toLocaleString()} />
            <InspectorValue label="Deaths" value={observation.deaths.toLocaleString()} />
            <InspectorValue label="Migrations" value={observation.migrations.toLocaleString()} />
            <InspectorValue label="Discoveries" value={observation.discoveries.toLocaleString()} />
            <InspectorValue label="Inventions" value={observation.inventions.toLocaleString()} />
          </div>
          {activePurposes.length ? <div className={styles.activePurposes}>
            <div className={styles.populationSectionTitle}><span>Most recent self-directed purposes</span><small>living agents</small></div>
            {activePurposes.map(([purpose, count]) => <div key={purpose}><span>{humanizeCapability(purpose)}</span><i><b style={{ width: `${Math.max(3, count / totalPurposes * 100)}%` }} /></i><strong>{count}</strong></div>)}
          </div> : null}
        </>
      ) : (
        <p className={styles.studyUnavailable}>The detailed age and event window is not present in this snapshot. Individual life files still retain exact birth, death, and lineage evidence.</p>
      )}
      <p className={styles.studyFootnote}>This panel reports state; it contains no controls that can alter a life.</p>
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
      <p className={styles.panelHint}>{query ? `Showing ${agents.length} matching living record${agents.length === 1 ? "" : "s"}` : "Named living records in alphabetical order. Open one to inspect evidence, memory, kinship, and deliberation."}</p>
      <div className={styles.entityList}>
        {agents.map((agent) => {
          const civilization = civilizations.find((candidate) => candidate.id === agent.civilizationId);
          return (
            <button type="button" key={agent.id} className={styles.entityRow} onClick={() => onSelect(agent.id)}>
              <span className={styles.rank} style={{ "--entity-color": civilization?.color ?? "#9aa8aa" } as React.CSSProperties}><CircleDot size={14} /></span>
              <span className={styles.entityCopy}>
                <strong>{agent.name}</strong>
                <small>{agent.action} · G{agent.generation} · {civilization?.name ?? "independent"}</small>
              </span>
              <span className={styles.entityMeta} style={{ "--entity-color": civilization?.color ?? "#9aa8aa" } as React.CSSProperties}>{agent.age === undefined ? `G${agent.generation}` : <><strong>{agent.age}</strong><small>age units</small></>}</span>
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
        const content = <><span className={styles.chronicleIcon}><Icon size={16} /></span><span><small>Day {entry.day.toLocaleString()} · {entry.category}</small><strong>{entry.title}</strong><p>{entry.summary}</p></span></>;
        return entry.entity
          ? <button key={entry.id} type="button" className={styles.chronicleEntry} onClick={() => onSelect(entry.entity)}>{content}</button>
          : <article key={entry.id} className={styles.chronicleEntry}>{content}</article>;
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
  compactAgent,
  detail,
  detailStatus,
  onRetry,
  onSelect,
}: {
  snapshot: PlanetSnapshot;
  selection: PlanetEntitySelection;
  compactAgent?: PlanetAgent | null;
  detail: PlanetEntityDetail | null;
  detailStatus: DetailLoadState;
  onRetry: () => void;
  onSelect: (selection: PlanetEntitySelection) => void;
}) {
  const currentDetail = detail?.record.id === selection.id ? detail : null;
  if (currentDetail) {
    return <DetailedEntityInspector snapshot={snapshot} detail={currentDetail} onSelect={onSelect} />;
  }
  const compactRecordAvailable = selection.kind === "agent"
    ? snapshot.agents.some((candidate) => candidate.id === selection.id) || compactAgent?.id === selection.id
    : selection.kind === "settlement"
      ? snapshot.settlements.some((candidate) => candidate.id === selection.id)
      : selection.kind === "civilization"
        ? snapshot.civilizations.some((candidate) => candidate.id === selection.id)
        : snapshot.resources.some((candidate) => candidate.id === selection.id);
  if (detailStatus === "loading" && selection.kind !== "resource" && !compactRecordAvailable) {
    return <DetailState icon={Activity} title="Reading the living record" copy="Loading this entity’s current mind, family, and material state…" />;
  }
  if (detailStatus === "error" && selection.kind !== "resource" && !compactRecordAvailable) {
    return <DetailState icon={CloudSun} title="Detail temporarily unavailable" copy="The compact map record is safe, but the deeper record could not be reached." action="Try again" onAction={onRetry} />;
  }
  const compactRecordNotice = selection.kind !== "resource" && (detailStatus === "loading" || detailStatus === "error") ? (
    <div className={styles.compactRecordNotice} role={detailStatus === "loading" ? "status" : undefined}>
      <span>
        <strong>{detailStatus === "loading" ? "Reading the deeper record" : "Deep record temporarily unavailable"}</strong>
        <small>{detailStatus === "loading" ? "Showing the compact viewport record while its evidence archive loads." : "Showing the compact viewport record; no simulation facts were invented to fill the gap."}</small>
      </span>
      {detailStatus === "error" ? <button type="button" onClick={onRetry}>Retry</button> : null}
    </div>
  ) : null;
  const withCompactNotice = (content: React.ReactNode) => <>{compactRecordNotice}{content}</>;
  if (selection.kind === "agent") {
    const agent = snapshot.agents.find((candidate) => candidate.id === selection.id)
      ?? (compactAgent?.id === selection.id ? compactAgent : null);
    if (!agent) return <MissingSelection />;
    const civilization = snapshot.civilizations.find((candidate) => candidate.id === agent.civilizationId);
    const settlement = snapshot.settlements.find((candidate) => candidate.id === agent.settlementId);
    const belief = snapshot.beliefs.find((candidate) => candidate.id === agent.beliefId);
    return withCompactNotice(
      <InspectorFrame icon={<CircleDot size={23} />} title={agent.name} subtitle={`${agent.age === undefined ? "Modeled age pending" : `Modeled age ${agent.age}`} · Generation ${agent.generation} · living record`} color={civilization?.color}>
        <InspectorSection label="Current self-directed purpose">
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
        <p className={styles.observerNote}>Simulation exposes the evidence behind this choice. It never supplies the choice.</p>
      </InspectorFrame>,
    );
  }

  if (selection.kind === "settlement") {
    const settlement = snapshot.settlements.find((candidate) => candidate.id === selection.id);
    if (!settlement) return <MissingSelection />;
    const civilization = snapshot.civilizations.find((candidate) => candidate.id === settlement.civilizationId);
    const residents = snapshot.agents.filter((agent) => agent.settlementId === settlement.id);
    return withCompactNotice(
      <InspectorFrame icon={<MapPin size={23} />} title={settlement.name} subtitle={`${settlement.kind} · ${formatNumber(settlement.population)} residents`} color={civilization?.color}>
        <InspectorSection label="Observed site record">
          <InspectorValue label="Location" value={coordinates(settlement)} />
          <InspectorValue label="Established capabilities" value={String(settlement.capabilities?.length ?? 0)} />
          {civilization ? <InspectorLink label="Society" value={civilization.name} color={civilization.color} onClick={() => onSelect({ kind: "civilization", id: civilization.id })} /> : null}
        </InspectorSection>
        <InspectorSection label="Lives here">
          {residents.slice(0, 5).map((agent) => <InspectorLink key={agent.id} label={agent.action} value={agent.name} onClick={() => onSelect({ kind: "agent", id: agent.id })} />)}
        </InspectorSection>
      </InspectorFrame>,
    );
  }

  if (selection.kind === "civilization") {
    const civilization = snapshot.civilizations.find((candidate) => candidate.id === selection.id);
    if (!civilization) return <MissingSelection />;
    const belief = snapshot.beliefs.find((candidate) => candidate.id === civilization.beliefId);
    const settlements = snapshot.settlements.filter((settlement) => settlement.civilizationId === civilization.id).sort((left, right) => right.population - left.population);
    const relations = snapshot.relations.filter((relation) => relation.fromCivilizationId === civilization.id || relation.toCivilizationId === civilization.id);
    const conflicts = snapshot.conflicts.filter((conflict) => conflict.attackerCivilizationId === civilization.id || conflict.defenderCivilizationId === civilization.id);
    return withCompactNotice(
      <InspectorFrame icon={<Shield size={23} />} title={civilization.name} subtitle={`${formatNumber(civilization.population)} people · ${settlements.length} settlements`} color={civilization.color}>
        <p className={styles.entitySummary}>{civilization.summary}</p>
        <InspectorSection label="Observed organization">
          <InspectorValue label="Declared worldview" value={belief?.name ?? "Plural / secular"} />
          <InspectorValue label="External ties" value={String(relations.length)} />
          <InspectorValue label="Active conflicts" value={String(conflicts.length)} />
        </InspectorSection>
        <InspectorSection label="Settlements">
          {settlements.slice(0, 6).map((settlement) => <InspectorLink key={settlement.id} label={`${settlement.kind} · ${formatNumber(settlement.population)}`} value={settlement.name} onClick={() => onSelect({ kind: "settlement", id: settlement.id })} />)}
        </InspectorSection>
      </InspectorFrame>,
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
    const lifeStage = age < 18 ? "Child" : age < 35 ? "Young adult" : age < 65 ? "Adult" : "Elder";
    const citedObservations = agent.mind.lastDecision
      ? agent.mind.lastDecision.knownFactIds
        .map((id) => agent.mind.observations.find((observation) => observation.id === id))
        .filter((observation): observation is NonNullable<typeof observation> => Boolean(observation))
      : [];
    const learnedContexts = [...agent.mind.contextualLearning].sort((left, right) => right.lastUpdatedAt - left.lastUpdatedAt).slice(0, 4);
    const strongestLearnedDrives = Object.entries(agent.mind.learnedDriveWeights)
      .sort((left, right) => right[1] - left[1])
      .slice(0, 5)
      .map(([drive]) => drive);
    return (
      <InspectorFrame icon={<CircleDot size={23} />} title={agent.name} subtitle={`Modeled age ${age} · Generation ${agent.generation} · ${agent.alive ? "living" : `died Day ${agent.deathDay?.toLocaleString()}`}`} color={civilization?.color}>
        <InspectorSection label="Autonomous decision trace">
          <div className={styles.decisionTrace}>
            <article>
              <header><span>01</span><div><strong>Evidence available</strong><small>Private observations cited by the most recent choice</small></div></header>
              {citedObservations.length ? <div className={styles.observationRecords}>{citedObservations.map((observation) => (
                <div key={observation.id}><span>{humanizeCapability(observation.kind)} · learned Day {Math.floor(observation.learnedAt / 60) + 1}</span><strong>{humanizeCapability(observation.subjectId)}</strong><p>{Object.entries(observation.facts).slice(0, 3).map(([key, value]) => `${humanizeCapability(key)}: ${String(value)}`).join(" · ") || "No retained factual fields"}</p><small>confidence estimate {Math.round(observation.confidence * 100)}%</small></div>
              ))}</div> : agent.mind.lastDecision?.knownFactIds.length ? <p className={styles.missingRecord}>{agent.mind.lastDecision.knownFactIds.length} cited fact reference{agent.mind.lastDecision.knownFactIds.length === 1 ? " is" : "s are"} outside this retained observation excerpt.</p> : <p className={styles.missingRecord}>No specific observation was cited in the retained decision record.</p>}
            </article>
            <article>
              <header><span>02</span><div><strong>Alternatives considered</strong><small>Options generated inside this mind</small></div></header>
              {agent.mind.lastDecision?.alternatives.length ? <div className={styles.alternatives}>{agent.mind.lastDecision.alternatives.map((alternative) => <div key={`${alternative.purpose}-${alternative.score}`}><strong>{humanizeCapability(alternative.purpose)}</strong><small>{alternative.summary}</small></div>)}</div> : <p className={styles.missingRecord}>No rejected alternative was retained.</p>}
            </article>
            <article>
              <header><span>03</span><div><strong>Choice and active plan</strong><small>{agent.mind.lastDecision ? `decided Day ${Math.floor(agent.mind.lastDecision.decidedAt / 60) + 1} · confidence estimate ${Math.round((1 - agent.mind.lastDecision.uncertainty) * 100)}%` : "No completed choice retained"}</small></div></header>
              {agent.mind.lastDecision ? <div className={styles.decisionRecord}><Compass size={18} /><div><strong>{agent.mind.lastDecision.explanation}</strong></div></div> : <p className={styles.missingRecord}>No completed deliberation has been recorded yet.</p>}
              {activeGoal ? <div className={styles.activePlan}><span>{humanizeCapability(activeGoal.purpose)} · {activeGoal.status}{activeGoal.targetId ? ` · target ${humanizeCapability(activeGoal.targetId)}` : ""}</span><strong>{activeGoal.rationale}</strong>{activeGoal.steps.length ? <ol>{activeGoal.steps.map((step) => <li key={step.id} data-status={step.status}><span>{humanizeCapability(step.action)}</span><small>{step.status}{step.requirements.length ? ` · needs ${step.requirements.map(humanizeCapability).join(", ")}` : ""}</small></li>)}</ol> : null}</div> : null}
            </article>
            <article>
              <header><span>04</span><div><strong>Learning retained</strong><small>Experience changes later expectations; no birth personality is assigned</small></div></header>
              {learnedContexts.length ? <div className={styles.learningRecords}>{learnedContexts.map((learning) => <div key={learning.key}><strong>{humanizeCapability(learning.key)}</strong><span>{learning.attempts} observed attempt{learning.attempts === 1 ? "" : "s"}</span><small>{learning.expectedValue > 0.25 ? "outcomes learned as favorable" : learning.expectedValue < -0.25 ? "outcomes learned as unfavorable" : "outcomes remain mixed"}</small></div>)}</div> : <p className={styles.missingRecord}>No repeated contextual outcome has formed a retained expectation yet.</p>}
              {strongestLearnedDrives.length ? <div className={styles.learnedDrives}><span>Most elevated learned concerns</span><p>{strongestLearnedDrives.map(humanizeCapability).join(" · ")}</p></div> : null}
            </article>
          </div>
        </InspectorSection>
        {agent.mind.advisory ? <InspectorSection label="Separate external advisory record">
          <div className={styles.advisoryRecord}>
            <div><Atom size={17} /><span><strong>Nonbinding counsel · {humanizeCapability(agent.mind.advisory.status)}</strong><small>{agent.mind.advisory.provenance}</small></span></div>
            <p>{agent.mind.advisory.reasoning}</p>
            <dl><div><dt>Suggested purpose</dt><dd>{humanizeCapability(agent.mind.advisory.goalKind)}</dd></div><div><dt>Proposal intent</dt><dd>{agent.mind.advisory.proposalIntent ? humanizeCapability(agent.mind.advisory.proposalIntent) : "None"}</dd></div><div><dt>Received</dt><dd>Day {Math.floor(agent.mind.advisory.receivedAt / 60) + 1}</dd></div><div><dt>Expires</dt><dd>Day {Math.floor(agent.mind.advisory.expiresAt / 60) + 1}</dd></div></dl>
            <small>This counsel is an uncertain input. It cannot act, replace local evidence, or compel the recorded choice above.</small>
          </div>
        </InspectorSection> : null}
        <InspectorSection label="Life course">
          <InspectorValue label="Life stage" value={lifeStage} />
          <InspectorValue label="Birth record" value={formatBirthRecord(agent.birthDay)} />
          <InspectorValue label="Generation" value={String(agent.generation)} />
          <InspectorValue label="Recorded children" value={String(agent.childIds.length)} />
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
    const lifecycle = settlement.lifecycleStatus ?? publicSettlement?.lifecycleStatus ?? ((publicSettlement?.population ?? settlement.residentIds.length) ? "active" : "abandoned");
    return (
      <InspectorFrame icon={<Building2 size={23} />} title={settlement.name} subtitle={`${humanizeCapability(lifecycle)} · ${formatNumber(publicSettlement?.population ?? settlement.residentIds.length)} residents · founded Day ${foundedDay.toLocaleString()}`} color={civilization?.color}>
        {lifecycle === "abandoned" || lifecycle === "historical" ? <p className={styles.observerNote}>This site is retained as a ruin in the observation record, not counted as a living habitation site.</p> : null}
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
  const lifecycle = civilization.lifecycleStatus ?? publicCivilization?.lifecycleStatus ?? ((publicCivilization?.population ?? civilization.citizenIds.length) ? "active" : "historical");
  return (
    <InspectorFrame icon={<Shield size={23} />} title={civilization.name} subtitle={`${humanizeCapability(lifecycle)} · ${formatNumber(publicCivilization?.population ?? civilization.citizenIds.length)} citizens · formed Day ${foundedDay.toLocaleString()}`} color={publicCivilization?.color}>
      <InspectorSection label="Leadership & institutions">
        {civilization.leaderId ? <InspectorLink label="Recorded leader" value={agentName(civilization.leaderId)} onClick={() => onSelect({ kind: "agent", id: civilization.leaderId! })} /> : <InspectorValue label="Recorded leader" value="No sole leader" />}
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
