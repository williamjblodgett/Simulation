import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { layoutExclusiveTerritories } from "../app/simulation/territory-layout.ts";

function polygonArea(polygon) {
  if (polygon.length < 3) return 0;
  let twiceArea = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    twiceArea += current.x * next.z - next.x * current.z;
  }
  return Math.abs(twiceArea) * 0.5;
}

function clipConvexPolygon(subject, clipPolygon) {
  let result = [...subject];
  for (let edgeIndex = 0; edgeIndex < clipPolygon.length && result.length > 0; edgeIndex += 1) {
    const edgeStart = clipPolygon[edgeIndex];
    const edgeEnd = clipPolygon[(edgeIndex + 1) % clipPolygon.length];
    const side = (point) => (
      (edgeEnd.x - edgeStart.x) * (point.z - edgeStart.z)
      - (edgeEnd.z - edgeStart.z) * (point.x - edgeStart.x)
    );
    const nextResult = [];
    let start = result[result.length - 1];
    let startSide = side(start);
    for (const end of result) {
      const endSide = side(end);
      const startInside = startSide >= -1e-10;
      const endInside = endSide >= -1e-10;
      if (startInside !== endInside) {
        const denominator = startSide - endSide;
        const t = Math.abs(denominator) < Number.EPSILON ? 0 : startSide / denominator;
        nextResult.push({
          x: start.x + (end.x - start.x) * t,
          z: start.z + (end.z - start.z) * t,
        });
      }
      if (endInside) nextResult.push(end);
      start = end;
      startSide = endSide;
    }
    result = nextResult;
  }
  return result;
}

