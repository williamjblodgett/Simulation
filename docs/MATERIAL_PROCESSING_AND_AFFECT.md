# Material processing and adaptive state v1

## Capability boundary

Newly configured survival studies can explicitly select `materials-v1` and
`adaptive-v1`. Together they use policy 4, the finite `geology-v1` endowment and
schema 7. They add a first executable material-processing chain and persistent,
disclosed affective control signals. They do not add an external model, a hidden
technology tree, automatic unlocks or observer-issued research orders.

This is a deliberately bounded physical model. It can support a real sequence from
wood and mineralized rock to a tested copper- or iron-rich working tool. It cannot
yet produce alloys, engines, generators, electrical components, precision machines
or semiconductors. The other geological feedstocks remain conserved future inputs,
not promises that modern technology will appear if enough simulated time passes.

## Three information layers

The authoritative world owns exact batch composition, ore source, process
coefficients, material provenance, temperatures, yields, residues, condition and
durability. It validates and executes typed operations without consulting the
agent's desired result.

The private policy receives only the acting agent's condition, personal records,
local observations and a coarse view of that agent's reachable batches. It does not
receive exact chemistry, grade, hidden coefficients, other minds, the resource
catalog, future weather or the observer ledger. Its predictions come from authored
broad priors plus its own incremental evidence. Imagining an option cannot query
the authoritative executor.

The observer can inspect exact accounting and diagnostic quality values. The UI
labels those values as observer records so they cannot be mistaken for facts the
agent used. Timeline events preserve the before-action prediction, physical
intervention, measured result and resulting private update.

## Authored knowledge versus learned knowledge

New agents receive a disclosed catalog of broad relationships across matter,
structure, heat, processing, tools, evidence and action cost. Examples include
matter conservation, support and load paths, heat loss, fuel and airflow effects,
imperfect separation, reduction as a possible class of transformation, wear,
measurement limits, confounds, complete-plan cost and rational abstention.

These are developer-supplied priors—comparable to supplying senses, physiology and
an action language. They are not exact recipes. Exact thresholds, ore grade, useful
airflow, yields and durability are withheld. The agent stores contextual estimates,
sample counts, residual variation, uncertainty and evidence IDs only after an
operation is physically executed. One successful test remains one trial.

The current material planner forms a survival-derived capability goal only after
repeated personal gathering work, or repeated protection actions under recurring
exposure, make lower-cost future work potentially valuable while immediate needs are
stable. It must compare that proposal with normal movement, gathering, consumption,
recovery, protection and waiting. Missing inputs become support goals. Immediate
survival can defer the work, contradictory source evidence makes it select another
personally observed rock instead of retrying forever, three relevant late-stage
failures can abandon the goal, and adequate conditions do not create a novelty or
building reward.

## Executable operations and consequences

| Operation | Supplied inputs | Possible retained outputs | Important failure behavior |
| --- | --- | --- | --- |
| Prepare carbon-rich fuel | Wood, cover, time and effort | Charcoal, exhaust and ash-like loss | Poor cover can leave little useful solid; wood and effort remain spent |
| Concentrate visible ore-bearing rock | A personally collected source batch, separation work and time | Concentrate and gangue | Low grade or weak separation can produce an unhelpful concentrate |
| Form a fired hearth | Clay, carbon-rich fuel, wall thickness, time and effort | A stationary heat enclosure and exhaust | Under-fired or thin walls retain a weak enclosure that can wear quickly |
| Fire clay | Clay, fuel, an existing hearth and time | Ceramic and exhaust | Insufficient temperature leaves an under-fired product; charge is not restored |
| Reduce concentrate | Concentrate, fuel, hearth, airflow and time | Metal-rich bloom or roasted ore, slag and exhaust | Under-heating or unsuitable composition consumes the charge and leaves explicit remnants rather than refunding it |
| Hot-work a bloom | Bloom, fuel, hearth, form, work and time | A cutting edge or hammer head, scale and scrap | Inadequate heat/work can leave a poor or unusable result and still wear the hearth |
| Test a tool | Tool, target medium, force and time | A contextual efficiency/durability reading | The test wears the tool; usefulness on wood does not establish usefulness on stone |

