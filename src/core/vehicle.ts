import { clamp } from './math';
import {
  PLAYER_CAPSULE_RADIUS,
  resolveCircleAgainstVehicleOBB,
  type VehicleColliderOBB,
} from './playerController';
import {
  createVehicleDynamicState,
  DRIVING_MODE_PROFILES,
  evaluateEngineTorqueNm,
  formatGearLabel,
  getGearRatio,
  pacejkaNormalized,
  resetVehicleDynamics,
  shiftVehicleGear,
  syncWheelGeometryOffsets,
  VEHICLE_PHYSICS_SPECS,
  type DrivingMode,
  type TransmissionMode,
  type VehicleDynamicState,
} from './vehiclePhysics';
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
    maxForwardSpeed: 56.0, // ~202 km/h
    maxReverseSpeed: 13.5,
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
    maxForwardSpeed: 45.0, // ~162 km/h
    maxReverseSpeed: 11.5,
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
    maxForwardSpeed: 41.5, // ~150 km/h
    maxReverseSpeed: 10.5,
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
    maxForwardSpeed: 44.0, // ~158 km/h
    maxReverseSpeed: 11.0,
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
    maxForwardSpeed: 36.5, // ~131 km/h
    maxReverseSpeed: 9.5,
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
    maxForwardSpeed: 43.0, // ~155 km/h
    maxReverseSpeed: 11.0,
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
    maxForwardSpeed: 35.0, // ~126 km/h
    maxReverseSpeed: 9.0,
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
  /** Signed forward speed in m/s (synced from 240 Hz dynamics vLong). */
  speed: number;
  /** Visual wheel steering angle (-1..1). */
  steerVisual: number;
  /** Cumulative rolling rotation of wheels in radians. */
  wheelSpin: number;
  /** Pitch slope in radians from terrain gradient. */
  pitch: number;
  /** True when brakes/brake lights are active. */
  braking: boolean;
  /** True when reverse gear lights are active. */
  reversing: boolean;
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
  /** High-frequency 240 Hz 4-wheel Pacejka + 6-speed powertrain dynamic state. */
  dyn: VehicleDynamicState;
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
  /** Optional surface grip multiplier (1.0 dry day, 0.92 sunset, 0.84 wet night) */
  surfaceGrip?: number;
}

export interface WorldBounds2D {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface VehicleStepResult {
  collided: boolean;
  speedKph: number;
  impactSpeed: number;
  gear: 'R' | 'N' | '1' | '2' | '3' | '4' | '5' | '6';
  rpm: number;
  rpmNorm: number;
  turboBoost: number;
  driftAngleDeg: number;
  driftScore: number;
  shiftedGear: boolean;
}

export const ENTER_VEHICLE_DISTANCE = 5.5;

// Preallocated bumper corner sign table (zero GC inside 240 Hz inner loop)
const CORNER_SIGNS: readonly [number, number][] = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

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
  drivingMode: DrivingMode = 'street',
  transmissionMode: TransmissionMode = 'auto',
): PlayerVehicleState {
  const dyn = createVehicleDynamicState(archetype, drivingMode, transmissionMode);
  const sinH = Math.sin(heading);
  const cosH = Math.cos(heading);
  const leftX = cosH;
  const leftZ = -sinH;
  for (let i = 0; i < 4; i += 1) {
    const w = dyn.wheels[i]!;
    w.worldX = x + sinH * w.localFwd + leftX * w.localLeft;
    w.worldY = y;
    w.worldZ = z + cosH * w.localFwd + leftZ * w.localLeft;
  }
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
    reversing: false,
    drifting: false,
    suspPitch: 0,
    suspRoll: 0,
    suspHeave: 0,
    signalTimer: 0,
    dyn,
  };
}

export function setVehicleArchetypeStyle(
  v: PlayerVehicleState,
  archetype: VehicleArchetype,
  paintHex: number,
): void {
  v.archetype = archetype;
  v.paintHex = paintHex;
  syncWheelGeometryOffsets(v.dyn, archetype);
}

export function resetPlayerVehicleMotion(v: PlayerVehicleState): void {
  v.speed = 0;
  v.steerVisual = 0;
  v.braking = false;
  v.reversing = false;
  v.drifting = false;
  v.suspPitch = 0;
  v.suspRoll = 0;
  v.suspHeave = 0;
  resetVehicleDynamics(v.dyn, v.archetype);
}

export function manualShiftVehicle(v: PlayerVehicleState, delta: 1 | -1): void {
  shiftVehicleGear(v.dyn, v.archetype, delta);
}

/**
 * Applies a realistic momentum & yaw deflection impulse when colliding with an AI traffic car
 * (replaces old scalar speed damping with proper vector momentum + chassis shake).
 */
