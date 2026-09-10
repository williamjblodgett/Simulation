# Survival recovery update — 2026-09-10

This implements the corrections from the live-site survival diagnosis. It does
not give the observer control over survival actions, reset an existing study,
grant resources, resurrect agents, or introduce API/model calls.

## What changed

- The private planner retains distinct goal/progress branches so a move can be
  evaluated together with collection and consumption. Its deterministic budget is
  seven search levels, eighteen retained states, and 1,800 expansions.
- Need forecasts use the shared physiological model to reconsider plans that
  cannot deliver timely relief. A request is uncertain, not carried inventory.
- Agents retain their own route waypoints and blocked contacts. Bounded A*
  routing can backtrack around observed components; unknown geometry is not
  revealed to the policy. Execution still checks real collisions.
- Freshwater collection accepts reachable dry banks around the observed pond,
  rather than one arbitrary shoreline point. Crossing never counts as drinking.
  An obstructed dry destination must still resolve to a dry approach; an agent
  cannot repeatedly "arrive" underwater while unable to consume carried water.
- Request expectations are learned for each partner/resource pair. Refusal
  cannot complete a transfer or obligate another agent to donate.
- Remembered passive protection uses one revision-aware estimate. Route forecasts
  account for observed detours and water costs. These remain estimates, not
  omniscient predictions of future weather, stock, or other agents.
- Construction cannot create a component through another living agent. A legacy
  invalid body overlap can be exited continuously, without permission to move
  deeper into or through a solid component.
  Work-site planning and movement share one arrival radius, so completing travel
  permits the next physical operation instead of another already-completed move.
- The shared inspector and death events show factual death reviews. Hourly needs,
  confirmed meals/drinks, blocked movements, refused requests, and recent failures
  are bounded observer records, excluded from policy inputs. Older lives explicitly
  say measurements are unavailable. Final plans and retained observations are
  evidence, not claims about hidden thoughts.
- Timeline can group repeated failures while preserving exact records and
  exports. History options keep secondary controls out of the mobile event feed.
- The runtime and worker bridge share a one-tick batch limit. Returning to a
  background tab cannot combine up to 24 expensive planning ticks into one
  request. This changes delivery cadence, not deterministic decisions or elapsed
  modeled time; the runtime only deducts the work it actually requested.

## Saved studies

Active policy-2/3 studies adopt survival revision 1 on their next advancing tick,
with an audit event. Policy 1 remains frozen. Paused and ended studies do not
silently advance, and old deaths are not changed.

Checkpoint format 4 prevents older clients from writing earlier behavior over the
updated run. Last-good backups are fenced too: a pre-adoption backup gains only
the format marker, not fabricated decisions, measurements, or an adoption event.
If restored, it adopts the rules when it next advances. Refresh all open tabs.

## Reproduced scenarios

The baseline was the prior diagnostic audit of source revision
`0482637b9bffeee1db693d17b18d26b9fb7d40eb`. Both sets use three original agents,
balanced resources, variable climate, 72 modeled hours, and no succession or
observer interventions.

| Seed | Prior survivors | Updated survivors | Updated blocked moves |
| --- | ---: | ---: | ---: |
| construction-review-1 | 2/3 | 3/3 | 0 |
| survival-audit-1 | 2/3 | 3/3 | 2 |
| survival-audit-2 | 2/3 | 3/3 | 1 |
| survival-audit-3 | 0/3 | 3/3 | 6 |
| Total | 6/12 | 12/12 | 9 |

The original failures were dehydration, not old age. These development scenarios
are regression checks, not an unbiased estimate of survival in all environments.
Raw results: [development measurements](survival-recovery-development.json).

The reproducible additional-seed suite is `npm run benchmark:recovery -- --holdout`:
one, three, and five agents in balanced/variable, scarce/variable, and
balanced/harsh environments. These seeds were initially separate from development.
The first additional run exposed the obstructed-bank bug above, which was fixed
and added to the regression suite. Results below are therefore additional-seed
regression validation, not a fresh unbiased holdout or a guarantee of survival.
An explicitly waterless/foodless regression fixture still ends in genuine death.

| Additional seed | Environment | 1 agent | 3 agents | 5 agents |
| --- | --- | ---: | ---: | ---: |
| recovery-holdout-coast-91 | Balanced / variable | 1/1 | 3/3 | 5/5 |
| recovery-holdout-valley-57 | Scarce / variable | 1/1 | 3/3 | 5/5 |
| recovery-holdout-basin-83 | Balanced / harsh | 1/1 | 3/3 | 5/5 |

