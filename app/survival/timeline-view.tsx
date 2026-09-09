"use client";

import { Filter, LocateFixed, Radio, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SurvivalEvent, SurvivalEventCategory, SurvivalRunState } from "../simulation/survival";
import { agentColor, humanize } from "./presentation";
import styles from "./survival-experience.module.css";

interface TimelineViewProps {
  world: SurvivalRunState;
  onLocate(event: SurvivalEvent): void;
}

const CATEGORIES: Array<"all" | SurvivalEventCategory> = ["all", "survival", "social", "research", "environment", "agent", "run"];

export function TimelineView({ world, onLocate }: TimelineViewProps) {
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | SurvivalEventCategory>("all");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [newEventCount, setNewEventCount] = useState(0);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const totalEventCount = Math.max(world.events.length, world.eventWindow.totalEvents);
  const previousCursorRef = useRef({ runId: world.id, total: totalEventCount, tick: world.tick });

  useEffect(() => {
    const previous = previousCursorRef.current;
    if (previous.runId !== world.id || totalEventCount < previous.total || world.tick < previous.tick) {
      previousCursorRef.current = { runId: world.id, total: totalEventCount, tick: world.tick };
      setAgentFilter("all");
      setCategoryFilter("all");
      setSelectedEventId(null);
      setNewEventCount(0);
      scrollerRef.current?.scrollTo({ top: 0 });
      return;
    }

    const added = totalEventCount - previous.total;
    previousCursorRef.current = { runId: world.id, total: totalEventCount, tick: world.tick };
    if (!added) return;
    if ((scrollerRef.current?.scrollTop ?? 0) > 40) setNewEventCount((current) => current + added);
  }, [totalEventCount, world.id, world.tick]);

  const filtered = useMemo(() => [...world.events]
    .filter((event) => agentFilter === "all" || event.agentIds.includes(agentFilter))
    .filter((event) => categoryFilter === "all" || event.category === categoryFilter)
    .sort((left, right) => right.tick - left.tick), [agentFilter, categoryFilter, world.events]);

  const groups = useMemo(() => {
    const byDay = new Map<number, SurvivalEvent[]>();
    for (const event of filtered) byDay.set(event.day, [...(byDay.get(event.day) ?? []), event]);
    return [...byDay.entries()].sort((left, right) => right[0] - left[0]);
  }, [filtered]);

  const selectedEvent = selectedEventId === null
    ? null
    : world.events.find((event) => event.id === selectedEventId) ?? null;
  const filtersActive = agentFilter !== "all" || categoryFilter !== "all";
  const retainedCount = world.events.length;
  const droppedCount = Math.max(world.eventWindow.droppedEvents, totalEventCount - retainedCount);
  const oldestRetainedDay = world.events[0]?.day ?? null;
  const formatCount = (value: number) => value.toLocaleString();

  function eventAgentLabel(id: string, compact = false) {
    const agent = world.agents.find((candidate) => candidate.id === id);
    if (!agent) return compact ? "A?" : `Unknown agent · ${id}`;
    if (compact) return `${agent.label}·G${agent.slotGeneration}`;
    return `${agent.label} · generation ${agent.slotGeneration} · ${agent.name}`;
  }

  function revealNewest() {
    scrollerRef.current?.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    setNewEventCount(0);
  }

  return <section className={`${styles.screenView} ${styles.timelineView}`} aria-labelledby="timeline-heading">
    <header className={styles.screenHeading}><div><span>Recorded consequences</span><h1 id="timeline-heading">Timeline</h1><p>Events are factual simulation records. Looking at a location shows the current world, not a reconstructed historical scene.</p></div><div className={styles.recordCount} title={`${formatCount(retainedCount)} recent records are available`}><Radio size={15} />{formatCount(totalEventCount)} recorded</div></header>
    <div className={styles.timelineFilters}>
      <label><Filter size={15} /><span>Agent</span><select value={agentFilter} onChange={(event) => setAgentFilter(event.target.value)}><option value="all">All agents</option>{world.agents.map((agent) => <option value={agent.id} key={agent.id}>{eventAgentLabel(agent.id)}</option>)}</select></label>
      <label><span>Category</span><select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value as "all" | SurvivalEventCategory)}>{CATEGORIES.map((category) => <option value={category} key={category}>{humanize(category)}</option>)}</select></label>
    </div>
    {droppedCount > 0 || filtersActive ? <p className={styles.historyScope}>
      {filtersActive ? `${formatCount(filtered.length)} matching ${filtered.length === 1 ? "record" : "records"} in the retained window. ` : ""}
      {droppedCount > 0 ? `The latest ${formatCount(retainedCount)} of ${formatCount(totalEventCount)} events remain in this checkpoint${oldestRetainedDay === null ? "" : `, beginning on Day ${oldestRetainedDay}`}; ${formatCount(droppedCount)} earlier ${droppedCount === 1 ? "event was" : "events were"} compacted.` : `All ${formatCount(totalEventCount)} recorded events remain available.`}
    </p> : null}
    {newEventCount ? <button className={styles.newEventsButton} type="button" onClick={revealNewest}>{newEventCount} new event{newEventCount === 1 ? "" : "s"}</button> : null}
    <div className={styles.timelineScroller} ref={scrollerRef} onScroll={(event) => { if (event.currentTarget.scrollTop < 40) setNewEventCount(0); }}>
      {groups.length ? groups.map(([day, events]) => <section className={styles.dayGroup} key={day}><header><span>Day</span><strong>{day}</strong></header><ol>{events.map((event) => <li key={event.id}>
        <button type="button" onClick={() => setSelectedEventId((current) => current === event.id ? null : event.id)} aria-expanded={selectedEventId === event.id}>
          <time>{String(Math.floor((event.tick * world.config.stepMinutes) % 1440 / 60)).padStart(2, "0")}:{String((event.tick * world.config.stepMinutes) % 60).padStart(2, "0")}</time>
          <span className={styles.eventAgents}>{event.agentIds.map((id) => {
            const agent = world.agents.find((candidate) => candidate.id === id);
            return <i key={id} title={eventAgentLabel(id)} style={{ "--event-color": agentColor(agent?.label ?? id) } as React.CSSProperties}>{eventAgentLabel(id, true)}</i>;
          })}</span>
          <span><strong>{event.summary}</strong><small>{event.outcome}</small></span>
          <em>{humanize(event.category)}</em>
        </button>
        {selectedEvent?.id === event.id ? <div className={styles.eventDetail}><button type="button" aria-label="Close event details" onClick={() => setSelectedEventId(null)}><X size={16} /></button><dl><div><dt>Record</dt><dd>{event.type.replaceAll("_", " ")}</dd></div><div><dt>Provenance</dt><dd>{event.intervention ? "Observer intervention" : "Simulation outcome"}</dd></div></dl>{event.position ? <button type="button" onClick={() => onLocate(event)}><LocateFixed size={15} /> Locate current site</button> : null}</div> : null}
      </li>)}</ol></section>) : <div className={styles.emptyTimeline}><Radio size={24} /><h2>No matching events</h2><p>Change the filters or continue the run until an outcome is recorded.</p></div>}
    </div>
    <footer className={styles.timelineNote}>Historical state replay is unavailable because this run stores a bounded recent-event window and the current checkpoint, not a renderable world snapshot for every moment.</footer>
  </section>;
}
