"use client";

import { useEffect, useMemo, useRef } from "react";
import { freshwaterVisualFootprint, type SurvivalAgent, type SurvivalRunState } from "../simulation/survival";
import type { InspectorLevel } from "./agent-inspector";
import { activityLabel } from "./presentation";
import { depthAt, freshwaterFeatures } from "../simulation/survival/water";
import {
  createSurvivalHabitatScene,
  type HabitatActionKind,
  type HabitatAgentStatus,
  type HabitatCameraMode,
  type HabitatCarriedItemKind,
  type HabitatDayPhase,
  type HabitatResourceKind,
  type HabitatToolKind,
  type HabitatVisualSnapshot,
  type HabitatWeatherKind,
  type SurvivalAgentId,
  type SurvivalHabitatScene,
} from "./scene";

interface SurvivalWorldProps {
  world: SurvivalRunState;
  selectedId: SurvivalAgentId | null;
  cameraMode: HabitatCameraMode;
  onSelectAgent(id: SurvivalAgentId): void;
  onManualCamera(): void;
  onContextLost(): void;
  retryKey: number;
  active: boolean;
  focusPosition?: { x: number; z: number } | null;
  inspectorLevel: InspectorLevel;
  zoomRequest?: { direction: -1 | 1; sequence: number } | null;
}

function actionKind(agent: SurvivalAgent): HabitatActionKind {
  const action = agent.currentAction.kind;
  if (action === "move") return "move";
  if (action === "collect" || action === "gather") return "gather";
  if (action === "drink") return "drink";
  if (action === "eat") return "eat";
  if (action === "rest") return "rest";
  if (action === "warm") return "rest";
  if (action === "shelter") return "rest";
  if (action === "build") return "build";
  if (action === "explore") return "explore";
  if (action === "prepare_experiment") return "research";
  if (action === "test_hypothesis" || action === "review_evidence") return "test";
  if (action === "share") return "share";
  if (action === "request") return "communicate";
  if (action === "cooperate") return "communicate";
  return "await";
}

function agentStatus(agent: SurvivalAgent): HabitatAgentStatus {
  if (!agent.alive) return "dead";
  if (agent.currentAction.status === "moving") return "moving";
  if (agent.currentAction.status === "acting") return "acting";
  if (agent.currentAction.status === "resting") return "resting";
  if (agent.currentAction.status === "blocked") return "blocked";
  return "awaiting-decision";
}

function carriedItem(agent: SurvivalAgent): HabitatCarriedItemKind | null {
  const item = Object.entries(agent.inventory)
    .filter(([, amount]) => amount > 0.01)
    .sort((left, right) => right[1] - left[1])[0]?.[0];
  if (!item) return null;
  if (item === "freshwater") return "water";
  if (item === "wood") return "timber";
  if (item === "herbs") return "medicine";
  return item as HabitatCarriedItemKind;
}

function toolFor(agent: SurvivalAgent): HabitatToolKind {
  void agent;
  return "none";
}

function headingFor(agent: SurvivalAgent) {
  const target = agent.currentPlan?.status === "active" ? agent.currentPlan.steps[agent.currentPlan.activeStepIndex]?.destination : null;
  if (!target) return 0;
  return Math.atan2(target.x - agent.position.x, target.z - agent.position.z);
}

