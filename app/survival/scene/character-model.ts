import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { SURVIVAL_AGENT_COLORS, SURVIVAL_AGENT_IDS, type SurvivalAgentId } from "./types";

/** Shared observation avatars: these identifiers confer no traits or equipment. */
export function createCharacter(id: SurvivalAgentId) {
  const index = SURVIVAL_AGENT_IDS.indexOf(id);
  const actor = new THREE.Group();
  const mat = (color: string) => new THREE.MeshStandardMaterial({ color, roughness: .94 });
  const fabric = mat(["#586d72", "#6e6557", "#596a56", "#686076", "#756b52"][index]);
  const identity = mat(SURVIVAL_AGENT_COLORS[id]);
  const skin = mat(["#b98261", "#d9aa82", "#86553e", "#c5916d", "#a97453"][index]);
  const hair = mat(["#302a27", "#644331", "#252523", "#412d28", "#38312b"][index]);
  const dark = mat("#2b353a"), eye = mat("#18252b"), white = mat("#dfd9c5");
  const add = (geometry: THREE.BufferGeometry, material: THREE.MeshStandardMaterial, x: number, y: number, z: number, parent: THREE.Object3D = actor) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  };
  const oval = (x: number, y: number, z: number) => { const g = new THREE.SphereGeometry(1, 12, 8); g.scale(x, y, z); return g; };
  const tapered = (top: number, bottom: number, height: number, depth = 1) => {
    const g = new THREE.CylinderGeometry(top, bottom, height, 10); g.scale(1, 1, depth); return g;
  };
  // Neutral base garment, not fabricated packs or occupation-specific equipment.
  add(tapered(.36, .27, .60, .60), fabric, 0, 1.39, 0);
  add(tapered(.27, .34, .27, .66), fabric, 0, 1.00, 0);
  add(tapered(.29, .29, .07, .66), dark, 0, 1.11, 0);
  add(tapered(.24, .34, .12, .69), identity, 0, 1.67, 0);
  add(new THREE.BoxGeometry(.048, .46, .025), identity, -.14, 1.39, .202).rotation.z = -.16;
  add(tapered(.115, .13, .18), skin, 0, 1.77, 0);
  const headStart = actor.children.length;
  add(oval(.255, .31, .238), skin, 0, 2.02, .005).name = "face";
  add(oval(.19, .125, .195), skin, 0, 1.84, .028);
  for (const side of [-1, 1]) {
    add(oval(.059, .093, .047), skin, side * .252, 2.015, -.003);
    add(oval(.047, .027, .018), white, side * .092, 2.059, .221);
    add(oval(.019, .025, .012), eye, side * .089, 2.056, .239);
    add(new THREE.BoxGeometry(.077, .021, .025), hair, side * .094, 2.114, .219).rotation.z = side * -.10;
  }
  add(oval(.042, .066, .044), skin, 0, 2.010, .293);
  add(oval(.062, .013, .011), mat("#855c4b"), 0, 1.916, .216);
  add(new THREE.SphereGeometry(.264, 14, 10, 0, Math.PI * 2, 0, Math.PI * .51), hair, 0, 2.104, -.02);
  if (index === 0) {
    for (let i = 0; i < 4; i++) add(oval(.12, .085, .13), hair, -.15 + i * .082, 2.31 - i * .018, .06).rotation.z = -.28;
  } else if (index === 1) {
    add(oval(.12, .105, .13), hair, 0, 2.22, -.245);
    add(oval(.064, .17, .065), hair, -.205, 2.10, -.045);
  } else if (index === 2) {
    for (let i = 0; i < 8; i++) add(oval(.106, .115, .106), hair, Math.cos(i * 2.4) * .19, 2.25 + (i % 2) * .025, Math.sin(i * 2.4) * .16);
  } else if (index === 3) {
    add(oval(.264, .215, .12), hair, 0, 2.02, -.16);
    add(oval(.11, .20, .085), hair, -.223, 2.09, .025);
    add(oval(.11, .17, .085), hair, .223, 2.12, -.005);
  } else {
    add(oval(.25, .1, .22), hair, .035, 2.31, -.015).rotation.z = .15;
  }
  // Adult-like proportions; transform the same authored facial detail everywhere.
  for (const object of actor.children.slice(headStart)) {
    object.position.x *= .84;
    object.position.y = 1.82 + (object.position.y - 1.75) * .80;
    object.scale.multiplyScalar(.84);
  }
  const limb = (side: number, arm: boolean) => {
    const geometry = tapered(arm ? .113 : .125, arm ? .085 : .095, arm ? .32 : .42, arm ? .9 : .95);
    geometry.translate(0, arm ? -.16 : -.21, 0);
    const pivot = add(geometry, fabric, side * (arm ? .369 : .16), arm ? 1.62 : .95, 0);
    pivot.name = `${side < 0 ? "left" : "right"}-${arm ? "arm" : "leg"}`;
    const lower = add(tapered(arm ? .085 : .095, arm ? .065 : .073, arm ? .28 : .35), arm ? skin : dark, 0, arm ? -.445 : -.57, 0, pivot);
    lower.name = "lower-limb";
    if (arm) { add(oval(.075, .10, .067), skin, 0, -.63, .012, pivot); pivot.rotation.z = side * .11; }
    else add(oval(.108, .10, .19), dark, 0, -.85, .065, pivot);
    return pivot;
  };
  const leftArm=limb(-1,true),rightArm=limb(1,true),leftLeg=limb(-1,false),rightLeg=limb(1,false);
  // Batch static facial/clothing surfaces by material; retain limb pivots and
  // the forward facial landmark. This reduces five-character draw overhead.
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for(const part of [...actor.children]) {
    if(!(part instanceof THREE.Mesh)||part.children.length||part.position.z>.29||Array.isArray(part.material))continue;
    part.updateMatrix();
    const geometry=part.geometry.clone().applyMatrix4(part.matrix);
    batches.set(part.material,[...(batches.get(part.material)??[]),geometry]);
    actor.remove(part);part.geometry.dispose();
  }
  for(const [material,geometries] of batches) {
    const mesh=new THREE.Mesh(mergeGeometries(geometries)!,material);
    mesh.castShadow=true;mesh.receiveShadow=true;actor.add(mesh);geometries.forEach(g=>g.dispose());
  }
  return { actor,leftArm,rightArm,leftLeg,rightLeg };
}

