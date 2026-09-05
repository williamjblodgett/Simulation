"use client";

import { ArrowLeft, ArrowRight, BookOpen, Globe2, RefreshCw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./planet-history.module.css";

type HistoryCategory =
  | "population"
  | "advancement"
  | "geopolitical"
  | "economy"
  | "migration"
  | "society";

interface HistoryEvent {
  id: string;
  day: number;
  type: string;
  title: string;
  summary: string;
  importance: number;
  causalEventIds: string[];
}

interface HistoryArc {
  consequence: HistoryEvent;
  causes: HistoryEvent[];
}

interface HistoryChapter {
  index: number;
  startDay: number;
  endDay: number;
  complete: boolean;
  title: string;
  summary: string;
  eventCount: number;
  categoryCounts: Record<HistoryCategory, number>;
  topMoments: HistoryEvent[];
  causalArcs: HistoryArc[];
  novelFingerprints: number;
}

interface HistoryResponse {
  chapterLengthDays: number;
  throughDay: number;
  throughRevision: number;
  totalChapters: number;
  chapters: HistoryChapter[];
}

const CATEGORY_LABELS: Record<HistoryCategory, string> = {
  population: "Lives",
  advancement: "Knowledge",
  geopolitical: "Power",
  economy: "Work",
  migration: "Migration",
  society: "Society",
};

function readChapterParam() {
  if (typeof window === "undefined") return null;
  const value = Number(new URL(window.location.href).searchParams.get("chapter"));
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export function PlanetHistoryClient() {
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    try {
      const response = await fetch("/api/planet/history?limit=25", {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("The planetary record could not be opened.");
      const next = await response.json() as HistoryResponse;
      setData(next);
      setError(null);
      setSelectedIndex((current) => {
        const requested = current ?? readChapterParam();
        if (requested && next.chapters.some(({ index }) => index === requested)) return requested;
        return next.chapters.at(-1)?.index ?? 1;
      });
    } catch (reason) {
      if ((reason as Error).name !== "AbortError") {
        setError(reason instanceof Error ? reason.message : "The planetary record is unavailable.");
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const interval = window.setInterval(() => void load(), 30_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
      requestRef.current?.abort();
    };
  }, [load]);

  useEffect(() => {
    if (!selectedIndex) return;
    const url = new URL(window.location.href);
    url.searchParams.set("chapter", String(selectedIndex));
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
  }, [selectedIndex]);

  const chapter = useMemo(
    () => data?.chapters.find(({ index }) => index === selectedIndex) ?? null,
    [data, selectedIndex],
  );
  const selectedPosition = data?.chapters.findIndex(({ index }) => index === selectedIndex) ?? -1;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        {/* A full-document navigation is intentional: it remains reliable if a
            long-running simulation bundle is replaced while this tab is open. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className={styles.brand} href="/">
          <span className={styles.brandMark}><Globe2 size={21} /></span>
          <span><strong>WildGrid</strong><small>Era III living history</small></span>
        </a>
        <nav aria-label="World sections">
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/"><Globe2 size={16} /> Planet</a>
          <a href="/history"><BookOpen size={16} /> Era II history</a>
        </nav>
      </header>

      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>The planet remembers consequences</p>
          <h1>A history written by its inhabitants.</h1>
          <p>Every volume spans 200 world days, but repeated noise is removed. What remains are distinct choices, causes, and changes that shaped survival and prosperity.</p>
        </div>
        <div className={styles.pulse} aria-label="History synchronization status">
          <span />
          <strong>{data ? `Recorded through Day ${Math.floor(data.throughDay).toLocaleString()}` : "Opening the ledger"}</strong>
          <small>{data ? `${data.totalChapters} ${data.totalChapters === 1 ? "volume" : "volumes"}` : "Persistent Era III record"}</small>
        </div>
      </section>

      {loading && !data ? (
        <section className={styles.state} role="status"><RefreshCw className={styles.spin} /> Compiling the living record…</section>
      ) : error && !data ? (
        <section className={styles.state} role="alert">
          <strong>The record is temporarily out of reach.</strong>
          <span>{error}</span>
          <button type="button" onClick={() => void load()}><RefreshCw size={16} /> Try again</button>
        </section>
      ) : (
        <div className={styles.reader}>
          <aside className={styles.contents} aria-label="History volumes">
            <div className={styles.sectionLabel}>Volumes</div>
            <div className={styles.volumeList}>
              {data?.chapters.map((item) => (
                <button
                  type="button"
                  key={item.index}
                  className={styles.volumeButton}
                  data-selected={item.index === selectedIndex}
                  aria-current={item.index === selectedIndex ? "page" : undefined}
                  onClick={() => setSelectedIndex(item.index)}
                >
                  <span>{String(item.index).padStart(2, "0")}</span>
                  <div><strong>{item.title}</strong><small>Days {item.startDay.toLocaleString()}–{item.endDay.toLocaleString()}</small></div>
                  {!item.complete && <em>Open</em>}
                </button>
              ))}
            </div>
          </aside>

          {chapter && (
            <article className={styles.chapter}>
              <div className={styles.chapterHeading}>
                <div>
                  <p className={styles.eyebrow}>Volume {chapter.index} · Days {chapter.startDay.toLocaleString()}–{chapter.endDay.toLocaleString()}</p>
                  <h2>{chapter.title}</h2>
                  <p>{chapter.summary}</p>
                </div>
                <span className={styles.chapterStatus} data-complete={chapter.complete}>{chapter.complete ? "Closed record" : "Still unfolding"}</span>
              </div>

              <div className={styles.metrics}>
                <div><strong>{chapter.eventCount.toLocaleString()}</strong><span>Recorded changes</span></div>
                <div><strong>{chapter.novelFingerprints}</strong><span>Distinct turning points</span></div>
                {(Object.entries(chapter.categoryCounts) as Array<[HistoryCategory, number]>)
                  .filter(([, count]) => count > 0)
                  .sort((left, right) => right[1] - left[1])
                  .slice(0, 3)
                  .map(([category, count]) => <div key={category}><strong>{count}</strong><span>{CATEGORY_LABELS[category]}</span></div>)}
              </div>

              <section className={styles.moments}>
                <div className={styles.sectionHeading}><span>Defining moments</span><small>Ranked for consequence and novelty</small></div>
                {chapter.topMoments.length ? chapter.topMoments.map((moment, index) => (
                  <div className={styles.moment} key={moment.id}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <div><small>Day {Math.floor(moment.day).toLocaleString()} · {moment.type.replaceAll("_", " ")}</small><h3>{moment.title}</h3><p>{moment.summary}</p></div>
                    <strong>{Math.round(moment.importance)}</strong>
                  </div>
                )) : <p className={styles.empty}>This young volume has not accumulated a defining change yet.</p>}
              </section>

              {chapter.causalArcs.length > 0 && (
                <section className={styles.arcs}>
                  <div className={styles.sectionHeading}><span>How change happened</span><small>Recorded cause → consequence</small></div>
                  {chapter.causalArcs.map((arc) => (
                    <div className={styles.arc} key={arc.consequence.id}>
                      <div className={styles.causes}>{arc.causes.map((cause) => <span key={cause.id}>{cause.title}</span>)}</div>
                      <ArrowRight aria-hidden="true" />
                      <div><strong>{arc.consequence.title}</strong><p>{arc.consequence.summary}</p></div>
                    </div>
                  ))}
                </section>
              )}

              <footer className={styles.chapterNav}>
                <button type="button" disabled={selectedPosition <= 0} onClick={() => setSelectedIndex(data?.chapters[selectedPosition - 1]?.index ?? selectedIndex)}><ArrowLeft size={16} /> Previous volume</button>
                <span><Sparkles size={15} /> Autonomous record · Revision {data?.throughRevision.toLocaleString()}</span>
                <button type="button" disabled={!data || selectedPosition < 0 || selectedPosition >= data.chapters.length - 1} onClick={() => setSelectedIndex(data?.chapters[selectedPosition + 1]?.index ?? selectedIndex)}>Next volume <ArrowRight size={16} /></button>
              </footer>
            </article>
          )}
        </div>
      )}
    </main>
  );
}