function mapSnapshot(world: SurvivalRunState): HabitatVisualSnapshot {
  const dayFraction = world.timeOfDay / (24 * 60);
  const phase: HabitatDayPhase = dayFraction < 0.23
    ? "night"
    : dayFraction < 0.34
      ? "dawn"
      : dayFraction < 0.76
        ? "day"
        : dayFraction < 0.87
          ? "dusk"
          : "night";
  const weatherMap: Record<SurvivalRunState["environment"]["weather"], HabitatWeatherKind> = {
    clear: "clear",
    overcast: "cloudy",
    rain: "rain",
    storm: "storm",
    cold_snap: "snow",
    heat_wave: "clear",
  };
  const resourceMap: Record<string, HabitatResourceKind> = {
    freshwater: "freshwater",
    food: "food",
    wood: "timber",
    stone: "stone",
    fiber: "fiber",
    herbs: "medicine",
    clay: "clay",
  };
  const labelByAgentId = new Map(world.agents.map((agent) => [agent.id, agent.label]));
  const currentAgents = [1, 2, 3, 4, 5].flatMap((slot) => {
    const records = world.agents
      .filter((agent) => agent.slot === slot)
      .sort((left, right) => right.slotGeneration - left.slotGeneration || right.spawnedAt - left.spawnedAt);
    return records.find((agent) => agent.alive) ?? records[0] ?? [];
  });
  return {
    physical: world.physical,
    simulationRunning: world.status === "running",
    simulationTimeSeconds: world.elapsedMinutes * 60,
    terrain: {
      flatStudy: world.policyVersion === 3,
      seed: world.seed,
      halfSize: world.environment.size / 2,
      islandRadius: world.environment.size,
      elevationScale: 5,
      vegetationDensity: world.config.resourceAbundance === "scarce" ? 0.38 : world.config.resourceAbundance === "plentiful" ? 0.86 : 0.64,
      rockDensity: 0.56,
      freshwater: world.environment.resources.filter(({ kind }) => kind === "freshwater").map((resource) => {
        const footprint = freshwaterVisualFootprint(resource);
        return {
          id: resource.id,
          position: resource.position,
          ...footprint,
        };
      }),
      clearings: [
        ...world.environment.resources.map(({ position }) => ({ position, radius: 8 })),
        ...world.environment.structures.map(({ position }) => ({ position, radius: 8 })),
      ],
    },
    resourceNodes: world.environment.resources.map((resource) => ({
      id: resource.id,
      kind: resourceMap[resource.kind] ?? "stone",
      position: resource.position,
      available: resource.capacity > 0 ? resource.quantity / resource.capacity : 0,
      visible: resource.quantity > 0,
    })),
    shelters: world.environment.structures.filter(({ kind }) => kind === "shelter" || kind === "fire").map((structure) => {
      return {
        id: structure.id,
        position: structure.position,
        heading: 0,
        stage: structure.kind === "fire" ? "fire" as const : "shelter" as const,
        progress: 1,
        integrity: Math.max(0, Math.min(1, structure.condition / 100)),
        ownerIds: structure.builderIds
          .map((id) => labelByAgentId.get(id))
          .filter((id): id is SurvivalAgentId => Boolean(id)),
        fireLit: structure.kind === "fire",
      };
    }),
    weather: {
      kind: weatherMap[world.environment.weather],
      intensity: world.environment.weather === "storm" ? 0.92 : world.environment.weather === "rain" ? 0.62 : world.environment.weather === "clear" ? 0.08 : 0.42,
    },
    daylight: { phase, lightLevel: Math.max(0.12, Math.min(1, world.environment.daylight)), sunAzimuth: dayFraction * Math.PI * 2 },
    agents: currentAgents.map((agent) => {
      const targetPosition = agent.currentPlan?.status === "active" ? agent.currentPlan.steps[agent.currentPlan.activeStepIndex]?.destination ?? undefined : undefined;
      const carried = carriedItem(agent);
      return {
        id: agent.label as SurvivalAgentId,
        lifeId: agent.id,
        displayName: agent.name,
        position: agent.position,
        waterDepth: depthAt(freshwaterFeatures(world.environment),agent.position),
        heading: headingFor(agent),
        alive: agent.alive,
        status: agentStatus(agent),
        action: {
          kind: actionKind(agent),
          label: activityLabel(agent,world.environment),
          targetPosition,
          tool: toolFor(agent),
        },
        carriedItem: carried ? { kind: carried } : null,
        needs: {
          health: agent.needs.health / 100,
          hydration: agent.needs.hydration / 100,
          energy: agent.needs.energy / 100,
          warmth: agent.needs.warmth / 100,
        },
      };
    }),
  };
}

export function SurvivalWorld({ world, selectedId, cameraMode, onSelectAgent, onManualCamera, onContextLost, retryKey, active, focusPosition, inspectorLevel, zoomRequest }: SurvivalWorldProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SurvivalHabitatScene | null>(null);
  const callbacksRef = useRef({ onSelectAgent, onManualCamera, onContextLost });
  const visualSnapshot = useMemo(() => mapSnapshot(world), [world]);

  useEffect(() => {
    callbacksRef.current = { onSelectAgent, onManualCamera, onContextLost };
  }, [onContextLost, onManualCamera, onSelectAgent]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let scene: SurvivalHabitatScene;
    try {
      scene = createSurvivalHabitatScene(host, {
        onSelectAgent: (id) => callbacksRef.current.onSelectAgent(id),
        onManualCamera: () => callbacksRef.current.onManualCamera(),
        onContextLost: () => callbacksRef.current.onContextLost(),
        maxDevicePixelRatio: 1.65,
        canvasLabel: "Living survival habitat. Drag to orbit, pinch or scroll to zoom, and tap an agent to inspect its record.",
        reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      });
    } catch {
      callbacksRef.current.onContextLost();
      return;
    }
    sceneRef.current = scene;
    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, [retryKey]);

  useEffect(() => {
    sceneRef.current?.update(visualSnapshot, selectedId, cameraMode);
  }, [cameraMode, selectedId, visualSnapshot, retryKey]);

  useEffect(() => {
    sceneRef.current?.setActive(active);
  }, [active, retryKey]);

  useEffect(() => {
    sceneRef.current?.focusAt(focusPosition ?? null);
  }, [focusPosition, retryKey]);

  useEffect(() => { if (zoomRequest) sceneRef.current?.zoom(zoomRequest.direction); }, [zoomRequest]);

  return <div ref={hostRef} data-testid="survival-world" data-survival-viewport data-inspector-level={inspectorLevel} />;
}
