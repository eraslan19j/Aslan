import { clamp } from './math';
import { createRng, type Rng } from './rng';
import { VEHICLE_PAINT_PALETTE, type VehicleArchetype } from './vehicle';
import { VEHICLE_PHYSICS_SPECS } from './vehiclePhysics';
import type { BuildingSpatialGrid } from './world/collision';
import type { RoadGraph, RoadGraphEdge, RoadGraphNode } from './world/types';
import { isPointInsideBounds, type PlayableWorldBounds } from './world/worldBounds';

export interface TrafficAgent {
  id: number;
  archetype: VehicleArchetype;
  colorIndex: number;
  paintHex: number;
  fromNodeId: string;
  toNodeId: string;
  edgeLength: number;
  edgeProgress: number; // 0..1
  speedMps: number;
  targetSpeedMps: number;
  vx: number;
  vz: number;
  x: number;
  y: number;
  z: number;
  heading: number;
  yawRate: number;
  pitch: number;
  /** Dynamic spring-damper pitch (nose dive on brake / squat on accel) */
  suspPitch: number;
  /** Dynamic body roll during turns & impacts */
  suspRoll: number;
  /** Front wheel steering angle (radians) */
  steerAngle: number;
  /** Cumulative rolling wheel angle (radians) */
  wheelSpin: number;
  /** Tire slip / skid intensity (0..1) on hard braking or collision knockback */
  skidIntensity: number;
  yieldTimer: number;
  /** Momentum collision knockback state (real physics impulse when bumped!) */
  knockTimer: number;
  knockVx: number;
  knockVz: number;
  knockYawRate: number;
  braking: boolean;
  parked: boolean;
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
const CAR_FOLLOW_GAP = 11.2;
const PERIMETER_TRAFFIC_MARGIN = 4.5;

function getArchetypeCruiseDynamics(archetype: VehicleArchetype): {
  accelMps2: number;
  brakeMps2: number;
  cruiseMult: number;
  maxCruiseMps: number;
  massKg: number;
  wheelRadius: number;
  rollGain: number;
} {
  const p = VEHICLE_PHYSICS_SPECS[archetype];
  if (archetype === 'sports') {
    return {
      accelMps2: 8.6,
      brakeMps2: 18.0,
      cruiseMult: 1.05,
      maxCruiseMps: 18.5, // ~67 km/h sporty avenue pace
      massKg: p.massKg,
      wheelRadius: p.wheelRadius,
      rollGain: 0.011,
    };
  }
  if (archetype === 'suv' || archetype === 'van' || archetype === 'dolmus') {
    return {
      accelMps2: 5.1,
      brakeMps2: 14.5,
      cruiseMult: 0.82,
      maxCruiseMps: 13.0,
      massKg: p.massKg,
      wheelRadius: p.wheelRadius,
      rollGain: 0.022,
    };
  }
  return {
    accelMps2: 6.4,
    brakeMps2: 16.0,
    cruiseMult: 0.92,
    maxCruiseMps: 15.0,
    massKg: p.massKg,
    wheelRadius: p.wheelRadius,
    rollGain: 0.016,
  };
}

export class RoadTrafficSimulator {
  private readonly nodes = new Map<string, RoadGraphNode>();
  private readonly outgoing = new Map<string, DirectedLink[]>();
  private readonly validStartIds: string[] = [];
  private readonly agents: TrafficAgent[] = [];
  private readonly rng: Rng;
  private readonly playableBounds: PlayableWorldBounds | null;

