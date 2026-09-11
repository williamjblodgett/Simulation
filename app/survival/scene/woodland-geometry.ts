import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/** Deterministic, bounded visual assets. They supply no stock, cover or collision. */
export function visualRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let mixed = Math.imul(value ^ (value >>> 15), value | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function merge(parts: THREE.BufferGeometry[]) {
  const result = mergeGeometries(parts)!;
  parts.forEach(part => part.dispose());
  return result;
}

function branch(from: THREE.Vector3, to: THREE.Vector3, radius: number) {
  const delta = to.clone().sub(from);
  const geometry = new THREE.CylinderGeometry(radius * .38, radius, delta.length(), 6);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()));
  geometry.translate(...from.clone().add(to).multiplyScalar(.5).toArray());
  return geometry;
}

function leafCloud(centers: Array<{point: THREE.Vector3; radius: number}>, pine: boolean) {
  const random = visualRandom(pine ? 271 : 137);
  const positions: number[] = [], colors: number[] = [], uvs: number[] = [];
  const color = new THREE.Color();
  // Folded, pointed leaf sprays with open space between them, not solid crowns.
  for (const center of centers) for (let n = 0; n < (pine ? 11 : 22); n++) {
    const angle = random() * Math.PI * 2, distance = Math.sqrt(random()) * center.radius;
    const point = center.point.clone().add(new THREE.Vector3(Math.cos(angle) * distance, (random() - .5) * center.radius * .7, Math.sin(angle) * distance));
    const length = (pine ? .28 : .20) + random() * .20;
    const width = length * (pine ? .85 : .52);
    const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler((random() - .5) * 1.6, random() * 6.28, (random() - .5) * .9));
    const vertices = [[0,.035,0],[-width,0,0],[0,0,length],[0,.035,0],[0,0,length],[width,0,0], [0,.035,0],[width,0,0],[0,0,-length*.8],[0,.035,0],[0,0,-length*.8],[-width,0,0]];
    color.setHSL(pine ? .24 + random() * .035 : .20 + random() * .06, .24 + random() * .2, .29 + random() * .18);
    const leafUvs=[[.5,.5],[0,.5],[.5,1],[.5,.5],[.5,1],[1,.5],[.5,.5],[1,.5],[.5,0],[.5,.5],[.5,0],[0,.5]];
    for (const [index,v] of vertices.entries()) {
      const p = new THREE.Vector3(...v as [number,number,number]).applyQuaternion(rotation).add(point);
      positions.push(p.x,p.y,p.z); colors.push(color.r,color.g,color.b);
      uvs.push(...leafUvs[index]);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors,3));
  geometry.setAttribute("uv",new THREE.Float32BufferAttribute(uvs,2));
  geometry.computeVertexNormals();
  return geometry;
}

/** A small authored leaf-spray mask, not a downloaded image or a world resource. */
export function foliageAlphaTexture() {
  const size=128,data=new Uint8Array(size*size*4);
  const leaves=Array.from({length:8},(_,i)=>({x:.5+(i%2?1:-1)*(.11+Math.sin(i*1.2)*.025),y:.22+i*.08,angle:i%2?-.7:.7}));
  for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
    const u=x/(size-1),v=y/(size-1);
    let alpha=Math.abs(u-.5)<.012&&v>.08&&v<.9?1:0;
    for(const leaf of leaves) {
      const dx=u-leaf.x,dy=v-leaf.y,c=Math.cos(leaf.angle),s=Math.sin(leaf.angle);
      const a=(c*dx-s*dy)/.17,b=(s*dx+c*dy)/.085;
      alpha=Math.max(alpha,THREE.MathUtils.clamp((1-a*a-b*b)*8,0,1));
    }
    const i=(y*size+x)*4;data[i]=data[i+1]=data[i+2]=Math.round(alpha*255);data[i+3]=255;
  }
  const texture=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);
  // Ordinary averaged alpha mips erase thin foliage at overview distances.
  // This tiny mask uses linear sampling + MSAA coverage instead.
  texture.generateMipmaps=false;texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;texture.needsUpdate=true;
  return texture;
}

