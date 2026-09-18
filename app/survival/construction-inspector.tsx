"use client";
import { ArrowLeft, ChevronDown, ChevronUp, Hammer } from "lucide-react";
import type { SurvivalRunState } from "../simulation/survival";
import type { InspectorLevel } from "./agent-inspector";
import { constructionRecord } from "./construction-record";
import { humanize } from "./presentation";
import styles from "./survival-experience.module.css";
import type { DevelopmentComponent } from "../simulation/survival/development-types";

function ComponentInspector({world,component,level,onLevelChange,onBack}:{world:SurvivalRunState;component:DevelopmentComponent;level:InspectorLevel;onLevelChange(level:InspectorLevel):void;onBack():void}){
  const levels:InspectorLevel[]=["peek","half","expanded"],index=levels.indexOf(level),maker=world.agents.find(a=>a.id===component.makerId);
  const evidence=world.agents.flatMap(a=>a.developmentMind?.evidence??[]).filter(e=>e.componentId===component.id&&e.source==="personal").slice(-6);
  const batches=world.materials?.batches.filter(b=>component.batchIds.includes(b.id))??[];
  return <article className={`${styles.agentInspector} ${styles.constructionInspector}`} data-level={level} aria-label="Component inspector">
    <div className={styles.peekSummary}><div><strong>{humanize(`${component.material} ${component.form}`)}</strong><p>{component.output>.001?"Producing output":"No active output"} · {Math.round(component.condition*100)}% condition</p></div><button aria-label="Expand construction details" onClick={()=>onLevelChange("half")}><ChevronUp size={18}/></button></div>
    <div className={styles.sheetHandle}><button aria-label="Collapse construction details" disabled={index===0} onClick={()=>onLevelChange(levels[index-1])}><ChevronDown size={18}/></button><span>Component record</span><button aria-label="Expand construction details" disabled={index===2} onClick={()=>onLevelChange(levels[index+1])}><ChevronUp size={18}/></button></div>
    <div className={styles.inspectorHalf}><button className={styles.textControl} onClick={onBack}><ArrowLeft size={16}/> Back to agent</button><header className={styles.constructionHeading}><Hammer size={24}/><div><h2>{humanize(`${component.material} ${component.form}`)}</h2><p>Actual physical state · observer diagnostics</p></div></header><dl className={styles.rowList}>
      <div><dt>Maker</dt><dd>{maker?.label??component.makerId} · {maker?.name??"Earlier life"}</dd></div><div><dt>Condition / treatment</dt><dd>{Math.round(component.condition*100)}% · {component.treatment}</dd></div><div><dt>Water / food</dt><dd>{component.water.toFixed(2)} / {component.food.toFixed(2)}</dd></div><div><dt>Stored charge / fuel</dt><dd>{component.charge.toFixed(3)} / {component.fuel.toFixed(2)}</dd></div><div><dt>Input / useful output</dt><dd>{component.power.toFixed(3)} / {component.output.toFixed(3)} energy units per step</dd></div><div><dt>Dimensions</dt><dd>{component.size.toFixed(2)} m · thickness {component.thickness.toFixed(2)} m</dd></div>
    </dl>{component.damage?<p>{component.damage}</p>:null}</div>
    <div className={styles.inspectorExpanded}><section className={styles.recordSection}><h3>Accounted material</h3><p>{Object.entries(component.stock).map(([kind,n])=>`${n.toFixed(2)} ${kind}`).join(" · ")||"Processed batches below"}</p>{batches.map(b=><p key={b.id}>{b.id} · {b.mass.toFixed(3)} normalized units · installed, not also carried</p>)}<h3>Actual connections</h3>{world.development?.links.filter(l=>l.from===component.id||l.to===component.id).map(l=><p key={l.id}>{humanize(l.port)} · {l.from} → {l.to} · {Math.round(l.condition*100)}% condition</p>)}<h3>Recorded personal measurements</h3>{evidence.length?evidence.map(e=><p key={e.id}>Step {e.tick} · {e.observerId} · {e.summary}<small>Original evidence {e.originalId}</small></p>):<p>No retained personal measurement. A visible object is not evidence of usefulness.</p>}{component.document?<><h3>Inscribed procedure</h3><p>{component.document.id} · authored by {component.document.authorId}. Its existence does not give nearby agents its contents; they must choose to read it.</p></>:null}</section></div>
  </article>;
}

