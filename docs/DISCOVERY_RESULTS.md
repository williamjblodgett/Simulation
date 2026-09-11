# Milestone 1 recorded results

Generated from raw JSON by `node scripts/report-discovery.mjs`. Each row is one run. Agents sharing a run are not independent trials. No result is filtered by success.

## Interpretation and data quality

Directed = decision-relevant optional tests; frozen = contextual parameter updates/use frozen but evidence/procedures retained; random = locally cost/time-ceiling-matched feasible test alternatives; none = no optional tests; fixed = the competent shared survival planner plus a fixed construction proposal, not a fixed whole-life script.

Random budgets are locally matched, not globally yoked after trajectories diverge. ‘Adapt’ counts reconsiderations following evidence, not proven useful adaptation. Material damage means mass remaining in parts below 0.1 condition, not destroyed mass. Work is cumulative normalized physical-work energy, not all travel/metabolism costs. Physical-test counts come from the authoritative ledger.

Raw early logger fields `gathered: 0` are **unavailable**, not zero collection. Its event contract did not supply amounts. Drink/meal counters count confirmed actions, not mass. Legacy policy-4 notebook counter zeros (including expansions, measuredTests and unconfirmedParts) are also **unavailable**. Neither is used in comparisons below. The logger is corrected for subsequent runs; originals are retained unchanged.

No automated preventability conclusion is drawn from a death cause. Prediction RMSE is descriptive of each policy’s selected tests, not error on a common held-out measurement set. Model uncertainty is not a calibrated probability.

## Development · natural

[Raw records](discovery-development-natural-all-matrix.json) · 15/15 rows recorded.

Engine-source fingerprint: `74bf42cc7f494f0b75266e1535d36684452876f1c48b48387b2a0c533393a8af`.

| Seed | Arm | Alive/start | Status | Tests | Work | Damaged mass | Adapt | RMSE | Blocked/repeated |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| discovery-dev-basin-1 | directed | 3/3 | completed | 6 | 8.00 | 0.00 | 0 | 0.242 | 0/0 |
| discovery-dev-basin-1 | frozen | 3/3 | completed | 6 | 8.00 | 0.00 | 0 | 0.247 | 0/0 |
| discovery-dev-basin-1 | random | 3/3 | completed | 6 | 8.00 | 0.00 | 0 | 0.171 | 0/0 |
| discovery-dev-basin-1 | none | 3/3 | completed | 0 | 2.20 | 0.00 | 0 | — | 0/0 |
| discovery-dev-basin-1 | fixed | 3/3 | completed | 0 | 0.00 | 0.00 | 0 | — | 0/0 |
| discovery-dev-cold-2 | directed | 3/3 | completed | 8 | 13.00 | 0.00 | 0 | 0.179 | 0/0 |
| discovery-dev-cold-2 | frozen | 3/3 | completed | 9 | 13.60 | 0.00 | 0 | 0.184 | 0/0 |
| discovery-dev-cold-2 | random | 3/3 | completed | 5 | 14.00 | 0.00 | 0 | 0.252 | 0/0 |
| discovery-dev-cold-2 | none | 3/3 | completed | 0 | 6.60 | 0.00 | 0 | — | 0/0 |
| discovery-dev-cold-2 | fixed | 3/3 | completed | 0 | 2.20 | 0.00 | 0 | — | 0/0 |
| discovery-dev-scarce-3 | directed | 3/3 | completed | 6 | 12.40 | 0.00 | 1 | 0.202 | 0/0 |
| discovery-dev-scarce-3 | frozen | 3/3 | completed | 6 | 12.40 | 0.00 | 1 | 0.202 | 0/0 |
| discovery-dev-scarce-3 | random | 3/3 | completed | 11 | 13.20 | 0.00 | 0 | 0.040 | 0/0 |
| discovery-dev-scarce-3 | none | 3/3 | completed | 0 | 13.20 | 1.33 | 0 | — | 0/0 |
| discovery-dev-scarce-3 | fixed | 3/3 | completed | 0 | 2.20 | 0.00 | 0 | — | 0/0 |

### Measured computation and storage

Node on a shared Windows desktop, with overlapping test/benchmark processes. Not isolated CPU performance, browser worker latency, mobile FPS or a promise of off-browser execution. Checkpoint size is sampled plus the final value. RSS includes the runtime and allocator, not only agent memory.

