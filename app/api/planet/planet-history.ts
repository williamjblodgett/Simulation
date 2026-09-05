import { getD1 } from "@/db";
import type { PlanetHistoryEvent } from "@/app/simulation/planet/types";
import {
  PLANET_HISTORY_CHAPTER_DAYS,
  PLANET_WORLD_ID,
  currentPlanet,
} from "./planet-store";
import { decodePlanetPayload, encodePlanetPayload } from "./planet-codec";
import { ensurePlanetSchema } from "./planet-schema";

const MAX_CHAPTER_CANDIDATES = 1_200;
const MAX_CHAPTER_MOMENTS = 12;
const MAX_CATEGORY_MOMENTS = 2;
const DEFAULT_CHAPTER_PAGE_SIZE = 12;
const MAX_CHAPTER_PAGE_SIZE = 25;
const DEFAULT_EVENT_LIMIT = 100;
const MAX_EVENT_LIMIT = 250;

type HistoryCategory =
  | "population"
  | "advancement"
  | "geopolitical"
  | "economy"
  | "migration"
  | "society";

interface HistoryEventRow {
  eventJson: string;
}

interface HistoryCountRow {
  eventType: string;
  eventCount: number;
}

interface ChapterRow {
  throughRevision: number;
  complete: number;
  summaryJson: string;
  fingerprint: string;
}

export interface PlanetHistoryArc {
  consequence: PlanetHistoryEvent;
  causes: PlanetHistoryEvent[];
}

export interface PlanetHistoryChapter {
  index: number;
  startDay: number;
  endDay: number;
  complete: boolean;
  throughRevision: number;
  title: string;
  summary: string;
  eventCount: number;
  typeCounts: Record<string, number>;
  categoryCounts: Record<HistoryCategory, number>;
  topMoments: PlanetHistoryEvent[];
  causalArcs: PlanetHistoryArc[];
  novelFingerprints: number;
}

function rows<T>(result: unknown): T[] {
  if (!result || typeof result !== "object") return [];
  const found = (result as { results?: unknown }).results;
  return Array.isArray(found) ? (found as T[]) : [];
}

function nonNegativeInteger(value: unknown): number {
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) && numeric >= 0 ? numeric : 0;
}

function eventCategory(type: string): HistoryCategory {
  if (type === "birth" || type === "death") return "population";
  if (type === "discovery" || type === "invention") return "advancement";
  if (
    type === "proposal" ||
    type === "agreement" ||
    type === "alliance" ||
    type === "war" ||
    type === "peace" ||
    type === "leadership_change" ||
    type === "territory_claim" ||
    type === "territory_contested"
  ) return "geopolitical";
  if (
    type === "extraction" ||
    type === "production" ||
    type === "construction" ||
    type === "trade"
  ) return "economy";
  if (type === "migration" || type === "settlement_founded") return "migration";
  return "society";
}

function parseEvent(json: string): PlanetHistoryEvent | null {
  try {
    const event = JSON.parse(json) as Partial<PlanetHistoryEvent>;
    if (
      typeof event.id !== "string" ||
      typeof event.type !== "string" ||
      typeof event.title !== "string" ||
      typeof event.summary !== "string" ||
      typeof event.fingerprint !== "string" ||
      !Number.isFinite(event.at) ||
      !Number.isFinite(event.day) ||
      !Number.isFinite(event.importance) ||
      !Array.isArray(event.actorIds) ||
      !Array.isArray(event.entityIds) ||
      !Array.isArray(event.causalEventIds)
    ) return null;
    return event as PlanetHistoryEvent;
  } catch {
    return null;
  }
}

