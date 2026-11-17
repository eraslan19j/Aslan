import {
  resolveCircleAgainstVehicleOBB,
  type VehicleColliderOBB,
} from './playerController';
import { createRng, type Rng } from './rng';
import { findSanctuaryZone, type SanctuaryZone } from './sanctuary';
import type { BuildingSpatialGrid } from './world/collision';
import type { RoadGraph, RoadGraphNode } from './world/types';
import { isPointInsideBounds, type PlayableWorldBounds } from './world/worldBounds';

export type PedestrianBehavior = 'walk' | 'idle' | 'run';

export interface PedestrianAgent {
  id: number;
  fromNodeId: string;
  toNodeId: string;
  edgeLength: number;
  edgeProgress: number;
  sideSign: 1 | -1;
  walkSpeed: number;
  x: number;
  y: number;
  z: number;
  heading: number;
  stridePhase: number;
  shirtColorIndex: number;
  pantsColorIndex: number;
  panicTimer: number;
  dodgeOffset: number;
  behavior: PedestrianBehavior;
  idleTimer: number;
  lookYaw: number;
}

interface PedLink {
  to: string;
  length: number;
  halfWidth: number;
}

const PED_STREAM_MIN = 18;
const PED_STREAM_MAX = 155;
const PED_COLLISION_RADIUS = 0.42;

/**
 * Pure TypeScript sidewalk pedestrian simulator (M3).
 * Walks pedestrians along real OSM street sidewalks near the player,
 * reacts cleanly with dodge/panic when vehicles speed close or honk,
 * and keeps Worship Sanctuary zones calm and strictly protected.
 */
export class PedestrianSimulator {
  private readonly nodes = new Map<string, RoadGraphNode>();
  private readonly outgoing = new Map<string, PedLink[]>();
  private readonly startIds: string[] = [];
  private readonly agents: PedestrianAgent[] = [];
  private readonly rng: Rng;

  constructor(
    graph: RoadGraph,
    count: number,
    seed = 2026341,
    playableBounds?: PlayableWorldBounds,
  ) {
    this.rng = createRng(seed);
    for (const n of graph.nodes) {
      if (playableBounds && !isPointInsideBounds(n.x, n.z, playableBounds, 4.0)) {
        continue;
      }
      this.nodes.set(n.id, n);
    }

    const addLink = (from: string, to: string, length: number, width: number): void => {
      if (from === to || !this.nodes.has(from) || !this.nodes.has(to)) return;
      let list = this.outgoing.get(from);
      if (!list) {
        list = [];
        this.outgoing.set(from, list);
      }
      list.push({
        to,
        length: Math.max(2, length),
        halfWidth: Math.max(1.5, Math.min(4.6, (width || 5.8) * 0.5)),
      });
    };

    for (const edge of graph.edges) {
      if (edge.roadClass === 'tram') continue;
      addLink(edge.from, edge.to, edge.lengthMeters, edge.width);
      addLink(edge.to, edge.from, edge.lengthMeters, edge.width);
    }

    for (const id of this.outgoing.keys()) {
      if ((this.outgoing.get(id)?.length ?? 0) > 0) this.startIds.push(id);
    }
    if (this.startIds.length === 0) return;

    for (let i = 0; i < count; i += 1) {
      this.agents.push(this.spawnNear(i, 0, 0));
    }
  }

  private pickStartNear(focusX: number, focusZ: number): string {
    let best = this.startIds[Math.floor(this.rng.next() * this.startIds.length)]!;
    let bestErr = Infinity;
    const tries = Math.min(26, this.startIds.length);
    for (let k = 0; k < tries; k += 1) {
      const id = this.startIds[Math.floor(this.rng.next() * this.startIds.length)]!;
      const n = this.nodes.get(id)!;
      const d = Math.hypot(n.x - focusX, n.z - focusZ);
      if (d >= PED_STREAM_MIN && d <= PED_STREAM_MAX * 0.8) return id;
      const err = Math.abs(d - 65);
      if (err < bestErr) {
        bestErr = err;
        best = id;
      }
    }
    return best;
  }

