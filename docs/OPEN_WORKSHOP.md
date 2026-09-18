# Open workshop: bounded, browser-local development

This extends Simulation's existing five-agent survival engine. It is not a replacement application, an external-model policy, or a claim of unrestricted invention. New studies remain open-ended, default to three agents, and run only while an active browser tab owns the study. Death and the five-living-agent limit are unchanged.

## What was already present

- Worker-separated, deterministic survival planning from private observations; complete need-restoration chains and emergency interruptions.
- Primitive geometry, protection/support experiments, learned procedures, voluntary cooperation, individual names, affective signals, and optional continuity.
- Finite geological feedstocks, charcoal, ore concentration/reduction, ceramics, tools, explicit material ledgers, and material-learning records.
- World / Agents / Timeline / Run, a shared Three.js renderer, browser-local archives, revision-checked saves, recovery and exports.

The missing bridge was recurrent investment in useful, persistent systems. Material learning could terminate after one goal, and processing more material did not by itself make storage, cultivation or powered arrangements operational.

## Added behavior

`developmentModel: "open-workshop-v1"` adds a bounded component layer alongside the original primitive/support model. Agents recognize recurring costs from their own collection, eating, gathering and exposure memories. They compare short capability programs with ordinary survival and no optional work. A program can include prerequisites, acquisition, travel, fabrication, connection, a real test and later reuse.

Goals retain evidence references, parent, target, urgency, benefit estimate, effort budget, spent effort, retry time and status. New evidence can reopen a completed investment after a modeled-day cooldown; this is not a time-based technology unlock. Existing measured arrangements may satisfy a goal without more construction. Low needs interrupt work without undoing completed objects or costs.

The optional **Survival + bounded discovery** setting is a separate authored motivation. Default survival-only studies do not receive it. It adds decision-relevant information value, not novelty or building-count points. Work selected only by this extra motivation has an eight-effort-unit allowance per 144 ten-minute steps. Continuity remains a separate choice. This allowance covers executed development-operation effort, not an exhaustive caloric accounting of all travel and acquisition; those costs remain in plan estimates and normal physiology.

## Physical possibilities and their limits

| Domain | Operational consequences | Deliberate abstraction |
| --- | --- | --- |
| Storage | Deposit/withdraw actual food or water; finite capacity, leakage and spoilage; ordinary collection can use observed stocked vessels | No new carried-water penalty; a vessel is not automatically better than a nearby stream |
| Cultivation | Spend seed-food reserves and water; daylight and modeled time produce withdrawable food | A perennial crop-bed aggregate, not plant genetics, soil chemistry or complete biomass conservation |
| Protection | Panels affect actual local protection; geometry, orientation, material and condition matter | Existing primitive support rules remain separate; a panel is an authored supported component, not an independently engineered building |
| Treatment | Fuel and effort are spent; attained modeled temperature can be insufficient and damage the object | Coarse firing/glassy/mixed-metal properties, not complete thermodynamics or metallurgy |
| Mechanics | Wind rotors and fueled/water-consuming chambers supply work; shafts, pumps and transmission have losses and wear | Aggregate functional mechanisms; gears transmit work but do not resolve separate angular velocity and torque |
| Electricity | Real processed metal is installed once; generator/motor conversion, paired conductors, finite empty cells, resistive heat, threshold contacts | Authored generator/cell/contact capabilities, not the discovery or fabrication of magnets, electrolytes, semiconductors or computers |
| Knowledge | A physical record surface can hold an executed procedure; an agent must encounter/read it; reports preserve original references | Symbol reading/writing is a supplied ability; no automatic inheritance of another life's private mind |

The new typed operations are `form`, `connect`, `transfer`, `treat`, `test`, `tune`, `plant`, `repair`, `reclaim`, `read` and `document`. Invalid requests are rejected before inventory mutation. Realized failed treatments and tests still cost effort/resources. Dead agents cannot execute operations. Working machinery may continue during browser-simulated time after its maker dies.

Raw inputs remain in components, bindings, fuel or waste; reclaimed raw material returns at 80%, with explicit remnants. Processed batches cannot simultaneously be carried tools, multiple components and conductors. Energy fan-out divides supply. Combined electrical/mechanical cycles are rejected, and cells release only previously stored energy. Pumps withdraw from an actual reachable freshwater source. Capacity overflow is not mislabeled as leakage.

There is no unlimited modern-technology simulation. In particular, arbitrary electronics, industrial chemical processes, software, transport and advanced manufacturing are not implemented. The physical executor has a wider language than the current planner: not every supported port/parameter/repair can yet be selected or maintained autonomously. Some operations, including elaborate relay networks, are currently demonstrated by explicit executor fixtures rather than natural progression.

## Supplied priors versus learning

