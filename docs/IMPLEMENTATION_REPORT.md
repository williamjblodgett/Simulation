# Simulation implementation and verification

September 9, 2026. Implementation following the Astra review of revision `dce7792`, including the final observer-interface refinement and verified GitHub Pages release.

## Physical construction update — September 9, 2026

Implemented policy 3/schema 3 for newly configured studies. Existing runs retain
their prior policy and saves. See [physical model](PHYSICAL_MODEL.md) for the action
language, material/support rules, private planner boundary and explicit limits.

- Agents propose, fund, interrupt, revise and abandon exposure-reduction projects;
  construct and edit property-bearing parts; test results; and retain fallible
  estimates and editable procedures. No named shelter recipe grants a bonus.
- Instanced Three.js parts and connections reflect the authoritative physical
  state. Geometry governs support, exposure protection and movement collisions.
- Agent records distinguish proposed targets, attempted operations, measured
  outcomes and reported evidence. Single-trial procedures are labeled unreplicated.
- New runs default to survival-only; continuity is separately configurable. Agent
  self-naming preserves immutable life IDs and stable A1–A5 visual identities.
- About explains the supplied goal, decision mechanism and limitations. Existing
  studies explicitly invite a new run rather than silently changing their rules.

### Verification performed

- Full `npm test`: **121/121 passed**, including 16 new physical-model tests,
  production build and Pages type check/build. `npm run lint` passed.
- A read-only reviewer compared policy-2 creation and 144-step replay with the
  previous committed implementation: byte-equivalent JSON. Existing autonomous,
  succession, persistence and worker regressions passed independently (35/35).
- The Sites build helper hit the existing Windows npm-shim resolution failure.
  The repository's normal build commands succeeded. Existing Vite native-import
  and large-chunk warnings remain; no real-device frame-rate claim is made.
- Browser QA used the Codex in-app Chromium surface on Windows, with actual
  viewports confirmed at 390×844, 375×667, 430×932, 844×390 and 1440×900. No
  horizontal page overflow was observed. This is not mobile Safari, native touch,
  accessibility enlargement or real-phone performance certification.
- Started a one-agent **local QA study**, observed the agent name itself, make a
  real part, measure ~30% modeled protection and retain both satisfied and
  abandoned projects. Captured actual World, setup, expanded record, Timeline and
  desktop/landscape screenshots inline in the task. No mock screenshot was used.
- Paused at day 1 07:20, added four agents, verified the five-agent cap, consistent
  meters/identity, and the unchanged clock. World → Agents → Timeline → Run →
  About → return preserved the study and selection. Filtered a real test event,
  opened details and framed its current location. The review found and fixed
  event-location navigation leaving the expanded sheet over the site.
- The inspected browser console returned no warnings/errors. Live production
  study data was not reset or altered for testing. No credential was used.

### Scope remaining

The delivered sandbox generalizes construction primitives and learning, but is
not the entirety of unrestricted invention: autonomous project proposals focus
on exposure. Arbitrary machines, articulated mechanisms, electrical systems,
full chemistry, assembly carrying and evolving new action verbs are not modeled.
No random-policy superiority or open-ended-intelligence benchmark is claimed.

### Published physical-model release

- Implementation source: `434f81c9769abcbad931ec4427ae88fc6b1e675e`.
- Pages revision: `2a292fb9ff0485f9c376e08414e60b17b3e56829`. All 16 copied
  artifacts matched the validated local build. Older hashed assets were retained.