async function chapterEvents(
  database: ReturnType<typeof getD1>,
  revision: number,
  startDay: number,
  endDay: number,
): Promise<PlanetHistoryEvent[]> {
  const result = await database
    .prepare(`
      SELECT event_json AS eventJson
      FROM planet_events
      WHERE world_id = ?
        AND revision <= ?
        AND day >= ?
        AND day <= ?
      ORDER BY importance DESC, occurred_at DESC, event_id DESC
      LIMIT ?
    `)
    .bind(
      PLANET_WORLD_ID,
      revision,
      startDay,
      endDay,
      MAX_CHAPTER_CANDIDATES,
    )
    .all<HistoryEventRow>();
  return rows<HistoryEventRow>(result)
    .map((row) => parseEvent(row.eventJson))
    .filter((event): event is PlanetHistoryEvent => event !== null);
}

async function chapterCounts(
  database: ReturnType<typeof getD1>,
  revision: number,
  startDay: number,
  endDay: number,
): Promise<Record<string, number>> {
  const result = await database
    .prepare(`
      SELECT event_type AS eventType, COUNT(*) AS eventCount
      FROM planet_events
      WHERE world_id = ?
        AND revision <= ?
        AND day >= ?
        AND day <= ?
      GROUP BY event_type
      ORDER BY event_type ASC
    `)
    .bind(PLANET_WORLD_ID, revision, startDay, endDay)
    .all<HistoryCountRow>();
  return Object.fromEntries(
    rows<HistoryCountRow>(result).map((row) => [
      row.eventType,
      nonNegativeInteger(row.eventCount),
    ]),
  );
}

function curateMoments(
  events: readonly PlanetHistoryEvent[],
  previousFingerprints: ReadonlySet<string>,
): PlanetHistoryEvent[] {
  const unique = [...new Map(
    events.map((event) => [event.fingerprint || `${event.type}:${event.id}`, event]),
  ).values()];
  unique.sort((left, right) => {
    const leftNovelty = previousFingerprints.has(left.fingerprint) ? 0 : 1.5;
    const rightNovelty = previousFingerprints.has(right.fingerprint) ? 0 : 1.5;
    return (right.importance + rightNovelty) - (left.importance + leftNovelty) ||
      right.at - left.at ||
      left.id.localeCompare(right.id);
  });
  const categoryUse = new Map<HistoryCategory, number>();
  const chosen: PlanetHistoryEvent[] = [];
  for (const event of unique) {
    const category = eventCategory(event.type);
    if ((categoryUse.get(category) ?? 0) >= MAX_CATEGORY_MOMENTS) continue;
    chosen.push(event);
    categoryUse.set(category, (categoryUse.get(category) ?? 0) + 1);
    if (chosen.length >= MAX_CHAPTER_MOMENTS) break;
  }
  return chosen;
}

function buildCausalArcs(
  moments: readonly PlanetHistoryEvent[],
  candidates: readonly PlanetHistoryEvent[],
): PlanetHistoryArc[] {
  const byId = new Map(candidates.map((event) => [event.id, event]));
  return moments
    .filter((event) => event.causalEventIds.length > 0)
    .slice(0, 6)
    .map((consequence) => ({
      consequence,
      causes: consequence.causalEventIds
        .map((id) => byId.get(id))
        .filter((event): event is PlanetHistoryEvent => Boolean(event))
        .slice(0, 4),
    }))
    .filter((arc) => arc.causes.length > 0);
}

function chapterTitle(index: number, moments: readonly PlanetHistoryEvent[]): string {
  const lead = moments[0];
  if (!lead) return `The Quiet Record · Volume ${index}`;
  const category = eventCategory(lead.type);
  const prefix: Record<HistoryCategory, string> = {
    population: "Lives and Loss",
    advancement: "Knowledge Takes Form",
    geopolitical: "Power Redrawn",
    economy: "Work and Exchange",
    migration: "Paths Across the World",
    society: "Choices That Endured",
  };
  return `${prefix[category]} · Volume ${index}`;
}

