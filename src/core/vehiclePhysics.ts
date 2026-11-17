import { clamp } from './math';
import type { VehicleArchetype } from './vehicle';

export type DrivingMode = 'street' | 'drift' | 'sim';
export type TransmissionMode = 'auto' | 'manual';
export type DrivetrainType = 'RWD' | 'FWD' | 'AWD';
export type SteeringControlMode = 'buttons' | 'slider' | 'gyro';
export type GearDisplay = 'R' | 'N' | '1' | '2' | '3' | '4' | '5' | '6';

export const DRIVING_MODE_ORDER: readonly DrivingMode[] = ['street', 'drift', 'sim'];
export const STEERING_CONTROL_ORDER: readonly SteeringControlMode[] = ['buttons', 'slider', 'gyro'];

export interface WheelTelemetry {
  /** Wheel index: 0=FL, 1=FR, 2=RL, 3=RR */
  index: number;
  isFront: boolean;
  /** Local chassis offsets (+left, +forward) */
  localLeft: number;
  localFwd: number;
  /** World-space tire ground contact position (updated every step, zero GC) */
  worldX: number;
  worldY: number;
  worldZ: number;
  /** Normalized suspension compression (0 = fully extended, 1 = bottomed out) */
  compression: number;
  /** Vertical hub offset relative to rest height (m) */
  hubOffsetY: number;
  /** Vertical normal force on this tire (Newtons) */
  normalLoad: number;
  /** Longitudinal slip ratio (-1..1+) */
  slipRatio: number;
  /** Lateral slip angle (radians) */
  slipAngle: number;
  /** Combined skid intensity (0..1) driving skidmarks, smoke & tire screech */
  skidIntensity: number;
  /** Visual wheel steering angle (radians) */
  steerAngle: number;
  /** Cumulative wheel rotation angle (radians) */
  spin: number;
  /** Wheel angular velocity (rad/s) */
  omega: number;
  /** Ground contact flag */
  grounded: boolean;
}

export interface VehiclePhysicsSpec {
  archetype: VehicleArchetype;
  drivetrain: DrivetrainType;
  massKg: number;
  yawInertia: number;
  comHeight: number;
  frontWeightBias: number;
  halfTrack: number;
  frontAxleZ: number;
  rearAxleZ: number;
  wheelRadius: number;
  /** Suspension parameters per corner */
  suspRestLength: number;
  suspMaxTravel: number;
  suspStiffness: number;
  suspDamping: number;
  antiRollStiffness: number;
  /** Pacejka tire parameters */
  baseGrip: number;
  peakSlipAngleRad: number;
  peakSlipRatio: number;
  pacejkaB: number;
  pacejkaC: number;
  /** Powertrain */
  idleRpm: number;
  redlineRpm: number;
  shiftUpRpm: number;
  shiftDownRpm: number;
  peakTorqueNm: number;
  /** Normalized torque curve points [rpmFraction, torqueFraction] */
  torqueCurve: readonly [number, number][];
  gearRatios: readonly number[]; // Index 0 = 1st gear .. Index 5 = 6th gear
  reverseRatio: number;
  finalDrive: number;
  shiftDurationSec: number;
  hasTurbo: boolean;
  /** Braking & steering */
  maxBrakeTorqueNm: number;
  brakeFrontBias: number;
  maxSteerRad: number;
  dragCoeff: number;
  downforceCoeff: number;
  rollingResistance: number;
  /** Max practical speed cap (m/s) for map scale safety */
  topSpeedMps: number;
}

