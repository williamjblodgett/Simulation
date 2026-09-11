# Simulation: Astra review and no-API autonomy strategy

Reviewed September 9, 2026 against local source revision `dce7792`.

Follow-up: [implementation and verification report](IMPLEMENTATION_REPORT.md) records the local implementation, tests and remaining work. The review below is preserved as the original baseline assessment.

This is a review and implementation strategy, not an implementation or a deployment. Three GPT-6 Astra reviewers separately examined agent autonomy, UI/scene/routes, and runtime/persistence. The primary review also inspected the running static edition. No product code or existing run was changed for this report; browser checks used an isolated local preview origin.

## Executive recommendation

Keep the small five-agent Three.js study. Its foundation is useful, but its current decision system is closer to an independently operated utility policy than an agent that develops its own survival strategies. It selects from authored goals and fixed action recipes, with limited outcome learning.

The next milestone should be **agents that build their own imperfect models, compose plans, test predictions, and revise behavior from consequences**. This can be implemented locally without an API or a language model. More technology names, narrative explanations, decorative animation, or random action selection would not establish deeper autonomy.

Keep the sole declared terminal objective: **“Survive as long as possible.”** Securing water, learning a technique, cooperating, stockpiling, and requesting a companion should be agent-selected means to that objective, not additional externally assigned missions. Interactive studies are open-ended. The 72-hour values below are explicit benchmark horizons, not a product runtime limit or a second agent goal.

“Autonomous” here should mean independent closed-loop decision-making within a bounded simulated world. It does not imply consciousness, free will, general human reasoning, or invention beyond the world's implemented interactions. The designer still supplies bodies, senses, executable actions, environmental rules, learning mechanisms, and initial assumptions. Publish those assumptions instead of claiming that the agents start with literally nothing except a goal.

## Evidence and scope

- Code review covered the survival engine, catalog, types, tests, runtime/lease, all four survival views, About, Three.js scene mapping/animation, GitHub Pages router, and links into preserved civilization studies.
- The 23 focused survival-engine and runtime-lease tests passed. This review did not rerun the complete product test/build suite.
- Eight five-agent, balanced-resource, variable-climate, 72-hour probes retained all 40 agents. Clearing learning after every tick on the same seeds also retained all 40. This is a small ablation, not proof that learning never matters; it demonstrates that this baseline cannot establish a survival advantage from learning.
- Targeted probes reproduced unsafe donation and wrong-resource sharing described below.
- Three longer Node probes at tick 2530 measured roughly 423–426 KB checkpoints, 8.6–11.1 ms one-step p95, and 13.8–18.3 ms serialization p95. These exclude browser rendering, React, and localStorage; they are not mobile performance measurements.
- Fresh in-app Chromium inspection used the existing static build at `http://127.0.0.1:4173/Simulation/`. World, inspector positions, Agents, Timeline, Run and About were viewed at 390 × 844; World was also inspected at desktop dimensions including 1440 × 900. The world was nonblank, pause held the clock, and World → Agents → Timeline → Run → About → World returned to the same paused day/time.
- The pre-existing development server at port 3000 remained in loading with Vite client `send` errors. The static preview worked. Investigate the dev connection separately; this does not establish a production renderer failure.
- Legacy views were source-reviewed, not exhaustively clicked through. No real-device Safari, touch, full responsive matrix, cross-tab race, storage-quota fault, or mobile frame-rate certification was performed in this review. Existing September 8 visual artifacts were supplementary historical evidence only.

## What to preserve

Preserve deterministic stepping, checkpoint validation, local observations rather than global targets, permanent death, actual inventory and action outcomes, stable identities, voluntary refusals, and the observer-only controls. Keep the useful distinction between an observation, recorded intent, attempted action, and confirmed outcome.

Preserve the one-to-five limit and existing replacement policy. There is no routine automatic respawn. Observer additions are explicit interventions subject to the existing rules; when exactly one survivor remains, its independent companion decision cannot be silently overridden. Keep regression tests for cap-one runs, zero survivors, refusal, and each qualifying lone-survivor transition. Do not solve a failing survival benchmark by replenishing agents or resources behind the scenes.

