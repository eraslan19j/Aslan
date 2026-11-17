import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PedestrianSimulator } from '../core/pedestrians';
import { getQualityPreset } from '../core/quality';
import { getTimeCycleProfile } from '../core/timeCycle';
import { RoadTrafficSimulator } from '../core/traffic';
import { createVehicleState, stepPlayerVehicle } from '../core/vehicle';
import { BuildingSpatialGrid } from '../core/world/collision';
import type { RegionTileData, RoadGraph, TerrainGrid } from '../core/world/types';
import { buildTileMeshes, applyTileDistanceLod } from './tileMeshBuilder';
import {
  buildSculptedPoliceBodyGeometry,
  buildTrafficClassGeometries,
} from './vehicleMesh';

function makeFlatTerrain(): TerrainGrid {
  return {
    minX: -300,
    maxX: 600,
    minZ: -300,
    maxZ: 600,
    cols: 3,
    rows: 3,
    elevDecimeters: new Array<number>(9).fill(0),
    source: 'test',
    minMeters: 0,
    maxMeters: 0,
  };
}

function makeDummyMaterials() {
  const mat = () => new THREE.MeshStandardMaterial({ vertexColors: true });
  return {
    upperBuildingMat: mat(),
    groundRoofMat: mat(),
    roadMat: mat(),
    areaMat: mat(),
    propsMat: mat(),
  };
}