export const VEHICLE_PHYSICS_SPECS: Record<VehicleArchetype, VehiclePhysicsSpec> = {
  sports: {
    archetype: 'sports',
    drivetrain: 'RWD',
    massKg: 1340,
    yawInertia: 2150,
    comHeight: 0.46,
    frontWeightBias: 0.51,
    halfTrack: 0.92,
    frontAxleZ: 1.34,
    rearAxleZ: 1.32,
    wheelRadius: 0.35,
    suspRestLength: 0.34,
    suspMaxTravel: 0.16,
    suspStiffness: 36000,
    suspDamping: 4200,
    antiRollStiffness: 9500,
    baseGrip: 1.54,
    peakSlipAngleRad: 0.22,
    peakSlipRatio: 0.16,
    pacejkaB: 1.82,
    pacejkaC: 1.48,
    idleRpm: 950,
    redlineRpm: 8200,
    shiftUpRpm: 7650,
    shiftDownRpm: 3400,
    peakTorqueNm: 640,
    torqueCurve: [
      [0.0, 0.72],
      [0.25, 0.88],
      [0.5, 0.98],
      [0.72, 1.0],
      [0.88, 0.92],
      [1.0, 0.76],
    ],
    gearRatios: [3.32, 2.18, 1.56, 1.19, 0.94, 0.76],
    reverseRatio: -3.15,
    finalDrive: 3.72,
    shiftDurationSec: 0.11,
    hasTurbo: true,
    maxBrakeTorqueNm: 8600,
    brakeFrontBias: 0.64,
    maxSteerRad: 0.66, // ~38 deg in street, expanded to 48 deg in drift!
    dragCoeff: 0.31,
    downforceCoeff: 0.45,
    rollingResistance: 0.015,
    topSpeedMps: 56.0, // ~202 km/h
  },
  sedan: {
    archetype: 'sedan',
    drivetrain: 'RWD',
    massKg: 1520,
    yawInertia: 2550,
    comHeight: 0.54,
    frontWeightBias: 0.53,
    halfTrack: 0.89,
    frontAxleZ: 1.32,
    rearAxleZ: 1.3,
    wheelRadius: 0.35,
    suspRestLength: 0.36,
    suspMaxTravel: 0.18,
    suspStiffness: 30000,
    suspDamping: 3800,
    antiRollStiffness: 7200,
    baseGrip: 1.44,
    peakSlipAngleRad: 0.21,
    peakSlipRatio: 0.15,
    pacejkaB: 1.78,
    pacejkaC: 1.45,
    idleRpm: 850,
    redlineRpm: 7100,
    shiftUpRpm: 6500,
    shiftDownRpm: 2800,
    peakTorqueNm: 485,
    torqueCurve: [
      [0.0, 0.74],
      [0.3, 0.9],
      [0.58, 1.0],
      [0.82, 0.92],
      [1.0, 0.72],
    ],
    gearRatios: [3.48, 2.15, 1.48, 1.12, 0.88, 0.72],
    reverseRatio: -3.2,
    finalDrive: 3.55,
    shiftDurationSec: 0.14,
    hasTurbo: true,
    maxBrakeTorqueNm: 7000,
    brakeFrontBias: 0.65,
    maxSteerRad: 0.64,
    dragCoeff: 0.33,
    downforceCoeff: 0.18,
    rollingResistance: 0.016,
    topSpeedMps: 45.0, // ~162 km/h
  },
  hatchback: {
    archetype: 'hatchback',
    drivetrain: 'FWD',
    massKg: 1210,
    yawInertia: 1850,
    comHeight: 0.53,
    frontWeightBias: 0.61,
    halfTrack: 0.86,
    frontAxleZ: 1.2,
    rearAxleZ: 1.18,
    wheelRadius: 0.33,
    suspRestLength: 0.34,
    suspMaxTravel: 0.17,
    suspStiffness: 28000,
    suspDamping: 3500,
    antiRollStiffness: 6800,
    baseGrip: 1.48,
    peakSlipAngleRad: 0.21,
    peakSlipRatio: 0.15,
    pacejkaB: 1.8,
    pacejkaC: 1.46,
    idleRpm: 900,
    redlineRpm: 7400,
    shiftUpRpm: 6850,
    shiftDownRpm: 2900,
    peakTorqueNm: 410,
    torqueCurve: [
      [0.0, 0.72],
      [0.28, 0.9],
      [0.55, 1.0],
      [0.85, 0.92],
      [1.0, 0.74],
    ],
    gearRatios: [3.55, 2.19, 1.52, 1.14, 0.9, 0.74],
    reverseRatio: -3.3,
    finalDrive: 3.85,
    shiftDurationSec: 0.12,
    hasTurbo: true,
    maxBrakeTorqueNm: 6400,
    brakeFrontBias: 0.68,
    maxSteerRad: 0.68,
    dragCoeff: 0.35,
    downforceCoeff: 0.12,
    rollingResistance: 0.016,
    topSpeedMps: 44.0, // ~158 km/h
  },
  suv: {
    archetype: 'suv',
    drivetrain: 'AWD',
    massKg: 2040,
    yawInertia: 3450,
    comHeight: 0.74,
    frontWeightBias: 0.54,
    halfTrack: 0.95,
    frontAxleZ: 1.4,
    rearAxleZ: 1.38,
    wheelRadius: 0.38,
    suspRestLength: 0.44,
    suspMaxTravel: 0.24,
    suspStiffness: 34000,
    suspDamping: 4600,
    antiRollStiffness: 6200,
    baseGrip: 1.38,
    peakSlipAngleRad: 0.22,
    peakSlipRatio: 0.17,
    pacejkaB: 1.72,
    pacejkaC: 1.42,
    idleRpm: 800,
    redlineRpm: 6600,
    shiftUpRpm: 6050,
    shiftDownRpm: 2500,
    peakTorqueNm: 620,
    torqueCurve: [
      [0.0, 0.74],
      [0.25, 0.92],
      [0.5, 1.0],
      [0.8, 0.88],
      [1.0, 0.68],
    ],
    gearRatios: [3.62, 2.26, 1.54, 1.15, 0.89, 0.72],
    reverseRatio: -3.3,
    finalDrive: 3.6,
    shiftDurationSec: 0.16,
    hasTurbo: true,
    maxBrakeTorqueNm: 8800,
    brakeFrontBias: 0.63,
    maxSteerRad: 0.6,
    dragCoeff: 0.42,
    downforceCoeff: 0.08,
    rollingResistance: 0.019,
    topSpeedMps: 41.5, // ~150 km/h
  },
  van: {
    archetype: 'van',
    drivetrain: 'RWD',
    massKg: 2350,
    yawInertia: 4200,
    comHeight: 0.84,
    frontWeightBias: 0.52,
    halfTrack: 0.96,
    frontAxleZ: 1.5,
    rearAxleZ: 1.48,
    wheelRadius: 0.38,
    suspRestLength: 0.46,
    suspMaxTravel: 0.24,
    suspStiffness: 37000,
    suspDamping: 5000,
    antiRollStiffness: 5800,
    baseGrip: 1.06,
    peakSlipAngleRad: 0.23,
    peakSlipRatio: 0.17,
    pacejkaB: 1.65,
    pacejkaC: 1.4,
    idleRpm: 780,
    redlineRpm: 5800,
    shiftUpRpm: 5200,
    shiftDownRpm: 2100,
    peakTorqueNm: 450,
    torqueCurve: [
      [0.0, 0.7],
      [0.25, 0.95],
      [0.48, 1.0],
      [0.78, 0.82],
      [1.0, 0.6],
    ],
    gearRatios: [3.8, 2.35, 1.58, 1.16, 0.88, 0.71],
    reverseRatio: -3.4,
    finalDrive: 3.7,
    shiftDurationSec: 0.18,
    hasTurbo: false,
    maxBrakeTorqueNm: 5100,
    brakeFrontBias: 0.62,
    maxSteerRad: 0.58,
    dragCoeff: 0.48,
    downforceCoeff: 0.04,
    rollingResistance: 0.021,
    topSpeedMps: 36.5, // ~131 km/h
  },
  taxi: {
    archetype: 'taxi',
    drivetrain: 'RWD',
    massKg: 1480,
    yawInertia: 2450,
    comHeight: 0.54,
    frontWeightBias: 0.53,
    halfTrack: 0.89,
    frontAxleZ: 1.32,
    rearAxleZ: 1.3,
    wheelRadius: 0.35,
    suspRestLength: 0.36,
    suspMaxTravel: 0.18,
    suspStiffness: 30000,
    suspDamping: 3800,
    antiRollStiffness: 7000,
    baseGrip: 1.48,
    peakSlipAngleRad: 0.21,
    peakSlipRatio: 0.15,
    pacejkaB: 1.78,
    pacejkaC: 1.45,
    idleRpm: 850,
    redlineRpm: 7000,
    shiftUpRpm: 6400,
    shiftDownRpm: 2700,
    peakTorqueNm: 495,
    torqueCurve: [
      [0.0, 0.76],
      [0.3, 0.92],
      [0.58, 1.0],
      [0.82, 0.92],
      [1.0, 0.72],
    ],
    gearRatios: [3.48, 2.15, 1.48, 1.12, 0.88, 0.72],
    reverseRatio: -3.2,
    finalDrive: 3.55,
    shiftDurationSec: 0.14,
    hasTurbo: false,
    maxBrakeTorqueNm: 7000,
    brakeFrontBias: 0.65,
    maxSteerRad: 0.64,
    dragCoeff: 0.34,
    downforceCoeff: 0.15,
    rollingResistance: 0.016,
    topSpeedMps: 43.0,
  },
  dolmus: {
    archetype: 'dolmus',
    drivetrain: 'RWD',
    massKg: 2450,
    yawInertia: 4400,
    comHeight: 0.86,
    frontWeightBias: 0.52,
    halfTrack: 0.96,
    frontAxleZ: 1.5,
    rearAxleZ: 1.48,
    wheelRadius: 0.38,
    suspRestLength: 0.46,
    suspMaxTravel: 0.24,
    suspStiffness: 38000,
    suspDamping: 5200,
    antiRollStiffness: 5600,
    baseGrip: 1.05,
    peakSlipAngleRad: 0.23,
    peakSlipRatio: 0.17,
    pacejkaB: 1.65,
    pacejkaC: 1.4,
    idleRpm: 780,
    redlineRpm: 5600,
    shiftUpRpm: 5000,
    shiftDownRpm: 2000,
    peakTorqueNm: 440,
    torqueCurve: [
      [0.0, 0.7],
      [0.25, 0.95],
      [0.48, 1.0],
      [0.78, 0.82],
      [1.0, 0.6],
    ],
    gearRatios: [3.8, 2.35, 1.58, 1.16, 0.88, 0.71],
    reverseRatio: -3.4,
    finalDrive: 3.7,
    shiftDurationSec: 0.18,
    hasTurbo: false,
    maxBrakeTorqueNm: 5100,
    brakeFrontBias: 0.62,
    maxSteerRad: 0.58,
    dragCoeff: 0.49,
    downforceCoeff: 0.04,
    rollingResistance: 0.021,
    topSpeedMps: 35.0,
  },
};

