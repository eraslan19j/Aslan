import { describe, expect, it } from 'vitest';
import { createStarterPhysicsWorld } from './physics';

describe('core/physics (Rapier3D WASM)', () => {
  it('initializes Rapier WASM, settles player onto ground, and moves on input', async () => {
    const phys = await createStarterPhysicsWorld();
    try {
      const start = phys.getPlayerPosition();
      // Let gravity settle onto plaza floor
      for (let i = 0; i < 60; i += 1) {
        phys.step(0, 0, false, 1 / 60);
      }
      const settled = phys.getPlayerPosition();
      expect(settled.y).toBeGreaterThan(0.4);
      expect(settled.y).toBeLessThan(1.1);

      // Walk east (+X) for 30 frames
      for (let i = 0; i < 30; i += 1) {
        phys.step(1, 0, false, 1 / 60);
      }
      const moved = phys.getPlayerPosition();
      expect(moved.x).toBeGreaterThan(start.x + 2.0);
    } finally {
      phys.dispose();
    }
  });
});
