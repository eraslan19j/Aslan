import { describe, expect, it } from 'vitest';
import {
  applyDoorChoreography,
  createDoorChoreography,
  DOOR_OPEN_ANGLE,
  startDoorSequence,
  stepDoorChoreography,
} from '../render/doorChoreography';

describe('door choreography (v0.9.0 enter/exit animation)', () => {
  it('starts closed', () => {
    const d = createDoorChoreography();
    expect(d.phase).toBe('closed');
    expect(d.angle).toBe(0);
  });

  it('swings the door open to the hinge limit', () => {
    const d = createDoorChoreography();
    startDoorSequence(d, 'opening');
    const result = applyDoorChoreography(d, 1.0);
    expect(result.angle).toBeGreaterThan(1.0);
    expect(result.angle).toBeLessThanOrEqual(DOOR_OPEN_ANGLE + 1e-6);
  });

  it('dwells then automatically closes', () => {
    const d = createDoorChoreography();
    startDoorSequence(d, 'opening');
    stepDoorChoreography(d, 0.6);
    expect(d.phase === 'boarding' || d.phase === 'opening').toBe(true);
    stepDoorChoreography(d, 0.4);
    stepDoorChoreography(d, 0.6);
    stepDoorChoreography(d, 0.6);
    expect(d.angle).toBeLessThan(0.05);
  });

  it('never overshoots the open limit', () => {
    const d = createDoorChoreography();
    startDoorSequence(d, 'opening');
    for (let i = 0; i < 100; i += 1) stepDoorChoreography(d, 0.016);
    expect(d.angle).toBeLessThanOrEqual(DOOR_OPEN_ANGLE + 1e-6);
  });

  it('a manual close from the open state reaches zero', () => {
    const d = createDoorChoreography();
    startDoorSequence(d, 'opening');
    stepDoorChoreography(d, 0.5);
    startDoorSequence(d, 'closing');
    for (let i = 0; i < 60; i += 1) stepDoorChoreography(d, 0.016);
    expect(d.angle).toBe(0);
    expect(d.phase).toBe('closed');
  });

  it('re-opening mid-close does not snap back to zero', () => {
    const d = createDoorChoreography();
    startDoorSequence(d, 'opening');
    stepDoorChoreography(d, 0.2);
    const mid = d.angle;
    expect(mid).toBeGreaterThan(0.1);
    startDoorSequence(d, 'closing');
    stepDoorChoreography(d, 0.05);
    startDoorSequence(d, 'opening');
    stepDoorChoreography(d, 0.016);
    expect(d.angle).toBeGreaterThan(0.05);
  });
});