export function disposeCharacter(actor: THREE.Group) {
  const materials = new Set<THREE.Material>();
  actor.traverse(object => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); for (const m of Array.isArray(object.material) ? object.material : [object.material]) materials.add(m); } });
  materials.forEach(material => material.dispose());
}

/** One-off bust and figure captures on the main renderer; no portrait loops. */
export function renderCharacterPortraits(renderer: THREE.WebGLRenderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#111b24");
  scene.add(new THREE.HemisphereLight("#e4f1ff", "#819186", 1.7));
  const light = new THREE.DirectionalLight("#ffe2bc", 2.3);
  light.position.set(-3, 5, 5); scene.add(light);
  const rim = new THREE.DirectionalLight("#6bb7e1", 1.8); rim.position.set(3, 3, -2); scene.add(rim);
  const camera = new THREE.OrthographicCamera(-.52, .52, .585, -.585, .1, 20);
  const size = renderer.getSize(new THREE.Vector2()), dpr = renderer.getPixelRatio();
  const portraits: Record<string, string> = {};
  try {
    renderer.setPixelRatio(1); renderer.setSize(240, 270, false);
    for (const id of SURVIVAL_AGENT_IDS) {
      const { actor, leftArm, rightArm } = createCharacter(id); scene.add(actor);
      leftArm.rotation.z = -.08; rightArm.rotation.z = .08;
      try {
        for (const full of [false, true]) {
          const half = full ? 1.18 : .52;
          camera.left = -half; camera.right = half; camera.top = half * 1.125; camera.bottom = -half * 1.125;
          camera.position.set(.85, full ? 1.9 : 2.14, 5);
          camera.lookAt(0, full ? 1.24 : 1.96, 0); camera.updateProjectionMatrix();
          renderer.render(scene, camera);
          portraits[full ? `${id}-figure` : id] = renderer.domElement.toDataURL("image/png");
        }
      } finally { scene.remove(actor); disposeCharacter(actor); }
    }
  } finally { renderer.setPixelRatio(dpr); renderer.setSize(size.x, size.y, false); }
  return portraits;
}
