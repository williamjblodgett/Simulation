import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export interface VisualAgent {
  id: string;
  name: string;
  color: string;
  position: { x: number; z: number };
  velocity: { x: number; z: number };
  alive: boolean;
  health: number;
  inventory: { food: number; water: number; wood: number };
}

export interface VisualResource {
  id: string;
  kind: "food" | "water" | "wood";
  position: { x: number; z: number };
  amount: number;
  capacity: number;
}

export interface VisualWorld {
  seed: number;
  elapsed: number;
  agents: VisualAgent[];
  resources: VisualResource[];
  camp: { position: { x: number; z: number }; level: number };
}

export type CameraMode = "overview" | "follow" | "free";

export interface WorldScene {
  update(
    world: VisualWorld,
    selectedAgentId: string | null,
    cameraMode: CameraMode,
    delta: number,
  ): void;
  resize(): void;
  dispose(): void;
}

interface SceneOptions {
  onAgentSelect(id: string): void;
  onCameraModeChange?(mode: CameraMode): void;
}

interface AgentVisual {
  root: THREE.Group;
  body: THREE.Mesh<THREE.CapsuleGeometry, THREE.MeshStandardMaterial>;
  visor: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
  marker: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  directionLine: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  label: THREE.Sprite;
  labelMaterial: THREE.SpriteMaterial;
  carryItems: Record<"food" | "water" | "wood", THREE.Mesh>;
  target: THREE.Vector2;
  velocity: THREE.Vector2;
  facing: number;
  alive: boolean;
  health: number;
  name: string;
  color: string;
  phase: number;
}

interface ResourceVisual {
  root: THREE.Group;
  kind: VisualResource["kind"];
  target: THREE.Vector2;
  targetRatio: number;
  currentRatio: number;
  phase: number;
  accent: THREE.Object3D;
}

interface CampVisual {
  root: THREE.Group;
  tierOne: THREE.Group;
  tierTwo: THREE.Group;
  tierThree: THREE.Group;
  flames: THREE.Mesh[];
  fireLight: THREE.PointLight;
  target: THREE.Vector2;
  level: number;
}

const WORLD_SIZE = 64;
const WORLD_HALF = WORLD_SIZE / 2;
const EDGE_INSET = 0.8;
const DAY_LENGTH_SECONDS = 240;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const damp = (current: number, target: number, speed: number, delta: number) =>
  THREE.MathUtils.lerp(current, target, 1 - Math.exp(-speed * delta));

function dampAngle(current: number, target: number, speed: number, delta: number) {
  const difference = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + difference * (1 - Math.exp(-speed * delta));
}

function smoothstep(edge0: number, edge1: number, value: number) {
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
  let state = (Math.floor(seed * 9973) ^ 0x9e3779b9) >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let result = state;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function terrainHeight(x: number, z: number, seed: number) {
  const offset = seed * 0.017;
  const broad = Math.sin(x * 0.115 + offset) * Math.cos(z * 0.104 - offset * 0.7) * 0.82;
  const cross = Math.sin((x + z) * 0.19 - offset * 1.3) * 0.28;
  const detail = Math.cos(x * 0.37 - z * 0.23 + offset * 2.1) * 0.14;
  const distanceFromCamp = Math.hypot(x, z);
  const clearing = THREE.MathUtils.lerp(0.12, 1, smoothstep(4.2, 11, distanceFromCamp));
  const edgeRise = smoothstep(25, 32, Math.max(Math.abs(x), Math.abs(z))) * 0.44;
  return (broad + cross + detail) * clearing + edgeRise - 0.08;
}

function sceneCoordinate(value: number) {
  return clamp(Number.isFinite(value) ? value : 0, -WORLD_HALF + EDGE_INSET, WORLD_HALF - EDGE_INSET);
}

function safeColor(value: string, fallback = 0xc8f36b) {
  const color = new THREE.Color(fallback);
  try {
    color.set(value);
  } catch {
    color.set(fallback);
  }
  return color;
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
    if (!(object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points || object instanceof THREE.Sprite)) {
      return;
    }
    if (object.geometry instanceof THREE.BufferGeometry) geometries.add(object.geometry);
    const objectMaterials: THREE.Material[] = Array.isArray(object.material)
      ? object.material
      : [object.material];
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
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function makeNameTexture(name: string, color: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    roundedRectangle(context, 10, 12, 492, 100, 30);
    context.fillStyle = "rgba(5, 12, 11, 0.88)";
    context.fill();
    context.strokeStyle = color;
    context.lineWidth = 5;
    context.stroke();
    context.beginPath();
    context.arc(55, 62, 13, 0, Math.PI * 2);
    context.fillStyle = color;
    context.fill();
    context.fillStyle = "#f4f8ed";
    context.font = "700 43px ui-sans-serif, system-ui, sans-serif";
    context.textAlign = "left";
    context.textBaseline = "middle";
    context.fillText(name.slice(0, 18).toUpperCase(), 86, 64, 382);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function makeTerrainGeometry(seed: number) {
  const geometry = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 48, 48);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.getAttribute("position") as THREE.BufferAttribute;
  const colors = new Float32Array(positions.count * 3);
  const low = new THREE.Color(0x183b2c);
  const middle = new THREE.Color(0x31583a);
  const high = new THREE.Color(0x6d7650);
  const color = new THREE.Color();

  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const z = positions.getZ(index);
    const height = terrainHeight(x, z, seed);
    positions.setY(index, height);
    const normalized = clamp((height + 1.3) / 2.8, 0, 1);
    color.copy(low).lerp(middle, smoothstep(0, 0.54, normalized));
    if (normalized > 0.54) color.lerp(high, smoothstep(0.54, 1, normalized) * 0.58);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }

  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function makeContourGroup(seed: number) {
  const group = new THREE.Group();
  const material = new THREE.LineBasicMaterial({
    color: 0xbad780,
    transparent: true,
    opacity: 0.105,
    depthWrite: false,
  });

  [6, 12, 18, 24, 29].forEach((radius) => {
    const points: THREE.Vector3[] = [];
    for (let index = 0; index < 128; index += 1) {
      const angle = (index / 128) * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      points.push(new THREE.Vector3(x, terrainHeight(x, z, seed) + 0.055, z));
    }
    const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), material.clone());
    line.renderOrder = 2;
    group.add(line);
  });
  material.dispose();
  return group;
}

