# Simulation

An observational survival study for up to five living autonomous agents in a shared Three.js habitat. Each agent receives the primary goal—survive as long as possible—then acts from its own nearby evidence, needs, memories, relationships, and confirmed outcomes. Agents can explore, gather, cooperate, build, and choose whether to run bounded research tests; the observer configures a run and watches without issuing survival commands. The next-generation update adds an explicitly authored, optional continuity objective, subordinate to immediate survival.

The earlier large-scale planetary civilization and Three.js civilization studies remain available as preserved prior models from the Run screen.

## Live edition

- GitHub Pages: <https://williamjblodgett.github.io/Simulation/>

The survival study keeps revisioned checkpoints and a per-study event ledger in IndexedDB on this device. Previous studies can be listed and exported from Run. Each archive retains at most 100,000 events; Timeline pages a bounded window. Earlier records lost before this upgrade cannot be reconstructed. Browser storage is not a remote backup—export important studies.

New studies configured in the UI use policy 3: private survival planning, self-proposed exposure projects, physical parts and connections, material tests, fallible learned estimates and reusable procedures. Existing policy-1/2 studies keep their original engine; the public constructor still defaults to policy 2 for existing integrations. A worker runs calculations while the browser can execute; it does not continue after every tab is closed. The static build makes no model/API calls. Preserved planetary studies keep separate records.

This is bounded simulation autonomy, not general intelligence. Designers supply physiology, the action language, initial estimates and simplified material laws. Policy 3 removes the named shelter/research recipes from its planner; proposed shapes, edits and tests can fail. Its project generator currently specializes in exposure reduction, not arbitrary machinery, electricity or full chemistry. See [physical model and explicit limits](docs/PHYSICAL_MODEL.md). New runs default to individual survival only; optional continuity can be enabled separately in setup.

### Adding agents and next generations

In policy 3, the succession behavior below runs only when optional continuity was enabled at setup. Survival-only studies never fund an autonomous successor. This distinction does not change saved policy-2 studies.

Use **Add agent** in Agents or Run to fill unused slots without restarting, even before a death or after extinction. The limit is five **living** agents, not five lives over the entire study. Observer additions are logged and preserve pause. A completed observation period cannot be extended by admitting another agent.

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
