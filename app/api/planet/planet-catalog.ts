import { getD1 } from "@/db";
import {
  PLANET_CATALOG_VERSION,
  PLANET_SCHEMA_VERSION,
  getCapabilityCatalog,
  getCommodityCatalog,
  getRecipeCatalog,
  getResourceCatalog,
} from "@/app/simulation/planet";
import { decodePlanetPayload, encodePlanetPayload } from "./planet-codec";
import { ensurePlanetSchema } from "./planet-schema";

export type PlanetCatalogKind =
  | "resources"
  | "commodities"
  | "recipes"
  | "capabilities";

interface CatalogRow {
  itemCount: number;
  payloadJson: string;
  checksum: string;
}

const CATALOG_GETTERS = {
  resources: getResourceCatalog,
  commodities: getCommodityCatalog,
  recipes: getRecipeCatalog,
  capabilities: getCapabilityCatalog,
} as const;

export function normalizeCatalogKind(kind: string): PlanetCatalogKind | null {
  const aliases: Record<string, PlanetCatalogKind> = {
    resource: "resources",
    resources: "resources",
    commodity: "commodities",
    commodities: "commodities",
    recipe: "recipes",
    recipes: "recipes",
    capability: "capabilities",
    capabilities: "capabilities",
    technology: "capabilities",
    technologies: "capabilities",
  };
  return aliases[kind.toLocaleLowerCase()] ?? null;
}

export async function loadPlanetCatalog(kind: PlanetCatalogKind) {
  const database = getD1();
  await ensurePlanetSchema(database);
  const liveItems = CATALOG_GETTERS[kind]();
  const encoded = await encodePlanetPayload(liveItems);
  await database
    .prepare(`
      INSERT OR IGNORE INTO planet_catalogs (
        kind, catalog_version, schema_version, item_count,
        payload_json, payload_bytes, checksum
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      kind,
      PLANET_CATALOG_VERSION,
      PLANET_SCHEMA_VERSION,
      liveItems.length,
      encoded.stored,
      encoded.storedBytes,
      encoded.checksum,
    )
    .run();
  const row = await database
    .prepare(`
      SELECT
        item_count AS itemCount,
        payload_json AS payloadJson,
        checksum
      FROM planet_catalogs
      WHERE kind = ? AND catalog_version = ?
    `)
    .bind(kind, PLANET_CATALOG_VERSION)
    .first<CatalogRow>();
  if (
    !row ||
    row.itemCount !== liveItems.length ||
    row.checksum !== encoded.checksum
  ) {
    throw new Error("The persisted planet catalog does not match this engine.");
  }
  const items = await decodePlanetPayload(row.payloadJson, row.checksum);
  if (!Array.isArray(items) || items.length !== row.itemCount) {
    throw new Error("The persisted planet catalog is invalid.");
  }
  return {
    kind,
    catalogVersion: PLANET_CATALOG_VERSION,
    schemaVersion: PLANET_SCHEMA_VERSION,
    itemCount: row.itemCount,
    checksum: row.checksum,
    items,
  };
}
