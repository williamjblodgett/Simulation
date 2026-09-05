import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  layoutExclusiveTerritories,
  type TerritoryCell,
} from "./territory-layout";

export type VisualId = string;
export type VisualResourceKind = "food" | "water" | "wood" | "ore";
export type DiplomaticRelation = "alliance" | "trade" | "hostile";
export type CameraMode = "overview" | "followAgent" | "followCamp" | "free";
export type MapOverlayMode = "world" | "alliances" | "wars" | "beliefs" | "territories" | "resources";

export interface VisualPoint {
  x: number;
  z: number;
}

export interface VisualInventory {
  food: number;
  water: number;
  wood: number;
  ore: number;
}

export interface VisualAgent {
  id: VisualId;
  name: string;
  color: string;
  position: VisualPoint;
  velocity: VisualPoint;
  alive: boolean;
  health: number;
  age: number;
  adult: boolean;
  campId: VisualId | null;
  power: number;
  inventory: VisualInventory;
  beliefId?: VisualId | null;
  beliefColor?: string | null;
  conviction?: number;
}

export interface VisualResource {
  id: VisualId;
  kind: VisualResourceKind;
  position: VisualPoint;
  amount: number;
  max: number;
}

export interface VisualCamp {
  id: VisualId;
  name: string;
  color: string;
  position: VisualPoint;
  level: number;
  power: number;
  territory: number;
  population: number;
  techLevel: number;
  leaderId: VisualId | null;
  underAttack: boolean;
  dominantBeliefId?: VisualId | null;
  beliefColor?: string | null;
  beliefDiversity?: number;
  shrineLevel?: number;
}

export interface VisualBelief {
  id: VisualId;
  name: string;
  color: string;
  sacredSite: VisualPoint;
  influence: number;
  adherents: number;
  active: boolean;
}

export interface VisualDiplomaticLink {
  id: VisualId;
  fromCampId: VisualId;
  toCampId: VisualId;
  relation: DiplomaticRelation;
  strength: number;
}

export interface VisualWar {
  id: VisualId;
  attackerCampId: VisualId;
  defenderCampId: VisualId;
  intensity: number;
}

export interface MapRelationSelection {
  id: VisualId;
  kind: DiplomaticRelation | "war";
  fromCampId: VisualId;
  toCampId: VisualId;
  strength?: number;
  intensity?: number;
  clientX: number;
  clientY: number;
}

export interface VisualWorld {
  seed: number;
  elapsed: number;
  halfSize: number;
  overlayMode?: MapOverlayMode;
  agents: VisualAgent[];
  resources: VisualResource[];
  camps: VisualCamp[];
  beliefs?: VisualBelief[];
  selectedBeliefId?: VisualId | null;
  diplomaticLinks: VisualDiplomaticLink[];
  wars: VisualWar[];
}

export interface CivilizationSceneOptions {
  onAgentSelect(id: VisualId): void;
  onCampSelect(id: VisualId): void;
  onBeliefSelect?(id: VisualId): void;
  onRelationSelect?(selection: MapRelationSelection): void;
  onCameraModeChange?(mode: CameraMode): void;
  reducedMotion?: boolean;
}

export interface CivilizationScene {
  update(
    world: VisualWorld,
    selectedAgentId: VisualId | null,
    selectedCampId: VisualId | null,
    cameraMode: CameraMode,
    delta: number,
  ): void;
  resize(): void;
  dispose(): void;
}

interface WaterFeature {
  x: number;
  z: number;
  radiusX: number;
  radiusZ: number;
  rotation: number;
  elevation: number;
}

interface TerrainProfile {
  seed: number;
  halfSize: number;
  water: WaterFeature[];
}

interface AgentVisual {
  root: THREE.Group;
  actor: THREE.Group;
  body: THREE.Mesh<THREE.CapsuleGeometry, THREE.MeshStandardMaterial>;
  head: THREE.Mesh<THREE.IcosahedronGeometry, THREE.MeshStandardMaterial>;
  direction: THREE.Mesh<THREE.ConeGeometry, THREE.MeshBasicMaterial>;
  selection: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  beliefHalo: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  healthBack: THREE.Sprite;
  healthFill: THREE.Sprite;
  label: THREE.Sprite;
  labelMaterial: THREE.SpriteMaterial;
  carry: Record<VisualResourceKind, THREE.Mesh>;
  trail: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  trailPoints: THREE.Vector3[];
  target: THREE.Vector2;
  velocity: THREE.Vector2;
  facing: number;
  alive: boolean;
  adult: boolean;
  health: number;
  power: number;
  color: string;
  beliefId: VisualId | null;
  beliefColor: string | null;
  conviction: number;
  name: string;
  labelKey: string;
  phase: number;
}

interface InstancedPopulationVisual {
  root: THREE.Group;
  body: THREE.InstancedMesh<THREE.CapsuleGeometry, THREE.MeshStandardMaterial>;
  head: THREE.InstancedMesh<THREE.IcosahedronGeometry, THREE.MeshStandardMaterial>;
  beliefHalo: THREE.InstancedMesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  agentIds: VisualId[];
  beliefAgentIds: VisualId[];
  capacity: number;
}

interface ResourceVisual {
  root: THREE.Group;
  kind: VisualResourceKind;
  accent: THREE.Object3D;
  abundanceRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  target: THREE.Vector2;
  targetRatio: number;
  currentRatio: number;
  phase: number;
}

interface CampVisual {
  root: THREE.Group;
  hitTarget: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  territory: THREE.LineLoop<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  territoryFill: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  attackRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  beliefRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  shrine: THREE.Group;
  shrineBeacon: THREE.Mesh<THREE.DodecahedronGeometry, THREE.MeshStandardMaterial>;
  tiers: THREE.Group[];
  banner: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  beacon: THREE.Mesh<THREE.OctahedronGeometry, THREE.MeshStandardMaterial>;
  flames: THREE.Mesh[];
  fireLight: THREE.PointLight;
  label: THREE.Sprite;
  labelMaterial: THREE.SpriteMaterial;
  target: THREE.Vector2;
  territoryTarget: number;
  territoryCurrent: number;
  territoryGeometryKey: string;
  underAttack: boolean;
  level: number;
  techLevel: number;
  power: number;
  population: number;
  name: string;
  color: string;
  dominantBeliefId: VisualId | null;
  beliefColor: string | null;
  beliefDiversity: number;
  shrineLevel: number;
  labelKey: string;
  phase: number;
}

interface BeliefVisual {
  root: THREE.Group;
  hitTarget: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  influenceFill: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  influenceRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  selectionRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  beacon: THREE.Mesh<THREE.DodecahedronGeometry, THREE.MeshStandardMaterial>;
  label: THREE.Sprite;
  labelMaterial: THREE.SpriteMaterial;
  labelKey: string;
  target: THREE.Vector2;
  influenceTarget: number;
  influenceCurrent: number;
  adherents: number;
  active: boolean;
  color: string;
  phase: number;
}

interface LinkVisual {
  id: VisualId;
  root: THREE.Group;
  line: THREE.Line<THREE.BufferGeometry, THREE.LineDashedMaterial>;
  hitTarget: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  fromCampId: VisualId;
  toCampId: VisualId;
  relation: DiplomaticRelation;
  strength: number;
}

interface WarVisual {
  id: VisualId;
  root: THREE.Group;
  line: THREE.Line<THREE.BufferGeometry, THREE.LineDashedMaterial>;
  hitTarget: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  projectile: THREE.Mesh<THREE.OctahedronGeometry, THREE.MeshBasicMaterial>;
  clash: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  attackerCampId: VisualId;
  defenderCampId: VisualId;
  intensity: number;
  curve: THREE.QuadraticBezierCurve3;
  phase: number;
}

const DEFAULT_HALF_SIZE = 70;
const EDGE_INSET = 1.4;
const DAY_LENGTH_SECONDS = 300;
const TAU = Math.PI * 2;
// Rich actors use several independently animated meshes and a canvas label. Keep
// that cost fixed while the remainder of a 1,000-person world shares three draws.
const MAX_DETAILED_AGENTS = 32;
const INFLUENTIAL_DETAILED_AGENTS = 18;
const INITIAL_POPULATION_INSTANCE_CAPACITY = 64;

const MAP_OVERLAY_MODES: readonly MapOverlayMode[] = [
  "world",
  "alliances",
  "wars",
  "beliefs",
  "territories",
  "resources",
];

function resolveOverlayMode(mode: MapOverlayMode | null | undefined): MapOverlayMode {
  return mode && MAP_OVERLAY_MODES.includes(mode) ? mode : "world";
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const finite = (value: number | null | undefined, fallback = 0) => Number.isFinite(value) ? Number(value) : fallback;

const damp = (current: number, target: number, speed: number, delta: number) =>
  THREE.MathUtils.lerp(current, target, 1 - Math.exp(-speed * delta));

function dampAngle(current: number, target: number, speed: number, delta: number) {
  const difference = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + difference * (1 - Math.exp(-speed * delta));
}

function smoothstep(edge0: number, edge1: number, value: number) {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const x = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return x * x * (3 - 2 * x);
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function seededRandom(seed: number) {
  let state = (Math.floor(finite(seed) * 9973) ^ 0x9e3779b9) >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let result = state;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function safeColor(value: string, fallback = 0xc7f36c) {
  const color = new THREE.Color(fallback);
  try {
    color.set(value);
  } catch {
    color.set(fallback);
  }
  return color;
}

function sceneCoordinate(value: number, halfSize: number) {
  return clamp(finite(value), -halfSize + EDGE_INSET, halfSize - EDGE_INSET);
}

function rotatedEllipseDistance(x: number, z: number, feature: WaterFeature) {
  const cosine = Math.cos(-feature.rotation);
  const sine = Math.sin(-feature.rotation);
  const localX = (x - feature.x) * cosine - (z - feature.z) * sine;
  const localZ = (x - feature.x) * sine + (z - feature.z) * cosine;
  return Math.hypot(localX / feature.radiusX, localZ / feature.radiusZ);
}

function rawTerrainHeight(x: number, z: number, profile: TerrainProfile) {
  const seedOffset = profile.seed * 0.0137;
  const broad = Math.sin(x * 0.054 + seedOffset) * Math.cos(z * 0.047 - seedOffset * 0.72) * 2.05;
  const rolling = Math.sin((x + z) * 0.092 - seedOffset * 1.7) * 0.66;
  const cross = Math.cos(x * 0.151 - z * 0.113 + seedOffset * 2.1) * 0.28;
  const edgeDistance = Math.max(Math.abs(x), Math.abs(z)) / profile.halfSize;
  const edgeRise = smoothstep(0.7, 1, edgeDistance) * 2.4;
  const diagonalRidge = Math.pow(Math.max(0, Math.sin((x - z) * 0.032 + seedOffset)), 5) * smoothstep(0.45, 0.95, edgeDistance) * 2.8;
  return broad + rolling + cross + edgeRise + diagonalRidge - 0.42;
}

function terrainHeight(x: number, z: number, profile: TerrainProfile) {
  let height = rawTerrainHeight(x, z, profile);
  profile.water.forEach((feature) => {
    const distance = rotatedEllipseDistance(x, z, feature);
    if (distance < 1.34) {
      const blend = 1 - smoothstep(0.76, 1.34, distance);
      height = THREE.MathUtils.lerp(height, feature.elevation - 0.26 + Math.min(distance, 1) * 0.13, blend);
    }
  });
  return height;
}

function makeTerrainProfile(seed: number, halfSize: number): TerrainProfile {
  const safeHalf = clamp(finite(halfSize, DEFAULT_HALF_SIZE), 38, 220);
  const preliminary: TerrainProfile = { seed: finite(seed), halfSize: safeHalf, water: [] };
  const random = seededRandom(seed + safeHalf * 3.7);
  const water: WaterFeature[] = [];
  const featureCount = safeHalf > 150 ? 7 : safeHalf > 85 ? 6 : 4;
  for (let index = 0; index < featureCount; index += 1) {
    const angle = index / featureCount * TAU + (random() - 0.5) * 0.65;
    const radius = safeHalf * (0.24 + random() * 0.35);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    water.push({
      x,
      z,
      radiusX: 4.7 + random() * 5.4,
      radiusZ: 3.4 + random() * 4.3,
      rotation: random() * TAU,
      elevation: rawTerrainHeight(x, z, preliminary) - 0.12,
    });
  }
  return { ...preliminary, water };
}

function setShadows(object: THREE.Object3D, cast = true, receive = true) {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = cast;
      child.receiveShadow = receive;
    }
  });
}

function disposeObject(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points || object instanceof THREE.Sprite)) return;
    if ("geometry" in object && object.geometry instanceof THREE.BufferGeometry) geometries.add(object.geometry);
    const objectMaterials: THREE.Material[] = Array.isArray(object.material) ? object.material : [object.material];
    objectMaterials.forEach((material) => {
      materials.add(material);
      Object.values(material).forEach((property) => {
        if (property instanceof THREE.Texture) textures.add(property);
      });
    });
  });
  textures.forEach((texture) => texture.dispose());
  materials.forEach((material) => material.dispose());
  geometries.forEach((geometry) => geometry.dispose());
}

function roundedRectangle(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

function makeLabelTexture(
  title: string,
  subtitle: string,
  colorValue: string,
  width = 640,
  height = 154,
) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (context) {
    context.clearRect(0, 0, width, height);
    roundedRectangle(context, 9, 9, width - 18, height - 18, 34);
    context.fillStyle = "rgba(5, 12, 15, 0.9)";
    context.fill();
    context.strokeStyle = colorValue;
    context.lineWidth = 6;
    context.stroke();
    context.beginPath();
    context.arc(52, height / 2, 15, 0, TAU);
    context.fillStyle = colorValue;
    context.fill();
    context.fillStyle = "#f2f7ec";
    context.font = "700 42px ui-sans-serif, system-ui, sans-serif";
    context.textAlign = "left";
    context.textBaseline = "middle";
    context.fillText(title.slice(0, 21).toUpperCase(), 84, 59, width - 112);
    context.fillStyle = "#a9b8af";
    context.font = "600 25px ui-monospace, SFMono-Regular, monospace";
    context.fillText(subtitle.slice(0, 34).toUpperCase(), 84, 108, width - 112);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

function makeSolidSprite(color: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 8;
  canvas.height = 8;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
    context.fillRect(0, 0, 8, 8);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  return sprite;
}

interface StaticWorldVisual {
  root: THREE.Group;
  scenery: THREE.Group;
  waterSurfaces: THREE.Mesh<THREE.CircleGeometry, THREE.MeshPhysicalMaterial>[];
  starsMaterial: THREE.PointsMaterial;
  skyMaterial: THREE.ShaderMaterial;
}

function makeTerrainGeometry(profile: TerrainProfile) {
  const size = profile.halfSize * 2;
  const segments = clamp(Math.round(size / 2), 44, 116);
  const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.getAttribute("position") as THREE.BufferAttribute;
  const colors = new Float32Array(positions.count * 3);
  const marsh = new THREE.Color(0x355f47);
  const meadow = new THREE.Color(0x47734a);
  const dry = new THREE.Color(0x7b7650);
  const ridge = new THREE.Color(0x72746b);
  const snow = new THREE.Color(0xa7afa4);
  const color = new THREE.Color();

  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const z = positions.getZ(index);
    const height = terrainHeight(x, z, profile);
    positions.setY(index, height);
    const waterDistance = profile.water.reduce(
      (minimum, feature) => Math.min(minimum, rotatedEllipseDistance(x, z, feature)),
      Number.POSITIVE_INFINITY,
    );
    const moisture = 1 - smoothstep(1, 2.7, waterDistance);
    const micro = Math.sin(x * 0.31 + z * 0.17 + profile.seed) * 0.5 + 0.5;
    color.copy(meadow).lerp(marsh, moisture * 0.72);
    color.lerp(dry, smoothstep(1.15, 3.9, height) * (0.55 + micro * 0.16));
    color.lerp(ridge, smoothstep(3.6, 6.3, height) * 0.82);
    color.lerp(snow, smoothstep(6.5, 8.2, height) * 0.52);
    color.offsetHSL((micro - 0.5) * 0.012, 0, (micro - 0.5) * 0.035);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }

  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function makeMapGrid(profile: TerrainProfile) {
  const group = new THREE.Group();
  const material = new THREE.LineBasicMaterial({
    color: 0xb7d19c,
    transparent: true,
    opacity: 0.075,
    depthWrite: false,
  });
  const spacing = profile.halfSize > 85 ? 12 : 10;
  const subdivisions = Math.ceil(profile.halfSize * 2 / 3);
  const half = profile.halfSize - 0.7;
  for (let fixed = -half + spacing; fixed < half; fixed += spacing) {
    const horizontal: THREE.Vector3[] = [];
    const vertical: THREE.Vector3[] = [];
    for (let step = 0; step <= subdivisions; step += 1) {
      const offset = -half + step / subdivisions * half * 2;
      horizontal.push(new THREE.Vector3(offset, terrainHeight(offset, fixed, profile) + 0.075, fixed));
      vertical.push(new THREE.Vector3(fixed, terrainHeight(fixed, offset, profile) + 0.075, offset));
    }
    group.add(
      new THREE.Line(new THREE.BufferGeometry().setFromPoints(horizontal), material.clone()),
      new THREE.Line(new THREE.BufferGeometry().setFromPoints(vertical), material.clone()),
    );
  }

  const hexRadius = profile.halfSize > 85 ? 8.5 : 7;
  const hexWidth = Math.sqrt(3) * hexRadius;
  const hexStepZ = hexRadius * 1.5;
  const hexPoints: THREE.Vector3[] = [];
  let row = 0;
  for (let centerZ = -half + hexRadius; centerZ <= half - hexRadius; centerZ += hexStepZ) {
    const offsetX = row % 2 === 0 ? 0 : hexWidth * 0.5;
    for (let centerX = -half + hexRadius + offsetX; centerX <= half - hexRadius; centerX += hexWidth) {
      for (let side = 0; side < 6; side += 1) {
        const angleA = (side / 6) * TAU + Math.PI / 6;
        const angleB = ((side + 1) / 6) * TAU + Math.PI / 6;
        const ax = centerX + Math.cos(angleA) * hexRadius;
        const az = centerZ + Math.sin(angleA) * hexRadius;
        const bx = centerX + Math.cos(angleB) * hexRadius;
        const bz = centerZ + Math.sin(angleB) * hexRadius;
        hexPoints.push(
          new THREE.Vector3(ax, terrainHeight(ax, az, profile) + 0.082, az),
          new THREE.Vector3(bx, terrainHeight(bx, bz, profile) + 0.082, bz),
        );
      }
    }
    row += 1;
  }
  const hexMaterial = new THREE.LineBasicMaterial({
    color: 0x94b88c,
    transparent: true,
    opacity: 0.035,
    depthWrite: false,
  });
  group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(hexPoints), hexMaterial));

  const contourMaterial = new THREE.LineBasicMaterial({
    color: 0xd5e5b2,
    transparent: true,
    opacity: 0.095,
    depthWrite: false,
  });
  for (let ringIndex = 1; ringIndex <= 6; ringIndex += 1) {
    const radius = profile.halfSize * ringIndex / 7;
    const points: THREE.Vector3[] = [];
    for (let index = 0; index < 160; index += 1) {
      const angle = index / 160 * TAU;
      const variation = 1 + Math.sin(angle * 5 + profile.seed * 0.02 + ringIndex) * 0.024;
      const x = Math.cos(angle) * radius * variation;
      const z = Math.sin(angle) * radius * variation;
      points.push(new THREE.Vector3(x, terrainHeight(x, z, profile) + 0.085, z));
    }
    group.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), contourMaterial.clone()));
  }
  material.dispose();
  contourMaterial.dispose();
  group.renderOrder = 2;
  return group;
}

