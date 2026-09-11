import fs from "node:fs";

// Preserve raw observations, including failed runs and earlier instrumentation.
// Only the report interprets known unavailable counters; it never rewrites them.
const release = process.argv.includes("--release");
const candidate = process.argv.includes("--candidate");
const sets = [
  ["Development · natural", "discovery-development-natural-all-matrix.json", 15],
  ["Development · explicit exposure fixture", "discovery-development-pressure-all-matrix.json", 15],
  ["Untouched evaluation · natural", "discovery-evaluation-natural-all-matrix.json", 15],
  ["Long development · 168 hours", "discovery-development-long-directed-matrix.json", 1],
  ["Preserved policy 3 · 72-hour regression", "discovery-development-legacy-all-matrix.json", 4],
].map(([label, file, expected]) => [candidate ? `Candidate · ${label}` : release ? `Release · ${label}` : label, candidate ? file.replace("discovery-", "discovery-candidate-") : release ? file.replace("discovery-", "discovery-release-") : file, expected]);
const f = (value, digits = 2) => value == null ? "—" : Number(value).toFixed(digits);
const lines = ["# Milestone 1 recorded results", "", "Generated from raw JSON by `node scripts/report-discovery.mjs`. Each row is one run. Agents sharing a run are not independent trials. No result is filtered by success.", "", "## Interpretation and data quality", "", "Directed = decision-relevant optional tests; frozen = contextual parameter updates/use frozen but evidence/procedures retained; random = locally cost/time-ceiling-matched feasible test alternatives; none = no optional tests; fixed = the competent shared survival planner plus a fixed construction proposal, not a fixed whole-life script.", "", "Random budgets are locally matched, not globally yoked after trajectories diverge. ‘Adapt’ counts reconsiderations following evidence, not proven useful adaptation. Material damage means mass remaining in parts below 0.1 condition, not destroyed mass. Work is cumulative normalized physical-work energy, not all travel/metabolism costs. Physical-test counts come from the authoritative ledger.", "", "Raw early logger fields `gathered: 0` are **unavailable**, not zero collection. Its event contract did not supply amounts. Drink/meal counters count confirmed actions, not mass. Legacy policy-4 notebook counter zeros (including expansions, measuredTests and unconfirmedParts) are also **unavailable**. Neither is used in comparisons below. The logger is corrected for subsequent runs; originals are retained unchanged.", "", "No automated preventability conclusion is drawn from a death cause. Prediction RMSE is descriptive of each policy’s selected tests, not error on a common held-out measurement set. Model uncertainty is not a calibrated probability.", ""];
let finished = 0;
const all = [];
for (const [label, file, expected] of sets) {
  const path = new URL(`../docs/${file}`, import.meta.url);
  const data = fs.existsSync(path) ? JSON.parse(fs.readFileSync(path, "utf8")) : { results: [] };
  const rows = data.results;
  finished += rows.length; all.push(...rows);
  lines.push(`## ${label}`, "", `[Raw records](${file}) · ${rows.length}/${expected} rows recorded.`, "", `Engine-source fingerprint: \`${data.sourceFingerprint ?? "not recorded"}\`.`, "", "| Seed | Arm | Alive/start | Status | Tests | Work | Damaged mass | Adapt | RMSE | Blocked/repeated |", "| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const r of rows) lines.push(`| ${r.seed} | ${r.mode} | ${r.survivors}/${r.agentCount} | ${r.status}${r.deaths.length ? "; " + r.deaths.map(d => `${d.cause} @ ${f(d.hour)}h`).join(", ") : ""} | ${r.actualPhysicalTests} | ${f(r.physicalWorkEnergy)} | ${f(r.damagedMaterial)} | ${r.mode === "legacy-3" ? "—" : r.adaptations} | ${f(r.predictionRMSE, 3)} | ${r.blocked}/${r.repeatedBlocked} |`);
  if (rows.length < expected) lines.push("", `**Unfinished: ${expected - rows.length} predeclared rows.**`);
  lines.push("", "### Measured computation and storage", "", "Node on a shared Windows desktop, with overlapping test/benchmark processes. Not isolated CPU performance, browser worker latency, mobile FPS or a promise of off-browser execution. Checkpoint size is sampled plus the final value. RSS includes the runtime and allocator, not only agent memory.", "", "| Seed / arm | Run ms | Step p50 / p95 / max ms | Expansions | Peak checkpoint bytes | RSS bytes | Valid |", "| --- | ---: | ---: | ---: | ---: | ---: | --- |" );
  for (const r of rows) lines.push(`| ${r.seed} / ${r.mode} | ${r.wallMs} | ${f(r.stepP50, 1)} / ${f(r.stepP95, 1)} / ${f(r.maxStep, 1)} | ${r.mode === "legacy-3" ? "—" : r.expansions} | ${r.maxCheckpointBytes} | ${r.residentBytes} | ${r.valid && !r.failure ? "yes" : "NO"} |`);
  for (const r of rows.filter(r => r.failure)) lines.push("", `Failure for ${r.seed}/${r.mode}:`, "", "```text", r.failure, "```");
  lines.push("");
}
lines.push("## Completeness", "", `${finished}/50 predeclared run outcomes recorded. ${all.filter(r => r.deaths.length).length} runs contain deaths. ${all.filter(r => !r.valid || r.failure).length} report execution or checkpoint-validation errors.`, "", "## Earlier development outcomes", "", "These raw records predate the final geometry/experiment-selection implementation and the engine fingerprint. They informed fixes and are regression data, **not additional independent trials of the final policy**. One early pressure logger failed to forward the declared climate/resource configuration; it cannot support that intended cross-environment comparison. Retained for transparency:", "");
for (const file of ["discovery-development-natural-directed-matrix.json", "discovery-development-pressure-directed-matrix.json", "discovery-development-pressure-directed-discovery-dev-cold-2.json"]) {
  const data = JSON.parse(fs.readFileSync(new URL(`../docs/${file}`, import.meta.url), "utf8"));
  lines.push(`- [${file}](${file}): ${data.results.map(r => `${r.seed}: ${r.survivors}/${r.agentCount} alive, ${r.status}`).join("; ")}.`);
}
if (release || candidate) {
  lines[0] = "# Milestone 1 release continuation results";
  lines[2] = "Generated by `node scripts/report-discovery.mjs --release`. The release protocol was declared before inspecting the new holdouts. Original results remain in DISCOVERY_RESULTS.md; they are not replaced by these reruns.";
  lines.push("", "## Recovery diagnostics (regression data)", "", "The original directed, frozen and random harsh-pressure runs died. The recovery fix compares full remaining recovery plans against staying exposed, preserves urgent interruptions, and uses precise arrival at personally measured sites. The first and second diagnostic attempts are retained, including the fixed strategy's death. They are development observations, not independent holdout trials.", "");
  for (const name of ["before", "recovery-attempt-1", "recovery-attempt-2", "long-recovery-before", "long-recovery-after"]) {
    const file = `discovery-exposure-${name}.json`;
    const data = JSON.parse(fs.readFileSync(new URL(`../docs/${file}`, import.meta.url), "utf8"));
    lines.push(`- [${name}](${file}): ${data.results.map(r => `${r.mode}: ${r.survivors} alive, ${r.status} at step ${r.lastTick}`).join("; ")}.`);
  }
}
if (candidate) { lines[0] = "# Milestone 1 final candidate results"; lines[2] = "Generated by `node scripts/report-discovery.mjs --candidate`. All candidate runs use the final policy fingerprint. Prior matrices and failures remain in DISCOVERY_RESULTS.md and DISCOVERY_RELEASE_RESULTS.md. See the predeclared protocol in DISCOVERY_EVALUATION.md."; }
fs.writeFileSync(new URL(`../docs/${candidate ? "DISCOVERY_CANDIDATE_RESULTS" : release ? "DISCOVERY_RELEASE_RESULTS" : "DISCOVERY_RESULTS"}.md`, import.meta.url), lines.join("\n") + "\n");
console.log(JSON.stringify({ recorded: finished, expected: 50, withDeaths: all.filter(r => r.deaths.length).length, sourceFingerprints: [...new Set(sets.map(([, file]) => JSON.parse(fs.readFileSync(new URL(`../docs/${file}`, import.meta.url), "utf8")).sourceFingerprint))] }));
