import * as THREE from 'three';
import { mergeColoredParts } from './meshMerge';

export interface CharacterRig {
  root: THREE.Group;
  bodyPivot: THREE.Group;
  leftLegPivot: THREE.Group;
  rightLegPivot: THREE.Group;
  leftArmPivot: THREE.Group;
  rightArmPivot: THREE.Group;
  headGroup: THREE.Group;
  walkPhase: number;
  idleTime: number;
  geometries: THREE.BufferGeometry[];
  materials: THREE.Material[];
}

/**
 * Stylized articulated 3rd-person human protagonist (1.76 m tall, grounded sneakers at y = 0).
 * Static sub-parts per limb/torso/head are baked into single vertex-colored meshes
 * so the full animated character costs only 7 draw calls total (including contact shadow!).
 */
export function createCharacterRig(contactShadowTex: THREE.Texture): CharacterRig {
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  const charMat = trackMat(
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.68,
      metalness: 0.08,
    }),
  );
  const shadowMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: contactShadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.85,
    }),
  );

  const C_JACKET = 0x222e42;
  const C_TRIM = 0x151c29;
  const C_HOODIE = 0xe6dfd3;
  const C_ACCENT = 0xf2b50f;
  const C_JEANS = 0x2a3b52;
  const C_SHOE_UP = 0x23272e;
  const C_SHOE_SOLE = 0xedece8;
  const C_SKIN = 0xdfa782;
  const C_HAIR = 0x1c1714;
  const C_SHADES = 0x0e131d;

  const root = new THREE.Group();

  // 1. Grounded contact shadow disc right under shoes
  const shadowGeo = trackGeo(new THREE.PlaneGeometry(1.1, 1.1));
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowDisc = new THREE.Mesh(shadowGeo, shadowMat);
  shadowDisc.position.y = 0.025;
  root.add(shadowDisc);

  const bodyPivot = new THREE.Group();
  root.add(bodyPivot);

  // 2. Merged Torso + Pelvis + Belt + Cream Hoodie + Gold Shoulder Trim (1 draw call!)
  const torsoGeo = trackGeo(
    mergeColoredParts([
      { geometry: new THREE.BoxGeometry(0.38, 0.14, 0.22), color: C_JEANS, position: [0, 0.89, 0] },
      { geometry: new THREE.BoxGeometry(0.4, 0.055, 0.235), color: C_TRIM, position: [0, 0.94, 0] },
      { geometry: new THREE.BoxGeometry(0.44, 0.48, 0.25), color: C_JACKET, position: [0, 1.19, 0] },
      { geometry: new THREE.BoxGeometry(0.18, 0.44, 0.262), color: C_HOODIE, position: [0, 1.19, 0.004] },
      { geometry: new THREE.CylinderGeometry(0.125, 0.145, 0.09, 10), color: C_TRIM, position: [0, 1.44, 0] },
      { geometry: new THREE.BoxGeometry(0.45, 0.075, 0.04), color: C_ACCENT, position: [0, 1.34, -0.115] },
      { geometry: new THREE.BoxGeometry(0.26, 0.11, 0.12), color: C_HOODIE, position: [0, 1.42, -0.11] },
      { geometry: new THREE.BoxGeometry(0.445, 0.06, 0.258), color: C_TRIM, position: [0, 0.97, 0] },
    ]),
  );
  const torsoMesh = new THREE.Mesh(torsoGeo, charMat);
  torsoMesh.castShadow = true;
  bodyPivot.add(torsoMesh);

  // 3 & 4. Shared Merged Leg Geometry (thigh + calf + sneaker + white sole -> bottom lands at y = 0!)
  const legGeo = trackGeo(
    mergeColoredParts([
      { geometry: new THREE.CylinderGeometry(0.088, 0.072, 0.42, 8), color: C_JEANS, position: [0, -0.21, 0] },
      { geometry: new THREE.CylinderGeometry(0.07, 0.058, 0.36, 8), color: C_JEANS, position: [0, -0.58, -0.01] },
      { geometry: new THREE.BoxGeometry(0.125, 0.075, 0.24), color: C_SHOE_UP, position: [0, -0.79, 0.04] },
      { geometry: new THREE.BoxGeometry(0.132, 0.032, 0.255), color: C_SHOE_SOLE, position: [0, -0.844, 0.042] },
    ]),
  );

  const leftLegPivot = new THREE.Group();
  leftLegPivot.position.set(0.115, 0.86, 0);
  const leftLegMesh = new THREE.Mesh(legGeo, charMat);
  leftLegMesh.castShadow = true;
  leftLegPivot.add(leftLegMesh);

  const rightLegPivot = new THREE.Group();
  rightLegPivot.position.set(-0.115, 0.86, 0);
  const rightLegMesh = new THREE.Mesh(legGeo, charMat);
  rightLegMesh.castShadow = true;
  rightLegPivot.add(rightLegMesh);
  bodyPivot.add(leftLegPivot, rightLegPivot);

  // 5 & 6. Shared Merged Arm Geometry (shoulder + upper + forearm + cuff + hand -> 1 draw call each!)
  const armGeo = trackGeo(
    mergeColoredParts([
      { geometry: new THREE.SphereGeometry(0.082, 8, 8), color: C_JACKET, position: [0, 0, 0] },
      { geometry: new THREE.CylinderGeometry(0.068, 0.058, 0.28, 8), color: C_JACKET, position: [0, -0.15, 0] },
      {
        geometry: new THREE.CylinderGeometry(0.056, 0.048, 0.26, 8),
        color: C_JACKET,
        position: [0, -0.4, 0.03],
        rotation: [-0.14, 0, 0],
      },
      { geometry: new THREE.CylinderGeometry(0.052, 0.05, 0.045, 8), color: C_TRIM, position: [0, -0.52, 0.045] },
      { geometry: new THREE.SphereGeometry(0.052, 8, 8), color: C_SKIN, position: [0, -0.58, 0.052] },
    ]),
  );

  const leftArmPivot = new THREE.Group();
  leftArmPivot.position.set(0.275, 1.38, 0);
  const leftArmMesh = new THREE.Mesh(armGeo, charMat);
  leftArmMesh.castShadow = true;
  leftArmPivot.add(leftArmMesh);

  const rightArmPivot = new THREE.Group();
  rightArmPivot.position.set(-0.275, 1.38, 0);
  const rightArmMesh = new THREE.Mesh(armGeo, charMat);
  rightArmMesh.castShadow = true;
  rightArmPivot.add(rightArmMesh);
  bodyPivot.add(leftArmPivot, rightArmPivot);

  // 7. Merged Head + Neck + Sculpted Dark Hair + Sleek Sunglasses (1 draw call!)
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.46, 0);
  const headGeo = trackGeo(
    mergeColoredParts([
      { geometry: new THREE.CylinderGeometry(0.058, 0.068, 0.1, 8), color: C_SKIN, position: [0, 0.03, 0] },
      {
        geometry: new THREE.SphereGeometry(0.132, 12, 12),
        color: C_SKIN,
        position: [0, 0.155, 0],
        scale: [0.92, 1.08, 0.96],
      },
      {
        geometry: new THREE.SphereGeometry(0.138, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.62),
        color: C_HAIR,
        position: [0, 0.17, -0.015],
        rotation: [-0.22, 0, 0],
        scale: [0.94, 1.05, 0.98],
      },
      {
        geometry: new THREE.BoxGeometry(0.19, 0.075, 0.22),
        color: C_HAIR,
        position: [0, 0.275, 0.02],
        rotation: [-0.14, 0, 0],
      },
      { geometry: new THREE.BoxGeometry(0.2, 0.052, 0.045), color: C_SHADES, position: [0, 0.17, 0.112] },
    ]),
  );
  const headMesh = new THREE.Mesh(headGeo, charMat);
  headMesh.castShadow = true;
  headGroup.add(headMesh);
  bodyPivot.add(headGroup);

  return {
    root,
    bodyPivot,
    leftLegPivot,
    rightLegPivot,
    leftArmPivot,
    rightArmPivot,
    headGroup,
    walkPhase: 0,
    idleTime: 0,
    geometries,
    materials,
  };
}

