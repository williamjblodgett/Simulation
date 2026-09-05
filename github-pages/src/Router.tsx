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
    ? "Saved in this browser"
    : runtime.persistence === "localstorage" ? "Browser fallback save" : "Temporary session";

  async function reset() {
    if (!window.confirm("Start a new Era III planet? This permanently removes this browser's current Era III world and history.")) return;
    await runtime.reset();
    location.hash = "#/map";
  }

  return (
    <aside className="pages-local-bar" aria-label="Local world status">
      <span className="pages-local-dot" aria-hidden="true" />
      <div>
        <strong>{runtime.catchingUp ? `Catching up ${formatDuration(runtime.catchUpSeconds)}` : storageLabel}</strong>
        <small>Device-local edition · this planet is not shared with other visitors</small>
      </div>
      <label>
        <span>Speed</span>
        <select aria-label="Simulation speed" value={runtime.speed} onChange={(event) => runtime.setSpeed(Number(event.target.value))}>
          <option value={0}>Paused</option>
          <option value={1}>1×</option>
          <option value={4}>4×</option>
          <option value={8}>8×</option>
          <option value={16}>16×</option>
        </select>
      </label>
      <a className="pages-history-link" href="#/history">History</a>
      <a className="pages-about-link" href="#/about">How it works</a>
      <button type="button" onClick={() => void reset()}>New planet</button>
      <em>{runtime.saved ? "SAVED" : "AUTO-SAVE"}</em>
    </aside>
  );
}

function ReadingHeader({ route, runtime }: { route: Route; runtime: LocalPlanetRuntime }) {
  return (
    <>
      <header className="planet-reading-header">
        <a className="planet-wordmark" href="#/map"><span>W</span><div><strong>WILDGRID</strong><small>PLANETARY OBSERVATORY</small></div></a>
        <nav aria-label="Era III sections">
          <a className={route === "map" ? "active" : ""} href="#/map">Map</a>
          <a className={route === "history" ? "active" : ""} href="#/history">History</a>
          <a className={route === "about" ? "active" : ""} href="#/about">About</a>
          <a className={route === "legacy" ? "active" : ""} href="#/legacy">Era II</a>
        </nav>
        <div className="planet-reading-status"><span />Day {runtime.world?.day.toLocaleString() ?? "—"}</div>
      </header>
      <div className="planet-local-strip"><strong>LOCAL WORLD</strong><span>Saved only on this device. This GitHub Pages planet is not the shared hosted world.</span></div>
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
          <p>THE LIVING RECORD · ONE CHAPTER EVERY 200 DAYS</p>
          <h1>A history written by consequence.</h1>
          <div><p>Repeated routine is omitted. Each chapter favors distinct turning points, then connects them to the decisions and discoveries that caused them.</p><span>{totalChapters} chapter{totalChapters === 1 ? "" : "s"}<br />{formatNumber(world.history.length)} recorded events</span></div>
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
                <span><strong>{chapter.totals.events}</strong> major records</span>
                <span><strong>{chapter.totals.advances}</strong> discoveries & advances</span>
                <span><strong>{chapter.totals.politics}</strong> political turns</span>
                <span><strong>{chapter.totals.people}</strong> movements of life</span>
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
                }) : <p className="quiet-record">No distinct major change has entered the record yet.</p>}
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
  const cards = [
    ["LOCAL KNOWLEDGE", "Agents act on observations they personally made or learned through social contact. The observer does not grant them omniscience."],
    ["PLANS, NOT SCRIPTS", "Each named person weighs survival needs, uncertainty, learned outcomes, commitments, and multi-step goals before acting."],
    ["MUTUAL DECISIONS", "Families, trade, migration, leadership, alliances, peace, war, and belief reform use named proposals that other agents can accept or reject."],
    ["OPEN INVENTION", "Technology has no final node. Agents combine materials, processes, evidence, and prior capabilities into named projects."],
    ["EXCLUSIVE TERRITORY", "A territorial cell has one sovereign owner. Rival claims become explicit disputes instead of overlapping borders."],
    ["DETERMINISTIC WORLD", "The same seed and sequence of elapsed simulation time produce the same outcomes, making histories reproducible and testable."],
  ];
  async function reset() {
    if (!window.confirm("Start a new Era III planet? This permanently removes this browser's current Era III world and history.")) return;
    await runtime.reset();
    location.hash = "#/map";
  }
  return (
    <div className="planet-reading-shell">
      <ReadingHeader route="about" runtime={runtime} />
      <main className="planet-reading-main">
        <section className="planet-hero">
          <p>AN AUTONOMOUS PLANET · OBSERVED, NEVER COMMANDED</p>
          <h1>Freedom built from evidence and consequence.</h1>
          <div><p>This edition uses a deterministic on-device simulation—not an external language model. Autonomy means agents choose within their world from what they know, need, remember, and can physically attempt.</p><span>Seed {world.seed.toLocaleString()}<br />10,000-agent ceiling</span></div>
        </section>
        <section className="autonomy-grid">
          {cards.map(([title, copy], index) => <article key={title} style={{ "--card-index": index } as CSSProperties}><span>{String(index + 1).padStart(2, "0")}</span><h2>{title}</h2><p>{copy}</p></article>)}
        </section>
        <section className="catalog-section">
          <div><p>SIMULATION SUBSTRATE</p><h2>A planet rich enough to surprise its inhabitants.</h2></div>
          <dl>
            <div><dt>{catalog.counts.resources}</dt><dd>natural resources, including crude oil, gas, uranium, water, food, fibers, metals, and renewables</dd></div>
            <div><dt>{catalog.counts.commodities}</dt><dd>usable commodities derived from raw materials</dd></div>
            <div><dt>{catalog.counts.recipes}</dt><dd>material transformation recipes</dd></div>
            <div><dt>{catalog.counts.capabilities}+</dt><dd>foundational capabilities before compositional inventions</dd></div>
          </dl>
        </section>
        <section className="local-explanation">
          <p>THIS GITHUB PAGES EDITION</p><h2>One browser, one private timeline.</h2><p>Your Era III planet is stored in IndexedDB on this device and advances while open. When you return, the deterministic event engine catches up from the last save. Clearing browser data removes it, and another visitor sees a different local copy—not yours.</p><div className="counsel-boundary"><strong>External OpenAI counsel: unavailable</strong><span>Static hosting cannot protect a server-side API secret, so no external model is called here. Every choice remains inside the deterministic agent planner.</span></div><button type="button" onClick={() => void reset()}>Start a new local planet</button>
        </section>
      </main>
    </div>
  );
}

function LoadingWorld({ error }: { error: string }) {
  return <main className="planet-boot"><span>W</span><p>ERA III · PLANETFALL</p><h1>{error ? "The planet could not open." : "Restoring your local planet…"}</h1><small>{error || "Ten founders, ten camps, one unobserved future."}</small>{error ? <button type="button" onClick={() => location.reload()}>Try again</button> : null}</main>;
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
    return <div className="legacy-route"><Suspense fallback={<LoadingWorld error="" />}><LegacyEraTwoApp /></Suspense><a className="return-era-three" href="#/map">Return to Era III</a></div>;
  }
  if (route === "history") return <PlanetHistoryPage runtime={runtime} />;
  if (route === "about") return <AboutPage runtime={runtime} />;

  return (
    <div className="planet-pages-route">
      <PlanetExperience adapter={runtime.adapter} archiveHref="#/legacy" historyHref="#/history" />
      <LocalWorldBar runtime={runtime} />
    </div>
  );
}
