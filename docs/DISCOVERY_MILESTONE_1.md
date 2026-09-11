# Autonomous discovery — Milestone 1 implementation report

**Historical first implementation assessment.** The continuation corrected the
release-blocking recovery and approach bugs described here. See
[current release report](DISCOVERY_RELEASE.md), which supersedes this document's
release judgment. All original benchmark outcomes below are preserved.

Date: 2026-09-10. Baseline: `b1473b10596b2e7f252c40f0af94e95b473b06a2`.
These are local, uncommitted changes to the existing application. Nothing was
published, no credentials or external models were added, and no public study
was reset. The repository was clean at the initial audit; no `AGENTS.md` was found.

## Result and release judgment

The bounded protection/support vertical slice is implemented, including real
execution, private contextual learning, procedure transfer, persistence and
inspection. An end-to-end regression demonstrates that earned evidence changes
a later choice and that a learned procedure is executed again on new objects.
This is not unrestricted invention or a guarantee of improved survival.

**The survival-performance acceptance bar is not fully met.** In the declared
harsh exposure fixture, directed, frozen and random-testing policies died at
41 hours 50 minutes. The no-optional-test and fixed-construction baselines
survived 72 hours. This is a regression worth investigating before release or
expanding the domain. The paired runs do not, by themselves, identify a single
causal bug or prove that every death was preventable. No supplies, deaths,
success criteria or evaluation seeds were changed to make the result pass.

All 50 predeclared benchmark runs finished and all checkpoint validations passed.
All agents survived in the 15 natural development runs, 15 natural holdout runs,
four legacy-policy runs and the one 168-hour development run. Twelve of the
15 explicit-pressure runs retained their one agent. These are paired runs with
only three holdout environments, not independent samples for each agent or a
statistical demonstration of superiority.

## Audit and gap assessment

| Area | Before this work | Implemented here |
| --- | --- | --- |
| Runtime and observer | Working React/Three.js observer, local fixed-step worker, four views, archives, storage fencing | Reused; minimal record UI and new-study integration |
| Survival | Private observations, multi-step survival planner, interruptions, voluntary social actions, permanent death | Preserved and used as the competitor for optional work |
| Physical operations | Typed executors, finite materials, support, geometry, protection, damage, thermal/water tests | Reused; policy-4 typed/dead preflight and local measurement semantics |
| Physical planning | Policy-3 authored project patterns, scalar material estimates and counterfactual protection readings | Separate policy 4 with goals, sampled geometry, support prerequisites and contextual estimates |
| Experiments and procedures | Partial proposals, tests, procedures and provenance | Decision-relevant test comparison, pre-action predictions, original-evidence deduplication, actual-execution-only relative procedures |
| General technology discovery | Not implemented | Still not implemented; no roadmap stubs, periodic table, chemistry or machines |

The Sites instructions applied because `.openai/hosting.json` exists. They led
to checking the existing Vite/storage setup and trying its build helper, not
replacing the application. The explicit no-deployment instruction was preserved.

## What actually runs

Policy 4 receives a recursively allowlisted runtime snapshot. It does not receive
the world seed, other minds, observer death diagnostics, unobserved resource
sites or authoritative material coefficients. Its deterministic random stream is
derived from a separate constant and agent identity, not world generation.
The planner cannot call the physical evaluator to preview hypothetical results.

It projects deterioration from observed weather, current condition and remembered
protection. When exposure merits attention it records a survival goal, immutable
originating readings, evidence IDs, urgency, target, budget and stopping rules.
It compares ordinary survival chains, resting, moving to/reusing an observed
arrangement, local tests and bounded geometry proposals. Acquisition, navigation,
work, material debits and physiological delay precede forecast benefit. These
prices are approximations, not an exact prediction of the world executor.

A raised surface can create a prerequisite support goal. The composer can bind
an observed support or propose shaping and placing one, test a load, and then
place the surface. Geometry parameters are sampled; the goal is a protective
condition, not a named building. The generator remains specialized to this
domain. It is not a search over every possible primitive program.

Experiments are optional. A three-point private-model approximation asks whether
plausible low/mean/high readings would change the preferred plan. The comparison
includes other independent alternatives, not only resting. A below-baseline mean
can justify a cheap test. Unaffordable or decision-irrelevant tests are rejected;
a worthwhile arrangement can be attempted without an optional test and remains
unconfirmed. There is no novelty, experiment-count or construction-count reward.

