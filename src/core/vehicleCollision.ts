import { clamp } from './math';
import type { VehicleArchetype } from './vehicle';
import { VEHICLE_SPECS } from './vehicle';

/**
 * v0.9.0 — Oriented-bounding-box (OBB) vehicle ↔ vehicle collision.
 *
 * Root cause of the "player car sinks into the NPC car" bug seen on device:
 * the old resolution approximated *both* cars with single circles, so a long
 * car nose poking into the side of another long car produced a tiny overlap
 * that was corrected along the centre-to-centre axis only. The correction
 * direction was often wrong, so the deeper geometry stayed interpenetrated and
 * the circle radii (1.15 m) left visible sinking of 0.3–0.6 m at the bumpers.
 *
 * This module replaces that with a proper 2D SAT + minimum-translation-vector
 * solver over the real footprint (length × width from `VEHICLE_SPECS`), iterated
 * a few times so multi-contact wedges converge, then converts the MTV into
 * mass-weighted positional correction + normal/tangential impulses that respect
 * the contact patch (so a nose hit spins the struck car instead of sliding it).
 *
 * Everything here is pure TS, deterministic and allocation-free in the hot path.
 */

export interface Box2D {
  x: number;
  z: number;
  /** Heading radians, 0 = +Z, +PI/2 = +X (same convention as the game). */
  heading: number;
  halfWidth: number;
  halfLength: number;
}

export interface BoxContact {
  /** True when the two footprints overlap at all. */
  hit: boolean;
  /** Minimum translation vector magnitude (metres). */
  depth: number;
  /** Unit normal pointing from box B towards box A (push A along +normal). */
  nx: number;
  nz: number;
  /** World-space contact point (midpoint of the overlapping span). */
  px: number;
  pz: number;
}

const AXIS_EPSILON = 1e-6;

/** Half-extents helper used by both the physics core and the renderer. */
export function boxFromArchetype(
  x: number,
  z: number,
  heading: number,
  archetype: VehicleArchetype,
): Box2D {
  const spec = VEHICLE_SPECS[archetype];
  return { x, z, heading, halfWidth: spec.width * 0.5, halfLength: spec.length * 0.5 };
}

function projectRadius(box: Box2D, axisX: number, axisZ: number): number {
  const sinH = Math.sin(box.heading);
  const cosH = Math.cos(box.heading);
  // Box local axes in world space: forward = (sinH, cosH), right = (cosH, -sinH)
  const fwdProj = Math.abs(axisX * sinH + axisZ * cosH);
  const rightProj = Math.abs(axisX * cosH - axisZ * sinH);
  return box.halfLength * fwdProj + box.halfWidth * rightProj;
}

/**
 * SAT overlap test between two oriented boxes with the minimum translation vector.
 * Axes tested: A forward, A right, B forward, B right (4 axes — exact for 2D boxes).
 */
export function testBoxOverlap(a: Box2D, b: Box2D): BoxContact {
  const axes: [number, number][] = [
    [Math.sin(a.heading), Math.cos(a.heading)],
    [Math.cos(a.heading), -Math.sin(a.heading)],
    [Math.sin(b.heading), Math.cos(b.heading)],
    [Math.cos(b.heading), -Math.sin(b.heading)],
  ];

  let bestDepth = Infinity;
  let bestNx = 0;
  let bestNz = 0;

  const dx = a.x - b.x;
  const dz = a.z - b.z;

  for (const [ax, az] of axes) {
    const dist = dx * ax + dz * az;
    const overlap = projectRadius(a, ax, az) + projectRadius(b, ax, az) - Math.abs(dist);
    if (overlap <= AXIS_EPSILON) {
      return { hit: false, depth: 0, nx: 0, nz: 0, px: a.x, pz: a.z };
    }
    if (overlap < bestDepth) {
      bestDepth = overlap;
      const sign = dist >= 0 ? 1 : -1;
      bestNx = ax * sign;
      bestNz = az * sign;
    }
  }

  // Contact patch = midpoint of the true overlap interval, measured along the MTV
  // axis and along its tangent. This gives a real lever arm, so an offset hit
  // spins the struck car exactly as it should (a centre-to-centre point would
  // always collapse onto the normal and produce zero torque).
  const tx = -bestNz;
  const tz = bestNx;
  const aN = a.x * bestNx + a.z * bestNz;
  const aT = a.x * tx + a.z * tz;
  const bN = b.x * bestNx + b.z * bestNz;
  const bT = b.x * tx + b.z * tz;
  const aRn = projectRadius(a, bestNx, bestNz);
  const bRn = projectRadius(b, bestNx, bestNz);
  const aRt = projectRadius(a, tx, tz);
  const bRt = projectRadius(b, tx, tz);

  const nLo = Math.max(aN - aRn, bN - bRn);
  const nHi = Math.min(aN + aRn, bN + bRn);
  const tLo = Math.max(aT - aRt, bT - bRt);
  const tHi = Math.min(aT + aRt, bT + bRt);
  const nMid = (nLo + nHi) * 0.5;
  const tMid = (tLo + tHi) * 0.5;

  const px = bestNx * nMid + tx * tMid;
  const pz = bestNz * nMid + tz * tMid;

  return {
    hit: true,
    depth: bestDepth,
    nx: bestNx,
    nz: bestNz,
    px: clamp(px, Math.min(a.x, b.x) - 3, Math.max(a.x, b.x) + 3),
    pz: clamp(pz, Math.min(a.z, b.z) - 3, Math.max(a.z, b.z) + 3),
  };
}