export function applyVehicleCollisionImpulse(
  v: PlayerVehicleState,
  pushX: number,
  pushZ: number,
  impactSpeed: number,
  sampleElev: (x: number, z: number) => number,
): void {
  const dx = pushX - v.x;
  const dz = pushZ - v.z;
  v.x = pushX;
  v.z = pushZ;
  v.y = sampleElev(v.x, v.z);

  const dLen = Math.hypot(dx, dz);
  if (dLen > 1e-5) {
    const nx = dx / dLen;
    const nz = dz / dLen;
    const vn = v.dyn.vx * nx + v.dyn.vz * nz;
    if (vn < 0) {
      // Restitution 0.22 + realistic scrub damping
      const impulse = -vn * 1.22;
      v.dyn.vx += nx * impulse;
      v.dyn.vz += nz * impulse;
      // Add glancing yaw twist proportional to impact angle
      const fwdX = Math.sin(v.heading);
      const fwdZ = Math.cos(v.heading);
      const cross = fwdX * nz - fwdZ * nx;
      v.dyn.yawRate += clamp(cross * impactSpeed * 0.14, -2.2, 2.2);
    }
  } else {
    v.dyn.vx *= 0.65;
    v.dyn.vz *= 0.65;
  }

  const fwdX = Math.sin(v.heading);
  const fwdZ = Math.cos(v.heading);
  v.dyn.vLong = v.dyn.vx * fwdX + v.dyn.vz * fwdZ;
  v.speed = v.dyn.vLong;
  v.dyn.impactPulse = Math.max(v.dyn.impactPulse, clamp(impactSpeed / 14, 0.25, 1.0));
}

/**
 * 240 Hz Fixed Sub-Step 4-Wheel Pacejka Combined-Slip Vehicle Physics Engine:
 * - Independent 4-wheel suspension load transfer, spring/damper heave & anti-roll bars
 * - Realistic torque curve, 6-speed gearbox (Auto / Manual), clutch & turbo boost/blow-off
 * - Authentic RWD / FWD / AWD drivetrain dynamics
 * - CarX Street & GTA V tunable Driving Modes: 'street' | 'drift' | 'sim'
 * - 6-point oriented anti-tunneling building collision with momentum-preserving wall-sliding
 */
