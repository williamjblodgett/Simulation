# Physical survival model (policy 3)

This document describes the **preserved policy-3 behavior**. New UI studies in
the current working tree use policy 4/schema 5; its runtime sensing boundary,
local measurements and learning rules are documented in
[Milestone 1](DISCOVERY_MILESTONE_1.md). No existing study is converted to policy 4.

## Version and observation boundary

The preceding release's new-run UI selected policy 3/format 4. The public engine constructor
continues to default to policy 2 for existing integrations. Existing policies 1/2
are never converted into the new decision model on load. The same IndexedDB,
single-writer lease, revision checks, worker and event archive remain authoritative.
An older client rejects format 4 instead of advancing it with old rules. Active
policy-2/3 studies adopt survival revision 1 on their next advancing tick; this
does not convert policy 2 into the physical model. Backup format fences do not
invent past measurements. See [survival recovery](SURVIVAL_RECOVERY.md).

Construction-reasoning revision 2 is carried by each physical mind. Existing
policy-3 minds upgrade only at an advancing tick, with an audit event; loading or
pausing alone never rewrites evidence. Older clients reject the newer mind
version. Policy-1/2 models are not converted.

New studies default to the sole objective “Survive as long as possible.” Optional
continuity is a separate disclosed configuration. It is not claimed to follow
logically from individual survival after death. Manual admissions remain recorded
interventions, with a five-living-agent limit and immutable life IDs.

The planner receives its own agent record, observed boundaries, tick and seed—not
the physical registry, other agents' memories or future weather. Mass/volume is
visibly measurable; strengths and protective effects begin as fallible priors.
The physical evaluator is not imported by the policy. Search is deterministically
bounded (24 physical proposals plus a 1,800-expansion survival search, with seven
levels and eighteen retained states). Observer-only death-review measurements
are excluded from policy inputs.

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
- Solid collision sensing prevents movement through modeled components. Freshwater
  supports wading and swimming with a shared bowl-depth model, slower travel,
  energy use and cold exposure. Agents compare crossings and bank waypoints from
  privately observed water outlines; immersed agents seek dry ground before resting
  or working. Exhaustion in deep water can damage health. Water entry and reaching
  shore are recorded, not mistaken for collecting/drinking. These movement rules
  apply to active policies 2/3 without replacing their records or changing policy 1.
  The construction ground outside ponds stays flat; distant coastal water is still
  scenery outside the study bounds. This is not a fluid/rigid-body physics engine.
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

Revision 2 checks proposed poses against recently observed dimensions, rotation,
support and water. It reserves a body-clear approach, seeks missing materials
(including a separate stone striker), and returns to its work site before
handling components. Failed operations retain completed work with short retry
delays and bounded recovery. Failed protection tests may prompt reorientation;
three unsuccessful recovery attempts or two days without progress can end a
project. Private observations may be incomplete, so valid-looking proposals can
still fail against the world's evaluator.

Completed resting, warming or sheltering at a protective arrangement records
local conditions, before/after warmth and experienced protection. This is not a
causal test of that part and does not update material-property coefficients.
Remembered test/use locations can compete with other actions as future resting
sites, discounted for age and changed conditions. No build-for-its-own-sake reward
is added. The inspector separates proposed geometry, realized parts, test
readings and experiences; grouping timeline records never creates missing events.

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
