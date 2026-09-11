import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { SURVIVAL_AGENT_COLORS, SURVIVAL_AGENT_IDS, type SurvivalAgentId } from "./types";

/** Shared observation avatars: these identifiers confer no traits or equipment. */
export function createCharacter(id: SurvivalAgentId) {
  const index = SURVIVAL_AGENT_IDS.indexOf(id);
  const actor = new THREE.Group();
  const mat = (color: string) => new THREE.MeshStandardMaterial({ color, roughness: .94 });
  const fabric = mat(["#536b83", "#966f53", "#637458", "#756580", "#a19359"][index]);
  const identity = mat(SURVIVAL_AGENT_COLORS[id]);
  const skin = mat(["#b98261", "#d9aa82", "#86553e", "#c5916d", "#a97453"][index]);
  const hair = mat(["#302a27", "#644331", "#252523", "#412d28", "#38312b"][index]);
  const dark = mat("#3c403a"), eye = mat("#222825"), white = mat("#bfb4a0");
  const boot = mat("#494337"), seam = mat("#a39c87");
  const add = (geometry: THREE.BufferGeometry, material: THREE.MeshStandardMaterial, x: number, y: number, z: number, parent: THREE.Object3D = actor) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  };
  const oval = (x: number, y: number, z: number) => { const g = new THREE.SphereGeometry(1, 16, 12); g.scale(x, y, z); return g; };
  const tapered = (top: number, bottom: number, height: number, depth = 1) => {
    const g = new THREE.CylinderGeometry(top, bottom, height, 12, 3); g.scale(1, 1, depth); return g;
  };
  const cloth = (rings: Array<[number,number,number]>) => {
    const points: number[]=[],indices: number[]=[];
    for(let j=0;j<rings.length;j++) for(let i=0;i<=20;i++) {
      const angle=i/20*Math.PI*2,[y,width,depth]=rings[j];
      const fold=1+Math.sin(angle*6+j*.7)*.026;
      points.push(Math.sin(angle)*width*fold,y,Math.cos(angle)*depth*fold);
      if(j<rings.length-1&&i<20){const a=j*21+i;indices.push(a,a+1,a+21,a+1,a+22,a+21);}
    }
    const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.Float32BufferAttribute(points,3));g.setIndex(indices);g.computeVertexNormals();return g;
  };
  // Neutral base garment, not fabricated packs or occupation-specific equipment.
  add(cloth([[1.07,.255,.165],[1.14,.26,.18],[1.30,.267,.175],[1.53,.32,.195],[1.64,.337,.18],[1.73,.22,.14],[1.76,.12,.10]]),fabric,0,0,0);
  add(tapered(.25, .27, .20, .65), dark, 0, 1.03, 0);
  add(tapered(.263,.263,.045,.64),dark,0,1.11,0);
  add(new THREE.BoxGeometry(.013, .55, .009), seam, 0, 1.425, .187);
  add(new THREE.BoxGeometry(.025,.05,.014),dark,0,1.62,.199);
  for(const side of [-1,1]) {
    add(oval(.095,.075,.011),fabric,side*.14,1.26,.175).rotation.z=side*.13;
    add(new THREE.BoxGeometry(.13,.01,.013),dark,side*.14,1.31,.191).rotation.z=side*.22;
    add(oval(.155,.07,.098),fabric,side*.105,1.733,-.05).rotation.z=side*-.45;
    add(new THREE.BoxGeometry(.007,.16,.008),seam,side*.07,1.64,.165);
    add(oval(.04,.11,.01),identity,side*.28,1.54,.12).rotation.z=side*.2;
  }
  // Folded hood and collar are authored neutral clothing, not acquired equipment.
  add(oval(.20,.15,.08),fabric,0,1.67,-.185);
  add(tapered(.092, .11, .18), skin, 0, 1.78, 0);
  const faceStart=actor.children.length;
  add(oval(.185, .225, .17), skin, 0, 2.015, .005).name = "face";
  add(oval(.145, .104, .137), skin, 0, 1.872, .026);
  for (const side of [-1, 1]) {
    add(oval(.03, .06, .025), skin, side * .185, 2.01, -.002);
    add(oval(.03, .013, .012), white, side * .067, 2.045, .160);
    add(oval(.011, .012, .007), eye, side * .064, 2.044, .172);
    add(oval(.042,.012,.012),hair,side*.065,2.078,.160).rotation.z=side*-.13;
  }
  add(oval(.028, .05, .034), skin, 0, 2.003, .196).name="nose";
  add(oval(.045, .008, .008), mat("#805c4d"), 0, 1.924, .161);
  add(new THREE.SphereGeometry(.194, 18, 12, 0, Math.PI * 2, 0, Math.PI * .56), hair, 0, 2.095, -.03).scale.set(1,.81,.94);
  if (index === 0) {
    for (let i = 0; i < 6; i++) add(oval(.075, .054, .107), hair, -.12 + i * .045, 2.255 - i * .012, .03).rotation.z = -.35;
  } else if (index === 1) {
    add(oval(.10, .085, .11), hair, 0, 2.17, -.184);
    add(oval(.037, .13, .045), hair, -.17, 2.09, -.035);
  } else if (index === 2) {
    for (let i = 0; i < 12; i++) add(oval(.062, .067, .065), hair, Math.cos(i * 2.4) * .14, 2.23 + (i % 2) * .014, Math.sin(i * 2.4) * .12);
  } else if (index === 3) {
    add(oval(.18, .20, .077), hair, 0, 2.02, -.13);
    add(oval(.065, .16, .06), hair, -.17, 2.07, .015);
    add(oval(.060, .13, .06), hair, .17, 2.10, -.005);
  } else {
    add(oval(.17, .068, .14), hair, .022, 2.25, -.015).rotation.z = .15;
  }
  // Roughly seven-head adult silhouette, including hair; no oversized toy head.
  for(const object of actor.children.slice(faceStart)) {
    object.position.x*=.78;object.position.z*=.78;
    object.position.y=1.82+(object.position.y-1.78)*.72;
    object.scale.multiply(new THREE.Vector3(.78,.72,.78));
  }
  const limb = (side: number, arm: boolean) => {
    const geometry = tapered(arm ? .113 : .125, arm ? .085 : .095, arm ? .32 : .42, arm ? .9 : .95);
    geometry.translate(0, arm ? -.16 : -.21, 0);
    const pivot = add(geometry, arm ? fabric : dark, side * (arm ? .343 : .145), arm ? 1.62 : .95, 0);
    pivot.name = `${side < 0 ? "left" : "right"}-${arm ? "arm" : "leg"}`;
    const lower = add(tapered(arm ? .092 : .105, arm ? .073 : .083, arm ? .28 : .35), arm ? fabric : dark, 0, arm ? -.445 : -.57, 0, pivot);
    lower.name = "lower-limb";
    if (arm) {
      add(tapered(.076,.076,.045),dark,0,-.58,0,pivot);
      add(oval(.061, .10, .042), skin, 0, -.66, .012, pivot);
      add(oval(.025,.056,.025),skin,side*-.055,-.65,.024,pivot);
      pivot.rotation.z = side * .10;
    } else {
      add(oval(.099, .10, .171), boot, 0, -.85, .045, pivot);
      add(tapered(.09,.1,.14,1.08),boot,0,-.76,0,pivot);
      add(oval(.101,.025,.17),dark,0,-.91,.045,pivot);
      for(let i=0;i<3;i++)add(new THREE.BoxGeometry(.09,.012,.01),seam,0,-.81-i*.025,.16,pivot);
    }
    return pivot;
  };
  const leftArm=limb(-1,true),rightArm=limb(1,true),leftLeg=limb(-1,false),rightLeg=limb(1,false);
  for(const object of actor.children){object.position.y*=1.10;object.scale.y*=1.10;}
  // Batch static facial/clothing surfaces by material; retain limb pivots and
  // the forward facial landmark. This reduces five-character draw overhead.
  for(const parent of [actor,leftArm,rightArm,leftLeg,rightLeg]) {
   const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
   for(const part of [...parent.children]) {
    if(!(part instanceof THREE.Mesh)||part.children.length||part.name==="nose"||Array.isArray(part.material))continue;
    part.updateMatrix();
    const geometry=part.geometry.clone().applyMatrix4(part.matrix);
    geometry.deleteAttribute("uv");
    batches.set(part.material,[...(batches.get(part.material)??[]),geometry]);
    parent.remove(part);part.geometry.dispose();
   }
   for(const [material,geometries] of batches) {
    const mesh=new THREE.Mesh(mergeGeometries(geometries)!,material);
    mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);geometries.forEach(g=>g.dispose());
   }
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
  scene.background = new THREE.Color("#121c22");
  scene.add(new THREE.HemisphereLight("#e4f1ff", "#819186", 1.7));
  const light = new THREE.DirectionalLight("#ffe2bc", 2.3);
  light.position.set(-3, 5, 5); scene.add(light);
  const rim = new THREE.DirectionalLight("#a3b3b6", 1.4); rim.position.set(3, 3, -2); scene.add(rim);
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
          const half = full ? 1.18 : .46;
          camera.left = -half; camera.right = half; camera.top = half * 1.125; camera.bottom = -half * 1.125;
          camera.position.set(.85, full ? 1.9 : 2.14, 5);
          camera.lookAt(0, full ? 1.24 : 2.10, 0); camera.updateProjectionMatrix();
          renderer.render(scene, camera);
          portraits[full ? `${id}-figure` : id] = renderer.domElement.toDataURL("image/png");
        }
      } finally { scene.remove(actor); disposeCharacter(actor); }
    }
  } finally { renderer.setPixelRatio(dpr); renderer.setSize(size.x, size.y, false); }
  return portraits;
}
