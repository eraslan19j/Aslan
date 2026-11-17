import { clamp } from './math';
import type { BuildingSpatialGrid } from './world/collision';

export type VehicleArchetype = 'taxi' | 'dolmus' | 'sedan';

export interface VehicleSpec {
  archetype: VehicleArchetype;
  maxForwardSpeed: number; // m/s
  maxReverseSpeed: number; // m/s
  accel: number; // m/s^2
  brakeDecel: number; // m/s^2
  drag: number; // 1/s
  turnRate: number; // rad/s at nominal speed
  /** Half-width collision circle radius (matches true car width so narrow alleys stay drivable). */
  collisionRadius: number;
  /** Front/rear axle offset along heading for oriented 2-circle capsule collision. */
  axleOffset: number;
  wheelRadius: number;
  length: number;
  width: number;
  height: number;
}

export const VEHICLE_SPECS: Record<VehicleArchetype, VehicleSpec> = {
  taxi: {
    archetype: 'taxi',
    maxForwardSpeed: 24.5, // ~88 km/h
    maxReverseSpeed: 8.0,
    accel: 13.0,
    brakeDecel: 20.0,
    drag: 0.98,
    turnRate: 2.45,
    collisionRadius: 0.88,
    axleOffset: 1.08,
    wheelRadius: 0.35,
    length: 4.3,
    width: 1.85,
    height: 1.48,
  },
  dolmus: {
    archetype: 'dolmus',
    maxForwardSpeed: 19.5, // ~70 km/h
    maxReverseSpeed: 6.5,
    accel: 10.2,
    brakeDecel: 17.0,
    drag: 1.1,
    turnRate: 2.1,
    collisionRadius: 0.98,
    axleOffset: 1.35,
    wheelRadius: 0.38,
    length: 5.0,
    width: 2.0,
    height: 2.05,
  },
  sedan: {
    archetype: 'sedan',
    maxForwardSpeed: 22.0, // ~79 km/h
    maxReverseSpeed: 7.2,
    accel: 11.5,
    brakeDecel: 18.5,
    drag: 1.05,
    turnRate: 2.3,
    collisionRadius: 0.86,
    axleOffset: 1.02,
    wheelRadius: 0.34,
    length: 4.2,
    width: 1.8,
    height: 1.42,
  },
};

export interface PlayerVehicleState {
  id: string;
  archetype: VehicleArchetype;
  x: number;
  y: number;
  z: number;
  /** Heading radians where 0 = +Z, +PI/2 = +X (matching Math.sin(yaw), Math.cos(yaw)). */
  heading: number;
  /** Signed forward speed in m/s. */
  speed: number;
  /** Visual wheel steering angle (-1..1). */
  steerVisual: number;
  /** Cumulative rolling rotation of wheels in radians. */
  wheelSpin: number;
  /** Pitch slope in radians from terrain gradient. */
  pitch: number;
  /** True when brakes/reverse lights are active. */
  braking: boolean;
}

export interface DrivingInput {
  /** 0..1 accelerate forward */
  throttle: number;
  /** 0..1 brake / reverse */
  brake: number;
  /** -1 (right) .. +1 (left) steering */
  steer: number;
  /** Handbrake tight turn / drift */
  handbrake: boolean;
}

