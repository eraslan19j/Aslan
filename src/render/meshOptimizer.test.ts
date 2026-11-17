import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createCharacterRig, poseCharacterSeated } from './characterMesh';
import { optimizeStaticGeometry } from './meshOptimizer';

describe('Phase 6 & 7 Render Rig & Mobile Optimization Verification (TEST 3b & TEST 10b)', () => {
  it('TEST 3b: Character rig mounts into a driver seat group and poses visibly seated with shadow hidden', () => {
    const dummyTex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    const driverSeatMount = new THREE.Group();
    const charRig = createCharacterRig(dummyTex);

    driverSeatMount.add(charRig.root);
    poseCharacterSeated(charRig, 0.35);

    expect(charRig.root.parent).toBe(driverSeatMount);
    expect(charRig.root.visible).toBe(true);
    expect(charRig.shadowDisc.visible).toBe(false);
    expect(charRig.leftLegPivot.rotation.x).toBeLessThan(-1.0);
    expect(charRig.leftArmPivot.rotation.x).toBeLessThan(-0.8);

    for (const g of charRig.geometries) g.dispose();
    for (const m of charRig.materials) m.dispose();
    dummyTex.dispose();
  });

  it('TEST 10b: Static geometry optimizer welds duplicate quad vertices into indexed GPU buffer', () => {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array([
      0, 0, 0, 1, 0, 0, 1, 1, 0,
      0, 0, 0, 1, 1, 0, 0, 1, 0,
    ]);
    const nor = new Float32Array([
      0, 0, 1, 0, 0, 1, 0, 0, 1,
      0, 0, 1, 0, 0, 1, 0, 0, 1,
    ]);
    const uv = new Float32Array([
      0, 0, 1, 0, 1, 1,
      0, 0, 1, 1, 0, 1,
    ]);
    const col = new Float32Array(18).fill(1);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

    const stats = optimizeStaticGeometry(geo);
    expect(stats.verticesBefore).toBe(6);
    expect(stats.verticesAfter).toBe(4);
    expect(stats.indexCount).toBe(6);
    expect(geo.index).not.toBeNull();
    expect(geo.boundingSphere).not.toBeNull();
    geo.dispose();
  });
});