export interface DrivingModeProfile {
  mode: DrivingMode;
  maxSteerMult: number;
  gripFrontMult: number;
  gripRearMult: number;
  torqueMult: number;
  /** Automatic CarX-style counter-steer assist strength (0 = pure sim, 0.72 = effortless drift) */
  counterSteerAssist: number;
  /** Traction control cut strength (0 = raw wheelspin, 1 = strict) */
  tcsStrength: number;
  /** Anti-lock braking modulation (0 = can lock wheels, 1 = smooth ABS) */
  absStrength: number;
  /** Yaw angular stabilizer preventing spinouts in arcade/drift modes */
  yawStabilizer: number;
  /** Max assisted drift angle before stabilizer intervenes (rad) */
  maxAssistedSlipRad: number;
  /** Rear lateral grip release during throttle/handbrake drift */
  driftRearRelease: number;
}

export const DRIVING_MODE_PROFILES: Record<DrivingMode, DrivingModeProfile> = {
  street: {
    mode: 'street',
    maxSteerMult: 1.0,
    gripFrontMult: 1.2,
    gripRearMult: 1.38,
    torqueMult: 1.24,
    counterSteerAssist: 0.52,
    tcsStrength: 0.78,
    absStrength: 0.9,
    yawStabilizer: 3.4,
    maxAssistedSlipRad: 0.24, // ~14° planted street grip (handbrake relaxes to ~45°!)
    driftRearRelease: 0.0, // Never randomly kick out the rear on normal throttle turns
  },
  drift: {
    mode: 'drift',
    maxSteerMult: 1.28, // Wide angle drift knuckles (~48° lock!)
    gripFrontMult: 1.14,
    gripRearMult: 0.8,
    torqueMult: 1.32,
    counterSteerAssist: 0.74,
    tcsStrength: 0.0,
    absStrength: 0.65,
    yawStabilizer: 2.35,
    maxAssistedSlipRad: 0.98, // ~56° wide CarX drift angle!
    driftRearRelease: 0.46,
  },
  sim: {
    mode: 'sim',
    maxSteerMult: 0.94,
    gripFrontMult: 1.0,
    gripRearMult: 1.0,
    torqueMult: 1.0,
    counterSteerAssist: 0.0,
    tcsStrength: 0.0,
    absStrength: 0.0,
    yawStabilizer: 0.0,
    maxAssistedSlipRad: 1.5,
    driftRearRelease: 0.0,
  },
};

