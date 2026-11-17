import { clamp } from './math';
import type { BuildingSpatialGrid } from './world/collision';

export type PlayerStateMode = 'on_foot' | 'seated_driving';

export interface VehicleColliderOBB {
  id: string;
  x: number;
  z: number;
  /** Heading radians where 0 = +Z, +PI/2 = +X. */
  heading: number;
  halfWidth: number;
  halfLength: number;
}

export interface PlayerCapsuleState {
  mode: PlayerStateMode;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  facingYaw: number;
  grounded: boolean;
  slopeAngle: number;
  radius: number;
  occupiedVehicleId: string | null;
}

export interface PlayerMoveBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface PlayerStepResult {
  collidedBuilding: boolean;
  collidedVehicleId: string | null;
  horizontalSpeed: number;
  grounded: boolean;
  slopeAngle: number;
}

export const PLAYER_CAPSULE_RADIUS = 0.52;
export const WALK_SPEED_MPS = 6.8;
export const SPRINT_SPEED_MPS = 13.8;
const GROUND_ACCEL = 40.0;
const GROUND_DECEL = 46.0;
const MAX_SUBSTEP_DIST = 0.25;
const MAX_CLIMB_SLOPE_SIN = 0.62; // ~38 deg max walkable incline

export function createPlayerCapsuleState(x: number, y: number, z: number): PlayerCapsuleState {
  return {
    mode: 'on_foot',
    x,
    y,
    z,
    vx: 0,
    vz: 0,
    facingYaw: 0,
    grounded: true,
    slopeAngle: 0,
    radius: PLAYER_CAPSULE_RADIUS,
    occupiedVehicleId: null,
  };
}

/**
 * Exact 2D circle-vs-oriented-box (OBB) resolution in XZ plane.
 * Guarantees on-foot player and pedestrians can NEVER walk through parked or moving vehicles.
 */
export function resolveCircleAgainstVehicleOBB(
  px: number,
  pz: number,
  radius: number,
  obb: VehicleColliderOBB,
): { x: number; z: number; hit: boolean; nx: number; nz: number } {
  const sinH = Math.sin(obb.heading);
  const cosH = Math.cos(obb.heading);
  // Vehicle local axes: forward = (sinH, cosH), right = (cosH, -sinH)
  const dx = px - obb.x;
  const dz = pz - obb.z;

  // Quick bounding circle reject
  const maxR = Math.hypot(obb.halfWidth, obb.halfLength) + radius;
  if (dx * dx + dz * dz > maxR * maxR) {
    return { x: px, z: pz, hit: false, nx: 0, nz: 0 };
  }

  const localFwd = dx * sinH + dz * cosH;
  const localRight = dx * cosH - dz * sinH;

  const clampedFwd = clamp(localFwd, -obb.halfLength, obb.halfLength);
  const clampedRight = clamp(localRight, -obb.halfWidth, obb.halfWidth);

  const diffFwd = localFwd - clampedFwd;
  const diffRight = localRight - clampedRight;
  const distSq = diffFwd * diffFwd + diffRight * diffRight;

  if (distSq >= radius * radius) {
    return { x: px, z: pz, hit: false, nx: 0, nz: 0 };
  }

  let localNx: number;
  let localNz: number; // localFwd axis
  let pushDist: number;

  if (distSq > 1e-8) {
    const dist = Math.sqrt(distSq);
    localNx = diffRight / dist;
    localNz = diffFwd / dist;
    pushDist = radius - dist;
  } else {
    // Center is inside OBB: push out through the closest side face
    const penRight = obb.halfWidth - Math.abs(localRight);
    const penFwd = obb.halfLength - Math.abs(localFwd);
    if (penRight <= penFwd) {
      localNx = localRight >= 0 ? 1 : -1;
      localNz = 0;
      pushDist = penRight + radius;
    } else {
      localNx = 0;
      localNz = localFwd >= 0 ? 1 : -1;
      pushDist = penFwd + radius;
    }
  }

  // Transform push normal back to world XZ
  const worldNx = localNx * cosH + localNz * sinH;
  const worldNz = -localNx * sinH + localNz * cosH;
  return {
    x: px + worldNx * pushDist,
    z: pz + worldNz * pushDist,
    hit: true,
    nx: worldNx,
    nz: worldNz,
  };
}

