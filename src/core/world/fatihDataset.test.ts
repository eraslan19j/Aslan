import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findSanctuaryZone } from '../sanctuary';
import { worldToTileCoord } from './geo';
import { sampleTerrainElevation } from './terrain';
import type {
  DataQualityReport,
  RegionManifest,
  RegionTileData,
  RoadGraph,
  TerrainGrid,
} from './types';

const REGION_DIR = join(process.cwd(), 'public', 'regions', 'fatih-sultanahmet-eminonu');

describe('offline Fatih (Sultanahmet-Eminönü) harvested dataset integrity', () => {
  it('contains valid real OSM + Copernicus DEM manifest, terrain, road graph, and spawn tile', () => {
    const manifest = JSON.parse(
      readFileSync(join(REGION_DIR, 'manifest.json'), 'utf8'),
    ) as RegionManifest;
    const terrain = JSON.parse(
      readFileSync(join(REGION_DIR, 'terrain.json'), 'utf8'),
    ) as TerrainGrid;
    const roadGraph = JSON.parse(
      readFileSync(join(REGION_DIR, 'road-graph.json'), 'utf8'),
    ) as RoadGraph;
    const report = JSON.parse(
      readFileSync(join(REGION_DIR, 'quality-report.json'), 'utf8'),
    ) as DataQualityReport;

    expect(manifest.regionId).toBe('fatih-sultanahmet-eminonu');
    expect(manifest.dataMode).toBe('real-osm');
    expect(manifest.availableTiles.length).toBeGreaterThanOrEqual(20);
    expect(manifest.sanctuaryZones.length).toBeGreaterThanOrEqual(2);

    // Verify Ayasofya and Sultanahmet Camii sanctuary zones lock combat at their exact coords
    const ayasofya = manifest.landmarks.find((l) => l.id === 'ayasofya');
    const blueMosque = manifest.landmarks.find((l) => l.id === 'sultanahmet-camii');
    expect(ayasofya).toBeDefined();
    expect(blueMosque).toBeDefined();
    expect(findSanctuaryZone(ayasofya!.x, ayasofya!.z, manifest.sanctuaryZones)?.id).toBe('ayasofya');
    expect(findSanctuaryZone(blueMosque!.x, blueMosque!.z, manifest.sanctuaryZones)?.id).toBe(
      'sultanahmet-camii',
    );

    // Verify real elevation grid covers Sultanahmet hill (> 20m) down to sea level (0m)
    expect(terrain.minMeters).toBe(0);
    expect(terrain.maxMeters).toBeGreaterThan(25);
    const spawnElev = sampleTerrainElevation(terrain, manifest.spawn.x, manifest.spawn.z);
    expect(spawnElev).toBeGreaterThan(15);

    // Verify road graph and quality report metrics
    expect(report.buildingCount).toBeGreaterThan(1000);
    expect(roadGraph.nodes.length).toBeGreaterThan(500);
    expect(roadGraph.edges.length).toBeGreaterThan(500);

    // Verify the spawn tile file exists and contains real buildings & roads
    const spawnTileCoord = worldToTileCoord(manifest.spawn.x, manifest.spawn.z, manifest.tileSize);
    expect(manifest.availableTiles).toContain(spawnTileCoord.key);
    const spawnTile = JSON.parse(
      readFileSync(join(REGION_DIR, 'tiles', `${spawnTileCoord.key}.json`), 'utf8'),
    ) as RegionTileData;
    expect(spawnTile.buildings.length).toBeGreaterThan(10);
    expect(spawnTile.roads.length).toBeGreaterThan(5);
  });
});
