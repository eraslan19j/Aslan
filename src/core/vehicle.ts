import { clamp } from './math';
import {
  PLAYER_CAPSULE_RADIUS,
  resolveCircleAgainstVehicleOBB,
  type VehicleColliderOBB,
} from './playerController';
import type { BuildingSpatialGrid } from './world/collision';

export type VehicleArchetype =
  | 'sports'
  | 'sedan'
  | 'suv'
  | 'hatchback'
  | 'van'
  | 'taxi'
  | 'dolmus';

/** Vibrant Vice-City & modern Istanbul automotive paint palette. */
export const VEHICLE_PAINT_PALETTE: readonly number[] = [
  0xdc2626, // Crimson Sport Red (default player ride)
  0x06b6d4, // Vice City Coastal Cyan
  0xf8fafc, // Pearl White
  0x1e293b, // Obsidian Metallic Slate
  0x2563eb, // Bosphorus Metallic Blue
  0xf97316, // Sunset Tangerine
  0x10b981, // Emerald Metallic
  0x94a3b8, // Titanium Silver
  0x7c3aed, // Midnight Violet
  0xeab308, // Solar Gold
];

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
  sports: {
    archetype: 'sports',
    maxForwardSpeed: 30.0, // ~108 km/h
    maxReverseSpeed: 9.0,
    accel: 16.0,
    brakeDecel: 23.5,
    drag: 0.9,
    turnRate: 2.65,
    collisionRadius: 0.88,
    axleOffset: 1.12,
    wheelRadius: 0.35,
    length: 4.4,
    width: 1.9,
    height: 1.32,
  },
  sedan: {
    archetype: 'sedan',
    maxForwardSpeed: 24.5, // ~88 km/h
    maxReverseSpeed: 7.8,
    accel: 12.8,
    brakeDecel: 19.8,
    drag: 1.0,
    turnRate: 2.4,
    collisionRadius: 0.86,
    axleOffset: 1.06,
    wheelRadius: 0.35,
    length: 4.35,
    width: 1.84,
    height: 1.44,
  },
  suv: {
    archetype: 'suv',
    maxForwardSpeed: 22.8, // ~82 km/h
    maxReverseSpeed: 7.4,
    accel: 11.8,
    brakeDecel: 18.8,
    drag: 1.06,
    turnRate: 2.22,
    collisionRadius: 0.94,
    axleOffset: 1.16,
    wheelRadius: 0.38,
    length: 4.65,
    width: 1.96,
    height: 1.76,
  },
  hatchback: {
    archetype: 'hatchback',
    maxForwardSpeed: 23.2, // ~84 km/h
    maxReverseSpeed: 7.5,
    accel: 13.4,
    brakeDecel: 20.5,
    drag: 1.02,
    turnRate: 2.58,
    collisionRadius: 0.84,
    axleOffset: 0.94,
    wheelRadius: 0.33,
    length: 3.95,
    width: 1.78,
    height: 1.45,
  },
  van: {
    archetype: 'van',
    maxForwardSpeed: 19.8, // ~71 km/h
    maxReverseSpeed: 6.5,
    accel: 10.2,
    brakeDecel: 17.2,
    drag: 1.12,
    turnRate: 2.08,
    collisionRadius: 0.98,
    axleOffset: 1.32,
    wheelRadius: 0.38,
    length: 4.95,
    width: 2.0,
    height: 2.04,
  },
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
};

