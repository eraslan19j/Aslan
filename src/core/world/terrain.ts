import { clamp } from '../math';
import type { TerrainGrid } from './types';

/**
 * Bilinear interpolation over a compact decimeter terrain elevation grid.
 * Returns elevation in meters (clamped >= 0 for land tiles).
 */
export function sampleTerrainElevation(grid: TerrainGrid, x: number, z: number): number {
  const { minX, maxX, minZ, maxZ, cols, rows, elevDecimeters } = grid;
  if (cols < 2 || rows < 2 || elevDecimeters.length < cols * rows) {
    return 0;
  }

  const u = clamp((x - minX) / Math.max(1e-6, maxX - minX), 0, 1) * (cols - 1);
  const v = clamp((z - minZ) / Math.max(1e-6, maxZ - minZ), 0, 1) * (rows - 1);

  const c0 = Math.floor(u);
  const r0 = Math.floor(v);
  const c1 = Math.min(cols - 1, c0 + 1);
  const r1 = Math.min(rows - 1, r0 + 1);

  const fu = u - c0;
  const fv = v - r0;

  const h00 = elevDecimeters[r0 * cols + c0]! * 0.1;
  const h10 = elevDecimeters[r0 * cols + c1]! * 0.1;
  const h01 = elevDecimeters[r1 * cols + c0]! * 0.1;
  const h11 = elevDecimeters[r1 * cols + c1]! * 0.1;

  const h0 = h00 + (h10 - h00) * fu;
  const h1 = h01 + (h11 - h01) * fu;
  return h0 + (h1 - h0) * fv;
}