| Seed / arm | Run ms | Step p50 / p95 / max ms | Expansions | Peak checkpoint bytes | RSS bytes | Valid |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| discovery-dev-basin-1 / directed | 78109 | 178.4 / 380.8 / 771.7 | 1604435 | 1805234 | 371961856 | yes |
| discovery-dev-basin-1 / frozen | 74431 | 184.1 / 300.8 / 346.8 | 1604435 | 1786002 | 373387264 | yes |
| discovery-dev-basin-1 / random | 66583 | 171.7 / 234.2 / 382.6 | 1589878 | 1722410 | 373764096 | yes |
| discovery-dev-basin-1 / none | 47416 | 114.5 / 194.5 / 232.1 | 1457447 | 1364360 | 372219904 | yes |
| discovery-dev-basin-1 / fixed | 34649 | 83.4 / 124.5 / 175.9 | 1559633 | 1376111 | 389894144 | yes |
| discovery-dev-cold-2 / directed | 173032 | 296.9 / 997.5 / 1202.1 | 1308676 | 1989174 | 376987648 | yes |
| discovery-dev-cold-2 / frozen | 164207 | 295.8 / 854.2 / 1129.8 | 1303265 | 1891642 | 377970688 | yes |
| discovery-dev-cold-2 / random | 171147 | 320.4 / 959.3 / 1109.6 | 1338014 | 1945690 | 379015168 | yes |
| discovery-dev-cold-2 / none | 69936 | 163.1 / 320.2 / 370.6 | 1394849 | 1602786 | 379023360 | yes |
| discovery-dev-cold-2 / fixed | 62942 | 157.9 / 242.2 / 298.0 | 1555695 | 1427803 | 375955456 | yes |
| discovery-dev-scarce-3 / directed | 32212 | 64.0 / 150.0 / 362.1 | 1287680 | 1471246 | 387264512 | yes |
| discovery-dev-scarce-3 / frozen | 32573 | 66.8 / 155.9 / 376.3 | 1287680 | 1461047 | 379637760 | yes |
| discovery-dev-scarce-3 / random | 36305 | 60.7 / 175.0 / 1217.4 | 1217887 | 1386871 | 380059648 | yes |
| discovery-dev-scarce-3 / none | 30823 | 58.2 / 191.9 / 387.2 | 1054205 | 1336118 | 384585728 | yes |
| discovery-dev-scarce-3 / fixed | 28717 | 61.8 / 129.7 / 208.2 | 1301615 | 1348420 | 378261504 | yes |

## Development · explicit exposure fixture

[Raw records](discovery-development-pressure-all-matrix.json) · 15/15 rows recorded.

Engine-source fingerprint: `74bf42cc7f494f0b75266e1535d36684452876f1c48b48387b2a0c533393a8af`.

| Seed | Arm | Alive/start | Status | Tests | Work | Damaged mass | Adapt | RMSE | Blocked/repeated |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| discovery-dev-basin-1 | directed | 1/1 | completed | 2 | 5.60 | 0.00 | 0 | 0.252 | 0/0 |
| discovery-dev-basin-1 | frozen | 1/1 | completed | 2 | 5.60 | 0.00 | 0 | 0.252 | 0/0 |
| discovery-dev-basin-1 | random | 1/1 | completed | 4 | 9.00 | 0.00 | 2 | 0.199 | 0/0 |
| discovery-dev-basin-1 | none | 1/1 | completed | 0 | 4.40 | 0.00 | 0 | — | 0/0 |
| discovery-dev-basin-1 | fixed | 1/1 | completed | 0 | 2.20 | 0.00 | 0 | — | 0/0 |
| discovery-dev-cold-2 | directed | 0/1 | extinct; environmental injury @ 41.83h | 2 | 3.40 | 0.00 | 2 | 0.052 | 0/0 |
| discovery-dev-cold-2 | frozen | 0/1 | extinct; environmental injury @ 41.83h | 2 | 3.40 | 0.00 | 2 | 0.061 | 0/0 |
| discovery-dev-cold-2 | random | 0/1 | extinct; environmental injury @ 41.83h | 2 | 3.40 | 0.00 | 2 | 0.052 | 0/0 |
| discovery-dev-cold-2 | none | 1/1 | completed | 0 | 8.20 | 0.00 | 0 | — | 0/0 |
| discovery-dev-cold-2 | fixed | 1/1 | completed | 0 | 2.20 | 0.00 | 0 | — | 0/0 |
| discovery-dev-scarce-3 | directed | 1/1 | completed | 4 | 6.80 | 0.00 | 0 | 0.070 | 0/0 |
| discovery-dev-scarce-3 | frozen | 1/1 | completed | 3 | 8.40 | 0.00 | 0 | 0.150 | 0/0 |
| discovery-dev-scarce-3 | random | 1/1 | completed | 4 | 6.80 | 0.00 | 0 | 0.055 | 0/0 |
| discovery-dev-scarce-3 | none | 1/1 | completed | 0 | 24.20 | 4.05 | 0 | — | 0/0 |
| discovery-dev-scarce-3 | fixed | 1/1 | completed | 0 | 2.20 | 0.00 | 0 | — | 0/0 |

