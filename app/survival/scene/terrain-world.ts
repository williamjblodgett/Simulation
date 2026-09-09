import * as THREE from "three";
import type { HabitatPoint, HabitatTerrainVisual, HabitatWaterFeature } from "./types";

export interface TerrainWorld {
  group: THREE.Group;
  heightAt(point: HabitatPoint): number;
  waterHeight(feature: HabitatWaterFeature): number;
  dispose(): void;
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const smoothstep = (from: number, to: number, value: number) => {
  const t = clamp01((value - from) / (to - from));
  return t * t * (3 - 2 * t);
};

function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function terrainNoise(x: number, z: number, seed: number) {
  const offsetA = (seed % 997) * 0.017;
  const offsetB = (seed % 577) * 0.029;
  return (
    Math.sin(x * 0.095 + offsetA) * 0.48 +
    Math.cos(z * 0.082 - offsetB) * 0.34 +
    Math.sin((x + z) * 0.051 + offsetB) * 0.18
  );
}

function baseTerrainHeight(terrain: HabitatTerrainVisual, x: number, z: number) {
  const halfSize = Math.max(12, terrain.halfSize);
  const radius = Math.max(8, terrain.islandRadius ?? halfSize * 0.82);
  const elevation = Math.max(0.5, terrain.elevationScale ?? 4);
  const radial = Math.sqrt((x / radius) ** 2 + (z / (radius * 0.82)) ** 2);
  const islandMask = 1 - smoothstep(0.68, 1.05, radial);
  const northernRidge = Math.max(0, 1 - Math.abs((x + radius * 0.18) / (radius * 0.6)));
  const ridgeBand = Math.exp(-(((z + radius * 0.34) / (radius * 0.24)) ** 2));
  const ridge = northernRidge * ridgeBand * elevation * 0.54;
  const rolling = terrainNoise(x, z, terrain.seed) * elevation * 0.22;
  const centerBasin = -Math.exp(-((x / (radius * 0.34)) ** 2 + (z / (radius * 0.32)) ** 2)) * elevation * 0.13;
  return -0.46 + islandMask * (1.05 + elevation * 0.22 + rolling + ridge + centerBasin);
}

export function terrainWaterHeight(terrain: HabitatTerrainVisual, feature: HabitatWaterFeature) {
  return baseTerrainHeight(terrain, feature.position.x, feature.position.z) - 0.22;
}

export function terrainHeightAt(terrain: HabitatTerrainVisual, point: HabitatPoint) {
  if (typeof point.y === "number") return point.y;
  let height = baseTerrainHeight(terrain, point.x, point.z);

  for (const feature of terrain.freshwater) {
    const rotation = feature.rotation ?? 0;
    const dx = point.x - feature.position.x;
    const dz = point.z - feature.position.z;
    const localX = Math.cos(rotation) * dx + Math.sin(rotation) * dz;
    const localZ = -Math.sin(rotation) * dx + Math.cos(rotation) * dz;
    const distance = Math.sqrt(
      (localX / Math.max(0.5, feature.radiusX)) ** 2 +
        (localZ / Math.max(0.5, feature.radiusZ)) ** 2,
    );
    const depression = 1 - smoothstep(0.78, 1.16, distance);
    const waterLevel = terrainWaterHeight(terrain, feature);
    height = THREE.MathUtils.lerp(height, waterLevel - 0.38, depression);
  }

  return height;
}

function isInsideOpenArea(terrain: HabitatTerrainVisual, x: number, z: number) {
  if (
    terrain.clearings?.some(
      (clearing) => Math.hypot(x - clearing.position.x, z - clearing.position.z) < clearing.radius,
    )
  ) {
    return true;
  }
  return terrain.freshwater.some((feature) => {
    const dx = (x - feature.position.x) / Math.max(0.5, feature.radiusX + 2.5);
    const dz = (z - feature.position.z) / Math.max(0.5, feature.radiusZ + 2.5);
    return dx * dx + dz * dz < 1;
  });
}

function buildGround(terrain: HabitatTerrainVisual) {
  const halfSize = Math.max(12, terrain.halfSize);
  const segments = 68;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const lowColor = new THREE.Color("#556f46");
  const grassColor = new THREE.Color("#6e8750");
  const highColor = new THREE.Color("#7f8161");
  const sandColor = new THREE.Color("#a99368");

  for (let row = 0; row <= segments; row += 1) {
    const z = -halfSize + (row / segments) * halfSize * 2;
    for (let column = 0; column <= segments; column += 1) {
      const x = -halfSize + (column / segments) * halfSize * 2;
      const y = terrainHeightAt(terrain, { x, z });
      positions.push(x, y, z);
      const heightMix = clamp01((y - 0.2) / Math.max(2, terrain.elevationScale ?? 4));
      const radial = Math.sqrt(x * x + (z / 0.82) ** 2) / Math.max(8, terrain.islandRadius ?? halfSize * 0.82);
      const color = new THREE.Color();
      if (radial > 0.82 || y < 0.3) {
        color.copy(sandColor).lerp(lowColor, clamp01((0.34 - y) * 1.2));
      } else {
        color.copy(grassColor).lerp(highColor, heightMix * 0.75);
      }
      const variation = terrainNoise(x * 1.7, z * 1.7, terrain.seed + 41) * 0.035;
      color.offsetHSL(0, variation, variation);
      colors.push(color.r, color.g, color.b);
    }
  }

  for (let row = 0; row < segments; row += 1) {
    for (let column = 0; column < segments; column += 1) {
      const a = row * (segments + 1) + column;
      const b = a + 1;
      const c = a + segments + 1;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.93,
    metalness: 0,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.name = "habitat-terrain";
  return mesh;
}

function buildScenery(terrain: HabitatTerrainVisual) {
  const group = new THREE.Group();
  group.name = "decorative-scenery";
  const halfSize = Math.max(12, terrain.halfSize);
  const radius = Math.max(8, terrain.islandRadius ?? halfSize * 0.82);
  const random = seededRandom(terrain.seed ^ 0x8af35c1);
  const vegetationCount = Math.round(THREE.MathUtils.lerp(35, 190, clamp01(terrain.vegetationDensity ?? 0.62)));
  const rockCount = Math.round(THREE.MathUtils.lerp(12, 72, clamp01(terrain.rockDensity ?? 0.38)));

  const trunkGeometry = new THREE.CylinderGeometry(0.16, 0.24, 1.6, 6);
  const crownGeometry = new THREE.ConeGeometry(0.82, 2.5, 7);
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: "#67513d", roughness: 1 });
  const crownMaterial = new THREE.MeshStandardMaterial({ color: "#315c43", roughness: 0.96 });
  const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, vegetationCount);
  const crowns = new THREE.InstancedMesh(crownGeometry, crownMaterial, vegetationCount);
  trunks.name = "instanced-tree-trunks";
  crowns.name = "instanced-tree-crowns";
  trunks.castShadow = true;
  trunks.receiveShadow = true;
  crowns.castShadow = true;

