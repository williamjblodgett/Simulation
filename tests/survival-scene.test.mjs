import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { createCharacter, disposeCharacter } from "../app/survival/scene/character-model.ts";
import { createResourceCollection, createAgentCollection } from "../app/survival/scene/scene-models.ts";
import { createTerrainWorld, terrainHeightAt, terrainWaterHeight, waterLocalPoint } from "../app/survival/scene/terrain-world.ts";
import { waterDepth } from "../app/simulation/survival/water.ts";
import { SURVIVAL_AGENT_IDS, SURVIVAL_AGENT_COLORS } from "../app/survival/scene/types.ts";

test("all five world/portrait identities have consistent scale, colors and forward-facing geometry", () => {
  for (const id of SURVIVAL_AGENT_IDS) {
    const { actor, leftArm, rightArm } = createCharacter(id);
    const bounds = new THREE.Box3().setFromObject(actor), size = bounds.getSize(new THREE.Vector3());
    assert.ok(size.y > 2 && size.y < 2.6);
    assert.ok(size.x < 1.3);
    assert.equal(leftArm.parent, actor); assert.equal(rightArm.parent, actor);
    const colors = new Set();
    actor.traverse(object => { if (object instanceof THREE.Mesh) colors.add(`#${object.material.color.getHexString()}`); });
    assert.ok(colors.has(SURVIVAL_AGENT_COLORS[id]));
    // Nose extends along +Z, which turns toward +X for heading +PI/2.
    const nose = actor.children.find(object => object.position.z > .29);
    assert.ok(nose);
    actor.rotation.y = Math.PI / 2;
    assert.ok(nose.getWorldPosition(new THREE.Vector3()).x > .29);
    disposeCharacter(actor);
  }
});

test("resource silhouettes use only present, visible stock and never mutate it", () => {
  const collection = createResourceCollection();
  const nodes = ["food", "timber", "stone", "fiber", "medicine", "clay", "ore", "freshwater"].map((kind, i) => ({ id: kind, kind, position: {x:i,z:i}, available: 1 }));
  const original = structuredClone(nodes);
  collection.sync(nodes, () => 2);
  for (const node of nodes) {
    const mesh = collection.group.getObjectByName(`instanced-resource-${node.kind}`);
    assert.equal(mesh.count, node.kind === "freshwater" ? 0 : 1);
    assert.ok(mesh.geometry.getAttribute("color"));
    assert.ok(mesh.geometry.getAttribute("position").array.every(Number.isFinite));
  }
  assert.deepEqual(nodes, original);
  collection.sync(nodes.map(node => ({...node, available: 0})), () => 2);
  assert.ok(collection.group.children.every(mesh => mesh.count === 0));
  collection.sync(nodes.map(node => ({...node, visible: false})), () => 2);
  assert.ok(collection.group.children.every(mesh => mesh.count === 0));
  collection.dispose();
});

test("decorative groves are reproducible and terrain placement shares one height function", () => {
  const terrain = { seed: 109, halfSize: 32, islandRadius: 64, elevationScale: 4, vegetationDensity:.6, freshwater: [{ id:"pond", position:{x:4,z:6},radiusX:2,radiusZ:2 }] };
  const first = createTerrainWorld(terrain), second = createTerrainWorld(terrain);
  const a = first.group.getObjectByName("instanced-tree-crowns"), b = second.group.getObjectByName("instanced-tree-crowns");
  assert.deepEqual(a.instanceMatrix.array, b.instanceMatrix.array);
  assert.ok(a.count > 100);
  for (const point of [{x:4,z:6},{x:31,z:31},{x:-31,z:-31}]) assert.equal(first.heightAt(point), terrainHeightAt(terrain, point));
  first.dispose(); second.dispose();
});

