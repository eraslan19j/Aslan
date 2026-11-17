import * as THREE from 'three';
import { mergeColoredParts } from './meshMerge';

export interface CharacterRig {
  root: THREE.Group;
  shadowDisc: THREE.Mesh;
  bodyPivot: THREE.Group;
  leftLegPivot: THREE.Group;
  rightLegPivot: THREE.Group;
  leftShinPivot: THREE.Group;
  rightShinPivot: THREE.Group;
  leftArmPivot: THREE.Group;
  rightArmPivot: THREE.Group;
  leftForearmPivot: THREE.Group;
  rightForearmPivot: THREE.Group;
  headGroup: THREE.Group;
  walkPhase: number;
  idleTime: number;
  geometries: THREE.BufferGeometry[];
  materials: THREE.Material[];
}

/**
 * Creates a modern articulated multi-joint GTA-style Istanbul protagonist:
 * - Separate hip/knee/shin + shoulder/elbow/forearm pivots (Vice-inspired natural stride & bend!)
 * - Sculpted dark street bomber jacket over crisp white tee, tapered denim, street sneakers
 * - Detailed sculpted head with modern hair taper & dark aviator sunglasses
 * - Static sub-parts merged per articulated bone (only 10 draw calls total — ultra-fast on mobile!)
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

  const root = new THREE.Group();
  const bodyPivot = new THREE.Group();
  root.add(bodyPivot);

  // Ground contact shadow
  const shadowGeo = trackGeo(new THREE.PlaneGeometry(1.1, 1.1));
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: contactShadowTex,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    }),
  );
  const shadowDisc = new THREE.Mesh(shadowGeo, shadowMat);
  shadowDisc.position.y = 0.03;
  root.add(shadowDisc);

  // Single vertex-colored PBR material shared cleanly across all articulated bone meshes
  const charMat = trackMat(
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.62,
      metalness: 0.14,
    }),
  );

  // 1. Merged Torso + Pelvis + Belt + Open Bomber Jacket + White Inner Tee + Racing Trim + Collar (1 draw call!)
  const torsoGeo = trackGeo(
    mergeColoredParts([
      { geometry: new THREE.BoxGeometry(0.38, 0.14, 0.24), color: 0x243044, position: [0, 0.88, 0] },
      { geometry: new THREE.BoxGeometry(0.4, 0.055, 0.255), color: 0x111827, position: [0, 0.94, 0] },
      { geometry: new THREE.BoxGeometry(0.45, 0.54, 0.26), color: 0x1e293b, position: [0, 1.22, 0] },
      { geometry: new THREE.BoxGeometry(0.465, 0.045, 0.268), color: 0xdc2626, position: [0, 1.38, 0] },
      { geometry: new THREE.BoxGeometry(0.15, 0.51, 0.272), color: 0xf8fafc, position: [0, 1.21, 0.008] },
      { geometry: new THREE.CylinderGeometry(0.135, 0.155, 0.075, 12), color: 0x1e293b, position: [0, 1.49, -0.01] },
    ]),
  );
  const torsoMesh = new THREE.Mesh(torsoGeo, charMat);
  torsoMesh.castShadow = true;
  bodyPivot.add(torsoMesh);

  // 2. Articulated Legs: Thigh -> Knee/Shin+Sneaker (merged per bone!)
  const thighGeo = trackGeo(
    mergeColoredParts([
      { geometry: new THREE.CylinderGeometry(0.088, 0.072, 0.42, 10), color: 0x243044, position: [0, -0.21, 0] },
    ]),
  );
  const shinFootGeo = trackGeo(
    mergeColoredParts([
      { geometry: new THREE.CylinderGeometry(0.07, 0.058, 0.4, 10), color: 0x243044, position: [0, -0.2, 0] },
      { geometry: new THREE.BoxGeometry(0.125, 0.09, 0.25), color: 0xf1f5f9, position: [0, -0.395, 0.048] },
      { geometry: new THREE.BoxGeometry(0.132, 0.032, 0.26), color: 0x111827, position: [0, -0.435, 0.048] },
    ]),
  );

  const buildLeg = (sideX: number): { hip: THREE.Group; shin: THREE.Group } => {
    const hip = new THREE.Group();
    hip.position.set(sideX, 0.86, 0);

    const thigh = new THREE.Mesh(thighGeo, charMat);
    thigh.castShadow = true;
    hip.add(thigh);

    const shin = new THREE.Group();
    shin.position.set(0, -0.42, 0);
    hip.add(shin);

    const calfFoot = new THREE.Mesh(shinFootGeo, charMat);
    calfFoot.castShadow = true;
    shin.add(calfFoot);

    return { hip, shin };
  };

  const leftLeg = buildLeg(-0.115);
  const rightLeg = buildLeg(0.115);
  const leftLegPivot = leftLeg.hip;
  const rightLegPivot = rightLeg.hip;
  const leftShinPivot = leftLeg.shin;
  const rightShinPivot = rightLeg.shin;
  bodyPivot.add(leftLegPivot, rightLegPivot);

  // 3. Articulated Arms: Shoulder -> Upper Arm -> Elbow -> Forearm+Hand (merged per bone!)
  const upperArmGeo = trackGeo(
    mergeColoredParts([
      { geometry: new THREE.CylinderGeometry(0.068, 0.056, 0.31, 10), color: 0x1e293b, position: [0, -0.155, 0] },
    ]),
  );
  const forearmHandGeo = trackGeo(
    mergeColoredParts([
      { geometry: new THREE.CylinderGeometry(0.055, 0.046, 0.28, 10), color: 0x1e293b, position: [0, -0.14, 0] },
      { geometry: new THREE.SphereGeometry(0.052, 8, 8), color: 0xdfb18c, position: [0, -0.295, 0] },
    ]),
  );

  const buildArm = (sideX: number): { shoulder: THREE.Group; forearm: THREE.Group } => {
    const shoulder = new THREE.Group();
    shoulder.position.set(sideX, 1.42, 0);

    const upper = new THREE.Mesh(upperArmGeo, charMat);
    upper.castShadow = true;
    shoulder.add(upper);

    const forearm = new THREE.Group();
    forearm.position.set(0, -0.31, 0);
    shoulder.add(forearm);

    const lower = new THREE.Mesh(forearmHandGeo, charMat);
    lower.castShadow = true;
    forearm.add(lower);

    return { shoulder, forearm };
  };

  const leftArm = buildArm(-0.29);
  const rightArm = buildArm(0.29);
  const leftArmPivot = leftArm.shoulder;
  const rightArmPivot = rightArm.shoulder;
  const leftForearmPivot = leftArm.forearm;
  const rightForearmPivot = rightArm.forearm;
  bodyPivot.add(leftArmPivot, rightArmPivot);

  // 4. Merged Head + Neck + Modern Hair Taper + Aviator Sunglasses (1 draw call!)
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.54, 0);
  bodyPivot.add(headGroup);

  const headGeo = trackGeo(
    mergeColoredParts([
      { geometry: new THREE.CylinderGeometry(0.065, 0.074, 0.1, 10), color: 0xdfb18c, position: [0, 0.03, 0] },
      {
        geometry: new THREE.SphereGeometry(0.142, 14, 12),
        color: 0xdfb18c,
        position: [0, 0.175, 0],
        scale: [0.92, 1.06, 0.96],
      },
      {
        geometry: new THREE.SphereGeometry(0.148, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.56),
        color: 0x161311,
        position: [0, 0.195, -0.014],
        scale: [0.95, 1.04, 1.02],
      },
      { geometry: new THREE.BoxGeometry(0.22, 0.12, 0.12), color: 0x161311, position: [0, 0.17, -0.085] },
      { geometry: new THREE.BoxGeometry(0.215, 0.052, 0.045), color: 0x090d14, position: [0, 0.19, 0.125] },
    ]),
  );
  const headMesh = new THREE.Mesh(headGeo, charMat);
  headMesh.castShadow = true;
  headGroup.add(headMesh);

  return {
    root,
    shadowDisc,
    bodyPivot,
    leftLegPivot,
    rightLegPivot,
    leftShinPivot,
    rightShinPivot,
    leftArmPivot,
    rightArmPivot,
    leftForearmPivot,
    rightForearmPivot,
    headGroup,
    walkPhase: 0,
    idleTime: 0,
    geometries,
    materials,
  };
}

/**
 * Updates articulated multi-joint walk / sprint / idle animation smoothly every frame:
 * natural knee bend, elbow curl, hip bounce, sprint torso lean, and idle breathing & look-around.
 */