Every primitive executes through the real world. Invalid typed requests and dead
actors are rejected before mutation. Realized failures still have defined effort
and damage consequences. Completed parts, material expenditure and elapsed work
survive interruption. A failed support test stops the proposed load; contradictory
protection causes reconsideration/abandonment, not a scripted rotation diagnosis.
An unchanged known-failed proposal is suppressed while its failure record remains
in bounded memory. Changed proposals or new observations can be reconsidered.

Support is measured by survival/damage at the applied load, not an exact breaking
strength. Protection is an explicitly supplied **local exposure measurement after
physical action**, including all nearby parts. It is not a part-removal
counterfactual or proof of one component's causal effect. Such counterfactuals
remain part of preserved policy-3 behavior and do not enter policy 4. Changed
weather/temperature is recorded as a confound; inconclusive readings are not
promoted to universal laws.

Small contextual residual tables retain sample counts, error moments, uncertainty
components and original evidence IDs. They correct fallible starting estimates
using similar observed contexts. Up to four neighboring cells contribute; remote
contexts revert toward the prior. Measurements are evidence, not calibrated
probabilities. Reported testimony retains the original observer and evidence ID;
repeating a report does not create a new trial. Existing consent-based transfer
and refusal behavior remains authoritative; a promise adds no inventory.

Only successfully executed, measured sequences can become procedures. They keep
symbolic object inputs, relative placement, prerequisites, resource/time/effort
estimates, observed conditions, uncertainty, failures and supporting evidence.
Single-trial candidates are distinguished from repeated evidence. Reuse binds
new objects and executes each primitive again; it grants no material, capability
or guaranteed outcome. Safe conditions can justify doing nothing further.

## Supplied priors versus learned quantities

**Authored:** survival objective and utility; senses and measurement capability;
physiology; primitive semantics; approximate collection yields, travel and work
costs; material density/striker feasibility; rough support/geometry/protection
relationships; temperature/weather context distances; parameter sampling;
uncertainty floors; test-value approximation and all search/budget limits.
For example, rough support resistance coefficients are wood 9, stone 24, fiber 3,
clay 7 in model units. These are private priors, not imported solver answers.

**Learned:** contextual corrections to expected protection and load-test outcome;
empirical variation, retained measurements and their provenance; failed proposals;
executed relative procedures and their supported contexts. Existing survival
learning and observed resource/navigation memories remain in use. Agents are
not blank minds. Optional continuity remains separately configured and off by
default; new lives do not inherit private evidence or procedures.

| Quantity or bound | Meaning |
| --- | --- |
| Tick | 10 modeled minutes, independent of frame rate |
| Needs / work energy | Existing normalized 0–100 physiology; manipulation effort is debited in those energy units |
| Protection | Local blocked-exposure fraction, 0–1 |
| Support prediction | Fallible 0–1 expectation of surviving the specified load; not calibrated probability |
| Load / material / geometry | Simplified model load units, material units and world length units; not newtons/kg/meters or full thermodynamics |
| Temperature / rotation | °C and radians |
| Goal limits | 8 goals, dependency depth 3; cycles and missing parents rejected |
| Optional work budget | 36 work ticks, 10 manipulation-energy units, 8 material units; 72 elapsed ticks to resume before abandonment |
| Search | 16 generated alternatives, 64 discovery admissions/expansions, 12 primitives; 8 geometry samples and up to 2 procedure proposals |
| Existing survival search | Depth 7, beam 18, at most 1,800 expansions; private route searches are separately bounded |
| Memory | 32 model cells, 96 evidence items, 24 experiments, 8 procedures, 16 decisions, 24 failure signatures per life |
| UI record | 8 decision-time alternatives with an explicit omitted count |

These bounds do not mean an entire open-ended world has constant size. Existing
life/object/event records and checkpoint copies still have a cost. Pruned raw
evidence is not reconstructed; references retain original IDs, and sufficiently
old testimony is conservatively ignored rather than recounted as new evidence.

## Traceable goal → test → changed choice → transfer

[Machine-readable trace](discovery-goal-trace.json), reproduced with
`node --import tsx scripts/trace-discovery.mjs`.

This is a declared **development fixture**, not a natural-run success claim. It
begins with one exposed life and nearby raw resources, zero constructed objects,
no added inventory and no supplied goal/hypothesis/model/procedure. At tick 36 a
second explicit environmental episode relocates the same life and raw sites,
damages its old parts and applies a cold period. Its inventory and learned state
are retained unchanged. These test interventions are not new observer controls.

