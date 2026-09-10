import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { createCharacter } from "./character-model";
import {
  SURVIVAL_AGENT_COLORS,
  SURVIVAL_AGENT_IDS,
  type HabitatAgentVisual,
  type HabitatCarriedItemKind,
  type HabitatPoint,
  type HabitatResourceKind,
  type HabitatResourceVisual,
  type HabitatShelterVisual,
  type HabitatToolKind,
  type SurvivalAgentId,
} from "./types";

type HeightAt = (point: HabitatPoint) => number;

export function disposeObject(root: THREE.Object3D) {
  const geometries=new Set<THREE.BufferGeometry>(),materialsSeen=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
  root.traverse((object) => {
    if (
      !(
        object instanceof THREE.Mesh ||
        object instanceof THREE.Sprite ||
        object instanceof THREE.Points ||
        object instanceof THREE.Line
      )
    ) {
      return;
    }
    if(object.geometry&&!geometries.has(object.geometry)){object.geometry.dispose();geometries.add(object.geometry);}
    if (object instanceof THREE.InstancedMesh) object.dispose();
    const materialOrMaterials = object.material;
    const materials = Array.isArray(materialOrMaterials) ? materialOrMaterials : [materialOrMaterials];
    for (const material of materials) {
      if(materialsSeen.has(material))continue;
      materialsSeen.add(material);
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture && !textures.has(value)) {value.dispose();textures.add(value);}
      }
      material.dispose();
    }
  });
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const RESOURCE_COLORS: Record<HabitatResourceKind, string> = {
  freshwater: "#4fa9c5",
  food: "#d96c58",
  timber: "#846044",
  stone: "#818b8c",
  fiber: "#b6bd6d",
  medicine: "#d58fc8",
  clay: "#b96d51",
  ore: "#8ea6ad",
};

function resourceGeometry(kind: HabitatResourceKind): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const add = (geometry: THREE.BufferGeometry, color: string, x: number, y: number, z: number) => {
    geometry.translate(x, y, z);
    const normalized = geometry.index ? geometry.toNonIndexed() : geometry;
    if (normalized !== geometry) geometry.dispose();
    const tint = new THREE.Color(color), count = normalized.getAttribute("position").count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) tint.toArray(colors, i * 3);
    normalized.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    normalized.deleteAttribute("uv"); parts.push(normalized);
  };
  if (kind === "freshwater") {
    // The authoritative pond surface is rendered by terrain-world, not a blue token.
    add(new THREE.CylinderGeometry(.3, .3, .025, 16), RESOURCE_COLORS[kind], 0, .02, 0);
  } else if (kind === "timber") {
    const fallen = new THREE.CylinderGeometry(.17, .26, 2.2, 9);
    fallen.rotateZ(Math.PI / 2); fallen.rotateY(.32); add(fallen, "#70523c", 0, .24, 0);
    for (let i=0;i<3;i++) {
      const branch = new THREE.CylinderGeometry(.035,.075,.65,6);
      branch.rotateZ(.8+i*.25); branch.rotateY(i*2.1);
      add(branch,"#8c7250",-.7+i*.6,.37,Math.sin(i*2.1)*.22);
    }
  } else if (kind === "food" || kind === "medicine") {
    for (let i = 0; i < 3; i++) add(new THREE.IcosahedronGeometry(.48, 0), "#54714c", (i - 1) * .38, .42 + (i === 1 ? .18 : 0), i === 1 ? -.12 : .1);
    for (let i = 0; i < 7; i++) add(new THREE.IcosahedronGeometry(.085, 0), kind === "food" ? "#bc6a50" : "#c9adcf", Math.sin(i * 2.4) * .54, .66 + (i % 3) * .12, Math.cos(i * 2.4) * .38);
  } else if (kind === "fiber") {
    for (let i = 0; i < 7; i++) {
      const leaf = new THREE.ConeGeometry(.1, .8 + (i % 3) * .15, 4);
      leaf.rotateZ((i - 3) * .12); add(leaf, i % 2 ? "#879554" : "#b0ac6c", Math.sin(i * 2.4) * .26, .48, Math.cos(i * 2.4) * .26);
    }
  } else {
    for (let i = 0; i < 3; i++) {
      const rock = new THREE.DodecahedronGeometry(.5 - i * .075, 0);
      rock.scale(1.1, kind === "clay" ? .45 : .7, .85);
      add(rock, i === 1 && kind === "ore" ? "#bda277" : RESOURCE_COLORS[kind], (i - 1) * .38, kind === "clay" ? .16 : .29, i === 1 ? -.18 : .12);
    }
  }
  const geometry = mergeGeometries(parts)!;
  parts.forEach(part => part.dispose());
  return geometry;
}