function chapterSummary(
  eventCount: number,
  moments: readonly PlanetHistoryEvent[],
  categoryCounts: Record<HistoryCategory, number>,
  previousFingerprints: ReadonlySet<string>,
): string {
  if (eventCount === 0) {
    return "No major change entered the permanent record during this span.";
  }
  const lead = moments[0];
  const novel = moments.filter((event) => !previousFingerprints.has(event.fingerprint)).length;
  const dominant = (Object.entries(categoryCounts) as Array<[HistoryCategory, number]>)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0];
  const opening = lead
    ? `The record identifies “${lead.title}” as its clearest turning point.`
    : `${eventCount} major events entered the record.`;
  return `${opening} ${novel} of the selected turning points were distinct from the preceding volume, while ${dominant?.[0] ?? "society"} changes shaped the widest share of the record.`;
}

async function cachedChapter(
  database: ReturnType<typeof getD1>,
  index: number,
  revision: number,
  complete: boolean,
): Promise<PlanetHistoryChapter | null> {
  const row = await database
    .prepare(`
      SELECT
        through_revision AS throughRevision,
        complete,
        summary_json AS summaryJson,
        fingerprint
      FROM planet_history_chapters
      WHERE world_id = ? AND chapter_index = ?
    `)
    .bind(PLANET_WORLD_ID, index)
    .first<ChapterRow>();
  if (!row || (row.complete !== 1 && row.throughRevision !== revision)) return null;
  if (complete && row.complete !== 1) return null;
  try {
    const decoded = await decodePlanetPayload(row.summaryJson, row.fingerprint);
    return decoded as PlanetHistoryChapter;
  } catch {
    return null;
  }
}

async function persistChapter(
  database: ReturnType<typeof getD1>,
  chapter: PlanetHistoryChapter,
): Promise<void> {
  const encoded = await encodePlanetPayload(chapter);
  await database
    .prepare(`
      INSERT INTO planet_history_chapters (
        world_id, chapter_index, start_day, end_day, through_revision,
        complete, fingerprint, summary_json, summary_bytes, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT (world_id, chapter_index) DO UPDATE SET
        start_day = excluded.start_day,
        end_day = excluded.end_day,
        through_revision = excluded.through_revision,
        complete = excluded.complete,
        fingerprint = excluded.fingerprint,
        summary_json = excluded.summary_json,
        summary_bytes = excluded.summary_bytes,
        updated_at = CURRENT_TIMESTAMP
      WHERE planet_history_chapters.complete = 0
    `)
    .bind(
      PLANET_WORLD_ID,
      chapter.index,
      chapter.startDay,
      chapter.endDay,
      chapter.throughRevision,
      chapter.complete ? 1 : 0,
      encoded.checksum,
      encoded.stored,
      encoded.storedBytes,
    )
    .run();
}

export async function getPlanetHistoryChapter(
  index: number,
): Promise<PlanetHistoryChapter> {
  if (!Number.isSafeInteger(index) || index < 1 || index > 100_000) {
    throw new Error("chapter must be a positive integer.");
  }
  const database = getD1();
  await ensurePlanetSchema(database);
  const snapshot = await currentPlanet();
  const startDay = (index - 1) * PLANET_HISTORY_CHAPTER_DAYS + 1;
  const endDay = index * PLANET_HISTORY_CHAPTER_DAYS;
  const complete = snapshot.world.day > endDay;
  const cached = await cachedChapter(database, index, snapshot.row.revision, complete);
  if (cached) return cached;

  const previousStart = Math.max(1, startDay - PLANET_HISTORY_CHAPTER_DAYS);
  const [events, counts, previousEvents] = await Promise.all([
    chapterEvents(database, snapshot.row.revision, startDay, endDay),
    chapterCounts(database, snapshot.row.revision, startDay, endDay),
    index > 1
      ? chapterEvents(database, snapshot.row.revision, previousStart, startDay - 1)
      : Promise.resolve([]),
  ]);
  const previousFingerprints = new Set(previousEvents.map((event) => event.fingerprint));
  const moments = curateMoments(events, previousFingerprints);
  const categoryCounts: Record<HistoryCategory, number> = {
    population: 0,
    advancement: 0,
    geopolitical: 0,
    economy: 0,
    migration: 0,
    society: 0,
  };
  for (const [type, count] of Object.entries(counts)) {
    categoryCounts[eventCategory(type)] += count;
  }
  const eventCount = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const chapter: PlanetHistoryChapter = {
    index,
    startDay,
    endDay,
    complete,
    throughRevision: snapshot.row.revision,
    title: chapterTitle(index, moments),
    summary: chapterSummary(
      eventCount,
      moments,
      categoryCounts,
      previousFingerprints,
    ),
    eventCount,
    typeCounts: counts,
    categoryCounts,
    topMoments: moments,
    causalArcs: buildCausalArcs(moments, events),
    novelFingerprints: moments.filter(
      (event) => !previousFingerprints.has(event.fingerprint),
    ).length,
  };
  await persistChapter(database, chapter);
  return chapter;
}

