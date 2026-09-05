"use client";

import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Baby,
  BookOpen,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Clock3,
  Crown,
  Feather,
  GitBranch,
  Landmark,
  Leaf,
  RefreshCw,
  Search,
  ScrollText,
  Sparkles,
  Swords,
  Tent,
  UserRound,
  Users,
  Wrench,
  X,
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

type SyncState = "loading" | "current" | "refreshing" | "offline";
type HistoryCategoryFilter = "all" | "defining" | "advancement" | "geopolitical" | "belief" | "identity" | "people";

interface HistoryEvent {
  id: string;
  time: number;
  day: number;
  type: string;
  tone: "neutral" | "positive" | "warning" | "critical";
  title: string;
  message: string;
  agentIds: string[];
  campIds: string[];
  beliefIds: string[];
}

interface HistoryIndexAgent {
  id: string;
  name: string;
  color: string;
  alive: boolean;
  generation: number;
  campId: string | null;
  influence: number;
  spiritualInfluence: number;
}

interface HistoryIndex {
  agents: HistoryIndexAgent[];
  camps: Array<{ id: string; name: string }>;
}

interface HistoryCategoryCounts {
  population: number;
  geopolitical: number;
  advancement: number;
  belief: number;
  identity: number;
  other: number;
}

interface HistoryHumanImpact {
  births: number;
  deaths: number;
  netPopulationChange: number;
  allegianceChanges: number;
  leadershipChanges: number;
  agentRenamings: number;
  agentMentions: number;
  campMentions: number;
  beliefMentions: number;
}

interface HistoryChapter {
  index: number;
  startDay: number;
  endDay: number;
  complete: boolean;
  title: string;
  summary: string;
  eventCount: number;
  typeCounts: Record<string, number>;
  categoryCounts: HistoryCategoryCounts;
  humanImpact: HistoryHumanImpact;
  topMoments: HistoryEvent[];
  advancementHighlights: HistoryEvent[];
  beliefHighlights: HistoryEvent[];
  geopoliticalHighlights: HistoryEvent[];
  identityHighlights: HistoryEvent[];
}

interface HistoryBookData {
  chapterLengthDays: number;
  throughDay: number;
  throughRevision: number;
  totalEvents: number;
  chapters: HistoryChapter[];
}

interface HistoryResponse {
  historyBook?: HistoryBookData;
  historyIndex?: HistoryIndex;
  error?: string;
}

const ZERO_CATEGORIES: HistoryCategoryCounts = {
  population: 0,
  geopolitical: 0,
  advancement: 0,
  belief: 0,
  identity: 0,
  other: 0,
};

const ZERO_IMPACT: HistoryHumanImpact = {
  births: 0,
  deaths: 0,
  netPopulationChange: 0,
  allegianceChanges: 0,
  leadershipChanges: 0,
  agentRenamings: 0,
  agentMentions: 0,
  campMentions: 0,
  beliefMentions: 0,
};

function count(chapter: HistoryChapter, ...types: string[]) {
  return types.reduce((total, type) => total + (chapter.typeCounts[type] ?? 0), 0);
}

