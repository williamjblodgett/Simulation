import * as THREE from "three";
import type { DevelopmentWorld } from "../../simulation/survival/development-types";

/** Aggregate components are rendered from actual geometry, stored contents and
 * running output. Four shared instanced collections, not a renderer per object. */
export function createDevelopmentCollection() {
  const group=new THREE.Group();group.name="realized-development";
  const geometries={box:new THREE.BoxGeometry(1,1,1),cylinder:new THREE.CylinderGeometry(.5,.5,1,16),ring:new THREE.TorusGeometry(.4,.075,6,20),sphere:new THREE.SphereGeometry(.5,8,6)};
  function collection(geometry: THREE.BufferGeometry) {
    const mesh=new THREE.InstancedMesh(geometry,new THREE.MeshStandardMaterial({roughness:.72,metalness:.15}),3200);
    mesh.count=0;mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);return mesh;
  }
  const meshes={box:collection(geometries.box),cylinder:collection(geometries.cylinder),ring:collection(geometries.ring),sphere:collection(geometries.sphere)};
  const dummy=new THREE.Object3D(),color=new THREE.Color();
  const palette={wood:"#876344",stone:"#939a9d",fiber:"#bab091",clay:"#b77f59",metal:"#9aabb5",ceramic:"#bd9878"};
  function sync(world:DevelopmentWorld|undefined,time:number,selectedId?:string|null) {
    const counts={box:0,cylinder:0,ring:0,sphere:0};
    let componentId:string|null=null;
    for(const mesh of Object.values(meshes))mesh.userData.componentIds=[];
    function draw(shape:keyof typeof meshes,x:number,y:number,z:number,sx:number,sy:number,sz:number,tint:string,rx=0,ry=0,rz=0) {
      const mesh=meshes[shape],index=counts[shape]++; if(index>=3200)return;
      mesh.userData.componentIds[index]=componentId;
      dummy.position.set(x,y+1.5,z);dummy.rotation.set(rx,ry,rz);dummy.scale.set(sx,sy,sz);dummy.updateMatrix();mesh.setMatrixAt(index,dummy.matrix);color.set(tint);mesh.setColorAt(index,color);
    }
    for(const c of world?.components??[]) {
      componentId=c.id;
      const {x,z}=c.position,s=c.size,paint=c.id===selectedId?"#b9d5df":c.condition<.12?"#56564f":palette[c.material];
      const angle=c.output>.001?time*.006:0;
      if(["vessel","chamber","cell"].includes(c.form)) {
        draw("cylinder",x,.1*s,z,.65*s,.2*s,.65*s,paint);
        for(let level=0;level<5;level++)draw("ring",x,(.18+level*.11)*s,z,.74*s,.74*s,.7*s,paint,Math.PI/2);
        if(c.water>.01)draw("cylinder",x,Math.min(.65,.18+c.water/(s*s))*s,z,.49*s,.025,.49*s,"#438a9c");
        if(c.form==="cell")for(const direction of [-1,1])draw("cylinder",x+direction*.12*s,.79*s,z,.09*s,.13*s,.09*s,"#b8b9a9");
        if(c.form==="chamber")draw("cylinder",x+.18*s,1.0*s,z,.12*s,.65*s,.12*s,paint);
      } else if(c.form==="panel") {
        draw("box",x,.5*s,z,.7*s,s,c.thickness*s,paint,0,c.orientation);
        for(const side of [-1,1])draw("box",x+side*.2*s,.1*s,z,.12*s,.2*s,.65*s,paint);
      } else if(["bed","rack","record"].includes(c.form)) {
        draw("box",x,.12*s,z,.7*s,.2*s,.7*s,c.form==="bed"?"#50452f":paint);
        for(const side of [-1,1]){draw("box",x+side*.31*s,.25*s,z,.08*s,.4*s,.7*s,paint);draw("box",x,.25*s,z+side*.31*s,.7*s,.4*s,.08*s,paint);}
        if(c.form==="bed"&&c.seedMass>0)for(const dx of [-.18,0,.18])for(const dz of [-.18,.18])draw("sphere",x+dx*s,.3*s+Math.min(.2,c.growth*.2),z+dz*s,.15*s,.2*s,.15*s,"#728957");
        if(c.form==="rack"&&c.food>0)draw("sphere",x,.42*s,z,.3*s,.16*s,.3*s,"#c09557");
        if(c.form==="record")for(let line=0;line<(c.document?4:0);line++)draw("box",x,.23*s,z+(line-1.5)*.09*s,.42*s,.014,.022,"#403a30");
      } else {
        draw("box",x,.12*s,z,.65*s,.22*s,.65*s,"#635d52");
        draw("box",x,.55*s,z,.14*s,.9*s,.14*s,paint);
        if(["rotor","gear"].includes(c.form)) {
          draw("ring",x,.95*s,z,.74*s,.74*s,.5*s,paint,0,0,angle);
          for(let spoke=0;spoke<4;spoke++){const theta=spoke*Math.PI/2+angle;draw("box",x+Math.sin(theta)*.14*s,.95*s+Math.cos(theta)*.14*s,z,.08*s,.45*s,.07*s,paint,0,0,-theta);}
        } else if(c.form==="coil") {
          for(let winding=0;winding<6;winding++)draw("ring",x,.55*s,z+(winding-2.5)*.06*s,.42*s,.42*s,.42*s,"#b08251");
        } else if(c.form==="filament")draw("sphere",x,.8*s,z,.22*s,.32*s,.22*s,c.output>.001?"#ffe7ab":"#8b8580");
        else if(c.form==="contact") {draw("box",x,.6*s,z,.45*s,.24*s,.25*s,paint);draw("sphere",x,.79*s,z,.06*s,.06*s,.06*s,c.power>.01?"#8bbba5":"#6a777c");}
        else draw("cylinder",x,.65*s,z,.25*s,.6*s,.25*s,paint,Math.PI/2,0,angle);
      }
    }
    componentId=null;
    for(const link of world?.links??[]) {
      const a=world!.components.find(c=>c.id===link.from),b=world!.components.find(c=>c.id===link.to);if(!a||!b)continue;
      const length=Math.hypot(b.position.x-a.position.x,b.position.z-a.position.z),angle=Math.atan2(b.position.x-a.position.x,b.position.z-a.position.z);
      draw("box",(a.position.x+b.position.x)/2,.2,(a.position.z+b.position.z)/2,link.port==="water"?.09:.035,.035,length,link.port==="electric"?"#9b8259":link.port==="water"?"#689ba3":"#b1a389",0,angle);
    }
    for(const key of Object.keys(meshes) as Array<keyof typeof meshes>){const mesh=meshes[key];mesh.count=Math.min(3200,counts[key]);mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;if(mesh.count)mesh.computeBoundingSphere();}
  }
  return {group,sync,raycast:(raycaster:THREE.Raycaster)=>{const hits=raycaster.intersectObjects(Object.values(meshes),false);for(const hit of hits){const id=hit.object.userData.componentIds?.[hit.instanceId??-1];if(typeof id==="string")return id;}return null;},dispose:()=>{for(const mesh of Object.values(meshes)){mesh.geometry.dispose();mesh.material.dispose();mesh.dispose();}group.clear();}};
}
