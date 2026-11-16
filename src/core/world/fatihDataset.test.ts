import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findSanctuaryZone } from '../sanctuary';
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
