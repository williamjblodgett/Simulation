# Simulation

An observational survival study for up to five autonomous agents in a shared Three.js habitat. Each agent receives the same single pre-given goal—survive as long as possible—then acts from its own nearby evidence, needs, memories, relationships, and confirmed outcomes. Agents can explore, gather, cooperate, build, and choose whether to run bounded research tests; the observer configures a run and watches without issuing survival commands.

The earlier large-scale planetary civilization and Three.js civilization studies remain available as preserved prior models from the Run screen.

## Live edition

- GitHub Pages: <https://williamjblodgett.github.io/Simulation/>

The primary survival study stores one run in browser storage on the observer's device. The static GitHub Pages build cannot protect server secrets and therefore never makes paid model calls. Preserved planetary studies keep their own separate device-local records.

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