**Supplied:** senses, physiology, action semantics, component families, port compatibility, a few material affordances, seed-food interpretation, initial performance estimates, candidate geometry samples, survival utilities, affect rules, planning limits, test instruments, thresholds and optional motivations. Agents are not blank minds and do not invent these world rules.

**Learned:** contextual performance estimates, empirical residual variation, supporting evidence, procedure success/failure history and reusable relative-role programs. Welford updates retain count/mean/dispersion. Predictions combine the observed mean with two prior pseudo-observations. A single success retains substantial uncertainty. Model contexts currently bin form, material, size, thickness and treatment; weather is recorded with evidence but is not a fully learned covariate. Uncertainty is a heuristic, not a calibrated probability. Cross-domain raw prediction errors have different meanings and must not be treated as one physical unit.

A retained procedure stores relative part roles, port relationships and finishing operations. Binding it to a new site still executes each primitive through authoritative validation. Received procedures retain author/evidence IDs and do not increment personal model samples. Bounded evidence-ID deduplication prevents recent repeated reports from becoming confirmations. This is not a proof of unlimited-history deduplication after all old identifiers have been pruned.

## Information boundary

1. The world owns true material coefficients, stock, collisions, weather and consequences.
2. The policy gets a runtime allowlisted copy of private goals/models/evidence plus individually observed component geometry, condition, contents and output. It does not get hidden coefficients, world generation seed, other minds or observer diagnostics. The existing private random stream is retained.
3. Observer UI can inspect measured world state and ledgers. These records are not fed back into the policy. Recorded intent and predictions are not hidden thoughts or proof that an agent knew the answer.

Protection readings on new components are a supplied paid measurement capability applied to an existing object. They are not simulated counterfactual interventions against objects that do not exist. Stored-water trials use actual water; an electric-output reading requires real operating input.

## Quantities and budgets

- Position/size: modeled metres; orientation: radians. Thickness is a normalized wall/section parameter, despite the shared geometry field name. Bulk material quantity is normalized stock, not kilograms; authored fabrication mass is `size² × thickness × 2` stock units.
- Clock: one authoritative step is ten modeled minutes. Physiology uses the existing 0–100 scale. Condition, efficiency, leakage parameters and settings are normalized 0–1 values.
- Food/water: existing inventory units; capacity is a normalized volume proxy, not litres. Charge and delivered energy use normalized energy units; output is energy per modeled step, not watts. Temperature is a simplified modeled °C estimate.
- Each goal has 40 normalized effort units. Maximum search depth 4, 96 capability expansions per review, 24 program operations and 12 retained candidate summaries. Complete-plan estimates include acquisition, round trips, work, and waiting for cultivation.
- Maximum 320 components, 640 links; per life 12 goals, 64 contextual models, 96 raw evidence records, 20 procedures, 512 recent deduplication references and 16 past material goals. Existing primitive and archive limits remain. Open-ended means no scheduled end, not infinite RAM or guaranteed survival.

The current search samples only four fresh capability variants and a small number of reused procedures. This is inspectable bounded search, not exhaustive engineering design. Information value uses optimistic/pessimistic private estimates to ask whether a result could change a preference; it is not exact Bayesian value of information.

## Saving and existing studies

The checkpoint format is schema 8, policy version 4 with an explicit development-model discriminator. New UI-created studies opt into the new model; the engine constructor retains old behavior when the option is absent. Compatible existing material-learning studies may explicitly choose **Enable expanded world** in Run. This logged action adds no lives, inventory, elapsed time or learned answers. Older studies are not silently upgraded.

Format fencing may label a legacy backup schema 8 while retaining its original policy and absence of development state; this prevents an older writer from overwriting a newer archive without changing historical behavior. Compare-and-swap revisions, worker state validation, last-good recovery and archives remain in use. No API credentials, server simulation or off-browser advancement are added.

## Code map

- `app/simulation/survival/development-types.ts`, `development-catalog.ts`: records, budgets and authored affordances.
- `development-policy.ts`: private allowlist, goals, bounded search, candidate scoring, contextual learning, procedure transfer.
- `development-world.ts`, `development-validation.ts`: authoritative execution, fixed-step networks, accounting and save checks.
- `engine.ts`, material/geology/planner/navigation integration: execution, sensing, physiological effects and preservation of old policies.
- `app/survival/development-record.tsx`, `development-method.tsx`, inspector/Timeline/Run integration: factual observation rather than controls over agent choices.
- `app/survival/scene/development-models.ts`: shared instanced geometry and selection for realized objects. Contents and motion depend on actual state, not a timer.
- `tests/survival-development.test.mjs`, `scripts/benchmark-development.mjs`: isolated executors, natural runs, comparisons and performance records.

See [evaluation protocol](DEVELOPMENT_EVALUATION.md) and [implementation report](OPEN_WORKSHOP_REPORT.md).
