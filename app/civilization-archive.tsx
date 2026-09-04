"use client";

import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  BookOpen,
  ChevronRight,
  CircleDot,
  Crown,
  Droplets,
  Landmark,
  Leaf,
  RefreshCw,
  ScrollText,
  Search,
  Shield,
  Sparkles,
  Swords,
  Tent,
  Users,
  Wheat,
  Wrench,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  getBeliefTenetLabel,
  getCivilizationSummary,
  getRankedBeliefs,
  getRankedCamps,
  getTechnologyLabel,
  getWorldTimeLabel,
  normalizeCivilizationWorld,
  validateCivilizationWorld,
  type BeliefTenetId,
  type CivilizationBeliefSystem,
  type CivilizationCamp,
  type CivilizationWorldState,
  type MajorEvent,
  type MajorEventType,
} from "./simulation/civilization-engine";

type CampFilter = "all" | "active" | "historical";
type EntityFilter = "all" | "civilizations" | "agents" | "beliefs" | "events";
type ArchiveSort = "relevance" | "power" | "recent";
type SyncState = "loading" | "current" | "refreshing" | "offline";

interface ArchiveSearchResult {
  id: string;
  kind: Exclude<EntityFilter, "all">;
  title: string;
  subtitle: string;
  searchable: string;
  active: boolean | null;
  campId?: string;
  beliefId?: string;
  agentId?: string;
  day?: number;
  power: number;
  relevance: number;
}

interface WorldResponse {
  world?: unknown;
  history?: MajorEvent[];
  archiveHighlights?: {
    camps?: Record<string, MajorEvent[]>;
    beliefs?: Record<string, MajorEvent[]>;
  };
  revision?: number;
  persistent?: boolean;
  error?: string;
}

const TENET_VALUES: Record<BeliefTenetId, string> = {
  reciprocal_aid: "Mutual care is the surest defense against scarcity and danger.",
  land_stewardship: "Resources should be renewed and protected for those who follow.",
  ancestor_memory: "The lessons and sacrifices of earlier generations deserve remembrance.",
  martial_merit: "Courage, readiness, and proven defense earn honor and authority.",
  knowledge_seeking: "Discovery and tested understanding are paths to collective strength.",
  ordered_duty: "Stable roles and shared obligations keep a community from fracturing.",
  free_conscience: "Each person must remain free to accept, question, change, or reject belief.",
  shared_prosperity: "A society succeeds when its security and abundance reach the whole camp.",
};

const EVENT_WEIGHT: Partial<Record<MajorEventType, number>> = {
  world_started: 10,
  birth: 3,
  death: 6,
  camp_founded: 10,
  camp_destroyed: 11,
  camp_captured: 11,
  defection: 7,
  join: 5,
  breakaway: 10,
  coup: 10,
  alliance: 8,
  truce: 6,
  war: 9,
  peace: 8,
  tech_unlocked: 8,
  leadership_change: 7,
  power_lead_change: 9,
  belief_founded: 10,
  belief_conversion_wave: 7,
  belief_schism: 10,
  belief_reformed: 8,
  belief_rejected: 4,
  belief_faded: 9,
  shrine_built: 6,
  agent_renamed: 5,
  camp_renamed: 7,
};

