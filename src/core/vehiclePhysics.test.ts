import { describe, expect, it } from 'vitest';
import { BuildingSpatialGrid } from './world/collision';
import {
  applyVehicleCollisionImpulse,
  createVehicleState,
  manualShiftVehicle,
  stepPlayerVehicle,
  type VehicleArchetype,
} from './vehicle';
import {
  cycleDrivingMode,
  cycleSteeringControlMode,
  DRIVING_MODE_PROFILES,
  evaluateEngineTorqueNm,
  pacejkaNormalized,
  VEHICLE_PHYSICS_SPECS,
  type DrivingMode,
} from './vehiclePhysics';

const OPEN_BOUNDS = { minX: -2000, maxX: 2000, minZ: -2000, maxZ: 2000 };
const FLAT_ELEV = (): number => 0;

describe('v0.7.0 Apex 240 Hz 4-Wheel Pacejka Vehicle Physics', () => {
  it('evaluates Pacejka slip curve & engine torque curve accurately with clean rev-limiter cut', () => {
    const spec = VEHICLE_PHYSICS_SPECS.sports;
    expect(pacejkaNormalized(0, spec.pacejkaB, spec.pacejkaC)).toBe(0);
    const atHalf = pacejkaNormalized(0.5, spec.pacejkaB, spec.pacejkaC);
    const atPeak = pacejkaNormalized(1.0, spec.pacejkaB, spec.pacejkaC);
    const pastPeak = pacejkaNormalized(2.4, spec.pacejkaB, spec.pacejkaC);
    expect(atHalf).toBeGreaterThan(0.5);
    expect(atPeak).toBeCloseTo(1.0, 2);
    expect(pastPeak).toBeLessThan(atPeak);
    expect(pastPeak).toBeGreaterThan(0.55); // Progressive controllable drift falloff

    expect(evaluateEngineTorqueNm(spec, spec.idleRpm)).toBeGreaterThan(300);
    expect(evaluateEngineTorqueNm(spec, 6200)).toBeGreaterThan(550);
    expect(evaluateEngineTorqueNm(spec, spec.redlineRpm + 200)).toBe(0); // Fuel cut
  });

  it('automatically shifts through 6 forward gears, spools turbo, triggers BOV/backfire & engages Reverse', () => {
    const grid = new BuildingSpatialGrid(20);
    const car = createVehicleState('gt', 'sports', 0, 0, 0, 0, 0xdc2626, 'street', 'auto');

    const seenGears = new Set<string>();
    let maxBoost = 0;
    let maxKph = 0;

    // 7 seconds full-throttle pull on open straight
    for (let i = 0; i < 420; i += 1) {
      const r = stepPlayerVehicle(
        car,
        { throttle: 1, brake: 0, steer: 0, handbrake: false },
        1 / 60,
        OPEN_BOUNDS,
        FLAT_ELEV,
        grid,
      );
      seenGears.add(r.gear);
      if (r.turboBoost > maxBoost) maxBoost = r.turboBoost;
      if (r.speedKph > maxKph) maxKph = r.speedKph;
    }

    expect(seenGears.has('1')).toBe(true);
    expect(seenGears.has('2')).toBe(true);
    expect(seenGears.has('3')).toBe(true);
    expect(maxBoost).toBeGreaterThan(0.6);
    expect(maxKph).toBeGreaterThan(130);

    // Abrupt throttle lift at high boost & RPM -> triggers BOV + overrun exhaust backfire!
    stepPlayerVehicle(
      car,
      { throttle: 0, brake: 0, steer: 0, handbrake: false },
      1 / 60,
      OPEN_BOUNDS,
      FLAT_ELEV,
      grid,
    );
    expect(car.dyn.blowOffPulse).toBeGreaterThan(0.3);
    expect(car.dyn.backfirePulse).toBeGreaterThan(0.3);

    // Brake to a standstill, then keep holding brake -> automatic engagement into Reverse ('R')
    let revGear = '';
    for (let i = 0; i < 240; i += 1) {
      const r = stepPlayerVehicle(
        car,
        { throttle: 0, brake: 1, steer: 0, handbrake: false },
        1 / 60,
        OPEN_BOUNDS,
        FLAT_ELEV,
        grid,
      );
      revGear = r.gear;
    }
    expect(revGear).toBe('R');
    expect(car.reversing).toBe(true);
    expect(car.speed).toBeLessThan(-2);
  });

  it('holds selected gear strictly in Manual mode and shifts up/down via manualShiftVehicle', () => {
    const grid = new BuildingSpatialGrid(20);
    const car = createVehicleState('gt-man', 'sports', 0, 0, 0, 0, 0xdc2626, 'street', 'manual');

    // Pin throttle in 1st gear for 3 seconds -> MUST stay in gear '1' (no auto upshift!)
    let res = stepPlayerVehicle(
      car,
      { throttle: 1, brake: 0, steer: 0, handbrake: false },
      1 / 60,
      OPEN_BOUNDS,
      FLAT_ELEV,
      grid,
    );
    for (let i = 0; i < 180; i += 1) {
      res = stepPlayerVehicle(
        car,
        { throttle: 1, brake: 0, steer: 0, handbrake: false },
        1 / 60,
        OPEN_BOUNDS,
        FLAT_ELEV,
        grid,
      );
    }
    expect(res.gear).toBe('1');
    expect(res.rpm).toBeGreaterThan(7400);

    // Shift up manually 1 -> 2 -> 3
    manualShiftVehicle(car, 1);
    res = stepPlayerVehicle(
      car,
      { throttle: 1, brake: 0, steer: 0, handbrake: false },
      1 / 60,
      OPEN_BOUNDS,
      FLAT_ELEV,
      grid,
    );
    expect(res.gear).toBe('2');

    // Downshift back to 1st triggers crisp rev-match backfire pulse
    car.dyn.rpm = 6000;
    manualShiftVehicle(car, -1);
    expect(car.dyn.gearNum).toBe(1);
    expect(car.dyn.backfirePulse).toBeGreaterThan(0.5);
  });

  it('differentiates Street / Drift / Sim modes with sustained CarX drift angles & combo score', () => {
    expect(cycleDrivingMode('street')).toBe('drift');
    expect(cycleDrivingMode('drift')).toBe('sim');
    expect(cycleDrivingMode('sim')).toBe('street');
    expect(cycleSteeringControlMode('buttons')).toBe('slider');
    expect(cycleSteeringControlMode('slider')).toBe('gyro');
    expect(cycleSteeringControlMode('gyro')).toBe('buttons');

    // Sim mode must disable all arcade assists strictly
    expect(DRIVING_MODE_PROFILES.sim.counterSteerAssist).toBe(0);
    expect(DRIVING_MODE_PROFILES.sim.tcsStrength).toBe(0);
    expect(DRIVING_MODE_PROFILES.sim.absStrength).toBe(0);
    expect(DRIVING_MODE_PROFILES.sim.yawStabilizer).toBe(0);

    const grid = new BuildingSpatialGrid(20);
    const driftCar = createVehicleState('drifter', 'sports', 0, 0, 0, 0, 0xdc2626, 'drift', 'auto');

    // Accelerate to ~75 km/h then kick handbrake + counter-steer power-slide
    for (let i = 0; i < 110; i += 1) {
      stepPlayerVehicle(
        driftCar,
        { throttle: 1, brake: 0, steer: 0, handbrake: false },
        1 / 60,
        OPEN_BOUNDS,
        FLAT_ELEV,
        grid,
      );
    }
    let peakDriftDeg = 0;
    for (let i = 0; i < 120; i += 1) {
      const hb = i < 20;
      const r = stepPlayerVehicle(
        driftCar,
        { throttle: 1, brake: 0, steer: 0.85, handbrake: hb },
        1 / 60,
        OPEN_BOUNDS,
        FLAT_ELEV,
        grid,
      );
      if (r.driftAngleDeg > peakDriftDeg) peakDriftDeg = r.driftAngleDeg;
    }

    expect(peakDriftDeg).toBeGreaterThan(14);
    expect(driftCar.dyn.bestDriftScore).toBeGreaterThan(100);
    expect(driftCar.dyn.maxSkidIntensity).toBeGreaterThan(0.2);
    // Counter-steer + yaw stabilizer prevents uncontrollable spinouts
    expect(Math.abs(driftCar.dyn.yawRate)).toBeLessThan(3.61);
  });

  it('computes Ackerman steering geometry, 4-wheel terrain compression & traffic collision momentum', () => {
    const grid = new BuildingSpatialGrid(20);
    const suv = createVehicleState('suv-awd', 'suv', 0, 0, 0, 0, 0x2563eb, 'street', 'auto');
    const bumpyRoad = (x: number, z: number): number => Math.sin(z * 0.35) * 0.14 + x * 0.02;

    for (let i = 0; i < 60; i += 1) {
      stepPlayerVehicle(
        suv,
        { throttle: 1, brake: 0, steer: 0.7, handbrake: false },
        1 / 60,
        OPEN_BOUNDS,
        bumpyRoad,
        grid,
      );
    }

    // Turning left (+steer): inner front-left wheel (0) turns sharper than outer front-right wheel (1)
    expect(suv.dyn.wheels[0].steerAngle).toBeGreaterThan(suv.dyn.wheels[1].steerAngle);
    expect(suv.dyn.wheels[2].steerAngle).toBe(0);
    expect(suv.dyn.wheels[3].steerAngle).toBe(0);
    expect(suv.dyn.wheels.every((w) => w.normalLoad > 500 && Number.isFinite(w.hubOffsetY))).toBe(
      true,
    );

    // Traffic momentum impulse slows vehicle cleanly and pulses impact camera shake without NaN
    const speedBefore = Math.hypot(suv.dyn.vx, suv.dyn.vz);
    applyVehicleCollisionImpulse(suv, suv.x - 0.6, suv.z - 0.8, 12, bumpyRoad);
    expect(Number.isFinite(suv.dyn.vx) && Number.isFinite(suv.dyn.vz)).toBe(true);
    expect(suv.dyn.impactPulse).toBeGreaterThan(0.4);
    expect(Math.hypot(suv.dyn.vx, suv.dyn.vz)).toBeLessThanOrEqual(speedBefore + 2);
  });

  it('stays numerically rock-solid (zero NaN/Inf) across all 7 archetypes and all 3 driving modes', () => {
    const grid = new BuildingSpatialGrid(20);
    const archetypes: VehicleArchetype[] = [
      'sports',
      'sedan',
      'suv',
      'hatchback',
      'van',
      'taxi',
      'dolmus',
    ];
    const modes: DrivingMode[] = ['street', 'drift', 'sim'];

    for (const arch of archetypes) {
      for (const mode of modes) {
        const v = createVehicleState(`test-${arch}-${mode}`, arch, 0, 0, 0, 0.3, 0xdc2626, mode);
        for (let i = 0; i < 120; i += 1) {
          stepPlayerVehicle(
            v,
            {
              throttle: i % 40 < 30 ? 1 : 0,
              brake: i % 40 >= 30 ? 0.8 : 0,
              steer: Math.sin(i * 0.12),
              handbrake: i % 45 > 35,
            },
            1 / 60,
            OPEN_BOUNDS,
            (x, z) => (x + z) * 0.03,
            grid,
          );
        }
        expect(Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z)).toBe(true);
        expect(Number.isFinite(v.dyn.rpm) && v.dyn.rpm >= 500).toBe(true);
        expect(Number.isFinite(v.heading) && Number.isFinite(v.speed)).toBe(true);
      }
    }
  });
});