function makeBoundary(profile: TerrainProfile) {
  const points: THREE.Vector3[] = [];
  const half = profile.halfSize - 0.25;
  const steps = 64;
  for (let index = 0; index <= steps; index += 1) {
    const offset = -half + index / steps * half * 2;
    points.push(new THREE.Vector3(offset, terrainHeight(offset, -half, profile) + 0.22, -half));
  }
  for (let index = 1; index <= steps; index += 1) {
    const offset = -half + index / steps * half * 2;
    points.push(new THREE.Vector3(half, terrainHeight(half, offset, profile) + 0.22, offset));
  }
  for (let index = 1; index <= steps; index += 1) {
    const offset = half - index / steps * half * 2;
    points.push(new THREE.Vector3(offset, terrainHeight(offset, half, profile) + 0.22, half));
  }
  for (let index = 1; index < steps; index += 1) {
    const offset = half - index / steps * half * 2;
    points.push(new THREE.Vector3(-half, terrainHeight(-half, offset, profile) + 0.22, offset));
  }
  const boundary = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color: 0xd6f194, transparent: true, opacity: 0.48 }),
  );
  boundary.renderOrder = 4;
  return boundary;
}

function makeSky(profile: TerrainProfile) {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      topColor: { value: new THREE.Color(0x071418) },
      horizonColor: { value: new THREE.Color(0x7f9f94) },
      bottomColor: { value: new THREE.Color(0x1b2826) },
      horizonGlow: { value: 0.2 },
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 horizonColor;
      uniform vec3 bottomColor;
      uniform float horizonGlow;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition).y;
        float upper = smoothstep(-0.05, 0.72, h);
        vec3 color = mix(bottomColor, topColor, upper);
        float band = exp(-pow(abs(h) * 5.0, 1.7)) * horizonGlow;
        color = mix(color, horizonColor, clamp(band, 0.0, 0.75));
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(profile.halfSize * 5, 32, 18), material);
  mesh.frustumCulled = false;
  return { mesh, material };
}

function makeStars(profile: TerrainProfile) {
  const random = seededRandom(profile.seed + 9182);
  const count = 440;
  const positions = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    const theta = random() * TAU;
    const phi = Math.acos(0.03 + random() * 0.92);
    const radius = profile.halfSize * (3.3 + random() * 0.4);
    positions[index * 3] = Math.sin(phi) * Math.cos(theta) * radius;
    positions[index * 3 + 1] = Math.cos(phi) * radius + profile.halfSize * 0.22;
    positions[index * 3 + 2] = Math.sin(phi) * Math.sin(theta) * radius;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0xe5f5ed,
    size: profile.halfSize / 125,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
  });
  const stars = new THREE.Points(geometry, material);
  stars.frustumCulled = false;
  return { stars, material };
}

function makeWaterFeature(feature: WaterFeature, profile: TerrainProfile) {
  const group = new THREE.Group();
  group.position.set(feature.x, feature.elevation - 0.02, feature.z);
  group.rotation.y = feature.rotation;

  const geometry = new THREE.CircleGeometry(1, 28);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshPhysicalMaterial({
    color: 0x2c91a2,
    emissive: 0x0b3440,
    emissiveIntensity: 0.42,
    roughness: 0.22,
    metalness: 0.04,
    transparent: true,
    opacity: 0.82,
    clearcoat: 0.72,
    clearcoatRoughness: 0.18,
    depthWrite: false,
  });
  const surface = new THREE.Mesh(geometry, material);
  surface.scale.set(feature.radiusX, 1, feature.radiusZ);
  surface.receiveShadow = true;
  surface.renderOrder = 3;
  group.add(surface);

  const shorePoints: THREE.Vector3[] = [];
  for (let index = 0; index < 72; index += 1) {
    const angle = index / 72 * TAU;
    shorePoints.push(new THREE.Vector3(
      Math.cos(angle) * feature.radiusX * 1.03,
      0.06,
      Math.sin(angle) * feature.radiusZ * 1.03,
    ));
  }
  group.add(new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(shorePoints),
    new THREE.LineBasicMaterial({ color: 0x8ab3a0, transparent: true, opacity: 0.31 }),
  ));

  const random = seededRandom(profile.seed + feature.x * 23 + feature.z * 41);
  for (let index = 0; index < 12; index += 1) {
    const angle = random() * TAU;
    const reed = new THREE.Mesh(
      new THREE.ConeGeometry(0.07, 0.65 + random() * 0.48, 4),
      new THREE.MeshStandardMaterial({ color: 0x6f8a55, roughness: 0.95 }),
    );
    reed.position.set(
      Math.cos(angle) * feature.radiusX * (0.88 + random() * 0.17),
      0.26,
      Math.sin(angle) * feature.radiusZ * (0.88 + random() * 0.17),
    );
    reed.rotation.z = (random() - 0.5) * 0.17;
    group.add(reed);
  }
  return { group, surface };
}

function makeScenery(profile: TerrainProfile) {
  const group = new THREE.Group();
  const random = seededRandom(profile.seed + 0x45ac);
  const dummy = new THREE.Object3D();

  const rockCount = Math.round(profile.halfSize * 1.2);
  const rocks = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(0.62, 0),
    new THREE.MeshStandardMaterial({ color: 0x687068, roughness: 0.96, flatShading: true }),
    rockCount,
  );
  for (let index = 0; index < rockCount; index += 1) {
    const angle = random() * TAU;
    const radius = profile.halfSize * Math.sqrt(random()) * 0.94;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const scale = 0.3 + random() * 1.18;
    dummy.position.set(x, terrainHeight(x, z, profile) + scale * 0.22, z);
    dummy.rotation.set(random() * 0.7, random() * TAU, random() * 0.7);
    dummy.scale.set(scale * (0.7 + random() * 0.5), scale * (0.55 + random() * 0.55), scale);
    dummy.updateMatrix();
    rocks.setMatrixAt(index, dummy.matrix);
    rocks.setColorAt(index, new THREE.Color().setHSL(0.24, 0.04 + random() * 0.08, 0.34 + random() * 0.14));
  }
  rocks.instanceMatrix.needsUpdate = true;
  if (rocks.instanceColor) rocks.instanceColor.needsUpdate = true;
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  group.add(rocks);

  const grassCount = Math.round(profile.halfSize * 2.8);
  const grass = new THREE.InstancedMesh(
    new THREE.ConeGeometry(0.08, 0.65, 3),
    new THREE.MeshStandardMaterial({ color: 0x729157, roughness: 1, side: THREE.DoubleSide }),
    grassCount,
  );
  for (let index = 0; index < grassCount; index += 1) {
    const angle = random() * TAU;
    const radius = profile.halfSize * Math.sqrt(random()) * 0.91;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const scale = 0.55 + random() * 0.9;
    dummy.position.set(x, terrainHeight(x, z, profile) + scale * 0.3, z);
    dummy.rotation.set((random() - 0.5) * 0.22, random() * TAU, (random() - 0.5) * 0.22);
    dummy.scale.set(scale, scale, scale);
    dummy.updateMatrix();
    grass.setMatrixAt(index, dummy.matrix);
    grass.setColorAt(index, new THREE.Color().setHSL(0.24 + random() * 0.06, 0.33, 0.36 + random() * 0.12));
  }
  grass.instanceMatrix.needsUpdate = true;
  if (grass.instanceColor) grass.instanceColor.needsUpdate = true;
  grass.castShadow = false;
  grass.receiveShadow = true;
  group.add(grass);

  const peakCount = Math.max(18, Math.round(profile.halfSize / 2.6));
  const peaks = new THREE.InstancedMesh(
    new THREE.ConeGeometry(1, 1, 6),
    new THREE.MeshStandardMaterial({ color: 0x626a63, roughness: 0.93, flatShading: true }),
    peakCount,
  );
  for (let index = 0; index < peakCount; index += 1) {
    const side = index % 4;
    const along = (random() - 0.5) * profile.halfSize * 1.74;
    const inset = profile.halfSize * (0.76 + random() * 0.18);
    const x = side === 0 ? -inset : side === 1 ? inset : along;
    const z = side === 2 ? -inset : side === 3 ? inset : along;
    const height = 3.3 + random() * 6.8;
    const width = 1.9 + random() * 4.2;
    dummy.position.set(x, terrainHeight(x, z, profile) + height * 0.5 - 0.25, z);
    dummy.rotation.set(0, random() * TAU, (random() - 0.5) * 0.09);
    dummy.scale.set(width, height, width * (0.76 + random() * 0.36));
    dummy.updateMatrix();
    peaks.setMatrixAt(index, dummy.matrix);
    peaks.setColorAt(index, new THREE.Color().setHSL(0.22, 0.05, 0.34 + random() * 0.18));
  }
  peaks.instanceMatrix.needsUpdate = true;
  if (peaks.instanceColor) peaks.instanceColor.needsUpdate = true;
  peaks.castShadow = true;
  peaks.receiveShadow = true;
  group.add(peaks);
  return group;
}

function makeStaticWorld(profile: TerrainProfile): StaticWorldVisual {
  const root = new THREE.Group();
  root.name = "civilization-world";
  const terrain = new THREE.Mesh(
    makeTerrainGeometry(profile),
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.94,
      metalness: 0,
      flatShading: true,
    }),
  );
  terrain.receiveShadow = true;
  const scenery = makeScenery(profile);
  root.add(terrain, makeMapGrid(profile), makeBoundary(profile), scenery);

  const waterSurfaces: THREE.Mesh<THREE.CircleGeometry, THREE.MeshPhysicalMaterial>[] = [];
  profile.water.forEach((feature) => {
    const visual = makeWaterFeature(feature, profile);
    root.add(visual.group);
    waterSurfaces.push(visual.surface);
  });

  const sky = makeSky(profile);
  root.add(sky.mesh);
  const stars = makeStars(profile);
  root.add(stars.stars);
  return { root, scenery, waterSurfaces, starsMaterial: stars.material, skyMaterial: sky.material };
}

function makeTent(color: THREE.Color, x: number, z: number, rotation: number) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rotation;
  const canvas = new THREE.Mesh(
    new THREE.ConeGeometry(0.92, 1.35, 4),
    new THREE.MeshStandardMaterial({ color: color.clone().multiplyScalar(0.72), roughness: 0.94, flatShading: true }),
  );
  canvas.position.y = 0.67;
  canvas.rotation.y = Math.PI / 4;
  group.add(canvas);
  const entrance = new THREE.Mesh(
    new THREE.PlaneGeometry(0.42, 0.65),
    new THREE.MeshBasicMaterial({ color: 0x101815, side: THREE.DoubleSide }),
  );
  entrance.position.set(0, 0.4, 0.66);
  group.add(entrance);
  return group;
}

function makeHut(color: THREE.Color, x: number, z: number, rotation: number, scale = 1) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rotation;
  group.scale.setScalar(scale);
  const walls = new THREE.Mesh(
    new THREE.CylinderGeometry(0.78, 0.88, 1.18, 6),
    new THREE.MeshStandardMaterial({ color: 0x77684e, roughness: 1, flatShading: true }),
  );
  walls.position.y = 0.59;
  group.add(walls);
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(1.1, 0.8, 6),
    new THREE.MeshStandardMaterial({ color: color.clone().multiplyScalar(0.58), roughness: 0.92, flatShading: true }),
  );
  roof.position.y = 1.5;
  group.add(roof);
  const door = new THREE.Mesh(
    new THREE.PlaneGeometry(0.34, 0.61),
    new THREE.MeshBasicMaterial({ color: 0x211b16 }),
  );
  door.position.set(0, 0.38, 0.87);
  group.add(door);
  return group;
}

function makeWatchtower(color: THREE.Color, x: number, z: number) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  const wood = new THREE.MeshStandardMaterial({ color: 0x675540, roughness: 0.96 });
  [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]].forEach(([px, pz]) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 2.7, 5), wood.clone());
    leg.position.set(px, 1.35, pz);
    group.add(leg);
  });
  const platform = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 0.92, 0.2, 6), wood.clone());
  platform.position.y = 2.48;
  group.add(platform);
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(1.14, 0.75, 6),
    new THREE.MeshStandardMaterial({ color: color.clone().multiplyScalar(0.65), roughness: 0.9 }),
  );
  roof.position.y = 3.14;
  group.add(roof);
  return group;
}

function campTerritoryRadius(camp: VisualCamp, profile: TerrainProfile) {
  return clamp(finite(camp.territory, 7), 3.8, Math.min(32, profile.halfSize * 0.42));
}

function polygonCentroid(vertices: readonly { x: number; z: number }[]) {
  if (vertices.length === 0) return { x: 0, z: 0 };
  let twiceArea = 0;
  let weightedX = 0;
  let weightedZ = 0;
  for (let index = 0; index < vertices.length; index += 1) {
    const current = vertices[index];
    const next = vertices[(index + 1) % vertices.length];
    const cross = current.x * next.z - next.x * current.z;
    twiceArea += cross;
    weightedX += (current.x + next.x) * cross;
    weightedZ += (current.z + next.z) * cross;
  }
  if (Math.abs(twiceArea) <= 1e-9) {
    return vertices.reduce(
      (total, point) => ({ x: total.x + point.x / vertices.length, z: total.z + point.z / vertices.length }),
      { x: 0, z: 0 },
    );
  }
  return {
    x: weightedX / (3 * twiceArea),
    z: weightedZ / (3 * twiceArea),
  };
}

