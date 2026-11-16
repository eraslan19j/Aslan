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
}

interface DirectedLink {
  to: string;
  length: number;
  speedLimitKph: number;
}

export class RoadTrafficSimulator {
  private readonly nodes = new Map<string, RoadGraphNode>();
  private readonly outgoing = new Map<string, DirectedLink[]>();
  private readonly agents: TrafficAgent[] = [];
  private readonly rng: Rng;

  constructor(graph: RoadGraph, agentCount: number, seed = 2026034) {
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

    const validStarts = Array.from(this.outgoing.keys()).filter(
      (id) => (this.outgoing.get(id)?.length ?? 0) > 0,
    );
    if (validStarts.length === 0) return;

    const archetypes: VehicleArchetype[] = ['taxi', 'taxi', 'dolmus', 'sedan', 'sedan', 'sedan'];
    for (let i = 0; i < agentCount; i += 1) {
      const startId = validStarts[Math.floor(this.rng.next() * validStarts.length)]!;
      const links = this.outgoing.get(startId)!;
      const link = links[Math.floor(this.rng.next() * links.length)]!;
      const nFrom = this.nodes.get(startId)!;
      const nTo = this.nodes.get(link.to)!;
      const progress = this.rng.next();
      const archetype = archetypes[i % archetypes.length]!;
      const speedFactor = 0.65 + this.rng.next() * 0.25;
      const targetSpeed = Math.min(13.5, Math.max(4.5, (link.speedLimitKph / 3.6) * speedFactor));

      const x = nFrom.x + (nTo.x - nFrom.x) * progress;
      const z = nFrom.z + (nTo.z - nFrom.z) * progress;
      const y = nFrom.y + (nTo.y - nFrom.y) * progress;
      const heading = Math.atan2(nTo.x - nFrom.x, nTo.z - nFrom.z);

      this.agents.push({
        id: i,
        archetype,
        colorIndex: i % 5,
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
      });
    }
  }

  getAgents(): readonly TrafficAgent[] {
    return this.agents;
  }

  step(
    dt: number,
    obstacleX: number,
    obstacleZ: number,
    sampleElev?: (x: number, z: number) => number,
  ): void {
    const safeDt = Math.min(dt, 0.1);
    for (const a of this.agents) {
      // Yield politely when approaching player or player vehicle ahead
      const dxObs = obstacleX - a.x;
      const dzObs = obstacleZ - a.z;
      const distObsSq = dxObs * dxObs + dzObs * dzObs;
      const fwdX = Math.sin(a.heading);
      const fwdZ = Math.cos(a.heading);
      const aheadDot = dxObs * fwdX + dzObs * fwdZ;

      const blocked = distObsSq < 11 * 11 && aheadDot > 0;
      const desired = blocked ? 0 : a.targetSpeedMps;
      const accel = blocked ? 14 : 4.5;
      if (a.speedMps < desired) {
        a.speedMps = Math.min(desired, a.speedMps + accel * safeDt);
      } else {
        a.speedMps = Math.max(desired, a.speedMps - accel * safeDt);
      }

      if (a.speedMps > 0.05) {
        a.edgeProgress += (a.speedMps * safeDt) / Math.max(1, a.edgeLength);
      }

      // Transition cleanly across intersections
      let guard = 0;
      while (a.edgeProgress >= 1 && guard < 4) {
        guard += 1;
        a.edgeProgress -= 1;
        const arrivedId = a.toNodeId;
        const prevId = a.fromNodeId;
        const links = this.outgoing.get(arrivedId);
        if (!links || links.length === 0) {
          // Dead end: turn around gracefully
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

      // Offset slightly to the right lane (Turkish right-hand traffic, 1.3m)
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
      a.y = sampleElev ? sampleElev(baseX, baseZ) : nFrom.y + (nTo.y - nFrom.y) * a.edgeProgress;
      a.heading = Math.atan2(segDx, segDz);
    }
  }
}