Keep prior planetary/civilization saves separate. This strategy does not reopen the earlier thousand-agent civilization expansion or propose replacing the application framework.

## Prioritized review findings

Line references below describe revision `dce7792`; they will move during implementation. P1 means address before claiming the next autonomy milestone; P2 means an important follow-on correction.

| Priority | Finding and evidence | Required correction |
| --- | --- | --- |
| P1 | Request consent ignores the responding agent's hydration/nutrition (`app/simulation/survival/engine.ts:1751`). Paired hydration 3 vs 100 probes returned identical scores and donated the last water ration (`:1816`). | Evaluate the exact proposed transfer using the recipient's own needs, retained reserves, alternatives, travel risk, and opportunity cost. This is a decision-model flaw, not merely missing consent copy. |
| P1 | Research uses seven authored hypotheses/procedures (`catalog.ts:7`); success is a seeded roll increasingly favored by retries (`engine.ts:1659`), not a measured consequence of the procedure. | Label the current mechanism honestly; replace it incrementally with causal, parameterized experiments. |
| P1 | Candidate goals are manually scored (`engine.ts:979`), then translated to fixed recipes (`:1239`). Only the nearest known food/water site is offered (`:986`). | Compose and compare alternative action sequences over an agent-specific predictive model. |
| P2 | Learning writes `action:<kind>` averages (`engine.ts:835`), while selection also reads never-written `goal:<goal>` entries (`:1174`). | Add contextual outcome learning and delayed goal credit; remove or repair unused learning terms. |
| P2 | A proposal motivated by the recipient's hunger can transfer water first (`engine.ts:1803`). Only the proposer receives the action learning record (`:1861`). Shared evidence replaces the source time with receipt time (`:1831`). | Preserve item/amount through proposal and execution, record both parties' experiences, and retain original provenance and age. |
| P2 | Recorded “expected benefit” is separate from the actual selection score; “uncertainty” derives from score separation (`engine.ts:1188`, `:1324`). | Call current values heuristic scores, not calibrated predictions or probabilities. Future evidence UI must expose what actually drove selection. |
| P2 | Central resource anchors and a guaranteed clean central water source simplify exploration (`engine.ts:278`, `:349`). Fixed ID execution order gives earlier agents first access (`:2105`). | Keep an approachable default, add demanding evaluation worlds, and measure order bias before changing simultaneous-resolution rules. |
| P1 | Any checkpoint/storage exception permanently disables storage; that condition also grants leadership (`app/survival/use-survival-runtime.ts:150`, `:177`). | Separate save failure from single-writer ownership. Quota trouble must not produce two independently advancing tabs. |
| P1 | The runtime discards the complete generated journal and keeps only the 512-event state tail (`use-survival-runtime.ts:287`). Three long probes each left roughly 10,000 earlier events unretained. | Persist full events separately with retention/export controls. The current limit is disclosed, but “compacted” is misleading when no archive or summary exists. |
| P1/P2 | Pages About unmounts the runtime owner (`github-pages/src/Router.tsx:406`; `survival-experience.tsx:61`). Lease takeover can use a stale follower checkpoint (`use-survival-runtime.ts:304`). | Keep run ownership above routes and use revisioned commands against the latest committed checkpoint. |
| P1 | Animation uses wall time and action kind without sufficient paused/blocked gating (`scene/survival-habitat-scene.ts:497`; `scene/scene-models.ts:706`). | Separate interactive rendering from authoritative task progress. Pausing must freeze activity without disabling the observer camera. |
| P1 | Another tab's new run can leave a stale non-null selected ID and hide the inspector (`survival-experience.tsx:78`). | Revalidate selection, focus and open UI state when the run identity or agent membership changes. |
| P1 | Mobile peek hides intent/outcome, while expanded details show wordy score explanations but not existing alternatives/evidence (`agent-inspector.tsx:54`; stylesheet `:116`). | Bring one concise, factual decision summary into peek; expose the full structured decision record on expansion. |
| P2 | Prior archive links target the new survival root, and Pages `/about`/`/planet` links depend on normal-click interception (`history-book.tsx:295`; `civilization-archive.tsx:205`; `run-view.tsx:83`; `Router.tsx:345`). | Use explicit study-aware, hosting-aware hrefs that also work with copied links, new tabs and browser history. |
| P2 | Replaced deceased lives disappear from the main roster (`agents-view.tsx:16`). Timeline clips full text, lacks visible mobile filter labels, and reverses ticks but not within-tick sequence (`timeline-view.tsx:46`, `:97`). | Add All lives, full event expansion, accessible filter names, and a monotonic sequence with causal links. |

