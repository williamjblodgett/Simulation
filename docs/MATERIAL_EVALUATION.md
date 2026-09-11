# Raw-material evaluation protocol

Declared before examining the runs below, 2026-09-10. A shared run is one trial;
agents in it are not independent observations. This is a resource/persistence
extension regression, not a new intelligence-policy efficacy experiment.

Two arms use the same policy 4, priors, learning, planning budget and survival
configuration: original endowment (`basic`) and `geology-v1`. No goals, equipment,
observations, supplies or successful procedures are injected. The additional
visible stone sources legitimately change the geological arm's observations.
This paired comparison checks whether the expansion disrupts survival/accounting;
it does not assume extra activity is beneficial or prove causal superiority.

| Split | Seed | Agents | Abundance / climate | Modeled hours | Arms |
| --- | --- | ---: | --- | ---: | --- |
| Development | materials-dev-1 | 1 | balanced / variable | 72 | both |
| Development | materials-dev-2 | 3 | balanced / harsh | 72 | both |
| Development | materials-dev-3 | 5 | scarce / variable | 72 | both |
| Untouched evaluation | materials-holdout-estuary-582 | 1 | balanced / variable | 72 | both |
| Untouched evaluation | materials-holdout-ridge-961 | 3 | balanced / harsh | 72 | both |
| Untouched evaluation | materials-holdout-cove-407 | 5 | scarce / variable | 72 | both |
| Long development | materials-long-1 | 1 | balanced / harsh | 168 | geology-v1 |

Any seed used to inform a fix becomes regression data; preserve the original
outcome and label it accordingly. Do not silently replace an unfavorable run.
Record every row, including invalid states and exceptions. Assert validity at
6-hour intervals and final state, including the cross-ledger mineral accounting.
Fail the benchmark process on invalid states/errors, while preserving its report.

Track completion/time, survivors and death causes, failed actions and repeated
blocked movement, actual mineral depletion/holdings/parts (not invented action
amounts), physical tests and work, planning expansions, per-step timings, sampled
checkpoint bytes and process RSS/heap. Observation/test logs do not prove modern
technology discovery. Stop at extinction or declared duration, never resurrect.

Commands: `npm run benchmark:materials` (six development paired runs),
`npm run benchmark:materials -- --evaluation` (six held-out paired runs), and
`npm run benchmark:materials -- --long` (one 168-hour development run).
Generated JSON retains source fingerprint, flags and protocol reference.
Timings are Node on a shared Windows desktop, not mobile renderer measurements.

## Post-run instrumentation clarification

Source review after the runs found that the `failedActions` logger field counts
negative outcome records, not unique attempts: a physical failure emits both a
detail event and a general action event. Refusals use a different field. Results
retain every original value but label this counter as negative records, and do
not infer a unique failure rate or preventability from it. The logger's note was
corrected; policy behavior and the predeclared environment matrix were unchanged.
