import * as THREE from 'three';
import type { PlayerVehicleState } from '../core/vehicle';
import {
  createPlateTexture,
  createTaxiSideTexture,
  createTaxiSignTexture,
} from './proceduralTextures';

export interface PlayerTaxiRig {
  root: THREE.Group;
  chassisGroup: THREE.Group;
  frontSteerPivots: THREE.Group[];
  wheelSpinMeshes: THREE.Group[];
  headlightMat: THREE.MeshBasicMaterial;
  brakeLightMat: THREE.MeshBasicMaterial;
  vehicleHeadLight: THREE.PointLight;
  geometries: THREE.BufferGeometry[];
  materials: THREE.Material[];
  textures: THREE.Texture[];
}

/**
 * Stylized detailed Istanbul Sarı Taksi (fictional design, zero real car brand logos):
 * - Checkered yellow-and-black door stripe + door seams
 * - Sloped windshield/rear glass, painted roof, illuminated "TAKSİ" roof sign
 * - Front grille, bumpers, side mirrors, license plates (34 T 0421), headlights & brake lights
 * - 4 alloy-rimmed wheels with front steering & speed-synced rolling rotation
 * - Grounded contact shadow quad
 */
export function createPlayerTaxiRig(contactShadowTex: THREE.Texture): PlayerTaxiRig {
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  const sideTex = createTaxiSideTexture();
  const signTex = createTaxiSignTexture();
  const plateTex = createPlateTexture();
  textures.push(sideTex, signTex, plateTex);

  const paintMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf6b800,
      roughness: 0.28,
      metalness: 0.26,
    }),
  );
  const sideStripeMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: sideTex,
      roughness: 0.3,
      metalness: 0.24,
    }),
  );
  const bumperMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x222731, roughness: 0.65, metalness: 0.22 }),
  );
  const chromeMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xd9e1eb, roughness: 0.22, metalness: 0.8 }),
  );
  const glassMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x26435e, roughness: 0.14, metalness: 0.6 }),
  );
  const tireMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x16191f, roughness: 0.9 }),
  );
  const rimMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.28, metalness: 0.72 }),
  );
  const hubMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.45, metalness: 0.5 }),
  );
  const signMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: signTex,
      emissive: new THREE.Color(0xffd25a),
      emissiveMap: signTex,
      emissiveIntensity: 0.72,
      roughness: 0.35,
    }),
  );
  const plateMat = trackMat(
    new THREE.MeshBasicMaterial({ map: plateTex }),
  );
  const headlightMat = trackMat(new THREE.MeshBasicMaterial({ color: 0xfff7d6 }));
  const turnLampMat = trackMat(new THREE.MeshBasicMaterial({ color: 0xf59e0b }));
  const brakeLightMat = trackMat(new THREE.MeshBasicMaterial({ color: 0x7a1212 }));
  const shadowMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: contactShadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.92,
    }),
  );

  const root = new THREE.Group();

  // Soft grounded chassis shadow under car (sits right on asphalt)
  const shadowGeo = trackGeo(new THREE.PlaneGeometry(2.75, 5.2));
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowQuad = new THREE.Mesh(shadowGeo, shadowMat);
  shadowQuad.position.y = 0.03;
  root.add(shadowQuad);

  // Suspension chassis group (tilts slightly on braking/cornering)
  const chassisGroup = new THREE.Group();
  root.add(chassisGroup);

  // Main lower body with checkered side stripe on ±X faces (+X, -X, +Y, -Y, +Z, -Z)
  const lowerBodyGeo = trackGeo(new THREE.BoxGeometry(1.88, 0.58, 4.32));
  const lowerBodyMats = [
    sideStripeMat,
    sideStripeMat,
    paintMat,
    bumperMat,
    paintMat,
    paintMat,
  ];
  const lowerBody = new THREE.Mesh(lowerBodyGeo, lowerBodyMats);
  lowerBody.position.set(0, 0.62, 0);
  lowerBody.castShadow = true;
  lowerBody.receiveShadow = true;
  chassisGroup.add(lowerBody);

  // Slightly tapered sculpted hood bulge (+Z front) & trunk deck (-Z rear)
  const hoodGeo = trackGeo(new THREE.BoxGeometry(1.76, 0.14, 1.32));
  const hood = new THREE.Mesh(hoodGeo, paintMat);
  hood.position.set(0, 0.92, 1.32);
  hood.rotation.x = 0.08;
  hood.castShadow = true;

  const trunkGeo = trackGeo(new THREE.BoxGeometry(1.78, 0.14, 0.92));
  const trunk = new THREE.Mesh(trunkGeo, paintMat);
  trunk.position.set(0, 0.92, -1.58);
  trunk.rotation.x = -0.06;
  trunk.castShadow = true;
  chassisGroup.add(hood, trunk);

  // Front & Rear bumpers + chrome trim + radiator grille
  const frontBumperGeo = trackGeo(new THREE.BoxGeometry(1.94, 0.24, 0.28));
  const frontBumper = new THREE.Mesh(frontBumperGeo, bumperMat);
  frontBumper.position.set(0, 0.38, 2.14);

  const rearBumper = new THREE.Mesh(frontBumperGeo, bumperMat);
  rearBumper.position.set(0, 0.38, -2.14);

  const grilleGeo = trackGeo(new THREE.BoxGeometry(0.92, 0.24, 0.08));
  const grille = new THREE.Mesh(grilleGeo, bumperMat);
  grille.position.set(0, 0.64, 2.16);

  const grilleTrimGeo = trackGeo(new THREE.BoxGeometry(0.96, 0.04, 0.09));
  const grilleTopBar = new THREE.Mesh(grilleTrimGeo, chromeMat);
  grilleTopBar.position.set(0, 0.75, 2.165);
  const grilleMidBar = new THREE.Mesh(grilleTrimGeo, chromeMat);
  grilleMidBar.position.set(0, 0.64, 2.165);

  // Rear chrome exhaust tip
  const exhaustGeo = trackGeo(new THREE.CylinderGeometry(0.05, 0.05, 0.16, 8));
  exhaustGeo.rotateX(Math.PI / 2);
  const exhaust = new THREE.Mesh(exhaustGeo, chromeMat);
  exhaust.position.set(0.56, 0.28, -2.24);

  chassisGroup.add(frontBumper, rearBumper, grille, grilleTopBar, grilleMidBar, exhaust);

  // Greenhouse cabin: central side glass + sloped front windshield + sloped rear glass + yellow roof
  const cabinCoreGeo = trackGeo(new THREE.BoxGeometry(1.58, 0.48, 1.56));
  const cabinCore = new THREE.Mesh(cabinCoreGeo, glassMat);
  cabinCore.position.set(0, 1.15, -0.18);
  cabinCore.castShadow = true;

  const windshieldGeo = trackGeo(new THREE.BoxGeometry(1.54, 0.56, 0.1));
  const windshield = new THREE.Mesh(windshieldGeo, glassMat);
  windshield.position.set(0, 1.13, 0.72);
  windshield.rotation.x = -0.62;

  const rearGlassGeo = trackGeo(new THREE.BoxGeometry(1.54, 0.54, 0.1));
  const rearGlass = new THREE.Mesh(rearGlassGeo, glassMat);
  rearGlass.position.set(0, 1.14, -1.08);
  rearGlass.rotation.x = 0.58;

  // B-pillars on left & right of cabin
  const pillarGeo = trackGeo(new THREE.BoxGeometry(1.61, 0.49, 0.14));
  const bPillar = new THREE.Mesh(pillarGeo, bumperMat);
  bPillar.position.set(0, 1.15, -0.14);

  // Painted yellow roof cap
  const roofGeo = trackGeo(new THREE.BoxGeometry(1.58, 0.09, 1.66));
  const roofCap = new THREE.Mesh(roofGeo, paintMat);
  roofCap.position.set(0, 1.42, -0.18);
  roofCap.castShadow = true;

  // Illuminated "TAKSİ" roof sign + sleek dark mounting base
  const signBaseGeo = trackGeo(new THREE.BoxGeometry(0.76, 0.06, 0.24));
  const signBase = new THREE.Mesh(signBaseGeo, bumperMat);
  signBase.position.set(0, 1.48, -0.05);

  const signBoxGeo = trackGeo(new THREE.BoxGeometry(0.72, 0.21, 0.2));
  const signMats = [paintMat, paintMat, paintMat, bumperMat, signMat, signMat];
  const roofSign = new THREE.Mesh(signBoxGeo, signMats);
  roofSign.position.set(0, 1.61, -0.05);

  chassisGroup.add(cabinCore, windshield, rearGlass, bPillar, roofCap, signBase, roofSign);

  // Left & Right side mirrors
  const mirrorGeo = trackGeo(new THREE.BoxGeometry(0.22, 0.11, 0.14));
  const leftMirror = new THREE.Mesh(mirrorGeo, paintMat);
  leftMirror.position.set(0.98, 0.98, 0.62);
  const rightMirror = new THREE.Mesh(mirrorGeo, paintMat);
  rightMirror.position.set(-0.98, 0.98, 0.62);
  chassisGroup.add(leftMirror, rightMirror);

  // Front headlights, amber indicators, rear brake lights, and fictional Istanbul 34 plates
  const lampGeo = trackGeo(new THREE.BoxGeometry(0.38, 0.16, 0.07));
  const cornerLampGeo = trackGeo(new THREE.BoxGeometry(0.14, 0.15, 0.08));
  for (const side of [-1, 1]) {
    const hl = new THREE.Mesh(lampGeo, headlightMat);
    hl.position.set(side * 0.64, 0.66, 2.16);
    const turn = new THREE.Mesh(cornerLampGeo, turnLampMat);
    turn.position.set(side * 0.87, 0.66, 2.14);

    const bl = new THREE.Mesh(lampGeo, brakeLightMat);
    bl.position.set(side * 0.64, 0.68, -2.16);
    const rTurn = new THREE.Mesh(cornerLampGeo, turnLampMat);
    rTurn.position.set(side * 0.87, 0.68, -2.14);

    chassisGroup.add(hl, turn, bl, rTurn);
  }

  const plateGeo = trackGeo(new THREE.PlaneGeometry(0.56, 0.14));
  const rearPlate = new THREE.Mesh(plateGeo, plateMat);
  rearPlate.position.set(0, 0.56, -2.175);
  rearPlate.rotation.y = Math.PI;
  const frontPlate = new THREE.Mesh(plateGeo, plateMat);
  frontPlate.position.set(0, 0.42, 2.285);
  chassisGroup.add(rearPlate, frontPlate);

  // Headlight illumination for night mode
  const vehicleHeadLight = new THREE.PointLight(0xffe7a8, 0, 28, 1.7);
  vehicleHeadLight.position.set(0, 1.05, 2.9);
  chassisGroup.add(vehicleHeadLight);

  // 4 Detailed Wheels (rubber tire + alloy rim + spoke cross bar so rolling is clearly visible!)
  const tireGeo = trackGeo(new THREE.CylinderGeometry(0.35, 0.35, 0.27, 16));
  tireGeo.rotateZ(Math.PI / 2);
  const rimGeo = trackGeo(new THREE.CylinderGeometry(0.22, 0.22, 0.285, 12));
  rimGeo.rotateZ(Math.PI / 2);
  const spokeGeo = trackGeo(new THREE.BoxGeometry(0.295, 0.34, 0.055));
  const hubGeo = trackGeo(new THREE.CylinderGeometry(0.08, 0.08, 0.3, 10));
  hubGeo.rotateZ(Math.PI / 2);

  const frontSteerPivots: THREE.Group[] = [];
  const wheelSpinMeshes: THREE.Group[] = [];

  const wheelPlacements: [number, number, boolean][] = [
    [-0.92, 1.34, true],
    [0.92, 1.34, true],
    [-0.92, -1.32, false],
    [0.92, -1.32, false],
  ];

  for (const [wx, wz, isFront] of wheelPlacements) {
    const steerPivot = new THREE.Group();
    steerPivot.position.set(wx, 0.35, wz);

    const spinGroup = new THREE.Group();
    const tire = new THREE.Mesh(tireGeo, tireMat);
    tire.castShadow = true;
    const rim = new THREE.Mesh(rimGeo, rimMat);
    const spokeA = new THREE.Mesh(spokeGeo, hubMat);
    const spokeB = new THREE.Mesh(spokeGeo, hubMat);
    spokeB.rotation.x = Math.PI / 2;
    const hub = new THREE.Mesh(hubGeo, hubMat);

    spinGroup.add(tire, rim, spokeA, spokeB, hub);
    steerPivot.add(spinGroup);
    root.add(steerPivot);

    if (isFront) frontSteerPivots.push(steerPivot);
    wheelSpinMeshes.push(spinGroup);
  }

  return {
    root,
    chassisGroup,
    frontSteerPivots,
    wheelSpinMeshes,
    headlightMat,
    brakeLightMat,
    vehicleHeadLight,
    geometries,
    materials,
    textures,
  };
}

/**
 * Updates front wheel steering angle, rolling wheel spin, brake light glow, and subtle body roll.
 */
export function updatePlayerTaxiRig(rig: PlayerTaxiRig, vehicle: PlayerVehicleState): void {
  const steerAngle = vehicle.steerVisual * 0.42;
  for (const pivot of rig.frontSteerPivots) {
    pivot.rotation.y = steerAngle;
  }
  for (const wheel of rig.wheelSpinMeshes) {
    wheel.rotation.x = vehicle.wheelSpin;
  }
  rig.brakeLightMat.color.setHex(vehicle.braking ? 0xff2626 : 0x7a1212);

  // Subtle suspension body roll on turns & squat/dive on braking
  const speedRatio = Math.min(1, Math.abs(vehicle.speed) / 14);
  rig.chassisGroup.rotation.z = -vehicle.steerVisual * speedRatio * 0.055;
  rig.chassisGroup.rotation.x = vehicle.braking && vehicle.speed > 1 ? 0.032 : 0;
}
