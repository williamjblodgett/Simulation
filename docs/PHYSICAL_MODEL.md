# Physical survival model (policy 3)

## Version and observation boundary

The new-run UI explicitly selects policy 3/schema 3. The public engine constructor
continues to default to policy 2 for existing integrations. Existing policies 1/2
are never converted into the new decision model on load. The same IndexedDB,
single-writer lease, revision checks, worker and event archive remain authoritative.
An older client rejects schema 3 instead of advancing it with old rules.

New studies default to the sole objective “Survive as long as possible.” Optional
continuity is a separate disclosed configuration. It is not claimed to follow
logically from individual survival after death. Manual admissions remain recorded
interventions, with a five-living-agent limit and immutable life IDs.

The planner receives its own agent record, observed boundaries, tick and seed—not
the physical registry, other agents' memories or future weather. Mass/volume is
visibly measurable; strengths and protective effects begin as fallible priors.
The physical evaluator is not imported by the policy. Search is deterministically
bounded (24 physical proposals plus the preserved 700-expansion survival search).

## Implemented representation and consequences

- Individual material parts: composition, mass-conserving dimensions, pose,
  condition, temperature/peak temperature, hollow fraction, retained water,
  creator and available source-site provenance.
- Connections: finite fiber bindings with endpoints, condition and load capacity.
- Typed operations: shape, place/rotate, split, join, detach, mix, heat, test,
  reclaim. Reach, lifting, fuel, available inventory, geometry and bounds are
  checked against the current world before a mutation succeeds.
- Simplified support graph with ancestor loads. Unsupported/overloaded parts
  remain inert damaged remnants; these are not silently removed or turned into a
  completed building. Fluid leaks and consumed fuel have explicit spent ledgers.
- Protection depends on nearby surface geometry, orientation, condition and
  porosity. Physiology uses a numeric protective fraction. No named shelter
  recipe or technology flag grants policy-3 construction bonuses.
- Freshwater/solid collision sensing prevents walking straight through modeled
  components or ponds. The construction study ground is flat; surrounding
  scenery is illustrative. This is not a navigation/rigid-body physics engine.
- One instanced physical collection renders actual dimensions, rotations,
  hollow surfaces, damaged remnants and bindings. No timer-generated buildings.

## Agent decisions, projects and evidence

Agents propose exposure-reduction projects from their forecast conditions. A
project has a measurable target, material reservation, operation sequence,
partial progress, cost and interruption/abandonment history. Proposals include
new shapes and edits to observed parts: reorientation, splitting, binding,
combining, heating, testing, reclaiming and placing additional connected parts.
Every one is only a proposal; legality and success are evaluated later. There is
no independent reward for making a building or collecting a discovery name.

Forecasts consume their copied food/water reserves. The forecasts are estimates,
not probabilities, exact future weather, or guaranteed survival. Existing plans
are reconsidered as conditions change; pressing needs can take precedence.

Load/retention tests record before/after readings and dose. Protection tests
compare the current assembly with a **modeled counterfactual** after removing a
part and re-evaluating support. This is not a real laboratory control experiment.
Every reading records its conditions and object revision. Estimates learn from
these readings; a learning-disabled ablation still records factual failures.
Successful arrangements become editable operation programs with relative poses,
material prerequisites, expected effects, uncertainty and tested conditions.
Transferring outside those conditions increases uncertainty and requires testing.

Consenting agents can communicate one measured result. Reported evidence is
labeled as testimony, not a personal trial. New successors get no inherited
private model, but can encounter persistent artifacts. Stable A1–A5 identities
remain; a deterministic local naming decision gives each life an environment-
derived name once immediate needs permit. This is not language-model agency.

## Deliberate limits (not implemented or claimed)

This release is a weather-protection construction sandbox, **not unrestricted
invention**. The goal proposal generator currently specializes in exposure;
hydration/nutrition are handled by the ordinary survival planner. Load, heat and
fluid probes can inform edits, but agents do not yet invent arbitrary machinery,
chemical processes, new bodily actions, software, or electrical systems.

Four property-bearing construction materials are modeled, not 118-element
chemistry. Material properties are homogeneous approximations. Heating is a
bounded fuel/work operation, not a combustion/thermodynamic solver. Rubble is
inert; joints do not simulate articulated mechanics. Carrying whole assemblies,
tool-making-driven labor bonuses, genuine biological reproduction and long-term
evolution of the action language remain future work.

The study caps physical parts at 160 and joints at 240, with bounded private
records. Parts persist until reclaimed. No superiority over random/fixed-recipe
policies or real-world engineering validity is claimed. Browser-local persistence
is explicitly device-local; execution stops when no tab owns the study.

## Verification

`tests/survival-physical.test.mjs` covers version compatibility, conservation,
failed actions, overlaps, bindings, cumulative loads, unnamed useful geometry,
heat/water accounting, private knowledge, interruption, learning ablation,
procedure translation, deterministic replay/save/restore, voluntary multi-day
behavior, validation, collision sensing and exact render dimensions.

The prior full suite must also pass before release. Browser QA and deployment
evidence are recorded separately in IMPLEMENTATION_REPORT.md.
