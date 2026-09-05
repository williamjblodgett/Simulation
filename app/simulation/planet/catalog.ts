import type {
  CapabilityDefinition,
  CommodityDefinition,
  RecipeDefinition,
  ResourceDefinition,
  ResourceFamily,
  ResourceForm,
  ResourceSpawnRules,
  TechnologyDomain,
} from "./types";

type ResourceSpec = readonly [id: string, name: string, family: ResourceFamily, form?: ResourceForm, chance?: number];

const RESOURCE_SPECS: ResourceSpec[] = [
  ["freshwater_spring", "Freshwater spring", "water", "water", 0.13],
  ["surface_water", "Surface water", "water", "water", 0.3],
  ["aquifer", "Groundwater aquifer", "water", "water", 0.17],
  ["glacier_ice", "Glacier ice", "water", "water", 0.22],
  ["wild_grain", "Wild grain", "food", "biological", 0.23],
  ["edible_tubers", "Edible tubers", "food", "biological", 0.2],
  ["orchard_fruit", "Wild fruit", "food", "biological", 0.21],
  ["tree_nuts", "Tree nuts", "food", "biological", 0.17],
  ["berries", "Berries", "food", "biological", 0.21],
  ["wild_legumes", "Wild legumes", "food", "biological", 0.17],
  ["mushrooms", "Edible mushrooms", "food", "biological", 0.12],
  ["medicinal_plants", "Medicinal plants", "biological", "biological", 0.12],
  ["spices", "Aromatic spices", "food", "biological", 0.08],
  ["honey", "Wild honey", "food", "biological", 0.1],
  ["marine_fish", "Marine fishery", "food", "biological", 0.24],
  ["freshwater_fish", "Freshwater fishery", "food", "biological", 0.12],
  ["shellfish", "Shellfish bed", "food", "biological", 0.14],
  ["game_animals", "Game animals", "food", "biological", 0.2],
  ["grazing_herds", "Grazing herds", "food", "biological", 0.17],
  ["poultry", "Wild fowl", "food", "biological", 0.17],
  ["hardwood", "Hardwood forest", "biological", "biological", 0.21],
  ["softwood", "Softwood forest", "biological", "biological", 0.24],
  ["bamboo", "Bamboo", "biological", "biological", 0.14],
  ["reeds", "Reeds", "biological", "biological", 0.2],
  ["natural_rubber", "Natural rubber", "biological", "biological", 0.1],
  ["plant_resin", "Plant resin", "biological", "biological", 0.13],
  ["peat", "Peat", "fossil_fuel", "deposit", 0.1],
  ["cotton", "Cotton fiber", "fiber", "biological", 0.12],
  ["flax", "Flax fiber", "fiber", "biological", 0.13],
  ["hemp", "Hemp fiber", "fiber", "biological", 0.13],
  ["wool", "Wool-bearing herds", "fiber", "biological", 0.12],
  ["silk", "Wild silk", "fiber", "biological", 0.07],
  ["animal_hides", "Animal hides", "fiber", "biological", 0.14],
  ["clay", "Clay", "construction", "deposit", 0.31],
  ["sand", "Sand", "construction", "deposit", 0.36],
  ["gravel", "Gravel", "construction", "deposit", 0.28],
  ["limestone", "Limestone", "construction", "deposit", 0.22],
  ["gypsum", "Gypsum", "construction", "deposit", 0.13],
  ["granite", "Granite", "construction", "deposit", 0.16],
  ["marble", "Marble", "construction", "deposit", 0.09],
  ["basalt", "Basalt", "construction", "deposit", 0.16],
  ["slate", "Slate", "construction", "deposit", 0.11],
  ["halite", "Rock salt", "industrial_mineral", "deposit", 0.14],
  ["sulfur", "Sulfur", "industrial_mineral", "deposit", 0.1],
  ["phosphate_rock", "Phosphate rock", "industrial_mineral", "deposit", 0.11],
  ["potash", "Potash", "industrial_mineral", "deposit", 0.09],
  ["silica", "High-purity silica", "industrial_mineral", "deposit", 0.16],
  ["graphite", "Graphite", "strategic_mineral", "deposit", 0.08],
  ["borate", "Borate", "industrial_mineral", "deposit", 0.06],
  ["fluorite", "Fluorite", "industrial_mineral", "deposit", 0.07],
  ["barite", "Barite", "industrial_mineral", "deposit", 0.07],
  ["mica", "Mica", "industrial_mineral", "deposit", 0.1],
  ["talc", "Talc", "industrial_mineral", "deposit", 0.1],
  ["kaolin", "Kaolin", "industrial_mineral", "deposit", 0.12],
  ["iron_ore", "Iron ore", "metal", "deposit", 0.17],
  ["copper_ore", "Copper ore", "metal", "deposit", 0.14],
  ["tin_ore", "Tin ore", "metal", "deposit", 0.08],
  ["zinc_ore", "Zinc ore", "metal", "deposit", 0.1],
  ["lead_ore", "Lead ore", "metal", "deposit", 0.1],
  ["nickel_ore", "Nickel ore", "metal", "deposit", 0.08],
  ["manganese_ore", "Manganese ore", "metal", "deposit", 0.09],
  ["chromium_ore", "Chromium ore", "metal", "deposit", 0.07],
  ["bauxite", "Bauxite", "metal", "deposit", 0.11],
  ["titanium_ore", "Titanium ore", "metal", "deposit", 0.07],
  ["cobalt_ore", "Cobalt ore", "strategic_mineral", "deposit", 0.055],
  ["molybdenum_ore", "Molybdenum ore", "strategic_mineral", "deposit", 0.05],
  ["tungsten_ore", "Tungsten ore", "strategic_mineral", "deposit", 0.05],
  ["vanadium_ore", "Vanadium ore", "strategic_mineral", "deposit", 0.05],
  ["lithium_brine", "Lithium brine", "strategic_mineral", "deposit", 0.05],
  ["rare_earth_ore", "Rare-earth ore", "strategic_mineral", "deposit", 0.045],
  ["tantalum_ore", "Tantalum ore", "strategic_mineral", "deposit", 0.035],
  ["niobium_ore", "Niobium ore", "strategic_mineral", "deposit", 0.035],
  ["germanium_ore", "Germanium ore", "strategic_mineral", "deposit", 0.025],
  ["gallium_ore", "Gallium ore", "strategic_mineral", "deposit", 0.025],
  ["indium_ore", "Indium ore", "strategic_mineral", "deposit", 0.025],
  ["antimony_ore", "Antimony ore", "strategic_mineral", "deposit", 0.045],
  ["gold_ore", "Gold ore", "precious", "deposit", 0.045],
  ["silver_ore", "Silver ore", "precious", "deposit", 0.06],
  ["platinum_ore", "Platinum-group ore", "precious", "deposit", 0.025],
  ["gemstones", "Gemstones", "precious", "deposit", 0.035],
  ["diamonds", "Diamonds", "precious", "deposit", 0.025],
  ["coal", "Coal", "fossil_fuel", "deposit", 0.12],
  ["lignite", "Lignite", "fossil_fuel", "deposit", 0.1],
  ["crude_oil", "Crude oil", "fossil_fuel", "deposit", 0.09],
  ["natural_gas", "Natural gas", "fossil_fuel", "deposit", 0.085],
  ["oil_sands", "Oil sands", "fossil_fuel", "deposit", 0.045],
  ["uranium_ore", "Uranium ore", "nuclear", "deposit", 0.04],
  ["thorium_ore", "Thorium ore", "nuclear", "deposit", 0.04],
  ["solar_flux", "Solar energy site", "renewable_energy", "energy_flow", 0.38],
  ["wind_corridor", "Wind energy corridor", "renewable_energy", "energy_flow", 0.24],
  ["hydropower_site", "Hydropower site", "renewable_energy", "energy_flow", 0.12],
  ["geothermal_site", "Geothermal site", "renewable_energy", "energy_flow", 0.08],
  ["tidal_site", "Tidal energy site", "renewable_energy", "energy_flow", 0.08],
];

