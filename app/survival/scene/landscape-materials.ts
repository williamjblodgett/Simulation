import * as THREE from "three";
import type { HabitatWaterFeature } from "./types";

/** Procedural surface detail: no texture download, stock photos, or extra terrain. */
export function meadowMaterial(ponds: HabitatWaterFeature[] = []) {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  material.onBeforeCompile = shader => {
    shader.uniforms.ponds = {value: ponds.map(p => new THREE.Vector4(p.position.x,p.position.z,p.radiusX,p.radiusZ))};
    shader.uniforms.pondAngles = {value: ponds.map(p => p.rotation ?? 0)};
    shader.vertexShader = `varying vec3 vGroundPosition;\n${shader.vertexShader}`.replace("#include <begin_vertex>", "#include <begin_vertex>\nvGroundPosition = position;");
    shader.fragmentShader = `${ponds.length ? `uniform vec4 ponds[${ponds.length}]; uniform float pondAngles[${ponds.length}];` : ""}
      varying vec3 vGroundPosition;
      float groundHash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float groundNoise(vec2 p) { vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(groundHash(i),groundHash(i+vec2(1.,0.)),f.x),mix(groundHash(i+vec2(0.,1.)),groundHash(i+1.),f.x),f.y); }
      ${shader.fragmentShader}`.replace("#include <color_fragment>", `#include <color_fragment>
        ${ponds.length ? `for(int i=0;i<${ponds.length};i++) {
          vec2 d=vGroundPosition.xz-ponds[i].xy;
          float c=cos(pondAngles[i]),s=sin(pondAngles[i]);
          vec2 local=vec2(c*d.x-s*d.y,s*d.x+c*d.y)/ponds[i].zw;
          if(length(local)<1.17) discard;
        }` : ""}
        float grain = groundNoise(vGroundPosition.xz*12.0);
        float patches = groundNoise(vGroundPosition.xz*.34);
        float blades = groundNoise(vGroundPosition.xz*vec2(44.,7.));
        diffuseColor.rgb *= .91 + grain*.12 + blades*.035;
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb*vec3(1.11,.95,.78), smoothstep(.46,.78,patches)*.28);
      `);
  };
  material.customProgramCacheKey = () => `observatory-meadow-v2-${ponds.length}`;
  return material;
}

export function basinMaterial() {
  const material = new THREE.MeshStandardMaterial({ color: "#317e89", roughness: .29, metalness: .2, transparent: true, opacity: .92 });
  material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
      vec2 p = vUv - .5;
      float depth = 1.0-smoothstep(.28,.51,length(p));
      float ripples = sin(vUv.x*116.0+sin(vUv.y*57.0)*2.0)*sin(vUv.y*130.0+vUv.x*9.0);
      diffuseColor.rgb *= mix(vec3(1.1,1.42,1.24),vec3(.39,.75,.88),depth);
      diffuseColor.rgb += vec3(.012,.025,.025)*smoothstep(.72,1.0,ripples);
    `);
  };
  // The circle's UV field maps depth and still ripples; no fictitious current.
  material.defines = { USE_UV: "" };
  material.customProgramCacheKey = () => "observatory-basin-v1";
  return material;
}
