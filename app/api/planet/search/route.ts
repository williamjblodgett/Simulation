import {
  PLANET_NO_STORE_HEADERS,
  searchPlanetEntities,
  type PlanetDirectoryKind,
  type PlanetLifecycleFilter,
} from "@/app/api/planet/planet-store";

function boundedInteger(
  search: URLSearchParams,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = search.get(name);
  if (raw === null || raw === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

export async function GET(request: Request) {
  try {
    const search = new URL(request.url).searchParams;
    const query = (search.get("query") ?? "").slice(0, 120);
    const rawKind = search.get("kind") ?? "agent";
    const rawStatus = search.get("status") ?? (rawKind === "agent" ? "active" : "all");
    const kinds = ["agent", "settlement", "polity", "belief"] as const;
    const statuses = ["all", "active", "historical", "declining", "dormant", "revived", "abandoned", "absorbed", "dissolved", "merged"] as const;
    if (!kinds.includes(rawKind as PlanetDirectoryKind)) throw new Error("kind must identify a searchable planet directory.");
    if (!statuses.includes(rawStatus as PlanetLifecycleFilter)) throw new Error("status must identify a lifecycle filter.");
    const cursor = boundedInteger(search, "cursor", 0, 0, 100_000);
    const limit = boundedInteger(search, "limit", 20, 1, 40);
    return Response.json(await searchPlanetEntities(
      rawKind as PlanetDirectoryKind,
      rawStatus as PlanetLifecycleFilter,
      query,
      cursor,
      limit,
    ), {
      headers: PLANET_NO_STORE_HEADERS,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("must")) {
      return Response.json(
        { error: error.message },
        { status: 400, headers: PLANET_NO_STORE_HEADERS },
      );
    }
    return Response.json(
      { error: "Planet search is temporarily unavailable." },
      { status: 503, headers: PLANET_NO_STORE_HEADERS },
    );
  }
}
