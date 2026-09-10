import { lazy, Suspense, useEffect, useMemo, useState, type CSSProperties } from "react";
import { SurvivalExperience } from "../../app/survival/survival-experience";
import type {
  PlanetHistoryEvent,
  PlanetHistoryEventType,
  PlanetWorldState,
} from "../../app/simulation/planet";
import type { LocalPlanetRuntime } from "./planet-runtime";

const LegacyEraTwoApp = lazy(() => import("./App").then(({ App }) => ({ default: App })));

let getLoadedPlanetHistoryChapter: typeof import("../../app/simulation/planet")["getPlanetHistoryChapter"];
let validateLoadedPlanetCatalogs: typeof import("../../app/simulation/planet")["validatePlanetCatalogs"];
let useLoadedLocalPlanetRuntime: typeof import("./planet-runtime")["useLocalPlanetRuntime"];
let LoadedPlanetExperience: typeof import("../../app/planet-experience")["PlanetExperience"];

const LazyPlanetRoutes = lazy(async () => {
  const [planet, runtime, experience] = await Promise.all([
    import("../../app/simulation/planet"),
    import("./planet-runtime"),
    import("../../app/planet-experience"),
  ]);
  getLoadedPlanetHistoryChapter = planet.getPlanetHistoryChapter;
  validateLoadedPlanetCatalogs = planet.validatePlanetCatalogs;
  useLoadedLocalPlanetRuntime = runtime.useLocalPlanetRuntime;
  LoadedPlanetExperience = experience.PlanetExperience;
  return { default: PlanetRoutesLoaded };
});

type Route = "survival" | "about" | "planet" | "planetHistory" | "planetAbout" | "legacy";
type PlanetRoute = Extract<Route, "planet" | "planetHistory" | "planetAbout" | "legacy">;

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
  if (route === "about") return "about";
  if (route === "planet") return "planet";
  if (route === "planet-history") return "planetHistory";
  if (route === "planet-method") return "planetAbout";
  if (route === "legacy" || route === "archive" || route === "history") return "legacy";
  return "survival";
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
      <em>{storageLabel}</em>
    </aside>
  );
}