All operations have a preflight validation step. An invalid request is atomic: it
changes no batch, inventory value, environment stock or physiological state. An
accepted intervention is real even if its hypothesis fails, so it can consume fuel,
ore, time, energy and enclosure life. Useful products, slag, scale, gangue, exhaust
and scrap retain mass provenance within the simplified ledger.

## Units and simplifications

- Material mass uses the existing normalized bulk-resource unit; it is not a
  kilogram or a mole.
- Temperature is recorded in modeled degrees Celsius. The heat calculation is a
  bounded engineering abstraction, not complete thermodynamics.
- Cover, airflow, separation, force, work, quality and condition use documented
  normalized 0–1 scales.
- Tool durability uses 0–100 durability points and falls with tests and gathering.
- Duration is counted in fixed simulation steps; one current step is ten modeled
  minutes. Runtime remains independent of render frame rate.
- Effort is a normalized physiological energy cost charged to the agent in addition
  to ordinary need drift.
- Solid yield and waste are fractions or normalized mass values. Exhaust remains an
  accounted process batch, not a breathable-gas simulation.

## Adaptive state, not hidden thoughts

`adaptive-v1` maintains fear, frustration, confidence, curiosity and social-need
signals plus valence and arousal. These values update deterministically from factual
conditions the agent experiences: vital needs, stressful weather, decision
uncertainty, recorded outcomes and time since social contact.

The signals have a bounded effect on candidate scores. Fear favors immediate water,
food, warmth, safety and recovery while suppressing optional experiments in danger.
Frustration makes repeated risky inquiry less attractive. Curiosity values only
decision-relevant information while needs are stable; it does not reward novelty,
experiment count or building count. Social need can modestly favor voluntary social
actions. Survival value remains dominant.

The UI calls this an **adaptive state** because it is not evidence of sentience,
human emotion, a fixed personality or hidden chain-of-thought. It exposes numerical
signals and factual drivers only. Explanations are deterministic summaries of stored
records, never invented inner monologue.

## Bounds, compatibility and security

World batches, records, private evidence, experiments, procedures and affect drivers
all have explicit memory limits. Validation checks IDs, ranges, operation shapes,
ownership, timestamps and cross-ledger mass conservation. Portable processed batches
follow their owner; stationary hearths remain in world space. Death stays permanent.

The feature is opt-in at the engine boundary and enabled for newly configured UI
studies. Older studies keep their original rules and do not receive retrospective
knowledge, feelings, materials or decisions. Recovery can apply a format fence to
an older policy-4 backup without adding either feature. Checkpoint transactions,
archives, worker separation and deterministic replay remain local to the browser.

No API credential, remote inference or paid call is used. An external model would
still be constrained by the same private observation and typed-action boundary; it
could not replace missing physical rules.

## Verification focus

`tests/survival-material-knowledge.test.mjs` covers explicit versioning, atomic
invalid requests, the complete retained-mass process, consequential under-heated
failure, source-specific adaptation, private-information isolation, engine-level
self-selection and bounded affect. `tests/survival-persistence-v2.test.mjs` covers
schema-7 backup and recovery without invented state. The full project test command
also rebuilds both application targets and runs legacy survival, discovery, geology,
persistence and worker tests.

A post-integration Node smoke matrix used three untouched one-agent seeds, stable
climate and an explicit 72-hour evaluation horizon. Interactive studies are
open-ended by default. Every benchmark run stayed valid and ended with its agent
alive. `process-smoke-a` independently completed eight supported operations and a
tested tool; `process-smoke-b` performed 13 interventions with six unsupported
outcomes and abandoned its goal; `process-smoke-c` performed 11 interventions with
six unsupported outcomes and abandoned its goal. These three runs are regression
examples, not independent proof of general intelligence or a survival advantage.
