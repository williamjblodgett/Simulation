# Simulation

An observational survival study for up to five living autonomous agents in a shared Three.js habitat. Each agent receives the primary goal—survive as long as possible—then acts from its own nearby evidence, needs, memories, relationships, and confirmed outcomes. Agents can explore, gather, cooperate, build, and choose whether to run bounded research tests; the observer configures a run and watches without issuing survival commands. The next-generation update adds an explicitly authored, optional continuity objective, subordinate to immediate survival.

New interactive studies are open-ended: their modeled clock has no automatic completion horizon. They advance only while a browser tab is actively running the local worker. Death remains permanent, extinction remains possible, and closing every tab pauses the study instead of fabricating off-browser history. Explicit finite durations remain available to code-driven regression and evaluation harnesses; preserved completed studies are not rewritten.

The earlier large-scale planetary civilization and Three.js civilization studies remain available as preserved prior models from the Run screen.

## Live edition

- GitHub Pages: <https://williamjblodgett.github.io/Simulation/>

The bounded autonomous-discovery release was published and publicly verified on
September 10, 2026. [Release evidence and screenshots](docs/DISCOVERY_RELEASE.md).

The woodland presentation update adds branching foliage, detailed shores and
stone, consistent adult-proportioned characters, and a restrained field-study
interface. [Current changes, screenshots and publication status](docs/WOODLAND_RELEASE.md).
Published and publicly verified September 11, 2026; reload open tabs for the new UI.
It also includes the [raw-material foundation](docs/MATERIAL_FOUNDATION.md):
28 finite geological feedstock families for explicitly new UI studies, using
policy 4 / schema 6. Existing studies retain their original resource endowment.
This is material accounting, not implemented refining, electronics or modern
manufacturing. No observer-selected invention or automatic technological
progression was added.

Newly configured survival studies can additionally use **policy 4 / schema 7**
material processing and adaptive state. Agents can form a survival-derived
capability goal, prepare carbon-rich fuel, separate locally observed copper- or
iron-bearing rock, build and wear a fired hearth, attempt reduction, hot-work the
retained product and physically test a degrading tool. Every accepted intervention
pays time, energy and material costs; unsuccessful heating leaves explicit products,
waste and provenance instead of refunding inputs. Exact grades and thresholds remain
hidden from the policy. A disclosed catalog supplies broad physical priors, while
contextual expectations come from each life&apos;s own measurements.

Fear, frustration, confidence, curiosity and social need now act as persistent,
bounded decision weights for those new studies. They respond to factual needs,
weather, uncertainty, isolation and confirmed outcomes. They are not a claim of
sentience, personality or hidden chain-of-thought, and curiosity never rewards raw
novelty or construction. See [material processing and adaptive state](docs/MATERIAL_PROCESSING_AND_AFFECT.md)
for implemented rules, units, information isolation, compatibility and limits.

The survival study keeps revisioned checkpoints and a per-study event ledger in IndexedDB on this device. Previous studies can be listed and exported from Run. Each archive retains at most 100,000 events; Timeline pages a bounded window. Earlier records lost before this upgrade cannot be reconstructed. Browser storage is not a remote backup—export important studies.

The discovery release introduced **policy 4 / schema 5**: private protection goals, support dependencies, contextual predictions, decision-directed physical tests and reusable executed procedures. Existing policy-1/2/3 studies keep their policy family; refresh loads the interface but does not convert an existing study. The public constructor still defaults to policy 2 for integrations. A worker runs calculations while the browser can execute; it does not continue after every tab is closed. The static build makes no model/API calls. Preserved planetary studies keep separate records. See the [discovery release, verification and evaluation report](docs/DISCOVERY_RELEASE.md), including retained negative results and publication receipts.

This is bounded simulation autonomy, not general intelligence. Designers supply physiology, the action language, initial estimates and simplified material laws. Policy 3 removes the named shelter/research recipes from its planner; proposed shapes, edits and tests can fail. Its project generator currently specializes in exposure reduction, not arbitrary machinery, electricity or full chemistry. See [physical model and explicit limits](docs/PHYSICAL_MODEL.md). New runs default to individual survival only; optional continuity can be enabled separately in setup.

### Adding agents and next generations

In policies 3 and 4, the succession behavior below runs only when optional continuity was enabled at setup. Survival-only studies never fund an autonomous successor. This distinction does not change saved policy-2 studies.

Use **Add agent** in Agents or Run to fill unused slots without restarting, even before a death or after extinction. The limit is five **living** agents, not five lives over the entire study. Observer additions are logged and preserve pause. Preserved finite studies can be made open-ended before completion; completed records remain final and cannot be extended by admitting another agent.

Policy-2 agents may plan their own successor before death, or sponsor one after personally observing another agent's death. After at least six modeled hours of experience, they evaluate private evidence, forecast needs and retained reserves. They can defer or decline. Committing reserves 0.5 food and 0.5 water; the kit transfers once when the predecessor is dead and a slot is free. Conflicting requests receive an admission result without spending supplies. A new life has a unique ID and lineage, but no inherited memory, research or assigned role. This is abstract admission, not biological reproduction or resurrection. The expanded inspector and Timeline expose decisions and outcomes.

