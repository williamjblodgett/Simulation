import type { PhysicalPart } from "./physical-types";
import type { ResourceAbundance, SurvivalAgent, SurvivalEnvironment, SurvivalRunState } from "./types";
import { inFreshwater } from "./physical-navigation";
import { survivalBetween } from "./random";

/** Raw geological families, NOT pure elements, refined products or technology unlocks.
 * All quantities are normalized bulk-material units (the existing stone mass unit).
 * Potential uses are observer documentation, never policy input or physical effects.
 * Sources and deliberate bulk-rock approximation: docs/MATERIAL_FOUNDATION.md.
 */
export const GEOLOGICAL_FEEDSTOCKS = {
  iron_ore: { label: "Iron-bearing ore", family: "Structural metals", potential: "Iron and steel feedstock", appearance: "Dense rust-colored rock", stock: 800 },
  copper_ore: { label: "Copper-bearing ore", family: "Conductors", potential: "Copper, wiring and alloys", appearance: "Green-streaked rock", stock: 500 },
  tin_ore: { label: "Tin-bearing ore", family: "Structural metals", potential: "Tin and alloy feedstock", appearance: "Dark heavy grains in rock", stock: 180 },
  bauxite: { label: "Bauxite", family: "Structural metals", potential: "Aluminum feedstock", appearance: "Pale red nodular rock", stock: 600 },
  zinc_ore: { label: "Zinc-bearing ore", family: "Structural metals", potential: "Zinc and alloys", appearance: "Dark banded rock", stock: 250 },
  nickel_ore: { label: "Nickel-bearing ore", family: "Alloys and storage", potential: "Nickel, alloys and batteries", appearance: "Green-brown mineral-bearing rock", stock: 250 },
  chromium_ore: { label: "Chromium-bearing ore", family: "Alloys and storage", potential: "Corrosion-resistant alloy feedstock", appearance: "Black mineral-rich rock", stock: 180 },
  manganese_ore: { label: "Manganese-bearing ore", family: "Alloys and storage", potential: "Steel and battery feedstock", appearance: "Dark earthy mineral rock", stock: 180 },
  cobalt_ore: { label: "Cobalt-bearing ore", family: "Alloys and storage", potential: "Alloys and some batteries", appearance: "Gray mineral-rich rock", stock: 120 },
  lithium_ore: { label: "Lithium-bearing rock", family: "Alloys and storage", potential: "Lithium compounds and some batteries", appearance: "Pale coarse crystalline rock", stock: 180 },
  graphite: { label: "Graphite-bearing rock", family: "Alloys and storage", potential: "Carbon feedstock and electrodes", appearance: "Dark soft-streaking rock", stock: 250 },
  silica: { label: "Quartz-rich rock", family: "Glass and electronics", potential: "Silica, glass and purified silicon", appearance: "Pale translucent mineral grains", stock: 800 },
  borate: { label: "Borate-bearing rock", family: "Glass and electronics", potential: "Boron compounds and glass additives", appearance: "Pale crusted mineral rock", stock: 120 },
  rare_earth_ore: { label: "Rare-earth-bearing rock", family: "Glass and electronics", potential: "Some magnetic and optical materials", appearance: "Mixed heavy-mineral rock", stock: 160 },
  polymetallic_ore: { label: "Polymetallic ore", family: "Glass and electronics", potential: "Potential minor-metal byproducts; no purity assumed", appearance: "Mixed metallic-looking mineral grains", stock: 220 },
  silver_ore: { label: "Silver-bearing ore", family: "Conductors", potential: "Silver feedstock", appearance: "Dark rock with bright mineral flecks", stock: 100 },
  gold_ore: { label: "Gold-bearing ore", family: "Conductors", potential: "Gold feedstock for contacts", appearance: "Veined rock with small yellow flecks", stock: 80 },
  platinum_ore: { label: "Platinum-group-bearing rock", family: "Conductors", potential: "Some catalysts and contact materials", appearance: "Dense mixed metallic-grain rock", stock: 80 },
  titanium_ore: { label: "Titanium-bearing ore", family: "Structural metals", potential: "Titanium compounds and alloys", appearance: "Dark heavy-mineral rock", stock: 180 },
  tungsten_ore: { label: "Tungsten-bearing ore", family: "Structural metals", potential: "Hard and heat-resistant material feedstock", appearance: "Dense veined mineral rock", stock: 100 },
  limestone: { label: "Limestone", family: "Mineral processing", potential: "Lime, cement and process feedstock", appearance: "Pale layered rock", stock: 600 },
  gypsum: { label: "Gypsum-bearing rock", family: "Mineral processing", potential: "Plaster and mineral process feedstock", appearance: "Pale soft layered rock", stock: 300 },
  salt: { label: "Salt-bearing rock", family: "Mineral processing", potential: "Salts and chemical process feedstock", appearance: "Pale crystalline crust in rock", stock: 300 },
  sulfur: { label: "Sulfur-bearing rock", family: "Mineral processing", potential: "Sulfur compounds", appearance: "Yellow-streaked mineral rock", stock: 180 },
  phosphate: { label: "Phosphate-bearing rock", family: "Mineral processing", potential: "Phosphorus compounds", appearance: "Dark granular sedimentary rock", stock: 300 },
  potash: { label: "Potash-bearing rock", family: "Mineral processing", potential: "Potassium compounds", appearance: "Pale and pink layered mineral rock", stock: 300 },
  coal: { label: "Coal-bearing rock", family: "Energy feedstocks", potential: "Carbon-rich fuel after extraction/processing", appearance: "Black carbon-rich layered rock", stock: 800 },
  oil_shale: { label: "Oil shale", family: "Energy feedstocks", potential: "Hydrocarbon feedstock requiring thermal processing", appearance: "Dark fine-layered rock", stock: 800 },
} as const;

