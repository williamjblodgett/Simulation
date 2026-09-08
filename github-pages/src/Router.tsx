import { lazy, Suspense, useEffect, useMemo, useState, type CSSProperties } from "react";
import { PlanetExperience } from "../../app/planet-experience";
import {
  getPlanetHistoryChapter,
  validatePlanetCatalogs,
  type PlanetHistoryEvent,
  type PlanetHistoryEventType,
  type PlanetWorldState,
} from "../../app/simulation/planet";
import { useLocalPlanetRuntime, type LocalPlanetRuntime } from "./planet-runtime";

const LegacyEraTwoApp = lazy(() => import("./App").then(({ App }) => ({ default: App })));

type Route = "map" | "history" | "legacy" | "about";

const HISTORY_TYPE_LABELS: Partial<Record<PlanetHistoryEventType, string>> = {
  world_started: "Origin",
  agent_decision: "Decision",
  discovery: "Discovery",
  extraction: "Resource",
  production: "Production",
  birth: "Birth",
  construction: "Construction",
  trade: "Trade",
  alliance: "Alliance",
  war: "War",
  peace: "Peace",
  leadership_change: "Leadership",
  invention: "Invention",
  proposal: "Proposal",
  agreement: "Agreement",
  territory_claim: "Territory",
  territory_contested: "Conflict",
  migration: "Migration",
  settlement_founded: "Settlement",
  belief_founded: "Belief",
  belief_adopted: "Conversion",
  belief_reformed: "Reform",
  belief_schism: "Schism",
  death: "Death",
};