export function woodlandTree(pine = false) {
  const trunks: THREE.BufferGeometry[] = [];
  const centers: Array<{point: THREE.Vector3;radius: number}> = [];
  const origin = new THREE.Vector3(0,0,0);
  trunks.push(branch(origin, new THREE.Vector3(.09, pine ? 6.8 : 5.2, -.05), .19));
  if (pine) {
    for (let tier = 0; tier < 7; tier++) for (let j = 0; j < 5; j++) {
      const angle = j * Math.PI * .4 + tier * 2.4;
      const length = (1 - tier / 9) * (1.48 + Math.sin(j * 3 + tier) * .25);
      const start = new THREE.Vector3(0, 1.65 + tier * .70, 0);
      const end = new THREE.Vector3(Math.cos(angle) * length, start.y + .16, Math.sin(angle) * length);
      trunks.push(branch(start, end, .044 * (1 - tier * .08)));
      centers.push({point:end.clone().lerp(start,.16),radius:length*.38});
    }
    centers.push({point:new THREE.Vector3(.05,6.4,0),radius:.3});
  } else {
    for (let i = 0; i < 11; i++) {
      const angle = i * 2.39996, height = 2.9 + (i % 4) * .62;
      const spread = 1.25 + (i % 3) * .28;
      const start = new THREE.Vector3(0, height - .9, 0);
      const end = new THREE.Vector3(Math.cos(angle) * spread, height + .4, Math.sin(angle) * spread);
      trunks.push(branch(start,end,.065));
      centers.push({point:end,radius:.78});
      centers.push({point:end.clone().lerp(start,.4).add(new THREE.Vector3(0,.35,0)),radius:.64});
    }
    centers.push({point:new THREE.Vector3(.05,5.8,0),radius:.85});
  }
  return {trunk:merge(trunks),crown:leafCloud(centers,pine)};
}

export function shrubGeometry() {
  return leafCloud([-1,0,1].map(i=>({point:new THREE.Vector3(i*.36,.48+(i===0?.18:0),0),radius:.38})),false);
}

export function fracturedRockGeometry(seed = 29) {
  const geometry = new THREE.IcosahedronGeometry(1,1);
  const position = geometry.getAttribute("position");
  const colors: number[] = [];
  const stone = new THREE.Color("#858782"), lichen = new THREE.Color("#868568"), shade = new THREE.Color("#525952");
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    // Continuous deformation keeps duplicated face vertices watertight.
    const fracture = 1 + Math.sin(x*7 + z*3 + seed)*.11 + Math.sin(y*9-z*4)*.09;
    position.setXYZ(i, x * fracture, Math.max(-.55, Math.min(.72,y*fracture)), z*fracture*.86);
    const tint = stone.clone().lerp(shade, Math.max(0,-y)*.45);
    if (y > .12) tint.lerp(lichen, Math.max(0,Math.sin(x*16+z*12))* .42);
    colors.push(tint.r,tint.g,tint.b);
  }
  geometry.setAttribute("color",new THREE.Float32BufferAttribute(colors,3));
  geometry.computeVertexNormals();
  return geometry;
}

export function fernGeometry() {
  const positions: number[] = [], colors: number[] = [];
  const tint = new THREE.Color();
  for(let frond=0;frond<7;frond++) {
    const angle=frond*2.39996, length=.55+(frond%3)*.16;
    for(let pair=1;pair<8;pair++) for(const side of [-1,1]) {
      const t=pair/8, radial=t*length, y=Math.sin(t*Math.PI*.85)*.43;
      const base=new THREE.Vector3(Math.cos(angle)*radial,y,Math.sin(angle)*radial);
      const width=(1-t)*.25;
      const tip=base.clone().add(new THREE.Vector3(Math.cos(angle+side*1.05)*width,.018,Math.sin(angle+side*1.05)*width));
      const end=base.clone().add(new THREE.Vector3(Math.cos(angle)*.095,.025,Math.sin(angle)*.095));
      tint.setHSL(.23,.30,.25+t*.12);
      for(const p of [base,tip,end]){positions.push(p.x,p.y,p.z);colors.push(tint.r,tint.g,tint.b);}
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute("color",new THREE.Float32BufferAttribute(colors,3));
  geometry.computeVertexNormals();
  return geometry;
}