/**
 * Transitions player cleanly into seated driving mode:
 * disables foot locomotion and ignores self-collision with the occupied vehicle.
 */
export function attachPlayerToVehicleSeat(
  player: PlayerCapsuleState,
  vehicleId: string,
  vx: number,
  vy: number,
  vz: number,
): void {
  player.mode = 'seated_driving';
  player.occupiedVehicleId = vehicleId;
  player.x = vx;
  player.y = vy;
  player.z = vz;
  player.vx = 0;
  player.vz = 0;
  player.grounded = true;
}

/**
 * Transitions player cleanly back to on-foot mode at a validated clear exit spot
 * and immediately restores full building + vehicle capsule collisions.
 */
export function detachPlayerFromVehicleSeat(
  player: PlayerCapsuleState,
  exitX: number,
  exitY: number,
  exitZ: number,
): void {
  player.mode = 'on_foot';
  player.occupiedVehicleId = null;
  player.x = exitX;
  player.y = exitY;
  player.z = exitZ;
  player.vx = 0;
  player.vz = 0;
  player.grounded = true;
}

/**
 * Grounded third-person capsule locomotion controller (GTA Vice City / OpenCity standard):
 * - Smooth acceleration & snappy stopping friction (eliminates foot skating/sliding).
 * - Reliable terrain elevation grounding + slope speed modulation.
 * - Sub-stepped collision against BOTH exact 2D building polygons AND all vehicle OBBs.
 */
