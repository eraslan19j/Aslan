import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RegionTileData } from '../core/world/types';
import { isPointClearOfTileRoads, planTileStreetProps } from './tileMeshBuilder';

const REGIONS = ['esenler-namik-kemal', 'fatih-sultanahmet-eminonu'] as const;

describe('Street Prop Placement Audit — Zero Props on Asphalt Roads (v0.8.0)', () => {
  for (const regionId of REGIONS) {
    it(`places zero trees, lamps, signs, benches, or bins inside any road lane across all ${regionId} tiles`, () => {
      const tilesDir = resolve(process.cwd(), 'public', 'derived-data', regionId, 'tiles');
      const tileFiles = readdirSync(tilesDir).filter((f) => f.endsWith('.json'));
      expect(tileFiles.length).toBeGreaterThan(20);

      let totalProps = 0;
      let roadViolations = 0;
      let buildingViolations = 0;
      let overlapViolations = 0;

      for (const file of tileFiles) {
        const tile = JSON.parse(readFileSync(resolve(tilesDir, file), 'utf8')) as RegionTileData;
        const props = planTileStreetProps(tile);
        totalProps += props.length;

        for (let i = 0; i < props.length; i += 1) {
          const p = props[i]!;
          // Strictly clear of EVERY road asphalt carriageway & intersection mouth!
          if (!isPointClearOfTileRoads(tile, p.x, p.z, 0.72)) {
            roadViolations += 1;
          }
          // Strictly clear of building footprints
          for (const b of tile.buildings) {
            if (p.x >= b.minX - 0.5 && p.x <= b.maxX + 0.5 && p.z >= b.minZ - 0.5 && p.z <= b.maxZ + 0.5) {
              buildingViolations += 1;
              break;
            }
          }
          // Strictly spaced from every other prop in the tile (no overlapping trees/lamps!)
          for (let j = i + 1; j < props.length; j += 1) {
            const q = props[j]!;
            if (Math.hypot(p.x - q.x, p.z - q.z) < 1.5) {
              overlapViolations += 1;
            }
          }
        }
      }

      expect(totalProps).toBeGreaterThan(40);
      expect(roadViolations).toBe(0);
      expect(buildingViolations).toBe(0);
      expect(overlapViolations).toBe(0);
    });
  }
});
