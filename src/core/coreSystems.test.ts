import { describe, expect, it } from 'vitest';
import { FixedStepClock } from './gameLoop';
import { getQualityPreset, suggestQualityTier } from './quality';
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

describe('core/quality', () => {
  it('enforces tighter Lite budgets than Normal', () => {
    const normal = getQualityPreset('normal');
    const lite = getQualityPreset('lite');
    expect(normal.maxPixelRatio).toBeLessThanOrEqual(1.5);
    expect(lite.maxPixelRatio).toBeLessThanOrEqual(1.0);
    expect(lite.shadowsEnabled).toBe(false);
    expect(lite.drawDistance).toBeLessThan(normal.drawDistance);
  });

  it('suggests Lite on low-memory or 4-core devices', () => {
    expect(suggestQualityTier(8, 2)).toBe('lite');
    expect(suggestQualityTier(4, 8)).toBe('lite');
    expect(suggestQualityTier(8, 8)).toBe('normal');
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
