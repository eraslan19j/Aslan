/**
 * v0.9.0 (K2) — Boarding / alighting arcs.
 *
 * The v0.9.0 door animation opened the door but the character still teleported into
 * the seat. This module produces the *path* the character walks: from the door
 * threshold to the seat (and back out), as a smooth cubic ease that is guaranteed
 * to be monotonic and jump-free — the two properties a phone player notices if they
 * are missing.
 *
 * Pure maths, no three.js, so it is unit tested headlessly.
 */

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export interface BoardingPath {
  from: Vec3Like;
  to: Vec3Like;
  /** Total seconds for the walk-in. */
  durationSec: number;
}

export const BOARDING_DURATION_SEC = 0.42;
export const ALIGHTING_DURATION_SEC = 0.36;

/** Cubic ease-in-out: monotonic on [0,1], zero velocity at both ends. */
export function easeInOutCubic(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

/**
 * The driver door threshold in car-local metres: just outside the driver door,
 * level with the B-pillar. `side` is +1 for left-hand drive (Istanbul).
 */
export function doorThresholdOffset(
  widthM: number,
  halfLengthM: number,
  side: 1 | -1 = 1,
): { right: number; forward: number } {
  return {
    right: side * (widthM * 0.5 + 0.42),
    forward: halfLengthM * 0.12,
  };
}

/** Rotates a car-local (right, forward) offset into world space. */
export function localToWorld(
  carX: number,
  carZ: number,
  heading: number,
  right: number,
  forward: number,
): { x: number; z: number } {
  const sinH = Math.sin(heading);
  const cosH = Math.cos(heading);
  // right = (cos, -sin), forward = (sin, cos)
  return {
    x: carX + right * cosH + forward * sinH,
    z: carZ - right * sinH + forward * cosH,
  };
}

/** Seat position in world space (slightly behind the B-pillar, inboard). */
export function seatWorldPosition(
  carX: number,
  carZ: number,
  heading: number,
  widthM: number,
): { x: number; z: number } {
  return localToWorld(carX, carZ, heading, widthM * 0.18, -0.12);
}

/**
 * Samples the boarding path at normalised time `t` (0 = at the door, 1 = seated).
 * The vertical component rises slightly mid-way so the character "steps up" into
 * the cabin instead of sliding through the sill.
 */
export function sampleBoardingPath(
  path: BoardingPath,
  t: number,
): { x: number; y: number; z: number } {
  const e = easeInOutCubic(t);
  const lift = Math.sin(Math.PI * e) * 0.16;
  return {
    x: path.from.x + (path.to.x - path.from.x) * e,
    y: path.from.y + (path.to.y - path.from.y) * e + lift,
    z: path.from.z + (path.to.z - path.from.z) * e,
  };
}

/**
 * Builds the walk-in path for a car at (x,z) facing `heading`.
 * `groundY` is the road height at the door threshold.
 */
export function buildBoardingPath(
  carX: number,
  carZ: number,
  heading: number,
  widthM: number,
  lengthM: number,
  groundY: number,
  seatY: number,
): BoardingPath {
  const threshold = doorThresholdOffset(widthM, lengthM * 0.5, 1);
  const from2 = localToWorld(carX, carZ, heading, threshold.right, threshold.forward);
  const to2 = seatWorldPosition(carX, carZ, heading, widthM);
  return {
    from: { x: from2.x, y: groundY + 0.24, z: from2.z },
    to: { x: to2.x, y: seatY, z: to2.z },
    durationSec: BOARDING_DURATION_SEC,
  };
}

/** Which door the boarding animation uses (Istanbul is left-hand drive → left). */
export const DRIVER_DOOR_SIDE: 'left' | 'right' = 'left';
