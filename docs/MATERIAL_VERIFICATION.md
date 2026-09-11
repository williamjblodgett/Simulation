# Raw-material implementation verification

Baseline: `42f14274a7c0d4bbfb7ed9c195f780ff8ca277e7`. The initial working tree was
clean. Repository/nested `AGENTS.md` searches found no instructions files. Existing
engine, physical validation, policy boundary, persistence, tests and discovery
reports were inspected before this extension. No new framework or dependency.

## Changed responsibilities

- `app/simulation/survival/geology.ts`: bounded initial deposits, raw feedstock
  vocabulary, proportional partition/merge, observer holdings and cross-ledger
  conservation validation.
- `types.ts`, `physical-types.ts`, `engine.ts`: opt-in geological schema/config,
  local observations, confirmed collection and new-agent/restore compatibility.
- `physical-world.ts`: raw provenance through existing primitive execution;
  no new operation, metal property or technology bonus.
- `discovery-boundary.ts`, `discovery-validation.ts`: explicitly allow local
  appearance, exclude observer chemical identities and accept format 6. The
  planner, motivation, learned models and operation capabilities are unchanged.
- `app/survival/material-record.tsx`, `run-view.tsx`, `agent-inspector.tsx`,
  `survival-experience.module.css`: collapsed observer geology and carried-raw
  records, truthful setup copy, readable mobile rows.
- `use-survival-runtime.ts`, `survival-persistence.ts`: select the foundation only
  for newly created UI studies, preserve old studies, monotonic recovery fences.
- `tests/survival-geology.test.mjs`, `package.json`: 11 added tests in the normal
  suite. `scripts/benchmark-materials.mjs`, `scripts/report-materials.mjs` and
  material docs/JSON: predeclared natural comparisons and factual results.

## Commands and checks

The 11 focused tests cover complete dry endowment on 216 seed/size/abundance
combinations, private information isolation, confirmed local collection versus
failed reach, physical use/reclaim and destructive load tests, malformed ledgers,
fractional accounting, permanent death and non-inheritance, legacy round trips,
new admissions, IndexedDB compare-and-swap and archives, monotonic recovery,
batched deterministic replay and pause.

The first `npm.cmd test` passed **189/189** in 449.5 seconds on the shared host,
before the two additional fractional/death regressions were added. The fractional
unit test was reproduced failing (2.49 versus 2.494), then passed after the fix.
The final **`npm.cmd test` passed 191/191** in 463.5 seconds, including Vinext build,
Pages TypeScript checking, Pages production build and all original regression
files. `npm.cmd run lint` and `git diff --check` also passed.

All 13 final natural comparisons completed and validated: six paired 72-hour
development runs, six paired 72-hour untouched evaluation runs, and one 168-hour
development run. Every starting agent survived. Six preliminary development rows
from before the fractional fix are also retained, for 19 raw rows total. See
[MATERIAL_RESULTS.md](MATERIAL_RESULTS.md) for all costs, counters and limitations.

Sites build/storage guidance was used because the project has a hosting manifest.
Its required `build-site.mjs` helper was attempted and failed because its Windows
shim references missing `node_modules/npm/bin/npm-prefix.js` and `npm-cli.js`.
The normal installed npm scripts work. The repository's test command runs the
Vinext production build, Pages TypeScript check and Pages production build before
tests; direct `npm.cmd run build:pages` also passed after UI refinement.

Existing non-fatal warnings remain: Vite JSON import attributes/native-loader
notice, bundle chunks over 500 kB, and experimental Node SQLite in legacy tests.
No dependency was installed to hide these warnings.

## Actual browser inspection

Tested the rebuilt production Pages preview at
`http://127.0.0.1:4187/Simulation/` using the Codex in-app Chromium browser.
Viewport overrides: **390 × 844, 375 × 667, 1440 × 900**; reset afterward.
This is not mobile Safari/real-device verification or a new 60fps claim.

- The completed local pre-existing one-agent QA study remained completed at day
  4, 00:00 and displayed “preserved original endowment” after reload.
- A new local-only `materials-ui-five` study initialized five agents with the new
  foundation; the prior completed QA study was kept in the local archive. No live
  study was reset or resumed.
- The canvas was nonblank, all five agent identities appeared, and the reserve
  ledger displayed all 28 families with actual ground/carried/part amounts and
  an explicit unsupported-modern-technology explanation.
- The first mobile inspection found an inherited two-column `dl` rule compressing
  the new ledger. It was corrected to single-column rows, rebuilt, reloaded and
  visually rechecked. Both phone widths had no horizontal document overflow;
  bottom navigation remained visible.
- World → Run → Agents → A5 detail → Timeline → World retained pause at day 1,
  02:40, five lives and the selected A5. Its roster/detail values agreed: health
  94%, hydration 96%, energy 96%. The new nonempty carried-provenance subsection
  was not visually exercised because this early UI study had collected no ore;
  its underlying data flow is covered by executor/headless tests.
- Resume then pause advanced the real modeled clock to 05:10. The local QA study
  was left paused. Console warning/error inspection returned no entries in that
  tab. Network capture was not separately instrumented; visible scene assets
  loaded successfully.

Captures (workspace-relative, intentionally not shipped as application assets):
`outputs/materials/world-390.png`, `materials-390.png`, `materials-375.png`,
`world-1440.png`.

## Release and limitations

These changes are local and reviewable; no public deployment or user-study reset
was performed in this material-foundation task. Existing live studies retain their
resource model; merely loading a newer build will not add supplies to them.
The implementation supplies raw-stock provenance and feasible structural use,
**not the requested eventual modern industrial capability**. Refining, powered
mechanisms, electrical/chemical systems, process measurements and learned
manufacturing procedures remain future work. The smallest next implemented domain
should be a single conservation-tested material transformation, not more catalogs.

### Subsequent publication

The material foundation was subsequently included in the user-authorized woodland
UI release on September 11, 2026. The paragraph above records the earlier local
implementation task, not the current deployment status. The combined survival
source fingerprint still matches the final material comparison results:
`e830002912812baed427100bad526c26d7d89a8d347b2a2f9aababc90d584630`.
See [WOODLAND_RELEASE.md](WOODLAND_RELEASE.md#publication) for exact source/static
revisions, successful GitHub deployment, public file hashes and browser checks.
The observed public legacy study retained its original endowment and paused time.