function assertExclusiveTerritoryFixture(name, claims, options) {
  const originalClaims = structuredClone(claims);
  const layout = layoutExclusiveTerritories(claims, options);
  const reordered = layoutExclusiveTerritories([...claims].reverse(), options);
  assert.deepEqual(reordered, layout, `${name}: input ordering changed the layout`);
  assert.deepEqual(layoutExclusiveTerritories(claims, options), layout, `${name}: layout was not deterministic`);
  assert.deepEqual(claims, originalClaims, `${name}: layout mutated its claims`);
  assert.deepEqual(layout.map((cell) => cell.id), [...claims].map((claim) => claim.id).sort(), `${name}: cells were not sorted by id`);

  const limit = options.halfSize - (options.edgeInset ?? 0);
  for (const cell of layout) {
    assert.ok(cell.center.x >= -limit && cell.center.x <= limit, `${name}/${cell.id}: center x left map bounds`);
    assert.ok(cell.center.z >= -limit && cell.center.z <= limit, `${name}/${cell.id}: center z left map bounds`);
    for (const point of cell.vertices) {
      assert.ok(point.x >= -limit - 1e-9 && point.x <= limit + 1e-9, `${name}/${cell.id}: x left map bounds`);
      assert.ok(point.z >= -limit - 1e-9 && point.z <= limit + 1e-9, `${name}/${cell.id}: z left map bounds`);
      assert.ok(
        Math.hypot(point.x - cell.center.x, point.z - cell.center.z) <= cell.radius + 1e-8,
        `${name}/${cell.id}: vertex left its radius cap`,
      );
    }
  }
  for (let firstIndex = 0; firstIndex < layout.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < layout.length; secondIndex += 1) {
      const overlap = clipConvexPolygon(layout[firstIndex].vertices, layout[secondIndex].vertices);
      assert.ok(
        polygonArea(overlap) <= 1e-7,
        `${name}: ${layout[firstIndex].id} and ${layout[secondIndex].id} overlap by ${polygonArea(overlap)}`,
      );
    }
  }
}

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Wildgrid Sovereignty experience", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Wildgrid: Sovereignty — Autonomous Civilization Observatory<\/title>/i);
  assert.match(html, /Watch ten autonomous founders build camps, create lineages, advance technology, fracture, ally, and fight for power/i);
  assert.match(html, /sovereignty-experience/i);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("server-renders the map-free World Archive", async () => {
  const response = await render("/archive");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>World Archive \| Wildgrid: Sovereignty<\/title>/i);
  assert.match(html, /Opening the living chronicle/i);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("server-renders the map-free 200-day history book", async () => {
  const response = await render("/history");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>The Living History \| Wildgrid: Sovereignty<\/title>/i);
  assert.match(html, /Opening the annals/i);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("lays out deterministic, map-contained, mutually exclusive political territories", () => {
  const weightedPair = layoutExclusiveTerritories([
    { id: "small", position: { x: 0, z: 0 }, radius: 10 },
    { id: "large", position: { x: 12, z: 0 }, radius: 20 },
  ], { halfSize: 40 });
  assert.equal(layoutExclusiveTerritories([
    { id: "solo", position: { x: 0, z: 0 }, radius: 5 },
  ], { halfSize: 40 })[0].vertices.length, 56, "default territory outline should use 56 sides");
  assert.ok(Math.max(...weightedPair.find((cell) => cell.id === "small").vertices.map((point) => point.x)) <= 4 + 1e-9);
  assert.ok(Math.min(...weightedPair.find((cell) => cell.id === "large").vertices.map((point) => point.x)) >= 4 - 1e-9);

  assertExclusiveTerritoryFixture("dense 48-camp claims", Array.from({ length: 48 }, (_, index) => ({
    id: `camp-${String(index).padStart(2, "0")}`,
    position: {
      x: (index % 8 - 3.5) * 2.5 + Math.sin(index * 1.7) * 0.3,
      z: (Math.floor(index / 8) - 2.5) * 2.5 + Math.cos(index * 1.3) * 0.3,
    },
    radius: 10 + index % 6,
  })), { halfSize: 24, edgeInset: 1.4 });

  assertExclusiveTerritoryFixture("edge-clipped claims", [
    { id: "north", position: { x: 2, z: 40 }, radius: 18 },
    { id: "east", position: { x: 39, z: 3 }, radius: 16 },
    { id: "southwest", position: { x: -38, z: -36 }, radius: 20 },
    { id: "center", position: { x: 0, z: 0 }, radius: 34 },
  ], { halfSize: 32, edgeInset: 1.4, segments: 64 });

  assertExclusiveTerritoryFixture("coincident claims", [
    { id: "same-c", position: { x: 4, z: -3 }, radius: 14 },
    { id: "same-a", position: { x: 4, z: -3 }, radius: 14 },
    { id: "same-d", position: { x: 4, z: -3 }, radius: 9 },
    { id: "same-b", position: { x: 4, z: -3 }, radius: 18 },
  ], { halfSize: 30, edgeInset: 1.4, segments: 48 });
});

test("ships the civilization engine, persistent route, and Three.js world", async () => {
  const [page, experience, archivePage, archive, historyPage, historyBook, styles, engine, scene, territoryLayout, route, hosting, packageJson, resetMigration] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/sovereignty-experience.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/archive/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/civilization-archive.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/history/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/history-book.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/simulation/civilization-engine.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/simulation/civilization-scene.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/simulation/territory-layout.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/world/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0001_reset_world_history.sql", import.meta.url), "utf8"),
  ]);

  assert.match(page, /SovereigntyExperience/);
  assert.match(experience, /createCivilizationScene|simulateCivilization|Sovereign roster|World chronicle/i);
  assert.match(experience, /Beliefs|emergent worldview|beliefRanking/i);
  assert.match(experience, /MAP_OVERLAY_OPTIONS|Choose a map overlay|Map layers/i);
  assert.match(experience, /getRankedInfluentialAgents|sov-influence-card|INFLUENCE/i);
  assert.match(experience, /Explore family tree|CURRENT THINKING|Recent outcome memory/i);
  assert.match(experience, /Explore map|Drag to orbit|Pinch to zoom/i);
  assert.match(experience, /href="\/archive"|World archive/i);
  assert.match(experience, /href="\/history"|History book/i);
  assert.match(archivePage, /CivilizationArchive|World Archive \| Wildgrid: Sovereignty/i);
  assert.match(archive, /Every power leaves a record|Powers, living and fallen|Biggest moments/i);
  assert.match(archive, /TENET_VALUES|Core values|founderAgentId|originCampId|foundedDay/i);
  assert.match(archive, /\/api\/world\?view=archive|archiveHighlights|beliefIds|campIds/i);
  assert.match(archive, /Return to the live world map|breakaway from an archived power/i);
  assert.doesNotMatch(archive, /civilization-scene|createCivilizationScene|three/i);
  assert.match(archive, /href="\/history"|Read the history/i);
  assert.match(archive, /agent_renamed:\s*5|camp_renamed:\s*7/i);
  assert.match(historyPage, /HistoryBook|The Living History \| Wildgrid: Sovereignty/i);
  assert.match(historyBook, /chapterLengthDays|Every 200 days|Table of contents|The defining record/i);
  assert.match(historyBook, /Advancements|Powers in motion|Belief and public life|The changing names/i);
  assert.match(historyBook, /\/api\/world\?view=history|historyIndex|topMoments|humanImpact|typeCounts/i);
  assert.doesNotMatch(historyBook, /civilization-scene|createCivilizationScene|normalizeCivilizationWorld|validateCivilizationWorld|simulation\/civilization-engine|three/i);
  assert.match(styles, /\.archive-page|\.archive-civ-layout|\.archive-core-values/i);
  assert.match(styles, /\.history-page|\.history-shelf|\.history-chapter|\.history-record-list/i);
  assert.match(engine, /createCivilizationWorld|catchUpCivilization|breakaway|defection|tech_unlocked|reproduce/i);
  assert.match(engine, /belief_founded|belief_schism|free_conscience|MAX_ACTIVE_CAMPS\s*=\s*48/i);
  assert.match(engine, /agent_renamed|camp_renamed|uniqueAgentName|uniqueCampName/i);
  assert.match(engine, /getAgentFamilyTree|getRankedInfluentialAgents|reflectOnPreviousPlan|planLearning|recentMemories/i);
  assert.match(scene, /WebGLRenderer|OrbitControls|Raycaster|followCamp/);
  assert.match(scene, /VisualBelief|sacredSite|beliefHalo/i);
  assert.match(scene, /MapOverlayMode|abundanceRing|influenceFill/i);
  assert.match(scene, /layoutExclusiveTerritories|LineLoop|applyTerritoryGeometry/i);
  assert.match(scene, /TOUCH\.ROTATE|TOUCH\.DOLLY_PAN|handlePointerDownCapture/i);
  assert.match(territoryLayout, /weighted Voronoi|clipToHalfPlane|coincidentPairDirection/i);
  assert.match(experience, /exclusive claims|shared political edges|Claim radius|map units/i);
  assert.match(route, /catchUpCivilization|civilization_events|no-store|migrat/i);
  assert.match(route, /view.*archive|archiveHighlights|ROW_NUMBER|json_each/i);
  assert.match(route, /view.*history|historyBook|historyIndex|HISTORY_BOOK_CHAPTER_DAYS\s*=\s*200/i);
  assert.match(route, /WORLD_SEED\s*=\s*"wildgrid-sovereignty-era-2"/i);
  assert.match(resetMigration, /DELETE FROM `civilization_events` WHERE `world_id` = 'canonical'/i);
  assert.match(resetMigration, /DELETE FROM `civilization_world` WHERE `id` = 'canonical'/i);
  assert.match(hosting, /"d1"\s*:\s*"DB"/i);
  assert.match(packageJson, /"three"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await access(new URL("../public/og.png", import.meta.url));
  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)));
});
