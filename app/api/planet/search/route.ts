import {
  PLANET_NO_STORE_HEADERS,
  searchPlanetAgents,
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
    const cursor = boundedInteger(search, "cursor", 0, 0, 10_000);
    const limit = boundedInteger(search, "limit", 20, 1, 40);
    return Response.json(await searchPlanetAgents(query, cursor, limit), {
      headers: PLANET_NO_STORE_HEADERS,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("must be between")) {
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
