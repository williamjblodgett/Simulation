import type { Manipulation, MaterialKind, MaterialProperties, PhysicalMind, PhysicalPart, PhysicalReading, PhysicalWorld, Vec3 } from "./physical-types";
import type { SurvivalAgent, SurvivalEnvironment, SurvivalPosition } from "./types";
import { inFreshwater } from "./physical-navigation";

/** Deliberately simplified SI-like laws, not a real-world engineering model. Never imported by the policy. */
export const MATERIALS: Record<MaterialKind, MaterialProperties> = {
  wood: { density: 0.65, strength: 16, insulation: 0.7, permeability: 0.08, flammability: 0.8, hardness: 0.45, heatCapacity: 1.7 },
  stone: { density: 2.5, strength: 55, insulation: 0.2, permeability: 0.02, flammability: 0, hardness: 0.95, heatCapacity: 0.8 },
  fiber: { density: 0.2, strength: 2, insulation: 0.85, permeability: 0.65, flammability: 1, hardness: 0.1, heatCapacity: 1.4 },
  clay: { density: 1.5, strength: 5, insulation: 0.45, permeability: 0.25, flammability: 0, hardness: 0.25, heatCapacity: 0.9 },
};
export const PHYSICAL_LIMITS = { parts: 160, joints: 240, reach: 4, carryMass: 12, maxDimension: 4, minDimension: 0.06 } as const;
export const clip = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
export const round = (n: number) => Math.round(n * 1e6) / 1e6;
export const partMass = (p: PhysicalPart) => Object.values(p.composition).reduce((a, b) => a + b, 0);
export const dominantMaterial = (p: PhysicalPart): MaterialKind => Object.entries(p.composition).sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0]))[0][0] as MaterialKind;
export const freshPhysicalWorld = (): PhysicalWorld => ({ version: 1, nextId: 1, parts: [], joints: [], spent: {}, workEnergy: 0, tests: 0 });
export const freshPhysicalMind = (): PhysicalMind => ({ version: 2, readings: [], estimates: [], procedures: [], projects: [], uses: [], namedAt: null, nameEvidence: [], learningEnabled: true });

export function properties(p: PhysicalPart): MaterialProperties {
  const mass = partMass(p);
  const result = Object.fromEntries(Object.keys(MATERIALS.wood).map(k => [k, 0])) as unknown as MaterialProperties;
  for (const [kind, amount] of Object.entries(p.composition)) {
    for (const key of Object.keys(result) as (keyof MaterialProperties)[]) result[key] += MATERIALS[kind as MaterialKind][key] * amount / mass;
  }
  // Heating changes an existing material, not a technology flag or guaranteed product.
  if ((p.peakTemperature??p.temperature) > 450 && p.composition.clay) { result.strength *= 1.8; result.permeability *= 0.2; }
  return result;
}

