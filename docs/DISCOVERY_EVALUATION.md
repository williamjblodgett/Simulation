# Milestone 1 evaluation protocol

Baseline source: `b1473b10596b2e7f252c40f0af94e95b473b06a2`.
This protocol is written before examining the new policy's evaluation outcomes.
No public deployment or existing browser study is part of the experiment.

## Matrix

Development/regression: `discovery-dev-basin-1` (balanced/variable),
`discovery-dev-cold-2` (balanced/harsh), `discovery-dev-scarce-3`
(scarce/variable). Each runs 72 modeled hours with three agents, continuity off.
Untouched evaluation: `discovery-eval-estuary-641` (balanced/variable),
`discovery-eval-ridge-829` (balanced/harsh), `discovery-eval-cove-173`
(scarce/variable), respectively one, three, and five agents for 72 hours.
One longer development run uses `discovery-dev-long-4`, one agent,
balanced/harsh, 168 hours. If an evaluation seed informs a repair, retain its
initial result and reclassify it as regression; do not call a rerun a holdout.

Paired arms: decision-directed experiments; identical priors with parameter
updates frozen; budget-matched random feasible optional tests; no optional
experiments; competent fixed survival/construction strategy with the same
sensing and authoritative executors. Research settings are test-only, not
observer controls. Random selection uses the directed policy's locally feasible
cost/time ceiling and optional-test opportunity at that decision. Once trajectories
diverge, total tests/costs need not match; report actual totals, not a claim of
globally yoked budgets. The fixed strategy keeps the existing competent survival
planner and considers one stable construction proposal; it is a fixed construction
strategy, not a fixed script for every survival action. The frozen arm freezes
contextual parameter updates/use, not evidence records or executable procedure formation.

Report every completed/failed arm and explicitly mark unfinished arms. The unit
of comparison is a run, not each agent as an independent sample. Record survivors,
deaths/cause, failed and blocked operations, material expenditure, useful plan
changes, prediction errors, test costs, expansions, step latency, serialized
checkpoint bytes, and resident memory. These finite runs do not establish
statistical superiority. Timing is Node on Windows, not mobile rendering FPS.

End-to-end pressure fixtures may alter weather, resources and initial physical
objects but may not supply goals, hypotheses, programs or trained models. Keep
isolated model/procedure tests distinct from these demonstrations. Existing
policy-3 72-hour recovery seeds remain legacy regressions, not holdouts.

## Development demonstrations and instrumentation

The three pressure variants use one agent, the same declared resource/climate
settings, initial warmth 45/safety 18, and nearby raw resources. No starting
construction, extra carried supplies, goals or trained models are supplied.

The transfer regression has two explicitly authored environmental episodes.
First, the basin pressure seed runs for 36 steps. Second, the same life is relocated
to a dry patch, its prior objects are damaged, raw resource sites are relocated,
and a cold period is applied. Inventory, earned evidence and procedures are
unchanged. These are **test-fixture interventions**, not observer controls or
autonomous environmental events. Tests check a later policy choice with contextual
parameters enabled/frozen, and actual paid execution on new objects. Another
isolated fixture supplies one standing wood part to test support evidence versus
contradictory protection. Its registry owner is a fixture requirement, not a claim
that the agent previously built it. Both fixtures are regression data, not holdouts.

The engine's event contract does not include aggregate collected quantities;
the initial benchmark logger's `gathered: 0` was invalid instrumentation. Reports
must mark that metric unavailable, not zero. Actual successful drink/meal counts,
physical work, material retained in parts, damage and the existing spent ledger
are available. Policy-4 notebook counters are not comparable with policy-3 zero
placeholders; use the latter's `actualPhysicalTests` and physical ledger.

Runs may overlap other tests on this desktop. Timing describes the actual
shared-host execution, not isolated policy speed or device rendering performance.

## Release continuation protocol (2026-09-10)

The original 50-run results remain immutable evidence for the first implementation.
`discovery-dev-cold-2` is regression data, including the original deaths and all
diagnostic attempts. A recovery-plan interruption bug was found in that fixture.
The first repair's directed run survived, but its fixed-construction arm died;
both outcomes are retained in `discovery-exposure-recovery-attempt-1.json`.

Before examining a new holdout, the release matrix is declared here: rerun all
15 development pressure arms, all 15 natural development arms, all four legacy
72-hour runs, and the one-agent 168-hour development run. New untouched natural
evaluation seeds are `discovery-release-estuary-902` (one, balanced/variable),
`discovery-release-ridge-457` (three, balanced/harsh), and
`discovery-release-cove-318` (five, scarce/variable), each for 72 hours and all
five arms. Total: 50 release runs. Preserve all outcomes, including deaths.
Use `--release` for separate output files; it does not change policy behavior.

No evaluation result may be used to tune this release while still being called
a holdout. Any discovered defect instead requires another regression label and
an explicit updated protocol. The public deployment is separate from testing;
its user study is not a fixture and will not be reset or advanced for validation.

### Final candidate after the long-run approach defect

The release-continuation long development run died at hour 121. Inspection found
an exact-destination mismatch: a proposed test point could be inside a rotated
part, navigation selected a legal stand-off, and the project kept waiting for
the original point. Budget exhaustion also failed to suppress an unchanged
proposal. Fix those defects without changing physiology, supplies or policy-3
behavior. Preserve both the release matrix and long-run diagnostic files.

Before examining final-candidate evaluation outcomes, declare another 50-run
matrix (`--candidate`): identical 15 natural development arms, 15 pressure arms,
four policy-3 regressions and one 168-hour study. Fresh evaluation seeds are
`discovery-candidate-estuary-311` (one, balanced/variable),
`discovery-candidate-ridge-673` (three, balanced/harsh), and
`discovery-candidate-cove-884` (five, scarce/variable), 72 hours and all five arms.
The earlier evaluation sets stay results for their recorded fingerprints, not
untouched evidence for the final candidate. Do not tune from these new holdouts.