function compact(value: number) {
  return Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function percent(value: number) {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function eventImpact(event: MajorEvent) {
  const tone = event.tone === "critical" ? 3 : event.tone === "warning" ? 2 : event.tone === "positive" ? 1 : 0;
  return (EVENT_WEIGHT[event.type] ?? 4) + tone + Math.min(2, event.agentIds.length * 0.2);
}

function rankedMoments(events: MajorEvent[], predicate: (event: MajorEvent) => boolean, limit: number) {
  return events
    .filter(predicate)
    .sort((left, right) => eventImpact(right) - eventImpact(left) || right.day - left.day || right.id.localeCompare(left.id))
    .slice(0, limit);
}

function mergeHistory(world: CivilizationWorldState, history: MajorEvent[] = []) {
  const byId = new Map<string, MajorEvent>();
  for (const event of [...history, ...world.majorEvents]) byId.set(event.id, event);
  return [...byId.values()].sort((left, right) => right.day - left.day || right.id.localeCompare(left.id));
}

function eventKind(type: string) {
  return type.replaceAll("_", " ");
}

function titleCase(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function readSearchParam(name: string, fallback = "") {
  if (typeof window === "undefined") return fallback;
  return new URLSearchParams(window.location.search).get(name) ?? fallback;
}

function chapterForDay(day: number) {
  return Math.max(1, Math.floor((Math.max(1, day) - 1) / 200) + 1);
}

function archiveHref(parameters: Record<string, string | number | null | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(parameters)) {
    if (value !== null && value !== undefined && value !== "") search.set(key, String(value));
  }
  const query = search.toString();
  return `/archive${query ? `?${query}` : ""}`;
}

function mapOverlayForEvent(event?: MajorEvent) {
  if (!event) return "world";
  if (/war|peace|truce|alliance/.test(event.type)) return event.type === "war" ? "wars" : "alliances";
  if (/belief|shrine/.test(event.type)) return "beliefs";
  if (/camp|breakaway|capture|destroy|rename/.test(event.type)) return "territories";
  return "world";
}

function sumResources(camp: CivilizationCamp) {
  return camp.storage.food + camp.storage.water + camp.storage.wood + camp.storage.ore;
}

function Metric({ icon, label, value, note }: { icon: ReactNode; label: string; value: string | number; note?: string }) {
  return <div className="archive-metric">
    <span className="archive-metric-icon" aria-hidden="true">{icon}</span>
    <span><small>{label}</small><b>{value}</b>{note && <em>{note}</em>}</span>
  </div>;
}

function StatusPill({ active, children }: { active: boolean; children: ReactNode }) {
  return <span className={`archive-status ${active ? "active" : "historical"}`}><i />{children}</span>;
}

function EventList({ events, empty }: { events: MajorEvent[]; empty: string }) {
  if (events.length === 0) return <p className="archive-empty">{empty}</p>;
  return <ol className="archive-moment-list">
    {events.map((event, index) => <li key={event.id} className={`tone-${event.tone}`}>
      <span className="archive-moment-rank">{String(index + 1).padStart(2, "0")}</span>
      <span className="archive-moment-copy"><small>Day {Math.max(1, Math.floor(event.day))} · {eventKind(event.type)}</small><b>{event.title}</b><p>{event.message}</p><span className="archive-entity-actions">
        <Link href={`/history?chapter=${chapterForDay(event.day)}&day=${Math.max(1, Math.floor(event.day))}&q=${encodeURIComponent(event.title)}`}>Read in chapter</Link>
        {event.campIds[0] && <Link href={`/?camp=${encodeURIComponent(event.campIds[0])}&overlay=${mapOverlayForEvent(event)}`}>Show on map</Link>}
      </span></span>
    </li>)}
  </ol>;
}

function CampArchive({ world, camp, events, onOpenBelief, onOpenCamp }: {
  world: CivilizationWorldState;
  camp: CivilizationCamp;
  events: MajorEvent[];
  onOpenBelief: (id: string) => void;
  onOpenCamp: (id: string) => void;
}) {
  const agentsById = useMemo(() => new Map(world.agents.map((agent) => [agent.id, agent])), [world.agents]);
  const founder = agentsById.get(camp.founderAgentId);
  const leader = camp.leaderId ? agentsById.get(camp.leaderId) : undefined;
  const parent = camp.parentCampId ? world.camps.find((candidate) => candidate.id === camp.parentCampId) : undefined;
  const captor = camp.capturedByCampId ? world.camps.find((candidate) => candidate.id === camp.capturedByCampId) : undefined;
  const belief = camp.dominantBeliefId ? world.beliefs.find((candidate) => candidate.id === camp.dominantBeliefId) : undefined;
  const livingMembers = camp.memberIds.filter((id) => agentsById.get(id)?.alive && agentsById.get(id)?.campId === camp.id).length;
  const currentMembers = camp.memberIds.map((id) => agentsById.get(id)).filter((agent) => agent?.alive && agent.campId === camp.id);
  const secularMembers = currentMembers.filter((agent) => !agent?.beliefId).length;
  const relations = world.relations.filter((relation) => relation.campAId === camp.id || relation.campBId === camp.id);
  const wars = relations.filter((relation) => relation.status === "war");
  const allies = relations.filter((relation) => relation.status === "alliance");
  const consequentialRelations = relations.filter((relation) => relation.status !== "neutral");
  const neutralRelations = relations.filter((relation) => relation.status === "neutral");
  const moments = rankedMoments(events, (event) => event.campIds.includes(camp.id), 8);
  const powerRank = getRankedCamps(world).filter((candidate) => candidate.active).findIndex((candidate) => candidate.id === camp.id) + 1;
  const structures = Object.entries(camp.structures).filter(([, level]) => level > 0);

  return <article className="archive-dossier" style={{ "--archive-accent": camp.color } as CSSProperties}>
    <header className="archive-dossier-head">
      <span className="archive-camp-emblem" aria-hidden="true"><Tent size={22} /></span>
      <div><span className="archive-kicker">Civilization record</span><h2>{camp.name}</h2><p>Founded on day {Math.max(1, Math.floor(camp.foundedDay))}{camp.parentCampId ? parent ? ` as a breakaway from ${parent.name}` : " as a breakaway from an archived power" : " as an independent founding camp"}.</p></div>
      <StatusPill active={camp.active}>{camp.active ? `Active${powerRank > 0 ? ` · Rank ${powerRank}` : ""}` : "Historical"}</StatusPill>
      <span className="archive-entity-actions archive-dossier-actions">
        <Link href={`/?camp=${encodeURIComponent(camp.id)}&overlay=territories`}>Show on map</Link>
        <Link href={`/history?chapter=${chapterForDay(camp.foundedDay)}&day=${Math.max(1, Math.floor(camp.foundedDay))}`}>Read its first chapter</Link>
      </span>
    </header>

    <div className="archive-vitals">
      <Metric icon={<Crown />} label="Power" value={compact(camp.power)} note={`${compact(camp.economicPower)} economic`} />
      <Metric icon={<Users />} label="Population" value={livingMembers} note={`${camp.memberIds.length} members in current record`} />
      <Metric icon={<Shield />} label="Defense" value={compact(camp.militaryPower)} note={`${camp.victories} wins · ${camp.losses} losses`} />
      <Metric icon={<BookOpen />} label="Knowledge" value={compact(camp.knowledgePower)} note={`${camp.technologies.length} technologies`} />
    </div>

    <div className="archive-dossier-grid">
      <section className="archive-card archive-identity-card">
        <div className="archive-section-title"><Landmark size={14} /><span>People & leadership</span></div>
        <dl className="archive-facts">
          <div><dt>Founder</dt><dd>{founder ? <Link className="archive-linked-chip" href={`/?agent=${encodeURIComponent(founder.id)}&camp=${encodeURIComponent(camp.id)}&overlay=territories`}>{founder.name}</Link> : "Archived founder"}<small>{founder ? (founder.alive ? "Living" : `Fallen${founder.deathDay ? ` · day ${Math.floor(founder.deathDay)}` : ""}`) : "Record no longer in the active roster"}</small></dd></div>
          <div><dt>Current leader</dt><dd>{leader ? <Link className="archive-linked-chip" href={`/?agent=${encodeURIComponent(leader.id)}&camp=${encodeURIComponent(camp.id)}&overlay=territories`}>{leader.name}</Link> : camp.active ? "Council vacancy" : "No active leader"}<small>{leader ? `Generation ${leader.generation} · ${compact(leader.influence + leader.spiritualInfluence)} influence` : ""}</small></dd></div>
          <div><dt>Origin</dt><dd>{camp.parentCampId ? parent ? <Link className="archive-linked-chip" href={archiveHref({ camp: parent.id })} onClick={() => onOpenCamp(parent.id)}>Breakaway from {parent.name}</Link> : "Breakaway from an archived power" : "Original power"}<small>{captor ? <Link className="archive-linked-chip" href={archiveHref({ camp: captor.id })} onClick={() => onOpenCamp(captor.id)}>Later captured by {captor.name}</Link> : camp.destroyedDay ? `Ended on day ${Math.floor(camp.destroyedDay)}` : "Self-governing"}</small></dd></div>
          <div><dt>Cohesion</dt><dd>{percent(camp.cohesion)}<small>{percent(camp.beliefDiversity)} belief diversity</small></dd></div>
        </dl>
      </section>

      <section className="archive-card">
        <div className="archive-section-title"><Wheat size={14} /><span>Stores & development</span></div>
        <div className="archive-store-total"><strong>{compact(sumResources(camp))}</strong><span>total stored resources</span></div>
        <div className="archive-resource-grid">
          <span><Wheat />Food <b>{compact(camp.storage.food)}</b></span>
          <span><Droplets />Water <b>{compact(camp.storage.water)}</b></span>
          <span><Leaf />Wood <b>{compact(camp.storage.wood)}</b></span>
          <span><Wrench />Ore <b>{compact(camp.storage.ore)}</b></span>
        </div>
        <div className="archive-tech-list" aria-label="Technologies developed">
          {camp.technologies.length > 0 ? camp.technologies.map((technology) => <span key={technology}>{getTechnologyLabel(technology)}</span>) : <em>No completed technologies recorded</em>}
        </div>
        <div className="archive-structure-line"><span>Built works</span><b>{structures.length > 0 ? structures.map(([kind, level]) => `${titleCase(kind)} ${level}`).join(" · ") : "No surviving structures"}</b></div>
      </section>

      <section className="archive-card">
        <div className="archive-section-title"><Sparkles size={14} /><span>Belief & public life</span></div>
        {belief ? <>
          <button className="archive-belief-jump" onClick={() => onOpenBelief(belief.id)}>
            <i style={{ backgroundColor: belief.color }} /><span><b>{belief.name}</b><small>{belief.tenets.map(getBeliefTenetLabel).join(" · ")}</small></span><ChevronRight />
          </button>
          <p className="archive-context-copy">The camp&apos;s dominant tradition coexists with {percent(camp.beliefDiversity)} measured belief diversity. {livingMembers > 0 ? `${percent(secularMembers / livingMembers)} of its living population is secular or unaffiliated.` : "No living population remains to measure."} A dominant belief records influence, not mandatory adherence.</p>
        </> : <div className="archive-null-state"><CircleDot /><b>No dominant belief</b><p>Citizens remain secular, unaffiliated, or too diverse for one tradition to define public life.</p></div>}
      </section>

      <section className="archive-card">
        <div className="archive-section-title"><Swords size={14} /><span>Diplomatic position</span></div>
        <div className="archive-diplomacy-counts">
          <span><b>{allies.length}</b> alliances</span><span className={wars.length ? "danger" : ""}><b>{wars.length}</b> active wars</span><span><b>{relations.filter((relation) => relation.status === "truce").length}</b> truces</span>
        </div>
        <div className="archive-relation-list">
          {consequentialRelations.length > 0 ? consequentialRelations.slice().sort((left, right) => left.status.localeCompare(right.status)).map((relation) => {
            const otherId = relation.campAId === camp.id ? relation.campBId : relation.campAId;
            const other = world.camps.find((candidate) => candidate.id === otherId);
            return <span key={relation.id} className={`relation-${relation.status}`}><i /><Link href={other ? archiveHref({ camp: other.id }) : "#civilizations"} onClick={() => other && onOpenCamp(other.id)}>{other?.name ?? "Archived power"}</Link><b>{relation.status}</b></span>;
          }) : <p>No active alliances, wars, or truces for this civilization.</p>}
          {neutralRelations.length > 0 && <details className="archive-diplomacy-toggle">
            <summary>Show {neutralRelations.length} neutral {neutralRelations.length === 1 ? "contact" : "contacts"}</summary>
            <div>{neutralRelations.map((relation) => {
              const otherId = relation.campAId === camp.id ? relation.campBId : relation.campAId;
              const other = world.camps.find((candidate) => candidate.id === otherId);
              return <span key={relation.id} className="relation-neutral"><i /><Link href={other ? archiveHref({ camp: other.id }) : "#civilizations"} onClick={() => other && onOpenCamp(other.id)}>{other?.name ?? "Archived power"}</Link><b>neutral</b></span>;
            })}</div>
          </details>}
        </div>
      </section>
    </div>

    <section className="archive-history-block">
      <div className="archive-heading-row"><div><span className="archive-kicker">Ranked by historical impact</span><h3>Biggest moments</h3></div><span>{moments.length} defining records</span></div>
      <EventList events={moments} empty="No camp-linked major events have entered the chronicle yet." />
    </section>
  </article>;
}

function BeliefArchive({ world, belief, events, onOpenBelief, onOpenCamp }: { world: CivilizationWorldState; belief: CivilizationBeliefSystem; events: MajorEvent[]; onOpenBelief: (id: string) => void; onOpenCamp: (id: string) => void }) {
  const founder = world.agents.find((agent) => agent.id === belief.founderAgentId);
  const origin = belief.originCampId ? world.camps.find((camp) => camp.id === belief.originCampId) : undefined;
  const livingIds = new Set(world.agents.filter((agent) => agent.alive).map((agent) => agent.id));
  const activeCampIds = new Set(world.camps.filter((camp) => camp.active).map((camp) => camp.id));
  const livingAdherents = belief.adherentIds.filter((id) => livingIds.has(id)).length;
  const activeCampReach = belief.campIds.filter((id) => activeCampIds.has(id)).length;
  const lineage: CivilizationBeliefSystem[] = [];
  const seen = new Set<string>([belief.id]);
  let parentId = belief.parentBeliefId;
  while (parentId && lineage.length < 8 && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = world.beliefs.find((candidate) => candidate.id === parentId);
    if (!parent) break;
    lineage.unshift(parent);
    parentId = parent.parentBeliefId;
  }
  const moments = rankedMoments(events, (event) => event.beliefIds.includes(belief.id), 6);
  const unresolvedParent = Boolean(belief.parentBeliefId && lineage.length === 0);
  const originPhrase = origin ? `at ${origin.name}` : belief.originCampId ? "at an archived origin camp" : "outside an established camp";

  return <article className="archive-belief-dossier" style={{ "--belief-accent": belief.color } as CSSProperties}>
    <header>
      <span className="archive-belief-sigil" aria-hidden="true"><i /></span>
      <div><span className="archive-kicker">{belief.active ? "Living tradition" : "Historical belief"}</span><h3>{belief.name}</h3><p>Founded day {Math.max(1, Math.floor(belief.foundedDay))} by {founder ? <Link className="archive-linked-chip" href={`/?agent=${encodeURIComponent(founder.id)}&overlay=beliefs`}>{founder.name}</Link> : "an archived founder"} {origin ? <>at <Link className="archive-linked-chip" href={archiveHref({ camp: origin.id })} onClick={() => onOpenCamp(origin.id)}>{origin.name}</Link></> : originPhrase}.</p></div>
      <StatusPill active={belief.active}>{belief.active ? "Active" : "Faded"}</StatusPill>
      <span className="archive-entity-actions archive-dossier-actions">
        <Link href={`/?belief=${encodeURIComponent(belief.id)}&overlay=beliefs`}>Show on map</Link>
        <Link href={`/history?chapter=${chapterForDay(belief.foundedDay)}&day=${Math.max(1, Math.floor(belief.foundedDay))}`}>Read its founding</Link>
        {founder && <Link href={`/?agent=${encodeURIComponent(founder.id)}&overlay=beliefs`}>Follow {founder.name}</Link>}
      </span>
    </header>

    <div className="archive-lineage" aria-label="Belief lineage"><span>Lineage</span>{lineage.map((ancestor) => <Link className="archive-linked-chip" href={`${archiveHref({ belief: ancestor.id })}#beliefs`} key={ancestor.id} onClick={() => onOpenBelief(ancestor.id)}><i style={{ backgroundColor: ancestor.color }} />{ancestor.name}<ChevronRight /></Link>)}{unresolvedParent && <span>Archived parent movement<ChevronRight /></span>}{!belief.parentBeliefId && <span>Original movement<ChevronRight /></span>}<b>{belief.name}</b></div>

    <div className="archive-belief-stats">
      <span><small>Living adherents</small><b>{livingAdherents}</b><em>{belief.adherentIds.length} in current record</em></span>
      <span><small>Camp reach</small><b>{activeCampReach}</b><em>{belief.campIds.length} across history</em></span>
      <span><small>Influence</small><b>{compact(belief.influence)}</b><em>{percent(belief.unity)} unity</em></span>
      <span><small>Evolution</small><b>{belief.reformationCount + belief.schismCount}</b><em>{belief.reformationCount} reforms · {belief.schismCount} schisms</em></span>
    </div>

    <section className="archive-core-values">
      <div className="archive-section-title"><Sparkles size={14} /><span>Current core values · including reforms</span></div>
      <div>{belief.tenets.map((tenet) => <article key={tenet}><b>{getBeliefTenetLabel(tenet)}</b><p>{TENET_VALUES[tenet]}</p></article>)}</div>
    </section>

    <section className="archive-belief-moments">
      <div className="archive-section-title"><Activity size={14} /><span>Defining moments</span></div>
      <EventList events={moments} empty="This belief has no linked major events beyond its current record." />
    </section>
  </article>;
}

function ArchiveLoading() {
  return <main className="archive-page archive-loading" aria-busy="true" aria-label="Loading the world archive">
    <div className="archive-loading-mark"><BookOpen /><span>Opening the living chronicle</span><i /></div>
  </main>;
}

export function CivilizationArchive() {
  const [world, setWorld] = useState<CivilizationWorldState | null>(null);
  const [events, setEvents] = useState<MajorEvent[]>([]);
  const [archiveHighlights, setArchiveHighlights] = useState<{
    camps: Record<string, MajorEvent[]>;
    beliefs: Record<string, MajorEvent[]>;
  }>({ camps: {}, beliefs: {} });
  const [revision, setRevision] = useState(0);
  const [syncState, setSyncState] = useState<SyncState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [selectedCampId, setSelectedCampId] = useState<string | null>(() => readSearchParam("camp") || null);
  const [selectedBeliefId, setSelectedBeliefId] = useState<string | null>(() => readSearchParam("belief") || null);
  const [campFilter, setCampFilter] = useState<CampFilter>(() => {
    const value = readSearchParam("status");
    return value === "active" || value === "historical" ? value : "all";
  });
  const [entityFilter, setEntityFilter] = useState<EntityFilter>(() => {
    const value = readSearchParam("type");
    return value === "civilizations" || value === "agents" || value === "beliefs" || value === "events" ? value : "all";
  });
  const [sortMode, setSortMode] = useState<ArchiveSort>(() => {
    const value = readSearchParam("sort");
    return value === "power" || value === "recent" ? value : "relevance";
  });
  const [query, setQuery] = useState(() => readSearchParam("q"));
  const initialDeepLinkHandled = useRef(false);

  const loadWorld = useCallback(async (silent = false) => {
    try {
      const response = await fetch("/api/world?view=archive", { cache: "no-store" });
      if (!silent) setSyncState((current) => current === "loading" ? "loading" : "refreshing");
      const payload = await response.json() as WorldResponse;
      if (!response.ok || !payload.world || !validateCivilizationWorld(payload.world)) {
        throw new Error(payload.error ?? "The archive could not verify the living world.");
      }
      const nextWorld = normalizeCivilizationWorld(payload.world);
      setWorld(nextWorld);
      setEvents(mergeHistory(nextWorld, payload.history));
      setArchiveHighlights({
        camps: payload.archiveHighlights?.camps ?? {},
        beliefs: payload.archiveHighlights?.beliefs ?? {},
      });
      setRevision(payload.revision ?? 0);
      setSelectedCampId((current) => nextWorld.camps.some((camp) => camp.id === current) ? current : getRankedCamps(nextWorld)[0]?.id ?? null);
      setSelectedBeliefId((current) => nextWorld.beliefs.some((belief) => belief.id === current) ? current : getRankedBeliefs(nextWorld)[0]?.id ?? null);
      setError(null);
      setSyncState("current");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The living archive is temporarily unavailable.");
      setSyncState("offline");
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void loadWorld(), 0);
    const interval = window.setInterval(() => void loadWorld(true), 20_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [loadWorld]);

  useEffect(() => {
    if (!world) return;
    const url = new URL(window.location.href);
    const values: Record<string, string | null> = {
      camp: selectedCampId,
      belief: selectedBeliefId,
      q: query.trim() || null,
      status: campFilter === "all" ? null : campFilter,
      type: entityFilter === "all" ? null : entityFilter,
      sort: sortMode === "relevance" ? null : sortMode,
    };
    for (const [key, value] of Object.entries(values)) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }, [campFilter, entityFilter, query, selectedBeliefId, selectedCampId, sortMode, world]);

  useEffect(() => {
    if (!world || initialDeepLinkHandled.current) return;
    initialDeepLinkHandled.current = true;
    const target = window.location.hash === "#beliefs" || readSearchParam("belief") ? "beliefs" : readSearchParam("camp") ? "civilizations" : null;
    if (!target) return;
    window.requestAnimationFrame(() => document.getElementById(target)?.scrollIntoView({ block: "start" }));
  }, [world]);

  const rankedCamps = useMemo(() => world ? getRankedCamps(world) : [], [world]);
  const rankedBeliefs = useMemo(() => world ? getRankedBeliefs(world) : [], [world]);
  const selectedBelief = world?.beliefs.find((belief) => belief.id === selectedBeliefId) ?? rankedBeliefs[0];
  const summary = world ? getCivilizationSummary(world) : null;
  const searchResults = useMemo(() => {
    if (!world) return { visible: [] as ArchiveSearchResult[], total: 0, campIds: new Set<string>() };
    const normalized = query.trim().toLocaleLowerCase();
    const agentsById = new Map(world.agents.map((agent) => [agent.id, agent]));
    const campsById = new Map(world.camps.map((camp) => [camp.id, camp]));
    const beliefsById = new Map(world.beliefs.map((belief) => [belief.id, belief]));
    const founderIds = new Set(world.camps.map((camp) => camp.founderAgentId));
    const results: ArchiveSearchResult[] = [];
    const include = (kind: ArchiveSearchResult["kind"], active: boolean | null, searchable: string) => {
      if (entityFilter !== "all" && entityFilter !== kind) return false;
      if (campFilter !== "all" && active !== (campFilter === "active")) return false;
      return !normalized || searchable.toLocaleLowerCase().includes(normalized);
    };
    const relevance = (title: string, searchable: string) => {
      if (!normalized) return 0;
      const lowerTitle = title.toLocaleLowerCase();
      if (lowerTitle === normalized) return 100;
      if (lowerTitle.startsWith(normalized)) return 70;
      if (lowerTitle.includes(normalized)) return 45;
      return searchable.toLocaleLowerCase().includes(normalized) ? 20 : 0;
    };

    for (const camp of rankedCamps) {
      const founder = agentsById.get(camp.founderAgentId);
      const belief = camp.dominantBeliefId ? beliefsById.get(camp.dominantBeliefId) : undefined;
      const searchable = `${camp.name} ${founder?.name ?? ""} ${belief?.name ?? ""} ${camp.technologies.map(getTechnologyLabel).join(" ")}`;
      if (!include("civilizations", camp.active, searchable)) continue;
      results.push({ id: `camp:${camp.id}`, kind: "civilizations", title: camp.name, subtitle: `${camp.active ? "Active civilization" : "Historical civilization"} · founded by ${founder?.name ?? "an archived founder"}`, searchable, active: camp.active, campId: camp.id, day: camp.foundedDay, power: camp.power, relevance: relevance(camp.name, searchable) });
    }
    for (const agent of world.agents) {
      const camp = agent.campId ? campsById.get(agent.campId) : undefined;
      const founderLabel = founderIds.has(agent.id) ? "founder" : "agent";
      const searchable = `${agent.name} ${founderLabel} ${camp?.name ?? "unaffiliated"}`;
      if (!include("agents", agent.alive, searchable)) continue;
      results.push({ id: `agent:${agent.id}`, kind: "agents", title: agent.name, subtitle: `${agent.alive ? "Living" : "Historical"} ${founderLabel} · ${camp?.name ?? "Unaffiliated"} · generation ${agent.generation}`, searchable, active: agent.alive, campId: camp?.id, agentId: agent.id, day: agent.bornAtDay, power: agent.personalPower + agent.influence + agent.spiritualInfluence, relevance: relevance(agent.name, searchable) + (founderIds.has(agent.id) ? 4 : 0) });
    }
    for (const belief of rankedBeliefs) {
      const founder = agentsById.get(belief.founderAgentId);
      const searchable = `${belief.name} ${founder?.name ?? ""} ${belief.tenets.map(getBeliefTenetLabel).join(" ")}`;
      if (!include("beliefs", belief.active, searchable)) continue;
      results.push({ id: `belief:${belief.id}`, kind: "beliefs", title: belief.name, subtitle: `${belief.active ? "Living belief" : "Faded belief"} · founded by ${founder?.name ?? "an archived founder"}`, searchable, active: belief.active, beliefId: belief.id, campId: belief.originCampId ?? undefined, day: belief.foundedDay, power: belief.influence, relevance: relevance(belief.name, searchable) });
    }
    for (const event of events) {
      const linkedNames = [
        ...event.agentIds.map((id) => agentsById.get(id)?.name ?? ""),
        ...event.campIds.map((id) => campsById.get(id)?.name ?? ""),
        ...event.beliefIds.map((id) => beliefsById.get(id)?.name ?? ""),
      ].join(" ");
      const searchable = `${event.title} ${event.message} ${eventKind(event.type)} ${linkedNames}`;
      if (!include("events", null, searchable)) continue;
      results.push({ id: `event:${event.id}`, kind: "events", title: event.title, subtitle: `Day ${Math.max(1, Math.floor(event.day))} · ${eventKind(event.type)}`, searchable, active: null, campId: event.campIds[0], beliefId: event.beliefIds[0], agentId: event.agentIds[0], day: event.day, power: eventImpact(event), relevance: relevance(event.title, searchable) });
    }

    results.sort((left, right) => {
      if (sortMode === "recent") return (right.day ?? 0) - (left.day ?? 0) || right.power - left.power || left.id.localeCompare(right.id);
      if (sortMode === "power") return right.power - left.power || (right.day ?? 0) - (left.day ?? 0) || left.id.localeCompare(right.id);
      return right.relevance - left.relevance || right.power - left.power || left.id.localeCompare(right.id);
    });
    const visible = results.slice(0, 80);
    const pinnedIds = [`camp:${selectedCampId ?? ""}`, `belief:${selectedBeliefId ?? ""}`];
    for (const pinnedId of pinnedIds.reverse()) {
      const pinned = results.find((result) => result.id === pinnedId);
      if (pinned && !visible.some((result) => result.id === pinnedId)) visible.unshift(pinned);
    }
    if (visible.length > 82) visible.length = 82;
    return { visible, total: results.length, campIds: new Set(results.flatMap((result) => result.kind === "civilizations" && result.campId ? [result.campId] : [])) };
  }, [campFilter, entityFilter, events, query, rankedBeliefs, rankedCamps, selectedBeliefId, selectedCampId, sortMode, world]);
  const selectedCampCandidate = world?.camps.find((camp) => camp.id === selectedCampId) ?? rankedCamps[0];
  const firstMatchingCamp = rankedCamps.find((camp) => searchResults.campIds.has(camp.id));
  const constrainDossierToResults = entityFilter === "civilizations" || (entityFilter === "all" && campFilter !== "all");
  const selectedCamp = constrainDossierToResults
    ? selectedCampCandidate && searchResults.campIds.has(selectedCampCandidate.id) ? selectedCampCandidate : firstMatchingCamp
    : selectedCampCandidate;

  const openBelief = useCallback((id: string) => {
    setSelectedBeliefId(id);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.requestAnimationFrame(() => document.getElementById("beliefs")?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" }));
  }, []);

  const openCamp = useCallback((id: string) => {
    setSelectedCampId(id);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.requestAnimationFrame(() => document.getElementById("civilizations")?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" }));
  }, []);

  if (!world && syncState === "loading") return <ArchiveLoading />;

  if (!world) return <main className="archive-page archive-error">
    <div>
      <span className="archive-camp-emblem"><BookOpen /></span>
      <span className="archive-kicker">Archive connection interrupted</span>
      <h1>The chronicle is temporarily closed.</h1>
      <p>{error ?? "The persistent world could not be reached. Its history has not been replaced or reset."}</p>
      <button onClick={() => void loadWorld()}><RefreshCw />Try again</button>
      <Link href="/"><ArrowLeft />Return to live map</Link>
    </div>
  </main>;

  const activeCount = world.camps.filter((camp) => camp.active).length;
  const historicalCount = world.camps.length - activeCount;

  return <main className="archive-page">
    <header className="archive-topbar">
      <Link href="/" className="archive-brand" aria-label="Wildgrid Sovereignty live map">
        <span><Leaf size={16} /></span><div><b>WILDGRID <em>SOVEREIGNTY</em></b><small>World archive</small></div>
      </Link>
      <nav className="site-section-nav" aria-label="Site pages">
        <Link href="/"><Activity /><span>Map</span></Link>
        <span className="site-section-link" aria-current="page"><Landmark /><span>Civilizations</span></span>
        <Link href="/history"><BookOpen /><span>History</span></Link>
      </nav>
      <div className="archive-live" title={`Persistent world revision ${revision}`}><i className={syncState === "offline" ? "offline" : ""} /><span>{syncState === "refreshing" ? "UPDATING" : syncState === "offline" ? "LAST KNOWN" : `LIVE · R${revision}`}</span></div>
      <div className="archive-route-links">
        <a href="#civilizations" className="archive-history-link"><Search /><span>Search records</span></a>
        <a href="#beliefs" className="archive-map-link"><Sparkles /><span>Beliefs</span></a>
      </div>
    </header>

    <section className="archive-hero" id="overview">
      <div className="archive-hero-copy">
        <span className="archive-kicker"><BookOpen size={12} /> The living chronicle</span>
        <h1>Every power leaves a record.</h1>
        <p>Study the civilizations shaping Wildgrid without the map: who founded them, what they believe, how they survive, and the moments that changed their place in history.</p>
      </div>
      <div className="archive-world-clock"><small>Current world time</small><b>{getWorldTimeLabel(world)}</b><span>History continues while this page is open.</span></div>
    </section>

    {error && <div className="archive-sync-warning" role="status"><CircleDot />Showing the last verified record while the archive reconnects.<button onClick={() => void loadWorld()}>Retry now</button></div>}

    <section className="archive-overview" aria-label="World overview">
      <Metric icon={<Users />} label="Living population" value={summary?.population ?? 0} note={`${summary?.totalBorn ?? 0} born across history`} />
      <Metric icon={<Tent />} label="Civilizations" value={activeCount} note={`${historicalCount} historical records`} />
      <Metric icon={<Sparkles />} label="Living beliefs" value={summary?.activeBeliefs ?? 0} note={`${world.beliefs.length} movements recorded`} />
      <Metric icon={<Swords />} label="Open wars" value={summary?.wars ?? 0} note={`${summary?.alliances ?? 0} alliances`} />
      <Metric icon={<Wrench />} label="Technologies" value={summary?.technologiesUnlocked ?? 0} note="unique advances in use" />
    </section>

    <section className="archive-civilizations" id="civilizations">
      <div className="archive-section-intro">
        <div><span className="archive-kicker">Civilization index</span><h2>Powers, living and fallen</h2><p>Select a camp to open its complete dossier and ranked defining moments.</p></div>
        <span>{world.camps.length} records · {events.length} chronicle entries</span>
      </div>
      <div className="archive-civ-layout">
        <aside className="archive-index" aria-label="Search the complete archive">
          <div className="archive-discovery-toolbar">
            <label className="archive-search"><Search /><span className="sr-only">Search civilizations, agents, beliefs, founders, and major events</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search people, powers, beliefs, events…" /></label>
            <div className="archive-filter-selects">
              <label><span>Record type</span><select aria-label="Record type" value={entityFilter} onChange={(event) => setEntityFilter(event.target.value as EntityFilter)}>
                <option value="all">All records</option><option value="civilizations">Civilizations</option><option value="agents">Agents & founders</option><option value="beliefs">Beliefs</option><option value="events">Major events</option>
              </select></label>
              <label><span>Sort</span><select aria-label="Sort archive results" value={sortMode} onChange={(event) => setSortMode(event.target.value as ArchiveSort)}>
                <option value="relevance">Relevance</option><option value="power">Influence / power</option><option value="recent">Most recent</option>
              </select></label>
            </div>
          </div>
          <div className="archive-filters" role="group" aria-label="Filter by current status">
            {(["all", "active", "historical"] as CampFilter[]).map((filter) => <button key={filter} type="button" onClick={() => setCampFilter(filter)} aria-pressed={campFilter === filter}>{filter}</button>)}
          </div>
          <div className="archive-search-count" aria-live="polite">{searchResults.total} matching {searchResults.total === 1 ? "record" : "records"}{searchResults.total > searchResults.visible.length ? ` · showing first ${searchResults.visible.length}` : ""}</div>
          <div className="archive-entity-results" role="list" aria-label="Archive search results">
            {searchResults.visible.map((result) => {
              const selected = result.kind === "civilizations" && selectedCamp?.id === result.campId || result.kind === "beliefs" && selectedBelief?.id === result.beliefId;
              const mapParameters = new URLSearchParams();
              if (result.campId) mapParameters.set("camp", result.campId);
              if (result.agentId) mapParameters.set("agent", result.agentId);
              if (result.beliefId) mapParameters.set("belief", result.beliefId);
              mapParameters.set("overlay", result.kind === "beliefs" ? "beliefs" : result.kind === "events" && result.day ? mapOverlayForEvent(events.find((event) => `event:${event.id}` === result.id) ?? events[0]) : "territories");
              const openResult = () => {
                if (result.campId) openCamp(result.campId);
                if (result.beliefId && (result.kind === "beliefs" || !result.campId)) openBelief(result.beliefId);
              };
              return <article key={result.id} role="listitem" className={`archive-result-row ${selected ? "selected" : ""}`} data-kind={result.kind}>
                <button type="button" onClick={openResult} disabled={result.kind === "events" && !result.campId && !result.beliefId}><span><small>{result.kind === "agents" && result.subtitle.includes("founder") ? "founder" : result.kind.slice(0, -1)}</small><b>{result.title}</b><em>{result.subtitle}</em></span><ChevronRight /></button>
                <span className="archive-entity-actions">
                  {mapParameters.has("camp") || mapParameters.has("agent") || mapParameters.has("belief") ? <Link href={`/?${mapParameters.toString()}`}>Map</Link> : null}
                  {result.day ? <Link href={`/history?chapter=${chapterForDay(result.day)}&day=${Math.max(1, Math.floor(result.day))}${result.kind === "events" ? `&q=${encodeURIComponent(result.title)}` : ""}`}>History</Link> : null}
                </span>
              </article>;
            })}
            {searchResults.visible.length === 0 && <p className="archive-empty">No archive record matches these filters.</p>}
          </div>
        </aside>
        {selectedCamp ? <CampArchive world={world} camp={selectedCamp} events={Object.hasOwn(archiveHighlights.camps, selectedCamp.id) ? archiveHighlights.camps[selectedCamp.id] ?? [] : events} onOpenBelief={openBelief} onOpenCamp={openCamp} /> : <div className="archive-dossier archive-empty">No civilization record is available yet.</div>}
      </div>
    </section>

    <section className="archive-beliefs" id="beliefs">
      <div className="archive-section-intro">
        <div><span className="archive-kicker">Belief atlas</span><h2>Ideas that became traditions</h2><p>Beliefs emerge from lived conditions. Agents may adopt, reject, reform, or split them; no worldview is assigned in advance.</p></div>
        <span>{rankedBeliefs.filter((belief) => belief.active).length} active · {rankedBeliefs.filter((belief) => !belief.active).length} faded</span>
      </div>
      {rankedBeliefs.length > 0 ? <div className="archive-belief-layout">
        <label className="archive-belief-select"><span>Select a belief record</span><select value={selectedBelief?.id ?? ""} onChange={(event) => setSelectedBeliefId(event.target.value)} aria-controls="archive-belief-detail">{rankedBeliefs.map((belief) => <option key={belief.id} value={belief.id}>{belief.name} · {belief.active ? "Living" : "Faded"} · {belief.adherentIds.filter((id) => world.agents.some((agent) => agent.id === id && agent.alive)).length} adherents</option>)}</select><small>Use the archive search above to find a belief by founder, value, or event.</small></label>
        <div id="archive-belief-detail">{selectedBelief && <BeliefArchive world={world} belief={selectedBelief} events={Object.hasOwn(archiveHighlights.beliefs, selectedBelief.id) ? archiveHighlights.beliefs[selectedBelief.id] ?? [] : events} onOpenBelief={openBelief} onOpenCamp={openCamp} />}</div>
      </div> : <div className="archive-no-beliefs"><Sparkles /><h3>No shared belief has formed yet.</h3><p>The founders are free to remain secular. This archive will document any movement they choose to create.</p></div>}
    </section>

    <footer className="archive-footer"><span>Wildgrid records autonomous outcomes, not predetermined destinies.</span><div><Link href="/history"><ScrollText />Read the history<ChevronRight /></Link><Link href="/"><Activity />Watch the world live<ChevronRight /></Link></div></footer>
  </main>;
}