/**
 * Updates procedural walk / sprint / idle stride animation smoothly every frame.
 */
export function animateCharacterRig(
  rig: CharacterRig,
  horizontalSpeed: number,
  dt: number,
): void {
  rig.idleTime += dt;
  const moving = horizontalSpeed > 0.35;

  if (moving) {
    const sprinting = horizontalSpeed > 10.0;
    const freq = sprinting ? 12.5 : 8.5;
    rig.walkPhase += dt * freq;

    const swing = Math.sin(rig.walkPhase);
    const legAmp = sprinting ? 0.95 : 0.62;
    const armAmp = sprinting ? 0.98 : 0.56;

    rig.leftLegPivot.rotation.x = swing * legAmp;
    rig.rightLegPivot.rotation.x = -swing * legAmp;
    rig.leftArmPivot.rotation.x = -swing * armAmp;
    rig.rightArmPivot.rotation.x = swing * armAmp;
    rig.leftArmPivot.rotation.z = 0.08;
    rig.rightArmPivot.rotation.z = -0.08;

    rig.bodyPivot.position.y = Math.abs(Math.cos(rig.walkPhase)) * (sprinting ? 0.065 : 0.038);
    rig.bodyPivot.rotation.x = sprinting ? 0.18 : 0.07;
    rig.bodyPivot.rotation.y = swing * 0.06;
    rig.headGroup.rotation.x = sprinting ? -0.12 : -0.04;
  } else {
    const blend = Math.min(1, dt * 10);
    rig.leftLegPivot.rotation.x += (0 - rig.leftLegPivot.rotation.x) * blend;
    rig.rightLegPivot.rotation.x += (0 - rig.rightLegPivot.rotation.x) * blend;
    rig.leftArmPivot.rotation.x += (0 - rig.leftArmPivot.rotation.x) * blend;
    rig.rightArmPivot.rotation.x += (0 - rig.rightArmPivot.rotation.x) * blend;
    rig.leftArmPivot.rotation.z = 0.06 + Math.sin(rig.idleTime * 2.1) * 0.02;
    rig.rightArmPivot.rotation.z = -0.06 - Math.sin(rig.idleTime * 2.1) * 0.02;
    rig.bodyPivot.position.y = Math.sin(rig.idleTime * 2.3) * 0.012;
    rig.bodyPivot.rotation.x += (0 - rig.bodyPivot.rotation.x) * blend;
    rig.bodyPivot.rotation.y += (0 - rig.bodyPivot.rotation.y) * blend;
    rig.headGroup.rotation.x += (0 - rig.headGroup.rotation.x) * blend;
  }
}