export interface PlayerVehicleState {
  id: string;
  archetype: VehicleArchetype;
  /** Hex paint finish (adopted seamlessly when stealing/entering any NPC street car). */
  paintHex: number;
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
  /** True when handbrake drifting / high-slip cornering. */
  drifting: boolean;
  /** Spring-damped suspension chassis pitch offset (rad: +nose dive, -accel squat). */
  suspPitch: number;
  /** Spring-damped suspension lateral roll (rad). */
  suspRoll: number;
  /** Vertical chassis suspension bounce (m). */
  suspHeave: number;
  /** Turn-signal blinker timer (seconds). */
  signalTimer: number;
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

export function getVehicleColliderOBB(v: PlayerVehicleState): VehicleColliderOBB {
  const spec = VEHICLE_SPECS[v.archetype];
  return {
    id: v.id,
    x: v.x,
    z: v.z,
    heading: v.heading,
    halfWidth: spec.width * 0.5,
    halfLength: spec.length * 0.5,
  };
}

export function createVehicleState(
  id: string,
  archetype: VehicleArchetype,
  x: number,
  y: number,
  z: number,
  heading: number,
  paintHex = VEHICLE_PAINT_PALETTE[0]!,
): PlayerVehicleState {
  return {
    id,
    archetype,
    paintHex,
    x,
    y,
    z,
    heading,
    speed: 0,
    steerVisual: 0,
    wheelSpin: 0,
    pitch: 0,
    braking: false,
    drifting: false,
    suspPitch: 0,
    suspRoll: 0,
    suspHeave: 0,
    signalTimer: 0,
  };
}

export function stepPlayerVehicle(
  v: PlayerVehicleState,
  input: DrivingInput,
  dt: number,
  bounds: WorldBounds2D,
  sampleElev: (x: number, z: number) => number,
  spatialGrid: BuildingSpatialGrid,
): { collided: boolean; speedKph: number; impactSpeed: number; gear: 'R' | 'N' | 'D' } {
  const spec = VEHICLE_SPECS[v.archetype];
  const prevSpeed = v.speed;
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
  v.drifting = input.handbrake && Math.abs(v.speed) > 4.2 && Math.abs(steer) > 0.15;
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
  const nextRightX = Math.cos(v.heading);
  const nextRightZ = -Math.sin(v.heading);

  // Anti-tunneling sub-stepping + 6-point oriented body collider (front/rear axles + 4 bumper corners)
  const stepDist = Math.abs(v.speed * dt);
  const subSteps = Math.max(1, Math.min(8, Math.ceil(stepDist / 0.35)));
  const subDt = dt / subSteps;
  const cornerHalfW = spec.width * 0.44;
  const cornerHalfL = spec.length * 0.45;
  const cornerRadius = 0.28;

  let nextX = v.x;
  let nextZ = v.z;
  let collided = false;
  let accNx = 0;
  let accNz = 0;

  for (let s = 0; s < subSteps; s += 1) {
    nextX = clamp(nextX + nextFwdX * v.speed * subDt, bounds.minX + 10, bounds.maxX - 10);
    nextZ = clamp(nextZ + nextFwdZ * v.speed * subDt, bounds.minZ + 10, bounds.maxZ - 10);

    // 1. Primary front & rear axle circles
    const frontOrigX = nextX + nextFwdX * spec.axleOffset;
    const frontOrigZ = nextZ + nextFwdZ * spec.axleOffset;
    const frontRes = spatialGrid.resolveCircle(frontOrigX, frontOrigZ, spec.collisionRadius);
    if (frontRes.collided) {
      nextX += frontRes.x - frontOrigX;
      nextZ += frontRes.z - frontOrigZ;
      accNx += frontRes.normalX;
      accNz += frontRes.normalZ;
      collided = true;
    }

    const rearOrigX = nextX - nextFwdX * spec.axleOffset;
    const rearOrigZ = nextZ - nextFwdZ * spec.axleOffset;
    const rearRes = spatialGrid.resolveCircle(rearOrigX, rearOrigZ, spec.collisionRadius);
    if (rearRes.collided) {
      nextX += rearRes.x - rearOrigX;
      nextZ += rearRes.z - rearOrigZ;
      accNx += rearRes.normalX;
      accNz += rearRes.normalZ;
      collided = true;
    }

    // 2. 4 Oriented chassis bumper corners (prevents diagonal corner clipping into walls!)
    const corners: [number, number][] = [
      [cornerHalfL, cornerHalfW],
      [cornerHalfL, -cornerHalfW],
      [-cornerHalfL, cornerHalfW],
      [-cornerHalfL, -cornerHalfW],
    ];
    for (const [cl, cw] of corners) {
      const cx = nextX + nextFwdX * cl + nextRightX * cw;
      const cz = nextZ + nextFwdZ * cl + nextRightZ * cw;
      const cRes = spatialGrid.resolveCircle(cx, cz, cornerRadius);
      if (cRes.collided) {
        nextX += cRes.x - cx;
        nextZ += cRes.z - cz;
        accNx += cRes.normalX * 0.65;
        accNz += cRes.normalZ * 0.65;
        collided = true;
      }
    }
  }

  let impactSpeed = 0;
  if (collided) {
    // Combine surface push normals for physically accurate tangent wall-sliding
    let nx = accNx;
    let nz = accNz;
    const nLen = Math.hypot(nx, nz);
    if (nLen > 1e-5) {
      nx /= nLen;
      nz /= nLen;

      const vx = nextFwdX * v.speed;
      const vz = nextFwdZ * v.speed;
      const vn = vx * nx + vz * nz;

      // Only cancel velocity pointing INTO the wall; preserve smooth tangential sliding!
      if (vn < 0) {
        impactSpeed = -vn;
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

  const prevY = v.y;
  const nextElev = sampleElev(nextX, nextZ);

  v.x = nextX;
  v.z = nextZ;
  v.y = nextElev;
  v.wheelSpin += (v.speed * dt) / spec.wheelRadius;

  // Smooth spring-damper chassis suspension physics (accel squat, brake dive, body roll, bump heave)
  const safeDt = Math.max(0.004, dt);
  const longAccel = clamp((v.speed - prevSpeed) / safeDt, -22, 16);
  const targetSuspPitch = clamp(
    (v.braking && v.speed > 0.8 ? 0.042 : -longAccel * 0.0028),
    -0.04,
    0.055,
  );
  const speedNorm = clamp(Math.abs(v.speed) / 14, 0, 1);
  const targetSuspRoll = -v.steerVisual * speedNorm * (v.drifting ? 0.088 : 0.062);
  const bumpVel = clamp((nextElev - prevY) / safeDt, -4, 4);
  const targetSuspHeave = clamp(-Math.abs(bumpVel) * 0.012 + (v.drifting ? 0.014 : 0), -0.045, 0.03);

  const suspLerp = Math.min(1, dt * 11);
  v.suspPitch += (targetSuspPitch - v.suspPitch) * suspLerp;
  v.suspRoll += (targetSuspRoll - v.suspRoll) * suspLerp;
  v.suspHeave += (targetSuspHeave - v.suspHeave) * Math.min(1, dt * 14);
  v.signalTimer = (v.signalTimer + dt) % 1000;

  const gear: 'R' | 'N' | 'D' = v.speed < -0.25 ? 'R' : v.speed > 0.25 ? 'D' : 'N';
  return {
    collided,
    speedKph: Math.round(Math.abs(v.speed) * 3.6),
    impactSpeed,
    gear,
  };
}

/**
 * Computes a guaranteed collision-free exit spot beside the driver's door,
 * checking buildings, nearby traffic/police OBBs, and the vehicle's own OBB
 * so exiting NEVER clips the player into walls or cars (GTA Vice City / OpenCity standard).
 */
export function computeSafeExitPosition(
  v: PlayerVehicleState,
  spatialGrid: BuildingSpatialGrid,
  sampleElev: (x: number, z: number) => number,
  otherVehicles: readonly VehicleColliderOBB[] = [],
  bounds?: WorldBounds2D,
): { x: number; y: number; z: number } {
  const spec = VEHICLE_SPECS[v.archetype];
  const ownObb = getVehicleColliderOBB(v);
  const fwdX = Math.sin(v.heading);
  const fwdZ = Math.cos(v.heading);
  const leftX = Math.cos(v.heading);
  const leftZ = -Math.sin(v.heading);
  const sideDist = spec.width * 0.5 + PLAYER_CAPSULE_RADIUS + 0.55;
  const endDist = spec.length * 0.5 + PLAYER_CAPSULE_RADIUS + 0.65;

  const candidates = [
    // Driver side (left-hand drive in Istanbul)
    { x: v.x + leftX * sideDist, z: v.z + leftZ * sideDist },
    // Passenger side
    { x: v.x - leftX * sideDist, z: v.z - leftZ * sideDist },
    // Rear-left & rear-right doors
    { x: v.x + leftX * sideDist - fwdX * 1.1, z: v.z + leftZ * sideDist - fwdZ * 1.1 },
    { x: v.x - leftX * sideDist - fwdX * 1.1, z: v.z - leftZ * sideDist - fwdZ * 1.1 },
    // Behind trunk & ahead of hood
    { x: v.x - fwdX * endDist, z: v.z - fwdZ * endDist },
    { x: v.x + fwdX * endDist, z: v.z + fwdZ * endDist },
  ];

  for (const c of candidates) {
    const cx = bounds ? clamp(c.x, bounds.minX + 8, bounds.maxX - 8) : c.x;
    const cz = bounds ? clamp(c.z, bounds.minZ + 8, bounds.maxZ - 8) : c.z;
    const bRes = spatialGrid.resolveCircle(cx, cz, PLAYER_CAPSULE_RADIUS + 0.12);
    if (bRes.collided) continue;

    // Must also clear own vehicle & all other vehicles
    if (resolveCircleAgainstVehicleOBB(cx, cz, PLAYER_CAPSULE_RADIUS, ownObb).hit) continue;
    let hitsOtherCar = false;
    for (const ov of otherVehicles) {
      if (ov.id === v.id) continue;
      if (resolveCircleAgainstVehicleOBB(cx, cz, PLAYER_CAPSULE_RADIUS + 0.08, ov).hit) {
        hitsOtherCar = true;
        break;
      }
    }
    if (!hitsOtherCar) {
      return { x: cx, y: sampleElev(cx, cz), z: cz };
    }
  }

  // Fallback: push clear of building & own vehicle
  const pushed = spatialGrid.resolveCircle(v.x - fwdX * endDist, v.z - fwdZ * endDist, PLAYER_CAPSULE_RADIUS);
  const outOwn = resolveCircleAgainstVehicleOBB(pushed.x, pushed.z, PLAYER_CAPSULE_RADIUS + 0.05, ownObb);
  const finalB = spatialGrid.resolveCircle(outOwn.x, outOwn.z, PLAYER_CAPSULE_RADIUS);
  return { x: finalB.x, y: sampleElev(finalB.x, finalB.z), z: finalB.z };
}