function makeBoundary(seed: number) {
  const points: THREE.Vector3[] = [];
  const half = WORLD_HALF - 0.22;
  const steps = 32;
  for (let index = 0; index <= steps; index += 1) {
    const offset = -half + (index / steps) * half * 2;
    points.push(new THREE.Vector3(offset, terrainHeight(offset, -half, seed) + 0.14, -half));
  }
  for (let index = 1; index <= steps; index += 1) {
    const offset = -half + (index / steps) * half * 2;
    points.push(new THREE.Vector3(half, terrainHeight(half, offset, seed) + 0.14, offset));
  }
  for (let index = 1; index <= steps; index += 1) {
    const offset = half - (index / steps) * half * 2;
    points.push(new THREE.Vector3(offset, terrainHeight(offset, half, seed) + 0.14, half));
  }
  for (let index = 1; index < steps; index += 1) {
    const offset = half - (index / steps) * half * 2;
    points.push(new THREE.Vector3(-half, terrainHeight(-half, offset, seed) + 0.14, offset));
  }
  const boundary = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color: 0x94c86d, transparent: true, opacity: 0.4 }),
  );
  boundary.renderOrder = 3;
  return boundary;
}

function makeAgent(agent: VisualAgent, seed: number): AgentVisual {
  const color = safeColor(agent.color);
  const root = new THREE.Group();
  root.name = `agent:${agent.id}`;

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.16,
    roughness: 0.38,
    metalness: 0.04,
    transparent: true,
  });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.72, 5, 9), bodyMaterial);
  body.position.y = 0.91;
  body.userData.agentId = agent.id;
  root.add(body);

  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.1, 0.055),
    new THREE.MeshBasicMaterial({ color: 0xf5fae9 }),
  );
  visor.position.set(0, 1.12, 0.325);
  visor.userData.agentId = agent.id;
  root.add(visor);

  const markerGeometry = new THREE.BufferGeometry();
  markerGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([-0.17, 0, 0.48, 0.17, 0, 0.48, 0, 0, 0.84], 3),
  );
  markerGeometry.computeVertexNormals();
  const marker = new THREE.Mesh(
    markerGeometry,
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.78, side: THREE.DoubleSide }),
  );
  marker.position.y = 0.075;
  root.add(marker);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.52, 0.67, 36),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.065;
  ring.renderOrder = 5;
  root.add(ring);

  const directionGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0.65),
    new THREE.Vector3(0, 0, 2.25),
  ]);
  const directionLine = new THREE.Line(
    directionGeometry,
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.58, depthWrite: false }),
  );
  directionLine.position.y = 0.09;
  root.add(directionLine);

  const labelMaterial = new THREE.SpriteMaterial({
    map: makeNameTexture(agent.name, agent.color),
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const label = new THREE.Sprite(labelMaterial);
  label.position.y = 2.23;
  label.scale.set(3.7, 0.925, 1);
  label.renderOrder = 20;
  root.add(label);

  const carryGroup = new THREE.Group();
  carryGroup.position.set(0, 1.48, -0.38);
  root.add(carryGroup);
  const carryItems = {
    food: new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.115, 0),
      new THREE.MeshStandardMaterial({ color: 0xe95f6f, emissive: 0x48141c, roughness: 0.5 }),
    ),
    water: new THREE.Mesh(
      new THREE.OctahedronGeometry(0.125, 0),
      new THREE.MeshStandardMaterial({ color: 0x55d8e8, emissive: 0x123c4a, roughness: 0.3 }),
    ),
    wood: new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.15, 0.15),
      new THREE.MeshStandardMaterial({ color: 0xc18a54, roughness: 0.9 }),
    ),
  };
  carryItems.food.position.x = -0.16;
  carryItems.wood.position.x = 0.16;
  Object.values(carryItems).forEach((item) => carryGroup.add(item));

  setShadows(root, true, false);
  ring.castShadow = false;
  marker.castShadow = false;
  directionLine.castShadow = false;

  return {
    root,
    body,
    visor,
    marker,
    ring,
    directionLine,
    label,
    labelMaterial,
    carryItems,
    target: new THREE.Vector2(sceneCoordinate(agent.position.x), sceneCoordinate(agent.position.z)),
    velocity: new THREE.Vector2(agent.velocity.x, agent.velocity.z),
    facing: Math.atan2(agent.velocity.x, agent.velocity.z || 1),
    alive: agent.alive,
    health: agent.health,
    name: agent.name,
    color: agent.color,
    phase: hashString(agent.id) * Math.PI * 2 + seed * 0.01,
  };
}

function updateAgentLabel(visual: AgentVisual, agent: VisualAgent) {
  if (visual.name === agent.name && visual.color === agent.color) return;
  visual.labelMaterial.map?.dispose();
  visual.labelMaterial.map = makeNameTexture(agent.name, agent.color);
  visual.labelMaterial.needsUpdate = true;
  visual.name = agent.name;
  visual.color = agent.color;
}

