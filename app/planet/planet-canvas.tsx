"use client";

import {
  useEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import type {
  GeoPoint,
  PlanetCamera,
  PlanetCivilization,
  PlanetEntitySelection,
  PlanetOverlay,
  PlanetSnapshot,
} from "./types";

interface PlanetCanvasProps {
  snapshot: PlanetSnapshot;
  overlay: PlanetOverlay;
  camera: PlanetCamera;
  selection: PlanetEntitySelection | null;
  onCameraChange: (camera: PlanetCamera) => void;
  onSelect: (selection: PlanetEntitySelection | null) => void;
}

interface ProjectedPoint {
  x: number;
  y: number;
  visible: boolean;
}

interface HitTarget {
  x: number;
  y: number;
  radius: number;
  selection: PlanetEntitySelection;
}

interface PointerPosition {
  x: number;
  y: number;
}

const BIOME_COLORS: Record<string, string> = {
  tundra: "#79969b",
  boreal: "#2b6b60",
  temperate: "#387c5d",
  grassland: "#7f9355",
  desert: "#b99562",
  tropical: "#176e55",
  alpine: "#69777c",
};

const RESOURCE_COLORS: Record<string, string> = {
  food: "#b8dc69",
  water: "#70d9f7",
  biological: "#53c58b",
  construction: "#c8b99e",
  metal: "#bcc8d7",
  strategic: "#de9fff",
  fuel: "#f0a15c",
  energy: "#f9e979",
};

const DEG_TO_RAD = Math.PI / 180;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function wrapLongitude(longitude: number) {
  return ((((longitude + 180) % 360) + 360) % 360) - 180;
}

function longitudeDelta(longitude: number, center: number) {
  return wrapLongitude(longitude - center);
}

function smoothstep(start: number, end: number, value: number) {
  const amount = clamp((value - start) / (end - start), 0, 1);
  return amount * amount * (3 - 2 * amount);
}

function hexToRgba(color: string, alpha: number) {
  const normalized = color.replace("#", "");
  const value = Number.parseInt(normalized.length === 3
    ? normalized.split("").map((part) => `${part}${part}`).join("")
    : normalized, 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function projectGlobe(point: GeoPoint, camera: PlanetCamera, width: number, height: number): ProjectedPoint {
  const longitude = longitudeDelta(point.longitude, camera.longitude) * DEG_TO_RAD;
  const latitude = point.latitude * DEG_TO_RAD;
  const centerLatitude = camera.latitude * DEG_TO_RAD;
  const cosLatitude = Math.cos(latitude);
  const visibility = Math.sin(centerLatitude) * Math.sin(latitude)
    + Math.cos(centerLatitude) * cosLatitude * Math.cos(longitude);
  const radius = Math.min(width, height) * (0.34 + clamp(camera.zoom - 0.7, 0, 1) * 0.13);
  return {
    x: width / 2 + radius * cosLatitude * Math.sin(longitude),
    y: height / 2 - radius * (
      Math.cos(centerLatitude) * Math.sin(latitude)
      - Math.sin(centerLatitude) * cosLatitude * Math.cos(longitude)
    ),
    visible: visibility > -0.025,
  };
}

function projectAtlas(point: GeoPoint, camera: PlanetCamera, width: number, height: number): ProjectedPoint {
  const worldWidth = width * Math.max(1, camera.zoom * 0.92);
  const worldHeight = worldWidth / 2;
  return {
    x: width / 2 + (longitudeDelta(point.longitude, camera.longitude) / 360) * worldWidth,
    y: height / 2 - ((point.latitude - camera.latitude) / 180) * worldHeight,
    visible: true,
  };
}

function findCivilization(snapshot: PlanetSnapshot, id: string | null) {
  return id ? snapshot.civilizations.find((civilization) => civilization.id === id) ?? null : null;
}

function findBelief(snapshot: PlanetSnapshot, id: string | null) {
  return id ? snapshot.beliefs.find((belief) => belief.id === id) ?? null : null;
}

function territoryColor(
  snapshot: PlanetSnapshot,
  civilization: PlanetCivilization | null,
  biome: string,
  overlay: PlanetOverlay,
) {
  if (!civilization) return BIOME_COLORS[biome] ?? "#46645d";
  if (overlay === "beliefs") {
    return findBelief(snapshot, civilization.beliefId)?.color ?? "#718096";
  }
  if (overlay === "climate" || overlay === "resources") {
    return BIOME_COLORS[biome] ?? "#46645d";
  }
  if (overlay === "technology") {
    const amount = civilization.technologyScore / 100;
    const red = Math.round(44 + amount * 80);
    const green = Math.round(85 + amount * 130);
    const blue = Math.round(105 + amount * 145);
    return `rgb(${red}, ${green}, ${blue})`;
  }
  if (overlay === "population") return "#255b51";
  return civilization.color;
}

function terrainColor(
  cell: NonNullable<PlanetSnapshot["terrain"]>[number],
  overlay: PlanetOverlay,
) {
  if (cell.ocean) {
    const depth = clamp(Math.abs(cell.elevation) / 5_000, 0, 1);
    return overlay === "climate"
      ? `rgb(${Math.round(9 + depth * 3)}, ${Math.round(47 - depth * 15)}, ${Math.round(65 - depth * 18)})`
      : `rgb(${Math.round(8 + depth * 2)}, ${Math.round(40 - depth * 13)}, ${Math.round(55 - depth * 15)})`;
  }
  if (overlay === "climate") {
    if (cell.temperature < -8) return "#a7c3c7";
    if (cell.temperature > 27 && cell.rainfall < 0.32) return "#bd9964";
    if (cell.rainfall > 0.72) return "#1e7458";
    if (cell.fertility > 0.66) return "#668c55";
  }
  return BIOME_COLORS[cell.biome] ?? BIOME_COLORS[cell.biome.replace("_forest", "")] ?? "#47715c";
}

function drawTerrainCells(
  context: CanvasRenderingContext2D,
  snapshot: PlanetSnapshot,
  overlay: PlanetOverlay,
  project: (point: GeoPoint) => ProjectedPoint,
  globe: boolean,
) {
  const cells = snapshot.terrain ?? [];
  if (!cells.length) return;
  const colorGroups = new Map<string, typeof cells>();
  for (const cell of cells) {
    // The atlas and globe already paint a continuous ocean gradient; omitting
    // sampled ocean tiles avoids both a visible depth grid and hundreds of
    // redundant draw calls at planetary scale.
    if (cell.ocean) continue;
    const color = terrainColor(cell, overlay);
    const group = colorGroups.get(color) ?? [];
    group.push(cell);
    colorGroups.set(color, group);
  }
  context.save();
  // The API deliberately sends a bounded sampling grid. Overlapping the cells
  // and filling equal-biome cells as a single compound surface hides internal
  // storage seams without smearing coastlines or doing work per visible edge.
  context.filter = `blur(${globe ? 6 : 2.25}px)`;
  for (const [color, group] of colorGroups) {
    context.beginPath();
    for (const cell of group) {
      const center = project(cell);
      if (!center.visible) continue;
      const east = project({ longitude: cell.longitude + cell.longitudeSize * 0.68, latitude: cell.latitude });
      const west = project({ longitude: cell.longitude - cell.longitudeSize * 0.68, latitude: cell.latitude });
      const north = project({ longitude: cell.longitude, latitude: cell.latitude + cell.latitudeSize * 0.68 });
      const south = project({ longitude: cell.longitude, latitude: cell.latitude - cell.latitudeSize * 0.68 });
      const radiusX = Math.max(
        1,
        east.visible && west.visible
          ? Math.abs(east.x - west.x) / 2
          : Math.max(east.visible ? Math.abs(east.x - center.x) : 0, west.visible ? Math.abs(west.x - center.x) : 0),
      );
      const radiusY = Math.max(
        1,
        north.visible && south.visible
          ? Math.abs(north.y - south.y) / 2
          : Math.max(north.visible ? Math.abs(north.y - center.y) : 0, south.visible ? Math.abs(south.y - center.y) : 0),
      );
      context.moveTo(center.x + radiusX, center.y);
      context.ellipse(center.x, center.y, radiusX, radiusY, 0, 0, Math.PI * 2);
    }
    context.fillStyle = color;
    context.fill();
  }
  context.restore();
}

function drawTerritoryCells(
  context: CanvasRenderingContext2D,
  snapshot: PlanetSnapshot,
  overlay: PlanetOverlay,
  project: (point: GeoPoint) => ProjectedPoint,
) {
  if (!["political", "beliefs", "technology", "wars"].includes(overlay)) return;
  const cells = snapshot.territoryCells ?? [];
  const territoryLookup = new Map(cells.map((cell) => [cell.cellKey, cell]));
  for (const cell of cells) {
    const [rawX, rawY] = cell.cellKey.split(":").map(Number);
    if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) continue;
    const west = -180 + rawX * 2;
    const north = 90 - rawY * 2;
    const civilization = findCivilization(snapshot, cell.civilizationId);
    const belief = civilization ? findBelief(snapshot, civilization.beliefId) : null;
    const fill = overlay === "beliefs"
      ? belief?.color
      : overlay === "technology"
        ? territoryColor(snapshot, civilization, "temperate", "technology")
        : civilization?.color;
    const points = [
      { longitude: west, latitude: north - 2 },
      { longitude: west + 2, latitude: north - 2 },
      { longitude: west + 2, latitude: north },
      { longitude: west, latitude: north },
    ];
    if (!fill || !beginLandPath(context, points, project)) continue;
    context.fillStyle = hexToRgba(fill, overlay === "political" ? 0.42 : 0.32);
    context.fill();
    if (cell.contestedBy.length) {
      context.strokeStyle = "rgba(255, 126, 104, .95)";
      context.lineWidth = 1.6;
      context.stroke();
    }
  }

  // Stroke only ownership changes, never every storage cell. Political borders
  // therefore remain exact without revealing the engine's internal grid.
  context.save();
  context.strokeStyle = "rgba(217, 241, 235, .62)";
  context.lineWidth = 0.9;
  for (const cell of cells) {
    const [x, y] = cell.cellKey.split(":").map(Number);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const west = -180 + x * 2;
    const north = 90 - y * 2;
    const neighborEdges = [
      { neighbor: `${(x + 179) % 180}:${y}`, start: { longitude: west, latitude: north - 2 }, end: { longitude: west, latitude: north } },
      { neighbor: `${(x + 1) % 180}:${y}`, start: { longitude: west + 2, latitude: north - 2 }, end: { longitude: west + 2, latitude: north } },
      { neighbor: `${x}:${y + 1}`, start: { longitude: west, latitude: north - 2 }, end: { longitude: west + 2, latitude: north - 2 } },
      { neighbor: `${x}:${y - 1}`, start: { longitude: west, latitude: north }, end: { longitude: west + 2, latitude: north } },
    ];
    for (const edge of neighborEdges) {
      const neighbor = territoryLookup.get(edge.neighbor);
      if (neighbor?.civilizationId === cell.civilizationId) continue;
      if (neighbor && cell.cellKey.localeCompare(neighbor.cellKey) > 0) continue;
      const start = project(edge.start);
      const end = project(edge.end);
      if (!start.visible || !end.visible) continue;
      context.beginPath();
      context.moveTo(start.x, start.y);
      context.lineTo(end.x, end.y);
      context.stroke();
    }
  }
  context.restore();
}

function beginLandPath(
  context: CanvasRenderingContext2D,
  points: GeoPoint[],
  project: (point: GeoPoint) => ProjectedPoint,
) {
  let started = false;
  let visibleCount = 0;
  context.beginPath();
  for (const point of points) {
    const projected = project(point);
    if (!projected.visible) continue;
    visibleCount += 1;
    if (!started) {
      context.moveTo(projected.x, projected.y);
      started = true;
    } else {
      context.lineTo(projected.x, projected.y);
    }
  }
  if (visibleCount >= 3) context.closePath();
  return visibleCount >= 3;
}

function drawStars(context: CanvasRenderingContext2D, width: number, height: number, seed: number) {
  const gradient = context.createRadialGradient(width * 0.52, height * 0.45, 0, width * 0.52, height * 0.45, Math.max(width, height));
  gradient.addColorStop(0, "#081a24");
  gradient.addColorStop(0.52, "#041018");
  gradient.addColorStop(1, "#010509");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  const starCount = Math.min(330, Math.max(110, Math.floor((width * height) / 5_800)));
  for (let index = 0; index < starCount; index += 1) {
    const x = ((index * 12_913 + seed * 17) % 10_007) / 10_007 * width;
    const y = ((index * 7_919 + seed * 31) % 9_973) / 9_973 * height;
    const size = 0.45 + (((index * 37 + seed) % 17) / 17) * 1.25;
    const opacity = 0.18 + (((index * 71 + seed) % 29) / 29) * 0.62;
    context.fillStyle = `rgba(217, 242, 255, ${opacity})`;
    context.fillRect(x, y, size, size);
  }
}

function drawGlobe(
  context: CanvasRenderingContext2D,
  snapshot: PlanetSnapshot,
  camera: PlanetCamera,
  overlay: PlanetOverlay,
  selection: PlanetEntitySelection | null,
  width: number,
  height: number,
  opacity: number,
  hits: HitTarget[],
) {
  const radius = Math.min(width, height) * (0.34 + clamp(camera.zoom - 0.7, 0, 1) * 0.13);
  const project = (point: GeoPoint) => projectGlobe(point, camera, width, height);
  context.save();
  context.globalAlpha = opacity;
  const atmosphere = context.createRadialGradient(width / 2, height / 2, radius * 0.72, width / 2, height / 2, radius * 1.1);
  atmosphere.addColorStop(0, "rgba(57, 194, 205, 0)");
  atmosphere.addColorStop(0.84, "rgba(73, 211, 222, 0.08)");
  atmosphere.addColorStop(0.98, "rgba(94, 222, 235, 0.27)");
  atmosphere.addColorStop(1, "rgba(94, 222, 235, 0)");
  context.fillStyle = atmosphere;
  context.beginPath();
  context.arc(width / 2, height / 2, radius * 1.1, 0, Math.PI * 2);
  context.fill();

  const ocean = context.createRadialGradient(width * 0.43, height * 0.36, radius * 0.08, width / 2, height / 2, radius);
  ocean.addColorStop(0, "#174959");
  ocean.addColorStop(0.55, "#0c2d3d");
  ocean.addColorStop(1, "#061821");
  context.fillStyle = ocean;
  context.beginPath();
  context.arc(width / 2, height / 2, radius, 0, Math.PI * 2);
  context.fill();
  context.clip();

  drawTerrainCells(context, snapshot, overlay, project, true);

  for (const landmass of (snapshot.terrain?.length ? [] : snapshot.landmasses)) {
    const civilization = findCivilization(snapshot, landmass.civilizationId);
    if (!beginLandPath(context, landmass.points, project)) continue;
    context.fillStyle = hexToRgba(territoryColor(snapshot, civilization, landmass.biome, overlay), overlay === "political" ? 0.78 : 0.68);
    context.fill();
    context.strokeStyle = civilization ? hexToRgba(civilization.color, 0.62) : "rgba(171, 213, 195, 0.2)";
    context.lineWidth = civilization ? 1.2 : 0.8;
    context.stroke();
  }

  drawTerritoryCells(context, snapshot, overlay, project);

  drawMapEntities(context, snapshot, camera, overlay, selection, project, width, height, true, hits);
  context.restore();

  context.save();
  context.globalAlpha = opacity;
  context.strokeStyle = "rgba(135, 226, 232, 0.34)";
  context.lineWidth = 1;
  context.beginPath();
  context.arc(width / 2, height / 2, radius, 0, Math.PI * 2);
  context.stroke();
  context.restore();
}

function drawAtlas(
  context: CanvasRenderingContext2D,
  snapshot: PlanetSnapshot,
  camera: PlanetCamera,
  overlay: PlanetOverlay,
  selection: PlanetEntitySelection | null,
  width: number,
  height: number,
  opacity: number,
  hits: HitTarget[],
) {
  const project = (point: GeoPoint) => projectAtlas(point, camera, width, height);
  context.save();
  context.globalAlpha = opacity;
  const ocean = context.createLinearGradient(0, 0, 0, height);
  ocean.addColorStop(0, "#0a2b3a");
  ocean.addColorStop(0.5, "#071f2d");
  ocean.addColorStop(1, "#051822");
  context.fillStyle = ocean;
  context.fillRect(0, 0, width, height);

  drawTerrainCells(context, snapshot, overlay, project, false);

  if (camera.zoom >= 2.4) {
    context.strokeStyle = "rgba(128, 200, 207, 0.065)";
    context.lineWidth = 0.7;
    for (let longitude = -180; longitude < 180; longitude += 30) {
      const top = project({ longitude, latitude: 90 });
      const bottom = project({ longitude, latitude: -90 });
      context.beginPath();
      context.moveTo(top.x, top.y);
      context.lineTo(bottom.x, bottom.y);
      context.stroke();
    }
    for (let latitude = -60; latitude <= 60; latitude += 30) {
      const left = project({ longitude: camera.longitude - 179.99, latitude });
      const right = project({ longitude: camera.longitude + 179.99, latitude });
      context.beginPath();
      context.moveTo(left.x, left.y);
      context.lineTo(right.x, right.y);
      context.stroke();
    }
  }

  for (const landmass of (snapshot.terrain?.length ? [] : snapshot.landmasses)) {
    const civilization = findCivilization(snapshot, landmass.civilizationId);
    if (!beginLandPath(context, landmass.points, project)) continue;
    const fill = territoryColor(snapshot, civilization, landmass.biome, overlay);
    context.fillStyle = hexToRgba(fill, overlay === "political" ? 0.7 : 0.76);
    context.fill();
    context.strokeStyle = civilization ? hexToRgba(civilization.color, 0.8) : "rgba(159, 203, 187, 0.32)";
    context.lineWidth = clamp(camera.zoom * 0.28, 0.8, 2.4);
    context.stroke();
  }

  drawTerritoryCells(context, snapshot, overlay, project);

  drawMapEntities(context, snapshot, camera, overlay, selection, project, width, height, false, hits);
  context.restore();
}

function drawMapEntities(
  context: CanvasRenderingContext2D,
  snapshot: PlanetSnapshot,
  camera: PlanetCamera,
  overlay: PlanetOverlay,
  selection: PlanetEntitySelection | null,
  project: (point: GeoPoint) => ProjectedPoint,
  width: number,
  height: number,
  globe: boolean,
  hits: HitTarget[],
) {
  const capitalByCivilization = new Map<string, PlanetSettlementWithPosition>();
  for (const settlement of snapshot.settlements) {
    const current = capitalByCivilization.get(settlement.civilizationId);
    if (!current || settlement.population > current.population) capitalByCivilization.set(settlement.civilizationId, settlement);
  }

  if (overlay === "diplomacy") {
    for (const relation of snapshot.relations) {
      const from = capitalByCivilization.get(relation.fromCivilizationId);
      const to = capitalByCivilization.get(relation.toCivilizationId);
      if (!from || !to) continue;
      const start = project(from);
      const end = project(to);
      if (!start.visible || !end.visible) continue;
      context.strokeStyle = relation.kind === "alliance" ? "rgba(100, 230, 197, .8)" : relation.kind === "trade" ? "rgba(108, 197, 237, .65)" : "rgba(244, 216, 122, .65)";
      context.lineWidth = relation.kind === "alliance" ? 2.2 : 1.2;
      context.setLineDash(relation.kind === "trade" ? [4, 5] : relation.kind === "truce" ? [1, 5] : []);
      context.beginPath();
      context.moveTo(start.x, start.y);
      context.quadraticCurveTo((start.x + end.x) / 2, Math.min(start.y, end.y) - Math.abs(start.x - end.x) * 0.08, end.x, end.y);
      context.stroke();
    }
    context.setLineDash([]);
  }

  if (overlay === "wars") {
    for (const conflict of snapshot.conflicts) {
      const point = project(conflict);
      if (!point.visible || point.x < -20 || point.x > width + 20 || point.y < -20 || point.y > height + 20) continue;
      const radius = 7 + conflict.intensity * 0.08;
      context.fillStyle = "rgba(255, 102, 86, .12)";
      context.strokeStyle = "rgba(255, 124, 102, .85)";
      context.lineWidth = 1.5;
      context.beginPath();
      context.arc(point.x, point.y, radius, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      context.beginPath();
      context.moveTo(point.x - radius * 0.42, point.y - radius * 0.42);
      context.lineTo(point.x + radius * 0.42, point.y + radius * 0.42);
      context.moveTo(point.x + radius * 0.42, point.y - radius * 0.42);
      context.lineTo(point.x - radius * 0.42, point.y + radius * 0.42);
      context.stroke();
    }
  }

  if (overlay === "beliefs") {
    for (const influence of snapshot.beliefInfluence ?? []) {
      const point = project(influence);
      if (!point.visible || point.x < -24 || point.x > width + 24 || point.y < -24 || point.y > height + 24) continue;
      const belief = findBelief(snapshot, influence.beliefId);
      const radius = clamp(4 + Math.log2(influence.adherents + 1) * 1.25 + influence.influence * 0.035, 5, globe ? 18 : 28);
      context.fillStyle = hexToRgba(belief?.color ?? "#b7a1d8", 0.12);
      context.beginPath();
      context.arc(point.x, point.y, radius, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = hexToRgba(belief?.color ?? "#b7a1d8", 0.54);
      context.lineWidth = 1;
      context.beginPath();
      context.arc(point.x, point.y, Math.max(2, radius * 0.22), 0, Math.PI * 2);
      context.stroke();
    }
  }

  if (overlay === "resources") {
    for (const resourceCell of snapshot.resourceCells ?? []) {
      const point = project(resourceCell);
      if (!point.visible || point.x < -20 || point.x > width + 20 || point.y < -20 || point.y > height + 20) continue;
      const entries = Object.entries(resourceCell.families);
      const count = entries.reduce((sum, [, amount]) => sum + amount, 0);
      const dominant = entries.sort((left, right) => right[1] - left[1])[0]?.[0] ?? "strategic";
      const color = RESOURCE_COLORS[dominant] ?? RESOURCE_COLORS.strategic;
      const radius = clamp(3 + Math.log2(count + 1) * 1.2, 4, 10);
      context.fillStyle = hexToRgba(color, 0.2);
      context.beginPath();
      context.arc(point.x, point.y, radius + 4, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = color;
      context.beginPath();
      context.arc(point.x, point.y, radius, 0, Math.PI * 2);
      context.fill();
    }
    const maxResources = camera.zoom < 2 ? 180 : snapshot.resources.length;
    for (let index = 0; index < Math.min(maxResources, snapshot.resources.length); index += 1) {
      const resource = snapshot.resources[index];
      const point = project(resource);
      if (!point.visible || point.x < -16 || point.x > width + 16 || point.y < -16 || point.y > height + 16) continue;
      const discovered = resource.discoveredBy.length > 0;
      const radius = globe ? 2.1 : clamp(1.8 + camera.zoom * 0.36, 2.4, 6);
      context.fillStyle = discovered ? RESOURCE_COLORS[resource.family] : "rgba(176, 202, 205, .28)";
      context.beginPath();
      context.arc(point.x, point.y, radius, 0, Math.PI * 2);
      context.fill();
      if (camera.zoom >= 7 && discovered) {
        context.fillStyle = "rgba(229, 245, 241, .78)";
        context.font = "500 11px ui-monospace, monospace";
        context.fillText(resource.name, point.x + radius + 5, point.y + 3);
      }
      hits.push({ x: point.x, y: point.y, radius: Math.max(8, radius + 3), selection: { kind: "resource", id: resource.id } });
    }
  }

  if (overlay === "population" || camera.zoom >= 2.2) {
    drawAgents(context, snapshot, camera, selection, project, width, height, globe, hits);
  }

  for (const settlement of snapshot.settlements) {
    const point = project(settlement);
    if (!point.visible || point.x < -30 || point.x > width + 30 || point.y < -30 || point.y > height + 30) continue;
    const civilization = findCivilization(snapshot, settlement.civilizationId);
    const radius = clamp(2.8 + Math.sqrt(settlement.population) * 0.24 + (globe ? 0 : camera.zoom * 0.15), 4, globe ? 10 : 14);
    if (overlay === "technology") {
      context.fillStyle = civilization ? hexToRgba(civilization.color, 0.12 + civilization.technologyScore / 220) : "rgba(120,220,230,.15)";
      context.beginPath();
      context.arc(point.x, point.y, radius * 2.2, 0, Math.PI * 2);
      context.fill();
    }
    context.fillStyle = civilization?.color ?? "#d7e3df";
    context.strokeStyle = "rgba(2, 11, 16, .88)";
    context.lineWidth = 2;
    context.beginPath();
    context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    if (settlement.kind === "capital") {
      context.fillStyle = "rgba(238, 250, 245, .95)";
      context.beginPath();
      context.arc(point.x, point.y, Math.max(1.6, radius * 0.28), 0, Math.PI * 2);
      context.fill();
    }
    const isSelected = selection?.kind === "settlement" && selection.id === settlement.id;
    if (isSelected) {
      context.strokeStyle = "#ffffff";
      context.lineWidth = 1.5;
      context.beginPath();
      context.arc(point.x, point.y, radius + 5, 0, Math.PI * 2);
      context.stroke();
    }
    if ((!globe && camera.zoom >= 3.1) || (globe && settlement.kind === "capital")) {
      context.fillStyle = "rgba(231, 244, 240, .86)";
      context.font = `${settlement.kind === "capital" ? 600 : 500} ${globe ? 10 : 11}px ui-sans-serif, system-ui`;
      context.fillText(settlement.name, point.x + radius + 5, point.y + 4);
    }
    hits.push({ x: point.x, y: point.y, radius: Math.max(10, radius + 4), selection: { kind: "settlement", id: settlement.id } });
  }
}

type PlanetSettlementWithPosition = PlanetSnapshot["settlements"][number];

function drawAgents(
  context: CanvasRenderingContext2D,
  snapshot: PlanetSnapshot,
  camera: PlanetCamera,
  selection: PlanetEntitySelection | null,
  project: (point: GeoPoint) => ProjectedPoint,
  width: number,
  height: number,
  globe: boolean,
  hits: HitTarget[],
) {
  const individualMode = !globe && camera.zoom >= 7;
  if (individualMode) {
    for (const agent of snapshot.agents) {
      const point = project(agent);
      if (!point.visible || point.x < -8 || point.x > width + 8 || point.y < -8 || point.y > height + 8) continue;
      const civilization = findCivilization(snapshot, agent.civilizationId);
      const selected = selection?.kind === "agent" && selection.id === agent.id;
      const radius = selected ? 4.6 : clamp(1.7 + camera.zoom * 0.08, 2.1, 3.6);
      context.fillStyle = civilization?.color ?? "#cbd8d4";
      context.beginPath();
      context.arc(point.x, point.y, radius, 0, Math.PI * 2);
      context.fill();
      if (selected) {
        context.strokeStyle = "rgba(255,255,255,.95)";
        context.lineWidth = 1.5;
        context.beginPath();
        context.arc(point.x, point.y, radius + 4, 0, Math.PI * 2);
        context.stroke();
      }
      hits.push({ x: point.x, y: point.y, radius: 8, selection: { kind: "agent", id: agent.id } });
    }
    return;
  }

  if ((snapshot.agentClusters?.length ?? 0) > 0) {
    for (const cluster of snapshot.agentClusters ?? []) {
      const point = project(cluster);
      if (!point.visible || point.x < 0 || point.x > width || point.y < 0 || point.y > height) continue;
      const civilization = findCivilization(snapshot, cluster.civilizationIds[0] ?? null);
      const color = civilization?.color ?? "#b4cbc8";
      const radius = clamp(2.5 + Math.log2(cluster.count + 1) * 1.55, 3.5, 13);
      context.fillStyle = hexToRgba(color, 0.18);
      context.beginPath();
      context.arc(point.x, point.y, radius + 4, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = hexToRgba(color, 0.92);
      context.beginPath();
      context.arc(point.x, point.y, radius, 0, Math.PI * 2);
      context.fill();
      if (!globe && cluster.count > 8) {
        context.fillStyle = "rgba(4, 16, 20, .9)";
        context.textAlign = "center";
        context.font = "700 9px ui-monospace, monospace";
        context.fillText(cluster.count > 999 ? `${Math.round(cluster.count / 100) / 10}k` : String(cluster.count), point.x, point.y + 3);
        context.textAlign = "start";
      }
    }
    return;
  }

  const gridSize = globe ? 30 : clamp(48 - camera.zoom * 4, 26, 42);
  const clusters = new Map<string, { x: number; y: number; count: number; color: string }>();
  for (const agent of snapshot.agents) {
    const point = project(agent);
    if (!point.visible || point.x < 0 || point.x > width || point.y < 0 || point.y > height) continue;
    const key = `${Math.floor(point.x / gridSize)}:${Math.floor(point.y / gridSize)}`;
    const current = clusters.get(key);
    if (current) {
      current.x += point.x;
      current.y += point.y;
      current.count += 1;
    } else {
      clusters.set(key, {
        x: point.x,
        y: point.y,
        count: 1,
        color: findCivilization(snapshot, agent.civilizationId)?.color ?? "#cbd8d4",
      });
    }
  }
  for (const cluster of clusters.values()) {
    const x = cluster.x / cluster.count;
    const y = cluster.y / cluster.count;
    const radius = clamp(2.5 + Math.log2(cluster.count + 1) * 1.5, 3.5, 12);
    context.fillStyle = hexToRgba(cluster.color, 0.18);
    context.beginPath();
    context.arc(x, y, radius + 4, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = hexToRgba(cluster.color, 0.92);
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
    if (cluster.count > 8 && !globe) {
      context.fillStyle = "rgba(4, 16, 20, .9)";
      context.textAlign = "center";
      context.font = "700 9px ui-monospace, monospace";
      context.fillText(cluster.count > 999 ? `${Math.round(cluster.count / 100) / 10}k` : String(cluster.count), x, y + 3);
      context.textAlign = "start";
    }
  }
}

function drawScene(
  context: CanvasRenderingContext2D,
  snapshot: PlanetSnapshot,
  camera: PlanetCamera,
  overlay: PlanetOverlay,
  selection: PlanetEntitySelection | null,
  width: number,
  height: number,
  hits: HitTarget[],
) {
  context.clearRect(0, 0, width, height);
  drawStars(context, width, height, snapshot.meta.seed);
  const transition = smoothstep(1.18, 1.88, camera.zoom);
  if (transition < 0.995) {
    drawGlobe(context, snapshot, camera, overlay, selection, width, height, 1 - transition, hits);
  }
  if (transition > 0.005) {
    drawAtlas(context, snapshot, camera, overlay, selection, width, height, transition, hits);
  }
}

export function PlanetCanvas({
  snapshot,
  overlay,
  camera,
  selection,
  onCameraChange,
  onSelect,
}: PlanetCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cameraRef = useRef(camera);
  const hitsRef = useRef<HitTarget[]>([]);
  const pointersRef = useRef(new Map<number, PointerPosition>());
  const movedRef = useRef(0);
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);

  useEffect(() => {
    cameraRef.current = camera;
  }, [camera]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return;

    const render = () => {
      const rectangle = canvas.getBoundingClientRect();
      const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
      const targetWidth = Math.max(1, Math.round(rectangle.width * pixelRatio));
      const targetHeight = Math.max(1, Math.round(rectangle.height * pixelRatio));
      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
      }
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      hitsRef.current = [];
      drawScene(context, snapshot, camera, overlay, selection, rectangle.width, rectangle.height, hitsRef.current);
    };

    render();
    const observer = new ResizeObserver(render);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [snapshot, camera, overlay, selection]);

  function commitCamera(next: PlanetCamera) {
    const normalized = {
      longitude: wrapLongitude(next.longitude),
      latitude: clamp(next.latitude, -82, 82),
      zoom: clamp(next.zoom, 0.7, 18),
    };
    cameraRef.current = normalized;
    onCameraChange(normalized);
  }

  function pointerPosition(event: ReactPointerEvent<HTMLCanvasElement>) {
    const rectangle = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rectangle.left, y: event.clientY - rectangle.top };
  }

  function onPointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointerPosition(event);
    pointersRef.current.set(event.pointerId, point);
    movedRef.current = 0;
    if (pointersRef.current.size === 2) {
      const [first, second] = [...pointersRef.current.values()];
      pinchRef.current = { distance: Math.hypot(first.x - second.x, first.y - second.y), zoom: cameraRef.current.zoom };
    }
  }

  function onPointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    const previous = pointersRef.current.get(event.pointerId);
    if (!previous) return;
    const next = pointerPosition(event);
    pointersRef.current.set(event.pointerId, next);
    if (pointersRef.current.size >= 2) {
      const [first, second] = [...pointersRef.current.values()];
      const distance = Math.hypot(first.x - second.x, first.y - second.y);
      const pinch = pinchRef.current;
      if (pinch && pinch.distance > 0) commitCamera({ ...cameraRef.current, zoom: pinch.zoom * (distance / pinch.distance) });
      movedRef.current += Math.abs(distance - (pinch?.distance ?? distance));
      return;
    }
    const canvas = event.currentTarget;
    const rectangle = canvas.getBoundingClientRect();
    const dx = next.x - previous.x;
    const dy = next.y - previous.y;
    movedRef.current += Math.abs(dx) + Math.abs(dy);
    const current = cameraRef.current;
    const isGlobe = current.zoom < 1.55;
    const worldWidth = rectangle.width * Math.max(1, current.zoom * 0.92);
    commitCamera({
      ...current,
      longitude: current.longitude - (isGlobe ? dx * 0.3 / current.zoom : dx * 360 / worldWidth),
      latitude: current.latitude + (isGlobe ? dy * 0.24 / current.zoom : dy * 360 / worldWidth),
    });
  }

  function onPointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    const point = pointerPosition(event);
    pointersRef.current.delete(event.pointerId);
    pinchRef.current = null;
    if (movedRef.current > 8) return;
    const target = [...hitsRef.current]
      .reverse()
      .find((hit) => Math.hypot(point.x - hit.x, point.y - hit.y) <= hit.radius);
    onSelect(target?.selection ?? null);
  }

  function onWheel(event: ReactWheelEvent<HTMLCanvasElement>) {
    event.preventDefault();
    const multiplier = Math.exp(-event.deltaY * 0.0012);
    commitCamera({ ...cameraRef.current, zoom: cameraRef.current.zoom * multiplier });
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLCanvasElement>) {
    const current = cameraRef.current;
    const step = 14 / Math.max(1, current.zoom * 0.7);
    if (event.key === "ArrowLeft") commitCamera({ ...current, longitude: current.longitude - step });
    else if (event.key === "ArrowRight") commitCamera({ ...current, longitude: current.longitude + step });
    else if (event.key === "ArrowUp") commitCamera({ ...current, latitude: current.latitude + step * 0.65 });
    else if (event.key === "ArrowDown") commitCamera({ ...current, latitude: current.latitude - step * 0.65 });
    else if (event.key === "+" || event.key === "=") commitCamera({ ...current, zoom: current.zoom * 1.25 });
    else if (event.key === "-" || event.key === "_") commitCamera({ ...current, zoom: current.zoom / 1.25 });
    else if (event.key === "Home") commitCamera({ longitude: 0, latitude: 12, zoom: 0.86 });
    else if (event.key === "Escape") onSelect(null);
    else return;
    event.preventDefault();
  }

  return (
    <canvas
      ref={canvasRef}
      aria-label="Interactive planet map. Drag to rotate or pan, use the mouse wheel or plus and minus keys to zoom, and press arrow keys to move."
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
      tabIndex={0}
    />
  );
}
