/**
 * Disclosed authored priors available to new material-learning agents.
 * These are broad mechanisms, not successful invention recipes. Exact world
 * thresholds, grades, yields and failure functions remain unobserved.
 */
export const MATERIAL_MECHANISM_PRIORS = [
  { id: "matter-conservation", domain: "matter", statement: "Useful products, remnants, waste and exhaust must be accounted for from supplied matter; an attempted transformation cannot create missing material." },
  { id: "mixtures-and-composition", domain: "matter", statement: "A visible object may contain several materials whose proportions affect behavior even when those proportions are not directly known." },
  { id: "condition-and-damage", domain: "matter", statement: "Damage can change performance before an object loses all of its mass, and damaged material may remain recoverable." },
  { id: "scale-and-dimensions", domain: "structures", statement: "Thickness, span, contact area and mass can change whether the same material arrangement remains useful." },
  { id: "support-and-contact", domain: "structures", statement: "A part needs reachable supporting contact or an established connection; unsupported placement can fail without creating a floating object." },
  { id: "load-paths", domain: "structures", statement: "Applied load follows connected supporting parts, so a weak contact can limit an otherwise strong arrangement." },
  { id: "stability-and-base", domain: "structures", statement: "A wider supported base and lower unbalanced load can improve stability, while tall narrow arrangements can become less stable." },
  { id: "orientation-and-exposure", domain: "structures", statement: "Geometry and orientation relative to local weather can change protection without changing the material identity." },
  { id: "force-and-area", domain: "tools", statement: "Concentrating a similar applied effort over a smaller working area may change cutting, splitting or deformation performance." },
  { id: "abrasion-and-fracture", domain: "processing", statement: "Repeated impact or abrasion can reduce particle size, expose new surfaces and also lose or damage material." },
  { id: "density-separation", domain: "processing", statement: "Particles with different bulk behavior may separate imperfectly under sorting or density-based work." },
  { id: "water-and-porosity", domain: "matter", statement: "Shape, joints, cracks and porosity can affect whether a form retains, leaks or admits water." },
  { id: "heat-transfer", domain: "heat", statement: "Fuel, containment, charge mass, airflow and time can change attained temperature." },
  { id: "thermal-mass", domain: "heat", statement: "Heating more charge generally requires more supplied energy or time, and the same fire need not produce the same charge temperature." },
  { id: "heat-loss-and-containment", domain: "heat", statement: "Exposed hot material loses heat; a suitable enclosure can reduce some losses but has its own condition limits." },
  { id: "combustion-fuel", domain: "heat", statement: "Available fuel mass and fuel condition bound how much useful heat a process can supply." },
  { id: "combustion-air", domain: "heat", statement: "Too little or too much air can change how a carbon-bearing fuel burns." },
  { id: "pyrolysis", domain: "processing", statement: "Heating covered wood may leave a denser carbon-rich solid as well as gases and ash." },
  { id: "separation", domain: "processing", statement: "Visible mineral mixtures may respond differently to sorting, crushing or density separation." },
  { id: "ceramic-firing", domain: "processing", statement: "Sustained heat can permanently change shaped clay, with cracking or under-firing possible." },
  { id: "refractory-containment", domain: "heat", statement: "A heat-resistant enclosure can alter heat loss and may degrade through repeated cycles." },
  { id: "temperature-windows", domain: "heat", statement: "A material transformation may occur over a useful operating range; colder work can do little and excessive heat can damage material or containment." },
  { id: "reduction", domain: "processing", statement: "Some heated mineral-bearing solids may lose bound oxygen in contact with carbon-rich material." },
  { id: "yield-and-waste", domain: "matter", statement: "A transformation can produce a useful fraction, residue, gases and unrecovered material." },
  { id: "hot-working", domain: "tools", statement: "Repeated heating and deformation can change the form and condition of some metal-rich solids." },
  { id: "cooling-and-scale", domain: "tools", statement: "Hot material changes as it cools and works in air; surface scale or other loss can reduce the retained useful fraction." },
  { id: "tool-form-and-medium", domain: "tools", statement: "A working form useful on one medium may not provide the same benefit on another." },
  { id: "tool-wear", domain: "tools", statement: "A shaped edge or striking surface may change work yield but loses condition with use." },
  { id: "reuse-and-remnants", domain: "matter", statement: "A failed or worn object can retain matter and provenance that may be inspected, reused or discarded instead of disappearing." },
  { id: "measurement-limits", domain: "evidence", statement: "One survived load, temperature reading or useful cut is evidence for that trial, not an exact universal limit." },
  { id: "measurement-noise", domain: "evidence", statement: "Coarse instruments and observation limits create uncertainty that should remain attached to a reading." },
  { id: "confounded-comparisons", domain: "evidence", statement: "Changing fuel, material, geometry and weather together prevents one outcome from identifying which difference mattered." },
  { id: "repeated-evidence", domain: "evidence", statement: "Repeated compatible observations can reduce uncertainty; repeated reports of the same evidence are not independent trials." },
  { id: "resource-accounting", domain: "agency", statement: "Tests consume material, time and physiological effort even when the expected effect is absent." },
  { id: "complete-plan-cost", domain: "agency", statement: "A proposal must include travel, prerequisite gathering, work, risk and worsening needs rather than pricing only its final operation." },
  { id: "interruption-and-recovery", domain: "agency", statement: "Urgent survival can interrupt optional work without erasing already completed objects or paid costs." },
  { id: "abstention", domain: "agency", statement: "Repeating a safe method or doing nothing can be preferable when an experiment is unaffordable or unlikely to change a decision." },
] as const;

export type MaterialPriorId = typeof MATERIAL_MECHANISM_PRIORS[number]["id"];
