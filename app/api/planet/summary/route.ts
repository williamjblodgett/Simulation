import {
  PLANET_NO_STORE_HEADERS,
  authoritativePlanet,
  planetSummary,
  publicPlanetAiStatus,
  publicPlanetManifest,
} from "@/app/api/planet/planet-store";

export async function GET() {
  try {
    const snapshot = await authoritativePlanet();
    const aiCounsel = await publicPlanetAiStatus(snapshot.world, snapshot.serverTime);
    return Response.json(
      {
        world: publicPlanetManifest(snapshot),
        summary: planetSummary(snapshot.world),
        aiCounsel,
        sync: {
          revision: snapshot.row.revision,
          stateRevision: snapshot.world.revision,
          serverTime: snapshot.serverTime,
          simulatedAtMs: snapshot.row.simulatedAtMs,
          catchUpProcessedSeconds: snapshot.processedSeconds,
          catchUpPendingSeconds: snapshot.pendingSeconds,
          caughtUp: snapshot.caughtUp,
          persistent: true,
        },
      },
      { headers: PLANET_NO_STORE_HEADERS },
    );
  } catch (error) {
    console.error(
      "Era III summary failed:",
      error instanceof Error ? error.message : "Unknown server error",
    );
    return Response.json(
      { error: "The Era III planet is temporarily unavailable." },
      { status: 503, headers: PLANET_NO_STORE_HEADERS },
    );
  }
}