const BIOLOGICAL_BIOMES = [
  "boreal_forest",
  "temperate_forest",
  "grassland",
  "savanna",
  "tropical_forest",
  "wetland",
] as const;

function spawnFor(id: string, family: ResourceFamily, chance: number): ResourceSpawnRules {
  if (id === "glacier_ice") return { biomes: ["ice"], baseChance: chance };
  if (["marine_fish", "shellfish", "tidal_site"].includes(id)) return { biomes: ["ocean"], baseChance: chance };
  if (id === "freshwater_fish") return { minRainfall: 0.55, maxElevation: 0.65, baseChance: chance };
  if (id === "freshwater_spring" || id === "surface_water" || id === "aquifer") {
    return { minRainfall: id === "aquifer" ? 0.25 : 0.45, maxElevation: 0.8, baseChance: chance };
  }
  if (family === "food" || family === "biological" || family === "fiber") {
    return { biomes: [...BIOLOGICAL_BIOMES], minRainfall: 0.25, baseChance: chance };
  }
  if (family === "fossil_fuel") {
    return { geology: ["sedimentary", "alluvial"], maxElevation: 0.76, baseChance: chance };
  }
  if (family === "metal" || family === "strategic_mineral" || family === "precious" || family === "nuclear") {
    return { geology: ["igneous", "metamorphic", "volcanic"], minElevation: 0.46, baseChance: chance };
  }
  if (id === "geothermal_site") return { geology: ["volcanic"], baseChance: chance };
  if (id === "hydropower_site") return { minRainfall: 0.55, minElevation: 0.55, baseChance: chance };
  if (id === "wind_corridor") return { minElevation: 0.5, baseChance: chance };
  if (id === "solar_flux") return { maxRainfall: 0.45, baseChance: chance };
  return { minElevation: 0.44, baseChance: chance };
}

