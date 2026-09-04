import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

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

test("ships the civilization engine, persistent route, and Three.js world", async () => {
  const [page, experience, archivePage, archive, styles, engine, scene, route, hosting, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/sovereignty-experience.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/archive/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/civilization-archive.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/simulation/civilization-engine.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/simulation/civilization-scene.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/world/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /SovereigntyExperience/);
  assert.match(experience, /createCivilizationScene|simulateCivilization|Sovereign roster|World chronicle/i);
  assert.match(experience, /Beliefs|emergent worldview|beliefRanking/i);
  assert.match(experience, /MAP_OVERLAY_OPTIONS|Choose a map overlay|Map layers/i);
  assert.match(experience, /getRankedInfluentialAgents|sov-influence-card|INFLUENCE/i);
  assert.match(experience, /Explore family tree|CURRENT THINKING|Recent outcome memory/i);
  assert.match(experience, /Explore map|Drag to orbit|Pinch to zoom/i);
  assert.match(experience, /href="\/archive"|World archive/i);
  assert.match(archivePage, /CivilizationArchive|World Archive \| Wildgrid: Sovereignty/i);
  assert.match(archive, /Every power leaves a record|Powers, living and fallen|Biggest moments/i);
  assert.match(archive, /TENET_VALUES|Core values|founderAgentId|originCampId|foundedDay/i);
  assert.match(archive, /\/api\/world\?view=archive|archiveHighlights|beliefIds|campIds/i);
  assert.match(archive, /Return to the live world map|breakaway from an archived power/i);
  assert.doesNotMatch(archive, /civilization-scene|createCivilizationScene|three/i);
  assert.match(styles, /\.archive-page|\.archive-civ-layout|\.archive-core-values/i);
  assert.match(engine, /createCivilizationWorld|catchUpCivilization|breakaway|defection|tech_unlocked|reproduce/i);
  assert.match(engine, /belief_founded|belief_schism|free_conscience|MAX_ACTIVE_CAMPS\s*=\s*48/i);
  assert.match(engine, /getAgentFamilyTree|getRankedInfluentialAgents|reflectOnPreviousPlan|planLearning|recentMemories/i);
  assert.match(scene, /WebGLRenderer|OrbitControls|Raycaster|followCamp/);
  assert.match(scene, /VisualBelief|sacredSite|beliefHalo/i);
  assert.match(scene, /MapOverlayMode|abundanceRing|influenceFill/i);
  assert.match(scene, /TOUCH\.ROTATE|TOUCH\.DOLLY_PAN|handlePointerDownCapture/i);
  assert.match(route, /catchUpCivilization|civilization_events|no-store|migrat/i);
  assert.match(route, /view.*archive|archiveHighlights|ROW_NUMBER|json_each/i);
  assert.match(hosting, /"d1"\s*:\s*"DB"/i);
  assert.match(packageJson, /"three"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await access(new URL("../public/og.png", import.meta.url));
  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)));
});
