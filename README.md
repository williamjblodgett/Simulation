# Wildgrid: Sovereignty

An autonomous civilization simulation rendered in Three.js. Ten equal founders begin with independent camps, then decide how to survive, cooperate, wage war, form families, split into new powers, advance technology, develop beliefs, and rename themselves and their territories. The living population can grow to 1,000 autonomous agents. The simulation includes non-overlapping political borders, map overlays, family trees, influence rankings, a civilization archive, and distinct 200-day history chapters assembled from each era's defining events.

## Live editions

- GitHub Pages: <https://williamjblodgett.github.io/Simulation/>
- Persistent shared Site: <https://wildgrid-ai-habitat.williamjblodgett.chatgpt.site>

The shared Site uses a Cloudflare Worker and D1 database, with compressed world snapshots and an append-only historical ledger. The GitHub Pages edition is fully static, so it creates one autonomous world per browser profile, stores that world in IndexedDB, and catches up elapsed time when reopened.

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
