export type SurvivalAgentId = "A1" | "A2" | "A3" | "A4" | "A5";

export const SURVIVAL_AGENT_IDS: readonly SurvivalAgentId[] = ["A1", "A2", "A3", "A4", "A5"];

/** Stable identity colors. They identify an agent and never communicate health. */
export const SURVIVAL_AGENT_COLORS: Readonly<Record<SurvivalAgentId, string>> = {
  A1: "#429fff",
  A2: "#f29a5a",
  A3: "#4bd39a",
  A4: "#a879ff",
  A5: "#f2cf5b",
};

export interface HabitatPoint {
  x: number;
  z: number;
  /** Omit to place the object on the renderer's terrain surface. */
  y?: number;
}

export interface HabitatWaterFeature {
  id: string;
  position: HabitatPoint;
  radiusX: number;
  radiusZ: number;
  rotation?: number;
}

export interface HabitatClearing {
  position: HabitatPoint;
  radius: number;
}

export interface HabitatTerrainVisual {
  flatStudy?: boolean;
  seed: number;
  halfSize: number;
  /** Defaults to 82% of halfSize. */
  islandRadius?: number;
  /** Defaults to 4 world units. */
  elevationScale?: number;
  /** Decorative scenery density, normalized from 0 to 1. */
  vegetationDensity?: number;
  /** Decorative scenery density, normalized from 0 to 1. */
  rockDensity?: number;
  /** These are physical inland water features, not decorative resource markers. */
  freshwater: HabitatWaterFeature[];
  /** Areas kept open for camps, paths, or other engine-supported clearings. */
  clearings?: HabitatClearing[];
}

export type HabitatResourceKind =
  | "freshwater"
  | "food"
  | "timber"
  | "stone"
  | "fiber"
  | "medicine"
  | "clay"
  | "ore";

export interface HabitatResourceVisual {
  id: string;
  kind: HabitatResourceKind;
  position: HabitatPoint;
  /** Current usable fraction. Zero-valued nodes are hidden. */
  available: number;
  visible?: boolean;
}

export type ShelterStage = "site" | "lean-to" | "shelter" | "cabin" | "fire";

export interface HabitatShelterVisual {
  id: string;
  position: HabitatPoint;
  heading: number;
  stage: ShelterStage;
  /** Construction progress and integrity are normalized from 0 to 1. */
  progress: number;
  integrity: number;
  ownerIds: SurvivalAgentId[];
  fireLit?: boolean;
}

export type HabitatWeatherKind = "clear" | "cloudy" | "rain" | "storm" | "fog" | "snow";

export interface HabitatWeatherVisual {
  kind: HabitatWeatherKind;
  /** Normalized from 0 to 1. */
  intensity: number;
  wind?: { x: number; z: number };
}

export type HabitatDayPhase = "dawn" | "day" | "dusk" | "night";

export interface HabitatDaylightVisual {
  phase: HabitatDayPhase;
  /** Normalized available light. The renderer keeps silhouettes legible at zero. */
  lightLevel: number;
  /** Clockwise radians in world space. */
  sunAzimuth?: number;
}

export type HabitatActionKind =
  | "await"
  | "move"
  | "explore"
  | "relocate"
  | "gather"
  | "drink"
  | "eat"
  | "rest"
  | "sleep"
  | "craft"
  | "build"
  | "research"
  | "test"
  | "communicate"
  | "share"
  | "trade"
  | "rescue"
  | "defend";

export type HabitatToolKind =
  | "none"
  | "axe"
  | "pick"
  | "hammer"
  | "knife"
  | "container"
  | "notebook"
  | "test-vessel"
  | "medicine"
  | "torch";

export interface HabitatActionVisual {
  kind: HabitatActionKind;
  /** A short factual engine-supplied label, such as "Testing wet timber". */
  label: string;
  progress?: number;
  targetPosition?: HabitatPoint;
  /** Rendered only when the authoritative state says the agent has this tool in hand. */
  tool?: HabitatToolKind;
}

export type HabitatCarriedItemKind =
  | "food"
  | "water"
  | "timber"
  | "stone"
  | "fiber"
  | "medicine"
  | "clay"
  | "ore"
  | "unknown";

export interface HabitatCarriedItemVisual {
  kind: HabitatCarriedItemKind;
  /** Optional material color for a real item represented by a generic geometry. */
  color?: string;
}

export type HabitatAgentStatus =
  | "moving"
  | "acting"
  | "resting"
  | "awaiting-decision"
  | "blocked"
  | "connection-lost"
  | "dead";

export interface HabitatNeedsVisual {
  /** All need values use the same direction: 1 is good and 0 is critical. */
  health: number;
  hydration: number;
  energy: number;
  warmth?: number;
}

export interface HabitatAgentVisual {
  workPosition?: HabitatPoint;
  /** Derived from the authoritative freshwater footprint, not animation timing. */
  waterDepth?: number;
  lifeId?: string;
  id: SurvivalAgentId;
  displayName?: string;
  position: HabitatPoint;
  /** Clockwise radians around the vertical axis. */
  heading: number;
  alive: boolean;
  status: HabitatAgentStatus;
  action: HabitatActionVisual;
  carriedItem: HabitatCarriedItemVisual | null;
  needs: HabitatNeedsVisual;
}

export interface HabitatVisualSnapshot {
  physicalPresentation?: {
    selectedPartId?: string | null;
    proposal?: { size: import("../../simulation/survival/physical-types").Vec3; position: import("../../simulation/survival/physical-types").Vec3; rotation: number } | null;
  };
  physical?: import("../../simulation/survival/physical-types").PhysicalWorld;
  simulationRunning?: boolean;
  simulationTimeSeconds: number;
  terrain: HabitatTerrainVisual;
  resourceNodes: HabitatResourceVisual[];
  shelters: HabitatShelterVisual[];
  weather: HabitatWeatherVisual;
  daylight: HabitatDaylightVisual;
  /** The renderer displays at most one unique A1-A5 record for each ID. */
  agents: HabitatAgentVisual[];
}

/** `free` is an observer-controlled camera and never recenters itself. */
export type HabitatCameraMode = "overview" | "follow" | "habitat" | "free";

export interface SurvivalHabitatSceneOptions {
  onSelectAgent(id: SurvivalAgentId): void;
  onSelectPart?(id:string):void;
  /** Called after an actual orbit, pan, wheel, or pinch gesture—not on a tap. */
  onManualCamera(): void;
  onContextLost(): void;
  reducedMotion?: boolean;
  maxDevicePixelRatio?: number;
  canvasLabel?: string;
}

export interface SurvivalHabitatScene {
  update(
    snapshot: HabitatVisualSnapshot,
    selectedId: SurvivalAgentId | null,
    cameraMode: HabitatCameraMode,
  ): void;
  /** Suspends/resumes the render loop without disposing camera or scene state. */
  setActive(active: boolean): void;
  /** Frames a recorded world position; null returns to the current camera mode. */
  focusAt(point: HabitatPoint | null): void;
  zoom(direction: -1 | 1): void;
  resize(): void;
  dispose(): void;
}