function makeTerritoryFillGeometry(cell: TerritoryCell, profile: TerrainProfile) {
  const geometry = new THREE.BufferGeometry();
  if (cell.vertices.length < 3) return geometry;
  const centerHeight = terrainHeight(cell.center.x, cell.center.z, profile);
  const centroid = polygonCentroid(cell.vertices);
  const points = [centroid, ...cell.vertices];
  const positions = new Float32Array(points.length * 3);
  points.forEach((point, index) => {
    positions[index * 3] = point.x - cell.center.x;
    positions[index * 3 + 1] = terrainHeight(point.x, point.z, profile) + 0.055 - centerHeight;
    positions[index * 3 + 2] = point.z - cell.center.z;
  });
  const indices: number[] = [];
  for (let index = 0; index < cell.vertices.length; index += 1) {
    const current = index + 1;
    const next = (index + 1) % cell.vertices.length + 1;
    indices.push(0, next, current);
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function makeTerritoryBorderGeometry(cell: TerritoryCell, profile: TerrainProfile) {
  const geometry = new THREE.BufferGeometry();
  if (cell.vertices.length < 3) return geometry;
  const centerHeight = terrainHeight(cell.center.x, cell.center.z, profile);
  const positions = new Float32Array(cell.vertices.length * 3);
  cell.vertices.forEach((point, index) => {
    positions[index * 3] = point.x - cell.center.x;
    positions[index * 3 + 1] = terrainHeight(point.x, point.z, profile) + 0.09 - centerHeight;
    positions[index * 3 + 2] = point.z - cell.center.z;
  });
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function applyTerritoryGeometry(visual: CampVisual, cell: TerritoryCell, profile: TerrainProfile) {
  const geometryKey = `${profile.seed}|${profile.halfSize}|${cell.geometryKey}`;
  if (geometryKey === visual.territoryGeometryKey) return false;
  const nextFillGeometry = makeTerritoryFillGeometry(cell, profile);
  const nextBorderGeometry = makeTerritoryBorderGeometry(cell, profile);
  const previousFillGeometry = visual.territoryFill.geometry;
  const previousBorderGeometry = visual.territory.geometry;
  visual.territoryFill.geometry = nextFillGeometry;
  visual.territory.geometry = nextBorderGeometry;
  visual.territoryGeometryKey = geometryKey;
  previousFillGeometry.dispose();
  previousBorderGeometry.dispose();
  return true;
}

function makeCamp(camp: VisualCamp): CampVisual {
  const color = safeColor(camp.color);
  const root = new THREE.Group();
  root.name = `camp:${camp.id}`;

  const territoryFill = new THREE.Mesh(
    new THREE.BufferGeometry(),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.045,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  territoryFill.renderOrder = 2;
  root.add(territoryFill);

  const territory = new THREE.LineLoop(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
    }),
  );
  territory.renderOrder = 5;
  root.add(territory);

  const attackRing = new THREE.Mesh(
    new THREE.RingGeometry(1.06, 1.14, 72),
    new THREE.MeshBasicMaterial({
      color: 0xff4d43,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  attackRing.rotation.x = -Math.PI / 2;
  attackRing.position.y = 0.13;
  attackRing.renderOrder = 7;
  root.add(attackRing);

  const initialBeliefColor = camp.beliefColor ? safeColor(camp.beliefColor, 0xb89cff) : new THREE.Color(0xb89cff);
  const beliefRing = new THREE.Mesh(
    new THREE.RingGeometry(3.38, 3.55, 48),
    new THREE.MeshBasicMaterial({
      color: initialBeliefColor,
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  beliefRing.rotation.x = -Math.PI / 2;
  beliefRing.position.y = 0.145;
  beliefRing.renderOrder = 6;
  root.add(beliefRing);

  const ground = new THREE.Mesh(
    new THREE.CylinderGeometry(3.05, 3.28, 0.18, 18),
    new THREE.MeshStandardMaterial({ color: 0x384038, roughness: 1 }),
  );
  ground.position.y = 0.09;
  ground.receiveShadow = true;
  root.add(ground);

  // A deliberately abstract shrine: a stepped plinth, three uprights, and a
  // floating polyhedron. It communicates a belief site without borrowing any
  // real-world religious iconography.
  const shrine = new THREE.Group();
  shrine.position.set(-1.45, 0.18, 0.7);
  const shrineBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.62, 0.78, 0.2, 6),
    new THREE.MeshStandardMaterial({ color: 0x59605a, roughness: 0.88, metalness: 0.12 }),
  );
  shrineBase.position.y = 0.1;
  shrine.add(shrineBase);
  for (let index = 0; index < 3; index += 1) {
    const angle = index / 3 * TAU;
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.075, 0.78, 5),
      new THREE.MeshStandardMaterial({ color: initialBeliefColor.clone().multiplyScalar(0.72), roughness: 0.62 }),
    );
    pillar.position.set(Math.cos(angle) * 0.37, 0.54, Math.sin(angle) * 0.37);
    pillar.userData.beliefAccent = true;
    shrine.add(pillar);
  }
  const shrineBeacon = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.27, 0),
    new THREE.MeshStandardMaterial({
      color: initialBeliefColor,
      emissive: initialBeliefColor,
      emissiveIntensity: 0.76,
      roughness: 0.28,
      metalness: 0.25,
    }),
  );
  shrineBeacon.position.y = 1.1;
  shrine.add(shrineBeacon);
  root.add(shrine);

  const hitTarget = new THREE.Mesh(
    new THREE.CylinderGeometry(3.5, 3.5, 4.2, 12),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  );
  hitTarget.position.y = 2.1;
  hitTarget.userData.campId = camp.id;
  root.add(hitTarget);

  const tiers = [new THREE.Group(), new THREE.Group(), new THREE.Group(), new THREE.Group()];
  root.add(...tiers);
  [-2.05, 0, 2.05].forEach((offset, index) => {
    tiers[0].add(makeTent(color, offset, index === 1 ? -2 : 1.55, index * 1.85));
  });
  tiers[0].add(makeTent(color, 0, 2.1, Math.PI));

  const hutCoordinates = [[-2.25, -1.45], [2.2, -1.4], [-2.15, 1.7], [2.2, 1.65]] as const;
  hutCoordinates.forEach(([x, z], index) => tiers[1].add(makeHut(color, x, z, index * Math.PI / 2, 0.82)));
  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x574d3b, roughness: 1 });
  for (let index = 0; index < 16; index += 1) {
    const angle = index / 16 * TAU;
    if (Math.abs(Math.sin(angle)) < 0.22 && Math.cos(angle) > 0) continue;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.13, 1.18, 5), wallMaterial.clone());
    post.position.set(Math.cos(angle) * 3.05, 0.59, Math.sin(angle) * 3.05);
    post.rotation.z = Math.sin(angle) * 0.05;
    tiers[1].add(post);
  }

  tiers[2].add(makeWatchtower(color, -2.65, -2.55), makeWatchtower(color, 2.65, 2.55));
  const workshop = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.24, 1.5, 8),
    new THREE.MeshStandardMaterial({ color: 0x526064, roughness: 0.72, metalness: 0.28 }),
  );
  workshop.position.set(0, 0.75, -2.1);
  tiers[2].add(workshop);
  const workshopRoof = new THREE.Mesh(
    new THREE.ConeGeometry(1.43, 0.72, 8),
    new THREE.MeshStandardMaterial({ color: color.clone().multiplyScalar(0.75), roughness: 0.48, metalness: 0.18 }),
  );
  workshopRoof.position.set(0, 1.86, -2.1);
  tiers[2].add(workshopRoof);

  const spire = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.36, 4.4, 8),
    new THREE.MeshStandardMaterial({ color: 0x88959a, roughness: 0.35, metalness: 0.68 }),
  );
  spire.position.y = 2.2;
  tiers[3].add(spire);
  [1.28, 1.75, 2.22].forEach((radius, index) => {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius, 0.055, 5, 30),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55 - index * 0.1 }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 2.4 + index * 0.58;
    ring.userData.techRingIndex = index;
    tiers[3].add(ring);
  });

  const fire = new THREE.Group();
  fire.position.y = 0.18;
  root.add(fire);
  for (let index = 0; index < 3; index += 1) {
    const log = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.12, 1.05, 6),
      new THREE.MeshStandardMaterial({ color: 0x4a3023, roughness: 1 }),
    );
    log.rotation.set(Math.PI / 2, index * Math.PI / 3, 0);
    log.position.y = 0.18;
    fire.add(log);
  }
  const flames: THREE.Mesh[] = [];
  [
    { color: 0xffa42c, y: 0.64, scale: 0.58 },
    { color: 0xffe56c, y: 0.78, scale: 0.36 },
  ].forEach((configuration) => {
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(configuration.scale, configuration.scale * 1.9, 7),
      new THREE.MeshBasicMaterial({ color: configuration.color, transparent: true, opacity: 0.9 }),
    );
    flame.position.y = configuration.y;
    fire.add(flame);
    flames.push(flame);
  });
  const fireLight = new THREE.PointLight(0xffa13d, 3.5, 12, 2);
  fireLight.position.y = 1.25;
  fire.add(fireLight);

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.08, 4.8, 6),
    new THREE.MeshStandardMaterial({ color: 0x8a887a, roughness: 0.72, metalness: 0.26 }),
  );
  pole.position.set(1.15, 2.4, 0);
  root.add(pole);
  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry(1.35, 0.86, 3, 1),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.13, side: THREE.DoubleSide, roughness: 0.62 }),
  );
  banner.position.set(1.82, 3.84, 0);
  banner.rotation.y = Math.PI / 2;
  root.add(banner);

  const beacon = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.4, 0),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.2, roughness: 0.2, metalness: 0.18 }),
  );
  beacon.position.y = 4.55;
  tiers[3].add(beacon);

  const initialSubtitle = `PWR ${Math.round(camp.power)}  ·  POP ${camp.population}  ·  TECH ${camp.techLevel}`;
  const initialLabelKey = `${camp.name}|${camp.color}|${Math.round(Math.max(0, finite(camp.power)))}|${Math.max(0, Math.floor(finite(camp.population)))}|${Math.max(0, Math.floor(finite(camp.techLevel)))}`;
  const labelMaterial = new THREE.SpriteMaterial({
    map: makeLabelTexture(camp.name, initialSubtitle, camp.color),
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const label = new THREE.Sprite(labelMaterial);
  label.position.y = 6;
  label.scale.set(7.3, 1.76, 1);
  label.renderOrder = 30;
  root.add(label);

  setShadows(root, true, true);
  territory.castShadow = false;
  territory.receiveShadow = false;
  territoryFill.castShadow = false;
  territoryFill.receiveShadow = false;
  attackRing.castShadow = false;
  beliefRing.castShadow = false;
  beliefRing.receiveShadow = false;
  hitTarget.castShadow = false;
  hitTarget.receiveShadow = false;
  label.castShadow = false;

  const territoryRadius = clamp(finite(camp.territory, 7), 3.8, 32);
  return {
    root,
    hitTarget,
    territory,
    territoryFill,
    attackRing,
    beliefRing,
    shrine,
    shrineBeacon,
    tiers,
    banner,
    beacon,
    flames,
    fireLight,
    label,
    labelMaterial,
    target: new THREE.Vector2(finite(camp.position.x), finite(camp.position.z)),
    territoryTarget: territoryRadius,
    territoryCurrent: territoryRadius,
    territoryGeometryKey: "",
    underAttack: camp.underAttack,
    level: Math.max(0, Math.floor(finite(camp.level))),
    techLevel: Math.max(0, Math.floor(finite(camp.techLevel))),
    power: Math.max(0, finite(camp.power)),
    population: Math.max(0, Math.floor(finite(camp.population))),
    name: camp.name,
    color: camp.color,
    dominantBeliefId: camp.dominantBeliefId ?? null,
    beliefColor: camp.beliefColor ?? null,
    beliefDiversity: clamp(finite(camp.beliefDiversity), 0, 1),
    shrineLevel: Math.max(0, finite(camp.shrineLevel)),
    labelKey: initialLabelKey,
    phase: hashString(camp.id) * TAU,
  };
}

function applyCampState(visual: CampVisual, camp: VisualCamp, profile: TerrainProfile) {
  visual.target.set(
    sceneCoordinate(camp.position.x, profile.halfSize),
    sceneCoordinate(camp.position.z, profile.halfSize),
  );
  visual.territoryTarget = campTerritoryRadius(camp, profile);
  visual.underAttack = camp.underAttack;
  visual.level = Math.max(0, Math.floor(finite(camp.level)));
  visual.techLevel = Math.max(0, Math.floor(finite(camp.techLevel)));
  visual.power = Math.max(0, finite(camp.power));
  visual.population = Math.max(0, Math.floor(finite(camp.population)));
  visual.dominantBeliefId = camp.dominantBeliefId ?? null;
  visual.beliefColor = camp.beliefColor ?? null;
  visual.beliefDiversity = clamp(finite(camp.beliefDiversity), 0, 1);
  visual.shrineLevel = Math.max(0, finite(camp.shrineLevel));

  const color = safeColor(camp.color);
  visual.territory.material.color.copy(color);
  visual.territoryFill.material.color.copy(color);
  visual.banner.material.color.copy(color);
  visual.banner.material.emissive.copy(color);
  visual.beacon.material.color.copy(color);
  visual.beacon.material.emissive.copy(color);
  const beliefColor = camp.beliefColor ? safeColor(camp.beliefColor, 0xb89cff) : new THREE.Color(0xb89cff);
  visual.beliefRing.material.color.copy(beliefColor);
  visual.beliefRing.visible = Boolean(visual.dominantBeliefId && visual.beliefColor);
  visual.shrine.visible = visual.beliefRing.visible && visual.shrineLevel > 0.02;
  visual.shrine.scale.setScalar(clamp(0.7 + Math.sqrt(visual.shrineLevel) * 0.16, 0.7, 1.5));
  visual.shrineBeacon.material.color.copy(beliefColor);
  visual.shrineBeacon.material.emissive.copy(beliefColor);
  visual.shrine.traverse((object) => {
    if (!object.userData.beliefAccent || !(object instanceof THREE.Mesh)) return;
    const material = object.material;
    if (material instanceof THREE.MeshStandardMaterial) material.color.copy(beliefColor).multiplyScalar(0.72);
  });
  visual.tiers.forEach((tier, index) => {
    tier.visible = index <= clamp(Math.max(visual.level - 1, visual.techLevel - 1), 0, 3);
  });
  visual.beacon.visible = visual.techLevel >= 3;

  const labelKey = `${camp.name}|${camp.color}|${Math.round(visual.power)}|${visual.population}|${visual.techLevel}`;
  if (labelKey !== visual.labelKey) {
    visual.labelMaterial.map?.dispose();
    visual.labelMaterial.map = makeLabelTexture(
      camp.name,
      `PWR ${Math.round(visual.power)}  ·  POP ${visual.population}  ·  TECH ${visual.techLevel}`,
      camp.color,
    );
    visual.labelMaterial.needsUpdate = true;
    visual.labelKey = labelKey;
  }
  visual.name = camp.name;
  visual.color = camp.color;
}

function makeInstancedPopulation(capacity: number): InstancedPopulationVisual {
  const safeCapacity = Math.max(INITIAL_POPULATION_INSTANCE_CAPACITY, Math.ceil(capacity));
  const root = new THREE.Group();
  root.name = "instanced-population";

  const body = new THREE.InstancedMesh(
    new THREE.CapsuleGeometry(0.31, 0.7, 4, 7),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.48,
      metalness: 0.08,
      transparent: true,
    }),
    safeCapacity,
  );
  body.name = "instanced-agent-bodies";
  body.count = 0;
  body.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  body.castShadow = false;
  body.receiveShadow = false;
  body.frustumCulled = false;
  root.add(body);

  const head = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(0.275, 1),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.72,
      transparent: true,
    }),
    safeCapacity,
  );
  head.name = "instanced-agent-heads";
  head.count = 0;
  head.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  head.castShadow = false;
  head.receiveShadow = false;
  head.frustumCulled = false;
  root.add(head);

  const beliefHalo = new THREE.InstancedMesh(
    new THREE.RingGeometry(0.75, 0.82, 24),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.34,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
    safeCapacity,
  );
  beliefHalo.name = "instanced-agent-belief-halos";
  beliefHalo.count = 0;
  beliefHalo.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  beliefHalo.castShadow = false;
  beliefHalo.receiveShadow = false;
  beliefHalo.frustumCulled = false;
  beliefHalo.renderOrder = 7;
  root.add(beliefHalo);

  return {
    root,
    body,
    head,
    beliefHalo,
    agentIds: [],
    beliefAgentIds: [],
    capacity: safeCapacity,
  };
}

function makeAgent(agent: VisualAgent, profile: TerrainProfile): AgentVisual {
  const color = safeColor(agent.color);
  const root = new THREE.Group();
  root.name = `agent:${agent.id}`;
  const actor = new THREE.Group();
  root.add(actor);

  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.31, 0.7, 4, 7),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.12,
      roughness: 0.48,
      metalness: 0.08,
      transparent: true,
    }),
  );
  body.position.y = 0.79;
  body.userData.agentId = agent.id;
  actor.add(body);

  const head = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.275, 1),
    new THREE.MeshStandardMaterial({
      color: 0xd9c5a8,
      emissive: color.clone().multiplyScalar(0.16),
      emissiveIntensity: 0.18,
      roughness: 0.72,
      transparent: true,
    }),
  );
  head.position.y = 1.43;
  head.userData.agentId = agent.id;
  actor.add(head);

  const shoulder = new THREE.Mesh(
    new THREE.TorusGeometry(0.34, 0.08, 5, 12, Math.PI),
    new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.18 }),
  );
  shoulder.rotation.x = Math.PI / 2;
  shoulder.position.set(0, 1.05, 0.07);
  actor.add(shoulder);

  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.21, 0.07, 0.05),
    new THREE.MeshBasicMaterial({ color: 0xeef8df }),
  );
  visor.position.set(0, 1.47, 0.254);
  visor.userData.agentId = agent.id;
  actor.add(visor);

  const direction = new THREE.Mesh(
    new THREE.ConeGeometry(0.19, 0.54, 3),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.82, side: THREE.DoubleSide }),
  );
  direction.rotation.x = Math.PI / 2;
  direction.position.set(0, 0.08, 0.85);
  actor.add(direction);

  const selection = new THREE.Mesh(
    new THREE.RingGeometry(0.54, 0.7, 36),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.88, side: THREE.DoubleSide, depthWrite: false }),
  );
  selection.rotation.x = -Math.PI / 2;
  selection.position.y = 0.075;
  selection.renderOrder = 9;
  root.add(selection);

  const initialBeliefColor = agent.beliefColor ? safeColor(agent.beliefColor, 0xb89cff) : new THREE.Color(0xb89cff);
  const beliefHalo = new THREE.Mesh(
    new THREE.RingGeometry(0.75, 0.82, 30),
    new THREE.MeshBasicMaterial({
      color: initialBeliefColor,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  beliefHalo.rotation.x = -Math.PI / 2;
  beliefHalo.position.y = 0.07;
  beliefHalo.renderOrder = 7;
  root.add(beliefHalo);

  const healthBack = makeSolidSprite(0x15211d);
  healthBack.position.set(-0.77, 1.94, 0);
  healthBack.center.set(0, 0.5);
  healthBack.scale.set(1.55, 0.13, 1);
  healthBack.renderOrder = 24;
  root.add(healthBack);
  const healthFill = makeSolidSprite(0x79e17c);
  healthFill.position.set(-0.75, 1.94, 0.001);
  healthFill.center.set(0, 0.5);
  healthFill.scale.set(1.5, 0.08, 1);
  healthFill.renderOrder = 25;
  root.add(healthFill);

  const initialSubtitle = `POWER ${Math.round(agent.power)}  ·  AGE ${Math.floor(agent.age)}`;
  const initialLabelKey = `${agent.name}|${agent.color}|${Math.round(Math.max(0, finite(agent.power)))}|${Math.floor(finite(agent.age))}`;
  const labelMaterial = new THREE.SpriteMaterial({
    map: makeLabelTexture(agent.name, initialSubtitle, agent.color, 512, 138),
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const label = new THREE.Sprite(labelMaterial);
  label.position.y = 2.63;
  label.scale.set(4.8, 1.29, 1);
  label.renderOrder = 30;
  root.add(label);

  const carryGroup = new THREE.Group();
  carryGroup.position.set(0, 1.1, -0.37);
  actor.add(carryGroup);
  const carry: Record<VisualResourceKind, THREE.Mesh> = {
    food: new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.105, 0),
      new THREE.MeshStandardMaterial({ color: 0xe66d69, emissive: 0x3d1010, emissiveIntensity: 0.25 }),
    ),
    water: new THREE.Mesh(
      new THREE.OctahedronGeometry(0.115, 0),
      new THREE.MeshStandardMaterial({ color: 0x62d5e6, emissive: 0x163f4b, emissiveIntensity: 0.35 }),
    ),
    wood: new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.14, 0.14),
      new THREE.MeshStandardMaterial({ color: 0xc49159, roughness: 0.94 }),
    ),
    ore: new THREE.Mesh(
      new THREE.OctahedronGeometry(0.115, 0),
      new THREE.MeshStandardMaterial({ color: 0xb8c5d0, emissive: 0x2a3541, emissiveIntensity: 0.35, metalness: 0.5 }),
    ),
  };
  (Object.keys(carry) as VisualResourceKind[]).forEach((kind, index) => {
    const item = carry[kind];
    item.position.set((index - 1.5) * 0.13, (index % 2) * 0.12, 0);
    carryGroup.add(item);
  });

  const trail = new THREE.Line(
    new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(new Float32Array(9 * 3), 3)),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.23, depthWrite: false }),
  );
  trail.renderOrder = 4;
  root.add(trail);

  setShadows(actor, true, false);
  selection.castShadow = false;
  beliefHalo.castShadow = false;
  direction.castShadow = false;
  label.castShadow = false;
  healthBack.castShadow = false;
  healthFill.castShadow = false;

  const targetX = sceneCoordinate(agent.position.x, profile.halfSize);
  const targetZ = sceneCoordinate(agent.position.z, profile.halfSize);
  return {
    root,
    actor,
    body,
    head,
    direction,
    selection,
    beliefHalo,
    healthBack,
    healthFill,
    label,
    labelMaterial,
    carry,
    trail,
    trailPoints: [new THREE.Vector3(targetX, 0, targetZ)],
    target: new THREE.Vector2(targetX, targetZ),
    velocity: new THREE.Vector2(finite(agent.velocity.x), finite(agent.velocity.z)),
    facing: Math.atan2(finite(agent.velocity.x), finite(agent.velocity.z, 1)),
    alive: agent.alive,
    adult: agent.adult,
    health: clamp(finite(agent.health, 100), 0, 100),
    power: Math.max(0, finite(agent.power)),
    color: agent.color,
    beliefId: agent.beliefId ?? null,
    beliefColor: agent.beliefColor ?? null,
    conviction: clamp(finite(agent.conviction), 0, 1),
    name: agent.name,
    labelKey: initialLabelKey,
    phase: hashString(agent.id) * TAU,
  };
}