export interface ResourceCollection {
  group: THREE.Group;
  sync(nodes: HabitatResourceVisual[], heightAt: HeightAt): void;
  dispose(): void;
}

export function createResourceCollection(): ResourceCollection {
  const group = new THREE.Group();
  group.name = "authoritative-resource-nodes";
  const meshes = new Map<HabitatResourceKind, THREE.InstancedMesh>();

  const sync = (nodes: HabitatResourceVisual[], heightAt: HeightAt) => {
    const byKind = new Map<HabitatResourceKind, HabitatResourceVisual[]>();
    for (const node of nodes) {
      if (node.visible === false || node.available <= 0 || node.kind === "freshwater") continue;
      const list = byKind.get(node.kind) ?? [];
      list.push(node);
      byKind.set(node.kind, list);
    }

    for (const kind of Object.keys(RESOURCE_COLORS) as HabitatResourceKind[]) {
      const visibleNodes = byKind.get(kind) ?? [];
      let mesh = meshes.get(kind);
      if (!mesh || mesh.instanceMatrix.count < Math.max(1, visibleNodes.length)) {
        if (mesh) {
          group.remove(mesh);
          disposeObject(mesh);
        }
        mesh = new THREE.InstancedMesh(
          resourceGeometry(kind),
          new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: kind === "freshwater" ? 0.26 : 0.82,
            metalness: kind === "ore" ? 0.32 : 0.02,
          }),
          Math.max(1, visibleNodes.length),
        );
        mesh.name = `instanced-resource-${kind}`;
        mesh.castShadow = kind !== "freshwater";
        mesh.receiveShadow = true;
        meshes.set(kind, mesh);
        group.add(mesh);
      }
      const dummy = new THREE.Object3D();
      visibleNodes.forEach((node, index) => {
        const scale = THREE.MathUtils.lerp(0.48, 1.05, clamp01(node.available));
        const y = heightAt(node.position);
        dummy.position.set(node.position.x, y + 0.02, node.position.z);
        dummy.rotation.set(
          0,
          ((index * 2.399963 + node.position.x * 0.1) % (Math.PI * 2)),
          0,
        );
        dummy.scale.setScalar(scale);
        dummy.updateMatrix();
        mesh?.setMatrixAt(index, dummy.matrix);
      });
      mesh.count = visibleNodes.length;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  };

  return {
    group,
    sync,
    dispose: () => disposeObject(group),
  };
}

interface ShelterModel {
  root: THREE.Group;
  stage: HabitatShelterVisual["stage"];
  fire: THREE.Group | null;
  shellMaterials: THREE.MeshStandardMaterial[];
}

function addLog(
  parent: THREE.Object3D,
  from: THREE.Vector3,
  to: THREE.Vector3,
  radius = 0.1,
  material = new THREE.MeshStandardMaterial({ color: "#76563c", roughness: 1 }),
) {
  const direction = new THREE.Vector3().subVectors(to, from);
  const length = direction.length();
  const log = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.08, length, 7), material);
  log.position.copy(from).add(to).multiplyScalar(0.5);
  log.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  log.castShadow = true;
  log.receiveShadow = true;
  parent.add(log);
  return log;
}