function positiveQueryInteger(
  search: URLSearchParams,
  name: string,
  fallback: number,
  maximum: number,
): number {
  const raw = search.get(name);
  if (raw === null || raw === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new Error(`${name} must be between 1 and ${maximum}.`);
  }
  return parsed;
}

export async function planetHistoryResponse(request: Request): Promise<unknown> {
  const search = new URL(request.url).searchParams;
  const chapterRaw = search.get("chapter");
  if (chapterRaw !== null) {
    const chapter = Number(chapterRaw);
    if (!Number.isSafeInteger(chapter) || chapter < 1 || chapter > 100_000) {
      throw new Error("chapter must be a positive integer.");
    }
    return { chapterLengthDays: PLANET_HISTORY_CHAPTER_DAYS, chapter: await getPlanetHistoryChapter(chapter) };
  }

  if (search.get("view") === "events") {
    const snapshot = await currentPlanet();
    const fromDay = positiveQueryInteger(search, "fromDay", 1, 100_000_000);
    const toDay = positiveQueryInteger(
      search,
      "toDay",
      Math.max(fromDay, Math.floor(snapshot.world.day)),
      100_000_000,
    );
    if (toDay < fromDay || toDay - fromDay > 2_000) {
      throw new Error("The requested history span must be at most 2,000 days.");
    }
    const limit = positiveQueryInteger(
      search,
      "limit",
      DEFAULT_EVENT_LIMIT,
      MAX_EVENT_LIMIT,
    );
    const database = getD1();
    const result = await database
      .prepare(`
        SELECT event_json AS eventJson
        FROM planet_events
        WHERE world_id = ? AND revision <= ? AND day >= ? AND day <= ?
        ORDER BY occurred_at DESC, event_id DESC
        LIMIT ?
      `)
      .bind(PLANET_WORLD_ID, snapshot.row.revision, fromDay, toDay, limit)
      .all<HistoryEventRow>();
    return {
      revision: snapshot.row.revision,
      fromDay,
      toDay,
      limit,
      events: rows<HistoryEventRow>(result)
        .map((row) => parseEvent(row.eventJson))
        .filter((event): event is PlanetHistoryEvent => event !== null),
    };
  }

  const snapshot = await currentPlanet();
  const totalChapters = Math.max(
    1,
    Math.ceil(snapshot.world.day / PLANET_HISTORY_CHAPTER_DAYS),
  );
  const page = positiveQueryInteger(search, "page", 1, 100_000);
  const limit = positiveQueryInteger(
    search,
    "limit",
    DEFAULT_CHAPTER_PAGE_SIZE,
    MAX_CHAPTER_PAGE_SIZE,
  );
  const first = (page - 1) * limit + 1;
  if (first > totalChapters && page !== 1) {
    throw new Error("The requested history page does not exist.");
  }
  const last = Math.min(totalChapters, first + limit - 1);
  const chapters: PlanetHistoryChapter[] = [];
  for (let index = first; index <= last; index += 1) {
    chapters.push(await getPlanetHistoryChapter(index));
  }
  return {
    chapterLengthDays: PLANET_HISTORY_CHAPTER_DAYS,
    throughDay: snapshot.world.day,
    throughRevision: snapshot.row.revision,
    page,
    limit,
    totalChapters,
    chapters,
  };
}
