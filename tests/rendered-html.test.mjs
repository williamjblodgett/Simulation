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

test("server-renders the Wildgrid experience", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Wildgrid — Autonomous Survival Observatory<\/title>/i);
  assert.match(html, /Watch autonomous agents explore, gather, cooperate, and survive/i);
  assert.match(html, /simulation-experience/i);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("ships the simulation engine and Three.js scene without starter artifacts", async () => {
  const [page, experience, engine, scene, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/simulation-experience.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/simulation/engine.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/simulation/scene.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /SimulationExperience/);
  assert.match(experience, /createWorldScene|simulateWorld|Switch|Agent roster/i);
  assert.match(engine, /createWorld|simulateWorld|gather_food|rescue|regeneration/i);
  assert.match(scene, /WebGLRenderer|OrbitControls|Raycaster/);
  assert.match(packageJson, /"three"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)));
});