function discoveryRequirements(id: string, family: ResourceFamily): string[] {
  if (["crude_oil", "natural_gas", "oil_sands", "coal", "lignite"].includes(id)) return ["geological_surveying"];
  if (family === "strategic_mineral" || family === "nuclear") return ["analytical_chemistry"];
  if (family === "metal" || family === "precious") return ["prospecting"];
  if (family === "renewable_energy") return ["energy_measurement"];
  return ["field_observation"];
}

function extractionRequirements(id: string, family: ResourceFamily): string[] {
  if (id === "crude_oil" || id === "natural_gas") return ["rotary_drilling", "well_control"];
  if (id === "oil_sands") return ["surface_mining", "bitumen_separation"];
  if (family === "metal" || family === "strategic_mineral" || family === "precious" || family === "nuclear") return ["mining"];
  if (family === "fossil_fuel") return ["mining"];
  if (family === "renewable_energy") return ["energy_harvesting"];
  if (family === "food" || family === "biological" || family === "fiber") return ["sustainable_harvesting"];
  return ["basic_tools"];
}

export const RESOURCE_CATALOG: readonly ResourceDefinition[] = RESOURCE_SPECS.map(
  ([id, name, family, form = "deposit", chance = 0.1]) => {
    const renewable = form === "biological" || form === "energy_flow" || family === "water";
    const slow = ["aquifer", "hardwood", "softwood", "peat"].includes(id);
    const reserveMax = form === "energy_flow" ? 100_000 : renewable ? 8_000 : 30_000;
    const pollution: Record<string, number> = family === "fossil_fuel"
      ? { air: 2, water: 1, carbon: 3 }
      : {};
    return {
      id,
      name,
      family,
      form,
      renewability: slow ? "slow" : renewable ? "renewable" : "finite",
      spawn: spawnFor(id, family, chance),
      discoveryRequirements: discoveryRequirements(id, family),
      extractionRequirements: extractionRequirements(id, family),
      yield: {
        baseYield: family === "food" ? 8 : 5,
        reserveMin: Math.round(reserveMax * 0.18),
        reserveMax,
        ...(renewable ? { regenerationPerDay: slow ? 0.08 : 0.8, carryingCapacity: reserveMax } : {}),
      },
      hazards: family === "nuclear" ? ["radiation"] : family === "fossil_fuel" ? ["fire", "toxic_exposure"] : [],
      pollution,
    };
  },
);

