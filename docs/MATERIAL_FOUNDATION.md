# Raw-material foundation v1

## Scope and honest capability boundary

Source baseline: `42f14274a7c0d4bbfb7ed9c195f780ff8ca277e7` (2026-09-10).
The existing four bulk materials and physical operations are retained. New studies
created by the UI have 28 finite geological feedstock families. Agents can observe
their local appearance, collect raw rock through the existing gathering executor,
and use it in the existing structural/protection domain. Its provenance survives
shaping, splitting, mixing, heating, damage and reclamation.

**This does not yet give agents the physical ability to make modern technology.**
All these raw rocks still behave as the existing generic stone material. There is
no smelting, refined-metal inventory, circuit solver, powered mechanism, chemical
separation, semiconductor process or chemical-assay action. Heating an ore part
does not produce metal. This is a conserved geological endowment for future
implemented processing rules, not 28 invented technologies or a claim that waiting
long enough enables computers. No new reward or assigned invention was added.

## What is present

| Broad purpose for future world development | Raw feedstocks |
| --- | --- |
| Structures and alloys | Iron, copper, tin, aluminum-bearing bauxite, zinc, nickel, chromium, manganese, cobalt, titanium and tungsten ores |
| Conductors, storage and electronics | Copper, silver, gold, platinum-group and lithium ores; graphite, quartz-rich silica, borates, rare-earth-bearing and polymetallic rock |
| Mineral processing | Limestone, gypsum, salt, sulfur, phosphate and potash-bearing rock |
| Carbon/energy feedstocks | Coal-bearing rock and oil shale (not extracted coal fuel or crude oil) |

Existing wood, stone, fiber, clay, food, herbs and freshwater remain available under
their original rules. Air is not a collectible gas inventory. This is not a full
periodic table, a purity/grade specification, realistic ore geology, or a guarantee
of enough recoverable matter for any arbitrary machine. The broad polymetallic
family is not permission to conjure whichever missing element a future operation
requires; such processing must declare supported constituents and conservative
yields in a separately versioned model.

The selection is informed by the real-world breadth of materials used in energy
and industry described by [DOE](https://www.energy.gov/cmm/what-are-critical-minerals-and-materials)
and [USGS Mineral Commodity Summaries 2026](https://pubs.usgs.gov/publication/mcs2026).
Those sources do **not** supply this simulation's capacities or physical constants.

## Units, authored priors and accounting

- A quantity is a **normalized raw bulk-material unit**, the existing stone mass
  unit. It is not kilograms of refined product or a chemical element fraction.
- `geology.ts` records each family's authored initial stock (80–800 units in a
  balanced world); scarce/plentiful apply the existing 0.62/1.55 abundance factors.
  The miniature habitat deliberately contains one dry deposit of every family.
  Each placement has a fixed 512-attempt bound. If placement cannot fit all of them,
  creation fails rather than silently omitting a needed family.
- Mineral-site quantity is finite and has zero regeneration. Ordinary survival
  resources and their generation random calls/locations are unchanged.
- `rawFeedstocks` is a **subset** of carried `inventory.stone` or a physical part's
  `composition.stone`. Never add it to the bulk inventory a second time.
- Collection debits the actual local site only after reach/resource checks.
  Shaping transfers a proportional raw fraction after placement preflight; split
  divides it; mix combines it. Bulk batches are homogeneous, not chemically refined.
- Damage changes condition, not rock mass. Damaged parts retain their contents;
  reclamation returns the part's tracked composition under the existing executor.
  Heating consumes wood in the existing spent-fuel ledger, not ore stock. There is
  currently no mineral loss pathway; a later such process must record its waste.
- Save validation checks each family's initial stock equals remaining deposits plus
  holdings of **all** agents (including dead individuals) plus parts/remnants, with
  0.001-unit tolerance and bounded six-decimal bookkeeping. Unknown, negative,
  nonfinite, duplicated or missing provenance is rejected.
- New lives do not inherit a predecessor's raw holdings or private observations.
  Existing voluntary aid still transfers food/water only; this change adds no
  promises-as-inventory or new social transfer capability.

## Information layers and UI

The authoritative world holds feedstock identities and stock totals. The private
policy gets ordinary locally observed stone information plus a visible appearance,
not a chemical assay, deposit catalog, hidden holdings, potential-use table or world
seed. An ID denotes an encountered site, not supplied chemical knowledge.
`discoveryInput` explicitly copies/filters runtime fields; a type cast alone is not
the information boundary. The original protection/support learner and planner are
unchanged; they do not yet learn new ore-specific properties or plan metalworking.

Run has a collapsed **Raw-material world** observer ledger. The inspector exposes
carried mineral provenance only when present, explicitly included in stone rather
than additional stock. Observer diagnostics are not claims about what agents know.
The scene uses the existing stone-site rendering, not new misleading metal machines.

## Compatibility

`materialFoundation: "geology-v1"` is explicit and requires policy 4. It creates
schema 6 with `geology: { version: 1 }`. UI-created new studies select it; direct
engine callers without the option still receive their original resource model.
Existing studies, archives, histories, deaths and policy versions are not
retrofitted, reset or given new supplies. Schema 6 is accepted on recovery wrappers
around older policy-2/3/4 studies without claiming they contain new minerals.

Older clients reject format 6. Recovery fences remain monotonic: neither a fallback
nor committing a preserved older study downgrades a newer last-good checkpoint.
IndexedDB compare-and-swap, history transactions, worker separation and local-only
execution remain intact. Closing the browser still stops simulated time.

## Next smallest useful addition

Implement one material transformation end to end: a locally conducted ore test and
bounded reduction/separation process with explicit heat/fuel, support, yield, waste,
product properties and measurements. Feed that evidence into the existing planner;
permit rejection when survival benefit is insufficient. Only then expand towards
tools, controllable power, electrical components and manufacturing. These are
missing physical rules to implement, not a hidden sequence of unlocks for agents.

Verification protocol and outcomes: [MATERIAL_EVALUATION.md](MATERIAL_EVALUATION.md)
and [MATERIAL_RESULTS.md](MATERIAL_RESULTS.md).
