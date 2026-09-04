import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
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

test("ships the civilization engine, persistent route, and Three.js world", async () => {
  const [page, experience, engine, scene, route, hosting, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/sovereignty-experience.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/simulation/civilization-engine.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/simulation/civilization-scene.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/world/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /SovereigntyExperience/);
  assert.match(experience, /createCivilizationScene|simulateCivilization|Sovereign roster|World chronicle/i);
  assert.match(experience, /Beliefs|emergent worldview|beliefRanking/i);
  assert.match(engine, /createCivilizationWorld|catchUpCivilization|breakaway|defection|tech_unlocked|reproduce/i);
  assert.match(engine, /belief_founded|belief_schism|free_conscience|MAX_ACTIVE_CAMPS\s*=\s*48/i);
  assert.match(scene, /WebGLRenderer|OrbitControls|Raycaster|followCamp/);
  assert.match(scene, /VisualBelief|sacredSite|beliefHalo/i);
  assert.match(route, /catchUpCivilization|civilization_events|no-store|migrat/i);
  assert.match(hosting, /"d1"\s*:\s*"DB"/i);
  assert.match(packageJson, /"three"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await access(new URL("../public/og.png", import.meta.url));
  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)));
});
