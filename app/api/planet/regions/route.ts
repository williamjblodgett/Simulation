import { parseViewportQuery } from "@/app/api/planet/planet-contract";
import {
  PLANET_NO_STORE_HEADERS,
  authoritativePlanet,
  boundedViewport,
} from "@/app/api/planet/planet-store";

export async function GET(request: Request) {
  let query;
  try {
    query = parseViewportQuery(request);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Invalid viewport." },
      { status: 400, headers: PLANET_NO_STORE_HEADERS },
    );
  }

  try {
    const snapshot = await authoritativePlanet();
    if (query.sinceRevision === snapshot.row.revision) {
      return Response.json(
        {
          unchanged: true,
          revision: snapshot.row.revision,
          stateRevision: snapshot.world.revision,
          day: snapshot.world.day,
        },
        { headers: PLANET_NO_STORE_HEADERS },
      );
    }
    return Response.json(
      {
        unchanged: false,
        viewport: boundedViewport(
          snapshot.world,
          snapshot.row.revision,
          query.bounds,
          query.zoom,
        ),
        sync: {
          serverTime: snapshot.serverTime,
          simulatedAtMs: snapshot.row.simulatedAtMs,
          catchUpProcessedSeconds: snapshot.processedSeconds,
          catchUpPendingSeconds: snapshot.pendingSeconds,
          caughtUp: snapshot.caughtUp,
        },
      },
      { headers: PLANET_NO_STORE_HEADERS },
    );
  } catch {
    return Response.json(
      { error: "This part of the planet is temporarily unavailable." },
      { status: 503, headers: PLANET_NO_STORE_HEADERS },
    );
  }
}
