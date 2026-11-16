import { describe, expect, it } from 'vitest';
import {
  angleDelta,
  clamp,
  damp,
  distance2D,
  forwardFromHeading,
  lerp,
  normalizeAngle,
  rightFromHeading,
  safeApproachSpeed,
} from './math';

describe('core/math', () => {
  it('clamps values to [min, max]', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-2, 0, 10)).toBe(0);
    expect(clamp(12, 0, 10)).toBe(10);
  });

  it('interpolates linearly and damps exponentially', () => {
    expect(lerp(10, 20, 0.25)).toBe(12.5);
    const stepA = damp(0, 10, 5, 0.1);
    const stepB = damp(damp(0, 10, 5, 0.05), 10, 5, 0.05);
    // Frame-rate independence: two 0.05s steps equal one 0.1s step
    expect(stepA).toBeCloseTo(stepB, 6);
  });

  it('normalizes angles and computes shortest signed angleDelta', () => {
    expect(normalizeAngle(Math.PI * 3)).toBeCloseTo(Math.PI, 6);
    expect(angleDelta(Math.PI * 0.9, -Math.PI * 0.9)).toBeCloseTo(Math.PI * 0.2, 6);
    expect(angleDelta(-Math.PI * 0.9, Math.PI * 0.9)).toBeCloseTo(-Math.PI * 0.2, 6);
  });

  it('follows the single-source coordinate frame (+X east, -Z north, heading 0 = +X)', () => {
    const f0 = forwardFromHeading(0);
    expect(f0.x).toBeCloseTo(1, 6);
    expect(f0.z).toBeCloseTo(0, 6);

    const fNorth = forwardFromHeading(Math.PI / 2);
    expect(fNorth.x).toBeCloseTo(0, 6);
    expect(fNorth.z).toBeCloseTo(-1, 6);

    const r0 = rightFromHeading(0);
    expect(r0.x).toBeCloseTo(0, 6);
    expect(r0.z).toBeCloseTo(1, 6);
  });

  it('computes 2D distance and safe braking approach speed', () => {
    expect(distance2D(0, 0, 3, 4)).toBe(5);
    expect(safeApproachSpeed(0, 10)).toBe(0);
    expect(safeApproachSpeed(-5, 10)).toBe(0);
    expect(safeApproachSpeed(20, 10)).toBeCloseTo(20, 6);
  });
});
