import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findSanctuaryZone } from '../sanctuary';
import { BuildingSpatialGrid } from './collision';
import { worldToTileCoord } from './geo';
import { DEFAULT_REGION_ID, REGION_REGISTRY } from './regions';
import { sampleTerrainElevation } from './terrain';
import type {
  DataQualityReport,
  RegionManifest,
  RegionTileData,
  RoadGraph,
  TerrainGrid,
} from './types';
import { createVehicleState, stepPlayerVehicle } from '../vehicle';

const DERIVED_ROOT = join(process.cwd(), 'public', 'derived-data');

describe('offline derived-data region packs (Esenler default + Fatih secondary)', () => {
  it('registers Esenler Namik Kemal as default start and preserves Fatih as second region', () => {
    expect(DEFAULT_REGION_ID).toBe('esenler-namik-kemal');
    expect(REGION_REGISTRY.map((r) => r.id)).toEqual([
      'esenler-namik-kemal',
      'fatih-sultanahmet-eminonu',
    ]);
  });

  it('validates Esenler / Namik Kemal harvested pack (SHA-256 verified GPKG + Copernicus DEM + sanctuaries)', () => {
    const dir = join(DERIVED_ROOT, 'esenler-namik-kemal');
    const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as RegionManifest;
    const terrain = JSON.parse(readFileSync(join(dir, 'terrain.json'), 'utf8')) as TerrainGrid;
    const roadGraph = JSON.parse(readFileSync(join(dir, 'road-graph.json'), 'utf8')) as RoadGraph;
    const report = JSON.parse(
      readFileSync(join(dir, 'quality-report.json'), 'utf8'),
    ) as DataQualityReport;
    const inspection = JSON.parse(readFileSync(join(dir, 'source-inspection.json'), 'utf8')) as {
      sha256: string;
      sha256Verified: boolean;
    };

    expect(inspection.sha256Verified).toBe(true);
    expect(inspection.sha256).toBe(
      '8849228b90c2ac807e707bfc91e1b6d0bddb40107afb4962951b20654f621fff',
    );
    expect(manifest.regionId).toBe('esenler-namik-kemal');
    expect(manifest.dataMode).toBe('real-osm');
    expect(manifest.availableTiles.length).toBeGreaterThanOrEqual(20);
    // Automatic place_of_worship sanctuary detection
    expect(manifest.sanctuaryZones.length).toBeGreaterThanOrEqual(5);
    const firstWorship = manifest.sanctuaryZones[0]!;
    expect(findSanctuaryZone(firstWorship.x, firstWorship.z, manifest.sanctuaryZones)?.id).toBe(
      firstWorship.id,
    );

    // Real Esenler sloped topography (>20m relief)
    expect(terrain.maxMeters - terrain.minMeters).toBeGreaterThan(20);
    const spawnElev = sampleTerrainElevation(terrain, manifest.spawn.x, manifest.spawn.z);
    expect(spawnElev).toBeGreaterThan(20);

    expect(report.buildingCount).toBeGreaterThan(3000);
    expect(roadGraph.nodes.length).toBeGreaterThan(500);
    expect(roadGraph.edges.length).toBeGreaterThan(500);

    const spawnTileCoord = worldToTileCoord(manifest.spawn.x, manifest.spawn.z, manifest.tileSize);
    expect(manifest.availableTiles).toContain(spawnTileCoord.key);
    const spawnTile = JSON.parse(
      readFileSync(join(dir, 'tiles', `${spawnTileCoord.key}.json`), 'utf8'),
    ) as RegionTileData;
    expect(spawnTile.buildings.length).toBeGreaterThan(10);
    expect(spawnTile.roads.length).toBeGreaterThan(5);

    // Player-facing labels must NOT expose "Esenler" / "Namık Kemal" directly
    expect(manifest.nameTr).not.toMatch(/esenler|namık/i);
    expect(manifest.spawn.labelTr).not.toMatch(/esenler|namık/i);
    for (const reg of REGION_REGISTRY) {
      expect(reg.nameTr).not.toMatch(/esenler|namık/i);
      expect(reg.nameEn).not.toMatch(/esenler|namik/i);
    }

    // Regression test for invisible straight-road AABB wall bug:
    // Driving straight down the main spawn avenue with exact polygon collision must clear >= 24m smoothly!
    const grid = new BuildingSpatialGrid(28);
    for (const tileKey of ['t_0_-1', 't_0_0']) {
      const t = JSON.parse(
        readFileSync(join(dir, 'tiles', `${tileKey}.json`), 'utf8'),
      ) as RegionTileData;
      grid.addTile(
        tileKey,
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
    const taxi = createVehicleState(
      'player-taxi',
      'taxi',
      manifest.spawn.x,
      spawnElev,
      manifest.spawn.z,
      manifest.spawn.heading,
    );
    let phantomHits = 0;
    for (let i = 0; i < 150; i += 1) {
      const r = stepPlayerVehicle(
        taxi,
        { throttle: 1, brake: 0, steer: 0, handbrake: false },
        1 / 60,
        { minX: terrain.minX, maxX: terrain.maxX, minZ: terrain.minZ, maxZ: terrain.maxZ },
        (x, z) => sampleTerrainElevation(terrain, x, z),
        grid,
      );
      const dist = Math.hypot(taxi.x - manifest.spawn.x, taxi.z - manifest.spawn.z);
      if (dist < 24 && r.collided) phantomHits += 1;
      if (dist >= 25) break;
    }
    const drivenDist = Math.hypot(taxi.x - manifest.spawn.x, taxi.z - manifest.spawn.z);
    expect(phantomHits).toBe(0);
    expect(drivenDist).toBeGreaterThanOrEqual(24);
  });

  it('validates Fatih (Sultanahmet-Eminonu) secondary pack under public/derived-data', () => {
    const dir = join(DERIVED_ROOT, 'fatih-sultanahmet-eminonu');
    const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as RegionManifest;
    const terrain = JSON.parse(readFileSync(join(dir, 'terrain.json'), 'utf8')) as TerrainGrid;
    const roadGraph = JSON.parse(readFileSync(join(dir, 'road-graph.json'), 'utf8')) as RoadGraph;
    const report = JSON.parse(
      readFileSync(join(dir, 'quality-report.json'), 'utf8'),
    ) as DataQualityReport;

    expect(manifest.regionId).toBe('fatih-sultanahmet-eminonu');
    expect(manifest.dataMode).toBe('real-osm');
    expect(manifest.sanctuaryZones.length).toBeGreaterThanOrEqual(3);

    const ayasofya = manifest.landmarks.find((l) => l.id === 'ayasofya');
    const blueMosque = manifest.landmarks.find((l) => l.id === 'sultanahmet-camii');
    expect(ayasofya).toBeDefined();
    expect(blueMosque).toBeDefined();
    expect(findSanctuaryZone(ayasofya!.x, ayasofya!.z, manifest.sanctuaryZones)?.id).toBe('ayasofya');
    expect(findSanctuaryZone(blueMosque!.x, blueMosque!.z, manifest.sanctuaryZones)?.id).toBe(
      'sultanahmet-camii',
    );

    expect(terrain.minMeters).toBe(0);
    expect(terrain.maxMeters).toBeGreaterThan(25);
    expect(report.buildingCount).toBeGreaterThan(1000);
    expect(roadGraph.nodes.length).toBeGreaterThan(500);
    expect(roadGraph.edges.length).toBeGreaterThan(500);
  });
});