function createFire() {
  const fire = new THREE.Group();
  fire.name = "lit-fire";
  const stoneMaterial = new THREE.MeshStandardMaterial({ color: "#5f625e", roughness: 0.95 });
  for (let index = 0; index < 7; index += 1) {
    const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.12, 0), stoneMaterial);
    const angle = (index / 7) * Math.PI * 2;
    stone.position.set(Math.cos(angle) * 0.38, 0.1, Math.sin(angle) * 0.38);
    fire.add(stone);
  }
  const flameMaterial = new THREE.MeshBasicMaterial({ color: "#f6a84d" });
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.64, 7), flameMaterial);
  flame.name = "flame";
  flame.position.y = 0.38;
  fire.add(flame);
  const glow = new THREE.PointLight("#ffac55", 0.8, 8, 2);
  glow.position.y = 0.55;
  fire.add(glow);
  return fire;
}

function createShelterModel(shelter: HabitatShelterVisual): ShelterModel {
  const root = new THREE.Group();
  root.name = `shelter-${shelter.id}`;
  const wood = new THREE.MeshStandardMaterial({ color: "#76563c", roughness: 0.96 });
  const fabric = new THREE.MeshStandardMaterial({ color: "#807763", roughness: 0.93, side: THREE.DoubleSide });
  const wall = new THREE.MeshStandardMaterial({ color: "#846c4d", roughness: 0.94 });
  const roof = new THREE.MeshStandardMaterial({ color: "#475743", roughness: 1, side: THREE.DoubleSide });
  const shellMaterials = [wood, fabric, wall, roof];

  if (shelter.stage !== "fire") {
    addLog(root, new THREE.Vector3(-1.15, 0.1, -0.75), new THREE.Vector3(1.15, 0.1, -0.75), 0.1, wood);
    addLog(root, new THREE.Vector3(-1.15, 0.1, 0.75), new THREE.Vector3(1.15, 0.1, 0.75), 0.1, wood);
  }

  if (shelter.stage === "lean-to") {
    addLog(root, new THREE.Vector3(-1, 0.05, -0.7), new THREE.Vector3(-1, 1.55, 0.5), 0.1, wood);
    addLog(root, new THREE.Vector3(1, 0.05, -0.7), new THREE.Vector3(1, 1.55, 0.5), 0.1, wood);
    addLog(root, new THREE.Vector3(-1, 1.55, 0.5), new THREE.Vector3(1, 1.55, 0.5), 0.1, wood);
    const cover = new THREE.Mesh(new THREE.PlaneGeometry(2.35, 1.85), fabric);
    cover.position.set(0, 0.93, -0.08);
    cover.rotation.x = -0.89;
    cover.castShadow = true;
    root.add(cover);
  } else if (shelter.stage === "shelter" || shelter.stage === "cabin") {
    const height = shelter.stage === "cabin" ? 1.8 : 1.45;
    const building = new THREE.Mesh(new THREE.BoxGeometry(2.35, height, 1.8), wall);
    building.position.y = height * 0.5;
    building.castShadow = true;
    building.receiveShadow = true;
    root.add(building);
    const roofSideA = new THREE.Mesh(new THREE.BoxGeometry(2.65, 0.12, 1.35), roof);
    roofSideA.position.set(0, height + 0.48, -0.52);
    roofSideA.rotation.x = -0.65;
    roofSideA.castShadow = true;
    root.add(roofSideA);
    const roofSideB = roofSideA.clone();
    roofSideB.position.z = 0.52;
    roofSideB.rotation.x = 0.65;
    root.add(roofSideB);
    const door = new THREE.Mesh(
      new THREE.PlaneGeometry(0.55, 0.92),
      new THREE.MeshStandardMaterial({ color: "#3f332a", roughness: 1 }),
    );
    door.position.set(0, 0.48, 0.906);
    root.add(door);
    if (shelter.stage === "cabin") {
      const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.9, 0.32), wall);
      chimney.position.set(0.65, height + 0.45, -0.28);
      chimney.castShadow = true;
      root.add(chimney);
    }
  }

  const primaryOwner = shelter.ownerIds.find((id) => SURVIVAL_AGENT_IDS.includes(id));
  if (primaryOwner) {
    const flag = new THREE.Mesh(
      new THREE.PlaneGeometry(0.55, 0.32),
      new THREE.MeshBasicMaterial({ color: SURVIVAL_AGENT_COLORS[primaryOwner], side: THREE.DoubleSide }),
    );
    const pole = addLog(root, new THREE.Vector3(-1.15, 0, -0.72), new THREE.Vector3(-1.15, 2.35, -0.72), 0.035, wood);
    pole.castShadow = false;
    flag.position.set(-0.86, 2.13, -0.72);
    root.add(flag);
  }

  const fire = shelter.fireLit || shelter.stage === "fire" ? createFire() : null;
  if (fire) {
    fire.position.set(0, 0, shelter.stage === "fire" ? 0 : 1.35);
    root.add(fire);
  }
  return { root, stage: shelter.stage, fire, shellMaterials };
}

