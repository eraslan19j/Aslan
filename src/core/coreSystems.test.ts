import { describe, expect, it } from 'vitest';
import { FixedStepClock } from './gameLoop';
import {
  getQualityPreset,
  nextQualityTier,
  normalizeQualityTier,
  suggestQualityTier,
} from './quality';
import { getTimeCycleProfile, nextAtmospherePreset } from './timeCycle';
import { mergeControlIntent } from './controls';
import { FATIH_SANCTUARY_ZONES, findSanctuaryZone, isCombatAllowedAt } from './sanctuary';

describe('core/gameLoop', () => {
  it('accumulates sub-steps and ticks deterministically at 60 Hz', () => {
    const clock = new FixedStepClock(60, 0.1, 6);
    const dts: number[] = [];
    const r1 = clock.advance(0.01, (dt) => dts.push(dt));
    expect(r1.steps).toBe(0);
    const r2 = clock.advance(0.01, (dt) => dts.push(dt));
    expect(r2.steps).toBe(1);
    expect(dts[0]).toBeCloseTo(1 / 60, 6);
  });

  it('clamps huge deltas after tab switch and caps steps per frame', () => {
    const clock = new FixedStepClock(60, 0.1, 4);
    let calls = 0;
    const res = clock.advance(10.0, () => {
      calls += 1;
    });
    expect(res.clampedDt).toBe(0.1);
    expect(calls).toBe(4);
  });
});

describe('core/quality & timeCycle', () => {
  it('enforces monotonically scaling 4-tier Android quality budgets (Low -> Medium -> High -> Ultra)', () => {
    const low = getQualityPreset('low');
    const med = getQualityPreset('medium');
    const high = getQualityPreset('high');
    const ultra = getQualityPreset('ultra');
    expect(low.maxPixelRatio).toBeLessThanOrEqual(1.0);
    expect(low.shadowsEnabled).toBe(false);
    expect(med.shadowsEnabled).toBe(true);
    expect(low.drawDistance).toBeLessThan(med.drawDistance);
    expect(med.drawDistance).toBeLessThan(high.drawDistance);
    expect(high.drawDistance).toBeLessThan(ultra.drawDistance);
    expect(low.trafficCount).toBeLessThan(med.trafficCount);
    expect(med.trafficCount).toBeLessThan(high.trafficCount);
    expect(high.trafficCount).toBeLessThan(ultra.trafficCount);
    expect(low.pedestrianCount).toBeLessThan(ultra.pedestrianCount);
    expect(normalizeQualityTier('lite')).toBe('low');
    expect(normalizeQualityTier('normal')).toBe('high');
    expect(nextQualityTier('low')).toBe('medium');
    expect(nextQualityTier('ultra')).toBe('low');
  });

  it('suggests Low on low-memory/4-core, Medium on mid-range, High on modern Android devices', () => {
    expect(suggestQualityTier(8, 2)).toBe('low');
    expect(suggestQualityTier(4, 8)).toBe('low');
    expect(suggestQualityTier(6, 6)).toBe('medium');
    expect(suggestQualityTier(8, 8)).toBe('high');
  });

  it('cycles Vice City TimeCycle presets cleanly across Day -> Sunset -> Night -> Day', () => {
    expect(nextAtmospherePreset('day')).toBe('sunset');
    expect(nextAtmospherePreset('sunset')).toBe('night');
    expect(nextAtmospherePreset('night')).toBe('day');
    const sunset = getTimeCycleProfile('sunset');
    const night = getTimeCycleProfile('night');
    expect(sunset.windowEmissiveIntensity).toBeGreaterThan(0);
    expect(night.roadRoughness).toBeLessThan(getTimeCycleProfile('day').roadRoughness);
  });
});

describe('core/controls', () => {
  it('normalizes diagonal keyboard movement and respects touch deadzone', () => {
    const diag = mergeControlIntent(
      { forward: true, backward: false, left: false, right: true, sprint: true },
      { x: 0.05, y: 0.05 },
    );
    expect(Math.hypot(diag.moveX, diag.moveY)).toBeCloseTo(1, 5);
    expect(diag.sprint).toBe(true);

    const idle = mergeControlIntent(
      { forward: false, backward: false, left: false, right: false, sprint: false },
      { x: 0.05, y: -0.05 },
    );
    expect(idle.moveX).toBe(0);
    expect(idle.moveY).toBe(0);
  });
});

describe('core/sanctuary', () => {
  it('locks combat inside Ayasofya and Sultanahmet Camii precincts', () => {
    const ayasofya = FATIH_SANCTUARY_ZONES[0]!;
    expect(findSanctuaryZone(ayasofya.x, ayasofya.z)?.id).toBe('ayasofya');
    expect(isCombatAllowedAt(ayasofya.x, ayasofya.z)).toBe(false);
    expect(isCombatAllowedAt(500, 500)).toBe(true);
  });
});
