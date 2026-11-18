/**
 * v0.9.0 — GTA-style door choreography for entering / exiting a car.
 *
 * Pure state machine (no three.js, no DOM) so it can be unit tested headlessly
 * and reused by both the walk-up boarding animation and the quick-exit path.
 *
 * Timeline:  closed → opening (0 → 1.12 rad) → boarding (dwell) → closing (→ 0)
 */

export type DoorPhase = 'closed' | 'opening' | 'boarding' | 'closing';

export interface DoorChoreography {
  phase: DoorPhase;
  /** Current hinge angle in radians. 0 = shut. */
  angle: number;
  /** Where the hinge is heading. */
  targetAngle: number;
  /** Seconds spent in the current phase. */
  phaseTimer: number;
}

export const DOOR_OPEN_ANGLE = 1.12;
export const DOOR_OPEN_SEC = 0.42;
export const DOOR_DWELL_SEC = 0.3;
export const DOOR_CLOSE_SEC = 0.36;

export function createDoorChoreography(): DoorChoreography {
  return { phase: 'closed', angle: 0, targetAngle: 0, phaseTimer: 0 };
}

export function startDoorSequence(d: DoorChoreography, mode: 'opening' | 'closing'): void {
  if (mode === 'closing') {
    d.phase = 'closing';
    d.phaseTimer = 0;
    d.targetAngle = 0;
    return;
  }
  // Re-opening while already closing must not snap: keep the current angle.
  d.phase = 'opening';
  d.phaseTimer = 0;
  d.targetAngle = DOOR_OPEN_ANGLE;
}

function durationFor(phase: DoorPhase): number {
  if (phase === 'closing') return DOOR_CLOSE_SEC;
  return DOOR_OPEN_SEC;
}

/**
 * Advances the door one frame.
 * Returns the same object (zero allocation) and the angle to push to the mesh.
 */
export function stepDoorChoreography(d: DoorChoreography, dt: number): DoorChoreography {
  if (d.phase === 'closed') {
    d.angle = 0;
    return d;
  }
  d.phaseTimer += dt;

  const rate = 1 / durationFor(d.phase);
  const delta = d.targetAngle - d.angle;
  const step = Math.sign(delta) * Math.min(Math.abs(delta), rate * dt);
  d.angle += step;

  if (d.phase === 'opening' && Math.abs(d.targetAngle - d.angle) < 0.02) {
    d.angle = d.targetAngle;
    d.phase = 'boarding';
    d.phaseTimer = 0;
  } else if (d.phase === 'boarding' && d.phaseTimer >= DOOR_DWELL_SEC) {
    d.phase = 'closing';
    d.phaseTimer = 0;
    d.targetAngle = 0;
  } else if (d.phase === 'closing' && d.angle < 0.02) {
    d.angle = 0;
    d.phase = 'closed';
    d.phaseTimer = 0;
  }
  return d;
}

/** Convenience wrapper: advance by `dt` and report the new angle. */
export function applyDoorChoreography(
  d: DoorChoreography,
  dt: number,
): { angle: number; phase: DoorPhase } {
  stepDoorChoreography(d, dt);
  return { angle: d.angle, phase: d.phase };
}