export interface VehicleDynamicState {
  /** World-space linear velocity (m/s) */
  vx: number;
  vz: number;
  /** Yaw angular velocity (rad/s, +left) */
  yawRate: number;
  /** Body-frame forward speed (m/s) */
  vLong: number;
  /** Body-frame lateral speed (m/s, +left) */
  vLat: number;
  /** Smoothed longitudinal & lateral acceleration for weight transfer & chassis pitch/roll */
  longAccel: number;
  latAccel: number;
  /** Powertrain state */
  rpm: number;
  /** Gear number: -1 = R, 0 = N, 1..6 = forward gears */
  gearNum: number;
  shiftTimer: number;
  pendingGear: number;
  clutchEngagement: number;
  turboBoost: number; // 0..1.4 bar
  prevThrottle: number;
  /** Trigger pulses (1.0 on frame of event, decaying) for audio & VFX */
  backfirePulse: number;
  blowOffPulse: number;
  gearShiftPulse: number;
  impactPulse: number;
  /** Mode & transmission config */
  drivingMode: DrivingMode;
  transmissionMode: TransmissionMode;
  /** Active drift metrics */
  driftAngleDeg: number;
  driftScore: number;
  bestDriftScore: number;
  driftComboTimer: number;
  /** Max tire skid across all 4 wheels (0..1) */
  maxSkidIntensity: number;
  /** Smoothed spring-damper suspension kinematics */
  suspPitchVel: number;
  suspRollVel: number;
  suspHeaveVel: number;
  /** 4 independent wheels: FL(0), FR(1), RL(2), RR(3) */
  wheels: [WheelTelemetry, WheelTelemetry, WheelTelemetry, WheelTelemetry];
}