export type GeologicalFeedstock = keyof typeof GEOLOGICAL_FEEDSTOCKS;
export type FeedstockMass = Partial<Record<GeologicalFeedstock, number>>;
export const feedstockKinds = Object.keys(GEOLOGICAL_FEEDSTOCKS) as GeologicalFeedstock[];
export interface GeologyState { version: 1 }
export const feedstockMass = (contents?: FeedstockMass) => Object.values(contents ?? {}).reduce((n, m) => n + m, 0);
const rounded = (n: number) => Math.round(n * 1e6) / 1e6;

/** A bounded, explicit author-supplied endowment, not a geologically realistic basin.
 * Existing food/water/wood locations and their RNG calls are untouched. Site IDs
 * identify locations; no ID-to-chemistry table is included in the policy input.
 */
export function addGeologicalDeposits(env: SurvivalEnvironment, seed: number, abundance: ResourceAbundance): void {
  const multiplier = abundance === "scarce" ? .62 : abundance === "plentiful" ? 1.55 : 1;
  for (const [index, kind] of feedstockKinds.entries()) {
    let position: { x: number; z: number } | undefined;
    for (let attempt = 0; attempt < 512; attempt++) {
      const candidate = {
        x: rounded(survivalBetween(seed, env.bounds.minX + 7, env.bounds.maxX - 7, "geology-x-v1", index, attempt)),
        z: rounded(survivalBetween(seed, env.bounds.minZ + 7, env.bounds.maxZ - 7, "geology-z-v1", index, attempt)),
      };
      if (!inFreshwater(env, candidate, 3) && !env.resources.some(s => Math.hypot(s.position.x - candidate.x, s.position.z - candidate.z) < 4)) { position = candidate; break; }
    }
    if (!position) throw new Error("The requested habitat cannot fit the guaranteed dry geological endowment.");
    const capacity = Math.round(GEOLOGICAL_FEEDSTOCKS[kind].stock * multiplier);
    env.resources.push({ id: `mineral-site-${index + 1}`, kind: "stone", position, quantity: capacity, capacity, regenerationPerDay: 0, contaminated: false, feedstock: kind });
  }
}

/** Embedded raw-rock mass is a SUBSET of inventory/part stone, never extra stock.
 * A homogeneous bulk batch is split proportionally; no selective refinement exists.
 */