const COMMODITY_SPECS: Array<[string, string, string, string[]]> = [
  ["clean_water", "Clean water", "necessity", ["potable"]],
  ["preserved_food", "Preserved food", "food", ["edible", "storable"]],
  ["grain", "Cultivated grain", "food", ["edible", "seed"]],
  ["flour", "Flour", "food", ["edible"]],
  ["lumber", "Lumber", "construction", ["structural", "combustible"]],
  ["paper", "Paper", "knowledge", ["writable"]],
  ["textiles", "Textiles", "material", ["flexible", "insulating"]],
  ["leather", "Leather", "material", ["durable", "flexible"]],
  ["brick", "Fired brick", "construction", ["structural", "fire_resistant"]],
  ["glass", "Glass", "material", ["transparent", "brittle"]],
  ["cement", "Cement", "construction", ["binder"]],
  ["concrete", "Concrete", "construction", ["structural", "castable"]],
  ["copper", "Copper", "metal", ["conductive", "ductile"]],
  ["tin", "Tin", "metal", ["low_melting"]],
  ["bronze", "Bronze", "metal", ["hard", "castable"]],
  ["iron", "Iron", "metal", ["strong", "magnetic"]],
  ["steel", "Steel", "metal", ["strong", "tough"]],
  ["aluminum", "Aluminum", "metal", ["lightweight", "conductive"]],
  ["fertilizer", "Mineral fertilizer", "agriculture", ["soil_nutrient"]],
  ["sulfuric_acid", "Sulfuric acid", "chemical", ["reactive"]],
  ["crude_oil", "Crude oil stock", "energy", ["hydrocarbon", "feedstock"]],
  ["natural_gas", "Natural gas stock", "energy", ["combustible", "feedstock"]],
  ["naphtha", "Naphtha", "chemical", ["hydrocarbon", "feedstock"]],
  ["gasoline", "Gasoline", "fuel", ["combustible", "volatile"]],
  ["diesel", "Diesel", "fuel", ["combustible"]],
  ["kerosene", "Kerosene", "fuel", ["combustible"]],
  ["lubricants", "Lubricants", "industrial", ["low_friction"]],
  ["asphalt", "Asphalt", "construction", ["waterproof", "road_surface"]],
  ["plastic", "Plastic", "material", ["moldable", "insulating"]],
  ["electricity", "Electricity", "energy", ["transmissible"]],
  ["hydrogen", "Hydrogen", "energy", ["combustible", "feedstock"]],
  ["battery_cell", "Battery cell", "energy_storage", ["rechargeable"]],
  ["silicon_wafer", "Silicon wafer", "electronics", ["semiconducting"]],
  ["electronic_components", "Electronic components", "electronics", ["computational"]],
  ["medicine", "Prepared medicine", "health", ["therapeutic"]],
  ["machinery", "Machinery", "industrial", ["productive"]],
];

export const COMMODITY_CATALOG: readonly CommodityDefinition[] = COMMODITY_SPECS.map(
  ([id, name, family, properties]) => ({ id, name, family, properties }),
);

function recipe(
  id: string,
  name: string,
  inputs: Record<string, number>,
  outputs: Record<string, number>,
  capabilities: string[],
  facilities: string[],
  energyCost = 1,
  pollution: Record<string, number> = {},
): RecipeDefinition {
  return { id, name, inputs, outputs, requiredCapabilities: capabilities, requiredFacilities: facilities, energyCost, labor: 1, pollution };
}

