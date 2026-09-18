import type { Capability, ComponentForm, ComponentMaterial, DevelopmentOperation, DevelopmentPrimitive } from "./development-types";

/** Authored affordances, deliberately approximate. They enable backward search,
 * not a technology tree: no elapsed-time flags or named machine recipes. */
export const COMPONENT_AFFORDANCES: Record<ComponentForm, { metric: Capability; needs: Capability[]; materials: ComponentMaterial[]; prior: number; duration: number; description: string }> = {
  vessel: { metric: "water_access", needs: [], materials: ["clay", "wood", "ceramic"], prior: .55, duration: 3, description: "A hollow supported form can retain a finite amount of water; seams and untreated material can leak." },
  panel: { metric: "protection", needs: [], materials: ["wood", "fiber", "clay", "stone"], prior: .48, duration: 3, description: "An oriented surface changes wind exposure and heat loss; thickness and support matter." },
  rack: { metric: "food_reliability", needs: [], materials: ["wood", "fiber", "metal"], prior: .5, duration: 3, description: "Dry raised storage slows, but does not eliminate, food spoilage." },
  bed: { metric: "food_reliability", needs: ["water_access"], materials: ["wood", "clay"], prior: .55, duration: 4, description: "Planted food and water can yield further food after sufficient sunlight and time; an empty bed produces nothing." },
  rotor: { metric: "mechanical", needs: [], materials: ["wood", "metal"], prior: .55, duration: 5, description: "An exposed rotating surface can collect wind energy. Calm weather, friction and wear reduce output." },
  shaft: { metric: "work_effort", needs: ["mechanical"], materials: ["wood", "metal"], prior: .55, duration: 4, description: "A driven working shaft can replace some gathering effort; useful output depends on input power and precision." },
  gear: { metric: "mechanical", needs: ["mechanical"], materials: ["wood", "metal"], prior: .55, duration: 4, description: "A supported gear transmits mechanical work with losses; this simplified model does not resolve separate speed and torque." },
  coil: { metric: "electric", needs: ["mechanical"], materials: ["metal"], prior: .45, duration: 6, description: "A wound conductor and magnetic assembly convert shaft energy into electrical energy with losses." },
  cell: { metric: "energy_storage", needs: ["electric"], materials: ["metal"], prior: .55, duration: 6, description: "A paired-electrode enclosure stores supplied charge with a finite capacity, leakage and wear. It starts empty." },
  piston: { metric: "water_access", needs: ["mechanical"], materials: ["wood", "metal"], prior: .52, duration: 5, description: "A driven displacement chamber moves nearby water through a connected outlet, using energy and wearing seals." },
  chamber: { metric: "mechanical", needs: [], materials: ["metal", "ceramic"], prior: .3, duration: 7, description: "A heated sealed displacement assembly consumes fuel and water to produce work, exhaust and substantial heat losses." },
  filament: { metric: "protection", needs: ["electric"], materials: ["metal"], prior: .4, duration: 4, description: "A resistive element consumes electrical energy and produces local heat and light; overheating wears it." },
  contact: { metric: "regulation", needs: ["electric"], materials: ["metal"], prior: .48, duration: 4, description: "A powered threshold contact senses a connected vessel and gates machinery; this is simplified relay logic." },
  record: { metric: "knowledge", needs: [], materials: ["clay", "wood"], prior: .7, duration: 2, description: "A durable marked surface can carry an executed procedure and its original evidence references." },
};
export const componentForms = Object.keys(COMPONENT_AFFORDANCES) as ComponentForm[];
export const componentMaterials: ComponentMaterial[] = ["wood", "stone", "fiber", "clay", "metal", "ceramic"];
export const DEVELOPMENT_PRIORS = [
  "Geometry, support, thickness and treatment affect the performance of a physical part.",
  "Connected parts transfer water, mechanical work or electricity; losses and maintenance must be paid.",
  "A storage capacity is not a supply: deposits and withdrawals move existing matter.",
  "A powered mechanism consumes an energy source and may run while its maker is elsewhere or dead.",
  "Moving parts need clearance; cables represent a paired supply and return conductor.",
  "Repeated resource trips, exposure and costly work can justify a longer investment.",
  "Measurements apply to their tested geometry, material, treatment and conditions.",
  "A report or inscription is testimony from its original experiment, not independent confirmation.",
  "Survival and discovery, when selected, allocates at most eight effort units per modeled day to decision-relevant uncertainty.",
] as const;
export const componentMass = (part: DevelopmentPrimitive) => Math.round(part.size * part.size * part.thickness * 2 * 1e6) / 1e6;
export const operationDuration = (op: DevelopmentOperation) => op.kind === "form" ? COMPONENT_AFFORDANCES[op.form].duration : op.kind === "treat" ? 6 : op.kind === "connect" ? 2 : 1;
export const operationEffort = (op: DevelopmentOperation) => op.kind === "form" ? .8 + componentMass(op) * .35 : op.kind === "treat" ? 1.8 : op.kind === "test" ? .6 : op.kind === "connect" ? .6 : .25;
export const componentMetric = (form: ComponentForm) => COMPONENT_AFFORDANCES[form].metric;
export const modelKey = (part: Pick<DevelopmentPrimitive, "form" | "material" | "size" | "thickness">, treatment = "raw") => `${part.form}:${part.material}:${Math.round(part.size)}:${Math.round(part.thickness * 10)}:${treatment}`;
