"use client";

import { Filter, LocateFixed, Radio, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SurvivalEvent, SurvivalEventCategory, SurvivalRunState } from "../simulation/survival";
import { agentColor, humanize } from "./presentation";
import styles from "./survival-experience.module.css";
import { eventSequence } from "./survival-persistence";
import { projectEpisodes } from "./construction-record";
import { repeatedEventEpisodes } from "./repeated-events";
import { DeathReview } from "./death-review";
import { DiscoveryEventRecord } from "./discovery-event-record";

interface TimelineViewProps {
  initialRecordId?: string;
  events?: SurvivalEvent[];
  archiveStatus?: "saved" | "partial" | "unavailable";
  hasOlderEvents?: boolean;
  historyFrozen?: boolean;
  onFreezeHistory?(): void;
  onReturnLive?(): void;
  onLoadOlder?(): Promise<void>;
  onExport?(): Promise<void>;
  world: SurvivalRunState;
  onLocate(event: SurvivalEvent): void;
}

const CATEGORIES: Array<"all" | SurvivalEventCategory> = ["all", "survival", "social", "research", "environment", "agent", "run"];

export function TimelineView({ world, onLocate, events: archivedEvents, archiveStatus, hasOlderEvents, historyFrozen, onFreezeHistory, onReturnLive, onLoadOlder, onExport, initialRecordId }: TimelineViewProps) {
  const sourceEvents = archivedEvents ?? world.events;
  const linkedEvent = initialRecordId ? sourceEvents.find(e => e.facts.discoveryDecisionId === initialRecordId || e.facts.experimentId === initialRecordId) : undefined;
  const [milestonesOnly, setMilestonesOnly] = useState(true);
  const [groupProjects,setGroupProjects]=useState(!initialRecordId);
  const [groupRepeats,setGroupRepeats]=useState(true);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [historyError, setHistoryError] = useState("");
  async function historyAction(action?: () => Promise<void>) { if (!action || historyBusy) return; setHistoryBusy(true); try { await action(); setHistoryError(""); } catch { setHistoryError("History could not be read. Please retry."); } finally { setHistoryBusy(false); } }
  const [agentFilter, setAgentFilter] = useState<string>(linkedEvent?.agentIds[0] ?? "all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | SurvivalEventCategory>("all");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(linkedEvent?.id ?? null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const linkedRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    const scroller = scrollerRef.current, entry = linkedRef.current;
    if (!scroller || !entry) return;
    // Align the record's beginning, not the center of a potentially long
    // expanded article. Scroll only the feed; preserve the header/navigation.
    // A roster dialog closes in the parent's effect. Focusing its still-inert
    // background here would be ignored; wait one frame for modal cleanup.
    const frame = window.requestAnimationFrame(() => {
      if (!entry.isConnected || entry.closest("[hidden]")) return;
      scroller.scrollTo({ top: scroller.scrollTop + entry.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 48 });
      entry.querySelector("button")?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [initialRecordId, linkedEvent?.id]);
  const totalEventCount = Math.max(world.events.length, world.eventWindow.totalEvents);
  const newEventCount = historyFrozen ? Math.max(0, totalEventCount - Math.max(0, ...sourceEvents.map(eventSequence))) : 0;

  const filtered = useMemo(() => [...sourceEvents]
    .filter((event) => agentFilter === "all" || event.agentIds.includes(agentFilter))
    .filter((event) => categoryFilter === "all" || event.category === categoryFilter)
    .filter(event => !milestonesOnly || !["resource_observed", "action_outcome"].includes(event.type) || typeof event.facts.operation==="string" || typeof event.facts.name==="string" || typeof event.facts.locomotion==="string")
    .sort((left, right) => eventSequence(right) - eventSequence(left)), [agentFilter, categoryFilter, sourceEvents, milestonesOnly]);

  const episodes=useMemo(()=>projectEpisodes(filtered),[filtered]);
  const repeats=useMemo(()=>repeatedEventEpisodes(filtered),[filtered]);
  const repeatedById=useMemo(()=>new Map(repeats.flatMap(e=>e.records.map(r=>[r.id,e] as const))),[repeats]);
  const groups = useMemo(() => {
    const byDay = new Map<number, SurvivalEvent[]>();
    for (const event of filtered) {
      if(groupRepeats&&repeatedById.has(event.id)&&repeatedById.get(event.id)!.latest.id!==event.id)continue;
      if(groupProjects&&typeof event.facts.projectId==="string"&&episodes.find(p=>p.id===event.facts.projectId)?.latest.id!==event.id)continue;
      byDay.set(event.day, [...(byDay.get(event.day) ?? []), event]);
    }
    return [...byDay.entries()].sort((left, right) => right[0] - left[0]);
  }, [filtered,groupProjects,episodes,groupRepeats,repeatedById]);

  const selectedEvent = selectedEventId === null
    ? null
    : sourceEvents.find((event) => event.id === selectedEventId) ?? null;
  const filtersActive = agentFilter !== "all" || categoryFilter !== "all";
  const retainedCount = sourceEvents.length;
  const droppedCount = Math.max(world.eventWindow.droppedEvents, totalEventCount - retainedCount);
  const formatCount = (value: number) => value.toLocaleString();

  function eventAgentLabel(id: string, compact = false) {
    const agent = world.agents.find((candidate) => candidate.id === id);
    if (!agent) return compact ? "A?" : `Unknown agent · ${id}`;
    if (compact) return `${agent.label}·E${agent.slotGeneration}`;
    return `${agent.label} · entry ${agent.slotGeneration} · generation ${agent.lineage?.generation ?? 1} · ${agent.name}`;
  }

  function revealNewest() {
    onReturnLive?.();
    setSelectedEventId(null);
    scrollerRef.current?.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }

  return <section className={`${styles.screenView} ${styles.timelineView}`} aria-labelledby="timeline-heading">
    <header className={styles.screenHeading}><div><h1 id="timeline-heading">Timeline</h1></div><div className={styles.recordCount} title={`${formatCount(retainedCount)} recent records are available`}><Radio size={15} />{formatCount(totalEventCount)} recorded</div></header>
    <div className={styles.timelineFilters}>
      <label><Filter size={15} /><span>Agent</span><select aria-label="Filter events by agent" value={agentFilter} onChange={(event) => setAgentFilter(event.target.value)}><option value="all">All agents</option>{world.agents.map((agent) => <option value={agent.id} key={agent.id}>{eventAgentLabel(agent.id)}</option>)}</select></label>
      <label><span>Category</span><select aria-label="Filter events by category" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value as "all" | SurvivalEventCategory)}>{CATEGORIES.map((category) => <option value={category} key={category}>{humanize(category)}</option>)}</select></label>
    </div>
    {droppedCount > 0 || filtersActive ? <p className={styles.historyScope}>
      {filtersActive ? `${formatCount(filtered.length)} matching ${filtered.length === 1 ? "record" : "records"} in the retained window. ` : ""}
      {`${formatCount(retainedCount)} of ${formatCount(totalEventCount)} events loaded. `}{archiveStatus === "partial" ? "Some earlier records predate this archive or exceeded its retention limit." : archiveStatus === "unavailable" ? "Archive storage is unavailable." : "Older events are stored on this device."}
    </p> : null}
    <div className={styles.timelineTools}>
      <div className={styles.scopeButtons}><button type="button" aria-pressed={milestonesOnly} onClick={() => setMilestonesOnly(v => !v)}>{milestonesOnly ? "Decisions & milestones" : "All raw events"}</button></div>
      <details className={styles.timelineDisplayOptions}><summary>History options</summary><div>
        <button type="button" className={styles.textControl} aria-pressed={groupProjects} onClick={()=>setGroupProjects(v=>!v)}>{groupProjects?"Group project stories: on":"Group project stories: off"}</button>
        <button type="button" className={styles.textControl} aria-pressed={groupRepeats} onClick={()=>setGroupRepeats(v=>!v)}>{groupRepeats?"Group repeated failures: on":"Group repeated failures: off"}</button>
        {hasOlderEvents ? <button type="button" className={styles.textControl} disabled={historyBusy} onClick={() => { onFreezeHistory?.(); void historyAction(onLoadOlder); }}>Load older events</button> : null}
        <button type="button" className={styles.textControl} disabled={historyBusy} onClick={() => void historyAction(onExport)}>Export study</button>
      </div></details>
    </div>
    {historyError ? <p role="alert">{historyError}</p> : null}
    {initialRecordId && !linkedEvent ? <p className={styles.historyScope}>The referenced record is outside the loaded window. Load older events or export the retained archive; missing evidence is not reconstructed.</p> : null}
    {historyFrozen ? <button className={styles.newEventsButton} type="button" onClick={revealNewest}>{newEventCount ? `${newEventCount} new events · ` : "History held · "}Return live</button> : null}
    <div className={styles.timelineScroller} ref={scrollerRef} onScroll={(event) => { if (event.currentTarget.scrollTop > 40 && !historyFrozen) onFreezeHistory?.(); }}>
      {groups.length ? groups.map(([day, events]) => <section className={styles.dayGroup} key={day}><header><span>Day</span><strong>{day}</strong></header><ol>{events.map((event) => <li key={event.id} ref={event.id===linkedEvent?.id?linkedRef:undefined}>
        <button type="button" onClick={() => { onFreezeHistory?.(); setSelectedEventId((current) => current === event.id ? null : event.id); }} aria-expanded={selectedEventId === event.id}>
          <time>{String(Math.floor((event.tick * world.config.stepMinutes) % 1440 / 60)).padStart(2, "0")}:{String((event.tick * world.config.stepMinutes) % 60).padStart(2, "0")}</time>
          <span className={styles.eventAgents}>{event.agentIds.map((id) => {
            const agent = world.agents.find((candidate) => candidate.id === id);
            return <i key={id} title={eventAgentLabel(id)} style={{ "--event-color": agentColor(agent?.label ?? id) } as React.CSSProperties}>{eventAgentLabel(id, true)}</i>;
          })}</span>
          <span><strong>{groupProjects&&typeof event.facts.projectId==="string"?"Exposure project · attempts and results":event.summary}</strong><small>{groupProjects&&typeof event.facts.projectId==="string"?`${episodes.find(p=>p.id===event.facts.projectId)?.records.length??0} loaded records · ${event.outcome}`:event.outcome}</small></span>
          <em>{humanize(event.category)}</em>
        </button>
        {selectedEvent?.id===event.id&&groupProjects&&typeof event.facts.projectId==="string"?<ol className={styles.projectStory}>{episodes.find(p=>p.id===event.facts.projectId)?.records.map(e=><li key={e.id}><time>Day {e.day} · {String(Math.floor(e.tick*world.config.stepMinutes%1440/60)).padStart(2,"0")}:{String(e.tick*world.config.stepMinutes%60).padStart(2,"0")}</time><strong>{e.summary}</strong><p>{e.outcome}</p></li>)}</ol>:null}
        {groupRepeats&&repeatedById.has(event.id)?<details className={styles.failureEpisode}><summary>{repeatedById.get(event.id)!.attempts} unsuccessful attempts · view exact records</summary><ol>{repeatedById.get(event.id)!.records.map(r=><li key={r.id}><time>Step {r.tick}</time><p>{r.summary}</p><small>{r.outcome}</small></li>)}</ol></details>:null}
        {selectedEvent?.id===event.id&&event.type==="agent_died"?world.agents.filter(a=>event.agentIds.includes(a.id)).map(a=><DeathReview key={a.id} agent={a} world={world}/>):null}
        {selectedEvent?.id === event.id ? <div className={styles.eventDetail}><button type="button" aria-label="Close event details" onClick={() => setSelectedEventId(null)}><X size={16} /></button><h3>{event.summary}</h3><p>{event.outcome}</p><dl><div><dt>Record</dt><dd>{event.type.replaceAll("_", " ")}</dd></div><div><dt>Provenance</dt><dd>{event.intervention ? "Observer intervention" : "Simulation outcome"}</dd></div>{Object.entries(event.facts).filter(([key])=>!["candidateSummary","preActionPrediction","measurement"].includes(key)).map(([key,value]) => <div key={key}><dt>{humanize(key)}</dt><dd>{String(value)}</dd></div>)}</dl><DiscoveryEventRecord event={event}/>{event.facts.decisionId ? <details><summary>Records linked to {String(event.facts.decisionId)}</summary><ol>{sourceEvents.filter(e => e.id !== event.id && e.facts.decisionId === event.facts.decisionId).map(e => <li key={e.id}>{e.summary}</li>)}</ol></details> : null}{event.position ? <button type="button" onClick={() => onLocate(event)}><LocateFixed size={15} /> Locate current site</button> : null}</div> : null}
      </li>)}</ol></section>) : <div className={styles.emptyTimeline}><Radio size={24} /><h2>No matching events</h2><p>Change the filters or continue the run until an outcome is recorded.</p></div>}
    </div>
    <footer className={styles.timelineNote}><details><summary>Event history, not replay · About this record</summary><p>Locations show the current world, not a historical scene. This view loads up to 4,096 older events; the device archive retains up to 100,000 per study. Export to keep the retained record. Browsing holds the page while the run continues; Return live shows new events.</p></details></footer>
  </section>;
}
