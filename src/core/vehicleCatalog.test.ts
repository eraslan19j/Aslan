import { describe, expect, it } from 'vitest';
import {
  auditCatalogAgainstPhysics,
  estimateCrankPowerKw,
  formatVehicleSpecLine,
  getVehicleCatalogEntry,
  VEHICLE_ARCHETYPE_ORDER,
  VEHICLE_CATALOG,
} from './vehicleCatalog';
import { VEHICLE_PHYSICS_SPECS } from './vehiclePhysics';
import { VEHICLE_SPECS } from './vehicle';

describe('v0.9.0 Vehicle Catalogue (mass / power / torque / gearing down to the detail)', () => {
  it('describes all 7 car classes with complete, physically plausible engine data', () => {
    expect(VEHICLE_ARCHETYPE_ORDER.length).toBe(7);
    for (const arch of VEHICLE_ARCHETYPE_ORDER) {
      const e = VEHICLE_CATALOG[arch];
      expect(e.archetype).toBe(arch);
      expect(e.modelName.length).toBeGreaterThan(2);
      // Engine
      expect(e.engine.cylinders).toBeGreaterThanOrEqual(3);
      expect(e.engine.displacementCc).toBeGreaterThan(900);
      expect(e.engine.displacementCc).toBeLessThan(4200);
      expect(e.engine.compressionRatio).toBeGreaterThan(8);
      expect(e.engine.compressionRatio).toBeLessThan(19);
      expect(Math.abs(e.engine.powerHp * 0.7355 - e.engine.powerKw)).toBeLessThan(0.9);
      expect(e.engine.powerRpm).toBeGreaterThan(3000);
      expect(e.engine.torqueRpm).toBeLessThan(e.engine.powerRpm);
      expect(e.engine.redlineRpm).toBeGreaterThan(e.engine.powerRpm);
      // Specific output: turbo/diesel/sporster — every real-world band is representable
      expect(e.engine.specificOutputHpPerL).toBeGreaterThan(40);
      expect(e.engine.specificOutputHpPerL).toBeLessThan(200);
      expect(
        Math.abs(e.engine.specificOutputHpPerL - (e.engine.powerHp / e.engine.displacementCc) * 1000),
      ).toBeLessThan(0.6);
      // Drivetrain
      expect(e.drivetrain.gears.length).toBe(6);
      for (let i = 1; i < e.drivetrain.gears.length; i += 1) {
        expect(e.drivetrain.gears[i]!).toBeLessThan(e.drivetrain.gears[i - 1]!);
      }
      expect(e.drivetrain.finalDrive).toBeGreaterThan(3);
      // Mass & performance
      expect(e.mass.curbKg).toBeGreaterThan(900);
      expect(e.mass.testKg).toBeGreaterThan(e.mass.curbKg);
      expect(e.mass.frontWeightBias).toBeGreaterThan(0.45);
      expect(e.mass.frontWeightBias).toBeLessThan(0.66);
      expect(e.performance.zeroTo100Sec).toBeGreaterThan(3);
      expect(e.performance.zeroTo100Sec).toBeLessThan(18);
      expect(e.performance.powerToWeightHpPerTon).toBeCloseTo(
        (e.engine.powerHp / e.mass.curbKg) * 1000,
        0,
      );
      // Dimensions
      expect(e.dimensions.lengthMm).toBeGreaterThan(3800);
      expect(e.dimensions.wheelbaseMm).toBeLessThan(e.dimensions.lengthMm);
      // Audio identity
      expect(e.audio.voice.openness).toBeGreaterThanOrEqual(0);
      expect(e.audio.voice.openness).toBeLessThanOrEqual(1);
      expect(e.audio.voice.pipeResonanceHz).toBeGreaterThan(40);
      expect(e.audio.voice.mufflerCutoffHz).toBeGreaterThan(900);
    }
  });

  it('keeps the catalogue perfectly in sync with the tuned 240 Hz physics specs', () => {
    expect(auditCatalogAgainstPhysics()).toEqual([]);
  });

  it('orders the classes by real performance: sports > hatchback > sedan > taxi > suv > van > dolmus', () => {
    const t100 = (a: keyof typeof VEHICLE_CATALOG): number => VEHICLE_CATALOG[a].performance.zeroTo100Sec;
    expect(t100('sports')).toBeLessThan(t100('hatchback'));
    expect(t100('hatchback')).toBeLessThan(t100('sedan'));
    expect(t100('sedan')).toBeLessThan(t100('suv'));
    expect(t100('taxi')).toBeLessThan(t100('suv'));
    expect(t100('suv')).toBeLessThan(t100('van'));
    expect(t100('van')).toBeLessThan(t100('dolmus'));

    const mass = (a: keyof typeof VEHICLE_CATALOG): number => VEHICLE_CATALOG[a].mass.curbKg;
    expect(mass('sports')).toBeLessThan(mass('dolmus'));
    expect(mass('hatchback')).toBeLessThan(mass('suv'));
  });

  it('derives crank power from the live torque curve (peak lands inside the rated band)', () => {
    const sports = getVehicleCatalogEntry('sports');
    let bestKw = 0;
    for (let rpm = 1000; rpm <= sports.engine.redlineRpm; rpm += 100) {
      bestKw = Math.max(bestKw, estimateCrankPowerKw('sports', rpm));
    }
    // Tuned curve yields ~280 kW; catalogue rates 279 kW.
    expect(bestKw).toBeGreaterThan(sports.engine.powerKw * 0.85);
    expect(bestKw).toBeLessThan(sports.engine.powerKw * 1.25);

    // Torque limiters reach the catalogue peak figure
    for (const arch of VEHICLE_ARCHETYPE_ORDER) {
      const e = VEHICLE_CATALOG[arch];
      expect(VEHICLE_PHYSICS_SPECS[arch].peakTorqueNm).toBe(e.engine.torqueNm);
    }
  });

  it('handles physical footprint consistently with the collision spec', () => {
    for (const arch of VEHICLE_ARCHETYPE_ORDER) {
      const e = VEHICLE_CATALOG[arch];
      const spec = VEHICLE_SPECS[arch];
      expect(spec.length * 1000).toBeCloseTo(e.dimensions.lengthMm, -1);
      expect(spec.width * 1000).toBeCloseTo(e.dimensions.widthMm, -1);
      expect(spec.height * 1000).toBeCloseTo(e.dimensions.heightMm, -1);
      expect(spec.collisionRadius).toBeLessThan(spec.width * 0.56);
    }
  });

  it('formats a one-line spec sheet without exposing any real manufacturer', () => {
    for (const arch of VEHICLE_ARCHETYPE_ORDER) {
      const line = formatVehicleSpecLine(arch);
      expect(line).toContain('cc');
      expect(line).toContain('hp');
      expect(line).toContain('Nm');
      expect(/toyota|bmw|mercedes|ford|hyundai|renault|fiat|tesla/i.test(line)).toBe(false);
    }
  });
});
