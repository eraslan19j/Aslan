import { describe, expect, it } from 'vitest';
import {
  ALIGHTING_DURATION_SEC,
  BOARDING_DURATION_SEC,
  buildBoardingPath,
  doorThresholdOffset,
  easeInOutCubic,
  localToWorld,
  sampleBoardingPath,
  seatWorldPosition,
} from './boardingPath';

describe('boarding path (v0.9.0 K2 door-synced enter animation)', () => {
  it('ease is monotonic, clamped and ends exactly at 1', () => {
    let prev = -1;
    for (let i = 0; i <= 100; i += 1) {
      const v = easeInOutCubic(i / 100);
      expect(v).toBeGreaterThanOrEqual(prev);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      prev = v;
    }
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(-5)).toBe(0);
    expect(easeInOutCubic(5)).toBe(1);
  });

  it('places the door threshold on the driver (left) side of the car', () => {
    const t = doorThresholdOffset(1.84, 2.15, 1);
    // With heading 0 the car faces +Z, so its left side is +X (right vector = +X).
    expect(t.right).toBeGreaterThan(1.3);
    const world = localToWorld(0, 0, 0, t.right, t.forward);
    expect(world.x).toBeGreaterThan(1.3);
    expect(Math.abs(world.z)).toBeLessThan(0.4);
  });

  it('seat sits inboard of the door threshold', () => {
    const seat = seatWorldPosition(0, 0, 0, 1.84);
    expect(Math.abs(seat.x)).toBeLessThan(1.0);
  });

  it('path starts at the door, ends at the seat, and never overshoots', () => {
    const path = buildBoardingPath(10, 20, 0.7, 1.84, 4.3, 5, 5.55);
    const start = sampleBoardingPath(path, 0);
    const end = sampleBoardingPath(path, 1);
    expect(start.x).toBeCloseTo(path.from.x, 6);
    expect(start.z).toBeCloseTo(path.from.z, 6);
    expect(end.x).toBeCloseTo(path.to.x, 6);
    expect(end.z).toBeCloseTo(path.to.z, 6);
    expect(end.y).toBeCloseTo(5.55, 6);

    // No sample may leave the start→end bounding box by more than the step lift.
    const minX = Math.min(path.from.x, path.to.x) - 0.001;
    const maxX = Math.max(path.from.x, path.to.x) + 0.001;
    for (let i = 0; i <= 60; i += 1) {
      const s = sampleBoardingPath(path, i / 60);
      expect(s.x).toBeGreaterThanOrEqual(minX);
      expect(s.x).toBeLessThanOrEqual(maxX);
    }
  });

  it('character never jumps more than 0.4 m between consecutive frames', () => {
    const path = buildBoardingPath(0, 0, 1.2, 1.98, 4.6, 0, 0.6);
    const fps = 60;
    const dt = 1 / fps;
    let prev = sampleBoardingPath(path, 0);
    for (let t = dt; t <= 1.0001; t += dt) {
      const cur = sampleBoardingPath(path, Math.min(1, t));
      const jump = Math.hypot(cur.x - prev.x, cur.y - prev.y, cur.z - prev.z);
      expect(jump).toBeLessThan(0.4);
      prev = cur;
    }
  });

  it('walks up into the cabin (vertical lift above both endpoints)', () => {
    const path = buildBoardingPath(0, 0, 0, 1.84, 4.3, 0, 0.31);
    const mid = sampleBoardingPath(path, 0.5);
    expect(mid.y).toBeGreaterThan(0.24);
  });

  it('uses the driver door on the left and sane durations', () => {
    expect(BOARDING_DURATION_SEC).toBeGreaterThan(0.25);
    expect(BOARDING_DURATION_SEC).toBeLessThan(0.8);
    expect(ALIGHTING_DURATION_SEC).toBeLessThan(BOARDING_DURATION_SEC);
  });
});
