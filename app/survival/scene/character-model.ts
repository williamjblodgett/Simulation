import * as THREE from "three";
import { SURVIVAL_AGENT_COLORS, SURVIVAL_AGENT_IDS, type SurvivalAgentId } from "./types";

/** The same observer identity model supplies world bodies and portrait images.
 * These visual identifiers confer no traits, equipment, jobs or policy inputs. */
export function createCharacter(id: SurvivalAgentId) {
  const index = SURVIVAL_AGENT_IDS.indexOf(id);
  const actor = new THREE.Group();
  const fabric = new THREE.MeshStandardMaterial({ color: "#41566a", roughness: 1 });
  const identity = new THREE.MeshStandardMaterial({ color: SURVIVAL_AGENT_COLORS[id], roughness: .9 });
  const skin = new THREE.MeshStandardMaterial({ color: ["#b98261", "#d9aa82", "#86553e", "#c5916d", "#a97453"][index], roughness: .9 });
  const hair = new THREE.MeshStandardMaterial({ color: ["#382a24", "#5b3828", "#252521", "#50342b", "#33302c"][index], roughness: 1 });
  const boot = new THREE.MeshStandardMaterial({ color: "#28323a", roughness: 1 });
  const eye = new THREE.MeshStandardMaterial({ color: "#172027", roughness: .6 });
  const add = (geometry: THREE.BufferGeometry, material: THREE.MeshStandardMaterial, x: number, y: number, z: number) => {
    const part = new THREE.Mesh(geometry, material);
    part.position.set(x, y, z); part.castShadow = true; actor.add(part); return part;
  };
  add(new THREE.CylinderGeometry(.32, .38, .76, 9), fabric, 0, 1.18, 0);
  add(new THREE.CylinderGeometry(.4, .34, .2, 9), identity, 0, 1.58, 0);
  add(new THREE.CylinderGeometry(.14, .15, .18, 9), skin, 0, 1.73, 0);
  const head = add(new THREE.SphereGeometry(.29, 14, 10), skin, 0, 2.00, 0);
  head.scale.set(.92, 1.1, .92);
  add(new THREE.SphereGeometry(.298, 14, 8, 0, Math.PI * 2, 0, Math.PI * .51), hair, 0, 2.05, -.012);
  const band = add(new THREE.TorusGeometry(.273, .027, 6, 18), identity, 0, 2.085, 0);
  band.rotation.x = Math.PI / 2;
  for (const side of [-1, 1]) {
    add(new THREE.SphereGeometry(.026, 8, 6), eye, side * .102, 2.035, .247);
    add(new THREE.SphereGeometry(.061, 8, 6), skin, side * .268, 1.995, 0);
    const leg = add(new THREE.CylinderGeometry(.11, .12, .7, 8), fabric, side * .18, .48, 0);
    leg.name = side < 0 ? "left-leg" : "right-leg";
    const shoe = add(new THREE.SphereGeometry(.14, 8, 6), boot, side * .18, .12, .07);
    shoe.scale.set(1, .7, 1.55);
  }
  add(new THREE.ConeGeometry(.054, .115, 6), skin, 0, 1.995, .292).rotation.x = Math.PI / 2;
  const arm = (side: number) => {
    const geometry = new THREE.CylinderGeometry(.095, .11, .59, 8);
    geometry.translate(0, -.295, 0);
    const part = add(geometry, fabric, side * .39, 1.53, 0);
    part.rotation.z = side * .13;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(.095, 8, 6), skin);
    hand.position.y = -.61; part.add(hand); return part;
  };
  return { actor, leftArm: arm(-1), rightArm: arm(1) };
}

export function disposeCharacter(actor: THREE.Group) {
  const materials = new Set<THREE.Material>();
  actor.traverse(object => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); for (const m of Array.isArray(object.material) ? object.material : [object.material]) materials.add(m); } });
  materials.forEach(material => material.dispose());
}

/** One-off captures on the existing renderer; no thumbnail render loops. */
export function renderCharacterPortraits(renderer: THREE.WebGLRenderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#17232f");
  scene.add(new THREE.HemisphereLight("#e8f3ff", "#62788d", 2.3));
  const light = new THREE.DirectionalLight("#ffe5c3", 3);
  light.position.set(-3, 5, 5); scene.add(light);
  const camera = new THREE.OrthographicCamera(-.61, .61, .68, -.68, .1, 20);
  camera.position.set(1.1, 2.05, 5); camera.lookAt(0, 1.78, 0);
  const size = renderer.getSize(new THREE.Vector2()), dpr = renderer.getPixelRatio();
  const portraits: Record<string, string> = {};
  try {
    renderer.setPixelRatio(1); renderer.setSize(160, 180, false);
    for (const id of SURVIVAL_AGENT_IDS) {
      const { actor } = createCharacter(id); scene.add(actor);
      try { renderer.render(scene, camera); portraits[id] = renderer.domElement.toDataURL("image/png"); }
      finally { scene.remove(actor); disposeCharacter(actor); }
    }
  } finally { renderer.setPixelRatio(dpr); renderer.setSize(size.x, size.y, false); }
  return portraits;
}