export interface ShelterCollection {
  group: THREE.Group;
  sync(shelters: HabitatShelterVisual[], heightAt: HeightAt): void;
  animate(timeSeconds: number, reducedMotion: boolean): void;
  dispose(): void;
}

export function createShelterCollection(): ShelterCollection {
  const group = new THREE.Group();
  group.name = "authoritative-shelters";
  const models = new Map<string, ShelterModel>();

  const sync = (shelters: HabitatShelterVisual[], heightAt: HeightAt) => {
    const incomingIds = new Set(shelters.map((shelter) => shelter.id));
    for (const [id, model] of models) {
      if (incomingIds.has(id)) continue;
      group.remove(model.root);
      disposeObject(model.root);
      models.delete(id);
    }

    for (const shelter of shelters) {
      let model = models.get(shelter.id);
      const fireMismatch = Boolean(model?.fire) !== Boolean(shelter.fireLit);
      if (!model || model.stage !== shelter.stage || fireMismatch) {
        if (model) {
          group.remove(model.root);
          disposeObject(model.root);
        }
        model = createShelterModel(shelter);
        models.set(shelter.id, model);
        group.add(model.root);
      }
      model.root.position.set(
        shelter.position.x,
        heightAt(shelter.position) + 0.03,
        shelter.position.z,
      );
      model.root.rotation.y = -shelter.heading;
      const constructionScale = THREE.MathUtils.lerp(0.35, 1, clamp01(shelter.progress));
      model.root.scale.set(1, constructionScale, 1);
      const integrity = clamp01(shelter.integrity);
      for (const material of model.shellMaterials) {
        material.roughness = THREE.MathUtils.lerp(1, 0.82, integrity);
      }
    }
  };

  const animate = (timeSeconds: number, reducedMotion: boolean) => {
    if (reducedMotion) return;
    for (const model of models.values()) {
      const flame = model.fire?.getObjectByName("flame");
      if (flame) {
        const flicker = 0.92 + Math.sin(timeSeconds * 11 + model.root.position.x) * 0.08;
        flame.scale.set(flicker, 0.9 + Math.sin(timeSeconds * 8.3) * 0.12, flicker);
      }
    }
  };

  return {
    group,
    sync,
    animate,
    dispose: () => disposeObject(group),
  };
}

function createLabelTexture(id: SurvivalAgentId, color: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 160;
  canvas.height = 80;
  const context = canvas.getContext("2d");
  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "rgba(8, 13, 18, 0.88)";
    context.beginPath();
    context.roundRect(22, 12, 116, 56, 22);
    context.fill();
    context.strokeStyle = color;
    context.lineWidth = 6;
    context.stroke();
    context.font = "700 34px system-ui, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = "#f3f6fa";
    context.fillText(id, 80, 40);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  return texture;
}