function applyAgentState(visual: AgentVisual, agent: VisualAgent, profile: TerrainProfile) {
  const nextX = sceneCoordinate(agent.position.x, profile.halfSize);
  const nextZ = sceneCoordinate(agent.position.z, profile.halfSize);
  if (visual.trailPoints[visual.trailPoints.length - 1]?.distanceToSquared(new THREE.Vector3(nextX, 0, nextZ)) > 1.2) {
    visual.trailPoints.push(new THREE.Vector3(nextX, 0, nextZ));
    if (visual.trailPoints.length > 9) visual.trailPoints.shift();
  }
  visual.target.set(nextX, nextZ);
  visual.velocity.set(finite(agent.velocity.x), finite(agent.velocity.z));
  visual.alive = agent.alive;
  visual.adult = agent.adult;
  visual.health = clamp(finite(agent.health, 100), 0, 100);
  visual.power = Math.max(0, finite(agent.power));
  visual.beliefId = agent.beliefId ?? null;
  visual.beliefColor = agent.beliefColor ?? null;
  visual.conviction = clamp(finite(agent.conviction), 0, 1);

  const color = safeColor(agent.color);
  const healthRatio = visual.health / 100;
  visual.body.material.color.copy(color).multiplyScalar(0.56 + healthRatio * 0.44);
  visual.body.material.emissive.copy(color);
  visual.body.material.emissiveIntensity = 0.06 + clamp(visual.power / 250, 0, 0.2);
  visual.body.material.opacity = visual.alive ? 1 : 0.23;
  visual.head.material.opacity = visual.alive ? 1 : 0.2;
  visual.direction.material.color.copy(color);
  visual.selection.material.color.copy(color);
  visual.trail.material.color.copy(color);
  const beliefColor = agent.beliefColor ? safeColor(agent.beliefColor, 0xb89cff) : new THREE.Color(0xb89cff);
  visual.beliefHalo.material.color.copy(beliefColor);
  visual.beliefHalo.visible = visual.alive && Boolean(visual.beliefId && visual.beliefColor);
  visual.beliefHalo.material.opacity = 0.2 + visual.conviction * 0.52;
  visual.beliefHalo.scale.setScalar(0.88 + visual.conviction * 0.28);
  const healthColor = new THREE.Color(0xe1514f).lerp(new THREE.Color(0xf0b55a), smoothstep(0.15, 0.6, healthRatio));
  healthColor.lerp(new THREE.Color(0x79e17c), smoothstep(0.55, 1, healthRatio));
  visual.healthFill.material.color.copy(healthColor);
  visual.healthFill.scale.x = 1.5 * Math.max(0.012, healthRatio);

  const ageScale = agent.adult
    ? clamp(0.88 + Math.min(Math.max(finite(agent.age), 0), 80) / 900, 0.88, 0.99)
    : clamp(0.54 + Math.max(finite(agent.age), 0) / 85, 0.54, 0.8);
  visual.actor.scale.setScalar(ageScale);
  const inventory = agent.inventory;
  (Object.keys(visual.carry) as VisualResourceKind[]).forEach((kind) => {
    const amount = Math.max(0, finite(inventory[kind]));
    visual.carry[kind].visible = visual.alive && amount > 0.01;
    visual.carry[kind].scale.setScalar(0.7 + clamp(Math.sqrt(amount) / 5, 0, 0.65));
  });

  const labelKey = `${agent.name}|${agent.color}|${Math.round(visual.power)}|${Math.floor(finite(agent.age))}`;
  if (labelKey !== visual.labelKey) {
    visual.labelMaterial.map?.dispose();
    visual.labelMaterial.map = makeLabelTexture(
      agent.name,
      `POWER ${Math.round(visual.power)}  ·  AGE ${Math.floor(Math.max(0, finite(agent.age)))}`,
      agent.color,
      512,
      138,
    );
    visual.labelMaterial.needsUpdate = true;
    visual.labelKey = labelKey;
  }
  visual.name = agent.name;
  visual.color = agent.color;
}

function makeFoodResource(id: VisualId) {
  const root = new THREE.Group();
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.1, 0.62, 5),
    new THREE.MeshStandardMaterial({ color: 0x31563a, roughness: 1 }),
  );
  stem.position.y = 0.31;
  root.add(stem);
  const crown = new THREE.Group();
  const leafMaterial = new THREE.MeshStandardMaterial({ color: 0x438158, roughness: 0.9, flatShading: true });
  [[-0.24, 0.58, 0], [0.21, 0.65, 0.13], [0.03, 0.78, -0.19]].forEach(([x, y, z]) => {
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.29, 0), leafMaterial.clone());
    leaf.position.set(x, y, z);
    leaf.scale.set(1, 0.7, 0.82);
    crown.add(leaf);
  });
  const berryMaterial = new THREE.MeshStandardMaterial({ color: 0xe95f6c, emissive: 0x41141b, emissiveIntensity: 0.4 });
  for (let index = 0; index < 7; index += 1) {
    const angle = index / 7 * TAU + hashString(`${id}:${index}`);
    const berry = new THREE.Mesh(new THREE.IcosahedronGeometry(0.085, 0), berryMaterial.clone());
    berry.position.set(Math.cos(angle) * 0.31, 0.58 + index % 3 * 0.12, Math.sin(angle) * 0.24);
    crown.add(berry);
  }
  root.add(crown);
  return { root, accent: crown };
}

function makeWaterResource() {
  const root = new THREE.Group();
  const pool = new THREE.Mesh(
    new THREE.CylinderGeometry(0.62, 0.72, 0.1, 12),
    new THREE.MeshPhysicalMaterial({
      color: 0x49b9cb,
      emissive: 0x123e48,
      emissiveIntensity: 0.62,
      roughness: 0.18,
      clearcoat: 0.7,
      transparent: true,
      opacity: 0.88,
    }),
  );
  pool.position.y = 0.05;
  root.add(pool);
  const accent = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.2, 0),
    new THREE.MeshStandardMaterial({ color: 0x8cecf0, emissive: 0x38a9bb, emissiveIntensity: 0.8 }),
  );
  accent.position.y = 0.48;
  root.add(accent);
  return { root, accent };
}

function makeWoodResource(id: VisualId) {
  const root = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.24, 1.42, 7),
    new THREE.MeshStandardMaterial({ color: 0x72533b, roughness: 1 }),
  );
  trunk.position.y = 0.71;
  root.add(trunk);
  const crown = new THREE.Group();
  const foliage = new THREE.MeshStandardMaterial({ color: 0x316c45, roughness: 0.95, flatShading: true });
  for (let index = 0; index < 3; index += 1) {
    const layer = new THREE.Mesh(new THREE.ConeGeometry(0.8 - index * 0.13, 1.2, 7), foliage.clone());
    layer.position.y = 1.35 + index * 0.52;
    layer.rotation.y = hashString(`${id}:${index}`) * TAU;
    crown.add(layer);
  }
  root.add(crown);
  return { root, accent: crown };
}

function makeOreResource(id: VisualId) {
  const root = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.58, 0),
    new THREE.MeshStandardMaterial({ color: 0x59636b, roughness: 0.82, metalness: 0.28, flatShading: true }),
  );
  base.scale.set(1.2, 0.45, 1);
  base.position.y = 0.26;
  root.add(base);
  const crystals = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({
    color: 0xb6c8d2,
    emissive: 0x314453,
    emissiveIntensity: 0.46,
    roughness: 0.32,
    metalness: 0.64,
    flatShading: true,
  });
  for (let index = 0; index < 4; index += 1) {
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.23 + index * 0.025, 0), material.clone());
    const angle = index / 4 * TAU + hashString(`${id}:ore`) * 0.4;
    crystal.position.set(Math.cos(angle) * 0.35, 0.54 + index % 2 * 0.18, Math.sin(angle) * 0.3);
    crystal.scale.y = 1.5 + index * 0.11;
    crystals.add(crystal);
  }
  root.add(crystals);
  return { root, accent: crystals };
}

function resourceOverlayColor(kind: VisualResourceKind) {
  if (kind === "food") return 0xf17778;
  if (kind === "water") return 0x64e2f0;
  if (kind === "wood") return 0x8dd277;
  return 0xd1dbe4;
}

function makeResource(resource: VisualResource, profile: TerrainProfile): ResourceVisual {
  const constructed = resource.kind === "food"
    ? makeFoodResource(resource.id)
    : resource.kind === "water"
      ? makeWaterResource()
      : resource.kind === "wood"
        ? makeWoodResource(resource.id)
        : makeOreResource(resource.id);
  constructed.root.name = `resource:${resource.id}`;
  const abundanceRing = new THREE.Mesh(
    new THREE.RingGeometry(0.82, 1.02, 28),
    new THREE.MeshBasicMaterial({
      color: resourceOverlayColor(resource.kind),
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
    }),
  );
  abundanceRing.rotation.x = -Math.PI / 2;
  abundanceRing.position.y = 0.14;
  abundanceRing.renderOrder = 10;
  abundanceRing.visible = false;
  abundanceRing.castShadow = false;
  abundanceRing.receiveShadow = false;
  constructed.root.add(abundanceRing);
  setShadows(constructed.root, resource.kind !== "water", true);
  abundanceRing.castShadow = false;
  abundanceRing.receiveShadow = false;
  const ratio = clamp(finite(resource.amount) / Math.max(0.0001, finite(resource.max, 1)), 0, 1);
  return {
    root: constructed.root,
    kind: resource.kind,
    accent: constructed.accent,
    abundanceRing,
    target: new THREE.Vector2(
      sceneCoordinate(resource.position.x, profile.halfSize),
      sceneCoordinate(resource.position.z, profile.halfSize),
    ),
    targetRatio: ratio,
    currentRatio: ratio,
    phase: hashString(resource.id) * TAU,
  };
}

function beliefInfluenceRadius(belief: VisualBelief) {
  const influence = Math.max(0, finite(belief.influence));
  const adherents = Math.max(0, finite(belief.adherents));
  return clamp(2.8 + Math.sqrt(influence) * 0.34 + Math.sqrt(adherents) * 0.52, 3.2, 20);
}

function makeBelief(belief: VisualBelief, profile: TerrainProfile): BeliefVisual {
  const color = safeColor(belief.color, 0xb89cff);
  const root = new THREE.Group();
  root.name = `belief:${belief.id}`;

  const influenceFill = new THREE.Mesh(
    new THREE.CircleGeometry(1, 56),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
    }),
  );
  influenceFill.rotation.x = -Math.PI / 2;
  influenceFill.position.y = 0.075;
  influenceFill.renderOrder = 3;
  influenceFill.visible = false;
  root.add(influenceFill);

  const influenceRing = new THREE.Mesh(
    new THREE.RingGeometry(0.965, 1, 72),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.26,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  influenceRing.rotation.x = -Math.PI / 2;
  influenceRing.position.y = 0.1;
  influenceRing.renderOrder = 5;
  root.add(influenceRing);

  const selectionRing = new THREE.Mesh(
    new THREE.RingGeometry(1.1, 1.2, 72),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.82,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  selectionRing.rotation.x = -Math.PI / 2;
  selectionRing.position.y = 0.135;
  selectionRing.renderOrder = 8;
  root.add(selectionRing);

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 1.12, 0.26, 7),
    new THREE.MeshStandardMaterial({ color: 0x505953, roughness: 0.86, metalness: 0.14 }),
  );
  base.position.y = 0.13;
  root.add(base);

  const crown = new THREE.Group();
  for (let index = 0; index < 3; index += 1) {
    const angle = index / 3 * TAU + Math.PI / 6;
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.105, 1.7, 5),
      new THREE.MeshStandardMaterial({ color: color.clone().multiplyScalar(0.68), roughness: 0.6, metalness: 0.22 }),
    );
    pillar.position.set(Math.cos(angle) * 0.58, 1.05, Math.sin(angle) * 0.58);
    pillar.rotation.z = Math.cos(angle) * -0.1;
    pillar.rotation.x = Math.sin(angle) * 0.1;
    crown.add(pillar);
  }
  root.add(crown);

  const orbit = new THREE.Mesh(
    new THREE.TorusGeometry(0.65, 0.035, 5, 32),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.58 }),
  );
  orbit.rotation.x = Math.PI / 2.7;
  orbit.position.y = 1.93;
  root.add(orbit);

  const beacon = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.42, 0),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 1,
      roughness: 0.25,
      metalness: 0.22,
    }),
  );
  beacon.position.y = 2.08;
  root.add(beacon);

  const hitTarget = new THREE.Mesh(
    new THREE.CylinderGeometry(1.45, 1.45, 3.4, 10),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  );
  hitTarget.position.y = 1.7;
  hitTarget.userData.beliefId = belief.id;
  root.add(hitTarget);

  const labelKey = `${belief.name}|${belief.color}|${Math.round(Math.max(0, finite(belief.adherents)))}`;
  const labelMaterial = new THREE.SpriteMaterial({
    map: makeLabelTexture(
      belief.name,
      `BELIEF  ·  ${Math.round(Math.max(0, finite(belief.adherents)))} ADHERENTS`,
      belief.color,
      560,
      144,
    ),
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const label = new THREE.Sprite(labelMaterial);
  label.position.y = 3.45;
  label.scale.set(5.7, 1.47, 1);
  label.renderOrder = 31;
  root.add(label);

  setShadows(root, true, false);
  influenceFill.castShadow = false;
  influenceRing.castShadow = false;
  selectionRing.castShadow = false;
  hitTarget.castShadow = false;
  label.castShadow = false;

  const targetX = sceneCoordinate(belief.sacredSite.x, profile.halfSize);
  const targetZ = sceneCoordinate(belief.sacredSite.z, profile.halfSize);
  const radius = beliefInfluenceRadius(belief);
  return {
    root,
    hitTarget,
    influenceFill,
    influenceRing,
    selectionRing,
    beacon,
    label,
    labelMaterial,
    labelKey,
    target: new THREE.Vector2(targetX, targetZ),
    influenceTarget: radius,
    influenceCurrent: radius,
    adherents: Math.max(0, finite(belief.adherents)),
    active: belief.active,
    color: belief.color,
    phase: hashString(belief.id) * TAU,
  };
}

function applyBeliefState(visual: BeliefVisual, belief: VisualBelief, profile: TerrainProfile) {
  visual.target.set(
    sceneCoordinate(belief.sacredSite.x, profile.halfSize),
    sceneCoordinate(belief.sacredSite.z, profile.halfSize),
  );
  visual.influenceTarget = beliefInfluenceRadius(belief);
  visual.adherents = Math.max(0, finite(belief.adherents));
  visual.active = belief.active;
  visual.color = belief.color;
  const color = safeColor(belief.color, 0xb89cff);
  visual.influenceFill.material.color.copy(color);
  visual.influenceRing.material.color.copy(color);
  visual.selectionRing.material.color.copy(color);
  visual.beacon.material.color.copy(color);
  visual.beacon.material.emissive.copy(color);
  visual.root.traverse((object) => {
    if (
      !(object instanceof THREE.Mesh) ||
      object === visual.hitTarget ||
      object === visual.influenceFill ||
      object === visual.influenceRing ||
      object === visual.selectionRing
    ) return;
    const material = object.material;
    if (material instanceof THREE.MeshStandardMaterial && object !== visual.beacon && material.metalness > 0.18) {
      material.color.copy(color).multiplyScalar(0.68);
    }
  });

  const labelKey = `${belief.name}|${belief.color}|${Math.round(visual.adherents)}`;
  if (labelKey !== visual.labelKey) {
    visual.labelMaterial.map?.dispose();
    visual.labelMaterial.map = makeLabelTexture(
      belief.name,
      `BELIEF  ·  ${Math.round(visual.adherents)} ADHERENTS`,
      belief.color,
      560,
      144,
    );
    visual.labelMaterial.needsUpdate = true;
    visual.labelKey = labelKey;
  }
}

function diplomacyColor(relation: DiplomaticRelation) {
  if (relation === "alliance") return 0x69d8bd;
  if (relation === "trade") return 0xf1c66d;
  return 0xf05b54;
}

function makeDiplomaticLink(link: VisualDiplomaticLink): LinkVisual {
  const root = new THREE.Group();
  root.name = `diplomacy:${link.id}`;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(27 * 3), 3));
  const material = new THREE.LineDashedMaterial({
    color: diplomacyColor(link.relation),
    transparent: true,
    opacity: link.relation === "hostile" ? 0.52 : 0.38,
    depthWrite: false,
    dashSize: link.relation === "trade" ? 1.2 : 0.72,
    gapSize: link.relation === "hostile" ? 0.46 : 0.72,
  });
  const line = new THREE.Line(geometry, material);
  line.name = `diplomacy-line:${link.id}`;
  line.frustumCulled = false;
  line.renderOrder = 6;
  const hitTarget = new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      colorWrite: false,
    }),
  );
  hitTarget.name = `diplomacy-hit:${link.id}`;
  hitTarget.frustumCulled = false;
  hitTarget.userData.mapRelationId = link.id;
  hitTarget.userData.mapRelationKind = link.relation;
  root.add(line, hitTarget);
  return {
    id: link.id,
    root,
    line,
    hitTarget,
    fromCampId: link.fromCampId,
    toCampId: link.toCampId,
    relation: link.relation,
    strength: clamp(finite(link.strength, 1), 0, 1),
  };
}

