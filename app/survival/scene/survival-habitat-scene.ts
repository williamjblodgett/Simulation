import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createAgentCollection, createResourceCollection, createShelterCollection, disposeObject } from "./scene-models";
import { createTerrainWorld, type TerrainWorld } from "./terrain-world";
import {
  type HabitatCameraMode,
  type HabitatPoint,
  type HabitatVisualSnapshot,
  type SurvivalAgentId,
  type SurvivalHabitatScene,
  type SurvivalHabitatSceneOptions,
} from "./types";

interface PointerStart {
  x: number;
  y: number;
  moved: boolean;
}

interface WeatherField {
  points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  positions: Float32Array;
  halfSize: number;
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

function createSky() {
  const uniforms = {
    topColor: { value: new THREE.Color("#31586c") },
    bottomColor: { value: new THREE.Color("#acc8ba") },
    offset: { value: 22 },
    exponent: { value: 0.72 },
  };
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms,
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
      uniform vec3 bottomColor;
      uniform float offset;
      uniform float exponent;
      varying vec3 vWorldPosition;
      void main() {
        float height = normalize(vWorldPosition + vec3(0.0, offset, 0.0)).y;
        float blend = pow(max(height, 0.0), exponent);
        gl_FragColor = vec4(mix(bottomColor, topColor, blend), 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(240, 30, 18), material);
  mesh.name = "habitat-sky";
  mesh.renderOrder = -100;
  return { mesh, material, uniforms };
}

function createStars() {
  const count = 360;
  const positions = new Float32Array(count * 3);
  let value = 0x137a4f21;
  const random = () => {
    value += 0x6d2b79f5;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
  for (let index = 0; index < count; index += 1) {
    const azimuth = random() * Math.PI * 2;
    const elevation = THREE.MathUtils.lerp(0.12, Math.PI * 0.48, random());
    const radius = THREE.MathUtils.lerp(125, 170, random());
    positions[index * 3] = Math.cos(azimuth) * Math.cos(elevation) * radius;
    positions[index * 3 + 1] = Math.sin(elevation) * radius;
    positions[index * 3 + 2] = Math.sin(azimuth) * Math.cos(elevation) * radius;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: "#dcecff",
    size: 0.58,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const points = new THREE.Points(geometry, material);
  points.name = "night-stars";
  points.renderOrder = -90;
  return points;
}

function createWeatherField(halfSize: number): WeatherField {
  const count = 720;
  const positions = new Float32Array(count * 3);
  let value = (Math.round(halfSize * 101) ^ 0x94d049bb) >>> 0;
  const random = () => {
    value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
    value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
    return ((value ^ (value >>> 15)) >>> 0) / 4_294_967_296;
  };
  for (let index = 0; index < count; index += 1) {
    positions[index * 3] = (random() * 2 - 1) * halfSize;
    positions[index * 3 + 1] = random() * 24 + 1;
    positions[index * 3 + 2] = (random() * 2 - 1) * halfSize;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setDrawRange(0, 0);
  const material = new THREE.PointsMaterial({
    color: "#a9cedc",
    size: 0.12,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
  });
  const points = new THREE.Points(geometry, material);
  points.name = "weather-particles";
  points.frustumCulled = false;
  return { points, positions, halfSize };
}

function updateWeatherParticles(
  field: WeatherField,
  snapshot: HabitatVisualSnapshot,
  deltaSeconds: number,
  reducedMotion: boolean,
) {
  const { kind, intensity, wind } = snapshot.weather;
  const wetWeather = kind === "rain" || kind === "storm" || kind === "snow";
  const count = wetWeather ? Math.round(field.positions.length / 3 * clamp01(intensity)) : 0;
  field.points.geometry.setDrawRange(0, count);
  field.points.material.color.set(kind === "snow" ? "#e5eff2" : "#a9cedc");
  field.points.material.size = kind === "snow" ? 0.25 : 0.1;
  field.points.material.opacity = kind === "storm" ? 0.78 : 0.58;
  if (!wetWeather || reducedMotion || count === 0) return;

  const fallSpeed = kind === "snow" ? 2.2 : kind === "storm" ? 18 : 11;
  const windX = (wind?.x ?? 0) * deltaSeconds * 2.2;
  const windZ = (wind?.z ?? 0) * deltaSeconds * 2.2;
  for (let index = 0; index < count; index += 1) {
    const offset = index * 3;
    field.positions[offset] += windX;
    field.positions[offset + 1] -= fallSpeed * deltaSeconds;
    field.positions[offset + 2] += windZ;
    if (field.positions[offset + 1] < 0) field.positions[offset + 1] += 24;
    if (field.positions[offset] > field.halfSize) field.positions[offset] -= field.halfSize * 2;
    if (field.positions[offset] < -field.halfSize) field.positions[offset] += field.halfSize * 2;
    if (field.positions[offset + 2] > field.halfSize) field.positions[offset + 2] -= field.halfSize * 2;
    if (field.positions[offset + 2] < -field.halfSize) field.positions[offset + 2] += field.halfSize * 2;
  }
  const attribute = field.points.geometry.getAttribute("position");
  attribute.needsUpdate = true;
}

function terrainSignature(snapshot: HabitatVisualSnapshot) {
  const terrain = snapshot.terrain;
  const water = terrain.freshwater
    .map((feature) =>
      [feature.id, feature.position.x, feature.position.z, feature.radiusX, feature.radiusZ, feature.rotation ?? 0].join(":"),
    )
    .join("|");
  const clearings = (terrain.clearings ?? [])
    .map((clearing) => [clearing.position.x, clearing.position.z, clearing.radius].join(":"))
    .join("|");
  return [
    terrain.seed,
    terrain.halfSize,
    terrain.islandRadius ?? "default",
    terrain.elevationScale ?? "default",
    terrain.vegetationDensity ?? "default",
    terrain.rockDensity ?? "default",
    water,
    clearings,
  ].join(";");
}

/**
 * Creates one self-contained renderer. The simulation owns all state; this object
 * only interpolates and depicts immutable visual snapshots.
 */
export function createSurvivalHabitatScene(
  host: HTMLElement,
  options: SurvivalHabitatSceneOptions,
): SurvivalHabitatScene {
  const reducedMotion =
    options.reducedMotion ??
    (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const maxDpr = THREE.MathUtils.clamp(options.maxDevicePixelRatio ?? 1.65, 1, 2);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#101a22");
  scene.fog = new THREE.FogExp2("#839da0", 0.008);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 600);
  camera.position.set(35, 40, 48);
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.style.display = "block";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  renderer.domElement.style.touchAction = "none";
  renderer.domElement.setAttribute("role", "img");
  renderer.domElement.setAttribute(
    "aria-label",
    options.canvasLabel ?? "Interactive three-dimensional survival habitat",
  );
  host.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = !reducedMotion;
  controls.dampingFactor = 0.075;
  controls.screenSpacePanning = false;
  controls.minPolarAngle = 0.16;
  controls.maxPolarAngle = Math.PI * 0.475;
  controls.minDistance = 4;
  controls.maxDistance = 145;
  controls.target.set(0, 1, 0);
  controls.update();

  const hemisphere = new THREE.HemisphereLight("#c6e1ec", "#344038", 0.78);
  scene.add(hemisphere);
  const sunlight = new THREE.DirectionalLight("#ffe8c4", 1.45);
  sunlight.position.set(28, 45, 22);
  sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(1024, 1024);
  sunlight.shadow.bias = -0.0005;
  sunlight.shadow.normalBias = 0.025;
  scene.add(sunlight, sunlight.target);
  const fill = new THREE.AmbientLight("#7692a3", 0.16);
  scene.add(fill);

  const sky = createSky();
  scene.add(sky.mesh);
  const stars = createStars();
  scene.add(stars);

  const resources = createResourceCollection();
  const shelters = createShelterCollection();
  const agents = createAgentCollection();
  scene.add(resources.group, shelters.group, agents.group);

  let terrainWorld: TerrainWorld | null = null;
  let currentTerrainSignature = "";
  let weatherField = createWeatherField(48);
  scene.add(weatherField.points);
  let snapshot: HabitatVisualSnapshot | null = null;
  let selectedId: SurvivalAgentId | null = null;
  let cameraMode: HabitatCameraMode = "overview";
  let previousSelectedId: SurvivalAgentId | null = null;
  let previousCameraMode: HabitatCameraMode = "overview";
  let cameraTransition = true;
  let manualOverride = false;
  let disposed = false;
  let contextLost = false;
  let active = true;
  let previousFrameTime = performance.now();
  const desiredCamera = new THREE.Vector3();
  const desiredTarget = new THREE.Vector3();
  const pointers = new Map<number, PointerStart>();
  let manualGestureReported = false;
  let lastWheelReport = -Infinity;

  function frameOverview(immediate: boolean) {
    const halfSize = Math.max(12, snapshot?.terrain.halfSize ?? 48);
    const livingAgents = snapshot?.agents.filter((agent) => agent.alive) ?? [];
    if (livingAgents.length) {
      const minX = Math.min(...livingAgents.map((agent) => agent.position.x));
      const maxX = Math.max(...livingAgents.map((agent) => agent.position.x));
      const minZ = Math.min(...livingAgents.map((agent) => agent.position.z));
      const maxZ = Math.max(...livingAgents.map((agent) => agent.position.z));
      const selectedAgent = selectedId
        ? livingAgents.find((agent) => agent.id === selectedId)
        : null;
      const clusterCenterX = (minX + maxX) / 2;
      const clusterCenterZ = (minZ + maxZ) / 2;
      // Overview promises a census of every living subject. A small selected
      // bias keeps context without letting one distant selection push the
      // remaining agents off a portrait phone's narrow horizontal field.
      const centerX = selectedAgent
        ? THREE.MathUtils.lerp(clusterCenterX, selectedAgent.position.x, 0.1)
        : clusterCenterX;
      const centerZ = selectedAgent
        ? THREE.MathUtils.lerp(clusterCenterZ, selectedAgent.position.z, 0.1)
        : clusterCenterZ;
      const selectedExtent = Math.max(
        ...livingAgents.flatMap((agent) => [
          Math.abs(agent.position.x - centerX),
          Math.abs(agent.position.z - centerZ),
        ]),
      );
      // The overview is an observation camera, not a map of every undiscovered
      // resource. Frame every living subject plus a generous habitat margin so
      // the opening view remains legible even on a phone.
      const baseSubjectRadius = THREE.MathUtils.clamp(
        Math.max(Math.max(maxX - minX, maxZ - minZ) * 0.86, selectedExtent * 1.12) + 10,
        15,
        halfSize * 0.7,
      );
      // A portrait phone has a much narrower horizontal field of view than the
      // desktop canvas. Widen the overview there so all living agents remain in
      // frame instead of only the selected subject.
      // The camera renders behind the mobile inspector. Reserve enough
      // vertical breathing room that the population remains above the peek
      // sheet, while desktop retains the closer composed view.
      const aspectFit = THREE.MathUtils.clamp(1.16 / Math.max(0.5, camera.aspect), 1, 2.2);
      const subjectRadius = Math.min(halfSize * 0.92, baseSubjectRadius * aspectFit);
      desiredTarget.set(centerX, 0.9, centerZ);
      desiredCamera.set(
        centerX + subjectRadius * 0.72,
        subjectRadius * 0.94,
        centerZ + subjectRadius * 1.08,
      );
    } else {
      desiredTarget.set(0, 0.8, 0);
      desiredCamera.set(halfSize * 0.62, halfSize * 0.72, halfSize * 0.88);
    }
    if (immediate || reducedMotion) {
      camera.position.copy(desiredCamera);
      controls.target.copy(desiredTarget);
      controls.update();
      cameraTransition = false;
    } else {
      cameraTransition = true;
    }
  }

  function reportManualCamera() {
    manualOverride = true;
    cameraTransition = false;
    if (!manualGestureReported) {
      manualGestureReported = true;
      options.onManualCamera();
    }
  }

  function applyDaylight() {
    if (!snapshot) return;
    const { phase } = snapshot.daylight;
    const light = clamp01(snapshot.daylight.lightLevel);
    const palette = {
      dawn: { top: "#55465d", bottom: "#d29a76", fog: "#9a8e83", sun: "#ffcc98" },
      day: { top: "#396f8a", bottom: "#b1cfbf", fog: "#93aaa5", sun: "#ffe6bd" },
      dusk: { top: "#332f50", bottom: "#b76e5a", fog: "#7c706f", sun: "#ffb174" },
      night: { top: "#050a17", bottom: "#152937", fog: "#253c48", sun: "#8fb0d8" },
    }[phase];
    sky.uniforms.topColor.value.set(palette.top);
    sky.uniforms.bottomColor.value.set(palette.bottom);
    scene.background = new THREE.Color(palette.bottom);
    if (scene.fog instanceof THREE.FogExp2) {
      scene.fog.color.set(palette.fog);
      const weatherFog = snapshot.weather.kind === "fog" ? snapshot.weather.intensity * 0.026 : 0;
      const stormFog = snapshot.weather.kind === "storm" ? snapshot.weather.intensity * 0.009 : 0;
      scene.fog.density = 0.0045 + weatherFog + stormFog;
    }
    // Preserve the day/night signal without making the observed state
    // unreadable. Night uses cool ambient moonlight; daytime still carries the
    // stronger directional contrast.
    hemisphere.intensity = 0.64 + light * 0.56;
    sunlight.intensity = 0.3 + light * 1.3;
    fill.intensity = 0.34 + (1 - light) * 0.3;
    sunlight.color.set(palette.sun);
    const sunAzimuth = snapshot.daylight.sunAzimuth ?? Math.PI * 0.22;
    const distance = Math.max(28, snapshot.terrain.halfSize * 1.1);
    sunlight.position.set(
      Math.cos(sunAzimuth) * distance,
      THREE.MathUtils.lerp(12, distance, light),
      Math.sin(sunAzimuth) * distance,
    );
    sunlight.target.position.set(0, 0, 0);
    renderer.toneMappingExposure = 1.02 + light * 0.12;
    const starMaterial = stars.material as THREE.PointsMaterial;
    starMaterial.opacity = phase === "night" ? THREE.MathUtils.lerp(0.42, 0.92, 1 - light) : 0;
  }

  function rebuildTerrain() {
    if (!snapshot) return;
    if (terrainWorld) {
      scene.remove(terrainWorld.group);
      terrainWorld.dispose();
    }
    terrainWorld = createTerrainWorld(snapshot.terrain);
    scene.add(terrainWorld.group);
    const skyScale = Math.max(0.7, snapshot.terrain.halfSize / 48);
    sky.mesh.scale.setScalar(skyScale);
    stars.scale.setScalar(skyScale);
    controls.maxDistance = Math.max(38, snapshot.terrain.halfSize * 2.4);
    camera.far = Math.max(600, snapshot.terrain.halfSize * 12);
    camera.updateProjectionMatrix();
    const shadowExtent = Math.max(24, snapshot.terrain.halfSize * 0.95);
    sunlight.shadow.camera.left = -shadowExtent;
    sunlight.shadow.camera.right = shadowExtent;
    sunlight.shadow.camera.top = shadowExtent;
    sunlight.shadow.camera.bottom = -shadowExtent;
    sunlight.shadow.camera.far = shadowExtent * 3;
    sunlight.shadow.camera.updateProjectionMatrix();
    scene.remove(weatherField.points);
    disposeObject(weatherField.points);
    weatherField = createWeatherField(snapshot.terrain.halfSize);
    scene.add(weatherField.points);
    frameOverview(!currentTerrainSignature);
  }

  function resize() {
    if (disposed) return;
    const width = Math.max(1, Math.round(host.clientWidth));
    const height = Math.max(1, Math.round(host.clientHeight));
    const dpr = Math.min(maxDpr, Math.max(1, window.devicePixelRatio || 1));
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
  resizeObserver?.observe(host);
  resize();

  function update(
    nextSnapshot: HabitatVisualSnapshot,
    nextSelectedId: SurvivalAgentId | null,
    nextCameraMode: HabitatCameraMode,
  ) {
    if (disposed) return;
    snapshot = nextSnapshot;
    selectedId = nextSelectedId;
    cameraMode = nextCameraMode;
    const nextTerrainSignature = terrainSignature(nextSnapshot);
    if (nextTerrainSignature !== currentTerrainSignature) {
      const firstTerrain = !currentTerrainSignature;
      currentTerrainSignature = nextTerrainSignature;
      rebuildTerrain();
      if (firstTerrain) frameOverview(true);
    }
    if (!terrainWorld) return;
    resources.sync(nextSnapshot.resourceNodes, terrainWorld.heightAt);
    shelters.sync(nextSnapshot.shelters, terrainWorld.heightAt);
    agents.sync(nextSnapshot.agents, nextSelectedId, terrainWorld.heightAt);
    applyDaylight();

    if (cameraMode !== previousCameraMode || selectedId !== previousSelectedId) {
      manualOverride = cameraMode === "free";
      cameraTransition = cameraMode !== "free";
      if (cameraMode === "overview") frameOverview(false);
      previousCameraMode = cameraMode;
      previousSelectedId = selectedId;
    }
  }

  function updateCamera() {
    if (!snapshot || manualOverride) return;
    if (cameraMode === "follow" && selectedId) {
      const agentPosition = agents.positionOf(selectedId);
      if (agentPosition) {
        desiredTarget.copy(agentPosition).add(new THREE.Vector3(0, 1.15, 0));
        desiredCamera.copy(agentPosition).add(new THREE.Vector3(8.5, 8.2, 10.5));
        cameraTransition = true;
      }
    }
    if (!cameraTransition) return;
    const amount = reducedMotion ? 1 : cameraMode === "follow" ? 0.085 : 0.065;
    camera.position.lerp(desiredCamera, amount);
    controls.target.lerp(desiredTarget, amount);
    if (
      camera.position.distanceToSquared(desiredCamera) < 0.0025 &&
      controls.target.distanceToSquared(desiredTarget) < 0.0025 &&
      cameraMode === "overview"
    ) {
      cameraTransition = false;
    }
  }

  function animate(timeMilliseconds: number) {
    if (disposed || contextLost || !snapshot) return;
    if (document.visibilityState === "hidden") {
      previousFrameTime = timeMilliseconds;
      return;
    }
    const deltaSeconds = Math.min(0.05, Math.max(0, (timeMilliseconds - previousFrameTime) / 1000));
    previousFrameTime = timeMilliseconds;
    const timeSeconds = timeMilliseconds / 1000;
    agents.animate(timeSeconds, reducedMotion);
    shelters.animate(timeSeconds, reducedMotion);
    updateWeatherParticles(weatherField, snapshot, deltaSeconds, reducedMotion);
    updateCamera();
    controls.update();
    renderer.render(scene, camera);
  }

  function setActive(nextActive: boolean) {
    if (disposed || active === nextActive) return;
    active = nextActive;
    renderer.setAnimationLoop(active ? animate : null);
    if (active) {
      previousFrameTime = performance.now();
      resize();
    }
  }

  function focusAt(point: HabitatPoint) {
    if (disposed || !terrainWorld) return;
    const height = terrainWorld.heightAt(point);
    manualOverride = false;
    cameraTransition = true;
    desiredTarget.set(point.x, height + 0.8, point.z);
    desiredCamera.set(point.x + 9.5, height + 10.5, point.z + 12.5);
  }

  function handlePointerDown(event: PointerEvent) {
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, moved: false });
    if (pointers.size > 1) reportManualCamera();
  }

  function handlePointerMove(event: PointerEvent) {
    const pointer = pointers.get(event.pointerId);
    if (!pointer) return;
    if (Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 8) {
      pointer.moved = true;
      reportManualCamera();
    }
  }

  function handlePointerUp(event: PointerEvent) {
    const pointer = pointers.get(event.pointerId);
    const wasOnlyPointer = pointers.size === 1;
    pointers.delete(event.pointerId);
    if (pointer && !pointer.moved && wasOnlyPointer && !manualGestureReported) {
      const rect = renderer.domElement.getBoundingClientRect();
      const cursor = new THREE.Vector2(
        ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
        -((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1,
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(cursor, camera);
      const id = agents.raycast(raycaster);
      if (id) options.onSelectAgent(id);
    }
    if (pointers.size === 0) manualGestureReported = false;
  }

  function handlePointerCancel(event: PointerEvent) {
    pointers.delete(event.pointerId);
    if (pointers.size === 0) manualGestureReported = false;
  }

  function handleWheel() {
    const now = performance.now();
    if (now - lastWheelReport < 180) return;
    lastWheelReport = now;
    manualGestureReported = false;
    reportManualCamera();
    manualGestureReported = false;
  }

  function handleContextLost(event: Event) {
    event.preventDefault();
    contextLost = true;
    options.onContextLost();
  }

  function handleContextRestored() {
    contextLost = false;
    previousFrameTime = performance.now();
    resize();
  }

  renderer.domElement.addEventListener("pointerdown", handlePointerDown);
  renderer.domElement.addEventListener("pointermove", handlePointerMove);
  renderer.domElement.addEventListener("pointerup", handlePointerUp);
  renderer.domElement.addEventListener("pointercancel", handlePointerCancel);
  renderer.domElement.addEventListener("wheel", handleWheel, { passive: true });
  renderer.domElement.addEventListener("webglcontextlost", handleContextLost);
  renderer.domElement.addEventListener("webglcontextrestored", handleContextRestored);
  renderer.setAnimationLoop(animate);

  function dispose() {
    if (disposed) return;
    disposed = true;
    renderer.setAnimationLoop(null);
    resizeObserver?.disconnect();
    renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
    renderer.domElement.removeEventListener("pointermove", handlePointerMove);
    renderer.domElement.removeEventListener("pointerup", handlePointerUp);
    renderer.domElement.removeEventListener("pointercancel", handlePointerCancel);
    renderer.domElement.removeEventListener("wheel", handleWheel);
    renderer.domElement.removeEventListener("webglcontextlost", handleContextLost);
    renderer.domElement.removeEventListener("webglcontextrestored", handleContextRestored);
    controls.dispose();
    terrainWorld?.dispose();
    resources.dispose();
    shelters.dispose();
    agents.dispose();
    disposeObject(sky.mesh);
    disposeObject(stars);
    disposeObject(weatherField.points);
    renderer.dispose();
    renderer.domElement.remove();
  }

  return { update, setActive, focusAt, resize, dispose };
}
