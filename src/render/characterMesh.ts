import * as THREE from 'three';

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
 * Replaces the old floating jellybean placeholder with proper human proportions, outfit detail,
 * soft contact shadow, and procedural walk/sprint/idle animation.
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

  // Stylized urban Istanbul palette (charcoal bomber jacket, cream hoodie, indigo denim, white-soled sneakers)
  const jacketMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x222e42, roughness: 0.62, metalness: 0.08 }),
  );
  const jacketTrimMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x151c29, roughness: 0.72, metalness: 0.1 }),
  );
  const hoodieMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xe6dfd3, roughness: 0.78 }),
  );
  const accentMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xf2b50f, roughness: 0.48, metalness: 0.15 }),
  );
  const jeansMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x2a3b52, roughness: 0.84 }),
  );
  const shoeUpperMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x23272e, roughness: 0.7 }),
  );
  const shoeSoleMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xedece8, roughness: 0.8 }),
  );
  const skinMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xdfa782, roughness: 0.62 }),
  );
  const hairMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x1c1714, roughness: 0.78 }),
  );
  const shadesMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x0e131d, roughness: 0.18, metalness: 0.65 }),
  );
  const shadowMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: contactShadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.85,
    }),
  );

  const root = new THREE.Group();

  // Grounded soft contact shadow right under shoes (y = 0.025)
  const shadowGeo = trackGeo(new THREE.PlaneGeometry(1.1, 1.1));
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowDisc = new THREE.Mesh(shadowGeo, shadowMat);
  shadowDisc.position.y = 0.025;
  root.add(shadowDisc);

  const bodyPivot = new THREE.Group();
  root.add(bodyPivot);

  // Pelvis / Belt (y = 0.84..0.96)
  const pelvisGeo = trackGeo(new THREE.BoxGeometry(0.38, 0.14, 0.22));
  const pelvis = new THREE.Mesh(pelvisGeo, jeansMat);
  pelvis.position.y = 0.89;
  pelvis.castShadow = true;

  const beltGeo = trackGeo(new THREE.BoxGeometry(0.4, 0.055, 0.235));
  const belt = new THREE.Mesh(beltGeo, jacketTrimMat);
  belt.position.y = 0.94;
  bodyPivot.add(pelvis, belt);

  // Legs (hip pivot at y = 0.86 -> bottom of sneaker sole lands cleanly at y = 0.00!)
  const thighGeo = trackGeo(new THREE.CylinderGeometry(0.088, 0.072, 0.42, 8));
  const calfGeo = trackGeo(new THREE.CylinderGeometry(0.07, 0.058, 0.36, 8));
  const shoeUpperGeo = trackGeo(new THREE.BoxGeometry(0.125, 0.075, 0.24));
  const shoeSoleGeo = trackGeo(new THREE.BoxGeometry(0.132, 0.032, 0.255));

  const buildLeg = (sideX: number): THREE.Group => {
    const hip = new THREE.Group();
    hip.position.set(sideX, 0.86, 0);

    const thigh = new THREE.Mesh(thighGeo, jeansMat);
    thigh.position.y = -0.21;
    thigh.castShadow = true;

    const calf = new THREE.Mesh(calfGeo, jeansMat);
    calf.position.set(0, -0.58, -0.01);
    calf.castShadow = true;

    const shoeUpper = new THREE.Mesh(shoeUpperGeo, shoeUpperMat);
    shoeUpper.position.set(0, -0.79, 0.04);
    shoeUpper.castShadow = true;

    const shoeSole = new THREE.Mesh(shoeSoleGeo, shoeSoleMat);
    shoeSole.position.set(0, -0.844, 0.042);

    hip.add(thigh, calf, shoeUpper, shoeSole);
    return hip;
  };

  const leftLegPivot = buildLeg(0.115);
  const rightLegPivot = buildLeg(-0.115);
  bodyPivot.add(leftLegPivot, rightLegPivot);

  // Torso: stylized bomber jacket + cream hoodie front + back yoke detail
  const torsoGeo = trackGeo(new THREE.BoxGeometry(0.44, 0.48, 0.25));
  const torso = new THREE.Mesh(torsoGeo, jacketMat);
  torso.position.y = 1.19;
  torso.castShadow = true;

  const chestShirtGeo = trackGeo(new THREE.BoxGeometry(0.18, 0.44, 0.262));
  const chestShirt = new THREE.Mesh(chestShirtGeo, hoodieMat);
  chestShirt.position.set(0, 1.19, 0.004);

  const collarGeo = trackGeo(new THREE.CylinderGeometry(0.125, 0.145, 0.09, 10));
  const collar = new THREE.Mesh(collarGeo, jacketTrimMat);
  collar.position.y = 1.44;

  // Back shoulder stripe / golden accent trim (high readability from 3rd-person follow cam!)
  const backYokeGeo = trackGeo(new THREE.BoxGeometry(0.45, 0.075, 0.04));
  const backYoke = new THREE.Mesh(backYokeGeo, accentMat);
  backYoke.position.set(0, 1.34, -0.115);

  const hoodFoldGeo = trackGeo(new THREE.BoxGeometry(0.26, 0.11, 0.12));
  const hoodFold = new THREE.Mesh(hoodFoldGeo, hoodieMat);
  hoodFold.position.set(0, 1.42, -0.11);

  const hemGeo = trackGeo(new THREE.BoxGeometry(0.445, 0.06, 0.258));
  const hem = new THREE.Mesh(hemGeo, jacketTrimMat);
  hem.position.y = 0.97;

  bodyPivot.add(torso, chestShirt, collar, backYoke, hoodFold, hem);

  // Arms (shoulder pivot at y = 1.38, x = ±0.275)
  const shoulderGeo = trackGeo(new THREE.SphereGeometry(0.082, 8, 8));
  const upperArmGeo = trackGeo(new THREE.CylinderGeometry(0.068, 0.058, 0.28, 8));
  const forearmGeo = trackGeo(new THREE.CylinderGeometry(0.056, 0.048, 0.26, 8));
  const cuffGeo = trackGeo(new THREE.CylinderGeometry(0.052, 0.05, 0.045, 8));
  const handGeo = trackGeo(new THREE.SphereGeometry(0.052, 8, 8));

  const buildArm = (sideX: number): THREE.Group => {
    const shoulder = new THREE.Group();
    shoulder.position.set(sideX, 1.38, 0);

    const cap = new THREE.Mesh(shoulderGeo, jacketMat);
    const upper = new THREE.Mesh(upperArmGeo, jacketMat);
    upper.position.y = -0.15;
    upper.castShadow = true;

    const fore = new THREE.Mesh(forearmGeo, jacketMat);
    fore.position.set(0, -0.4, 0.03);
    fore.rotation.x = -0.14;
    fore.castShadow = true;

    const cuff = new THREE.Mesh(cuffGeo, jacketTrimMat);
    cuff.position.set(0, -0.52, 0.045);

    const hand = new THREE.Mesh(handGeo, skinMat);
    hand.position.set(0, -0.58, 0.052);

    shoulder.add(cap, upper, fore, cuff, hand);
    return shoulder;
  };

  const leftArmPivot = buildArm(0.275);
  const rightArmPivot = buildArm(-0.275);
  bodyPivot.add(leftArmPivot, rightArmPivot);

  // Head + Neck + Sculpted Hair + Sunglasses
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.46, 0);

  const neckGeo = trackGeo(new THREE.CylinderGeometry(0.058, 0.068, 0.1, 8));
  const neck = new THREE.Mesh(neckGeo, skinMat);
  neck.position.y = 0.03;

  const skullGeo = trackGeo(new THREE.SphereGeometry(0.132, 12, 12));
  const skull = new THREE.Mesh(skullGeo, skinMat);
  skull.position.y = 0.155;
  skull.scale.set(0.92, 1.08, 0.96);
  skull.castShadow = true;

  // Sculpted hair cap + textured top sweep (dark espresso-black hair)
  const hairBackGeo = trackGeo(
    new THREE.SphereGeometry(0.138, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.62),
  );
  const hairBack = new THREE.Mesh(hairBackGeo, hairMat);
  hairBack.position.set(0, 0.17, -0.015);
  hairBack.rotation.x = -0.22;
  hairBack.scale.set(0.94, 1.05, 0.98);

  const hairTopGeo = trackGeo(new THREE.BoxGeometry(0.19, 0.075, 0.22));
  const hairTop = new THREE.Mesh(hairTopGeo, hairMat);
  hairTop.position.set(0, 0.275, 0.02);
  hairTop.rotation.x = -0.14;

  // Sleek front sunglasses (+Z forward)
  const shadesGeo = trackGeo(new THREE.BoxGeometry(0.2, 0.052, 0.045));
  const shades = new THREE.Mesh(shadesGeo, shadesMat);
  shades.position.set(0, 0.17, 0.112);

  headGroup.add(neck, skull, hairBack, hairTop, shades);
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

    // Grounded stride bounce & dynamic forward lean
    rig.bodyPivot.position.y = Math.abs(Math.cos(rig.walkPhase)) * (sprinting ? 0.065 : 0.038);
    rig.bodyPivot.rotation.x = sprinting ? 0.18 : 0.07;
    rig.bodyPivot.rotation.y = swing * 0.06;
    rig.headGroup.rotation.x = sprinting ? -0.12 : -0.04;
  } else {
    // Relax smoothly back to grounded idle stance with subtle breathing
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
