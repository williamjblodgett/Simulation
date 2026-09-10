import type { SurvivalEnvironment, SurvivalPosition } from "./types";
import type { PhysicalWorld } from "./physical-types";

export function inFreshwater(env:SurvivalEnvironment,p:SurvivalPosition,clearance=0.35):boolean{
  return env.resources.some(s=>{
    if(s.kind!=="freshwater")return false;
    const rotation=(s.position.x+s.position.z)*0.03,dx=p.x-s.position.x,dz=p.z-s.position.z;
    const x=Math.cos(rotation)*dx-Math.sin(rotation)*dz,z=Math.sin(rotation)*dx+Math.cos(rotation)*dz;
    return (x/(5+s.capacity/110+clearance))**2+(z/(3.5+s.capacity/170+clearance))**2<1;
  });
}
export function physicalWalkable(env:SurvivalEnvironment,world:PhysicalWorld,p:SurvivalPosition):boolean{
  if(p.x<env.bounds.minX||p.x>env.bounds.maxX||p.z<env.bounds.minZ||p.z>env.bounds.maxZ||inFreshwater(env,p))return false;
  return !world.parts.some(part=>{
    if(part.condition<=0.05||part.position.y-part.size.y/2>2.3)return false;
    const dx=p.x-part.position.x,dz=p.z-part.position.z;
    const x=dx*Math.cos(part.rotation)+dz*Math.sin(part.rotation),z=-dx*Math.sin(part.rotation)+dz*Math.cos(part.rotation);
    return Math.abs(x)<part.size.x/2+0.38&&Math.abs(z)<part.size.z/2+0.38;
  });
}
/** Execution collision sensing, not free map knowledge for the planner. */
export function physicalNextPosition(env:SurvivalEnvironment,world:PhysicalWorld,start:SurvivalPosition,target:SurvivalPosition):SurvivalPosition|null{
  const distance=Math.hypot(target.x-start.x,target.z-start.z),angle=Math.atan2(target.z-start.z,target.x-start.x);
  for(const offset of [0,Math.PI/4,-Math.PI/4,Math.PI/2,-Math.PI/2]){
    const length=Math.min(offset===0?7.5:3,distance),candidate={x:start.x+Math.cos(angle+offset)*length,z:start.z+Math.sin(angle+offset)*length};
    let safe=true;for(let n=1;n<=12;n++){const p={x:start.x+(candidate.x-start.x)*n/12,z:start.z+(candidate.z-start.z)*n/12};if(!physicalWalkable(env,world,p)){safe=false;break;}}
    if(safe)return candidate;
  }
  return null;
}
