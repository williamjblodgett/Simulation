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
        float litter = groundNoise(vGroundPosition.xz*2.8);
        float seams = smoothstep(.49,.51, groundNoise(vGroundPosition.xz*17.0));
        diffuseColor.rgb *= .80 + grain*.21 + blades*.045;
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb*vec3(.83,.76,.60), smoothstep(.38,.76,patches)*.6);
        diffuseColor.rgb += vec3(.10,.077,.040)*smoothstep(.68,.77,litter)*seams;
      `);
  };
  material.customProgramCacheKey = () => `observatory-meadow-v3-${ponds.length}`;
  return material;
}

export function basinMaterial() {
  const material = new THREE.MeshStandardMaterial({ color: "#527e7c", roughness: .20, metalness: .05, transparent: true, opacity: .78, depthWrite:false });
  material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
      vec2 p = vUv - .5;
      float depth = 1.0-smoothstep(.28,.51,length(p));
      float ripples = sin(vUv.x*116.0+sin(vUv.y*57.0)*2.0)*sin(vUv.y*130.0+vUv.x*9.0);
      diffuseColor.rgb *= mix(vec3(1.12,1.22,.98),vec3(.30,.62,.66),depth);
      diffuseColor.rgb += vec3(.036,.05,.044)*smoothstep(.65,1.0,ripples);
      diffuseColor.a *= mix(.52,1.,depth);
    `);
    shader.fragmentShader=shader.fragmentShader.replace("#include <normal_fragment_begin>",`#include <normal_fragment_begin>
      normal = normalize(normal + vec3(sin(vUv.x*186.+sin(vUv.y*60.))*.025, cos(vUv.y*164.)*.025, 0.));
    `);
  };
  // The circle's UV field maps depth and still ripples; no fictitious current.
  material.defines = { USE_UV: "" };
  material.customProgramCacheKey = () => "observatory-basin-v2";
  return material;
}
