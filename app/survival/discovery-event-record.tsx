"use client";
import type { SurvivalEvent } from "../simulation/survival";

function record(value: unknown): Record<string, unknown> | null {
  try { const parsed = typeof value === "string" ? JSON.parse(value) : value; return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null; } catch { return null; }
}
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value.toFixed(2) : "Not recorded";
export function DiscoveryEventRecord({ event }: { event: SurvivalEvent }) {
  const comparison = record(event.facts.candidateSummary), experiment = record(event.facts.preActionPrediction), measurement = record(event.facts.measurement);
  const prediction = record(experiment?.prediction);
  if (!comparison && !experiment && !measurement) return null;
  return <section aria-label="Decision and measurement evidence">
    {comparison ? <><h4>Stored alternatives</h4><p>Selected: {String(comparison.selectedId)}. {String(comparison.omitted)} candidates omitted from the bounded summary.</p><ol>{Array.isArray(comparison.alternatives) ? comparison.alternatives.slice(0, 8).map((raw, index) => {
      const a = record(raw); return a ? <li key={index}><strong>{String(a.label)}</strong><p>Estimated value {number(a.score)} · complete-plan cost {number(a.cost)}</p><small>{String(a.rejection ?? "Selected at this decision.")}</small></li> : null;
    }) : null}</ol></> : null}
    {prediction ? <><h4>Before-action prediction</h4><p>{String(experiment?.claim)} Expected reading {number(prediction.mean)}; uncertainty width {number(prediction.uncertainty)} (not a calibrated probability).</p></> : null}
    {measurement ? <><h4>Confirmed measurement</h4><p>{String(measurement.interpretation)} Reading {number(measurement.value)}.</p><p>{Array.isArray(measurement.confounds) ? measurement.confounds.map(String).join(" ") : ""}</p><small>Original evidence {String(measurement.originalId)} · {String(measurement.source)} · observer {String(measurement.originalObserverId)}</small></> : null}
    <details><summary>Exact serialized record</summary><pre>{JSON.stringify(comparison ?? { experiment, measurement }, null, 2)}</pre></details>
  </section>;
}