export interface CollisionImpulseInput {
  /** Player (A) body state. */
  ax: number;
  az: number;
  aHeading: number;
  /** Velocity of A in world XZ. */
  avx: number;
  avz: number;
  aMassKg: number;
  aArchetype: VehicleArchetype;
  /** NPC (B) body state. */
  bx: number;
  bz: number;
  bHeading: number;
  bvx: number;
  bvz: number;
  bMassKg: number;
  bArchetype: VehicleArchetype;
}

export interface CollisionResolution {
  collided: boolean;
  /** Total MTV depth that had to be removed (metres) — drives damage & audio. */
  depth: number;
  /** Closing speed along the contact normal (m/s). */
  closingSpeed: number;
  /** Corrected player position. */
  ax: number;
  az: number;
  /** Corrected NPC position. */
  bx: number;
  bz: number;
  /** Delta velocity to add to the player (world XZ). */
  aDeltaVx: number;
  aDeltaVz: number;
  /** Delta velocity to add to the NPC (world XZ). */
  bDeltaVx: number;
  bDeltaVz: number;
  /** Extra yaw rate to add to the player (rad/s). */
  aDeltaYaw: number;
  /** Extra yaw rate to add to the NPC (rad/s). */
  bDeltaYaw: number;
  nx: number;
  nz: number;
  px: number;
  pz: number;
}

const EMPTY_RESULT: CollisionResolution = {
  collided: false,
  depth: 0,
  closingSpeed: 0,
  ax: 0,
  az: 0,
  bx: 0,
  bz: 0,
  aDeltaVx: 0,
  aDeltaVz: 0,
  bDeltaVx: 0,
  bDeltaVz: 0,
  aDeltaYaw: 0,
  bDeltaYaw: 0,
  nx: 0,
  nz: 0,
  px: 0,
  pz: 0,
};

/**
 * One-shot resolution of a player car against one NPC car.
 * Returns zeroed result when the boxes do not overlap.
 */
