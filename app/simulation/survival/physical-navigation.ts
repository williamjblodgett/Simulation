import type { SurvivalEnvironment, SurvivalPosition } from "./types";
import type { PhysicalWorld } from "./physical-types";
import { freshwaterFeatures, locomotionAt, TRAVEL_SPEED } from "./water";

export function inFreshwater(env:SurvivalEnvironment,p:SurvivalPosition,clearance=0.35):boolean{
  return env.resources.some(s=>{
    if(s.kind!=="freshwater")return false;
    const rotation=(s.position.x+s.position.z)*0.03,dx=p.x-s.position.x,dz=p.z-s.position.z;
    const x=Math.cos(rotation)*dx-Math.sin(rotation)*dz,z=Math.sin(rotation)*dx+Math.cos(rotation)*dz;
    return (x/(5+s.capacity/110+clearance))**2+(z/(3.5+s.capacity/170+clearance))**2<1;
  });
}
export function physicalWalkable(env:SurvivalEnvironment,world:PhysicalWorld,p:SurvivalPosition):boolean{
  return !inFreshwater(env,p) && physicalTraversable(env,world,p);
}
export function physicalTraversable(env:SurvivalEnvironment,world:PhysicalWorld|undefined,p:SurvivalPosition):boolean{
  if(p.x<env.bounds.minX||p.x>env.bounds.maxX||p.z<env.bounds.minZ||p.z>env.bounds.maxZ)return false;
  return !world?.parts.some(part=>{
    if(part.condition<=0.05||part.position.y-part.size.y/2>2.3)return false;
    const dx=p.x-part.position.x,dz=p.z-part.position.z;
    const x=dx*Math.cos(part.rotation)+dz*Math.sin(part.rotation),z=-dx*Math.sin(part.rotation)+dz*Math.cos(part.rotation);
    return Math.abs(x)<part.size.x/2+0.38&&Math.abs(z)<part.size.z/2+0.38;
  });
}
/** Execution collision sensing, not free map knowledge for the planner. */
export function physicalNextPosition(env:SurvivalEnvironment,world:PhysicalWorld|undefined,start:SurvivalPosition,target:SurvivalPosition):SurvivalPosition|null{
  const distance=Math.hypot(target.x-start.x,target.z-start.z),angle=Math.atan2(target.z-start.z,target.x-start.x);
  const water=freshwaterFeatures(env);
  for(const offset of [0,Math.PI/4,-Math.PI/4,Math.PI/2,-Math.PI/2]){
    const limit=Math.min(offset===0?7.5:3,distance),dx=Math.cos(angle+offset),dz=Math.sin(angle+offset);
    let travelled=0,time=0,safe=true;
    // Substeps prevent tunneling through thin parts or skipping water between dry endpoints.
    while(travelled<limit-1e-8 && time<1-1e-8){
      const length=Math.min(.2,limit-travelled);
      const midpoint={x:start.x+dx*(travelled+length/2),z:start.z+dz*(travelled+length/2)};
      const speed=TRAVEL_SPEED[locomotionAt(water,midpoint)],step=Math.min(length,(1-time)*speed);
      const p={x:start.x+dx*(travelled+step),z:start.z+dz*(travelled+step)};
      if(!physicalTraversable(env,world,p)){safe=false;break;}
      travelled+=step;time+=step/speed;
      // Pause at a terrain-mode transition so even a narrow bank is sensed, not skipped.
      if(locomotionAt(water,p)!==locomotionAt(water,start))break;
    }
    if(safe && travelled>1e-8)return {x:start.x+dx*travelled,z:start.z+dz*travelled};
  }
  return null;
}