## Target autonomy architecture

The essential loop is:

**Private observations → personal beliefs → self-selected survival subgoal → candidate plans → chosen action → world consequence → measured learning → revised plan.**

The world engine knows physical truth. An agent policy must not. Rendering and the observer's selection sit outside this loop and must never feed extra knowledge or preferences into it.

### 1. Establish an enforceable observation boundary

Extract a pure policy interface from the large engine before replacing its behavior. Inputs are an immutable private observation/belief snapshot, body state, personal inventory, past outcomes, received proposals, and agent-local random state. Outputs are an executable intent and a structured decision record. Do not pass the complete world state or references to mutable global resources into policy functions.

Document which facts senses reveal directly and which require inference or testing. Distinguish a visible stream from verified safe drinking water; distinguish an absent resource from an unvisited place. Each evidence item needs observed time, received time, location, original source, transmission chain where relevant, confidence and supersession. Reading an observer map never refreshes an agent's memory.

World execution validates affordances against truth and can reject a plan. A stale memory must be capable of producing a genuine failed expectation.

### 2. Build personal predictive models

Replace the single average per action with compact estimates conditioned on target/material and meaningful circumstances: travel distance/terrain, resource yield and replenishment, water safety, weather exposure, tool effects and partner reliability. Retain sample count, mean, variation, recency and failure cause. Generalize cautiously to related contexts; do not memorize every complete state.

An agent should be able to learn “this source produced little after several recent visits” without learning that all gathering is poor. It should retrieve relevant episodes when comparing plans. Predictions from another agent are attributed claims, not automatically accepted truth.

Use explicit, versioned initial priors and unknown states. No preset cautious, brave, builder or explorer personalities. Behavioral differences should follow positions, experiences, beliefs and acquired techniques. Descriptions such as “often conserves reserves” can be inferred afterward and must not secretly become assigned traits.

### 3. Let agents compose and revise plans

Represent primitive actions with preconditions, costs, duration, possible effects and observations. Start with the engine's existing capabilities; do not invent action names the executor cannot perform.

Use a bounded forward/beam planner over the agent's beliefs. Compare several known resource sites, rest-before-travel versus travel-now, carry-reserves versus repeated trips, and gathering versus investing in shelter or a tool. Include need depletion during the complete estimated journey, not only immediate action reward. Retain an emergency fallback within the same disclosed survival policy.

Generate instrumental subgoals from predicted survival problems. Execute one step, compare result to prediction, and retain, repair or abandon the sequence. Cache useful successful sequences as reusable techniques, with preconditions and evidence rather than permanent job assignments.

Selection should optimize a stated survival estimate over a bounded horizon with a disclosed continuation estimate, not arbitrary permanent bonuses for cooperation/research. Information gathering can have instrumental value because it improves later survival decisions; novelty should not become a hidden second terminal goal. Bad predictions and failed plans must remain possible.

A learned forward model interleaved with real action and planning has established foundations in Sutton's Dyna work. The particular small-model, bounded-search design here is an engineering proposal for this application, not a claim that the cited results validate it: [Integrated Modeling and Control Based on Reinforcement Learning and Dynamic Programming](https://papers.nips.cc/paper_files/paper/1990/file/d9fc5b73a8d78fad3d6dffe419384e70-Paper.pdf).

### 4. Turn research into actual experiments

Build a small compositional material/process model before adding a massive technology index. Initial proposed domains are fiber strength under twisting, drying and heat production, simple containers, and shelter insulation. These are candidate additions, not existing physical capabilities.

