export interface Vec2 {
  x: number;
  z: number;
}

export function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Frame-rate independent exponential smoothing toward target. */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

export function normalizeAngle(angle: number): number {
  let a = angle % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  if (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** Shortest signed angle from `from` to `to` in [-PI, PI]. */
export function angleDelta(from: number, to: number): number {
  return normalizeAngle(to - from);
}

/**
 * Coordinate frame (single source of truth):
 * +X = East, +Z = South, +Y = Up.
 * Heading 0 points along +X and increases counter-clockwise toward -Z (North).
 */
export function forwardFromHeading(heading: number): Vec2 {
  return { x: Math.cos(heading), z: -Math.sin(heading) };
}

export function rightFromHeading(heading: number): Vec2 {
  return { x: Math.sin(heading), z: Math.cos(heading) };
}

export function distance2D(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(bx - ax, bz - az);
}

/** Max safe speed to stop within `gap` meters under deceleration `decel` (m/s^2). */
export function safeApproachSpeed(gap: number, decel: number): number {
  if (gap <= 0 || decel <= 0) return 0;
  return Math.sqrt(2 * decel * gap);
}