  const dummy = new THREE.Object3D();
  let placedTrees = 0;
  let attempts = 0;
  while (placedTrees < vegetationCount && attempts < vegetationCount * 20) {
    attempts += 1;
    const angle = random() * Math.PI * 2;
    const distance = Math.sqrt(random()) * radius * 0.88;
    const x = Math.cos(angle) * distance;
    const z = Math.sin(angle) * distance * 0.82;
    if (isInsideOpenArea(terrain, x, z)) continue;
    const y = terrainHeightAt(terrain, { x, z });
    if (y < 0.35) continue;
    const scale = 0.68 + random() * 0.72;
    dummy.position.set(x, y + 0.8 * scale, z);
    dummy.rotation.set(0, random() * Math.PI * 2, 0);
    dummy.scale.set(scale, scale, scale);
    dummy.updateMatrix();
    trunks.setMatrixAt(placedTrees, dummy.matrix);
    dummy.position.y = y + (1.55 + 1.1) * scale;
    dummy.rotation.y += random() * 0.25;
    dummy.updateMatrix();
    crowns.setMatrixAt(placedTrees, dummy.matrix);
    placedTrees += 1;
  }
  trunks.count = placedTrees;
  crowns.count = placedTrees;
  trunks.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
  group.add(trunks, crowns);