Separate the world's material laws from each agent's hypotheses. The world implements consequences; agents discover them through observations. Provide a bounded procedure grammar using actions such as combine, arrange, dry, heat, strike and measure only as those mechanics are implemented. Agents choose inputs, a manipulated variable, expected measurement, repetitions and affordable resource budget.

Record exact procedure parameters, conditions, material cost, predicted and measured effects, and negative/null results. Repeating the wrong procedure must not inevitably unlock a technique. Evidence review must update beliefs rather than simply increment a completed step. Successful procedures become reusable skills and must demonstrably change tool yield, carrying capacity, warmth, water safety, or another actual survival mechanic.

Evaluate stopping as well as starting research: an agent with insufficient reserves should be able to defer or abandon an experiment. No observer research orders, timed unlocks, or predetermined civilization ladder. The discovery space stays bounded by implemented rules, but combinations need not be a seven-item lookup.

### 5. Make social behavior independently negotiated

Proposals contain item, amount, conditions, expiry, and optional coordinated steps. The recipient evaluates them using its own beliefs, reserves, opportunities and expected survival—not the proposer's score or an omniscient group optimizer. Acceptance, refusal, and eventually counteroffers are executable choices.

Record both decisions and both consequences. Shared observations preserve age and provenance; subsequent verification can raise or lower partner reliability. Repeating an exchange without new useful information should have cost and declining predicted benefit, not free reward. Temporary cooperation or specialization can emerge from comparative advantage; do not preassign roles.

Test contested resources and execution-order bias. A simultaneous observe → intend → resolve model is a candidate, not an automatic refactor: define conflict resolution and version replay semantics before adopting it.

## Reliable runtime and durable evidence

Place an application-level run controller above page navigation, with one authoritative worker owning decisions and transitions. Keep the pure engine callable by headless tests. Use run IDs, expected revisions and unique command IDs to prevent stale or duplicated interventions.

Move expensive planning away from the UI thread. Give decisions deterministic expansion/sample limits so CPU speed, camera state, frame rate and worker batching cannot alter policy results. Wall-clock batch budgets should control when work yields, not how much thought an agent receives. Profile before choosing final limits.

Store a full event ledger in IndexedDB, keyed by run ID and monotonic sequence; commit a checkpoint cursor transactionally. Keep a small hot event tail for display, page older history, and provide export plus an explicit retention limit. Archive deceased lives and ruined structures without breaking identity/provenance. Keep a last known good checkpoint and visible recovery state.

Separate leader election from checkpoint success, and test quota errors, serialization defects, leader crashes, competing tabs and stale takeover commands. Never silently substitute demo data or reset a study after a failure.

For now say “runs while this browser is active.” A worker does not run after the page is closed. Optional later catch-up may deterministically simulate missed time with an explicit limit and progress, but must be labeled reconstruction, not proof of continuous background activity. Continuous operation when every client is closed would need an always-running host; it still would not require a model API.

## UI and 3D improvement strategy

Retain World, Agents, Timeline and Run. The user should observe consequences, not manage workers.

