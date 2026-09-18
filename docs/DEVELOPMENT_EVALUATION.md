# Expanded-world evaluation protocol

Declared before inspecting held-out results. Source baseline: `50b0b35473e60a2cdc139cf48a28a998529d0ce3` plus the source fingerprint saved with each result. Units are runs, not independently sampled agents. No fixture assigns goals, hypotheses, materials, successful programs or learned answers in these natural runs.

## Matrix

- Development/regression: `workshop-regression-1` (one agent, balanced, variable); `workshop-regression-3` (three, balanced, harsh); `workshop-regression-5` (five, scarce, variable), 432 ten-minute steps (72 modeled hours). The first seed informed development and is **not** evaluation evidence.
- Held out: `workshop-holdout-estuary-926`, `workshop-holdout-ridge-713`, `workshop-holdout-cove-584` with the same respective populations/settings, 432 steps each.
- Extended regression: `workshop-endurance-168` (three, balanced, variable), 1,008 steps (168 modeled hours). This is a finite observation window on an open-ended study, not a run duration limit.
- Evaluation arms: directed, frozen, random, none, fixed. All receive identical initial world, senses, primary survival objective and budgets. No autonomous succession in this comparison. The existing protection-discovery evaluation mode also controls its original subsystem.
- An additional `--discovery` arm explicitly enables the separate bounded discovery motivation; do not pool it with survival-only results.

`frozen` records all development measurements and costs but does not update development model/procedure parameters. Existing material-processing learning is unchanged; this is **not** a whole-agent learning ablation. `random` selects among available proposals no more expensive in time, materials or effort than the directed opportunity. It does not receive more test opportunities. `none` disables optional material/development inquiry; ordinary learned survival behavior and non-test protection alternatives remain. `fixed` uses the existing competent fixed protection-arrangement baseline and complete ordinary survival chains, with new optional inquiry disabled. This is a fixed construction strategy, **not** a fixed strategy for every survival action.

Report every started run, including errors and deaths. Any held-out seed used to diagnose a fix becomes regression data; a corrected result must be labeled a rerun, not untouched confirmation. No result implies arbitrary technology discovery.

## Measurements

For every run: survivors and death causes, modeled hours, unique failed-action outcomes, blocked movement and repeated per-agent signatures (not a proven preventability classifier), physical/material/development tests and costs, realized component forms, goals/statuses, prediction squared error, model samples, retained procedures, adaptations after contradictory measurements, raw waste, water and energy ledgers, counted planning expansions, checkpoint validity, largest serialized checkpoint, step p50/p95/max, elapsed wall time and Node heap/RSS. Checkpoint validation every six modeled hours and at exit. Performance is shared-desktop Node runtime, not phone FPS or isolated CPU time.

Useful behavior must be interpreted alongside survival/resource costs. More construction or more tests is not necessarily better. Reachable modern-style component capabilities are tested independently with **explicit executor fixtures**; their availability is not evidence that unaided natural runs reach them.

Commands: `npm run benchmark:development`, add `-- --evaluation`, `-- --long`, `-- --mode=directed`, or `-- --discovery`. Output files are `docs/workshop-*.json`. Baseline 72-hour regressions remain part of the full test suite.

Later reruns use `--tag=release` to retain earlier results rather than overwrite them. See `OPEN_WORKSHOP_REPORT.md` for the candidate-vs-release source distinction and all reported outcomes. The stored `contradictoryMeasurements` field counts residuals above 0.15; it is not a complete useful-adaptation classifier. Node heap/RSS are final snapshots, not measured peaks. No formal preventability classifier is implemented.
