import { PLANET_NO_STORE_HEADERS } from "@/app/api/planet/planet-store";
import { planetHistoryResponse } from "@/app/api/planet/planet-history";

export async function GET(request: Request) {
  try {
    return Response.json(await planetHistoryResponse(request), {
      headers: PLANET_NO_STORE_HEADERS,
    });
  } catch (error) {
    if (error instanceof Error && /must|requested|exist/.test(error.message)) {
      return Response.json(
        { error: error.message },
        { status: 400, headers: PLANET_NO_STORE_HEADERS },
      );
    }
    return Response.json(
      { error: "The Era III history is temporarily unavailable." },
      { status: 503, headers: PLANET_NO_STORE_HEADERS },
    );
  }
}
