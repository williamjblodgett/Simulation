"use client";

import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Baby,
  BookOpen,
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
  ScrollText,
  Sparkles,
  Swords,
  Tent,
  UserRound,
  Users,
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

type SyncState = "loading" | "current" | "refreshing" | "offline";

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

function RecordList({ events, empty, compact: condensed = false }: {
  events: HistoryEvent[];
  empty: string;
  compact?: boolean;
}) {
  if (events.length === 0) return <p className="history-empty-record">{empty}</p>;
  return <ol className={`history-record-list ${condensed ? "compact" : ""}`}>
    {events.map((event, index) => <li key={event.id} data-tone={event.tone}>
      <div className="history-record-mark" aria-hidden="true">
        <span>{String(index + 1).padStart(2, "0")}</span><EventIcon type={event.type} />
      </div>
      <article>
        <div><time>Day {Math.max(1, Math.floor(event.day))}</time><span>{eventLabel(event.type)}</span></div>
        <h4>{event.title}</h4>
        <p>{event.message}</p>
      </article>
    </li>)}
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

function NotablePeople({ chapter, historyIndex }: { chapter: HistoryChapter; historyIndex: HistoryIndex }) {
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
    return [...byId.entries()]
      .map(([id, mentions]) => ({ agent: historyIndex.agents.find((agent) => agent.id === id), mentions }))
      .filter((entry): entry is { agent: HistoryIndexAgent; mentions: number } => Boolean(entry.agent))
      .sort((left, right) => right.mentions - left.mentions
        || (right.agent.influence + right.agent.spiritualInfluence) - (left.agent.influence + left.agent.spiritualInfluence)
        || left.agent.id.localeCompare(right.agent.id))
      .slice(0, 6);
  }, [chapter, historyIndex.agents]);

  return <section className="history-people" aria-labelledby="history-people-title">
    <SectionHeading id="history-people-title" icon={<UserRound />} eyebrow="Named in the evidence" title="People of the chapter" count={chapter.humanImpact.agentMentions} />
    {people.length > 0 ? <div className="history-people-grid">
      {people.map(({ agent, mentions }) => {
        const camp = historyIndex.camps.find((candidate) => candidate.id === agent.campId);
        return <article key={agent.id} style={{ "--person-color": agent.color } as CSSProperties}>
          <i aria-hidden="true">{agent.name.slice(0, 1).toUpperCase()}</i>
          <div><h4>{agent.name}</h4><p>{camp?.name ?? (agent.alive ? "Unaffiliated" : "Archived affiliation")} · generation {agent.generation}</p></div>
          <span><b>{mentions}</b><small>key {mentions === 1 ? "record" : "records"}</small></span>
        </article>;
      })}
    </div> : <p className="history-empty-record">No retained agent appears by ID in this chapter&apos;s curated records.</p>}
  </section>;
}

function ChapterArticle({ chapter, historyIndex }: { chapter: HistoryChapter; historyIndex: HistoryIndex }) {
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

    <section className="history-defining" aria-labelledby="history-defining-title">
      <SectionHeading id="history-defining-title" icon={<Crown />} eyebrow="Ranked by consequence" title="The defining record" count={chapter.topMoments.length} />
      <RecordList events={chapter.topMoments} empty="No major moment has been written into this chapter yet." />
    </section>

    <div className="history-columns">
      <section className="history-column" aria-labelledby="history-advancement-title">
        <SectionHeading id="history-advancement-title" icon={<Wrench />} eyebrow="Knowledge & works" title="Advancements" count={chapter.categoryCounts.advancement} />
        <RecordList compact events={chapter.advancementHighlights} empty="No advancement was completed during these days." />
      </section>
      <section className="history-column" aria-labelledby="history-geopolitical-title">
        <SectionHeading id="history-geopolitical-title" icon={<Landmark />} eyebrow="Territory & diplomacy" title="Powers in motion" count={chapter.categoryCounts.geopolitical} />
        <div className="history-ledger" aria-label="Geopolitical totals">
          <span><small>New powers</small><b>{rises}</b></span>
          <span><small>Captured / fallen</small><b>{falls}</b></span>
          <span><small>Wars declared</small><b>{wars}</b></span>
          <span><small>Accords made</small><b>{accords}</b></span>
        </div>
        <RecordList compact events={chapter.geopoliticalHighlights} empty="No territorial or diplomatic upheaval was recorded." />
      </section>
    </div>

    <div className="history-columns history-secondary-columns">
      <section className="history-column" aria-labelledby="history-belief-title">
        <SectionHeading id="history-belief-title" icon={<Sparkles />} eyebrow="Ideas & conviction" title="Belief and public life" count={chapter.categoryCounts.belief} />
        <RecordList compact events={chapter.beliefHighlights} empty="No major religious or belief-system change was recorded." />
      </section>
      <section className="history-column history-identity" aria-labelledby="history-identity-title">
        <SectionHeading id="history-identity-title" icon={<Feather />} eyebrow="Chosen identities" title="The changing names" count={chapter.categoryCounts.identity} />
        <div className="history-name-totals">
          <span><b>{chapter.humanImpact.agentRenamings}</b> agent self-{chapter.humanImpact.agentRenamings === 1 ? "naming" : "namings"}</span>
          <span><b>{territoryRenamings}</b> territory {territoryRenamings === 1 ? "renamed" : "renamings"}</span>
        </div>
        <RecordList compact events={chapter.identityHighlights} empty="No agent or territory chose a new name during these days." />
      </section>
    </div>

    <NotablePeople chapter={chapter} historyIndex={historyIndex} />

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
  const [syncState, setSyncState] = useState<SyncState>("loading");
  const [error, setError] = useState<string | null>(null);
  const chapterRef = useRef<HTMLDivElement>(null);

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
      setSelectedIndex((current) => {
        if (current !== null && chapters.some((chapter) => chapter.index === current)) return current;
        const requested = Number(new URLSearchParams(window.location.search).get("chapter"));
        return chapters.some((chapter) => chapter.index === requested)
          ? requested
          : chapters.at(-1)?.index ?? 1;
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

  const chapters = useMemo(() => {
    if (!book) return [];
    return book.chapters.length > 0 ? book.chapters : [emptyChapter(book.throughDay)];
  }, [book]);
  const selectedPosition = Math.max(0, chapters.findIndex((chapter) => chapter.index === selectedIndex));
  const chapter = chapters[selectedPosition] ?? chapters.at(-1);

  const chooseChapter = useCallback((index: number, focus = true) => {
    setSelectedIndex(index);
    const url = new URL(window.location.href);
    url.searchParams.set("chapter", String(index));
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    if (focus) {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.requestAnimationFrame(() => chapterRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" }));
    }
  }, []);

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
      <nav aria-label="Site pages">
        <Link href="/"><Activity />Live map</Link>
        <Link href="/archive"><Landmark />World archive</Link>
        <span aria-current="page"><BookOpen />History</span>
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

    <section className="history-shelf" aria-labelledby="history-shelf-title">
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
      <ChapterArticle chapter={chapter} historyIndex={historyIndex} />

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
