"use client";
import { ArrowLeft, ChevronDown, ChevronUp, Hammer } from "lucide-react";
import type { SurvivalRunState } from "../simulation/survival";
import type { InspectorLevel } from "./agent-inspector";
import { constructionRecord } from "./construction-record";
import { humanize } from "./presentation";
import styles from "./survival-experience.module.css";

export function ConstructionInspector({world,id,level,onLevelChange,onBack}:{world:SurvivalRunState;id:string;level:InspectorLevel;onLevelChange(level:InspectorLevel):void;onBack():void}){
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