Older policy-2 saves enable these additional rules on their next advancing tick with an audit event; normalization invents no historical decisions. Policy-1 autonomous advancement stays frozen, while the observer's ability to add up to five agents applies to either policy. Long open-ended studies retain all life/lineage records, so checkpoint size can grow even with only five agents alive.

The observer and next-generation updates are published to GitHub Pages. See [implementation and verification report](docs/IMPLEMENTATION_REPORT.md) for deployed revisions, delivered changes, historical benchmark results, actual browser coverage and remaining strategy work. Refresh already-open tabs after updating; the new save version prevents older clients from advancing the previous rules. Future local changes still require an explicit release.

### Moving through water

Active survival studies support autonomous wading and swimming through inland
freshwater. Crossings are slower and cost energy and warmth; agents can compare a
crossing with an observed bank route and head ashore before resting or working.
Severe exhaustion in deep water can injure an agent. The world, roster and inspector
show the same movement state, and Timeline records entry and reaching dry land.
Crossing does not collect or drink water. Existing studies need no reset; refresh
the page to load the updated rules. The distant ocean remains outside study bounds.

### Construction and observation

Physical studies now include private geometric clearance/support reasoning,
material and striker prerequisites, retained interrupted work, bounded retry and
repositioning, and experience-based return to previously useful protection sites.
Agents still choose whether the predicted survival benefit justifies construction;
they receive no building assignment or reward for producing a named invention.

Select a physical part in World, or use **Inspect constructions**, to see its
maker, project, current condition, tests and use records. Dashed outlines are
proposals, not completed parts. Agent details expose the current project and
blocker; Timeline can group exact project records; the map can show an agent's
private observations separately from the observer's full map.

Policy-3 saves adopt construction-reasoning version 2 on their next advancing
tick, with an audit event. Paused saves and prior history are not rewritten.
Earlier policy-1/2 studies remain intact; configure a new run to use physical
construction. Newer physical saves are rejected by older clients, so refresh all
open tabs. See [construction release verification](docs/CONSTRUCTION_RELEASE.md).

## Survival recovery update

The survival recovery implementation retains complete need-restoration alternatives,
estimates time to physiological harm, navigates around privately observed geometry,
and learns person/resource-specific expectations from refused aid. Requested aid
is evaluated as uncertain; it is never added to actual inventory before transfer.
Construction collision checks include every living body, and existing invalid
contact overlaps can be exited continuously without allowing movement through walls.

Schema-4 checkpoints fence older clients after adoption. Existing policy-2/3 studies
adopt survival revision 1 on their next advancing tick, with an audit event. Paused
and ended studies are not silently upgraded; earlier deaths and events are retained.
Policy 1 remains the frozen original engine. Refresh all open tabs before advancing.
Backup recovery also fences out old clients. A pre-adoption backup retains its
original history and gains only the format fence; rule adoption and measurements
still begin on its next advancing tick.

Agent details and death events now expose a factual death review: hourly need
measurements, confirmed consumption, blocked moves, refused requests, final plans,
and retained resource observations. These observer measurements are excluded from
policy inputs. Measurements start at adoption and cannot reconstruct an older life.
Timeline display options can group repeated failures while retaining exact records
and unchanged exports.

Run `npm run benchmark:recovery` for the reproduced failing scenarios, and add
`-- --holdout` for additional seeds with one, three and five agents and varied
conditions. Survival remains uncertain; these are competence checks, not proof of
general intelligence or a guarantee of survival. Publication is verified against
the compiled asset identifiers recorded in the report below.
See [survival recovery verification](docs/SURVIVAL_RECOVERY.md) for the implemented
changes, scenario results, save compatibility, and remaining limits.

## Security boundary

Never place an API key in source code, browser storage, a static Pages build, a commit, an issue, or chat. This edition uses the deterministic local planner and requires no model credential.

## Development

Requires Node.js 22.13 or newer.

```bash
npm install
npm run dev
npm test
```

Build the static GitHub Pages edition with:

```bash
npm run typecheck:pages
npm run build:pages
```

The Pages build is emitted to `github-pages/dist` with the `/Simulation/` base path.

## Reproducible evaluation

`npm run benchmark:survival` runs paired development scenarios; add `-- --holdout` for the held-out set. Both compare the frozen original engine, policy 2 and policy 2 with contextual learning cleared each step. This ablation does not remove the experiment notebook. Recorded results in `docs/autonomy-development-results.json` and `docs/autonomy-heldout-results.json` predate next-generation planning and do not establish its survival performance.

Unit tests include private-knowledge isolation, exact-ration planning, learning-induced source choice, research controls, checkpoint corruption, transactional rollback, competing revisions, archive export and worker cancellation. IndexedDB unit tests use an in-memory implementation; browser cross-tab checks are separate.