function compact(value: number) {
  return Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function signed(value: number) {
  if (value === 0) return "No net change";
  return `${value > 0 ? "+" : ""}${value}`;
}

function roman(value: number) {
  if (!Number.isFinite(value) || value <= 0 || value >= 4_000) return String(value);
  const numerals: Array<[number, string]> = [
    [1_000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
    [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let remaining = Math.floor(value);
  let result = "";
  for (const [amount, numeral] of numerals) {
    while (remaining >= amount) {
      result += numeral;
      remaining -= amount;
    }
  }
  return result;
}

function eventLabel(type: string) {
  const labels: Record<string, string> = {
    agent_renamed: "self-naming",
    camp_renamed: "territory renamed",
    tech_unlocked: "advancement",
    belief_founded: "belief founded",
    belief_conversion_wave: "conversion wave",
    belief_schism: "belief schism",
    belief_reformed: "belief reformed",
    camp_founded: "territory founded",
    camp_destroyed: "territory fallen",
    camp_captured: "territory captured",
    leadership_change: "new leadership",
    power_lead_change: "balance of power",
  };
  return labels[type] ?? type.replaceAll("_", " ");
}

function eraChanges(chapter: HistoryChapter, previous: HistoryChapter) {
  const categoryWeight: Record<string, number> = {
    camp_founded: 5, camp_destroyed: 5, camp_captured: 5, defection: 5, join: 5,
    breakaway: 5, coup: 5, alliance: 5, truce: 5, war: 5, peace: 5,
    leadership_change: 5, power_lead_change: 5, tech_unlocked: 4.5,
    belief_founded: 4, belief_conversion_wave: 4, belief_schism: 4,
    belief_reformed: 4, belief_rejected: 4, belief_faded: 4, shrine_built: 4,
    agent_renamed: 2.5, camp_renamed: 2.5, birth: 1, death: 1,
  };
  const types = new Set([
    ...Object.keys(chapter.typeCounts),
    ...Object.keys(previous.typeCounts),
  ]);
  return [...types]
    .map((type) => {
      const current = chapter.typeCounts[type] ?? 0;
      const prior = previous.typeCounts[type] ?? 0;
      return { type, current, previous: prior, delta: current - prior };
    })
    .filter(({ delta }) => delta !== 0)
    .sort((left, right) => {
      const leftScore = (categoryWeight[left.type] ?? 1.5) * Math.abs(left.delta) / Math.max(1, left.current, left.previous);
      const rightScore = (categoryWeight[right.type] ?? 1.5) * Math.abs(right.delta) / Math.max(1, right.current, right.previous);
      return rightScore - leftScore
      || Math.abs(right.delta) - Math.abs(left.delta)
      || right.delta - left.delta
      || left.type.localeCompare(right.type);
    })
    .slice(0, 4);
}

function readHistoryParam(name: string, fallback = "") {
  if (typeof window === "undefined") return fallback;
  return new URLSearchParams(window.location.search).get(name) ?? fallback;
}

function historyEventMatches(event: HistoryEvent, query: string) {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return true;
  return `${event.title} ${event.message} ${eventLabel(event.type)} day ${event.day}`.toLocaleLowerCase().includes(normalized);
}

function mapOverlayForHistoryEvent(event: HistoryEvent) {
  if (/war|peace|truce|alliance/.test(event.type)) return event.type === "war" ? "wars" : "alliances";
  if (/belief|shrine/.test(event.type)) return "beliefs";
  if (/camp|breakaway|capture|destroy|rename/.test(event.type)) return "territories";
  return "world";
}

function EventIcon({ type }: { type: string }) {
  if (/war|peace|truce|alliance|capture|destroy|coup/.test(type)) return <Swords />;
  if (/tech|shrine|advance/.test(type)) return <Wrench />;
  if (/belief|schism|conversion|reform/.test(type)) return <Sparkles />;
  if (/birth|death/.test(type)) return <Users />;
  if (/rename|identity/.test(type)) return <Feather />;
  if (/camp|breakaway|found/.test(type)) return <Tent />;
  if (/leader|power/.test(type)) return <Crown />;
  return <Activity />;
}

function ChapterStat({ icon, label, value, note }: {
  icon: ReactNode;
  label: string;
  value: string | number;
  note: string;
}) {
  return <div className="history-stat">
    <span aria-hidden="true">{icon}</span>
    <div><small>{label}</small><strong>{value}</strong><em>{note}</em></div>
  </div>;
}

function RecordList({ events, empty, compact: condensed = false, historyIndex, focusDay }: {
  events: HistoryEvent[];
  empty: string;
  compact?: boolean;
  historyIndex: HistoryIndex;
  focusDay?: number | null;
}) {
  if (events.length === 0) return <p className="history-empty-record">{empty}</p>;
  return <ol className={`history-record-list ${condensed ? "compact" : ""}`}>
    {events.map((event, index) => {
      const camp = event.campIds.map((id) => historyIndex.camps.find((candidate) => candidate.id === id)).find(Boolean);
      const agent = event.agentIds.map((id) => historyIndex.agents.find((candidate) => candidate.id === id)).find(Boolean);
      const beliefId = event.beliefIds[0];
      const mapSearch = new URLSearchParams();
      if (camp) mapSearch.set("camp", camp.id);
      if (agent) mapSearch.set("agent", agent.id);
      if (beliefId) mapSearch.set("belief", beliefId);
      mapSearch.set("overlay", mapOverlayForHistoryEvent(event));
      return <li key={event.id} id={`history-event-${event.id}`} className={focusDay === Math.max(1, Math.floor(event.day)) ? "focus-day" : undefined} data-tone={event.tone}>
      <div className="history-record-mark" aria-hidden="true">
        <span>{String(index + 1).padStart(2, "0")}</span><EventIcon type={event.type} />
      </div>
      <article>
        <div><time>Day {Math.max(1, Math.floor(event.day))}</time><span>{eventLabel(event.type)}</span></div>
        <h4>{event.title}</h4>
        <p>{event.message}</p>
        <div className="history-entity-actions" aria-label="Linked records">
          {camp && <Link href={`/archive?camp=${encodeURIComponent(camp.id)}`}>{camp.name}</Link>}
          {agent && <Link href={`/?agent=${encodeURIComponent(agent.id)}${camp ? `&camp=${encodeURIComponent(camp.id)}` : ""}&overlay=${mapOverlayForHistoryEvent(event)}`}>{agent.name}</Link>}
          {beliefId && <Link href={`/archive?belief=${encodeURIComponent(beliefId)}#beliefs`}>Belief record</Link>}
          {(camp || agent || beliefId) && <Link href={`/?${mapSearch.toString()}`}>Show on map</Link>}
        </div>
      </article>
    </li>;
    })}
  </ol>;
}

function SectionHeading({ icon, eyebrow, title, count: total, id }: {
  icon: ReactNode;
  eyebrow: string;
  title: string;
  count?: number;
  id?: string;
}) {
  return <header className="history-section-heading">
    <span aria-hidden="true">{icon}</span>
    <div><small>{eyebrow}</small><h3 id={id}>{title}</h3></div>
    {typeof total === "number" && <b>{total} {total === 1 ? "record" : "records"}</b>}
  </header>;
}

function HistoryDetails({ icon, eyebrow, title, count: total, children, defaultOpen = true, className = "" }: {
  icon: ReactNode;
  eyebrow: string;
  title: string;
  count?: number;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(defaultOpen);
  const panelId = `history-section-${title.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return <section className={`${className} history-collapsible`}>
    <button type="button" className="history-collapsible-trigger" aria-expanded={expanded} aria-controls={panelId} onClick={() => setExpanded((current) => !current)}>
      <span className="history-collapsible-icon" aria-hidden="true">{icon}</span>
      <span><small>{eyebrow}</small><b>{title}</b></span>
      {typeof total === "number" && <em>{total} {total === 1 ? "record" : "records"}</em>}
      <ChevronRight aria-hidden="true" />
    </button>
    {expanded && <div id={panelId} className="history-collapsible-body">{children}</div>}
  </section>;
}

function emptyChapter(throughDay: number): HistoryChapter {
  return {
    index: 1,
    startDay: 1,
    endDay: Math.max(1, Math.floor(throughDay)),
    complete: false,
    title: "The Record Begins",
    summary: "The world is young. Its first consequential changes have not yet entered the permanent ledger.",
    eventCount: 0,
    typeCounts: {},
    categoryCounts: ZERO_CATEGORIES,
    humanImpact: ZERO_IMPACT,
    topMoments: [],
    advancementHighlights: [],
    beliefHighlights: [],
    geopoliticalHighlights: [],
    identityHighlights: [],
  };
}

function NotablePeople({ chapter, historyIndex, query }: { chapter: HistoryChapter; historyIndex: HistoryIndex; query: string }) {
  const people = useMemo(() => {
    const byId = new Map<string, number>();
    const byEventId = new Map<string, HistoryEvent>();
    for (const event of [
      ...chapter.topMoments,
      ...chapter.advancementHighlights,
      ...chapter.beliefHighlights,
      ...chapter.geopoliticalHighlights,
      ...chapter.identityHighlights,
    ]) byEventId.set(event.id, event);
    for (const event of byEventId.values()) {
      for (const id of new Set(event.agentIds)) byId.set(id, (byId.get(id) ?? 0) + 1);
    }
    const normalized = query.trim().toLocaleLowerCase();
    return [...byId.entries()]
      .map(([id, mentions]) => ({ agent: historyIndex.agents.find((agent) => agent.id === id), mentions }))
      .filter((entry): entry is { agent: HistoryIndexAgent; mentions: number } => Boolean(entry.agent))
      .filter(({ agent }) => {
        const camp = historyIndex.camps.find((candidate) => candidate.id === agent.campId);
        return !normalized || `${agent.name} ${camp?.name ?? "unaffiliated"}`.toLocaleLowerCase().includes(normalized);
      })
      .sort((left, right) => right.mentions - left.mentions
        || (right.agent.influence + right.agent.spiritualInfluence) - (left.agent.influence + left.agent.spiritualInfluence)
        || left.agent.id.localeCompare(right.agent.id))
      .slice(0, 6);
  }, [chapter, historyIndex.agents, historyIndex.camps, query]);

  return <div className="history-people-body">
    {people.length > 0 ? <div className="history-people-grid">
      {people.map(({ agent, mentions }) => {
        const camp = historyIndex.camps.find((candidate) => candidate.id === agent.campId);
        return <article key={agent.id} style={{ "--person-color": agent.color } as CSSProperties}>
          <i aria-hidden="true">{agent.name.slice(0, 1).toUpperCase()}</i>
          <div><h4><Link href={`/?agent=${encodeURIComponent(agent.id)}${camp ? `&camp=${encodeURIComponent(camp.id)}` : ""}`}>{agent.name}</Link></h4><p>{camp?.name ?? (agent.alive ? "Unaffiliated" : "Archived affiliation")} · generation {agent.generation}</p>{camp && <Link className="history-linked-chip" href={`/archive?camp=${encodeURIComponent(camp.id)}`}>Civilization record</Link>}</div>
          <span><b>{mentions}</b><small>key {mentions === 1 ? "record" : "records"}</small></span>
        </article>;
      })}
    </div> : <p className="history-empty-record">{query ? "No notable person matches this search." : "No retained agent appears by ID in this chapter's curated records."}</p>}
  </div>;
}

function ChapterArticle({ chapter, previous, historyIndex, query, category, focusDay }: {
  chapter: HistoryChapter;
  previous?: HistoryChapter;
  historyIndex: HistoryIndex;
  query: string;
  category: HistoryCategoryFilter;
  focusDay: number | null;
}) {
  const rises = count(chapter, "camp_founded", "breakaway");
  const falls = count(chapter, "camp_destroyed", "camp_captured");
  const wars = count(chapter, "war");
  const accords = count(chapter, "alliance", "truce", "peace");
  const advancements = count(chapter, "tech_unlocked");
  const faithChanges = count(
    chapter,
    "belief_founded",
    "belief_conversion_wave",
    "belief_schism",
    "belief_reformed",
    "belief_faded",
  );
  const territoryRenamings = count(chapter, "camp_renamed");
  const filterRecords = (records: HistoryEvent[]) => records.filter((event) => historyEventMatches(event, query));
  const definingRecords = filterRecords(chapter.topMoments);
  const advancementRecords = filterRecords(chapter.advancementHighlights);
  const geopoliticalRecords = filterRecords(chapter.geopoliticalHighlights);
  const beliefRecords = filterRecords(chapter.beliefHighlights);
  const identityRecords = filterRecords(chapter.identityHighlights);
  const show = (target: HistoryCategoryFilter) => category === "all" || category === target;
  const changes = previous ? eraChanges(chapter, previous) : [];
  const advancementEmpty = chapter.categoryCounts.advancement > 0 && chapter.advancementHighlights.length === 0
    ? "The era's advancement record is already represented among its defining moments."
    : "No advancement was completed during these days.";
  const geopoliticalEmpty = chapter.categoryCounts.geopolitical > 0 && chapter.geopoliticalHighlights.length === 0
    ? "The era's geopolitical record is already represented among its defining moments."
    : "No territorial or diplomatic upheaval was recorded.";
  const beliefEmpty = chapter.categoryCounts.belief > 0 && chapter.beliefHighlights.length === 0
    ? "The era's belief record is already represented among its defining moments."
    : "No major religious or belief-system change was recorded.";
  const identityEmpty = chapter.categoryCounts.identity > 0 && chapter.identityHighlights.length === 0
    ? "The era's naming record is already represented among its defining moments."
    : "No agent or territory chose a new name during these days.";

  return <article className="history-chapter" aria-labelledby="history-chapter-title">
    <header className="history-chapter-cover">
      <div className="history-folio"><span>CHAPTER</span><b>{roman(chapter.index)}</b></div>
      <div>
        <span className="history-volume-line">Volume {roman(chapter.index)} · Days {chapter.startDay}—{chapter.endDay}</span>
        <h1 id="history-chapter-title">{chapter.title}</h1>
        <p>{chapter.summary}</p>
      </div>
      <span className={`history-chapter-status ${chapter.complete ? "complete" : "writing"}`}>
        <i />{chapter.complete ? "Chapter complete" : "Still being written"}
      </span>
    </header>

    <div className="history-chapter-rule"><span>THE MEASURE OF THE ERA</span></div>

    <section className="history-stats" aria-label="Chapter overview">
      <ChapterStat icon={<ScrollText />} label="Major records" value={chapter.eventCount} note={`${compact(chapter.categoryCounts.other)} uncategorized`} />
      <ChapterStat icon={<Baby />} label="Generations" value={signed(chapter.humanImpact.netPopulationChange)} note={`${chapter.humanImpact.births} born · ${chapter.humanImpact.deaths} died`} />
      <ChapterStat icon={<Tent />} label="Territory" value={rises} note={`${falls} captured or fallen`} />
      <ChapterStat icon={<Wrench />} label="Advancement" value={advancements} note={`${chapter.categoryCounts.advancement} development records`} />
      <ChapterStat icon={<Swords />} label="Diplomacy" value={wars} note={`${accords} accords`} />
      <ChapterStat icon={<Sparkles />} label="Belief change" value={faithChanges} note={`${chapter.categoryCounts.belief} belief records`} />
    </section>

    {previous && <section className="history-ledger-notes" aria-labelledby="history-comparison-title">
      <SectionHeading id="history-comparison-title" icon={<GitBranch />} eyebrow={`Against Chapter ${roman(previous.index)}`} title="How this era changed" />
      {changes.length > 0 ? <dl>
        {changes.map((change) => <div key={change.type}>
          <dt>{eventLabel(change.type)}</dt>
          <dd title={`${change.current} records in this chapter; ${change.previous} in Chapter ${previous.index}`}>{change.delta > 0 ? "+" : "−"}{Math.abs(change.delta)}</dd>
        </div>)}
      </dl> : <p>No event-type total differs from the preceding chapter.</p>}
      <p>{chapter.complete ? "Each figure is" : "Because this chapter is still being written, each figure is currently"} the number of records above or below Days {previous.startDay}–{previous.endDay}. Exact totals remain in the ledger below.</p>
    </section>}

    {show("defining") && <HistoryDetails className="history-defining" icon={<Crown />} eyebrow="Ranked by consequence and distinctiveness" title="Defining moments" count={definingRecords.length}>
      <RecordList events={definingRecords} historyIndex={historyIndex} focusDay={focusDay} empty={query ? "No defining moment matches this search." : "No major moment has been written into this chapter yet."} />
    </HistoryDetails>}

    {(show("advancement") || show("geopolitical")) && <div className="history-columns">
      {show("advancement") && <HistoryDetails className="history-column" icon={<Wrench />} eyebrow="Knowledge & works" title="Advancements" count={advancementRecords.length}>
        <RecordList compact events={advancementRecords} historyIndex={historyIndex} focusDay={focusDay} empty={query ? "No advancement matches this search." : advancementEmpty} />
      </HistoryDetails>}
      {show("geopolitical") && <HistoryDetails className="history-column" icon={<Landmark />} eyebrow="Territory & diplomacy" title="Powers in motion" count={geopoliticalRecords.length}>
        <div className="history-ledger" aria-label="Geopolitical totals">
          <span><small>New powers</small><b>{rises}</b></span>
          <span><small>Captured / fallen</small><b>{falls}</b></span>
          <span><small>Wars declared</small><b>{wars}</b></span>
          <span><small>Accords made</small><b>{accords}</b></span>
        </div>
        <RecordList compact events={geopoliticalRecords} historyIndex={historyIndex} focusDay={focusDay} empty={query ? "No geopolitical record matches this search." : geopoliticalEmpty} />
      </HistoryDetails>}
    </div>}

    {(show("belief") || show("identity")) && <div className="history-columns history-secondary-columns">
      {show("belief") && <HistoryDetails className="history-column" icon={<Sparkles />} eyebrow="Ideas & conviction" title="Belief and public life" count={beliefRecords.length}>
        <RecordList compact events={beliefRecords} historyIndex={historyIndex} focusDay={focusDay} empty={query ? "No belief record matches this search." : beliefEmpty} />
      </HistoryDetails>}
      {show("identity") && <HistoryDetails className="history-column history-identity" icon={<Feather />} eyebrow="Chosen identities" title="The changing names" count={identityRecords.length}>
        <div className="history-name-totals">
          <span><b>{chapter.humanImpact.agentRenamings}</b> agent self-{chapter.humanImpact.agentRenamings === 1 ? "naming" : "namings"}</span>
          <span><b>{territoryRenamings}</b> territory {territoryRenamings === 1 ? "renamed" : "renamings"}</span>
        </div>
        <RecordList compact events={identityRecords} historyIndex={historyIndex} focusDay={focusDay} empty={query ? "No identity record matches this search." : identityEmpty} />
      </HistoryDetails>}
    </div>}

    {show("people") && <HistoryDetails className="history-people" icon={<UserRound />} eyebrow="Named in the evidence" title="People of the chapter" count={chapter.humanImpact.agentMentions}>
      <NotablePeople chapter={chapter} historyIndex={historyIndex} query={query} />
    </HistoryDetails>}

    <section className="history-ledger-notes" aria-labelledby="history-ledger-title">
      <SectionHeading id="history-ledger-title" icon={<GitBranch />} eyebrow="Exact ledger totals" title="What changed" />
      <dl>
        <div><dt>Allegiance changes</dt><dd>{chapter.humanImpact.allegianceChanges}</dd></div>
        <div><dt>Leadership changes</dt><dd>{chapter.humanImpact.leadershipChanges}</dd></div>
        <div><dt>People mentioned</dt><dd>{chapter.humanImpact.agentMentions}</dd></div>
        <div><dt>Powers mentioned</dt><dd>{chapter.humanImpact.campMentions}</dd></div>
        <div><dt>Beliefs mentioned</dt><dd>{chapter.humanImpact.beliefMentions}</dd></div>
        <div><dt>Population records</dt><dd>{chapter.categoryCounts.population}</dd></div>
      </dl>
      <p>Counts cover every permanent ledger entry in this 200-day chapter. The passages above are a ranked, bounded selection of those records.</p>
    </section>

    <footer className="history-chapter-footer">
      <span>Wildgrid historical ledger</span><b>{chapter.startDay} — {chapter.endDay}</b><span>Folio {String(chapter.index).padStart(2, "0")}</span>
    </footer>
  </article>;
}

function HistoryLoading() {
  return <main className="history-page history-loading" aria-busy="true" aria-label="Loading the living history">
    <div><BookOpen /><span>Opening the annals</span><i /></div>
  </main>;
}

export function HistoryBook() {
  const [book, setBook] = useState<HistoryBookData | null>(null);
  const [historyIndex, setHistoryIndex] = useState<HistoryIndex | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [historyQuery, setHistoryQuery] = useState(() => readHistoryParam("q"));
  const [category, setCategory] = useState<HistoryCategoryFilter>(() => {
    const value = readHistoryParam("category");
    return value === "defining" || value === "advancement" || value === "geopolitical" || value === "belief" || value === "identity" || value === "people" ? value : "all";
  });
  const [focusDay, setFocusDay] = useState<number | null>(() => {
    const value = Number(readHistoryParam("day"));
    return Number.isFinite(value) && value >= 1 ? Math.floor(value) : null;
  });
  const [syncState, setSyncState] = useState<SyncState>("loading");
  const [error, setError] = useState<string | null>(null);
  const chapterRef = useRef<HTMLDivElement>(null);
  const initialDeepLinkHandled = useRef(false);

  const loadHistory = useCallback(async (silent = false) => {
    try {
      if (!silent) setSyncState((current) => current === "loading" ? "loading" : "refreshing");
      const response = await fetch("/api/world?view=history", { cache: "no-store" });
      const payload = await response.json() as HistoryResponse;
      if (!response.ok || !payload.historyBook || !payload.historyIndex) {
        throw new Error(payload.error ?? "The historical ledger could not be verified.");
      }
      const chapters = payload.historyBook.chapters.slice().sort((left, right) => left.index - right.index);
      const nextBook = { ...payload.historyBook, chapters };
      setBook(nextBook);
      setHistoryIndex(payload.historyIndex);
      setFocusDay((current) => current === null ? null : Math.max(1, Math.min(Math.floor(nextBook.throughDay), current)));
      setSelectedIndex((current) => {
        if (current !== null && chapters.some((chapter) => chapter.index === current)) return current;
        const requested = Number(new URLSearchParams(window.location.search).get("chapter"));
        if (chapters.some((chapter) => chapter.index === requested)) return requested;
        const requestedDay = Number(new URLSearchParams(window.location.search).get("day"));
        const dayChapter = Number.isFinite(requestedDay) ? chapters.find((chapter) => requestedDay >= chapter.startDay && requestedDay <= chapter.endDay) : undefined;
        return dayChapter?.index ?? chapters.at(-1)?.index ?? 1;
      });
      setError(null);
      setSyncState("current");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The living history is temporarily unavailable.");
      setSyncState("offline");
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void loadHistory(), 0);
    const interval = window.setInterval(() => void loadHistory(true), 30_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [loadHistory]);

  useEffect(() => {
    if (!book || selectedIndex === null) return;
    const url = new URL(window.location.href);
    url.searchParams.set("chapter", String(selectedIndex));
    if (focusDay) url.searchParams.set("day", String(focusDay));
    else url.searchParams.delete("day");
    if (historyQuery.trim()) url.searchParams.set("q", historyQuery.trim());
    else url.searchParams.delete("q");
    if (category !== "all") url.searchParams.set("category", category);
    else url.searchParams.delete("category");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, [book, category, focusDay, historyQuery, selectedIndex]);

  const chapters = useMemo(() => {
    if (!book) return [];
    return book.chapters.length > 0 ? book.chapters : [emptyChapter(book.throughDay)];
  }, [book]);
  const selectedPosition = Math.max(0, chapters.findIndex((chapter) => chapter.index === selectedIndex));
  const chapter = chapters[selectedPosition] ?? chapters.at(-1);
  const matchingRecordCount = useMemo(() => {
    if (!chapter) return 0;
    const unique = new Map<string, HistoryEvent>();
    const groups: Array<[HistoryCategoryFilter, HistoryEvent[]]> = [
      ["defining", chapter.topMoments],
      ["advancement", chapter.advancementHighlights],
      ["geopolitical", chapter.geopoliticalHighlights],
      ["belief", chapter.beliefHighlights],
      ["identity", chapter.identityHighlights],
    ];
    if (category === "people") {
      const mentionedAgentIds = new Set(groups.flatMap(([, records]) => records).flatMap((event) => event.agentIds));
      const normalized = historyQuery.trim().toLocaleLowerCase();
      return historyIndex?.agents.filter((agent) => {
        if (!mentionedAgentIds.has(agent.id)) return false;
        const camp = historyIndex.camps.find((candidate) => candidate.id === agent.campId);
        return !normalized || `${agent.name} ${camp?.name ?? "unaffiliated"}`.toLocaleLowerCase().includes(normalized);
      }).length ?? 0;
    }
    for (const [group, records] of groups) {
      if (category !== "all" && category !== group) continue;
      for (const event of records) if (historyEventMatches(event, historyQuery)) unique.set(event.id, event);
    }
    return unique.size;
  }, [category, chapter, historyIndex, historyQuery]);

  const chooseChapter = useCallback((index: number, focus = true) => {
    setSelectedIndex(index);
    setFocusDay(null);
    if (focus) {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.requestAnimationFrame(() => chapterRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" }));
    }
  }, []);

  const jumpToDay = useCallback((rawDay: string) => {
    const day = Math.max(1, Math.floor(Number(rawDay)));
    if (!Number.isFinite(day) || chapters.length === 0) return;
    const matchingChapter = chapters.find((candidate) => day >= candidate.startDay && day <= candidate.endDay)
      ?? (day < chapters[0].startDay ? chapters[0] : chapters.at(-1));
    if (!matchingChapter) return;
    setFocusDay(Math.min(matchingChapter.endDay, Math.max(matchingChapter.startDay, day)));
    setSelectedIndex(matchingChapter.index);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.requestAnimationFrame(() => chapterRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" }));
  }, [chapters]);

  useEffect(() => {
    if (!chapter || initialDeepLinkHandled.current) return;
    if (!readHistoryParam("chapter") && !readHistoryParam("day") && !readHistoryParam("q") && !readHistoryParam("category")) return;
    initialDeepLinkHandled.current = true;
    window.requestAnimationFrame(() => chapterRef.current?.scrollIntoView({ block: "start" }));
  }, [chapter]);

  if ((!book || !historyIndex) && syncState === "loading") return <HistoryLoading />;

  if (!book || !historyIndex || !chapter) return <main className="history-page history-error">
    <div>
      <span className="history-error-mark"><BookOpen /></span>
      <small>The archive doors are closed</small>
      <h1>The ledger could not be opened.</h1>
      <p>{error ?? "The persistent world remains intact. Try opening its history again."}</p>
      <button onClick={() => void loadHistory()}><RefreshCw />Try again</button>
      <Link href="/"><ArrowLeft />Return to the live map</Link>
    </div>
  </main>;

  const previous = chapters[selectedPosition - 1];
  const next = chapters[selectedPosition + 1];

  return <main className="history-page">
    <header className="history-topbar">
      <Link href="/" className="history-brand" aria-label="Wildgrid Sovereignty live map">
        <span><Leaf /></span><div><b>WILDGRID <em>SOVEREIGNTY</em></b><small>The living history</small></div>
      </Link>
      <nav className="site-section-nav" aria-label="Site pages">
        <Link href="/"><Activity /><span>Map</span></Link>
        <Link href="/archive"><Landmark /><span>Civilizations</span></Link>
        <span className="site-section-link" aria-current="page"><BookOpen /><span>History</span></span>
      </nav>
      <div className="history-live" title={`Persistent world revision ${book.throughRevision}`}><i className={syncState === "offline" ? "offline" : ""} /><span>{syncState === "refreshing" ? "UPDATING" : syncState === "offline" ? "LAST KNOWN" : `LIVE · R${book.throughRevision}`}</span></div>
    </header>

    <section className="history-hero" aria-labelledby="history-title">
      <div>
        <span className="history-kicker"><ScrollText /> A chronicle written by the world</span>
        <h1 id="history-title">The annals of Wildgrid</h1>
        <p>Every 200 days becomes a chapter: an evidence-based account of the powers that rose, the names that changed, the knowledge gained, the beliefs formed, and the lives caught between them.</p>
      </div>
      <dl>
        <div><dt>Recorded through</dt><dd>Day {book.throughDay}</dd></div>
        <div><dt>Chapters</dt><dd>{chapters.length}</dd></div>
        <div><dt>Permanent events</dt><dd>{compact(book.totalEvents)}</dd></div>
      </dl>
    </section>

    {error && <div className="history-sync-warning" role="status"><CircleDot />Showing the last verified edition while the ledger reconnects.<button onClick={() => void loadHistory()}>Retry now</button></div>}

    <section className="history-discovery-toolbar" aria-labelledby="history-discovery-title">
      <header><div><span className="history-kicker">Find a passage</span><h2 id="history-discovery-title">Search the annals</h2></div><p>{matchingRecordCount} matching curated {matchingRecordCount === 1 ? "record" : "records"} in this chapter</p></header>
      <div className="history-filter-grid">
        <label className="history-search"><Search /><span className="sr-only">Search this history chapter</span><input value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} placeholder="Search names, events, discoveries…" /></label>
        <label><span>Category</span><select value={category} onChange={(event) => setCategory(event.target.value as HistoryCategoryFilter)}>
          <option value="all">All passages</option><option value="defining">Defining moments</option><option value="advancement">Advancements</option><option value="geopolitical">Territory & diplomacy</option><option value="belief">Belief & public life</option><option value="identity">Names & identity</option><option value="people">People</option>
        </select></label>
        <label><span>Jump to day</span><span className="history-day-input"><CalendarDays /><input type="number" min={1} max={book.throughDay} inputMode="numeric" value={focusDay ?? ""} onChange={(event) => event.target.value ? jumpToDay(event.target.value) : setFocusDay(null)} placeholder={`1–${book.throughDay}`} /></span></label>
        {(historyQuery || category !== "all" || focusDay) && <button type="button" className="history-clear-filters" onClick={() => { setHistoryQuery(""); setCategory("all"); setFocusDay(null); }}><X />Clear filters</button>}
      </div>
      {focusDay && <p className="history-day-context"><CircleDot />Reading the chapter containing day {focusDay}. Matching day markers are highlighted where that day appears in the curated passages.</p>}
    </section>

    <section className="history-shelf history-era-nav" aria-labelledby="history-shelf-title">
      <header><div><span className="history-kicker">Table of contents</span><h2 id="history-shelf-title">Choose a chapter</h2></div><p>Each volume covers one 200-day era. The final volume continues to change with the world.</p></header>
      <nav aria-label="History chapters">
        {chapters.map((item) => <button
          key={item.index}
          type="button"
          aria-current={item.index === chapter.index ? "page" : undefined}
          onClick={() => chooseChapter(item.index)}
        >
          <span>{roman(item.index)}</span>
          <div><small>Days {item.startDay}—{item.endDay}</small><b>{item.title}</b><em>{item.eventCount} records · {item.complete ? "complete" : "in progress"}</em></div>
          <ChevronRight />
        </button>)}
      </nav>
    </section>

    <div className="history-reader" ref={chapterRef}>
      <nav className="history-pager" aria-label="Chapter navigation">
        <button type="button" disabled={!previous} onClick={() => previous && chooseChapter(previous.index)} aria-label={previous ? `Read chapter ${previous.index}, ${previous.title}` : "No previous chapter"}>
          <ChevronLeft /><span><small>Previous chapter</small><b>{previous?.title ?? "Beginning of the record"}</b></span>
        </button>
        <span><BookOpen /><b>{chapter.index} / {chapters.length}</b></span>
        <button type="button" disabled={!next} onClick={() => next && chooseChapter(next.index)} aria-label={next ? `Read chapter ${next.index}, ${next.title}` : "No next chapter yet"}>
          <span><small>Next chapter</small><b>{next?.title ?? "Still being written"}</b></span><ChevronRight />
        </button>
      </nav>

      <p className="sr-only" role="status" aria-live="polite">Reading chapter {chapter.index}: {chapter.title}, days {chapter.startDay} through {chapter.endDay}.</p>
      <ChapterArticle chapter={chapter} previous={previous} historyIndex={historyIndex} query={historyQuery} category={category} focusDay={focusDay} />

      <nav className="history-end-pager" aria-label="Continue reading">
        {previous ? <button type="button" onClick={() => chooseChapter(previous.index)}><ArrowLeft /><span><small>Previous</small><b>{previous.title}</b></span></button> : <span />}
        {next ? <button type="button" onClick={() => chooseChapter(next.index)}><span><small>Continue reading</small><b>{next.title}</b></span><ArrowRight /></button> : <div><Clock3 /><span><small>The next chapter opens on day {chapter.index * book.chapterLengthDays + 1}</small><b>The world is still writing it.</b></span></div>}
      </nav>
    </div>

    <footer className="history-site-footer">
      <span><Feather />Written only from autonomous events preserved in the world ledger.</span>
      <div><Link href="/archive"><Landmark />Study the civilizations</Link><Link href="/"><Activity />Watch the world live</Link></div>
    </footer>
  </main>;
}