export const RECIPE_CATALOG: readonly RecipeDefinition[] = [
  recipe("purify_water", "Purify water", { surface_water: 2 }, { clean_water: 2 }, ["water_treatment"], ["hearth"]),
  recipe("preserve_food", "Preserve food", { wild_grain: 2, halite: 0.1 }, { preserved_food: 2 }, ["food_preservation"], ["hearth"]),
  recipe("mill_grain", "Mill grain", { grain: 2 }, { flour: 1.7 }, ["milling"], ["mill"]),
  recipe("saw_lumber", "Saw lumber", { hardwood: 2 }, { lumber: 1.4 }, ["carpentry"], ["workshop"]),
  recipe("make_textiles", "Weave textiles", { flax: 2 }, { textiles: 1.2 }, ["weaving"], ["loom"]),
  recipe("tan_hides", "Tan hides", { animal_hides: 2 }, { leather: 1 }, ["tanning"], ["tannery"]),
  recipe("fire_brick", "Fire brick", { clay: 3 }, { brick: 2.4 }, ["kiln_firing"], ["kiln"], 3, { air: 0.2 }),
  recipe("make_glass", "Make glass", { silica: 3 }, { glass: 2 }, ["glassmaking"], ["kiln"], 5, { air: 0.2 }),
  recipe("make_cement", "Make cement", { limestone: 3, clay: 1 }, { cement: 2 }, ["cement_production"], ["rotary_kiln"], 8, { carbon: 1.3 }),
  recipe("mix_concrete", "Mix concrete", { cement: 1, sand: 2, gravel: 3, clean_water: 1 }, { concrete: 5 }, ["concrete_construction"], ["works"]),
  recipe("smelt_copper", "Smelt copper", { copper_ore: 3, coal: 1 }, { copper: 1.5 }, ["copper_smelting"], ["smelter"], 5, { air: 0.6 }),
  recipe("smelt_tin", "Smelt tin", { tin_ore: 3, coal: 1 }, { tin: 1.4 }, ["tin_smelting"], ["smelter"], 4, { air: 0.5 }),
  recipe("cast_bronze", "Cast bronze", { copper: 4, tin: 1 }, { bronze: 4.6 }, ["bronze_alloying"], ["foundry"], 4),
  recipe("smelt_iron", "Smelt iron", { iron_ore: 4, coal: 2 }, { iron: 2 }, ["iron_smelting"], ["blast_furnace"], 8, { air: 1, carbon: 1 }),
  recipe("make_steel", "Make steel", { iron: 4, manganese_ore: 0.2, coal: 0.5 }, { steel: 3.6 }, ["steelmaking"], ["steelworks"], 10, { air: 1, carbon: 1.3 }),
  recipe("make_fertilizer", "Make fertilizer", { phosphate_rock: 2, potash: 1, natural_gas: 1 }, { fertilizer: 3 }, ["industrial_chemistry"], ["chemical_plant"], 7, { water: 0.4, carbon: 0.5 }),
  recipe("extract_crude_oil", "Pump crude oil", {}, { crude_oil: 10 }, ["rotary_drilling", "well_control"], ["oil_well"], 3, { water: 0.15, carbon: 0.1 }),
  recipe("extract_natural_gas", "Produce natural gas", {}, { natural_gas: 10 }, ["rotary_drilling", "well_control"], ["gas_well"], 2, { carbon: 0.2 }),
  recipe("distill_crude", "Fractionally distill crude oil", { crude_oil: 10 }, { naphtha: 2, gasoline: 2, diesel: 2.4, kerosene: 1.2, lubricants: 0.7, asphalt: 1 }, ["petroleum_refining"], ["oil_refinery"], 12, { air: 1, water: 0.3, carbon: 1 }),
  recipe("crack_naphtha", "Steam-crack naphtha", { naphtha: 3 }, { plastic: 2 }, ["polymer_chemistry"], ["petrochemical_plant"], 10, { air: 0.7, carbon: 0.8 }),
  recipe("coal_power", "Generate coal electricity", { coal: 4 }, { electricity: 10 }, ["thermal_power"], ["power_plant"], 8, { air: 2, carbon: 3 }),
  recipe("gas_power", "Generate gas electricity", { natural_gas: 3 }, { electricity: 10 }, ["gas_turbines"], ["power_plant"], 6, { air: 0.7, carbon: 1.5 }),
  recipe("solar_power", "Generate solar electricity", { solar_flux: 1 }, { electricity: 5 }, ["photovoltaics"], ["solar_array"], 0),
  recipe("wind_power", "Generate wind electricity", { wind_corridor: 1 }, { electricity: 6 }, ["wind_turbines"], ["wind_farm"], 0),
  recipe("hydro_power", "Generate hydroelectricity", { hydropower_site: 1 }, { electricity: 8 }, ["hydroelectricity"], ["dam"], 0),
  recipe("make_hydrogen", "Electrolyze hydrogen", { clean_water: 2, electricity: 6 }, { hydrogen: 2 }, ["electrolysis"], ["chemical_plant"], 6),
  recipe("make_battery", "Make battery cells", { lithium_brine: 1, graphite: 1, nickel_ore: 0.5, electricity: 3 }, { battery_cell: 2 }, ["battery_chemistry"], ["battery_factory"], 4, { water: 0.5 }),
  recipe("refine_silicon", "Refine silicon wafers", { silica: 4, coal: 1, electricity: 8 }, { silicon_wafer: 1 }, ["semiconductor_fabrication"], ["cleanroom"], 12),
  recipe("make_electronics", "Assemble electronics", { silicon_wafer: 1, copper: 1, rare_earth_ore: 0.2, plastic: 0.5 }, { electronic_components: 1 }, ["electronics"], ["electronics_factory"], 6),
  recipe("prepare_medicine", "Prepare medicine", { medicinal_plants: 2, clean_water: 1 }, { medicine: 1 }, ["pharmacology"], ["laboratory"], 2),
  recipe("build_machinery", "Build machinery", { steel: 3, copper: 1, lubricants: 0.2 }, { machinery: 1 }, ["machine_tools"], ["machine_shop"], 6),
];