That is **27 of 27 surviving** across nine additional 72-hour runs. In the first
pass, A5 died from dehydration at 64h 40m in the five-agent scarce-resource run
despite carrying water. Its new death review exposed an underwater approach to an
obstructed dry destination, followed by a work-site arrival-distance mismatch.
Both now have targeted regressions. All thirteen final benchmark checkpoints
validate; no agent was revived or supplied by an observer. These finite tests are
not a guarantee of survival in other environments.
Raw results: [additional-seed measurements](survival-recovery-holdout.json).

## Verification notes

The implementation uses the existing Vinext/React/Three.js app, Pages build,
simulation worker, IndexedDB transactions, and single-writer ownership mechanism.
The test suite covers private knowledge isolation, complete plans, backtracking,
bank access, occupied construction, refusal, physiology forecasts, bounded
measurements, permanent death, save migration, recovery fences, and raw event
preservation. Existing research, succession, rendering, and older-study tests
remain part of the suite.

The full `npm test` run passed 156 tests, including the shoreline, work-site,
measurement, and saved-backup regressions. It includes `npm run build`,
`npm run typecheck:pages`, and `npm run build:pages`. ESLint also passed.
After final documentation and legacy-import guards, both builds and affected
rendered-page, recovery, and persistence checks were rerun separately.
The final one-tick runtime/bridge safeguard passed its worker regression; the
last focused rendered-page, worker, and persistence run passed all 18 tests.

Browser checks use the Codex in-app Chromium browser on Windows and the local
Pages-compatible development server at `http://127.0.0.1:4186/Simulation/`.
World was visually checked at 390×844, 430×932, 844×390 landscape, and 1440×900;
the expanded inspector and Timeline were also checked at 375×667. The canvas was
nonblank. Pause held the time at 06:50 while World → Agents → Timeline → World
preserved A2 selection and its 96% health / 78% hydration / 87% energy values.
Header and Run speed controls agreed, and playback resumed. The three-agent
browser reproduction reached 40h 30m with all three alive. History grouping can
be toggled, agent/category filters work, and loading older events recovered all
578 records of the prior diagnostic study. Legacy death review correctly avoids
inventing missing measurements. No warnings or errors were reported by the
browser console during these checks.
The final compiled Pages build restored the same five-agent scarce-resource
study at its paused 64-hour checkpoint, including the configured speed. About
and back navigation preserved that study; both app editions now explain the
survival corrections and the limits of autonomy. Its compiled entry is
`index-B6SQS-xD.js`, with worker `survival-simulation.worker-Dl_Mvxw2.js`.
That five-agent browser study (`recovery-holdout-valley-57`, scarce/variable,
continuity disabled) then completed 72 hours with all five alive: 943 decisions,
64 experiments, 21 physical parts, and zero deaths. The completion screen
correctly disabled playback and additions. The final World screenshot shows all
five identities; the earlier death-review screenshot is preserved as diagnostic
evidence of the pre-fix failure, not the outcome of this corrected study.
The compiled Timeline grouping toggle and pagination also worked (512 to 768
loaded records without losing the 2,331-record total). A one-agent setup selection
was checked at 375×667 and canceled without starting a new study; its controls
remained above bottom navigation, with no horizontal page overflow. Archived
studies remained listed without being resumed. Single-agent survival runs were
tested headlessly, not as a separate full browser run.
The public site's saved run was not operated or reset. Phone viewport emulation
does not establish mobile Safari compatibility or real-device frame rates.

The Sites build helper was attempted but its Windows npm shim resolved an invalid
path. The repository's normal build commands are the fallback; no plugin or
framework replacement was introduced.

## Remaining limits

Agents are bounded, deterministic local planners with learned estimates, not
general-purpose language-model agents. They can still make bad decisions and die.
Knowledge can be stale, resources contested, and the simplified physics and
planning horizon are incomplete. Swimming, protection, and construction are
modeled approximations, not real fluid or structural engineering.

CPU step times in the JSON reports include concurrent desktop verification work.
They are not rendering frame times or reliable device-performance benchmarks.
Long or congested studies can run below requested playback speed; policy search
remains in the worker so the interface can continue rendering.

Publication to the existing GitHub Pages site was explicitly approved on
2026-09-10. The release uses the compiled asset identifiers above; deployment
success must be checked separately before describing the update as live.