export function splitFeedstocks(contents: FeedstockMass | undefined, fraction: number): FeedstockMass | undefined {
  if (!contents) return undefined;
  const taken: FeedstockMass = {};
  for (const kind of feedstockKinds) if ((contents[kind] ?? 0) > 0) {
    const amount = rounded(contents[kind]! * Math.max(0, Math.min(1, fraction)));
    taken[kind] = amount;
    contents[kind] = rounded(contents[kind]! - amount);
    if (!contents[kind]) delete contents[kind];
  }
  return taken;
}
export function mergeFeedstocks(target: FeedstockMass | undefined, source: FeedstockMass | undefined): FeedstockMass | undefined {
  if (!target && !source) return undefined;
  const result: FeedstockMass = { ...target };
  for (const kind of feedstockKinds) if (source?.[kind]) result[kind] = rounded((result[kind] ?? 0) + source[kind]!);
  return result;
}

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const validMass = (v: unknown): v is FeedstockMass => record(v) && Object.entries(v).every(([k, n]) => Object.hasOwn(GEOLOGICAL_FEEDSTOCKS, k) && typeof n === "number" && Number.isFinite(n) && n >= 0);

/** Cross-ledger conservation includes dead agents and damaged/remnant parts.
 * Recovery fences can wrap an old study in schema 6 without inventing deposits.
 */
export function validateGeology(state: SurvivalRunState): boolean {
  const sites = state.environment.resources;
  const parts = state.physical?.parts ?? [];
  if (state.geology === undefined) return state.config.materialFoundation === undefined && sites.every(s => s.feedstock === undefined) && state.agents.every(a => a.rawFeedstocks === undefined) && parts.every(p => p.rawFeedstocks === undefined);
  if ((state.schemaVersion !== 6 && state.schemaVersion !== 7) || state.policyVersion !== 4 || state.config.materialFoundation !== "geology-v1" || !record(state.geology) || state.geology.version !== 1 || Object.keys(state.geology).length !== 1) return false;
  const deposits = sites.filter(s => s.feedstock !== undefined);
  if (deposits.length !== feedstockKinds.length || new Set(deposits.map(s => s.feedstock)).size !== feedstockKinds.length) return false;
  if (deposits.some(s => !Object.hasOwn(GEOLOGICAL_FEEDSTOCKS, s.feedstock!) || s.kind !== "stone" || s.regenerationPerDay !== 0 || s.contaminated || s.capacity <= 0 || inFreshwater(state.environment, s.position, .4))) return false;
  for (const a of state.agents) if (!validMass(a.rawFeedstocks) || feedstockMass(a.rawFeedstocks) > a.inventory.stone + .001) return false;
  for (const p of parts) if (p.rawFeedstocks !== undefined && (!validMass(p.rawFeedstocks) || feedstockMass(p.rawFeedstocks) > (p.composition.stone ?? 0) + .001)) return false;
  for (const kind of feedstockKinds) {
    const deposit = deposits.find(s => s.feedstock === kind)!;
    const abundance = state.config.resourceAbundance === "scarce" ? .62 : state.config.resourceAbundance === "plentiful" ? 1.55 : 1;
    if (deposit.capacity !== Math.round(GEOLOGICAL_FEEDSTOCKS[kind].stock * abundance)) return false;
    const processed = state.materials?.batches.reduce((sum, batch) => sum + (batch.provenance.feedstocks?.[kind] ?? 0), 0) ?? 0;
    const accounted = deposit.quantity + state.agents.reduce((n, a) => n + (a.rawFeedstocks?.[kind] ?? 0), 0) + parts.reduce((n, p) => n + (p.rawFeedstocks?.[kind] ?? 0), 0) + processed;
    if (Math.abs(deposit.capacity - accounted) > .001) return false;
  }
  return true;
}

/** Observer diagnostics only. Deliberate absence from discoveryInput is tested. */
export function geologicalHoldings(agents: readonly SurvivalAgent[], parts: readonly PhysicalPart[], kind: GeologicalFeedstock) {
  return { carried: agents.reduce((n, a) => n + (a.rawFeedstocks?.[kind] ?? 0), 0), embodied: parts.reduce((n, p) => n + (p.rawFeedstocks?.[kind] ?? 0), 0) };
}