test("rotated water, shoreline and meadow exclusions share the engine's clockwise footprint", () => {
  const pond={id:"rotated",position:{x:4,z:6},radiusX:9,radiusZ:1,rotation:Math.PI/4};
  const terrain={seed:109,halfSize:32,islandRadius:64,elevationScale:4,vegetationDensity:.6,flatStudy:true,freshwater:[pond]};
  const world=createTerrainWorld(terrain);
  const water=world.group.getObjectByName("freshwater-rotated");
  world.group.updateMatrixWorld(true);
  const edge=water.localToWorld(new THREE.Vector3(1,0,0));
  const local=waterLocalPoint(pond,edge);
  assert.ok(Math.abs(local.x-pond.radiusX)<1e-8);
  assert.ok(Math.abs(local.z)<1e-8);
  assert.ok(terrainHeightAt(terrain,{x:4,z:6})<1.5);
  const p=new THREE.Vector3(),matrix=new THREE.Matrix4();
  for(const name of ["instanced-tree-trunks","instanced-meadow"]){
    const mesh=world.group.getObjectByName(name);
    for(let i=0;i<mesh.count;i++){
      mesh.getMatrixAt(i,matrix);p.setFromMatrixPosition(matrix);
      const q=waterLocalPoint(pond,p);
      assert.ok(Math.hypot(q.x/pond.radiusX,q.z/pond.radiusZ)>=1,`${name} overlaps pond`);
    }
  }
  let disposed=0;
  world.group.traverse(object=>{if(object instanceof THREE.InstancedMesh)object.addEventListener("dispose",()=>disposed++);});
  world.dispose();
  assert.equal(disposed,5);
});

test("articulated legs move at the hip and seated feet remain above the study surface",()=>{
  for(const id of SURVIVAL_AGENT_IDS){
    const {actor,leftLeg,rightLeg}=createCharacter(id);
    assert.equal(leftLeg.parent,actor);assert.equal(rightLeg.parent,actor);
    leftLeg.rotation.x=-1.22;rightLeg.rotation.x=-1.22;actor.position.y=-.49;
    const bounds=new THREE.Box3().setFromObject(actor);
    assert.ok(bounds.min.y>=0,`${id} seated feet clip`);
    assert.ok(bounds.max.y<2);
    disposeCharacter(actor);
  }
});

test("water poses use real depth, keep the head above the surface and reset cleanly on land",()=>{
  const previous=globalThis.document;
  globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>null})};
  const collection=createAgentCollection();
  try{
    const agent={id:"A1",position:{x:0,z:0},heading:0,alive:true,status:"moving",action:{kind:"move",label:"Swimming"},carriedItem:null,needs:{health:1,hydration:1,energy:1},waterDepth:2.1};
    collection.sync([agent],"A1",()=>1.3);collection.animate(1,true);
    const root=collection.group.getObjectByName("agent-A1"),actor=root.children[0];
    assert.ok(actor.rotation.x>.9);assert.equal(root.position.y,1.3);
    root.updateWorldMatrix(true,true);
    const bounds=new THREE.Box3().setFromObject(actor);assert.ok(bounds.max.y>1.3);
    collection.sync([{...agent,waterDepth:.4}],"A1",()=>1.3);collection.animate(2,true);
    assert.equal(actor.rotation.x,0);assert.equal(actor.position.y,-.4);
    collection.sync([{...agent,waterDepth:0}],"A1",()=>1.5);collection.animate(3,true);
    assert.equal(actor.rotation.x,0);assert.equal(actor.position.y,0);assert.equal(actor.position.z,0);
  }finally{collection.dispose();if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
  const feature={position:{x:0,z:0},radiusX:6,radiusZ:4,rotation:.7};
  const terrain={seed:109,halfSize:32,flatStudy:true,freshwater:[{id:"pond",...feature}]};
  for(const p of [{x:0,z:0},{x:1,z:1}])assert.ok(Math.abs(terrainWaterHeight(terrain,feature)+.02-terrainHeightAt(terrain,p)-waterDepth(feature,p))<1e-8);
});