- **World:** Keep the canvas dominant, but frame agents and nearby meaningful resources more tightly. Fresh phone inspection showed very small agents in a broad sparse green field. Improve elevation, shoreline, vegetation clusters and resource silhouettes only where they agree with navigation and resource state. Do not conceal an unchanged engine behind decorative buildings or activity.
- **Peek:** Show identity, attempted activity, most urgent condition and one concise state-derived selection reason. Example design copy, not a claimed current event: “Chose the eastern stream; the nearer source was last seen empty.” Only produce that sentence when evidence supports it.
- **Expanded inspector:** Show the actual decision time and ID, observed facts used, chosen subgoal, two meaningful alternatives, estimated costs/risk, attempted steps, linked result and changed expectation. Keep unrelated “latest outcome” separate so it does not appear to confirm the current plan. Current heuristic scores must be labeled as such until predictive estimates replace them.
- **Knowledge lens:** Offer an observer toggle for the selected agent's known sites, stale reports, unexplored areas and intended route. Keep uncertainty visible and never reveal unseen ground truth under “agent knowledge.”
- **Agents:** Reduce introductory copy and oversized card whitespace; keep needs readable rather than shrinking them. Add Living / All lives with immutable life IDs so replacements never overwrite the apparent history of a deceased agent. Portraits should correspond to the world model and actual equipment.
- **Timeline:** Group events into decision episodes, not repeated blocks of identical scoring prose. Provide compact milestones with expandable raw events. Preserve every retained record and scroll position. Use causal IDs to connect an observation, choice, failure, replanning and later success. Do not add replay until saved state supports it.
- **Run:** Separate active-run facts from a focused New run flow, preserve confirmation for replacement, and expose engine/policy version, seed, current owner and last successful save. Say that environment settings are configurable while the survival objective is fixed. Keep an explicit method/limits page.
- **Truthful motion:** Camera orbit remains available on pause. Body movement, gathering, building and resource use follow real action progression; blocked or awaiting agents do not keep performing productive gestures.
- **Navigation/accessibility:** Use genuine URLs for both hosts, repair prior-study links, preserve run/selection across routes, expose complete long event text, and give every filter an accessible name. Keep details and bottom navigation usable with keyboard, large text and short landscape screens.

## Implementation sequence and review gates

| Stage | Bounded deliverable | Main modules / proposed additions | Exit gate |
| --- | --- | --- | --- |
| 0: Baseline and honesty | Freeze reproducible evaluation seeds; repair consent/item/provenance/unused learning defects; truthful labels and action animation. | Existing engine/catalog/types, scene, About; regression tests. | All existing invariants plus reproduced defect tests pass; no stronger autonomy claims yet. |
| 1: Continuity and evidence | Stable runtime owner, revisioned commands, safe lease/save recovery, worker bridge, persistent journal and export. | `use-survival-runtime.ts`, app/Pages route integration; proposed runtime controller, worker and event-store modules. | Same replay across batches/save/restore; cross-tab and storage fault tests; navigation never resets or silently stops the active study. |
| 2: Private learning models | Policy/world separation, provenance-aware beliefs, contextual transition estimates and relevant memory retrieval. | Proposed `perception.ts`, `beliefs.ts`, `learning.ts`, `policy.ts` under survival; versioned state migration. | Unseen-truth isolation; site-specific adaptation; measurable prediction improvement on held-out episodes. |
| 3: Compositional planning | Action schemas, survival-horizon evaluation, bounded search, contingencies, reusable techniques. | Proposed `actions.ts`, `planner.ts`, `survival-value.ts`; existing engine remains executor. | Solves held-out action ordering absent from templates; beats frozen baseline on demanding survival tasks without violating knowledge boundaries. |
| 4: Experiments and negotiation | Small causal material system; independent hypothesis tests; bilateral resource-specific proposals. | Proposed material/experiment/social modules and causal evidence types. | Manipulated variables change outcomes; invalid controls cannot unlock by repetition; recipient reserves and consent govern transfers. |
| 5: Observatory refinement | Concise decision evidence, knowledge lens, complete life directory, episode timeline, scene/readability pass. | Existing survival views/scene/styles, About, study-aware routes. | One observable choice can be traced through evidence → action → consequence → changed belief; responsive and accessibility matrix passes. |

Surface existing decision evidence early during stages 0–1; do not defer all visible improvement until stage 5. Keep every stage runnable and reviewable. Stage 4 can begin with one research domain rather than implementing every material at once. No stage requires adding a new application framework or a remote model service.

Version the engine and policy and preserve old checkpoints. Continue older runs under a compatible version or offer explicit migration with a backup; do not silently reinterpret their learned state. Keep pure baselines for comparisons rather than modifying them until the comparison becomes meaningless.

## How to prove the agents became more autonomous

Create a headless harness with training/tuning seeds separate from held-out evaluation seeds. Include 1/3/5 agents, scarce and replenishing resources, harsh weather, depleted familiar sources, stale or wrong social reports, contested supplies, useful but costly research, and 72-hour plus longer studies. Avoid making every new world impossible; report difficulty and uncertainty.

