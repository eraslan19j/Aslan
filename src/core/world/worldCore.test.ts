import { describe, expect, it } from 'vitest';
import {
  FATIH_ORIGIN,
  localToLonLat,
  lonLatToLocal,
  TILE_SIZE_METERS,
  worldToTileCoord,
} from './geo';
import { classifyFatihPalette, parseOsmMeters, resolveBuildingHeight } from './height';
import { sampleTerrainElevation } from './terrain';
import { planTileStreaming } from './tileStreamer';
import { BuildingSpatialGrid } from './collision';
import type { TerrainGrid } from './types';

describe('core/world/geo', () => {
  it('round-trips lon/lat <-> local meters accurately around Fatih origin', () => {
    const ayasofya = { lon: 28.9802, lat: 41.0086 };
    const local = lonLatToLocal(ayasofya, FATIH_ORIGIN);
    // Ayasofya is east (+X) and slightly north (-Z) of FATIH_ORIGIN
    expect(local.x).toBeGreaterThan(300);
    expect(local.z).toBeLessThan(0);

    const back = localToLonLat(local, FATIH_ORIGIN);
    expect(back.lon).toBeCloseTo(ayasofya.lon, 5);
    expect(back.lat).toBeCloseTo(ayasofya.lat, 5);
  });

  it('maps world coordinates to 300m tile keys consistently', () => {
    expect(worldToTileCoord(0, 0, TILE_SIZE_METERS).key).toBe('t_0_0');
    expect(worldToTileCoord(-1, -1, TILE_SIZE_METERS).key).toBe('t_-1_-1');
    expect(worldToTileCoord(301, -301, TILE_SIZE_METERS).key).toBe('t_1_-2');
  });
});

describe('core/world/height', () => {
  it('follows height -> building:levels * 3.2 -> deterministic fallback priority', () => {
    expect(parseOsmMeters('18.5 m')).toBeCloseTo(18.5, 4);
    expect(parseOsmMeters('30 ft')).toBeCloseTo(9.144, 3);

    const h1 = resolveBuildingHeight('w1', '21 m', '4', 'commercial');
    expect(h1.source).toBe('height');
    expect(h1.height).toBe(21);

    const h2 = resolveBuildingHeight('w2', undefined, '5', 'apartments');
    expect(h2.source).toBe('levels');
    expect(h2.height).toBeCloseTo(16.0, 2);

    const h3a = resolveBuildingHeight('w3', undefined, undefined, 'historic');
    const h3b = resolveBuildingHeight('w3', undefined, undefined, 'historic');
    expect(h3a.source).toBe('inferred');
    expect(h3a.height).toBe(h3b.height);

    expect(classifyFatihPalette('w1', 'mosque')).toBe('landmark');
  });
});

describe('core/world/terrain', () => {
  it('bilinearly interpolates elevation and clamps out-of-bounds cleanly', () => {
    const grid: TerrainGrid = {
      minX: 0,
      maxX: 100,
      minZ: 0,
      maxZ: 100,
      cols: 2,
      rows: 2,
      elevDecimeters: [0, 100, 200, 300], // 0m, 10m, 20m, 30m
      source: 'test',
      minMeters: 0,
      maxMeters: 30,
    };
    expect(sampleTerrainElevation(grid, 0, 0)).toBeCloseTo(0, 4);
    expect(sampleTerrainElevation(grid, 100, 100)).toBeCloseTo(30, 4);
    expect(sampleTerrainElevation(grid, 50, 50)).toBeCloseTo(15, 4);
    expect(sampleTerrainElevation(grid, -50, -50)).toBeCloseTo(0, 4);
  });
});

describe('core/world/tileStreamer', () => {
  it('loads closest tiles first and applies unload hysteresis', () => {
    const available = new Set([
      't_-2_0',
      't_-1_0',
      't_0_0',
      't_1_0',
      't_2_0',
      't_3_0',
    ]);
    const diff1 = planTileStreaming(10, 10, 1, new Set(), available, 300);
    expect(diff1.centerKey).toBe('t_0_0');
    expect(diff1.toLoad[0]).toBe('t_0_0');
    expect(diff1.toLoad).toContain('t_-1_0');
    expect(diff1.toLoad).toContain('t_1_0');

    // Moving to t_1_0 keeps t_-1_0 (distance 2 == keepRadius), unloads t_-2_0
    const loaded = new Set(['t_-2_0', 't_-1_0', 't_0_0', 't_1_0']);
    const diff2 = planTileStreaming(310, 10, 1, loaded, available, 300);
    expect(diff2.toLoad).toEqual(['t_2_0']);
    expect(diff2.toUnload).toEqual(['t_-2_0']);
  });
});

describe('core/world/collision', () => {
  it('pushes circles out of building AABBs and removes tiles cleanly', () => {
    const grid = new BuildingSpatialGrid(20);
    grid.addTile('t_0_0', [
      { id: 'b1', minX: 10, maxX: 20, minZ: 10, maxZ: 20 },
    ]);
    expect(grid.getActiveBoxCount()).toBe(1);

    const hit = grid.resolveCircle(9.6, 15, 0.8);
    expect(hit.collided).toBe(true);
    expect(hit.x).toBeLessThanOrEqual(9.21);

    const clear = grid.resolveCircle(0, 0, 0.8);
    expect(clear.collided).toBe(false);

    grid.removeTile('t_0_0');
    expect(grid.getActiveBoxCount()).toBe(0);
    expect(grid.resolveCircle(9.6, 15, 0.8).collided).toBe(false);
  });
});