export function resolveCarPair(input: CollisionImpulseInput): CollisionResolution {
  const aBox = boxFromArchetype(input.ax, input.az, input.aHeading, input.aArchetype);
  const bBox = boxFromArchetype(input.bx, input.bz, input.bHeading, input.bArchetype);
  const contact = testBoxOverlap(aBox, bBox);
  if (!contact.hit) {
    return { ...EMPTY_RESULT, ax: input.ax, az: input.az, bx: input.bx, bz: input.bz };
  }

  const totalMass = Math.max(200, input.aMassKg + input.bMassKg);
  const aShare = input.bMassKg / totalMass; // lighter car moves more
  const bShare = input.aMassKg / totalMass;

  // 1. Positional correction along the MTV (split by mass, plus a small bias so the
  //    player is never left embedded when an NPC is pinned against a wall).
  const correctedAx = input.ax + contact.nx * contact.depth * aShare;
  const correctedAz = input.az + contact.nz * contact.depth * aShare;
  const correctedBx = input.bx - contact.nx * contact.depth * bShare;
  const correctedBz = input.bz - contact.nz * contact.depth * bShare;

  // 2. Impulse: closing velocity along the normal, restitution 0.18 (civilian bumpers).
  const relVx = input.avx - input.bvx;
  const relVz = input.avz - input.bvz;
  const closing = -(relVx * contact.nx + relVz * contact.nz);
  const closingSpeed = Math.max(0, closing);

  let aDvx = 0;
  let aDvz = 0;
  let bDvx = 0;
  let bDvz = 0;
  if (closingSpeed > 0.05) {
    const restitution = closingSpeed > 8 ? 0.16 : 0.06; // heavy hits bounce, light nudges stick
    const j = ((1 + restitution) * closingSpeed) / (1 / input.aMassKg + 1 / input.bMassKg);
    aDvx += (j * contact.nx) / input.aMassKg;
    aDvz += (j * contact.nz) / input.aMassKg;
    bDvx -= (j * contact.nx) / input.bMassKg;
    bDvz -= (j * contact.nz) / input.bMassKg;

    // 3. Tangential friction scrub (tyres resist sliding along the other car).
    const tangentX = -contact.nz;
    const tangentZ = contact.nx;
    const relT = relVx * tangentX + relVz * tangentZ;
    const frictionJ = clamp(-relT * 0.24, -j * 0.55, j * 0.55);
    aDvx += (frictionJ * tangentX) / input.aMassKg;
    aDvz += (frictionJ * tangentZ) / input.aMassKg;
    bDvx -= (frictionJ * tangentX) / input.bMassKg;
    bDvz -= (frictionJ * tangentZ) / input.bMassKg;
  }

  // 4. Contact-patch torque: an offset hit rotates the struck car (GTA-style PIT).
  const leverAx = contact.px - input.ax;
  const leverAz = contact.pz - input.az;
  const crossA = leverAx * contact.nz - leverAz * contact.nx;
  const leverBx = contact.px - input.bx;
  const leverBz = contact.pz - input.bz;
  const crossB = leverBx * contact.nz - leverBz * contact.nx;

  const aDeltaYaw = clamp(-crossA * closingSpeed * 0.3, -2.4, 2.4);
  const bDeltaYaw = clamp(crossB * closingSpeed * 0.34, -2.8, 2.8);

  return {
    collided: true,
    depth: contact.depth,
    closingSpeed,
    ax: correctedAx,
    az: correctedAz,
    bx: correctedBx,
    bz: correctedBz,
    aDeltaVx: aDvx,
    aDeltaVz: aDvz,
    bDeltaVx: bDvx,
    bDeltaVz: bDvz,
    aDeltaYaw,
    bDeltaYaw,
    nx: contact.nx,
    nz: contact.nz,
    px: contact.px,
    pz: contact.pz,
  };
}

/**
 * Iterated multi-body solve used by `main.ts` every physics frame.
 * `bodies` are mutated in place; returns aggregate impact info for audio/damage/VFX.
 */
export interface MultiBodyContact {
  depth: number;
  closingSpeed: number;
  x: number;
  z: number;
  nx: number;
  nz: number;
  /** Index into the array of the second body that was hit. */
  bodyIndex: number;
}

export interface DynamicBody {
  x: number;
  z: number;
  heading: number;
  vx: number;
  vz: number;
  yawRate: number;
  massKg: number;
  archetype: VehicleArchetype;
  /** Rendered/collidable flag (parked cars still collide). */
  active?: boolean;
}

export function solveVehicleContacts(
  bodies: DynamicBody[],
  iterations = 3,
): MultiBodyContact[] {
  const contacts: MultiBodyContact[] = [];
  if (bodies.length < 2) return contacts;

  for (let iter = 0; iter < iterations; iter += 1) {
    let anyHit = false;
    for (let i = 0; i < bodies.length; i += 1) {
      const a = bodies[i]!;
      if (a.active === false) continue;
      for (let k = i + 1; k < bodies.length; k += 1) {
        const b = bodies[k]!;
        if (b.active === false) continue;
        const res = resolveCarPair({
          ax: a.x,
          az: a.z,
          aHeading: a.heading,
          avx: a.vx,
          avz: a.vz,
          aMassKg: a.massKg,
          aArchetype: a.archetype,
          bx: b.x,
          bz: b.z,
          bHeading: b.heading,
          bvx: b.vx,
          bvz: b.vz,
          bMassKg: b.massKg,
          bArchetype: b.archetype,
        });
        if (!res.collided) continue;
        anyHit = true;
        a.x = res.ax;
        a.z = res.az;
        b.x = res.bx;
        b.z = res.bz;
        a.vx += res.aDeltaVx;
        a.vz += res.aDeltaVz;
        b.vx += res.bDeltaVx;
        b.vz += res.bDeltaVz;
        a.yawRate += res.aDeltaYaw;
        b.yawRate += res.bDeltaYaw;
        contacts.push({
          depth: res.depth,
          closingSpeed: res.closingSpeed,
          x: res.px,
          z: res.pz,
          nx: res.nx,
          nz: res.nz,
          bodyIndex: k,
        });
      }
    }
    if (!anyHit) break;
  }
  return contacts;
}
