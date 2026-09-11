"use client";

import { Activity } from "lucide-react";
import { affectLabel, type AgentAffect } from "../simulation/survival/affect";
import { humanize } from "./presentation";
import styles from "./survival-experience.module.css";

const signals: Array<{ key: keyof Pick<AgentAffect,"fear"|"frustration"|"confidence"|"curiosity"|"socialNeed">; label: string }> = [
  { key: "fear", label: "Caution" }, { key: "frustration", label: "Frustration" }, { key: "confidence", label: "Confidence" }, { key: "curiosity", label: "Inquiry" }, { key: "socialNeed", label: "Social need" },
];

export function AffectRecord({ affect, compact = false }: { affect: AgentAffect | undefined; compact?: boolean }) {
  if (!affect) return null;
  return <section className={styles.affectRecord} data-compact={compact}>
    <header><Activity size={16}/><div><span>Adaptive state · {affectLabel(affect)}</span>{!compact?<small>Derived control signals, not consciousness or hidden thoughts</small>:null}</div></header>
    <div className={styles.affectSignals}>{signals.map(signal=><div key={signal.key}><span>{signal.label}</span><i><b style={{width:`${Math.round(affect[signal.key]*100)}%`}}/></i><strong>{Math.round(affect[signal.key]*100)}</strong></div>)}</div>
    {!compact && affect.drivers.length ? <details><summary>Recent factual drivers</summary>{[...affect.drivers].reverse().slice(0,6).map((driver,index)=><p key={`${driver.tick}-${driver.signal}-${index}`}><strong>{humanize(driver.signal)} {driver.direction}</strong> · {driver.summary}</p>)}</details> : null}
  </section>;
}
