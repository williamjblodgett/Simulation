import * as THREE from "three";
import type { PhysicalWorld } from "../../simulation/survival/physical-types";

/** One instanced draw per material. Poses/dimensions are the actual solver state, not prefab tiers. */
export function createPhysicalCollection(){
  const group=new THREE.Group();group.name="authoritative-physical-parts";
  const geometry=new THREE.BoxGeometry(1,1,1),jointGeometry=new THREE.CylinderGeometry(0.025,0.025,1,5);
  const palette={wood:"#96704b",stone:"#889194",fiber:"#b7a677",clay:"#ae775a"};
  const meshes=Object.entries(palette).map(([kind,color])=>{const mesh=new THREE.InstancedMesh(geometry,new THREE.MeshStandardMaterial({color,roughness:0.93}),800);mesh.name=kind;mesh.count=0;mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);return mesh;});
  const bindings=new THREE.InstancedMesh(jointGeometry,new THREE.MeshStandardMaterial({color:"#cbb681",roughness:1}),240);bindings.count=0;group.add(bindings);
  const dummy=new THREE.Object3D(),color=new THREE.Color();
  const sync=(world?:PhysicalWorld)=>{
    const counts:Record<string,number>={wood:0,stone:0,fiber:0,clay:0};
    for(const p of world?.parts??[]){
      const kind=Object.entries(p.composition).sort((a,b)=>b[1]-a[1])[0][0],mesh=meshes.find(m=>m.name===kind)!;
      const draw=(x:number,y:number,z:number,sx:number,sy:number,sz:number)=>{
        dummy.position.set(p.position.x+x*Math.cos(p.rotation)-z*Math.sin(p.rotation),1.5+p.position.y+y,p.position.z+x*Math.sin(p.rotation)+z*Math.cos(p.rotation));dummy.rotation.set(0,-p.rotation,0);dummy.scale.set(sx,sy,sz);dummy.updateMatrix();
        mesh.setMatrixAt(counts[kind],dummy.matrix);color.set(p.condition<=0.05?"#575551":palette[kind as keyof typeof palette]).multiplyScalar(0.6+p.condition*0.4);mesh.setColorAt(counts[kind]++,color);
      };
      if(p.hollow>0){
        let low=0,high=Math.min(p.size.x/2,p.size.z/2,p.size.y);const cavity=p.size.x*p.size.y*p.size.z*p.hollow;
        for(let i=0;i<24;i++){const t=(low+high)/2;if((p.size.x-2*t)*(p.size.z-2*t)*(p.size.y-t)>cavity)low=t;else high=t;}
        const t=(low+high)/2;
        draw(0,-p.size.y/2+t/2,0,p.size.x,t,p.size.z);
        draw(-p.size.x/2+t/2,t/2,0,t,p.size.y-t,p.size.z);draw(p.size.x/2-t/2,t/2,0,t,p.size.y-t,p.size.z);
        draw(0,t/2,-p.size.z/2+t/2,p.size.x-2*t,p.size.y-t,t);draw(0,t/2,p.size.z/2-t/2,p.size.x-2*t,p.size.y-t,t);
      }else draw(0,0,0,p.size.x,p.size.y,p.size.z);
    }
    for(const mesh of meshes){mesh.count=counts[mesh.name];mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;mesh.computeBoundingSphere();}
    let count=0;for(const j of world?.joints??[]){const a=world!.parts.find(p=>p.id===j.a),b=world!.parts.find(p=>p.id===j.b);if(!a||!b||j.condition<=0)continue;
      const start=new THREE.Vector3(a.position.x,1.5+a.position.y,a.position.z),end=new THREE.Vector3(b.position.x,1.5+b.position.y,b.position.z),direction=end.clone().sub(start);
      dummy.position.copy(start).add(end).multiplyScalar(0.5);dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.clone().normalize());dummy.scale.set(1,direction.length(),1);dummy.updateMatrix();bindings.setMatrixAt(count++,dummy.matrix);
    }bindings.count=count;bindings.instanceMatrix.needsUpdate=true;bindings.computeBoundingSphere();
  };
  return {group,sync,dispose:()=>{geometry.dispose();jointGeometry.dispose();for(const mesh of [...meshes,bindings]){mesh.material.dispose();mesh.dispose();}group.clear();}};
}
