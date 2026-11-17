import { createRng, type Rng } from './rng';
import type { VehicleArchetype } from './vehicle';
import type { RoadGraph, RoadGraphEdge, RoadGraphNode } from './world/types';

export interface TrafficAgent {
  id: number;
  archetype: VehicleArchetype;
  colorIndex: number;
  fromNodeId: string;
  toNodeId: string;
  edgeLength: number;
  edgeProgress: number; // 0..1
  speedMps: number;
  targetSpeedMps: number;
  x: number;
  y: number;
  z: number;
  heading: number;
  pitch: number;
  yieldTimer: number;
}

export interface TrafficCollisionResult {
  collided: boolean;
  hitAgentId: number | null;
  impactSpeed: number;
  x: number;
  z: number;
  nx: number;
  nz: number;
}

interface DirectedLink {
  to: string;
  length: number;
  speedLimitKph: number;
}

const STREAM_MIN_DIST = 34;
const STREAM_MAX_DIST = 235;
const CAR_FOLLOW_GAP = 10.5;

export class RoadTrafficSimulator {
  private readonly nodes = new Map<string, RoadGraphNode>();
  private readonly outgoing = new Map<string, DirectedLink[]>();
  private readonly validStartIds: string[] = [];
  private readonly agents: TrafficAgent[] = [];
  private readonly rng: Rng;

  constructor(
    graph: RoadGraph,
    agentCount: number,
    seed = 2026034,
    initialFocusX = 0,
    initialFocusZ = 0,
  ) {
    this.rng = createRng(seed);

    for (const n of graph.nodes) {
      this.nodes.set(n.id, n);
    }

    const addLink = (from: string, to: string, edge: RoadGraphEdge): void => {
      if (from === to) return;
      if (!this.nodes.has(from) || !this.nodes.has(to)) return;
      let list = this.outgoing.get(from);
      if (!list) {
        list = [];
        this.outgoing.set(from, list);
      }
      list.push({
        to,
        length: Math.max(2, edge.lengthMeters),
        speedLimitKph: edge.speedLimitKph || 30,
      });
    };

    for (const edge of graph.edges) {
      if (edge.roadClass === 'pedestrian' || edge.roadClass === 'tram') continue;
      addLink(edge.from, edge.to, edge);
      if (!edge.oneWay) {
        addLink(edge.to, edge.from, edge);
      }
    }

    for (const id of this.outgoing.keys()) {
      if ((this.outgoing.get(id)?.length ?? 0) > 0) {
        this.validStartIds.push(id);
      }
    }
    if (this.validStartIds.length === 0) return;

    const archetypes: VehicleArchetype[] = ['taxi', 'taxi', 'dolmus', 'sedan', 'sedan', 'sedan'];
    for (let i = 0; i < agentCount; i += 1) {
      const archetype = archetypes[i % archetypes.length]!;
      const agent = this.spawnAgentNear(i, archetype, i % 5, initialFocusX, initialFocusZ);
      this.agents.push(agent);
    }
  }

  private pickNearbyStartId(focusX: number, focusZ: number): string {
    let bestId = this.validStartIds[Math.floor(this.rng.next() * this.validStartIds.length)]!;
    let bestScore = Infinity;
    const attempts = Math.min(28, this.validStartIds.length);
    for (let k = 0; k < attempts; k += 1) {
      const candidate =
        this.validStartIds[Math.floor(this.rng.next() * this.validStartIds.length)]!;
      const node = this.nodes.get(candidate)!;
      const d = Math.hypot(node.x - focusX, node.z - focusZ);
      if (d >= STREAM_MIN_DIST && d <= STREAM_MAX_DIST * 0.85) {
        return candidate;
      }
      const distError = Math.abs(d - 115);
      if (distError < bestScore) {
        bestScore = distError;
        bestId = candidate;
      }
    }
    return bestId;
  }