export function createWheelTelemetry(
  index: number,
  isFront: boolean,
  localLeft: number,
  localFwd: number,
): WheelTelemetry {
  return {
    index,
    isFront,
    localLeft,
    localFwd,
    worldX: 0,
    worldY: 0,
    worldZ: 0,
    compression: 0.45,
    hubOffsetY: 0,
    normalLoad: 3500,
    slipRatio: 0,
    slipAngle: 0,
    skidIntensity: 0,
    steerAngle: 0,
    spin: 0,
    omega: 0,
    grounded: true,
  };
}

export function createVehicleDynamicState(
  archetype: VehicleArchetype,
  drivingMode: DrivingMode = 'street',
  transmissionMode: TransmissionMode = 'auto',
): VehicleDynamicState {
  const spec = VEHICLE_PHYSICS_SPECS[archetype];
  return {
    vx: 0,
    vz: 0,
    yawRate: 0,
    vLong: 0,
    vLat: 0,
    longAccel: 0,
    latAccel: 0,
    rpm: spec.idleRpm,
    gearNum: 1,
    shiftTimer: 0,
    pendingGear: 1,
    clutchEngagement: 1,
    turboBoost: 0,
    prevThrottle: 0,
    backfirePulse: 0,
    blowOffPulse: 0,
    gearShiftPulse: 0,
    impactPulse: 0,
    drivingMode,
    transmissionMode,
    driftAngleDeg: 0,
    driftScore: 0,
    bestDriftScore: 0,
    driftComboTimer: 0,
    maxSkidIntensity: 0,
    suspPitchVel: 0,
    suspRollVel: 0,
    suspHeaveVel: 0,
    wheels: [
      createWheelTelemetry(0, true, spec.halfTrack, spec.frontAxleZ),
      createWheelTelemetry(1, true, -spec.halfTrack, spec.frontAxleZ),
      createWheelTelemetry(2, false, spec.halfTrack, -spec.rearAxleZ),
      createWheelTelemetry(3, false, -spec.halfTrack, -spec.rearAxleZ),
    ],
  };
}