Primary outcomes: survival-time distributions, critical-need duration, avoidable deaths, wasted travel, repeated failed plans and recovery latency after a change. Secondary outcomes: prediction error/calibration, useful discovery benefit, knowledge coverage, honored refusals and retained reserves. Count neither prose length nor number of “research” events as evidence of intelligence.

Required comparisons and invariants:

1. Current policy versus frozen-learning, memory-disabled, planning-disabled and social-information-disabled variants on paired seeds. Report distributions and effect sizes; choose improvement thresholds before tuning rather than cherry-picking a successful run.
2. Changing only unseen world facts must not change an agent's immediate decision under identical private inputs and random state.
3. A depleted or contaminated familiar source should cause context-specific belief revision; learning should not condemn all sources or grant unseen knowledge.
4. A held-out action-ordering challenge must be solved through composition rather than adding that scenario's recipe to the catalog.
5. Research must respond to actual manipulated conditions, retain failed predictions, and stop when survival costs become too high.
6. Recipient hydration/reserves must affect donation choice; accepted transfers match exact terms; refusal transfers nothing; both sides retain experience.
7. Repeated information sharing must not refresh stale observations or generate unlimited reward.
8. Same seed/version must replay identically across chunk sizes, worker scheduling, save/restore and legitimate leadership transfer.
9. Existing cap, permanent-death, explicit intervention and lone-survivor companion rules remain passing.
10. Browser coverage includes World/Agents/Timeline/Run/About round trips, selected-ID replacement, leader crashes, quota exhaustion, interrupted storage transactions, renderer loss, page suspension, long records and duplicate command submissions.

UI release matrix: 390 × 844, 375 × 667, 430 × 932, phone landscape and 1440 × 900; one-agent and five-agent cases; large text, reduced motion, keyboard, touch gestures, long intent text and loading/error states. Verify actual viewport captures, no blank canvas, no lost selection, no double clock, readable meters, reachable navigation and useful camera framing at each sheet position. Record browser p95 workload/frame timing on a representative weaker device; desktop screenshots do not establish mobile Safari support or 60 fps.

## GPT-5.6 or Astra?

My engineering recommendation is **Astra for design and milestone audits; GPT-5.6 Sol for most implementation**. This is task allocation judgment, not a head-to-head benchmark on this repository. Official documentation identifies Sol as the flagship GPT-5.6 tier for complex professional work and Astra as the most capable tier for difficult end-to-end work: [GPT-5.6 Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol), [GPT-6 Astra](https://developers.openai.com/api/docs/models/gpt-6-astra).

- **5.6 can implement:** concrete bug fixes, routing, accessibility, evidence UI, durable history, workers, migrations, benchmarks, and the planner/material systems once their contracts and acceptance tests are explicit. Use cohesive small changes rather than a single “make it fully autonomous” prompt.
- **Astra is worth using for:** the survival value model, observation boundary, learning/credit assignment, causal experiment design, social autonomy, emergent failure diagnosis and adversarial review of benchmark results.
- **Astra is not mandatory for every edit.** A stronger coding model does not automatically make the simulated agents smarter; only implemented, tested runtime mechanisms do that.
- **Neither model needs to run inside the site.** The proposed agents use local code, learned numerical models and bounded planning. No API key, paid inference request or hidden chatbot is part of this baseline. A local language model would be a separate optional project, not a requirement or substitute for these mechanics.

Recommended first implementation ticket: capture the current policy baseline, add the unsafe-donation and wrong-resource regression cases, fix those behaviors through explicit proposal terms and recipient survival evaluation, and expose the exact existing decision evidence without overstating it. Then establish the reliable runtime/evidence foundation before expanding planner complexity.

## Release status boundary

This review did not push or deploy. Local main is `dce7792`; last-known remote-tracking main is `cba366b`. The prepared Pages worktree is `971a8eb`, one ahead of its last-known remote-tracking branch. These are local Git observations, not verification of current remote or live content. Resolve authentication and verify the served revision separately before announcing publication. Also reconcile the `.gh-pages-publish/` worktree with the differently spelled ignore entry before broad staging.