function createTool(kind: HabitatToolKind) {
  const group = new THREE.Group();
  group.name = `tool-${kind}`;
  if (kind === "none") return group;
  const wood = new THREE.MeshStandardMaterial({ color: "#77543a", roughness: 0.95 });
  const metal = new THREE.MeshStandardMaterial({ color: "#9aa5a8", roughness: 0.38, metalness: 0.5 });
  const paper = new THREE.MeshStandardMaterial({ color: "#d7cba7", roughness: 0.9 });
  const glass = new THREE.MeshPhysicalMaterial({ color: "#73b9c8", roughness: 0.12, transparent: true, opacity: 0.72 });
  if (["axe", "pick", "hammer", "knife", "torch"].includes(kind)) {
    const handleLength = kind === "knife" ? 0.34 : 0.78;
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, handleLength, 7), wood);
    handle.position.y = -handleLength * 0.45;
    group.add(handle);
    if (kind === "axe") {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.25, 0.08), metal);
      blade.position.set(0.13, 0, 0);
      blade.rotation.z = -0.25;
      group.add(blade);
    } else if (kind === "pick") {
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.095, 0.6, 6), metal);
      head.rotation.z = Math.PI / 2;
      group.add(head);
    } else if (kind === "hammer") {
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.18, 0.18), metal);
      group.add(head);
    } else if (kind === "knife") {
      const blade = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.38, 5), metal);
      blade.position.y = 0.25;
      group.add(blade);
    } else {
      const flame = new THREE.Mesh(
        new THREE.ConeGeometry(0.12, 0.36, 7),
        new THREE.MeshBasicMaterial({ color: "#ffad52" }),
      );
      flame.position.y = 0.18;
      group.add(flame);
    }
  } else if (kind === "notebook") {
    const notebook = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.54), paper);
    notebook.rotation.x = 0.42;
    group.add(notebook);
  } else if (kind === "test-vessel") {
    const vessel = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.17, 0.43, 10), glass);
    group.add(vessel);
  } else if (kind === "container") {
    const container = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.42, 10), wood);
    group.add(container);
  } else if (kind === "medicine") {
    const bundle = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), new THREE.MeshStandardMaterial({ color: "#d58fc8" }));
    group.add(bundle);
  }
  group.traverse((object) => {
    if (object instanceof THREE.Mesh) object.castShadow = true;
  });
  return group;
}

function createCarriedItem(kind: HabitatCarriedItemKind, customColor?: string) {
  const color = customColor ?? RESOURCE_COLORS[kind === "water" ? "freshwater" : kind === "unknown" ? "stone" : kind];
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.78 });
  if (kind === "timber") {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.72, 7), material);
    log.rotation.z = Math.PI / 2;
    return log;
  }
  if (kind === "water") return new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.42, 10), material);
  if (kind === "fiber") return new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.62, 7), material);
  if (kind === "food" || kind === "medicine") return new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), material);
  return new THREE.Mesh(new THREE.DodecahedronGeometry(0.23, 0), material);
}

interface AgentModel {
  id: SurvivalAgentId;
  root: THREE.Group;
  actor: THREE.Group;
  leftArm: THREE.Mesh;
  rightArm: THREE.Mesh;
  leftLeg: THREE.Mesh;
  rightLeg: THREE.Mesh;
  selection: THREE.Mesh;
  statusDisc: THREE.Mesh;
  label: THREE.Sprite;
  target: THREE.Vector3;
  desiredHeading: number;
  data: HabitatAgentVisual;
  toolAnchor: THREE.Group;
  toolKind: HabitatToolKind;
  carryAnchor: THREE.Group;
  carriedKind: HabitatCarriedItemKind | null;
  carriedColor: string | undefined;
  intentLine: THREE.Line<THREE.BufferGeometry, THREE.LineDashedMaterial>;
}