export function stepOnFootPlayer(
  player: PlayerCapsuleState,
  inputMoveX: number,
  inputMoveY: number,
  sprint: boolean,
  cameraYaw: number,
  dt: number,
  bounds: PlayerMoveBounds,
  sampleElev: (x: number, z: number) => number,
  spatialGrid: BuildingSpatialGrid,
  vehicles: readonly VehicleColliderOBB[],
): PlayerStepResult {
  if (player.mode !== 'on_foot') {
    player.vx = 0;
    player.vz = 0;
    return {
      collidedBuilding: false,
      collidedVehicleId: null,
      horizontalSpeed: 0,
      grounded: true,
      slopeAngle: 0,
    };
  }

  const fwdX = -Math.sin(cameraYaw);
  const fwdZ = -Math.cos(cameraYaw);
  const rightX = Math.cos(cameraYaw);
  const rightZ = -Math.sin(cameraYaw);

  const wishX = rightX * inputMoveX + fwdX * inputMoveY;
  const wishZ = rightZ * inputMoveX + fwdZ * inputMoveY;
  const wishMag = Math.min(1, Math.hypot(wishX, wishZ));

  // Measure terrain slope ahead in desired travel direction
  let slopeSin = 0;
  if (wishMag > 0.05) {
    const dirX = wishX / Math.max(1e-5, Math.hypot(wishX, wishZ));
    const dirZ = wishZ / Math.max(1e-5, Math.hypot(wishX, wishZ));
    const curY = sampleElev(player.x, player.z);
    const aheadY = sampleElev(player.x + dirX * 0.9, player.z + dirZ * 0.9);
    slopeSin = clamp((aheadY - curY) / 0.9, -0.75, 0.75);
  }
  player.slopeAngle = Math.asin(clamp(slopeSin, -0.7, 0.7));

  // Gentle uphill slowdown & steep cliff rejection (keeps hillside traversal natural, zero sliding)
  const uphillFactor =
    slopeSin > MAX_CLIMB_SLOPE_SIN
      ? 0.2
      : slopeSin > 0.12
        ? clamp(1 - (slopeSin - 0.12) * 0.75, 0.55, 1.0)
        : 1.0;

  const topSpeed = (sprint ? SPRINT_SPEED_MPS : WALK_SPEED_MPS) * uphillFactor;
  const targetVx = wishMag > 0.02 ? (wishX / Math.hypot(wishX, wishZ)) * wishMag * topSpeed : 0;
  const targetVz = wishMag > 0.02 ? (wishZ / Math.hypot(wishX, wishZ)) * wishMag * topSpeed : 0;

  const rate = wishMag > 0.02 ? GROUND_ACCEL : GROUND_DECEL;
  const dvx = targetVx - player.vx;
  const dvz = targetVz - player.vz;
  const dvLen = Math.hypot(dvx, dvz);
  const maxChange = rate * dt;
  if (dvLen <= maxChange || dvLen < 1e-5) {
    player.vx = targetVx;
    player.vz = targetVz;
  } else {
    player.vx += (dvx / dvLen) * maxChange;
    player.vz += (dvz / dvLen) * maxChange;
  }

  // Zero out micro-creep so character plants feet firmly when stopped
  if (wishMag <= 0.02 && Math.hypot(player.vx, player.vz) < 0.08) {
    player.vx = 0;
    player.vz = 0;
  }

  // Sub-stepped horizontal integration prevents tunneling even during high-speed sprinting
  const moveDist = Math.hypot(player.vx * dt, player.vz * dt);
  const subSteps = Math.max(1, Math.min(8, Math.ceil(moveDist / MAX_SUBSTEP_DIST)));
  const subDt = dt / subSteps;

  let collidedBuilding = false;
  let collidedVehicleId: string | null = null;
  let curX = player.x;
  let curZ = player.z;

  for (let s = 0; s < subSteps; s += 1) {
    curX = clamp(curX + player.vx * subDt, bounds.minX, bounds.maxX);
    curZ = clamp(curZ + player.vz * subDt, bounds.minZ, bounds.maxZ);

    // 1. Static environment (exact 2D building footprints)
    const bRes = spatialGrid.resolveCircle(curX, curZ, player.radius);
    if (bRes.collided) {
      collidedBuilding = true;
      curX = bRes.x;
      curZ = bRes.z;
      const vn = player.vx * bRes.normalX + player.vz * bRes.normalZ;
      if (vn < 0) {
        player.vx -= vn * bRes.normalX;
        player.vz -= vn * bRes.normalZ;
      }
    }

    // 2. Dynamic vehicles (parked taxi, AI traffic, Şehir Polisi OBB colliders!)
    for (const veh of vehicles) {
      if (veh.id === player.occupiedVehicleId) continue;
      const vRes = resolveCircleAgainstVehicleOBB(curX, curZ, player.radius, veh);
      if (vRes.hit) {
        collidedVehicleId = veh.id;
        curX = vRes.x;
        curZ = vRes.z;
        const vn = player.vx * vRes.nx + player.vz * vRes.nz;
        if (vn < 0) {
          player.vx -= vn * vRes.nx;
          player.vz -= vn * vRes.nz;
        }
      }
    }

    // Re-check buildings once after vehicle push so player cannot be wedged into a wall by a car
    if (collidedVehicleId !== null) {
      const bAfter = spatialGrid.resolveCircle(curX, curZ, player.radius);
      if (bAfter.collided) {
        collidedBuilding = true;
        curX = bAfter.x;
        curZ = bAfter.z;
      }
    }
  }

  player.x = curX;
  player.z = curZ;
  player.y = sampleElev(curX, curZ);
  player.grounded = true;

  const hSpeed = Math.hypot(player.vx, player.vz);
  if (hSpeed > 0.25) {
    player.facingYaw = Math.atan2(player.vx, player.vz);
  }

  return {
    collidedBuilding,
    collidedVehicleId,
    horizontalSpeed: hSpeed,
    grounded: player.grounded,
    slopeAngle: player.slopeAngle,
  };
}
