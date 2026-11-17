import * as THREE from 'three';

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
 * - Sculpted dark street bomber jacket over crisp white tee, tapered denim, red-accent sneakers
 * - Detailed sculpted head with modern hair taper & dark aviator sunglasses
 * - Smooth grounded contact shadow disc
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

  // Modern street palette materials
  const jacketMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.52, metalness: 0.14 }));
  const accentTrimMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.45, metalness: 0.12 }));
  const shirtMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.68 }));
  const pantsMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x243044, roughness: 0.84 }));
  const skinMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xdfb18c, roughness: 0.7 }));
  const hairMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x161311, roughness: 0.86 }));
  const shadeMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x090d14, roughness: 0.14, metalness: 0.7 }));
  const shoeMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.55 }));
  const soleMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.88 }));

  // Pelvis / Belt
  const pelvisGeo = trackGeo(new THREE.BoxGeometry(0.38, 0.14, 0.24));
  const pelvisMesh = new THREE.Mesh(pelvisGeo, pantsMat);
  pelvisMesh.position.set(0, 0.88, 0);
  pelvisMesh.castShadow = true;
  bodyPivot.add(pelvisMesh);

  const beltGeo = trackGeo(new THREE.BoxGeometry(0.4, 0.055, 0.255));
  const beltMesh = new THREE.Mesh(beltGeo, soleMat);
  beltMesh.position.set(0, 0.94, 0);
  bodyPivot.add(beltMesh);

  // Articulated Legs: Thigh -> Knee/Shin -> Street Sneaker
  const thighGeo = trackGeo(new THREE.CylinderGeometry(0.088, 0.072, 0.42, 10));
  const shinGeo = trackGeo(new THREE.CylinderGeometry(0.07, 0.058, 0.4, 10));
  const shoeGeo = trackGeo(new THREE.BoxGeometry(0.125, 0.09, 0.25));
  const soleGeo = trackGeo(new THREE.BoxGeometry(0.132, 0.032, 0.26));

  const buildLeg = (sideX: number): { hip: THREE.Group; shin: THREE.Group } => {
    const hip = new THREE.Group();
    hip.position.set(sideX, 0.86, 0);

    const thigh = new THREE.Mesh(thighGeo, pantsMat);
    thigh.position.y = -0.21;
    thigh.castShadow = true;
    hip.add(thigh);

    const shin = new THREE.Group();
    shin.position.set(0, -0.42, 0);
    hip.add(shin);

    const calf = new THREE.Mesh(shinGeo, pantsMat);
    calf.position.y = -0.2;
    calf.castShadow = true;
    shin.add(calf);

    const shoe = new THREE.Mesh(shoeGeo, shoeMat);
    shoe.position.set(0, -0.395, 0.048);
    shoe.castShadow = true;
    shin.add(shoe);

    const sole = new THREE.Mesh(soleGeo, soleMat);
    sole.position.set(0, -0.435, 0.048);
    shin.add(sole);

    return { hip, shin };
  };

  const leftLeg = buildLeg(-0.115);
  const rightLeg = buildLeg(0.115);
  const leftLegPivot = leftLeg.hip;
  const rightLegPivot = rightLeg.hip;
  const leftShinPivot = leftLeg.shin;
  const rightShinPivot = rightLeg.shin;
  bodyPivot.add(leftLegPivot, rightLegPivot);

  // Sculpted Torso (open dark street bomber jacket + white inner tee + red racing stripe trim)
  const chestGeo = trackGeo(new THREE.BoxGeometry(0.45, 0.54, 0.26));
  const chestMesh = new THREE.Mesh(chestGeo, jacketMat);
  chestMesh.position.set(0, 1.22, 0);
  chestMesh.castShadow = true;
  bodyPivot.add(chestMesh);

  // Subtle jacket lapel / shoulder accents
  const stripeGeo = trackGeo(new THREE.BoxGeometry(0.465, 0.045, 0.268));
  const stripeMesh = new THREE.Mesh(stripeGeo, accentTrimMat);
  stripeMesh.position.set(0, 1.38, 0);
  bodyPivot.add(stripeMesh);

  // Inner white tee front stripe
  const teeGeo = trackGeo(new THREE.BoxGeometry(0.15, 0.51, 0.272));
  const teeMesh = new THREE.Mesh(teeGeo, shirtMat);
  teeMesh.position.set(0, 1.21, 0.008);
  bodyPivot.add(teeMesh);

  // Jacket collar
  const collarGeo = trackGeo(new THREE.CylinderGeometry(0.135, 0.155, 0.075, 12));
  const collarMesh = new THREE.Mesh(collarGeo, jacketMat);
  collarMesh.position.set(0, 1.49, -0.01);
  bodyPivot.add(collarMesh);

  // Articulated Arms: Shoulder -> Upper Arm -> Elbow -> Forearm + Hand
  const upperArmGeo = trackGeo(new THREE.CylinderGeometry(0.068, 0.056, 0.31, 10));
  const forearmGeo = trackGeo(new THREE.CylinderGeometry(0.055, 0.046, 0.28, 10));
  const handGeo = trackGeo(new THREE.SphereGeometry(0.052, 8, 8));

  const buildArm = (sideX: number): { shoulder: THREE.Group; forearm: THREE.Group } => {
    const shoulder = new THREE.Group();
    shoulder.position.set(sideX, 1.42, 0);

    const upper = new THREE.Mesh(upperArmGeo, jacketMat);
    upper.position.y = -0.155;
    upper.castShadow = true;
    shoulder.add(upper);

    const forearm = new THREE.Group();
    forearm.position.set(0, -0.31, 0);
    shoulder.add(forearm);

    const lower = new THREE.Mesh(forearmGeo, jacketMat);
    lower.position.y = -0.14;
    lower.castShadow = true;
    forearm.add(lower);

    const hand = new THREE.Mesh(handGeo, skinMat);
    hand.position.y = -0.295;
    forearm.add(hand);

    return { shoulder, forearm };
  };

  const leftArm = buildArm(-0.29);
  const rightArm = buildArm(0.29);
  const leftArmPivot = leftArm.shoulder;
  const rightArmPivot = rightArm.shoulder;
  const leftForearmPivot = leftArm.forearm;
  const rightForearmPivot = rightArm.forearm;
  bodyPivot.add(leftArmPivot, rightArmPivot);

  // Head + Neck + Modern Hair Taper + Aviator Sunglasses
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.54, 0);
  bodyPivot.add(headGroup);

  const neckGeo = trackGeo(new THREE.CylinderGeometry(0.065, 0.074, 0.1, 10));
  const neckMesh = new THREE.Mesh(neckGeo, skinMat);
  neckMesh.position.y = 0.03;
  headGroup.add(neckMesh);

  const skullGeo = trackGeo(new THREE.SphereGeometry(0.142, 14, 12));
  const skullMesh = new THREE.Mesh(skullGeo, skinMat);
  skullMesh.scale.set(0.92, 1.06, 0.96);
  skullMesh.position.y = 0.175;
  skullMesh.castShadow = true;
  headGroup.add(skullMesh);

  // Modern sculpted hair crown + back fade
  const hairTopGeo = trackGeo(new THREE.SphereGeometry(0.148, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.56));
  const hairTopMesh = new THREE.Mesh(hairTopGeo, hairMat);
  hairTopMesh.scale.set(0.95, 1.04, 1.02);
  hairTopMesh.position.set(0, 0.195, -0.014);
  headGroup.add(hairTopMesh);

  const hairBackGeo = trackGeo(new THREE.BoxGeometry(0.22, 0.12, 0.12));
  const hairBackMesh = new THREE.Mesh(hairBackGeo, hairMat);
  hairBackMesh.position.set(0, 0.17, -0.085);
  headGroup.add(hairBackMesh);

  // Sleek dark aviator sunglasses (instant Vice/GTA style identity!)
  const shadesGeo = trackGeo(new THREE.BoxGeometry(0.215, 0.052, 0.045));
  const shadesMesh = new THREE.Mesh(shadesGeo, shadeMat);
  shadesMesh.position.set(0, 0.19, 0.125);
  headGroup.add(shadesMesh);

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

    // Hip swing + authentic knee flexion as each leg swings backward & lifts forward
    rig.leftLegPivot.rotation.set(swing * legAmp, 0, 0);
    rig.rightLegPivot.rotation.set(-swing * legAmp, 0, 0);
    rig.leftShinPivot.rotation.x = Math.max(0.05, (-swing * 0.55 + (1 - cosSwing) * 0.35) * kneeAmp);
    rig.rightShinPivot.rotation.x = Math.max(0.05, (swing * 0.55 + (1 + cosSwing) * 0.35) * kneeAmp);

    // Opposite arm pump + crisp athletic elbow bend
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
  // Two-handed articulated grip on steering wheel shifting smoothly with steering input!
  rig.leftArmPivot.rotation.set(-0.98 + steerVisual * 0.18, 0.06, -0.18);
  rig.rightArmPivot.rotation.set(-0.98 - steerVisual * 0.18, -0.06, 0.18);
  rig.leftForearmPivot.rotation.set(-0.36, 0, 0.1);
  rig.rightForearmPivot.rotation.set(-0.36, 0, -0.1);
  rig.headGroup.rotation.set(-0.04, steerVisual * 0.3, 0);
}
