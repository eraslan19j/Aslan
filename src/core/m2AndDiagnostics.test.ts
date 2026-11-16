import { describe, expect, it } from 'vitest';
import { formatDiagnosticsJson, parseUserAgentInfo } from './diagnostics';
import { RoadTrafficSimulator } from './traffic';
import {
  computeSafeExitPosition,
  createVehicleState,
  stepPlayerVehicle,
} from './vehicle';
import { BuildingSpatialGrid } from './world/collision';
import { getRegionEntry, resolveRegionId } from './world/regions';
import type { RoadGraph } from './world/types';

describe('M2 vehicle driving physics', () => {
  it('accelerates, steers, climbs slope, collides cleanly with buildings, and computes safe exit', () => {
    const grid = new BuildingSpatialGrid();
    grid.addTile('t_0_0', [{ id: 'b1', minX: -3, maxX: 3, minZ: 14, maxZ: 22 }]);

    const bounds = { minX: -200, maxX: 200, minZ: -200, maxZ: 200 };
    const flatElev = (_x: number, z: number): number => 40 + z * 0.05;
    const car = createVehicleState('player-taxi', 'taxi', 0, 40, 0, 0);

    // Accelerate straight toward +Z building
    let hitWall = false;
    for (let i = 0; i < 120; i += 1) {
      const res = stepPlayerVehicle(
        car,
        { throttle: 1, brake: 0, steer: 0, handbrake: false },
        1 / 60,
        bounds,
        flatElev,
        grid,
      );
      if (res.collided) hitWall = true;
    }
    expect(hitWall).toBe(true);
    expect(car.z).toBeLessThan(14);
    expect(car.pitch).toBeGreaterThan(0.02);

    // Reverse and steer away
    for (let i = 0; i < 60; i += 1) {
      stepPlayerVehicle(
        car,
        { throttle: 0, brake: 1, steer: 0.7, handbrake: false },
        1 / 60,
        bounds,
        flatElev,
        grid,
      );
    }
    expect(car.speed).toBeLessThan(0);
    expect(Math.abs(car.heading)).toBeGreaterThan(0.1);

    const exit = computeSafeExitPosition(car, grid, flatElev);
    expect(Number.isFinite(exit.x)).toBe(true);
    expect(Number.isFinite(exit.y)).toBe(true);
  });
});

describe('M2 road-graph AI traffic simulator', () => {
  it('spawns deterministic agents and advances along connected intersections without NaN', () => {
    const graph: RoadGraph = {
      schemaVersion: 1,
      regionId: 'test',
      nodes: [
        { id: 'a', x: 0, y: 40, z: 0 },
        { id: 'b', x: 50, y: 42, z: 0 },
        { id: 'c', x: 50, y: 45, z: 50 },
        { id: 'd', x: 0, y: 43, z: 50 },
      ],
      edges: [
        { id: 'e1', from: 'a', to: 'b', roadClass: 'residential', width: 6, oneWay: false, speedLimitKph: 30, lengthMeters: 50 },
        { id: 'e2', from: 'b', to: 'c', roadClass: 'residential', width: 6, oneWay: false, speedLimitKph: 30, lengthMeters: 50 },
        { id: 'e3', from: 'c', to: 'd', roadClass: 'residential', width: 6, oneWay: false, speedLimitKph: 30, lengthMeters: 50 },
        { id: 'e4', from: 'd', to: 'a', roadClass: 'residential', width: 6, oneWay: false, speedLimitKph: 30, lengthMeters: 50 },
      ],
    };

    const sim = new RoadTrafficSimulator(graph, 8, 12345);
    expect(sim.getAgents().length).toBe(8);
    const startX0 = sim.getAgents()[0]!.x;
    const startZ0 = sim.getAgents()[0]!.z;

    for (let i = 0; i < 120; i += 1) {
      sim.step(1 / 30, -500, -500);
    }

    const moved = Math.hypot(sim.getAgents()[0]!.x - startX0, sim.getAgents()[0]!.z - startZ0);
    expect(moved).toBeGreaterThan(5);
    for (const a of sim.getAgents()) {
      expect(Number.isFinite(a.x)).toBe(true);
      expect(Number.isFinite(a.y)).toBe(true);
      expect(Number.isFinite(a.z)).toBe(true);
    }
  });
});

describe('diagnostics & multi-region registry', () => {
  it('parses Android WebView UA and formats JSON diagnostics snapshot cleanly', () => {
    const info = parseUserAgentInfo(
      'Mozilla/5.0 (Linux; Android 15; SM-A546E Build/AP3A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.6778.200 Mobile Safari/537.36',
      'Linux armv81',
    );
    expect(info.webViewVersion).toBe('Android WebView 131.0.6778.200');
    expect(info.deviceModel).toBe('SM-A546E (Android 15)');

    const json = formatDiagnosticsJson({
      appVersion: '0.2.0',
      timestampIso: '2026-11-16T22:00:00.000Z',
      regionId: 'esenler-namik-kemal',
      qualityTier: 'normal',
      timeOfDay: 'day',
      mode: 'driving',
      fps: 58,
      frameMs: 17.2,
      drawCalls: 44,
      triangles: 24000,
      activeTiles: 9,
      activeBuildings: 1200,
      trafficCount: 16,
      jsHeapUsedMb: 42.5,
      jsHeapTotalMb: 64.0,
      jsHeapLimitMb: 512.0,
      gpuRenderer: 'Adreno 650',
      gpuVendor: 'Qualcomm',
      webViewVersion: info.webViewVersion,
      deviceModel: info.deviceModel,
      platform: info.platform,
      viewport: '920x414',
      pixelRatio: 1.5,
      touchUi: true,
      crashCount: 0,
    });
    expect(JSON.parse(json).regionId).toBe('esenler-namik-kemal');
  });

  it('resolves unknown region ids safely to default Esenler region', () => {
    expect(resolveRegionId(undefined)).toBe('esenler-namik-kemal');
    expect(resolveRegionId('unknown-zone')).toBe('esenler-namik-kemal');
    expect(resolveRegionId('fatih-sultanahmet-eminonu')).toBe('fatih-sultanahmet-eminonu');
    expect(getRegionEntry('esenler-namik-kemal').hasCoastalSea).toBe(false);
    expect(getRegionEntry('fatih-sultanahmet-eminonu').hasCoastalSea).toBe(true);
  });
});