describe('Open-World Upgrade Verification (Stages B–G)', () => {
  it('builds 2-layer Z-separated curb/asphalt road geometry with junction hubs & zebra crosswalks in 1 draw call', () => {
    // T-junction at (50, 50): main avenue (10,50)->(90,50) + side street (50,50)->(50,120)
    const tile: RegionTileData = {
      key: '0_0',
      tx: 0,
      tz: 0,
      tileSize: 300,
      buildings: [],
      roads: [
        {
          id: 'main-ave',
          roadClass: 'primary',
          width: 9.0,
          points: [10, 50, 50, 50, 90, 50],
        },
        {
          id: 'side-st',
          roadClass: 'residential',
          width: 6.0,
          points: [50, 50, 50, 120],
        },
      ],
      areas: [
        {
          id: 'park-1',
          kind: 'park',
          ring: [110, 110, 140, 110, 140, 140, 110, 140],
        },
      ],
    };

    const mats = makeDummyMaterials();
    const built = buildTileMeshes(tile, makeFlatTerrain(), mats, true, true, 300);

    // Must compile roads into exactly 1 batched Mesh draw call
    const roadMeshes = built.group.children.filter(
      (c): c is THREE.Mesh => c instanceof THREE.Mesh && c.material === mats.roadMat,
    );
    expect(roadMeshes.length).toBe(1);

    const roadGeo = roadMeshes[0]!.geometry;
    const pos = roadGeo.getAttribute('position') as THREE.BufferAttribute;
    const uv = roadGeo.getAttribute('uv') as THREE.BufferAttribute;

    let curbVerts = 0;
    let asphaltVerts = 0;
    let crosswalkVerts = 0;
    let maxCurbY = -Infinity;
    let minAsphaltY = Infinity;

    for (let i = 0; i < pos.count; i += 1) {
      const u = uv.getX(i);
      const y = pos.getY(i);
      if (u <= 0.141) {
        curbVerts += 1;
        if (y > maxCurbY) maxCurbY = y;
      } else if (u >= 0.859) {
        crosswalkVerts += 1;
      } else {
        asphaltVerts += 1;
        if (y < minAsphaltY) minAsphaltY = y;
      }
    }

    // All three atlas bands (lower concrete curb, upper pure asphalt, indexed zebra crosswalk quad) must exist
    expect(curbVerts).toBeGreaterThan(20);
    expect(asphaltVerts).toBeGreaterThan(20);
    expect(crosswalkVerts).toBeGreaterThanOrEqual(4);
    // CRITICAL ROOT-CAUSE INVARIANT: every asphalt vertex sits strictly ABOVE the curb deck so
    // concrete curbs can NEVER slice across a T-junction mouth or road start/end!
    expect(minAsphaltY).toBeGreaterThan(maxCurbY + 0.03);

    // Distance LOD respects 4-tier Android quality cutoffs cleanly
    const low = getQualityPreset('low');
    const ultra = getQualityPreset('ultra');
    applyTileDistanceLod(built, 500, 500, low.shadowsEnabled, low.propLodDistance, low.shadowLodDistance);
    expect(built.propsMesh?.visible).toBe(false);
    applyTileDistanceLod(built, 150, 150, ultra.shadowsEnabled, ultra.propLodDistance, ultra.shadowLodDistance);
    expect(built.propsMesh?.visible).toBe(true);
  });

  it('simulates spring-damped vehicle suspension squat, brake dive, corner roll & TimeCycle wet road sheen', () => {
    const grid = new BuildingSpatialGrid();
    const v = createVehicleState('taxi-test', 'taxi', 0, 0, 0, 0);
    const bounds = { minX: -500, maxX: 500, minZ: -500, maxZ: 500 };

    // Accelerate + steer hard left
    for (let i = 0; i < 30; i += 1) {
      stepPlayerVehicle(v, { throttle: 1, brake: 0, steer: 0.9, handbrake: false }, 1 / 60, bounds, () => 0, grid);
    }
    expect(v.speed).toBeGreaterThan(4);
    expect(Math.abs(v.suspRoll)).toBeGreaterThan(0.01);
    expect(v.suspPitch).toBeLessThan(0); // Rear squat under acceleration

    // Slam brakes -> forward nose dive (+suspPitch)
    for (let i = 0; i < 20; i += 1) {
      stepPlayerVehicle(v, { throttle: 0, brake: 1, steer: 0, handbrake: false }, 1 / 60, bounds, () => 0, grid);
    }
    expect(v.suspPitch).toBeGreaterThan(0.015);

    // Vice City TimeCycle night wet-asphalt reflection sheen vs crisp day roughness
    expect(getTimeCycleProfile('night').roadRoughness).toBeLessThan(getTimeCycleProfile('day').roadRoughness);
    expect(getTimeCycleProfile('sunset').sunOffset[1]).toBeLessThan(getTimeCycleProfile('day').sunOffset[1]);
  });

  it('scales NPC crowd separation/idle states and AI traffic parked/moving densities across 4 quality tiers', () => {
    const graph: RoadGraph = {
      schemaVersion: 1,
      regionId: 'test',
      nodes: [
        { id: 'n0', x: 0, y: 0, z: 0 },
        { id: 'n1', x: 0, y: 0, z: 45 },
        { id: 'n2', x: 45, y: 0, z: 45 },
        { id: 'n3', x: 45, y: 0, z: 0 },
      ],
      edges: [
        { id: 'e0', from: 'n0', to: 'n1', lengthMeters: 45, roadClass: 'primary', width: 8, oneWay: false, speedLimitKph: 45 },
        { id: 'e1', from: 'n1', to: 'n2', lengthMeters: 45, roadClass: 'primary', width: 8, oneWay: false, speedLimitKph: 45 },
        { id: 'e2', from: 'n2', to: 'n3', lengthMeters: 45, roadClass: 'primary', width: 8, oneWay: false, speedLimitKph: 45 },
        { id: 'e3', from: 'n3', to: 'n0', lengthMeters: 45, roadClass: 'primary', width: 8, oneWay: false, speedLimitKph: 45 },
      ],
    };

    const peds = new PedestrianSimulator(graph, getQualityPreset('low').pedestrianCount, 42);
    expect(peds.getAgents().length).toBe(getQualityPreset('low').pedestrianCount);
    peds.setMaxActiveCount(getQualityPreset('ultra').pedestrianCount, 20, 20);
    expect(peds.getAgents().length).toBe(getQualityPreset('ultra').pedestrianCount);

    for (let i = 0; i < 60; i += 1) {
      peds.step(1 / 30, 20, 20, 0, false, []);
    }
    expect(peds.getAgents().every((p) => Number.isFinite(p.x) && Number.isFinite(p.z))).toBe(true);

    const traffic = new RoadTrafficSimulator(graph, getQualityPreset('high').trafficCount, 99, 20, 20);
    expect(traffic.getAgents().length).toBe(getQualityPreset('high').trafficCount);
    // Must include both moving road-network cars and curbside parked vehicles
    expect(traffic.getAgents().some((a) => a.parked)).toBe(true);
    expect(traffic.getAgents().some((a) => !a.parked)).toBe(true);
    traffic.setMaxActiveCount(getQualityPreset('low').trafficCount, 20, 20);
    expect(traffic.getAgents().length).toBe(getQualityPreset('low').trafficCount);
  });

  it('builds sculpted wheeled NPC traffic archetypes (sports/sedan/suv) & supports GTA free-roam car takeover', () => {
    // Verify all 3 instanced NPC silhouettes have rich sculpted body, wheel/trim, glass, and light geometries
    for (const style of ['sports', 'sedan', 'suv'] as const) {
      const geos = buildTrafficClassGeometries(style);
      expect(geos.bodyGeo.getAttribute('position').count).toBeGreaterThan(200);
      // 4 cylindrical tires + rims + hubs + bumpers + grille + exhausts -> high sculpted detail, zero plain boxes!
      expect(geos.trimWheelsGeo.getAttribute('position').count).toBeGreaterThan(450);
      expect(geos.glassGeo.getAttribute('position').count).toBeGreaterThan(60);
      expect(geos.lightsGeo.getAttribute('position').count).toBeGreaterThan(80);
    }
    expect(buildSculptedPoliceBodyGeometry().getAttribute('position').count).toBeGreaterThan(450);

    // Verify GTA Free-Roam NPC car theft/swap preserves the player's old car parked in the world
    const graph: RoadGraph = {
      schemaVersion: 1,
      regionId: 'test',
      nodes: [
        { id: 'n0', x: 0, y: 0, z: 0 },
        { id: 'n1', x: 0, y: 0, z: 50 },
      ],
      edges: [
        { id: 'e0', from: 'n0', to: 'n1', lengthMeters: 50, roadClass: 'primary', width: 8, oneWay: false, speedLimitKph: 45 },
      ],
    };
    const traffic = new RoadTrafficSimulator(graph, 8, 77, 0, 25);
    const target = traffic.getAgents()[0]!;
    const origArchetype = target.archetype;
    const nearest = traffic.findNearestAgent(target.x + 1.0, target.z, 5.5);
    expect(nearest?.id).toBe(target.id);

    const claimed = traffic.swapWithPlayerVehicle(target.id, {
      archetype: 'sports',
      paintHex: 0xdc2626,
      x: 10,
      y: 0,
      z: 10,
      heading: 1.2,
      pitch: 0,
    });
    expect(claimed).not.toBeNull();
    expect(claimed!.archetype).toBe(origArchetype);
    // Player's previous crimson sports coupe stays cleanly parked at (10, 10)
    const replacedSlot = traffic.getAgents().find((a) => a.id === target.id)!;
    expect(replacedSlot.archetype).toBe('sports');
    expect(replacedSlot.paintHex).toBe(0xdc2626);
    expect(replacedSlot.parked).toBe(true);
    expect(replacedSlot.x).toBe(10);
  });
});
