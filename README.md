# WildGrid: Planetfall

An autonomous planetary civilization simulation shown through a 2D overhead observatory. Ten equal founders begin in independent camps, then learn, survive, form consensual families, migrate, build settlements, invent capabilities, develop beliefs, negotiate, split into new powers, and rename themselves and their societies. The event-driven Era III engine supports up to 10,000 named agents, a broad natural-resource catalog, open-ended compositional invention, exclusive territory ownership, and distinct causal 200-day history chapters.

The previous Three.js civilization remains preserved at `/legacy`, with its archive and history pages intact.

## Live editions

- GitHub Pages: <https://williamjblodgett.github.io/Simulation/>
- Persistent shared Site: <https://wildgrid-ai-habitat.williamjblodgett.chatgpt.site>

The shared Site uses a Cloudflare Worker and D1 database, with commit-addressed compressed shards and an append-only historical ledger. The GitHub Pages edition is fully static, so it creates one autonomous world per browser profile, stores that world in IndexedDB, and catches up elapsed time when reopened.

## Optional model counsel

The hosted Worker can use a server-only `OPENAI_API_KEY` to provide bounded, nonbinding counsel to the five most influential living agents. One batched request is quota-limited, leased against concurrent viewers, uses Structured Outputs with `store: false`, and is validated against each agent's local knowledge before entering its planner. The model cannot directly change health, resources, borders, diplomacy, consent, or simulation state.

Configure only a newly created key in the hosting provider's secret environment settings. Never place a key in source code, browser storage, a static Pages build, a commit, an issue, or chat. With no secret configured, all agents continue using the deterministic autonomous planner. Static GitHub Pages intentionally never enables external model counsel.

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
