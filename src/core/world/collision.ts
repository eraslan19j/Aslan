import { clamp } from '../math';

export interface ColliderBox2D {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /**
   * Optional exact 2D building footprint ring [x0, z0, x1, z1, ...].
   * When present, narrow-phase tests exact circle-vs-polygon edges instead of AABB corners,
   * eliminating phantom invisible walls on diagonal streets.
   */
  ring?: readonly number[];
}

export interface CirclePushResult {
  x: number;
  z: number;
  collided: boolean;
  /** Outward unit surface normal accumulated from collisions (0, 0 if no collision). */
  normalX: number;
  normalZ: number;
}

function getEffectiveVertexCount(ring: readonly number[]): number {
  let n = Math.floor(ring.length / 2);
  if (
    n > 3 &&
    Math.abs(ring[0]! - ring[(n - 1) * 2]!) < 0.05 &&
    Math.abs(ring[1]! - ring[(n - 1) * 2 + 1]!) < 0.05
  ) {
    n -= 1;
  }
  return n;
}

function pointInPolygonXZ(px: number, pz: number, ring: readonly number[], n: number): boolean {
  let inside = false;
  let j = n - 1;
  for (let i = 0; i < n; i += 1) {
    const xi = ring[i * 2]!;
    const zi = ring[i * 2 + 1]!;
    const xj = ring[j * 2]!;
    const zj = ring[j * 2 + 1]!;
    const intersects =
      (zi > pz) !== (zj > pz) && px < ((xj - xi) * (pz - zi)) / (zj - zi + 1e-12) + xi;
    if (intersects) inside = !inside;
    j = i;
  }
  return inside;
}

function resolveCircleAgainstPolygon(
  px: number,
  pz: number,
  radius: number,
  ring: readonly number[],
  n: number,
): { x: number; z: number; hit: boolean; nx: number; nz: number } {
  let bestDistSq = Infinity;
  let bestCx = px;
  let bestCz = pz;

  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    const ax = ring[i * 2]!;
    const az = ring[i * 2 + 1]!;
    const bx = ring[j * 2]!;
    const bz = ring[j * 2 + 1]!;

    const ex = bx - ax;
    const ez = bz - az;
    const lenSq = ex * ex + ez * ez;
    let t = 0;
    if (lenSq > 1e-10) {
      t = clamp(((px - ax) * ex + (pz - az) * ez) / lenSq, 0, 1);
    }
    const cx = ax + ex * t;
    const cz = az + ez * t;
    const dx = px - cx;
    const dz = pz - cz;
    const dSq = dx * dx + dz * dz;
    if (dSq < bestDistSq) {
      bestDistSq = dSq;
      bestCx = cx;
      bestCz = cz;
    }
  }

  const inside = pointInPolygonXZ(px, pz, ring, n);
  if (!inside && bestDistSq >= radius * radius) {
    return { x: px, z: pz, hit: false, nx: 0, nz: 0 };
  }

  const dist = Math.sqrt(bestDistSq);
  if (inside) {
    // Center is inside polygon: push outward through nearest boundary edge
    if (dist > 1e-6) {
      const nx = (bestCx - px) / dist;
      const nz = (bestCz - pz) / dist;
      return {
        x: bestCx + nx * radius,
        z: bestCz + nz * radius,
        hit: true,
        nx,
        nz,
      };
    }
    return { x: px + radius, z: pz, hit: true, nx: 1, nz: 0 };
  }

  if (dist > 1e-6) {
    const nx = (px - bestCx) / dist;
    const nz = (pz - bestCz) / dist;
    const overlap = radius - dist;
    return {
      x: px + nx * overlap,
      z: pz + nz * overlap,
      hit: true,
      nx,
      nz,
    };
  }

  return { x: px + radius, z: pz, hit: true, nx: 1, nz: 0 };
}

function resolveCircleAgainstAabb(
  px: number,
  pz: number,
  radius: number,
  box: ColliderBox2D,
): { x: number; z: number; hit: boolean; nx: number; nz: number } {
  const closestX = clamp(px, box.minX, box.maxX);
  const closestZ = clamp(pz, box.minZ, box.maxZ);
  const dx = px - closestX;
  const dz = pz - closestZ;
  const distSq = dx * dx + dz * dz;

  if (distSq >= radius * radius) {
    return { x: px, z: pz, hit: false, nx: 0, nz: 0 };
  }

  if (distSq > 1e-8) {
    const dist = Math.sqrt(distSq);
    const nx = dx / dist;
    const nz = dz / dist;
    const overlap = radius - dist;
    return { x: px + nx * overlap, z: pz + nz * overlap, hit: true, nx, nz };
  }

  const dLeft = Math.abs(px - box.minX);
  const dRight = Math.abs(box.maxX - px);
  const dTop = Math.abs(pz - box.minZ);
  const dBottom = Math.abs(box.maxZ - pz);
  const minEdge = Math.min(dLeft, dRight, dTop, dBottom);
  if (minEdge === dLeft) return { x: box.minX - radius, z: pz, hit: true, nx: -1, nz: 0 };
  if (minEdge === dRight) return { x: box.maxX + radius, z: pz, hit: true, nx: 1, nz: 0 };
  if (minEdge === dTop) return { x: px, z: box.minZ - radius, hit: true, nx: 0, nz: -1 };
  return { x: px, z: box.maxZ + radius, hit: true, nx: 0, nz: 1 };
}

