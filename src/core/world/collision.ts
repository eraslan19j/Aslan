import { clamp } from '../math';

export interface ColliderBox2D {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface CirclePushResult {
  x: number;
  z: number;
  collided: boolean;
}

/**
 * Uniform spatial hash grid over 2D building AABBs for near-O(1) collision checks.
 * Inspired by depixeled-chris/gta7 SpatialGrid (MIT).
 */
export class BuildingSpatialGrid {
  private readonly cellSize: number;
  private readonly cells = new Map<string, ColliderBox2D[]>();
  private readonly tileBoxes = new Map<string, ColliderBox2D[]>();

  constructor(cellSize = 24) {
    this.cellSize = cellSize;
  }

  private cellKey(cx: number, cz: number): string {
    return `${cx},${cz}`;
  }

  addTile(tileKey: string, boxes: readonly ColliderBox2D[]): void {
    if (this.tileBoxes.has(tileKey)) {
      this.removeTile(tileKey);
    }
    const stored = [...boxes];
    this.tileBoxes.set(tileKey, stored);

    for (const box of stored) {
      const minCx = Math.floor(box.minX / this.cellSize);
      const maxCx = Math.floor(box.maxX / this.cellSize);
      const minCz = Math.floor(box.minZ / this.cellSize);
      const maxCz = Math.floor(box.maxZ / this.cellSize);
      for (let cz = minCz; cz <= maxCz; cz += 1) {
        for (let cx = minCx; cx <= maxCx; cx += 1) {
          const k = this.cellKey(cx, cz);
          let bucket = this.cells.get(k);
          if (!bucket) {
            bucket = [];
            this.cells.set(k, bucket);
          }
          bucket.push(box);
        }
      }
    }
  }

  removeTile(tileKey: string): void {
    const boxes = this.tileBoxes.get(tileKey);
    if (!boxes) return;
    this.tileBoxes.delete(tileKey);

    const toRemove = new Set(boxes);
    for (const [k, bucket] of this.cells) {
      const next = bucket.filter((b) => !toRemove.has(b));
      if (next.length === 0) {
        this.cells.delete(k);
      } else if (next.length !== bucket.length) {
        this.cells.set(k, next);
      }
    }
  }

  resolveCircle(x: number, z: number, radius: number): CirclePushResult {
    let px = x;
    let pz = z;
    let collided = false;

    const minCx = Math.floor((px - radius) / this.cellSize);
    const maxCx = Math.floor((px + radius) / this.cellSize);
    const minCz = Math.floor((pz - radius) / this.cellSize);
    const maxCz = Math.floor((pz + radius) / this.cellSize);

    const visited = new Set<ColliderBox2D>();

    for (let pass = 0; pass < 2; pass += 1) {
      visited.clear();
      for (let cz = minCz; cz <= maxCz; cz += 1) {
        for (let cx = minCx; cx <= maxCx; cx += 1) {
          const bucket = this.cells.get(this.cellKey(cx, cz));
          if (!bucket) continue;
          for (const box of bucket) {
            if (visited.has(box)) continue;
            visited.add(box);

            const closestX = clamp(px, box.minX, box.maxX);
            const closestZ = clamp(pz, box.minZ, box.maxZ);
            const dx = px - closestX;
            const dz = pz - closestZ;
            const distSq = dx * dx + dz * dz;

            if (distSq >= radius * radius) continue;

            collided = true;
            if (distSq > 1e-8) {
              const dist = Math.sqrt(distSq);
              const overlap = radius - dist;
              px += (dx / dist) * overlap;
              pz += (dz / dist) * overlap;
            } else {
              // Center is inside AABB: push out along nearest edge
              const dLeft = Math.abs(px - box.minX);
              const dRight = Math.abs(box.maxX - px);
              const dTop = Math.abs(pz - box.minZ);
              const dBottom = Math.abs(box.maxZ - pz);
              const minEdge = Math.min(dLeft, dRight, dTop, dBottom);
              if (minEdge === dLeft) px = box.minX - radius;
              else if (minEdge === dRight) px = box.maxX + radius;
              else if (minEdge === dTop) pz = box.minZ - radius;
              else pz = box.maxZ + radius;
            }
          }
        }
      }
    }

    return { x: px, z: pz, collided };
  }

  getActiveBoxCount(): number {
    let total = 0;
    for (const boxes of this.tileBoxes.values()) total += boxes.length;
    return total;
  }
}