export function syncWheelGeometryOffsets(
  dyn: VehicleDynamicState,
  archetype: VehicleArchetype,
): void {
  const spec = VEHICLE_PHYSICS_SPECS[archetype];
  dyn.wheels[0].localLeft = spec.halfTrack;
  dyn.wheels[0].localFwd = spec.frontAxleZ;
  dyn.wheels[1].localLeft = -spec.halfTrack;
  dyn.wheels[1].localFwd = spec.frontAxleZ;
  dyn.wheels[2].localLeft = spec.halfTrack;
  dyn.wheels[2].localFwd = -spec.rearAxleZ;
  dyn.wheels[3].localLeft = -spec.halfTrack;
  dyn.wheels[3].localFwd = -spec.rearAxleZ;
  dyn.rpm = Math.max(spec.idleRpm, Math.min(dyn.rpm, spec.redlineRpm));
}

/** Evaluates normalized engine torque curve (Nm) at given RPM. */
export function evaluateEngineTorqueNm(spec: VehiclePhysicsSpec, rpm: number): number {
  const frac = clamp((rpm - spec.idleRpm) / Math.max(1, spec.redlineRpm - spec.idleRpm), 0, 1.05);
  if (frac > 1.0) return 0; // Rev-limiter fuel cut!
  const curve = spec.torqueCurve;
  if (frac <= curve[0]![0]) return spec.peakTorqueNm * curve[0]![1];
  for (let i = 1; i < curve.length; i += 1) {
    const [x1, y1] = curve[i]!;
    if (frac <= x1) {
      const [x0, y0] = curve[i - 1]!;
      const t = (frac - x0) / Math.max(1e-5, x1 - x0);
      return spec.peakTorqueNm * (y0 + t * (y1 - y0));
    }
  }
  return spec.peakTorqueNm * curve[curve.length - 1]![1];
}

/**
 * Normalized Pacejka Magic Formula curve peaking cleanly at 1.0 around rho == 1.0,
 * falling gracefully past peak so over-the-limit drifts stay controllable and progressive.
 */