function applyAgentState(visual: AgentVisual, agent: VisualAgent) {
  visual.target.set(sceneCoordinate(agent.position.x), sceneCoordinate(agent.position.z));
  visual.velocity.set(
    Number.isFinite(agent.velocity.x) ? agent.velocity.x : 0,
    Number.isFinite(agent.velocity.z) ? agent.velocity.z : 0,
  );
  visual.alive = agent.alive;
  visual.health = clamp(agent.health, 0, 100);
  updateAgentLabel(visual, agent);

  const baseColor = safeColor(agent.color);
  const healthRatio = visual.health / 100;
  visual.body.material.color.copy(baseColor).multiplyScalar(0.5 + healthRatio * 0.5);
  visual.body.material.emissive.copy(baseColor);
  visual.body.material.emissiveIntensity = 0.05 + healthRatio * 0.13;
  visual.body.material.opacity = visual.alive ? 1 : 0.32;
  visual.visor.material.opacity = visual.alive ? 1 : 0.25;
  visual.visor.material.transparent = !visual.alive;
  visual.marker.material.color.copy(baseColor);
  visual.ring.material.color.copy(baseColor);
  visual.directionLine.material.color.copy(baseColor);

  const inventoryEntries = [
    ["food", agent.inventory.food],
    ["water", agent.inventory.water],
    ["wood", agent.inventory.wood],
  ] as const;
  inventoryEntries.forEach(([kind, amount]) => {
    const item = visual.carryItems[kind];
    const safeAmount = Math.max(0, Number.isFinite(amount) ? amount : 0);
    item.visible = safeAmount > 0.02 && visual.alive;
    const scale = 0.72 + clamp(Math.sqrt(safeAmount) / 4, 0, 0.75);
    item.scale.setScalar(scale);
  });
}

function makeFoodResource(id: string) {
  const root = new THREE.Group();
  const stemMaterial = new THREE.MeshStandardMaterial({ color: 0x285b39, roughness: 0.95 });
  const leafMaterial = new THREE.MeshStandardMaterial({ color: 0x3f8650, roughness: 0.88 });
  const berryMaterial = new THREE.MeshStandardMaterial({
    color: 0xe75b6f,
    emissive: 0x39131b,
    emissiveIntensity: 0.35,
    roughness: 0.4,
  });
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.58, 5), stemMaterial);
  stem.position.y = 0.3;
  root.add(stem);
  const leafPositions = [
    [-0.25, 0.53, 0],
    [0.2, 0.6, 0.13],
    [0.04, 0.72, -0.18],
  ];
  leafPositions.forEach(([x, y, z]) => {
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), leafMaterial.clone());
    leaf.scale.set(1, 0.68, 0.8);
    leaf.position.set(x, y, z);
    root.add(leaf);
  });
  const berries = new THREE.Group();
  for (let index = 0; index < 6; index += 1) {
    const angle = (index / 6) * Math.PI * 2 + hashString(`${id}:${index}`);
    const berry = new THREE.Mesh(new THREE.IcosahedronGeometry(0.095, 0), berryMaterial.clone());
    berry.position.set(Math.cos(angle) * 0.31, 0.61 + (index % 2) * 0.17, Math.sin(angle) * 0.25);
    berries.add(berry);
  }
  root.add(berries);
  return { root, accent: berries };
}

function makeWaterResource() {
  const root = new THREE.Group();
  const pool = new THREE.Mesh(
    new THREE.CylinderGeometry(0.72, 0.82, 0.11, 12),
    new THREE.MeshStandardMaterial({
      color: 0x3fb7cc,
      emissive: 0x123d49,
      emissiveIntensity: 0.72,
      roughness: 0.2,
      metalness: 0.08,
      transparent: true,
      opacity: 0.9,
    }),
  );
  pool.position.y = 0.06;
  root.add(pool);
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.72, 0.105, 5, 14),
    new THREE.MeshStandardMaterial({ color: 0x738078, roughness: 1 }),
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.1;
  root.add(rim);
  const spring = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.22, 0),
    new THREE.MeshStandardMaterial({
      color: 0x8ce8f0,
      emissive: 0x42b9ca,
      emissiveIntensity: 0.82,
      transparent: true,
      opacity: 0.88,
    }),
  );
  spring.position.y = 0.49;
  root.add(spring);
  return { root, accent: spring };
}

function makeWoodResource() {
  const root = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.24, 1.35, 7),
    new THREE.MeshStandardMaterial({ color: 0x765438, roughness: 1 }),
  );
  trunk.position.y = 0.68;
  root.add(trunk);
  const crown = new THREE.Group();
  const foliageMaterial = new THREE.MeshStandardMaterial({ color: 0x2f6941, roughness: 0.92 });
  const lower = new THREE.Mesh(new THREE.ConeGeometry(0.82, 1.42, 7), foliageMaterial);
  lower.position.y = 1.55;
  crown.add(lower);
  const upper = new THREE.Mesh(new THREE.ConeGeometry(0.61, 1.2, 7), foliageMaterial.clone());
  upper.position.y = 2.22;
  crown.add(upper);
  root.add(crown);
  return { root, accent: crown };
}

function makeResource(resource: VisualResource): ResourceVisual {
  const constructed = resource.kind === "food"
    ? makeFoodResource(resource.id)
    : resource.kind === "water"
      ? makeWaterResource()
      : makeWoodResource();
  constructed.root.name = `resource:${resource.id}`;
  constructed.root.rotation.y = hashString(resource.id) * Math.PI * 2;
  setShadows(constructed.root, true, true);
  const ratio = clamp(resource.amount / Math.max(resource.capacity, 0.0001), 0, 1);
  return {
    root: constructed.root,
    kind: resource.kind,
    target: new THREE.Vector2(sceneCoordinate(resource.position.x), sceneCoordinate(resource.position.z)),
    targetRatio: ratio,
    currentRatio: ratio,
    phase: hashString(resource.id) * Math.PI * 2,
    accent: constructed.accent,
  };
}