/** Oriented boxes in a local flat construction patch; the renderer uses this same pose. */
export function extents(p: PhysicalPart): Vec3 {
  return { x: (Math.abs(Math.cos(p.rotation)) * p.size.x + Math.abs(Math.sin(p.rotation)) * p.size.z) / 2,
    y: p.size.y / 2, z: (Math.abs(Math.sin(p.rotation)) * p.size.x + Math.abs(Math.cos(p.rotation)) * p.size.z) / 2 };
}
const horizontalOverlap = (a: PhysicalPart, b: PhysicalPart) => {
  const ae = extents(a), be = extents(b);
  return Math.abs(a.position.x-b.position.x) < ae.x+be.x-0.02 && Math.abs(a.position.z-b.position.z) < ae.z+be.z-0.02;
};
const touching = (a: PhysicalPart,b: PhysicalPart) => {
  const ae=extents(a),be=extents(b);
  return Math.abs(a.position.x-b.position.x)<=ae.x+be.x+0.16 && Math.abs(a.position.y-b.position.y)<=ae.y+be.y+0.16 && Math.abs(a.position.z-b.position.z)<=ae.z+be.z+0.16;
};
function fits(world:PhysicalWorld,p:PhysicalPart,env:SurvivalEnvironment,ignore:string[]=[],occupants:readonly SurvivalPosition[]=[]):boolean{
  if(p.position.y-p.size.y/2<=2.3&&occupants.some(person=>{
    const dx=person.x-p.position.x,dz=person.z-p.position.z,c=Math.cos(p.rotation),s=Math.sin(p.rotation);
    return Math.abs(dx*c+dz*s)<p.size.x/2+.4&&Math.abs(-dx*s+dz*c)<p.size.z/2+.4;
  }))return false;
  const e=extents(p),b=env.bounds;
  return p.position.x-e.x>=b.minX&&p.position.x+e.x<=b.maxX&&p.position.z-e.z>=b.minZ&&p.position.z+e.z<=b.maxZ&&p.position.y>=e.y&&p.position.y<=5&&!inFreshwater(env,p.position,Math.max(e.x,e.z))&&!world.parts.some(q=>q.condition>0.05&&q.id!==p.id&&!ignore.includes(q.id)&&horizontalOverlap(p,q)&&Math.abs(q.position.y-p.position.y)<q.size.y/2+p.size.y/2-0.04);
}
function availableGroundPose(world:PhysicalWorld,p:PhysicalPart,agent:SurvivalAgent,env:SurvivalEnvironment,occupants:readonly SurvivalPosition[]=[agent.position]):Vec3|null{
  for(let n=0;n<16;n++){
    const angle=n*Math.PI/4,radius=1.2+Math.floor(n/8)*1.4;
    const position={x:agent.position.x+Math.cos(angle)*radius,y:p.size.y/2,z:agent.position.z+Math.sin(angle)*radius};
    const e=extents(p);if(Math.abs(position.x-agent.position.x)<e.x+0.45&&Math.abs(position.z-agent.position.z)<e.z+0.45)continue;
    if(fits(world,{...p,position},env,[],occupants))return position;
  }
  return null;
}
export function loadCapacity(p: PhysicalPart): number {
  return properties(p).strength * Math.min(p.size.x,p.size.z) ** 2 / Math.max(0.2,p.size.y) * p.condition;
}
export function waterCapacity(p: PhysicalPart): number { return p.size.x*p.size.y*p.size.z*p.hollow*2; }

/** No design-name recognition. Grounded support propagates; floating cycles cannot support themselves. */
export function settleAssemblies(world: PhysicalWorld): void {
  for (const p of world.parts) p.supported = p.position.y - p.size.y/2 <= 0.08 && p.condition > 0.05;
  const parents = new Map<string,{id:string;capacity:number}>();
  for (let pass=0;pass<world.parts.length;pass++) {
    let changed=false;
    for (const p of world.parts.filter(p=>!p.supported && p.condition>0.05)) {
      const bearing = world.parts.find(q=>q.supported && horizontalOverlap(p,q) && Math.abs(p.position.x-q.position.x)<=extents(q).x && Math.abs(p.position.z-q.position.z)<=extents(q).z && Math.abs(p.position.y-p.size.y/2-q.position.y-q.size.y/2)<0.15);
      const binding = world.joints.find(j=>(j.a===p.id||j.b===p.id) && j.condition>0.05 && world.parts.some(q=>q.id===(j.a===p.id?j.b:j.a)&&q.supported&&touching(p,q)) && partMass(p)<=j.fiber*8*j.condition);
      if (bearing||binding) { p.supported=true; changed=true;parents.set(p.id,bearing?{id:bearing.id,capacity:loadCapacity(bearing)}:{id:binding!.a===p.id?binding!.b:binding!.a,capacity:binding!.fiber*8*binding!.condition}); }
    }
    if (!changed) break;
  }
  const totalLoad=new Map<string,number>();
  for(const p of world.parts){let next=parents.get(p.id);const visited=new Set<string>();while(next&&!visited.has(next.id)){visited.add(next.id);totalLoad.set(next.id,(totalLoad.get(next.id)??0)+partMass(p));next=parents.get(next.id);}}
  const overloaded=new Set(world.parts.filter(p=>(totalLoad.get(p.id)??0)>loadCapacity(p)).map(p=>p.id));
  for(const p of world.parts){let next=parents.get(p.id);const visited=new Set<string>();while(next&&!visited.has(next.id)){visited.add(next.id);if(overloaded.has(next.id)||(totalLoad.get(p.id)??0)+partMass(p)>next.capacity){p.supported=false;break;}next=parents.get(next.id);}}
  for (const p of world.parts) if (!p.supported) {
    const fall=Math.max(0,p.position.y-p.size.y/2); p.position.y=p.size.y/2;
    p.condition=round(clip(p.condition-fall*0.12)); p.revision++; p.supported=false;
    // Failed components remain as inert rubble, not overlapping functional supports.
    if(fall>0){p.condition=Math.min(p.condition,0.05);}
  }
  // Separation breaks a joint; its fiber remains part of the physical ledger.
  for (const j of world.joints) {
    const a=world.parts.find(p=>p.id===j.a),b=world.parts.find(p=>p.id===j.b);
    if (!a||!b||!touching(a,b)) j.condition=0;
  }
}