  constructor(
    graph: RoadGraph,
    agentCount: number,
    seed = 2026034,
    initialFocusX = 0,
    initialFocusZ = 0,
    playableBounds?: PlayableWorldBounds,
  ) {
    this.rng = createRng(seed);
    this.playableBounds = playableBounds ?? null;

    for (const n of graph.nodes) {
      if (
        this.playableBounds &&
        !isPointInsideBounds(n.x, n.z, this.playableBounds, PERIMETER_TRAFFIC_MARGIN)
      ) {
        continue;
      }
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

    const archetypes: VehicleArchetype[] = [
      'sedan',
      'sports',
      'suv',
      'hatchback',
      'sedan',
      'van',
      'suv',
      'sports',
    ];
    for (let i = 0; i < agentCount; i += 1) {
      const archetype = archetypes[i % archetypes.length]!;
      const agent = this.spawnAgentNear(
        i,
        archetype,
        i % VEHICLE_PAINT_PALETTE.length,
        initialFocusX,
        initialFocusZ,
      );
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
    const dyn = getArchetypeCruiseDynamics(archetype);
    const isParked = id % 7 === 6 && link.length >= 22;
    const progress = isParked ? 0.3 + this.rng.next() * 0.4 : this.rng.next();
    const speedFactor = (0.7 + this.rng.next() * 0.25) * dyn.cruiseMult;
    const targetSpeed = isParked
      ? 0
      : Math.min(dyn.maxCruiseMps, Math.max(5.0, (link.speedLimitKph / 3.6) * speedFactor));

    const segDx = nTo.x - nFrom.x;
    const segDz = nTo.z - nFrom.z;
    const segLen = Math.hypot(segDx, segDz) || 1;
    const rightX = -segDz / segLen;
    const rightZ = segDx / segLen;
    const laneOffset = isParked ? 2.45 : 1.25;
    let x = nFrom.x + segDx * progress + rightX * laneOffset;
    let z = nFrom.z + segDz * progress + rightZ * laneOffset;
    if (this.playableBounds) {
      x = clamp(x, this.playableBounds.minX + 2.5, this.playableBounds.maxX - 2.5);
      z = clamp(z, this.playableBounds.minZ + 2.5, this.playableBounds.maxZ - 2.5);
    }
    const y = nFrom.y + (nTo.y - nFrom.y) * progress;
    const heading = Math.atan2(segDx, segDz);
    const initSpeed = isParked ? 0 : targetSpeed * 0.55;

    return {
      id,
      archetype,
      colorIndex,
      paintHex: VEHICLE_PAINT_PALETTE[colorIndex % VEHICLE_PAINT_PALETTE.length]!,
      fromNodeId: startId,
      toNodeId: link.to,
      edgeLength: link.length,
      edgeProgress: progress,
      speedMps: initSpeed,
      targetSpeedMps: targetSpeed,
      vx: Math.sin(heading) * initSpeed,
      vz: Math.cos(heading) * initSpeed,
      x,
      y,
      z,
      heading,
      yawRate: 0,
      pitch: 0,
      suspPitch: 0,
      suspRoll: 0,
      steerAngle: 0,
      wheelSpin: this.rng.next() * Math.PI * 2,
      skidIntensity: 0,
      yieldTimer: 0,
      knockTimer: 0,
      knockVx: 0,
      knockVz: 0,
      knockYawRate: 0,
      braking: false,
      parked: isParked,
    };
  }

  /** Finds the closest NPC vehicle (moving or parked) within GTA car-entry distance. */
  findNearestAgent(x: number, z: number, maxDist: number): TrafficAgent | null {
    let best: TrafficAgent | null = null;
    let bestDistSq = maxDist * maxDist;
    for (const a of this.agents) {
      const dx = a.x - x;
      const dz = a.z - z;
      const dSq = dx * dx + dz * dz;
      if (dSq <= bestDistSq) {
        bestDistSq = dSq;
        best = a;
      }
    }
    return best;
  }

  /**
   * GTA Free-Roam vehicle takeover: claims the targeted NPC car for the player and leaves
   * the player's previous car cleanly parked in its slot so cars never vanish on swap!
   */
  swapWithPlayerVehicle(
    agentId: number,
    previousCar: {
      archetype: VehicleArchetype;
      paintHex: number;
      x: number;
      y: number;
      z: number;
      heading: number;
      pitch: number;
    },
  ): TrafficAgent | null {
    const idx = this.agents.findIndex((a) => a.id === agentId);
    if (idx < 0) return null;
    const claimed = { ...this.agents[idx]! };
    const slot = this.agents[idx]!;
    slot.archetype = previousCar.archetype;
    slot.paintHex = previousCar.paintHex;
    slot.x = previousCar.x;
    slot.y = previousCar.y;
    slot.z = previousCar.z;
    slot.heading = previousCar.heading;
    slot.pitch = previousCar.pitch;
    slot.speedMps = 0;
    slot.targetSpeedMps = 0;
    slot.vx = 0;
    slot.vz = 0;
    slot.yawRate = 0;
    slot.suspPitch = 0;
    slot.suspRoll = 0;
    slot.steerAngle = 0;
    slot.knockTimer = 0;
    slot.knockVx = 0;
    slot.knockVz = 0;
    slot.knockYawRate = 0;
    slot.braking = false;
    slot.parked = true;
    slot.yieldTimer = 0;
    return claimed;
  }

  /** Dynamically scales active AI traffic density for Android 4-tier quality profiles. */
  setMaxActiveCount(targetCount: number, focusX = 0, focusZ = 0): void {
    const clamped = Math.max(4, Math.min(64, Math.round(targetCount)));
    if (this.validStartIds.length === 0) return;
    while (this.agents.length > clamped) {
      this.agents.pop();
    }
    const archetypes: VehicleArchetype[] = [
      'sedan',
      'sports',
      'suv',
      'hatchback',
      'van',
      'sedan',
    ];
    while (this.agents.length < clamped) {
      const id = this.agents.length;
      const arch = archetypes[id % archetypes.length] ?? 'sedan';
      this.agents.push(
        this.spawnAgentNear(
          id,
          arch,
          id % VEHICLE_PAINT_PALETTE.length,
          focusX,
          focusZ,
        ),
      );
    }
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
   * Resolves solid momentum collision between the player's vehicle and all live AI traffic.
   * Transfers mass-weighted linear + angular impulse so NPC cars physically deflect, skid,
   * dip suspension, and recover naturally instead of acting like immovable rails!
   */
  resolvePlayerVehicleCollision(
    vx: number,
    vz: number,
    velX: number,
    velZ: number,
    playerRadius = 1.15,
    playerMassKg = 1400,
  ): TrafficCollisionResult {
    let x = vx;
    let z = vz;
    let collided = false;
    let hitAgentId: number | null = null;
    let maxImpact = 0;
    let accumNx = 0;
    let accumNz = 0;

    for (const a of this.agents) {
      const agentRadius = a.archetype === 'dolmus' || a.archetype === 'van' ? 1.3 : 1.12;
      const minDist = playerRadius + agentRadius;
      const dx = x - a.x;
      const dz = z - a.z;
      const distSq = dx * dx + dz * dz;
      if (distSq >= minDist * minDist) continue;

      const dist = Math.sqrt(distSq);
      const nx = dist > 1e-4 ? dx / dist : Math.sin(a.heading + Math.PI / 2);
      const nz = dist > 1e-4 ? dz / dist : Math.cos(a.heading + Math.PI / 2);
      const overlap = minDist - dist;

      const dyn = getArchetypeCruiseDynamics(a.archetype);
      const massRatio = clamp(playerMassKg / (playerMassKg + dyn.massKg), 0.35, 0.65);

      // Separate cleanly proportional to mass
      x += nx * overlap * (1 - massRatio * 0.45);
      z += nz * overlap * (1 - massRatio * 0.45);
      a.x -= nx * overlap * (massRatio * 0.72);
      a.z -= nz * overlap * (massRatio * 0.72);

      const relVx = velX - a.vx;
      const relVz = velZ - a.vz;
      const closing = Math.max(0, -(relVx * nx + relVz * nz));
      if (closing > maxImpact) {
        maxImpact = closing;
        hitAgentId = a.id;
      }

      if (closing > 1.2) {
        // Real momentum impulse pushes & spins the struck NPC car physically!
        const knockMag = clamp(closing * (0.68 + massRatio * 0.55), 1.5, 22);
        a.knockVx = a.vx - nx * knockMag;
        a.knockVz = a.vz - nz * knockMag;
        // Off-center torque spins the car realistically
        const fwdX = Math.sin(a.heading);
        const fwdZ = Math.cos(a.heading);
        const crossSpin = fwdX * nz - fwdZ * nx;
        a.knockYawRate = clamp(crossSpin * closing * 0.28, -3.2, 3.2);
        a.knockTimer = clamp(0.55 + closing * 0.08, 0.6, 1.9);
        a.suspRoll = clamp(a.suspRoll + crossSpin * closing * 0.025, -0.14, 0.14);
        a.suspPitch = clamp(a.suspPitch - closing * 0.015, -0.1, 0.1);
        a.skidIntensity = clamp(closing / 12, 0.3, 1.0);
        a.braking = true;
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
    spatialGrid?: BuildingSpatialGrid,
  ): void {
    const safeDt = Math.min(dt, 0.1);
    const maxDistSq = STREAM_MAX_DIST * STREAM_MAX_DIST;

    for (let i = 0; i < this.agents.length; i += 1) {
      const a = this.agents[i]!;
      if (a.yieldTimer > 0) a.yieldTimer = Math.max(0, a.yieldTimer - safeDt);

      // Recycle far-away traffic back into the active ring around the player
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

      const dyn = getArchetypeCruiseDynamics(a.archetype);

      // 1. Active physical collision knockback physics (slide, tire friction, wall bounce, recovery!)
      if (a.knockTimer > 0) {
        a.knockTimer = Math.max(0, a.knockTimer - safeDt);
        const drag = Math.exp(-3.4 * safeDt);
        a.knockVx *= drag;
        a.knockVz *= drag;
        a.knockYawRate *= Math.exp(-4.5 * safeDt);

        let nx = a.x + a.knockVx * safeDt;
        let nz = a.z + a.knockVz * safeDt;
        if (this.playableBounds) {
          nx = clamp(nx, this.playableBounds.minX + 1.4, this.playableBounds.maxX - 1.4);
          nz = clamp(nz, this.playableBounds.minZ + 1.4, this.playableBounds.maxZ - 1.4);
        }
        if (spatialGrid) {
          const bRes = spatialGrid.resolveCircle(nx, nz, 1.25);
          if (bRes.collided) {
            nx = bRes.x;
            nz = bRes.z;
            const vn = a.knockVx * bRes.normalX + a.knockVz * bRes.normalZ;
            if (vn < 0) {
              a.knockVx -= 1.25 * vn * bRes.normalX;
              a.knockVz -= 1.25 * vn * bRes.normalZ;
            }
          }
        }
        a.x = nx;
        a.z = nz;
        a.heading += a.knockYawRate * safeDt;
        a.vx = a.knockVx;
        a.vz = a.knockVz;
        a.yawRate = a.knockYawRate;
        const slideSpeed = Math.hypot(a.knockVx, a.knockVz);
        a.speedMps = slideSpeed;
        a.wheelSpin += (slideSpeed * safeDt) / dyn.wheelRadius;
        a.suspPitch *= Math.exp(-5.0 * safeDt);
        a.suspRoll *= Math.exp(-5.0 * safeDt);
        a.steerAngle = clamp(-a.knockYawRate * 0.25, -0.45, 0.45);
        a.skidIntensity = clamp(slideSpeed / 8.0, 0, 1);
        a.braking = true;
        if (sampleElev) {
          a.y = sampleElev(a.x, a.z);
        }
        continue;
      }

      if (a.parked) {
        a.speedMps = 0;
        a.vx = 0;
        a.vz = 0;
        a.yawRate = 0;
        a.steerAngle *= Math.exp(-6 * safeDt);
        a.suspPitch *= Math.exp(-8 * safeDt);
        a.suspRoll *= Math.exp(-8 * safeDt);
        a.skidIntensity = 0;
        a.braking = false;
        continue;
      }

      const fwdX = Math.sin(a.heading);
      const fwdZ = Math.cos(a.heading);

      // Yield when approaching player / player vehicle ahead
      const dxObs = obstacleX - a.x;
      const dzObs = obstacleZ - a.z;
      const distObsSq = dxObs * dxObs + dzObs * dzObs;
      const aheadObs = dxObs * fwdX + dzObs * fwdZ;
      const lateralObs = Math.abs(dxObs * -fwdZ + dzObs * fwdX);

      let blocked = a.yieldTimer > 0 || (distObsSq < 13 * 13 && aheadObs > 0 && lateralObs < 3.4);

      // Car-to-car traffic spacing: yield if another AI vehicle is directly ahead in the same lane
      if (!blocked) {
        for (let j = 0; j < this.agents.length; j += 1) {
          if (i === j) continue;
          const b = this.agents[j]!;
          if (b.parked) continue;
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

      // Gently slow down when entering a junction or sharp turn so cornering looks authentic
      const nearJunction = a.edgeProgress > 0.82 && a.edgeLength > 10;
      const desired = blocked ? 0 : nearJunction ? Math.min(a.targetSpeedMps, 6.4) : a.targetSpeedMps;
      const prevSpeed = a.speedMps;
      const rate = blocked || a.speedMps > desired ? dyn.brakeMps2 : dyn.accelMps2;
      a.braking = blocked || a.speedMps > desired + 0.55;
      if (a.speedMps < desired) {
        a.speedMps = Math.min(desired, a.speedMps + rate * safeDt);
      } else {
        a.speedMps = Math.max(desired, a.speedMps - rate * safeDt);
      }

      const accelMps2 = (a.speedMps - prevSpeed) / Math.max(1e-4, safeDt);
      const targetSuspPitch = clamp(-accelMps2 * 0.0052, -0.055, 0.048);
      a.suspPitch += (targetSuspPitch - a.suspPitch) * Math.min(1, safeDt * 10);

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
        a.targetSpeedMps = Math.min(
          dyn.maxCruiseMps,
          Math.max(5.0, (nextLink.speedLimitKph / 3.6) * 0.84 * dyn.cruiseMult),
        );
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

      let targetX = nFrom.x + segDx * a.edgeProgress + rightX * laneOffset;
      let targetZ = nFrom.z + segDz * a.edgeProgress + rightZ * laneOffset;
      if (this.playableBounds) {
        targetX = clamp(targetX, this.playableBounds.minX + 2.0, this.playableBounds.maxX - 2.0);
        targetZ = clamp(targetZ, this.playableBounds.minZ + 2.0, this.playableBounds.maxZ - 2.0);
      }

      // Smoothly pull back into lane after knockback recovery (zero teleport snap!)
      const prevX = a.x;
      const prevZ = a.z;
      const laneDist = Math.hypot(targetX - a.x, targetZ - a.z);
      if (laneDist > 0.35 && laneDist < 18) {
        const pull = Math.min(1, safeDt * 4.5);
        a.x += (targetX - a.x) * pull;
        a.z += (targetZ - a.z) * pull;
      } else {
        a.x = targetX;
        a.z = targetZ;
      }

      a.vx = (a.x - prevX) / Math.max(1e-4, safeDt);
      a.vz = (a.z - prevZ) / Math.max(1e-4, safeDt);

      // Smooth steering, yaw rate, wheel spin & cornering suspension roll (copies player physics feel!)
      const targetHeading = Math.atan2(segDx, segDz);
      let dAng = targetHeading - a.heading;
      while (dAng > Math.PI) dAng -= Math.PI * 2;
      while (dAng < -Math.PI) dAng += Math.PI * 2;
      const prevHeading = a.heading;
      a.heading += dAng * Math.min(1, safeDt * 6.8);
      let stepDeltaHeading = a.heading - prevHeading;
      while (stepDeltaHeading > Math.PI) stepDeltaHeading -= Math.PI * 2;
      while (stepDeltaHeading < -Math.PI) stepDeltaHeading += Math.PI * 2;
      a.yawRate = stepDeltaHeading / Math.max(1e-4, safeDt);

      // Visual front-wheel steering angle & body roll in corners
      const targetSteer = clamp(dAng * 0.85, -0.52, 0.52);
      a.steerAngle += (targetSteer - a.steerAngle) * Math.min(1, safeDt * 12);
      const targetRoll = clamp(a.yawRate * a.speedMps * dyn.rollGain, -0.09, 0.09);
      a.suspRoll += (targetRoll - a.suspRoll) * Math.min(1, safeDt * 9);
      a.wheelSpin += (a.speedMps * safeDt) / dyn.wheelRadius;
      a.skidIntensity = a.braking && a.speedMps > 6 ? clamp((a.speedMps - 6) / 14, 0, 0.5) : 0;

      if (sampleElev) {
        a.y = sampleElev(a.x, a.z);
        const fX = Math.sin(a.heading);
        const fZ = Math.cos(a.heading);
        const yF = sampleElev(a.x + fX * 1.6, a.z + fZ * 1.6);
        const yR = sampleElev(a.x - fX * 1.6, a.z - fZ * 1.6);
        a.pitch = Math.atan2(yF - yR, 3.2);
      } else {
        a.y = nFrom.y + (nTo.y - nFrom.y) * a.edgeProgress;
        a.pitch = 0;
      }
    }
  }
}
