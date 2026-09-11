# Woodland observer and raw-material release

## Scope and implementation

Source baseline: `42f14274a7c0d4bbfb7ed9c195f780ff8ca277e7` on `main`.
The user's woodland/character reference was inspected as art direction, not used
as a background or a substitute for the interactive world. The existing React,
Three.js, worker, navigation and persistence infrastructure remains in place.
No dependencies, model calls, credentials, assigned roles or new motivation.

- `app/survival/scene/woodland-geometry.ts`: deterministic branching pine and
  broadleaf meshes, small alpha-masked leaf sprays, shrubs, ferns and fractured
  rocks. Repeated vegetation is instanced. Assets are authored geometry and
  procedural textures; no external asset download or licence is required.
- `terrain-world.ts`, `landscape-materials.ts`: restrained natural palette,
  ground grain and litter, mottled stone, bank stones and bowl-shaped freshwater
  beds. Water uses the existing physical footprint and depth. Decorative
  vegetation neither grants resources nor invents collision/support surfaces.
- `character-model.ts`: adult-proportioned articulated figures, folded jackets,
  collars, pockets, trousers, boots, hands and quieter face/hair detail. The
  existing identity palette and actual equipment remain authoritative. Static
  surfaces are batched by material. The same model supplies the portrait and
  world figure through the existing single renderer; no invented backpacks.
- `scene-models.ts`, `survival-habitat-scene.ts`: actual resource silhouettes and
  selected-first labels that avoid each other and measured observer controls.
  Label search is bounded to 15 alternatives; control rectangles refresh at most
  four times per second. Layout remains observer-only.
- `survival-experience.tsx`, `survival-experience.module.css`: field-journal
  typography, calmer charcoal surfaces, compact weather, consistent portrait
  selection, and reachable 44px zoom/camera controls on short phones. The shared
  inspector, bottom navigation, data labels and truthful playback are retained.
- `tests/survival-scene.test.mjs`: four additional scene regressions cover
  deterministic/finite geometry and alpha masks, resource/performance limits,
  body consistency and five co-located labels avoiding control rectangles.

The pending material-foundation work was preserved and included in this release.
Its engine/persistence file map, supplied rules, all measured outcomes and
limitations are in [MATERIAL_VERIFICATION.md](MATERIAL_VERIFICATION.md),
[MATERIAL_FOUNDATION.md](MATERIAL_FOUNDATION.md) and
[MATERIAL_RESULTS.md](MATERIAL_RESULTS.md). It adds 28 finite raw geological
families as conserved subsets of stone, not free refined metals. It does not
implement modern industry. Its previously completed 13 final headless comparisons
are retained, not described as newly rerun visual-update benchmarks.

## Checks actually executed

Windows desktop, installed Node 24 / npm 11. No repository or nested `AGENTS.md`
was found. The actual renderer, integration, tests and relevant documentation
were inspected before editing. The initial scene baseline passed 6/6.

- `npm.cmd test`: 194/194 in 439.0 seconds, then **195/195 in 444.0 seconds** after
  adding the label regression. This command includes the Vinext production
  build, Pages typecheck, Pages production build and the entire regression list,
  including survival, discovery, geological accounting, workers and persistence.
- After the final leaf-mask visual refinement: `npm.cmd run build`,
  `npm.cmd run build:pages`, `npm.cmd run typecheck:pages`, `npm.cmd run lint`,
  `node --import tsx --test tests/survival-scene.test.mjs` (**10/10**), and
  `node --import tsx --test tests/rendered-html.test.mjs` (**7/7**) all passed.
  The full 195-test suite was not repeated after that last visual-only mask edit.
- `git diff --check` passed. A filename-only source/doc/script/test scan found no
  project API credential matching the checked pattern. No key was introduced.

Initial new tests caught scenery exceeding the unchanged 1.3-million-triangle
budget and only three labels fitting at one position. The implementation was
corrected, not the acceptance limits. Visual inspection also caught distant
foliage disappearing under averaged alpha mipmaps; the final small-leaf mask
uses linear filtering with alpha-to-coverage and no averaged alpha mip chain.

The Sites build helper was attempted because the project has a hosting manifest.
Its existing Windows npm shim references missing `npm-prefix.js`/`npm-cli.js`;
the installed `npm.cmd` build commands above work. Existing non-fatal large-bundle,
loader/import-attribute and experimental SQLite warnings remain. No dependency or
type suppression was introduced to hide them. The existing GitHub Pages target
is retained; no separate Sites project or server-side study storage was created.

## Actual browser verification and captures

