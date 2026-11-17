import type { ColliderBox2D } from './collision';
import type { RoadGraph, TerrainGrid } from './types';

export interface PlayableWorldBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface PerimeterRoadBarrier {
  id: string;
  x: number;
  z: number;
  /** Direction vector pointing along the road toward the outside of the map */
  dirX: number;
  dirZ: number;
  /** Yaw angle of the barrier board (perpendicular to road direction) */
  yaw: number;
  /** Total span width of the roadblock across the road (meters) */
  width: number;
  /** Which perimeter edge this crossing belongs to */
  edge: 'west' | 'east' | 'north' | 'south';
}

const DEFAULT_PERIMETER_INSET = 16;

/**
 * Canonical playable world perimeter shared by Player, AI Traffic, Pedestrians,
 * Minimap, and physical 3D municipal roadblock barriers.
 * Keeping every entity on this exact perimeter eliminates invisible walls where NPCs
 * drive past the player!
 */
export function computePlayableWorldBounds(
  terrain: Pick<TerrainGrid, 'minX' | 'maxX' | 'minZ' | 'maxZ'>,
  insetMeters = DEFAULT_PERIMETER_INSET,
): PlayableWorldBounds {
  const safeInsetX = Math.min(insetMeters, (terrain.maxX - terrain.minX) * 0.15);
  const safeInsetZ = Math.min(insetMeters, (terrain.maxZ - terrain.minZ) * 0.15);
  return {
    minX: terrain.minX + safeInsetX,
    maxX: terrain.maxX - safeInsetX,
    minZ: terrain.minZ + safeInsetZ,
    maxZ: terrain.maxZ - safeInsetZ,
  };
}

export function isPointInsideBounds(
  x: number,
  z: number,
  bounds: PlayableWorldBounds,
  margin = 0,
): boolean {
  return (
    x >= bounds.minX + margin &&
    x <= bounds.maxX - margin &&
    z >= bounds.minZ + margin &&
    z <= bounds.maxZ - margin
  );
}

function roadClassDefaultWidth(roadClass: string): number {
  if (roadClass === 'primary') return 12.5;
  if (roadClass === 'secondary') return 10.5;
  if (roadClass === 'tertiary') return 9.0;
  return 7.5;
}

/**
 * Finds every road segment in `roadGraph` that crosses the playable world perimeter
 * and computes cleanly aligned municipal roadblock barriers perpendicular to each road.
 */