export function pacejkaNormalized(rho: number, B: number, C: number): number {
  if (rho <= 1e-6) return 0;
  const peakNorm = Math.max(0.2, Math.sin(C * Math.atan(B)));
  const raw = Math.sin(C * Math.atan(B * rho));
  return raw / peakNorm;
}

export function formatGearLabel(gearNum: number): 'R' | 'N' | '1' | '2' | '3' | '4' | '5' | '6' {
  if (gearNum < 0) return 'R';
  if (gearNum === 0) return 'N';
  if (gearNum === 1) return '1';
  if (gearNum === 2) return '2';
  if (gearNum === 3) return '3';
  if (gearNum === 4) return '4';
  if (gearNum === 5) return '5';
  return '6';
}

export function getGearRatio(spec: VehiclePhysicsSpec, gearNum: number): number {
  if (gearNum < 0) return spec.reverseRatio;
  if (gearNum === 0) return 0;
  const idx = clamp(gearNum - 1, 0, spec.gearRatios.length - 1);
  return spec.gearRatios[idx]!;
}

/** Shifts gear manually up (+1) or down (-1) with crisp rev-match & backfire trigger. */
export function shiftVehicleGear(
  dyn: VehicleDynamicState,
  archetype: VehicleArchetype,
  delta: 1 | -1,
): void {
  const spec = VEHICLE_PHYSICS_SPECS[archetype];
  const next = clamp(dyn.gearNum + delta, -1, spec.gearRatios.length);
  if (next === dyn.gearNum) return;
  if (delta < 0 && dyn.rpm > spec.idleRpm + 1800) {
    dyn.backfirePulse = 1.0;
  }
  if (delta > 0 && dyn.turboBoost > 0.38) {
    dyn.blowOffPulse = clamp(dyn.turboBoost, 0.35, 1.0);
  }
  dyn.pendingGear = next;
  dyn.gearNum = next;
  dyn.shiftTimer = spec.shiftDurationSec;
  dyn.gearShiftPulse = 1.0;
}

export function resetVehicleDynamics(
  dyn: VehicleDynamicState,
  archetype: VehicleArchetype,
): void {
  const spec = VEHICLE_PHYSICS_SPECS[archetype];
  dyn.vx = 0;
  dyn.vz = 0;
  dyn.yawRate = 0;
  dyn.vLong = 0;
  dyn.vLat = 0;
  dyn.longAccel = 0;
  dyn.latAccel = 0;
  dyn.rpm = spec.idleRpm;
  dyn.gearNum = 1;
  dyn.pendingGear = 1;
  dyn.shiftTimer = 0;
  dyn.turboBoost = 0;
  dyn.backfirePulse = 0;
  dyn.blowOffPulse = 0;
  dyn.gearShiftPulse = 0;
  dyn.impactPulse = 0;
  dyn.driftAngleDeg = 0;
  dyn.driftScore = 0;
  dyn.driftComboTimer = 0;
  dyn.maxSkidIntensity = 0;
  dyn.suspPitchVel = 0;
  dyn.suspRollVel = 0;
  dyn.suspHeaveVel = 0;
  for (let i = 0; i < 4; i += 1) {
    const w = dyn.wheels[i]!;
    w.compression = 0.45;
    w.hubOffsetY = 0;
    w.slipRatio = 0;
    w.slipAngle = 0;
    w.skidIntensity = 0;
    w.steerAngle = 0;
    w.omega = 0;
    w.grounded = true;
  }
}

export function cycleDrivingMode(current: DrivingMode): DrivingMode {
  const idx = DRIVING_MODE_ORDER.indexOf(current);
  return DRIVING_MODE_ORDER[(idx + 1) % DRIVING_MODE_ORDER.length]!;
}

export function cycleSteeringControlMode(current: SteeringControlMode): SteeringControlMode {
  const idx = STEERING_CONTROL_ORDER.indexOf(current);
  return STEERING_CONTROL_ORDER[(idx + 1) % STEERING_CONTROL_ORDER.length]!;
}