function createAgentModel(agent: HabitatAgentVisual): AgentModel {
  const color = SURVIVAL_AGENT_COLORS[agent.id];
  const root = new THREE.Group();
  root.name = `agent-${agent.id}`;
  root.userData.agentId = agent.id;
  const { actor, leftArm, rightArm, leftLeg, rightLeg } = createCharacter(agent.id);
  root.add(actor);

  const toolAnchor = new THREE.Group();
  toolAnchor.position.set(0, -0.62, 0);
  rightArm.add(toolAnchor);
  const carryAnchor = new THREE.Group();
  carryAnchor.position.set(-0.52, 1.24, 0.15);
  actor.add(carryAnchor);

  const selection = new THREE.Mesh(
    new THREE.RingGeometry(0.65, 0.79, 32),
    new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }),
  );
  selection.rotation.x = -Math.PI / 2;
  selection.position.y = 0.035;
  selection.visible = false;
  root.add(selection);
  const statusDisc = new THREE.Mesh(
    new THREE.CircleGeometry(0.58, 28),
    new THREE.MeshBasicMaterial({ color: "#17232f", transparent: true, opacity: 0.46, depthWrite: false }),
  );
  statusDisc.rotation.x = -Math.PI / 2;
  statusDisc.position.y = 0.02;
  root.add(statusDisc);

  const intentGeometry = new THREE.BufferGeometry();
  intentGeometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
  const intentLine = new THREE.Line(
    intentGeometry,
    new THREE.LineDashedMaterial({
      color,
      transparent: true,
      opacity: 0.64,
      dashSize: 0.42,
      gapSize: 0.28,
      depthWrite: false,
    }),
  );
  intentLine.name = `recorded-target-${agent.id}`;
  intentLine.visible = false;

  const labelMaterial = new THREE.SpriteMaterial({
    fog: false,
    map: createLabelTexture(agent.id, color),
    sizeAttenuation: false,
    transparent: true,
    depthTest: false,
  });
  const label = new THREE.Sprite(labelMaterial);
  label.name = `agent-label-${agent.id}`;
  const identityIndex = Math.max(0, SURVIVAL_AGENT_IDS.indexOf(agent.id));
  // Agents can truthfully converge on the same resource or conversation.
  // Stagger only their screen-facing ID plates so every co-located record
  // remains identifiable without moving the simulated bodies.
  label.position.y = 2.72 + identityIndex * 0.28;
  label.scale.set(0.075, 0.0375, 1);
  label.renderOrder = 12;
  root.add(label);

  root.traverse((object) => {
    object.userData.agentId = agent.id;
  });
  return {
    id: agent.id,
    root,
    actor,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    selection,
    statusDisc,
    label,
    target: new THREE.Vector3(),
    desiredHeading: agent.heading,
    data: agent,
    toolAnchor,
    toolKind: "none",
    carryAnchor,
    carriedKind: null,
    carriedColor: undefined,
    intentLine,
  };
}

function replaceTool(model: AgentModel, kind: HabitatToolKind) {
  if (model.toolKind === kind) return;
  for (const child of [...model.toolAnchor.children]) {
    model.toolAnchor.remove(child);
    disposeObject(child);
  }
  if (kind !== "none") model.toolAnchor.add(createTool(kind));
  model.toolKind = kind;
}

function replaceCarriedItem(model: AgentModel, agent: HabitatAgentVisual) {
  const kind = agent.carriedItem?.kind ?? null;
  const color = agent.carriedItem?.color;
  if (model.carriedKind === kind && model.carriedColor === color) return;
  for (const child of [...model.carryAnchor.children]) {
    model.carryAnchor.remove(child);
    disposeObject(child);
  }
  if (kind) {
    const item = createCarriedItem(kind, color);
    item.castShadow = true;
    model.carryAnchor.add(item);
  }
  model.carriedKind = kind;
  model.carriedColor = color;
}

export interface AgentCollection {
  group: THREE.Group;
  sync(agents: HabitatAgentVisual[], selectedId: SurvivalAgentId | null, heightAt: HeightAt): void;
  animate(timeSeconds: number, reducedMotion: boolean): void;
  placeLabels(camera: THREE.Camera, width: number, height: number, selectedId: SurvivalAgentId | null): void;
  positionOf(id: SurvivalAgentId): THREE.Vector3 | null;
  raycast(raycaster: THREE.Raycaster): SurvivalAgentId | null;
  dispose(): void;
}