| Tick | Recorded consequence |
| ---: | --- |
| 1 | Private exposure forecast produces a protection goal; ordinary survival wins the first comparison. |
| 24 | `discovery-decision-agent-1-4` selects `arrange-4` over recorded ordinary/other-geometry alternatives and forms the support dependency. |
| 32 | `event-41`, evidence `physical-reading-agent-1-32-2`: actual support test at 1.4754 load units. Pre-action expectation 0.6557 → no observed damage at that dose → next estimate 0.8278. |
| 35 | `event-51`, evidence `physical-reading-agent-1-35-4`: pre-action protection 0.3302 → actual local reading 0.421432 → next estimate about 0.376. Six executed primitives become single-trial procedure `discovery-procedure-agent-1-9`. |
| 60 | Current reproducible paired decision check on the same private state, priors, procedures and budget: learned contextual parameters choose procedure reuse; parameter-use-frozen chooses waiting. This check itself does not execute either alternative or modify the live fixture. The initial implementation's corresponding comparison was at tick 59. |
| 62 | The actual running policy chooses `reuse-discovery-procedure-agent-1-9`. |
| 70 / 73 | New objects receive paid load and protection tests (`event-87` / `event-97`); original evidence IDs end `70-6` / `73-8`. Local protection measures 0.421432. |
| 86 | Two supported trials, uncertainty 0.50 → 0.404; physical-work ledger 5.6 → 11.2 units. No primitive was skipped or supplied free. |

A separate cold-pressure demonstration preserves contradictory evidence and
abandoned goals. Isolated unit fixtures check load censoring, malformed actions,
support/reach, memory limits and transfers; they are not passed off as autonomous
end-to-end discoveries.

## Tests and benchmarks actually run

Environment: Windows desktop, PowerShell, Node 24.14.0, npm 11.9.0. Timings may
overlap other checks on the same host. [Predeclared protocol](DISCOVERY_EVALUATION.md)
and [all results, costs and performance rows](DISCOVERY_RESULTS.md) are retained.
The ten engine files listed in the benchmark share SHA-256 fingerprint
`74bf42cc7f494f0b75266e1535d36684452876f1c48b48387b2a0c533393a8af`.
No engine/policy change was made during that initial 50-run evaluation. The later
continuation has separate fingerprints, retained negative outcomes, and newly
predeclared evaluation seeds; see the current release report.

| Check | Actual outcome |
| --- | --- |
| Baseline six relevant survival test files, before edits | 90/90 passed, about 429 seconds |
| `npm.cmd test` | Passed: both builds, Pages typecheck and all configured test files; before final About/Timeline refinement and the additional dependency test |
| `node --import tsx --test tests/survival-discovery.test.mjs tests/survival-discovery-persistence.test.mjs` | 19/19 passed after the last fixture refinement, 19.36 seconds |
| `node --import tsx --test tests/rendered-html.test.mjs` after About refinement | 7/7 passed, about 5.6 seconds |
| `npm.cmd run lint` | Passed |
| `npm.cmd run typecheck:pages` | Passed |
| `npm.cmd run build` / `npm.cmd run build:pages` | Both passed; chunk-size warnings remain |
| Extra `node node_modules/typescript/bin/tsc --noEmit` | Failed on existing Cloudflare environment types: `cloudflare:workers` in `app/api/planet/planet-ai.ts` and `db/index.ts`; `Fetcher` and `D1Database` in `worker/index.ts` |
| Attempted `npm.cmd run typecheck` | No such repository script; corrected to the defined Pages script and the explicit root check above |
| Sites `build-site.mjs` helper | Failed because the bundled Windows npm shim referenced missing npm CLI files; repository build scripts succeeded instead |
| `git diff --check` | Passed; Windows line-ending warnings only |

Focused coverage includes runtime information isolation (including changing
hidden material strength and another mind), detached snapshots, actual paid
tests, atomic invalid requests, support/reach and remnants, parameter-frozen
learning, decision-relevant versus irrelevant tests, contradictory evidence,
actual learned procedure transfer, urgency without lost progress, abstention,
testimony deduplication, dependency cycles, permanent death, save/restore,
IndexedDB revision conflicts/archives and legacy fences. The worker unit bridge
uses a fake Worker; browser testing separately exercised the actual Worker.