  private spawnAgentNear(
    id: number,
    archetype: VehicleArchetype,
    colorIndex: number,
    focusX: number,
    focusZ: number,
  ): TrafficAgent {
    const startId = this.pickNearbyStartId(focusX, focusZ);
    const links = this.outgoing.get(startId)!;
    const link = links[Math.floor(this.rng.next() * links.length)]!;
    const nFrom = this.nodes.get(startId)!;
    const nTo = this.nodes.get(link.to)!;
    const progress = this.rng.next();
    const speedFactor = 0.65 + this.rng.next() * 0.25;
    const targetSpeed = Math.min(13.5, Math.max(4.5, (link.speedLimitKph / 3.6) * speedFactor));

    const segDx = nTo.x - nFrom.x;
    const segDz = nTo.z - nFrom.z;
    const segLen = Math.hypot(segDx, segDz) || 1;
    const rightX = -segDz / segLen;
    const rightZ = segDx / segLen;
    const x = nFrom.x + segDx * progress + rightX * 1.25;
    const z = nFrom.z + segDz * progress + rightZ * 1.25;
    const y = nFrom.y + (nTo.y - nFrom.y) * progress;
    const heading = Math.atan2(segDx, segDz);

    return {
      id,
      archetype,
      colorIndex,
      fromNodeId: startId,
      toNodeId: link.to,
      edgeLength: link.length,
      edgeProgress: progress,
      speedMps: targetSpeed * 0.5,
      targetSpeedMps: targetSpeed,
      x,
      y,
      z,
      heading,
      pitch: 0,
      yieldTimer: 0,
    };
  }

  getAgents(): readonly TrafficAgent[] {
    return this.agents;
  }

  /** Honking near traffic briefly pauses nearby AI vehicles so the player can merge cleanly. */
  notifyHorn(originX: number, originZ: number, radius = 26): void {
    const rSq = radius * radius;
    for (const a of this.agents) {
      const dx = a.x - originX;
      const dz = a.z - originZ;
      if (dx * dx + dz * dz <= rSq) {
        a.yieldTimer = Math.max(a.yieldTimer, 1.35);
      }
    }
  }

  /**
   * Resolves solid collision between the player's vehicle and all live AI traffic vehicles.
   * Stops ghost pass-throughs, gently knocks back the traffic car, and reports impact speed.
   */
  resolvePlayerVehicleCollision(
    vx: number,
    vz: number,
    velX: number,
    velZ: number,
    playerRadius = 1.15,
  ): TrafficCollisionResult {
    let x = vx;
    let z = vz;
    let collided = false;
    let hitAgentId: number | null = null;
    let maxImpact = 0;
    let accumNx = 0;
    let accumNz = 0;

    for (const a of this.agents) {
      const agentRadius = a.archetype === 'dolmus' ? 1.3 : 1.1;
      const minDist = playerRadius + agentRadius;
      const dx = x - a.x;
      const dz = z - a.z;
      const distSq = dx * dx + dz * dz;
      if (distSq >= minDist * minDist) continue;

      const dist = Math.sqrt(distSq);
      const nx = dist > 1e-4 ? dx / dist : Math.sin(a.heading + Math.PI / 2);
      const nz = dist > 1e-4 ? dz / dist : Math.cos(a.heading + Math.PI / 2);
      const overlap = minDist - dist;

      // Push player clear (70%) and traffic slightly aside (30%) so cars never overlap or lock
      x += nx * overlap * 0.78;
      z += nz * overlap * 0.78;
      a.x -= nx * overlap * 0.22;
      a.z -= nz * overlap * 0.22;

      const relVx = velX - Math.sin(a.heading) * a.speedMps;
      const relVz = velZ - Math.cos(a.heading) * a.speedMps;
      const closing = Math.max(0, -(relVx * nx + relVz * nz));
      if (closing > maxImpact) {
        maxImpact = closing;
        hitAgentId = a.id;
      }
      a.speedMps = Math.min(a.speedMps, 1.2);
      a.yieldTimer = Math.max(a.yieldTimer, 1.8);

      collided = true;
      accumNx += nx;
      accumNz += nz;
    }

    const nLen = Math.hypot(accumNx, accumNz);
    return {
      collided,
      hitAgentId,
      impactSpeed: maxImpact,
      x,
      z,
      nx: nLen > 1e-4 ? accumNx / nLen : 0,
      nz: nLen > 1e-4 ? accumNz / nLen : 0,
    };
  }