const DOMAIN_CAPABILITIES: Record<TechnologyDomain, string[]> = {
  survival: ["field_observation", "fire_control", "basic_tools", "sustainable_harvesting", "food_preservation", "water_treatment", "navigation", "prospecting", "mining", "emergency_planning"],
  agriculture: ["seed_selection", "cultivation", "irrigation", "animal_domestication", "crop_rotation", "milling", "soil_science", "selective_breeding", "mechanized_farming", "precision_agriculture"],
  materials: ["pottery", "kiln_firing", "weaving", "tanning", "carpentry", "copper_smelting", "tin_smelting", "bronze_alloying", "iron_smelting", "glassmaking", "steelmaking", "cement_production", "industrial_chemistry", "surface_mining", "bitumen_separation", "polymer_chemistry", "composite_materials"],
  construction: ["shelter_building", "masonry", "surveying", "road_building", "arches", "concrete_construction", "structural_engineering", "sanitation_infrastructure", "high_rise_construction", "earthquake_engineering"],
  energy: ["energy_measurement", "energy_harvesting", "charcoal_making", "water_wheels", "windmills", "steam_power", "thermal_power", "electromagnetism", "electrical_grid", "rotary_drilling", "well_control", "petroleum_refining", "gas_turbines", "hydroelectricity", "nuclear_fission", "photovoltaics", "wind_turbines", "battery_chemistry", "electrolysis", "fusion_research"],
  transport: ["trailmaking", "watercraft", "wheel_transport", "sailing", "canal_building", "railways", "internal_combustion", "motor_vehicles", "aviation", "container_logistics", "electric_transport", "autonomous_navigation"],
  medicine: ["first_aid", "herbal_medicine", "anatomy", "sanitation", "epidemiology", "vaccination", "anesthesia", "germ_theory", "surgery", "pharmacology", "medical_imaging", "antibiotics", "genomics", "regenerative_medicine"],
  science: ["counting", "measurement", "writing", "geometry", "astronomy", "experimental_method", "printing", "microscopy", "calculus", "analytical_chemistry", "geological_surveying", "thermodynamics", "atomic_theory", "quantum_physics", "systems_science"],
  communication: ["oral_tradition", "symbolic_notation", "writing_system", "postal_network", "printing_press", "telegraphy", "telephony", "radio", "television", "digital_networks", "satellite_communication", "global_internet"],
  governance: ["kinship_coordination", "customary_law", "accounting", "civic_assembly", "written_law", "public_administration", "representative_government", "statistics", "central_banking", "international_law", "digital_governance"],
  manufacturing: ["handcrafting", "standard_units", "workshops", "water_powered_mills", "interchangeable_parts", "machine_tools", "factory_system", "assembly_lines", "quality_control", "industrial_robotics", "additive_manufacturing", "molecular_manufacturing_research"],
  computation: ["tally_systems", "abacus", "formal_logic", "mechanical_calculation", "electromechanical_computing", "electronics", "semiconductor_fabrication", "stored_program_computing", "databases", "machine_learning", "distributed_computing", "quantum_computing_research"],
  environment: ["seasonal_ecology", "forest_management", "watershed_management", "sewage_treatment", "conservation_science", "air_quality_monitoring", "recycling", "climate_science", "ecosystem_restoration", "carbon_management"],
  aerospace: ["aerodynamics", "rocketry", "orbital_mechanics", "life_support", "satellite_engineering", "human_spaceflight", "planetary_science", "reusable_launch", "in_space_manufacturing", "interplanetary_navigation"],
};

