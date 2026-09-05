import { pathParts } from "@/app/api/planet/planet-contract";
import {
  loadPlanetCatalog,
  normalizeCatalogKind,
} from "@/app/api/planet/planet-catalog";

const CATALOG_HEADERS = {
  "Cache-Control": "public, max-age=300, stale-while-revalidate=86400",
};

export async function GET(request: Request) {
  const parts = pathParts(request);
  const catalogIndex = parts.lastIndexOf("catalog");
  const kind = normalizeCatalogKind(parts[catalogIndex + 1] ?? "");
  if (catalogIndex < 0 || !kind) {
    return Response.json(
      { error: "Catalog must be resources, commodities, recipes, or capabilities." },
      { status: 404, headers: CATALOG_HEADERS },
    );
  }
  try {
    const catalog = await loadPlanetCatalog(kind);
    if (request.headers.get("If-None-Match") === `"${catalog.checksum}"`) {
      return new Response(null, {
        status: 304,
        headers: { ...CATALOG_HEADERS, ETag: `"${catalog.checksum}"` },
      });
    }
    return Response.json(catalog, {
      headers: { ...CATALOG_HEADERS, ETag: `"${catalog.checksum}"` },
    });
  } catch {
    return Response.json(
      { error: "The planet catalog is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