/**
 * Uniform spatial hash grid over 2D building footprints:
 * - Broad-phase: O(1) AABB grid buckets
 * - Narrow-phase: exact 2D polygon collision (zero phantom AABB roadblocks on diagonal streets!)
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

  /** Fast point containment check against exact building polygons (used for street furniture placement). */
  isPointInsideBuilding(px: number, pz: number, margin = 0): boolean {
    const minCx = Math.floor((px - margin) / this.cellSize);
    const maxCx = Math.floor((px + margin) / this.cellSize);
    const minCz = Math.floor((pz - margin) / this.cellSize);
    const maxCz = Math.floor((pz + margin) / this.cellSize);
    const visited = new Set<ColliderBox2D>();

    for (let cz = minCz; cz <= maxCz; cz += 1) {
      for (let cx = minCx; cx <= maxCx; cx += 1) {
        const bucket = this.cells.get(this.cellKey(cx, cz));
        if (!bucket) continue;
        for (const box of bucket) {
          if (visited.has(box)) continue;
          visited.add(box);
          if (
            px < box.minX - margin ||
            px > box.maxX + margin ||
            pz < box.minZ - margin ||
            pz > box.maxZ + margin
          ) {
            continue;
          }
          if (box.ring && box.ring.length >= 6) {
            const n = getEffectiveVertexCount(box.ring);
            if (n >= 3) {
              const res = resolveCircleAgainstPolygon(px, pz, Math.max(0.05, margin), box.ring, n);
              if (res.hit) return true;
              continue;
            }
          }
          return true;
        }
      }
    }
    return false;
  }

  resolveCircle(x: number, z: number, radius: number): CirclePushResult {
    let px = x;
    let pz = z;
    let collided = false;
    let accNx = 0;
    let accNz = 0;

    const visited = new Set<ColliderBox2D>();

    for (let pass = 0; pass < 3; pass += 1) {
      visited.clear();
      let passHit = false;
      const minCx = Math.floor((px - radius) / this.cellSize);
      const maxCx = Math.floor((px + radius) / this.cellSize);
      const minCz = Math.floor((pz - radius) / this.cellSize);
      const maxCz = Math.floor((pz + radius) / this.cellSize);

      for (let cz = minCz; cz <= maxCz; cz += 1) {
        for (let cx = minCx; cx <= maxCx; cx += 1) {
          const bucket = this.cells.get(this.cellKey(cx, cz));
          if (!bucket) continue;
          for (const box of bucket) {
            if (visited.has(box)) continue;
            visited.add(box);

            // Broad-phase AABB reject
            if (
              px < box.minX - radius ||
              px > box.maxX + radius ||
              pz < box.minZ - radius ||
              pz > box.maxZ + radius
            ) {
              continue;
            }

            let res: { x: number; z: number; hit: boolean; nx: number; nz: number };
            if (box.ring && box.ring.length >= 6) {
              const n = getEffectiveVertexCount(box.ring);
              res =
                n >= 3
                  ? resolveCircleAgainstPolygon(px, pz, radius, box.ring, n)
                  : resolveCircleAgainstAabb(px, pz, radius, box);
            } else {
              res = resolveCircleAgainstAabb(px, pz, radius, box);
            }

            if (res.hit) {
              px = res.x;
              pz = res.z;
              accNx += res.nx;
              accNz += res.nz;
              collided = true;
              passHit = true;
            }
          }
        }
      }
      if (!passHit) break;
    }

    let normalX = 0;
    let normalZ = 0;
    if (collided) {
      const nLen = Math.hypot(accNx, accNz);
      if (nLen > 1e-6) {
        normalX = accNx / nLen;
        normalZ = accNz / nLen;
      }
    }

    return { x: px, z: pz, collided, normalX, normalZ };
  }

  getActiveBoxCount(): number {
    let total = 0;
    for (const boxes of this.tileBoxes.values()) total += boxes.length;
    return total;
  }
}