  private spawnNear(id: number, focusX: number, focusZ: number): PedestrianAgent {
    const startId = this.pickStartNear(focusX, focusZ);
    const links = this.outgoing.get(startId)!;
    const link = links[Math.floor(this.rng.next() * links.length)]!;
    const nFrom = this.nodes.get(startId)!;
    const nTo = this.nodes.get(link.to)!;
    const progress = this.rng.next();
    const sideSign: 1 | -1 = this.rng.next() > 0.5 ? 1 : -1;

    const segDx = nTo.x - nFrom.x;
    const segDz = nTo.z - nFrom.z;
    const segLen = Math.hypot(segDx, segDz) || 1;
    const rightX = -segDz / segLen;
    const rightZ = segDx / segLen;
    const sidewalkOffset = 3.55 * sideSign;

    return {
      id,
      fromNodeId: startId,
      toNodeId: link.to,
      edgeLength: link.length,
      edgeProgress: progress,
      sideSign,
      walkSpeed: 1.25 + this.rng.next() * 0.55,
      x: nFrom.x + segDx * progress + rightX * sidewalkOffset,
      y: nFrom.y + (nTo.y - nFrom.y) * progress,
      z: nFrom.z + segDz * progress + rightZ * sidewalkOffset,
      heading: Math.atan2(segDx, segDz),
      stridePhase: this.rng.next() * Math.PI * 2,
      shirtColorIndex: id % 8,
      pantsColorIndex: (id * 3) % 4,
      panicTimer: 0,
      dodgeOffset: 0,
      behavior: 'walk',
      idleTimer: 0,
      lookYaw: 0,
    };
  }

  /** Dynamically scales live NPC density for Android 4-tier quality profiles without losing positions. */
  setMaxActiveCount(targetCount: number, focusX = 0, focusZ = 0): void {
    const clamped = Math.max(4, Math.min(80, Math.round(targetCount)));
    if (this.startIds.length === 0) return;
    while (this.agents.length > clamped) {
      this.agents.pop();
    }
    while (this.agents.length < clamped) {
      this.agents.push(this.spawnNear(this.agents.length, focusX, focusZ));
    }
  }

  getAgents(): readonly PedestrianAgent[] {
    return this.agents;
  }

  /** Triggers polite startle/step-back when the player honks nearby (outside sanctuaries). */
  notifyHorn(
    originX: number,
    originZ: number,
    sanctuaries: readonly SanctuaryZone[],
    radius = 20,
  ): void {
    const rSq = radius * radius;
    for (const p of this.agents) {
      if (findSanctuaryZone(p.x, p.z, sanctuaries)) continue;
      const dx = p.x - originX;
      const dz = p.z - originZ;
      if (dx * dx + dz * dz <= rSq) {
        p.panicTimer = Math.max(p.panicTimer, 2.2);
      }
    }
  }

  private getEdgeHalfWidth(fromId: string, toId: string): number {
    const links = this.outgoing.get(fromId);
    if (!links) return 2.8;
    for (const l of links) {
      if (l.to === toId) return l.halfWidth;
    }
    return 2.8;
  }

