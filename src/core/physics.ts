import RAPIER from '@dimforge/rapier3d-compat';
import { clamp } from './math';

let rapierInitPromise: Promise<void> | null = null;

/** Initializes embedded Rapier3D WASM once per runtime (works in Node tests and browsers). */
export async function ensureRapierReady(): Promise<void> {
  if (!rapierInitPromise) {
    rapierInitPromise = RAPIER.init();
  }
  await rapierInitPromise;
}

export interface PlayerBodySnapshot {
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
}

export interface StarterPhysicsWorld {
  step(moveX: number, moveZ: number, sprint: boolean, dt: number): PlayerBodySnapshot;
  getPlayerPosition(): PlayerBodySnapshot;
  resetPlayer(x?: number, y?: number, z?: number): void;
  dispose(): void;
}

const WALK_SPEED = 6.5;
const SPRINT_SPEED = 11.0;
const PLAZA_HALF_EXTENT = 44;

/**
 * M0 Rapier3D physics sandbox: flat coastal plaza floor + boundary bollards + dynamic player body.
 * Validates WASM bundling, rigid-body stepping, and collision response from day one.
 */
export async function createStarterPhysicsWorld(): Promise<StarterPhysicsWorld> {
  await ensureRapierReady();

  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.integrationParameters.dt = 1 / 60;

  // Ground plane box collider (top surface at y = 0)
  const groundBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(60, 0.5, 60), groundBody);

  // Low sea-wall collider along the shoreline (z = -24) so the player cannot walk into deep water
  const wallBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, 1.0, -24));
  world.createCollider(RAPIER.ColliderDesc.cuboid(60, 1.5, 0.8), wallBody);

  // Dynamic player body (locked rotations so avatar stays upright)
  const playerDesc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(0, 1.2, 6)
    .lockRotations()
    .setLinearDamping(4.0);
  const playerBody = world.createRigidBody(playerDesc);
  world.createCollider(
    RAPIER.ColliderDesc.capsule(0.45, 0.35).setFriction(0.1).setRestitution(0.0),
    playerBody,
  );

  const readSnapshot = (): PlayerBodySnapshot => {
    const t = playerBody.translation();
    const v = playerBody.linvel();
    return { x: t.x, y: t.y, z: t.z, vx: v.x, vz: v.z };
  };

  return {
    step(moveX: number, moveZ: number, sprint: boolean, dt: number): PlayerBodySnapshot {
      world.integrationParameters.dt = clamp(dt, 1 / 240, 1 / 20);
      const speed = sprint ? SPRINT_SPEED : WALK_SPEED;
      const curVel = playerBody.linvel();
      playerBody.setLinvel({ x: moveX * speed, y: curVel.y, z: moveZ * speed }, true);
      world.step();

      // Keep inside M0 starter plaza bounds cleanly
      const t = playerBody.translation();
      const clampedX = clamp(t.x, -PLAZA_HALF_EXTENT, PLAZA_HALF_EXTENT);
      const clampedZ = clamp(t.z, -22.5, PLAZA_HALF_EXTENT);
      if (clampedX !== t.x || clampedZ !== t.z || t.y < -5) {
        playerBody.setTranslation(
          { x: clampedX, y: t.y < -5 ? 1.2 : t.y, z: clampedZ },
          true,
        );
      }
      return readSnapshot();
    },

    getPlayerPosition(): PlayerBodySnapshot {
      return readSnapshot();
    },

    resetPlayer(x = 0, y = 1.2, z = 6): void {
      playerBody.setTranslation({ x, y, z }, true);
      playerBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    },

    dispose(): void {
      world.free();
    },
  };
}