### Measured computation and storage

Node on a shared Windows desktop, with overlapping test/benchmark processes. Not isolated CPU performance, browser worker latency, mobile FPS or a promise of off-browser execution. Checkpoint size is sampled plus the final value. RSS includes the runtime and allocator, not only agent memory.

| Seed / arm | Run ms | Step p50 / p95 / max ms | Expansions | Peak checkpoint bytes | RSS bytes | Valid |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| discovery-dev-basin-1 / directed | 8485 | 21.5 / 31.9 / 87.2 | 326599 | 1326183 | 250929152 | yes |
| discovery-dev-basin-1 / frozen | 14960 | 35.8 / 71.9 / 102.8 | 326599 | 1324025 | 256483328 | yes |
| discovery-dev-basin-1 / random | 11568 | 31.1 / 50.0 / 79.7 | 292732 | 1326156 | 270413824 | yes |
| discovery-dev-basin-1 / none | 7894 | 21.3 / 30.6 / 57.6 | 284779 | 1243010 | 279666688 | yes |
| discovery-dev-basin-1 / fixed | 8940 | 22.4 / 40.1 / 61.7 | 285875 | 1108361 | 269930496 | yes |
| discovery-dev-cold-2 / directed | 10683 | 40.8 / 76.6 / 106.4 | 306439 | 938784 | 364417024 | yes |
| discovery-dev-cold-2 / frozen | 10992 | 41.9 / 81.8 / 118.0 | 306439 | 931881 | 367718400 | yes |
| discovery-dev-cold-2 / random | 11611 | 43.4 / 85.6 / 114.9 | 306439 | 938782 | 360337408 | yes |
| discovery-dev-cold-2 / none | 24593 | 31.7 / 142.1 / 216.3 | 328468 | 1443031 | 365289472 | yes |
| discovery-dev-cold-2 / fixed | 12814 | 29.5 / 56.2 / 79.5 | 369043 | 1249441 | 364806144 | yes |
| discovery-dev-scarce-3 / directed | 13572 | 34.1 / 66.9 / 92.6 | 293102 | 1143135 | 366682112 | yes |
| discovery-dev-scarce-3 / frozen | 13363 | 33.3 / 60.9 / 146.8 | 292154 | 1433626 | 367931392 | yes |
| discovery-dev-scarce-3 / random | 12636 | 32.0 / 63.1 / 84.6 | 286480 | 1147252 | 368066560 | yes |
| discovery-dev-scarce-3 / none | 16109 | 20.1 / 124.2 / 279.9 | 233679 | 2266913 | 370974720 | yes |
| discovery-dev-scarce-3 / fixed | 13630 | 32.9 / 74.6 / 111.9 | 267091 | 1258816 | 366706688 | yes |

## Untouched evaluation · natural

[Raw records](discovery-evaluation-natural-all-matrix.json) · 15/15 rows recorded.

Engine-source fingerprint: `74bf42cc7f494f0b75266e1535d36684452876f1c48b48387b2a0c533393a8af`.

