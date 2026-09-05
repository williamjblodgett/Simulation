import { pathParts } from "@/app/api/planet/planet-contract";
import {
  PLANET_NO_STORE_HEADERS,
  loadPlanetEntity,
} from "@/app/api/planet/planet-store";

export async function GET(request: Request) {
  const parts = pathParts(request);
  const entityIndex = parts.lastIndexOf("entities");
  const kind = parts[entityIndex + 1] ?? "";
  const id = parts[entityIndex + 2] ?? "";
  if (entityIndex < 0 || !kind || !id) {
    return Response.json(
      { error: "An entity kind and id are required." },
      { status: 400, headers: PLANET_NO_STORE_HEADERS },
    );
  }
  try {
    const result = await loadPlanetEntity(kind, id);
    if (!result) {
      return Response.json(
        { error: "Planet entity not found." },
        { status: 404, headers: PLANET_NO_STORE_HEADERS },
      );
    }
    return Response.json(
      { kind, id, revision: result.revision, entity: result.entity },
      { headers: PLANET_NO_STORE_HEADERS },
    );
  } catch {
    return Response.json(
      { error: "The planet entity is temporarily unavailable." },
      { status: 503, headers: PLANET_NO_STORE_HEADERS },
    );
  }
}