  const rockGeometry = new THREE.DodecahedronGeometry(0.55, 0);
  const rockMaterial = new THREE.MeshStandardMaterial({ color: "#69716d", roughness: 0.9 });
  const rocks = new THREE.InstancedMesh(rockGeometry, rockMaterial, rockCount);
  rocks.name = "instanced-landscape-rocks";
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  let placedRocks = 0;
  attempts = 0;
  while (placedRocks < rockCount && attempts < rockCount * 15) {
    attempts += 1;
    const angle = random() * Math.PI * 2;
    const distance = Math.sqrt(random()) * radius * 0.94;
    const x = Math.cos(angle) * distance;
    const z = Math.sin(angle) * distance * 0.82;
    if (isInsideOpenArea(terrain, x, z)) continue;
    const y = terrainHeightAt(terrain, { x, z });
    if (y < 0.25) continue;
    const scale = 0.35 + random() * 0.8;
    dummy.position.set(x, y + 0.34 * scale, z);
    dummy.rotation.set(random() * 0.4, random() * Math.PI * 2, random() * 0.28);
    dummy.scale.set(scale * (0.8 + random() * 0.5), scale, scale * (0.75 + random() * 0.4));
    dummy.updateMatrix();
    rocks.setMatrixAt(placedRocks, dummy.matrix);
    placedRocks += 1;
  }
  rocks.count = placedRocks;
  rocks.instanceMatrix.needsUpdate = true;
  group.add(rocks);
  return group;
}

function disposeObject(root: THREE.Object3D) {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh || object instanceof THREE.Points)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) value.dispose();
      }
      material.dispose();
    }
  });
}

export function createTerrainWorld(terrain: HabitatTerrainVisual): TerrainWorld {
  const group = new THREE.Group();
  group.name = "survival-habitat";
  group.add(buildGround(terrain));

  const halfSize = Math.max(12, terrain.halfSize);
  const oceanMaterial = new THREE.MeshPhysicalMaterial({
    color: "#1d5a68",
    roughness: 0.24,
    metalness: 0.05,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
  });
  const ocean = new THREE.Mesh(new THREE.CircleGeometry(halfSize * 2.1, 96), oceanMaterial);
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.y = -0.12;
  ocean.receiveShadow = true;
  ocean.name = "coastal-water";
  group.add(ocean);

  for (const feature of terrain.freshwater) {
    const water = new THREE.Mesh(
      new THREE.CircleGeometry(1, 48),
      new THREE.MeshPhysicalMaterial({
        color: "#397c8c",
        roughness: 0.18,
        metalness: 0.04,
        transparent: true,
        opacity: 0.88,
        depthWrite: false,
      }),
    );
    water.name = `freshwater-${feature.id}`;
    water.rotation.set(-Math.PI / 2, 0, feature.rotation ?? 0);
    water.scale.set(feature.radiusX, feature.radiusZ, 1);
    water.position.set(
      feature.position.x,
      terrainWaterHeight(terrain, feature) + 0.02,
      feature.position.z,
    );
    group.add(water);
  }
  group.add(buildScenery(terrain));

  return {
    group,
    heightAt: (point) => terrainHeightAt(terrain, point),
    waterHeight: (feature) => terrainWaterHeight(terrain, feature),
    dispose: () => disposeObject(group),
  };
}
