import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PedestrianSimulator } from './pedestrians';
import {
  attachPlayerToVehicleSeat,
  createPlayerCapsuleState,
  detachPlayerFromVehicleSeat,
  PLAYER_CAPSULE_RADIUS,
  resolveCircleAgainstVehicleOBB,
  stepOnFootPlayer,
  type VehicleColliderOBB,
} from './playerController';
import {
  computeSafeExitPosition,
  createVehicleState,
  getVehicleColliderOBB,
  stepPlayerVehicle,
  VEHICLE_SPECS,
} from './vehicle';
import { BuildingSpatialGrid } from './world/collision';
import { sampleTerrainElevation } from './world/terrain';
import type {
  RegionManifest,
  RegionTileData,
  RoadGraph,
  TerrainGrid,
} from './world/types';

const DATA_ROOT = path.resolve(process.cwd(), 'public/derived-data');

function loadRegionData(regionId: string): {
  manifest: RegionManifest;
  terrain: TerrainGrid;
  roadGraph: RoadGraph;
  tiles: RegionTileData[];
  grid: BuildingSpatialGrid;
} {
  const dir = path.join(DATA_ROOT, regionId);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')) as RegionManifest;
  const terrain = JSON.parse(fs.readFileSync(path.join(dir, 'terrain.json'), 'utf8')) as TerrainGrid;
  const roadGraph = JSON.parse(fs.readFileSync(path.join(dir, 'road-graph.json'), 'utf8')) as RoadGraph;
  const tileDir = path.join(dir, 'tiles');
  const tiles: RegionTileData[] = [];
  const grid = new BuildingSpatialGrid();

  for (const file of fs.readdirSync(tileDir).filter((f) => f.endsWith('.json')).sort()) {
    const t = JSON.parse(fs.readFileSync(path.join(tileDir, file), 'utf8')) as RegionTileData;
    tiles.push(t);
    grid.addTile(
      t.key,
      t.buildings.map((b) => ({
        id: b.id,
        minX: b.minX,
        maxX: b.maxX,
        minZ: b.minZ,
        maxZ: b.maxZ,
        ring: b.ring,
      })),
    );
  }
  return { manifest, terrain, roadGraph, tiles, grid };
}