function routeFromHash(): Route {
  const route = location.hash.replace(/^#\/?/, "").split("?")[0];
  if (route === "history" || route === "about") return route;
  if (route === "legacy" || route === "archive") return "legacy";
  return "map";
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: value >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatDuration(seconds: number) {
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} sec`;
  if (seconds < 3_600) return `${Math.round(seconds / 60)} min`;
  return `${Math.round(seconds / 3_600)} hr`;
}

function LocalWorldBar({ runtime }: { runtime: LocalPlanetRuntime }) {
  const storageLabel = runtime.persistence === "indexeddb"
    ? "IndexedDB record"
    : runtime.persistence === "localstorage" ? "Local fallback record" : "Temporary record";
  const recordState = runtime.catchingUp
    ? `Reconstructing ${formatDuration(runtime.catchUpSeconds)} of elapsed time`
    : runtime.saved ? "Observation record current" : "Recording new events";

  return (
    <aside className="pages-local-bar" aria-label="On-device observation status">
      <span className="pages-local-dot" aria-hidden="true" />
      <div>
        <strong>{recordState}</strong>
        <small>Clock and camera are observer tools. No agent can be commanded.</small>
      </div>
      <span className="pages-observer-boundary">NO DIRECT CONTROL</span>
      <label className="pages-clock-control">
        <span>Clock rate</span>
        <select aria-label="Simulation speed" value={runtime.speed} onChange={(event) => runtime.setSpeed(Number(event.target.value))}>
          <option value={0}>Held</option>
          <option value={1}>1×</option>
          <option value={4}>4×</option>
          <option value={8}>8×</option>
          <option value={16}>16×</option>
        </select>
      </label>
      <nav aria-label="Observation resources">
        <a className="pages-history-link" href="#/history">Record</a>
        <a className="pages-about-link" href="#/about">Method</a>
      </nav>
      <em>{storageLabel}</em>
    </aside>
  );
}

function ReadingHeader({ route, runtime }: { route: Route; runtime: LocalPlanetRuntime }) {
  return (
    <>
      <header className="planet-reading-header">
        <a className="planet-wordmark" href="#/map"><span>W</span><div><strong>WILDGRID</strong><small>AUTONOMOUS WORLD STUDY</small></div></a>
        <nav aria-label="Observatory sections">
          <a className={route === "map" ? "active" : ""} href="#/map">World</a>
          <a className={route === "history" ? "active" : ""} href="#/history">Record</a>
          <a className={route === "about" ? "active" : ""} href="#/about">Method</a>
          <a className={route === "legacy" ? "active" : ""} href="#/legacy">Prior model</a>
        </nav>
        <div className="planet-reading-status"><span />Observing · Day {runtime.world?.day.toLocaleString() ?? "—"}</div>
      </header>
      <div className="planet-local-strip"><strong>OBSERVER BOUNDARY</strong><span>Navigation and clock rate only · agents remain uncommanded · this record exists only on this device</span></div>
    </>
  );
}

function eventTypeLabel(type: PlanetHistoryEventType) {
  return HISTORY_TYPE_LABELS[type] ?? type.replaceAll("_", " ");
}

function selectDistinctMoments(
  events: readonly PlanetHistoryEvent[],
  priorFingerprints: Set<string>,
  limit = 8,
) {
  const selected: PlanetHistoryEvent[] = [];
  const localFingerprints = new Set<string>();
  const typeCounts = new Map<PlanetHistoryEventType, number>();
  for (const allowPrior of [false, true]) {
    for (const event of events) {
      if (selected.some(({ id }) => id === event.id)) continue;
      if (localFingerprints.has(event.fingerprint)) continue;
      if (!allowPrior && priorFingerprints.has(event.fingerprint)) continue;
      if ((typeCounts.get(event.type) ?? 0) >= 1) continue;
      selected.push(event);
      localFingerprints.add(event.fingerprint);
      typeCounts.set(event.type, (typeCounts.get(event.type) ?? 0) + 1);
      if (selected.length >= limit) break;
    }
    if (selected.length >= limit) break;
  }
  for (const event of selected) priorFingerprints.add(event.fingerprint);
  return selected.sort((left, right) => left.day - right.day || left.id.localeCompare(right.id));
}

interface HistoryChapterView {
  number: number;
  startDay: number;
  endDay: number;
  complete: boolean;
  title: string;
  moments: PlanetHistoryEvent[];
  totals: { events: number; people: number; advances: number; politics: number };
}

function buildHistoryChapters(world: PlanetWorldState, firstChapter: number, lastChapter: number): HistoryChapterView[] {
  const priorFingerprints = new Set<string>();
  const chapters: HistoryChapterView[] = [];
  for (let number = firstChapter; number <= lastChapter; number += 1) {
    const chapter = getPlanetHistoryChapter(world, number);
    const moments = selectDistinctMoments(chapter.events, priorFingerprints);
    const defining = moments.slice().sort((left, right) => right.importance - left.importance || left.day - right.day)[0];
    const title = number === 1
      ? "The First Ten"
      : defining ? defining.title : "The Quiet Record";
    chapters.push({
      number,
      startDay: chapter.startDay,
      endDay: Math.min(chapter.endDay, world.day),
      complete: world.day >= chapter.endDay,
      title,
      moments,
      totals: {
        events: chapter.events.length,
        people: chapter.events.filter(({ type }) => type === "birth" || type === "death" || type === "migration").length,
        advances: chapter.events.filter(({ type }) => type === "invention" || type === "discovery" || type === "production").length,
        politics: chapter.events.filter(({ type }) => ["proposal", "agreement", "alliance", "war", "peace", "leadership_change", "territory_contested"].includes(type)).length,
      },
    });
  }
  return chapters.reverse();
}

function PlanetHistoryPage({ runtime }: { runtime: LocalPlanetRuntime }) {
  const world = runtime.world!;
  const chaptersPerPage = 8;
  const totalChapters = Math.max(1, Math.ceil(world.day / 200));
  const totalPages = Math.max(1, Math.ceil(totalChapters / chaptersPerPage));
  const [page, setPage] = useState(0);
  const safePage = Math.min(page, totalPages - 1);
  const lastChapter = Math.max(1, totalChapters - safePage * chaptersPerPage);
  const firstChapter = Math.max(1, lastChapter - chaptersPerPage + 1);
  const chapters = useMemo(() => buildHistoryChapters(world, firstChapter, lastChapter), [firstChapter, lastChapter, world]);
  const eventById = useMemo(() => new Map(world.history.map((event) => [event.id, event])), [world]);
  return (
    <div className="planet-reading-shell">
      <ReadingHeader route="history" runtime={runtime} />
      <main className="planet-reading-main history-reading-main">
        <section className="planet-hero">
          <p>CAUSAL ARCHIVE · 200-DAY OBSERVATION INTERVALS</p>
          <h1>A causal record of an autonomous world.</h1>
          <div><p>Routine state changes are omitted. Each interval preserves distinct demographic, material, institutional, and ideological changes, with recorded causes where the simulation has them.</p><span>{totalChapters} interval{totalChapters === 1 ? "" : "s"}<br />{formatNumber(world.history.length)} recorded events</span></div>
        </section>

        <nav className="chapter-pager" aria-label="History chapter pages">
          <button type="button" disabled={safePage >= totalPages - 1} onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))}>← Older chapters</button>
          <span>Showing chapters {firstChapter}–{lastChapter} of {totalChapters}</span>
          <button type="button" disabled={safePage === 0} onClick={() => setPage((current) => Math.max(0, current - 1))}>Newer chapters →</button>
        </nav>

        <div className="chapter-list">
          {chapters.map((chapter) => (
            <article className="planet-chapter" key={chapter.number}>
              <header>
                <div><p>CHAPTER {String(chapter.number).padStart(2, "0")} · DAYS {chapter.startDay}–{chapter.endDay}</p><h2>{chapter.title}</h2></div>
                <span data-complete={chapter.complete}>{chapter.complete ? "SEALED" : "IN PROGRESS"}</span>
              </header>
              <div className="chapter-metrics">
                <span><strong>{chapter.totals.events}</strong> recorded changes</span>
                <span><strong>{chapter.totals.advances}</strong> material advances</span>
                <span><strong>{chapter.totals.politics}</strong> institutional turns</span>
                <span><strong>{chapter.totals.people}</strong> demographic events</span>
              </div>
              <div className="chapter-timeline">
                {chapter.moments.length ? chapter.moments.map((event) => {
                  const causes = event.causalEventIds.map((id) => eventById.get(id)).filter((cause): cause is PlanetHistoryEvent => Boolean(cause));
                  return (
                    <section key={event.id}>
                      <time>DAY {event.day}</time>
                      <div><span>{eventTypeLabel(event.type)}</span><h3>{event.title}</h3><p>{event.summary}</p>
                        {causes.length ? <small>Followed from {causes.slice(0, 2).map(({ title }) => title).join(" · ")}</small> : null}
                      </div>
                    </section>
                  );
                }) : <p className="quiet-record">No distinct major change meets the archive threshold yet.</p>}
              </div>
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}

function AboutPage({ runtime }: { runtime: LocalPlanetRuntime }) {
  const world = runtime.world!;
  const catalog = validatePlanetCatalogs();
  const livingAgents = world.agents.filter(({ alive }) => alive).length;
  const cards = [
    ["OBSERVER BOUNDARY", "No interface action orders a person, society, or settlement. The observer can navigate the evidence and alter only the rate at which simulation time is evaluated."],
    ["LOCAL EVIDENCE", "Agents act on observations they personally made or learned through social contact. The observer does not grant them global knowledge."],
    ["GOAL FORMATION", "Each named person weighs survival needs, uncertainty, learned outcomes, commitments, and multi-step goals before selecting an action."],
    ["RECIPROCAL DECISIONS", "Families, trade, migration, leadership, alliances, peace, war, and belief reform use named proposals that other agents can accept or reject."],
    ["OPEN DEVELOPMENT", "There is no prescribed final technology. Agents combine known materials, processes, evidence, and existing capabilities into projects."],
    ["REPRODUCIBLE HISTORY", "A seed and the same sequence of elapsed simulation time produce the same outcomes, so a run can be inspected and tested."],
  ];
  async function reset() {
    if (!window.confirm("Erase this on-device observation record and initialize a new simulation run? This cannot be undone.")) return;
    await runtime.reset();
    location.hash = "#/map";
  }
  return (
    <div className="planet-reading-shell">
      <ReadingHeader route="about" runtime={runtime} />
      <main className="planet-reading-main">
        <section className="planet-hero">
          <p>SIMULATION METHODOLOGY · OBSERVATION WITHOUT INTERVENTION</p>
          <h1>What “autonomous” means in this model.</h1>
          <div><p>This edition runs a deterministic model on this device, not an external language model. An agent chooses within modeled constraints using its own local evidence, needs, memories, commitments, and feasible actions.</p><span>Current record · Day {world.day.toLocaleString()}<br />{formatNumber(livingAgents)} living agents · {formatNumber(world.settlements.length)} settlements<br />10,000-agent ceiling</span></div>
        </section>
        <section className="autonomy-grid">
          {cards.map(([title, copy], index) => <article key={title} style={{ "--card-index": index } as CSSProperties}><span>{String(index + 1).padStart(2, "0")}</span><h2>{title}</h2><p>{copy}</p></article>)}
        </section>
        <section className="catalog-section">
          <div><p>MODELED ENVIRONMENT</p><h2>The material substrate agents can investigate.</h2></div>
          <dl>
            <div><dt>{catalog.counts.resources}</dt><dd>natural resources, including crude oil, gas, uranium, water, food, fibers, metals, and renewables</dd></div>
            <div><dt>{catalog.counts.commodities}</dt><dd>usable commodities derived from raw materials</dd></div>
            <div><dt>{catalog.counts.recipes}</dt><dd>material transformation recipes</dd></div>
            <div><dt>{catalog.counts.capabilities}+</dt><dd>foundational capabilities before compositional inventions</dd></div>
          </dl>
        </section>
        <section className="local-explanation">
          <p>PUBLIC, DEVICE-LOCAL EDITION</p><h2>One browser, one reproducible observation record.</h2><p>The world state is stored in IndexedDB on this device and advances while the page is open. On return, the deterministic event engine reconstructs elapsed time from the last save. Clearing browser data removes the record; another visitor observes an independent run.</p><div className="counsel-boundary"><strong>External OpenAI counsel: unavailable</strong><span>Static hosting cannot protect a server-side API secret. No external model is called, and every recorded choice comes from the deterministic agent planner.</span></div><button type="button" onClick={() => void reset()}>Erase this record and initialize a new run</button>
        </section>
      </main>
    </div>
  );
}

function LoadingWorld({ error }: { error: string }) {
  return <main className="planet-boot"><span>W</span><p>AUTONOMOUS WORLD OBSERVATORY · ERA III</p><h1>{error ? "The observation record could not open." : "Restoring the local world record…"}</h1><small>{error || "Initializing agents, material conditions, and the event archive."}</small>{error ? <button type="button" onClick={() => location.reload()}>Try again</button> : null}</main>;
}

export function Router() {
  const [route, setRoute] = useState<Route>(routeFromHash);
  const runtime = useLocalPlanetRuntime();

  useEffect(() => {
    const onHashChange = () => setRoute(routeFromHash());
    window.addEventListener("hashchange", onHashChange);
    if (!location.hash) window.history.replaceState(null, "", `${location.pathname}${location.search}#/map`);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  if (!runtime.adapter || !runtime.world || runtime.error) return <LoadingWorld error={runtime.error} />;

  if (route === "legacy") {
    return <div className="legacy-route"><Suspense fallback={<LoadingWorld error="" />}><LegacyEraTwoApp /></Suspense><a className="return-era-three" href="#/map">Return to current observatory</a></div>;
  }
  if (route === "history") return <PlanetHistoryPage runtime={runtime} />;
  if (route === "about") return <AboutPage runtime={runtime} />;

  return (
    <div className="planet-pages-route">
      <LocalWorldBar runtime={runtime} />
      <div className="pages-experience">
        <PlanetExperience adapter={runtime.adapter} archiveHref="#/legacy" historyHref="#/history" />
      </div>
    </div>
  );
}