const CROSS_PREREQUISITES: Record<string, string[]> = {
  petroleum_refining: ["rotary_drilling", "industrial_chemistry"],
  rotary_drilling: ["geological_surveying", "machine_tools"],
  well_control: ["rotary_drilling"],
  photovoltaics: ["semiconductor_fabrication", "quantum_physics"],
  semiconductor_fabrication: ["analytical_chemistry", "electronics"],
  electronics: ["electromagnetism"],
  battery_chemistry: ["analytical_chemistry", "electrical_grid"],
  nuclear_fission: ["atomic_theory", "industrial_chemistry"],
  machine_tools: ["steelmaking", "measurement"],
  internal_combustion: ["petroleum_refining", "machine_tools"],
  aviation: ["internal_combustion", "aerodynamics"],
  rocketry: ["aerodynamics", "industrial_chemistry"],
  global_internet: ["digital_networks", "satellite_communication"],
};

const RECIPE_UNLOCKS = new Map<string, string[]>();
for (const recipeDefinition of RECIPE_CATALOG) {
  for (const capability of recipeDefinition.requiredCapabilities) {
    const recipes = RECIPE_UNLOCKS.get(capability) ?? [];
    recipes.push(recipeDefinition.id);
    RECIPE_UNLOCKS.set(capability, recipes);
  }
}

export const CAPABILITY_CATALOG: readonly CapabilityDefinition[] = Object.entries(DOMAIN_CAPABILITIES).flatMap(
  ([domain, ids]) => ids.map((id, index) => ({
    id,
    name: id.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
    domain: domain as TechnologyDomain,
    prerequisites: [...(index > 0 ? [ids[index - 1]] : []), ...(CROSS_PREREQUISITES[id] ?? [])].filter(
      (value, valueIndex, array) => array.indexOf(value) === valueIndex && value !== id,
    ),
    evidence: [`observed:${domain}`, `practiced:${id}`],
    unlocksRecipes: RECIPE_UNLOCKS.get(id) ?? [],
    complexity: Math.min(10, 1 + Math.floor(index / 2)),
  })),
);

