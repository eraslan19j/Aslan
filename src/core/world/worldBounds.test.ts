import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PedestrianSimulator } from '../pedestrians';
import { RoadTrafficSimulator } from '../traffic';
import { BuildingSpatialGrid } from './collision';
import type { RoadGraph, TerrainGrid } from './types';
import {
  buildBarrierColliders,
  computePerimeterRoadBarriers,
  computePlayableWorldBounds,
  isPointInsideBounds,
} from './worldBounds';

const REGIONS = ['esenler-namik-kemal', 'fatih-sultanahmet-eminonu'] as const;

describe('PlayableWorldBounds & Physical Perimeter Barriers (v0.8.0)', () => {
  for (const regionId of REGIONS) {
    it(`detects perimeter exit roadblocks and keeps 100% of NPCs strictly inside bounds in ${regionId}`, () => {
      const baseDir = resolve(process.cwd(), 'public', 'derived-data', regionId);
      const terrain = JSON.parse(readFileSync(resolve(baseDir, 'terrain.json'), 'utf8')) as TerrainGrid;
      const roadGraph = JSON.parse(
        readFileSync(resolve(baseDir, 'road-graph.json'), 'utf8'),
      ) as RoadGraph;

      const bounds = computePlayableWorldBounds(terrain);
      expect(bounds.minX).toBeGreaterThan(terrain.minX);
      expect(bounds.maxX).toBeLessThan(terrain.maxX);
      expect(bounds.minZ).toBeGreaterThan(terrain.minZ);
      expect(bounds.maxZ).toBeLessThan(terrain.maxZ);

      const barriers = computePerimeterRoadBarriers(roadGraph, bounds);
      // Both Esenler & Fatih have perimeter arterial exits where physical barricades belong
      expect(barriers.length).toBeGreaterThanOrEqual(4);

      // Register barriers in spatialGrid and confirm every barrier creates a solid physical collider
      const grid = new BuildingSpatialGrid(28);
      const colliders = buildBarrierColliders(barriers);
      expect(colliders.length).toBe(barriers.length);
      grid.addTile('__perimeter_barriers__', colliders);

      for (const b of barriers) {
        const hit = grid.resolveCircle(b.x, b.z, 1.1);
        expect(hit.collided).toBe(true);
      }

      // Spawn full AI traffic + pedestrians and simulate 240 steps (4s+ of driving):
      // ZERO NPC cars or pedestrians may EVER drive outside the physical perimeter barriers!
      const traffic = new RoadTrafficSimulator(roadGraph, 32, 34034, 0, 0, bounds);
      const peds = new PedestrianSimulator(roadGraph, 40, 34051, bounds);

      expect(traffic.getAgents().length).toBeGreaterThan(0);
      expect(peds.getAgents().length).toBeGreaterThan(0);

      for (let step = 0; step < 240; step += 1) {
        traffic.step(1 / 30, 0, 0, undefined, grid);
        peds.step(1 / 30, 0, 0, 0, false, [], undefined, grid);
      }

      for (const car of traffic.getAgents()) {
        expect(isPointInsideBounds(car.x, car.z, bounds, 0.5)).toBe(true);
      }
      for (const ped of peds.getAgents()) {
        expect(isPointInsideBounds(ped.x, ped.z, bounds, 0)).toBe(true);
      }
    });
  }
});