/** Fraction of exposure intercepted near a point. Geometry, porosity, condition and wind matter. */
export function protectionAt(world: PhysicalWorld, position: SurvivalPosition, weather: string): number {
  let uncovered=1;
  const windAngle=weather==="storm"?Math.PI/3:weather==="rain"?Math.PI/5:0;
  for (const p of world.parts) {
    if (!p.supported||p.condition<=0.05) continue;
    const dx=position.x-p.position.x,dz=position.z-p.position.z;
    const lx=dx*Math.cos(p.rotation)+dz*Math.sin(p.rotation),lz=-dx*Math.sin(p.rotation)+dz*Math.cos(p.rotation);
    const overhead=Math.abs(lx)<p.size.x/2+0.3&&Math.abs(lz)<p.size.z/2+0.3&&p.position.y-p.size.y/2>1.2;
    const nearWall=Math.abs(lx)<p.size.x/2+0.6 && Math.abs(lz)<2.2 && p.size.y>0.6;
    const distance=Math.hypot(dx,dz);
    const area=overhead?p.size.x*p.size.z:nearWall?p.size.x*p.size.y*Math.abs(Math.cos(p.rotation-windAngle)):0;
    const prop=properties(p);
    const effect=clip(area/5)*(overhead?0.85:0.7)*p.condition*(1-prop.permeability)*(0.5+prop.insulation/2)*clip(1-distance/5);
    uncovered*=1-effect;
  }
  return round(clip(1-uncovered,0,0.95));
}

export function agePhysicalWorld(world: PhysicalWorld, env: SurvivalEnvironment): void {
  for (const p of world.parts) {
    const prop=properties(p);
    p.condition=round(clip(p.condition-(env.weather==="storm"?0.0012:0.00012)*(1+prop.permeability)));
    const leaked=Math.min(p.water,prop.permeability*0.03);p.water=round(p.water-leaked);world.spent.freshwater=round((world.spent.freshwater??0)+leaked);
    p.temperature=round(p.temperature+(env.temperatureC-p.temperature)*0.06);
    p.peakTemperature=Math.max(p.peakTemperature??p.temperature,p.temperature);
  }
  settleAssemblies(world);
}

export interface ManipulationResult { ok: boolean; summary: string; partId: string|null; reading?: PhysicalReading; effort: number }