export function computePerimeterRoadBarriers(
  roadGraph: RoadGraph,
  bounds: PlayableWorldBounds,
): PerimeterRoadBarrier[] {
  const nodeMap = new Map<string, { x: number; z: number }>();
  for (const n of roadGraph.nodes) {
    nodeMap.set(n.id, { x: n.x, z: n.z });
  }

  const raw: PerimeterRoadBarrier[] = [];
  let seq = 0;

  for (const edge of roadGraph.edges) {
    if (edge.roadClass === 'tram') continue;
    const a = nodeMap.get(edge.from);
    const b = nodeMap.get(edge.to);
    if (!a || !b) continue;

    const aIn = isPointInsideBounds(a.x, a.z, bounds, 0);
    const bIn = isPointInsideBounds(b.x, b.z, bounds, 0);
    if (aIn === bIn) continue;

    // Ensure pIn is inside and pOut is outside
    const pIn = aIn ? a : b;
    const pOut = aIn ? b : a;
    const dx = pOut.x - pIn.x;
    const dz = pOut.z - pIn.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.5) continue;

    // Solve earliest t in (0, 1] where pIn + t * (pOut - pIn) hits the bounds box
    let bestT = 1.0;
    let hitEdge: PerimeterRoadBarrier['edge'] = 'east';

    if (dx < -1e-6 && pOut.x < bounds.minX) {
      const t = (bounds.minX - pIn.x) / dx;
      if (t >= 0 && t < bestT) {
        bestT = t;
        hitEdge = 'west';
      }
    }
    if (dx > 1e-6 && pOut.x > bounds.maxX) {
      const t = (bounds.maxX - pIn.x) / dx;
      if (t >= 0 && t < bestT) {
        bestT = t;
        hitEdge = 'east';
      }
    }
    if (dz < -1e-6 && pOut.z < bounds.minZ) {
      const t = (bounds.minZ - pIn.z) / dz;
      if (t >= 0 && t < bestT) {
        bestT = t;
        hitEdge = 'north';
      }
    }
    if (dz > 1e-6 && pOut.z > bounds.maxZ) {
      const t = (bounds.maxZ - pIn.z) / dz;
      if (t >= 0 && t < bestT) {
        bestT = t;
        hitEdge = 'south';
      }
    }

    const dirX = dx / len;
    const dirZ = dz / len;
    // Place the visible barrier cleanly 1.8m inside the hard clamp edge so the player
    // touches the visible concrete/red-white barricade first instead of an invisible line!
    const pullIn = Math.min(1.8, bestT * len * 0.4);
    const cx = pIn.x + dx * bestT - dirX * pullIn;
    const cz = pIn.z + dz * bestT - dirZ * pullIn;

    raw.push({
      id: `perimeter-barrier-${seq++}`,
      x: cx,
      z: cz,
      dirX,
      dirZ,
      yaw: Math.atan2(dirX, dirZ),
      width: roadClassDefaultWidth(edge.roadClass),
      edge: hitEdge,
    });
  }

  // Merge duplicate / dual-carriageway crossings that sit within 6.5m of each other
  const merged: PerimeterRoadBarrier[] = [];
  for (const cand of raw) {
    let absorbed = false;
    for (const existing of merged) {
      if (existing.edge !== cand.edge) continue;
      const d = Math.hypot(existing.x - cand.x, existing.z - cand.z);
      if (d < 6.5) {
        existing.x = (existing.x + cand.x) * 0.5;
        existing.z = (existing.z + cand.z) * 0.5;
        existing.width = Math.min(18, Math.max(existing.width, cand.width) + d * 0.55);
        absorbed = true;
        break;
      }
    }
    if (!absorbed) {
      merged.push(cand);
    }
  }

  return merged;
}

/**
 * Converts physical perimeter roadblock barriers into oriented 2D polygon colliders
 * for `BuildingSpatialGrid` so bumping a barrier feels solid, triggers sparks & deflection,
 * and matches the visible 3D concrete/striped barricade to the centimeter.
 */
export function buildBarrierColliders(
  barriers: readonly PerimeterRoadBarrier[],
): ColliderBox2D[] {
  const out: ColliderBox2D[] = [];
  const halfDepth = 0.72;

  for (const b of barriers) {
    const halfW = b.width * 0.52;
    const fx = b.dirX;
    const fz = b.dirZ;
    // Perpendicular across road
    const rx = -fz;
    const rz = fx;

    const c0x = b.x - rx * halfW - fx * halfDepth;
    const c0z = b.z - rz * halfW - fz * halfDepth;
    const c1x = b.x + rx * halfW - fx * halfDepth;
    const c1z = b.z + rz * halfW - fz * halfDepth;
    const c2x = b.x + rx * halfW + fx * halfDepth;
    const c2z = b.z + rz * halfW + fz * halfDepth;
    const c3x = b.x - rx * halfW + fx * halfDepth;
    const c3z = b.z - rz * halfW + fz * halfDepth;

    out.push({
      id: b.id,
      minX: Math.min(c0x, c1x, c2x, c3x),
      maxX: Math.max(c0x, c1x, c2x, c3x),
      minZ: Math.min(c0z, c1z, c2z, c3z),
      maxZ: Math.max(c0z, c1z, c2z, c3z),
      ring: [c0x, c0z, c1x, c1z, c2x, c2z, c3x, c3z],
    });
  }

  return out;
}