| Seed | Arm | Alive/start | Status | Tests | Work | Damaged mass | Adapt | RMSE | Blocked/repeated |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| discovery-eval-estuary-641 | directed | 1/1 | completed | 3 | 6.20 | 0.00 | 0 | 0.312 | 0/0 |
| discovery-eval-estuary-641 | frozen | 1/1 | completed | 3 | 6.20 | 0.00 | 0 | 0.312 | 0/0 |
| discovery-eval-estuary-641 | random | 1/1 | completed | 4 | 6.80 | 0.00 | 1 | 0.261 | 0/0 |
| discovery-eval-estuary-641 | none | 1/1 | completed | 0 | 4.40 | 0.00 | 0 | — | 0/0 |
| discovery-eval-estuary-641 | fixed | 1/1 | completed | 0 | 0.00 | 0.00 | 0 | — | 0/0 |
| discovery-eval-ridge-829 | directed | 3/3 | completed | 1 | 2.80 | 0.00 | 0 | 0.087 | 0/0 |
| discovery-eval-ridge-829 | frozen | 3/3 | completed | 1 | 2.80 | 0.00 | 0 | 0.087 | 0/0 |
| discovery-eval-ridge-829 | random | 3/3 | completed | 1 | 2.80 | 0.00 | 0 | 0.087 | 0/0 |
| discovery-eval-ridge-829 | none | 3/3 | completed | 0 | 2.20 | 0.00 | 0 | — | 0/0 |
| discovery-eval-ridge-829 | fixed | 3/3 | completed | 0 | 0.00 | 0.00 | 0 | — | 0/0 |
| discovery-eval-cove-173 | directed | 5/5 | completed | 27 | 33.80 | 0.27 | 19 | 0.287 | 0/0 |
| discovery-eval-cove-173 | frozen | 5/5 | completed | 26 | 33.20 | 0.27 | 19 | 0.261 | 0/0 |
| discovery-eval-cove-173 | random | 5/5 | completed | 23 | 28.60 | 0.00 | 19 | 0.119 | 7/1 |
| discovery-eval-cove-173 | none | 5/5 | completed | 0 | 33.00 | 4.21 | 0 | — | 0/0 |
| discovery-eval-cove-173 | fixed | 5/5 | completed | 0 | 4.40 | 0.00 | 0 | — | 0/0 |

### Measured computation and storage

Node on a shared Windows desktop, with overlapping test/benchmark processes. Not isolated CPU performance, browser worker latency, mobile FPS or a promise of off-browser execution. Checkpoint size is sampled plus the final value. RSS includes the runtime and allocator, not only agent memory.

| Seed / arm | Run ms | Step p50 / p95 / max ms | Expansions | Peak checkpoint bytes | RSS bytes | Valid |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| discovery-eval-estuary-641 / directed | 20375 | 57.2 / 82.4 / 111.3 | 546266 | 1083600 | 364265472 | yes |
| discovery-eval-estuary-641 / frozen | 17953 | 52.8 / 67.2 / 87.7 | 546266 | 1081638 | 361500672 | yes |
| discovery-eval-estuary-641 / random | 17748 | 50.9 / 69.6 / 99.8 | 528278 | 1104985 | 363905024 | yes |
| discovery-eval-estuary-641 / none | 17330 | 50.7 / 65.2 / 75.9 | 539895 | 1010286 | 362045440 | yes |
| discovery-eval-estuary-641 / fixed | 16686 | 46.7 / 74.9 / 92.5 | 539474 | 1267681 | 364605440 | yes |
| discovery-eval-ridge-829 / directed | 56708 | 134.7 / 250.0 / 352.9 | 1478656 | 1196053 | 364486656 | yes |
| discovery-eval-ridge-829 / frozen | 52493 | 125.8 / 234.1 / 274.0 | 1478656 | 1195599 | 367927296 | yes |
| discovery-eval-ridge-829 / random | 52096 | 123.4 / 232.8 / 275.0 | 1478656 | 1196047 | 368164864 | yes |
| discovery-eval-ridge-829 / none | 52585 | 119.8 / 237.6 / 278.4 | 1485856 | 1192949 | 368582656 | yes |
| discovery-eval-ridge-829 / fixed | 40852 | 94.8 / 183.1 / 223.1 | 1383625 | 914403 | 369750016 | yes |
| discovery-eval-cove-173 / directed | 148215 | 234.6 / 1224.9 / 2436.1 | 1877566 | 2442909 | 383094784 | yes |
| discovery-eval-cove-173 / frozen | 134540 | 220.5 / 1069.5 / 2250.4 | 1760643 | 2275446 | 396754944 | yes |
| discovery-eval-cove-173 / random | 265783 | 219.1 / 2788.6 / 4177.5 | 1503320 | 2130712 | 396296192 | yes |
| discovery-eval-cove-173 / none | 127172 | 188.3 / 778.1 / 1355.7 | 1997865 | 2341821 | 400060416 | yes |
| discovery-eval-cove-173 / fixed | 89141 | 148.2 / 701.9 / 849.7 | 2040011 | 1851100 | 407830528 | yes |