describe('Phase 7 End-to-End World, Collision, Vehicle & Mobile Verification (TEST 1–10)', () => {
  const tepe = loadRegionData('esenler-namik-kemal');
  const fatih = loadRegionData('fatih-sultanahmet-eminonu');

  it('TEST 1: Player cannot pass through buildings and stops cleanly without sliding', () => {
    const grid = new BuildingSpatialGrid();
    // Solid 20m x 20m building centered at (0, -14) -> south wall at z = -4
    grid.addTile('t_0_0', [
      {
        id: 'wall_bldg',
        minX: -10,
        maxX: 10,
        minZ: -24,
        maxZ: -4,
        ring: [-10, -24, 10, -24, 10, -4, -10, -4],
      },
    ]);
    const player = createPlayerCapsuleState(0, 0, 2);
    const bounds = { minX: -200, maxX: 200, minZ: -200, maxZ: 200 };
    const flat = () => 10;

    // Sprint straight north (-Z, cameraYaw=0 -> fwdZ=-1) into wall for 120 frames (2s)
    let hitWall = false;
    for (let i = 0; i < 120; i += 1) {
      const res = stepOnFootPlayer(player, 0, 1, true, 0, 1 / 60, bounds, flat, grid, []);
      if (res.collidedBuilding) hitWall = true;
      expect(grid.isPointInsideBuilding(player.x, player.z, PLAYER_CAPSULE_RADIUS - 0.05)).toBe(false);
      expect(player.z).toBeGreaterThanOrEqual(-4 + PLAYER_CAPSULE_RADIUS - 0.02);
    }
    expect(hitWall).toBe(true);

    // Release input -> player decelerates sharply to dead stop (no ice-skating!)
    for (let i = 0; i < 30; i += 1) {
      stepOnFootPlayer(player, 0, 0, false, 0, 1 / 60, bounds, flat, grid, []);
    }
    expect(Math.hypot(player.vx, player.vz)).toBeLessThan(0.01);
  });

  it('TEST 2: Player cannot walk through parked or angled vehicle bodies (OBB collision)', () => {
    const grid = new BuildingSpatialGrid();
    const bounds = { minX: -200, maxX: 200, minZ: -200, maxZ: 200 };
    const flat = () => 0;

    const taxi = createVehicleState('player-taxi', 'taxi', 0, 0, -5, Math.PI / 5);
    const vehicles: VehicleColliderOBB[] = [getVehicleColliderOBB(taxi)];
    const player = createPlayerCapsuleState(0, 0, 2);

    let hitCar = false;
    for (let i = 0; i < 150; i += 1) {
      const res = stepOnFootPlayer(player, 0, 1, true, 0, 1 / 60, bounds, flat, grid, vehicles);
      if (res.collidedVehicleId === 'player-taxi') hitCar = true;
      // Verify player center never penetrates inside the vehicle's OBB
      const check = resolveCircleAgainstVehicleOBB(player.x, player.z, PLAYER_CAPSULE_RADIUS - 0.03, vehicles[0]!);
      expect(check.hit).toBe(false);
    }
    expect(hitCar).toBe(true);
  });

  it('TEST 3: Entering vehicle transitions cleanly to seated driving mode & suppresses foot drift/self-collision', () => {
    const grid = new BuildingSpatialGrid();
    const bounds = { minX: -200, maxX: 200, minZ: -200, maxZ: 200 };
    const flat = () => 12;

    const taxi = createVehicleState('player-taxi', 'taxi', 10, 12, 10, 0);
    const player = createPlayerCapsuleState(12.2, 12, 10);

    attachPlayerToVehicleSeat(player, taxi.id, taxi.x, taxi.y, taxi.z);
    expect(player.mode).toBe('seated_driving');
    expect(player.occupiedVehicleId).toBe('player-taxi');

    // Foot movement input while seated MUST NOT move player off the seat or collide with own vehicle
    const res = stepOnFootPlayer(
      player,
      1,
      1,
      true,
      0,
      1 / 60,
      bounds,
      flat,
      grid,
      [getVehicleColliderOBB(taxi)],
    );
    expect(res.collidedVehicleId).toBeNull();
    expect(res.horizontalSpeed).toBe(0);
    expect(player.x).toBe(taxi.x);
    expect(player.z).toBe(taxi.z);
  });

  it('TEST 4: Exiting vehicle places player in safe unobstructed position even when boxed in by wall + traffic', () => {
    const grid = new BuildingSpatialGrid();
    // Building tightly blocking driver's left side (+X when heading=0)
    grid.addTile('t_0_0', [
      {
        id: 'left_wall',
        minX: 1.4,
        maxX: 15,
        minZ: -10,
        maxZ: 10,
        ring: [1.4, -10, 15, -10, 15, 10, 1.4, 10],
      },
    ]);
    const taxi = createVehicleState('player-taxi', 'taxi', 0, 5, 0, 0);
    // Another car parked tight on passenger's right side (-X)
    const blockingTraffic: VehicleColliderOBB[] = [
      {
        id: 'traffic-1',
        x: -2.4,
        z: 0,
        heading: 0,
        halfWidth: 0.96,
        halfLength: 2.15,
      },
    ];

    const exit = computeSafeExitPosition(taxi, grid, () => 5, blockingTraffic);
    // Must not clip into left building, own taxi, OR blocking traffic car!
    expect(grid.isPointInsideBuilding(exit.x, exit.z, PLAYER_CAPSULE_RADIUS)).toBe(false);
    expect(resolveCircleAgainstVehicleOBB(exit.x, exit.z, PLAYER_CAPSULE_RADIUS - 0.02, getVehicleColliderOBB(taxi)).hit).toBe(false);
    expect(resolveCircleAgainstVehicleOBB(exit.x, exit.z, PLAYER_CAPSULE_RADIUS - 0.02, blockingTraffic[0]!).hit).toBe(false);

    // Detaching restores on-foot collision immediately
    const player = createPlayerCapsuleState(0, 5, 0);
    attachPlayerToVehicleSeat(player, taxi.id, taxi.x, taxi.y, taxi.z);
    detachPlayerFromVehicleSeat(player, exit.x, exit.y, exit.z);
    expect(player.mode).toBe('on_foot');
    expect(player.occupiedVehicleId).toBeNull();
  });

  it('TEST 5: High-speed vehicle cannot tunnel or clip corners through buildings', () => {
    const grid = new BuildingSpatialGrid();
    // Thin 2m thick concrete wall at z = 20..22 (tests anti-tunneling at ~88 km/h!)
    grid.addTile('t_0_0', [
      {
        id: 'thin_wall',
        minX: -30,
        maxX: 30,
        minZ: 20,
        maxZ: 22,
        ring: [-30, 20, 30, 20, 30, 22, -30, 22],
      },
    ]);
    const taxi = createVehicleState('player-taxi', 'taxi', 0, 0, 0, 0);
    taxi.speed = VEHICLE_SPECS.taxi.maxForwardSpeed; // Top speed straight into thin wall!
    const bounds = { minX: -200, maxX: 200, minZ: -200, maxZ: 200 };

    let hitBuilding = false;
    for (let i = 0; i < 120; i += 1) {
      const res = stepPlayerVehicle(taxi, { throttle: 1, brake: 0, steer: 0, handbrake: false }, 1 / 60, bounds, () => 0, grid);
      if (res.collided) hitBuilding = true;
      // Front bumper MUST stay south of wall (z < 20) — zero tunneling across thin wall!
      expect(taxi.z + VEHICLE_SPECS.taxi.length * 0.45).toBeLessThanOrEqual(20.05);
    }
    expect(hitBuilding).toBe(true);
  });

  it('TEST 6: Vehicle stays strictly grounded to sloped roads/terrain across Tepe Mahallesi hills', () => {
    const spawn = tepe.manifest.spawn;
    const sampleElev = (x: number, z: number) => sampleTerrainElevation(tepe.terrain, x, z);
    const taxi = createVehicleState(
      'player-taxi',
      'taxi',
      spawn.x,
      sampleElev(spawn.x, spawn.z),
      spawn.z,
      spawn.heading,
    );
    const bounds = {
      minX: tepe.terrain.minX,
      maxX: tepe.terrain.maxX,
      minZ: tepe.terrain.minZ,
      maxZ: tepe.terrain.maxZ,
    };

    for (let i = 0; i < 180; i += 1) {
      stepPlayerVehicle(
        taxi,
        { throttle: 1, brake: 0, steer: i % 40 < 20 ? 0.15 : -0.15, handbrake: false },
        1 / 60,
        bounds,
        sampleElev,
        tepe.grid,
      );
      const expectedY = sampleElev(taxi.x, taxi.z);
      expect(Math.abs(taxi.y - expectedY)).toBeLessThan(0.01);
    }
  });

  it('TEST 7: Road networks in both regions are connected, valid & free of broken micro-stubs', () => {
    for (const region of [tepe, fatih]) {
      // Zero tiny <2m stub roads in any tile
      for (const tile of region.tiles) {
        for (const r of tile.roads) {
          const ptsCount = Math.floor(r.points.length / 2);
          expect(ptsCount).toBeGreaterThanOrEqual(2);
          let len = 0;
          for (let i = 1; i < ptsCount; i += 1) {
            len += Math.hypot(
              r.points[i * 2]! - r.points[(i - 1) * 2]!,
              r.points[i * 2 + 1]! - r.points[(i - 1) * 2 + 1]!,
            );
          }
          expect(len).toBeGreaterThanOrEqual(1.95);
        }
      }

      // Compute largest connected component in road-graph
      const adj = new Map<string, string[]>();
      for (const n of region.roadGraph.nodes) adj.set(n.id, []);
      for (const e of region.roadGraph.edges) {
        adj.get(e.from)?.push(e.to);
        adj.get(e.to)?.push(e.from);
      }
      const seen = new Set<string>();
      let largest = 0;
      for (const n of region.roadGraph.nodes) {
        if (seen.has(n.id)) continue;
        const queue = [n.id];
        seen.add(n.id);
        let size = 0;
        while (queue.length > 0) {
          const cur = queue.pop()!;
          size += 1;
          for (const nb of adj.get(cur) ?? []) {
            if (!seen.has(nb)) {
              seen.add(nb);
              queue.push(nb);
            }
          }
        }
        largest = Math.max(largest, size);
      }
      // Over 92% of nodes form a single traversable road network!
      expect(largest / region.roadGraph.nodes.length).toBeGreaterThan(0.92);
    }
  });

  it('TEST 8: Pedestrians navigate streets cleanly and avoid buildings & vehicle bodies', () => {
    for (const region of [tepe, fatih]) {
      const spawn = region.manifest.spawn;
      const sampleElev = (x: number, z: number) => sampleTerrainElevation(region.terrain, x, z);
      const peds = new PedestrianSimulator(region.roadGraph, 24, 42);
      const parkedTaxi: VehicleColliderOBB = {
        id: 'player-taxi',
        x: spawn.x + 4,
        z: spawn.z + 2,
        heading: spawn.heading,
        halfWidth: 0.96,
        halfLength: 2.16,
      };

      // Simulate 180 frames (3 seconds) with active buildings + vehicle OBBs
      for (let step = 0; step < 180; step += 1) {
        peds.step(
          1 / 60,
          spawn.x,
          spawn.z,
          0,
          false,
          region.manifest.sanctuaryZones,
          sampleElev,
          region.grid,
          [parkedTaxi],
        );
      }

      // Verify ZERO pedestrians are stuck inside any building or vehicle!
      let insideBuildingCount = 0;
      let insideVehicleCount = 0;
      for (const p of peds.getAgents()) {
        if (region.grid.isPointInsideBuilding(p.x, p.z, 0.2)) insideBuildingCount += 1;
        if (resolveCircleAgainstVehicleOBB(p.x, p.z, 0.2, parkedTaxi).hit) insideVehicleCount += 1;
      }
      expect(insideBuildingCount).toBe(0);
      expect(insideVehicleCount).toBe(0);
    }
  });

  it('TEST 9: Existing world regions, tiles, buildings, sanctuaries & landmarks remain intact', () => {
    expect(tepe.tiles.length).toBe(44);
    expect(fatih.tiles.length).toBe(59);

    const tepeBuildings = tepe.tiles.reduce((acc, t) => acc + t.buildings.length, 0);
    const fatihBuildings = fatih.tiles.reduce((acc, t) => acc + t.buildings.length, 0);
    // >99.3% of unique original buildings preserved intact (only 7 unrecoverable road-blockers + 40 duplicate GPKG copies removed)
    expect(tepeBuildings).toBeGreaterThanOrEqual(4440);
    expect(fatihBuildings).toBeGreaterThanOrEqual(3640);

    expect(tepe.manifest.sanctuaryZones.length).toBe(10);
    expect(fatih.manifest.sanctuaryZones.length).toBe(3);
    expect(tepe.manifest.landmarks.length).toBeGreaterThanOrEqual(5);
    expect(fatih.manifest.landmarks.length).toBe(8);
  });

  it('TEST 10a: Android API 36 mobile build configuration & landscape manifest are valid', () => {
    const varsGradle = fs.readFileSync(path.resolve(process.cwd(), 'android/variables.gradle'), 'utf8');
    const manifestXml = fs.readFileSync(
      path.resolve(process.cwd(), 'android/app/src/main/AndroidManifest.xml'),
      'utf8',
    );
    expect(varsGradle).toContain('compileSdkVersion = 36');
    expect(varsGradle).toContain('targetSdkVersion = 36');
    expect(manifestXml).toContain('sensorLandscape');
  });
});