function makeWar(war: VisualWar): WarVisual {
  const root = new THREE.Group();
  root.name = `war:${war.id}`;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(33 * 3), 3));
  const material = new THREE.LineDashedMaterial({
    color: 0xff5048,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
    dashSize: 1.25,
    gapSize: 0.58,
  });
  const line = new THREE.Line(geometry, material);
  line.name = `war-line:${war.id}`;
  line.frustumCulled = false;
  line.renderOrder = 11;
  root.add(line);
  const hitTarget = new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      colorWrite: false,
    }),
  );
  hitTarget.name = `war-hit:${war.id}`;
  hitTarget.frustumCulled = false;
  hitTarget.userData.mapRelationId = war.id;
  hitTarget.userData.mapRelationKind = "war";
  root.add(hitTarget);
  const projectile = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.32, 0),
    new THREE.MeshBasicMaterial({ color: 0xffb15c, transparent: true, opacity: 0.96, depthWrite: false }),
  );
  projectile.renderOrder = 14;
  root.add(projectile);
  const clash = new THREE.Mesh(
    new THREE.RingGeometry(0.46, 0.72, 18),
    new THREE.MeshBasicMaterial({ color: 0xff554b, transparent: true, opacity: 0.72, side: THREE.DoubleSide, depthWrite: false }),
  );
  clash.rotation.x = -Math.PI / 2;
  clash.renderOrder = 12;
  root.add(clash);
  return {
    id: war.id,
    root,
    line,
    hitTarget,
    projectile,
    clash,
    attackerCampId: war.attackerCampId,
    defenderCampId: war.defenderCampId,
    intensity: clamp(finite(war.intensity, 0.5), 0, 1),
    curve: new THREE.QuadraticBezierCurve3(new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()),
    phase: hashString(war.id),
  };
}

function setQuadraticCurve(
  curve: THREE.QuadraticBezierCurve3,
  from: THREE.Vector3,
  to: THREE.Vector3,
  arcHeight: number,
) {
  curve.v0.copy(from);
  curve.v2.copy(to);
  curve.v1.copy(from).lerp(to, 0.5);
  curve.v1.y += arcHeight;
}

function writeCurveGeometry(
  geometry: THREE.BufferGeometry,
  curve: THREE.QuadraticBezierCurve3,
) {
  const positions = geometry.getAttribute("position") as THREE.BufferAttribute;
  for (let index = 0; index < positions.count; index += 1) {
    const point = curve.getPoint(index / Math.max(1, positions.count - 1));
    positions.setXYZ(index, point.x, point.y, point.z);
  }
  positions.needsUpdate = true;
  geometry.computeBoundingSphere();
}

function campConnectionPoint(camp: CampVisual) {
  return new THREE.Vector3(camp.root.position.x, camp.root.position.y + 1.05, camp.root.position.z);
}

