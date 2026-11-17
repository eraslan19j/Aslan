import { describe, expect, it } from 'vitest';
import { RoadTrafficSimulator } from './traffic';
import { createVehicleState, stepPlayerVehicle } from './vehicle';
import { BuildingSpatialGrid } from './world/collision';
import type { RoadGraph } from './world/types';

const FLAT = () => 0;
const WIDE_BOUNDS = { minX: -2000, maxX: 2000, minZ: -2000, maxZ: 2000 };

describe('v0.8.0 Street High-Speed Grip & Upgraded NPC Vehicle Mechanics', () => {
  it('keeps Street mode planted without excessive fishtailing during fast turns, while Drift & Handbrake still slide', () => {
    const emptyGrid = new BuildingSpatialGrid(32);

    // 1. Accelerate sports coupe in Street mode to high speed (~115+ km/h), then steer hard
    const streetCar = createVehicleState('player', 'sports', 0, 0, 0, 0, 0xdc2626, 'street', 'auto');
    for (let i = 0; i < 230; i += 1) {
      stepPlayerVehicle(
        streetCar,
        { throttle: 1, brake: 0, steer: 0, handbrake: false, surfaceGrip: 1.0 },
        1 / 60,
        WIDE_BOUNDS,
        FLAT,
        emptyGrid,
      );
    }
    const speedBeforeTurnKph = Math.hypot(streetCar.dyn.vx, streetCar.dyn.vz) * 3.6;
    expect(speedBeforeTurnKph).toBeGreaterThan(110);

    let maxStreetSlipDeg = 0;
    for (let i = 0; i < 120; i += 1) {
      stepPlayerVehicle(
        streetCar,
        { throttle: 1, brake: 0, steer: 1, handbrake: false, surfaceGrip: 1.0 },
        1 / 60,
        WIDE_BOUNDS,
        FLAT,
        emptyGrid,
      );
      maxStreetSlipDeg = Math.max(maxStreetSlipDeg, streetCar.dyn.driftAngleDeg);
    }
    // Street mode stays cleanly planted (< 22° body slip, zero wild fishtail!)
    expect(maxStreetSlipDeg).toBeLessThan(22);

    // 2. Pulling the handbrake in Street mode STILL initiates an intentional powerslide!
    let maxHandbrakeSlipDeg = 0;
    for (let i = 0; i < 65; i += 1) {
      stepPlayerVehicle(
        streetCar,
        { throttle: 0.9, brake: 0, steer: 1, handbrake: i < 28, surfaceGrip: 1.0 },
        1 / 60,
        WIDE_BOUNDS,
        FLAT,
        emptyGrid,
      );
      maxHandbrakeSlipDeg = Math.max(maxHandbrakeSlipDeg, streetCar.dyn.driftAngleDeg);
    }
    expect(maxHandbrakeSlipDeg).toBeGreaterThan(16);

    // 3. Dedicated Drift mode delivers noticeably wider sustained drift angles than Street mode!
    const driftCar = createVehicleState('drift', 'sports', 0, 0, 0, 0, 0xdc2626, 'drift', 'auto');
    for (let i = 0; i < 110; i += 1) {
      stepPlayerVehicle(
        driftCar,
        { throttle: 1, brake: 0, steer: 0, handbrake: false, surfaceGrip: 1.0 },
        1 / 60,
        WIDE_BOUNDS,
        FLAT,
        emptyGrid,
      );
    }
    let maxDriftModeSlipDeg = 0;
    for (let i = 0; i < 120; i += 1) {
      stepPlayerVehicle(
        driftCar,
        { throttle: 1, brake: 0, steer: 0.85, handbrake: i < 20, surfaceGrip: 1.0 },
        1 / 60,
        WIDE_BOUNDS,
        FLAT,
        emptyGrid,
      );
      maxDriftModeSlipDeg = Math.max(maxDriftModeSlipDeg, driftCar.dyn.driftAngleDeg);
    }
    expect(maxDriftModeSlipDeg).toBeGreaterThan(15);
    expect(maxDriftModeSlipDeg).toBeGreaterThan(maxStreetSlipDeg);
  });

  it('gives NPC traffic vehicles spinning wheels, steering, suspension dynamics, brake lights & collision knockback', () => {
    const loopGraph: RoadGraph = {
      schemaVersion: 1,
      regionId: 'test',
      nodes: [
        { id: 'a', x: 0, y: 0, z: 0 },
        { id: 'b', x: 0, y: 0, z: 60 },
        { id: 'c', x: 60, y: 0, z: 60 },
        { id: 'd', x: 60, y: 0, z: 0 },
      ],
      edges: [
        { id: 'e1', from: 'a', to: 'b', roadClass: 'primary', width: 9, lengthMeters: 60, speedLimitKph: 50, oneWay: false },
        { id: 'e2', from: 'b', to: 'c', roadClass: 'primary', width: 9, lengthMeters: 60, speedLimitKph: 50, oneWay: false },
        { id: 'e3', from: 'c', to: 'd', roadClass: 'primary', width: 9, lengthMeters: 60, speedLimitKph: 50, oneWay: false },
        { id: 'e4', from: 'd', to: 'a', roadClass: 'primary', width: 9, lengthMeters: 60, speedLimitKph: 50, oneWay: false },
      ],
    };

    const sim = new RoadTrafficSimulator(loopGraph, 6, 999, 30, 30);
    const grid = new BuildingSpatialGrid(24);
    const target = sim.getAgents()[0]!;
    const initialWheelSpin = target.wheelSpin;

    for (let i = 0; i < 90; i += 1) {
      sim.step(1 / 30, 500, 500, FLAT, grid);
    }
    expect(target.wheelSpin).toBeGreaterThan(initialWheelSpin + 5);

    // Strike the NPC car at 18 m/s (~65 km/h) -> verify real physics knockback, spin, braking & suspension reaction!
    const preX = target.x;
    const preZ = target.z;
    const hit = sim.resolvePlayerVehicleCollision(target.x - 0.8, target.z - 0.4, 18, 8, 1.2, 1450);
    expect(hit.collided).toBe(true);
    expect(target.knockTimer).toBeGreaterThan(0.5);
    expect(Math.hypot(target.knockVx, target.knockVz)).toBeGreaterThan(4);
    expect(target.braking).toBe(true);

    for (let i = 0; i < 20; i += 1) {
      sim.step(1 / 30, 500, 500, FLAT, grid);
    }
    expect(Math.hypot(target.x - preX, target.z - preZ)).toBeGreaterThan(1.5);
  });
});