function makeCamp(): CampVisual {
  const root = new THREE.Group();
  root.name = "camp";

  const clearing = new THREE.Mesh(
    new THREE.CylinderGeometry(3.45, 3.58, 0.1, 20),
    new THREE.MeshStandardMaterial({ color: 0x5a563d, roughness: 1, transparent: true, opacity: 0.82 }),
  );
  clearing.position.y = 0.025;
  clearing.receiveShadow = true;
  root.add(clearing);

  const stoneMaterial = new THREE.MeshStandardMaterial({ color: 0x74776a, roughness: 0.98 });
  for (let index = 0; index < 11; index += 1) {
    const angle = (index / 11) * Math.PI * 2;
    const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.19, 0), stoneMaterial.clone());
    stone.scale.set(1.15, 0.65, 0.9);
    stone.position.set(Math.cos(angle) * 0.72, 0.16, Math.sin(angle) * 0.72);
    stone.rotation.y = angle;
    root.add(stone);
  }

  const logMaterial = new THREE.MeshStandardMaterial({ color: 0x5f3927, roughness: 1 });
  [-Math.PI / 4, Math.PI / 4].forEach((rotation) => {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 1, 7), logMaterial.clone());
    log.rotation.z = Math.PI / 2;
    log.rotation.y = rotation;
    log.position.y = 0.2;
    root.add(log);
  });

  const flames: THREE.Mesh[] = [];
  const outerFlame = new THREE.Mesh(
    new THREE.ConeGeometry(0.32, 0.95, 7),
    new THREE.MeshBasicMaterial({ color: 0xff8b38, transparent: true, opacity: 0.9 }),
  );
  outerFlame.position.y = 0.62;
  root.add(outerFlame);
  flames.push(outerFlame);
  const innerFlame = new THREE.Mesh(
    new THREE.ConeGeometry(0.18, 0.63, 6),
    new THREE.MeshBasicMaterial({ color: 0xffe895, transparent: true, opacity: 0.94 }),
  );
  innerFlame.position.y = 0.55;
  root.add(innerFlame);
  flames.push(innerFlame);
  const fireLight = new THREE.PointLight(0xff8d49, 2.7, 12, 2);
  fireLight.position.y = 1.1;
  fireLight.castShadow = false;
  root.add(fireLight);

  const tierOne = new THREE.Group();
  const canvasMaterial = new THREE.MeshStandardMaterial({ color: 0xa88050, roughness: 0.92, side: THREE.DoubleSide });
  const tent = new THREE.Mesh(new THREE.ConeGeometry(1.5, 1.72, 4), canvasMaterial);
  tent.position.set(-1.75, 0.89, 0.35);
  tent.rotation.y = Math.PI / 4;
  tent.scale.z = 0.77;
  tierOne.add(tent);
  const tentDoor = new THREE.Mesh(
    new THREE.PlaneGeometry(0.6, 0.86),
    new THREE.MeshBasicMaterial({ color: 0x30251d, side: THREE.DoubleSide }),
  );
  tentDoor.position.set(-0.68, 0.54, 0.35);
  tentDoor.rotation.y = Math.PI / 2;
  tierOne.add(tentDoor);
  root.add(tierOne);

  const tierTwo = new THREE.Group();
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 1.68, 2.45),
    new THREE.MeshStandardMaterial({ color: 0x725335, roughness: 0.96 }),
  );
  cabin.position.set(-1.72, 0.88, 0.35);
  tierTwo.add(cabin);
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(2.45, 1.15, 4),
    new THREE.MeshStandardMaterial({ color: 0x34452e, roughness: 0.95 }),
  );
  roof.position.set(-1.72, 2.25, 0.35);
  roof.rotation.y = Math.PI / 4;
  roof.scale.z = 0.72;
  tierTwo.add(roof);
  const door = new THREE.Mesh(
    new THREE.PlaneGeometry(0.66, 1.05),
    new THREE.MeshStandardMaterial({ color: 0x30251d, roughness: 1, side: THREE.DoubleSide }),
  );
  door.position.set(-0.105, 0.64, 0.35);
  door.rotation.y = Math.PI / 2;
  tierTwo.add(door);
  const chimney = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 1.25, 0.34),
    new THREE.MeshStandardMaterial({ color: 0x62645d, roughness: 1 }),
  );
  chimney.position.set(-2.45, 2.24, 0.72);
  tierTwo.add(chimney);
  root.add(tierTwo);

  const tierThree = new THREE.Group();
  const timberMaterial = new THREE.MeshStandardMaterial({ color: 0x80613e, roughness: 1 });
  [[1.55, 1.15], [2.9, 1.15], [1.55, 2.5], [2.9, 2.5]].forEach(([x, z]) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 3.1, 6), timberMaterial.clone());
    post.position.set(x, 1.55, z);
    tierThree.add(post);
  });
  const lookout = new THREE.Mesh(
    new THREE.CylinderGeometry(1.22, 1.34, 0.34, 8),
    new THREE.MeshStandardMaterial({ color: 0x6e5438, roughness: 0.94 }),
  );
  lookout.position.set(2.22, 3.02, 1.82);
  tierThree.add(lookout);
  const lookoutRoof = new THREE.Mesh(
    new THREE.ConeGeometry(1.45, 0.85, 8),
    new THREE.MeshStandardMaterial({ color: 0x30462f, roughness: 0.94 }),
  );
  lookoutRoof.position.set(2.22, 3.82, 1.82);
  tierThree.add(lookoutRoof);
  const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 2.1, 5), timberMaterial.clone());
  flagPole.position.set(2.22, 4.52, 1.82);
  tierThree.add(flagPole);
  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(0.82, 0.42),
    new THREE.MeshBasicMaterial({ color: 0xc7f36b, side: THREE.DoubleSide }),
  );
  flag.position.set(2.62, 5.05, 1.82);
  tierThree.add(flag);
  root.add(tierThree);

  setShadows(root, true, true);
  flames.forEach((flame) => {
    flame.castShadow = false;
    flame.receiveShadow = false;
  });

  return {
    root,
    tierOne,
    tierTwo,
    tierThree,
    flames,
    fireLight,
    target: new THREE.Vector2(),
    level: -1,
  };
}