export function createCivilizationScene(
  mount: HTMLElement,
  initialWorld: VisualWorld,
  options: CivilizationSceneOptions,
): CivilizationScene {
  let disposed = false;
  let activeProfile = makeTerrainProfile(initialWorld.seed, initialWorld.halfSize);
  let activeCameraMode: CameraMode = "overview";
  let selectedAgentId: VisualId | null = null;
  let selectedCampId: VisualId | null = null;
  let selectedBeliefId: VisualId | null = initialWorld.selectedBeliefId ?? null;
  let activeOverlayMode: MapOverlayMode = resolveOverlayMode(initialWorld.overlayMode);
  let worldClockTarget = finite(initialWorld.elapsed);
  let worldClockVisual = worldClockTarget;
  let animationTime = 0;
  const reducedMotion = options.reducedMotion ?? (
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  const scene = new THREE.Scene();
  const background = new THREE.Color(0x0b1718);
  scene.background = background;
  scene.fog = new THREE.FogExp2(background, 0.0046);

  const camera = new THREE.PerspectiveCamera(47, 1, 0.18, activeProfile.halfSize * 8);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.style.display = "block";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  renderer.domElement.style.touchAction = "none";
  renderer.domElement.setAttribute("aria-label", "Interactive three-dimensional civilization map");
  mount.appendChild(renderer.domElement);

  const hemisphere = new THREE.HemisphereLight(0xd0e1db, 0x17231d, 1.6);
  scene.add(hemisphere);
  const sun = new THREE.DirectionalLight(0xffedc8, 3.2);
  sun.position.set(62, 78, 44);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.00022;
  sun.shadow.normalBias = 0.035;
  sun.shadow.camera.near = 2;
  sun.shadow.camera.far = activeProfile.halfSize * 4;
  scene.add(sun, sun.target);
  const moonFill = new THREE.DirectionalLight(0x718cad, 0.5);
  moonFill.position.set(-45, 38, -35);
  scene.add(moonFill);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = !reducedMotion;
  controls.dampingFactor = 0.065;
  controls.enableRotate = true;
  controls.enableZoom = true;
  controls.enablePan = true;
  controls.rotateSpeed = 0.62;
  controls.zoomSpeed = 0.88;
  controls.panSpeed = 0.78;
  controls.screenSpacePanning = false;
  controls.minDistance = 5;
  controls.maxDistance = activeProfile.halfSize * 3.15;
  controls.minTargetRadius = 0;
  controls.maxTargetRadius = activeProfile.halfSize * 1.5;
  controls.cursor.set(0, 0, 0);
  controls.maxPolarAngle = Math.PI * 0.485;
  controls.minPolarAngle = 0.14;
  controls.touches.ONE = THREE.TOUCH.ROTATE;
  controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
  controls.zoomToCursor = true;
  controls.enabled = false;
  let controlsPrimedForPointer = false;
  let pointerGestureOwnsCamera = false;

  let staticWorld = makeStaticWorld(activeProfile);
  scene.add(staticWorld.root);
  const agentVisuals = new Map<VisualId, AgentVisual>();
  let instancedPopulation = makeInstancedPopulation(INITIAL_POPULATION_INSTANCE_CAPACITY);
  scene.add(instancedPopulation.root);
  const resourceVisuals = new Map<VisualId, ResourceVisual>();
  const campVisuals = new Map<VisualId, CampVisual>();
  const beliefVisuals = new Map<VisualId, BeliefVisual>();
  const linkVisuals = new Map<VisualId, LinkVisual>();
  const warVisuals = new Map<VisualId, WarVisual>();

  const cameraTarget = new THREE.Vector3();
  const desiredCamera = new THREE.Vector3();
  const desiredTarget = new THREE.Vector3();
  const connectionFrom = new THREE.Vector3();
  const connectionTo = new THREE.Vector3();
  const instanceTransform = new THREE.Object3D();
  const instanceColor = new THREE.Color();
  const instanceAccentColor = new THREE.Color();

  const configureShadowCamera = () => {
    const extent = Math.min(82, activeProfile.halfSize * 0.9);
    const shadowCamera = sun.shadow.camera;
    shadowCamera.left = -extent;
    shadowCamera.right = extent;
    shadowCamera.top = extent;
    shadowCamera.bottom = -extent;
    shadowCamera.far = activeProfile.halfSize * 4;
    shadowCamera.updateProjectionMatrix();
  };
  configureShadowCamera();

  const rebuildStaticWorld = (seed: number, halfSize: number) => {
    scene.remove(staticWorld.root);
    disposeObject(staticWorld.root);
    activeProfile = makeTerrainProfile(seed, halfSize);
    staticWorld = makeStaticWorld(activeProfile);
    scene.add(staticWorld.root);
    camera.far = activeProfile.halfSize * 8;
    camera.updateProjectionMatrix();
    controls.maxDistance = activeProfile.halfSize * 3.15;
    controls.maxTargetRadius = activeProfile.halfSize * 1.5;
    configureShadowCamera();
  };

  const syncCamps = (camps: VisualCamp[], immediate: boolean) => {
    const territoryCells = new Map<VisualId, TerritoryCell>(layoutExclusiveTerritories(
      camps.map((camp) => ({
        id: camp.id,
        position: {
          x: sceneCoordinate(camp.position.x, activeProfile.halfSize),
          z: sceneCoordinate(camp.position.z, activeProfile.halfSize),
        },
        radius: campTerritoryRadius(camp, activeProfile),
      })),
      { halfSize: activeProfile.halfSize, edgeInset: EDGE_INSET },
    ).map((cell) => [cell.id, cell] as const));
    const incoming = new Set(camps.map((camp) => camp.id));
    campVisuals.forEach((visual, id) => {
      if (incoming.has(id)) return;
      scene.remove(visual.root);
      disposeObject(visual.root);
      campVisuals.delete(id);
    });
    camps.forEach((camp) => {
      let visual = campVisuals.get(camp.id);
      let created = false;
      if (!visual) {
        visual = makeCamp(camp);
        campVisuals.set(camp.id, visual);
        scene.add(visual.root);
        created = true;
      }
      const previousTargetX = visual.target.x;
      const previousTargetZ = visual.target.y;
      applyCampState(visual, camp, activeProfile);
      const centerChanged = Math.abs(previousTargetX - visual.target.x) > 1e-9
        || Math.abs(previousTargetZ - visual.target.y) > 1e-9;
      const territoryCell = territoryCells.get(camp.id);
      if (territoryCell) applyTerritoryGeometry(visual, territoryCell, activeProfile);
      if (immediate || created || centerChanged) {
        visual.root.position.set(
          visual.target.x,
          terrainHeight(visual.target.x, visual.target.y, activeProfile),
          visual.target.y,
        );
        visual.territoryCurrent = visual.territoryTarget;
      }
    });
  };

  const ensureInstancedPopulationCapacity = (required: number) => {
    if (required <= instancedPopulation.capacity) return;
    let nextCapacity = instancedPopulation.capacity;
    while (nextCapacity < required) nextCapacity *= 2;
    scene.remove(instancedPopulation.root);
    disposeObject(instancedPopulation.root);
    instancedPopulation = makeInstancedPopulation(nextCapacity);
    scene.add(instancedPopulation.root);
  };

  const chooseDetailedAgentIds = (agents: VisualAgent[]) => {
    const byId = new Map(agents.map((agent) => [agent.id, agent] as const));
    const chosen = new Set<VisualId>();
    const selected = selectedAgentId ? byId.get(selectedAgentId) : undefined;
    if (selected) chosen.add(selected.id);

    const living = agents.filter((agent) => agent.alive && agent.id !== selectedAgentId);
    living
      .slice()
      .sort((left, right) => finite(right.power) - finite(left.power) || left.id.localeCompare(right.id))
      .slice(0, INFLUENTIAL_DETAILED_AGENTS)
      .forEach((agent) => chosen.add(agent.id));

    // Preserve already-created actors before filling nearby slots. This avoids
    // churning canvas labels when agents cross a nearest-neighbour boundary.
    agentVisuals.forEach((_visual, id) => {
      if (chosen.size >= MAX_DETAILED_AGENTS) return;
      if (byId.get(id)?.alive) chosen.add(id);
    });

    const focusX = selected
      ? sceneCoordinate(selected.position.x, activeProfile.halfSize)
      : cameraTarget.x;
    const focusZ = selected
      ? sceneCoordinate(selected.position.z, activeProfile.halfSize)
      : cameraTarget.z;
    if (chosen.size < MAX_DETAILED_AGENTS) {
      living
        .filter((agent) => !chosen.has(agent.id))
        .map((agent) => ({
          agent,
          distance: (
            Math.pow(sceneCoordinate(agent.position.x, activeProfile.halfSize) - focusX, 2)
            + Math.pow(sceneCoordinate(agent.position.z, activeProfile.halfSize) - focusZ, 2)
          ),
        }))
        .sort((left, right) => left.distance - right.distance || right.agent.power - left.agent.power)
        .slice(0, MAX_DETAILED_AGENTS - chosen.size)
        .forEach(({ agent }) => chosen.add(agent.id));
    }
    return chosen;
  };

  const syncInstancedAgents = (agents: VisualAgent[], detailedIds: Set<VisualId>) => {
    const instancedAgents = agents.filter((agent) => !detailedIds.has(agent.id));
    ensureInstancedPopulationCapacity(instancedAgents.length);
    const population = instancedPopulation;
    population.agentIds.length = 0;
    population.beliefAgentIds.length = 0;

    const isWorldOverlay = activeOverlayMode === "world";
    const isBeliefOverlay = activeOverlayMode === "beliefs";
    const overlayOpacity = isWorldOverlay
      ? 1
      : isBeliefOverlay
        ? 0.82
        : activeOverlayMode === "wars"
          ? 0.62
          : 0.44;
    population.body.material.opacity = overlayOpacity;
    population.head.material.opacity = overlayOpacity;
    population.beliefHalo.material.opacity = isBeliefOverlay ? 0.66 : 0.28;

    let beliefIndex = 0;
    instancedAgents.forEach((agent, index) => {
      const x = sceneCoordinate(agent.position.x, activeProfile.halfSize);
      const z = sceneCoordinate(agent.position.z, activeProfile.halfSize);
      const ground = terrainHeight(x, z, activeProfile);
      const ageScale = agent.adult
        ? clamp(0.88 + Math.min(Math.max(finite(agent.age), 0), 80) / 900, 0.88, 0.99)
        : clamp(0.54 + Math.max(finite(agent.age), 0) / 85, 0.54, 0.8);
      const healthRatio = clamp(finite(agent.health, 100), 0, 100) / 100;
      const alive = Boolean(agent.alive);
      const facing = Math.atan2(finite(agent.velocity.x), finite(agent.velocity.z, 1));

      instanceTransform.position.set(x, ground + (alive ? 0.79 : 0.31) * ageScale, z);
      instanceTransform.rotation.set(0, facing, alive ? 0 : Math.PI / 2);
      instanceTransform.scale.setScalar(ageScale);
      instanceTransform.updateMatrix();
      population.body.setMatrixAt(index, instanceTransform.matrix);

      instanceTransform.position.y = ground + (alive ? 1.43 : 0.38) * ageScale;
      instanceTransform.updateMatrix();
      population.head.setMatrixAt(index, instanceTransform.matrix);

      instanceColor.copy(safeColor(agent.color)).multiplyScalar(0.56 + healthRatio * 0.44);
      if (isBeliefOverlay) {
        if (agent.beliefId && agent.beliefColor) {
          instanceColor.lerp(safeColor(agent.beliefColor, 0xb89cff), 0.42);
          if (selectedBeliefId && agent.beliefId !== selectedBeliefId) instanceColor.multiplyScalar(0.56);
          if (selectedBeliefId === agent.beliefId) instanceColor.lerp(instanceAccentColor.set(0xffffff), 0.13);
        } else {
          instanceColor.lerp(instanceAccentColor.set(0x59635e), 0.72).multiplyScalar(0.58);
        }
      } else if (!isWorldOverlay) {
        instanceColor.multiplyScalar(activeOverlayMode === "wars" ? 0.82 : 0.66);
      }
      if (!alive) instanceColor.multiplyScalar(0.28);
      population.body.setColorAt(index, instanceColor);

      const skinVariation = hashString(agent.id);
      instanceAccentColor.setHSL(
        0.075 + skinVariation * 0.035,
        0.2 + skinVariation * 0.09,
        0.59 + skinVariation * 0.11,
      );
      if (isBeliefOverlay && !agent.beliefId) instanceAccentColor.multiplyScalar(0.58);
      if (!alive) instanceAccentColor.multiplyScalar(0.3);
      population.head.setColorAt(index, instanceAccentColor);
      population.agentIds.push(agent.id);

      if (
        alive
        && agent.beliefId
        && agent.beliefColor
        && (isWorldOverlay || isBeliefOverlay)
      ) {
        const conviction = clamp(finite(agent.conviction), 0, 1);
        const haloScale = (0.88 + conviction * 0.28) * (isBeliefOverlay ? 1.18 : 1);
        instanceTransform.position.set(x, ground + 0.07, z);
        instanceTransform.rotation.set(-Math.PI / 2, 0, 0);
        instanceTransform.scale.setScalar(haloScale);
        instanceTransform.updateMatrix();
        population.beliefHalo.setMatrixAt(beliefIndex, instanceTransform.matrix);
        instanceColor.copy(safeColor(agent.beliefColor, 0xb89cff));
        if (selectedBeliefId && agent.beliefId !== selectedBeliefId) instanceColor.multiplyScalar(0.46);
        if (selectedBeliefId === agent.beliefId) instanceColor.lerp(instanceAccentColor.set(0xffffff), 0.18);
        population.beliefHalo.setColorAt(beliefIndex, instanceColor);
        population.beliefAgentIds.push(agent.id);
        beliefIndex += 1;
      }
    });

    population.body.count = instancedAgents.length;
    population.head.count = instancedAgents.length;
    population.beliefHalo.count = beliefIndex;
    population.body.instanceMatrix.needsUpdate = true;
    population.head.instanceMatrix.needsUpdate = true;
    population.beliefHalo.instanceMatrix.needsUpdate = true;
    // InstancedMesh caches its aggregate raycast bounds. Invalidate them after
    // moves so a formerly outlying agent remains exactly selectable.
    population.body.boundingSphere = null;
    population.head.boundingSphere = null;
    population.beliefHalo.boundingSphere = null;
    if (population.body.instanceColor) population.body.instanceColor.needsUpdate = true;
    if (population.head.instanceColor) population.head.instanceColor.needsUpdate = true;
    if (population.beliefHalo.instanceColor) population.beliefHalo.instanceColor.needsUpdate = true;
  };

  const syncAgents = (agents: VisualAgent[], immediate: boolean) => {
    const detailedIds = chooseDetailedAgentIds(agents);
    agentVisuals.forEach((visual, id) => {
      if (detailedIds.has(id)) return;
      scene.remove(visual.root);
      disposeObject(visual.root);
      agentVisuals.delete(id);
    });
    agents.forEach((agent) => {
      if (!detailedIds.has(agent.id)) return;
      let visual = agentVisuals.get(agent.id);
      let created = false;
      if (!visual) {
        visual = makeAgent(agent, activeProfile);
        agentVisuals.set(agent.id, visual);
        scene.add(visual.root);
        created = true;
      }
      applyAgentState(visual, agent, activeProfile);
      if (immediate || created) {
        visual.root.position.set(
          visual.target.x,
          terrainHeight(visual.target.x, visual.target.y, activeProfile),
          visual.target.y,
        );
      }
    });
    syncInstancedAgents(agents, detailedIds);
  };

  const syncResources = (resources: VisualResource[], immediate: boolean) => {
    const incoming = new Set(resources.map((resource) => resource.id));
    resourceVisuals.forEach((visual, id) => {
      if (incoming.has(id)) return;
      scene.remove(visual.root);
      disposeObject(visual.root);
      resourceVisuals.delete(id);
    });
    resources.forEach((resource) => {
      let visual = resourceVisuals.get(resource.id);
      if (visual && visual.kind !== resource.kind) {
        scene.remove(visual.root);
        disposeObject(visual.root);
        resourceVisuals.delete(resource.id);
        visual = undefined;
      }
      let created = false;
      if (!visual) {
        visual = makeResource(resource, activeProfile);
        resourceVisuals.set(resource.id, visual);
        scene.add(visual.root);
        created = true;
      }
      visual.target.set(
        sceneCoordinate(resource.position.x, activeProfile.halfSize),
        sceneCoordinate(resource.position.z, activeProfile.halfSize),
      );
      visual.targetRatio = clamp(finite(resource.amount) / Math.max(0.0001, finite(resource.max, 1)), 0, 1);
      if (immediate || created) {
        visual.currentRatio = visual.targetRatio;
        visual.root.position.set(
          visual.target.x,
          terrainHeight(visual.target.x, visual.target.y, activeProfile),
          visual.target.y,
        );
      }
    });
  };

  const syncBeliefs = (beliefs: VisualBelief[], immediate: boolean) => {
    const incoming = new Set(beliefs.map((belief) => belief.id));
    beliefVisuals.forEach((visual, id) => {
      if (incoming.has(id)) return;
      scene.remove(visual.root);
      disposeObject(visual.root);
      beliefVisuals.delete(id);
    });
    beliefs.forEach((belief) => {
      let visual = beliefVisuals.get(belief.id);
      let created = false;
      if (!visual) {
        visual = makeBelief(belief, activeProfile);
        beliefVisuals.set(belief.id, visual);
        scene.add(visual.root);
        created = true;
      }
      applyBeliefState(visual, belief, activeProfile);
      if (immediate || created) {
        visual.root.position.set(
          visual.target.x,
          terrainHeight(visual.target.x, visual.target.y, activeProfile),
          visual.target.y,
        );
        visual.influenceCurrent = visual.influenceTarget;
      }
    });
  };

  const syncDiplomacy = (links: VisualDiplomaticLink[]) => {
    const incoming = new Set(links.map((link) => link.id));
    linkVisuals.forEach((visual, id) => {
      if (incoming.has(id)) return;
      scene.remove(visual.root);
      disposeObject(visual.root);
      linkVisuals.delete(id);
    });
    links.forEach((link) => {
      let visual = linkVisuals.get(link.id);
      if (!visual) {
        visual = makeDiplomaticLink(link);
        linkVisuals.set(link.id, visual);
        scene.add(visual.root);
      }
      visual.fromCampId = link.fromCampId;
      visual.toCampId = link.toCampId;
      visual.relation = link.relation;
      visual.strength = clamp(finite(link.strength, 1), 0, 1);
      visual.hitTarget.userData.mapRelationKind = link.relation;
      visual.line.material.color.setHex(diplomacyColor(link.relation));
      visual.line.material.dashSize = link.relation === "trade" ? 1.2 : 0.72;
      visual.line.material.gapSize = link.relation === "hostile" ? 0.46 : 0.72;
    });
  };

  const syncWars = (wars: VisualWar[]) => {
    const incoming = new Set(wars.map((war) => war.id));
    warVisuals.forEach((visual, id) => {
      if (incoming.has(id)) return;
      scene.remove(visual.root);
      disposeObject(visual.root);
      warVisuals.delete(id);
    });
    wars.forEach((war) => {
      let visual = warVisuals.get(war.id);
      if (!visual) {
        visual = makeWar(war);
        warVisuals.set(war.id, visual);
        scene.add(visual.root);
      }
      visual.attackerCampId = war.attackerCampId;
      visual.defenderCampId = war.defenderCampId;
      visual.intensity = clamp(finite(war.intensity, 0.5), 0, 1);
    });
  };

  const setCameraMode = (mode: CameraMode) => {
    const effectiveMode = controlsPrimedForPointer && pointerGestureOwnsCamera ? "free" : mode;
    const shouldEnableControls = effectiveMode === "free" || controlsPrimedForPointer;
    if (effectiveMode === activeCameraMode && controls.enabled === shouldEnableControls) return;
    activeCameraMode = effectiveMode;
    controls.enabled = shouldEnableControls;
    if (effectiveMode === "free") {
      controls.target.copy(cameraTarget);
      controls.update();
    } else if (controlsPrimedForPointer) {
      controls.target.copy(cameraTarget);
    }
  };

  const syncWorld = (
    world: VisualWorld,
    nextSelectedAgentId: VisualId | null,
    nextSelectedCampId: VisualId | null,
    cameraMode: CameraMode,
    delta: number,
    immediate = false,
  ) => {
    const requestedHalf = clamp(finite(world.halfSize, DEFAULT_HALF_SIZE), 38, 220);
    if (finite(world.seed) !== activeProfile.seed || Math.abs(requestedHalf - activeProfile.halfSize) > 0.01) {
      rebuildStaticWorld(world.seed, requestedHalf);
      immediate = true;
    }
    selectedAgentId = nextSelectedAgentId;
    selectedCampId = nextSelectedCampId;
    selectedBeliefId = world.selectedBeliefId ?? null;
    activeOverlayMode = resolveOverlayMode(world.overlayMode);
    worldClockTarget = finite(world.elapsed) + clamp(finite(delta), 0, 0.25);
    if (immediate) worldClockVisual = finite(world.elapsed);
    syncCamps(world.camps ?? [], immediate);
    syncResources(world.resources ?? [], immediate);
    syncAgents(world.agents ?? [], immediate);
    syncBeliefs(world.beliefs ?? [], immediate);
    syncDiplomacy(world.diplomaticLinks ?? []);
    syncWars(world.wars ?? []);
    setCameraMode(cameraMode);
  };

  const nightSky = new THREE.Color(0x071218);
  const daySky = new THREE.Color(0x9bbcb1);
  const dawnSky = new THREE.Color(0xb77c68);
  const nightTop = new THREE.Color(0x040b15);
  const dayTop = new THREE.Color(0x3e829a);
  const nightHorizon = new THREE.Color(0x202d36);
  const dayHorizon = new THREE.Color(0xb8d1bd);
  const nightGround = new THREE.Color(0x0a1113);
  const dayGround = new THREE.Color(0x31443a);
  const nightHemisphere = new THREE.Color(0x51687b);
  const dayHemisphere = new THREE.Color(0xd6e9dc);
  const nightSun = new THREE.Color(0x7895bb);
  const daySun = new THREE.Color(0xffe9bd);
  const temporaryColor = new THREE.Color();

  const updateEnvironment = (delta: number) => {
    staticWorld.scenery.visible = activeOverlayMode === "world";
    worldClockVisual = damp(worldClockVisual, worldClockTarget, reducedMotion ? 20 : 4.8, delta);
    const phase = ((0.26 + worldClockVisual / DAY_LENGTH_SECONDS) % 1 + 1) % 1;
    const solarAngle = (phase - 0.25) * TAU;
    const altitude = Math.sin(solarAngle);
    const daylight = smoothstep(-0.18, 0.32, altitude);
    const horizonGlow = (1 - smoothstep(0.02, 0.56, Math.abs(altitude))) * (0.42 + daylight * 0.58);

    background.copy(nightSky).lerp(daySky, daylight);
    background.lerp(dawnSky, horizonGlow * 0.2);
    if (scene.fog instanceof THREE.FogExp2) {
      scene.fog.color.copy(background);
      scene.fog.density = THREE.MathUtils.lerp(0.0065, 0.00325, daylight) * (70 / activeProfile.halfSize);
    }
    const topUniform = staticWorld.skyMaterial.uniforms.topColor.value as THREE.Color;
    const horizonUniform = staticWorld.skyMaterial.uniforms.horizonColor.value as THREE.Color;
    const bottomUniform = staticWorld.skyMaterial.uniforms.bottomColor.value as THREE.Color;
    topUniform.copy(nightTop).lerp(dayTop, daylight);
    horizonUniform.copy(nightHorizon).lerp(dayHorizon, daylight).lerp(dawnSky, horizonGlow * 0.38);
    bottomUniform.copy(nightGround).lerp(dayGround, daylight);
    staticWorld.skyMaterial.uniforms.horizonGlow.value = 0.2 + horizonGlow * 0.58;

    hemisphere.color.copy(nightHemisphere).lerp(dayHemisphere, daylight);
    hemisphere.groundColor.copy(nightGround).lerp(dayGround, daylight);
    hemisphere.intensity = THREE.MathUtils.lerp(0.55, 1.72, daylight);
    sun.color.copy(nightSun).lerp(daySun, daylight);
    sun.intensity = THREE.MathUtils.lerp(0.18, 3.6, daylight);
    sun.position.set(
      cameraTarget.x + Math.cos(solarAngle) * activeProfile.halfSize * 0.9,
      Math.max(12, altitude * activeProfile.halfSize * 1.05),
      cameraTarget.z + Math.sin(solarAngle) * activeProfile.halfSize * 0.72,
    );
    sun.target.position.set(cameraTarget.x, 0, cameraTarget.z);
    moonFill.intensity = THREE.MathUtils.lerp(0.58, 0.1, daylight);
    staticWorld.starsMaterial.opacity = Math.pow(1 - daylight, 1.55) * 0.9;
    renderer.toneMappingExposure = THREE.MathUtils.lerp(0.78, 1.08, daylight);
    staticWorld.waterSurfaces.forEach((surface, index) => {
      surface.material.color.copy(temporaryColor.set(0x246278).lerp(new THREE.Color(0x45a9b7), daylight));
      surface.material.emissiveIntensity = THREE.MathUtils.lerp(0.58, 0.22, daylight);
      if (!reducedMotion) surface.rotation.z = Math.sin(animationTime * 0.13 + index) * 0.004;
    });
  };

  const updateResources = (delta: number) => {
    resourceVisuals.forEach((visual) => {
      visual.root.position.x = damp(visual.root.position.x, visual.target.x, 9, delta);
      visual.root.position.z = damp(visual.root.position.z, visual.target.y, 9, delta);
      visual.root.position.y = terrainHeight(visual.root.position.x, visual.root.position.z, activeProfile);
      visual.currentRatio = damp(visual.currentRatio, visual.targetRatio, 4.2, delta);
      const abundance = 0.22 + Math.sqrt(visual.currentRatio) * 0.78;
      const overlayScale = activeOverlayMode === "resources" ? 1.34 : 1;
      if (visual.kind === "wood") {
        visual.root.scale.set(
          (0.58 + abundance * 0.42) * overlayScale,
          (0.42 + abundance * 0.58) * overlayScale,
          (0.58 + abundance * 0.42) * overlayScale,
        );
        if (!reducedMotion) visual.accent.rotation.y = Math.sin(animationTime * 0.36 + visual.phase) * 0.035;
      } else if (visual.kind === "water") {
        const ripple = reducedMotion ? 1 : 1 + Math.sin(animationTime * 2 + visual.phase) * 0.035;
        visual.root.scale.set(
          abundance * ripple * overlayScale,
          (0.72 + abundance * 0.28) * overlayScale,
          abundance * ripple * overlayScale,
        );
        if (!reducedMotion) {
          visual.accent.rotation.y += delta * 0.65;
          visual.accent.position.y = 0.48 + Math.sin(animationTime * 2.2 + visual.phase) * 0.04;
        }
      } else if (visual.kind === "ore") {
        visual.root.scale.setScalar((0.42 + abundance * 0.58) * overlayScale);
        if (!reducedMotion) visual.accent.rotation.y += delta * 0.12;
      } else {
        visual.root.scale.setScalar((0.4 + abundance * 0.6) * overlayScale);
        if (!reducedMotion) visual.accent.rotation.y = Math.sin(animationTime * 0.72 + visual.phase) * 0.08;
      }
      const showResources = activeOverlayMode === "world" || activeOverlayMode === "resources";
      visual.root.visible = showResources && visual.currentRatio > 0.002;
      visual.abundanceRing.visible = activeOverlayMode === "resources" && visual.currentRatio > 0.002;
      if (visual.abundanceRing.visible) {
        const ringPulse = reducedMotion ? 1 : 1 + Math.sin(animationTime * 2.1 + visual.phase) * 0.045;
        visual.abundanceRing.scale.setScalar((1.1 + visual.currentRatio * 0.82) * ringPulse);
        visual.abundanceRing.material.opacity = 0.32 + visual.currentRatio * 0.58;
      }
    });
  };

  const updateAgents = (delta: number) => {
    agentVisuals.forEach((visual, id) => {
      visual.root.position.x = damp(visual.root.position.x, visual.target.x, 10, delta);
      visual.root.position.z = damp(visual.root.position.z, visual.target.y, 10, delta);
      visual.root.position.y = terrainHeight(visual.root.position.x, visual.root.position.z, activeProfile);
      const speed = visual.velocity.length();
      if (speed > 0.025) {
        visual.facing = dampAngle(visual.facing, Math.atan2(visual.velocity.x, visual.velocity.y), 10.5, delta);
      }
      visual.actor.rotation.y = visual.facing;

      const isSelected = id === selectedAgentId;
      const isWorldOverlay = activeOverlayMode === "world";
      const isBeliefOverlay = activeOverlayMode === "beliefs";
      const agentOverlayOpacity = isSelected
        ? 1
        : isWorldOverlay
          ? 1
          : isBeliefOverlay
            ? visual.beliefId ? 0.82 : 0.3
            : activeOverlayMode === "wars" ? 0.62 : 0.44;
      visual.body.material.opacity = (visual.alive ? 1 : 0.23) * agentOverlayOpacity;
      visual.head.material.opacity = (visual.alive ? 1 : 0.2) * agentOverlayOpacity;
      visual.selection.visible = isSelected;
      visual.label.visible = isSelected;
      visual.healthBack.visible = isSelected || (
        (isWorldOverlay || activeOverlayMode === "wars") && visual.alive && visual.health < 52
      );
      visual.healthFill.visible = visual.healthBack.visible;
      visual.direction.visible = visual.alive && speed > 0.03 && (isSelected || (isWorldOverlay && speed > 0.16));
      visual.trail.visible = isWorldOverlay && visual.alive && speed > 0.03;
      visual.trail.material.opacity = isSelected ? 0.3 : 0.075;
      const followsSelectedBelief = Boolean(selectedBeliefId && visual.beliefId === selectedBeliefId);
      visual.beliefHalo.visible = visual.alive && Boolean(visual.beliefId && visual.beliefColor) && (
        isWorldOverlay || isBeliefOverlay
      );
      if (visual.beliefHalo.visible) {
        const beliefPulse = reducedMotion ? 1 : 1 + Math.sin(animationTime * 2.7 + visual.phase) * 0.055;
        const overlayHaloScale = isBeliefOverlay ? 1.18 : 1;
        visual.beliefHalo.scale.setScalar((0.88 + visual.conviction * 0.28) * beliefPulse * overlayHaloScale);
        visual.beliefHalo.material.opacity = followsSelectedBelief
          ? 0.86
          : (isBeliefOverlay ? 0.42 : 0.18) + visual.conviction * (isBeliefOverlay ? 0.48 : 0.42);
      }

      const positionAttribute = visual.trail.geometry.getAttribute("position") as THREE.BufferAttribute;
      for (let index = 0; index < positionAttribute.count; index += 1) {
        const sourceIndex = Math.max(0, visual.trailPoints.length - positionAttribute.count + index);
        const point = visual.trailPoints[Math.min(sourceIndex, visual.trailPoints.length - 1)];
        const worldX = point?.x ?? visual.root.position.x;
        const worldZ = point?.z ?? visual.root.position.z;
        positionAttribute.setXYZ(
          index,
          worldX - visual.root.position.x,
          terrainHeight(worldX, worldZ, activeProfile) + 0.11 - visual.root.position.y,
          worldZ - visual.root.position.z,
        );
      }
      positionAttribute.needsUpdate = true;

      const pulse = reducedMotion ? 1 : 1 + Math.sin(animationTime * 4.4 + visual.phase) * 0.09;
      visual.selection.scale.setScalar(pulse);
      visual.selection.material.opacity = reducedMotion ? 0.84 : 0.68 + Math.sin(animationTime * 4.4 + visual.phase) * 0.2;
      const stride = !reducedMotion && visual.alive && speed > 0.03
        ? Math.sin(animationTime * 7.2 + visual.phase) * Math.min(0.05, speed * 0.04)
        : 0;
      visual.body.position.y = visual.alive ? 0.79 + stride : 0.31;
      visual.head.position.y = visual.alive ? 1.43 + stride : 0.38;
      visual.body.rotation.z = damp(visual.body.rotation.z, visual.alive ? 0 : Math.PI / 2, 7, delta);
      visual.head.rotation.z = visual.body.rotation.z;
      (Object.keys(visual.carry) as VisualResourceKind[]).forEach((kind, index) => {
        const item = visual.carry[kind];
        if (!reducedMotion) {
          item.position.y = index % 2 * 0.12 + Math.sin(animationTime * 2.8 + visual.phase + index) * 0.025;
          item.rotation.y += delta * (0.7 + index * 0.15);
        }
      });
    });
  };

  const updateCamps = (delta: number) => {
    campVisuals.forEach((visual, id) => {
      visual.root.position.x = damp(visual.root.position.x, visual.target.x, 8, delta);
      visual.root.position.z = damp(visual.root.position.z, visual.target.y, 8, delta);
      visual.root.position.y = terrainHeight(visual.root.position.x, visual.root.position.z, activeProfile);
      visual.territoryCurrent = damp(visual.territoryCurrent, visual.territoryTarget, 4, delta);
      const isSelected = id === selectedCampId;
      const followsSelectedBelief = Boolean(selectedBeliefId && visual.dominantBeliefId === selectedBeliefId);
      const isWorldOverlay = activeOverlayMode === "world";
      const isWarOverlay = activeOverlayMode === "wars";
      const isBeliefOverlay = activeOverlayMode === "beliefs";
      const isTerritoryOverlay = activeOverlayMode === "territories";
      const hasBelief = Boolean(visual.dominantBeliefId && visual.beliefColor);

      visual.territory.visible = isSelected;
      visual.territoryFill.visible = activeOverlayMode !== "resources" || isSelected;
      if (isTerritoryOverlay) {
        visual.territory.material.opacity = isSelected ? 1 : 0.9;
        visual.territoryFill.material.opacity = isSelected ? 0.24 : 0.16;
      } else if (isWarOverlay) {
        visual.territory.material.opacity = isSelected ? 0.82 : visual.underAttack ? 0.56 : 0.18;
        visual.territoryFill.material.opacity = isSelected ? 0.075 : visual.underAttack ? 0.065 : 0.014;
      } else if (isBeliefOverlay) {
        visual.territory.material.opacity = isSelected ? 0.68 : 0.11;
        visual.territoryFill.material.opacity = isSelected ? 0.06 : 0.008;
      } else if (activeOverlayMode === "alliances") {
        visual.territory.material.opacity = isSelected ? 0.78 : 0.25;
        visual.territoryFill.material.opacity = isSelected ? 0.07 : 0.018;
      } else if (activeOverlayMode === "resources") {
        visual.territory.material.opacity = isSelected ? 0.72 : 0;
        visual.territoryFill.material.opacity = isSelected ? 0.055 : 0;
      } else {
        visual.territory.material.opacity = isSelected ? 0.82 : 0.42;
        visual.territoryFill.material.opacity = isSelected ? 0.075 : 0.038;
      }

      const labelEmphasis = isTerritoryOverlay && !isSelected ? 1.06 : 1;
      visual.label.scale.set(
        (isSelected ? 8 : 7.3) * labelEmphasis,
        (isSelected ? 1.93 : 1.76) * labelEmphasis,
        1,
      );
      visual.attackRing.visible = visual.underAttack && (isWorldOverlay || isWarOverlay);
      visual.beliefRing.visible = hasBelief && (isWorldOverlay || isBeliefOverlay);
      visual.shrine.visible = hasBelief && visual.shrineLevel > 0.02 && (isWorldOverlay || isBeliefOverlay);
      if (visual.beliefRing.visible) {
        const beliefPulse = reducedMotion ? 1 : 1 + Math.sin(animationTime * 2.15 + visual.phase) * 0.025;
        visual.beliefRing.scale.setScalar(beliefPulse * (isBeliefOverlay ? 1.14 : 1));
        visual.beliefRing.material.opacity = followsSelectedBelief
          ? 0.92
          : clamp((isBeliefOverlay ? 0.75 : 0.48) - visual.beliefDiversity * 0.25, isBeliefOverlay ? 0.4 : 0.2, 0.75);
      }
      if (visual.attackRing.visible) {
        const attackPulse = reducedMotion ? 1 : 1 + Math.sin(animationTime * 5.8 + visual.phase) * 0.11;
        visual.attackRing.scale.setScalar(visual.territoryCurrent * attackPulse);
        const baseAttackOpacity = isWarOverlay ? 0.72 : 0.54;
        visual.attackRing.material.opacity = reducedMotion
          ? isWarOverlay ? 0.94 : 0.76
          : baseAttackOpacity + Math.sin(animationTime * 5.8 + visual.phase) * (isWarOverlay ? 0.2 : 0.27);
      }
      visual.flames.forEach((flame, index) => {
        if (!reducedMotion) {
          const flicker = 1 + Math.sin(animationTime * (8.2 + index) + visual.phase + index * 2) * 0.13;
          flame.scale.set(flicker, 0.92 + flicker * 0.1, flicker);
          flame.rotation.y += delta * (index === 0 ? 1.25 : -1.6);
        }
      });
      const overlayLightMultiplier = activeOverlayMode === "resources"
        ? 0.22
        : isBeliefOverlay || isTerritoryOverlay ? 0.58 : 1;
      visual.fireLight.intensity = ((visual.underAttack ? 5.4 : 2.8) + Math.min(visual.level, 5) * 0.28) * overlayLightMultiplier;
      if (!reducedMotion) {
        visual.banner.rotation.z = Math.sin(animationTime * 1.7 + visual.phase) * 0.035;
        visual.beacon.rotation.y += delta * 0.82;
        if (visual.shrine.visible) {
          visual.shrineBeacon.rotation.y += delta * (0.55 + visual.shrineLevel * 0.08);
          visual.shrineBeacon.position.y = 1.1 + Math.sin(animationTime * 1.9 + visual.phase) * 0.06;
        }
        visual.tiers[3].traverse((object) => {
          if (object.userData.techRingIndex !== undefined) {
            object.rotation.z += delta * (0.17 + Number(object.userData.techRingIndex) * 0.06);
          }
        });
      }
    });
  };

  const labelWorldPosition = new THREE.Vector3();
  const labelProjectedPosition = new THREE.Vector3();
  const updateCampLabels = () => {
    if (campVisuals.size === 0) return;
    if (activeOverlayMode === "resources") {
      campVisuals.forEach((visual, id) => {
        visual.label.visible = id === selectedCampId;
      });
      return;
    }

    const warParticipants = new Set<VisualId>();
    warVisuals.forEach((war) => {
      warParticipants.add(war.attackerCampId);
      warParticipants.add(war.defenderCampId);
    });
    const powerRanking = Array.from(campVisuals.entries()).sort((left, right) => (
      right[1].power - left[1].power ||
      right[1].population - left[1].population ||
      left[0].localeCompare(right[0])
    ));
    const topPowerCount = Math.min(6, Math.max(3, Math.ceil(Math.sqrt(powerRanking.length))));
    const topPowerRank = new Map(
      powerRanking.slice(0, topPowerCount).map(([id], index) => [id, index] as const),
    );

    const diplomacyParticipants = new Set<VisualId>();
    if (activeOverlayMode === "alliances") {
      linkVisuals.forEach((link) => {
        if (link.relation !== "hostile") {
          diplomacyParticipants.add(link.fromCampId);
          diplomacyParticipants.add(link.toCampId);
        }
      });
    }

    const candidates = Array.from(campVisuals.entries()).map(([id, visual]) => {
      const isSelected = id === selectedCampId;
      const isWarParticipant = visual.underAttack || warParticipants.has(id);
      const powerRank = topPowerRank.get(id);
      const isDiplomacyParticipant = diplomacyParticipants.has(id);
      const priority =
        (isSelected ? 1_000_000_000 : 0) +
        (isWarParticipant ? 100_000_000 : 0) +
        (powerRank !== undefined ? 10_000_000 - powerRank * 10_000 : 0) +
        (isDiplomacyParticipant ? 1_000_000 : 0) +
        visual.power * 100 + visual.population * 4 + visual.techLevel * 200;
      return { id, visual, isSelected, priority };
    }).sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id));

    const focus = activeCameraMode === "free" ? controls.target : cameraTarget;
    const distanceFromFocus = camera.position.distanceTo(focus);
    const nearDistance = activeProfile.halfSize * 0.18;
    const farDistance = activeProfile.halfSize * 1.5;
    const zoomProgress = 1 - clamp(
      (distanceFromFocus - nearDistance) / Math.max(1, farDistance - nearDistance),
      0,
      1,
    );
    const importantCount = candidates.reduce((count, candidate) => (
      count + (candidate.isSelected || warParticipants.has(candidate.id) || topPowerRank.has(candidate.id) ? 1 : 0)
    ), 0);
    const minimumBudget = Math.min(candidates.length, Math.max(6, importantCount));
    const overlayAllowance = activeOverlayMode === "territories" ? 2 : 0;
    const labelBudget = Math.min(
      candidates.length,
      Math.round(
        minimumBudget + overlayAllowance +
        (candidates.length - minimumBudget) * Math.pow(zoomProgress, 1.35),
      ),
    );

    const width = Math.max(1, renderer.domElement.clientWidth || mount.clientWidth);
    const height = Math.max(1, renderer.domElement.clientHeight || mount.clientHeight);
    const verticalFov = THREE.MathUtils.degToRad(camera.fov);
    const occupied: Array<{ left: number; right: number; top: number; bottom: number }> = [];
    let visibleCount = 0;
    camera.updateMatrixWorld();

    candidates.forEach(({ visual, isSelected }) => {
      visual.label.getWorldPosition(labelWorldPosition);
      labelProjectedPosition.copy(labelWorldPosition).project(camera);
      const withinView = labelProjectedPosition.z >= -1 && labelProjectedPosition.z <= 1 &&
        labelProjectedPosition.x >= -1.08 && labelProjectedPosition.x <= 1.08 &&
        labelProjectedPosition.y >= -1.08 && labelProjectedPosition.y <= 1.08;
      if (!withinView || (!isSelected && visibleCount >= labelBudget)) {
        visual.label.visible = false;
        return;
      }

      const screenX = (labelProjectedPosition.x * 0.5 + 0.5) * width;
      const screenY = (-labelProjectedPosition.y * 0.5 + 0.5) * height;
      const cameraDistance = Math.max(1, camera.position.distanceTo(labelWorldPosition));
      const pixelsPerWorldUnit = height / (2 * Math.tan(verticalFov / 2) * cameraDistance);
      const labelWidth = clamp(visual.label.scale.x * pixelsPerWorldUnit, 88, 260);
      const labelHeight = clamp(visual.label.scale.y * pixelsPerWorldUnit, 22, 68);
      const padding = isSelected ? 2 : 7;
      const bounds = {
        left: screenX - labelWidth / 2 - padding,
        right: screenX + labelWidth / 2 + padding,
        top: screenY - labelHeight / 2 - padding,
        bottom: screenY + labelHeight / 2 + padding,
      };
      const collides = occupied.some((placed) => !(
        bounds.right < placed.left ||
        bounds.left > placed.right ||
        bounds.bottom < placed.top ||
        bounds.top > placed.bottom
      ));
      visual.label.visible = isSelected || !collides;
      if (visual.label.visible) {
        occupied.push(bounds);
        visibleCount += 1;
      }
    });
  };

  const updateBeliefs = (delta: number) => {
    beliefVisuals.forEach((visual, id) => {
      visual.root.position.x = damp(visual.root.position.x, visual.target.x, 7, delta);
      visual.root.position.z = damp(visual.root.position.z, visual.target.y, 7, delta);
      visual.root.position.y = terrainHeight(visual.root.position.x, visual.root.position.z, activeProfile);
      visual.influenceCurrent = damp(visual.influenceCurrent, visual.influenceTarget, 3.2, delta);
      visual.influenceFill.scale.setScalar(visual.influenceCurrent);
      visual.influenceRing.scale.setScalar(visual.influenceCurrent);
      const isSelected = id === selectedBeliefId;
      const isWorldOverlay = activeOverlayMode === "world";
      const isBeliefOverlay = activeOverlayMode === "beliefs";
      visual.root.visible = isWorldOverlay || isBeliefOverlay || isSelected;
      const pulse = reducedMotion ? 1 : 1 + Math.sin(animationTime * 2.4 + visual.phase) * 0.07;
      visual.selectionRing.visible = isSelected;
      visual.selectionRing.scale.setScalar(1.42 * pulse);
      visual.label.visible = isSelected || (isBeliefOverlay && visual.active && visual.adherents > 0);
      visual.label.scale.set(isSelected ? 6.2 : 4.75, isSelected ? 1.6 : 1.22, 1);
      visual.influenceFill.visible = isBeliefOverlay && (visual.active || isSelected);
      visual.influenceFill.material.opacity = visual.active
        ? clamp(0.055 + Math.sqrt(visual.adherents) * 0.007, 0.055, 0.14)
        : 0.028;
      visual.influenceRing.visible = isWorldOverlay || isBeliefOverlay || isSelected;
      visual.influenceRing.material.opacity = visual.active
        ? isSelected ? 0.68 : isBeliefOverlay ? 0.52 : 0.2
        : isSelected ? 0.28 : isBeliefOverlay ? 0.14 : 0.08;
      visual.beacon.material.emissiveIntensity = visual.active
        ? isSelected ? 1.8 : isBeliefOverlay ? 1.35 : 0.8
        : 0.18;
      visual.root.scale.y = visual.active ? 1 : 0.78;
      if (!reducedMotion) {
        visual.beacon.rotation.y += delta * (isSelected ? 1.25 : 0.66);
        visual.beacon.position.y = 2.08 + Math.sin(animationTime * 1.75 + visual.phase) * 0.1;
      }
    });
  };

  const updateDiplomacy = () => {
    linkVisuals.forEach((visual) => {
      const fromCamp = campVisuals.get(visual.fromCampId);
      const toCamp = campVisuals.get(visual.toCampId);
      const relationMatchesOverlay = activeOverlayMode === "world" || (
        activeOverlayMode === "alliances"
          ? visual.relation === "alliance" || visual.relation === "trade"
          : activeOverlayMode === "wars" && visual.relation === "hostile"
      );
      visual.root.visible = Boolean(fromCamp && toCamp && relationMatchesOverlay);
      visual.hitTarget.visible = visual.root.visible;
      if (!fromCamp || !toCamp) return;
      connectionFrom.copy(campConnectionPoint(fromCamp));
      connectionTo.copy(campConnectionPoint(toCamp));
      const distance = connectionFrom.distanceTo(connectionTo);
      const curve = new THREE.QuadraticBezierCurve3(
        connectionFrom.clone(),
        connectionFrom.clone().lerp(connectionTo, 0.5).add(new THREE.Vector3(0, 1.7 + distance * 0.055, 0)),
        connectionTo.clone(),
      );
      writeCurveGeometry(visual.line.geometry, curve);
      visual.line.computeLineDistances();
      const flowPulse = reducedMotion ? 0 : Math.sin(animationTime * (visual.relation === "trade" ? 2.5 : 1.4)) * 0.045;
      const overlayBaseOpacity = activeOverlayMode === "alliances"
        ? visual.relation === "alliance" ? 0.76 : 0.6
        : activeOverlayMode === "wars"
          ? 0.7
          : visual.relation === "hostile" ? 0.4 : 0.28;
      const overlayStrength = activeOverlayMode === "world" ? 0.24 : 0.28;
      visual.line.material.opacity = clamp(overlayBaseOpacity + visual.strength * overlayStrength + flowPulse, 0, 1);
      visual.line.material.dashSize = activeOverlayMode === "alliances"
        ? visual.relation === "trade" ? 1.7 : 1.05
        : visual.relation === "trade" ? 1.2 : 0.72;
      visual.line.material.gapSize = activeOverlayMode === "alliances"
        ? visual.relation === "trade" ? 0.48 : 0.4
        : visual.relation === "hostile" ? 0.46 : 0.72;
    });

    warVisuals.forEach((visual) => {
      const attacker = campVisuals.get(visual.attackerCampId);
      const defender = campVisuals.get(visual.defenderCampId);
      const showWars = activeOverlayMode === "world" || activeOverlayMode === "wars";
      visual.root.visible = Boolean(attacker && defender && showWars);
      visual.hitTarget.visible = visual.root.visible;
      if (!attacker || !defender) return;
      connectionFrom.copy(campConnectionPoint(attacker));
      connectionTo.copy(campConnectionPoint(defender));
      const distance = connectionFrom.distanceTo(connectionTo);
      setQuadraticCurve(visual.curve, connectionFrom, connectionTo, 2.8 + distance * 0.09);
      writeCurveGeometry(visual.line.geometry, visual.curve);
      visual.line.computeLineDistances();
      const warOverlayBoost = activeOverlayMode === "wars" ? 0.23 : 0;
      visual.line.material.opacity = clamp(0.52 + visual.intensity * 0.42 + warOverlayBoost, 0, 1);
      visual.line.material.dashSize = (activeOverlayMode === "wars" ? 1.15 : 0.8) + visual.intensity * 0.8;
      visual.line.material.gapSize = 0.38 + Math.max(0, Math.sin(animationTime * 4.2 + visual.phase)) * 0.28;
      const progress = reducedMotion ? 0.56 : (animationTime * (0.14 + visual.intensity * 0.18) + visual.phase) % 1;
      visual.projectile.position.copy(visual.curve.getPoint(progress));
      visual.projectile.scale.setScalar((0.72 + visual.intensity * 0.7) * (activeOverlayMode === "wars" ? 1.32 : 1));
      const clashPosition = visual.curve.getPoint(0.58);
      visual.clash.position.copy(clashPosition);
      visual.clash.position.y = Math.max(
        terrainHeight(clashPosition.x, clashPosition.z, activeProfile) + 0.25,
        clashPosition.y - 1.2,
      );
      const pulse = reducedMotion ? 1 : 1 + Math.sin(animationTime * 7.5 + visual.phase * TAU) * 0.28;
      visual.clash.scale.setScalar(
        (0.72 + visual.intensity * 0.75) * pulse * (activeOverlayMode === "wars" ? 1.28 : 1),
      );
      visual.clash.material.opacity = reducedMotion
        ? activeOverlayMode === "wars" ? 0.94 : 0.7
        : clamp(
            (activeOverlayMode === "wars" ? 0.7 : 0.48) + Math.sin(animationTime * 7.5 + visual.phase) * 0.27,
            0,
            1,
          );
    });
  };

  const overviewFocus = (target: THREE.Vector3) => {
    if (campVisuals.size === 0) {
      target.set(0, terrainHeight(0, 0, activeProfile) + 0.6, 0);
      return;
    }
    target.set(0, 0, 0);
    campVisuals.forEach((camp) => target.add(camp.root.position));
    target.multiplyScalar(1 / campVisuals.size);
    target.y = terrainHeight(target.x, target.z, activeProfile) + 0.9;
  };

  const updateCamera = (delta: number) => {
    if (activeCameraMode === "free") {
      controls.target.x = clamp(controls.target.x, -activeProfile.halfSize, activeProfile.halfSize);
      controls.target.z = clamp(controls.target.z, -activeProfile.halfSize, activeProfile.halfSize);
      controls.target.y = clamp(controls.target.y, -1, 12);
      controls.update(delta);
      cameraTarget.copy(controls.target);
      return;
    }

    const selectedAgent = selectedAgentId ? agentVisuals.get(selectedAgentId) : undefined;
    const selectedCamp = selectedCampId ? campVisuals.get(selectedCampId) : undefined;
    if (activeCameraMode === "followAgent" && selectedAgent) {
      const direction = selectedAgent.velocity.lengthSq() > 0.001
        ? selectedAgent.velocity.clone().normalize()
        : new THREE.Vector2(Math.sin(selectedAgent.facing), Math.cos(selectedAgent.facing));
      desiredCamera.set(
        selectedAgent.root.position.x - direction.x * 7.8 + direction.y * 2.8,
        selectedAgent.root.position.y + 8.6,
        selectedAgent.root.position.z - direction.y * 7.8 - direction.x * 2.8,
      );
      desiredTarget.set(
        selectedAgent.root.position.x + direction.x * 1.45,
        selectedAgent.root.position.y + 0.95,
        selectedAgent.root.position.z + direction.y * 1.45,
      );
    } else if (activeCameraMode === "followCamp" && selectedCamp) {
      const angle = selectedCamp.phase + 0.64;
      const distance = clamp(15 + selectedCamp.territoryCurrent * 0.42, 17, 29);
      desiredCamera.set(
        selectedCamp.root.position.x + Math.cos(angle) * distance,
        selectedCamp.root.position.y + 15 + selectedCamp.territoryCurrent * 0.16,
        selectedCamp.root.position.z + Math.sin(angle) * distance,
      );
      desiredTarget.set(
        selectedCamp.root.position.x,
        selectedCamp.root.position.y + 1.2,
        selectedCamp.root.position.z,
      );
    } else {
      overviewFocus(desiredTarget);
      const distance = activeProfile.halfSize * 1.42;
      desiredCamera.set(
        desiredTarget.x + distance * 0.62,
        Math.max(52, activeProfile.halfSize * 1.02),
        desiredTarget.z + distance * 0.76,
      );
    }

    const cameraSpeed = reducedMotion ? 30 : activeCameraMode === "overview" ? 2.3 : 4.3;
    const targetSpeed = reducedMotion ? 30 : activeCameraMode === "overview" ? 3.6 : 6;
    camera.position.lerp(desiredCamera, 1 - Math.exp(-cameraSpeed * delta));
    cameraTarget.lerp(desiredTarget, 1 - Math.exp(-targetSpeed * delta));
    camera.lookAt(cameraTarget);
  };

  const resize = () => {
    if (disposed) return;
    const width = Math.max(1, mount.clientWidth);
    const height = Math.max(1, mount.clientHeight);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    const devicePixelRatio = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    renderer.setSize(width, height, false);
  };

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const activePointers = new Map<number, {
    startX: number;
    startY: number;
    pointerType: string;
    canSelect: boolean;
    dragged: boolean;
  }>();
  let gestureBlocksSelection = false;

  const setRayFromPointer = (event: PointerEvent) => {
    const rectangle = renderer.domElement.getBoundingClientRect();
    if (rectangle.width <= 0 || rectangle.height <= 0) return false;
    pointer.x = (event.clientX - rectangle.left) / rectangle.width * 2 - 1;
    pointer.y = -(event.clientY - rectangle.top) / rectangle.height * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    return true;
  };

  const objectAtPointer = (event: PointerEvent) => {
    if (!setRayFromPointer(event)) return { agentId: null, campId: null, beliefId: null, relation: null };
    const agentTargets = Array.from(agentVisuals.values()).flatMap((visual) => [visual.body, visual.head]);
    const agentHit = raycaster.intersectObjects(
      [...agentTargets, instancedPopulation.body, instancedPopulation.head],
      false,
    )[0];
    if (agentHit) {
      const isPopulationInstance = agentHit.object === instancedPopulation.body
        || agentHit.object === instancedPopulation.head;
      const agentId = isPopulationInstance && agentHit.instanceId !== undefined
        ? instancedPopulation.agentIds[agentHit.instanceId] ?? null
        : agentHit.object.userData.agentId as VisualId | null;
      if (agentId) return { agentId, campId: null, beliefId: null, relation: null };
    }
    const beliefTargets = Array.from(beliefVisuals.values()).map((visual) => visual.hitTarget);
    const beliefHit = raycaster.intersectObjects(beliefTargets, false)[0];
    if (beliefHit) {
      return { agentId: null, campId: null, beliefId: beliefHit.object.userData.beliefId as VisualId, relation: null };
    }
    const campTargets = Array.from(campVisuals.values()).map((visual) => visual.hitTarget);
    const campHit = raycaster.intersectObjects(campTargets, false)[0];
    if (campHit) {
      return {
        agentId: null,
        campId: campHit.object.userData.campId as VisualId,
        beliefId: null,
        relation: null,
      };
    }

    if (options.onRelationSelect) {
      const distanceFromFocus = camera.position.distanceTo(activeCameraMode === "free" ? controls.target : cameraTarget);
      raycaster.params.Line.threshold = clamp(distanceFromFocus * 0.012, 0.7, 3.2);
      const relationTargets = [
        ...Array.from(warVisuals.values())
          .filter((visual) => visual.root.visible && visual.hitTarget.visible)
          .map((visual) => visual.hitTarget),
        ...Array.from(linkVisuals.values())
          .filter((visual) => visual.root.visible && visual.hitTarget.visible)
          .map((visual) => visual.hitTarget),
      ];
      const relationHit = raycaster.intersectObjects(relationTargets, false)[0];
      if (relationHit) {
        const relationId = relationHit.object.userData.mapRelationId as VisualId;
        const relationKind = relationHit.object.userData.mapRelationKind as DiplomaticRelation | "war";
        const war = relationKind === "war" ? warVisuals.get(relationId) : undefined;
        const link = relationKind !== "war" ? linkVisuals.get(relationId) : undefined;
        const relation: MapRelationSelection | null = war
          ? {
              id: war.id,
              kind: "war",
              fromCampId: war.attackerCampId,
              toCampId: war.defenderCampId,
              intensity: war.intensity,
              clientX: event.clientX,
              clientY: event.clientY,
            }
          : link
            ? {
                id: link.id,
                kind: link.relation,
                fromCampId: link.fromCampId,
                toCampId: link.toCampId,
                strength: link.strength,
                clientX: event.clientX,
                clientY: event.clientY,
              }
            : null;
        if (relation) return { agentId: null, campId: null, beliefId: null, relation };
      }
    }
    return { agentId: null, campId: null, beliefId: null, relation: null };
  };

  const activateFreeCamera = () => {
    controls.enabled = true;
    if (controlsPrimedForPointer) pointerGestureOwnsCamera = true;
    if (activeCameraMode === "free") return;
    activeCameraMode = "free";
    controls.target.copy(cameraTarget);
    controls.update();
    options.onCameraModeChange?.("free");
  };

  // OrbitControls normally sees pointerdown before our bubble listener. Prime it in
  // capture phase so the very first drag/pinch is tracked, but do not leave the
  // automatic overview/follow camera until movement proves this is a gesture.
  const handlePointerDownCapture = () => {
    controlsPrimedForPointer = true;
    controls.enabled = true;
    if (activeCameraMode !== "free") {
      controls.target.copy(cameraTarget);
    }
  };

  const handlePointerDown = (event: PointerEvent) => {
    if (activePointers.size === 0) pointerGestureOwnsCamera = false;
    if (activePointers.size > 0) gestureBlocksSelection = true;
    activePointers.set(event.pointerId, {
      startX: event.clientX,
      startY: event.clientY,
      pointerType: event.pointerType,
      canSelect: event.pointerType === "touch" || event.button === 0,
      dragged: false,
    });
  };
  const handlePointerMove = (event: PointerEvent) => {
    const trackedPointer = activePointers.get(event.pointerId);
    if (trackedPointer) {
      const distance = Math.hypot(
        event.clientX - trackedPointer.startX,
        event.clientY - trackedPointer.startY,
      );
      const touchPointerCount = Array.from(activePointers.values())
        .filter((candidate) => candidate.pointerType === "touch").length;
      const isMultiTouchGesture = event.pointerType === "touch" && touchPointerCount > 1;
      if (distance > 6 || isMultiTouchGesture) {
        trackedPointer.dragged = true;
        gestureBlocksSelection = true;
        if (isMultiTouchGesture) {
          activePointers.forEach((candidate) => {
            candidate.dragged = true;
          });
        }
        activateFreeCamera();
      } else if (activeCameraMode !== "free") {
        // Keep OrbitControls' start coordinates, while preventing sub-threshold
        // movement from nudging an automatic camera before a tap is resolved.
        controls.enabled = false;
      }
    }
    if (event.pointerType === "mouse") {
      const hit = objectAtPointer(event);
      renderer.domElement.style.cursor = hit.agentId || hit.campId || hit.beliefId || hit.relation
        ? "pointer"
        : activeCameraMode === "free"
          ? activePointers.size > 0 ? "grabbing" : "grab"
          : "default";
    }
  };
  const handlePointerUp = (event: PointerEvent) => {
    const trackedPointer = activePointers.get(event.pointerId);
    if (!trackedPointer) return;
    const distance = Math.hypot(
      event.clientX - trackedPointer.startX,
      event.clientY - trackedPointer.startY,
    );
    const isOnlyPointer = activePointers.size === 1;
    const shouldSelect = isOnlyPointer &&
      trackedPointer.canSelect &&
      !trackedPointer.dragged &&
      !gestureBlocksSelection &&
      distance < 6;
    activePointers.delete(event.pointerId);
    if (shouldSelect) {
      const hit = objectAtPointer(event);
      if (hit.agentId) options.onAgentSelect(hit.agentId);
      else if (hit.campId) options.onCampSelect(hit.campId);
      else if (hit.beliefId) options.onBeliefSelect?.(hit.beliefId);
      else if (hit.relation) options.onRelationSelect?.(hit.relation);
    }
    if (activePointers.size === 0) {
      controlsPrimedForPointer = false;
      if (activeCameraMode !== "free") controls.enabled = false;
      gestureBlocksSelection = false;
      pointerGestureOwnsCamera = false;
    }
  };
  const handlePointerCancel = (event: PointerEvent) => {
    if (activePointers.has(event.pointerId)) gestureBlocksSelection = true;
    activePointers.delete(event.pointerId);
    if (activePointers.size === 0) {
      controlsPrimedForPointer = false;
      if (activeCameraMode !== "free") controls.enabled = false;
      gestureBlocksSelection = false;
      pointerGestureOwnsCamera = false;
    }
    renderer.domElement.style.cursor = activeCameraMode === "free" ? "grab" : "default";
  };
  const handlePointerLeave = (event: PointerEvent) => {
    if (!renderer.domElement.hasPointerCapture(event.pointerId)) handlePointerCancel(event);
  };
  const handleWheelIntent = () => activateFreeCamera();

  renderer.domElement.addEventListener("pointerdown", handlePointerDownCapture, { capture: true });
  renderer.domElement.addEventListener("pointerdown", handlePointerDown);
  renderer.domElement.addEventListener("pointermove", handlePointerMove);
  renderer.domElement.addEventListener("pointerup", handlePointerUp);
  renderer.domElement.addEventListener("pointercancel", handlePointerCancel);
  renderer.domElement.addEventListener("pointerleave", handlePointerLeave);
  renderer.domElement.addEventListener("wheel", handleWheelIntent, { passive: true, capture: true });

  let resizeObserver: ResizeObserver | null = null;
  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
  } else if (typeof window !== "undefined") {
    window.addEventListener("resize", resize);
  }

  const renderFrame = (delta: number) => {
    const safeDelta = clamp(finite(delta), 0, 0.1);
    animationTime += safeDelta;
    updateEnvironment(safeDelta);
    updateResources(safeDelta);
    updateAgents(safeDelta);
    updateCamps(safeDelta);
    updateBeliefs(safeDelta);
    updateDiplomacy();
    updateCamera(safeDelta);
    updateCampLabels();
    renderer.render(scene, camera);
  };

  syncWorld(initialWorld, null, null, "overview", 0, true);
  let lastSyncedWorld: VisualWorld | null = initialWorld;
  let lastSyncedAgentId: VisualId | null = null;
  let lastSyncedCampId: VisualId | null = null;
  let lastSyncedBeliefId: VisualId | null = initialWorld.selectedBeliefId ?? null;
  let lastSyncedOverlayMode: MapOverlayMode = resolveOverlayMode(initialWorld.overlayMode);
  let lastSyncedCameraMode: CameraMode = "overview";
  overviewFocus(cameraTarget);
  const initialDistance = activeProfile.halfSize * 1.42;
  camera.position.set(
    cameraTarget.x + initialDistance * 0.62,
    Math.max(52, activeProfile.halfSize * 1.02),
    cameraTarget.z + initialDistance * 0.76,
  );
  camera.lookAt(cameraTarget);
  resize();
  renderFrame(0);

  return {
    update(world, nextSelectedAgentId, nextSelectedCampId, cameraMode, delta) {
      if (disposed) return;
      if (
        world !== lastSyncedWorld ||
        nextSelectedAgentId !== lastSyncedAgentId ||
        nextSelectedCampId !== lastSyncedCampId ||
        (world.selectedBeliefId ?? null) !== lastSyncedBeliefId ||
        resolveOverlayMode(world.overlayMode) !== lastSyncedOverlayMode ||
        cameraMode !== lastSyncedCameraMode
      ) {
        syncWorld(world, nextSelectedAgentId, nextSelectedCampId, cameraMode, delta);
        lastSyncedWorld = world;
        lastSyncedAgentId = nextSelectedAgentId;
        lastSyncedCampId = nextSelectedCampId;
        lastSyncedBeliefId = world.selectedBeliefId ?? null;
        lastSyncedOverlayMode = resolveOverlayMode(world.overlayMode);
        lastSyncedCameraMode = cameraMode;
      }
      renderFrame(delta);
    },
    resize,
    dispose() {
      if (disposed) return;
      disposed = true;
      resizeObserver?.disconnect();
      if (!resizeObserver && typeof window !== "undefined") window.removeEventListener("resize", resize);
      renderer.domElement.removeEventListener("pointerdown", handlePointerDownCapture, true);
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.domElement.removeEventListener("pointermove", handlePointerMove);
      renderer.domElement.removeEventListener("pointerup", handlePointerUp);
      renderer.domElement.removeEventListener("pointercancel", handlePointerCancel);
      renderer.domElement.removeEventListener("pointerleave", handlePointerLeave);
      renderer.domElement.removeEventListener("wheel", handleWheelIntent, true);
      controls.dispose();
      disposeObject(scene);
      agentVisuals.clear();
      resourceVisuals.clear();
      campVisuals.clear();
      beliefVisuals.clear();
      linkVisuals.clear();
      warVisuals.clear();
      renderer.renderLists.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