const RESOURCE_BY_ID = new Map(RESOURCE_CATALOG.map((definition) => [definition.id, definition]));
const COMMODITY_BY_ID = new Map(COMMODITY_CATALOG.map((definition) => [definition.id, definition]));
const RECIPE_BY_ID = new Map(RECIPE_CATALOG.map((definition) => [definition.id, definition]));
const CAPABILITY_BY_ID = new Map(CAPABILITY_CATALOG.map((definition) => [definition.id, definition]));

export function getResourceCatalog(): readonly ResourceDefinition[] {
  return RESOURCE_CATALOG;
}

export function getCommodityCatalog(): readonly CommodityDefinition[] {
  return COMMODITY_CATALOG;
}

export function getRecipeCatalog(): readonly RecipeDefinition[] {
  return RECIPE_CATALOG;
}

export function getCapabilityCatalog(): readonly CapabilityDefinition[] {
  return CAPABILITY_CATALOG;
}

export function getResourceDefinition(id: string): ResourceDefinition | undefined {
  return RESOURCE_BY_ID.get(id);
}

export function getCommodityDefinition(id: string): CommodityDefinition | undefined {
  return COMMODITY_BY_ID.get(id);
}

export function getRecipeDefinition(id: string): RecipeDefinition | undefined {
  return RECIPE_BY_ID.get(id);
}

export function getCapabilityDefinition(id: string): CapabilityDefinition | undefined {
  return CAPABILITY_BY_ID.get(id);
}

export interface CatalogValidationResult {
  valid: boolean;
  errors: string[];
  counts: { resources: number; commodities: number; recipes: number; capabilities: number };
}

/** Validate references and detect prerequisite cycles before a catalog ships. */
export function validatePlanetCatalogs(): CatalogValidationResult {
  const errors: string[] = [];
  const resourceIds = new Set(RESOURCE_CATALOG.map(({ id }) => id));
  const commodityIds = new Set(COMMODITY_CATALOG.map(({ id }) => id));
  const stockIds = new Set([...resourceIds, ...commodityIds]);
  const capabilityIds = new Set(CAPABILITY_CATALOG.map(({ id }) => id));
  const duplicateCheck = (label: string, values: string[]) => {
    const seen = new Set<string>();
    for (const value of values) {
      if (seen.has(value)) errors.push(`Duplicate ${label}: ${value}`);
      seen.add(value);
    }
  };
  duplicateCheck("resource", [...resourceIds]);
  duplicateCheck("commodity", [...commodityIds]);
  duplicateCheck("recipe", RECIPE_CATALOG.map(({ id }) => id));
  duplicateCheck("capability", [...capabilityIds]);
  for (const definition of RESOURCE_CATALOG) {
    for (const requirement of [...definition.discoveryRequirements, ...definition.extractionRequirements]) {
      if (!capabilityIds.has(requirement)) errors.push(`${definition.id} references unknown capability ${requirement}`);
    }
  }
  for (const definition of RECIPE_CATALOG) {
    for (const stockId of [...Object.keys(definition.inputs), ...Object.keys(definition.outputs)]) {
      if (!stockIds.has(stockId)) errors.push(`${definition.id} references unknown stock ${stockId}`);
    }
    for (const capability of definition.requiredCapabilities) {
      if (!capabilityIds.has(capability)) errors.push(`${definition.id} references unknown capability ${capability}`);
    }
  }
  for (const definition of CAPABILITY_CATALOG) {
    for (const prerequisite of definition.prerequisites) {
      if (!capabilityIds.has(prerequisite)) errors.push(`${definition.id} references unknown prerequisite ${prerequisite}`);
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) {
      errors.push(`Capability prerequisite cycle at ${id}`);
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const prerequisite of CAPABILITY_BY_ID.get(id)?.prerequisites ?? []) visit(prerequisite);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of capabilityIds) visit(id);
  return {
    valid: errors.length === 0,
    errors,
    counts: {
      resources: RESOURCE_CATALOG.length,
      commodities: COMMODITY_CATALOG.length,
      recipes: RECIPE_CATALOG.length,
      capabilities: CAPABILITY_CATALOG.length,
    },
  };
}