Commands for the final benchmark matrix:

```text
node --import tsx scripts/benchmark-discovery.mjs
node --import tsx scripts/benchmark-discovery.mjs --pressure
node --import tsx scripts/benchmark-discovery.mjs --evaluation
node --import tsx scripts/benchmark-discovery.mjs --legacy
node --import tsx scripts/benchmark-discovery.mjs --long --mode=directed
node scripts/report-discovery.mjs
```

Directed tests did not establish a survival advantage. For example, the scarce
holdout had 5/5 survivors in every arm. Directed made 27 tests, used 33.8 physical
energy units and left 0.27 material units badly damaged; the no-test arm made zero
tests, used 33.0 energy and left 4.21 damaged. The fixed strategy also survived
with only 4.4 physical energy. Random had a lower selected-test RMSE than directed
in that run; different measurement distributions preclude a clean accuracy ranking.
Learned procedure transfer was demonstrated in the explicit two-episode fixture,
not observed as a routine outcome of these natural benchmark runs.

Known logger limitations are not hidden: early `gathered: 0` values are unavailable
quantity data, not zero gathering; policy-4 notebook zeros in legacy rows are
unavailable, not comparable performance. Corrected reporting uses shared physical
ledgers and confirmed drink/meal counts. Adaptation counts are reconsideration
proxies, not proof of useful changes. Earlier development outputs and the initial
configuration-forwarding mistake are listed separately in the results report.

### Computation and storage

The 168-hour one-agent study completed 1,008 steps in 43.3 seconds of shared-host
runtime, with p50/p95/max step times 31.1/109.1/236.6 ms, a peak sampled checkpoint
of 1,365,118 bytes, and process RSS about 368 MB. It survived without forced
additional invention. This is accelerated headless modeling, not advancement
while a user's browser is closed.

The five-agent directed scarce holdout took 148.2 seconds, with
p50/p95/max 234.6/1,224.9/2,436.1 ms and a 2,442,909-byte checkpoint. Random's
maximum step was 4,177.5 ms under shared load. These stalls deserve optimization;
no mobile FPS target is claimed. The existing bridge caps each request at one
step with a 15-second failure timeout and preserves the last saved checkpoint.
Recorded expansion totals include survival search and discovery admissions,
not every separately bounded pathfinding node or price recalculation.

The final Pages worker is about 200 kB; the main chunk is about 1,019 kB minified
(282 kB gzip). No dependency was added. Search/prediction work does not run from
render frames, but serialization and dense route comparisons remain expensive.

## UI and browser verification

The inspector now shows the current private goal, originating readings and
evidence, decision-time alternatives/rejections, uncertainty, experiments,
confirmed readings, changed estimates and procedure evidence. Exact records link
to Timeline. Long JSON is collapsed. Empty policy-3 project sections no longer
duplicate the new empty discovery record. Only actual physical state is rendered
as construction. About describes the supplied priors and the bounded claim.

Actual local production preview in the Codex in-app **Chromium browser on Windows**:
`http://127.0.0.1:4187/Simulation/`. This is a local preview, not a public release.
The preview command is:

```text
node node_modules/vite/bin/vite.js preview --config github-pages/vite.config.ts --host 127.0.0.1 --port 4187 --strictPort
```

Inspected viewport sizes: 390×844, 375×667, 430×932, 844×390 landscape and
1440×900. No horizontal document overflow was measured in those World views.
The canvas was nonblank; agents, freshwater and terrain rendered. Inspected
setup, roster, expanded inspector, linked Timeline records, Run and About.
Checked selection identity, needs across roster/inspector, pause/resume and 4×,
tab navigation/reload, browser Back from About, current-site location, completion
controls and archived-study visibility. Linking a tall event initially centered
its middle; the final refinement scrolls the feed to its heading and focuses it.

The isolated browser QA five-agent study (`discovery-dev-ui-five`) completed
72 hours with five survivors and no physical tests; abstention was displayed
honestly. A separate one-agent natural study (`discovery-dev-basin-1`) completed
with one survivor, one constructed part and two protection tests. Its Timeline
showed pre-action 0.31 → measured 0.38 → next estimate 0.34, with original ID
`physical-reading-agent-1-165-3`. Earlier local policy-3 and five-agent records
remained archived. No public-site study was touched.