export function animateCharacterRig(
  rig: CharacterRig,
  horizontalSpeed: number,
  dt: number,
): void {
  rig.idleTime += dt;
  const moving = horizontalSpeed > 0.35;

  if (moving) {
    const sprinting = horizontalSpeed > 8.5;
    const freq = sprinting ? 13.0 : 8.6;
    rig.walkPhase += dt * freq;

    const swing = Math.sin(rig.walkPhase);
    const cosSwing = Math.cos(rig.walkPhase);
    const legAmp = sprinting ? 0.92 : 0.58;
    const armAmp = sprinting ? 0.96 : 0.52;
    const kneeAmp = sprinting ? 1.05 : 0.58;

    rig.leftLegPivot.rotation.set(swing * legAmp, 0, 0);
    rig.rightLegPivot.rotation.set(-swing * legAmp, 0, 0);
    rig.leftShinPivot.rotation.x = Math.max(0.05, (-swing * 0.55 + (1 - cosSwing) * 0.35) * kneeAmp);
    rig.rightShinPivot.rotation.x = Math.max(0.05, (swing * 0.55 + (1 + cosSwing) * 0.35) * kneeAmp);

    rig.leftArmPivot.rotation.set(-swing * armAmp, 0, 0.08);
    rig.rightArmPivot.rotation.set(swing * armAmp, 0, -0.08);
    rig.leftForearmPivot.rotation.x = sprinting ? -0.95 - Math.max(0, -swing) * 0.35 : -0.28 - Math.max(0, -swing) * 0.3;
    rig.rightForearmPivot.rotation.x = sprinting ? -0.95 - Math.max(0, swing) * 0.35 : -0.28 - Math.max(0, swing) * 0.3;

    rig.bodyPivot.position.y = Math.abs(cosSwing) * (sprinting ? 0.072 : 0.042);
    rig.bodyPivot.rotation.x = sprinting ? 0.2 : 0.075;
    rig.bodyPivot.rotation.y = swing * 0.075;
    rig.headGroup.rotation.set(sprinting ? -0.14 : -0.04, -swing * 0.04, 0);
  } else {
    const blend = Math.min(1, dt * 10);
    rig.leftLegPivot.rotation.x += (0 - rig.leftLegPivot.rotation.x) * blend;
    rig.rightLegPivot.rotation.x += (0 - rig.rightLegPivot.rotation.x) * blend;
    rig.leftShinPivot.rotation.x += (0.04 - rig.leftShinPivot.rotation.x) * blend;
    rig.rightShinPivot.rotation.x += (0.04 - rig.rightShinPivot.rotation.x) * blend;
    rig.leftArmPivot.rotation.x += (0 - rig.leftArmPivot.rotation.x) * blend;
    rig.rightArmPivot.rotation.x += (0 - rig.rightArmPivot.rotation.x) * blend;
    rig.leftForearmPivot.rotation.x += (-0.16 - rig.leftForearmPivot.rotation.x) * blend;
    rig.rightForearmPivot.rotation.x += (-0.16 - rig.rightForearmPivot.rotation.x) * blend;
    rig.leftArmPivot.rotation.z = 0.065 + Math.sin(rig.idleTime * 2.1) * 0.022;
    rig.rightArmPivot.rotation.z = -0.065 - Math.sin(rig.idleTime * 2.1) * 0.022;
    rig.bodyPivot.position.y = Math.sin(rig.idleTime * 2.3) * 0.014;
    rig.bodyPivot.rotation.x += (0 - rig.bodyPivot.rotation.x) * blend;
    rig.bodyPivot.rotation.y += (0 - rig.bodyPivot.rotation.y) * blend;
    rig.headGroup.rotation.x += (0 - rig.headGroup.rotation.x) * blend;
    const idleLook = Math.sin(rig.idleTime * 0.65) * 0.14;
    rig.headGroup.rotation.y += (idleLook - rig.headGroup.rotation.y) * Math.min(1, dt * 3.5);
  }
}

/**
 * Articulated seated driving posture inside the cabin:
 * thighs forward, knees bent cleanly into footwell, elbows bent gripping the steering wheel rim,
 * head & hands tracking turns naturally!
 */
export function poseCharacterSeated(rig: CharacterRig, steerVisual: number): void {
  rig.shadowDisc.visible = false;
  rig.bodyPivot.position.set(0, 0, 0);
  rig.bodyPivot.rotation.set(-0.08, 0, -steerVisual * 0.05);
  rig.leftLegPivot.rotation.set(-1.38, 0, 0.06);
  rig.rightLegPivot.rotation.set(-1.38, 0, -0.06);
  rig.leftShinPivot.rotation.set(1.18, 0, 0);
  rig.rightShinPivot.rotation.set(1.18, 0, 0);
  rig.leftArmPivot.rotation.set(-0.98 + steerVisual * 0.18, 0.06, -0.18);
  rig.rightArmPivot.rotation.set(-0.98 - steerVisual * 0.18, -0.06, 0.18);
  rig.leftForearmPivot.rotation.set(-0.36, 0, 0.1);
  rig.rightForearmPivot.rotation.set(-0.36, 0, -0.1);
  rig.headGroup.rotation.set(-0.04, steerVisual * 0.3, 0);
}