function ReadingHeader({ route, runtime }: { route: PlanetRoute; runtime: LocalPlanetRuntime }) {
  return (
    <>
      <header className="planet-reading-header">
        <a className="planet-wordmark" href="#/"><span>S</span><div><strong>SIMULATION</strong><small>PRIOR PLANETARY STUDY</small></div></a>
        <nav aria-label="Prior planetary study sections">
          <a href="#/">Current study</a>
          <a className={route === "planet" ? "active" : ""} href="#/planet">World</a>
          <a className={route === "planetHistory" ? "active" : ""} href="#/planet-history">Record</a>
          <a className={route === "planetAbout" ? "active" : ""} href="#/planet-method">Method</a>
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

function buildHistoryChapters(world: PlanetWorldState, history: readonly PlanetHistoryEvent[], firstChapter: number, lastChapter: number, coverageFromDay = 1): HistoryChapterView[] {
  const priorFingerprints = new Set<string>();
  const chapters: HistoryChapterView[] = [];
  for (let number = firstChapter; number <= lastChapter; number += 1) {
    const baseChapter = getLoadedPlanetHistoryChapter(world, number);
    const chapter = { ...baseChapter, events: history.filter((event) => event.day >= baseChapter.startDay && event.day <= baseChapter.endDay) };
    const moments = selectDistinctMoments(chapter.events, priorFingerprints);
    const defining = moments.slice().sort((left, right) => right.importance - left.importance || left.day - right.day)[0];
    const title = number === 1
      ? "The First Ten"
      : defining ? defining.title : "The Quiet Record";
    chapters.push({
      number,
      startDay: chapter.startDay,
      endDay: Math.min(chapter.endDay, world.day),
      complete: world.day >= chapter.endDay && chapter.startDay >= coverageFromDay,
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
  const history = runtime.historyLedger.length ? runtime.historyLedger : world.history;
  const chaptersPerPage = 8;
  const totalChapters = Math.max(1, Math.ceil(world.day / 200));
  const totalPages = Math.max(1, Math.ceil(totalChapters / chaptersPerPage));
  const pageFromHash = () => {
    const query = location.hash.split("?")[1] ?? "";
    const requested = Number(new URLSearchParams(query).get("page"));
    return Number.isInteger(requested) && requested > 0 ? requested - 1 : 0;
  };
  const [page, setPage] = useState(pageFromHash);
  useEffect(() => {
    const update = () => setPage(pageFromHash());
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);

  const safePage = Math.min(page, totalPages - 1);
  const lastChapter = Math.max(1, totalChapters - safePage * chaptersPerPage);
  const firstChapter = Math.max(1, lastChapter - chaptersPerPage + 1);
  const chapters = useMemo(() => buildHistoryChapters(world, history, firstChapter, lastChapter, runtime.reconstruction.coverageFromDay), [firstChapter, history, lastChapter, runtime.reconstruction.coverageFromDay, world]);
  const eventById = useMemo(() => new Map(history.map((event) => [event.id, event])), [history]);
  return (
    <div className="planet-reading-shell">
      <ReadingHeader route="planetHistory" runtime={runtime} />
      <main className="planet-reading-main history-reading-main">
        <section className="planet-hero">
          <p>CAUSAL ARCHIVE · 200-DAY OBSERVATION INTERVALS</p>
          <h1>A causal record of an autonomous world.</h1>
          <div><p>Routine state changes are omitted. Each interval preserves distinct demographic, material, institutional, and ideological changes, with recorded causes where the simulation has them.</p><span>{totalChapters} interval{totalChapters === 1 ? "" : "s"}<br />{formatNumber(history.length)} recorded events<br />{runtime.reconstruction.resolution === "exact" ? "Exact reconstruction" : `${runtime.reconstruction.resolution} reconstruction`}</span></div>
        </section>

        <aside className="archive-coverage" aria-label="Archive coverage"><strong>Record coverage</strong><span>Continuous from Day {runtime.reconstruction.coverageFromDay.toLocaleString()}{runtime.reconstruction.coarseEpochDays ? ` · earlier absence reconstructed in ${runtime.reconstruction.coarseEpochDays}-day epochs` : " · exact event resolution"}</span></aside>

        <nav className="chapter-pager" aria-label="History chapter pages">
          <button type="button" disabled={safePage >= totalPages - 1} onClick={() => { location.hash = `#/planet-history?page=${Math.min(totalPages, safePage + 2)}`; }}>← Older chapters</button>
          <span>Showing chapters {firstChapter}–{lastChapter} of {totalChapters}</span>
          <button type="button" disabled={safePage === 0} onClick={() => { const next = Math.max(1, safePage); location.hash = next === 1 ? "#/planet-history" : `#/planet-history?page=${next}`; }}>Newer chapters →</button>
        </nav>

        <div className="chapter-list">
          {chapters.map((chapter) => (
            <article className="planet-chapter" key={chapter.number}>
              <header>
                <div><p>CHAPTER {String(chapter.number).padStart(2, "0")} · DAYS {chapter.startDay}–{chapter.endDay}</p><h2>{chapter.title}</h2></div>
                <span data-complete={chapter.complete}>{chapter.complete ? "SEALED" : chapter.startDay < runtime.reconstruction.coverageFromDay ? "INCOMPLETE SOURCE" : "IN PROGRESS"}</span>
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
  const catalog = validateLoadedPlanetCatalogs();
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
    location.hash = "#/planet";
  }
  return (
    <div className="planet-reading-shell">
      <ReadingHeader route="planetAbout" runtime={runtime} />
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
  return <main className="planet-boot"><span>S</span><p>SIMULATION · PRIOR PLANETARY STUDY</p><h1>{error ? "The observation record could not open." : "Restoring the planetary record…"}</h1><small>{error || "Initializing societies, material conditions, and the event archive."}</small>{error ? <button type="button" onClick={() => location.reload()}>Try again</button> : null}</main>;
}

const AUTONOMY_CYCLE = [
  ["01", "Observe", "Each agent receives nearby evidence, current conditions, encounters, and the outcomes it remembers."],
  ["02", "Compare", "It weighs feasible actions against hydration, nutrition, energy, warmth, safety, uncertainty, and experience."],
  ["03", "Act", "It selects and attempts a plan. Cooperation can be requested, but another agent may refuse."],
  ["04", "Learn", "Confirmed outcomes update expectations, so later choices can change without a preset personality."],
] as const;

function SurvivalMethodPage() {
  return <main className="survival-method-page">
    <header><a href="#/">← Back to Simulation</a><span>Method · read-only</span></header>
    <section className="survival-method-hero"><p>HOW THE EXPERIMENT WORKS</p><h1>The environment is supplied.<br />The decisions are not.</h1><div><p>The observer configures a run, moves the camera, changes playback speed, and inspects evidence. The observer cannot tell an agent where to walk, what to gather, whom to trust, or which technique to pursue.</p><a href="#/">Observe the current run</a></div></section>
    <section className="survival-method-goal"><span>THE ORIGINAL PRIMARY OBJECTIVE</span><h2>Survive as long as possible.</h2><p>Every agent starts from this same primary objective, without a preset personality, profession, job, faction, preferred strategy, enemy, or scripted life story. New physical studies default to individual survival only. You can separately enable optional continuity when configuring a run; agents then decide whether to fund a successor, with immediate survival taking priority.</p></section>
    <section className="survival-method-cycle"><p>ONE DECISION CYCLE</p><h2>What autonomy means here</h2><div>{AUTONOMY_CYCLE.map(([number, title, copy]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{copy}</p></article>)}</div></section>
    <section className="survival-method-research"><p>RESEARCH IS AN ACTION, NOT AN UNLOCK BUTTON</p><h2>Try an arrangement. Measure what happened.</h2><p>Policy 3 agents can propose projects to reduce future exposure, gather materials, shape and position parts, connect or modify observed objects, and measure the results. They compare predicted survival benefit with effort, uncertainty, and ordinary alternatives such as resting or finding supplies. Urgent needs can interrupt a project. Failed parts remain in the world.</p><p>Wood, stone, fiber and clay have simplified mass, strength, insulation, porosity and heat properties. Geometry and connections determine support and protection—not a building name. Tests measure load, water retention or protection, including a modeled counterfactual for protection. Each agent keeps its own evidence and fallible estimates, can reuse an edited procedure, and can exchange a reported result with consent. A single successful trial is not proof of a general invention.</p><p>The action language and search budget are supplied by us. The current project generator focuses on exposure, not arbitrary machine design. This is not full chemistry, rigid-body physics, electricity or an unrestricted inventor. No API or hidden chatbot is involved. Older studies keep their policy family; active policy-2/3 studies adopt survival and navigation corrections with a recorded update. Policy 1 remains frozen. Configure a new run to change the policy family.</p></section>
    <section className="survival-method-boundary">
      <h2>Why can an agent still die?</h2>
      <p>Its map and predictions can be incomplete or wrong. It compares multi-step plans, such as reaching water, collecting it, and drinking, and can reconsider when delay becomes dangerous. It learns from blocked routes and refused requests, but it cannot see another agent’s private inventory or guarantee that help will arrive. Better planning is not immortality.</p>
      <p>The death review shows recorded needs, confirmed consumption, route failures, and the final plan. These measurements help the observer investigate what happened; they do not feed the agent extra knowledge or reconstruct missing history.</p>
    </section>
    <section className="survival-method-boundary"><h2>They learn arrangements, not a picture of a house.</h2><p>Agents start with basic abilities to handle materials and imperfect expectations, not a catalog of buildings. They reason about shapes they have observed, look for clear supported positions and an approach, obtain missing materials, and return to unfinished work. Urgent needs can interrupt construction. Repeated failures can make them revise or abandon a project.</p><p>Resting near an arrangement creates an experience record. An agent can later choose to return there when it expects protection to help. This is distinct from a controlled material test: a warmer night does not prove a structure caused the improvement. Select a physical part to inspect its maker, project, measurements and recent use. Dashed outlines show proposals, not completed buildings. The observer cannot approve a design or tell an agent to build it.</p><h2>Autonomous does not mean conscious.</h2><p>These are deterministic simulation agents with bounded perception, planning, uncertainty, memory, and outcome learning—not sentient beings and not hidden chatbots. Recorded intent reports the factors used by the model; it is not private chain-of-thought.</p><p>You can add an independent agent at any time before the observation period ends, up to five living agents—even after extinction. Additions are logged and do not restart the world.</p><p>Death remains permanent. After six modeled hours of experience, an agent may reserve 0.5 food and 0.5 water for its successor while keeping personal reserves. A living agent may also sponsor a successor after personally observing a death. Agents can decline or wait; repeated random rolls never force the choice.</p><p>A funded plan admits one new life after the predecessor dies and a slot is vacant, including after the last agent dies. The starter supplies transfer once. The new agent has a lineage record, but no inherited memories, research, personality or role. This is an abstract admission model, not biological reproduction or resurrection. Continuity is an explicitly designed preference—not evidence that an individual benefits after death. No new agent enters after the configured observation period ends.</p><a href="#/planet">Open the preserved planetary study</a></section>
  </main>;
}

function SurvivalPagesExperience() {
  return <div className="pages-survival-root"><SurvivalExperience methodHref="#/about" planetHref="#/planet" /></div>;
}

function PlanetRoutesLoaded({ route }: { route: PlanetRoute }) {
  const runtime = useLoadedLocalPlanetRuntime();

  useEffect(() => {
    runtime.adapter?.setContinuity({
      persistent: false,
      serverTimeMs: Date.now(),
      simulatedAtMs: Date.now() - runtime.catchUpSeconds * 1_000,
      pendingSeconds: runtime.catchUpSeconds,
      caughtUp: !runtime.catchingUp,
      reconstructionResolution: runtime.reconstruction.resolution,
      coverageFromDay: runtime.reconstruction.coverageFromDay,
      coarseEpochDays: runtime.reconstruction.coarseEpochDays,
    });
  }, [runtime.adapter, runtime.catchUpSeconds, runtime.catchingUp, runtime.reconstruction]);

  if (!runtime.adapter || !runtime.world || runtime.error) return <LoadingWorld error={runtime.error} />;

  if (route === "legacy") {
    return <div className="legacy-route"><Suspense fallback={<LoadingWorld error="" />}><LegacyEraTwoApp /></Suspense><a className="return-era-three" href="#/">Return to current study</a></div>;
  }
  if (route === "planetHistory") return <PlanetHistoryPage runtime={runtime} />;
  if (route === "planetAbout") return <AboutPage runtime={runtime} />;

  return (
    <div className="planet-pages-route">
      <LocalWorldBar runtime={runtime} />
      <div className="pages-experience">
        <LoadedPlanetExperience adapter={runtime.adapter} archiveHref="#/legacy" historyHref="#/planet-history" methodHref="#/planet-method" />
      </div>
    </div>
  );
}

export function Router() {
  const [route, setRoute] = useState<Route>(routeFromHash);

  useEffect(() => {
    const onHashChange = () => setRoute(routeFromHash());
    window.addEventListener("hashchange", onHashChange);
    if (!location.hash) window.history.replaceState(null, "", `${location.pathname}${location.search}#/`);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  if (route === "survival") return <SurvivalPagesExperience />;
  if (route === "about") return <SurvivalMethodPage />;
  return <Suspense fallback={<LoadingWorld error="" />}><LazyPlanetRoutes route={route} /></Suspense>;
}