export function createAgentCollection(): AgentCollection {
  const group = new THREE.Group();
  group.name = "survival-agents";
  const models = new Map<SurvivalAgentId, AgentModel>();

  const sync = (
    agents: HabitatAgentVisual[],
    selectedId: SurvivalAgentId | null,
    heightAt: HeightAt,
  ) => {
    const uniqueAgents = agents
      .filter((agent, index, list) =>
        SURVIVAL_AGENT_IDS.includes(agent.id) && list.findIndex((candidate) => candidate.id === agent.id) === index,
      )
      .slice(0, 5);
    const incomingIds = new Set(uniqueAgents.map((agent) => agent.id));
    for (const [id, model] of models) {
      if (incomingIds.has(id)) continue;
      group.remove(model.root);
      group.remove(model.intentLine);
      disposeObject(model.root);
      disposeObject(model.intentLine);
      models.delete(id);
    }

    for (const agent of uniqueAgents) {
      let model = models.get(agent.id);
      if (!model) {
        model = createAgentModel(agent);
        models.set(agent.id, model);
        group.add(model.root, model.intentLine);
        const initialY = heightAt(agent.position);
        model.root.position.set(agent.position.x, initialY, agent.position.z);
      }
      if (model.data.lifeId !== agent.lifeId) model.root.position.set(agent.position.x, heightAt(agent.position), agent.position.z);
      model.data = agent;
      model.target.set(agent.position.x, heightAt(agent.position), agent.position.z);
      model.desiredHeading = agent.heading;
      model.selection.visible = agent.alive && selectedId === agent.id;
      model.label.renderOrder = selectedId === agent.id
        ? 30
        : 12 + Math.max(0, SURVIVAL_AGENT_IDS.indexOf(agent.id));
      model.statusDisc.visible = agent.alive;
      model.actor.visible = true;
      const showRecordedTarget = agent.alive && selectedId === agent.id && Boolean(agent.action.targetPosition);
      model.intentLine.visible = showRecordedTarget;
      if (showRecordedTarget && agent.action.targetPosition) {
        const target = agent.action.targetPosition;
        const attribute = model.intentLine.geometry.getAttribute("position") as THREE.BufferAttribute;
        attribute.setXYZ(0, agent.position.x, heightAt(agent.position) + 0.1, agent.position.z);
        attribute.setXYZ(1, target.x, heightAt(target) + 0.1, target.z);
        attribute.needsUpdate = true;
        model.intentLine.geometry.computeBoundingSphere();
        model.intentLine.computeLineDistances();
      }
      replaceTool(model, agent.alive ? (agent.action.tool ?? "none") : "none");
      replaceCarriedItem(model, agent);
    }
  };

  const animate = (timeSeconds: number, reducedMotion: boolean) => {
    for (const model of models.values()) {
      const { data } = model;
      const motionFactor = reducedMotion ? 1 : 0.16;
      model.root.position.lerp(model.target, motionFactor);
      const deltaHeading = Math.atan2(
        Math.sin(model.desiredHeading - model.root.rotation.y),
        Math.cos(model.desiredHeading - model.root.rotation.y),
      );
      model.root.rotation.y += deltaHeading * motionFactor;

      model.leftArm.rotation.x = 0;
      model.rightArm.rotation.x = 0;
      model.leftLeg.rotation.x = 0;
      model.rightLeg.rotation.x = 0;
      model.actor.rotation.x = 0;
      model.actor.rotation.z = 0;
      model.actor.position.y = 0;
      model.actor.position.x = 0;
      const action = data.action.kind;
      if (!data.alive || data.status === "dead") {
        model.actor.rotation.z = -Math.PI / 2;
        model.actor.position.set(-0.15, 0.55, 0);
        model.statusDisc.visible = false;
        continue;
      }
      if (data.status === "blocked" || data.status === "awaiting-decision" || data.status === "connection-lost") continue;
      const motion = reducedMotion ? 0 : 1;

      if (["move", "explore", "relocate"].includes(action) || data.status === "moving") {
        const stride = Math.sin(timeSeconds * 7 + Number(model.id.slice(1))) * 0.48 * motion;
        model.leftArm.rotation.x = stride;
        model.rightArm.rotation.x = -stride;
        model.leftLeg.rotation.x = -stride;
        model.rightLeg.rotation.x = stride;
        model.actor.position.y = Math.abs(Math.sin(timeSeconds * 7)) * .04 * motion;
      } else if (["gather", "build", "craft", "defend"].includes(action)) {
        model.rightArm.rotation.x = -.9 + Math.sin(timeSeconds * 4.1) * .38 * motion;
        model.leftArm.rotation.x = -.65;
        model.actor.rotation.x = .13;
      } else if (["research", "test"].includes(action)) {
        model.leftArm.rotation.x = -1.05;
        model.rightArm.rotation.x = -1.16 + Math.sin(timeSeconds * 2.1) * 0.1 * motion;
      } else if (["drink", "eat"].includes(action)) {
        model.rightArm.rotation.x = -1.65;
      } else if (["communicate", "share", "trade", "rescue"].includes(action)) {
        model.rightArm.rotation.x = -1.1 + Math.sin(timeSeconds * 2.4) * 0.18 * motion;
      } else if (["rest", "sleep"].includes(action) || data.status === "resting") {
        model.actor.position.y = -.49;
        model.leftLeg.rotation.x = -1.22;
        model.rightLeg.rotation.x = -1.22;
        model.leftArm.rotation.x = -.5;
        model.rightArm.rotation.x = -.5;
      }
    }
  };

  const raycast = (raycaster: THREE.Raycaster) => {
    const candidates = [...models.values()].filter((model) => model.data.alive).map((model) => model.root);
    const intersections = raycaster.intersectObjects(candidates, true);
    for (const intersection of intersections) {
      const id = intersection.object.userData.agentId as SurvivalAgentId | undefined;
      if (id && models.has(id)) return id;
    }
    return null;
  };

  const placeLabels = (camera: THREE.Camera, width: number, height: number, selectedId: SurvivalAgentId | null) => {
    const occupied: Array<{ x: number; y: number }> = [];
    const ordered = [...models.values()].sort((a,b) => Number(b.id === selectedId) - Number(a.id === selectedId) || a.id.localeCompare(b.id));
    for (const model of ordered) {
      model.root.updateWorldMatrix(true, false);
      const projected = model.root.localToWorld(new THREE.Vector3(0, 2.8, 0)).project(camera);
      const center = { x: (projected.x + 1) * width / 2, y: (1 - projected.y) * height / 2 };
      model.label.visible = projected.z > -1 && projected.z < 1 && center.x >= 10 && center.x <= width - 10 && center.y >= 0 && center.y <= height;
      if (!model.label.visible) continue;
      const positions = [0, -24, 24, -48, 48].flatMap(dy => [0, -42, 42].map(dx => ({ x: center.x + dx, y: center.y + dy })));
      const position = positions.find(p => p.x >= 24 && p.x <= width - 24 && p.y >= 66 && p.y <= height - 16 && (p.x<width-76||p.y>266) && !occupied.some(other => Math.abs(p.x-other.x)<43 && Math.abs(p.y-other.y)<23));
      model.label.visible = Boolean(position);
      if (!position) continue;
      occupied.push(position);
      const point = new THREE.Vector3(position.x / width * 2 - 1, 1 - position.y / height * 2, projected.z).unproject(camera);
      model.label.position.copy(model.root.worldToLocal(point));
      const pixelScale = 1 / Math.max(1, camera.projectionMatrix.elements[5] * height);
      model.label.scale.set(80 * pixelScale, 40 * pixelScale, 1);
    }
  };

  return {
    group,
    sync,
    animate,
    placeLabels,
    positionOf: (id) => models.get(id)?.root.position.clone() ?? null,
    raycast,
    dispose: () => disposeObject(group),
  };
}