- Both branches were pushed atomically without force. The host did not start its
  automatic build immediately, so the existing Pages build was explicitly
  requested. [Deployment 34427495501](https://github.com/williamjblodgett/Simulation/actions/runs/34427495501)
  completed successfully for that exact Pages revision.
- Public browser verification loaded `index-DPQuRBET.js`, matching the final
  artifact. Run shows the preserved-policy banner and the new setup includes
  survival-only / optional-continuity choices. World is nonblank. The public study
  stayed paused at day 1 03:10 with three agents; no public study was replaced or
  advanced. The final console inspection returned no warnings/errors.
- Final local reload preserved the physical QA study at day 1 07:20 with five
  agents. The event-location regression was rechecked: expanded → Timeline →
  Locate current site now returns to the World with `data-level="peek"`.
- Live: [Simulation](https://williamjblodgett.github.io/Simulation/).

## Next-generation update (subsequent to the observer release below)

- Add agent is available in Agents and Run whenever fewer than five agents are living, including before any death and after extinction. The command uses the existing locked, revision-checked checkpoint transaction; it preserves pause and refuses completed studies. An observer addition may expand an older run's smaller capacity to five, with the previous capacity recorded in its event.
- Policy-2 agents may fund a pre-death successor or sponsor a personally observed death. This deliberately adds optional continuity value beyond individual survival. The pure evaluator uses private evidence, needs, retained supplies and helpful social outcomes; immediate survival and six modeled hours of experience gate commitment. It may defer or decline.
- A plan escrows 0.5 food and 0.5 water once. The engine admits one fresh life per predecessor after death and only into a vacancy. Duplicate private requests receive an explicit admission receipt without payment. These receipts, not global entitlement state, inform later target selection. Duration completion wins over new funding and admission; newborn agents cannot act on their birth tick.
- IDs and all old lives remain immutable. Lineage links predecessor, sponsor and successor; slot entry number is distinct from generation. No memories, roles, research or personality are copied. This is an abstract admission model, not biological reproduction or a claim of general intelligence.
- Existing policy-2 saves enable the additive rules on their next advancing tick with a recorded rules event. Policy-1 autonomous advancement remains frozen; observer admission is intentionally expanded for both policies. Old checkpoints and the earlier planet study are preserved.
- A browser check found older open tabs could retain advancement authority. Schema 2 now fences policy-2 saves against pre-succession clients. Loading the new UI commits this version-only migration under the existing lock without advancing time; older clients reject the unsupported version instead of saving old-rule output. Refresh older tabs after updating. The previous checkpoint is retained by the existing last-good-save transaction.
- The new focused regression suite covers funding and refusal, last-agent death, conflicting sponsors, capacity deferral, shared/uncertain evidence, duration, save migration, batch replay, timeline eviction and malformed lineage/escrow. Review caught and fixed low-confidence death targeting and original-age versus receipt-age validation for shared evidence.
- Prior benchmark numbers below predate this feature. No survival-performance improvement is claimed. Infinite-duration life archives still grow despite the five-living-agent cap.

### Verification of this update

- `npm test`: **105 tests passed**, zero failures, including both production builds and Pages TypeScript. `npm run lint` and `git diff --check` passed. A focused 22-test succession/persistence run also passed. Credential-pattern scanning of application, Pages source, tests and documentation returned no matches.
- In the Chromium-based in-app browser, added A2–A5 to an existing one-agent paused study using both Agents and Run. Day 3 00:50, A1's state and the existing history were retained; each addition was recorded once and the sixth admission was disabled. World rendered all five markers and matching portraits. Selecting A5, expanding its shared inspector, filtering its Timeline entry, visiting About and returning retained the selected life and paused clock. Reload preserved the five-agent checkpoint (selection itself defaults to A1 on a full reload).
- Captured actual viewport screenshots of mobile Agents/World/expanded inspector/filtered Timeline at 390×844; Agents at 375×667; Run at 430×932; landscape World at 844×390; desktop World/inspector and setup at 1440×900. Checked page overflow at the inspected dimensions. The new controls remain above reachable navigation. This is desktop Chromium viewport testing, not real-device/Safari/touch/performance certification.
- After the schema fence, resumed the existing study and observed actual deferred successor decisions, then normal completion at day 4 00:00. No funded birth occurred in that browser run; funded births, lineage, capacity waits and escrow transfers are covered by deterministic engine tests, not claimed as browser-observed. Completed studies correctly disable admission and playback.
- Confirmed an old open tab could no longer resume its stale checkpoint after migration; refreshing loaded the current saved study. Recovery regression covers both a newly fenced backup and a pre-update backup. Backup fencing preserves the prior world values while raising its supported reader version. An old UI may call the new format “invalid”; refresh rather than using old recovery controls.
- The inspected current-client console had no warnings or errors. Existing build warnings remain for the ~941 kB initial Pages chunk, Vinext plugin timings and the future Vite native-config import-attribute requirement. This update does not remove those prior limitations.

### Published next-generation release

- Source: `0730c72`; Pages branch: `98c0fcca813cf9890c4acb80e26c4763964bcd0e`. Pushed together, without force. All 16 copied build artifacts matched the local build hashes; older hashed assets remain available for cached clients.
- [Pages deployment 34422825488](https://github.com/williamjblodgett/Simulation/actions/runs/34422825488) completed successfully. Live URL: [Simulation](https://williamjblodgett.github.io/Simulation/).
- Public verification loaded `index-CZMqY2a-.js` and `index-CGYHxiuy.css`, matching the final build. The live Agents screen offers Add agent at 3 of 5 living. Run → About → World works, the actual Three.js scene is nonblank, and the inspector includes Next generation. The public study remained paused at day 1 03:10 with three agents; no public agent was added or study reset for QA. The current public console returned no warnings/errors. The browser was left on Agents with the new control available.

## Previous observer release (historical verification)

- Live: [Simulation](https://williamjblodgett.github.io/Simulation/).
- Implementation source: `35358a7`; published static branch: `a29376624ca26a1c28367f507fcd512fe7f02540`. Both branches were pushed together without force.
- [GitHub Pages deployment 34406090933](https://github.com/williamjblodgett/Simulation/actions/runs/34406090933) completed successfully.
- Public browser verification loaded title `Simulation · Autonomous Survival Study`, script `index-DMjjgqHZ.js` and stylesheet `index-f_rSnhr-.css`, matching the built artifacts. Every copied deployment file was hash-compared with the local Pages build before publication.
- The public page was visually inspected at 1280 × 720 and 390 × 844. It rendered the actual 3D habitat and matching portraits. World → Agents → Timeline → Run → About → World retained A2 selection and the paused day 1 03:10 checkpoint. The minimap control opened, and the inspected browser console had no warnings or errors. No public study was reset for release verification.
- Older static asset hashes were retained so already-open tabs are not broken by missing lazy-loaded files. Prior model routes and save namespaces are preserved. Existing policy-1 survival saves continue using their original engine; configure a new study to use policy 2 without deleting the archived study.

## Delivered

The observer release delivered a working no-API autonomy, continuity and observability upgrade, not every long-term research goal in the strategy. No model credential, remote inference or paid API call is required. At that release the only supplied terminal objective was **survive as long as possible**; the subsequent next-generation update above explicitly adds optional continuity. Observation duration remains an observer setting.

### Independent decisions and experiments

- New studies use policy 2. The original engine is frozen in `baseline-engine.ts`; existing policy-1 checkpoints retain that behavior instead of silently changing intelligence models.
- A pure bounded planner receives the individual agent's private observations, inventory, needs, experience, tick, seed and bounds—not global resource truth or other agents' private state. It composes primitive action sequences and compares several remembered sites, travel costs, falling needs, reserves and contextual yields. UI selection and camera state never enter this interface.
- Contextual learning retains yield, failure, recency, sample count and variation; delayed outcomes credit the attempted goal. Depleted remembered stock is debited within each predicted sequence, so one ration cannot be collected repeatedly in an imagined plan.
- Social proposals preserve the actual resource and amount. A donation request is evaluated against the responding agent's own needs and retained reserves; incoming sharing and cooperation use simpler consent heuristics. Refusal transfers nothing. Both sides retain outcomes, and shared observations retain their original age and provenance. An unavailable remembered partner is not treated as currently present.
- Seven bounded research domains now have deterministic parameterized material consequences, controls, failed/null results and replication requirements. Success no longer comes from retry luck. Unknown contamination or herbal activity cannot establish a valid test result; other domains also use disclosed authored dryness/integrity priors. Consuming or mixing stock invalidates unsupported sample measurements; an old dirty-water sample cannot be applied to newly received water.
- Decision records expose the chosen sequence, alternatives, cited evidence and linked results. Scores are disclosed as heuristic estimates, not survival probabilities or hidden human-like thoughts.
- The one-to-five limit and permanent death remain covered by regression tests. The sole-survivor companion decision is retained only in the frozen legacy engine; policy 2 now uses the explicit succession rules above.

### Continuity and retained evidence

- One shared runtime provider per tab sits above navigation in both app and Pages hosts. An observer-only selection provider preserves the selected life across About round trips and rejects stale selections after study replacement.
- A worker performs deterministic advancement. Responses are guarded against cancellation, stale callbacks, cloning failure and timeout. The worker is currently stateless between checkpoint requests; validation and persistence still cost main-thread time.
- IndexedDB atomically commits revisioned checkpoints and journal records under unique study identities. A localStorage lease selects the advancing tab. Web Locks serialize operations where supported, and IndexedDB revision checks reject stale commits. Storage failure does not grant leadership.
- Queued observer commands recheck their intended study after acquiring ownership and cannot accidentally pause, change or replace a different study that became active meanwhile.
- Previous studies remain listed with summaries and exportable; this is not a historical-study playback viewer. The ledger retains at most 100,000 events per study, with explicit retention metadata and a bounded, paginated view. This is device-local storage, not a cloud backup.
- History freezes a contiguous evidence window while reading. New events do not move the reader's scroll position; an explicit Return live action resumes the moving tail. Paging older events does not splice a gap into the live tail.
- Corrupt state fails closed. Explicit recovery preserves the bad checkpoint and restores a validated last-known-good copy. Existing localStorage data is retained during migration. Inaccessible legacy storage blocks initialization instead of being mistaken for an absent study. Invalid or unreadable checkpoints are not silently replaced with demo data or a new study.

### Observer interface and Three.js

- A restrained mobile observer shell uses stable blue/orange/green/violet/yellow identities, a 144px default peek, an explicit expand button, visible camera zoom and clearer Overview/Follow controls. Short landscape and tablet screens use a side inspector instead of reserving incorrect bottom space.
- Portraits are one-off captures of the exact same stylized Three.js character factory used in the habitat, rendered on the existing main renderer. No secondary portrait render loop, photographic stand-in, assigned role or invented equipment is introduced. East/west facing now agrees with engine headings.
- The habitat has seeded groves, layered tree crowns, more natural resource silhouettes, terrain-following water banks and restrained water highlights. Landscape continues to its natural shore beyond the bounded study area; it does not expand navigable engine bounds or create resource stock. Depleted resources disappear from the resource layer. A setup image is an explicitly labelled capture of the current habitat, not a fabricated preview of a future seed.
- Retained World / Agents / Timeline / Run, with a compact factual peek, expanded evidence, private-knowledge map, current/all-lives roster, event details, filters, export and saved studies.
- Timeline now uses visible mobile filter labels, compact day headings and full event expansion. Causal decision IDs connect records without claiming a historical replay.
- New run has a focused settings flow and a separate Start footer, so the primary action cannot overlap a climate field. Replacement still requires confirmation; the prior study is archived.
- Corrected hosting-aware About and prior-study links. Updated the plain-language method/limits page for local policy 2.
- Pausing stops action animation while leaving the observer camera usable. Blocked/awaiting states do not perform productive gestures. Reused visual slots reset when a different life enters them.
- Overview fits the living population to the actual viewport frustum; Follow offers a closer subject view. Agent labels remain screen-readable, scenery stays inside the terrain, water has terrain-following shore detail, and overview fog no longer washes out a dispersed population.
- Recorded-site focus persists across simulation updates and resize. Overview, Follow or manual camera movement clears it; manual movement keeps the selected agent. Renderer retries reapply state and camera focus.

## Checks actually run

### Automated

- `npm test`: **91 tests passed**, zero failures. This command includes the Vinext production build, Pages TypeScript check, Pages production build, and survival, runtime, persistence, worker, scene, earlier planet/civilization and codec tests.
- `npm run lint`: passed.
- Repeated focused tests cover private-knowledge isolation, fractional stock, deterministic save/batch replay, safe consent and exact transfers, causal research/replication, sample provenance, revision races, aborted transactions, corruption/recovery, ledger continuity/export, and worker cancellation/clone failures.
- `npm run benchmark:survival` and `npm run benchmark:survival -- --holdout`: paired headless evaluations; results below.
- A production-dependency audit returned zero known production vulnerabilities. Vite was updated from 8.0.13 to 8.2.2. Remaining development-toolchain advisories were not indiscriminately addressed through breaking dependency upgrades.
- Credential-pattern scanning of application, Pages source, documentation, scripts and tests found no embedded API-key matches.
- `git diff --check`: passed. GitHub branch preflight confirmed both local release branches fast-forward the remote branches, with no divergence.

The Sites build helper itself failed on Windows while resolving npm's CLI shim under the project. The normal PowerShell npm build commands succeeded; the helper failure is a tooling limitation, not a successful helper run. Build warnings remain for the roughly 932 kB initial Pages JavaScript chunk (256 kB gzip), Vinext plugin timing, and a future Vite native-config import-attribute requirement.

### Browser and visual inspection

Test environment: **Codex in-app Chromium on a Windows desktop**, using the built static Pages preview at `http://127.0.0.1:4186/Simulation/`. This is not mobile Safari or real-device performance testing. Browser actions used the actual UI rather than injecting simulation state.

| Viewport | Evidence inspected |
| --- | --- |
| 390 × 844 | World, one/three/five-agent cases, portrait rail, peek/half/expanded inspector, roster, event filters/details, Run/New run, About; repeated final refinement captures |
| 375 × 667 | World canvas bounds and reachable navigation, no horizontal page overflow |
| 430 × 932 | World composition and five-agent rail |
| 844 × 390 | Landscape world, side inspector and navigation |
| 1440 × 900 | Desktop world/right inspector and timeline |
| 667 × 375 | Requested late in verification, but the tool kept the actual page at 390 × 844; **not verified** |

The final visual pass additionally rechecked actual 390 × 844, 375 × 667, 430 × 932, 844 × 390, and 1440 × 900 viewports, plus 320 × 700 and the previously mismatched 700 × 530 landscape breakpoint. World was nonblank with no horizontal page overflow at those sizes. Five portraits fit at 320px, and the short-landscape canvas reached the navigation edge instead of leaving a false bottom reserve. This is not a claim that every screen and edge state was rechecked at every size. Actual viewport screenshots were captured inline during browser inspection, not saved as a fabricated screenshot gallery.

At 390 × 844 the new half/full inspector, roster, Timeline and setup were visually captured, with one-, three- and five-agent studies. A paused five-agent run survived reload at day 1 16:50. Zoom exited Follow while preserving A5; Follow restored subject framing. About returned to the same paused study and tab. A one-agent view remained legible at night. Final local preview console inspection returned no warnings or errors. The last copy-only adjustment corrected the singular "1 life" label.

Verified interactions:

- Nonblank canvas, recognizable selected agent, canvas-marker selection, portrait selection and Follow framing.
- Pointer drag exits Follow without selecting a different life. Overview clears a recorded-site view. Event-site framing remained fixed while the live clock advanced from day 2 at 11:20 to 14:50.
- Pause held the authoritative clock through screen changes. A live About round trip advanced the same study. Selected A3 survived a World → Run → About → World round trip.
- A second local tab's speed and pause/resume changes appeared in the first. Replacing five agents with a one-agent study in the second tab cleared the first tab's stale A5 selection. The peer was then closed and the remaining tab continued.
- A one-agent study reached its real 72-hour completion with one survivor. Completion disabled playback/speed and showed recorded decisions, experiments, discoveries and deaths; configuring another study remained available.
- Combined agent/category filters, raw/milestone toggle, expanded confirmed outcomes, current-site navigation, previous-study listing and export action. Export contents and cursor consistency are separately covered by unit tests; no claim is made that the browser-downloaded file was manually opened.
- Timeline scroll position remained at 844 px while new events arrived through completion; Return live explicitly adopted new records. Opening event details also held the evidence window.
- New-run replacement confirmation and cancellation, one/five-agent configuration, and lower settings scrolling above the separate Start footer.
- Final static-preview console inspection returned no warnings or errors.

Not certified: real touch/pinch, mobile Safari, reduced-motion and 200% text browser runs, real-device p95/FPS, exhaustive legacy-view interaction coverage, a complete network trace, or browser-injected WebGL loss/quota/crash faults. Several storage/worker failures were exercised through unit test doubles, which is different evidence from real-browser fault injection. A stale development/HMR preview was replaced with the reliable built preview for final QA.

## Paired survival evaluation

Each set uses four seeds × 1/3/5 starting agents: 12 scenarios, **36 original agents per policy**, scarce resources, harsh weather and 72 modeled hours. Maximum aggregate life is 2,592 agent-hours. Replacements do not inflate the result. All final checkpoints validated.

| Set / policy | Survivors | Agent-hours alive | Critical agent-ticks |
| --- | ---: | ---: | ---: |
| Development / original | 30 / 36 | 2,418.83 | 267 |
| Development / policy 2 | 34 / 36 | 2,561.33 | 64 |
| Development / policy 2, context learning cleared | 32 / 36 | 2,464.00 | 124 |
| Held-out set / original | 30 / 36 | 2,487.83 | 232 |
| Held-out set / policy 2 | 36 / 36 | 2,592.00 | 275 |
| Held-out set / policy 2, context learning cleared | 34 / 36 | 2,506.83 | 80 |

These small paired sets suggest a survival improvement, **not universal superiority or proof of general intelligence**. Policy 2's held-out critical exposure is worse despite more survivors. Critical duration is also affected by how long agents remain alive. The learning ablation removes contextual outcome learning, not the experiment notebook or all memory; original-vs-new is a whole-policy comparison, not a clean planning-only causal ablation.

The held-out set was rerun after independent remembered-stock and material-provenance correctness fixes. No policy weights were tuned against that set, but this final report must not call it a newly untouched holdout. A fresh preregistered test set is appropriate before making stronger performance claims. Recorded `shelter` failures include attempts that still reduce exposure; aggregate failure counts alone are not a fair efficiency comparison.

Exact seeds, thresholds, policy source fingerprints and per-scenario measurements are in `autonomy-development-results.json` and `autonomy-heldout-results.json`.

## Remaining strategy work

The delivered local agents choose and compose actions, learn some contextual consequences, independently accept/refuse proposals and run genuine bounded experiments. They are not fully general agents. Designers still supply physiology, action effects, perception, heuristic continuation values and material laws.

- Personal forward models remain partly authored. Learned reusable techniques/macros, a general procedure grammar, counteroffers, explicit proposal expiry and long-horizon technology procurement are not complete. Research is available but often does not occur in default zero-stock survival runs; no timer forces it to happen.
- Social consent with no new information has no free survival-need reward, but accepted interaction still increases a simple relationship score. Richer reliability inference and simultaneous contested-resource resolution remain future work; fixed execution order was preserved for compatibility.
- The seven implemented technology domains are not an open-ended technology invention system. Material measurements use normalized simulation proxies, not validated chemistry or biology.
- Add independent memory/planning/social-information ablations, prediction-error calibration, action-ordering challenges, longer studies and preregistered improvement thresholds. The current small benchmark does not satisfy every research-evaluation gate from the strategy.
- Profile weaker real devices; reduce the initial JavaScript chunk and checkpoint clone/serialization costs if measured as limiting. A worker does not continue once all tabs are closed.
- Finish the unverified accessibility/device/fault matrix above. Event history is not recorded-world replay; no fake scrubbing was added.

The checkout is runnable and prior planetary/civilization models and their separate data remain available. The release is on the existing `williamjblodgett/Simulation` repository: source on `main`, static output on `gh-pages`. Public-build verification is recorded above. This documentation-only follow-up does not change the deployed JavaScript.