export function stepPlayerVehicle(
  v: PlayerVehicleState,
  input: DrivingInput,
  dt: number,
  bounds: WorldBounds2D,
  sampleElev: (x: number, z: number) => number,
  spatialGrid: BuildingSpatialGrid,
): VehicleStepResult {
  const safeOuterDt = clamp(dt, 0.001, 0.05);
  const spec = VEHICLE_SPECS[v.archetype];
  const pSpec = VEHICLE_PHYSICS_SPECS[v.archetype];
  const dyn = v.dyn;
  const mode = DRIVING_MODE_PROFILES[dyn.drivingMode];

  const throttleIn = clamp(input.throttle, 0, 1);
  const brakeIn = clamp(input.brake, 0, 1);
  const steerIn = clamp(input.steer, -1, 1);
  const handbrake = Boolean(input.handbrake);
  const surfaceGrip = clamp(input.surfaceGrip ?? 1.0, 0.55, 1.3);

  // Decay one-shot VFX/Audio pulses smoothly across the frame
  dyn.backfirePulse = Math.max(0, dyn.backfirePulse - safeOuterDt * 4.5);
  dyn.blowOffPulse = Math.max(0, dyn.blowOffPulse - safeOuterDt * 4.2);
  dyn.gearShiftPulse = Math.max(0, dyn.gearShiftPulse - safeOuterDt * 6.0);
  dyn.impactPulse = Math.max(0, dyn.impactPulse - safeOuterDt * 5.0);

  // Progressive steering ramp (faster snap-back to center, silky smooth mobile button turn-in)
  const steerRate = Math.abs(steerIn) < Math.abs(v.steerVisual) ? 14.0 : 9.2;
  v.steerVisual += (steerIn - v.steerVisual) * Math.min(1, safeOuterDt * steerRate);

  // Sync velocity vector if caller mutated scalar v.speed externally (e.g. teleport / test setup)
  const initFwdX = Math.sin(v.heading);
  const initFwdZ = Math.cos(v.heading);
  const initLeftX = initFwdZ;
  const initLeftZ = -initFwdX;
  const curVLong = dyn.vx * initFwdX + dyn.vz * initFwdZ;
  if (Math.abs(v.speed - curVLong) > 0.35) {
    const curVLat = dyn.vx * initLeftX + dyn.vz * initLeftZ;
    dyn.vx = initFwdX * v.speed + initLeftX * curVLat;
    dyn.vz = initFwdZ * v.speed + initLeftZ * curVLat;
  }

  // Turbo blow-off valve & overrun exhaust crackle when lifting off high throttle
  if (pSpec.hasTurbo && dyn.prevThrottle > 0.65 && throttleIn < 0.12 && dyn.turboBoost > 0.45) {
    dyn.blowOffPulse = Math.max(dyn.blowOffPulse, clamp(dyn.turboBoost * 0.85, 0.35, 1.0));
    if (dyn.rpm > pSpec.redlineRpm * 0.62) {
      dyn.backfirePulse = Math.max(dyn.backfirePulse, 0.85);
    }
  }
  dyn.prevThrottle = throttleIn;

  // Automatic 6-speed gearbox logic (Manual mode holds chosen gear strictly)
  let shiftedGear = false;
  const prevGear = dyn.gearNum;
  if (dyn.shiftTimer > 0) {
    dyn.shiftTimer = Math.max(0, dyn.shiftTimer - safeOuterDt);
  }

  // Determine effective accelerator vs service brake pedal (in auto mode, brake pedal reverses when stopped)
  let effThrottle = throttleIn;
  let effBrake = brakeIn;

  if (dyn.transmissionMode === 'auto') {
    if (dyn.gearNum < 0) {
      // Currently in Reverse: holding brakeIn drives backwards; pressing throttleIn brakes & shifts to 1st
      if (throttleIn > 0.05) {
        if (dyn.vLong >= -0.6) {
          dyn.gearNum = 1;
          dyn.shiftTimer = pSpec.shiftDurationSec;
          effThrottle = throttleIn;
          effBrake = 0;
        } else {
          effThrottle = 0;
          effBrake = throttleIn;
        }
      } else if (brakeIn > 0.05) {
        effThrottle = brakeIn;
        effBrake = 0;
      } else {
        effThrottle = 0;
        effBrake = 0;
      }
    } else {
      // Forward gears (or Neutral -> automatically engage 1st on throttle)
      if (dyn.gearNum === 0 && throttleIn > 0.05) {
        dyn.gearNum = 1;
      }
      if (brakeIn > 0.05 && throttleIn < 0.05 && dyn.vLong <= 0.35 && !handbrake) {
        dyn.gearNum = -1;
        dyn.shiftTimer = pSpec.shiftDurationSec * 0.8;
        effThrottle = brakeIn;
        effBrake = 0;
      } else if (dyn.shiftTimer <= 0 && dyn.gearNum >= 1) {
        // Hold gear slightly longer during active drift so tires stay in peak powerband!
        const driftHoldBonus = dyn.driftAngleDeg > 12 ? 320 : 0;
        const upThreshold = Math.min(pSpec.redlineRpm - 180, pSpec.shiftUpRpm + driftHoldBonus);
        if (
          dyn.gearNum < pSpec.gearRatios.length &&
          dyn.rpm >= upThreshold &&
          throttleIn > 0.2 &&
          dyn.maxSkidIntensity < 0.85
        ) {
          dyn.gearNum += 1;
          dyn.shiftTimer = pSpec.shiftDurationSec;
          if (pSpec.hasTurbo && dyn.turboBoost > 0.35) {
            dyn.blowOffPulse = Math.max(dyn.blowOffPulse, clamp(dyn.turboBoost * 0.75, 0.3, 0.95));
          }
        } else if (
          dyn.gearNum > 1 &&
          dyn.rpm <= pSpec.shiftDownRpm &&
          (dyn.vLong < 2.0 || brakeIn > 0.1 || throttleIn > 0.65)
        ) {
          dyn.gearNum -= 1;
          dyn.shiftTimer = pSpec.shiftDurationSec * 0.85;
          if (dyn.vLong > 9.0) {
            dyn.backfirePulse = Math.max(dyn.backfirePulse, 0.9);
          }
        }
      }
    }
  } else {
    // Manual transmission: in Reverse gear, throttle accelerates backwards
    if (dyn.gearNum === 0) {
      effThrottle = 0;
    }
  }

  if (dyn.gearNum !== prevGear) {
    shiftedGear = true;
    dyn.gearShiftPulse = 1.0;
  }

  // Turbo spool dynamics (0..1.35 bar)
  const targetBoost = pSpec.hasTurbo && effThrottle > 0.25 && dyn.shiftTimer <= 0
    ? clamp(((dyn.rpm - pSpec.idleRpm) / (pSpec.redlineRpm - pSpec.idleRpm)) * 1.45 * effThrottle, 0, 1.35)
    : 0;
  const spoolRate = targetBoost > dyn.turboBoost ? 3.2 : 5.5;
  dyn.turboBoost += (targetBoost - dyn.turboBoost) * Math.min(1, safeOuterDt * spoolRate);

  // Measure terrain pitch & cross-slope along chassis axes so hills don't cause phantom torque-steer
  const terrainFrontY = sampleElev(v.x + initFwdX * 1.7, v.z + initFwdZ * 1.7);
  const terrainRearY = sampleElev(v.x - initFwdX * 1.7, v.z - initFwdZ * 1.7);
  const terrainLeftY = sampleElev(v.x + initLeftX * 0.95, v.z + initLeftZ * 0.95);
  const terrainRightY = sampleElev(v.x - initLeftX * 0.95, v.z - initLeftZ * 0.95);
  const slopeSin = clamp((terrainFrontY - terrainRearY) / 3.4, -0.35, 0.35);
  const rollSlopeSin = clamp((terrainLeftY - terrainRightY) / 1.9, -0.3, 0.3);
  v.pitch = Math.asin(slopeSin);

  // 240 Hz Fixed Sub-Step Integration (4 substeps per 60 Hz frame)
  const subSteps = clamp(Math.round(safeOuterDt * 240), 2, 8);
  const subDt = safeOuterDt / subSteps;

  const wheelbase = pSpec.frontAxleZ + pSpec.rearAxleZ;
  const totalWeightN = pSpec.massKg * 9.81;
  const staticFrontWheelN = totalWeightN * pSpec.frontWeightBias * 0.5;
  const staticRearWheelN = totalWeightN * (1 - pSpec.frontWeightBias) * 0.5;
  const cornerHalfW = spec.width * 0.44;
  const cornerHalfL = spec.length * 0.45;
  const cornerRadius = 0.28;

  let collided = false;
  let maxImpactSpeed = 0;
  let frameMaxSkid = 0;
  const prevY = v.y;

  for (let step = 0; step < subSteps; step += 1) {
    const fwdX = Math.sin(v.heading);
    const fwdZ = Math.cos(v.heading);
    const leftX = fwdZ;
    const leftZ = -fwdX;

    const vLong = dyn.vx * fwdX + dyn.vz * fwdZ;
    const vLat = dyn.vx * leftX + dyn.vz * leftZ;
    const absSpeed = Math.hypot(vLong, vLat);
    dyn.vLong = vLong;
    dyn.vLat = vLat;

    // 1. Speed-sensitive steering angle + CarX Street intelligent counter-steer assist
    const highSpeedTaper = 1.0 - clamp((absSpeed - 12.0) / 48.0, 0, dyn.drivingMode === 'drift' ? 0.36 : 0.62);
    const maxLock = pSpec.maxSteerRad * mode.maxSteerMult * highSpeedTaper;
    let steerAngle = v.steerVisual * maxLock;

    if (mode.counterSteerAssist > 0 && vLong > 3.2) {
      const bodySlip = Math.atan2(vLat, Math.max(vLong, 2.2));
      if (Math.abs(bodySlip) > 0.08) {
        // Counter-steer naturally aligns front tires toward velocity vector during drifts!
        const csContribution = clamp(bodySlip * mode.counterSteerAssist, -0.58, 0.58);
        steerAngle = clamp(steerAngle + csContribution, -pSpec.maxSteerRad * mode.maxSteerMult, pSpec.maxSteerRad * mode.maxSteerMult);
      }
    }

    // 2. Engine RPM & drivetrain torque at driven wheels
    const gearRatio = getGearRatio(pSpec, dyn.gearNum);
    const totalRatio = gearRatio * pSpec.finalDrive;
    const absTotalRatio = Math.abs(totalRatio);

    // Estimate driven axle angular speed from wheels
    const drivenOmega =
      pSpec.drivetrain === 'FWD'
        ? (dyn.wheels[0].omega + dyn.wheels[1].omega) * 0.5
        : pSpec.drivetrain === 'AWD'
          ? (dyn.wheels[0].omega + dyn.wheels[1].omega + dyn.wheels[2].omega + dyn.wheels[3].omega) * 0.25
          : (dyn.wheels[2].omega + dyn.wheels[3].omega) * 0.5;

    const wheelCoupledRpm = Math.abs(drivenOmega) * absTotalRatio * (60 / (Math.PI * 2));
    const freeRevTarget = pSpec.idleRpm + effThrottle * (pSpec.redlineRpm - pSpec.idleRpm) * 0.96;

    let targetRpm: number;
    if (dyn.gearNum === 0 || dyn.shiftTimer > 0) {
      // Clutch disengaged during shift or Neutral
      targetRpm = Math.max(pSpec.idleRpm, dyn.rpm * 0.985 + freeRevTarget * 0.015);
    } else if (absSpeed < 3.5 && effThrottle > 0.1) {
      // Launch clutch slip blend so standing starts feel punchy and rev smoothly!
      const slipBlend = clamp(absSpeed / 3.5, 0, 1);
      const launchRpm = pSpec.idleRpm + effThrottle * 3100;
      targetRpm = launchRpm * (1 - slipBlend) + Math.max(launchRpm * 0.72, wheelCoupledRpm) * slipBlend;
    } else {
      targetRpm = Math.max(pSpec.idleRpm, wheelCoupledRpm);
    }
    dyn.rpm += (clamp(targetRpm, pSpec.idleRpm * 0.92, pSpec.redlineRpm * 1.02) - dyn.rpm) * Math.min(1, subDt * 24);

    // Rev-limiter crisp bounce at redline
    const revLimiterCut = dyn.rpm >= pSpec.redlineRpm * 0.995 ? 0 : 1;
    const shiftCut = dyn.shiftTimer > 0 ? 0.08 : 1.0;
    const turboTorqueMult = 1.0 + dyn.turboBoost * 0.16;

    // Traction Control (TCS) gently trims excess torque in 'street' mode; completely off in 'drift' & 'sim'
    const tcsFactor =
      mode.tcsStrength > 0 && !handbrake && dyn.maxSkidIntensity > 0.35
        ? clamp(1.0 - (dyn.maxSkidIntensity - 0.35) * mode.tcsStrength * 0.9, 0.45, 1.0)
        : 1.0;

    // Soft top-speed electronic governor smoothly matching each car's topSpeedMps
    const speedCapFactor =
      dyn.gearNum > 0
        ? clamp(1.0 - (vLong - pSpec.topSpeedMps * 0.92) / (pSpec.topSpeedMps * 0.12), 0, 1)
        : clamp(1.0 - (-vLong - spec.maxReverseSpeed * 0.9) / (spec.maxReverseSpeed * 0.15), 0, 1);

    const engineTorqueNm =
      evaluateEngineTorqueNm(pSpec, dyn.rpm) *
      effThrottle *
      mode.torqueMult *
      turboTorqueMult *
      revLimiterCut *
      shiftCut *
      tcsFactor *
      speedCapFactor;

    const totalDriveTorqueNm = engineTorqueNm * totalRatio * 0.92;

    // 3. Dynamic 4-corner normal loads (weight transfer + aero downforce)
    const aeroDownforceN = pSpec.downforceCoeff * vLong * vLong;
    const longTransferN = clamp(
      ((pSpec.massKg * dyn.longAccel * pSpec.comHeight) / wheelbase) * 0.5,
      -staticFrontWheelN * 0.65,
      staticFrontWheelN * 0.65,
    );
    const latTransferN = clamp(
      (pSpec.massKg * dyn.latAccel * pSpec.comHeight) / (2 * pSpec.halfTrack) * 0.5,
      -totalWeightN * 0.22,
      totalWeightN * 0.22,
    );

    const baseCenterElev = sampleElev(v.x, v.z);

    let sumFxBody = 0;
    let sumFyBody = 0;
    let sumYawTorque = 0;
    let stepMaxSkid = 0;

    for (let i = 0; i < 4; i += 1) {
      const w = dyn.wheels[i]!;
      const isLeft = w.localLeft > 0;
      const isFront = w.isFront;

      // Exact world wheel contact coordinates
      const wx = v.x + fwdX * w.localFwd + leftX * w.localLeft;
      const wz = v.z + fwdZ * w.localFwd + leftZ * w.localLeft;
      const groundY = sampleElev(wx, wz);
      w.worldX = wx;
      w.worldY = groundY;
      w.worldZ = wz;

      // Independent per-wheel normal load & suspension compression
      let loadN = isFront
        ? staticFrontWheelN - longTransferN + aeroDownforceN * 0.2
        : staticRearWheelN + longTransferN + aeroDownforceN * 0.3;
      // Outer wheels gain load during cornering (+latAccel = turning left -> right wheels (-left) load up)
      loadN += isLeft ? -latTransferN : latTransferN;

      // Terrain bump delta relative to road plane adds real per-corner spring compression
      const expectedPlaneY = baseCenterElev + slopeSin * w.localFwd + rollSlopeSin * w.localLeft;
      const bumpDelta = clamp(groundY - expectedPlaneY, -pSpec.suspMaxTravel, pSpec.suspMaxTravel);
      loadN += bumpDelta * pSpec.suspStiffness * 0.14;
      loadN = clamp(loadN, totalWeightN * 0.04, totalWeightN * 0.65);
      w.normalLoad = loadN;

      const targetComp = clamp(
        loadN / Math.max(1, pSpec.suspStiffness * pSpec.suspRestLength) +
          bumpDelta / Math.max(0.05, pSpec.suspRestLength),
        0.05,
        0.96,
      );
      w.compression += (targetComp - w.compression) * Math.min(1, subDt * 26);
      w.hubOffsetY = clamp(
        (w.compression - 0.45) * pSpec.suspMaxTravel,
        -pSpec.suspMaxTravel * 0.85,
        pSpec.suspMaxTravel * 0.85,
      );

      // Ackerman geometry: inner wheel turns slightly sharper than outer wheel!
      let wheelSteer = 0;
      if (isFront) {
        const ackermanFactor =
          steerAngle > 0 ? (isLeft ? 1.07 : 0.93) : steerAngle < 0 ? (isLeft ? 0.93 : 1.07) : 1.0;
        wheelSteer = steerAngle * ackermanFactor;
      }
      w.steerAngle = wheelSteer;

      // Wheel ground-patch velocity in body frame
      const wheelVLong = vLong - dyn.yawRate * w.localLeft;
      const wheelVLat = vLat + dyn.yawRate * w.localFwd;

      const cosD = Math.cos(wheelSteer);
      const sinD = Math.sin(wheelSteer);
      const uLong = wheelVLong * cosD + wheelVLat * sinD;
      const uLat = -wheelVLong * sinD + wheelVLat * cosD;

      // Drive torque share for this corner
      let driveShare = 0;
      if (pSpec.drivetrain === 'RWD' && !isFront) driveShare = 0.5;
      else if (pSpec.drivetrain === 'FWD' && isFront) driveShare = 0.5;
      else if (pSpec.drivetrain === 'AWD') driveShare = isFront ? 0.19 : 0.31;

      // Service brake + Handbrake torque
      const brakeBias = isFront ? pSpec.brakeFrontBias * 0.5 : (1 - pSpec.brakeFrontBias) * 0.5;
      let wheelBrakeForce = (effBrake * pSpec.maxBrakeTorqueNm * brakeBias) / pSpec.wheelRadius;
      const rearLockedByHandbrake = handbrake && !isFront;

      // Tire grip multiplier (front/rear balance + surface wetness + drift release)
      let gripMu = pSpec.baseGrip * surfaceGrip * (isFront ? mode.gripFrontMult : mode.gripRearMult);
      if (!isFront && (handbrake || (effThrottle > 0.55 && Math.abs(vLat) > 1.8))) {
        gripMu *= 1.0 - mode.driftRearRelease * (handbrake ? 1.0 : 0.48);
      }
      // Subtle tire load sensitivity (real tires lose a bit of mu per Newton as load spikes)
      const loadSens = clamp(1.06 - (loadN / (totalWeightN * 0.45)) * 0.12, 0.85, 1.08);
      const maxTireForce = loadN * gripMu * loadSens;

      // Desired longitudinal force from engine / brakes
      const driveForce = (totalDriveTorqueNm * driveShare) / pSpec.wheelRadius;
      let desiredLongForce = driveForce;

      if (rearLockedByHandbrake) {
        // Locked rear tires generate strong drag opposite motion AND collapse lateral grip
        desiredLongForce = -Math.sign(uLong) * maxTireForce * 0.88;
      } else if (effBrake > 0.01) {
        if (Math.abs(uLong) > 0.15) {
          // ABS prevents full lockup in street/drift modes
          const absCap = mode.absStrength > 0 ? maxTireForce * (0.94 + (1 - mode.absStrength) * 0.25) : wheelBrakeForce;
          wheelBrakeForce = Math.min(wheelBrakeForce, absCap);
          desiredLongForce -= Math.sign(uLong) * wheelBrakeForce;
        } else {
          desiredLongForce = -uLong * pSpec.massKg * 4.5;
        }
      } else if (Math.abs(effThrottle) < 0.02 && Math.abs(uLong) > 0.1) {
        // Natural engine braking + rolling resistance
        desiredLongForce -= Math.sign(uLong) * (loadN * pSpec.rollingResistance + (dyn.gearNum !== 0 ? 110 : 15));
      }

      // Compute normalized longitudinal & lateral slip ratios for Combined-Slip Pacejka circle
      const slipRatio = rearLockedByHandbrake
        ? -0.92 * Math.sign(uLong || 1)
        : clamp(desiredLongForce / Math.max(400, maxTireForce), -1.35, 1.35) * pSpec.peakSlipRatio * 1.02;

      // Smooth low-speed regularization prevents jitter while stationary
      const speedReg = Math.max(Math.abs(uLong), 1.4);
      const slipAngle = Math.atan2(uLat, speedReg);

      w.slipRatio = slipRatio;
      w.slipAngle = slipAngle;

      const rhoX = slipRatio / pSpec.peakSlipRatio;
      const rhoY = Math.tan(clamp(slipAngle, -1.25, 1.25)) / pSpec.peakSlipAngleRad;
      const rho = Math.hypot(rhoX, rhoY);

      let fxTire = 0;
      let fyTire = 0;

      if (rho > 1e-5) {
        const muCurve = pacejkaNormalized(rho, pSpec.pacejkaB, pSpec.pacejkaC);
        const totalForce = muCurve * maxTireForce;
        fxTire = (rhoX / rho) * totalForce;
        fyTire = -(rhoY / rho) * totalForce;
      }

      // If not exceeding friction circle longitudinally, apply exact requested drive/brake force for crisp pedal response
      if (Math.abs(desiredLongForce) < Math.abs(fxTire) && !rearLockedByHandbrake) {
        fxTire = desiredLongForce;
      }

      // Fade lateral tire forces smoothly near zero speed to prevent numeric crawling on slopes
      const lowSpeedFade = clamp(absSpeed / 1.1, 0, 1);
      fyTire *= lowSpeedFade;

      // Rotate tire forces back to chassis body frame
      const fxBody = fxTire * cosD - fyTire * sinD;
      const fyBody = fxTire * sinD + fyTire * cosD;

      sumFxBody += fxBody;
      sumFyBody += fyBody;
      // Yaw moment: +left force at front (+localFwd) steers left (+); +fwd force at left (+localLeft) steers right (-)
      sumYawTorque += w.localFwd * fyBody - w.localLeft * fxBody;

      // Wheel angular velocity (shows realistic burnout wheelspin on RWD/AWD launches & rear lock on handbrake!)
      const freeOmega = uLong / pSpec.wheelRadius;
      if (rearLockedByHandbrake) {
        w.omega *= Math.exp(-26 * subDt);
      } else {
        const spinExcess =
          driveShare > 0 && Math.abs(driveForce) > maxTireForce * 0.85
            ? Math.sign(driveForce) * clamp((Math.abs(driveForce) / Math.max(400, maxTireForce) - 0.85) * 28, 0, 34)
            : 0;
        const targetOmega = freeOmega + spinExcess;
        w.omega += (targetOmega - w.omega) * Math.min(1, subDt * 28);
      }
      w.spin += w.omega * subDt;

      // Skid intensity (0..1) drives asphalt skidmarks, volumetric smoke & tire screech!
      const excessSlip = Math.max(0, rho - 0.86);
      const speedGate = clamp((absSpeed - 1.8) / 4.0, 0, 1);
      const burnoutGate = Math.abs(w.omega * pSpec.wheelRadius - uLong) > 3.2 ? 0.85 : 0;
      const rawSkid = clamp(Math.max(excessSlip * 0.95 * speedGate, burnoutGate), 0, 1);
      w.skidIntensity += (rawSkid - w.skidIntensity) * Math.min(1, subDt * 18);
      if (w.skidIntensity > stepMaxSkid) stepMaxSkid = w.skidIntensity;
    }

    // 4. Aerodynamic drag + realistic slope gravity component
    const aeroDragN = 0.5 * 1.225 * pSpec.dragCoeff * 2.15 * vLong * Math.abs(vLong);
    const slopeGravityN = -pSpec.massKg * 9.81 * slopeSin * 0.62;
    sumFxBody += -aeroDragN + slopeGravityN;

    // 5. CarX Street / GTA Yaw Stabilizer (keeps wild drifts heroic & recoverable in Street/Drift; 0 in Sim!)
    if (mode.yawStabilizer > 0 && vLong > 2.8) {
      const bodySlip = Math.atan2(vLat, Math.max(vLong, 2.0));
      const overSlip = Math.max(0, Math.abs(bodySlip) - mode.maxAssistedSlipRad * 0.65);
      // Damp excessive angular velocity + pull nose smoothly back if angle exceeds max assisted drift angle
      const yawDampTorque = -dyn.yawRate * pSpec.yawInertia * mode.yawStabilizer * (0.45 + overSlip * 2.2);
      const angleRestoreTorque =
        overSlip > 0
          ? Math.sign(bodySlip) * overSlip * pSpec.yawInertia * mode.yawStabilizer * 3.8
          : 0;
      sumYawTorque += yawDampTorque + angleRestoreTorque;
    }

    // 6. Integrate linear & angular accelerations
    const aLong = sumFxBody / pSpec.massKg;
    const aLat = sumFyBody / pSpec.massKg;
    const yawAccel = sumYawTorque / pSpec.yawInertia;

    dyn.longAccel += (clamp(aLong, -28, 22) - dyn.longAccel) * Math.min(1, subDt * 14);
    dyn.latAccel += (clamp(aLat, -24, 24) - dyn.latAccel) * Math.min(1, subDt * 14);

    // Transform body-frame acceleration into world-frame velocity
    const axWorld = fwdX * aLong + leftX * aLat;
    const azWorld = fwdZ * aLong + leftZ * aLat;
    dyn.vx += axWorld * subDt;
    dyn.vz += azWorld * subDt;
    dyn.yawRate = clamp(dyn.yawRate + yawAccel * subDt, -3.6, 3.6);

    // Clean standstill hold (prevents creep when parked on Istanbul hills without throttle)
    const newSpeed = Math.hypot(dyn.vx, dyn.vz);
    if (effThrottle < 0.02 && (effBrake > 0.05 || handbrake || newSpeed < 0.18)) {
      if (newSpeed < 0.35) {
        dyn.vx *= Math.exp(-18 * subDt);
        dyn.vz *= Math.exp(-18 * subDt);
        dyn.yawRate *= Math.exp(-22 * subDt);
        if (newSpeed < 0.06) {
          dyn.vx = 0;
          dyn.vz = 0;
          dyn.yawRate = 0;
        }
      }
    }

    // Integrate heading & world position
    v.heading += dyn.yawRate * subDt;
    let nextX = clamp(v.x + dyn.vx * subDt, bounds.minX + 10, bounds.maxX - 10);
    let nextZ = clamp(v.z + dyn.vz * subDt, bounds.minZ + 10, bounds.maxZ - 10);

    // 7. 6-point oriented building polygon collision (front axle + rear axle + 4 bumper corners)
    const cFwdX = Math.sin(v.heading);
    const cFwdZ = Math.cos(v.heading);
    const cRightX = -cFwdZ;
    const cRightZ = cFwdX;

    let stepCollided = false;
    let accNx = 0;
    let accNz = 0;
    let torqueContactSign = 0;

    const frontOrigX = nextX + cFwdX * spec.axleOffset;
    const frontOrigZ = nextZ + cFwdZ * spec.axleOffset;
    const frontRes = spatialGrid.resolveCircle(frontOrigX, frontOrigZ, spec.collisionRadius);
    if (frontRes.collided) {
      nextX += frontRes.x - frontOrigX;
      nextZ += frontRes.z - frontOrigZ;
      accNx += frontRes.normalX;
      accNz += frontRes.normalZ;
      torqueContactSign += 1;
      stepCollided = true;
    }

    const rearOrigX = nextX - cFwdX * spec.axleOffset;
    const rearOrigZ = nextZ - cFwdZ * spec.axleOffset;
    const rearRes = spatialGrid.resolveCircle(rearOrigX, rearOrigZ, spec.collisionRadius);
    if (rearRes.collided) {
      nextX += rearRes.x - rearOrigX;
      nextZ += rearRes.z - rearOrigZ;
      accNx += rearRes.normalX;
      accNz += rearRes.normalZ;
      torqueContactSign -= 1;
      stepCollided = true;
    }

    for (let c = 0; c < 4; c += 1) {
      const [sl, sw] = CORNER_SIGNS[c]!;
      const cl = sl * cornerHalfL;
      const cw = sw * cornerHalfW;
      const cx = nextX + cFwdX * cl + cRightX * cw;
      const cz = nextZ + cFwdZ * cl + cRightZ * cw;
      const cRes = spatialGrid.resolveCircle(cx, cz, cornerRadius);
      if (cRes.collided) {
        nextX += cRes.x - cx;
        nextZ += cRes.z - cz;
        accNx += cRes.normalX * 0.65;
        accNz += cRes.normalZ * 0.65;
        torqueContactSign += sl * 0.5;
        stepCollided = true;
      }
    }

    if (stepCollided) {
      collided = true;
      const nLen = Math.hypot(accNx, accNz);
      if (nLen > 1e-5) {
        const nx = accNx / nLen;
        const nz = accNz / nLen;
        const vn = dyn.vx * nx + dyn.vz * nz;
        if (vn < 0) {
          const impact = -vn;
          if (impact > maxImpactSpeed) maxImpactSpeed = impact;
          // Preserve smooth tangential wall-slide with mild restitution & scrape friction
          const restitution = impact > 4.5 ? 0.18 : 0.05;
          dyn.vx -= (1 + restitution) * vn * nx;
          dyn.vz -= (1 + restitution) * vn * nz;
          const impactCos = Math.abs(cFwdX * nx + cFwdZ * nz);
          const scrapeDamp = impactCos > 0.72 ? 12.0 : 0.45;
          const decay = Math.exp(-scrapeDamp * subDt);
          dyn.vx *= decay;
          dyn.vz *= decay;
          // Realistic glancing deflection: aligns nose cleanly parallel to wall instead of digging into it!
          // left = (cFwdZ, -cFwdX), so F_left = nx * cFwdZ - nz * cFwdX
          const normalLeft = nx * cFwdZ - nz * cFwdX;
          dyn.yawRate += clamp(normalLeft * torqueContactSign * impact * 0.16, -2.0, 2.0);
          dyn.yawRate *= 0.84;
        }
      } else {
        dyn.vx *= 0.78;
        dyn.vz *= 0.78;
      }
    }

    v.x = nextX;
    v.z = nextZ;
    if (stepMaxSkid > frameMaxSkid) frameMaxSkid = stepMaxSkid;
  }

  // Final post-substep state sync & elevation grounding
  const finalFwdX = Math.sin(v.heading);
  const finalFwdZ = Math.cos(v.heading);
  const finalLeftX = finalFwdZ;
  const finalLeftZ = -finalFwdX;
  dyn.vLong = dyn.vx * finalFwdX + dyn.vz * finalFwdZ;
  dyn.vLat = dyn.vx * finalLeftX + dyn.vz * finalLeftZ;
  dyn.maxSkidIntensity = frameMaxSkid;

  const nextElev = sampleElev(v.x, v.z);
  v.y = nextElev;
  v.speed = dyn.vLong;
  v.wheelSpin = (dyn.wheels[0].spin + dyn.wheels[2].spin) * 0.5;
  v.braking = (effBrake > 0.04 && dyn.vLong > 0.3) || handbrake;
  v.reversing = dyn.gearNum < 0;

  // Drift angle & live CarX-style Drift Score telemetry
  const totalSpeed = Math.hypot(dyn.vx, dyn.vz);
  const rawDriftDeg =
    totalSpeed > 4.2 && dyn.vLong > 2.2
      ? Math.abs((Math.atan2(dyn.vLat, dyn.vLong) * 180) / Math.PI)
      : 0;
  dyn.driftAngleDeg += (rawDriftDeg - dyn.driftAngleDeg) * Math.min(1, safeOuterDt * 12);
  const activeDrift =
    (dyn.driftAngleDeg >= 10 && totalSpeed > 5.0) ||
    (handbrake && totalSpeed > 4.2 && Math.abs(v.steerVisual) > 0.15);
  v.drifting = activeDrift;

  if (activeDrift && !collided) {
    dyn.driftComboTimer = 1.65;
    dyn.driftScore += Math.round(dyn.driftAngleDeg * totalSpeed * safeOuterDt * 2.2);
    if (dyn.driftScore > dyn.bestDriftScore) {
      dyn.bestDriftScore = dyn.driftScore;
    }
  } else if (collided && maxImpactSpeed > 5.5) {
    // Hard wall hit breaks active drift combo
    dyn.driftScore = 0;
    dyn.driftComboTimer = 0;
  } else if (dyn.driftComboTimer > 0) {
    dyn.driftComboTimer = Math.max(0, dyn.driftComboTimer - safeOuterDt);
    if (dyn.driftComboTimer <= 0) {
      dyn.driftScore = 0;
    }
  }

  if (maxImpactSpeed > 3.0) {
    dyn.impactPulse = Math.max(dyn.impactPulse, clamp(maxImpactSpeed / 14, 0.25, 1.0));
  }

  // Second-order spring-damper chassis suspension kinematics (accel squat, brake dive, corner roll, bump heave)
  const targetSuspPitch = clamp(
    (v.braking && dyn.vLong > 0.8 ? 0.052 : 0) - dyn.longAccel * 0.0036,
    -0.055,
    0.068,
  );
  // Real body roll driven by actual lateral acceleration (lean outward away from turn!)
  const rollScale = pSpec.comHeight / 0.52;
  const targetSuspRoll = clamp(-dyn.latAccel * 0.0068 * rollScale, -0.11, 0.11);
  const bumpVel = clamp((nextElev - prevY) / safeOuterDt, -5, 5);
  const targetSuspHeave = clamp(
    -Math.abs(bumpVel) * 0.015 + (maxImpactSpeed > 3 ? -0.025 : 0),
    -0.06,
    0.04,
  );

  const springK = 140;
  const springD = 17;
  dyn.suspPitchVel += ((targetSuspPitch - v.suspPitch) * springK - dyn.suspPitchVel * springD) * safeOuterDt;
  v.suspPitch = clamp(v.suspPitch + dyn.suspPitchVel * safeOuterDt, -0.08, 0.09);

  dyn.suspRollVel += ((targetSuspRoll - v.suspRoll) * springK - dyn.suspRollVel * springD) * safeOuterDt;
  v.suspRoll = clamp(v.suspRoll + dyn.suspRollVel * safeOuterDt, -0.14, 0.14);

  dyn.suspHeaveVel += ((targetSuspHeave - v.suspHeave) * 180 - dyn.suspHeaveVel * 20) * safeOuterDt;
  v.suspHeave = clamp(v.suspHeave + dyn.suspHeaveVel * safeOuterDt, -0.08, 0.06);

  v.signalTimer = (v.signalTimer + safeOuterDt) % 1000;

  const gearLabel = formatGearLabel(dyn.gearNum);
  const rpmNorm = clamp(
    (dyn.rpm - pSpec.idleRpm) / Math.max(1, pSpec.redlineRpm - pSpec.idleRpm),
    0,
    1,
  );

  return {
    collided,
    speedKph: Math.round(totalSpeed * 3.6),
    impactSpeed: maxImpactSpeed,
    gear: gearLabel,
    rpm: Math.round(dyn.rpm),
    rpmNorm,
    turboBoost: dyn.turboBoost,
    driftAngleDeg: Math.round(dyn.driftAngleDeg),
    driftScore: dyn.driftScore,
    shiftedGear,
  };
}

/**
 * Computes a guaranteed collision-free exit spot beside the driver's door,
 * checking buildings, nearby traffic OBBs, and the vehicle's own OBB
 * so exiting NEVER clips the player into walls or cars.
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

  const pushed = spatialGrid.resolveCircle(
    v.x - fwdX * endDist,
    v.z - fwdZ * endDist,
    PLAYER_CAPSULE_RADIUS,
  );
  const outOwn = resolveCircleAgainstVehicleOBB(
    pushed.x,
    pushed.z,
    PLAYER_CAPSULE_RADIUS + 0.05,
    ownObb,
  );
  const fx = bounds ? clamp(outOwn.x, bounds.minX + 8, bounds.maxX - 8) : outOwn.x;
  const fz = bounds ? clamp(outOwn.z, bounds.minZ + 8, bounds.maxZ - 8) : outOwn.z;
  return { x: fx, y: sampleElev(fx, fz), z: fz };
}
