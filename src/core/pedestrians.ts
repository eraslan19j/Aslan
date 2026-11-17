import { createRng, type Rng } from './rng';
import { findSanctuaryZone, type SanctuaryZone } from './sanctuary';
import type { RoadGraph, RoadGraphNode } from './world/types';

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
}

interface PedLink {
  to: string;
  length: number;
}

const PED_STREAM_MIN = 18;
const PED_STREAM_MAX = 155;

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

  constructor(graph: RoadGraph, count: number, seed = 2026341) {
    this.rng = createRng(seed);
    for (const n of graph.nodes) {
      this.nodes.set(n.id, n);
    }

    const addLink = (from: string, to: string, length: number): void => {
      if (from === to || !this.nodes.has(from) || !this.nodes.has(to)) return;
      let list = this.outgoing.get(from);
      if (!list) {
        list = [];
        this.outgoing.set(from, list);
      }
      list.push({ to, length: Math.max(2, length) });
    };

    for (const edge of graph.edges) {
      if (edge.roadClass === 'tram') continue;
      addLink(edge.from, edge.to, edge.lengthMeters);
      addLink(edge.to, edge.from, edge.lengthMeters);
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
    };
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

  /**
   * Advances sidewalk pedestrians and returns how many pedestrians had a reckless close-call
   * with a fast-moving vehicle outside sanctuary safe zones.
   */
  step(
    dt: number,
    focusX: number,
    focusZ: number,
    vehicleSpeedMps: number,
    inVehicle: boolean,
    sanctuaries: readonly SanctuaryZone[],
    sampleElev?: (x: number, z: number) => number,
  ): { closeCalls: number } {
    const safeDt = Math.min(dt, 0.1);
    const maxSq = PED_STREAM_MAX * PED_STREAM_MAX;
    let closeCalls = 0;

    for (let i = 0; i < this.agents.length; i += 1) {
      const p = this.agents[i]!;
      const dFocusSq = (p.x - focusX) ** 2 + (p.z - focusZ) ** 2;
      if (dFocusSq > maxSq && this.startIds.length > 4) {
        const respawned = this.spawnNear(p.id, focusX, focusZ);
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
        p.dodgeOffset = Math.min(1.35, p.dodgeOffset + safeDt * 2.8);
      } else {
        p.dodgeOffset = Math.max(0, p.dodgeOffset - safeDt * 1.4);
      }

      const activeSpeed = p.panicTimer > 0 ? p.walkSpeed * 2.2 : p.walkSpeed;
      p.edgeProgress += (activeSpeed * safeDt) / Math.max(1, p.edgeLength);
      p.stridePhase += activeSpeed * safeDt * 4.5;

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
      }

      const nFrom = this.nodes.get(p.fromNodeId);
      const nTo = this.nodes.get(p.toNodeId);
      if (!nFrom || !nTo) continue;

      const segDx = nTo.x - nFrom.x;
      const segDz = nTo.z - nFrom.z;
      const segLen = Math.hypot(segDx, segDz) || 1;
      const rightX = -segDz / segLen;
      const rightZ = segDx / segLen;
      const offset = (3.55 + p.dodgeOffset) * p.sideSign;

      p.x = nFrom.x + segDx * p.edgeProgress + rightX * offset;
      p.z = nFrom.z + segDz * p.edgeProgress + rightZ * offset;
      p.y = sampleElev ? sampleElev(p.x, p.z) : nFrom.y + (nTo.y - nFrom.y) * p.edgeProgress;
      p.heading = Math.atan2(segDx, segDz);
    }

    return { closeCalls };
  }
}