No new production console errors appeared during these checks. Three earlier
Vite HMR import errors remained in the tab log from creating new modules during
development; restarting and inspecting the production build resolved that path.
This was not a full network audit, real-device touch test, Safari verification,
measured rendering-FPS test, font-scaling/reduced-motion audit or injected WebGL
context-loss test. Existing fallback paths were not redesigned.

Captures: [goal evidence](screenshots/discovery/goal-record-390.jpg),
[linked decision](screenshots/discovery/timeline-linked-390.jpg),
[linked measurement](screenshots/discovery/measurement-linked-430.jpg),
[one agent with its actual arrangement](screenshots/discovery/world-one-390.jpg),
[five-agent World](screenshots/discovery/world-five-390.jpg),
[375px World](screenshots/discovery/world-375.jpg),
[landscape](screenshots/discovery/world-landscape.jpg),
[desktop](screenshots/discovery/world-desktop.jpg),
[setup](screenshots/discovery/setup-390.jpg).

## Save compatibility and changed files

New UI studies use policy 4, schema 5, discovery revision 1. The constructor keeps
its existing default policy 2 unless explicitly configured. Saved policies 1–3
are not upgraded into discovery agents; their older sensing/behavior remains.
Schema-5 backup/recovery fencing can wrap preserved policy-2/3 data without
creating policy-4 minds or invented past measurements. CAS, single-writer lease,
archive pagination/export and corrupt-save refusal remain. No user's study was
reset, no death rewritten, and continuity's default was not changed.

| Files | Responsibility |
| --- | --- |
| `app/simulation/survival/discovery-types.ts`, `discovery-validation.ts` | Typed bounded records, dependency/state validation |
| `discovery-boundary.ts` | Runtime private-snapshot projection and separate RNG stream |
| `discovery-model.ts` | Contextual estimates, uncertainty, evidence deduplication, information value |
| `discovery-policy.ts`, `discovery-outcomes.ts` | Goals, alternatives, complete-plan pricing, actual outcomes, learned procedures |
| `engine.ts`, `planner.ts`, `types.ts` | Policy-4 integration, observation/action plumbing, precise work arrival, versioning |
| `physical-world.ts`, `physical-types.ts`, `physical-validation.ts` | Local readings and typed action safety, symbolic operands |
| `app/survival/survival-persistence.ts`, `use-survival-runtime.ts` | Schema fencing and explicit new-study default |
| `discovery-record.tsx`, `discovery-event-record.tsx`, `physical-record.tsx`, `agent-inspector.tsx`, `timeline-view.tsx`, `survival-experience.tsx`, `survival-experience.module.css` | Shared evidence inspection, record links, bounded mobile content |
| `run-view.tsx`, `agents-view.tsx`, `succession-record.tsx`, `survival-world.tsx` | Recognize new physical studies without altering observer authority |
| `app/about/page.tsx`, `github-pages/src/Router.tsx` | Accurate method explanation in both editions |
| `tests/survival-discovery.test.mjs`, `tests/survival-discovery-persistence.test.mjs` | Unit, integration, autonomous fixtures and persistence/worker coverage |
| `scripts/discovery-pressure-fixture.mjs`, `trace-discovery.mjs`, `benchmark-discovery.mjs`, `report-discovery.mjs` | Reproducible declared fixtures, trace, matrix and reporting |
| `package.json`, `README.md`, `docs/PHYSICAL_MODEL.md`, this report, protocol/results/JSON/screenshots | Test wiring and factual deliverables |

## Remaining issues and next smallest step

Investigate the harsh-pressure paired failure before broadening physics: inspect
which complete-plan valuations and recovery choices leave the agent exposed,
then fix with a regression test without granting resources or forcing a building.
After that fix, retain the present negative results, rerun the development matrix
and predeclare fresh evaluation seeds. Profile repeated route/pricing work at
five agents and preserve deterministic budgets while reducing latency.

The current search has only bounded protection/support geometry, approximate
forecast costs and a supplied exposure sense. It does not learn unrestricted
mechanics, invent arbitrary machines, prove calibrated uncertainty, or show that
directed testing generally beats a competent fixed strategy. Stationary water
storage, richer tools/energy, new motivations and later roadmap items were not
implemented or stubbed. Cloudflare type-generation configuration also remains
an independent root-check tooling limitation. These are disclosed limitations,
not a reason to describe the implemented bounded loop as general intelligence.