function setCampLevel(camp: CampVisual, level: number) {
  const safeLevel = Math.max(0, Math.floor(level));
  camp.level = safeLevel;
  camp.tierOne.visible = safeLevel === 1;
  camp.tierTwo.visible = safeLevel >= 2;
  camp.tierThree.visible = safeLevel >= 3;
}

export function createWorldScene(
  mount: HTMLElement,
  initialWorld: VisualWorld,
  options: SceneOptions,
): WorldScene {
  const scene = new THREE.Scene();
  const background = new THREE.Color(0x07100f);
  scene.background = background;
  scene.fog = new THREE.FogExp2(background.clone(), 0.012);

  const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 260);
  camera.position.set(41, 45, 49);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.style.display = "block";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  renderer.domElement.style.touchAction = "none";
  renderer.domElement.style.cursor = "default";
  renderer.domElement.setAttribute("role", "img");
  renderer.domElement.setAttribute("aria-label", "Live three-dimensional Wildgrid habitat");
  mount.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enabled = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.minDistance = 5;
  controls.maxDistance = 105;
  controls.minPolarAngle = 0.18;
  controls.maxPolarAngle = Math.PI * 0.475;
  controls.screenSpacePanning = false;
  controls.target.set(0, 0.5, 0);

  const hemisphere = new THREE.HemisphereLight(0xc4dfd2, 0x102018, 1.7);
  scene.add(hemisphere);
  const sun = new THREE.DirectionalLight(0xffecc2, 3.2);
  sun.position.set(-24, 42, 28);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -38;
  sun.shadow.camera.right = 38;
  sun.shadow.camera.top = 38;
  sun.shadow.camera.bottom = -38;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 120;
  sun.shadow.bias = -0.00065;
  sun.shadow.normalBias = 0.035;
  scene.add(sun, sun.target);
  const moonFill = new THREE.DirectionalLight(0x7394bd, 0.26);
  moonFill.position.set(24, 20, -28);
  scene.add(moonFill);

  let activeSeed = initialWorld.seed;
  const terrainMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.98,
    metalness: 0,
    flatShading: true,
  });
  const terrain = new THREE.Mesh(makeTerrainGeometry(activeSeed), terrainMaterial);
  terrain.receiveShadow = true;
  terrain.name = "terrain";
  scene.add(terrain);

  const wire = new THREE.Mesh(
    terrain.geometry.clone(),
    new THREE.MeshBasicMaterial({
      color: 0x9dbb72,
      wireframe: true,
      transparent: true,
      opacity: 0.048,
      depthWrite: false,
    }),
  );
  wire.position.y = 0.025;
  wire.renderOrder = 1;
  scene.add(wire);

  let contours = makeContourGroup(activeSeed);
  scene.add(contours);
  let boundary = makeBoundary(activeSeed);
  scene.add(boundary);

  const underlay = new THREE.Mesh(
    new THREE.CircleGeometry(135, 64),
    new THREE.MeshStandardMaterial({ color: 0x0a1712, roughness: 1 }),
  );
  underlay.rotation.x = -Math.PI / 2;
  underlay.position.y = -1.25;
  underlay.receiveShadow = true;
  scene.add(underlay);

  const grass = new THREE.InstancedMesh(
    new THREE.ConeGeometry(0.075, 0.34, 3),
    new THREE.MeshStandardMaterial({ color: 0x5a7e46, roughness: 1 }),
    190,
  );
  grass.receiveShadow = false;
  grass.castShadow = false;
  scene.add(grass);
  const rocks = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(0.24, 0),
    new THREE.MeshStandardMaterial({ color: 0x61685d, roughness: 1 }),
    42,
  );
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  scene.add(rocks);

  const starsGeometry = new THREE.BufferGeometry();
  const starRandom = seededRandom(activeSeed + 8191);
  const starPositions = new Float32Array(210 * 3);
  for (let index = 0; index < 210; index += 1) {
    const angle = starRandom() * Math.PI * 2;
    const radius = 55 + starRandom() * 62;
    starPositions[index * 3] = Math.cos(angle) * radius;
    starPositions[index * 3 + 1] = 24 + starRandom() * 58;
    starPositions[index * 3 + 2] = Math.sin(angle) * radius;
  }
  starsGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
  const starsMaterial = new THREE.PointsMaterial({
    color: 0xdff0e5,
    size: 0.42,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    fog: false,
  });
  const stars = new THREE.Points(starsGeometry, starsMaterial);
  scene.add(stars);

  const scatterDecorations = (seed: number) => {
    const random = seededRandom(seed + 413);
    const transform = new THREE.Object3D();
    for (let index = 0; index < grass.count; index += 1) {
      let x = random() * WORLD_SIZE - WORLD_HALF;
      let z = random() * WORLD_SIZE - WORLD_HALF;
      if (Math.hypot(x, z) < 4.8) {
        x += x < 0 ? -4.8 : 4.8;
        z += z < 0 ? -2.2 : 2.2;
      }
      x = sceneCoordinate(x);
      z = sceneCoordinate(z);
      const scale = 0.55 + random() * 1.2;
      transform.position.set(x, terrainHeight(x, z, seed) + 0.16 * scale, z);
      transform.rotation.set(0, random() * Math.PI * 2, (random() - 0.5) * 0.14);
      transform.scale.set(scale, scale, scale);
      transform.updateMatrix();
      grass.setMatrixAt(index, transform.matrix);
    }
    grass.instanceMatrix.needsUpdate = true;

    for (let index = 0; index < rocks.count; index += 1) {
      const angle = random() * Math.PI * 2;
      const radius = 13 + random() * 18;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const scale = 0.55 + random() * 1.55;
      transform.position.set(x, terrainHeight(x, z, seed) + 0.12 * scale, z);
      transform.rotation.set(random() * 0.5, random() * Math.PI * 2, random() * 0.5);
      transform.scale.set(scale * 1.1, scale * 0.65, scale);
      transform.updateMatrix();
      rocks.setMatrixAt(index, transform.matrix);
    }
    rocks.instanceMatrix.needsUpdate = true;
  };
  scatterDecorations(activeSeed);

  const camp = makeCamp();
  scene.add(camp.root);

  const agentVisuals = new Map<string, AgentVisual>();
  const resourceVisuals = new Map<string, ResourceVisual>();
  let selectedAgentId: string | null = initialWorld.agents[0]?.id ?? null;
  let activeCameraMode: CameraMode = "overview";
  let worldClockTarget = initialWorld.elapsed;
  let worldClockVisual = initialWorld.elapsed;
  let disposed = false;
  let animationTime = performance.now() / 1000;

  const rebuildTerrain = (seed: number) => {
    activeSeed = seed;
    terrain.geometry.dispose();
    terrain.geometry = makeTerrainGeometry(seed);
    wire.geometry.dispose();
    wire.geometry = terrain.geometry.clone();
    scene.remove(contours);
    disposeObject(contours);
    contours = makeContourGroup(seed);
    scene.add(contours);
    scene.remove(boundary);
    disposeObject(boundary);
    boundary = makeBoundary(seed);
    scene.add(boundary);
    scatterDecorations(seed);
  };

  const syncAgents = (agents: VisualAgent[], immediate = false) => {
    const incoming = new Set(agents.map((agent) => agent.id));
    agentVisuals.forEach((visual, id) => {
      if (incoming.has(id)) return;
      scene.remove(visual.root);
      disposeObject(visual.root);
      agentVisuals.delete(id);
    });

    agents.forEach((agent) => {
      let visual = agentVisuals.get(agent.id);
      if (!visual) {
        visual = makeAgent(agent, activeSeed);
        agentVisuals.set(agent.id, visual);
        scene.add(visual.root);
        immediate = true;
      }
      applyAgentState(visual, agent);
      if (immediate) {
        visual.root.position.set(
          visual.target.x,
          terrainHeight(visual.target.x, visual.target.y, activeSeed),
          visual.target.y,
        );
      }
    });
  };

  const syncResources = (resources: VisualResource[], immediate = false) => {
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
      if (!visual) {
        visual = makeResource(resource);
        resourceVisuals.set(resource.id, visual);
        scene.add(visual.root);
        immediate = true;
      }
      visual.target.set(sceneCoordinate(resource.position.x), sceneCoordinate(resource.position.z));
      visual.targetRatio = clamp(resource.amount / Math.max(resource.capacity, 0.0001), 0, 1);
      if (immediate) {
        visual.currentRatio = visual.targetRatio;
        visual.root.position.set(
          visual.target.x,
          terrainHeight(visual.target.x, visual.target.y, activeSeed),
          visual.target.y,
        );
      }
    });
  };

  const setCameraMode = (mode: CameraMode) => {
    if (mode === activeCameraMode) return;
    activeCameraMode = mode;
    controls.enabled = mode === "free";
    if (controls.enabled) {
      controls.target.copy(cameraTarget);
      controls.update();
    }
  };

  const syncWorld = (
    world: VisualWorld,
    nextSelectedId: string | null,
    cameraMode: CameraMode,
    delta: number,
    immediate = false,
  ) => {
    if (world.seed !== activeSeed) rebuildTerrain(world.seed);
    selectedAgentId = nextSelectedId;
    worldClockTarget = world.elapsed + clamp(Number.isFinite(delta) ? delta : 0, 0, 0.25);
    if (immediate) worldClockVisual = world.elapsed;
    syncResources(world.resources, immediate);
    syncAgents(world.agents, immediate);
    camp.target.set(sceneCoordinate(world.camp.position.x), sceneCoordinate(world.camp.position.z));
    if (immediate) {
      camp.root.position.set(
        camp.target.x,
        terrainHeight(camp.target.x, camp.target.y, activeSeed),
        camp.target.y,
      );
    }
    if (camp.level !== Math.max(0, Math.floor(world.camp.level))) setCampLevel(camp, world.camp.level);
    setCameraMode(cameraMode);
  };

  const cameraTarget = new THREE.Vector3(0, 0.7, 0);
  const desiredCamera = new THREE.Vector3();
  const desiredTarget = new THREE.Vector3();

  syncWorld(initialWorld, selectedAgentId, "overview", 0, true);
  cameraTarget.set(camp.root.position.x, camp.root.position.y + 0.65, camp.root.position.z);
  camera.position.set(camp.root.position.x + 41, 45, camp.root.position.z + 49);
  camera.lookAt(cameraTarget);

  const nightSky = new THREE.Color(0x06100f);
  const daySky = new THREE.Color(0x9fc2b5);
  const dawnSky = new THREE.Color(0xa9795d);
  const daySun = new THREE.Color(0xffebc0);
  const nightSun = new THREE.Color(0x8da5ca);
  const dayHemisphere = new THREE.Color(0xd0e3d4);
  const nightHemisphere = new THREE.Color(0x526b77);
  const dayGround = new THREE.Color(0x27351f);
  const nightGround = new THREE.Color(0x08110e);
  const temporaryColor = new THREE.Color();

  const updateEnvironment = (delta: number) => {
    worldClockVisual = damp(worldClockVisual, worldClockTarget, 5.5, delta);
    const phase = ((0.28 + worldClockVisual / DAY_LENGTH_SECONDS) % 1 + 1) % 1;
    const solarAngle = (phase - 0.25) * Math.PI * 2;
    const altitude = Math.sin(solarAngle);
    const daylight = clamp(0.5 + altitude * 0.5, 0, 1);
    const horizonGlow = (1 - smoothstep(0.03, 0.48, Math.abs(altitude))) * (0.25 + daylight * 0.75);

    background.copy(nightSky).lerp(daySky, daylight);
    if (horizonGlow > 0) background.lerp(dawnSky, horizonGlow * 0.22);
    if (scene.fog instanceof THREE.FogExp2) {
      scene.fog.color.copy(background);
      scene.fog.density = THREE.MathUtils.lerp(0.0145, 0.0082, daylight);
    }
    temporaryColor.copy(nightHemisphere).lerp(dayHemisphere, daylight);
    hemisphere.color.copy(temporaryColor);
    hemisphere.groundColor.copy(nightGround).lerp(dayGround, daylight);
    hemisphere.intensity = THREE.MathUtils.lerp(0.75, 1.82, daylight);
    sun.color.copy(nightSun).lerp(daySun, daylight);
    sun.intensity = THREE.MathUtils.lerp(0.32, 3.35, daylight);
    sun.position.set(
      Math.cos(solarAngle) * 48,
      Math.max(7, altitude * 48),
      Math.sin(solarAngle) * 35,
    );
    sun.position.x += camp.root.position.x;
    sun.position.z += camp.root.position.z;
    sun.target.position.set(camp.root.position.x, 0, camp.root.position.z);
    moonFill.intensity = THREE.MathUtils.lerp(0.62, 0.08, daylight);
    starsMaterial.opacity = Math.pow(1 - daylight, 1.65) * 0.86;
    renderer.toneMappingExposure = THREE.MathUtils.lerp(0.78, 1.08, daylight);
    camp.fireLight.intensity = THREE.MathUtils.lerp(4.2, 1.5, daylight) + Math.min(camp.level, 3) * 0.28;
  };

  const updateResources = (delta: number, time: number) => {
    resourceVisuals.forEach((visual) => {
      visual.root.position.x = damp(visual.root.position.x, visual.target.x, 9, delta);
      visual.root.position.z = damp(visual.root.position.z, visual.target.y, 9, delta);
      visual.root.position.y = terrainHeight(visual.root.position.x, visual.root.position.z, activeSeed);
      visual.currentRatio = damp(visual.currentRatio, visual.targetRatio, 4.5, delta);
      const abundance = 0.28 + Math.sqrt(visual.currentRatio) * 0.72;
      if (visual.kind === "wood") {
        visual.root.scale.set(0.62 + abundance * 0.38, 0.46 + abundance * 0.54, 0.62 + abundance * 0.38);
        visual.accent.rotation.y = Math.sin(time * 0.34 + visual.phase) * 0.035;
      } else if (visual.kind === "water") {
        const ripple = 1 + Math.sin(time * 2.1 + visual.phase) * 0.035;
        visual.root.scale.set(abundance * ripple, 0.72 + abundance * 0.28, abundance * ripple);
        visual.accent.rotation.y += delta * 0.62;
        visual.accent.position.y = 0.48 + Math.sin(time * 2.4 + visual.phase) * 0.045;
      } else {
        visual.root.scale.setScalar(abundance);
        visual.accent.rotation.y = Math.sin(time * 0.8 + visual.phase) * 0.12;
      }
      visual.root.visible = visual.currentRatio > 0.004;
    });
  };

  const updateAgents = (delta: number, time: number) => {
    agentVisuals.forEach((visual, id) => {
      visual.root.position.x = damp(visual.root.position.x, visual.target.x, 10.5, delta);
      visual.root.position.z = damp(visual.root.position.z, visual.target.y, 10.5, delta);
      visual.root.position.y = terrainHeight(visual.root.position.x, visual.root.position.z, activeSeed);
      const speed = visual.velocity.length();
      if (speed > 0.025) {
        const targetFacing = Math.atan2(visual.velocity.x, visual.velocity.y);
        visual.facing = dampAngle(visual.facing, targetFacing, 11, delta);
      }
      visual.root.rotation.y = visual.facing;

      const isSelected = id === selectedAgentId;
      visual.ring.visible = isSelected;
      visual.label.visible = isSelected;
      visual.directionLine.visible = isSelected && visual.alive && speed > 0.025;
      visual.marker.visible = visual.alive && speed > 0.025;
      const pulse = 1 + Math.sin(time * 4.6 + visual.phase) * 0.095;
      visual.ring.scale.setScalar(pulse);
      visual.ring.material.opacity = 0.7 + Math.sin(time * 4.6 + visual.phase) * 0.22;
      visual.labelMaterial.opacity = 0.9 + Math.sin(time * 2.5 + visual.phase) * 0.08;
      const stride = visual.alive && speed > 0.025 ? Math.sin(time * 7 + visual.phase) * 0.045 : 0;
      visual.body.position.y = visual.alive ? 0.91 + stride : 0.34;
      visual.body.rotation.z = damp(visual.body.rotation.z, visual.alive ? 0 : Math.PI / 2, 8, delta);
      visual.visor.position.y = visual.alive ? 1.12 + stride : 0.35;
      visual.visor.rotation.z = visual.body.rotation.z;

      const positionAttribute = visual.directionLine.geometry.getAttribute("position") as THREE.BufferAttribute;
      const lineLength = 1.55 + Math.min(speed, 3) * 0.52;
      positionAttribute.setXYZ(1, 0, 0, lineLength);
      positionAttribute.needsUpdate = true;
      Object.values(visual.carryItems).forEach((item, index) => {
        item.position.y = Math.sin(time * 3 + visual.phase + index * 1.7) * 0.035;
        item.rotation.y += delta * (0.8 + index * 0.18);
      });
    });
  };

  const updateCamp = (delta: number, time: number) => {
    camp.root.position.x = damp(camp.root.position.x, camp.target.x, 9, delta);
    camp.root.position.z = damp(camp.root.position.z, camp.target.y, 9, delta);
    camp.root.position.y = terrainHeight(camp.root.position.x, camp.root.position.z, activeSeed);
    camp.flames.forEach((flame, index) => {
      const flicker = 1 + Math.sin(time * (8.5 + index) + index * 2.3) * 0.13;
      flame.scale.set(flicker * (index === 0 ? 1 : 0.92), 0.92 + flicker * 0.1, flicker);
      flame.rotation.y += delta * (index === 0 ? 1.3 : -1.8);
    });
  };

  const updateCamera = (delta: number) => {
    if (activeCameraMode === "free") {
      controls.target.x = clamp(controls.target.x, -WORLD_HALF, WORLD_HALF);
      controls.target.z = clamp(controls.target.z, -WORLD_HALF, WORLD_HALF);
      controls.update(delta);
      return;
    }

    const selected = selectedAgentId ? agentVisuals.get(selectedAgentId) : undefined;
    if (activeCameraMode === "follow" && selected) {
      const direction = selected.velocity.lengthSq() > 0.001
        ? selected.velocity.clone().normalize()
        : new THREE.Vector2(Math.sin(selected.facing), Math.cos(selected.facing));
      desiredCamera.set(
        selected.root.position.x - direction.x * 7.2 + direction.y * 2.2,
        selected.root.position.y + 7.7,
        selected.root.position.z - direction.y * 7.2 - direction.x * 2.2,
      );
      desiredTarget.set(
        selected.root.position.x + direction.x * 1.25,
        selected.root.position.y + 0.92,
        selected.root.position.z + direction.y * 1.25,
      );
      camera.position.lerp(desiredCamera, 1 - Math.exp(-4.2 * delta));
      cameraTarget.lerp(desiredTarget, 1 - Math.exp(-6.2 * delta));
    } else {
      desiredCamera.set(camp.root.position.x + 41, 45, camp.root.position.z + 49);
      desiredTarget.set(camp.root.position.x, camp.root.position.y + 0.65, camp.root.position.z);
      camera.position.lerp(desiredCamera, 1 - Math.exp(-2.6 * delta));
      cameraTarget.lerp(desiredTarget, 1 - Math.exp(-4.4 * delta));
    }
    camera.lookAt(cameraTarget);
  };

  const resize = () => {
    if (disposed) return;
    const width = Math.max(1, mount.clientWidth);
    const height = Math.max(1, mount.clientHeight);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    const devicePixelRatio = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8));
    renderer.setSize(width, height, false);
  };

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let pointerDown: { x: number; y: number } | null = null;

  const agentAtPointer = (event: PointerEvent) => {
    const rectangle = renderer.domElement.getBoundingClientRect();
    if (rectangle.width <= 0 || rectangle.height <= 0) return null;
    pointer.x = ((event.clientX - rectangle.left) / rectangle.width) * 2 - 1;
    pointer.y = -((event.clientY - rectangle.top) / rectangle.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const targets = Array.from(agentVisuals.values()).flatMap((visual) => [visual.body, visual.visor]);
    const hit = raycaster.intersectObjects(targets, false)[0];
    return hit?.object.userData.agentId as string | undefined ?? null;
  };

  const handlePointerDown = (event: PointerEvent) => {
    pointerDown = { x: event.clientX, y: event.clientY };
  };
  const handlePointerMove = (event: PointerEvent) => {
    renderer.domElement.style.cursor = agentAtPointer(event) ? "pointer" : activeCameraMode === "free" ? "grab" : "default";
  };
  const handlePointerUp = (event: PointerEvent) => {
    if (!pointerDown) return;
    const distance = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y);
    pointerDown = null;
    if (distance < 6) {
      const id = agentAtPointer(event);
      if (id) options.onAgentSelect(id);
    } else if (activeCameraMode !== "free") {
      options.onCameraModeChange?.("free");
    }
  };
  const handlePointerCancel = () => {
    pointerDown = null;
  };
  const handleWheelIntent = () => {
    if (activeCameraMode !== "free") options.onCameraModeChange?.("free");
  };
  const handleControlStart = () => options.onCameraModeChange?.("free");

  renderer.domElement.addEventListener("pointerdown", handlePointerDown);
  renderer.domElement.addEventListener("pointermove", handlePointerMove);
  renderer.domElement.addEventListener("pointerup", handlePointerUp);
  renderer.domElement.addEventListener("pointercancel", handlePointerCancel);
  renderer.domElement.addEventListener("pointerleave", handlePointerCancel);
  renderer.domElement.addEventListener("wheel", handleWheelIntent, { passive: true });
  controls.addEventListener("start", handleControlStart);

  let resizeObserver: ResizeObserver | null = null;
  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
  } else if (typeof window !== "undefined") {
    window.addEventListener("resize", resize);
  }
  resize();

  const renderFrame = (delta: number) => {
    const safeDelta = clamp(Number.isFinite(delta) ? delta : 0, 0, 0.1);
    animationTime += safeDelta;
    updateEnvironment(safeDelta);
    updateResources(safeDelta, animationTime);
    updateAgents(safeDelta, animationTime);
    updateCamp(safeDelta, animationTime);
    updateCamera(safeDelta);
    renderer.render(scene, camera);
  };
  renderFrame(0);

  return {
    update(world, nextSelectedAgentId, cameraMode, delta) {
      if (disposed) return;
      syncWorld(world, nextSelectedAgentId, cameraMode, delta);
      renderFrame(delta);
    },
    resize,
    dispose() {
      if (disposed) return;
      disposed = true;
      resizeObserver?.disconnect();
      if (!resizeObserver && typeof window !== "undefined") window.removeEventListener("resize", resize);
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.domElement.removeEventListener("pointermove", handlePointerMove);
      renderer.domElement.removeEventListener("pointerup", handlePointerUp);
      renderer.domElement.removeEventListener("pointercancel", handlePointerCancel);
      renderer.domElement.removeEventListener("pointerleave", handlePointerCancel);
      renderer.domElement.removeEventListener("wheel", handleWheelIntent);
      controls.removeEventListener("start", handleControlStart);
      controls.dispose();
      disposeObject(scene);
      agentVisuals.clear();
      resourceVisuals.clear();
      renderer.renderLists.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