export interface WorldBounds2D {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export const ENTER_VEHICLE_DISTANCE = 5.5;

export function createVehicleState(
  id: string,
  archetype: VehicleArchetype,
  x: number,
  y: number,
  z: number,
  heading: number,
): PlayerVehicleState {
  return {
    id,
    archetype,
    x,
    y,
    z,
    heading,
    speed: 0,
    steerVisual: 0,
    wheelSpin: 0,
    pitch: 0,
    braking: false,
  };
}

export function stepPlayerVehicle(
  v: PlayerVehicleState,
  input: DrivingInput,
  dt: number,
  bounds: WorldBounds2D,
  sampleElev: (x: number, z: number) => number,
  spatialGrid: BuildingSpatialGrid,
): { collided: boolean; speedKph: number } {
  const spec = VEHICLE_SPECS[v.archetype];
  const throttle = clamp(input.throttle, 0, 1);
  const brake = clamp(input.brake, 0, 1);
  const steer = clamp(input.steer, -1, 1);

  const fwdX = Math.sin(v.heading);
  const fwdZ = Math.cos(v.heading);

  // Measure slope along vehicle forward direction (3.6m wheelbase sample)
  const frontY = sampleElev(v.x + fwdX * 1.8, v.z + fwdZ * 1.8);
  const rearY = sampleElev(v.x - fwdX * 1.8, v.z - fwdZ * 1.8);
  const slopeSin = clamp((frontY - rearY) / 3.6, -0.35, 0.35);
  v.pitch = Math.asin(slopeSin);

  let braking = false;
  if (input.handbrake) {
    braking = true;
    const hbDecel = spec.brakeDecel * 1.15 * dt;
    if (Math.abs(v.speed) <= hbDecel) v.speed = 0;
    else v.speed -= Math.sign(v.speed) * hbDecel;
  } else if (throttle > 0.02) {
    if (v.speed < -0.5) {
      braking = true;
      v.speed = Math.min(0, v.speed + spec.brakeDecel * dt);
    } else {
      v.speed += throttle * spec.accel * dt;
    }
  } else if (brake > 0.02) {
    braking = true;
    if (v.speed > 0.5) {
      v.speed = Math.max(0, v.speed - brake * spec.brakeDecel * dt);
    } else {
      v.speed -= brake * (spec.accel * 0.65) * dt;
    }
  } else {
    // Natural rolling resistance
    const coast = Math.exp(-spec.drag * dt);
    v.speed *= coast;
    if (Math.abs(v.speed) < 0.08) v.speed = 0;
  }

  // Gentle slope gravity assist/resistance (keeps narrow hillside climbs punchy)
  if (Math.abs(v.speed) > 0.1 || throttle > 0.02) {
    v.speed -= slopeSin * 3.4 * dt;
  }

  v.speed = clamp(v.speed, -spec.maxReverseSpeed, spec.maxForwardSpeed);
  v.braking = braking;
  v.steerVisual += (steer - v.steerVisual) * Math.min(1, dt * 11);

  // Speed-sensitive steering (crisp in tight streets, composed at avenue speed)
  const absSpeed = Math.abs(v.speed);
  if (absSpeed > 0.25 && Math.abs(steer) > 0.01) {
    const dirSign = v.speed >= 0 ? 1 : -1;
    const lowSpeedFactor = clamp(absSpeed / 3.8, 0.3, 1.0);
    const highSpeedStability = 1 - clamp((absSpeed - 12) / 28, 0, 0.42);
    const handbrakeBoost = input.handbrake ? 1.38 : 1.0;
    v.heading +=
      steer * dirSign * spec.turnRate * lowSpeedFactor * highSpeedStability * handbrakeBoost * dt;
  }

  const nextFwdX = Math.sin(v.heading);
  const nextFwdZ = Math.cos(v.heading);
  let nextX = clamp(v.x + nextFwdX * v.speed * dt, bounds.minX + 10, bounds.maxX - 10);
  let nextZ = clamp(v.z + nextFwdZ * v.speed * dt, bounds.minZ + 10, bounds.maxZ - 10);

  // Oriented dual-circle collision (front + rear axles) against exact 2D building polygons
  const frontOrigX = nextX + nextFwdX * spec.axleOffset;
  const frontOrigZ = nextZ + nextFwdZ * spec.axleOffset;
  const frontRes = spatialGrid.resolveCircle(frontOrigX, frontOrigZ, spec.collisionRadius);
  const frontPushX = frontRes.x - frontOrigX;
  const frontPushZ = frontRes.z - frontOrigZ;
  nextX += frontPushX;
  nextZ += frontPushZ;

  const rearOrigX = nextX - nextFwdX * spec.axleOffset;
  const rearOrigZ = nextZ - nextFwdZ * spec.axleOffset;
  const rearRes = spatialGrid.resolveCircle(rearOrigX, rearOrigZ, spec.collisionRadius);
  const rearPushX = rearRes.x - rearOrigX;
  const rearPushZ = rearRes.z - rearOrigZ;
  nextX += rearPushX;
  nextZ += rearPushZ;

  const collided = frontRes.collided || rearRes.collided;
  if (collided) {
    // Combine surface push normals for physically accurate tangent wall-sliding
    let nx = 0;
    let nz = 0;
    if (frontRes.collided) {
      nx += frontRes.normalX;
      nz += frontRes.normalZ;
    }
    if (rearRes.collided) {
      nx += rearRes.normalX;
      nz += rearRes.normalZ;
    }
    const nLen = Math.hypot(nx, nz);
    if (nLen > 1e-5) {
      nx /= nLen;
      nz /= nLen;

      const vx = nextFwdX * v.speed;
      const vz = nextFwdZ * v.speed;
      const vn = vx * nx + vz * nz;

      // Only cancel velocity pointing INTO the wall; preserve smooth tangential sliding!
      if (vn < 0) {
        const slideVx = vx - vn * nx;
        const slideVz = vz - vn * nz;
        const slideSpeed = slideVx * nextFwdX + slideVz * nextFwdZ;
        // dt-scaled scrape friction: light drag on glancing scrapes, firm stop on head-on impacts
        const impactCos = Math.abs(nextFwdX * nx + nextFwdZ * nz);
        const wallDrag = impactCos > 0.78 ? 16.0 : 1.05;
        v.speed = slideSpeed * Math.exp(-wallDrag * dt);

        // Rotate heading gently away from the wall toward parallel tangent on shallow scrapes
        if (impactCos < 0.72 && Math.abs(v.speed) > 1.2) {
          const turnTowardNormal = nextFwdZ * nx - nextFwdX * nz;
          v.heading += Math.sign(turnTowardNormal) * impactCos * 2.2 * dt;
        }
      }
    } else {
      v.speed *= 0.8;
    }
  }

  v.x = nextX;
  v.z = nextZ;
  v.y = sampleElev(v.x, v.z);
  v.wheelSpin += (v.speed * dt) / spec.wheelRadius;

  return {
    collided,
    speedKph: Math.round(Math.abs(v.speed) * 3.6),
  };
}

/** Computes a safe exit spot beside the driver's left door, pushed clear of buildings. */
export function computeSafeExitPosition(
  v: PlayerVehicleState,
  spatialGrid: BuildingSpatialGrid,
  sampleElev: (x: number, z: number) => number,
): { x: number; y: number; z: number } {
  const leftX = Math.cos(v.heading);
  const leftZ = -Math.sin(v.heading);
  const candidates = [
    { x: v.x + leftX * 2.2, z: v.z + leftZ * 2.2 },
    { x: v.x - leftX * 2.2, z: v.z - leftZ * 2.2 },
    { x: v.x - Math.sin(v.heading) * 2.9, z: v.z - Math.cos(v.heading) * 2.9 },
  ];
  for (const c of candidates) {
    const res = spatialGrid.resolveCircle(c.x, c.z, 0.7);
    if (!res.collided) {
      return { x: res.x, y: sampleElev(res.x, res.z), z: res.z };
    }
  }
  const fallback = spatialGrid.resolveCircle(v.x, v.z, 0.7);
  return { x: fallback.x, y: sampleElev(fallback.x, fallback.z), z: fallback.z };
}
