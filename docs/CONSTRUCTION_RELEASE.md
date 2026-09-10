# Construction reasoning and observer UI

September 10, 2026. Incremental update to the existing survival study, not a new
app or a replacement civilization engine. No API/model calls or new dependencies.

## Delivered

- Private geometric reasoning considers recently observed part dimensions,
  rotation, support, nearby water, body clearance and an approach. It does not
  query the hidden world registry or run the true material solver to choose.
- Projects obtain prerequisites, including a separate stone striker, and return
  to the work site. Urgent survival needs retain unfinished work. Failed actions
  have short retry delays, bounded recovery and eventual abandonment; a failed
  protection test can propose a revised orientation.
- Resting/warming/sheltering near protective parts records actual experience.
  Remembered useful locations can compete as future rest destinations. This does
  not award points for construction or treat correlation as a material test.
- Reusable procedures record the operations actually tested, not an untried
  proposed repair. Reported testimony cannot complete a recipient's project.
- Physical parts are selectable in the world and through a construction list.
  The shared adaptive inspector exposes maker, purpose, condition, material,
  dimensions, connections, test provenance and use records. Proposals have dashed
  outlines; selection does not change agent decisions.
- Agent details show the current/latest project and its last planning note.
  Notes are labeled as records, not live stock shortages. Timeline groups exact
  project IDs and orders same-tick decisions before their confirmed outcomes.
  The private-knowledge map is accessible separately from the observer's map.
- Follow framing includes nearby work, meters and text are more readable, and
  construction details adapt to phone sheets and desktop/landscape side panels.
- Run and About explain basic handling abilities versus learned arrangements.
  Older policy-1/2 studies are not silently changed. A policy-3 physical mind
  upgrades to construction reasoning 2 only on advancement, with an audit event;
  paused saves, old events, archives, IDs, and the current study are preserved.
  Older clients reject the newer physical mind. Refresh all open tabs.

## Checks actually run

- Full `npm test`: **138 passed**, zero failures. Includes Vinext production
  build, Pages type check/build, engine, persistence, worker, scene and legacy
  planetary/civilization regressions.
- Focused physical suite: **30 passed**. Ten added regression cases cover private
  geometry, prerequisites, bounded retries, revision migration/checkpoints,
  observer-only inspection, exact project grouping, executed-use attribution,
  tested procedures rather than proposed repairs, and part/proposal picking.
- Final copy/provenance labels were followed by lint, Pages type check and Pages
  rebuild. Credential-pattern scanning found no embedded keys. Diff whitespace
  checks passed.
- Final Pages artifact: `index-U61G1mYs.js`, physical worker
  `survival-simulation.worker-BUhXCoY6.js`. Existing large-bundle warning remains
  (about 988 kB / 274 kB gzip main chunk). The Sites helper hit its known Windows
  npm-shim failure; normal repository build scripts succeeded.

Browser: Codex in-app Chromium on Windows, using the local Pages production
preview. No state was injected into the browser. A fresh one-agent test study
was configured through the UI; four observer admissions filled the five slots
without resetting its paused clock. It progressed autonomously to day 1 at
21:20 with five living agents and six retained physical parts, then stayed
paused through reload and navigation.

Inspected World and construction detail at 390×844, 375×667, 430×932, 844×390
and 1440×900. Canvas was nonblank and page width did not overflow. Expanded
details scrolled above reachable navigation. Also checked roster/need agreement,
new-run confirmation and archive preservation, project episode expansion,
private-map access, part selection and pause/resume. Production console check
returned no warnings or errors. Actual viewport captures were taken, not design
mockups. This is not mobile Safari, real-device performance, touch/pinch,
screen-reader, 200% text, or injected WebGL/storage-fault certification.

## Small diagnostic, not a general benchmark

One seed (`construction-review-1`), three starting agents, balanced resources,
72 modeled hours. All resulting checkpoints validated. Operations count actual
manipulation outcomes, not proposals or project-note events.

| Climate | Retained parts / joints | Tests | Operations / failures | Use records | Survivors |
| --- | --- | --- | --- | --- | --- |
| Stable | 6 / 0 | 32 | 75 / 6 | 75 | 3 |
| Variable | 9 / 2 | 24 | 56 / 0 | 37 | 2 |
| Harsh | 5 / 0 | 23 | 51 / 0 | 58 | 3 |

These results demonstrate execution, testing and reuse in a few deterministic
scenarios. They do not establish universal improvement, general intelligence,
real engineering validity or reliably invented houses.

## Remaining limits

This is still a bounded exposure-reduction model: four construction materials,
simplified flat-ground support/loads and limited action/program search. It has
no arbitrary machine invention or full chemistry. Observer history can show only
retained evidence; it is not historical world replay. Construction selection can
expose global observer information, but never adds it to an agent's knowledge.
Studies remain device-local; export important records. No live study needs to be
reset to refresh its interface; policy-1/2 users must explicitly configure a new
physical run to adopt that separate model.