export function ConstructionInspector({world,id,level,onLevelChange,onBack}:{world:SurvivalRunState;id:string;level:InspectorLevel;onLevelChange(level:InspectorLevel):void;onBack():void}){
  const component=world.development?.components.find(c=>c.id===id);
  if(component)return <ComponentInspector world={world} component={component} level={level} onLevelChange={onLevelChange} onBack={onBack}/>;
  const record=constructionRecord(world,id);
  if(!record)return <article className={`${styles.agentInspector} ${styles.constructionInspector}`}><button onClick={onBack}>Back to agent</button><p>This part is no longer in the current world. Its events remain in Timeline.</p></article>;
  const {part,maker,project,readings,uses,status,title}=record;
  const levels:InspectorLevel[]=["peek","half","expanded"],index=levels.indexOf(level);
  return <article className={`${styles.agentInspector} ${styles.constructionInspector}`} data-level={level} aria-label="Construction inspector">
    <div className={styles.peekSummary}><div><strong>{humanize(title)}</strong><p>{status} · made by {maker?.name??"an earlier life"}</p></div><button aria-label="Expand construction details" onClick={()=>onLevelChange("half")}><ChevronUp size={18}/></button></div>
    <div className={styles.sheetHandle}><button aria-label="Collapse construction details" disabled={index===0} onClick={()=>onLevelChange(levels[index-1])}><ChevronDown size={18}/></button><span>Construction record</span><button aria-label="Expand construction details" disabled={index===2} onClick={()=>onLevelChange(levels[index+1])}><ChevronUp size={18}/></button></div>
    <div className={styles.inspectorHalf}>
      <button className={styles.textControl} onClick={onBack}><ArrowLeft size={16}/> Back to agent</button>
      <header className={styles.constructionHeading}><Hammer size={24}/><div><h2>{humanize(title)}</h2><p>{status}</p></div></header>
      <p>{project?"Proposed purpose: reduce weather exposure.":"No retained project links this part to a proposed purpose."}</p>
      {project?.blocker?<p className={styles.projectBlocker}>Last planning note: {project.blocker}</p>:null}
      <dl className={styles.rowList}><div><dt>Maker</dt><dd>{maker?.label} · {maker?.name??"Earlier life"}</dd></div><div><dt>Condition</dt><dd>{Math.round(part.condition*100)}% · {part.supported?"supported":"unsupported"}</dd></div><div><dt>Materials</dt><dd>{Object.entries(part.composition).map(([k,n])=>`${n.toFixed(1)} ${k}`).join(", ")}</dd></div><div><dt>Dimensions</dt><dd>{part.size.x.toFixed(1)} × {part.size.y.toFixed(1)} × {part.size.z.toFixed(1)} model units</dd></div><div><dt>Connected parts</dt><dd>{world.physical?.joints.filter(j=>(j.a===id||j.b===id)&&j.condition>0).length??0}</dd></div></dl>
    </div>
    <div className={styles.inspectorExpanded}>
      <section className={styles.recordSection}><h3>Measured results</h3>{readings.length?readings.slice(0,3).map(r=><p key={r.id}>{r.metric==="protection"?`Measured protection ${Math.round(r.after*100)}%; modeled comparison without this part ${Math.round(r.before*100)}%.`:r.summary}<small> {world.agents.find(a=>a.id===r.observerId)?.label??"Earlier life"} · {r.source==="test"?"personal test":"reported result, not a personal test"} · Day {Math.floor(r.tick/144)+1} · {r.weather} · {r.revision===part.revision?"current revision":"earlier revision"}</small></p>):<p>No retained measurements. Appearance alone does not establish usefulness.</p>}</section>
      <section className={styles.recordSection}><h3>Experience from use</h3>{uses.length?uses.slice(0,3).map(u=><p key={u.id}>Warmth {u.warmthBefore.toFixed(0)} → {u.warmthAfter.toFixed(0)} during {u.action}.<small> {u.weather}, {u.temperature.toFixed(0)}°C · not a controlled causal test</small></p>):<p>No use interval has been recorded.</p>}</section>
      <section className={styles.recordSection}><h3>Latest project record</h3><p>{project?.reason??"No retained project record."}</p>{project?.history?.slice(-4).map((h,i)=><p key={i}>{humanize(h.kind)} · {h.summary}</p>)}</section>
      <small>Observer record · part {id.replace("part-","")} · no construction controls</small>
    </div>
  </article>;
}