Used the production Pages preview at `http://127.0.0.1:4187/Simulation/` in the
Codex in-app **Chromium browser on Windows**. Actual CSS viewport dimensions were
read back: **390 x 844, 375 x 667, 430 x 932, 844 x 390, 1440 x 900**. No horizontal
document overflow in the inspected layouts. These are desktop browser viewport
tests, not mobile Safari or real-device measurements.

- Five-agent QA: resumed and paused the actual local simulation, then inspected
  World, all-agent roster, A1/A5 details, knowledge, Timeline filters, event
  details/location and Run. Switching tabs retained Day 1, 14:40, five living
  agents, pause and shared selection. A1 health/hydration/energy were 100/89/92;
  A5 100/87/85, matching the roster and inspector. Inventory was actual state.
- Setup 1/5/3 selections worked without replacing that study. Zoom/overview and
  framing A5 through "View in world" worked. The small-phone zoom controls are
  visible and the bottom navigation stays reachable. The canvas is nonblank and
  one active main canvas is present, not a screenshot or thumbnail render farm.
- A separate `localhost` QA origin tested real fresh initialization and confirmed
  replacement of its throwaway study with a one-agent run, retaining the previous
  QA checkpoint in its archive. At Day 1, 03:50 it showed one of one admitted lives.
  Adding an agent while paused changed it to two living agents without resetting
  the clock. No public/user study was replaced, advanced or given an extra agent.
- Browser warning/error logs inspected on the preview were empty. A separate
  network trace, real touch/pinch, larger text, reduced-motion preference,
  renderer-loss injection and Safari were not exercised in this pass.

Actual viewport captures, keeping the browser-supplied JPEG bytes:

- [World, five agents, 375px](screenshots/woodland/world-375.jpg)
- [World, one agent, 430px](screenshots/woodland/world-430.jpg)
- [World, landscape](screenshots/woodland/world-landscape.jpg)
- [World, desktop](screenshots/woodland/world-1440.jpg)
- [Expanded inspector](screenshots/woodland/inspector-390.jpg)
- [Roster](screenshots/woodland/agents-390.jpg)
- [Filtered Timeline](screenshots/woodland/timeline-390.jpg)
- [Run](screenshots/woodland/run-390.jpg)
- [New-run setup](screenshots/woodland/setup-390.jpg)
- [One-agent initialization result](screenshots/woodland/one-agent-390.jpg)

The final leaf-mask adjustment is visible in the 375px, 430px, landscape and
desktop World captures; earlier detail captures are retained as interaction
evidence. The screenshot tool may round its encoded height relative to the CSS
viewport. No phone bezel or OS chrome is part of the webpage.

## Measured cost and remaining limits

The deterministic maximum-density scene fixture had **1,268,464 unshadowed
triangles and 4,992 instances**. Construction took 108.9ms in the sampled Node
process; sampled process heap was 17.95MB, not isolated asset memory. The A1 body
has 26 draw meshes; all five bodies are tested at no more than 30 each.

Sampled existing two-second renderer counters at DPR 1: about 89-90fps / 316
calls / 2.154M shadow-inclusive triangles at 375px with five agents; 75fps / 88
calls / 2.042M triangles in one-agent landscape; 65fps / 88 calls / 2.042M on
desktop. These are short paused-world samples on a shared desktop, **not a
real-phone frame-rate guarantee or representative sustained benchmark**.
The main bundle is 1,036.53kB (287.62kB gzip); the size warning remains.

The world is a refined **stylized procedural habitat**, not the photorealistic
reference. There are no scan-quality meshes, authored skeletal GLB characters or
PBR texture packs. The study's physical ground remains flat; shoreline beds and
outside-study visual relief do not claim new navigation physics. The observer
cannot command agents, equip them or award inventions. Policy inputs, decisions
and clock remain independent of camera/UI/render rate.

New UI studies use policy 4 / schema 6 / geology version 1. Existing studies keep
their policy family and original resource model; reload does not add stock or
rewrite history/deaths. Public constructor defaults are unchanged. Archives,
exports, storage fencing, single-writer leases and optional continuity defaults
remain covered by tests. Browser-local execution stops when the browser cannot
execute; there is no cloud worker or off-browser advancement.

The smallest next presentation step is a measured mobile asset pass using
optimized character/vegetation assets with the same state and appearance mapping,
not extra terrain detail without a render budget. A separate next physical domain
would be a conservation-tested material transformation, not a promised modern
technology unlock.

## Publication

The user explicitly authorized publication to the existing GitHub Pages site.
Publication receipts and post-deployment observations are recorded here only
after the remote build and public verification complete.