  step(
    dt: number,
    obstacleX: number,
    obstacleZ: number,
    sampleElev?: (x: number, z: number) => number,
  ): void {
    const safeDt = Math.min(dt, 0.1);
    const maxDistSq = STREAM_MAX_DIST * STREAM_MAX_DIST;

    for (let i = 0; i < this.agents.length; i += 1) {
      const a = this.agents[i]!;
      if (a.yieldTimer > 0) a.yieldTimer = Math.max(0, a.yieldTimer - safeDt);

      // Recycle far-away traffic back into the active ring around the player so streets feel alive
      const dPlayerSq = (a.x - obstacleX) ** 2 + (a.z - obstacleZ) ** 2;
      if (dPlayerSq > maxDistSq && this.validStartIds.length > 4) {
        const respawned = this.spawnAgentNear(
          a.id,
          a.archetype,
          a.colorIndex,
          obstacleX,
          obstacleZ,
        );
        if (sampleElev) {
          respawned.y = sampleElev(respawned.x, respawned.z);
        }
        this.agents[i] = respawned;
        continue;
      }

      const fwdX = Math.sin(a.heading);
      const fwdZ = Math.cos(a.heading);

      // Yield when approaching player / player taxi ahead
      const dxObs = obstacleX - a.x;
      const dzObs = obstacleZ - a.z;
      const distObsSq = dxObs * dxObs + dzObs * dzObs;
      const aheadObs = dxObs * fwdX + dzObs * fwdZ;
      const lateralObs = Math.abs(dxObs * -fwdZ + dzObs * fwdX);

      let blocked = a.yieldTimer > 0 || (distObsSq < 12 * 12 && aheadObs > 0 && lateralObs < 3.4);

      // Car-to-car traffic spacing: yield if another AI vehicle is directly ahead in the same lane
      if (!blocked) {
        for (let j = 0; j < this.agents.length; j += 1) {
          if (i === j) continue;
          const b = this.agents[j]!;
          const dx = b.x - a.x;
          const dz = b.z - a.z;
          const dSq = dx * dx + dz * dz;
          if (dSq > CAR_FOLLOW_GAP * CAR_FOLLOW_GAP) continue;
          const ahead = dx * fwdX + dz * fwdZ;
          const lat = Math.abs(dx * -fwdZ + dz * fwdX);
          const sameDir = Math.sin(b.heading) * fwdX + Math.cos(b.heading) * fwdZ > 0.35;
          if (ahead > 0.5 && lat < 2.2 && sameDir) {
            blocked = true;
            break;
          }
        }
      }

      const desired = blocked ? 0 : a.targetSpeedMps;
      const accel = blocked ? 15 : 4.8;
      if (a.speedMps < desired) {
        a.speedMps = Math.min(desired, a.speedMps + accel * safeDt);
      } else {
        a.speedMps = Math.max(desired, a.speedMps - accel * safeDt);
      }

      if (a.speedMps > 0.05) {
        a.edgeProgress += (a.speedMps * safeDt) / Math.max(1, a.edgeLength);
      }

      let guard = 0;
      while (a.edgeProgress >= 1 && guard < 4) {
        guard += 1;
        a.edgeProgress -= 1;
        const arrivedId = a.toNodeId;
        const prevId = a.fromNodeId;
        const links = this.outgoing.get(arrivedId);
        if (!links || links.length === 0) {
          a.toNodeId = prevId;
          a.fromNodeId = arrivedId;
          a.edgeProgress = 0;
          break;
        }
        const nonReverse = links.filter((l) => l.to !== prevId);
        const pool = nonReverse.length > 0 ? nonReverse : links;
        const nextLink = pool[Math.floor(this.rng.next() * pool.length)]!;
        a.fromNodeId = arrivedId;
        a.toNodeId = nextLink.to;
        a.edgeLength = nextLink.length;
        a.targetSpeedMps = Math.min(13.5, Math.max(4.5, (nextLink.speedLimitKph / 3.6) * 0.78));
      }

      const nFrom = this.nodes.get(a.fromNodeId);
      const nTo = this.nodes.get(a.toNodeId);
      if (!nFrom || !nTo) continue;

      const segDx = nTo.x - nFrom.x;
      const segDz = nTo.z - nFrom.z;
      const segLen = Math.hypot(segDx, segDz) || 1;
      const rightX = -segDz / segLen;
      const rightZ = segDx / segLen;
      const laneOffset = 1.25;

      const baseX = nFrom.x + segDx * a.edgeProgress + rightX * laneOffset;
      const baseZ = nFrom.z + segDz * a.edgeProgress + rightZ * laneOffset;
      a.x = baseX;
      a.z = baseZ;
      a.heading = Math.atan2(segDx, segDz);

      if (sampleElev) {
        a.y = sampleElev(baseX, baseZ);
        const fX = Math.sin(a.heading);
        const fZ = Math.cos(a.heading);
        const yF = sampleElev(baseX + fX * 1.6, baseZ + fZ * 1.6);
        const yR = sampleElev(baseX - fX * 1.6, baseZ - fZ * 1.6);
        a.pitch = Math.atan2(yF - yR, 3.2);
      } else {
        a.y = nFrom.y + (nTo.y - nFrom.y) * a.edgeProgress;
        a.pitch = 0;
      }
    }
  }
}