/** The only mutation entry point. All attempted operations pay effort; failed operations create no matter. */
export function executeManipulation(world: PhysicalWorld, agent: SurvivalAgent, op: Manipulation, env: SurvivalEnvironment, tick: number, occupants: readonly SurvivalPosition[] = [agent.position]): ManipulationResult {
  const effort=op.kind==="shape"?1.6:op.kind==="heat"?2:0.6;
  agent.needs.energy=round(clip(agent.needs.energy-effort,0,100)); world.workEnergy=round(world.workEnergy+effort);
  const fail=(summary:string):ManipulationResult=>({ok:false,summary,partId:null,effort});
  const reachable=(p:PhysicalPart|undefined):p is PhysicalPart=>!!p&&Math.hypot(p.position.x-agent.position.x,p.position.z-agent.position.z)<=PHYSICAL_LIMITS.reach;
  const p="partId" in op?world.parts.find(p=>p.id===op.partId):undefined;
  if ("partId" in op&&!reachable(p)) return fail("The part is absent or out of reach; no material was changed.");
  let part=p;
  const spend=(kind:MaterialKind,amount:number)=>{agent.inventory[kind]=round(agent.inventory[kind]-amount);};
  if (!["shape","place","split","join","detach","mix","heat","test","reclaim"].includes(op.kind))return fail("Unsupported physical operation.");
  if (op.kind==="shape") {
    if (world.parts.length>=PHYSICAL_LIMITS.parts) return fail("The physical study's part budget is full; reuse or reclaim existing parts.");
    if (!Number.isFinite(op.mass)||op.mass<=0||op.mass>PHYSICAL_LIMITS.carryMass||agent.inventory[op.material]<op.mass) return fail("Insufficient carried material or the piece exceeds lifting capacity.");
    if (Object.values(op.size).some(n=>!Number.isFinite(n)||n<0.06||n>4)) return fail("The requested dimensions exceed the available manipulation scale.");
    const hollow=op.hollow??0, volume=op.size.x*op.size.y*op.size.z*(1-hollow);
    if (hollow<0||hollow>0.7||Math.abs(volume*MATERIALS[op.material].density-op.mass)>op.mass*0.03) return fail("The dimensions do not conserve this material's volume.");
    if (MATERIALS[op.material].hardness>0.8&&agent.inventory.stone<op.mass+0.5) return fail("A separate hard striking stone is needed to shape this piece.");
    part={id:`part-${world.nextId}`,makerId:agent.id,createdAt:tick,sources:agent.materialSamples?.[op.material]?[agent.materialSamples[op.material]!.sourceId]:[],composition:{[op.material]:op.mass},size:{...op.size},position:{x:agent.position.x,y:op.size.y/2,z:agent.position.z},rotation:0,condition:1,temperature:env.temperatureC,peakTemperature:env.temperatureC,hollow,water:0,supported:true,revision:1};
    const pose=availableGroundPose(world,part,agent,env,occupants);if(!pose)return fail("There is no unoccupied ground within reach for this piece.");
    part.position=pose;spend(op.material,op.mass);world.nextId++;
    world.parts.push(part);
  } else if (op.kind==="place"&&p) {
    if (partMass(p)>PHYSICAL_LIMITS.carryMass || Object.values(op.position).some(n=>!Number.isFinite(n)) || !Number.isFinite(op.rotation) || Math.hypot(op.position.x-agent.position.x,op.position.z-agent.position.z)>4 || op.position.y<p.size.y/2 || op.position.y>5 || op.position.x<env.bounds.minX || op.position.x>env.bounds.maxX || op.position.z<env.bounds.minZ || op.position.z>env.bounds.maxZ) return fail("The pose is outside reach, ground, world bounds, or lifting capacity.");
    const proposed={...p,position:op.position,rotation:op.rotation};
    if(!fits(world,proposed,env,[],occupants)) return fail("Solid parts cannot overlap another part, an agent's occupied space, or the world boundary.");
    p.position={...op.position};p.rotation=op.rotation;p.revision++;
  } else if(op.kind==="split"&&p) {
    if(world.parts.length>=PHYSICAL_LIMITS.parts||op.fraction<0.1||op.fraction>0.9||p.size.x*Math.min(op.fraction,1-op.fraction)<0.06||p.water>0) return fail("This split is too small, or a filled part cannot be split safely.");
    const other:PhysicalPart=structuredClone(p);other.id=`part-${world.nextId}`;other.createdAt=tick;other.size.x*=1-op.fraction;
    const splitPose=availableGroundPose(world,other,agent,env,occupants);if(!splitPose)return fail("No unoccupied space is available for the separated piece.");
    for(const k of Object.keys(p.composition) as MaterialKind[]){other.composition[k]=p.composition[k]!*(1-op.fraction);p.composition[k]!*=op.fraction;}
    p.size.x*=op.fraction;other.position=splitPose;p.revision++;world.nextId++;world.parts.push(other);
  } else if(op.kind==="join"||op.kind==="mix") {
    const a=world.parts.find(p=>p.id===op.a),b=world.parts.find(p=>p.id===op.b);
    if(!reachable(a)||!reachable(b)||a===b) return fail("Both distinct parts must be within reach.");
    part=a;
    if(op.kind==="join") {
      if(world.joints.length>=PHYSICAL_LIMITS.joints||!touching(a,b)||!Number.isFinite(op.fiber)||op.fiber<=0||agent.inventory.fiber<op.fiber) return fail("Joining needs touching parts and available binding fiber.");
      spend("fiber",op.fiber);world.joints.push({id:`joint-${world.nextId++}`,a:a.id,b:b.id,fiber:op.fiber,condition:1});
    } else {
      if(a.water||b.water||world.joints.some(j=>j.a===b.id||j.b===b.id)||partMass(a)+partMass(b)>12) return fail("Empty, unbound pieces within handling capacity are required for mixing.");
      const volume=a.size.x*a.size.y*a.size.z*(1-a.hollow)+b.size.x*b.size.y*b.size.z*(1-b.hollow);
      const edge=Math.cbrt(volume),next={...a,size:{x:edge,y:edge,z:edge},position:{...a.position,y:edge/2}};
      if(edge>4||!fits(world,next,env,[b.id],occupants))return fail("The combined material cannot fit at this location.");
      for(const k of Object.keys(b.composition) as MaterialKind[])a.composition[k]=(a.composition[k]??0)+b.composition[k]!;
      a.sources=[...new Set([...(a.sources??[]),...(b.sources??[])])];
      a.size=next.size;a.hollow=0;a.position=next.position;a.revision++;world.parts=world.parts.filter(q=>q.id!==b.id);
    }
  } else if(op.kind==="detach") {
    const j=world.joints.find(j=>j.id===op.jointId);
    if(!j||!reachable(world.parts.find(p=>p.id===j.a))||!reachable(world.parts.find(p=>p.id===j.b))) return fail("The binding is unavailable or out of reach.");
    agent.inventory.fiber=round(agent.inventory.fiber+j.fiber);world.joints=world.joints.filter(q=>q.id!==j.id);
  } else if(op.kind==="heat"&&p) {
    if(!Number.isFinite(op.fuel)||op.fuel<=0||op.fuel>2||agent.inventory.wood<op.fuel) return fail("Heating requires available fuel and bounded effort.");
    spend("wood",op.fuel);world.spent.wood=round((world.spent.wood??0)+op.fuel);
    p.temperature=round(p.temperature+op.fuel*170/(partMass(p)*properties(p).heatCapacity));
    p.peakTemperature=Math.max(p.peakTemperature??p.temperature,p.temperature);
    if(p.temperature>250)p.condition=round(clip(p.condition-properties(p).flammability*0.25));p.revision++;
  } else if(op.kind==="reclaim"&&p) {
    if(world.joints.some(j=>j.a===p.id||j.b===p.id))return fail("Detach bindings before reclaiming the material.");
    for(const [k,n]of Object.entries(p.composition))agent.inventory[k as MaterialKind]=round(agent.inventory[k as MaterialKind]+n);
    agent.inventory.freshwater=round(agent.inventory.freshwater+p.water);world.parts=world.parts.filter(q=>q.id!==p.id);
  } else if(op.kind==="test"&&p) {
    if(!Number.isFinite(op.dose)||op.dose<=0||op.dose>5)return fail("The proposed test intensity is outside handling limits.");
    let before=0,after=0;
    if(op.measure==="load") {before=p.condition;if(op.dose>loadCapacity(p))p.condition=round(clip(p.condition-(op.dose-loadCapacity(p))*0.06));settleAssemblies(world);after=p.condition;}
    if(op.measure==="retention") {if(agent.inventory.freshwater<op.dose)return fail("A retention test requires carried water.");agent.inventory.freshwater=round(agent.inventory.freshwater-op.dose);before=op.dose;const retained=Math.min(Math.max(0,waterCapacity(p)-p.water),op.dose)*(1-properties(p).permeability);p.water=round(p.water+retained);world.spent.freshwater=round((world.spent.freshwater??0)+op.dose-retained);after=retained;}
    if(op.measure==="protection") {const control=structuredClone(world);control.parts=control.parts.filter(q=>q.id!==p.id);settleAssemblies(control);before=protectionAt(control,agent.position,env.weather);after=protectionAt(world,agent.position,env.weather);}
    const reading:PhysicalReading={id:`physical-reading-${agent.id}-${tick}-${world.nextId++}`,tick,observerId:agent.id,revision:p.revision,source:"test",partId:p.id,material:dominantMaterial(p),position:{...agent.position},size:{...p.size},rotation:p.rotation,mass:partMass(p),condition:p.condition,metric:op.measure,before:round(before),after:round(after),dose:op.dose,temperature:env.temperatureC,weather:env.weather,confidence:0.85,summary:`${op.measure}: ${op.measure==="protection"?"modeled counterfactual":"before"} ${round(before)}, measured ${round(after)} at dose ${op.dose}.`};
    world.tests++;return {ok:true,summary:reading.summary,partId:p.id,reading,effort};
  }
  settleAssemblies(world);
  return {ok:true,partId:part?.id??null,summary:`${op.kind} completed${part?` on ${part.id}`:""}; ${part?.condition!==undefined?`condition ${Math.round(part.condition*100)}%.`:"binding material recovered."}`,effort};
}