## Long development · 168 hours

[Raw records](discovery-development-long-directed-matrix.json) · 1/1 rows recorded.

Engine-source fingerprint: `74bf42cc7f494f0b75266e1535d36684452876f1c48b48387b2a0c533393a8af`.

| Seed | Arm | Alive/start | Status | Tests | Work | Damaged mass | Adapt | RMSE | Blocked/repeated |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| discovery-dev-long-4 | directed | 1/1 | completed | 1 | 4.40 | 0.00 | 0 | 0.087 | 0/0 |

### Measured computation and storage

Node on a shared Windows desktop, with overlapping test/benchmark processes. Not isolated CPU performance, browser worker latency, mobile FPS or a promise of off-browser execution. Checkpoint size is sampled plus the final value. RSS includes the runtime and allocator, not only agent memory.

| Seed / arm | Run ms | Step p50 / p95 / max ms | Expansions | Peak checkpoint bytes | RSS bytes | Valid |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| discovery-dev-long-4 / directed | 43276 | 31.1 / 109.1 / 236.6 | 1034513 | 1365118 | 367816704 | yes |

## Preserved policy 3 · 72-hour regression

[Raw records](discovery-development-legacy-all-matrix.json) · 4/4 rows recorded.

Engine-source fingerprint: `74bf42cc7f494f0b75266e1535d36684452876f1c48b48387b2a0c533393a8af`.

| Seed | Arm | Alive/start | Status | Tests | Work | Damaged mass | Adapt | RMSE | Blocked/repeated |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| construction-review-1 | legacy-3 | 3/3 | completed | 75 | 113.60 | 6.74 | — | — | 0/0 |
| survival-audit-1 | legacy-3 | 3/3 | completed | 54 | 97.40 | 4.04 | — | — | 2/1 |
| survival-audit-2 | legacy-3 | 3/3 | completed | 39 | 80.20 | 0.47 | — | — | 1/0 |
| survival-audit-3 | legacy-3 | 3/3 | completed | 61 | 96.40 | 0.00 | — | — | 6/4 |

### Measured computation and storage

Node on a shared Windows desktop, with overlapping test/benchmark processes. Not isolated CPU performance, browser worker latency, mobile FPS or a promise of off-browser execution. Checkpoint size is sampled plus the final value. RSS includes the runtime and allocator, not only agent memory.

| Seed / arm | Run ms | Step p50 / p95 / max ms | Expansions | Peak checkpoint bytes | RSS bytes | Valid |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| construction-review-1 / legacy-3 | 174657 | 277.8 / 1397.7 / 2470.3 | — | 1725564 | 371290112 | yes |
| survival-audit-1 / legacy-3 | 289394 | 499.7 / 1791.7 / 3131.3 | — | 2137060 | 373096448 | yes |
| survival-audit-2 / legacy-3 | 317784 | 450.6 / 2045.6 / 2769.0 | — | 1759616 | 373723136 | yes |
| survival-audit-3 / legacy-3 | 198817 | 378.0 / 1204.4 / 1635.5 | — | 1878924 | 376070144 | yes |

## Completeness

50/50 predeclared run outcomes recorded. 3 runs contain deaths. 0 report execution or checkpoint-validation errors.

## Earlier development outcomes

These raw records predate the final geometry/experiment-selection implementation and the engine fingerprint. They informed fixes and are regression data, **not additional independent trials of the final policy**. One early pressure logger failed to forward the declared climate/resource configuration; it cannot support that intended cross-environment comparison. Retained for transparency:

- [discovery-development-natural-directed-matrix.json](discovery-development-natural-directed-matrix.json): discovery-dev-basin-1: 3/3 alive, completed; discovery-dev-cold-2: 3/3 alive, completed; discovery-dev-scarce-3: 3/3 alive, completed.
- [discovery-development-pressure-directed-matrix.json](discovery-development-pressure-directed-matrix.json): discovery-dev-basin-1: 1/1 alive, completed; discovery-dev-cold-2: 0/1 alive, extinct; discovery-dev-scarce-3: 1/1 alive, completed.
- [discovery-development-pressure-directed-discovery-dev-cold-2.json](discovery-development-pressure-directed-discovery-dev-cold-2.json): discovery-dev-cold-2: 0/1 alive, extinct.