  /**
   * Resolves a pedestrian's desired sidewalk point against building footprints and vehicle OBBs,
   * automatically adapting curb offset inside tight Istanbul alleys so pedestrians NEVER clip walls.
   */
  private resolveWalkableSidewalkPoint(
    baseX: number,
    baseZ: number,
    rightX: number,
    rightZ: number,
    sideSign: 1 | -1,
    preferredOffset: number,
    spatialGrid?: BuildingSpatialGrid,
    vehicleObstacles?: readonly VehicleColliderOBB[],
  ): { x: number; z: number } {
    // Try preferred outer curb first, then smoothly tighten inward toward road edge if a facade pinches sidewalk
    const offsets = [preferredOffset, preferredOffset * 0.72, preferredOffset * 0.45, -preferredOffset * 0.65, 0];
    let x = baseX + rightX * preferredOffset * sideSign;
    let z = baseZ + rightZ * preferredOffset * sideSign;

    if (spatialGrid) {
      let placed = false;
      for (const off of offsets) {
        const cx = baseX + rightX * off * sideSign;
        const cz = baseZ + rightZ * off * sideSign;
        if (!spatialGrid.isPointInsideBuilding(cx, cz, PED_COLLISION_RADIUS + 0.08)) {
          x = cx;
          z = cz;
          placed = true;
          break;
        }
      }
      if (!placed) {
        const res = spatialGrid.resolveCircle(baseX, baseZ, PED_COLLISION_RADIUS);
        x = res.x;
        z = res.z;
      }
    }

    if (vehicleObstacles) {
      for (const veh of vehicleObstacles) {
        const vRes = resolveCircleAgainstVehicleOBB(x, z, PED_COLLISION_RADIUS, veh);
        if (vRes.hit) {
          x = vRes.x;
          z = vRes.z;
        }
      }
    }

    if (spatialGrid) {
      const finalB = spatialGrid.resolveCircle(x, z, PED_COLLISION_RADIUS);
      x = finalB.x;
      z = finalB.z;
    }

    return { x, z };
  }

  /**
   * Advances sidewalk pedestrians with obstacle avoidance (buildings + vehicles) and returns how
   * many pedestrians had a reckless close-call with a fast-moving vehicle outside sanctuary zones.
   */
  step(
    dt: number,
    focusX: number,
    focusZ: number,
    vehicleSpeedMps: number,
    inVehicle: boolean,
    sanctuaries: readonly SanctuaryZone[],
    sampleElev?: (x: number, z: number) => number,
    spatialGrid?: BuildingSpatialGrid,
    vehicleObstacles?: readonly VehicleColliderOBB[],
  ): { closeCalls: number } {
    const safeDt = Math.min(dt, 0.1);
    const maxSq = PED_STREAM_MAX * PED_STREAM_MAX;
    let closeCalls = 0;

    for (let i = 0; i < this.agents.length; i += 1) {
      const p = this.agents[i]!;
      const dFocusSq = (p.x - focusX) ** 2 + (p.z - focusZ) ** 2;
      if (dFocusSq > maxSq && this.startIds.length > 4) {
        const respawned = this.spawnNear(p.id, focusX, focusZ);
        if (spatialGrid) {
          const pushed = spatialGrid.resolveCircle(respawned.x, respawned.z, PED_COLLISION_RADIUS);
          respawned.x = pushed.x;
          respawned.z = pushed.z;
        }
        if (sampleElev) respawned.y = sampleElev(respawned.x, respawned.z);
        this.agents[i] = respawned;
        continue;
      }

      const inSanctuary = findSanctuaryZone(p.x, p.z, sanctuaries) !== null;
      if (inSanctuary) {
        p.panicTimer = 0;
      } else if (inVehicle && Math.abs(vehicleSpeedMps) > 5.5 && dFocusSq < 8.5 * 8.5) {
        if (p.panicTimer <= 0.1 && dFocusSq < 3.4 * 3.4 && Math.abs(vehicleSpeedMps) > 8.5) {
          closeCalls += 1;
        }
        p.panicTimer = Math.max(p.panicTimer, 3.0);
      }

      if (p.panicTimer > 0) {
        p.panicTimer = Math.max(0, p.panicTimer - safeDt);
        p.idleTimer = 0;
        p.behavior = 'run';
        p.dodgeOffset = Math.min(1.15, p.dodgeOffset + safeDt * 2.8);
      } else {
        p.dodgeOffset = Math.max(0, p.dodgeOffset - safeDt * 1.4);
        if (p.idleTimer > 0) {
          p.idleTimer = Math.max(0, p.idleTimer - safeDt);
          p.behavior = 'idle';
          p.lookYaw = Math.sin((p.idleTimer + p.id) * 1.9) * 0.48;
        } else {
          p.behavior = 'walk';
          p.lookYaw *= Math.max(0, 1 - safeDt * 6);
        }
      }

      const activeSpeed =
        p.behavior === 'idle' ? 0 : p.behavior === 'run' ? p.walkSpeed * 2.2 : p.walkSpeed;
      if (activeSpeed > 0.05) {
        p.edgeProgress += (activeSpeed * safeDt) / Math.max(1, p.edgeLength);
        p.stridePhase += activeSpeed * safeDt * 4.5;
      }

      let guard = 0;
      while (p.edgeProgress >= 1 && guard < 3) {
        guard += 1;
        p.edgeProgress -= 1;
        const arrived = p.toNodeId;
        const prev = p.fromNodeId;
        const links = this.outgoing.get(arrived);
        if (!links || links.length === 0) {
          p.toNodeId = prev;
          p.fromNodeId = arrived;
          p.edgeProgress = 0;
          break;
        }
        const nonBack = links.filter((l) => l.to !== prev);
        const pool = nonBack.length > 0 ? nonBack : links;
        const next = pool[Math.floor(this.rng.next() * pool.length)]!;
        p.fromNodeId = arrived;
        p.toNodeId = next.to;
        p.edgeLength = next.length;
        // ~22% of calm pedestrians briefly pause & glance around at street corners before crossing
        if (p.panicTimer <= 0 && links.length >= 2 && this.rng.next() < 0.22) {
          p.idleTimer = 1.5 + this.rng.next() * 2.4;
          p.behavior = 'idle';
          break;
        }
      }

      const nFrom = this.nodes.get(p.fromNodeId);
      const nTo = this.nodes.get(p.toNodeId);
      if (!nFrom || !nTo) continue;

      const segDx = nTo.x - nFrom.x;
      const segDz = nTo.z - nFrom.z;
      const segLen = Math.hypot(segDx, segDz) || 1;
      const rightX = -segDz / segLen;
      const rightZ = segDx / segLen;
      const halfRoadW = this.getEdgeHalfWidth(p.fromNodeId, p.toNodeId);
      const desiredOffset = Math.min(3.3, halfRoadW - 0.3) + p.dodgeOffset;

      const baseX = nFrom.x + segDx * p.edgeProgress;
      const baseZ = nFrom.z + segDz * p.edgeProgress;
      const resolved = this.resolveWalkableSidewalkPoint(
        baseX,
        baseZ,
        rightX,
        rightZ,
        p.sideSign,
        desiredOffset,
        spatialGrid,
        vehicleObstacles,
      );

      p.x = resolved.x;
      p.z = resolved.z;
      p.y = sampleElev ? sampleElev(p.x, p.z) : nFrom.y + (nTo.y - nFrom.y) * p.edgeProgress;
      const targetHeading = Math.atan2(segDx, segDz);
      let dAng = targetHeading - p.heading;
      while (dAng > Math.PI) dAng -= Math.PI * 2;
      while (dAng < -Math.PI) dAng += Math.PI * 2;
      p.heading += dAng * Math.min(1, safeDt * 8.5);
    }

    // Recast/Detour-inspired local crowd separation so pedestrians walk naturally around one another
    const minPedSep = 1.05;
    const minPedSepSq = minPedSep * minPedSep;
    for (let i = 0; i < this.agents.length; i += 1) {
      const a = this.agents[i]!;
      for (let j = i + 1; j < this.agents.length; j += 1) {
        const b = this.agents[j]!;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const dSq = dx * dx + dz * dz;
        if (dSq >= minPedSepSq || dSq < 1e-6) continue;
        const dist = Math.sqrt(dSq);
        const push = (minPedSep - dist) * 0.45;
        const nx = dx / dist;
        const nz = dz / dist;
        a.x -= nx * push;
        a.z -= nz * push;
        b.x += nx * push;
        b.z += nz * push;
        if (spatialGrid) {
          const ra = spatialGrid.resolveCircle(a.x, a.z, PED_COLLISION_RADIUS);
          a.x = ra.x;
          a.z = ra.z;
          const rb = spatialGrid.resolveCircle(b.x, b.z, PED_COLLISION_RADIUS);
          b.x = rb.x;
          b.z = rb.z;
        }
      }
    }

    return { closeCalls };
  }
}
